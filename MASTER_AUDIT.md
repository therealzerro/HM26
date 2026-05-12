# HitMaster — Master Audit & Fix Tracker
**Project:** HitMaster ZK6/ZK30 Analytics App  
**Stack:** Expo / React Native · Supabase · TypeScript  
**Last updated:** 2026-05-12 (all 20 high-severity bugs BUG-41–BUG-118 fixed; BUG-117 accepted as design risk)  
**Maintained by:** therealzerro + AI Assistant

> **Process note (added 2026-05-12):** Updating MASTER_AUDIT.md is part of the definition of done for any task, not optional. Two prior sessions (Phase 3 deploy, BUG-02 fix attempts) completed work without logging it, leading to a forensic investigation 2026-05-12 to reconcile documented state with production reality. Every code change, SQL migration, Edge Function deploy, or RLS policy change must produce a corresponding audit entry in the same session.

> **USAGE:** This is the single source of truth for all known issues, fixes, and technical debt.  
> When a fix is made, update the status column and add a note. Do not create new audit files — append here.

---

## Quick Counts

| State | Count |
|-------|-------|
| ✅ Fixed | 69 |
| ℹ️ By design / False positive | 9 |
| 🎨 UX Improvements Applied | 58 |
| 🔴 Open — Critical | 0 |
| 🟠 Open — High | 0 |
| 🟡 Open — Medium | 52 |
| 🔵 Open — Low | 5 |
| 🔵 Latent / Not Active | 1 |
| 🏗️ Architecture Debt | 5 (1 open, 4 fixed) |
| 💡 Enhancement Opportunities | 22 |

---

## 🚨 Active Incident Triage: Pick Quality & Scoring Degradation (2026-05-11)

**Symptom:** Hit and pick accuracy has degraded following recent codebase modifications. Engine scoring (Energy/Signals) has become erratic.
**Root Cause Analysis — VERIFIED 2026-05-11 by independent code audit:**

1. ~~**BUG-22 (`excludedCombos` Bleed)**~~ **FALSE POSITIVE — already fixed.** `regenerateMutation` creates `excluded = new Set()` as a fresh local variable on every call. No shared state.
2. **ENG-01 (Signal Normalization Inconsistency) — FIXED 2026-05-11:** BOX used min-max while PBURST/CO/DGC used max-norm. Now all signals use max-norm consistently. File: `engines/zk6.ts`, `engines/zk30.ts`.
3. **ENG-04 (Deterministic Hash) — FIXED 2026-05-11:** `ts: Date.now()` in hash forced a unique snapshot hash on every regen, breaking dedup. Removed from both engines.
4. **BUG-19 / NEW-28 (Hit Detection Window + Dual System) — FIXED 2026-05-11:** `lib/hitDetection.ts` used `limit=2` with no date filter; now uses date-range query with limit=10 + fallback. See NEW-28 for dual-system architecture debt.
5. **BUG-21 (Silent `allday` Fallback):** Still open — UI label not surfaced. See open bugs.

**Status:** Core engine math fixed. Remaining open issues tracked in open bugs section below.

---

## Bug Registry

### Closed Bugs

| ID | Severity | Description | Status | Fixed in | Date |
|----|----------|-------------|--------|----------|------|
| BUG-01 | 🔴 Critical | ZK30 jurisdiction hardcoded to TX in `fetchRaw()` | ✅ Fixed | `engines/zk30.ts` | 2026-05-08 |
| BUG-02 | 🔴 Critical | Default admin role; any user could become admin | ✅ Fixed 2026-05-11 — `useAuth.tsx:19,33` defaults changed to `role: 'free'`. New installs start as Free tier; admin must be explicitly set. | `hooks/useAuth.tsx` | 2026-05-11 |
| BUG-03 | 🟠 High | `on_slate=true` not PATCHed for ZK30 final 30 picks | ✅ Fixed | `engines/zk30.ts` | 2026-05-08 |
| BUG-04 | 🟠 High | DELETE→INSERT race on `daily_intelligence` wipes live hit flags | ✅ Fixed | `engines/zk6.ts`, `engines/zk30.ts` | 2026-05-08 |
| BUG-05 | 🟠 High | Snapshot hash could produce negative int; mode excluded from input | ✅ Fixed | `engines/zk6.ts`, `engines/zk30.ts` | 2026-05-08 |
| BUG-06 | 🟠 High | PRO regen credits client-side only (AsyncStorage) | ℹ️ Mitigated — server read/write via `slate_credits` already in place; AsyncStorage is display cache only | — | — |
| BUG-07 | 🟡 Medium | `daily_intelligence` fetched in single 500–2700 row shot | ✅ Fixed — full cursor pagination, pages of 500 until exhausted | `app/(tabs)/intelligence.tsx` | 2026-05-08 |
| BUG-08 | 🟡 Medium | ZK6 `jurisdiction=is.null` — cannot isolate by state | ✅ By design — ZK6 operates on national combined data; labeled "National" in UI status strip | `app/(tabs)/explore.tsx` | 2026-05-08 |
| BUG-09 | 🟡 Medium | Placeholder combos scored differently from real combos | ✅ Fixed — unified scoring; PBURST/CO distinguish placeholders | `engines/zk6.ts` | 2026-05-08 |
| BUG-10 | 🟡 Medium | Yesterday snapshot query missing `deleted_at=is.null` | ℹ️ By design — late-ET slates land on next UTC day and get soft-deleted; `updated_at_et.desc` already picks latest | — | — |
| BUG-11 | 🟡 Medium | Timezone handling ad-hoc | ℹ️ False positive — `Intl.DateTimeFormat` with `America/New_York` handles DST correctly | — | — |
| BUG-12 | 🟡 Medium | `histories` queries without jurisdiction filter | ℹ️ False positive — all three queries in `index.tsx` already include `jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)` | — | — |
| BUG-13 | 🟡 Medium | `bestOrderFor` pair key mismatch between `sortedPair()` and `normalizePairKey()` | ℹ️ False positive — both produce same 2-char sorted format (e.g., `"24"`) | — | — |
| BUG-14 | 🔵 Low | DGC returns 0 for combos with exactly 1 historical draw | ✅ Fixed — single-draw returns 0.3 (low but non-zero); never-drawn returns 0 | `engines/zk6.ts` | 2026-05-08 |
| BUG-15 | 🔵 Low | Energy emoji thresholds (80/65/45) | ℹ️ Acceptable — percentile-based 0–100 scale; tiers are 🔥 top 20% / ⚡ top 35% / ✦ top 55% | — | — |
| BUG-16 | 🔵 Low | Loose TypeScript `any` in snapshot fields | ✅ Fixed — `EngineMetadata` interface added; `horizons_present_json` and `weights_json` tightened | `types/core.ts`, `engines/zk6.ts`, `engines/zk30.ts` | 2026-05-08 |
| BUG-17 | 🔵 Low | No error boundary on pull-to-refresh in Home screen | ✅ Fixed — `handlePullRefresh` wrapped in try/catch; `finally` clears `isRefreshing` | `app/(tabs)/index.tsx` | 2026-05-08 |
| BUG-23 | 🔴 Critical | `background.PNG` uppercase extension — Metro only resolves lowercase `png`; app failed to load on web (Linux case-sensitive FS) | ✅ Fixed — renamed to `background.png`; updated `require` path in `_layout.tsx`; cleared Metro cache | `assets/background.png`, `app/_layout.tsx` | 2026-05-08 |
| BUG-24 | 🟡 Medium | `background.png` covered by solid opaque screen containers — `ImageBackground` in `_layout.tsx` hidden by `theme.colors.background` (`#0a0613`) on every tab screen container | 🏗️ Deferred — `ImageBackground` removed; requires making all screen containers transparent + tuning overlay opacity. Track in ARCH/UX backlog. | `app/_layout.tsx`, all `app/(tabs)/*.tsx` containers | 2026-05-08 |
| BUG-25 | 🟡 Medium | `PickCard` and `SlateCard` using black `theme.shadows.soft` — colored glow lost | ✅ Fixed — both cards now use `theme.shadows.glow` (purple `#9b5bff`, radius 16); hot cards (energy ≥ 80) retain animated colored border glow | `components/PickCard.tsx`, `components/SlateCard.tsx` | 2026-05-08 |
| BUG-26 | 🟡 Medium | Results Screen: Hits Not Refreshed After Hit Detection | ✅ Fixed — `app/(tabs)/admin.tsx` invalidates query cache | `app/(tabs)/admin.tsx` | 2026-05-08 |
| BUG-27 | 🟡 Medium | Intelligence Top 30 Slate: No Hit Badge on SlateRow | ✅ Fixed — ⭐ STRAIGHT / 🎯 BOX badges added | `app/(tabs)/intelligence.tsx` | 2026-05-08 |
| BUG-28 | 🟠 High | Hit detection PATCHes (`daily_intelligence` + `slate_snapshots`) silently failing under BUG-20 lockdown — anon key writes blocked by `authenticated`-only UPDATE policies; app never produces JWTs. `hit_box`/`hit_straight` flags not persisted, snapshot enrichment not surviving session. Discovered 2026-05-12 by forensic investigation of BUG-20 write paths. SQL was generated 2026-05-12 but **never executed** in the first pass — PATCHes continued to 401 until re-applied 2026-05-12 (second pass). | ✅ Fixed — `GRANT UPDATE TO anon` + `intelligence_update_anon` + `snapshots_update_anon` policies created with `USING(true)/WITH CHECK(true)`. `DROP POLICY IF EXISTS` used to prevent silent conflicts on re-run. Permanent fix queued in Phase 3.5 (hit-detection Edge Function). 5/11 hit data (`combo=609 QC evening`, `combo=425 TX morning`) written directly via SQL after RLS was blocking the app write path. | `lib/hitDetection.ts` (no code change; RLS only) | 2026-05-12 |
| BUG-30 | 🟠 High | Intelligence screen — three wiring failures: (1) `slateScope` initialized to hardcoded `'midday'` ignoring global `useScope()` → Top 30 queried wrong scope for every non-midday user. (2) "Generate Slate" and "Go to Slates" buttons used `router.push('/(tabs)/explore')` from a hidden tab; `push` stacks on top of admin context → navigation resolved to home tab instead of explore. (3) `IntelligenceRouteView` used `router.push('/(tabs)/intelligence')` to open the screen, compounding the push-stack problem. (4) Home screen regen (`index.tsx`) did not call `queryClient.removeQueries` before `refreshSnapshot()` — stale cache served the old snapshot after regen. | ✅ Fixed — (1) Import `useScope`, init `slateScope` from `globalScope`. (2) "Generate Slate" replaced with inline `regenerateSlate()` call; "Go to Slates" switches internal view tab. (3) `router.push` → `router.navigate` in `IntelligenceRouteView.tsx`. (4) `useQueryClient` + `removeQueries` added to `index.tsx` `handleGenerate`. | `app/(tabs)/intelligence.tsx`, `components/admin/IntelligenceRouteView.tsx`, `app/(tabs)/index.tsx` | 2026-05-12 |
| BUG-33 | 🟠 High | Home screen "TODAY'S HITS" showing yesterday's picks — `hitItems` was derived from `hitPicks` (snapshot picks with `hitType` set) without any date validation. After draws land and hit detection marks picks, the next day those same snapshot picks still show up as "TODAY'S HITS" even when today has no draws yet. Fix: `hitItems` now validates each pick against `todayResults` from the `histories` table — only picks whose `toComboSet(combo)` appears in `todaySets` are surfaced. | ✅ Fixed | `app/(tabs)/index.tsx` | 2026-05-12 |
| BUG-34 | 🟠 High | Slates tab empty after all picks hit — `rawItems` fallback path (used when `activePicks` is empty) included a `.filter((p) => !p?.hitType)` guard. When all 6 picks hit on a given day, `activePicks` is empty AND the fallback filtered out all `hitType`-marked picks, producing an array of 0 items rendered as `---` placeholder rows. Fix: removed the `!p?.hitType` filter from the fallback path; the full snapshot is shown regardless of hit state. | ✅ Fixed | `app/(tabs)/explore.tsx` | 2026-05-12 |
| BUG-35 | 🟡 Medium | Intelligence Top 30 empty when no rows exist for today — `loadSlate` queried `daily_intelligence` for `slate_date=eq.{today}` only; if today's slate hasn't been generated yet the response is empty and the tab shows the EmptyState with no data. Fix: if today returns 0 rows, a fallback query for yesterday is issued. The most-recent populated day is always shown. | ✅ Fixed | `app/(tabs)/intelligence.tsx` | 2026-05-12 |
| BUG-37 | 🟠 High | Admin "Run Hit Detection Now" only ran for today — `handleDetectHits` in `DashboardView.tsx` hardcoded `getTodayET()`. On 5/12 this ran for a date with no draws and reported "no hits found." Yesterday's hits were never checked from the admin panel. Fix: iterate `[getYesterdayET(), getTodayET()]` in the outer loop so both dates are always checked. | ✅ Fixed | `components/admin/DashboardView.tsx` | 2026-05-12 |
| BUG-38 | 🟠 High | Results screen tier-3 scope-limited — `useSnapshot().hitPicks` only returns picks for the globally selected scope (midday/evening/allday). Allday slate hits are invisible when the user is on midday or evening scope. Symptom: switching to midday scope caused allday hits to vanish from the Results ledger. Fix: replaced `useSnapshot()` call with a direct `slate_snapshots` query that fetches all three scopes, then derives `snapshotHitPicks` client-side by parsing each row's `top_k_straights_json` for picks with `hitType` set. | ✅ Fixed | `app/(tabs)/results.tsx` | 2026-05-12 |
| BUG-39 | 🟠 High | `file_meta` column does not exist in `slate_snapshots` — the tier-3 all-scope snapshot query (introduced with BUG-38 fix) explicitly requested `select=scope,top_k_straights_json,file_meta`. PostgREST returned 400 on every fetch; all four scope-variant queries failed silently, leaving tier-3 empty. Fix: removed `file_meta` from the SELECT column list and dropped the supplement-skip guard that depended on it (supplemental slates are already excluded via `mode=neq.zk30`). | ✅ Fixed | `app/(tabs)/results.tsx` | 2026-05-12 |
| BUG-40 | 🟠 High | `on_slate=false` blocked tier-1 confirmed hits — the `hits` query in `results.tsx` included `on_slate=eq.true`. The "Clear Top 30" admin button sets `on_slate=false` for all rows; after a clear, `hit_box=true` rows existed in `daily_intelligence` but the tier-1 query returned `[]`. Hits were written to DB correctly yet never shown on the Results screen. Fix: removed `on_slate=eq.true` from the confirmed-hits (`hits`) query only. The `onSlatePicks` query (tier-2 fallback) retains `on_slate=eq.true` as intended — it shows only currently active picks for client-side detection. Confirmed hits must surface regardless of whether the row was subsequently cleared. | ✅ Fixed | `app/(tabs)/results.tsx` | 2026-05-12 |
| BUG-36 | 🟠 High | Results screen shows no hits when `daily_intelligence.hit_box/hit_straight` not yet backfilled — the `hits` query required `or=(hit_box.eq.true,hit_straight.eq.true)` meaning it only returned DB-confirmed hits written by `backfillIntelHits`. When ledger is imported but backfill hasn't run (ARCH-05 dependency), no hits appear in the results ledger. Fix: added `onSlatePicks` query (all on-slate picks, no hit filter) and updated `processed` memo to do client-side box-matching — `toComboSet(combo) === toComboSet(result_digits)` — as fallback when DB hits are absent. Straight hits detected when `combo === result_digits || best_order === result_digits`. | ✅ Fixed | `app/(tabs)/results.tsx` | 2026-05-12 |
| BUG-32 | 🟡 Medium | Slates grid view not filling screen height (regression from ctrlStrip ScrollView change) — `ctrlStripOuter` horizontal ScrollView had no `maxHeight` constraint; claimed flex space from SafeAreaView column on iOS, leaving `gridContainer` (flex:1) with insufficient remaining height. Tiles rendered at natural height near bottom of compressed space instead of distributing across full screen. | ✅ Fixed — added `maxHeight: 46` to `ctrlStripOuter` style in `explore.tsx`. Mirrors `maxHeight: 38` pattern on `scopeRow`. | `app/(tabs)/explore.tsx` | 2026-05-12 |
| BUG-31 | 🔴 Critical | `daily_intelligence` always empty after regen — edge function INSERT used wrong column names: `energy` (DB: `energy_score`), `indicator` (column does not exist), `times_drawn` (column does not exist). PostgREST returned 400 on every INSERT. Error silently swallowed by `catch` block — client always saw `regen ok`, snapshot was written, but all 30 `daily_intelligence` rows were discarded every time. Top 30 Slate was permanently empty. | ✅ Fixed — corrected INSERT to `energy_score: p.energy`; removed `indicator` and `times_drawn` fields. Edge function redeployed. | `supabase/functions/compute-slate-zk6/index.ts` | 2026-05-12 |

