-- MKT-86 E3 (2026-10-15): onboarding touches per Pro member (day 1 / day 3 / day 21).
-- Ticked by the operator in Admin → Pro Subscribers; no member data leaves the app.
-- Applied to prod 2026-10-15 via MCP apply_migration (name: pro_onboarding_touches).
create table if not exists public.pro_onboarding_touches (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.pro_subscribers(id) on delete cascade,
  touch text not null check (touch in ('day1','day3','day21')),
  done_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  unique (subscriber_id, touch)
);
comment on table public.pro_onboarding_touches is 'MKT-86 E3: operator onboarding touches (day1/day3/day21) per Pro subscriber. Service-role only; no member data leaves the app.';
alter table public.pro_onboarding_touches enable row level security;
revoke all on public.pro_onboarding_touches from anon, authenticated;
grant select, insert, update, delete on public.pro_onboarding_touches to service_role;
