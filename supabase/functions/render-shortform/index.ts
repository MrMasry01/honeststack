// ============================================================
// HonestStack — Scenario D: render-shortform edge function
// ------------------------------------------------------------
// Turns a drafted content_idea into a finished short-form MP4.
//
// Orchestrates:
//   1. ElevenLabs TTS  -> host narration MP3 (storage assets/audio)
//   2. Per-segment backdrop visual, resolved in priority order:
//        (a) an explicit http(s) URL in the segment prompt — the editorial
//            brain puts the moment photo URL from tier-1 journalists' tweets
//            here directly (the dominant path now after the visual-priority
//            patch — see honeststack-editor/SKILL.md Step 7),
//        (b) "person:<Full Name>" -> a real Wikipedia headshot, vision-verified
//            by Gemini before use (so a Foden segment never gets Maguire's face),
//        (c) a Gemini-generated image from any other (scene) prompt,
//        (d) a Pexels stock photo as a last-resort fallback.
//      (storage assets/images)
//   3. Remotion render service -> the MP4 (fire-and-forget)
//
// The on-screen host is a FIXED Egyptian Pharaoh mascot bundled with the
// Remotion project — it is identical in every video, so this function does
// NOT generate any per-video character/avatar.
//
// Invoked by a thin Make.com scenario (scheduler -> HTTP POST)
// on a 6-hour cadence, or directly with an explicit idea_id.
//
// Auth:  header `x-ingest-secret` must equal env INGEST_SECRET.
// Env (auto-injected by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env (set as secrets):
//   INGEST_SECRET, ELEVENLABS_API_KEY, GEMINI_API_KEY, PEXELS_API_KEY,
//   REMOTION_URL, RENDER_SECRET
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

// ---- constants ---------------------------------------------
const OWNER_ID = "e7564e43-6b02-4c40-9ecf-1c65fffafe9a";
const STORAGE_BUCKET = "assets";
const ELEVENLABS_MODEL = "eleven_multilingual_v2";
// Primary image model, plus a stable fallback used when the preview model
// is rate-limited (preview models carry very tight free-tier quotas).
const GEMINI_MODELS = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];
const OUTRO_HANDLE = "@honeststack";
const HASHTAGS = ["WorldCup2026", "كأس_العالم"];

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---- types -------------------------------------------------
type ScriptSegment = {
  text?: string;              // narration — what TTS reads (full sentences)
  caption_ar?: string;        // on-screen caption — short clickbait overlay
  image_prompt?: string;
  image_prompt_or_url?: string;
  image_url?: string;
  duration_ms?: number;
  duration_hint_s?: number;
};

type Brief = {
  subject?: string;
  /** UUIDs of the raw_sources rows this idea was built from. */
  source_ids?: string[];
  [key: string]: unknown;
} | null;

type BuiltSegment = {
  text_ar: string;
  visual_url: string;
  audio_url: string;    // per-segment TTS MP3 — Remotion plays only during this scene
  duration_ms: number;  // set to actual MP3 duration so audio + visual stay synced
  ken_burns: { from: number; to: number };
};

// ---- MP3 duration ------------------------------------------
// Parses MPEG-1/2 Layer III frame headers to sum the real
// playback duration. No ffmpeg available in the Deno runtime.
const MP3_BITRATES: Record<number, number[]> = {
  // MPEG-1 Layer III
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  // MPEG-2 / 2.5 Layer III
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};
const MP3_SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000, 0], // MPEG-1
  2: [22050, 24000, 16000, 0], // MPEG-2
  0: [11025, 12000, 8000, 0], // MPEG-2.5
};

