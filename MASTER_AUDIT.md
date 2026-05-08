# HitMaster — Master Audit & Fix Tracker
**Project:** HitMaster ZK6/ZK30 Analytics App  
**Stack:** Expo / React Native · Supabase · TypeScript  
**Last updated:** 2026-05-08  
**Maintained by:** therealzerro + Claude Code

> **USAGE:** This is the single source of truth for all known issues, fixes, and technical debt.  
> When a fix is made, update the status column and add a note. Do not create new audit files — append here.

---

## Quick Counts

| State | Count |
|-------|-------|
| ✅ Fixed | 11 |
| ℹ️ By design / False positive | 6 |
| 🔴 Open — Critical | 0 |
| 🟠 Open — High | 2 |
| 🟡 Open — Medium | 3 |
| 🔵 Open — Low | 0 |
| 🏗️ Architecture Debt | 4 |

---

## Bug Registry

### Closed Bugs

| ID | Severity | Description | Status | Fixed in | Date |
|----|----------|-------------|--------|----------|------|
| BUG-01 | 🔴 Critical | ZK30 jurisdiction hardcoded to TX in `fetchRaw()` | ✅ Fixed | `engines/zk30.ts` | 2026-05-08 |
| BUG-02 | 🔴 Critical | Default admin role; any user could become admin | ✅ Fixed | `hooks/useAuth.tsx` | 2026-05-08 |
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

---

### Open Bugs

#### 🟠 High

**BUG-18 — Date Tagging Paradox (Late-Night Regen)**  
_Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §3.3_  
- **Files:** `engines/zk6.ts`, `engines/zk30.ts`, all callers of `computeSlate()`  
- **Problem:** Engines tag `slate_date` using `getTodayET()` at generation time. A midday slate generated Friday night gets tagged Friday. Hit detection on Saturday looks for Saturday slates and finds nothing — the hit is missed.  
- **Fix:** Decouple `generation_date` from `target_play_date`. Pass an explicit `targetDate` parameter to `computeSlate()` and `computeZK30Slate()`. Callers (Admin regen, account.tsx) pass the intended play date.  
- **Status:** Open  

**BUG-19 — Snapshot Window Too Narrow for Hit Detection**  
_Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §4.1_  
- **Files:** `lib/hitDetection.ts`, `hooks/useDataIngestion.tsx`  
- **Problem:** Hit detection queries only the "Latest 2" snapshots. If multiple supplemental slates or scope regenerations have occurred, the original primary slate is outside the window and its hits are never detected.  
- **Fix:** Query snapshots by `slate_date` (the intended play date) instead of recency. All snapshots for the relevant date should be checked.  
- **Status:** Open  

#### 🟡 Medium

**BUG-20 — Permissive RLS on Core Tables**  
_Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §5.1_  
- **Tables:** `slate_snapshots`, `daily_intelligence`  
- **Problem:** RLS policies currently allow `INSERT/UPDATE/DELETE` for `anon` and `authenticated` roles. If the anon key is exposed, any caller can mutate or delete core data.  
- **Fix:** Restrict `INSERT/UPDATE/DELETE` to `service_role` only. Leave `SELECT` for `authenticated`. Admin mutations must go through a Supabase Edge Function that uses the service key server-side.  
- **Status:** Open — requires DB policy change  

**BUG-21 — Data Sparsity Fallback Not Surfaced in UI**  
_Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §4.2_  
- **Files:** `engines/zk6.ts` (fallback to `allday` if < 50 rows), explore screen  
- **Problem:** When scope data is sparse, ZK6 silently falls back to `allday`. User sees midday picks but they're actually allday picks.  
- **Fix:** Set a flag in the snapshot metadata (already has `_source` in `EngineMetadata`). Explore screen reads this flag and shows a "Fallback: allday data" label when `_source !== scope`.  
- **Status:** Open  

