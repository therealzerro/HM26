# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Rules

- **Always work in `/workspaces/HM26` root.** Never edit anything inside `HITMASTER5-main/` subfolder — it is a stale backup.
- **`MASTER_AUDIT.md` is the single source of truth** for all bugs, fixes, and architectural debt. Update it whenever you fix or discover an issue.
- **ZK6 engine must be fully stable before any work on ZK30.** The `engines/zk30.ts` file is an early-stage parallel build; leave it alone until ZK6 is verified.
- **Never trust MASTER_AUDIT.md claims as facts** — verify by reading the actual code before acting.

## Dev Commands

```bash
# Start dev server (standard)
npm run start

# Start with tunnel (required in this codespace — uses @expo/ws-tunnel via boltexpo.dev)
# EXPO_FORCE_WEBCONTAINER_ENV=1 is set in .env — do NOT remove it
npm run start-tunnel

# Lint
npm run lint
```

There is no automated test suite (see ARCH-03 in MASTER_AUDIT.md).

## Engine Changes — Empirical Validation Required (Code AND Config)

Any change to files matching `engines/*.ts`, `lib/engineCore.ts`, `supabase/functions/compute-slate-*/`, `constants/zk6.ts`, OR rows in `app_config` affecting engine behavior, **MUST** be preceded by:

1. Backtest with existing math/config over last 30 days → **BASELINE** recorded in audit
2. Backtest with proposed math/config over SAME 30 days → **CANDIDATE** recorded in audit
3. Merge only if CANDIDATE ≥ BASELINE on overall hit rate, OR explicit user override with stated reason and planned review date

```bash
# Run baseline before any engine/config change:
npm run backtest:replay -- --days 30 --config default

# Run candidate after proposing the change:
npm run backtest:replay -- --days 30 --config <new-preset-name>
```

Config changes are tracked with **CONFIG-XX** entries in `MASTER_AUDIT.md` (parallel to BUG-XX). The 2026-05-09 Gemini CLI incident (CONFIG-01) is the canonical example of what happens without this process — 3 days of degraded picks, no audit trail, required forensic recovery.

**No engine change ships without a hit-rate number attached.**

## Brand voice — public-facing strings

The HitMaster ZK6 Facebook page was de-recommended by Meta twice in May 2026 (early May, then again 5/17 within hours of brief restoration) due to algorithmic misclassification as gambling-adjacent. Two appeals denied 2026-05-18. The product is being repositioned as a **data intelligence and analytics platform** — comparable to ESPN Stats, FiveThirtyEight, Yahoo Finance — not a lottery prediction service. Any user-facing text in the codebase must reflect that voice.

**Canonical brief for all public-facing content work** (graphics, video, captions, App Store metadata, push copy): `assets/HitMaster_Brand_Rehab_Skill_Brief_v2.md` (effective 2026-05-18). It supersedes the v1 Designer Agent Brief and adds: mandatory Two-Question pre-publication filter, 4-tier audience map (public page = brand-only; free group = conversion funnel; cross-posts; Pro $0.99/mo; App Store), and Gemini Nano Banana Pro prompt conventions. The in-code forbidden-word shortlist below is a subset — when in doubt, consult v2. BRAND-01 in `MASTER_AUDIT.md` tracks the in-app audit.

**Avoid:** "lottery", "lotto", "Pick 3", "winning numbers", "winners", "winning", "daily picks", "today's picks", "hot picks", "Daily Heat", "hits" (as a count of correct predictions), "Hit detection", "play"/"play the numbers", "gamble"/"bet", "lucky"/"luck", "jackpot"/"payout".

**Use instead:** "daily signals", "intelligence reports", "data drops", "Daily Intelligence", "pattern matches", "patterns identified", "signals matched", "predictions verified", "pattern matching", "numerical pattern analysis", "observed outcomes", "succeed"/"outperform", "use"/"apply"/"engage".

**Applies to:** `app.config.ts`, `app.json`, push notification copy, App Store / Play Store metadata, share message templates, deep-link previews, splash/onboarding copy, error messages shown to users, and all consumer-tab UI (`app/(tabs)/index.tsx`, `explore`, `results`, `book`, `learn`, `account`, `track-record`, plus shared consumer components and modals).

**Does NOT apply to:**
- Internal code identifiers — function names, variable names, type names, file names (`hitDetection.ts`, `HitHeroBand.tsx`, `hit_box`, `runHitDetectionAndRefresh` all stay).
- Comments, audit log strings, `console.*` output, MASTER_AUDIT entries.
- Admin/operator surfaces — `app/(tabs)/intelligence.tsx`, `app/(tabs)/admin.tsx`, `app/(tabs)/admin-imports.tsx`, and `components/admin/*`. These are internal tools; subscribers don't see them.
- The brand name **HitMaster** / **HitMaster ZK6** itself — preserved everywhere as the wordmark.

