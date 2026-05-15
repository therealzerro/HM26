-- ENH-08: per-generation engine telemetry.
-- One row per slate-generation call (compute-slate-zk6 edge function).
-- Captures the EFFECTIVE config used at generation time (post per-scope overrides),
-- so longitudinal queries can correlate config changes to live outcomes without
-- having to reconstruct what was in app_config at gen time.

CREATE TABLE IF NOT EXISTS public.engine_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slate_hash          text NOT NULL,
  scope               text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  mode                text NOT NULL DEFAULT 'balanced',  -- weightsKey
  slate_date          date NOT NULL,
  -- Resolved weights actually used for scoring (post per-scope override).
  effective_weights   jsonb NOT NULL,
  -- {H01Y: true/false, ...} as written to slate_snapshots.horizons_present_json
  horizons_present    jsonb NOT NULL DEFAULT '{}'::jsonb,
  horizons_loaded     text[] NOT NULL DEFAULT '{}'::text[],
  confidence_score    integer NOT NULL DEFAULT 0,
  using_fallback      boolean NOT NULL DEFAULT false,
  -- Effective BOX freq/pressure split (post per-scope override).
  box_freq_weight     numeric,
  box_pressure_weight numeric,
  -- Effective cooldown (post per-scope override).
  recent_hit_cooldown integer,
  min_energy_threshold integer,
  source              text NOT NULL DEFAULT 'edge',  -- 'edge' | 'local'
  generated_at_utc    timestamptz NOT NULL DEFAULT now(),
  generated_at_et     timestamptz NOT NULL,
  -- Same inputs ⇒ same hash. Re-gens of an identical config produce one row
  -- (merge-duplicates upsert), not duplicates. (slate_hash, mode) together is
  -- the natural key — different modes can share a hash if hash excludes mode.
  CONSTRAINT engine_runs_hash_mode_unique UNIQUE (slate_hash, mode)
);

CREATE INDEX IF NOT EXISTS engine_runs_slate_date_scope
  ON public.engine_runs (slate_date DESC, scope);
CREATE INDEX IF NOT EXISTS engine_runs_generated_at_utc
  ON public.engine_runs (generated_at_utc DESC);

ALTER TABLE public.engine_runs ENABLE ROW LEVEL SECURITY;

-- Anon SELECT — analytics/dashboards read this. No anon writes; service role
-- (edge function) is the only writer.
CREATE POLICY engine_runs_select_anon
  ON public.engine_runs
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON public.engine_runs TO anon;
