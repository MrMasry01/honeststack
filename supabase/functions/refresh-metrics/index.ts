// ============================================================
// HonestStack — refresh-metrics edge function
// ------------------------------------------------------------
// Polls each posted posts_queue row for engagement metrics from
// its source platform and upserts the latest snapshot into the
// post_metrics table. Cockpit Overview reads from post_metrics.
//
// Platforms:
//   - YouTube     — videos.list ?part=statistics → viewCount,
//                   likeCount, commentCount. Read with a plain API key
//                   (YT_API_KEY) — statistics are public, and the OAuth
//                   upload token lacks read scope (403 insufficient scopes).
//   - Instagram   — media node fields: like_count, comments_count,
//                   plays (for Reels), reach. Full coverage via
//                   Graph API token.
//   - TikTok      — INBOX flow posts are private drafts that the
//                   user manually publishes from the TikTok app.
//                   The Display API (video.list scope) is not
//                   available to inbox-only apps, so we cannot read
//                   metrics. Skipped gracefully — TikTok analytics
//                   will need to be checked manually in TikTok app
//                   for now.
//
// One row per (post_id) in post_metrics, upserted each refresh.
// measured_at = now() on every write. Old rows are not kept (we
// only care about LATEST per post for the totals).
//
// Auth: x-ingest-secret header.
// Env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env (secrets): INGEST_SECRET, IG_GRAPH_TOKEN, YT_API_KEY
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const OWNER_ID = "e7564e43-6b02-4c40-9ecf-1c65fffafe9a";
const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type PostRow = {
  id: string;
  asset_id: string | null;
  platform: string;
  external_post_id: string | null;
  external_url: string | null;
};

type Metrics = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

const ZERO_METRICS: Metrics = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
};

// ──────────────────────────────────────────────────────────────
// YouTube — videos.list?part=statistics
// ──────────────────────────────────────────────────────────────
async function fetchYouTubeMetrics(
  apiKey: string,
  videoIds: string[],
): Promise<{ map: Map<string, Metrics>; diag: Record<string, unknown> }> {
  const out = new Map<string, Metrics>();
  const diag: Record<string, unknown> = { chunks: [], total_items: 0 };
  if (videoIds.length === 0) return { map: out, diag };

  // YouTube allows comma-joined ids, up to 50 at a time.
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    // videos.list?part=statistics is PUBLIC data — read it with a plain
    // API key. (The OAuth refresh token we use to upload only carries the
    // youtube.upload scope, so it 403s "insufficient scopes" on reads.)
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${
      chunk.join(",")
    }&key=${apiKey}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`YT metrics ${res.status} for ${chunk.length} ids: ${body.slice(0, 300)}`);
      (diag.chunks as unknown[]).push({
        status: res.status,
        ids: chunk.length,
        error: body.slice(0, 300),
      });
      continue;
    }
    const data = await res.json();
    const items = data.items ?? [];
    (diag.chunks as unknown[]).push({ status: 200, ids: chunk.length, returned: items.length });
    diag.total_items = (diag.total_items as number) + items.length;
    for (const item of items) {
      const s = item.statistics ?? {};
      out.set(item.id, {
        views: Number(s.viewCount ?? 0),
        likes: Number(s.likeCount ?? 0),
        comments: Number(s.commentCount ?? 0),
        shares: 0, // YouTube no longer exposes share count publicly
        saves: 0,
      });
    }
  }
  return { map: out, diag };
}

// ──────────────────────────────────────────────────────────────
// Instagram — media node fields
// IG returns metrics per media id. For Reels we want plays + likes
// + comments + shares + saves. The free tier of Graph API gives us
// like_count, comments_count, and media_insights with reach/plays
// requires the metric explicitly.
// ──────────────────────────────────────────────────────────────
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

async function fetchInstagramMetrics(
  accessToken: string,
  mediaIds: string[],
): Promise<Map<string, Metrics>> {
  const out = new Map<string, Metrics>();
  if (mediaIds.length === 0) return out;

  // Per-media: parallel calls, each is a single Graph API roundtrip.
  // IG doesn't offer a batch endpoint as cleanly as YouTube. Cap at
  // 5 concurrent so we don't trigger rate limits.
  const CONCURRENCY = 5;
  let nextIdx = 0;
  const worker = async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= mediaIds.length) return;
      const mediaId = mediaIds[i];
      try {
        // Basic fields are free; insights endpoint requires a separate
        // call with explicit metrics. Reels supports plays, reach,
        // likes, comments, shares, saved.
        const fields = "like_count,comments_count";
        const basicRes = await fetch(
          `${GRAPH_BASE}/${mediaId}?fields=${fields}&access_token=${
            encodeURIComponent(accessToken)
          }`,
          { signal: AbortSignal.timeout(15_000) },
        );
        const basic = await basicRes.json();
        if (!basicRes.ok) {
          console.error(`IG basic ${mediaId}: ${basicRes.status} ${JSON.stringify(basic).slice(0, 200)}`);
          continue;
        }

        // Insights for Reels — plays is the views equivalent.
        let views = 0;
        let shares = 0;
        let saves = 0;
        try {
          const insightsRes = await fetch(
            `${GRAPH_BASE}/${mediaId}/insights?metric=plays,shares,saved&access_token=${
              encodeURIComponent(accessToken)
            }`,
            { signal: AbortSignal.timeout(15_000) },
          );
          if (insightsRes.ok) {
            const ins = await insightsRes.json();
            for (const row of ins.data ?? []) {
              const v = row.values?.[0]?.value ?? 0;
              if (row.name === "plays") views = Number(v);
              if (row.name === "shares") shares = Number(v);
              if (row.name === "saved") saves = Number(v);
            }
          }
          // If insights fails (e.g. media too new — IG insights lag
          // 24-48h), we still keep the basic like/comment counts.
        } catch (e) {
          console.error(`IG insights ${mediaId}: ${e}`);
        }

        out.set(mediaId, {
          views,
          likes: Number(basic.like_count ?? 0),
          comments: Number(basic.comments_count ?? 0),
          shares,
          saves,
        });
      } catch (e) {
        console.error(`IG ${mediaId} threw: ${e}`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, mediaIds.length) }, worker),
  );
  return out;
}

