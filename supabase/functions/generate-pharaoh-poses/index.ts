// ============================================================
// HonestStack — generate-pharaoh-poses (one-time admin tool)
// ------------------------------------------------------------
// Builds the Pharaoh pose library used by the Remotion renderer.
//
// For each pose:
//   1. Fetches the base Pharaoh PNG from GitHub raw (public repo).
//   2. Calls Gemini 2.5 Flash Image with the pose text prompt + the
//      base image as a reference (image-to-image). Character
//      identity is preserved by the reference; the prompt just
//      varies pose / expression / framing.
//   3. Saves the result PNG to Supabase Storage under
//      assets/pharaoh-poses/{pose_id}.png (public bucket).
//
// Re-runnable: upsert=true on storage upload, so calling this
// regenerates the library. Pass body { poses: ["peek-left"] } to
// regenerate just one pose during iteration.
//
// Auth: x-ingest-secret header.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const OWNER_ID = "e7564e43-6b02-4c40-9ecf-1c65fffafe9a";
const STORAGE_BUCKET = "assets";
const GEMINI_MODEL = "gemini-2.5-flash-image";

// v3 master (May 2026) — premium illustration upgrade. Same character DNA as
// v2 (Egyptian Pharaoh, gold/black/red nemes, red Egypt kit, soccer ball) but
// rendered in Arcane/Riot-tier 2D — proper cel shading, thin variable-weight
// outline, subtle rim light, balanced proportions, Egyptian eagle crest on
// the chest. Generated via Bloom (pro model) image-edit on the v2 mascot, then
// committed here so Gemini I2I can pin pose-library regeneration to this style.
const PHARAOH_BASE_URL =
  "https://raw.githubusercontent.com/MrMasry01/honeststack/main/brand/pharaoh-master-v3.png";

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// The full pose library. Edit prompts here to regenerate with new
// instructions. Style stays consistent because the reference image
// pins identity and rendering style.
// v3 style suffix — matches the upgraded Bloom-edited master. The PRIOR
// version asked for "flat 2D cartoon vector with thick black outlines"
// which produced clip-art tier art. This one demands premium illustration
// quality (Arcane / Riot splash art / Spider-Verse tier) while preserving
// the same character identity.
const STYLE_SUFFIX =
  " Render in the EXACT same premium 2D character illustration style as the " +
  "reference image: proper cel shading with soft gradients, thin variable-" +
  "weight outline (NOT a thick uniform black outline), volumetric shading on " +
  "the headdress (metallic gold highlights on the gold/black stripes), " +
  "fabric folds on the red Egypt jersey, ambient occlusion under the chin " +
  "and arms, a subtle cinematic rim light from the upper-right. Detailed " +
  "Egyptian eagle crest on the chest. Balanced 4-head ratio proportions " +
  "(NOT chibi). Same friendly recognisable face as the reference. Pure " +
  "white background (will be background-removed downstream). Full body " +
  "unless the pose specifies head-only. Centered in frame. Style reference " +
  "axis: Arcane / Riot splash art / Spider-Verse — premium 2D animation " +
  "tier, NOT flat vector mascot tier.";

const POSES: Record<string, string> = {
  "idle-talk":
    "Egyptian Pharaoh mascot standing in a neutral relaxed pose, body facing forward, " +
    "mouth slightly open mid-speech, one hand holding the soccer ball at his side, " +
    "the other hand relaxed.",

  "peek-left":
    "Egyptian Pharaoh mascot PEEKING from behind the LEFT EDGE of the frame — " +
    "only his right half is visible (the right side of his face, right shoulder, " +
    "and one eye), as if he's hiding behind a wall on the left and leaning out to " +
    "look at something. Curious expression. The left half of his body is cut off.",

  "peek-right":
    "Egyptian Pharaoh mascot PEEKING from behind the RIGHT EDGE of the frame — " +
    "only his left half is visible (the left side of his face, left shoulder), " +
    "as if hiding behind a wall on the right. Curious expression. The right half " +
    "of his body is cut off.",

  "point-up-right":
    "Egyptian Pharaoh mascot in a confident standing pose, his right arm RAISED " +
    "and POINTING upward to the upper-right corner of the frame with index finger " +
    "extended. Open mouth as if exclaiming. Left hand at his side still holding " +
    "the soccer ball.",

  "point-down":
    "Egyptian Pharaoh mascot standing forward, both hands and index fingers " +
    "pointing DOWNWARD with exaggerated emphasis. Eyes wide, mouth open like he's " +
    "telling you to LOOK DOWN at something below the frame.",

  "surprised":
    "Egyptian Pharaoh mascot with a SURPRISED / SHOCKED expression — eyes wide " +
    "open, eyebrows raised, mouth dropped open in a big round 'O'. Both hands " +
    "raised palms-out beside his face in shock. Soccer ball can be falling beside him.",

  "sarcastic-shrug":
    "Egyptian Pharaoh mascot doing a SARCASTIC SHRUG — both shoulders raised, " +
    "palms turned up at his sides, eyes half-closed with a flat unimpressed " +
    "expression, mouth a small straight line. The 'really?' shrug.",

  "count-fingers":
    "Egyptian Pharaoh mascot standing, holding up THREE FINGERS on his right hand " +
    "near his face to count. Confident smile. Left hand still holds the soccer " +
    "ball at his side.",

  "walk-in-left":
    "Egyptian Pharaoh mascot in a mid-stride WALKING pose, one foot forward one " +
    "back, walking IN from the LEFT side of the frame and looking forward with a " +
    "friendly smile. He's mostly inside the frame already, just having entered.",

  "walk-out-right":
    "Egyptian Pharaoh mascot in a mid-stride WALKING pose facing toward the RIGHT " +
    "edge of the frame, looking back over his shoulder at the viewer and waving " +
    "goodbye with one hand. About to exit frame right.",

  "crying":
    "Egyptian Pharaoh mascot with a SAD CRYING expression — eyes closed with " +
    "comically big cartoon tear drops running down his cheeks, mouth turned down. " +
    "Both hands up near his face wiping tears. Soccer ball forgotten at his feet.",

  "celebrating":
    "Egyptian Pharaoh mascot CELEBRATING a goal — both arms RAISED HIGH above " +
    "his head in victory, mouth wide open shouting in joy, eyes squinting with " +
    "excitement. The soccer ball can be in the air above him.",
};

