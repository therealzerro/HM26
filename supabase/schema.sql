-- HitMaster Database Schema - Complete Rewrite
-- This script completely rebuilds the database schema from scratch

-- Enable required extensions
create extension if not exists pgcrypto;

-- Drop all existing tables and views to start fresh
drop view if exists public.v_latest_slate_snapshots cascade;
drop view if exists public.v_recent_ledger cascade;
drop table if exists public.horizon_blends cascade;
drop table if exists public.percentile_maps cascade;
drop table if exists public.datasets_pair cascade;
drop table if exists public.datasets_box cascade;
drop table if exists public.histories cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.slate_snapshots cascade;
drop table if exists public.imports cascade;

-- Core imports table
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('box_history','pair_history','daily_input','ledger')),
  class_id integer,
  horizon_label text check (horizon_label in ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  scope text check (scope in ('midday','evening','allday')),
  file_meta jsonb,
  counts integer,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','deleted')),
  error_text text,
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index imports_type_idx on public.imports(type);
create index imports_status_idx on public.imports(status);
create index imports_created_at_idx on public.imports(created_at desc);
create index imports_deleted_at_idx on public.imports(deleted_at);

-- Slate snapshots table with ALL required columns
create table public.slate_snapshots (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('midday','evening','allday')),
  horizons_present_json jsonb not null default '{}'::jsonb,
  weights_json jsonb default '{}'::jsonb,
  top_k_straights_json jsonb default '[]'::jsonb,
  top_k_boxes_json jsonb default '[]'::jsonb,
  components_json jsonb default '[]'::jsonb,
  updated_at_et timestamptz not null default now(),
  snapshot_hash text not null default '',
  hash text not null default '',
  deleted_at timestamptz
);

create index slate_snapshots_scope_idx on public.slate_snapshots(scope);
create index slate_snapshots_updated_at_idx on public.slate_snapshots(updated_at_et desc);
create index slate_snapshots_hash_idx on public.slate_snapshots(hash);
create index slate_snapshots_snapshot_hash_idx on public.slate_snapshots(snapshot_hash);
create index slate_snapshots_deleted_at_idx on public.slate_snapshots(deleted_at);

-- Audit logs table
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target text not null,
  payload_meta jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_action_idx on public.audit_logs(action);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

-- Histories table
create table public.histories (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  game text not null,
  date_et date not null,
  session text not null check (session in ('midday','evening')),
  result_digits text not null,
  comboset_sorted text not null,
  created_at timestamptz not null default now(),
  unique (jurisdiction, game, date_et, session)
);

create index histories_jur_game_date_idx on public.histories(jurisdiction, game, date_et desc);

