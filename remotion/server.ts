/**
 * HonestStack World Cup — always-on Remotion render service
 *
 * Endpoints:
 *   GET  /health      -> 200 { ok: true }
 *   POST /render      -> 202 { job_id }   (requires header x-render-secret)
 *   GET  /jobs/:id    -> { status, url?, error? }
 *
 * On render completion the MP4 is uploaded to the Supabase Storage bucket
 * `assets` at path videos/<job_id>.mp4 and the public URL is attached to the job.
 *
 * Environment variables:
 *   PORT                       provided by Railway
 *   RENDER_SECRET              shared secret for the /render endpoint
 *   SUPABASE_URL               https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service-role key for Storage uploads
 */

import path from "path";
import fs from "fs";
import os from "os";
import { randomUUID } from "crypto";
import express from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { NewsRoundupSchema } from "./src/schema";
import type { NewsRoundupProps } from "./src/schema";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 3000;
const RENDER_SECRET = process.env.RENDER_SECRET ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const STORAGE_BUCKET = "assets";
// Cap render/encode parallelism so the container stays within its RAM
// budget. Default is 1 (safest on small Railway plans — 2 simultaneous
// renders have OOM-killed the container in the past). Override via env if
// running on a larger plan.
const RENDER_CONCURRENCY = Number(process.env.RENDER_CONCURRENCY) || 1;

// Cloudflare R2 (zero-egress video hosting). When all R2_* vars are set, the
// finished MP4 is uploaded to R2 instead of Supabase Storage — keeping the
// videos (the dominant Supabase egress) and the 50MB free-tier upload cap out
// of the pipeline. If R2 is unset OR an R2 upload fails, we fall back to
// Supabase, so enabling/rolling back is purely an env-var change.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const R2_BUCKET = process.env.R2_BUCKET ?? "";
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
const R2_ENABLED = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE_URL,
);

if (!RENDER_SECRET) {
  console.warn("⚠️  RENDER_SECRET is not set — /render will reject all requests.");
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — uploads will fail."
  );
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

const r2 = R2_ENABLED
  ? new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      region: "auto",
      service: "s3",
    })
  : null;

// Upload a buffer to Cloudflare R2 (S3 API) and return its public URL.
// Throws on any non-2xx so the caller can fall back to Supabase.
async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (!r2) throw new Error("R2 not configured");
  const endpoint =
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
  const res = await r2.fetch(endpoint, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 PUT ${res.status}: ${detail.slice(0, 200)}`);
  }
  return `${R2_PUBLIC_BASE_URL}/${key}`;
}

// ---------------------------------------------------------------------------
// Job store (in-memory — fine for a single instance)
// ---------------------------------------------------------------------------

type JobStatus = "queued" | "rendering" | "done" | "error";

interface Job {
  id: string;
  status: JobStatus;
  url?: string;
  error?: string;
  idea_id?: string;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, Job>();

function updateJob(id: string, patch: Partial<Job>) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Finalization — when a render that carried an idea_id completes, mark the
// matching assets row done and advance the content_idea to 'scheduled'.
// ---------------------------------------------------------------------------

async function finalizeIdea(
  ideaId: string,
  jobId: string,
  videoUrl: string
): Promise<void> {
  if (!supabase) {
    console.warn(`[${jobId}] finalize skipped — Supabase client not configured`);
    return;
  }
  try {
    // Mark the rendering assets row for this idea as done.
    const { error: assetError } = await supabase
      .from("assets")
      .update({
        media: { status: "done", video_url: videoUrl, job_id: jobId },
      })
      .eq("idea_id", ideaId);
    if (assetError) {
      console.error(`[${jobId}] finalize assets update failed:`, assetError.message);
    }

    // Advance the content idea to 'scheduled' so the publish scenario picks it up.
    const { error: ideaError } = await supabase
      .from("content_ideas")
      .update({ status: "scheduled" })
      .eq("id", ideaId);
    if (ideaError) {
      console.error(`[${jobId}] finalize idea update failed:`, ideaError.message);
    }

    if (!assetError && !ideaError) {
      console.log(`[${jobId}] ✅ finalized idea ${ideaId} -> scheduled`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${jobId}] finalize error:`, message);
  }
}

// ---------------------------------------------------------------------------
// Failure handling — when a render fails, mark the matching assets row as
// 'error' so the failure is visible and the row isn't stuck at 'rendering'.
// ---------------------------------------------------------------------------

