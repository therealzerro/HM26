-- MKT-04 (2026-07-27) — in-app reel publishing.
--
-- The reel pipelines (npm run reel:allday / reel:verify) upload their finals
-- to the public `marketing-reels` storage bucket and register them here; the
-- admin Reels view lists rows, previews the contact sheet, and hands the
-- video + caption to Facebook (assisted lane — Groups have no publish API).
--
-- Write paths (SEC-05): pipeline = service role (.env.backtest); app status
-- updates = admin-ops gateway (table added to its allowlist). Anon is
-- READ-ONLY by policy; no anon/public write policies exist on this table.

create table if not exists public.marketing_reels (
  id uuid primary key default gen_random_uuid(),
  reel_date date not null,
  kind text not null check (kind in ('allday_pro', 'allday_free', 'verify')),
  video_path text not null,          -- storage path of the 9:16 final
  video_1x1_path text,               -- storage path of the 1:1 feed cut
  sheet_path text,                   -- storage path of the contact sheet png
  duration_s numeric,
  caption text not null default '',  -- draft caption (operator edits in-app)
  status text not null default 'ready' check (status in ('ready', 'posted', 'archived')),
  posted_at timestamptz,
  target_name text,                  -- where the handoff went (free/pro group…)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (reel_date, kind)
);

alter table public.marketing_reels enable row level security;

drop policy if exists "anon read marketing_reels" on public.marketing_reels;
create policy "anon read marketing_reels"
  on public.marketing_reels for select
  to anon
  using (true);

-- Public bucket: reels are pre-publication marketing content served to the
-- operator app by URL. 50MB/object cap; mp4 + png only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-reels', 'marketing-reels', true, 52428800, array['video/mp4', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
