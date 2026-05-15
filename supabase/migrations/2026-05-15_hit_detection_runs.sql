-- ENH-12: hit-detection run log.
-- One row per (date, scope) checked by run-hit-detection. Closes the silent-failure
-- gap BUG-145 exposed: when the anon GRANT regressed, hit detection still
-- "succeeded" with 0 hits and no operator-visible trail. With this table, a sweep
-- of recent rows shows whether hit detection actually ran and what it found.

CREATE TABLE IF NOT EXISTS public.hit_detection_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date                  date NOT NULL,                -- the slate_date checked
  scope                 text,                          -- NULL = all scopes for that date
  hits_found            integer NOT NULL DEFAULT 0,
  scopes_checked        integer NOT NULL DEFAULT 0,
  supplements_generated integer NOT NULL DEFAULT 0,
  errors                text[] NOT NULL DEFAULT '{}'::text[],
  error_count           integer NOT NULL DEFAULT 0,
  duration_ms           integer NOT NULL DEFAULT 0,
  run_at                timestamptz NOT NULL DEFAULT now(),
  run_source            text NOT NULL DEFAULT 'edge'   -- 'edge' | future: 'cron'
);

CREATE INDEX IF NOT EXISTS hit_detection_runs_date_run_at
  ON public.hit_detection_runs (date DESC, run_at DESC);
CREATE INDEX IF NOT EXISTS hit_detection_runs_run_at
  ON public.hit_detection_runs (run_at DESC);

ALTER TABLE public.hit_detection_runs ENABLE ROW LEVEL SECURITY;

-- Anon SELECT — dashboards / health checks need read access.
-- Service role (edge function) is the only writer.
CREATE POLICY hit_detection_runs_select_anon
  ON public.hit_detection_runs
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON public.hit_detection_runs TO anon;