function measureMp3DurationMs(bytes: Uint8Array): number {
  let i = 0;

  // Skip an ID3v2 tag if present.
  if (
    bytes.length > 10 &&
    bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
  ) {
    const size =
      (bytes[6] & 0x7f) << 21 |
      (bytes[7] & 0x7f) << 14 |
      (bytes[8] & 0x7f) << 7 |
      (bytes[9] & 0x7f);
    i = 10 + size;
  }

  let durationSec = 0;
  let frames = 0;

  while (i + 4 <= bytes.length) {
    // Frame sync: 11 set bits.
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }

    const versionBits = (bytes[i + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerBits = (bytes[i + 1] >> 1) & 0x03; // 1 = Layer III
    if (layerBits !== 1 || versionBits === 1) {
      i++;
      continue;
    }

    const bitrateIdx = (bytes[i + 2] >> 4) & 0x0f;
    const sampleRateIdx = (bytes[i + 2] >> 2) & 0x03;
    const padding = (bytes[i + 2] >> 1) & 0x01;

    const isMpeg1 = versionBits === 3;
    const bitrate = MP3_BITRATES[isMpeg1 ? 1 : 2][bitrateIdx];
    const sampleRate = (MP3_SAMPLE_RATES[versionBits] ?? [])[sampleRateIdx];
    if (!bitrate || !sampleRate) {
      i++;
      continue;
    }

    // Samples per frame: 1152 for MPEG-1 L3, 576 for MPEG-2/2.5 L3.
    const samplesPerFrame = isMpeg1 ? 1152 : 576;
    const frameLength = Math.floor(
      (samplesPerFrame / 8 * bitrate * 1000) / sampleRate,
    ) + padding;
    if (frameLength <= 0) {
      i++;
      continue;
    }

    durationSec += samplesPerFrame / sampleRate;
    frames++;
    i += frameLength;
  }

  if (frames === 0) return 0;
  return Math.round(durationSec * 1000);
}

// ---- ElevenLabs TTS ----------------------------------------
async function generateNarration(
  voiceId: string,
  apiKey: string,
  text: string,
): Promise<Uint8Array> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: {
          // Tuned for Egyptian sports creator voice:
          //   stability 0.40 — slight drop from 0.45 lets the host get more
          //     expressive on Adib crescendos and Bassem dry-sarcasm flat-lines
          //     without losing the voice identity.
          //   similarity_boost 0.75 — keeps the custom voice clone's character.
          //   style 0.35 — adds performance energy (the "talking to camera"
          //     intonation). 0 sounds flat; >0.6 starts to over-act.
          //   use_speaker_boost — sharpens against the reference voice.
          stability: 0.40,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 300)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// ---- retry helper ------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- concurrency limiter -----------------------------------
// Caps how many Gemini image calls run at once. The per-segment image jobs
// are all dispatched together; without a cap they burst several simultaneous
// requests at the preview model and get 429'd. A small pool keeps throughput
// up while staying under the quota.
function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    active++;
    (queue.shift()!)();
  };
  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task().then(resolve, reject).finally(() => {
          active--;
          next();
        });
      });
      next();
    });
  };
}

type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

// A single limiter for the per-segment background-image jobs. There is no
// avatar pipeline any more (the host is the fixed bundled Pharaoh), so a pool
// of 2 keeps each model within its per-minute quota.
const segmentImageLimiter = createLimiter(2);

type GeminiResult =
  | { ok: true; image: Uint8Array }
  | { ok: false; status: number; detail: string };

// Runs a Gemini image call (through the given concurrency limiter) and
// retries on 429 / 5xx with exponential backoff + jitter. The preview
// image model carries tight per-minute quotas, so a handful of
// near-simultaneous calls would otherwise 429.
async function withGeminiRetry(
  label: string,
  limiter: Limiter,
  call: () => Promise<GeminiResult>,
  maxAttempts = 3,
): Promise<GeminiResult> {
  let last: GeminiResult = { ok: false, status: 0, detail: "not attempted" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await limiter(call);
    if (last.ok) return last;
    // Only 429 / 5xx are worth retrying. (A 200-with-no-image is a content
    // block — not retried here; the caller falls through to the next model.)
    const retryable = last.status === 429 || last.status >= 500;
    if (!retryable || attempt === maxAttempts) return last;
    // Short backoff — billing is enabled so hard quota 429s are rare; long
    // waits here previously overran the edge-function time budget.
    const backoff = [3000, 6000][attempt - 1] ?? 6000;
    const wait = backoff + Math.floor(Math.random() * 1500);
    console.log(
      `${label}: ${last.status} ${last.detail} — retry ` +
        `${attempt}/${maxAttempts - 1} in ${wait}ms`,
    );
    await sleep(wait);
  }
  return last;
}

