// TEMPORARY edge function — one-off trigger for render-shortform.
// Reads INGEST_SECRET from its own injected env and forwards an authenticated
// POST to render-shortform for a given idea_id. Used once for a verification
// render from a developer machine that does not hold INGEST_SECRET. Delete
// after use.
//
// POST body: { idea_id: string }
// Auth: header x-tmp-key must equal the one-off literal token below.

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  const TMP_TOKEN = "hs-trigger-5b2e88f0a7c41d93";
  if (req.headers.get("x-tmp-key") !== TMP_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const ideaId: string = body?.idea_id ?? "";
    if (!ideaId) throw new Error("idea_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const ingest = Deno.env.get("INGEST_SECRET");
    if (!supabaseUrl || !ingest) {
      throw new Error("SUPABASE_URL or INGEST_SECRET missing from env");
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/render-shortform`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-secret": ingest,
      },
      body: JSON.stringify({ idea_id: ideaId }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    return new Response(
      JSON.stringify({ ok: res.ok, status: res.status, body: text }),
      { headers: { "Content-Type": "application/json" } },
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
