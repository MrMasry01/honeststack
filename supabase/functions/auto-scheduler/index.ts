// ============================================================
// HonestStack — auto-scheduler
// ------------------------------------------------------------
// Runs every few minutes via pg_cron. Drives the whole engine
// from one place, idempotent so it can be safely re-fired:
//
//   1. RENDER: if there is a 'ready' content_idea that doesn't
//      have a 'done' asset yet, trigger render-shortform.
//      render-shortform's own concurrent-render guard catches
//      the race when a render is already in flight.
//
//   2. PUBLISH YOUTUBE: if there is a 'done' asset that has no
//      posts_queue row for platform='youtube', trigger
//      publish-youtube for it. YouTube uses a single channel-
//      level refresh token, so no per-owner social_accounts
//      lookup is needed.
//
//   3. PUBLISH TIKTOK: same, for platform='tiktok' — but only
//      if the asset's owner has a row in social_accounts for
//      tiktok (i.e. they connected from the cockpit).
//
// We fire AT MOST ONE of each per tick, so a backlog drains
// gradually and we never burst against any single API.
//
// Auth: header `x-ingest-secret` must equal env INGEST_SECRET.
//       Same scheme as every other server-side function.
//
// Env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env (secrets): INGEST_SECRET
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const OWNER_ID = "e7564e43-6b02-4c40-9ecf-1c65fffafe9a";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type AssetRow = {
  id: string;
  owner_id: string;
  idea_id: string | null;
  media: { status?: string; video_url?: string } | null;
};

async function fireEdgeFunction(
  baseUrl: string,
  name: string,
  ingestSecret: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-secret": ingestSecret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = await res.text().catch(() => null);
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!ingestSecret) {
    return json({ ok: false, error: "INGEST_SECRET not configured" }, 500);
  }
  if (req.headers.get("x-ingest-secret") !== ingestSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "supabase env not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary: Record<string, unknown> = {
    render: null,
    youtube: null,
    tiktok: null,
  };

  // ---- 1. RENDER ---------------------------------------------
  // Look for a ready idea that doesn't yet have a 'done' asset.
  // We just count candidates here — render-shortform's own picker
  // (without idea_id) selects the newest and applies its own
  // concurrent-render guard. We fire only if at least one exists.
  try {
    const { data: candidates } = await supabase
      .from("content_ideas")
      .select("id")
      .eq("owner_id", OWNER_ID)
      .eq("status", "ready")
      .not("script_segments", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    let needsRender = false;
    for (const c of candidates ?? []) {
      const { data: existing } = await supabase
        .from("assets")
        .select("id, media")
        .eq("idea_id", c.id)
        .eq("owner_id", OWNER_ID);
      const done = (existing ?? []).some(
        (a: { media: { status?: string } | null }) =>
          a.media?.status === "done",
      );
      if (!done) {
        needsRender = true;
        break;
      }
    }

    if (needsRender) {
      const r = await fireEdgeFunction(
        supabaseUrl,
        "render-shortform",
        ingestSecret,
        {},
      );
      summary.render = { fired: true, ...r };
    } else {
      summary.render = { fired: false, reason: "no ready ideas without done assets" };
    }
  } catch (err) {
    summary.render = {
      fired: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ---- 2. PUBLISH YOUTUBE -----------------------------------
  // Pick the OLDEST done asset that has no youtube posts_queue
  // entry. Oldest-first so a backlog drains FIFO and the latest
  // render isn't always jumping the queue.
  try {
    const { data: doneAssets } = await supabase
      .from("assets")
      .select("id, owner_id, idea_id, media, created_at")
      .eq("owner_id", OWNER_ID)
      .order("created_at", { ascending: true })
      .limit(50);

    const ytTarget = await pickUnpublished(
      supabase,
      (doneAssets ?? []) as AssetRow[],
      "youtube",
    );

    if (ytTarget) {
      const r = await fireEdgeFunction(
        supabaseUrl,
        "publish-youtube",
        ingestSecret,
        { asset_id: ytTarget.id, owner_id: OWNER_ID },
      );
      summary.youtube = { fired: true, asset_id: ytTarget.id, ...r };
    } else {
      summary.youtube = { fired: false, reason: "no done assets needing youtube" };
    }
  } catch (err) {
    summary.youtube = {
      fired: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ---- 3. PUBLISH TIKTOK ------------------------------------
  // Same pattern, but only fires if the owner has a connected
  // TikTok account (social_accounts row).
  try {
    const { data: tiktokAccount } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("owner_id", OWNER_ID)
      .eq("platform", "tiktok")
      .maybeSingle();

    if (!tiktokAccount) {
      summary.tiktok = { fired: false, reason: "no tiktok account connected" };
    } else {
      const { data: doneAssets } = await supabase
        .from("assets")
        .select("id, owner_id, idea_id, media, created_at")
        .eq("owner_id", OWNER_ID)
        .order("created_at", { ascending: true })
        .limit(50);

      const tkTarget = await pickUnpublished(
        supabase,
        (doneAssets ?? []) as AssetRow[],
        "tiktok",
      );

      if (tkTarget) {
        const r = await fireEdgeFunction(
          supabaseUrl,
          "publish-tiktok",
          ingestSecret,
          { asset_id: tkTarget.id, owner_id: OWNER_ID },
        );
        summary.tiktok = { fired: true, asset_id: tkTarget.id, ...r };
      } else {
        summary.tiktok = { fired: false, reason: "no done assets needing tiktok" };
      }
    }
  } catch (err) {
    summary.tiktok = {
      fired: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return json({ ok: true, summary });
});

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

// Pick the oldest 'done' asset that has no posts_queue row for the
// given platform with a successful or in-flight status. We treat
// 'publishing' and 'posted' as "don't re-fire" — only 'failed' rows
// are eligible to retry (they go through the cockpit's retry button).
async function pickUnpublished(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  doneAssets: AssetRow[],
  platform: "youtube" | "tiktok",
): Promise<AssetRow | null> {
  for (const a of doneAssets) {
    if (a.media?.status !== "done") continue;
    if (!a.media?.video_url) continue;
    const { data: existing } = await supabase
      .from("posts_queue")
      .select("status")
      .eq("asset_id", a.id)
      .eq("platform", platform)
      .maybeSingle();
    if (!existing) {
      return a;
    }
    // Already has a queue row — skip (cockpit's retry button is
    // the explicit path for re-publishing failures).
  }
  return null;
}
