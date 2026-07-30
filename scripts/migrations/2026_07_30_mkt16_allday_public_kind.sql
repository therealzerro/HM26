-- MKT-16 Phase 1 — register the allday_public reel kind. Applied 2026-07-30
-- via MCP as mkt16_marketing_reels_allday_public_kind.
-- Widened FIRST within the change (operator ruling 2026-07-30): this constraint
-- is the late-failure point — an unregistered kind renders, assembles and
-- uploads, then dies at the marketing_reels upsert (the MKT-13 lesson).
-- midday_public / evening_public stay UNREGISTERED: no session carriers exist
-- and three daily public reels is the cadence risk already ruled against.
ALTER TABLE public.marketing_reels
  DROP CONSTRAINT marketing_reels_kind_check;
ALTER TABLE public.marketing_reels
  ADD CONSTRAINT marketing_reels_kind_check CHECK (kind = ANY (ARRAY[
    'allday_pro'::text, 'allday_free'::text, 'verify'::text,
    'midday_pro'::text, 'evening_pro'::text,
    'midday_free'::text, 'evening_free'::text,
    'allday_public'::text
  ]));