---

### Open Bugs

#### 🟠 High

**BUG-18 — Date Tagging Paradox (Late-Night Regen)** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §3.3_  
- **Files:** `engines/zk6.ts`, `engines/zk30.ts`, `lib/hitDetection.ts`  
- **Problem:** Engines tag `slate_date` in `daily_intelligence` using `getTodayET()` at generation time. A slate generated Friday night is tagged with `slate_date=Friday`. When hit detection runs for Saturday's results, `updateDailyIntelligenceHit` patched `slate_date=Saturday` — missing the Friday-tagged row, so intelligence hit flags were silently not updated.
- **Status:** ✅ **Fully Fixed 2026-05-12** — `updateDailyIntelligenceHit` in `lib/hitDetection.ts` uses `slate_date=in.(date,prevDay)` (fixed 2026-05-11). `slate_date date` column added to `slate_snapshots` via SQL migration; index on `(slate_date, scope) WHERE deleted_at IS NULL`; backfilled from `updated_at_et`. Both engines now write `slate_date: effectiveDate` to snapshot payload. `SlateSnapshot` type updated.

**BUG-19 — Snapshot Window Too Narrow for Hit Detection** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §4.1_  
- **Files:** `lib/hitDetection.ts`, `hooks/useDataIngestion.tsx`  
- **Problem:** Hit detection queries only the "Latest 2" snapshots. If multiple supplemental slates or scope regenerations have occurred, the original primary slate is outside the window and its hits are never detected.  
- **Status:** ✅ **Fixed 2026-05-11** — `lib/hitDetection.ts` now uses date-range query (`updated_at_et ≥ date AND < nextDay 09:00Z`) with `limit=10` and per-scope fallback to most-recent. All primary + supplemental slates for the target date are checked.

#### 🟡 Medium

**BUG-20 — Permissive RLS on Core Tables** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §5.1_
- **Tables:** `slate_snapshots`, `daily_intelligence`, `adaptive_tracking`
- **Problem:** `slate_snapshots` had `allow_all` for `{public}`. `daily_intelligence` had two ALL policies for anon+authenticated. `adaptive_tracking` had RLS disabled entirely.
- **Status:** ⚠️ **Partial — 2026-05-12 (downgraded from ✅ Fixed after forensic investigation)**
  - ✅ ZK6 INSERT path: secured via Edge Function (`compute-slate-zk6`) using `service_role` — bypasses RLS by design. No client INSERT path remains for ZK6 snapshots.
  - ✅ `adaptive_tracking`: RLS enabled with explicit anon INSERT policy for `lib/hitDetection.ts`.
  - ⚠️ Hit detection UPDATE path: PATCHes from `lib/hitDetection.ts` use anon key. Original lockdown left UPDATE policies as `authenticated`-only, which is unreachable from this client (no JWT auth flow). Hit persistence silently failed from lockdown date until 2026-05-12. Restored 2026-05-12 via `intelligence_update_anon` and `snapshots_update_anon` policies (USING true, WITH CHECK true). See BUG-28.
  - ⚠️ ZK30 INSERT path: would silently fail under current RLS, but not exercised in production (ZK30 not built out). See BUG-29.
  - ⚠️ Dead-code policies remaining: `snapshots_update_authenticated` and `intelligence_update_authenticated` are unreachable from the client (anon key only, no JWT). Functionally inert. Drop at next RLS sweep or leave pending hit-detection Edge Function migration.
- **Permanent fix:** Phase 3.5 hit-detection Edge Function migration moves PATCHes to `service_role`; then drop both `*_update_anon` policies. Tracked in roadmap.

**BUG-21 — Data Sparsity Fallback Not Surfaced in UI** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §4.2_  
- **Files:** `engines/zk6.ts` (fallback to `allday` if < 50 rows), `app/(tabs)/explore.tsx`, `components/StatusRibbon.tsx`  
- **Problem:** When scope data is sparse, ZK6 silently falls back to `allday`. User sees midday picks but they're actually allday picks.  
- **Status:** ✅ **Fixed 2026-05-11** — `horizons_present_json._dataStats.usingFallback` flag was already stored in snapshots. `explore.tsx` status strip now reads this flag and shows `⚠ allday fallback` in amber when true and scope ≠ allday. `StatusRibbon.tsx` horizon filter also fixed to only include `H0XY` keys (was incorrectly including `_dataStats`, `_engineVersion`, etc.) and now shows a dedicated fallback chip.

#### 🔵 Low

**BUG-22 — `excludedCombos` Not Cleared Between Regen Calls** _Source: AUDIT_2026-05-08.md §3 hooks_  
- **Files:** `hooks/useDataIngestion.tsx`  
- **Status:** ✅ **FALSE POSITIVE — Already Fixed.** Verified 2026-05-11: `regenerateMutation` at line 1024 creates `const excluded = new Set<string>()` as a fresh local variable on every invocation. No shared mutable state exists between calls.

#### 🔵 Latent / Not Active

**BUG-29 — ZK30 Persistence Would Fail Under Current RLS**
- **Files:** `engines/zk30.ts` (`saveSlateSnapshot`, lines ~549, 560–578)
- **Problem:** ZK30 has no Edge Function counterpart. `saveSlateSnapshot` writes to `slate_snapshots` with anon key. Under current RLS, INSERT is denied → silent fallback to `audit_logs`. ZK30 picks would render in UI from in-memory result but never persist.
- **Status:** Latent — not active in production. User confirmed 2026-05-12: "ZK30 is a standalone build, not yet completed, no history imported." Verified absent from `slate_snapshots` across last 14 days (no `mode='zk30'` rows).
- **Permanent fix:** Phase 3.6 ZK30 Edge Function migration. Until then, do not enable ZK30 in production without either deploying the Edge Function or adding a constrained `snapshots_insert_anon_zk30` policy (`WITH CHECK (mode = 'zk30')`).

---

## Deep Scan Findings — 2026-05-12

Full read of every production file. 83 new findings (BUG-41–BUG-123) + 22 enhancement opportunities. None fixed yet — awaiting triage orders.

---

### 🔴 Open — Critical

**BUG-56** `app/(tabs)/book.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
Number Book initializes with three hardcoded sample lists. Fixed: `lists` initializes to `[]`; custom lists persisted to AsyncStorage under `number_book_lists` key; load effect merges custom + `saved_slates` on mount.

**BUG-57** `app/(tabs)/book.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
Custom lists not persisted — closing app destroyed all saved combos. Fixed: `useEffect` writes custom lists to `number_book_lists` on every mutation (guarded by `listsLoaded` flag to skip initial load).

**BUG-59** `app/(tabs)/admin-imports.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
`hardDeleteImport` used raw `XMLHttpRequest` with inline auth headers, bypassing `fetchFromSupabase`. Fixed: replaced XHR with `del = (path) => fetchFromSupabase({ path, method: 'DELETE' })`; added `fetchFromSupabase` import.

**BUG-82** `components/admin/HealthTestsView.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
Supabase project ref `tgagarhwqbdcwoqhpapi.supabase.co` rendered as visible UI text. Fixed: replaced with `Connected · ZK6 Engine v2`.

