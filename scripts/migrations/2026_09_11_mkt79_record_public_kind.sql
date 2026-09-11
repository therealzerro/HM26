-- MKT-79 — register the record_public reel kind (THE DAILY TRACK RECORD REEL:
-- 30-day day-strip, public/tier-1, cold open, no intro/stinger/chip).
-- APPLIED 2026-09-11 via the Supabase MCP as
-- mkt79_marketing_reels_record_public_kind — FIRST within the change
-- (MKT-16/40/62 precedent): this constraint is the late-failure point — an
-- unregistered kind renders, assembles and uploads, then dies at the
-- marketing_reels upsert. Kept here as the migration record.
ALTER TABLE public.marketing_reels
  DROP CONSTRAINT marketing_reels_kind_check;
ALTER TABLE public.marketing_reels
  ADD CONSTRAINT marketing_reels_kind_check CHECK (kind = ANY (ARRAY[
    'allday_pro'::text, 'allday_free'::text, 'verify'::text,
    'midday_pro'::text, 'evening_pro'::text,
    'midday_free'::text, 'evening_free'::text,
    'allday_public'::text, 'verify_public'::text,
    'verify_midday'::text,
    'record_public'::text
  ]));
