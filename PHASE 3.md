Phase 3 “Live Mode” Cutover + K6 Slate Not Regenerating (ZK6 on Real Data)
North Star

We are moving the app to Phase 3: live only. No mock data, no stubs. K6 must regenerate from the real imported datasets (Box + all 10 Pair classes) when H01Y coverage is met, and whenever Daily Input or Ledger arrives.

0) Hard switch to LIVE ONLY (disable mocks everywhere)

Environment flags

Set EXPO_PUBLIC_BACKEND=enabled

Ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are present.

Remove/disable any USE_MOCKS/DEV_ONLY flags in data hooks/components.

One place to decide “live vs mock”: dataMode = 'live' (constant).

Kill mock imports: Delete/disable any “sample JSON”, “fixtures”, or “demo pipelines”. All selectors, screens, and hooks must read from Supabase/Edge functions only.

Acceptance: In DevTools console, no component logs “using mock” or “sample”. All data fetches hit /rest/v1/* or your Edge RPCs.

1) Prove the minimum data to run K6 actually exists (All-Day scope first)

K6 requires H01Y present for all 11 classes in the active scope.

1.1 Coverage audit (SQL)

Run these and inspect results:

-- A) Show present H01Y coverage per class for the ACTIVE scope (e.g., 'allday')
with h as (
  select class_id, count(*) as rows
  from public.datasets_box
  where deleted_at is null and scope='allday' and horizon_label='H01Y'
  group by class_id
)
select 1 as class_id, coalesce((select rows from h where class_id=1),0) as rows_box;

with h as (
  select class_id, count(*) as rows
  from public.datasets_pair
  where deleted_at is null and scope='allday' and horizon_label='H01Y'
  group by class_id
)
select class_id, rows
from h
order by class_id;


We expect:

Box (class_id=1) → rows > 0

Pairs (class_id 2..11) → each rows > 0
If any is 0 → coverage is actually missing; that alone will block regeneration.

1.2 Horizon blends & percentiles present
-- Percentile maps/blends existence (adjust table names if you store elsewhere)
select * from public.horizon_blends where scope='allday' limit 20;
select * from public.percentile_maps where scope='allday' limit 20;


If empty for a class that has data, your normalization/blend step isn’t running. We’ll fix in §3.

2) Verify the Re-Generate Slate prechecks (button path)

K6 should never be silent. On press, run synchronous prechecks:

Precheck A — Coverage gate

If any class H01Y missing in the current scope → show a Reason Sheet listing the exact classes.

Precheck B — Input delta gate

Has anything changed since the last snapshot?

New/updated datasets_* rows (by updated_at / deleted_at)

New Daily Input rows for scope

New Ledger rows for scope

Normalization/blend version changed

If no deltas → show No-Op Sheet (“inputs unchanged”).

Precheck C — Materializer status

If a run is in progress → show “busy” sheet with ETA.

If all pass → Confirm modal → run.

Acceptance: Button yields one of: Confirm→Success (with snapshot hash), Reason Sheet, Busy, or No-Op. Never silence.

3) Normalize → Blend → Score wiring (ZK6 engine on real data)
3.1 Normalization (percentiles) per class × scope × horizon

Compute winsor cap P99 on ds_raw (DrawsSince).

Map ds_raw → ds_norm ∈ [0,1] via percentile rank (store in percentile_maps).

Persist the map (class, scope, horizon_label) so UI can display component bars.

Failure mode: If ds_norm is null or maps missing, ZK6 will yield zero/garbage. Ensure the map exists for all 11 classes @ H01Y.

3.2 Horizon blending

For each class × scope, blend H01Y..H0nY using your short-heavy geometric weights (sum=1).

If only H01Y exists → use H01Y normalization directly.

Persist a row in horizon_blends (class, scope) marking which horizons contributed.

Failure mode: H01Y exists but blend is empty → K6 thinks the class contributes 0.

3.3 ZK6 indicator inputs

For each combo ABC in scope:

BOX*: normalized DS for {A,B,C} using blended Box map.

PBURST*: best-order mean of Front(AB)+Back(BC)+Split(AC) using the relevant pair classes.

CO*: Any-Position unordered pairs {A,B}, {A,C}, {B,C} normalized.

Weights (Balanced default): BOX 0.40, PBURST 0.40, CO 0.20; apply multiplicity prior (Singles 0.00 / Doubles −0.02 / Triples −0.04).

Exclusions: remove today’s hitters (Daily), same-day winners (Ledger), and enforce pair repetition cap + session rails.

Failure mode: If any component returns null because its class lacks H01Y normalization map, K6 may return empty or won’t publish a new slate.

4) Make sure UI reads live everywhere (tabs/components)
4.1 Home / Slates

Slate cards must read from slate_snapshots (latest for scope) not local memory.

Component micro-bars (BOX / PBURST / CO) display real normalized 0–100 values.

Temperature badge maps Indicator percentiles to 0–100 via distribution cut points (p10→0, p90→100).

4.2 Explore

Combo/digit-set lookups query datasets_* (non-deleted) and show horizon coverage & pair breakdown from live tables.

4.3 Results (Ledger)

Pulls from ledger, shows winners feed; tapping a row shows derived pair events and updates impacting the slate.

4.4 Admin

Import & Health shows Box/Pair counts and Coverage Matrix from views that filter deleted_at IS NULL.

Re-Generate uses the precheck path and shows Confirm/Reason/Busy/No-Op outcomes.

Errors Drawer shows raw PostgREST bodies for last failures, with Retry.

Acceptance: All tabs render real data; no component references a stub, mock, or constant fallback.

5) Typical blockers (check and fix fast)

Coverage not genuinely complete

One of the 10 pair classes doesn’t have H01Y rows in this scope. Confirm with §1 queries. Import it.

Normalization/blend never ran

percentile_maps and/or horizon_blends are empty. Run the normalization step post-import and persist results.

Regen delta detector thinks “no changes”

Ensure you compare timestamps after import completes and maps/blends are updated; include Daily/ Ledger in the delta check.

RLS blocks snapshot write

If snapshot writes 403/401, your Admin write policy for slate_snapshots is missing. Add a simple Admin insert policy.

Soft-deleted rows still counted

Health/coverage queries must filter deleted_at IS NULL. Fix views that don’t.

Wrong class_id mapping

UI “pair class” → wrong class_id wrote to datasets_box instead of datasets_pair (or vice versa). Audit last imports by import_id and class_id; fix mapper.

Scope mismatch

You imported All-Day but you’re viewing Midday. Switch scope or re-import for the scope you’re regenerating.

6) Add a simple Run-2E Check (Admin → Health)

Display green checks for:

“H01Y present (11/11)”

“Percentiles ready (11/11)”

“Blends ready (11/11)”

“No mock sources detected”

“RLS ok for slate_snapshots insert”

“Delta detector sees changes since last snapshot”

Each row is clickable to the underlying query or detail drawer.

7) End-to-End Live Mode QA (All-Day scope; repeat for Midday/Evening)

Coverage: Import H01Y for Box and all 10 Pair classes → Coverage Matrix shows 11/11 ✓.

Normalize/Blend: Trigger normalization & blending → percentile_maps and horizon_blends populated for all 11 classes.

Regenerate: Press Re-Generate Slate → Confirm→Success; a new slate_snapshot is written; snapshot hash displayed.

Daily: Paste today’s hitters → next regen excludes them; component bars change as expected.

Ledger: Paste today’s results → next regen excludes winners and updates pair pressures; result sheet lists “Winners excluded: N”.

Delete/Undo: Soft delete last Pair import → Coverage drops → Regen shows Reason Sheet; Undo → Coverage back to 100% → Regen success.

Tabs: Home/Slates/Explore/Results/Admin show only live data; no mock logs; counts and coverage persist after app/API restart.

8) Definition of Done

K6 regenerates from real imported data with deterministic snapshot hash when coverage is met or Daily/Ledger changes land.

Coverage Matrix and Health match the database truth (non-deleted rows; per scope/horizon).

All tabs, functions, and components are wired to live queries; no mocks.

Regen button always yields: Confirm→Success (hash), Reason Sheet, Busy, or No-Op.

Normalization and blending exist for all 11 classes at H01Y; added horizons upgrade blends automatically.

End of prompt.