-- Box datasets table
create table public.datasets_box (
  id uuid primary key default gen_random_uuid(),
  class_id integer not null default 1,
  scope text not null check (scope in ('midday','evening','allday')),
  horizon_label text not null check (horizon_label in ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  key text not null,
  key_box text not null,
  ds_raw integer not null default 0,
  ds_normalized real not null default 0,
  times_drawn integer not null default 0,
  last_seen date,
  import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (class_id, scope, horizon_label, key)
);

create index datasets_box_class_scope_horizon_idx on public.datasets_box(class_id, scope, horizon_label);
create index datasets_box_key_idx on public.datasets_box(key);
create index datasets_box_key_box_idx on public.datasets_box(key_box);
create index datasets_box_scope_horizon_idx on public.datasets_box(scope, horizon_label);
create index datasets_box_import_id_idx on public.datasets_box(import_id);
create index datasets_box_deleted_at_idx on public.datasets_box(deleted_at);

-- Pair datasets table
create table public.datasets_pair (
  id uuid primary key default gen_random_uuid(),
  class_id integer not null check (class_id >= 2 and class_id <= 11),
  scope text not null check (scope in ('midday','evening','allday')),
  horizon_label text not null check (horizon_label in ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  key text not null,
  key_pair text not null,
  ds_raw integer not null default 0,
  ds_normalized real not null default 0,
  times_drawn integer not null default 0,
  last_seen date,
  import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (class_id, scope, horizon_label, key)
);

create index datasets_pair_class_scope_horizon_idx on public.datasets_pair(class_id, scope, horizon_label);
create index datasets_pair_key_idx on public.datasets_pair(key);
create index datasets_pair_key_pair_idx on public.datasets_pair(key_pair);
create index datasets_pair_scope_horizon_idx on public.datasets_pair(scope, horizon_label);
create index datasets_pair_import_id_idx on public.datasets_pair(import_id);
create index datasets_pair_deleted_at_idx on public.datasets_pair(deleted_at);

-- Percentile maps table
create table public.percentile_maps (
  id uuid primary key default gen_random_uuid(),
  class_id integer not null,
  scope text not null check (scope in ('midday','evening','allday')),
  horizon_label text not null check (horizon_label in ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  p99_cap real not null,
  percentile_map jsonb not null,
  import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (class_id, scope, horizon_label)
);

create index percentile_maps_class_scope_horizon_idx on public.percentile_maps(class_id, scope, horizon_label);
create index percentile_maps_import_id_idx on public.percentile_maps(import_id);
create index percentile_maps_deleted_at_idx on public.percentile_maps(deleted_at);

-- Horizon blends table
create table public.horizon_blends (
  id uuid primary key default gen_random_uuid(),
  class_id integer not null,
  scope text not null check (scope in ('midday','evening','allday')),
  available_horizons jsonb not null,
  weights jsonb not null,
  import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (class_id, scope)
);

create index horizon_blends_class_scope_idx on public.horizon_blends(class_id, scope);
create index horizon_blends_import_id_idx on public.horizon_blends(import_id);
create index horizon_blends_deleted_at_idx on public.horizon_blends(deleted_at);

-- Add foreign key constraints
alter table public.datasets_box
  add constraint datasets_box_import_fk foreign key (import_id)
  references public.imports(id) on delete set null;

alter table public.datasets_pair
  add constraint datasets_pair_import_fk foreign key (import_id)
  references public.imports(id) on delete set null;

alter table public.percentile_maps
  add constraint percentile_maps_import_fk foreign key (import_id)
  references public.imports(id) on delete set null;

alter table public.horizon_blends
  add constraint horizon_blends_import_fk foreign key (import_id)
  references public.imports(id) on delete set null;

-- Create views
create view public.v_latest_slate_snapshots as
select distinct on (scope)
  id,
  scope,
  horizons_present_json,
  weights_json,
  top_k_straights_json,
  top_k_boxes_json,
  components_json,
  updated_at_et,
  snapshot_hash,
  hash,
  deleted_at
from public.slate_snapshots
where deleted_at is null
order by scope, updated_at_et desc nulls last, id desc;

create view public.v_recent_ledger as
select
  jurisdiction,
  game,
  date_et,
  session,
  result_digits,
  comboset_sorted
from public.histories
order by date_et desc, created_at desc;

-- Create functions for key synchronization
create or replace function public.sync_box_keys() 
returns trigger 
language plpgsql 
security definer
as $$
begin
  if new.key_box is null or new.key_box = '' then
    new.key_box := new.key;
  end if;
  if new.key is null or new.key = '' then
    new.key := new.key_box;
  end if;
  return new;
end $$;

create or replace function public.sync_pair_keys() 
returns trigger 
language plpgsql 
security definer
as $$
begin
  if new.key_pair is null or new.key_pair = '' then
    new.key_pair := new.key;
  end if;
  if new.key is null or new.key = '' then
    new.key := new.key_pair;
  end if;
  return new;
end $$;

-- Create triggers
create trigger sync_box_keys_trigger 
  before insert or update on public.datasets_box
  for each row execute function public.sync_box_keys();

create trigger sync_pair_keys_trigger 
  before insert or update on public.datasets_pair
  for each row execute function public.sync_pair_keys();

-- Enable RLS on all tables
alter table public.imports enable row level security;
alter table public.slate_snapshots enable row level security;
alter table public.audit_logs enable row level security;
alter table public.histories enable row level security;
alter table public.datasets_box enable row level security;
alter table public.datasets_pair enable row level security;
alter table public.percentile_maps enable row level security;
alter table public.horizon_blends enable row level security;

-- Create RLS policies - Allow all operations for all users
create policy allow_all_imports on public.imports for all using (true) with check (true);
create policy allow_all_slate_snapshots on public.slate_snapshots for all using (true) with check (true);
create policy allow_all_audit_logs on public.audit_logs for all using (true) with check (true);
create policy allow_all_histories on public.histories for all using (true) with check (true);
create policy allow_all_datasets_box on public.datasets_box for all using (true) with check (true);
create policy allow_all_datasets_pair on public.datasets_pair for all using (true) with check (true);
create policy allow_all_percentile_maps on public.percentile_maps for all using (true) with check (true);
create policy allow_all_horizon_blends on public.horizon_blends for all using (true) with check (true);

-- Grant necessary permissions
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all functions in schema public to anon, authenticated;

-- Insert comprehensive test data to verify schema works
insert into public.slate_snapshots (
  scope, 
  snapshot_hash, 
  hash, 
  horizons_present_json,
  weights_json,
  top_k_straights_json,
  top_k_boxes_json,
  components_json
) values 
(
  'midday', 
  'test_hash_midday_001', 
  'test_hash_midday_001',
  '{"H01Y": true, "H02Y": true, "H03Y": false}',
  '{"H01Y": 0.6, "H02Y": 0.4}',
  '[{"combo": "123", "indicator": 0.95, "box": 0.85, "pburst": 0.78, "co": 0.72, "bestOrder": "straight", "multiplicity": "singles", "topPair": "12"}, {"combo": "456", "indicator": 0.92, "box": 0.78, "pburst": 0.69, "co": 0.65, "bestOrder": "straight", "multiplicity": "singles", "topPair": "45"}, {"combo": "789", "indicator": 0.88, "box": 0.72, "pburst": 0.61, "co": 0.58, "bestOrder": "straight", "multiplicity": "singles", "topPair": "78"}, {"combo": "012", "indicator": 0.84, "box": 0.68, "pburst": 0.55, "co": 0.52, "bestOrder": "straight", "multiplicity": "singles", "topPair": "01"}, {"combo": "345", "indicator": 0.81, "box": 0.64, "pburst": 0.51, "co": 0.48, "bestOrder": "straight", "multiplicity": "singles", "topPair": "34"}]',
  '[{"combo": "12", "indicator": 0.88, "box": 0.72, "pburst": 0.65, "co": 0.58}, {"combo": "45", "indicator": 0.84, "box": 0.68, "pburst": 0.61, "co": 0.54}]',
  '[{"combo": "123", "components": {"BOX": 0.85, "PBURST": 0.78, "CO": 0.72}, "temperature": 95, "multiplicity": "singles", "topPair": "12", "indicator": 0.95}, {"combo": "456", "components": {"BOX": 0.78, "PBURST": 0.69, "CO": 0.65}, "temperature": 92, "multiplicity": "singles", "topPair": "45", "indicator": 0.92}]'
),
(
  'evening', 
  'test_hash_evening_001', 
  'test_hash_evening_001',
  '{"H01Y": true, "H02Y": true, "H03Y": true}',
  '{"H01Y": 0.5, "H02Y": 0.3, "H03Y": 0.2}',
  '[{"combo": "789", "indicator": 0.97, "box": 0.91, "pburst": 0.84, "co": 0.78, "bestOrder": "straight", "multiplicity": "singles", "topPair": "78"}, {"combo": "012", "indicator": 0.89, "box": 0.82, "pburst": 0.75, "co": 0.69, "bestOrder": "straight", "multiplicity": "singles", "topPair": "01"}, {"combo": "345", "indicator": 0.86, "box": 0.78, "pburst": 0.71, "co": 0.65, "bestOrder": "straight", "multiplicity": "singles", "topPair": "34"}, {"combo": "678", "indicator": 0.83, "box": 0.74, "pburst": 0.67, "co": 0.61, "bestOrder": "straight", "multiplicity": "singles", "topPair": "67"}, {"combo": "901", "indicator": 0.80, "box": 0.70, "pburst": 0.63, "co": 0.57, "bestOrder": "straight", "multiplicity": "singles", "topPair": "90"}]',
  '[{"combo": "78", "indicator": 0.93, "box": 0.81, "pburst": 0.74, "co": 0.68}, {"combo": "01", "indicator": 0.87, "box": 0.75, "pburst": 0.68, "co": 0.62}]',
  '[{"combo": "789", "components": {"BOX": 0.91, "PBURST": 0.84, "CO": 0.78}, "temperature": 97, "multiplicity": "singles", "topPair": "78", "indicator": 0.97}, {"combo": "012", "components": {"BOX": 0.82, "PBURST": 0.75, "CO": 0.69}, "temperature": 89, "multiplicity": "singles", "topPair": "01", "indicator": 0.89}]'
),
(
  'allday', 
  'test_hash_allday_001', 
  'test_hash_allday_001',
  '{"H01Y": true, "H02Y": true, "H03Y": true, "H04Y": false}',
  '{"H01Y": 0.4, "H02Y": 0.35, "H03Y": 0.25}',
  '[{"combo": "345", "indicator": 0.968, "box": 0.88, "pburst": 0.81, "co": 0.75, "bestOrder": "straight", "multiplicity": "singles", "topPair": "34"}, {"combo": "678", "indicator": 0.941, "box": 0.84, "pburst": 0.77, "co": 0.71, "bestOrder": "straight", "multiplicity": "singles", "topPair": "67"}, {"combo": "901", "indicator": 0.915, "box": 0.80, "pburst": 0.73, "co": 0.67, "bestOrder": "straight", "multiplicity": "singles", "topPair": "90"}, {"combo": "234", "indicator": 0.892, "box": 0.76, "pburst": 0.69, "co": 0.63, "bestOrder": "straight", "multiplicity": "singles", "topPair": "23"}, {"combo": "567", "indicator": 0.868, "box": 0.72, "pburst": 0.65, "co": 0.59, "bestOrder": "straight", "multiplicity": "singles", "topPair": "56"}, {"combo": "890", "indicator": 0.845, "box": 0.68, "pburst": 0.61, "co": 0.55, "bestOrder": "straight", "multiplicity": "singles", "topPair": "89"}, {"combo": "123", "indicator": 0.821, "box": 0.64, "pburst": 0.57, "co": 0.51, "bestOrder": "straight", "multiplicity": "singles", "topPair": "12"}, {"combo": "456", "indicator": 0.798, "box": 0.60, "pburst": 0.53, "co": 0.47, "bestOrder": "straight", "multiplicity": "singles", "topPair": "45"}, {"combo": "789", "indicator": 0.774, "box": 0.56, "pburst": 0.49, "co": 0.43, "bestOrder": "straight", "multiplicity": "singles", "topPair": "78"}, {"combo": "012", "indicator": 0.751, "box": 0.52, "pburst": 0.45, "co": 0.39, "bestOrder": "straight", "multiplicity": "singles", "topPair": "01"}]',
  '[{"combo": "34", "indicator": 0.902, "box": 0.74, "pburst": 0.67, "co": 0.61}, {"combo": "67", "indicator": 0.879, "box": 0.70, "pburst": 0.63, "co": 0.57}]',
  '[{"combo": "345", "components": {"BOX": 0.88, "PBURST": 0.81, "CO": 0.75}, "temperature": 97, "multiplicity": "singles", "topPair": "34", "indicator": 0.968}, {"combo": "678", "components": {"BOX": 0.84, "PBURST": 0.77, "CO": 0.71}, "temperature": 94, "multiplicity": "singles", "topPair": "67", "indicator": 0.941}, {"combo": "901", "components": {"BOX": 0.80, "PBURST": 0.73, "CO": 0.67}, "temperature": 92, "multiplicity": "singles", "topPair": "90", "indicator": 0.915}]'
);

-- Force schema cache refresh
notify pgrst, 'reload schema';

-- Final verification
do $$
begin
  -- Verify all required columns exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'slate_snapshots' 
    and column_name = 'snapshot_hash'
  ) then
    raise exception 'FATAL: snapshot_hash column missing from slate_snapshots table';
  end if;
  
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'slate_snapshots' 
    and column_name = 'hash'
  ) then
    raise exception 'FATAL: hash column missing from slate_snapshots table';
  end if;
  
  raise notice 'SUCCESS: Schema rebuild complete. All required columns verified.';
end $$;