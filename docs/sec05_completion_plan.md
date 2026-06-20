# SEC-05 Completion Plan — Steps 2–4 (write-path hardening)

**Status (verified 2026-06-20):** Step 1 done — `admin-ops` gateway built, deployed (v1 ACTIVE, verify_jwt=true), source committed (`4b9be48`). **The hole is still OPEN:** every anon/public write policy is live and the gateway is dormant (zero callers). This is the pre-launch blocker. Design + write inventory: `docs/sec05_write_gateway_design.md`.

## De-risking findings (verified, change the plan)

1. **Both production edge fns write with `SUPABASE_SERVICE_ROLE_KEY`** — `compute-slate-zk6` (slate_snapshots, daily_intelligence, adaptive_tracking) and `run-hit-detection` (daily_intelligence, adaptive_tracking, slate_snapshots). Service-role bypasses RLS, so **dropping anon write policies will NOT break prod slate-gen or hit-detection.** The anon write policies on those 3 tables only ever served the client-side RN engine path (`engines/zk6.ts`), which prod does not use (`EXPO_PUBLIC_USE_EDGE_ZK6`).
2. Therefore the riskiest-looking drops (slate_snapshots / daily_intelligence / adaptive_tracking) are actually low-risk once the RN-path client writers migrate or are accepted as dev-only.

## Prerequisites (do first, ~30 min)

- [ ] **Confirm `ADMIN_OPS_KEY` secret is set** on the deployed `admin-ops` fn (`supabase secrets list`). If unset, the gateway 401s everything → set via `supabase secrets set ADMIN_OPS_KEY=...` (reuse the subscriber-admin key per design). Without this, Step 2 migrations fail closed.
- [ ] **Operator enters the ops key once** via AdminKeyGate (AsyncStorage) — same flow as subscriber-admin. Verify a single migrated write round-trips before bulk migration.
- [ ] Re-grep the write inventory fresh (design doc is 10 days old) — `grep -rnE "method: ?['\"](POST|PATCH|DELETE)" app/ lib/ hooks/ components/ engines/` — and bucket every call site by target table.

## Step 2 — Migrate operator writers → `adminOpsFetch`, then Step 3 drop policies, table-by-table

Order is by target table so each policy drop is unblocked only after its last writer migrates. **Never drop a policy before all its writers migrate** — operator imports/config saves break silently.

### 2a. `app_config` (highest blast radius — do first)
- Writers (verify): `components/admin/EngineConfigView.tsx` (3), `lib/applyWeightUpdate.ts`, any `lib/subscriberAdminClient.ts` config writes.
- Migrate each `fetchFromSupabase({method:'PATCH'/'POST'...})` → `adminOpsFetch(...)`. Reads stay on `fetchFromSupabase`.
- Smoke: open Engine Config, change a value, save, read back; confirm `app_config.updated_at` moved.
- **Drop:** `DROP POLICY allow_all_app_config ON app_config;` (+ the dead `"Admin update config"` authenticated policy).
- Verify: anon PATCH to app_config → 401/403; operator save (via gateway) still works; `get_advisors` no longer flags app_config.

### 2b. `histories`, `datasets_box`, `datasets_pair`, `imports`, `horizon_blends`, `percentile_maps`
- Writers (verify): `hooks/useDataIngestion.tsx` (~37 calls — the bulk), `components/admin/ImportWizard*`, `CoverageMatrix`, `app/import-wizard.tsx`, `app/(tabs)/admin-imports.tsx`, `lib/rebuildTrigger.ts`.
- Migrate; smoke the full Daily Workflow import (dry-run first) — box + pair rebuild, daily input import.
- **Drop** the `allow_all` policies on these 6 tables.
- Verify: anon write blocked; a real import round-trips; advisors clear for these tables.

### 2c. `daily_intelligence`, `slate_snapshots`, `adaptive_tracking` (lowest risk — edge fns are service-role)
- Client writers (verify): `lib/hitDetection.ts`, `lib/backfillIntelHits.ts`, `app/(tabs)/intelligence.tsx`, `engines/zk6.ts` RN path (8 calls — dev-only; prod uses edge fn).
- Decision: migrate the RN-path writers, OR accept the RN engine path as dev-only and gate it off in prod, since the edge fns already own these writes via service-role.
- **Drop:** `intelligence_update_anon`, `snapshots_update_anon`, `tracking_insert_anon` (+ the dead `*_authenticated` twins).
- Verify: a production slate-gen + hit-detection cycle still writes (service-role, unaffected); anon write blocked; advisors clear.

### `audit_logs`
- Currently `allow_all {public}`. Client writes config-change audit rows (EngineConfigView E8). Migrate those to the gateway (allowlist already includes `audit_logs`), then narrow/drop the public ALL policy. Lowest priority.

## Step 4 — Close
- [ ] `get_advisors` (security): zero always-true write findings outside the two intentional subscriber tables (`push_tokens`, `saved_slates`).
- [ ] `npm run rls:smoke` (if present; else a scripted anon-write-denied probe per table).
- [ ] MASTER_AUDIT: SEC-05 close entry with before/after policy list.
- [ ] Memory `sec05-write-hardening`: flip to RESOLVED.

## Risks / guardrails
- **Drop-before-migrate** → silent operator breakage. Mitigation: exhaustive per-table writer grep before each drop; smoke after migrate, before drop.
- **ADMIN_OPS_KEY unset** → all gateway writes 401. Mitigation: prereq check.
- **`hasRowFilter` is filter-present, not filter-narrow** — a migrated client could still do `id=neq.0` broad mutations. Acceptable (operator-only key), but consider tightening if a non-operator surface ever calls the gateway.
- **No prod regen / no auto-cron** rules still apply — migrations are client/policy changes, not engine changes; no slate regen needed.

## Effort
- Prereqs ~0.5h · 2a ~1.5h · 2b ~3–4h (useDataIngestion is the bulk) · 2c ~2h · Step 4 ~1h. **Total ~8–10h**, best split across 2 sessions (2a+2b, then 2c+close). Each step independently shippable and reversible (re-add the dropped policy to roll back).

## Definition of done
Anon key (bundled) can write ONLY `push_tokens` + `saved_slates` (column-scoped). All operator writes flow through `admin-ops`. Advisors clean. Production slate-gen, hit-detection, and operator Daily Workflow all still function.
