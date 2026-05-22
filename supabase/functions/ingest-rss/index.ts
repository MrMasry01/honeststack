// ============================================================
// HonestStack — Scenario B: ingest-rss edge function
// ------------------------------------------------------------
// Fetches recent articles from football RSS/Atom feeds,
// dedups them, and bulk-upserts into public.raw_sources
// (service role -> bypasses RLS).
//
// Invoked by a thin Make.com scenario (scheduler -> HTTP POST).
//
// Auth:  header `x-ingest-secret` must equal env INGEST_SECRET.
// Env (auto-injected by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env (set as secrets):            INGEST_SECRET
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseFeed } from "https://deno.land/x/rss/mod.ts";

// ---- constants ---------------------------------------------
const OWNER_ID = "e7564e43-6b02-4c40-9ecf-1c65fffafe9a";

const FALLBACK_FEEDS = [
  { label: "BBC Sport Football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
  { label: "Guardian Football", url: "https://www.theguardian.com/football/rss" },
  { label: "ESPN Soccer", url: "https://www.espn.com/espn/rss/soccer/news" },
];

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const JSON_HEADERS = { "Content-Type": "application/json" };
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---- hex SHA-1 of `label|lowercased-trimmed title` ---------
async function dedupHash(label: string, title: string): Promise<string> {
  const basis = `${label}|${title.toLowerCase().trim()}`;
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(basis),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- strip HTML tags from a string -------------------------
function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---- row type ----------------------------------------------
type RawRow = {
  owner_id: string;
  source_type: "rss";
  source_handle: string;
  external_id: string | null;
  url: string | null;
  author: string | null;
  content: string | null;
  media_urls: string[];
  dedup_hash: string;
};

// ---- fetch and parse one feed, return rows -----------------
async function processFeed(
  feedLabel: string,
  feedUrl: string,
): Promise<{ rows: RawRow[]; scraped: number }> {
  const rows: RawRow[] = [];
  const cutoff = Date.now() - TWENTY_FOUR_HOURS_MS;

  let xmlText: string;
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`Feed ${feedUrl} responded ${res.status}`);
      return { rows: [], scraped: 0 };
    }
    xmlText = await res.text();
  } catch (err) {
    console.warn(`Feed ${feedUrl} fetch error:`, err);
    return { rows: [], scraped: 0 };
  }

  let feed: ReturnType<typeof parseFeed> extends Promise<infer T> ? T : never;
  try {
    feed = await parseFeed(xmlText);
  } catch (err) {
    console.warn(`Feed ${feedUrl} parse error:`, err);
    return { rows: [], scraped: 0 };
  }

  const entries = feed.entries ?? [];
  const feedTitle = feed.title?.value ?? feedLabel;

  for (const entry of entries) {
    // ---- date filter (include if no date) -------------------
    const pubDate: Date | undefined =
      entry.published ?? entry.updated ?? undefined;
    if (pubDate && pubDate.getTime() < cutoff) continue;

    // ---- title + description --------------------------------
    const titleRaw = entry.title?.value ?? "";
    const descRaw =
      entry.description?.value ??
      (entry as Record<string, unknown>).summary?.toString() ??
      "";
    const title = stripHtml(titleRaw);
    const desc = stripHtml(descRaw);
    if (!title) continue; // skip entirely empty items

    const content = desc ? `${title} — ${desc}` : title;

    // ---- guid / link ----------------------------------------
    const guid: string | null =
      (typeof entry.id === "string" && entry.id) || null;
    const link: string | null = (() => {
      if (Array.isArray(entry.links) && entry.links.length > 0) {
        const href = (entry.links[0] as Record<string, unknown>).href;
        if (typeof href === "string") return href;
      }
      return null;
    })();
    const externalId = guid ?? link;

    // ---- author ---------------------------------------------
    const author: string | null = (() => {
      const a = entry.authors?.[0];
      if (a && typeof (a as Record<string, unknown>).name === "string")
        return (a as Record<string, unknown>).name as string;
      return null;
    })();

    // ---- media URLs (enclosures + media:content) -------------
    const mediaUrls: string[] = [];
    const enclosures = (entry as Record<string, unknown>).enclosures;
    if (Array.isArray(enclosures)) {
      for (const enc of enclosures) {
        const e = enc as Record<string, unknown>;
        const mtype = String(e.type ?? "").toLowerCase();
        if (mtype.startsWith("image/")) {
          const u = e.url ?? e.href;
          if (typeof u === "string") mediaUrls.push(u);
        }
      }
    }
    // media:content is often exposed as entry["media:content"] or entry.mediaContent
    const mediaContent =
      (entry as Record<string, unknown>)["media:content"] ??
      (entry as Record<string, unknown>).mediaContent;
    if (mediaContent) {
      const items = Array.isArray(mediaContent) ? mediaContent : [mediaContent];
      for (const mc of items) {
        const m = mc as Record<string, unknown>;
        const mtype = String(m.type ?? m.medium ?? "").toLowerCase();
        if (mtype.startsWith("image") || mtype === "image") {
          const u = m.url ?? m.href;
          if (typeof u === "string") mediaUrls.push(u);
        }
      }
    }

    const hash = await dedupHash(feedLabel, title);

    rows.push({
      owner_id: OWNER_ID,
      source_type: "rss",
      source_handle: feedLabel,
      external_id: externalId,
      url: link,
      author: author ?? feedTitle,
      content,
      media_urls: mediaUrls,
      dedup_hash: hash,
    });
  }

  return { rows, scraped: entries.length };
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

    // ---- 3. resolve target feeds ---------------------------
    const { data: targets, error: targetErr } = await supabase
      .from("target_accounts")
      .select("handle, label")
      .eq("owner_id", OWNER_ID)
      .eq("platform", "rss")
      .eq("active", true);
    if (targetErr) throw new Error(`target_accounts query: ${targetErr.message}`);

    let feeds: { label: string; url: string }[] = (targets ?? [])
      .map((r: { handle: string; label: string }) => ({
        label: r.label ?? r.handle,
        url: r.handle,
      }))
      .filter((f: { url: string }) => f.url && f.url.startsWith("http"));

    if (feeds.length === 0) feeds = [...FALLBACK_FEEDS];

    // ---- 4. process all feeds in parallel ------------------
    const results = await Promise.all(
      feeds.map((f) => processFeed(f.label, f.url)),
    );

    // ---- 5. de-dup within this batch -----------------------
    const allRows: RawRow[] = [];
    const seen = new Set<string>();
    let totalScraped = 0;
    for (const { rows, scraped } of results) {
      totalScraped += scraped;
      for (const row of rows) {
        if (seen.has(row.dedup_hash)) continue;
        seen.add(row.dedup_hash);
        allRows.push(row);
      }
    }

    // ---- 6. bulk upsert ------------------------------------
    let inserted = 0;
    if (allRows.length > 0) {
      const { data: upserted, error: upsertErr } = await supabase
        .from("raw_sources")
        .upsert(allRows, {
          onConflict: "owner_id,dedup_hash",
          ignoreDuplicates: true,
        })
        .select("id");
      if (upsertErr) throw new Error(`raw_sources upsert: ${upsertErr.message}`);
      inserted = upserted?.length ?? 0;
    }

    return jsonResponse({
      ok: true,
      feeds: feeds.length,
      scraped: totalScraped,
      inserted,
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
