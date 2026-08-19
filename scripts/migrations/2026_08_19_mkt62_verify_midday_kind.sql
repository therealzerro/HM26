-- MKT-62 — register the verify_midday reel kind (the SAME-DAY MIDDAY VERIFY:
-- today, midday scope only, manual trigger, free group only).
-- ⚠ NOT YET APPLIED from the build environment (2026-08-19): no DDL path —
-- Supabase CLI / Management API unauthorized, no Supabase MCP in-session.
-- OPERATOR STEP: run in the Supabase SQL editor (or via MCP) BEFORE the first
-- `npm run reel:verify-midday` publish. publish-reels names this file if the
-- upsert is rejected by the CHECK (MKT-16/40 precedent: the CHECK is the
-- late-failure point — an unregistered kind renders, assembles and uploads,
-- then dies at the marketing_reels upsert).
ALTER TABLE public.marketing_reels
  DROP CONSTRAINT marketing_reels_kind_check;
ALTER TABLE public.marketing_reels
  ADD CONSTRAINT marketing_reels_kind_check CHECK (kind = ANY (ARRAY[
    'allday_pro'::text, 'allday_free'::text, 'verify'::text,
    'midday_pro'::text, 'evening_pro'::text,
    'midday_free'::text, 'evening_free'::text,
    'allday_public'::text, 'verify_public'::text,
    'verify_midday'::text
  ]));
