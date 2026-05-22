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
// budget. Overridable via env if a larger Railway plan is provisioned.
const RENDER_CONCURRENCY = Number(process.env.RENDER_CONCURRENCY) || 2;

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

    console.log(`[${jobId}] render complete — uploading to Supabase`);

    if (!supabase) {
      throw new Error("Supabase client not configured (missing env vars)");
    }

    const storagePath = `videos/${jobId}.mp4`;
    const fileBuffer = fs.readFileSync(outputPath);

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;

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
  // Warm the bundle in the background so the first render is faster.
  getBundle().catch((err) => {
    console.error("Initial bundle failed:", err);
  });
});
