// ============================================================
// HonestStack — Scenario A: ingest-twitter edge function
// ------------------------------------------------------------
// Pulls recent tweets from football-journalist handles via the
// TwitterAPI.io API, dedups them, and bulk-upserts them into
// public.raw_sources (service role -> bypasses RLS).
//
// Invoked by a thin Make.com scenario (scheduler -> HTTP POST).
//
// Auth:  header `x-ingest-secret` must equal env INGEST_SECRET.
// Env (auto-injected by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env (set as secrets):            TWITTERAPI_KEY, INGEST_SECRET
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

// ---- constants ---------------------------------------------
const OWNER_ID = "e7564e43-6b02-4c40-9ecf-1c65fffafe9a";
const FALLBACK_HANDLES = ["FabrizioRomano", "David_Ornstein"];
const MAX_PER_HANDLE = 25;

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---- dedup hash: hex SHA-1 of `handle|lowercased-trimmed text`
async function dedupHash(handle: string, text: string): Promise<string> {
  const basis = `${handle}|${text.toLowerCase().trim()}`;
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(basis),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- normalise one TwitterAPI.io tweet ---------------------
// TwitterAPI.io tweet shape:
//   id / url / twitterUrl / text / createdAt / lang / isReply / type
//   author: { userName, name, ... }
//   extendedEntities.media[] / entities.media[]  (type: "photo"|"video"|...)
type RawRow = {
  owner_id: string;
  source_type: "twitter";
  source_handle: string;
  external_id: string | null;
  url: string | null;
  author: string | null;
  content: string | null;
  media_urls: string[];
  dedup_hash: string;
};

/**
 * Extract ALL media URLs from a tweet — images AND videos. Both kinds are
 * stored in the same `media_urls` text[] column; downstream consumers
 * detect type by URL extension (.mp4/.mov/.webm → video, otherwise image).
 *
 * For videos, picks the highest-bitrate MP4 variant from video_info.variants
 * — that's the master/source quality, suitable for re-encode into our render.
 * Animated GIFs are also captured (they come through Twitter's video pipeline
 * as MP4s and look great as short looping backdrops).
 */
function extractMediaUrls(item: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  const mediaArrays: unknown[] = [];
  const ext = item.extendedEntities as Record<string, unknown> | undefined;
  const ent = item.entities as Record<string, unknown> | undefined;
  if (ext && Array.isArray(ext.media)) mediaArrays.push(...ext.media);
  if (ent && Array.isArray(ent.media)) mediaArrays.push(...ent.media);
  // Some builds expose a flat `media` array.
  if (Array.isArray(item.media)) mediaArrays.push(...(item.media as unknown[]));

  for (const m of mediaArrays) {
    if (!m || typeof m !== "object") continue;
    const media = m as Record<string, unknown>;
    const type = String(media.type ?? "").toLowerCase();

    if (type === "video" || type === "animated_gif") {
      // Pull the highest-bitrate MP4 variant from video_info.variants.
      const videoInfo = media.video_info as Record<string, unknown> | undefined;
      const variants = videoInfo?.variants as
        | Array<Record<string, unknown>>
        | undefined;
      if (Array.isArray(variants)) {
        const mp4Variants = variants
          .filter(
            (v) =>
              v.content_type === "video/mp4" && typeof v.url === "string",
          )
          .map((v) => ({
            bitrate: Number(v.bitrate) || 0,
            url: v.url as string,
          }))
          .sort((a, b) => b.bitrate - a.bitrate);
        if (mp4Variants.length > 0) {
          urls.add(mp4Variants[0].url);
        }
      }
      continue;
    }

    // Images / photos (default behaviour). Empty type is treated as image
    // because some upstream payloads omit it for plain photo attachments.
    if (type === "" || type === "photo" || type === "image") {
      const u = media.media_url_https ?? media.media_url ?? media.url;
      if (typeof u === "string" && u.startsWith("http")) urls.add(u);
    }
  }
  return [...urls];
}

async function toRow(
  item: Record<string, unknown>,
  fallbackHandle: string,
): Promise<RawRow | null> {
  // text
  const content =
    (typeof item.fullText === "string" && item.fullText) ||
    (typeof item.text === "string" && item.text) ||
    (typeof item.full_text === "string" && item.full_text) ||
    null;
  if (!content) return null; // skip items with no usable text

  // handle / author
  const author = item.author as Record<string, unknown> | undefined;
  const handle =
    (author && typeof author.userName === "string" && author.userName) ||
    (author && typeof author.screen_name === "string" && author.screen_name) ||
    (typeof item.username === "string" && item.username) ||
    fallbackHandle;

  // external id
  const externalId =
    (typeof item.id === "string" && item.id) ||
    (typeof item.id_str === "string" && item.id_str) ||
    (typeof item.tweetId === "string" && item.tweetId) ||
    null;

  // url
  const url =
    (typeof item.url === "string" && item.url) ||
    (typeof item.twitterUrl === "string" && item.twitterUrl) ||
    (externalId ? `https://twitter.com/${handle}/status/${externalId}` : null);

  return {
    owner_id: OWNER_ID,
    source_type: "twitter",
    source_handle: handle,
    external_id: externalId,
    url,
    author: handle,
    content,
    media_urls: extractMediaUrls(item),
    dedup_hash: await dedupHash(handle, content),
  };
}

// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }

  // ---- 1. auth gate ----------------------------------------
  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!ingestSecret) {
    return jsonResponse({ ok: false, error: "INGEST_SECRET not configured" }, 500);
  }
  if (req.headers.get("x-ingest-secret") !== ingestSecret) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    // ---- 2. supabase client (service role) -----------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(
        { ok: false, error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
        500,
      );
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- 3. resolve target handles -------------------------
    const { data: targets, error: targetErr } = await supabase
      .from("target_accounts")
      .select("handle")
      .eq("owner_id", OWNER_ID)
      .eq("platform", "twitter")
      .eq("active", true);
    if (targetErr) throw new Error(`target_accounts query: ${targetErr.message}`);

    let handles = (targets ?? [])
      .map((r: { handle: string }) => String(r.handle).replace(/^@/, "").trim())
      .filter((h: string) => h.length > 0);
    if (handles.length === 0) handles = [...FALLBACK_HANDLES];

    // ---- 4. pull tweets from TwitterAPI.io -----------------
    const twitterApiKey = Deno.env.get("TWITTERAPI_KEY");
    if (!twitterApiKey) {
      return jsonResponse({ ok: false, error: "TWITTERAPI_KEY not configured" }, 500);
    }

    const realItems: Record<string, unknown>[] = [];
    const handleErrors: Record<string, string> = {};

    for (const handle of handles) {
      try {
        const res = await fetch(
          "https://api.twitterapi.io/twitter/user/last_tweets" +
            `?userName=${encodeURIComponent(handle)}`,
          { headers: { "X-API-Key": twitterApiKey } },
        );
        if (!res.ok) {
          handleErrors[handle] = `http ${res.status}`;
          continue;
        }
        const payload = await res.json();
        if (payload?.status !== "success") {
          handleErrors[handle] = String(payload?.msg ?? "non-success");
          continue;
        }
        const tweets = payload?.data?.tweets;
        if (!Array.isArray(tweets)) continue;
        let kept = 0;
        for (const t of tweets) {
          if (kept >= MAX_PER_HANDLE) break;
          if (!t || typeof t !== "object") continue;
          const tw = t as Record<string, unknown>;
          // keep standalone posts — skip replies and retweets
          if (tw.isReply === true) continue;
          if (tw.type && tw.type !== "tweet") continue;
          realItems.push(tw);
          kept++;
        }
      } catch (e) {
        handleErrors[handle] = e instanceof Error ? e.message : String(e);
      }
    }

    if (realItems.length === 0) {
      return jsonResponse(
        { ok: false, error: "no tweets returned", handles, handleErrors },
        502,
      );
    }

    // ---- 5. build rows -------------------------------------
    const rows: RawRow[] = [];
    const seen = new Set<string>();
    for (const item of realItems) {
      const row = await toRow(item, handles[0]);
      if (!row) continue;
      // de-dup within this batch (upsert onConflict only handles cross-batch)
      if (seen.has(row.dedup_hash)) continue;
      seen.add(row.dedup_hash);
      rows.push(row);
    }

    // ---- 6. bulk upsert ------------------------------------
    let inserted = 0;
    if (rows.length > 0) {
      const { data: upserted, error: upsertErr } = await supabase
        .from("raw_sources")
        .upsert(rows, {
          onConflict: "owner_id,dedup_hash",
          ignoreDuplicates: true,
        })
        .select("id");
      if (upsertErr) throw new Error(`raw_sources upsert: ${upsertErr.message}`);
      inserted = upserted?.length ?? 0;
    }

    return jsonResponse({
      ok: true,
      scraped: realItems.length,
      inserted,
      handles,
      handleErrors,
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
