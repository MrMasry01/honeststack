// ============================================================
// HonestStack — publish-youtube edge function
// ------------------------------------------------------------
// Publishes a rendered MP4 (from assets.media.video_url) to the
// HonestStack YouTube channel as a Short, using the long-lived
// refresh token + client creds stored in Supabase secrets.
//
// Flow:
//   1. Auth: requires user JWT (verify_jwt = true). Verifies the
//      requesting user owns the asset.
//   2. Asset state: rejects unless asset.media.status = 'done' and
//      a video_url is present.
//   3. posts_queue: upserts an 'youtube' row for this asset to
//      status='publishing', so the cockpit shows in-flight state.
//   4. Token refresh: exchanges YT_REFRESH_TOKEN for a fresh
//      access_token via Google OAuth.
//   5. Resumable upload: initiates upload session, PUTs the MP4
//      bytes (downloaded once from Supabase storage), captures the
//      YouTube video id.
//   6. Writes back:
//        - posts_queue: status='posted', external_post_id=video_id,
//          external_url='https://youtube.com/shorts/<id>', posted_at
//        - assets.media: adds youtube_url + youtube_video_id
//   7. Returns { ok: true, youtube_url, video_id }.
//
// On any failure, posts_queue row is marked status='error' with the
// error message so the cockpit error tracker surfaces it.
//
// Cockpit calls this via:
//   supabase.functions.invoke('publish-youtube', { body: { asset_id } })
//
// Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                      SUPABASE_ANON_KEY
// Env (secrets): YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
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

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_INIT_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

// Map content-bucket → opinionated default privacy. Public for all by
// default; flip to 'private' here if you want a manual-review gate.
const DEFAULT_PRIVACY = "public" as const;

// YouTube Sports category id. See:
// https://developers.google.com/youtube/v3/docs/videoCategories/list
const SPORTS_CATEGORY_ID = "17";

type Asset = {
  id: string;
  owner_id: string;
  idea_id: string | null;
  kind: string | null;
  media: Record<string, unknown> | null;
  caption: string | null;
  hashtags: string[] | null;
};

type Idea = {
  id: string;
  hook: string | null;
  brief: Record<string, unknown> | null;
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function getMediaString(media: Record<string, unknown> | null, key: string): string | null {
  if (!media) return null;
  const v = media[key];
  return typeof v === "string" && v ? v : null;
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`token refresh failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data?.access_token) {
    throw new Error("token refresh returned no access_token");
  }
  return data.access_token as string;
}

function buildVideoTitle(idea: Idea | null, asset: Asset): string {
  const raw = idea?.hook ?? asset.caption ?? "أخبار كأس العالم 2026";
  // YouTube title cap: 100 chars
  return raw.length > 100 ? raw.slice(0, 97) + "..." : raw;
}

function buildVideoDescription(idea: Idea | null, asset: Asset, hashtags: string[]): string {
  const hook = idea?.hook ?? asset.caption ?? "";
  const cta = idea?.brief && typeof idea.brief === "object"
    ? (idea.brief as Record<string, unknown>).cta as string | undefined
    : undefined;

  const tagBlock = hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
  return [
    hook,
    cta ?? "",
    "",
    tagBlock,
    "",
    "Made by HonestStack — automated football news in colloquial Egyptian Arabic.",
    "https://honeststack.co.uk",
  ].filter(Boolean).join("\n").slice(0, 5000);
}

async function initiateUploadSession(
  accessToken: string,
  title: string,
  description: string,
  tags: string[],
  contentLength: number,
): Promise<string> {
  const metadata = {
    snippet: {
      title,
      description,
      tags,
      categoryId: SPORTS_CATEGORY_ID,
      defaultLanguage: "ar",
      defaultAudioLanguage: "ar",
    },
    status: {
      privacyStatus: DEFAULT_PRIVACY,
      selfDeclaredMadeForKids: false,
      embeddable: true,
    },
  };

  const res = await fetch(UPLOAD_INIT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(contentLength),
    },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`upload init failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const uploadUrl = res.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("upload init returned no Location header");
  }
  return uploadUrl;
}

