-- ENG-AT-POSTED-01 (2026-10-15): the permutation actually posted on the slate
-- (snapshot pick.bestOrder). `combo` is the engine enumeration index and part of
-- the adaptive_tracking idempotency key, so it is never rewritten (BUG-155).
-- Applied to prod 2026-10-15 via MCP apply_migration (name: adaptive_tracking_posted_order).
alter table public.adaptive_tracking add column if not exists posted_order text;
comment on column public.adaptive_tracking.posted_order is
  'Straight order posted on the slate (snapshot pick.bestOrder). combo = engine enumeration index, never the posted order (BUG-155). Added 2026-10-15 ENG-AT-POSTED-01.';

-- Backfill as run on 2026-10-15 (pass 1: exact hash; pass 2: live snapshot by date/scope/mode/combo).
-- pass 1 → 3,274 rows · pass 2 → 13 rows · 0 NULL on/after the 2026-06-11 era floor.
with picks as (
  select distinct on (s.hash, s.slate_date, s.scope, s.mode, e->>'combo')
         s.hash, s.slate_date, s.scope, s.mode, e->>'combo' as combo, e->>'bestOrder' as best_order
  from slate_snapshots s, jsonb_array_elements(s.top_k_straights_json::jsonb) e
  where s.top_k_straights_json is not null and e->>'bestOrder' is not null
  order by s.hash, s.slate_date, s.scope, s.mode, e->>'combo', (s.deleted_at is null) desc, s.updated_at_et desc
)
update adaptive_tracking a set posted_order = p.best_order
from picks p
where a.posted_order is null and a.slate_hash = p.hash and a.slate_date = p.slate_date
  and a.scope = p.scope and a.mode = p.mode and a.combo = p.combo;

with live as (
  select distinct on (s.slate_date, s.scope, s.mode, e->>'combo')
         s.slate_date, s.scope, s.mode, e->>'combo' as combo, e->>'bestOrder' as best_order
  from slate_snapshots s, jsonb_array_elements(s.top_k_straights_json::jsonb) e
  where s.deleted_at is null and e->>'bestOrder' is not null
  order by s.slate_date, s.scope, s.mode, e->>'combo', s.updated_at_et desc
)
update adaptive_tracking a set posted_order = l.best_order
from live l
where a.posted_order is null and a.slate_date = l.slate_date and a.scope = l.scope
  and a.mode = l.mode and a.combo = l.combo;
