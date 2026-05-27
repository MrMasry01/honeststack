// ============================================================
// HonestStack — heartbeat-watchdog
// ------------------------------------------------------------
// Runs every 30 minutes via pg_cron. Checks the pipeline's
// observable state directly from the database (no instrumented
// function wrappers needed — the canonical "ingest silently
// broke" symptom is "no new raw_sources rows", which we can see
// from anywhere).
//
// Checks:
//   1. INGEST FRESH   — max(raw_sources.created_at) > now()-8h
//   2. EDITORIAL FRESH— max(content_ideas.created_at) > now()-12h
//   3. NO STUCK RENDER— count(assets in 'rendering' >1h) == 0
//   4. NO STUCK PUBLISH — count(posts_queue 'publishing' >15min) == 0
//   5. METRICS FRESH  — max(post_metrics.measured_at) > now()-90min
//   6. RECENT PUBLISH — any posted in last 24h (warns on quiet days)
//
// Result upserted into system_health (single row, id='singleton').
// Cockpit Overview reads it and renders a banner if not ok.
//
// Auth: x-ingest-secret header.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const OWNER_ID = "e7564e43-6b02-4c40-9ecf-1c65fffafe9a";
const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type Check = {
  name: string;
  ok: boolean;
  value: string | number | null;
  threshold: string;
  message: string;
};

function minutesAgo(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.round((Date.now() - new Date(d).getTime()) / 60000);
}

