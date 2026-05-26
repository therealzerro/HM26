# Jurisdiction Engine Template — v1.0 Retrospective

**Source:** ZK30 v1.0 TX build (2026-05-23 → 2026-05-25)
**Audience:** future ZK30 jurisdiction expansions (SC, OH, NJ, NY, FL, others), ZK50 (Pick 4) engine, anyone forking the engine pattern.
**Purpose:** capture architectural decisions, sign-off question registry, pitfalls, and effort estimates so subsequent jurisdiction builds run in days rather than re-derived weeks.

---

## 1. Architectural principles (load-bearing — read first)

These emerged across the 7-step build and apply to every future jurisdiction engine.

### 1.1 Isolation by default, share with discriminators only where read-heavy
- **Fork tables for write-heavy paths**: `histories_{jur}`, `daily_intelligence_{engine}`, `adaptive_tracking_{engine}`, `slate_snapshots_{engine}`. Forking prevents BUG-153/BUG-04-class race conditions cross-contaminating engines and lets schemas evolve independently.
- **Share tables for read-heavy or telemetry paths** with a discriminator column: `datasets_box`, `datasets_pair`, `hit_detection_runs`, `engine_runs`. Use `jurisdiction='XX'` + `run_source='edge-{engine}'` to filter.
- **The principle**: writes that re-run per slate-gen (or more often) get their own table. One-off / telemetry writes share with a tag.

### 1.2 Recon-before-build (Phase 1 / Phase 2 split)
Every step that touches new code starts with a read-only reconnaissance phase. The recon produces a doc with sign-off questions; build only starts after sign-off. Skipping recon (Steps 3a parser, Step 4 weights) cost real iteration time — every step that did recon properly shipped on the first pass.

### 1.3 Trust the production tunings, document deviations
ZK6's signal weights (BOX:0.495, PBURST:0.270, CO:0.135, DGC:0.10) are the result of 30+ days of backtest tuning. Don't second-guess them when forking for a new jurisdiction unless you have data showing they don't apply. The `constants/zk6.ts` declared weights are **stale** vs the engine's runtime values — read `engines/zk6.ts` weightPresets directly to get the truth.

### 1.4 Service-role for production, anon for reads
- RN-side engine = compute-only reference implementation. RLS blocks production writes from anon under the standard table policies. That's correct.
- Edge Functions (Deno, service-role) own all production writes. The flag `EXPO_PUBLIC_USE_EDGE_{engine}=true` shortcircuits the RN engine to the Edge path.
- The RN engine is not dead code — it's the canonical math reference and dev-loop iteration tool. Keep it in sync with the Edge fork.

### 1.5 Inline constants in Edge Functions, comment the drift risk
Both ZK6 and ZK30 chose to **inline** numeric constants in their Edge Functions rather than import `constants/{engine}.ts`. The reason: avoiding the `@/` alias chain. The tradeoff: constants live in three places (engine.ts, constants/{engine}.ts, edge_fn/index.ts). Mitigate with a top-of-file comment listing the source-of-truth files and registering a structural-parity audit ticket (PROCESS-01 pattern).

### 1.6 Independent flags > mutex flags for hit semantics
When a jurisdiction has bonus mechanics (Fireball, etc.), set the bonus flags **independently** of the natural flags. A natural straight that also wins fireball-straight via same-digit substitution should set BOTH `hit_straight` AND `hit_fireball_straight`. Data should reflect truth; UI can filter for display.

### 1.7 Build for the actual schema, not the spec
Several work orders specified columns or constraints that didn't match reality. The correct response was always to adapt the build to actual schema, document the deviation in the audit. Don't fight the schema.

### 1.8 Bonus-channel presentation isolation (ARCH-08)
**Independent flags (1.6) get you data truth; this rule keeps that truth from polluting user-facing metrics.**

When a jurisdiction has a bonus mechanic (TX Fireball, future Wild Ball, Boost, etc.), the bonus channel is **PRESENTATION-ONLY** and isolated from all engine/scoring/tuning paths:

