// ============================================================
// HonestStack — publish-tiktok
// ------------------------------------------------------------
// Publishes a rendered MP4 to the user's connected TikTok account
// using the Content Posting API (video.upload + video.publish).
//
// Flow:
//   1. Auth: requires user JWT. Verifies asset ownership.
//   2. Looks up the user's social_accounts row for platform='tiktok'.
//      Refreshes access_token if expired.
//   3. DIRECT POST (default, audited app): queries creator_info, then
//      POSTs /v2/post/publish/video/init/ with source FILE_UPLOAD +
//      privacy PUBLIC_TO_EVERYONE — the video auto-publishes publicly.
//      Set TIKTOK_DIRECT_POST=false (or on any direct failure) to fall
//      back to /inbox/video/init/ (lands as a draft for manual posting).
//      We upload bytes (FILE_UPLOAD) so no Portal domain verification.
//   4. Polls /v2/post/publish/status/fetch/ until terminal
//      (PUBLISH_COMPLETE / SEND_TO_USER_INBOX / *_FAILED).
//   5. Updates posts_queue (+ external_url for direct posts) + assets.media.
//
// Read-only validation: POST { "check": "creator_info" } returns the
// account's allowed privacy levels — confirms the audited app can direct-post
// without actually posting anything.
//
// Env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// Env (secrets): TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
// Env (optional): TIKTOK_DIRECT_POST ("false" → inbox/manual flow; default direct)
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const TOKEN_REFRESH_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const PUBLISH_INIT_INBOX_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
const PUBLISH_INIT_DIRECT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const PUBLISH_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

type Asset = {
  id: string;
  owner_id: string;
  idea_id: string | null;
  media: Record<string, unknown> | null;
  caption: string | null;
  hashtags: string[] | null;
};

type SocialAccount = {
  id: string;
  open_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  display_name: string | null;
};

type Idea = {
  hook: string | null;
  brief: Record<string, unknown> | null;
};

function getMediaString(m: Record<string, unknown> | null, k: string): string | null {
  if (!m) return null;
  const v = m[k];
  return typeof v === "string" && v ? v : null;
}

function isExpired(expires_at: string | null): boolean {
  if (!expires_at) return false;
  // Refresh ~60s before actual expiry to avoid race.
  return new Date(expires_at).getTime() < Date.now() + 60_000;
}

async function refreshAccessToken(
  clientKey: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(
      `tiktok token refresh ${res.status}: ${data.error ?? ""} ${data.error_description ?? ""}`,
    );
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_in: data.expires_in ?? 86400,
  };
}

// Hashtag selection — priority-ordered, with hard guarantees.
//
// Previously this was a flat TIKTOK_TOP_HASHTAGS list dedup-merged with
// the asset's Core 10 then sliced to 7, which insertion-order-bias dropped
// BOTH #fyp (TT-native discovery, biggest algo signal) AND #HonestStack
// (brand return-viewer signal) because they sat at the tail. Fixed by
// splitting into MUST_INCLUDE (always survives the cap) + DISCOVERY (top
// up to the cap). Bumped cap from 7 → 10 — TikTok's "5-7" is a soft
// guideline, not a hard wall, and three guaranteed slots already eat 30%.
const TIKTOK_MUST_INCLUDE = [
  "fyp",          // TT-native discovery surface — non-negotiable
  "كورة",          // Arabic TT-native discovery
  "HonestStack",  // Brand — return-viewer signal
];
const TIKTOK_DISCOVERY = [
  "WorldCup2026",
  "كأس_العالم",
  "FIFAWorldCup",
  "كرة_القدم",
  "الفراعنة",
  "Football",
  "Soccer",
];
const TIKTOK_TAG_CAP = 10;

// TikTok caption (title) hard cap. The API accepts more in some endpoints
// but the inbox/init flow truncates anything over 2200 chars; we stay well
// under to leave room for the hashtag block.
const TIKTOK_CAPTION_CAP = 2000;

