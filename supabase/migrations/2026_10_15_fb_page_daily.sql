-- GROWTH 2026-10-15: Page-level Insights daily series (the series ENH-FUNNEL-03 scoped
-- as fb_page_daily; built now for the operator's pasted exports, no API). No PII.
-- Applied to prod 2026-10-15 via MCP apply_migration (name: fb_page_daily).
create table if not exists public.fb_page_daily (
  day date primary key,
  media_views integer,
  media_views_from_followers integer,
  viewers_unique integer,
  page_visits integer,
  follows_total integer,
  follows_new integer,
  unfollows integer,
  video_views integer,
  video_view_time_s integer,
  content_interactions integer,
  subscribers_total integer,
  earnings_approx_usd numeric,
  earnings_content_usd numeric,
  earnings_by_tool jsonb,
  source text not null default 'paste',
  imported_at timestamptz not null default now()
);
comment on table public.fb_page_daily is 'Facebook Page Insights daily series (Viewers / Content interactions / Follows / Subscribers), pasted by the operator; ENH-FUNNEL-03 column names. No PII.';
alter table public.fb_page_daily enable row level security;
revoke all on public.fb_page_daily from anon, authenticated;
grant select, insert, update, delete on public.fb_page_daily to service_role;
