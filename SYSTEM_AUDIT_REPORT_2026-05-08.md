# HitMaster System Audit Report
**Date:** May 8, 2026
**Status:** Ongoing
**Author:** Gemini CLI

## 1. Executive Summary
This audit evaluates the HitMaster ZK6 platform's architecture, data integrity, and operational workflows. Recent issues with missing hits in the Results Ledger highlighted vulnerabilities in the data pipeline and engine-to-database synchronization. While immediate fixes have been applied, structural improvements are needed to ensure long-term stability and scalability.

---

## 2. Architecture & Code Quality
### 2.1 Monolithic Components
- **Issue:** `app/(tabs)/admin.tsx` has grown to nearly 4,000 lines, containing UI, data fetching, business logic, and engine calls.
- **Risk:** High maintenance overhead, potential for side effects, and slow development velocity.
- **Recommendation:** Decompose the Admin panel into smaller feature-based components (e.g., `ImportWizard`, `EngineConfig`, `HealthMonitor`).

### 2.2 Duplicate Engine Logic
- **Issue:** `engines/zk6.ts` and `engines/zk30.ts` share approximately 80% of their logic (signal computation, normalization, blending).
- **Risk:** Bug fixes or weight updates in one engine might be missed in the other.
- **Recommendation:** Extract the core signal computation logic into a shared `lib/engineCore.ts` utility.

---

## 3. Data Integrity & Consistency
### 3.1 Non-Atomic Operations
- **Issue:** Slate regeneration performs a `DELETE` followed by an `INSERT` on the `daily_intelligence` table.
- **Risk:** A race condition where a concurrent hit detection or UI fetch sees zero rows.
- **Recommendation:** Use a single `UPSERT` (using `on_conflict`) or wrap the operation in a database transaction/RPC.

### 3.2 Historical Hit Visibility
- **Issue:** The recently added `on_slate` filter in `app/(tabs)/results.tsx` hides all hits generated before the column existed.
- **Status:** **FIXED** via manual SQL backfill on 2026-05-08.
- **Risk:** Future schema changes might introduce similar "blind spots" for historical data.

### 3.3 Date Tagging Paradox
- **Issue:** Engines use `getTodayET()` to tag `slate_date`.
- **Scenario:** A "Midday" slate for Saturday generated on Friday night is tagged as "Friday." Hit detection on Saturday looks for "Saturday" results and finds no matching "Saturday" slate.
- **Recommendation:** Decouple `generation_date` from `target_play_date` in the engine parameters.

---

## 4. Engine & Hit Detection Logic
### 4.1 Snapshot Window
- **Issue:** `lib/hitDetection.ts` and the Admin dashboard only check the "Latest 2" snapshots.
- **Risk:** If multiple supplemental slates or scope regenerations occur, the hit detector misses the original primary slate.
- **Recommendation:** Query snapshots by the `slate_date` or the specific `updated_at_et` range being audited.

### 4.2 Data Sparsity Fallbacks
- **Issue:** If a scope (e.g., `midday`) has < 50 rows, the engine falls back to `allday`.
- **Risk:** Silent fallback can lead to "uninformed" picks if the user expects scope-specific intelligence.
- **Recommendation:** Explicitly flag "Fallback Mode" in the UI (partially implemented in `EngineStatusBar`).

---

## 5. Security & Access Control
### 5.1 Permissive RLS
- **Issue:** `slate_snapshots` and `daily_intelligence` have "Allow All" policies for `anon`, `authenticated`, and `service_role`.
- **Risk:** Data exfiltration or malicious modifications if API keys are exposed.
- **Recommendation:** Restrict `INSERT/UPDATE/DELETE` to the `service_role` or a specific `admin` UUID, leaving only `SELECT` for authenticated users.

---

## 6. Recent Improvements (Audit-Driven)
- [x] **Batch Import:** Ledger imports now use 50-row chunks, significantly reducing Supabase timeouts.
- [x] **Robust Date Parsing:** Improved `importLedger` to use parsed `dateEt` instead of raw CSV strings.
- [x] **Wired Pipeline:** Ledger imports now automatically trigger hit detection and cache invalidation.

---

## 7. Immediate Roadmap
1. **Refactor Engine Core:** Consolidate `zk6` and `zk30` logic.
2. **Atomic Intelligence Writes:** Convert `DELETE/POST` sequences to Supabase RPCs.
3. **Target Date Logic:** Update UI to pass an explicit `targetDate` to the engine.