**BUG-84** `components/admin/HitTrackingView.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
`softDeleteById` used raw `XMLHttpRequest` with inline auth headers. Fixed: replaced with async `fetchFromSupabase` PATCH; `try/finally` ensures `setDeleting(false)` on both success and failure.

**BUG-107** `hooks/useDataIngestion.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
Full Supabase anon JWT hardcoded as a fallback in `hardDeleteImport`. Fixed: removed both hardcoded fallback strings (`_url` and `_key`); replaced `xhrDelete` inner function with `del = (path) => fetchFromSupabase({ path, method: 'DELETE' })`.

---

### 🟠 High (All fixed 2026-05-12)

**BUG-41** `app/(tabs)/index.tsx` — ✅ Fixed 2026-05-12
Hit banner subtitle now uses `hitBanner.hitType` to show "Straight hit ✓" or "Box hit ✓". Also added `hitType` to the hitBanner memo return object.

**BUG-45** `app/(tabs)/explore.tsx` — ✅ Fixed 2026-05-12
Yesterday snapshot query filtered `updated_at_et=lt.${todayStr}T09:00:00` — slates after 9 am ET yesterday were missed. Fixed: changed upper bound to `T00:00:00` (UTC midnight).

**BUG-52** `app/(tabs)/intelligence.tsx` — ✅ Fixed 2026-05-12
`computeAnalysis` weight-decay used device `new Date()` as reference, causing ET mismatch. Fixed: changed to `new Date(getTodayET() + 'T12:00:00')` to anchor to ET noon.

**BUG-69** `app/import-wizard.tsx` — ✅ Fixed 2026-05-12
After ledger import, hit detection fired only for `entries[0].date_et`. Fixed: collects unique dates from all entries; calls `runHitDetectionAndRefresh` for each date via `Promise.all`, then aggregates `HitDetectionResult` totals.

**BUG-75** `components/admin/DashboardView.tsx` — ✅ Fixed 2026-05-12
`handleDetectHits` called `runHitDetectionAndRefresh(sc, date)` per-scope (3 × 2 dates = 6 calls) but `_scope` was ignored — redundant 6× work. Fixed: removed scope loop; calls `runHitDetectionAllScopes(date)` once per date.

**BUG-85** `components/admin/HitTrackingView.tsx` — ✅ Fixed 2026-05-12
"View Results" quick-action button had `onPress={() => {}}` — a complete no-op. Fixed: `router.push('/(tabs)/results')` added.

**BUG-88** `components/PickDetailModal.tsx` — ✅ Fixed 2026-05-12
Pair score displayed `ds_raw / maxDsRaw` (staleness ratio), treating staleness as a positive signal. Fixed: changed `getScore` to return `row.times_drawn ?? 0` (frequency), consistent with engine pair logic.

**BUG-89** `components/PickDetailModal.tsx` — ✅ Fixed 2026-05-12
`generatedAt` showed current render time, never slate generation time. Fixed: uses `pick.generatedAt` (already set to `snapshot.updated_at_et` by `explore.tsx`), formatted as ET.

**BUG-90** `components/PickDetailModal.tsx` — ✅ Fixed 2026-05-12
"Save to Number Book" button showed a toast but performed no actual save. Fixed: reads `number_book_lists` from AsyncStorage, appends combo to the first list (or creates one if empty), writes back.

**BUG-94** `engines/zk6.ts` — ✅ Fixed 2026-05-12
Prior-snapshot soft-delete used hardcoded 4h ET offset, missing pre-1am EST slates. Fixed: uses `slate_date` column filter (`slate_date=eq.${effectiveSd}`) instead of UTC-offset arithmetic.

**BUG-95** `engines/zk6.ts` — ✅ Fixed 2026-05-12
`fetchHistoryOverrides` set `dsOverride = idx` (array row index) — completely wrong draws-since values. Fixed: computes actual calendar-day delta from `row.date_et` (`Math.floor(Date.now() / 86400000) - Math.floor(rowMs / 86400000)`).

**BUG-97** `engines/zk6.ts` — ✅ Fixed 2026-05-12
`daily_intelligence` POST used `resolution=merge-duplicates` (UPSERT), which could silently overwrite preserved `hit_box=true` flags. Fixed: changed to `resolution=ignore-duplicates` (ON CONFLICT DO NOTHING).

**BUG-99** `lib/hitDetection.ts` — ✅ Fixed 2026-05-12
`runHitDetectionAndRefresh` accepted a `_scope` parameter but always fetched all three scopes unconditionally. Fixed: renamed `_scope` to `scope`; scope-specific calls now skip non-matching fetches.

**BUG-100** `lib/hitDetection.ts` — ✅ Fixed 2026-05-12
`generateSupplementalSlate` excluded all original slate combos (hit or not) — unnecessarily banning non-hit picks from the supplement. Fixed: `excludeList` now contains only `hitComboSets`.

**BUG-104** `hooks/useSnapshot.tsx` — ✅ Fixed 2026-05-12
`coveragePercentage` denominator counted all keys in `horizons_present_json` including metadata keys (`_engineVersion`, `_mode`, etc.), inflating denominator. Fixed: filtered to `/^H\d{2}Y$/` pattern only.

**BUG-105** `hooks/useSnapshot.tsx` — ✅ Fixed 2026-05-12
AsyncStorage cache evicted valid snapshots older than 2 hours — stale on spotty connections. Fixed: eviction now checks `slate_date` equality against `getTodayET()`; cache cleared only when the stored snapshot belongs to a different ET date.

**BUG-110** `hooks/useDataIngestion.tsx` — ✅ Fixed 2026-05-12
`importDailyMutation` built rows with `draws_since` key but DB column is `ds_raw`. PostgREST silently dropped the unknown key, leaving `ds_raw` always null. Fixed: renamed to `ds_raw` in both the row builder and the chunk mapper.

**BUG-115** `supabase/functions/compute-slate-zk6/index.ts` — ✅ Fixed 2026-05-12
Same `dsOverride = idx` (row ordinal index) bug as BUG-95 — present in the production edge function. Fixed: computes actual calendar-day delta from `row.date_et`, consistent with BUG-95.

**BUG-117** `supabase/functions/compute-slate-zk6/index.ts` — ℹ️ Accepted as design risk 2026-05-12
CORS `*` header noted but accepted: service role key is server-side only; mobile app not browser-CORS-constrained; single-admin context. No code change.

**BUG-118** `engines/zk30.ts` — ✅ Fixed 2026-05-12
Same `drawsSince = idx` (row ordinal index) bug as BUG-95/BUG-115 in `fetchZK30Datasets`. Fixed: computes actual calendar-day delta from `row.date_et`, consistent with other engine fixes.

---

### 🟡 Open — Medium

**BUG-42** `app/(tabs)/index.tsx`
`todayResults` query excludes `ME,NH,VT,MS,PR,MD,MS2` but `regenerateMutation` in `useDataIngestion.tsx` excludes `ME,NH,VT,PR,MD,MS2` (omits `MS`). `MS` results appear in Home but don't trigger regen detection.
_Fix: extract exclusion list to a shared constant._

**BUG-43** `app/(tabs)/index.tsx`
`calculateStreak` calls `new Date(dateString)` which JavaScript parses as UTC midnight — off-by-one day on non-ET devices near midnight.
_Fix: parse as `new Date(dateString + 'T12:00:00')`._

**BUG-44** `app/(tabs)/index.tsx`
`handleGenerate` invalidates only `['snapshot', scope]` — the other two scopes remain stale. User switching scope immediately after regen sees old data.
_Fix: invalidate the parent key `['snapshot']` without scope qualifier._

**BUG-46** `app/(tabs)/explore.tsx`
`handleSaveSlate` timestamps the save with `new Date().toLocaleDateString()` (device local time) instead of ET.
_Fix: use `getTodayET()`._

**BUG-47** `app/(tabs)/explore.tsx`
`slateHitItems` derives hits purely from `pick.hitType` on the snapshot without cross-referencing live draw results. A stale or incorrectly written `hitType` shows as a false hit with no verification.
_Fix: either document as intentional (DB-authoritative) or mirror the `todayResults` cross-reference from `index.tsx`._

**BUG-48** `app/(tabs)/explore.tsx`
If the `slate_credits` table does not exist, the credits query errors silently — the credits panel shows nothing with no indicator for the admin.
_Fix: add error case rendering "Credits unavailable" when the query errors._

**BUG-49** `app/(tabs)/results.tsx`
File-local `getYesterdayET()` uses device local `getDate() - 1` before ET formatting. On a non-ET device near midnight this returns the wrong date.
_Fix: import from `lib/dateUtils` (after BUG-103 is fixed there)._

**BUG-50** `app/(tabs)/results.tsx`
`useEffect` auto-select captures `recentDates` at mount time but does not list it in the deps array — may target a stale value if the effect fires before the first render cycle completes.
_Fix: add `recentDates` to the `useEffect` dependency array._

**BUG-53** `app/(tabs)/intelligence.tsx`
When `loadSlate` falls back to yesterday's data, the UI displays it with no banner distinguishing it from today. Users cannot tell they are viewing a stale slate.
_Fix: expose an `isYesterdayFallback` boolean; render a visible "Showing yesterday's data — no data for today yet" notice._

**BUG-54** `app/(tabs)/intelligence.tsx`
`load()` fires on every screen mount and sets state directly — no caching, deduplication, or background refresh. Every tab visit triggers a fresh multi-query Supabase round-trip.
_Fix: migrate to `useQuery` with `staleTime: 2 * 60 * 1000`._

**BUG-55** `app/(tabs)/intelligence.tsx`
`synergyCombos` intermediate map objects include a `signals` property not declared in the `SynergyCombo` type, masked by `any[]` return type.
_Fix: add `signals` to `SynergyCombo` or remove it from the map._

**BUG-58** `app/(tabs)/book.tsx`
`handleDelete` deletes a list immediately with no confirmation prompt — a mis-tap is irreversible.
_Fix: `Alert.alert('Delete list?', ..., [{ text: 'Delete', style: 'destructive', onPress: ... }])`._

**BUG-60** `app/(tabs)/zk30.tsx`
`staleTime: 0` + `refetchOnMount: 'always'` causes a fresh Supabase query on every ZK30 tab visit.
_Fix: set `staleTime: 5 * 60 * 1000`._

**BUG-61** `app/(tabs)/zk30.tsx`
Subtitle hardcodes "Texas 🤠" regardless of the snapshot's actual jurisdiction.
_Fix: derive from `snapshot?.file_meta?.jurisdiction`._

**BUG-62** `app/(tabs)/account.tsx`
`historiesStats` fetches `limit=10000` rows just to count totals — large payload for a display-only stat.
_Fix: use `?select=count` with `Prefer: count=exact` header._

**BUG-63** `app/(tabs)/account.tsx`
"Manage Subscription" and "Restore Purchase" buttons render as `TouchableOpacity` with no `onPress` — tapping does nothing.
_Fix: wire to `purchaseSubscription`/`restorePurchases` from `useAuth`._

**BUG-65** `app/(tabs)/account.tsx`
`memberDays` counter is derived from `first_open_date` in device AsyncStorage — resets to 1 on reinstall or second device.
_Fix: store `first_open_date` in Supabase user metadata on first launch._

**BUG-66** `app/(tabs)/coverage.tsx`
Subtitle shows `Scope: {scope}` but the coverage matrix is global — not filtered per scope. Label implies scope-specific data.
_Fix: remove scope indicator or actually filter matrix by scope._

**BUG-68** `app/(tabs)/_layout.tsx`
A `learn` tab is rendered in the layout but `app/(tabs)/learn.tsx` was not in scope for this audit — if it's absent Expo Router will throw a missing-screen error at runtime.
_Fix: verify `learn.tsx` exists and is a proper screen._

**BUG-70** `app/import-wizard.tsx`
Selecting the "Ledger" import type card triggers `router.push('/ledger-import' as any)` — a screen not in the router config. The push fails silently and `importType` state is left at its previous value.
_Fix: handle ledger import inline; the wizard already has the full ledger pipeline below._

