# HitMaster — Master Audit & Fix Tracker
**Project:** HitMaster ZK6/ZK30 Analytics App  
**Stack:** Expo / React Native · Supabase · TypeScript  
**Last updated:** 2026-05-11 (Full code verification + engine fixes by Claude Code)  
**Maintained by:** therealzerro + AI Assistant

> **USAGE:** This is the single source of truth for all known issues, fixes, and technical debt.  
> When a fix is made, update the status column and add a note. Do not create new audit files — append here.

---

## Quick Counts

| State | Count |
|-------|-------|
| ✅ Fixed | 21 |
| ℹ️ By design / False positive | 8 |
| 🎨 UX Improvements Applied | 31 |
| 🔴 Open — Critical | 1 |
| 🟠 Open — High | 0 |
| 🟡 Open — Medium | 2 |
| 🔵 Open — Low | 0 |
| 🏗️ Architecture Debt | 5 |

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
| BUG-02 | 🔴 Critical | Default admin role; any user could become admin | 🔴 Still Open — `useAuth.tsx:19,33` default is STILL `role: 'admin'`. Audit claim was incorrect. | `hooks/useAuth.tsx` | — |
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

---

### Open Bugs

#### 🟠 High

**BUG-18 — Date Tagging Paradox (Late-Night Regen)** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §3.3_  
- **Files:** `engines/zk6.ts`, `engines/zk30.ts`, `lib/hitDetection.ts`  
- **Problem:** Engines tag `slate_date` in `daily_intelligence` using `getTodayET()` at generation time. A slate generated Friday night is tagged with `slate_date=Friday`. When hit detection runs for Saturday's results, `updateDailyIntelligenceHit` patched `slate_date=Saturday` — missing the Friday-tagged row, so intelligence hit flags were silently not updated.
- **Status:** ✅ **Partially Fixed 2026-05-11** — `updateDailyIntelligenceHit` in `lib/hitDetection.ts` now uses `slate_date=in.(date,prevDay)` so late-night slate intelligence rows are found and updated. Snapshot-based hit detection was already handled by BUG-19 fix. Full schema solution (adding `slate_date` column to `slate_snapshots`) deferred — requires DB migration.

**BUG-19 — Snapshot Window Too Narrow for Hit Detection** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §4.1_  
- **Files:** `lib/hitDetection.ts`, `hooks/useDataIngestion.tsx`  
- **Problem:** Hit detection queries only the "Latest 2" snapshots. If multiple supplemental slates or scope regenerations have occurred, the original primary slate is outside the window and its hits are never detected.  
- **Status:** ✅ **Fixed 2026-05-11** — `lib/hitDetection.ts` now uses date-range query (`updated_at_et ≥ date AND < nextDay 09:00Z`) with `limit=10` and per-scope fallback to most-recent. All primary + supplemental slates for the target date are checked.

#### 🟡 Medium

**BUG-20 — Permissive RLS on Core Tables** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §5.1_  
- **Tables:** `slate_snapshots`, `daily_intelligence`  
- **Problem:** RLS policies currently allow `INSERT/UPDATE/DELETE` for `anon` and `authenticated` roles. If the anon key is exposed, any caller can mutate or delete core data.  
- **Fix:** Restrict `INSERT/UPDATE/DELETE` to `service_role` only. Leave `SELECT` for `authenticated`. Admin mutations must go through a Supabase Edge Function that uses the service key server-side.  
- **Status:** Open — Verification: SQL policies confirm broad access remains for non-service roles.

**BUG-21 — Data Sparsity Fallback Not Surfaced in UI** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §4.2_  
- **Files:** `engines/zk6.ts` (fallback to `allday` if < 50 rows), `app/(tabs)/explore.tsx`, `components/StatusRibbon.tsx`  
- **Problem:** When scope data is sparse, ZK6 silently falls back to `allday`. User sees midday picks but they're actually allday picks.  
- **Status:** ✅ **Fixed 2026-05-11** — `horizons_present_json._dataStats.usingFallback` flag was already stored in snapshots. `explore.tsx` status strip now reads this flag and shows `⚠ allday fallback` in amber when true and scope ≠ allday. `StatusRibbon.tsx` horizon filter also fixed to only include `H0XY` keys (was incorrectly including `_dataStats`, `_engineVersion`, etc.) and now shows a dedicated fallback chip.

