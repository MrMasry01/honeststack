// ============================================================
// HonestStack — publish-instagram edge function
// ------------------------------------------------------------
// Publishes a rendered MP4 to @honeststack as a Reel via the
// Instagram Graph API (Path A, Facebook Login flow).
//
// Two-step Graph API publish:
//   1. POST /{ig-user-id}/media   media_type=REELS, video_url
//      → returns creation_id (container)
//   2. Poll  /{creation_id}?fields=status_code  until FINISHED
//      (usually 20-60s for our ~30MB Reels)
//   3. POST /{ig-user-id}/media_publish  creation_id
//      → returns published media_id
//
// Auth: user JWT (cockpit button) OR INGEST_SECRET header
//       (server-side auto-scheduler with owner_id in body).
//
// Env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// Env (secrets):
//   INGEST_SECRET        — shared cron auth
//   IG_GRAPH_TOKEN       — 60-day long-lived user access token
//   IG_USER_ID           — instagram business account id (17841441772930830)
//   IG_APP_ID            — meta app id (27068367932847775)
//   IG_APP_SECRET        — meta app secret (for token refresh + debug)
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Instagram API rewards 5–10 relevant tags in the caption. We append to
// whatever the asset row carries. #reels + #reelsinstagram are IG-native
// discovery surfaces.
const INSTAGRAM_TOP_HASHTAGS = [
  "WorldCup2026",
  "كأس_العالم",
  "كرة_القدم",
  "reels",
  "reelsinstagram",
];
const INSTAGRAM_CAPTION_CAP = 2200; // IG Reels caption hard limit

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// How long we poll the container synchronously before giving up. Reels
// containers usually transition in 20–60s for ~30MB videos. We cap at
// 120s because Supabase Edge Functions enforce a hard ~150s request
// lifetime including any background work — leaving 30s buffer for the
// publish call. If IG takes longer than 120s, we mark the queue row
// 'pending_publish' and a separate finalizer (or manual retry) can
// complete it. Going async via waitUntil() proved unreliable: edge
// instances get recycled mid-poll and the background task silently dies.
const MAX_CONTAINER_POLL_MS = 120_000;
const POLL_INTERVAL_MS = 4_000;

type Asset = {
  id: string;
  owner_id: string;
  idea_id: string | null;
  media: Record<string, unknown> | null;
  caption: string | null;
  hashtags: string[] | null;
};

type Idea = {
  hook: string | null;
  brief: Record<string, unknown> | null;
};

function getMediaString(
  m: Record<string, unknown> | null,
  k: string,
): string | null {
  if (!m) return null;
  const v = m[k];
  return typeof v === "string" && v ? v : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildCaption(idea: Idea | null, asset: Asset): string {
  const raw = idea?.hook ?? asset.caption ?? "أخبار كأس العالم 2026";
  const baseTags = Array.isArray(asset.hashtags) ? asset.hashtags : [];
  const merged = Array.from(
    new Set([...baseTags, ...INSTAGRAM_TOP_HASHTAGS]),
  ).slice(0, 10);
  const tagBlock = "\n\n" +
    merged.map((t) => `#${t.replace(/^#/, "")}`).join(" ");
  const maxHookLen = INSTAGRAM_CAPTION_CAP - tagBlock.length;
  const hook = raw.length > maxHookLen
    ? raw.slice(0, maxHookLen - 3) + "..."
    : raw;
  return `${hook}${tagBlock}`;
}

// Step 1: create the container.
async function createReelContainer(
  igUserId: string,
  graphToken: string,
  videoUrl: string,
  caption: string,
): Promise<string> {
  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    access_token: graphToken,
  });
  const res = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await res.json();
  if (!res.ok || !data?.id) {
    throw new Error(
      `ig container create ${res.status}: ${
        JSON.stringify(data).slice(0, 400)
      }`,
    );
  }
  return data.id as string;
}

