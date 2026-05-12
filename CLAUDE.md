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
1. **Load data** — `loadEngineData(scope)` fetches box history, pair history, and daily input from Supabase across horizons H01Y–H10Y.
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
- `hooks/useDataIngestion.tsx` — handles all import flows (box history, pair history, daily input, ledger). Also contains an inline `runHitDetectionAndRefresh` used only for ledger imports.
- `hooks/useAuth.tsx` — role-based access (`free | premium | admin`). Defaults to `free`; admin must be set explicitly via the triple-tap easter egg.
- `hooks/useScope.tsx` — global scope state (`midday | evening | allday`).

### Hit Detection
Two implementations exist (ARCH-05 / NEW-28):
1. `lib/hitDetection.ts` — used by `admin.tsx` and `import-wizard.tsx`. Uses date-range snapshot queries with per-scope fallback.
2. Inline in `hooks/useDataIngestion.tsx` — used only by ledger import flow.

Unification is deferred; do not add a third path.

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
