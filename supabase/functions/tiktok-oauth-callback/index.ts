// ============================================================
// HonestStack — tiktok-oauth-callback
// ------------------------------------------------------------
// Handles the redirect from TikTok after a user authorizes our
// app. Exchanges the auth code for an access_token + refresh_token,
// stores them in social_accounts (one row per owner per platform),
// then 302-redirects the user back to the cockpit's Connections page
// with success/error status.
//
// IMPORTANT: this function runs unauthenticated (verify_jwt = false)
// because the request originates from the user's browser following a
// TikTok 302, with no auth header attached. Security comes from the
// signed `state` parameter (HMAC of user_id signed with INGEST_SECRET).
//
// Env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env (secrets): TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, INGEST_SECRET,
//                COCKPIT_URL (the public URL of the dashboard for
//                redirect-back — falls back to a sensible default)
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_URL = "https://open.tiktokapis.com/v2/user/info/";

function redirectTo(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

async function verifyState(state: string, secret: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [userId, providedSig] = parts;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(userId));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  // Constant-time-ish comparison.
  if (providedSig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ providedSig.charCodeAt(i);
  }
  return diff === 0 ? userId : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
  const ingestSecret = Deno.env.get("INGEST_SECRET");
  const cockpitUrl = Deno.env.get("COCKPIT_URL")
    ?? "https://cockpit-production-be35.up.railway.app";

  if (!supabaseUrl || !serviceKey || !clientKey || !clientSecret || !ingestSecret) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const tiktokError = url.searchParams.get("error");
  const tiktokErrorDesc = url.searchParams.get("error_description");

  // User denied authorization or TikTok returned an error.
  if (tiktokError) {
    const back = new URL(`${cockpitUrl}/`);
    back.searchParams.set("tiktok", "error");
    back.searchParams.set("reason", tiktokErrorDesc ?? tiktokError);
    return redirectTo(back.toString());
  }

  if (!code || !state) {
    const back = new URL(`${cockpitUrl}/`);
    back.searchParams.set("tiktok", "error");
    back.searchParams.set("reason", "missing code or state");
    return redirectTo(back.toString());
  }

  // Validate the signed state — this proves the request originated
  // from our cockpit's tiktok-connect-init for a real Supabase user.
  const userId = await verifyState(state, ingestSecret);
  if (!userId) {
    const back = new URL(`${cockpitUrl}/`);
    back.searchParams.set("tiktok", "error");
    back.searchParams.set("reason", "invalid state signature");
    return redirectTo(back.toString());
  }

  // The redirect URI passed to TikTok must match exactly here too.
  const redirectUri = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/tiktok-oauth-callback`;

  // ---- Exchange code for tokens --------------------------------
  let tokenJson: {
    access_token?: string;
    refresh_token?: string;
    open_id?: string;
    scope?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    error?: string;
    error_description?: string;
  };
  try {
    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    tokenJson = await res.json();
    if (!res.ok || tokenJson.error) {
      throw new Error(
        `TikTok token exchange ${res.status}: ${tokenJson.error ?? ""} ${tokenJson.error_description ?? ""}`,
      );
    }
  } catch (err) {
    const back = new URL(`${cockpitUrl}/`);
    back.searchParams.set("tiktok", "error");
    back.searchParams.set("reason", err instanceof Error ? err.message : String(err));
    return redirectTo(back.toString());
  }

  if (!tokenJson.access_token || !tokenJson.open_id) {
    const back = new URL(`${cockpitUrl}/`);
    back.searchParams.set("tiktok", "error");
    back.searchParams.set("reason", "TikTok returned no access_token / open_id");
    return redirectTo(back.toString());
  }

  // ---- Best-effort: fetch the user's display_name + avatar -----
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const userRes = await fetch(`${TIKTOK_USER_URL}?fields=open_id,display_name,avatar_url`, {
      headers: { "Authorization": `Bearer ${tokenJson.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (userRes.ok) {
      const userJson = await userRes.json();
      displayName = userJson?.data?.user?.display_name ?? null;
      avatarUrl = userJson?.data?.user?.avatar_url ?? null;
    }
  } catch {
    // Non-fatal — the row will just lack display_name / avatar_url.
  }

  // ---- Upsert into social_accounts -----------------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
    : null;

  const { error: upErr } = await admin.from("social_accounts").upsert(
    {
      owner_id: userId,
      platform: "tiktok",
      open_id: tokenJson.open_id,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token ?? null,
      expires_at: expiresAt,
      scope: tokenJson.scope ?? null,
      display_name: displayName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,platform" },
  );

  if (upErr) {
    const back = new URL(`${cockpitUrl}/`);
    back.searchParams.set("tiktok", "error");
    back.searchParams.set("reason", `db upsert: ${upErr.message}`);
    return redirectTo(back.toString());
  }

  // ---- Success — redirect back to cockpit ----------------------
  const back = new URL(`${cockpitUrl}/`);
  back.searchParams.set("tiktok", "connected");
  if (displayName) back.searchParams.set("display_name", displayName);
  return redirectTo(back.toString());
});
