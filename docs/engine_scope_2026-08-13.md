# ZK6 Engine Deep Scope — 2026-08-13 (ENG-DEEPSCOPE-01)

**What was read, in full:** `engines/zk6.ts` (2,145 ln), `lib/engineCore.ts` (736 ln),
`supabase/functions/compute-slate-zk6/index.ts` (1,521 ln), `constants/zk6.ts`,
`lib/hitDetection.ts`, `lib/dateUtils.ts`, plus targeted live-DB verification via REST.
**Which path is live:** the EDGE function (`EXPO_PUBLIC_USE_EDGE_ZK6=true` in `.env`;
live since v24). The client engine is the fallback path and the parity reference.
**Method:** every claim below was verified against code or the live DB before being
written — three of my own strongest candidate defects died on verification and are
recorded in §A so nobody re-chases them. All enhancement proposals were filtered
against the refuted-lever registry (SIGNAL-INFO-01/02, STATE_STR ×3, pressure rescale,
synergy, doubles floor, cooldown relaxation, overdue/reversion, CO weight configs);
**nothing in this document proposes an accuracy lever** — the engine is measured at
the i.i.d. information ceiling and this scope respects that verdict.

---

## §A — CANDIDATE DEFECTS CHASED AND REFUTED (do not re-chase)

**A1. "ENG-STALE-01's `mode=neq.zk30` filter excludes NULL-mode rows → stale2 dead."**
REFUTED by live query: zk6 snapshot rows carry `mode='balanced'` (verified 8/11–8/13,
all scopes). Neither engine writes a `mode` column in its snapshot payload
(`engines/zk6.ts:984-997`, edge `index.ts:1265-1274`), so the value arrives from a
**DB-side column default the code never mentions** — the filter works, but through an
invisible coupling. See D5 for the 1-line hardening.

**A2. "`_shared/engineCore.ts` has drifted from `lib/engineCore.ts`."** REFUTED:
byte-identical today (`diff` exit 0), and `dateUtils` likewise. The risk is
procedural — nothing *enforces* identity. See P2.

**A3. "The unpaginated box fetch sits at the PostgREST 1000-row cap."** REFUTED:
`datasets_box` national slice is **220 rows per horizon** (live count), not the
"1000 combos" the comments in both engines claim (`engines/zk6.ts:122-124`, edge
`index.ts:419-424` context). 4.5× headroom. The comments are stale — see D6.

---

## §B — DEFECTS / RISKS, RANKED

**D1 · MEDIUM · Client/edge drift in history-override day arithmetic.**
Client `fetchHistoryOverrides` computes days-since with
`Math.floor(Date.now()/86400000)` (`engines/zk6.ts:536,542`) — a **UTC**-day anchor
that increments at 8 PM ET. The edge anchors to `getTodayET()+'T00:00:00'` and uses
`Math.round` (`index.ts:748,754`) — stable across the whole ET day. `drawsSinceMap`
(dsOverride-merged) feeds three things: the cooldown gate, the **K6 display reorder's
primary sort key** (`ds desc`, both paths), and DI `draws_since`. Consequence: a
client-path run after 8 PM ET can order the same six picks differently than the edge,
and its cooldown gate can flip on boundary combos. The edge is live so nothing is
wrong *today*, but the flag is env-controlled and the client is the documented
fallback — this is precisely the parity-drift class the parity preset exists to
prevent. **Fix: port the edge's anchor+rounding into the client verbatim.** No
behavior change on the live path.

**D2 · LOW-MED · Subscriber-facing `drawsSince` bypasses the history correction.**
The slate pick JSON sets `drawsSince: ds.dsRawMap.get(...)` — the import-time value
(`engines/zk6.ts:1793`, edge `index.ts:1234`) — while the DI top-30 rows and the K6
reorder use the history-corrected `drawsSinceMap` (`engines/zk6.ts:1535`, edge
`index.ts:1116`). When `histories` is fresher than the last import (it always is,
intra-day), the slate card and the Intel row disagree about the same combo's
overdue-ness, and the slate shows the *stale* number. Display metadata only — no
selection impact. **Fix: read `drawsSinceMap` in `topKStraights` on both paths.**

**D3 · MEDIUM (robustness) · Unknown scope silently becomes `allday` and WRITES.**
`normalizeScope` maps anything unrecognized to `'allday'` (`engines/zk6.ts:109-114`,
edge `index.ts:411-416`), and the edge handler computes for whatever body it receives
(`index.ts:1510-1515`). A malformed workflow invocation (`{}`, a typo'd scope, a stray
retry with a truncated body) soft-deletes and **replaces the real allday snapshot +
DI rows for the day**. Destructive-on-typo. **Fix: normalize case/punctuation as
today, but 400 on anything that isn't midday/evening/allday.** (Callers all send
legal scopes; this changes no valid path.)