**BUG-22 — `excludedCombos` Not Cleared Between Regen Calls**  
_Source: AUDIT_2026-05-08.md §3 hooks_  
- **Files:** `hooks/useDataIngestion.tsx`  
- **Problem:** `excludedCombos` accumulates across regen calls within a session. Prior exclusions can bleed into a new scope's regen, incorrectly suppressing combos.  
- **Fix:** Reset `excludedCombos` at the start of each `computeSlate` call or pass it as a parameter rather than maintaining shared state.  
- **Status:** Open  

---

## Architecture Debt

These are not bugs but structural issues that will cause maintenance pain at scale.

| ID | Item | Risk | Status |
|----|------|------|--------|
| ARCH-01 | `admin.tsx` ~4000 lines — UI, data fetching, business logic all mixed | Slow velocity, high side-effect risk | Open — decompose into `ImportWizard`, `EngineConfig`, `HealthMonitor` |
| ARCH-02 | ZK6 and ZK30 share ~80% logic — two separate files | Fixes in one engine get missed in the other | Open — extract `lib/engineCore.ts` shared signal computation |
| ARCH-03 | No unit test suite | Signal computation regressions go undetected | Open — add tests for BOX/PBURST/CO/DGC with sample fixture data |
| ARCH-04 | `useDataIngestion.tsx` imports `computeSlate` from ZK6 only — no path to trigger ZK30 regen from hooks | ZK30 can only be regenerated from the Admin screen directly | Open |

---

## Pre-Audit Fixes (Context)

Fixes applied before the 2026-05-08 audit that informed the audit findings.

| Fix | File | Date |
|-----|------|------|
| `EXPO_FORCE_WEBCONTAINER_ENV=1` — routes `--tunnel` through `@expo/ws-tunnel` instead of broken ngrok | `.env` | 2026-05-08 |
| `on_slate=eq.true` added to results hits query | `app/(tabs)/results.tsx` | 2026-05-08 |
| `on_slate=true` PATCH added after K6 rail selection | `engines/zk6.ts` | 2026-05-08 |
| `ALTER TABLE daily_intelligence ADD COLUMN on_slate boolean NOT NULL DEFAULT false` | Supabase SQL | 2026-05-08 |
| `on_slate` backfilled for all historical rows via SQL | Supabase SQL | 2026-05-08 |
| Ledger imports use 50-row batch chunks to avoid Supabase timeouts | `hooks/useDataIngestion.tsx` | 2026-05-08 |
| Ledger import triggers hit detection + cache invalidation automatically | `hooks/useDataIngestion.tsx` | 2026-05-08 |

---

## Quality Scorecard

| Dimension | Before Audit | After 2026-05-08 Fixes | Target |
|-----------|-------------|------------------------|--------|
| Type Safety | ⚠️ Medium | ✅ Good | ✅ Good |
| Error Handling | ⚠️ Medium | ✅ Good | ✅ Good |
| Concurrency Safety | 🔴 Risk | ✅ Good | ✅ Good |
| Performance | ⚠️ Medium | ✅ Good | ✅ Good |
| Security (auth/roles) | 🔴 Risk | ✅ Good | ✅ Good |
| Security (RLS) | 🔴 Risk | 🔴 Risk (BUG-20) | ✅ Good |
| Data Consistency | ⚠️ Medium | ⚠️ Medium (BUG-18/19 open) | ✅ Good |
| Test Coverage | ❓ None | ❓ None | ⚠️ Medium |
| Documentation | ✅ Good | ✅ Good | ✅ Good |
| Maintainability | ⚠️ Medium | ⚠️ Medium (ARCH-01–04 open) | ✅ Good |

---

## Changelog

| Date | Change | By |
|------|--------|----|
| 2026-05-08 | Initial master audit created; consolidated AUDIT_2026-05-08.md + AUDIT_FIX_STATUS_2026-05-08.md + SYSTEM_AUDIT_REPORT_2026-05-08.md | Claude Code |
| 2026-05-08 | BUG-01 through BUG-17 resolved/triaged; BUG-18 through BUG-22 identified as open | Claude Code |
| 2026-05-08 | BUG-07 fully resolved — cursor-based pagination on Intelligence tab | Claude Code |
| 2026-05-08 | BUG-08 resolved by design — "National" label added to explore status strip | Claude Code |