async function performUpload(
  uploadUrl: string,
  bytes: Uint8Array,
): Promise<{ videoId: string }> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(bytes.length),
    },
    body: bytes,
    signal: AbortSignal.timeout(300_000), // 5 minutes for large videos
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`upload PUT failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const videoId = data?.id as string | undefined;
  if (!videoId) {
    throw new Error("YouTube upload returned no video id");
  }
  return { videoId };
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

  // ---- env ------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const ytClientId = Deno.env.get("YT_CLIENT_ID");
  const ytClientSecret = Deno.env.get("YT_CLIENT_SECRET");
  const ytRefreshToken = Deno.env.get("YT_REFRESH_TOKEN");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ ok: false, error: "supabase env not configured" }, 500);
  }
  if (!ytClientId || !ytClientSecret || !ytRefreshToken) {
    return json(
      { ok: false, error: "YouTube secrets missing (YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN)" },
      500,
    );
  }

  // ---- auth: user JWT  OR  service-side ingest secret ----------
  // The cockpit "Publish to YouTube" button forwards the user's JWT.
  // The auto-scheduler edge function calls us server-side with the
  // shared INGEST_SECRET and an explicit owner_id in the body.
  const ingestSecret = Deno.env.get("INGEST_SECRET") ?? "";
  let body: { asset_id?: unknown; owner_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request: body must be JSON" }, 400);
  }

  let userId: string;
  const incomingSecret = req.headers.get("x-ingest-secret") ?? "";
  const isServiceCall = Boolean(ingestSecret) && incomingSecret === ingestSecret;

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
    if (!userJwt) {
      return json({ ok: false, error: "unauthorized: no JWT" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResp, error: userErr } = await userClient.auth.getUser(userJwt);
    if (userErr || !userResp?.user) {
      return json({ ok: false, error: "unauthorized: invalid JWT" }, 401);
    }
    userId = userResp.user.id;
  }

  // ---- body: asset_id ------------------------------------------
  const assetId = typeof body?.asset_id === "string" ? body.asset_id : "";
  if (!assetId) {
    return json({ ok: false, error: "bad request: asset_id (string) is required" }, 400);
  }

  // ---- fetch asset + verify ownership --------------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: asset, error: assetErr } = await admin
    .from("assets")
    .select("id, owner_id, idea_id, kind, media, caption, hashtags")
    .eq("id", assetId)
    .maybeSingle<Asset>();

  if (assetErr) return json({ ok: false, error: `asset lookup: ${assetErr.message}` }, 500);
  if (!asset) return json({ ok: false, error: "asset not found" }, 404);
  if (asset.owner_id !== userId) return json({ ok: false, error: "forbidden" }, 403);

  const status = getMediaString(asset.media, "status");
  if (status !== "done") {
    return json({ ok: false, error: `asset is not done (status=${status ?? "null"})` }, 400);
  }
  const videoUrl = getMediaString(asset.media, "video_url");
  if (!videoUrl) {
    return json({ ok: false, error: "asset has no video_url to publish" }, 400);
  }

  // ---- fetch idea for title / description (best-effort) --------
  let idea: Idea | null = null;
  if (asset.idea_id) {
    const { data: i } = await admin
      .from("content_ideas")
      .select("id, hook, brief")
      .eq("id", asset.idea_id)
      .maybeSingle<Idea>();
    idea = i;
  }

  const hashtags = Array.isArray(asset.hashtags) && asset.hashtags.length > 0
    ? asset.hashtags
    : ["WorldCup2026", "كأس_العالم", "Shorts"];
  const title = buildVideoTitle(idea, asset);
  const description = buildVideoDescription(idea, asset, hashtags);

  // ---- posts_queue: mark as publishing -------------------------
  // Upsert pattern: one queue row per (asset_id, platform).
  const { data: existingQueue } = await admin
    .from("posts_queue")
    .select("id")
    .eq("asset_id", assetId)
    .eq("platform", "youtube")
    .maybeSingle<{ id: string }>();

  let queueId: string | null = existingQueue?.id ?? null;

  if (queueId) {
    await admin.from("posts_queue").update({
      status: "publishing",
      error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", queueId);
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("posts_queue")
      .insert({
        owner_id: userId,
        asset_id: assetId,
        platform: "youtube",
        status: "publishing",
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr) {
      return json({ ok: false, error: `posts_queue insert: ${insErr.message}` }, 500);
    }
    queueId = inserted.id;
  }

  // ---- the actual upload, with error writeback -----------------
  async function markQueueError(message: string) {
    if (!queueId) return;
    await admin.from("posts_queue").update({
      status: "failed",
      error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("id", queueId);
  }

  try {
    // 1. Refresh YT access token
    const accessToken = await refreshAccessToken(ytClientId, ytClientSecret, ytRefreshToken);

    // 2. Download the MP4 from Supabase storage into memory.
    // The asset bucket is public so a plain fetch works; on the Deno Deploy
    // runtime this loads the whole file (~15-30 MB) into memory at once.
    const mp4Res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!mp4Res.ok) {
      throw new Error(`fetch mp4 failed (${mp4Res.status}) from ${videoUrl}`);
    }
    const mp4Bytes = new Uint8Array(await mp4Res.arrayBuffer());
    console.log(`[${assetId}] mp4 fetched: ${(mp4Bytes.length / 1024 / 1024).toFixed(2)} MB`);

    // 3. Init resumable upload session.
    const uploadUrl = await initiateUploadSession(
      accessToken,
      title,
      description,
      hashtags,
      mp4Bytes.length,
    );

    // 4. PUT the bytes.
    const { videoId } = await performUpload(uploadUrl, mp4Bytes);
    const youtubeUrl = `https://youtube.com/shorts/${videoId}`;
    const nowIso = new Date().toISOString();

    // 5. Write back: posts_queue + assets.media
    await admin.from("posts_queue").update({
      status: "posted",
      external_post_id: videoId,
      external_url: youtubeUrl,
      posted_at: nowIso,
      updated_at: nowIso,
      error: null,
    }).eq("id", queueId!);

    const newMedia = { ...(asset.media ?? {}), youtube_url: youtubeUrl, youtube_video_id: videoId };
    await admin.from("assets").update({ media: newMedia }).eq("id", assetId);

    console.log(`[${assetId}] ✅ published to YouTube: ${youtubeUrl}`);

    return json({
      ok: true,
      asset_id: assetId,
      youtube_url: youtubeUrl,
      video_id: videoId,
      title,
      privacy: DEFAULT_PRIVACY,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${assetId}] ❌ publish-youtube failed:`, message);
    await markQueueError(message);
    return json({ ok: false, error: message }, 500);
  }
});