// Growth-CTA rotation. The single biggest unlock on TikTok cold-start is
// REPLY VELOCITY in the first hour — the platform reads "creator cares"
// from comment activity. Every caption now appends one of these tails so
// the in-video CTA gets reinforced in the scroll-stop moment.
// Deterministic rotation by asset_id char-sum so same asset always picks
// the same tail (stable for future A/B analysis).
const TIKTOK_CTA_TAILS = [
  "💬 رأيك تحت — مين شَدَّك أكتر؟",
  "💾 احفظها للماتش، وكَمَّل معايا.",
  "🇪🇬 تابعني — أنا بَنَزَّل ٤ مَرّات في اليوم.",
  "🔁 ابعتها للي نام النَّهارده الصبح.",
];

function pickCta(assetId: string): string {
  let sum = 0;
  for (let i = 0; i < assetId.length; i++) sum = (sum + assetId.charCodeAt(i)) | 0;
  return TIKTOK_CTA_TAILS[Math.abs(sum) % TIKTOK_CTA_TAILS.length];
}

function buildTitle(idea: Idea | null, asset: Asset): string {
  const raw = idea?.hook ?? asset.caption ?? "أخبار كأس العالم 2026";
  const baseTags = Array.isArray(asset.hashtags) ? asset.hashtags : [];
  // Order: MUST_INCLUDE first (guaranteed slots), then platform DISCOVERY,
  // then the asset's own Core 10 tags. dedup preserves first-occurrence
  // position, so fyp/كورة/HonestStack are always in the first 3.
  const merged = Array.from(new Set([
    ...TIKTOK_MUST_INCLUDE,
    ...TIKTOK_DISCOVERY,
    ...baseTags,
  ])).slice(0, TIKTOK_TAG_CAP);
  const cta = pickCta(asset.id);
  const ctaBlock = `\n\n${cta}`;
  const tagBlock = "\n\n" + merged.map((t) => `#${t.replace(/^#/, "")}`).join(" ");

  const overhead = ctaBlock.length + tagBlock.length;
  const maxHookLen = TIKTOK_CAPTION_CAP - overhead;
  const hook = raw.length > maxHookLen ? raw.slice(0, maxHookLen - 3) + "..." : raw;
  return `${hook}${ctaBlock}${tagBlock}`;
}

// creator_info query — REQUIRED before a direct post. Returns the account's
// allowed privacy levels + interaction settings so we send a valid post_info.
type CreatorInfo = {
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  creator_username: string | null;
  creator_nickname: string | null;
};

