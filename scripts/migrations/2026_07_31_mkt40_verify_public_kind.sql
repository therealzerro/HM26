-- MKT-40 — register the verify_public reel kind. Applied 2026-07-31 via MCP
-- as mkt40_marketing_reels_verify_public_kind.
-- Widened FIRST within the change (MKT-16 precedent, operator ruling): this
-- constraint is the late-failure point — an unregistered kind renders,
-- assembles and uploads, then dies at the marketing_reels upsert.
ALTER TABLE public.marketing_reels
  DROP CONSTRAINT marketing_reels_kind_check;
ALTER TABLE public.marketing_reels
  ADD CONSTRAINT marketing_reels_kind_check CHECK (kind = ANY (ARRAY[
    'allday_pro'::text, 'allday_free'::text, 'verify'::text,
    'midday_pro'::text, 'evening_pro'::text,
    'midday_free'::text, 'evening_free'::text,
    'allday_public'::text, 'verify_public'::text
  ]));