When editing user-facing strings, do not bulk-rename. Each replacement is per-string and context-sensitive (e.g. "Today's picks" → "Today's signals", but a button labeled "Detect hits" in admin tools stays).

## Architecture Overview

### Stack
- **React Native / Expo** (SDK 52, Expo Router file-based routing)
- **Supabase** backend — raw REST via `fetchFromSupabase()` in `lib/supabase.ts`. No Supabase JS SDK.
- **TanStack React Query** for server-state caching. Cache invalidated via `queryClient.invalidateQueries()`.
- **AsyncStorage** for local persistence (snapshots, settings, auth state).

### Routing
`app/(tabs)/` contains all tab screens: `index` (Home), `explore` (Slates), `book`, `intelligence`, `results`, `coverage`, `zk30`, `admin`, `admin-imports`, `account`. Modal/stack screens live directly under `app/`.

### ZK6 Engine (`engines/zk6.ts`)
The core pick-generation engine. Entry point: `computeSlate({ scope, weightsKey, excludeComboSets?, is_supplement? })`.

Data flow:
1. **Load data** — `loadEngineData(scope)` fetches box history and pair history from Supabase across horizons H01Y–H10Y (national aggregate slice: `jurisdiction IS NULL`, box `class_id=1`, pair classes 2–11). The "Daily Input" import type does NOT feed the engine — it is an operator checklist/audit marker only (BUG-130); live freshness comes from `histories` via the Daily Workflow rebuild.
2. **Score universe** — Every 3-digit combo (000–999) receives four normalized signals:
   - **BOX**: historical frequency + over-due pressure. Normalized via **max-norm** (not min-max).
   - **PBURST**: position pair signal. Uses `timesDrawn / maxTimesDrawn` (NOT `dsRaw` — that was bug ENG-05).
   - **CO**: co-occurrence pair signal. Same pair data, co-occurrence dimension.
   - **DGC**: draw gap consistency signal.
3. **Weighted sum** → `indicator` score using `weightsKey` ('balanced' | 'conservative' | 'aggressive').
4. **K6 selection** — 6-pass rail-constrained selection targeting exactly 6 picks:
   - Hard blocks (never relaxed): duplicate `comboSet`, today's already-hit `comboSets`.
   - Passes progressively relax: excluded sets → pairRepCap → cooldown → multiplicity caps (Pass 6).
5. **Persist** — snapshot written to `slate_snapshots` table with `top_k_straights_json`.

Key invariants:
- BOX normalization: **max-norm** (`value / max`). Min-max was a bug (ENG-01).
- Pair signal freqScore: `timesDrawn / maxTimesDrawn`. Using `dsRaw` inverts the signal (ENG-05).
- Snapshot hash excludes `Date.now()` — must be deterministic (ENG-04).
- Pass 6 with `relaxMultCaps=true` guarantees exactly 6 picks even if DB `app_config` multiplicity caps sum < 6.

### Data Hooks
- `hooks/useSnapshot.tsx` — fetches and caches slate snapshots per scope.
- `hooks/useDataIngestion.tsx` — the single mutation layer for all import flows (box history, pair history, daily input marker, ledger). Ledger imports from every surface (admin wizard + `npm run import:results` CLI) share `lib/parseLedger.ts` (which normalizes both tab and vertical lottery-post formats) and `importLedgerMutation` (conflict-key dedupe + retry/backoff). See MASTER_AUDIT IMPORT-REHAB-01.
- `hooks/useAuth.tsx` — role-based access (`free | premium | admin`). Defaults to `free`; admin must be set explicitly via the triple-tap easter egg.
- `hooks/useScope.tsx` — global scope state (`midday | evening | allday`).

### Hit Detection
One implementation: `lib/hitDetection.ts`, a thin client over the `run-hit-detection` edge function (service-role; BUG-145). All call sites — admin screens, ledger imports, the Daily Workflow, and the CLI — go through it. ARCH-05's second (inline) implementation was removed; do not add a parallel path.

### Supabase REST Pattern
```typescript
// GET
const rows = await fetchFromSupabase<MyType[]>({ path: '/rest/v1/table?col=eq.val', method: 'GET' });

// PATCH
await fetchFromSupabase({ path: '/rest/v1/table?id=eq.123', method: 'PATCH', body: { col: value } });
```
All auth via `EXPO_PUBLIC_SUPABASE_ANON_KEY` env var. The `Prefer: return=minimal` header suppresses response bodies on mutations.

### Key Tables
- `slate_snapshots` — persisted engine outputs. `top_k_straights_json` holds the pick array. `file_meta.is_supplement` marks supplemental slates.
- `daily_intelligence` — top-30 combos with hit tracking (`hit_box`, `hit_straight`).
- `adaptive_tracking` — per-pick hit history for engine feedback.
- `histories` — draw results (`result_digits`, `comboset_sorted`, `jurisdiction`, `session`, `date_et`).
- `app_config` — engine rail parameters (`k6_singles_max`, `k6_doubles_max`, etc.).