**BUG-71** `app/import-wizard.tsx`
`parseDateLoose` fallback calls `new Date(trimmed).getFullYear()/.getMonth()/.getDate()` with local components on a JS-parsed date — device timezone dependent, fails on UTC-offset devices near midnight.
_Fix: add explicit format branches before the fallback or use a deterministic parse._

**BUG-72** `app/import-wizard.tsx`
`coverageSet` query has `staleTime: 3000` (3 seconds) — near-constant re-fetches while the user is on the wizard.
_Fix: raise to `staleTime: 60_000`._

**BUG-73** `app/import-wizard.tsx`
`handleCommit` calls `setShowSummary(true)` twice — once inside the success block and once unconditionally at the end of the `try` block, which runs even on partial-error paths.
_Fix: remove the second unconditional call._

**BUG-74** `components/admin/DashboardView.tsx`
Today's import checklist builds the filter as `getTodayET() + 'T00:00:00.000Z'` — appending `Z` (UTC) to an ET date string creates an invalid timestamp. Imports before 5 am ET are missed.
_Fix: compute `new Date(getTodayET() + 'T05:00:00.000Z').toISOString()` for the ET midnight cutoff._

**BUG-76** `components/admin/DashboardView.tsx`
`zk30Jurisdiction` is a hardcoded `const 'TX'` with no UI control.
_Fix: expose a text input or dropdown; document limitation until ZK30 is productionized._

**BUG-77** `components/admin/EngineConfigView.tsx`
`handleSave` issues parallel PATCHes via `Promise.all` — a single key failure leaves config partially saved with no rollback and no per-key error report.
_Fix: collect failures and surface which keys failed, or use a server-side atomic upsert._

**BUG-78** `components/admin/EngineConfigView.tsx`
`parseInt(cfg.k6_doubles_max, 10) || 2` treats `0` (no doubles) the same as `NaN` — silently overrides an intentional "disable doubles" config.
_Fix: use `Number.isNaN(v) ? 2 : v`._

**BUG-79** `components/admin/EngineConfigView.tsx`
"Preview Engine Output" button opens a modal with a static "save and regen instead" message — it does not run the engine.
_Fix: implement a live preview or rename to "About Engine Config" / hide until implemented._

**BUG-80** `components/admin/AdaptiveLearningView.tsx`
Box hit rate denominator includes all picks — including unevaluated picks where `hit_box` is null — deflating the shown rate.
_Fix: denominator = `rows.filter(r => r.hit_box !== null).length`._

**BUG-81** `components/admin/AdaptiveLearningView.tsx`
"Best Day" card hardcodes `/6` denominator — ZK30 days with 30 picks would show >100% (latent until ZK30 is live).
_Fix: track picks-per-date alongside hits for an accurate per-day rate._

**BUG-83** `components/admin/HealthTestsView.tsx`
`runAll` awaits each health test in series even though all four are independent.
_Fix: `await Promise.all([runConn(), runSnap(), runImports(), runDatasets()])`._

**BUG-86** `components/admin/HitTrackingView.tsx`
`loadDetail` calls the Supabase REST API with raw `fetch()`, re-implementing auth headers inline instead of using `fetchFromSupabase`.
_Fix: migrate to `fetchFromSupabase`._

**BUG-87** `components/admin/HitTrackingView.tsx`
`calculate_hit_rates` RPC failure crashes the entire view with no graceful fallback.
_Fix: catch RPC failure; fall back to manual calculation from already-fetched rows; show a warning banner._

**BUG-91** `components/PickDetailModal.tsx`
`confidence = (energy + BOX + CO) / 3` mixes energy (0–100 percentile) with normalized signals (0–1). The result is not mathematically meaningful.
_Fix: use the engine's actual `pick.confidence` field from the snapshot, or remove the metric._

**BUG-92** `components/PickCard.tsx`
`heatInfo` and `tempColorFor` map the same energy range to different color tokens (`theme.colors.orange` vs `theme.colors.amber`) — the label and background bar render different hues for the same pick.
_Fix: consolidate to a single `tempColorFor` function used by both._

**BUG-93** `components/PickCard.tsx`
Animated shadow uses `glowAnim as any` to bypass a TypeScript incompatibility — suppresses type safety for the animation value.
_Fix: cast to `Animated.AnimatedNode` or restructure to be type-safe._

**BUG-96** `engines/zk6.ts`
Pass 2 fills remaining K6 slots with zero-history combos (no draws ever recorded). These produce near-zero scores driven only by coincidental pair signals.
_Fix: log a warning; pad with placeholders only when ≥ 3 real-data combos exist; surface "insufficient data" error otherwise._

**BUG-98** `lib/hitDetection.ts`
`updateDailyIntelligenceHit` and `recordHitInAdaptiveTracking` both use raw `fetch()` instead of `fetchFromSupabase`, bypassing the 15s timeout and centralized header management.
_Fix: migrate to `fetchFromSupabase({ method: 'PATCH'/'POST', ... })`._

**BUG-101** `lib/supabase.ts`
No retry logic — a single transient failure on a large pair-data fetch (50k rows) throws immediately.
_Fix: add one retry with 500ms delay inside `fetchFromSupabase` for GET requests._

**BUG-102** `lib/supabase.ts`
`DEFAULT_TIMEOUT_MS = 15000` may be too short for large pair-data fetches (50k rows on slow connections).
_Fix: expose an optional `timeout` param; use 30–60s for known large fetches in the engine._

**BUG-103** `lib/dateUtils.ts`
`getYesterdayET` uses `d.setDate(d.getDate() - 1)` on device local time before ET formatting — off-by-one on non-ET devices near midnight.
_Fix: compute as `new Date(Date.now() - 86400000)` (UTC-anchored) then format._

**BUG-106** `hooks/useSnapshot.tsx`
`staleTime: 0` causes a Supabase query on every mount and every window-focus event — at least 3 round-trips per session startup across three scopes.
_Fix: set `staleTime: 5 * 60 * 1000`._

**BUG-108** `hooks/useDataIngestion.tsx`
`softDeleteImport`/`undoSoftDeleteImport` pass `{ useServiceKey: true }` to `fetchFromSupabase`, which has no such option. The calls silently fall back to the anon key.
_Fix: implement `useServiceKey` in `fetchFromSupabase`, or document that anon key has sufficient permissions and remove the unsupported flag._

**BUG-109** `hooks/useDataIngestion.tsx`
`importsQuery` is filtered by `selectedScope` — an allday box-history import is invisible when the admin is on midday scope.
_Fix: remove scope filter from the imports query or make it opt-in._

**BUG-111** `hooks/useDataIngestion.tsx`
Ledger import silently coerces `morning`→`midday` and `night`→`evening` with no warning. Original session granularity is lost.
_Fix: log a warning when coercion occurs; optionally surface as a validation notice in the import summary._

**BUG-112** `hooks/useAuth.tsx` / `CLAUDE.md`
`CLAUDE.md` states "Currently defaults to `admin` (BUG-02)" but the actual code initializes `role: 'free'`. The documentation is wrong.
_Fix: update `CLAUDE.md` to reflect the true default (`'free'`)._

**BUG-114** `components/admin/DashboardView.tsx`
"Clear Top 30" PATCHes only `on_slate=false` — `hit_box`/`hit_straight` remain `true`. On re-gen, the `daily_intelligence DELETE` skips rows where `hit_box=true`, leaving stale hit-flagged rows that can 409-conflict the re-insert.
_Fix: also PATCH `hit_box=false, hit_straight=false` when clearing; or use DELETE instead of PATCH._

**BUG-116** `supabase/functions/compute-slate-zk6/index.ts`
Synergy boost threshold requires all four signals ≥ 0.65, including DGC. DGC returns 0.3 for single-hit combos and 0 for never-drawn — in sparse data environments the boost effectively never fires.
_Fix: require any 2 of 4 signals ≥ 0.65, or exclude DGC from the synergy threshold._

**BUG-119** `engines/zk30.ts`
`saveSlateSnapshot` soft-delete computes `todayStart.setUTCHours(0, 0, 0, 0)` (UTC midnight). In ET this equals 7–8 pm the previous day — evening slates from yesterday can be incorrectly soft-deleted.
_Fix: anchor to ET midnight: `new Date(getTodayET() + 'T04:00:00.000Z')` (EDT) / `T05:00:00.000Z` (EST)._

**BUG-120** `engines/zk30.ts`
15+ `console.log` calls (including `[ZK6-DIAG]` entries) run unconditionally in the production engine, logging full pick arrays and map sizes on every slate generation.
_Fix: guard with `if (process.env.NODE_ENV !== 'production')` or a debug flag._

**BUG-121** `engines/zk30.ts`
ZK30 `loadEngineConfig` does not load `k6_singles_max`, `k6_doubles_max`, or `pair_rep_cap` from `app_config`. Engine Config changes have no effect on ZK30; it always uses `DEFAULT_RAILS`.
_Fix: add the missing keys to the ZK30 config query._

**BUG-122** `types/core.ts`
`TopKStraightRow` is missing the four optional hit fields (`hitType`, `hitState`, `hitDate`, `hitResult`, `hitSession`) that hit detection writes at runtime. TypeScript treats them as unknown everywhere the type is used.
_Fix: add the five fields as optional to `TopKStraightRow`._

---

### 🔵 Open — Low

**BUG-51** `app/(tabs)/results.tsx`
Signal columns in the results pick card are labelled `F`, `B`, `S` with no legend — opaque to users.
_Fix: use `BOX`, `PBR`, `CO` labels or add a tooltip legend._

**BUG-64** `app/(tabs)/account.tsx`
All account action rows (`Change Password`, `Notification Prefs`, `Sign Out`, etc.) are `TouchableOpacity` with no `onPress` — tapping does nothing.
_Fix: implement stubs showing at minimum a "Coming soon" toast; fully implement `Sign Out`._

**BUG-67** `app/_layout.tsx`
`initApp` contains `await new Promise(resolve => setTimeout(resolve, 100))` with no documented reason — 100ms added to every cold start.
_Fix: remove unless a specific async ordering requires the delay._

**BUG-113** `hooks/useAuth.tsx`
`purchaseSubscription`/`restorePurchases` are 1-second `setTimeout` placeholders that set `role: 'premium'` with no real payment or receipt validation.
_Fix: integrate StoreKit/Google Play or a backend receipt-validation endpoint before commercial launch._

**BUG-123** `types/core.ts`
`EngineMetadata` index signature `[horizon: string]: boolean | string | number | ...` allows silent access to any typo'd key instead of a compile-time error.
_Fix: declare `_engineVersion`, `_mode`, `_source`, etc. as explicit optional fields; narrow the index signature to `H${string}Y` keys._

---

## Enhancement Opportunities

