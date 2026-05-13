-- Daily aggregate of ZK6 engine performance, one row per (date_et × scope).
-- Source of truth for the 7-day verification window (2026-05-13 → 2026-05-19)
-- and for every future engine-change baseline/candidate comparison.
--
-- Idempotent: re-running compute-daily-report for the same (date, scope)
-- overwrites the row in place. No history loss — the latest aggregate wins.

create table if not exists public.engine_daily_report (
  slate_date date not null,
  scope text not null check (scope in ('midday','evening','allday')),
  -- counts from daily_intelligence rows where on_slate=true and mode is a ZK6 mode
  picks_count int not null default 0,
  hits_count int not null default 0,
  straights_count int not null default 0,
  boxes_count int not null default 0,
  -- rate = hits_count / picks_count, stored for fast read; 0 if no picks
  rate numeric(5,4) not null default 0,
  -- mean energy across the included picks; null if no picks
  mean_energy numeric(6,3),
  -- per-state breakdown: { "NY": { "picks": 30, "hits": 4 }, ... }
  jurisdictions jsonb not null default '{}'::jsonb,
  -- audit
  modes_included text[] not null default array['balanced','conservative','aggressive']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (slate_date, scope)
);

create index if not exists engine_daily_report_date_idx
  on public.engine_daily_report (slate_date desc);

-- RLS: anon can read (the admin tab surfaces this); writes are service-role only.
alter table public.engine_daily_report enable row level security;

drop policy if exists "anon can read engine daily report" on public.engine_daily_report;
create policy "anon can read engine daily report"
  on public.engine_daily_report for select
  to anon
  using (true);

-- Trigger to keep updated_at fresh.
create or replace function public.set_engine_daily_report_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists engine_daily_report_set_updated_at on public.engine_daily_report;
create trigger engine_daily_report_set_updated_at
  before update on public.engine_daily_report
  for each row execute function public.set_engine_daily_report_updated_at();
