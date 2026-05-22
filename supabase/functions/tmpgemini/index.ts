// TEMPORARY edge function — Gemini image proxy / diagnostic.
// Used to (a) generate the fixed Pharaoh mascot and (b) diagnose why segment
// image generation failed. Returns the FULL upstream detail on failure so the
// finishReason / refusal text is visible. Delete after use.
//
// POST body: { prompt: string }
// Auth: header x-tmp-key must equal the one-off literal token below.

const MODELS = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  const TMP_TOKEN = "hs-pharaoh-7f3a91c4e2b8d605";
  if (req.headers.get("x-tmp-key") !== TMP_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "GEMINI_API_KEY missing" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const prompt: string = body?.prompt ?? "";
    if (!prompt) throw new Error("prompt required");

    const attempts: unknown[] = [];
    for (const model of MODELS) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(100_000),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        attempts.push({ model, http: res.status, detail: detail.slice(0, 500) });
        continue;
      }
      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      let hasImage = false;
      let imageB64 = "";
      for (const p of parts) {
        const inline = p?.inlineData ?? p?.inline_data;
        if (inline?.data) {
          hasImage = true;
          imageB64 = inline.data;
          break;
        }
      }
      if (hasImage) {
        return new Response(
          JSON.stringify({ ok: true, model, image_b64: imageB64 }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const txt = parts.map((p: { text?: string }) => p?.text ?? "").join(" ");
      attempts.push({
        model,
        http: res.status,
        finishReason: json?.candidates?.[0]?.finishReason ?? "?",
        promptFeedback: json?.promptFeedback ?? null,
        text: txt.slice(0, 400),
      });
    }
    return new Response(
      JSON.stringify({ ok: false, error: "no image from any model", attempts }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
