-- 2026-05-13 Add dominant_signal to adaptive_tracking (E5 enhancement).
--
-- Background: lib/hitDetection.ts::recordHitInAdaptiveTracking computes
-- a "dominant_signal" (BOX/PBURST/CO/DGC — whichever signal had the
-- highest value when the pick was generated) but PostgREST silently
-- dropped it on every insert because the column didn't exist. Same
-- pattern fixed for matched_state/matched_session earlier today.
--
-- E1 bundle: slate generation now pre-writes adaptive_tracking rows
-- for every K6 pick at compute time (one per pick, NULL outcome until
-- hit detection runs). dominant_signal is computed once at slate-gen
-- and persists with the row — enables instant "which signal led to
-- the hit" analysis on the Calibration Dashboard.
ALTER TABLE public.adaptive_tracking
  ADD COLUMN IF NOT EXISTS dominant_signal text;

CREATE INDEX IF NOT EXISTS adaptive_dominant_signal_idx
  ON public.adaptive_tracking(dominant_signal)
  WHERE dominant_signal IS NOT NULL;
