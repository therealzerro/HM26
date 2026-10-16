-- MKT-90 — register the GUEST PASS reel kinds (midday_guest / evening_guest:
-- the Pro session board on loan to the free room for one day; on-demand,
-- never in reel:daily). APPLIED 2026-10-16 via the Supabase MCP as
-- mkt90_marketing_reels_guest_kinds — FIRST within the change (MKT-16/40/62/79
-- precedent): this constraint is the late-failure point — an unregistered
-- kind renders, assembles and uploads, then dies at the marketing_reels
-- upsert. Kept here as the migration record.
ALTER TABLE public.marketing_reels
  DROP CONSTRAINT marketing_reels_kind_check;
ALTER TABLE public.marketing_reels
  ADD CONSTRAINT marketing_reels_kind_check CHECK (kind = ANY (ARRAY[
    'allday_pro'::text, 'allday_free'::text, 'verify'::text,
    'midday_pro'::text, 'evening_pro'::text,
    'midday_free'::text, 'evening_free'::text,
    'allday_public'::text, 'verify_public'::text,
    'verify_midday'::text,
    'record_public'::text,
    'midday_guest'::text, 'evening_guest'::text
  ]));