1. **Hit rate = (hit_straight OR hit_box) / picks.** Bonus is NEVER part of the primary hit-rate calculation.
2. **Backtests + weight-tuning targets** use natural-only hit rate as the objective function. Bonus matches NEVER enter the optimization loop.
3. **Engine signals** (BOX, PBURST, CO, DGC) consume natural draws only via `histories_{jur}.result_digits`. Bonus-substituted variants NEVER enter aggregation.
4. **Snapshot pick fields**: `pick.hitType` = natural primary (straight > box > null). `pick.fireballHitType` (or analog `pick.{bonus}HitType`) = bonus primary. Independent fields; both can be populated.
5. **DI columns** `matched_session / matched_result / matched_fireball` track NATURAL primary only. Bonus detail lives in `adaptive_tracking_{engine}` per-match rows + snapshot's bonus-type field.
6. **UI**: primary surfaces (HITS badge, "Today" stats, hit rate, pick card primary badge row) show natural only. Bonus gets its own secondary section labeled "{jur}-only" — visible but collapsed by default.
7. **External captions / marketing copy** use natural-hit count as the headline metric. Bonus is a parenthetical aside ("+ N fireball matches for TX players").
8. **Future bonus mechanics** inherit this same pattern: bonus is secondary, never enters scoring.

**Why this is load-bearing**: a magnitude of users play Pick 3 in jurisdictions without the bonus mechanic (or play non-TX Pick 3 entirely). Mixing bonus matches into hit metrics inflates the engine's apparent performance for those users and produces phantom hit notifications they cannot collect on. Once a UI surface mixes the two, the engine's headline number is dishonest by construction.

**Violation surfaces to audit periodically**:
- Any SQL aggregating hits without filtering on `hit_straight OR hit_box`
- Any UI label saying "N hits today" without specifying natural
- Any backtest comparing engine versions on a bonus-inclusive metric
- Any caption/post template that bundles bonus into headline counts

ZK30 TX implements this via: `run-hit-detection-zk30` splits `hitType` (natural) + `fireballHitType` (fireball); `ResultsAnalytics`/HitsTimelineView/PickCard/PickDetailModal all surface fireball in secondary sub-rows with the "TX-only" tag; `hit_detection_runs.hits_found` carries natural-only count, fireball count rides in `supplements_generated` (repurposed column). Migration script `scripts/migrations/2026_05_25_zk30_fireball_separation.ts` is the one-shot for pre-ARCH-08 snapshots.

---

## 2. Build sequence — the 7 steps + closure

Each step gates on the previous. Recon is mandatory for Steps 3a, 3b, 4, 5, 6, 7.

### Step 1 — Schema migrations (`*_DDL.sql`)
**What:** Create the isolated tables for the new engine/jurisdiction.

**Tables to create (template):**
- `histories_{jur}` — raw draws, per-session, with bonus columns (e.g., fireball)
- `daily_intelligence_{engine}` — per-pick slate annotations
- `adaptive_tracking_{engine}` — per-pick outcome tracking
- `slate_snapshots_{engine}` — slate metadata

**Unique key lock-in (load-bearing):**
- `histories_{jur}`: UNIQUE (date_et, session) — **NOT** the 4-tuple, **NOT** the 3-tuple. One draw per session per day, full stop. Result and fireball are properties of that draw, not part of its identity.
- `slate_snapshots_{engine}`: PK on (slate_date, scope, mode, jurisdiction) is reasonable.
- `adaptive_tracking_{engine}`: **no unique constraint** — rely on idempotency via slate_hash dedup probes in app code (BUG-150 layer 1).

**RLS:** mirror the analog table in ZK6 (typically anon CRUD for histories + slate_snapshots; service-role-only writes for daily_intelligence + engine_runs).

**Time:** 30–45 min including validation queries.

**Recon items:** none (this step IS the spec). But validate against existing analog tables before applying.

### Step 2 — Constants (`constants/{engine}.ts`)
**What:** Type-narrowed constants for the engine. Horizons, weights, rails, caps, jurisdiction.

**Critical pattern — type-narrowed horizons:**
```typescript
export type ZK30Horizon = Extract<HorizonLabel, 'H01Y' | 'H02Y'>;
export const ZK30_HORIZONS: readonly ZK30Horizon[] = ['H01Y', 'H02Y'] as const;
export const HORIZON_WEIGHTS_ZK30: Record<ZK30Horizon, number> = {
  H01Y: 0.70,
  H02Y: 0.30,
};
```
The narrowed type produces compile-time errors (TS2322 + TS7053) if any code tries to use a horizon outside the allowed set. Prove the narrowing with a temp file before locking.

**Weights — must include DGC:** ZK6's actual production weights are `{BOX:0.495, PBURST:0.270, CO:0.135, DGC:0.10}` (4-channel, carved out from 3-channel × 0.9). The 3-channel form in `constants/zk6.ts` is stale documentation. Inherit the 4-channel.