// ──────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }
  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!ingestSecret) {
    return jsonResponse({ ok: false, error: "INGEST_SECRET not configured" }, 500);
  }
  if (req.headers.get("x-ingest-secret") !== ingestSecret) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ ok: false, error: "supabase env not configured" }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // Pull every successfully posted row from posts_queue. We refresh
    // all of them every tick — the platform APIs are fast enough that
    // even 100s of posts complete in well under the edge timeout.
    const { data: posts, error: postsErr } = await supabase
      .from("posts_queue")
      .select("id, asset_id, platform, external_post_id, external_url")
      .eq("owner_id", OWNER_ID)
      .eq("status", "posted")
      .not("external_post_id", "is", null);

    if (postsErr) throw new Error(`posts_queue query: ${postsErr.message}`);
    const rows = (posts ?? []) as PostRow[];

    const byPlatform: Record<string, PostRow[]> = {};
    for (const r of rows) {
      (byPlatform[r.platform] ??= []).push(r);
    }

    const summary: Record<string, unknown> = {
      total_posts: rows.length,
      youtube: 0,
      instagram: 0,
      tiktok: 0,
      skipped: 0,
    };

    const upserts: Array<{
      post_id: string;
      owner_id: string;
      views: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      measured_at: string;
    }> = [];

    const nowIso = new Date().toISOString();

    // ── YouTube ──
    const ytPosts = byPlatform.youtube ?? [];
    if (ytPosts.length > 0) {
      const ytApiKey = Deno.env.get("YT_API_KEY");
      if (!ytApiKey) {
        console.warn("YT_API_KEY missing — skipping YT metrics");
        summary.youtube_debug = { error: "YT_API_KEY secret not set" };
      } else {
        const videoIds = ytPosts
          .map((p) => p.external_post_id)
          .filter((v): v is string => Boolean(v));
        const { map: metrics, diag: ytDiag } = await fetchYouTubeMetrics(
          ytApiKey, videoIds,
        );
        let ytTotalViews = 0;
        let ytMatched = 0;
        for (const post of ytPosts) {
          if (!post.external_post_id) continue;
          const hit = metrics.get(post.external_post_id);
          const m = hit ?? ZERO_METRICS;
          if (hit) ytMatched += 1;
          ytTotalViews += m.views;
          upserts.push({
            post_id: post.id,
            owner_id: OWNER_ID,
            ...m,
            measured_at: nowIso,
          });
          summary.youtube = (summary.youtube as number) + 1;
        }
        summary.youtube_debug = {
          ...ytDiag,
          matched_posts: ytMatched,
          total_views_fetched: ytTotalViews,
          sample_ids: videoIds.slice(0, 3),
        };
      }
    }

    // ── Instagram ──
    const igPosts = byPlatform.instagram ?? [];
    if (igPosts.length > 0) {
      const igToken = Deno.env.get("IG_GRAPH_TOKEN");
      if (!igToken) {
        console.warn("IG_GRAPH_TOKEN missing — skipping IG metrics");
      } else {
        const mediaIds = igPosts
          .map((p) => p.external_post_id)
          .filter((v): v is string => Boolean(v));
        const metrics = await fetchInstagramMetrics(igToken, mediaIds);
        for (const post of igPosts) {
          if (!post.external_post_id) continue;
          const m = metrics.get(post.external_post_id) ?? ZERO_METRICS;
          upserts.push({
            post_id: post.id,
            owner_id: OWNER_ID,
            ...m,
            measured_at: nowIso,
          });
          summary.instagram = (summary.instagram as number) + 1;
        }
      }
    }

    // ── TikTok — skipped (inbox flow has no Display API access) ──
    const ttPosts = byPlatform.tiktok ?? [];
    summary.tiktok = ttPosts.length;
    summary.skipped = ttPosts.length;
    // Still write zero rows for TikTok posts so the cockpit has a
    // post_metrics record per post_id (sum-based queries don't need
    // joins to determine "no metrics" vs "0 metrics"). Skipping the
    // write would leave TT rows out of count totals, which is fine
    // too — opted to skip so 0s don't accumulate misleadingly.

    // Bulk upsert: post_id is the natural key (one row per post).
    if (upserts.length > 0) {
      // INSERT (append-only) — previously upserted on post_id which
      // overwrote every prior measurement. With append-only we keep a
      // full time series (one row per (post_id, measured_at) tick),
      // letting the cockpit draw view-over-time charts and answer
      // questions like "did the 18-24 primetime slot actually win?".
      // The `latest_post_metrics` view returns the most recent row per
      // post_id for cockpit totals.
      const { error: upErr } = await supabase
        .from("post_metrics")
        .insert(upserts);
      if (upErr) throw new Error(`post_metrics insert: ${upErr.message}`);
    }

    return jsonResponse({
      ok: true,
      summary,
      upserted: upserts.length,
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