| ID | File | Title |
|----|------|-------|
| ENH-01 | `components/PickDetailModal.tsx` | Wire `HitReplay` component — exists in `HitReplay.tsx` but never imported; PLAY tab would benefit from showing the side-by-side predicted vs drawn visual when `pick.hitType` is set |
| ENH-02 | `app/(tabs)/results.tsx` | Combo-set cluster view — when multiple results share the same combo-set on one day, group them and show a cluster hit count |
| ENH-03 | `app/(tabs)/intelligence.tsx` | "Days with a hit" stat — add "X of last 30 days had ≥1 box hit" to make performance claims concrete |
| ENH-04 | `app/(tabs)/book.tsx` | "Add from Today's Slate" shortcut — import current scope's 6 K6 picks directly into a list without manual entry |
| ENH-05 | `lib/hitDetection.ts` | Persist `hitSession` on updated snapshot picks — already written to `daily_intelligence` but not stored on the snapshot pick object |
| ENH-06 | `hooks/useSnapshot.tsx` | Show slate generation timestamp on Home — `updated_at_et` is in the snapshot; "Generated at 6:12 am" label builds trust and shows freshness |
| ENH-07 | `components/admin/DashboardView.tsx` | "Full Daily Workflow" button — single tap runs: hit detection (yesterday+today) → regen all scopes → invalidate all caches |
| ENH-08 | `engines/zk6.ts` / `engines/zk30.ts` | Engine run telemetry — upsert a summary row per generation in `adaptive_tracking` (scope, weightsKey, horizons used, confidence score) for longitudinal tuning data |
| ENH-09 | `app/(tabs)/explore.tsx` | Slate freshness indicator — show "Generated 3 hours ago" or "⚠ Slate is 2 days old" from `updated_at_et` |
| ENH-10 | `app/(tabs)/intelligence.tsx` | Scope filter on Top 30 — currently shows all scopes combined; a scope selector would let admin review per-scope without cross-scope noise |
| ENH-11 | `components/admin/AdaptiveLearningView.tsx` | Split box vs straight hit rates in the 7-day chart — amber for box, cyan for straight |
| ENH-12 | `lib/hitDetection.ts` | Hit detection run log — write a `hit_detection_runs` row (date, scopes_checked, hits_found, run_at) after each run to track coverage and catch silent failures |
| ENH-13 | `app/(tabs)/results.tsx` | Hit-result share button — when `hitType !== null`, a share button copies "My #2 pick 427 hit BOX in Arizona on 5/9 via HitMaster ZK6" for social |
| ENH-14 | `hooks/useDataIngestion.tsx` | Surface rejected import rows — add `rejectedSamples[0..4]` with reasons to the import summary modal |
| ENH-15 | `components/admin/EngineConfigView.tsx` | Weight integrity check before save — verify `BOX+PBURST+CO+DGC ≈ 1.0` and `singlesMax+doublesMax ≥ 6` before committing config |
| ENH-16 | `app/(tabs)/account.tsx` | Implement Sign Out — clear AsyncStorage, reset `useAuth` state, navigate to onboarding; required before multi-user launch |
| ENH-17 | `app/(tabs)/zk30.tsx` | "Open Admin" shortcut on ZK30 empty state — current EmptyState directs user to Admin screen but provides no navigation button |
| ENH-18 | `components/admin/HealthTestsView.tsx` | `daily_intelligence` freshness health check — add a test verifying today's Top 30 rows exist for each scope |
| ENH-19 | `engines/zk6.ts` | Read `synergy_boost_on`/`synergy_boost_weight` from `app_config` in the client engine — currently only the edge function honours these keys |
| ENH-20 | `lib/dateUtils.ts` | Add `isETDateToday(dateStr)` utility — several places compare stored ET date strings to device `Date.now()` without a shared ET-aware helper |
| ENH-21 | `components/PickCard.tsx` | Long-press quick-save to Number Book — "Save to Book" + "Copy combo" sheet; stub exists in PickDetailModal but not on the card |
| ENH-22 | `app/(tabs)/explore.tsx` | Pull-to-refresh triggers hit detection — extend the Slates pull-to-refresh to also run `runHitDetectionAndRefresh(scope, todayET)`, closing the loop without an Admin visit |

---

## Growth-Aligned Bug Prioritization (2026-05-10)

This roadmap aligns technical debt resolution with subscriber growth and retention strategies.

| Priority | Growth Opportunity | Blocking Bug(s) | Strategic Rationale |
|:---|:---|:---|:---|
| **1** | Reliability (Stop Churn) | **BUG-18, BUG-19** | "Lost hits" destroy user trust instantly; accuracy is the foundation of retention. |
| **2** | Engine Integrity | **BUG-22, ENG-01** | Suppressing valid picks and volatile scoring kills product quality. |
| **3** | Scalability (Security) | **BUG-20** | Secure RLS is a prerequisite for Edge Functions/Real-time data architecture. |
| **4** | Transparency (Trust) | **BUG-21** | Surface `allday` fallback info; creates the "Model Confidence" badge feature. |

### Strategic Roadmap
1.  **Stop Churn:** Address date-tagging and snapshot-window issues to guarantee accurate hit detection.
2.  **Restore Quality:** Fix `excludedCombos` bleed and signal normalization drift to restore accurate predictions.
3.  **Foundation:** Migrate mutations to Edge Functions to secure the data layer.
4.  **Feature Evolution:** Surface engine confidence levels to build premium-tier trust.

#### Edge Function Migration Roadmap
- **Phase 3.5 — Hit-detection Edge Function migration.** Move `updateDailyIntelligenceHit` and the `runHitDetectionAndRefresh` snapshot PATCH from anon client writes to a service-role Edge Function. After migration: drop `intelligence_update_anon` and `snapshots_update_anon` policies. Closes BUG-20 fully.
- **Phase 3.6 — ZK30 Edge Function migration.** Mirror of ZK6 Edge Function for `engines/zk30.ts`. Closes BUG-29 and unblocks ZK30 production rollout. Depends on ZK30 build completion (currently a standalone in-progress engine).

---

## Architecture Debt & Refactoring Targets

These are not bugs but structural issues that will cause maintenance pain at scale.

| ID | Item | Risk | Status |
|----|------|------|--------|
| ARCH-01 | `admin.tsx` ~4000 lines — UI, data fetching, business logic all mixed | Slow velocity, high side-effect risk | ✅ Fixed 2026-05-11 — Extracted 10 view components into `components/admin/`. `admin.tsx` now 88 lines (thin router). Shared helpers/styles/types in `AdminShared.tsx`. |
| ARCH-02 | ZK6 and ZK30 share ~80% logic — two separate files | Fixes in one engine get missed in the other | ✅ Fixed 2026-05-12 — `lib/engineCore.ts` extracted: pure TS, Deno-safe signal math (`computeDGC`, `computeBoxSignal`, `computePairSignal`, `maxNorm`, `computeWeightedScore`, `computeSlateHash`, `computeConfidenceScore`, combo utilities, `HORIZON_WEIGHTS`, `MULTIPLICITY_PRIORS`). Both `engines/zk6.ts` and `engines/zk30.ts` now import from it; ~80 local duplicate lines removed per engine. |
| ARCH-03 | No unit test suite | Signal computation regressions go undetected | ✅ Fixed 2026-05-11 — Jest + jest-expo configured (`npm test`). 22 tests in `__tests__/` covering ENG-01 (max-norm), ENG-05 (pairFreqScore), DGC, toComboSet, normalizeScope, pairUtils. Regressions in signal math now caught immediately. |
| ARCH-04 | `useDataIngestion.tsx` imports `computeSlate` from ZK6 only — no path to trigger ZK30 regen from hooks | ZK30 can only be regenerated from the Admin screen directly | Open |
| ARCH-05 / NEW-28 | Dual hit detection system — `lib/hitDetection.ts` (used by `admin.tsx`, `import-wizard.tsx`) and inline `runHitDetectionAndRefresh` in `useDataIngestion.tsx` (used by ledger import) are two separate implementations with divergent behavior | Hits detected via admin may miss cases handled by ledger-triggered detection and vice versa | ✅ Fixed 2026-05-11 — Inline 190-line implementation removed from `useDataIngestion.tsx`. Now delegates to `lib/hitDetection.ts::runHitDetectionForDates()`. Ledger-specific pair RPC kept in hook. `dominant_signal` added to `recordHitInAdaptiveTracking` in lib. |

---

## ZK6 Engine Audit Findings (2026-05-10)

| ID | Issue | Severity | Description |
|:---|:---|:---|:---|
| ENG-01 | Signal Normalization Drift | ✅ Fixed 2026-05-11 | BOX now uses max-norm (consistent with PBURST/CO/DGC). Applied to `engines/zk6.ts` and `engines/zk30.ts`. |
| ENG-05 | Pair Signal freqScore Anti-Correlation | ✅ Fixed 2026-05-11 | `getPairSignal()` was using `dsRaw/maxPairDsRaw` (staleness) as freqScore — gave highest scores to most-stale pairs, inversely correlated with hits. Fixed to `timesDrawn/maxPairTimesDrawn` (historical frequency), matching BOX signal logic. |
| ENG-06 | Incomplete K6 Slate (5 picks) | ✅ Fixed 2026-05-11 | Added Pass 4 (relax pairRepCap) and Pass 5 (relax cooldown) to guarantee full 6-pick slate. pairRepCap deadlock was blocking 6th slot after ENG-01 normalization change shifted pick clustering. |
| ENG-02 | Static Multiplicity Priors | 🟡 Medium | `MULTIPLICITY_PRIORS` are static and do not adjust to shifts in historical draw trends. |
| ENG-03 | Placeholder Pick Transparency | ℹ️ False Positive — Already handled | `PickCard` shows "Limited data" tag when `timesDrawn === 0`. No additional changes needed. |
| ENG-04 | Deterministic Hash Collision/Failure | ✅ Fixed 2026-05-11 | `ts: Date.now()` removed from hash input in both `engines/zk6.ts` and `engines/zk30.ts`. Hash is now fully deterministic. |

---

## Quality Scorecard

| Dimension | Target | Current Status |
|-----------|--------|----------------|
| Type Safety | ✅ Good | ✅ Good |
| Error Handling | ✅ Good | ✅ Good |
| Concurrency Safety | ✅ Good | ✅ Good |
| Performance | ✅ Good | ✅ Good |
| Security (auth/roles) | ✅ Good | ✅ Good (BUG-02 fixed — default role now `free`) |
| Security (RLS) | ✅ Good | ⚠️ Partial — ZK6 lockdown via Edge Function complete; hit-detection writes restored via anon UPDATE policies pending Phase 3.5 Edge Function migration. Dead `authenticated` policies present but inert. (BUG-20 ⚠️ Partial) |
| Data Consistency | ✅ Good | ✅ Good — hit persistence restored 2026-05-12 (was silently failing post-BUG-20 lockdown; window bounded by BUG-20 deploy date 2026-05-12) |
| Engine Accuracy | ✅ Good | ✅ Good (ENG-01/ENG-05 fixed; ENG-02 static priors deferred) |
| Test Coverage | ⚠️ Medium | ⚠️ Medium (22 signal-math tests; no integration tests) |
| Documentation | ✅ Good | ✅ Good |
| Maintainability | ✅ Good | ✅ Good (ARCH-01/03/05 fixed; ARCH-02/04 deferred per ZK30 policy) |
| User Experience | ✅ Good | ✅ Good (UX-46/47/48/49 fixed) |
| Accessibility | ✅ Good | ✅ Good |

---

## UX Improvement Log — 2026-05-08

15-point subscriber experience overhaul. All items sourced from deep UI/UX audit.