**Rails are counts, not booleans:** `singlesMax`, `doublesMax`, `triplesMax` — all numbers. ZK6's `triplesOn: boolean` was a legacy shortcut; don't replicate.

**Time:** 20–30 min.

### Step 3a — Raw import (`lib/{engine}/parseRaw.ts` + `scripts/imports/import_{jur}_raw.ts`)
**What:** Parse raw draw data and write to `histories_{jur}`.

**Critical pattern — shared parser + CLI wrapper:**
- `lib/{engine}/parseRaw.ts`: pure parser, no I/O, no Supabase imports. Validates per record, returns structured `{ records, rejected }`.
- `scripts/imports/import_{jur}_raw.ts`: CLI wrapper that reads file, calls parser, batches inserts with service-role auth.
This split lets the future admin-UI daily import path reuse the parser without duplicating validation rules.

**WRITE PARSER AFTER SEEING REAL DATA.** ZK30 lost an iteration because the parser was built to a sketched format that didn't match the actual file. Always: get a real sample → eyeball it with `cat -A` to see actual whitespace → THEN write the parser. Bonus characters (trailing punctuation, BOM, mixed line endings) are common.

**Format variability is the norm:** the TX file had two formats concatenated mid-file (newline-separated for recent rows, tab-separated for older). Build a normalizer; don't expect monolithic input.

**Tolerate trailing punctuation** on copy-paste inputs. Operators paste from various sources; rows ending in `.` or `,` should be cleaned, not rejected.

**Idempotency via `Prefer: resolution=ignore-duplicates`** + `on_conflict=date_et,session`. Re-import is silently no-op.

**Time:** 40–55 min including the 2-year backfill validation.

### Step 3b — Dataset aggregator (`lib/{engine}/aggregateDatasets.ts` + CLI)
**What:** Transform raw `histories_{jur}` rows into per-combo / per-pair aggregate rows in `datasets_box` and `datasets_pair`, filtered by `jurisdiction='{JUR}'` + `scope='allday'`.

**Critical finding from ZK30:** ZK6 had **no from-scratch aggregator** — it relied on operator-supplied pre-aggregated CSVs. ZK30 is the first true `histories → datasets` aggregator. We defined the convention; future engines inherit.

**Universe sizes (Pick 3):**
- `datasets_box` (class_id=1): 220 rows per scope × horizon = C(12,3) box-canonical
- `datasets_pair`:
  - Classes 2/3/4 (positional STRAIGHT pairs): 100 rows each (keys 00–99 NOT sorted)
  - Classes 5–11 (sorted BOX pairs): 55 rows each = C(11,2)
  - Total: 685 rows per scope × horizon

**For ZK50 (Pick 4) — universe sizes will differ.** Compute fresh:
- Box universe: C(13,4) = 715
- Pair universe: same 685 (pairs are still digit-pairs) but pair-class semantics need re-derivation for 4-digit draws.

**Edge-handling conventions for never-drew combos:**
- `ds_raw = horizon_days` (soft cap, not sentinel)
- `last_seen = NULL` (canonical "never drew" signal)
- `draws_since = window_draw_count` (honest "missed all draws in window")
- `expected = NULL` for v1.0 unless engine reads it (grep to verify)

**Window math:** right-open: `date_et > anchor - horizon_days AND date_et <= anchor`. Anchor = max(date_et) in histories_{jur}, not system today (reproducible backfills).

**Write pattern:** full DELETE-then-INSERT batched at 500 rows. Brief empty-window is acceptable for backfill; for nightly refresh in production, consider swap-via-temp-table in v1.1.

