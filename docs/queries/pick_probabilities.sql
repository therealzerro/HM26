-- pick_probabilities.sql — CALIB-01 (2026-06-10)
--
-- Calibrated P(hit) + suggested stake split for today's on-slate picks.
-- Applies the logistic coefficients in app_config.pick_prob_calibration
-- (fit + walk-forward-validated by `npm run calibrate:picks`; ship gate:
-- test Brier ≤ trivial per-scope baseline).
--
-- Notes for the operator (CALIB-02, 2026-07-24 — pool repointed to on-slate picks):
--   • p_hit_pct = calibrated probability this pick box-matches ≥1 draw in its
--     scope window today. Fit on ON-SLATE picks only (the apply population);
--     July walk-forward levels: midday pred 17.1% vs actual 17.7%, evening
--     19.7/18.8, allday 33.9/35.4. Levels are trustworthy; within-scope
--     pick-to-pick ORDERING is noise-grade (SIGNAL-INFO-01).
--   • stake_share_pct = p_hit normalized within scope. For EV-weighted
--     allocation multiply each pick's p_hit by your payout structure first.
--   • Doubles/triples fall back to the stored scope base rate, which is
--     pre-halved (a specific double covers 3 of 6 permutations).
--   • Decision-layer only: nothing here feeds back into pick selection.

WITH calib AS (
  SELECT value::jsonb AS c FROM app_config WHERE key = 'pick_prob_calibration'
),
picks AS (
  SELECT slate_date, scope, rank, combo, best_order, multiplicity,
         signal_box, signal_pburst, signal_co, signal_dgc
  FROM daily_intelligence
  WHERE mode = 'balanced' AND on_slate
    AND slate_date = (NOW() AT TIME ZONE 'America/New_York')::date
),
scored AS (
  SELECT p.*,
    CASE
      WHEN p.multiplicity IS DISTINCT FROM 'singles'
        THEN COALESCE((c.c->'base_rates'->>p.scope)::float, 0)
      ELSE 1.0 / (1.0 + exp(-(
        (c.c->>'b')::float
        + (c.c->'w'->>0)::float * (((CASE WHEN p.scope = 'evening' THEN 1 ELSE 0 END) - (c.c->'mean'->>0)::float) / NULLIF((c.c->'std'->>0)::float, 0))
        + (c.c->'w'->>1)::float * (((CASE WHEN p.scope = 'midday'  THEN 1 ELSE 0 END) - (c.c->'mean'->>1)::float) / NULLIF((c.c->'std'->>1)::float, 0))
        + (c.c->'w'->>2)::float * ((p.signal_box    - (c.c->'mean'->>2)::float) / NULLIF((c.c->'std'->>2)::float, 0))
        + (c.c->'w'->>3)::float * ((p.signal_pburst - (c.c->'mean'->>3)::float) / NULLIF((c.c->'std'->>3)::float, 0))
        + (c.c->'w'->>4)::float * ((p.signal_co     - (c.c->'mean'->>4)::float) / NULLIF((c.c->'std'->>4)::float, 0))
        + (c.c->'w'->>5)::float * ((p.signal_dgc    - (c.c->'mean'->>5)::float) / NULLIF((c.c->'std'->>5)::float, 0))
      )))
    END AS p_hit
  FROM picks p CROSS JOIN calib c
)
SELECT scope, rank, combo, best_order, multiplicity,
  ROUND((100 * p_hit)::numeric, 1) AS p_hit_pct,
  ROUND((100 * p_hit / NULLIF(SUM(p_hit) OVER (PARTITION BY scope), 0))::numeric, 1) AS stake_share_pct
FROM scored
ORDER BY scope, p_hit DESC, rank;