**D4 · LOW-MED · DI rewrite is DELETE-then-INSERT with no atomicity.**
Edge `index.ts:1432-1433`, client `engines/zk6.ts:2048-2061`. A crash/timeout between
the two leaves the day's `daily_intelligence` empty for that scope until a regen —
Intel blank, `compute-daily-report` reads nothing. The BUG-139 rationale for
delete-all is sound; the window is just undocumented. **Cheapest honest fix:** keep
the strategy, and re-run guidance is already "regen heals" — document it at the call
site + have the Daily Workflow surface a DI row-count check (it may already; verify
before building). A true upsert-by-(date,scope,mode,rank) redesign is possible but
not worth it at current failure rates.

**D5 · LOW (silent-failure fuse) · `mode` column only exists via DB default.**
Per A1. If that default is ever dropped, or a new environment is provisioned without
it, `mode` goes NULL on new rows and `mode=neq.zk30` starts filtering them out —
ENG-STALE-01 dies **silently** (its catch treats errors and empties alike).
**Fix: write `mode: 'balanced'` explicitly in both snapshot payloads.** One line
each; byte-identical output today.

**D6 · COSMETIC · Comment rot in load-bearing places.**
(a) "10,000 box rows (1000 combos × 10 horizons)" — reality is 220/horizon (A3);
(b) client Pass-2 header says placeholders are "sorted by PBURST only"
(`engines/zk6.ts:1500-1501`) — code sorts by `finalScores` like everything else;
(c) the v2.1 file header's bullet list still describes v2.0→v2.1 deltas as if
current. Comments that misstate row counts and sort keys are how the next
BUG-153-class fix gets aimed at the wrong query.

**D7 · NOTE (semantics, no change proposed) · Supplements feed the staleness block.**
The ENG-STALE-01 prior-slate query (`engines/zk6.ts:1280`, edge `index.ts:921`) takes
the latest snapshot per date **including post-hit supplements** (they coexist,
un-deleted, and win the `updated_at desc` tiebreak). On a supplement day, "appeared
on the last N slates" is evaluated against the post-hit slate rather than the
morning's primary. Arguably correct ("last served wins"); recorded so the choice is
deliberate rather than accidental. Operator preference decides; default = leave it.

**D8 · GROWING · History-override fetch scans the whole `histories` table, unbounded.**
Both paths paginate `histories` with **no date floor** (`engines/zk6.ts:524-531`,
edge `index.ts:735-742`) — every draw ever, on every slate generation, with a
hard-coded 20,000-row loop ceiling. Live count today: **9,377 rows**, growing
~60–100/day → the ceiling lands around **Dec 2026–Feb 2027**, at which point the loop
truncates silently. Because rows arrive `date_et.desc`, truncation drops the OLDEST
rows: `dsOverride`/`lsOverride` (most-recent-wins) stay correct, but `hitDatesMap` —
**the DGC signal's input** — starts quietly losing its tail, and DGC carries weight
0.10 in the balanced preset. So the eventual failure is an *unmeasured signal-input
change*, the exact class the engine gate exists to prevent. Also a real per-run cost
today: ~10 sequential pages × 2 engines. **Fix is gate-bound** — see P4.

---

## §C — INVARIANTS CONFIRMED HEALTHY (spot-checked, not assumed)

- **BUG-166 pagination discipline** (unique `id` tiebreaker on every ordered paginated
  query) is applied consistently across all six history/dataset fetchers in both paths.
- **ENG-04 hash determinism** holds: `computeSlateHash` inputs are scope+mode+picks+
  horizons only; `Date.now()` appears solely in the non-hashed snapshot `id`.
- **Pass-6 six-pick guarantee** and the **ENG-TRIPLES-LEAK-01 guard** (triples never
  leak past Pass 6) are present and mirrored in both paths.
- **BUG-139 write strategy** (recover hits from `adaptive_tracking` before the DI
  delete) is faithfully mirrored, including the hit-orphan append.
