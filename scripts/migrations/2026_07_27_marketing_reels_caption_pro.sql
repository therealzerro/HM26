-- MKT-05b (2026-07-27): verify reel gets per-target captions — `caption` is
-- the free-group draft, `caption_pro` the pro-group draft (full numbers).
-- Allday rows keep caption_pro NULL (they already split into pro/free rows).
alter table public.marketing_reels add column if not exists caption_pro text;