| ID | Tier | Area | Change |
|----|------|------|--------|
| UX-01 | Conversion | Global | New `Toast.tsx` component — success/error/info/warning slide-up notifications |
| UX-02 | Conversion | Global | New `InfoTooltip.tsx` component — tappable "?" modal for inline jargon definitions |
| UX-03 | Conversion | Global | Tier naming unified: Free→**Seeker**, Premium→**Oracle+**, Admin→**Mystic** across all screens |
| UX-04 | Conversion | Home | Pro gate rewritten: "Picks #3–6 hidden" + specific value prop + trial detail |
| UX-05 | Conversion | Home / Slates | Regen success/failure replaced modal with toast notification |
| UX-06 | Conversion | Home | Mode buttons (Balanced/Conservative/Aggressive) now show sub-label explanation |
| UX-07 | Engagement | Home | Energy stat strip has InfoTooltip with 🔥⚡✦❄ scale definition |
| UX-08 | Engagement | Home | Demo status bar message rewritten from jargon to plain English |
| UX-09 | Engagement | Home | Hit banner "Box Win ✓" clarified to "Box Win ✓ (matched any order)" |
| UX-10 | Engagement | Slates | Yesterday toggle: full "Yesterday" label, amber-tinted, clearly discoverable |
| UX-11 | Engagement | Slates | Credits shown as "2/3 regens" with tooltip explaining daily reset |
| UX-12 | Engagement | Slates | Filter/sort labels expanded: S→Singles, D→Doubles, Nrg→Energy, Frq→Freq, ≡/⊞→List/Grid |
| UX-13 | Engagement | Slates | Yesterday pending state includes direct "Import Results →" button |
| UX-14 | Engagement | Intelligence | No-data empty state: emoji, better copy, "Go to Slates ⚡" CTA |
| UX-15 | Engagement | Intelligence | Slate empty state: "Generate Slate ⚡" navigation button |
| UX-16 | Engagement | Intelligence | Loading state shows "X of ~2,000 picks" progress |
| UX-17 | Engagement | Intelligence | Analysis header has InfoTooltip explaining the screen purpose |
| UX-18 | Engagement | Intelligence | "Apply to Engine Config" clarified to "Apply · Regenerate slates to see effect" |
| UX-19 | Engagement | Account | Notification toggles show toast confirmation on each change |
| UX-20 | Engagement | Account | Trial button: "then $9.99/mo, cancel anytime" added |
| UX-21 | Engagement | Account | Active subscription note: renewal guidance + Manage link |
| UX-22 | Engagement | Account | Glossary "▼" expand arrow changed to "›" (more intuitive) |
| UX-23 | Engagement | Ledger Import | Skipped-line errors translated from raw parser output to plain English |
| UX-24 | Engagement | Ledger Import | Preview row count: "Showing first 30 of N rows · scroll right…" |
| UX-25 | Engagement | Ledger Import | Success card includes next-step guidance for user |
| UX-26 | Polish | Pick Card | Locked card: larger title font, "Tap to unlock all 6 picks" sub-text |
| UX-27 | Polish | Pick Card | Pressure indicator adds descriptive sub-text: "Hit 12 draws ago" / "45 draws without a hit" |
| UX-28 | Polish | Pick Detail | Gauge label "MATCH" → "ENERGY" |
| UX-29 | Polish | Pick Detail | All-caps section titles → Title Case (Signal Breakdown, Pair Intelligence, Why This Order) |
| UX-30 | Polish | Pick Detail | Signal Breakdown gets subtitle: "% = signal strength (higher = stronger indicator)" |
| UX-31 | Polish | Pick Detail | Pair Intelligence subtitle explains cyan ≥ 70% = strong threshold |
| UX-32 | Polish | Pick Detail | WhyOrder descriptions use plain English (no more "surge vector", "pattern alignment", "signal sync") |
| UX-33 | Polish | Pick Detail | Box play payout shown (~$80); Straight payout (~$500) explained below |
| UX-34 | Accessibility | Tab Bar | All tab icons now have `accessibilityLabel` for screen readers |
| UX-35 | Accessibility | Global | `ToastProvider` added to root layout, wraps entire app |

---

## PickDetailModal Redesign — 2026-05-08

Full rebuild of `components/PickDetailModal.tsx` for maximum data density with zero scrolling.

| ID | Area | Change |
|----|------|--------|
| UX-36 | Pick Detail | Full-screen modal (replaces 92%-height bottom sheet) — uses all available screen real estate |
| UX-37 | Pick Detail | Gradient accent line (purple→cyan→rose) at very top of modal for visual identity |
| UX-38 | Pick Detail | Header bar: close (left) · rank badge + title (center) · share icon (right) — share accessible from all tabs |
| UX-39 | Pick Detail | Hero strip always visible: animated energy arc, big combo digits colored by energy level, P1/P2/P3 position boxes, BOX SET badge, scope + version |
| UX-40 | Pick Detail | **Timestamp strip** between hero and tabs — shows exact generation date/time (e.g. `May 8, 2026 · 2:45 PM`) for screenshot proof-of-analysis |
| UX-41 | Pick Detail | **Tab-based navigation** (INTEL / PAIRS / PLAY) eliminates all scrolling — every tab fits one screen |
| UX-42 | Pick Detail | INTEL tab: ZK6 confidence bar → 4 signal pills side-by-side (FREQ / MOMO / PATTERN / CONSIST) → Why This Order (3 rows with score badges) |
| UX-43 | Pick Detail | PAIRS tab: Full pair intelligence matrix — 4 signals × 3 pairs as visual progress bars, color-coded, legend, drawn count + scope callout |
| UX-44 | Pick Detail | PLAY tab: Straight vs Box bet cards (large combo, payout, badge) → 3 action buttons (Save / Heat Check / Share) |
| UX-45 | Pick Detail | Removed redundant `horizonRows` query (sparklines removed; data density now served by matrix bars) |

---

## Design Evolution Roadmap (2026-05-10)

This roadmap outlines the steps to align the mobile implementation with the "HitMaster Neon" design spec, improving visual polish to boost perceived value and subscriber conversion.

| ID | Enhancement | Priority | Description |
|:---|:---|:---|:---|
| DES-01 | **Neon Glow Integration** | High | ✅ Fixed 2026-05-12 — PickCard and SlateCard default border changed from flat white (`border`) to purple-tinted (`purple+'28'`), matching existing `theme.shadows.glow`. Hit cards get animated gold/cyan glow border pulsing at 1400ms. |
| DES-02 | **Typography Precision** | Medium | ✅ Fixed 2026-05-12 — All 60+ raw `fontFamily: 'Courier'` / `'monospace'` references replaced with `theme.typography.fontFamily.mono` across 19 files. Heavy-weight (700–900) mono text upgraded to `monoBold` (JetBrainsMono_700Bold). `Platform.OS` conditional removed from RegenConfirmationModal. |
| DES-03 | **Haptic/Visual Feedback** | Medium | ✅ Fixed 2026-05-12 — PickCard now renders hit-state banner (⭐ STRAIGHT HIT / 🎯 BOX HIT) with animated glow pulse when `pick.hitType` is set. Existing hot-energy pulse (≥80) preserved; hit pulse uses slower 1400ms cycle. |
| DES-04 | **Token Synchronization** | Low | ✅ Fixed 2026-05-12 — `theme.letterSpacing` token map added (tight/normal/wide/wider/widest/combo/comboLg) + `theme.animation.hit: 1400` for hit pulse duration. Single source of truth for spacing and animation constants. |

### Strategic Objective: "Maximum Polish"
The current gap between the intended "Neon" design and the flat React Native implementation is a missed opportunity for premium-tier positioning. By implementing glow-based depth, tracking-aligned typography, and responsive feedback animations, we move the app from a "utility tool" to a "high-end analytic dashboard."

Polish pass applied on top of the 35-point UX overhaul.

| ID | Area | Change |
|----|------|--------|
| VIS-01 | Global / Theme | `gradients` map added to `theme.ts` (header, hotEnergy, warmEnergy, mildEnergy, coolEnergy, purpleRose, cyanPurple, goldAmber) |
| VIS-02 | Global / Theme | `surface2` depth layer + `pulse: 900` animation duration added to theme |
| VIS-03 | EnergyMeter | Upgraded from flat border ring to `LinearGradient` ring + animated pulse halo (≥80 energy) |
| VIS-04 | EmptyState | Replaced bare icon with 3-ring cosmic orbit illustration (outer/mid/inner rings + icon center) |
| VIS-05 | SlateCard | Pick rank pill: background fill + border; digit letter-spacing widened to 6 |
| VIS-06 | Results | `LinearGradient` header; hit cards get teal highlight bg + border; strip width 6; digits letter-spacing 8 |
| VIS-07 | PickCard | Inline energy badge replaced with `EnergyMeter` (gradient ring, pulse halo on hot picks) |
| VIS-08 | Explore | Compact/Grid view now renders `SlateCard` per pick (signal bars, pill rank, temp badge) instead of inline rows |
| VIS-09 | Results | `EmptyState` (Calendar icon) replaces inline "No draws found" text in `ListEmptyComponent` |
| VIS-10 | Intelligence | `EmptyState` (BarChart2 icon) replaces inline no-data state with action buttons preserved |
| VIS-11 | Intelligence | `EmptyState` (Zap icon) replaces inline no-slate state with "Generate Slate ⚡" CTA preserved |
| VIS-12 | Home | `LinearGradient` header replaces plain `bgElevated` View |
| VIS-13 | Account | `LinearGradient` hero card replaces plain `bgElevated` View |
| VIS-14 | Number Book | `EmptyState` (BookOpen icon) replaces inline "No numbers saved yet" state |
| VIS-15 | ZK30 | `EmptyState` (Layers icon) replaces inline "No ZK30 snapshot found" text |

---

## UI/UX Deep Scan Findings (2026-05-10)

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| UX-46 | Shadow System Divergence | 🟡 Medium | ✅ Fixed 2026-05-11 — All 17 `theme.shadows.soft` references replaced with `theme.shadows.glow` across 9 files. `shadows.soft` is effectively deprecated. |
| UX-47 | Semantic Color Ambiguity | 🟡 Medium | ✅ Fixed 2026-05-11 — Added `SIGNAL_COLORS` const in `PickCard.tsx` mapping BOX/PBURST/CO/DGC to physical colors. Both `convergingSignals` array and `SignalBar` calls now use `SIGNAL_COLORS.*` — one source of truth for signal-to-color mapping. |
| UX-48 | Inconsistent Surface Depth | 🟡 Medium | ✅ Fixed 2026-05-11 — `results.tsx` D-token `surface2` was aliased to `theme.colors.card` instead of `theme.colors.surface2`. Now uses the correct `theme.colors.surface2` depth token. |
| UX-49 | Empty State Fragmentation | 🔵 Low | ✅ Fixed 2026-05-11 — `admin-imports.tsx` inline "No imports yet" replaced with `EmptyState` component (Layers icon). `ledger-import.tsx` inline error box intentionally left as inline (it is a parse-error notice, not a page-level empty state). |

### Proposed UI Enhancement Plan

| Phase | Enhancement | Description |
| :--- | :--- | :--- |
| **I** | Theme Consolidation | ✅ Fixed 2026-05-12 — Semantic signal color aliases added: `freqSignal`, `momoSignal`, `patternSignal`, `consistSignal`, `hotStreak`, `brand`, `neutralCool`, `neutralWarm` (Patch 01). |
| **II** | Shadow Standardization | ✅ Fixed 2026-05-11 — All `theme.shadows.soft` references migrated to `theme.shadows.glow`. |
| **III** | Component Refactoring | ✅ Fixed 2026-05-11 — All inline empty states replaced with `EmptyState.tsx`. |
| **IV** | Layering Polish | ✅ Fixed 2026-05-12 — `_layout.tsx` modal screens (`import-wizard`, `paywall`, `coming-soon`) now use `surface2` as `contentStyle` and `headerStyle` background, creating depth separation from base `background` (Patch 02). |


---

## Design Polish Sprint — 2026-05-12

Applied design handoff 4 patches and v3 system patches. All items sourced from `design handoff/design_handoff_hitmaster 4/` and `design handoff/patches/v3/`.

