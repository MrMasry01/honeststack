// ============================================================
// HonestStack — storage-cleanup
// ------------------------------------------------------------
// Deletes stale RENDER INTERMEDIATES from the Supabase `assets`
// bucket. Once a render lands its MP4 on Cloudflare R2, the
// per-segment audio, generated images, and mirrored Twitter clips
// are no longer needed — but render-shortform keeps re-creating
// them, so they accumulate (and Remotion re-downloads them, which
// is the main remaining Supabase egress source).
//
// SAFE BY DESIGN: only ever touches the three intermediate folders
// below. Never the permanent assets (pharaoh-poses, brand, avatars,
// legal). An age filter spares anything a render might still be using.
//
// Auth: header `x-ingest-secret` must equal env INGEST_SECRET.
// Body (optional): { older_than_hours?: number (default 3),
//                    folders?: string[] (default the 3 intermediates),
//                    dry_run?: boolean }
// Env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env (secrets): INGEST_SECRET
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "assets";
const DEFAULT_FOLDERS = ["videos-mirrored", "audio", "images"];
const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type FileRow = { path: string; created_at: string; size: number };

// deno-lint-ignore no-explicit-any
async function listAllFiles(supabase: any, prefix: string): Promise<FileRow[]> {
  const out: FileRow[] = [];
  const PAGE = 100;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders come back with id===null + no metadata → recurse into them.
      if (!item.id || !item.metadata) {
        const sub = await listAllFiles(supabase, path);
        out.push(...sub);
      } else {
        out.push({
          path,
          created_at: item.created_at ?? item.updated_at ?? new Date(0).toISOString(),
          size: Number(item.metadata?.size ?? 0),
        });
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!ingestSecret) return json({ ok: false, error: "INGEST_SECRET not configured" }, 500);
  if (req.headers.get("x-ingest-secret") !== ingestSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: { older_than_hours?: unknown; folders?: unknown; dry_run?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const olderThanHours = typeof body.older_than_hours === "number" ? body.older_than_hours : 3;
  const dryRun = body.dry_run === true;
  const requested = Array.isArray(body.folders)
    ? (body.folders as unknown[]).filter((f): f is string => typeof f === "string")
    : DEFAULT_FOLDERS;
  // Hard whitelist — never let a caller delete permanent assets.
  const folders = requested.filter((f) => DEFAULT_FOLDERS.includes(f));

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "supabase env missing" }, 500);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = Date.now() - olderThanHours * 3_600_000;
  const summary: Record<string, unknown> = { dry_run: dryRun, older_than_hours: olderThanHours };
  let totalRemoved = 0;
  let totalBytes = 0;

  try {
    for (const folder of folders) {
      const files = await listAllFiles(supabase, folder);
      const stale = files.filter((f) => new Date(f.created_at).getTime() < cutoff);
      const paths = stale.map((f) => f.path);
      const bytes = stale.reduce((s, f) => s + f.size, 0);

      if (!dryRun) {
        for (let i = 0; i < paths.length; i += 100) {
          const batch = paths.slice(i, i + 100);
          const { error } = await supabase.storage.from(BUCKET).remove(batch);
          if (error) throw new Error(`remove ${folder}: ${error.message}`);
        }
      }
      summary[folder] = { found: files.length, removed: paths.length, mb: +(bytes / 1048576).toFixed(1) };
      totalRemoved += paths.length;
      totalBytes += bytes;
    }
    return json({ ok: true, total_removed: totalRemoved, total_mb: +(totalBytes / 1048576).toFixed(1), ...summary });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err), ...summary }, 500);
  }
});
