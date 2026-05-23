// ============================================================
// HonestStack — tiktok-connect-init
// ------------------------------------------------------------
// Returns the TikTok OAuth authorize URL with a signed state.
// The cockpit calls this, gets the URL, and window.location.hrefs
// the user to TikTok.
//
// State format: <user_id>.<base64url-HMAC-SHA256(user_id, INGEST_SECRET)>
// The callback function verifies this signature before storing
// tokens so an attacker can't connect their TikTok to your account.
//
// Env (auto): SUPABASE_URL, SUPABASE_ANON_KEY
// Env (secrets): TIKTOK_CLIENT_KEY, INGEST_SECRET
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const TIKTOK_AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_SCOPES = "user.info.basic,video.publish,video.upload";

async function signState(userId: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(userId));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${userId}.${b64}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const ingestSecret = Deno.env.get("INGEST_SECRET");

  if (!supabaseUrl || !anonKey || !clientKey || !ingestSecret) {
    return json({ ok: false, error: "server misconfigured" }, 500);
  }

  // Verify the requester is an authenticated user.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userJwt = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!userJwt) return json({ ok: false, error: "unauthorized" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResp, error: userErr } = await userClient.auth.getUser(userJwt);
  if (userErr || !userResp?.user) return json({ ok: false, error: "invalid JWT" }, 401);

  const userId = userResp.user.id;
  const state = await signState(userId, ingestSecret);

  // The redirect URI MUST exactly match what is registered in the
  // TikTok developer portal under your app's "Redirect URI" list.
  // For HonestStack we register the callback function's public URL.
  const redirectUri = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/tiktok-oauth-callback`;

  const url = new URL(TIKTOK_AUTHORIZE);
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("scope", TIKTOK_SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return json({
    ok: true,
    auth_url: url.toString(),
    redirect_uri: redirectUri,
    scopes: TIKTOK_SCOPES.split(","),
  });
});