- The **six-pass rail relaxation ladder**, per-scope 3-day hit block, and reorder
  tiebreaks are line-for-line mirrored between client and edge (comments cross-reference
  each other and, unusually for this codebase's history, are telling the truth).
- CONFIG-08 blend masking is consistent: the placeholder gate uses legacy MAX
  `timesDrawnMap` on both the scoring mask and the real/placeholder split, so a
  combo cannot be "real" in one and "placeholder" in the other.

---

## §D — PROPOSALS (each with its gate classification)

**P1 · PER-STATE ENGINE, PHASE 0 (read-only scoping) — the standing highest priority.**
ENH-AUDIT v2 promoted per-state as THE structural path (midday's CO=64 finding is
genuinely per-state; the national aggregate is at its ceiling). Nothing in the current
engine reads per-jurisdiction datasets — the national slice is `jurisdiction IS NULL`
everywhere. Phase 0, no engine change, no gate needed: (a) audit per-jurisdiction
coverage in `datasets_box`/`datasets_pair` (do per-state rows even exist post-rebuild,
and at what density per horizon?); (b) extend the replay harness to score a per-state
candidate against the same 30/60d windows; (c) define what a per-state slate would
even mean for the product (per-state top-K vs state-weighted national K6) so the
backtest has a target. Ship decision comes later, through the full v2 gate.

**P2 · PARITY HARNESS (tooling, no gate).** One `npm run engine:parity` script that:
(a) sha-compares `lib/engineCore.ts`↔`_shared/engineCore.ts` and `dateUtils` pairs —
fails loudly on drift (A2's procedural gap); (b) runs a golden-vector test through
`engineCore`'s pure functions (fixed fixture in, expected scores out) so a
behavior-changing edit to the shared core is caught the day it happens, not at the
next 0/6 streak; (c) optionally replays both engines' pure scoring stage on a fixture
dataset and diffs pick order — which would have caught D1 mechanically.

**P3 · HARDENING BATCH (no behavior change; verify-identical, no backtest needed).**
D1 (client day-anchor ported from edge) + D2 (drawsSince display alignment) + D3
(scope 400) + D5 (explicit `mode`) + D6 (comment rot). Every item is either
fallback-path-only, display-metadata, or a rejected-input path; none touches live
selection. Verification: filtered tsc + a replay-harness before/after diff showing
byte-identical picks on the parity preset. Takes effect next workflow run; no regen.

**P4 · HISTORY FETCH DATE FLOOR — GATE-BOUND (full CLAUDE.md v2 gate).** Floor the
`fetchHistoryOverrides` scan (candidate: `2026-04-01`, the full-coverage boundary
SIGNAL-INFO-02 recorded — Jan–Mar is 1 feed/day and already distorts DGC gap
statistics). This changes DGC's input (weight 0.10, live), so: parity-preset
pre-flight, 30d AND 60d backtest, both lenses, ship only if ≥ baseline. Expected
outcome honestly stated: neutral (DGC is measured anti-informative; SIGNAL-INFO-01),
in which case it ships as a *non-accuracy* robustness fix with the measured cost
stated — that's the D8 fuse defused a quarter before it burns, plus ~10 round-trips
saved per slate gen. If it measures a sign-consistent loss, it doesn't ship and D8
gets a different treatment (raise the loop ceiling + add a truncation WARN).

**P5 · ENG-AUDIT-02 COMPLETION (next edge-deploy session).** The edge fn still
carries an inline copy of the weighted-score formula (`index.ts:1043-1057`) because
the 2026-06-06 CLI bundler couldn't resolve the import — but the `_shared/` pattern
now exists and works (the edge already imports 20+ symbols from
`_shared/engineCore.ts`). Replace the inline body with `computeWeightedScore` at the
next session that deploys this function anyway (never as a solo deploy; verify_jwt
check after, per the standing rule). Removes the last drift-capable duplicate of
scoring math.

**P6 · DAILY WORKFLOW DI-COUNT ASSERT (operator-visible fuse for D4).** After slate
gen, the workflow (or the admin Brief red-flags block) asserts
`daily_intelligence` rows ≥ 30 for (today, scope, balanced) and surfaces a red flag
if not — converting the delete/insert window from silent to visible. Check first
whether ADMIN-BRIEF-02's red-flag section already covers it; if so, this is a no-op.

## §E — DELIBERATELY NOT PROPOSED (refuted registry, re-verified against this scope)

Weight/preset sweeps (SIGNAL-INFO-01: universe AUC 0.500) · history-freshness windows
(SIGNAL-INFO-02) · overdue/reversion levers (COHORT-01 flat) · STATE_STR re-enable
(falsified 3×; the shipped channel stays weight-0) · pressure rescale modes
(CONFIG-16 falsified; `p95ramp`/`percentile` stay dormant code) · synergy /
doublesTopN / doubles-floor (dead levers, re-falsified) · cooldown relaxation
(refuted; unit-wobble deliberately not re-opened per HIT-PERSIST-01 closure) ·
anything ZK30 (blocked until ZK6 verified — this document is part of that
verification). The reorder tiebreaks (pos-3–5 band) are due their ~30-day
rotation-era re-check around **9/2** per ENG-MIDDAY-COLD-02 — that review is already
scheduled in the audit and is not duplicated here.
