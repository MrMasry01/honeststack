-- ============================================================
-- public.last_editorial_cron_fire()  (May 28 2026)
-- ------------------------------------------------------------
-- Heartbeat-watchdog needs to see WHEN the editorial-brief cron
-- last fired (vs when the function actually produced an idea) to
-- catch the "pg_net says queued ✓ but the function 546-timed-out"
-- failure mode (which bit us on 22:00 UTC May 27 + 11:00 UTC May
-- 28, costing two publish slots before the existing 12h editorial-
-- fresh check noticed).
--
-- cron.job_run_details lives in the cron schema, which PostgREST
-- doesn't expose by default. Wrapping it in a SECURITY DEFINER
-- function in public lets the service-role-keyed watchdog call it
-- via supabase.rpc('last_editorial_cron_fire') without exposing
-- the whole cron schema.
--
-- Applied to remote project via supabase MCP apply_migration on
-- 2026-05-28; this file is the git-tracked source of truth.
-- ============================================================

CREATE OR REPLACE FUNCTION public.last_editorial_cron_fire()
RETURNS TABLE (
  last_attempt_at TIMESTAMPTZ,
  last_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT MAX(start_time) FROM cron.job_run_details WHERE jobid = 3) AS last_attempt_at,
    (SELECT status::TEXT
     FROM cron.job_run_details
     WHERE jobid = 3
     ORDER BY start_time DESC
     LIMIT 1) AS last_status;
$$;

REVOKE ALL ON FUNCTION public.last_editorial_cron_fire() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.last_editorial_cron_fire() TO service_role;

COMMENT ON FUNCTION public.last_editorial_cron_fire() IS
  'Returns the latest pg_cron fire time + status for jobid=3 (hs-editorial-brief). '
  'Consumed by heartbeat-watchdog to detect the "cron fired but function timed out" '
  'failure mode within 30min instead of waiting for the 12h editorial_fresh threshold.';