**Pair class semantics (mirror ZK6's `pairsForDraw` exactly):**
- Class 2/3/4 = front/back/split positional, key NOT sorted
- Class 5/6/7 = front/back/split as sorted boxes
- Class 8/9/10 = sorted-box of sort(combo)
- Class 11 = any-position-box from sorted combo, multi-row up to 3 per draw

**Time:** 2 hours including recon + validation.

### Step 4 — RN engine (`engines/{engine}.ts`)
**What:** Slate generation logic. Reads datasets, computes signals, applies rails, writes slate.

**Mirror `engines/zk6.ts` structure with these parameterizations:**

| Aspect | Pattern |
|---|---|
| Jurisdiction | Hardcoded constant (single-state v1.0) |
| Scope | Hardcoded `'allday'` (single-scope v1.0) |
| Mode | Hardcoded `'balanced'` (single-mode v1.0) |
| Horizons | Type-narrowed via `Extract<HorizonLabel, ...>` |
| Box pressure | H01Y + H02Y blended via `blendBoxDsRaw` |
| PBURST + CO | **H01Y-only** (inherit ZK6's pairMetaMap convention) |
| DGC | From `hitDatesMap` via `engineCore.computeDGC` |
| Rail enforcement | 6-pass selector with progressive relaxation |
| Hash | Include jurisdiction in input: `djb2({jurisdiction, scope, mode, topCombos, horizonsPresent})` |

**Reuse from `lib/engineCore.ts`** (Deno-safe, importable):
`MULTIPLICITY_PRIORS`, `toComboSet`, `sortedPair`, `multiplicityOf`, `topPairOf`, `buildUniverse`, `normalizeBoxKey`, `normalizePairKey`, `computeDGC`, `percentileRankOf`, `maxNorm`, `computeSlateHash`, `computeConfidenceScore`, `computeBoxSignalDetailed`, `blendBoxDsRaw`, `getPairSignalFromMap`, `bestOrderFor`.

**6-pass selection (don't reduce to 5):**
1. Real data only (`timesDrawn > 0`)
2. Placeholders (`timesDrawn = 0`)
3. Relax `excludeComboSets` (yesterday's combos)
4. Relax `pairRepCap`
5. Relax `recentHitCooldown`
6. Relax multiplicity caps (always yields N picks)

**Hard blocks never relaxed:** `picks.length >= N`, `duplicate selectedComboSets`, `todayHitComboSets` (today+yesterday winners).

**Selection is purely greedy by `finalScore` desc within each pass.** No optimization. Simple, deterministic, fast.

**Rail composition reality:** specified rails (e.g., 18/9/3 for ZK30) are **caps + targets**, not exact requirements. Pass 6 (emergency) fills remaining slots from the next-best pool of any multiplicity. Sparse-data jurisdictions may produce 23/4/3 instead — that's the engine being data-honest, not a bug. **Plan for this.**

**Time:** 2–3 hours build + 1 hour recon.

### Step 5 — Edge Function (`supabase/functions/compute-slate-{engine}/index.ts`)
**What:** Fork the RN engine for Deno, swap fetch primitives, deploy with service-role.

**Critical pattern:** the Edge Function is a **~600-line fork** of `engines/{engine}.ts`. Business logic is duplicated; the only structural difference is the data layer.

**Imports (relative paths, .ts extensions):**
```typescript
import { ... } from '../../../lib/engineCore.ts';
import { getTodayET, getYesterdayET } from '../../../lib/dateUtils.ts';
```
**Do NOT import `constants/{engine}.ts`** — the `@/` aliases inside it block Deno. Inline the numeric values at the top of the Edge Function with a drift-warning comment.

**Fetch primitives:** `sbGet`, `sbPost`, `sbDelete`, `sbPatch` — service-role auth via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. Mirror compute-slate-zk6's pattern verbatim.

**Deploy via Supabase MCP** `deploy_edge_function`. Flatten paths (`../../../` → `./`) for the MCP payload per `feedback_edge_fn_deploy_flat_naming`. Keep on-disk relative paths intact for editor parity.

**`verify_jwt: true`** is the default and correct. Caller sends anon JWT; Supabase runtime validates before function code runs.

**Flag flip is a separate sub-task:** add `EXPO_PUBLIC_USE_EDGE_{ENGINE}=true` to `.env` only AFTER deploy + verify + DB write verification. Don't bundle with the deploy.

**Time:** 2–3 hours.

### Step 6 — Hit detection (`supabase/functions/run-hit-detection-{engine}/index.ts`)
**What:** Post-draw matching of slate picks against new draws. Writes 4 hit flags (for Pick 3 with bonus) or 2 flags (for engines without bonus).

**Match math (the canonical pattern — preserve BUG-155 distinction):**
```typescript
const comboSet      = pick.comboSet ?? pick.normKey;
const straightCombo = pick.bestOrder ?? pick.combo;  // bestOrder, NOT combo
const hit_straight  = result.result_digits === straightCombo;
const hit_box       = result.comboset_sorted === comboSet || hit_straight;
```
- `pick.combo` is the engine enumeration index (000..999); `pick.bestOrder` is the user-facing recommended permutation. They diverge when `bestOrderFor` chose a non-canonical perm. **Always match against bestOrder for straight.**
- `hit_box: isBox || isStraight` — straight implies box (superset convention).

**Bonus-mechanic matching (jurisdiction-specific — define from scratch per state):**

For TX Pick 3 Fireball, the rule was: fireball digit substitutes for any one position of the original draw, producing up to 3 augmented results:
```typescript
const fb_results = result.fireball != null ? [
  result.fireball + result.result_digits[1] + result.result_digits[2],
  result.result_digits[0] + result.fireball + result.result_digits[2],
  result.result_digits[0] + result.result_digits[1] + result.fireball,
] : [];

const hit_fireball_straight = fb_results.some(r => r === straightCombo);
const hit_fireball_box = fb_results.some(r => sorted(r) === comboSet) 
                        || hit_fireball_straight;
```

**For other jurisdictions:** check the state lottery's bonus rules. Examples that may apply:
- **Wild Ball** (some states): same substitution rule as Fireball; pattern transfers.
- **Boost / EZ Match / Sum-it-up**: different mechanics — different matching logic. Document conventions per state in this template when you build them.
- **No bonus mechanic at all**: drop the fireball columns from the schema for that jurisdiction (or leave nullable + always-null).

**Independent flags rule (load-bearing):** set bonus flags IFF the bonus mechanic produces a match, regardless of natural flags. Both can fire on the same pick. Don't mutex.

**Write patterns:**
- **DI** (`daily_intelligence_{engine}`): PATCH per-pick row WHERE slate_date IN (date, prevDay). One row per pick — multi-state hits collapse to primary match via precedence (straight > box > fireball_straight > fireball_box).
- **AT** (`adaptive_tracking_{engine}`): multi-row per pick when same combo hits across sessions/states. BUG-150 pattern:
  - Layer 1: exact-match dedup probe → no-op
  - Layer 2: PATCH primary (matched_state IS NULL) → first match wins
  - Layer 3: INSERT secondary → subsequent matches
  - Serial within a pick, parallel between picks.

**Cron schedule:** single daily POST at end-of-day local time. For TX: 23:30 ET = 03:30 UTC EDT / 04:30 UTC EST. Use UTC cron expression; document the EST/EDT mismatch acceptance. Mirror Step 6's `run-hit-detection-zk30-nightly` cron migration.

**Telemetry sharing:** `hit_detection_runs` is shared across engines via `run_source='edge-{engine}'` discriminator. No need to fork the telemetry table.

**Time:** 2–3 hours.

### Step 7 — UI integration (`app/(tabs)/{engine}.tsx` + `components/admin/DashboardView.tsx`)
**What:** Surface the slate + hit results in-app. For v1.0 internal: hidden tab + admin gate.

**v1.0 critical path:**
1. Fix the slate query to target `slate_snapshots_{engine}` (often a stale stub exists from earlier scaffolding — verify the WHERE clause)
2. Lock UI to v1.0 scope (single chip / no chip) since multi-scope is v2
3. Render hit badges per pick with the bonus-aware superset suppression:
   - `S` when natural straight
   - `B` when natural box AND NOT straight
   - `🔥S` when bonus straight (if jurisdiction has bonus)
   - `🔥B` when bonus box AND NOT bonus straight
   - All dim when no hit
4. Admin "Run Hit Detection Now" button in DashboardView wired to `/functions/v1/run-hit-detection-{engine}`
5. Empty / loading / error / stale-slate states (operator may visit pre-9am-drop)
6. Refresh-on-focus via `useFocusEffect`
7. Metadata footer: engine_version + slate_hash[0:8] + gen_time

**Theming:** hardcode the engine's color palette in the tsx file for v1.0. Proper theme integration via `palettes.ts` waits for public launch. ZK30 used sky-blue; future engines should pick a distinguishable palette per jurisdiction OR per engine family.

**Data fetching:** raw `useQuery` for v1.0. Refactor to a context hook only when a second consumer arrives.

**Navigation:** keep the tab hidden via `href: null` in `_layout.tsx`. Add a deep link from DashboardView ("Open {engine} Slate") for one-tap operator access.

**Hit visualization fidelity:** the snapshot's `top_k_straights_json` carries `hitType` as a single discriminated string, not N booleans. UI shows the PRIMARY hit per pick. Multi-hit edge cases (rare) require drilling into `adaptive_tracking_{engine}` for forensic detail. Document this in operator runbook.

**Time:** 6–8 hours including 4-flag badge component, empty states, admin button.

### Closure — Slate-gen cron migration
**What:** pg_cron schedule that POSTs to `compute-slate-{engine}` daily at the engine's drop time.

**Pattern:** mirror Step 6's hit-detection cron migration exactly. Schedule:
```sql
-- 09:00 ET drop, Mon-Sat (no Sunday TX draws)
SELECT cron.schedule(
  'compute-slate-{engine}-daily',
  '0 13 * * 1-6',  -- 13:00 UTC = 09:00 EDT (10:00 EST acceptable in winter)
  $$ SELECT net.http_post(...) $$
);
```

Verify with:
```sql
SELECT jobname, schedule, command FROM cron.job 
WHERE jobname LIKE '%{engine}%' ORDER BY jobname;
```

Expect two rows after both crons are wired:
- `compute-slate-{engine}-daily`
- `run-hit-detection-{engine}-nightly`

**Time:** 30 min.

---

## 3. Sign-off question registry

These questions recur for every new jurisdiction. Pre-answer them at planning time to skip recon-then-stall delays.

### Step 4 / Step 5 sign-offs
| Question | Default | When to deviate |
|---|---|---|
| Inherit ZK6 production weights? | Yes — 0.495/0.270/0.135/0.10 | Only if jurisdiction-specific backtest shows divergence |
| Include jurisdiction in slate_hash? | Yes — `{jurisdiction, scope, mode, topCombos, horizonsPresent}` | Never |
| Pass count for selection? | 6 passes (don't reduce to 5) | Never |
| Triples enforcement style? | `triplesMax: number` count | Never (don't use boolean) |
| Reuse slate_snapshots or fork? | **Fork** `slate_snapshots_{engine}` | Only if engine is a known successor with planned merge |
| PBURST/CO horizon blend? | H01Y-only inherit | Only if 30+ days of comparison backtest justifies blending |
| Constants strategy for Edge Fn? | Inline numeric values + drift comment | Never refactor `constants/` for Deno consumption |
| `signal_dgc` vs legacy `signal_burst`? | Use `signal_dgc` + `dgc_top_quartile` | Never write to legacy `signal_burst` |
| engine_runs jurisdiction tag? | `effective_weights._jurisdiction='{JUR}'` in JSONB | Always preserve |
| Deploy method? | Supabase MCP `deploy_edge_function` | Only if MCP unavailable |

### Step 6 sign-offs
| Question | Default | When to deviate |
|---|---|---|
| Bonus mechanic matching rule? | **State-specific — derive from lottery rules** | Always derive per state |
| Trigger schedule? | Single daily cron at end-of-day local time | 4 per-session crons only if 4x ops cost justified |
| Multi-hit row policy? | Multi-row in AT per `matched_session × matched_state` | Never collapse |
| Supplemental slates? | Skip for v1.0 | Revisit post-launch |
| RN admin wrapper? | Park until Step 7 UI | Build with UI |
| Bonus flag mutex with natural? | **Independent** | Never mutex |

### Step 7 sign-offs
| Question | Default | When to deviate |
|---|---|---|
| Navigation placement? | Hidden tab + admin link | Public exposure only after brand review |
| Theme strategy? | Hardcode for v1.0 | Integrate with palette system at public launch |
| Data fetching? | Raw `useQuery` | Context hook when 2nd consumer exists |
| Engine selector? | Routes are the selector (no UI switcher) | Never |
| Hit badge style? | 4-letter strip with superset suppression | Only if jurisdiction has different hit dimensions |
| Slate-date selector? | Implicit (most recent) + date prominently displayed | Date stepper as v1.1 polish |

---

## 4. Pitfalls catalog (verified by experience)

### Data ingestion
- **Mixed-format raw files**: verify with `cat -A` before parsing. Don't trust the format of the first 10 lines extrapolating to 2,000+ rows.
- **Embedded header rows**: reject via date-validity check, not column-count check.
- **Trailing punctuation on copy-paste**: strip from each line before splitting.
- **Format assumption mismatch**: read 20+ rows of actual data BEFORE writing parser. The hypothetical format from a work order spec will be wrong.

### Schema
- **Over-broad unique keys**: `histories` should be `UNIQUE (date_et, session)`, NOT include result_digits or fireball. Result and bonus are properties of the draw, not part of its identity.
- **Forgotten unique constraints surface late**: engine_runs has `(slate_hash, mode)` unique; means UPSERT, not append. Plan for this.
- **Schema reality may diverge from work order spec**: when it does, adapt the build, don't fight the schema.

### Engine math
- **`pick.combo` vs `pick.bestOrder`**: combo is enumeration index, bestOrder is user-facing perm. ALWAYS match against bestOrder for straight detection (BUG-155).
- **`hash-only` dedup is a bug in disguise**: single-jurisdiction stable data produces the same hash across days. Scope dedup probes to `(slate_hash, slate_date)` or finer.
- **minEnergyThreshold blocks rail-fill** on sparse data: ZK30 produced 23/4/3 instead of 18/9/3 because doubles/triples couldn't clear the threshold. Pass 6 (emergency) fills with singles. Plan v1.1 for per-multiplicity thresholds.

### Edge Function deployment
- **MCP `deploy_edge_function` rejects `../../../` paths**: flatten to `./` for deploy payload, keep on-disk version with relative paths.
- **`verify_jwt: true` is default**; don't pass `--no-verify-jwt`. Custom auth is rare.
- **Flag flip is a separate sub-task**: deploy + verify writes + verify idempotency BEFORE flipping `EXPO_PUBLIC_USE_EDGE_{ENGINE}=true`.

### Constants drift
- **Three places carry constants** for an engine: `constants/{engine}.ts`, `engines/{engine}.ts` (consumes constants), `supabase/functions/compute-slate-{engine}/index.ts` (inlines values). Comment all three with the drift warning. Register a PROCESS-01 parity audit.

### Operational
- **Slate-gen cron is easy to forget**: it's not part of the "engine build" steps but ZK30 v1.0 was only "complete" after this closure step. Plan for it from day 1.
- **Daily import + aggregator are manual until Phase 6 (Playwright scraper)**: document the operator runbook explicitly.

---

## 5. Effort estimates (for planning)

For a new ZK30 jurisdiction (mostly mechanical fork from TX):

| Step | Time | Notes |
|---|---|---|
| 1 — DDL migrations | 30–45 min | Copy ZK30 TX migrations, swap jurisdiction code |
| 2 — Constants | 20–30 min | Add jurisdiction constant; weights inherit |
| 3a — Raw import | 40–55 min | Parser may need adjustment for state's draw format |
| 3b — Aggregator | 60–90 min | Mostly mechanical; verify universe sizes |
| 4 — RN engine | 90–120 min | Mostly mechanical; verify jurisdiction filter |
| 5 — Edge Function | 90–120 min | Fork compute-slate-zk30; swap jurisdiction |
| 6 — Hit detection | 90–120 min | Bonus mechanic MAY need re-derivation per state |
| 7 — UI | 60–90 min | Just adding to existing screen if scope matches |
| Closure — Slate-gen cron | 30 min | Copy migration template |
| **Total (per new ZK30 state)** | **~9–12 hours** | Plus 30–60 min recon per step gate |

For ZK50 (Pick 4) — net-new engine, longer:

| Step | Time | Notes |
|---|---|---|
| 1 — DDL migrations | 60 min | New schemas for Pick 4 result_digits width |
| 2 — Constants | 45 min | New rail config, new combo universe size |
| 3a — Raw import | 60 min | New parser for Pick 4 draw format |
| 3b — Aggregator | 2–3 hours | **Pair semantics need re-derivation for 4-digit combos** |
| 4 — RN engine | 3–4 hours | engineCore helpers may need extension for 4-digit math |
| 5 — Edge Function | 2–3 hours | Fork pattern transfers; math inside differs |
| 6 — Hit detection | 2–3 hours | New matching rule for 4-digit + bonus |
| 7 — UI | 4–6 hours | New screen pattern, similar to zk30.tsx |
| Closure | 30 min | Cron template |
| **Total (ZK50 v1.0)** | **~17–22 hours** | Plus material recon time |

---

## 6. ZK50 (Pick 4) specific considerations

When building the Pick 4 engine:

### Math changes
- **Box universe**: C(13,4) = 715 (vs Pick 3's 220)
- **Multiplicity classes**: now 5 types instead of 3 — quad, triple, double-double, double, all-different
- **Pair-class semantics**: Pick 4 has C(4,2)=6 distinct pair positions vs Pick 3's 3 pair positions. The 11-class encoding from Pick 3 doesn't transfer directly. **Re-derive `pairsForDraw` for Pick 4 from scratch.**
- **Multiplicity priors**: ZK6's `MULTIPLICITY_PRIORS = {singles: 0.00, doubles: -0.02, triples: -0.04}` needs Pick 4 analog with the 5-multiplicity scheme.

### Engine reuse
- `engineCore.ts` helpers that are width-agnostic (DGC, percentile rank, max-norm, hashing) reuse cleanly.
- Helpers that hardcode 3-digit logic (`normalizeBoxKey`, `multiplicityOf`, `topPairOf`) need Pick 4 versions. Consider extending these as generics or creating `engineCorePick4.ts` parallel module.

### Schema
- `result_digits` becomes 4-char strings (`'1234'`)
- `comboset_sorted` becomes 4-char sorted strings
- All other patterns transfer.

### Bonus mechanic
- TX Pick 4 has its own "Sum-it-up" bonus (sum of digits) — different math entirely from Pick 3 Fireball. The hit detection convention will be NEW, not derived from ZK30.
- Document the chosen convention in this template's section 4 when ZK50 lands.

---

## 7. Outstanding follow-ups from ZK30 v1.0 (carry into next jurisdiction)

| Item | Priority | Notes |
|---|---|---|
| ZK6 hash-only dedup bug (BUG-XXX) | Medium | Same latent bug in ZK6 surfaced via ZK30. Backport `(slate_hash, slate_date)` scoped probe. |
| engine_runs UPSERT spec correction (DOC-XXX) | Low | Future engine work orders should reflect UPSERT semantics, not "always writes 1 new row". |
| Per-multiplicity minEnergyThreshold tuning | Medium | Single-state ZK30 produced 23/4/3 instead of 18/9/3 due to global floor. Tune per-multiplicity in v1.1. |
| Theme integration for `/zk30` (and future engine screens) | Low | Hardcoded palette ignores dark/light mode toggle. Roll into palette system at public launch. |
| `comboset_sorted` column on `histories_{jur}` | Low | Currently computed inline at hit detection time. Pre-compute on import for v1.1 performance. |
| Auto-import (Playwright scraper) | High | Phase 6 roadmap. Eliminates manual daily import step. |
| Auto-aggregator (post-import cron) | Medium | Pair with auto-import. Closes the manual-step gap. |
| Per-state slate_snapshots merge | Low (premature) | If/when consolidation needed; currently fork-per-engine works. |

---

## 8. Daily operator runbook (post-v1.0, until Phase 6 ships)

For each operating day:

1. **Evening (~11 PM ET, after Night session draws)**:
   - Operator pastes day's draws into Admin Import UI for the jurisdiction
   - Or runs CLI: `npx tsx scripts/imports/import_{jur}_raw.ts <path>`

2. **Evening (after import)**:
   - Operator runs aggregator CLI: `npx tsx scripts/imports/aggregate_{jur}_datasets.ts --apply`
   - Verify `datasets_box`/`datasets_pair` for `jurisdiction='{JUR}'` reflect the new draw

3. **23:30 ET — AUTO**:
   - Cron `run-hit-detection-{engine}-nightly` fires
   - Picks up today's slate, matches against today's draws, writes hit annotations

4. **09:00 ET next morning — AUTO**:
   - Cron `compute-slate-{engine}-daily` fires
   - Generates tomorrow's slate using data through end-of-yesterday
   - Writes to `slate_snapshots_{engine}`, `daily_intelligence_{engine}`, `adaptive_tracking_{engine}`, `engine_runs`

5. **Operator views**:
   - In-app `/{engine}` tab (admin-only via deep link from DashboardView)
   - Verifies overnight hits surfaced as badges
   - Triggers manual hit-detection re-run from admin if backfilling or correcting

When Phase 6 ships:
- Steps 1 + 2 become automated via Playwright scraper + post-import cron
- Operator workflow reduces to monitoring + tier management

---

## 9. Version history

- **v1.0** (2026-05-25): Initial template based on ZK30 TX build. Authors: operator + Claude (engineering judgment) + Claude Code (implementation). All 7 build steps + closure cron complete.

---

*This document captures load-bearing decisions. When building a new jurisdiction engine, read sections 1-4 in full before starting Step 1. Sign-off question registry in section 3 is the fastest path to skip recon-stall cycles.*