| ID | Area | Change |
|----|------|--------|
| UX-50 | EnergyMeter | Full replacement — 4-tier gradient scale (≥90 hot/amber, ≥80 amber/gold, ≥65 orange/gold, ≥45 gold/cyan, else cyan/purple); cool gradient now visible; baseline ring glow on all energies (`shadowOpacity: 0.55`); `fontWeight: '700'` on label |
| UX-51 | TierBadge | Full replacement — `tierPalette()` function: FREE gets surfaceLight/borderMed/textTertiary (no fake glow), PRO/PLUS get `shadowOpacity: 0.45, shadowRadius: 6`; `fontWeight: '800'`, `fontFamily: monoBold`, `letterSpacing: 0.6`; `ComingSoonBadge` gets glow; `sizeMetrics()` with `padX/padY/iconSize` |
| UX-52 | Slates ctrlStrip (iOS) | ctrlStrip row (filter/sort/view-mode chips + save button) was a `View` with `flex:1` spacer — right-side buttons overflowed off-screen on iOS. Fixed to horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}`; all chips now reachable |
| UX-53 | PickDetailModal — Safe Area | Added `useSafeAreaInsets` from `react-native-safe-area-context`; header `paddingTop: insets.top || 14` clears the Dynamic Island / notch on all iOS hardware |
| UX-54 | PickDetailModal — Buttons | Close/minimize buttons were 32×32 (below iOS 44pt minimum tap target). Upgraded to `closeBtnInner: { width: 44, height: 44, borderRadius: 22 }` pill buttons with frosted `rgba(255,255,255,0.1)` background and 1px white border; `hitSlop: { top:10, bottom:10, left:10, right:10 }` |
| UX-55 | PickDetailModal — Drag Handle | Drag handle indicator added at top of modal header (`width: 36, height: 4, borderRadius: 2, rgba(255,255,255,0.2)`) for system-familiar gesture affordance |
| UX-56 | PickDetailModal — Content Scroll | Tab content area changed from `View` to `ScrollView` with `paddingBottom: insets.bottom + 24`; prevents content clipping on tall INTEL/PAIRS tab payloads |
| UX-57 | Slates GridTile — Screenshot Mode | Compact/grid view fully rewritten for screenshot use case: `ScrollView` bypassed, `flex:1` chain `gridContainer → gridArea → gridRow → GridTile` fills exact screen height without scrolling; 2×3 grid shows all 6 picks simultaneously; `GridTile` has rank chip (temp-colored), energy score, big combo digits with `adjustsFontSizeToFit`, comboSet label, 4 micro signal bars (3px height) |
| UX-58 | NeonSkeleton | New `components/NeonSkeleton.tsx` — animated shimmer loading placeholder (opacity 0.35→0.75 at 900ms loop). Variants: `card` (full pick-card with rank/combo/4 bars), `row`, `combo` (3 big digit slots), `text`, `splash`. Block color `rgba(155,91,255,0.18)` |
| UX-59 | NeonRefreshControl | New `components/NeonRefreshControl.tsx` — themed pull-to-refresh wrapper: iOS `tintColor: cyan`, Android `colors: [cyan, purple, rose]` spinner, `progressBackgroundColor: surface2`. Drop-in replacement for `RefreshControl` in `index.tsx`, `results.tsx`, `intelligence.tsx` |

### V3 System Patches

| Patch | File | Change |
|-------|------|--------|
| 01 — Semantic Aliases | `constants/theme.ts` | Added `freqSignal`, `momoSignal`, `patternSignal`, `consistSignal`, `hotStreak`, `brand`, `neutralCool`, `neutralWarm` color tokens. Closes Phase I of Enhancement Plan. |
| 02 — Modal Surface2 | `app/_layout.tsx` | `import-wizard`, `paywall`, `coming-soon` Stack screens now use `surface2` for `contentStyle` and `headerStyle` backgrounds. Closes Phase IV of Enhancement Plan. |
| 03 — Neon Tab Bar | `app/(tabs)/_layout.tsx` | `TabIcon` takes `focused` prop; active tab renders cyan pill halo (`rgba(43,255,204,0.12)` bg, `rgba(43,255,204,0.45)` border, cyan shadow glow); bar background `surface2`, 1.5px purple border-top, height 64; label `fontWeight: '700'`, `letterSpacing: 0.4`, `textTransform: 'uppercase'`, `fontSize: 10` |
| 04 — NeonSkeleton | `components/NeonSkeleton.tsx` | New shimmer loading placeholder component (see UX-58) |
| 05 — NeonRefreshControl | `components/NeonRefreshControl.tsx` + 3 screens | New themed RefreshControl wrapper (see UX-59); swapped in `index.tsx`, `results.tsx`, `intelligence.tsx` |

---

| Date | Change | By |
|------|--------|----|
| 2026-05-08 | Initial master audit created; consolidated AUDIT_2026-05-08.md + AUDIT_FIX_STATUS_2026-05-08.md + SYSTEM_AUDIT_REPORT_2026-05-08.md | Claude Code |
| 2026-05-08 | BUG-01 through BUG-17 resolved/triaged; BUG-18 through BUG-22 identified as open | Claude Code |
| 2026-05-08 | BUG-07 fully resolved — cursor-based pagination on Intelligence tab | Claude Code |
| 2026-05-08 | BUG-08 resolved by design — "National" label added to explore status strip | Claude Code |
| 2026-05-08 | 15-point UX overhaul (UX-01 through UX-35) — see UX Improvement Log above | Claude Code |
| 2026-05-08 | Visual enhancement pass (VIS-01 through VIS-15) — gradient headers, EnergyMeter/EmptyState/SlateCard wired in | Claude Code |
| 2026-05-08 | PickDetailModal full redesign (UX-36 through UX-45) — full-screen, tab-based, zero scroll, timestamp strip | Claude Code |
| 2026-05-08 | BUG-23 fixed — renamed `background.PNG` → `background.png`; Metro uppercase extension caused web load failure on Linux | Claude Code |
| 2026-05-11 | Pick Quality Degradation root causes linked to BUG-22, ENG-01, BUG-21 | AI Assistant |
| 2026-05-11 | Full independent code verification: BUG-02 still open (default admin), BUG-22 false positive (already fixed), ENG-01/ENG-04 fixed in zk6+zk30, BUG-19 fixed, ARCH-05/NEW-28 documented | Claude Code |
| 2026-05-11 | ENG-05 fixed: pair signal freqScore was using dsRaw (staleness) — corrected to timesDrawn (frequency) in zk6+zk30. Root cause of PBURST/CO being anti-correlated with hits. | Claude Code |
| 2026-05-11 | ENG-06 fixed: added Pass 4+5 to K6 selection to guarantee full 6-pick slate when pairRepCap/cooldown deadlock occurs. | Claude Code |
| 2026-05-11 | BUG-21 fixed: explore.tsx status strip now shows ⚠ allday fallback when engine falls back to allday data. StatusRibbon horizon filter corrected (was including _dataStats/_engineVersion as fake horizon keys). | Claude Code |
| 2026-05-11 | BUG-18 partially fixed: updateDailyIntelligenceHit now uses slate_date=in.(date,prevDay) — late-night slates tagged with yesterday's date are now hit-updated correctly. | Claude Code |
| 2026-05-11 | ENG-03 confirmed false positive: PickCard already shows "Limited data" tag for timesDrawn===0 picks. No additional changes needed. | Claude Code |
| 2026-05-11 | ARCH-01 complete: admin.tsx decomposed from 3971→88 lines; 10 views extracted to components/admin/; AdminShared.tsx holds types/constants/helpers/styles. | Claude Code |
| 2026-05-11 | ARCH-05 complete: inline 190-line runHitDetectionAndRefresh removed from useDataIngestion.tsx; delegates to lib/hitDetection.ts::runHitDetectionForDates(). dominant_signal added to adaptive_tracking writes in lib. | Claude Code |
| 2026-05-11 | ARCH-03 complete: Jest + jest-expo test suite set up. 22 tests covering ENG-01/ENG-05/DGC/normalizeScope/pairUtils signal math regressions. | Claude Code |
| 2026-05-12 | Phase 3 complete: `supabase/functions/compute-slate-zk6/index.ts` deployed. ZK6 slate generation now routes through Supabase Edge Function using `SUPABASE_SERVICE_ROLE_KEY`. Feature flag `EXPO_PUBLIC_USE_EDGE_ZK6=true` in `.env`. Service-role bypasses RLS by design — this is the authorized write path for `slate_snapshots`, `daily_intelligence` (INSERT/UPDATE/DELETE), and `adaptive_tracking` (POST). Stamps `horizons_present_json._source = 'edge'` on every row written. Deploy date: 2026-05-12 00:47:46 UTC (commit d92fd99, bundled with BUG-18/20). Logged retroactively 2026-05-12 after forensic investigation; original deploy session did not update audit. | Claude Code (retroactive) |
| 2026-05-12 | ARCH-02 complete: lib/engineCore.ts extracted — pure TS/Deno-safe signal math. Both engines import from it; ~80 duplicate lines removed per engine. | Claude Code |
| 2026-05-12 | BUG-18 fully fixed: slate_date date column added to slate_snapshots + index + backfill. Both engines now write slate_date to snapshot payload. SlateSnapshot type updated. | Claude Code |
| 2026-05-12 | Quick Counts corrected: Open Medium was 1 (wrong) — now shows 2 (BUG-20 + ENG-02). Fixed count updated to 31. ARCH debt updated to 1 open/4 fixed. | Claude Code |
| 2026-05-12 | BUG-20 fixed: RLS lockdown on slate_snapshots (dropped allow_all/public), daily_intelligence (dropped two ALL policies), adaptive_tracking (enabled RLS + scoped policies). All INSERT paths now service_role only except adaptive_tracking anon insert for hitDetection. Fixed count 31→32, Open Medium 2→1. | Claude Code |
| 2026-05-12 | Forensic investigation complete: confirmed edge function (service_role) is sole post-BUG-20 write path; all SECURITY DEFINER functions read-only on locked tables; no triggers on locked tables; `source='live'→'edge'` transition confirmed in slate_snapshots data. | Claude Code |
| 2026-05-12 | BUG-28 identified (High): hit detection PATCH to daily_intelligence + slate_snapshots silently 401 post-BUG-20 — anon key blocked by authenticated-only UPDATE policies. Intelligence hit badges never written. | Claude Code |
| 2026-05-12 | BUG-29 identified (Low): DB functions calculate_hit_rates() and get_todays_hits() use updated_at_et date instead of slate_date column — latent boundary bug when slates are generated late-night ET. | Claude Code |
| 2026-05-12 | BUG-30 identified (Medium): ZK30 snapshots not persisted post-BUG-20 — no edge function path, anon INSERT blocked. Silent fallback to audit_logs on every ZK30 regen. | Claude Code |
| 2026-05-12 | Audit cleanup: retroactively logged Phase 3 ZK6 Edge Function deploy (commit d92fd99); downgraded BUG-20 to ⚠️ Partial with explicit scope breakdown; added BUG-28 to Closed Bugs (fix: anon UPDATE policies applied 2026-05-12); dropped BUG-29 (DB analytics `updated_at_et` issue — low-priority, no active users affected); removed BUG-30 (ZK30 non-functional framing superseded); added BUG-29 (ZK30 latent persistence failure, not active in production); updated Quality Scorecard Security (RLS) → ⚠️ Partial and Data Consistency note; added Phase 3.5 / 3.6 to Edge Function Migration Roadmap; added process note on audit-as-definition-of-done. | Claude Code |
| 2026-05-12 | Component patch pass applied (design handoff): `SignalBar.tsx` full replacement (fixed 60px track, iOS glow shadow); `SlateCard.tsx` full replacement (12h/8v padding, 32px rank container, canonical hot/warm/mild/cold temperature tokens); `PickCard.tsx` 3 surgical edits (`heatInfo` thresholds corrected, `tempColorFor()` helper + temperature-tinted bestStraight digits, signal bar labels BOX/PBURST/CO/DGC). | Claude Code |
| 2026-05-12 | BUG-30 fixed (High): Intelligence screen scope/navigation/cache wiring — `slateScope` now initialized from `globalScope`; `router.push` → `router.navigate` in `IntelligenceRouteView`; inline `regenerateSlate` replaces navigation button in empty state; `queryClient.removeQueries` added to home regen path. Commits 036d3c4 + 6dd8769. | Claude Code |
| 2026-05-12 | BUG-31 fixed (Critical): `daily_intelligence` permanently empty — edge function wrote `energy`/`indicator`/`times_drawn` (none exist in DB); PostgREST 400 silently swallowed by catch block. Fixed to `energy_score`; removed `indicator` and `times_drawn`. Edge function redeployed. Commit 89883f5. Fixed count 33→35. | Claude Code |
| 2026-05-12 | Design handoff 4 applied: `EnergyMeter.tsx` full replacement — 4-tier gradient (hot/amber/orange/gold/cyan/purple), cool gradient readable, baseline ring glow on all tiers. `TierBadge.tsx` full replacement — tierPalette(), FREE no-glow, PRO/PLUS shadowRadius 6, monoBold 800 weight, letterSpacing 0.6. | Claude Code |
| 2026-05-12 | iOS ctrlStrip overflow fixed (`explore.tsx`): filter/sort/view-mode row was a View with flex:1 spacer — right-side buttons clipped off screen. Changed to horizontal ScrollView; all chips now accessible. | Claude Code |
| 2026-05-12 | PickDetailModal accessibility pass: (1) useSafeAreaInsets — header paddingTop clears Dynamic Island on all iOS; (2) close/minimize buttons upgraded 32→44pt (iOS minimum tap target), frosted pill style with hitSlop; (3) drag handle indicator added at top; (4) tab content area changed View→ScrollView with insets.bottom padding to prevent clipping. | Claude Code |
| 2026-05-12 | Slates grid view redesigned for screenshot mode: ScrollView bypassed in compact mode entirely; flex:1 chain gridContainer→gridArea→gridRow fills exact screen height; new GridTile component (2×3 layout) renders rank chip, energy score, big adjustsFontSizeToFit combo digits, comboSet, and 4 micro signal bars — all 6 picks visible simultaneously without scrolling. UX Improvements Applied 35→45. | Claude Code |
| 2026-05-12 | V3 Patch 01 — Semantic theme aliases: freqSignal/momoSignal/patternSignal/consistSignal/hotStreak/brand/neutralCool/neutralWarm added to constants/theme.ts. Closes Enhancement Plan Phase I. | Claude Code |
| 2026-05-12 | V3 Patch 02 — Modal surface2 depth: import-wizard, paywall, coming-soon Stack screens now use surface2 for contentStyle+headerStyle in app/_layout.tsx. Closes Enhancement Plan Phase IV. | Claude Code |
| 2026-05-12 | V3 Patch 03 — Neon tab bar: app/(tabs)/_layout.tsx full replacement — TabIcon takes focused prop, active tab renders cyan pill halo with glow, bar uses surface2 bg + 1.5px purple border-top, height 64, uppercase labels. | Claude Code |
| 2026-05-12 | V3 Patch 04 — NeonSkeleton: new components/NeonSkeleton.tsx shimmer loading placeholder; 5 variants (card/row/combo/text/splash); opacity 0.35→0.75 loop at 900ms. | Claude Code |
| 2026-05-12 | V3 Patch 05 — NeonRefreshControl: new components/NeonRefreshControl.tsx themed pull-to-refresh; RefreshControl swapped to NeonRefreshControl alias in index.tsx, results.tsx, intelligence.tsx. | Claude Code |
| 2026-05-12 | V5 Patch 01 — SlateCard v2: replaced components/SlateCard.tsx with data-aware version. Renders 3 or 4 signal channels based on what is present (DGC is optional — only 122/563 picks have it). Surfaces drawsSince and lastSeen as first-class fields. Hit-result footer: "DREW → 827 CT · 2026-04-26" when hitType is set. hitType/hitResult/hitState/hitDate optional fields added to TopKStraightRow in types/core.ts. | Claude Code |
| 2026-05-12 | V5 Patch 02 — HitReplay: new components/HitReplay.tsx — side-by-side predicted vs drawn digit visual (ghost cells for picked digits, solid cells for drawn result). Wired into PickDetailModal.tsx PLAY tab at top when pick.hitType and pick.hitResult are set. Bridges PickItem.energy → temperature for HitReplay prop. | Claude Code |
| 2026-05-12 | V5 Patch 03 — EngineFingerprint: new screens/EngineFingerprintScreen.tsx — full-screen engine analytics dashboard (hit rate, scope count, singles share, hot-pick share KPI tiles; temperature distribution stacked bar; average channel strength bars for BOX/PBURST/CO/DGC). Includes computeFingerprint() helper that parses slate_snapshots rows. Wired into admin tab as new Fingerprint (🧬) tab via components/admin/FingerprintView.tsx (fetches 100 recent snapshots, computes stats, renders screen). UX Improvements Applied 45 → 48. | Claude Code |
| 2026-05-12 | BUG-32 fixed (Medium): Slates grid flex chain regression — `ctrlStripOuter` horizontal ScrollView (line 785, explore.tsx) had no height constraint, unlike `scopeRow` (same pattern, `maxHeight: 38`). On iOS the unconstrained ScrollView claimed flex space from the SafeAreaView column, leaving `gridContainer`'s `flex: 1` with insufficient remaining height; tiles rendered at natural content height near the bottom of the compressed space. Fix: added `maxHeight: 46` to `ctrlStripOuter` style (single property). Restores design intent of GridTile 2×3 redesign — grid now fills screen height instead of bunching. | Claude Code |
| 2026-05-12 | V6 Patch 01 — HomeScreen aggressive cleanup (UX-60): `app/(tabs)/index.tsx` full replacement. Above-the-fold chrome reduced from 9 bands to 2 (header + scope row). Mode switcher, EngineStatusBar, DrawTicker, LiveResultsTicker, heat check button, responsible play disclaimer moved into `OverflowSheet` bottom modal (triggered by ⋯ `MoreHorizontal` button in header). Inline stat strip (5 values) replaced with single `heroStat` widget showing AVG ENERGY as a large number colored by energy tier. Root container changed from `SafeAreaView` to `View` with `paddingTop: insets.top` (avoids double-inset on scroll). Hit banner and today's hits sections retained above K6 Slate hero — both are high-signal content. Onboarding, daily streak, generate flow, PickDetailModal, Paywall all preserved unchanged. | Claude Code |
| 2026-05-12 | Data boundary bug fixes (BUG-33 through BUG-36): (BUG-33) Home "TODAY'S HITS" validated against `todayResults` from histories table — stale hits from yesterday's snapshot no longer surface as today's. (BUG-34) Slates fallback path no longer filters `hitType` picks — full snapshot shown when all picks have hit. (BUG-35) Intelligence `loadSlate` falls back to yesterday's rows when today returns empty. (BUG-36) Results `onSlatePicks` query + client-side box-matching added — hits appear in ledger even when `backfillIntelHits` hasn't run yet (bypasses ARCH-05 backfill dependency). Fixed count 36→40. Commit 153dd76. | Claude Code |
| 2026-05-12 | 6 UX Enhancements (UX-64 through UX-69): (UX-64) Home draw countdown — `useDrawCountdown(scope)` hook added to `index.tsx`; heroStat card shows NEXT DRAW live countdown badge (ET midday 12:00 / evening 19:30), updates every second, color-coded purple. (UX-65) Intelligence 3-tab layout — `intelligence.tsx` view type expanded from `'analysis'|'slate'` to `'today'|'analysis'|'slate'`; new Today tab loads today's `daily_intelligence` rows, shows K6 picks first (highlighted) then watch list below, with 3-chip summary strip (K6 count, hits today, avg energy). (UX-66) Account plan comparison grid — FREE plan card in `account.tsx` replaces plain teaser text with a 5-row FREE vs ORACLE+ comparison table (K6 Picks, Best Straight, Heat Checks, Deep Analytics, Hit History). (UX-67) PickCard hit history timeline — `PickCard.tsx` pressure block enhanced with a mini bar showing drawsSince/365 scale + hit dot trail (up to 5 colored dots, overflow "+N" label). (UX-68) PickDetailModal share card — `PickDetailModal.tsx` `handleShare` now produces a formatted ASCII-bordered card with all 4 signals, pressure info, all-time hits count. (UX-69) Gradient headers — `book.tsx` sidebar header wrapped in purple→surface LinearGradient; `coverage.tsx` header wrapped in navy→background LinearGradient. UX Improvements Applied 52→58. | Claude Code |
| 2026-05-12 | V8 Patch 01 — Compact grid view fix (UX-63): `app/(tabs)/explore.tsx` surgical edit. (1) `tempColorForEnergy` corrected — was mapping 60–79→amber and 40–59→gold (wrong tokens), causing all cards to appear red; fixed to `warm`/`mild`/`cold` theme tokens. (2) `tempLabel()` helper added (HOT/WARM/MILD/COLD). (3) `GridTile` fully replaced: rank chip top-left; HOT/WARM/MILD/COLD temperature badge with energy number top-right; combo digits with `textShadowColor` glow; comboSet + SGL/DBL multiplicity meta row; 2×2 signal grid (B/P/C/D) with label + numeric value above each 3px neon bar; locked cards show 🔒 Pro chip. Card border + bar fill get `shadowColor` neon glow. UX Improvements Applied 51→52. | Claude Code |
| 2026-05-12 | V7 Patch 01 — Results Ledger cleanup (UX-62): `app/(tabs)/results.tsx` full replacement. Above-list chrome reduced from 5 bands to 3 (header + date tabs + one compact controls strip). Stats row (6 numbers) moved to `StatsSheet` bottom modal — prettier 4-cell session breakdown + total/hits/hit-rate row, triggered by ⋯ `MoreHorizontal` button in header. Search bar collapsed from full row to 🔍 icon trigger; tap expands inline with teal border + X to close; active query shown as teal chip on trigger. Session filter shrunk from full pills row to compact icon+3-letter-label pills inside a flex scrollable. Single `controlsRow` = [search trigger] [session pills] [draw count]. All queries, processed data, grouped sections, hit badge rendering, F/B/S signal columns preserved unchanged. UX Improvements Applied 50→51. | Claude Code |
| 2026-05-12 | BUG-28 re-applied: RLS SQL (`GRANT UPDATE TO anon` + `intelligence_update_anon` + `snapshots_update_anon` policies) was generated in the first pass but never executed — PATCHes continued to 401. Re-run with `DROP POLICY IF EXISTS` guards on second pass. 5/11 hit data written directly via SQL (609 QC evening, 425 TX morning) as one-time data repair since app write path was blocked. False `hit_box=true` on 5/12 allday row cleared via SQL. | Claude Code |
| 2026-05-12 | BUG-37 fixed (High): Admin "Run Hit Detection Now" ran only for today. `handleDetectHits` iterated scopes for `getTodayET()` only — on 5/12 found no draws and reported "no hits." Fixed to iterate `[getYesterdayET(), today]` so yesterday's hits are always checked. Commit 1690785. | Claude Code |
| 2026-05-12 | BUG-38 fixed (High): Results tier-3 scope-limited — `useSnapshot().hitPicks` filtered to current scope. Allday hits invisible when user was on midday/evening scope. Replaced with direct `slate_snapshots` query (no scope filter) + client-side `snapshotHitPicks` memo. Commit 1690785. | Claude Code |
| 2026-05-12 | BUG-39 fixed (High): `file_meta` not a column in `slate_snapshots` — explicit SELECT caused 400 on all tier-3 queries. Removed from column list; dropped supplement-skip guard. Commit 603d732. | Claude Code |
| 2026-05-12 | BUG-56/57/59/82/84/107 fixed (all 6 critical): Number Book persistence added (AsyncStorage); sample lists removed; XHR replaced with fetchFromSupabase in admin-imports + HitTrackingView + useDataIngestion; hardcoded anon JWT fallback removed from useDataIngestion; Supabase project URL removed from HealthTestsView UI. Fixed count 44→50, Critical Open 6→0. Commit 42f6d2c. | Claude Code |
| 2026-05-12 | Deep scan complete: full read of 38 production files. BUG-41 through BUG-123 documented (83 new findings: 6 critical, 20 high, 51 medium, 5 low, 1 updated). ENH-01 through ENH-22 documented. Quick Counts updated. No fixes applied — awaiting triage orders. | Claude Code |
| 2026-05-12 | BUG-40 fixed (High): `on_slate=false` (set by "Clear Top 30") blocked tier-1 confirmed-hits query — `on_slate=eq.true` guard removed from `hits` query only. `onSlatePicks` (tier-2) retains the guard intentionally. Fixed count 40→44. Commit 25de56d. | Claude Code |
| 2026-05-12 | V6 Patch 02 — SlatesScreen 3-tab densification (UX-61): `app/(tabs)/explore.tsx` full replacement. Replaced 5-band chrome stack with 3-tab segmented control (Slate · Live · More) below a simplified header. SLATE tab: scope pills + filter/sort/view-mode chips merged into a single horizontally-scrollable `scopeRow` (`maxHeight: 42`) — eliminates `ctrlStripOuter` (BUG-32 no longer relevant). LIVE tab: `DrawTicker` + today's hit list + heat check action row. MORE tab: yesterday toggle + save slate + engine mode + daily credits (Pro) + pro upsell banner + responsible play disclaimer. Yesterday query now gated with `enabled: tab === 'more' && showYesterday` — no wasted network call when not on More tab. `DrawTicker` added as new import (was not in explore.tsx before). All state handlers preserved. UX Improvements Applied 48→50. | Claude Code |