async function markAssetError(
  ideaId: string,
  jobId: string,
  errorMessage: string
): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("assets")
      .update({
        media: {
          status: "error",
          job_id: jobId,
          error: errorMessage.slice(0, 500),
        },
      })
      .eq("idea_id", ideaId);
    if (error) {
      console.error(`[${jobId}] markAssetError DB update failed:`, error.message);
    } else {
      console.log(`[${jobId}] asset for idea ${ideaId} marked error`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${jobId}] markAssetError exception:`, message);
  }
}

// ---------------------------------------------------------------------------
// Orphan sweep — on service startup, mark any assets row stuck at 'rendering'
// for >15 minutes as 'error: orphaned'. The in-memory job store doesn't
// survive container restarts (OOM-kill, redeploy, idle), so without this
// sweep, in-flight assets at the moment of restart are stuck forever.
// ---------------------------------------------------------------------------

async function sweepOrphans(): Promise<void> {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: orphans, error: queryError } = await supabase
      .from("assets")
      .select("id, idea_id, media, updated_at")
      .eq("media->>status", "rendering")
      .lt("updated_at", cutoff);
    if (queryError) {
      console.error("orphan sweep query failed:", queryError.message);
      return;
    }
    if (!orphans || orphans.length === 0) {
      console.log("orphan sweep: no stuck 'rendering' assets");
      return;
    }
    console.log(
      `orphan sweep: marking ${orphans.length} stuck 'rendering' asset(s) as error`
    );
    for (const o of orphans) {
      const jobId = (o.media as { job_id?: string })?.job_id ?? "unknown";
      const { error: updateError } = await supabase
        .from("assets")
        .update({
          media: {
            status: "error",
            job_id: jobId,
            error: "orphaned (Remotion service restarted mid-render)",
          },
        })
        .eq("id", o.id);
      if (updateError) {
        console.error(
          `orphan sweep update failed for asset ${o.id}:`,
          updateError.message
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("orphan sweep exception:", message);
  }
}

// ---------------------------------------------------------------------------
// Remotion bundle — built once, lazily, and reused across renders
// ---------------------------------------------------------------------------

let bundlePromise: Promise<string> | null = null;

function getBundle(): Promise<string> {
  if (!bundlePromise) {
    console.log("🎬 Bundling Remotion project (one-time)...");
    bundlePromise = bundle({
      entryPoint: path.resolve(__dirname, "src/index.ts"),
      webpackOverride: (config) => config,
    }).then((loc) => {
      console.log("✅ Bundle ready:", loc);
      return loc;
    });
  }
  return bundlePromise;
}

// ---------------------------------------------------------------------------
// Render + upload pipeline
// ---------------------------------------------------------------------------

async function runRender(jobId: string, inputProps: NewsRoundupProps) {
  const outputPath = path.join(os.tmpdir(), `${jobId}.mp4`);
  // Capture idea_id eagerly so the catch can always reach it, even if the
  // jobs Map gets cleared / clobbered by some other code path.
  const ideaIdEager = jobs.get(jobId)?.idea_id;

  try {
    const bundleLocation = await getBundle();

    updateJob(jobId, { status: "rendering" });
    console.log(`[${jobId}] selecting composition NewsRoundup`);

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "NewsRoundup",
      inputProps,
    });

    console.log(
      `[${jobId}] rendering ${composition.durationInFrames} frames @ ${composition.fps}fps`
    );

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      // Keep peak memory low — Railway containers are RAM-constrained and
      // an unbounded encode (libx264 auto-detects ~60 threads) gets
      // OOM-killed (SIGKILL). Cap render concurrency, use a lighter x264
      // preset, and force a small encoder thread count.
      concurrency: RENDER_CONCURRENCY,
      x264Preset: "fast",
      // CRF 25 is the sweet spot for vertical short-form social video —
      // visually indistinguishable from CRF 18 default, but cuts file size
      // roughly in half. A 6-segment render that hits ~55 MB at CRF 18
      // (over the Supabase 50 MB single-request upload limit) lands at
      // ~22 MB at CRF 25 with no perceptible quality loss on phone screens.
      crf: 25,
      ffmpegOverride: ({ args }) => {
        // Cap libx264 encoder threads so it does not spawn dozens of
        // memory-hungry threads. As an output option, "-threads N" must
        // sit immediately before the output filename (the final arg);
        // Remotion's args array does NOT include the ffmpeg binary.
        if (args.length === 0) return args;
        const head = args.slice(0, -1);
        const outputFile = args[args.length - 1];
        return [...head, "-threads", "2", outputFile];
      },
      onProgress: ({ renderedFrames }) => {
        if (renderedFrames % 60 === 0) {
          console.log(
            `[${jobId}] ${renderedFrames}/${composition.durationInFrames} frames`
          );
        }
      },
      chromiumOptions: {
        gl: "angle",
      },
    });

    // Log render output size so size-related upload failures are obvious
    // in the Railway logs without guessing.
    const fileStat = fs.statSync(outputPath);
    const sizeMB = (fileStat.size / 1024 / 1024).toFixed(1);
    console.log(`[${jobId}] render complete — ${sizeMB} MB — uploading (${R2_ENABLED ? "R2" : "Supabase"})`);

    const storagePath = `videos/${jobId}.mp4`;
    const fileBuffer = fs.readFileSync(outputPath);

    // Prefer R2 (zero-egress, no 50MB cap). On any R2 failure, fall back to
    // Supabase so a finished render is never lost during the migration.
    let publicUrl = "";
    if (R2_ENABLED) {
      try {
        publicUrl = await uploadToR2(storagePath, fileBuffer, "video/mp4");
        console.log(`[${jobId}] uploaded to R2 — ${publicUrl}`);
      } catch (r2Err) {
        console.error(
          `[${jobId}] R2 upload failed, falling back to Supabase:`,
          r2Err instanceof Error ? r2Err.message : String(r2Err),
        );
      }
    }

    if (!publicUrl) {
      if (!supabase) {
        throw new Error("No upload target: R2 not configured and Supabase client missing");
      }
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: "video/mp4",
          upsert: true,
        });
      if (uploadError) {
        // Make the size-limit failure mode unambiguous in the message that
        // gets written to the assets row (instead of just "exceeded max size").
        const sizeNote = fileStat.size > 50 * 1024 * 1024
          ? ` (rendered ${sizeMB} MB > Supabase 50 MB free-tier upload limit — raise CRF, or set R2_* env vars to host video on R2)`
          : "";
        throw new Error(`Supabase upload failed: ${uploadError.message}${sizeNote}`);
      }
      publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
    }

    updateJob(jobId, { status: "done", url: publicUrl });
    console.log(`[${jobId}] ✅ done — ${publicUrl}`);

    // If this render carried an idea_id, mark the asset done and the
    // content idea scheduled. Failures here do not fail the render.
    const ideaId = jobs.get(jobId)?.idea_id;
    if (ideaId) {
      await finalizeIdea(ideaId, jobId, publicUrl);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${jobId}] ❌ render failed:`, message);
    updateJob(jobId, { status: "error", error: message });
    // Write the failure back to the assets row — without this, a failed
    // render leaves the asset stuck at 'rendering' forever (silent failure).
    // Use the eagerly-captured ideaIdEager so this still works even if
    // the jobs Map entry was wiped (which it isn't currently, but defends
    // against future regressions and OOM-related state loss).
    const ideaId = ideaIdEager ?? jobs.get(jobId)?.idea_id;
    if (ideaId) {
      console.log(`[${jobId}] writing failure back to asset for idea ${ideaId}`);
      await markAssetError(ideaId, jobId, message);
    } else {
      console.warn(`[${jobId}] no idea_id captured — asset will NOT be marked error (orphan sweep on next restart will catch it)`);
    }
  } finally {
    // Clean up the temp file regardless of outcome.
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.post("/render", (req: Request, res: Response) => {
  // Auth
  const provided = req.header("x-render-secret");
  if (!RENDER_SECRET || provided !== RENDER_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // Validate body against the Remotion props schema
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { idea_id, ...propsCandidate } = body;
  const parsed = NewsRoundupSchema.safeParse(propsCandidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid props",
      details: parsed.error.format(),
    });
  }

  // Register the job and kick off the render asynchronously
  const jobId = randomUUID();
  const now = Date.now();
  jobs.set(jobId, {
    id: jobId,
    status: "queued",
    idea_id: typeof idea_id === "string" ? idea_id : undefined,
    createdAt: now,
    updatedAt: now,
  });

  // Fire and forget — runRender handles its own errors.
  void runRender(jobId, parsed.data);

  return res.status(202).json({ job_id: jobId });
});

app.get("/jobs/:id", (req: Request, res: Response) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "job not found" });
  }
  return res.status(200).json({
    status: job.status,
    ...(job.url ? { url: job.url } : {}),
    ...(job.error ? { error: job.error } : {}),
  });
});

app.listen(PORT, () => {
  console.log(`🚀 HonestStack render service listening on :${PORT}`);
  // Recover any orphaned 'rendering' assets from before this restart.
  sweepOrphans().catch((err) => console.error("orphan sweep error:", err));
  // Warm the bundle in the background so the first render is faster.
  getBundle().catch((err) => {
    console.error("Initial bundle failed:", err);
  });
});
