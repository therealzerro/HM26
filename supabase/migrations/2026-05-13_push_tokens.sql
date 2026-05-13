-- §1.4 phase 2 push pipeline foundation
-- Stores Expo push tokens per device-install with per-channel preferences.
-- Identity is device-level (HitMaster has no real user auth yet); tokens
-- are unique-per-device and refresh on each app open.

create table if not exists public.push_tokens (
  expo_push_token text primary key,
  device_id text,
  platform text check (platform in ('ios','android','web')),
  app_version text,
  -- per-channel opt-in mirrors notif_prefs in account.tsx
  prefs jsonb not null default jsonb_build_object(
    'nextDraw',  true,
    'slateReady',true,
    'hits',      true,
    'promo',     false
  ),
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_active_idx
  on public.push_tokens (active)
  where active = true;

-- RLS: anon role can upsert its own token (identified by the token itself
-- being the primary key), and update its prefs/active flag. No reads from
-- anon role — that's edge-function-only via the service role.
alter table public.push_tokens enable row level security;

drop policy if exists "anon can insert push token" on public.push_tokens;
create policy "anon can insert push token"
  on public.push_tokens for insert
  to anon
  with check (true);

drop policy if exists "anon can update own push token" on public.push_tokens;
create policy "anon can update own push token"
  on public.push_tokens for update
  to anon
  using (true)
  with check (true);

-- Trigger to keep updated_at fresh.
create or replace function public.set_push_tokens_updated_at()
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

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_push_tokens_updated_at();