**BUG-22 — `excludedCombos` Not Cleared Between Regen Calls** _Source: AUDIT_2026-05-08.md §3 hooks_  
- **Files:** `hooks/useDataIngestion.tsx`  
- **Status:** ✅ **FALSE POSITIVE — Already Fixed.** Verified 2026-05-11: `regenerateMutation` at line 1024 creates `const excluded = new Set<string>()` as a fresh local variable on every invocation. No shared mutable state exists between calls.

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

---

## Architecture Debt & Refactoring Targets

These are not bugs but structural issues that will cause maintenance pain at scale.

| ID | Item | Risk | Status |
|----|------|------|--------|
| ARCH-01 | `admin.tsx` ~4000 lines — UI, data fetching, business logic all mixed | Slow velocity, high side-effect risk | Open — decompose into `ImportWizard`, `EngineConfig`, `HealthMonitor` |
| ARCH-02 | ZK6 and ZK30 share ~80% logic — two separate files | Fixes in one engine get missed in the other | Open — extract `lib/engineCore.ts` shared signal computation |
| ARCH-03 | No unit test suite | Signal computation regressions go undetected | Open — add tests for BOX/PBURST/CO/DGC with sample fixture data |
| ARCH-04 | `useDataIngestion.tsx` imports `computeSlate` from ZK6 only — no path to trigger ZK30 regen from hooks | ZK30 can only be regenerated from the Admin screen directly | Open |
| ARCH-05 / NEW-28 | Dual hit detection system — `lib/hitDetection.ts` (used by `admin.tsx`, `import-wizard.tsx`) and inline `runHitDetectionAndRefresh` in `useDataIngestion.tsx` (used by ledger import) are two separate implementations with divergent behavior | Hits detected via admin may miss cases handled by ledger-triggered detection and vice versa | Partially mitigated — `lib/hitDetection.ts` fixed to use date-range queries (2026-05-11). Full unification deferred. |

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
| Security (auth/roles) | ✅ Good | ✅ Good |
| Security (RLS) | ✅ Good | 🔴 Risk (BUG-20) |
| Data Consistency | ✅ Good | ⚠️ Medium (BUG-18/19 open) |
| Engine Accuracy | ✅ Good | 🔴 Risk (BUG-22/ENG-01 open) |
| Test Coverage | ⚠️ Medium | ❓ None |
| Documentation | ✅ Good | ✅ Good |
| Maintainability | ✅ Good | ⚠️ Medium (ARCH-01–04 open) |
| User Experience | ✅ Good | ✅ Good |
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
| DES-01 | **Neon Glow Integration** | High | Migrate from flat borders to glow recipes (`--hm-glow-cyan`, etc.) using `react-native-drop-shadow` or gradients. |
| DES-02 | **Typography Precision** | Medium | Adopt Inter (UI) and JetBrains Mono (Data) with spec-aligned tracking (`letter-spacing`) and weights. |
| DES-03 | **Haptic/Visual Feedback** | Medium | Implement animated pulse patterns on high-energy cards and "Hit" states to increase user engagement. |
| DES-04 | **Token Synchronization** | Low | Create a `TokensProvider` mapping CSS design tokens to `theme.ts` to ensure single-source-of-truth for UI design. |

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
| UX-46 | Shadow System Divergence | 🟡 Medium | Open — `SlateCard` uses `theme.shadows.glow`, others use deprecated `soft` |
| UX-47 | Semantic Color Ambiguity | 🟡 Medium | Open — Mixing physical/semantic aliases in `PickCard` signals |
| UX-48 | Inconsistent Surface Depth | 🟡 Medium | Open — `surface2` vs `bgElevated` base surface inconsistency |
| UX-49 | Empty State Fragmentation | 🔵 Low | Open — Some screens still use custom inline UI instead of `EmptyState.tsx` |

### Proposed UI Enhancement Plan

| Phase | Enhancement | Description |
| :--- | :--- | :--- |
| **I** | Theme Consolidation | Alias all semantic signal colors directly to target aliases (e.g., `freqSignal`) to prevent leakage. |
| **II** | Shadow Standardization | Migrate all `theme.shadows.soft` references to `theme.shadows.glow` for brand cohesion. |
| **III** | Component Refactoring | Audit all screens to replace manual empty-state UI with `EmptyState.tsx`. |
| **IV** | Layering Polish | Enforce `surface2` usage in `_layout.tsx` and modal base containers for consistent depth. |


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