async function fetchBaseImage(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`base image fetch ${res.status}`);
  const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0];
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, mime };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

type GeminiImageResult =
  | { ok: true; image: Uint8Array }
  | { ok: false; status: number; detail: string };

async function generatePose(
  apiKey: string,
  posePrompt: string,
  baseImageBase64: string,
  baseMime: string,
): Promise<GeminiImageResult> {
  const fullPrompt = posePrompt + STYLE_SUFFIX;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: fullPrompt },
            { inlineData: { mimeType: baseMime, data: baseImageBase64 } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail: detail.slice(0, 400) };
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
  const finishReason = json?.candidates?.[0]?.finishReason ?? "?";
  return {
    ok: false,
    status: 200,
    detail: `no image returned (finishReason=${finishReason})`,
  };
}

// ============================================================
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
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!supabaseUrl || !serviceKey || !geminiKey) {
      return jsonResponse(
        { ok: false, error: "missing env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY)" },
        500,
      );
    }

    // Optional body: { poses: ["peek-left"] } to regenerate just one.
    let filterPoses: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.poses)) {
        filterPoses = body.poses.filter((p: unknown) => typeof p === "string");
      }
    } catch { /* no body */ }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch base Pharaoh image once.
    console.log(`fetching base pharaoh from ${PHARAOH_BASE_URL}`);
    const base = await fetchBaseImage(PHARAOH_BASE_URL);
    const baseB64 = uint8ToBase64(base.bytes);
    console.log(`base loaded: ${base.bytes.length} bytes, mime=${base.mime}`);

    const targetPoses = Object.entries(POSES).filter(
      ([id]) => !filterPoses || filterPoses.includes(id),
    );

    const results: Array<{
      pose_id: string;
      status: "ok" | "error";
      url?: string;
      error?: string;
    }> = [];

    // Sequential to be polite to Gemini — preview models rate-limit
    // hard on bursts. Total runtime ~12 * ~10s = ~2 min for all 12.
    for (const [poseId, prompt] of targetPoses) {
      console.log(`generating pose: ${poseId}`);
      try {
        const result = await generatePose(geminiKey, prompt, baseB64, base.mime);
        if (!result.ok) {
          console.error(`pose ${poseId} failed: ${result.status} ${result.detail}`);
          results.push({ pose_id: poseId, status: "error", error: `${result.status}: ${result.detail}` });
          continue;
        }

        const storagePath = `pharaoh-poses/${poseId}.png`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, result.image, { contentType: "image/png", upsert: true });
        if (upErr) {
          console.error(`pose ${poseId} upload failed: ${upErr.message}`);
          results.push({ pose_id: poseId, status: "error", error: `upload: ${upErr.message}` });
          continue;
        }

        const publicUrl =
          `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
        results.push({ pose_id: poseId, status: "ok", url: publicUrl });
        console.log(`pose ${poseId} -> ${publicUrl}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`pose ${poseId} threw: ${message}`);
        results.push({ pose_id: poseId, status: "error", error: message });
      }
    }

    return jsonResponse({
      ok: true,
      generated: results.filter((r) => r.status === "ok").length,
      failed: results.filter((r) => r.status === "error").length,
      results,
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
