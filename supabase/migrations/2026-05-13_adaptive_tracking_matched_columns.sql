-- 2026-05-13 Add matched_state + matched_session to adaptive_tracking.
--
-- Background: lib/hitDetection.ts::recordHitInAdaptiveTracking sends these
-- two keys on every hit-recording POST, but neither existed in the table
-- schema (schema_complete_v21.sql). PostgREST silently dropped them on
-- insert, so production rows had no way to record WHICH jurisdiction +
-- session actually produced the hit — a problem when a box-set drew in
-- two states simultaneously (today, allday pick 916 matched both WI 619
-- and ME,NH,VT 196).
--
-- Both columns are nullable: legacy rows pre-2026-05-13 won't have values,
-- and that's fine — the snapshot's hitState/hitSession JSON fields remain
-- the user-visible source of truth.
ALTER TABLE public.adaptive_tracking
  ADD COLUMN IF NOT EXISTS matched_state   text,
  ADD COLUMN IF NOT EXISTS matched_session text;

CREATE INDEX IF NOT EXISTS adaptive_matched_state_idx
  ON public.adaptive_tracking(matched_state)
  WHERE matched_state IS NOT NULL;
