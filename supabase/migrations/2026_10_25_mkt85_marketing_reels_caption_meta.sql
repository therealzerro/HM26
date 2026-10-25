-- MKT-85 Caption System v2, build 3: per-row caption provenance (ids of the
-- hook / fact / CTA / question lines used, banks version) for both drafts.
-- Applied live via MCP apply_migration 2026-10-25. Nullable; old-family
-- captions leave it NULL. Rollback: ALTER TABLE public.marketing_reels DROP COLUMN caption_meta;
ALTER TABLE public.marketing_reels ADD COLUMN IF NOT EXISTS caption_meta jsonb;
COMMENT ON COLUMN public.marketing_reels.caption_meta IS 'MKT-85 v2 caption provenance: { free: {v,hook,cta,q,fact}, pro: {...} } — NULL for old-family captions';
