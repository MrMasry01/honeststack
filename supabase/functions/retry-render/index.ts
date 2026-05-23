// ============================================================
// HonestStack — retry-render edge function
// ------------------------------------------------------------
// Lets an authenticated cockpit user retry a failed/orphaned render
// for one of their own content_ideas with a single click, without
// ever exposing INGEST_SECRET to the browser.
//
// Flow:
//   1. Auth: requires user JWT (verify_jwt = true via config.toml).
//   2. Authorization: verifies the requesting user owns the idea_id
//      (compares content_ideas.owner_id to auth.uid).
//   3. Proxy: POSTs to /functions/v1/render-shortform with the
//      service-side INGEST_SECRET and the idea_id, returning the
//      render-shortform response verbatim.
//
// The cockpit calls this via:
//   supabase.functions.invoke('retry-render', { body: { idea_id } })
//
// Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                      SUPABASE_ANON_KEY
// Env (secret):        INGEST_SECRET
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  // Allow the cockpit (different origin) to read the response.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req: Request) => {
  // CORS preflight from the browser-based cockpit.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  // ---- env ------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!supabaseUrl || !serviceKey || !anonKey || !ingestSecret) {
    return json(
      { ok: false, error: "server misconfigured: missing one of SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY / INGEST_SECRET" },
      500,
    );
  }

  // ---- auth: user must be logged in via Supabase ---------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const userJwt = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!userJwt) {
    return json({ ok: false, error: "unauthorized: no JWT" }, 401);
  }

  // Resolve the user from the JWT. We use the anon key here on purpose —
  // RLS isn't relevant for getUser(), the JWT is self-validating.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResp, error: userErr } = await userClient.auth.getUser(userJwt);
  if (userErr || !userResp?.user) {
    return json({ ok: false, error: "unauthorized: invalid JWT" }, 401);
  }
  const userId = userResp.user.id;

  // ---- body: idea_id ------------------------------------------
  let body: { idea_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request: body must be JSON" }, 400);
  }
  const ideaId = typeof body?.idea_id === "string" ? body.idea_id : "";
  if (!ideaId) {
    return json({ ok: false, error: "bad request: idea_id (string) is required" }, 400);
  }

  // ---- authorization: user must own the idea -------------------
  // Use service-role here so we can SELECT regardless of RLS, then
  // explicitly compare owner_id to the authenticated user.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: idea, error: ideaErr } = await admin
    .from("content_ideas")
    .select("id, owner_id, status, script_segments")
    .eq("id", ideaId)
    .maybeSingle();

  if (ideaErr) {
    return json({ ok: false, error: `idea lookup failed: ${ideaErr.message}` }, 500);
  }
  if (!idea) {
    return json({ ok: false, error: "idea not found" }, 404);
  }
  if (idea.owner_id !== userId) {
    return json({ ok: false, error: "forbidden: idea belongs to another owner" }, 403);
  }
  if (
    !Array.isArray(idea.script_segments) ||
    idea.script_segments.length === 0
  ) {
    return json({ ok: false, error: "idea has no script_segments to render" }, 400);
  }

  // ---- proxy to render-shortform -------------------------------
  const renderUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/render-shortform`;
  const renderRes = await fetch(renderUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingest-secret": ingestSecret,
    },
    body: JSON.stringify({ idea_id: ideaId }),
    signal: AbortSignal.timeout(30_000),
  });

  // Pass through whatever render-shortform returned, with the same status.
  let payload: unknown;
  try {
    payload = await renderRes.json();
  } catch {
    payload = { ok: false, error: `render-shortform returned non-JSON status ${renderRes.status}` };
  }
  return json(payload, renderRes.status);
});