function fmtMinutes(m: number | null): string {
  if (m == null) return "never";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m ago`;
}

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
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ ok: false, error: "supabase env not configured" }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const checks: Check[] = [];

    // ── 1. Ingest fresh? ──
    // Canonical check that pg_net "succeeded" lies about: if the ingest
    // function errored, NO new raw_sources row was written. We don't
    // care what pg_net said.
    const { data: lastSource } = await supabase
      .from("raw_sources")
      .select("created_at")
      .eq("owner_id", OWNER_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ingestMin = minutesAgo(lastSource?.created_at);
    checks.push({
      name: "ingest_fresh",
      ok: ingestMin !== null && ingestMin < 8 * 60,
      value: ingestMin,
      threshold: "<480m (8h)",
      message: `Last ingest ${fmtMinutes(ingestMin)}. Ingest crons fire at 05/11/17/23 UTC; if this is >8h stale, the ingest function is silently erroring.`,
    });

    // ── 2. Editorial fresh? ──
    const { data: lastIdea } = await supabase
      .from("content_ideas")
      .select("created_at")
      .eq("owner_id", OWNER_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const editorialMin = minutesAgo(lastIdea?.created_at);
    checks.push({
      name: "editorial_fresh",
      ok: editorialMin !== null && editorialMin < 12 * 60,
      value: editorialMin,
      threshold: "<720m (12h)",
      message: `Last editorial idea ${fmtMinutes(editorialMin)}. Briefs fire at xx:30 UTC every 6h. >12h means Claude API down, anthropic budget hit, or function broken.`,
    });

    // ── 3. Stuck renders? ──
    const { count: stuckRenderCount } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", OWNER_ID)
      .in("media->>status", ["rendering", "processing"])
      .lt("updated_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    checks.push({
      name: "no_stuck_render",
      ok: (stuckRenderCount ?? 0) === 0,
      value: stuckRenderCount ?? 0,
      threshold: "=0",
      message: `${stuckRenderCount ?? 0} assets stuck rendering >1h. Likely Remotion on Railway died mid-render.`,
    });

    // ── 4. Stuck publishes? ──
    const { count: stuckPublishCount } = await supabase
      .from("posts_queue")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", OWNER_ID)
      .eq("status", "publishing")
      .lt("updated_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
    checks.push({
      name: "no_stuck_publish",
      ok: (stuckPublishCount ?? 0) === 0,
      value: stuckPublishCount ?? 0,
      threshold: "=0",
      message: `${stuckPublishCount ?? 0} posts stuck publishing >15min. Likely token expired or API rate limit.`,
    });

    // ── 5. Metrics refresh fresh? ──
    const { data: lastMetric } = await supabase
      .from("post_metrics")
      .select("measured_at")
      .eq("owner_id", OWNER_ID)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const metricsMin = minutesAgo(lastMetric?.measured_at);
    checks.push({
      name: "metrics_fresh",
      ok: metricsMin !== null && metricsMin < 90,
      value: metricsMin,
      threshold: "<90m",
      message: `Last metrics refresh ${fmtMinutes(metricsMin)}. Should be every 30 min. >90m means refresh-metrics broken (likely YT/IG token).`,
    });

    // ── 6. Any post in last 24h? (informational, not red) ──
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentPostCount } = await supabase
      .from("posts_queue")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", OWNER_ID)
      .eq("status", "posted")
      .gte("posted_at", oneDayAgo);
    checks.push({
      name: "recent_publishing",
      ok: (recentPostCount ?? 0) > 0,
      value: recentPostCount ?? 0,
      threshold: ">0 in 24h",
      message: `${recentPostCount ?? 0} posts published in last 24h. If 0, the auto-scheduler isn't firing OR no fresh ideas exist OR all publishes are failing.`,
    });

    // ── 7. IG Graph token expiry (catches the 13h silent outage class) ──
    // Meta long-lived user tokens expire after 60 days. If we don't refresh
    // before expiry, every IG publish silently 401s and the heartbeat
    // doesn't notice because no posts have errored yet — they just stop
    // happening. We poll /debug_token weekly via this watchdog and surface
    // days-until-expiry. Threshold of >=7 days = green; <7 = red.
    //
    // TikTok + YouTube tokens have refresh-token flows and renew themselves
    // automatically inside their respective publish functions, so they
    // don't need this check (yet — could add later for the refresh-failed
    // edge case).
    const igToken = Deno.env.get("IG_GRAPH_TOKEN");
    const igAppId = Deno.env.get("IG_APP_ID");
    const igAppSecret = Deno.env.get("IG_APP_SECRET");
    if (igToken && igAppId && igAppSecret) {
      try {
        const appToken = `${igAppId}|${igAppSecret}`;
        const debugRes = await fetch(
          `https://graph.facebook.com/v21.0/debug_token?input_token=${
            encodeURIComponent(igToken)
          }&access_token=${encodeURIComponent(appToken)}`,
          { signal: AbortSignal.timeout(15_000) },
        );
        const debugJson = await debugRes.json();
        // expires_at: unix seconds. 0 = never expires (rare for user tokens).
        const expiresAt: number = debugJson?.data?.expires_at ?? 0;
        const valid: boolean = debugJson?.data?.is_valid === true;
        if (!valid) {
          checks.push({
            name: "ig_token_fresh",
            ok: false,
            value: "invalid",
            threshold: "valid + >=7 days",
            message: `IG token is INVALID per /debug_token. Posts will 401. Refresh now via https://developers.facebook.com/tools/debug/accesstoken/`,
          });
        } else if (expiresAt === 0) {
          // Never-expiring page token — happy path
          checks.push({
            name: "ig_token_fresh",
            ok: true,
            value: "never_expires",
            threshold: "valid + >=7 days",
            message: `IG token is valid and never expires.`,
          });
        } else {
          const daysRemaining = Math.round(
            (expiresAt * 1000 - Date.now()) / (24 * 60 * 60 * 1000),
          );
          checks.push({
            name: "ig_token_fresh",
            ok: daysRemaining >= 7,
            value: daysRemaining,
            threshold: ">=7 days",
            message: `IG token expires in ${daysRemaining} days. ${
              daysRemaining < 7
                ? "REFRESH NOW via https://developers.facebook.com/tools/debug/accesstoken/ — past expiry every IG publish 401s silently."
                : "Healthy."
            }`,
          });
        }
      } catch (err) {
        // Network / parse error → flag as unknown, but not red (don't
        // false-alarm if Meta /debug_token is briefly down).
        checks.push({
          name: "ig_token_fresh",
          ok: true,
          value: "check_failed",
          threshold: ">=7 days",
          message: `IG /debug_token probe failed (treated as healthy until next run): ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }

    const issues = checks.filter((c) => !c.ok);
    const ok = issues.length === 0;

    const { error: upErr } = await supabase
      .from("system_health")
      .upsert({
        id: "singleton",
        ok,
        checks,
        issues,
        ran_at: new Date().toISOString(),
      });
    if (upErr) throw new Error(`system_health upsert: ${upErr.message}`);

    return jsonResponse({ ok, total_checks: checks.length, issues: issues.length, details: checks });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