async function queryCreatorInfo(accessToken: string): Promise<CreatorInfo> {
  const res = await fetch(CREATOR_INFO_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  if (!res.ok || (data?.error && data.error.code && data.error.code !== "ok")) {
    throw new Error(
      `tiktok creator_info ${res.status}: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  const d = data?.data ?? {};
  return {
    privacy_level_options: Array.isArray(d.privacy_level_options)
      ? d.privacy_level_options
      : [],
    comment_disabled: Boolean(d.comment_disabled),
    duet_disabled: Boolean(d.duet_disabled),
    stitch_disabled: Boolean(d.stitch_disabled),
    creator_username: typeof d.creator_username === "string" ? d.creator_username : null,
    creator_nickname: typeof d.creator_nickname === "string" ? d.creator_nickname : null,
  };
}

// Video init. Returns publish_id + upload_url. We use FILE_UPLOAD (not
// PULL_FROM_URL) so we never need TikTok Developer Portal domain verification.
//   directPost=true  → /v2/post/publish/video/init/ (auto-publishes publicly;
//                      requires the audited app + a valid privacy_level)
//   directPost=false → /inbox/video/init/ (lands as a draft in the user's
//                      TikTok inbox for manual posting)
type PublishOpts = {
  directPost: boolean;
  privacyLevel: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
};

async function publishInit(
  accessToken: string,
  videoSize: number,
  title: string,
  opts: PublishOpts,
): Promise<{ publish_id: string; upload_url: string }> {
  // Single-chunk upload: TikTok requires chunk_size = video_size when
  // total_chunk_count = 1. Our rendered MP4s are 15-30MB, well within
  // the 64MB single-chunk ceiling.
  const post_info = opts.directPost
    ? {
      title,
      privacy_level: opts.privacyLevel,
      disable_comment: opts.disableComment,
      disable_duet: opts.disableDuet,
      disable_stitch: opts.disableStitch,
    }
    : {
      // Inbox flow: lands as a private draft; the user sets final privacy +
      // caption when they post from the TikTok app.
      title,
      privacy_level: "SELF_ONLY",
      disable_duet: false,
      disable_stitch: false,
      disable_comment: false,
    };
  const body = {
    post_info,
    source_info: {
      source: "FILE_UPLOAD",
      video_size: videoSize,
      chunk_size: videoSize,
      total_chunk_count: 1,
    },
  };

  const res = await fetch(
    opts.directPost ? PUBLISH_INIT_DIRECT_URL : PUBLISH_INIT_INBOX_URL,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const data = await res.json();
  const publishId = data?.data?.publish_id as string | undefined;
  const uploadUrl = data?.data?.upload_url as string | undefined;
  if (!res.ok || !publishId || !uploadUrl) {
    throw new Error(
      `tiktok publish init ${res.status}: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }
  return { publish_id: publishId, upload_url: uploadUrl };
}

async function uploadVideoChunk(uploadUrl: string, bytes: Uint8Array): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(bytes.length),
      "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
    },
    body: bytes,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`tiktok video chunk upload ${res.status}: ${detail.slice(0, 300)}`);
  }
}