// Step 2: poll until container is FINISHED, ERROR, or EXPIRED.
async function pollContainerStatus(
  creationId: string,
  graphToken: string,
): Promise<{ status: string; raw: Record<string, unknown> }> {
  const deadline = Date.now() + MAX_CONTAINER_POLL_MS;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const res = await fetch(
      `${GRAPH_BASE}/${creationId}?fields=status_code,status&access_token=${
        encodeURIComponent(graphToken)
      }`,
      { signal: AbortSignal.timeout(20_000) },
    );
    const data = await res.json();
    last = data;
    if (!res.ok) {
      throw new Error(
        `ig status poll ${res.status}: ${JSON.stringify(data).slice(0, 300)}`,
      );
    }
    const status = (data?.status_code as string | undefined) ?? "";
    if (status === "FINISHED") return { status, raw: data };
    if (status === "ERROR" || status === "EXPIRED") {
      return { status, raw: data };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { status: "TIMEOUT", raw: last };
}

// Step 3: publish.
async function publishContainer(
  igUserId: string,
  graphToken: string,
  creationId: string,
): Promise<string> {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: graphToken,
  });
  const res = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await res.json();
  if (!res.ok || !data?.id) {
    throw new Error(
      `ig publish ${res.status}: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }
  return data.id as string;
}

// Best-effort: fetch the permalink of the just-published Reel.
async function fetchPermalink(
  mediaId: string,
  graphToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${
        encodeURIComponent(graphToken)
      }`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.permalink === "string" ? data.permalink : null;
  } catch {
    return null;
  }
}

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
  const igGraphToken = Deno.env.get("IG_GRAPH_TOKEN");
  const igUserId = Deno.env.get("IG_USER_ID");
  const ingestSecret = Deno.env.get("INGEST_SECRET");

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ ok: false, error: "supabase env not configured" }, 500);
  }
  if (!igGraphToken || !igUserId) {
    return json(
      {
        ok: false,
        error: "Instagram secrets missing (IG_GRAPH_TOKEN / IG_USER_ID)",
      },
      500,
    );
  }

  let body: { asset_id?: unknown; owner_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "body must be JSON" }, 400);
  }

  // Auth: ingest secret OR user JWT
  let userId: string;
  const incomingSecret = req.headers.get("x-ingest-secret") ?? "";
  const isServiceCall = Boolean(ingestSecret) &&
    incomingSecret === ingestSecret;

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
    const { data: userResp, error: userErr } = await userClient.auth.getUser(
      userJwt,
    );
    if (userErr || !userResp?.user) {
      return json({ ok: false, error: "invalid JWT" }, 401);
    }
    userId = userResp.user.id;
  }

  const assetId = typeof body?.asset_id === "string" ? body.asset_id : "";
  if (!assetId) return json({ ok: false, error: "asset_id required" }, 400);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: asset, error: assetErr } = await admin
    .from("assets")
    .select("id, owner_id, idea_id, media, caption, hashtags")
    .eq("id", assetId)
    .maybeSingle<Asset>();

  if (assetErr) {
    return json(
      { ok: false, error: `asset lookup: ${assetErr.message}` },
      500,
    );
  }
  if (!asset) return json({ ok: false, error: "asset not found" }, 404);
  if (asset.owner_id !== userId) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const status = getMediaString(asset.media, "status");
  if (status !== "done") {
    return json(
      { ok: false, error: `asset is not done (status=${status ?? "null"})` },
      400,
    );
  }
  const videoUrl = getMediaString(asset.media, "video_url");
  if (!videoUrl) {
    return json({ ok: false, error: "asset has no video_url to publish" }, 400);
  }

  let idea: Idea | null = null;
  if (asset.idea_id) {
    const { data } = await admin
      .from("content_ideas")
      .select("hook, brief")
      .eq("id", asset.idea_id)
      .maybeSingle<Idea>();
    idea = data;
  }

  // ---- posts_queue: mark as publishing -------------------------
  const { data: existingQueue } = await admin
    .from("posts_queue")
    .select("id")
    .eq("asset_id", assetId)
    .eq("platform", "instagram")
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
        platform: "instagram",
        status: "publishing",
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr) {
      return json(
        { ok: false, error: `posts_queue insert: ${insErr.message}` },
        500,
      );
    }
    queueId = inserted.id;
  }

  async function markQueueError(message: string) {
    if (!queueId) return;
    await admin.from("posts_queue").update({
      status: "failed",
      error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("id", queueId);
  }

  // ---- Step 1: create container (synchronous) ------------------
  // ---- Step 1: create container (synchronous) ------------------
  const caption = buildCaption(idea, asset);
  let creationId: string;
  try {
    creationId = await createReelContainer(
      igUserId,
      igGraphToken,
      videoUrl,
      caption,
    );
    console.log(`[${assetId}] ig container created: ${creationId}`);
    await admin.from("posts_queue").update({
      external_post_id: creationId,
      updated_at: new Date().toISOString(),
    }).eq("id", queueId!);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${assetId}] ig container create failed:`, message);
    await markQueueError(message);
    return json({ ok: false, error: message, phase: "container" }, 200);
  }

  // ---- Step 2: poll container status synchronously -------------
  // Runs inline so the function only returns once the publish is
  // either complete or definitively failed. No background task.
  let containerStatus = "";
  let containerRaw: Record<string, unknown> = {};
  try {
    const result = await pollContainerStatus(creationId, igGraphToken);
    containerStatus = result.status;
    containerRaw = result.raw;
    console.log(`[${assetId}] ig container terminal: ${containerStatus}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${assetId}] ig container poll failed:`, message);
    await markQueueError(`poll: ${message}`);
    return json({ ok: false, error: message, phase: "poll" }, 200);
  }

  if (containerStatus === "TIMEOUT") {
    // The container is still IN_PROGRESS. Mark the queue row pending
    // so a future tick can finalize it (cockpit "retry" button or
    // dedicated finalizer cron). Returning OK because the upload
    // itself is in flight at IG — not a failure, just incomplete.
    await admin.from("posts_queue").update({
      status: "publishing",
      error: "container still IN_PROGRESS after 2 min — will retry",
      updated_at: new Date().toISOString(),
    }).eq("id", queueId!);
    return json({
      ok: true,
      asset_id: assetId,
      creation_id: creationId,
      status: "pending_publish",
      message:
        "Container still processing after 120s — retry publish-instagram " +
        "for this asset to finalize",
    });
  }

  if (containerStatus !== "FINISHED") {
    const failMsg = `ig container ${containerStatus}: ${
      JSON.stringify(containerRaw).slice(0, 600)
    }`;
    await markQueueError(failMsg);
    return json({ ok: false, error: failMsg, phase: "container_status" }, 200);
  }

  // ---- Step 3: publish + reconcile (synchronous) ---------------
  try {
    const mediaId = await publishContainer(igUserId, igGraphToken, creationId);
    console.log(`[${assetId}] ig published, media_id=${mediaId}`);
    const permalink = await fetchPermalink(mediaId, igGraphToken);
    const nowIso = new Date().toISOString();

    await admin.from("posts_queue").update({
      status: "posted",
      external_post_id: mediaId,
      external_url: permalink,
      posted_at: nowIso,
      updated_at: nowIso,
      error: null,
    }).eq("id", queueId!);

    await admin.from("assets").update({
      media: {
        ...(asset.media ?? {}),
        instagram_media_id: mediaId,
        instagram_url: permalink,
      },
    }).eq("id", assetId);

    return json({
      ok: true,
      asset_id: assetId,
      media_id: mediaId,
      instagram_url: permalink,
      status: "posted",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${assetId}] ig publish call failed:`, message);
    await markQueueError(`publish: ${message}`);
    return json({ ok: false, error: message, phase: "publish" }, 200);
  }
});