// ---- Gemini image ------------------------------------------
async function callGeminiImage(
  model: string,
  styledPrompt: string,
  apiKey: string,
): Promise<GeminiResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: styledPrompt }] }],
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail: detail.slice(0, 300) };
  }

  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data;
    if (inline?.data) {
      const binary = atob(inline.data);
      const out = new Uint8Array(binary.length);
      for (let k = 0; k < binary.length; k++) out[k] = binary.charCodeAt(k);
      return { ok: true, image: out };
    }
  }
  // No image — capture any text part / finishReason so refusals are visible.
  const textPart = parts.map((p: { text?: string }) => p?.text ?? "").join(" ")
    .trim();
  const finishReason = json?.candidates?.[0]?.finishReason ?? "";
  const detail = `no image (finishReason=${finishReason || "?"})` +
    (textPart ? ` text="${textPart.slice(0, 180)}"` : "");
  return { ok: false, status: res.status, detail };
}

async function generateImage(
  prompt: string,
  apiKey: string,
): Promise<Uint8Array> {
  const styled =
    `${prompt}. Cinematic, high contrast, dramatic lighting, ` +
    `World Cup football atmosphere, 9:16 vertical composition, photorealistic.`;

  let lastErr = "";
  // Try each model in turn; each call retries on 429/5xx with backoff.
  for (const model of GEMINI_MODELS) {
    const result = await withGeminiRetry(
      `image[${model}]`,
      segmentImageLimiter,
      () => callGeminiImage(model, styled, apiKey),
    );
    if (result.ok) return result.image;
    lastErr = `${model} ${result.status}: ${result.detail}`;
    // Only fall through to the next model on retryable failures.
    if (result.status !== 429 && result.status < 500) break;
  }
  throw new Error(`Gemini image failed — ${lastErr}`);
}

// ---- Pexels fallback for segment backdrops -----------------
async function fetchPexelsPhoto(
  query: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${
        encodeURIComponent(query)
      }&orientation=portrait&per_page=1`,
      {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const photo = json?.photos?.[0];
    if (!photo) return null;
    // Prefer the tall portrait crop, fall back through the size ladder.
    return photo?.src?.portrait || photo?.src?.large2x ||
      photo?.src?.large || photo?.src?.original || null;
  } catch {
    return null;
  }
}

// ---- real photo of a named person (Wikipedia) --------------
// A segment that depicts a specific real person MUST use an accurate photo of
// THAT person — AI image models cannot render a real likeness reliably, and
// generic stock returns unrelated humans. We fetch the person's photo from
// Wikipedia (real, freely-licensed Wikimedia Commons image), then vision-check
// it. Returns null if no usable photo is found.
async function fetchWikipediaPhoto(name: string): Promise<string | null> {
  try {
    const title = encodeURIComponent(name.trim().replace(/\s+/g, "_"));
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
      {
        headers: { "User-Agent": "HonestStack/1.0 (content engine)" },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.type === "disambiguation") return null; // ambiguous name
    const img = json?.originalimage?.source || json?.thumbnail?.source;
    return typeof img === "string" && /^https?:\/\//i.test(img) ? img : null;
  } catch {
    return null;
  }
}

// Vision check: confirm the fetched photo actually shows the named person.
// Returns true if it plausibly does — or if the check itself can't run, since
// Wikipedia keyed by exact name is reliable and an unavailable check must not
// block the render. Only a clear "no" rejects the photo.
async function verifyPersonPhoto(
  imageUrl: string,
  name: string,
  apiKey: string,
): Promise<boolean> {
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!imgRes.ok) return true;
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    let bin = "";
    for (let k = 0; k < buf.length; k++) bin += String.fromCharCode(buf[k]);
    const mime = (imgRes.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Does the main person in this image appear to be the ` +
                  `footballer "${name}"? Reply with only the word yes or no.`,
              },
              { inlineData: { mimeType: mime, data: btoa(bin) } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) return true; // check unavailable — don't block
    const json = await res.json();
    const answer = (json?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p?.text ?? "").join(" ")
      .trim().toLowerCase();
    return !answer.startsWith("no");
  } catch {
    return true; // never fail the render over the verification step
  }
}

// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }

  // ---- 1. auth gate ----------------------------------------
  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!ingestSecret) {
    return jsonResponse(
      { ok: false, error: "INGEST_SECRET not configured" },
      500,
    );
  }
  if (req.headers.get("x-ingest-secret") !== ingestSecret) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    // ---- env -----------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const remotionUrl = (Deno.env.get("REMOTION_URL") ?? "").replace(/\/+$/, "");
    const renderSecret = Deno.env.get("RENDER_SECRET");

    const missing = [
      ["SUPABASE_URL", supabaseUrl],
      ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
      ["ELEVENLABS_API_KEY", elevenKey],
      ["GEMINI_API_KEY", geminiKey],
      ["REMOTION_URL", remotionUrl],
      ["RENDER_SECRET", renderSecret],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      return jsonResponse(
        { ok: false, error: `missing env: ${missing.join(", ")}` },
        500,
      );
    }

    const supabase = createClient(supabaseUrl!, serviceKey!);

    // ---- 2. pick the content idea --------------------------
    let bodyIdeaId: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.idea_id === "string" && body.idea_id) {
        bodyIdeaId = body.idea_id;
      }
    } catch {
      // empty body is fine — scheduler call
    }

    let idea: {
      id: string;
      hook: string | null;
      script_segments: ScriptSegment[] | null;
      brief: Brief;
    } | null = null;

    if (bodyIdeaId) {
      const { data, error } = await supabase
        .from("content_ideas")
        .select("id, hook, script_segments, brief")
        .eq("id", bodyIdeaId)
        .eq("owner_id", OWNER_ID)
        .maybeSingle();
      if (error) throw new Error(`content_ideas query: ${error.message}`);
      idea = data;
    } else {
      // Newest 'ready' idea with script_segments and no completed asset.
      const { data: candidates, error } = await supabase
        .from("content_ideas")
        .select("id, hook, script_segments, brief")
        .eq("owner_id", OWNER_ID)
        .eq("status", "ready")
        .not("script_segments", "is", null)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw new Error(`content_ideas query: ${error.message}`);

      for (const cand of candidates ?? []) {
        const { data: existing, error: assetErr } = await supabase
          .from("assets")
          .select("id, media")
          .eq("idea_id", cand.id)
          .eq("owner_id", OWNER_ID);
        if (assetErr) throw new Error(`assets query: ${assetErr.message}`);
        const hasDone = (existing ?? []).some(
          (a: { media: { status?: string } | null }) =>
            a.media?.status === "done",
        );
        if (!hasDone) {
          idea = cand;
          break;
        }
      }
    }

    if (!idea) {
      return jsonResponse({ ok: true, skipped: "no ready ideas" });
    }
    if (!Array.isArray(idea.script_segments) || idea.script_segments.length === 0) {
      return jsonResponse(
        { ok: true, skipped: "idea has no script_segments", idea_id: idea.id },
      );
    }

    const ideaId = idea.id;
    const hook = idea.hook ?? "أخبار كأس العالم 2026";

    // Normalise segment shape.
    //   `text`        — full narration script (TTS reads this)
    //   `caption`     — short clickbait on-screen overlay. Falls back to the
    //                   first ~6 words of `text` for backward compatibility
    //                   with older ideas that don't have caption_ar yet.
    const rawSegments = idea.script_segments.map((s) => {
      const text = (s.text ?? "").trim();
      const captionExplicit = (s.caption_ar ?? "").trim();
      const captionFallback = text.split(/\s+/).slice(0, 6).join(" ");
      return {
        text,
        caption: captionExplicit || captionFallback,
        promptOrUrl: (s.image_prompt_or_url ?? s.image_prompt ?? s.image_url ?? "")
          .trim(),
        durationMs: typeof s.duration_ms === "number"
          ? s.duration_ms
          : typeof s.duration_hint_s === "number"
          ? Math.round(s.duration_hint_s * 1000)
          : 8000,
      };
    });

    // ---- 2b. mark the assets row 'processing' ---------------
    // The full pipeline (TTS + segment images + render trigger) is heavy
    // and runs as a background task — it would exceed the request idle
    // timeout if awaited inline. We upsert a 'processing' assets row now so
    // callers have something to poll, then return 202 immediately.
    {
      const { data: priorAsset } = await supabase
        .from("assets")
        .select("id")
        .eq("idea_id", ideaId)
        .eq("owner_id", OWNER_ID)
        .limit(1)
        .maybeSingle();
      const processingRow = {
        owner_id: OWNER_ID,
        idea_id: ideaId,
        kind: "short_video",
        caption: hook,
        hashtags: HASHTAGS,
        media: { status: "processing" },
      };
      if (priorAsset?.id) {
        await supabase.from("assets").update(processingRow).eq(
          "id",
          priorAsset.id,
        );
      } else {
        await supabase.from("assets").insert(processingRow);
      }
    }

    // ---- 2c. heavy pipeline as a background task ------------
    // EdgeRuntime.waitUntil keeps the worker alive after the response is
    // sent so the long-running generation can finish.
    const pipeline = buildVideo({
      supabase,
      supabaseUrl: supabaseUrl!,
      elevenKey: elevenKey!,
      geminiKey: geminiKey!,
      remotionUrl,
      renderSecret: renderSecret!,
      ideaId,
      hook,
      brief: idea.brief,
      rawSegments,
    }).catch(async (err) => {
      // Record the failure on the assets row so callers see 'error'.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${ideaId}] pipeline failed:`, message);
      await supabase
        .from("assets")
        .update({ media: { status: "error", error: message.slice(0, 500) } })
        .eq("idea_id", ideaId)
        .eq("owner_id", OWNER_ID);
    });

    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
      edgeRuntime.waitUntil(pipeline);
    } else {
      // Local/dev fallback: no EdgeRuntime — just let it run detached.
      void pipeline;
    }

    return jsonResponse({
      ok: true,
      idea_id: ideaId,
      status: "processing",
      segments: rawSegments.length,
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

// ============================================================
// buildVideo — the heavy generation pipeline (runs in background)
//   TTS -> per-segment visuals -> Remotion render trigger
//   -> assets row updated to { status: 'rendering', job_id }
// ============================================================
interface BuildVideoArgs {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  supabaseUrl: string;
  elevenKey: string;
  geminiKey: string;
  remotionUrl: string;
  renderSecret: string;
  ideaId: string;
  hook: string;
  brief: Brief;
  rawSegments: { text: string; caption: string; promptOrUrl: string; durationMs: number }[];
}

async function buildVideo(args: BuildVideoArgs): Promise<void> {
  const {
    supabase,
    supabaseUrl,
    elevenKey,
    geminiKey,
    remotionUrl,
    renderSecret,
    ideaId,
    hook,
    brief,
    rawSegments,
  } = args;

  // ---- 3. brand settings ---------------------------------
  const { data: brand, error: brandErr } = await supabase
    .from("brand_settings")
    .select("voice_id, primary_color, accent_color, logo_url")
    .eq("owner_id", OWNER_ID)
    .maybeSingle();
  if (brandErr) throw new Error(`brand_settings query: ${brandErr.message}`);

  const voiceId = brand?.voice_id;
  if (!voiceId) {
    throw new Error("brand_settings.voice_id is not set");
  }
  const primary = brand?.primary_color || "#0E1B2C";
  const accent = brand?.accent_color || "#F4C20D";
  // Only pass a logo URL if one is actually configured. The Remotion
  // IntroCard renders a built-in "HS" monogram when this is empty;
  // a fabricated (404) URL would crash the render.
  const logoUrl = (brand?.logo_url && /^https?:\/\//i.test(brand.logo_url))
    ? brand.logo_url
    : "";

  // Validate there is something to narrate up-front.
  const anyText = rawSegments.some((s) => s.text);
  if (!anyText) {
    throw new Error("no segment text to narrate");
  }

  // ---- 4–5. generate ALL assets concurrently -------------
  // TTS and every segment visual are independent — running them strictly
  // sequentially overran the edge-function time budget. Fan them out with
  // Promise.all so wall time ≈ the slowest one. There is no avatar pipeline:
  // the host is the fixed Egyptian Pharaoh mascot bundled with Remotion.
  const pexelsKey = Deno.env.get("PEXELS_API_KEY") ?? "";

  // (a) PER-SEGMENT TTS — one ElevenLabs request per segment, parallel.
  //
  // Why per-segment vs one big request:
  //   - We get the EXACT duration of each segment's narration, so the
  //     Remotion scene length can be set to that exactly. No more
  //     "visual races ahead of narration" — audio and visual are atomically
  //     bound per scene.
  //   - Failed segments don't kill the whole TTS.
  //   - Same total characters → same total ElevenLabs cost.
  //
  // Each segment's MP3 is uploaded to its own path under audio/<idea>/<i>.mp3
  // and the per-segment audio_url is passed through to Remotion.
  //
  // CONCURRENCY: ElevenLabs Free / Creator tiers rate-limit at ~2-4
  // concurrent TTS requests per voice. Firing 7 at once returns 429. We
  // process at most TTS_CONCURRENCY in parallel — total wall time is
  // basically the same since each generation is ~5-15s and we have
  // visual jobs running on the side.
  const TTS_CONCURRENCY = 2;
  type AudioResult = { url: string; ms: number };

  const runOneSegmentAudio = async (i: number): Promise<AudioResult> => {
    const seg = rawSegments[i];
    if (!seg.text) {
      // Empty segment — emit a silent ~500ms placeholder so the scene
      // still has a non-zero duration. Should never happen for normal
      // editorial output but handles the edge case.
      return { url: "", ms: 500 };
    }
    const mp3 = await generateNarration(voiceId, elevenKey, seg.text);
    const audioPath = `audio/${ideaId}/${i}.mp3`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(audioPath, mp3, { contentType: "audio/mpeg", upsert: true });
    if (error) throw new Error(`segment ${i} audio upload: ${error.message}`);
    return {
      url: `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${audioPath}`,
      ms: measureMp3DurationMs(mp3),
    };
  };

  // Worker-pool pattern: spawn TTS_CONCURRENCY workers, each pulls the
  // next pending segment index. Total parallelism is capped.
  const audioJob = (async (): Promise<AudioResult[]> => {
    const results: AudioResult[] = new Array(rawSegments.length);
    let nextIdx = 0;
    const worker = async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= rawSegments.length) return;
        results[i] = await runOneSegmentAudio(i);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(TTS_CONCURRENCY, rawSegments.length) }, worker),
    );
    return results;
  })();

  // Per-segment diagnostics: how each backdrop was resolved.
  const visualDiag: string[] = new Array(rawSegments.length).fill("");

  // Segment visuals — one job per segment, resolved by the segment's prompt:
  //   * an explicit http(s) URL  -> used as-is
  //   * "person:<Name>"          -> a REAL Wikipedia photo of that person,
  //                                 vision-verified. AI is NEVER used to fake
  //                                 a real face; Pexels is NEVER used for a
  //                                 named person (it returns unrelated humans).
  //   * any other prompt         -> an AI-generated scene (Gemini -> Pexels)
  const SEGMENT_GEMINI_BUDGET_MS = 65_000;

  const uploadPng = async (png: Uint8Array, i: number): Promise<string> => {
    const imgPath = `images/${ideaId}/${i}.png`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(imgPath, png, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`image upload (${i}): ${error.message}`);
    return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${imgPath}`;
  };

  const visualJobs = rawSegments.map((seg, i) =>
    (async (): Promise<string> => {
      const raw = seg.promptOrUrl;

      // Explicit URL — use directly.
      if (/^https?:\/\//i.test(raw)) {
        visualDiag[i] = "explicit-url";
        return raw;
      }

      // person:<Name> — a real, verified photo of that specific person.
      const personMatch = /^person:\s*(.+)$/i.exec(raw);
      if (personMatch) {
        const name = personMatch[1].trim();
        const wiki = await fetchWikipediaPhoto(name);
        if (wiki && await verifyPersonPhoto(wiki, name, geminiKey)) {
          visualDiag[i] = `wikipedia:${name}`;
          return wiki;
        }
        console.warn(
          `segment ${i}: no verified real photo for "${name}" — stylising`,
        );
        // No verified real photo — a STYLISED illustration, never a faked
        // realistic face and never an unrelated Pexels human.
        try {
          const png = await Promise.race([
            generateImage(
              `A stylised flat-colour cartoon illustration representing ` +
                `footballer ${name} in kit, brand style, not photorealistic`,
              geminiKey,
            ),
            sleep(SEGMENT_GEMINI_BUDGET_MS).then(() => {
              throw new Error("person illustration timed out");
            }),
          ]);
          visualDiag[i] = `gemini-stylised:${name}`;
          return await uploadPng(png, i);
        } catch (e) {
          throw new Error(
            `segment ${i}: could not resolve a photo for ${name} — ` +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      }

      // A scene/concept prompt — AI generation, Pexels scene fallback.
      const prompt = raw || `World Cup 2026 football moment, scene ${i + 1}`;
      let png: Uint8Array | null = null;
      try {
        png = await Promise.race([
          generateImage(prompt, geminiKey),
          sleep(SEGMENT_GEMINI_BUDGET_MS).then(() => {
            throw new Error("segment image timed out");
          }),
        ]);
      } catch (imgErr) {
        console.error(
          `Gemini scene image failed for segment ${i} — trying Pexels:`,
          imgErr instanceof Error ? imgErr.message : String(imgErr),
        );
      }
      if (png) {
        visualDiag[i] = "gemini-scene";
        return await uploadPng(png, i);
      }
      const pexelsUrl = pexelsKey
        ? await fetchPexelsPhoto(prompt, pexelsKey)
        : null;
      if (pexelsUrl) {
        visualDiag[i] = "pexels-scene";
        return pexelsUrl;
      }
      const generic = pexelsKey
        ? await fetchPexelsPhoto("football stadium atmosphere", pexelsKey)
        : null;
      if (generic) {
        visualDiag[i] = "pexels-generic";
        return generic;
      }
      throw new Error(`segment ${i}: no image could be resolved`);
    })()
  );

  // Await everything together.
  const [segmentAudios, visualUrls] = await Promise.all([
    audioJob,
    Promise.all(visualJobs),
  ]);

  // The "host_voice_url" prop on the Remotion composition is now unused
  // when per-segment audio is set — each Scene plays its own MP3. We still
  // pass the first segment's URL so the prop has a non-empty value (it
  // satisfies the zod schema as a string and is harmlessly never played).
  const hostVoiceUrl = segmentAudios[0]?.url ?? "";

  // ---- 5b. assemble the built segments -------------------
  // Each segment's duration_ms is set to its OWN MP3's measured length —
  // no more proportional scaling guess. Audio + visual are perfectly synced.
  const builtSegments: BuiltSegment[] = rawSegments.map((seg, i) => {
    const audio = segmentAudios[i];
    const durationMs = Math.max(
      1000,
      Math.min(30000, audio?.ms ?? seg.durationMs ?? 8000),
    );
    // Alternate the Ken Burns direction for visual variety.
    const kenBurns = i % 2 === 0
      ? { from: 1.0, to: 1.14 }
      : { from: 1.12, to: 1.0 };
    return {
      // Remotion's text_ar field is the ON-SCREEN OVERLAY (not narration).
      // The dedicated `caption` field per segment (the short clickbait)
      // goes here. Narration `text` is what TTS read. Fallback to text for
      // legacy ideas without caption.
      text_ar: seg.caption || seg.text || " ",
      audio_url: audio?.url ?? "",
      visual_url: visualUrls[i],
      duration_ms: durationMs,
      ken_burns: kenBurns,
    };
  });

  // ---- 6. build Remotion props ---------------------------
  // No host_character — the host is the fixed Pharaoh mascot bundled with
  // the Remotion project.
  const props: Record<string, unknown> = {
    host_voice_url: hostVoiceUrl,
    segments: builtSegments,
    brand: {
      primary,
      accent,
      logo_url: logoUrl,
    },
    intro_text: hook,
    outro_handle: OUTRO_HANDLE,
  };

  // ---- 7. trigger the Remotion render --------------------
  const renderRes = await fetch(`${remotionUrl}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-render-secret": renderSecret,
    },
    body: JSON.stringify({ ...props, idea_id: ideaId }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!renderRes.ok) {
    const detail = await renderRes.text().catch(() => "");
    throw new Error(
      `Remotion /render ${renderRes.status}: ${detail.slice(0, 300)}`,
    );
  }
  const renderJson = await renderRes.json();
  const jobId: string | undefined = renderJson?.job_id;
  if (!jobId) {
    throw new Error("Remotion /render returned no job_id");
  }

  // ---- 8. update the assets row with the render job ------
  const { data: priorAsset } = await supabase
    .from("assets")
    .select("id")
    .eq("idea_id", ideaId)
    .eq("owner_id", OWNER_ID)
    .limit(1)
    .maybeSingle();

  const assetRow = {
    owner_id: OWNER_ID,
    idea_id: ideaId,
    kind: "short_video",
    caption: hook,
    hashtags: HASHTAGS,
    media: {
      status: "rendering",
      job_id: jobId,
      // How each segment backdrop was resolved — for observability.
      visuals: visualDiag,
    },
  };

  if (priorAsset?.id) {
    const { error: updErr } = await supabase
      .from("assets")
      .update(assetRow)
      .eq("id", priorAsset.id);
    if (updErr) throw new Error(`assets update: ${updErr.message}`);
  } else {
    const { error: insErr } = await supabase
      .from("assets")
      .insert(assetRow);
    if (insErr) throw new Error(`assets insert: ${insErr.message}`);
  }

  console.log(
    `[${ideaId}] render triggered — job ${jobId}, ` +
      `${builtSegments.length} segments, audio ${audioMs}ms`,
  );
}