async function pollPublishStatus(
  accessToken: string,
  publishId: string,
  maxWaitMs = 180_000,
): Promise<{ status: string; raw: Record<string, unknown> }> {
  const deadline = Date.now() + maxWaitMs;
  let lastRaw: Record<string, unknown> = {};

  while (Date.now() < deadline) {
    const res = await fetch(PUBLISH_STATUS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json();
    lastRaw = data;
    const status = data?.data?.status as string | undefined;

    if (!res.ok) {
      throw new Error(`tiktok status poll ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    }

    if (status === "PUBLISH_COMPLETE" || status === "SEND_TO_USER_INBOX") {
      return { status, raw: data };
    }
    if (status === "FAILED" || status === "PUBLISH_FAILED") {
      return { status, raw: data };
    }

    // Still processing — wait then poll again.
    await new Promise((r) => setTimeout(r, 5_000));
  }

  return { status: "TIMEOUT_POLLING", raw: lastRaw };
}

// ─────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!supabaseUrl || !serviceKey || !anonKey || !clientKey || !clientSecret) {
    return json({ ok: false, error: "server misconfigured" }, 500);
  }

  // ---- auth: user JWT  OR  service-side ingest secret ----------
  // The cockpit "Publish to TikTok" button forwards the user's JWT.
  // The auto-scheduler edge function calls us server-side with the
  // shared INGEST_SECRET and an explicit owner_id in the body.
  let userId: string;
  const incomingSecret = req.headers.get("x-ingest-secret") ?? "";
  const isServiceCall = Boolean(ingestSecret) && incomingSecret === ingestSecret;

  let body: { asset_id?: unknown; owner_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "body must be JSON" }, 400);
  }

  if (isServiceCall) {
    const callerOwner = typeof body?.owner_id === "string" ? body.owner_id : "";
    if (!callerOwner) {
      return json(
        { ok: false, error: "service call requires owner_id in body" },
        400,
      );
    }
    userId = callerOwner;
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userJwt = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!userJwt) return json({ ok: false, error: "unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResp, error: userErr } = await userClient.auth.getUser(userJwt);
    if (userErr || !userResp?.user) return json({ ok: false, error: "invalid JWT" }, 401);
    userId = userResp.user.id;
  }

  // ---- read-only validation: { "check": "creator_info" } ------
  // Confirms the audited app can direct-post (returns allowed privacy levels)
  // WITHOUT posting anything. No asset needed.
  if (typeof (body as { check?: unknown })?.check === "string" &&
      (body as { check?: unknown }).check === "creator_info") {
    const adminC = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: acct } = await adminC
      .from("social_accounts")
      .select("id, open_id, access_token, refresh_token, expires_at, display_name")
      .eq("owner_id", userId).eq("platform", "tiktok").maybeSingle<SocialAccount>();
    if (!acct) return json({ ok: false, error: "TikTok not connected" }, 400);
    let token = acct.access_token;
    try {
      if (isExpired(acct.expires_at) && acct.refresh_token) {
        const r = await refreshAccessToken(clientKey, clientSecret, acct.refresh_token);
        token = r.access_token;
        await adminC.from("social_accounts").update({
          access_token: r.access_token,
          refresh_token: r.refresh_token,
          expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", acct.id);
      }
      const ci = await queryCreatorInfo(token);
      const directDefault = Deno.env.get("TIKTOK_DIRECT_POST") !== "false";
      return json({ ok: true, check: "creator_info", direct_post_default: directDefault, ...ci });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
    }
  }

  const assetId = typeof body?.asset_id === "string" ? body.asset_id : "";
  if (!assetId) return json({ ok: false, error: "asset_id required" }, 400);

  // ---- fetch asset + idea + social account ---------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: asset, error: assetErr } = await admin
    .from("assets")
    .select("id, owner_id, idea_id, media, caption, hashtags")
    .eq("id", assetId)
    .maybeSingle<Asset>();
  if (assetErr) return json({ ok: false, error: `asset lookup: ${assetErr.message}` }, 500);
  if (!asset) return json({ ok: false, error: "asset not found" }, 404);
  if (asset.owner_id !== userId) return json({ ok: false, error: "forbidden" }, 403);
  if (getMediaString(asset.media, "status") !== "done") {
    return json({ ok: false, error: "asset not done — render must finish first" }, 400);
  }
  const videoUrl = getMediaString(asset.media, "video_url");
  if (!videoUrl) return json({ ok: false, error: "asset has no video_url" }, 400);

  const { data: account, error: acctErr } = await admin
    .from("social_accounts")
    .select("id, open_id, access_token, refresh_token, expires_at, display_name")
    .eq("owner_id", userId)
    .eq("platform", "tiktok")
    .maybeSingle<SocialAccount>();
  if (acctErr) return json({ ok: false, error: `social_accounts: ${acctErr.message}` }, 500);
  if (!account) {
    return json({ ok: false, error: "TikTok not connected — connect via /connections first" }, 400);
  }

  let idea: Idea | null = null;
  if (asset.idea_id) {
    const { data } = await admin
      .from("content_ideas").select("hook, brief").eq("id", asset.idea_id).maybeSingle<Idea>();
    idea = data;
  }

  // ---- posts_queue: mark publishing ----------------------------
  const { data: existing } = await admin
    .from("posts_queue")
    .select("id")
    .eq("asset_id", assetId).eq("platform", "tiktok").maybeSingle<{ id: string }>();

  let queueId = existing?.id ?? null;
  if (queueId) {
    await admin.from("posts_queue").update({
      status: "publishing", error: null, updated_at: new Date().toISOString(),
    }).eq("id", queueId);
  } else {
    const { data: inserted, error: insErr } = await admin.from("posts_queue").insert({
      owner_id: userId, asset_id: assetId, platform: "tiktok", status: "publishing",
    }).select("id").single<{ id: string }>();
    if (insErr) return json({ ok: false, error: `posts_queue: ${insErr.message}` }, 500);
    queueId = inserted.id;
  }

  async function markQueueError(message: string) {
    if (!queueId) return;
    await admin.from("posts_queue").update({
      status: "failed", error: message.slice(0, 1000), updated_at: new Date().toISOString(),
    }).eq("id", queueId);
  }

  // ---- Refresh + publishInit are SYNCHRONOUS (must fit in 60s) ---
  // The async PUBLISH_COMPLETE poll loop is moved to a background task via
  // EdgeRuntime.waitUntil — pollPublishStatus can run up to 3 min and we
  // can't block the HTTP response for that long (Supabase edge timeout).
  let publishId: string | null = null;
  let accessToken = account.access_token;
  let creatorUsername: string | null = null;
  let usedDirectPost = false;

  try {
    if (isExpired(account.expires_at) && account.refresh_token) {
      const refreshed = await refreshAccessToken(clientKey, clientSecret, account.refresh_token);
      accessToken = refreshed.access_token;
      await admin.from("social_accounts").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", account.id);
    }

    const title = buildTitle(idea, asset);

    // 1. Download the MP4 from Supabase storage into memory. ~15-30MB
    //    typical, fits comfortably in Deno Deploy's 512MB cap.
    const mp4Res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!mp4Res.ok) {
      throw new Error(`fetch mp4 from ${videoUrl} -> ${mp4Res.status}`);
    }
    const mp4Bytes = new Uint8Array(await mp4Res.arrayBuffer());
    console.log(`[${assetId}] mp4 fetched: ${(mp4Bytes.length / 1024 / 1024).toFixed(2)} MB`);

    // 1b. Direct-post setup. Default ON now the app is audited; set
    //     TIKTOK_DIRECT_POST=false to force the inbox (manual) flow. For a
    //     direct post we MUST query creator_info first to learn the account's
    //     allowed privacy levels + interaction settings.
    usedDirectPost = Deno.env.get("TIKTOK_DIRECT_POST") !== "false";
    let privacyLevel = "SELF_ONLY";
    let disableComment = false, disableDuet = false, disableStitch = false;
    if (usedDirectPost) {
      try {
        const ci = await queryCreatorInfo(accessToken);
        creatorUsername = ci.creator_username;
        privacyLevel = ci.privacy_level_options.includes("PUBLIC_TO_EVERYONE")
          ? "PUBLIC_TO_EVERYONE"
          : (ci.privacy_level_options[0] ?? "SELF_ONLY");
        // The API rejects ENABLING an interaction the account has disabled.
        disableComment = ci.comment_disabled;
        disableDuet = ci.duet_disabled;
        disableStitch = ci.stitch_disabled;
      } catch (ciErr) {
        console.error(
          `[${assetId}] creator_info failed — falling back to inbox flow:`,
          ciErr instanceof Error ? ciErr.message : String(ciErr),
        );
        usedDirectPost = false;
      }
    }

    // 2. Tell TikTok we're about to upload — they return an upload_url. If a
    //    direct-post init is rejected, fall back to the inbox flow so the
    //    video is never lost (lands as a draft for manual posting).
    let init: { publish_id: string; upload_url: string };
    try {
      init = await publishInit(accessToken, mp4Bytes.length, title, {
        directPost: usedDirectPost, privacyLevel,
        disableComment, disableDuet, disableStitch,
      });
    } catch (initErr) {
      if (!usedDirectPost) throw initErr;
      console.error(
        `[${assetId}] direct-post init failed — retrying via inbox:`,
        initErr instanceof Error ? initErr.message : String(initErr),
      );
      usedDirectPost = false;
      init = await publishInit(accessToken, mp4Bytes.length, title, {
        directPost: false, privacyLevel: "SELF_ONLY",
        disableComment: false, disableDuet: false, disableStitch: false,
      });
    }
    publishId = init.publish_id;
    const uploadUrl = init.upload_url;
    console.log(
      `[${assetId}] tiktok publish init (${usedDirectPost ? "direct" : "inbox"}) -> ${publishId}`,
    );

    // 3. PUT the bytes (single chunk).
    await uploadVideoChunk(uploadUrl, mp4Bytes);
    console.log(`[${assetId}] tiktok video bytes uploaded`);

    // Stash the publish_id on the queue row so the background task can find
    // it AND the cockpit can see it even before terminal.
    await admin.from("posts_queue").update({
      external_post_id: publishId,
      updated_at: new Date().toISOString(),
    }).eq("id", queueId!);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${assetId}] publish-tiktok init failed:`, message);
    await markQueueError(message);
    // 200 + ok:false so supabase.functions.invoke surfaces the real message
    // to the cockpit instead of a generic non-2xx wrapper.
    return json({ ok: false, error: message, phase: "init" }, 200);
  }

  // ---- Background: poll until terminal, then write back ----------
  const capturedAccessToken = accessToken;
  const capturedPublishId = publishId!;
  const capturedQueueId = queueId!;
  const capturedAssetId = assetId;
  const capturedMedia = asset.media ?? {};
  const capturedCreatorUsername = creatorUsername;
  const capturedDirect = usedDirectPost;

  const backgroundPoll = (async () => {
    try {
      const { status, raw } = await pollPublishStatus(capturedAccessToken, capturedPublishId);
      console.log(`[${capturedAssetId}] tiktok terminal status: ${status}`);
      const nowIso = new Date().toISOString();
      const isSuccess = status === "PUBLISH_COMPLETE" || status === "SEND_TO_USER_INBOX";

      if (isSuccess) {
        // Direct posts return the public video id once processed (TikTok's
        // field is the misspelled "publicaly_available_post_id"; accept both).
        // Inbox posts have no public URL until the user posts from the app.
        const data = (raw?.data ?? {}) as Record<string, unknown>;
        const postIds = (data.publicaly_available_post_id ??
          data.publicly_available_post_id) as unknown;
        const videoId = Array.isArray(postIds) && postIds.length
          ? String(postIds[0])
          : null;
        const externalUrl = (capturedDirect && videoId && capturedCreatorUsername)
          ? `https://www.tiktok.com/@${capturedCreatorUsername}/video/${videoId}`
          : null;

        await admin.from("posts_queue").update({
          status: "posted",
          external_post_id: videoId ?? capturedPublishId,
          external_url: externalUrl,
          posted_at: nowIso,
          updated_at: nowIso,
          error: null,
        }).eq("id", capturedQueueId);

        await admin.from("assets").update({
          media: {
            ...capturedMedia,
            tiktok_publish_id: capturedPublishId,
            tiktok_status: status,
            tiktok_mode: capturedDirect ? "direct" : "inbox",
            ...(videoId ? { tiktok_video_id: videoId } : {}),
            ...(externalUrl ? { tiktok_url: externalUrl } : {}),
          },
        }).eq("id", capturedAssetId);
      } else {
        const failMsg = `tiktok ${status}: ${JSON.stringify(raw).slice(0, 600)}`;
        await admin.from("posts_queue").update({
          status: "failed",
          error: failMsg.slice(0, 1000),
          updated_at: nowIso,
        }).eq("id", capturedQueueId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${capturedAssetId}] tiktok background poll failed:`, message);
      try {
        await admin.from("posts_queue").update({
          status: "failed",
          error: `poll: ${message}`.slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq("id", capturedQueueId);
      } catch {
        // Last-resort: nothing we can do if the writeback itself fails.
      }
    }
  })();

  // deno-lint-ignore no-explicit-any
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
    edgeRuntime.waitUntil(backgroundPoll);
  } else {
    // Local/dev fallback.
    void backgroundPoll;
  }

  // Return immediately — the cockpit polls posts_queue to see the final
  // outcome (posted ✓ or error with the TikTok diagnostic).
  return json({
    ok: true,
    asset_id: assetId,
    publish_id: publishId,
    status: "uploading",
    message: "TikTok accepted the upload, background polling for completion",
  });
});
