# State Confidence / Hot-State System Audit

**Date:** 2026-05-19
**Mode:** Read-only forensic
**Trigger:** Pro-member claims about per-state pattern identification need verification before being repeated.

---

## TL;DR

- **Claim 1** ("engine identifies which states are showing the strongest patterns each day") → **FALSE.**
- **Claim 2** ("signal drops include picks paired with the jurisdictions where patterns are strongest") → **FALSE as stated; PARTIALLY TRUE if reframed as post-hoc match attribution.**
- The `app_config` row `state_confidence_overrides` exists with value `{}` and is **never read by any code**. It is a placeholder, not a live feature.
- The ZK6 engine loads only **national-aggregated** history (`jurisdiction IS NULL`) and produces one cross-jurisdictional slate. There is no per-state scoring loop anywhere.
- Jurisdiction enters the data only **after the draw** via `run-hit-detection`, which records the state(s) in which a generated pick happened to match a result.

---

## 1. Code Path Inventory (Task 1)

### 1a. Identifier search results

Searched the entire repo (`*.ts`, `*.tsx`, `*.sql`, `*.js`, `*.md`) for:

| Identifier                                            | Matches in code                                        |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `state_confidence` / `stateConfidence`                | **0**                                                  |
| `state_confidence_overrides`                          | **0** (exists only as a row in `app_config` — see 1b)  |
| `hot_state` / `hotState` / `HOT_STATE`                | **0**                                                  |
| `jurisdiction_strength` / `state_strength`            | **0**                                                  |
| `per_state` / `perState` / `byState`                  | 4 — all docstrings/comments, none load-bearing logic   |

### 1b. `state_confidence_overrides` in `app_config`

```
SELECT key, value FROM app_config WHERE key ILIKE '%state%' OR key ILIKE '%confidence%' …
→ drawing_confidence_enabled = "true"
→ drawing_confidence_on      = "true"
→ state_confidence_overrides = "{}"
```

- `state_confidence_overrides` is an **empty JSON object**.
- No `engines/*.ts`, no `supabase/functions/*`, no `lib/*`, no `components/*` reads this key. Verified via repo-wide grep.
- It is a **dormant placeholder** — likely seeded with the intent of someday letting an admin override per-state weights, but nothing consumes it.
- `drawing_confidence_*` are unrelated: they gate a global signal (see `EngineConfigView.tsx:111` and `lib/engineCore.ts:217`), not a per-state computation.

### 1c. "Confidence" identifiers that DO exist (and what they actually are)

| Symbol                            | Where                                  | What it actually is                                                                 |
| --------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| `confidence`, `_confidence`       | `engines/zk6.ts:1178/1201/1230/1239`, `supabase/functions/compute-slate-zk6/index.ts:652/663/717/888` | `Math.round(scopeConfidence * 100)` — a **single scalar per slate/pick** derived from signal-strength aggregates. **Not per-state.** |
| `confidence` (UI)                 | `components/PickDetailModal.tsx:394`   | `pick.energy` rendered as a percentage bar. **Not per-state.**                      |
| `drawing_confidence_on/enabled`   | `app_config`, `EngineConfigView`       | Global feature flag for a signal called "drawing confidence." Unrelated to states.  |

There is no per-state confidence anywhere — the only "confidence" surface in the app is a single overall score per pick.

---

## 2. Data Flow (Task 2)

There is **no state-confidence data flow** to trace. The closest thing — and the only place jurisdiction enters the pipeline — is post-hoc hit attribution. The actual flow:

```
┌────────────────────────────────────────────────────────────────────────┐
│  WHERE JURISDICTION DOES NOT APPEAR                                    │
├────────────────────────────────────────────────────────────────────────┤
│  engines/zk6.ts → fetchRaw()                                           │
│     GET /datasets_box?  …&jurisdiction=is.null    (zk6.ts:103)         │
│     GET /datasets_pair? …&jurisdiction=is.null    (zk6.ts:112)         │
│                                                                        │
│  → Engine consumes ONLY national-aggregated rows. No state column      │
│    survives into scoring. The 4 signals (BOX/PBURST/CO/DGC) and the    │
│    K6 selection passes are jurisdiction-blind.                         │
│                                                                        │
│  → Snapshot persisted to slate_snapshots.top_k_straights_json: each    │
│    pick has rank, combo, comboSet, signals, energy, confidence —      │
│    NO state field. Verified in PickItem interface (PickCard.tsx:22).   │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  WHERE JURISDICTION FIRST APPEARS — post-draw hit detection             │
├────────────────────────────────────────────────────────────────────────┤
│  supabase/functions/run-hit-detection/index.ts                         │
│     1. SELECT result_digits, comboset_sorted, jurisdiction, session    │
│        FROM histories WHERE date_et = today        (line 290)          │
│     2. For each pick × each draw-row, test box/straight match.         │
│     3. INSERT/PATCH adaptive_tracking:                                 │
│           matched_state   = result.jurisdiction    (line 154)          │
│           matched_session = result.session                             │
│     4. PATCH daily_intelligence:                                       │
│           hit_state       = result.jurisdiction    (line 123)          │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  WHERE JURISDICTION SURFACES IN THE UI — only as "where it hit"        │
├────────────────────────────────────────────────────────────────────────┤
│  Home / Slates / DailyRecap query adaptive_tracking, render            │
│  HitCard with [combo] [state · session] — the state shown is the       │
│  jurisdiction where the matching draw came from, AFTER the fact.       │
└────────────────────────────────────────────────────────────────────────┘
```

**Key fact:** Jurisdiction is *output metadata about which state drew a matching number*, not *input that influenced which numbers were picked*.

---

## 3. Slate Generation Analysis (Task 3)

Source: `engines/zk6.ts` (also wrapped/duplicated in `supabase/functions/compute-slate-zk6/index.ts`).

1. **Does the engine consider per-state pattern strength?**
   **No.** `fetchRaw()` queries both `datasets_box` and `datasets_pair` with `jurisdiction=is.null` (zk6.ts:103, 112). Only national-aggregated rows are loaded. Per-state rows exist in the dataset tables but are ignored by ZK6 (they're for the parked ZK30 build).

2. **Are picks tagged with jurisdictions in the engine output?**
   **No.** The `PickItem` shape persisted to `top_k_straights_json` (declared in `components/PickCard.tsx:22-42`) contains: `rank, combo, comboSet, bestOrder, energy, multiplicity, topPair, signals, locked, drawsSince, timesDrawn, lastSeen` — and the post-hoc fields `hitType, hitState, hitSession, hitResult` that are populated *later* by hit detection. At generation time, `hitState` is undefined.

3. **What does the tagging represent?**
   When `hitState` is eventually filled, it is **the jurisdiction of the draw that matched** (`matched_state = result.jurisdiction`, `run-hit-detection/index.ts:154`). It is not a prediction or a strength score.

4. **Are picks generated cross-jurisdictionally?**
   **Yes.** A single slate of 6 picks is produced from national-aggregated history and is the same slate regardless of state. There is no per-state slate, no per-state filtering, no per-state weighting.

---

## 4. Hit Detection Analysis (Task 4)

Source: `supabase/functions/run-hit-detection/index.ts`.

1. **What determines which state(s) a hit is credited to?**
   The state is taken **directly from the matching `histories` row's `jurisdiction` column** (line 123 for `daily_intelligence.hit_state`; line 154 for `adaptive_tracking.matched_state`).

2. **Is the assignment pre-prediction, post-hoc matching, or hybrid?**
   **Pure post-hoc matching.** The logic is:
   - Fetch all `histories` rows for today.
   - For each pick × each history row: if `result_digits == pick.combo` → straight hit. If `comboset_sorted == pick.comboSet` → box hit.
   - If matched, record the history row's jurisdiction.

   There is **no comparison to any pre-generated state expectation**, because none exists. Multi-state matches (one pick × multiple jurisdictions on the same date) are explicitly handled with per-state secondary rows (lines 161-186, BUG-148 fix), confirming the model is "discover everywhere this drew" rather than "predict where it will draw."

---

## 5. UI Surface Inventory (Task 5)

| Surface                                  | Shows state info?                            | Pre-prediction or post-hoc?                |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| `components/PickCard.tsx`                | No state shown on a pre-draw pick.           | n/a                                        |
| `components/PickDetailModal.tsx`         | No per-state field. Shows overall `confidence` = energy. | n/a                              |
| `components/PickExplainerModal.tsx`      | No state info.                               | n/a                                        |
| `components/HitCard.tsx`                 | `[combo] [state · session]` row.             | **Post-hoc** — only renders after a hit.   |
| `components/DailyRecapCard.tsx`          | "Top: 916 BOX in WI midday"                  | **Post-hoc** — from `adaptive_tracking`.   |
| `app/(tabs)/index.tsx` Home "Today's Hits" | Stacked HitCards by `matched_state`.         | **Post-hoc.**                              |
| `app/(tabs)/explore.tsx` Slates Hits tab | List of `matched_state` rows.                | **Post-hoc.**                              |
| `app/(tabs)/intelligence.tsx`            | Admin-only; per-state breakdowns of completed hits. | **Post-hoc.**                       |
| `app/coming-soon.tsx:47`                 | Marketing copy: "Adaptive signal model (per-state decay, cold-start smoothing)" | **Aspirational marketing only** — listed under coming-soon items, not implemented. |

There is **no UI surface anywhere in the consumer or admin app** that shows a pre-draw per-state pattern strength, hot-state ranking, or "this pick is strongest in state X" indicator. Every state-label the user sees is attached to a confirmed hit.

---

## 6. Verdict (Task 6)

### Claim 1 — "The engine identifies which states are showing the strongest patterns each day."

**FALSE.**

- The engine loads only `jurisdiction IS NULL` data (`zk6.ts:103, 112`).
- No per-state computation occurs anywhere in `engines/zk6.ts`, `compute-slate-zk6`, or any helper.
- The `app_config` row that *would* hold per-state overrides (`state_confidence_overrides`) is empty (`{}`) and has zero code consumers.
- Saying the engine "identifies states showing the strongest patterns" describes behavior the code does not perform.

### Claim 2 — "Our signal drops include the picks paired with the jurisdictions where the patterns are strongest."

**FALSE as worded; PARTIALLY TRUE if reframed.**

- At signal-drop time, picks are *not* paired with jurisdictions. The 6-pick slate is jurisdiction-agnostic.
- The only jurisdiction info that ever attaches to a pick is the state where it *subsequently drew*, recorded by hit detection after the draw.
- If a member reads "paired with the jurisdictions where patterns are strongest" and understands that as pre-draw guidance, the description does not match the code.
- If reframed as "after a draw, we show you which state(s) each matching pick hit in" — that IS true and supported by the HitCard / DailyRecap / Home Today's Hits surfaces.

---

## 7. Recommended Accurate Language (Task 7)

You can honestly tell members the following about how ZK6 currently works:

**Safe / accurate phrasings:**

- "ZK6 analyzes the full national history of Pick-3 outcomes and surfaces the six combinations with the strongest pattern signals each day. The same six combinations apply to every participating state."
- "When a signal matches a real-world draw, we show you exactly which state and session it hit in — so you can see the geographic footprint of each match in your daily intelligence report."
- "Our match attribution is multi-state aware: if one pattern matches in two different states the same day, both are recorded and surfaced."
- "Pattern strength is measured per combination, not per state — the model is national in its scoring and discovers where matches actually land in post-draw reporting."

**Phrasings to avoid (not currently supported by the code):**

- "The engine identifies which states are showing the strongest patterns." → No per-state computation runs.
- "We pair each pick with the state where it's most likely to hit." → No such pairing exists at generation time.
- "Hot states this week" / "Today's hot states" / "Per-state confidence" → No such ranking is computed or displayed.
- "Adaptive per-state decay" / "Per-state cold-start smoothing" → Listed in `app/coming-soon.tsx` as future, **not** present today.

**Two paths from here (both valid — your call):**

1. **Adjust the description to match the engine.** The honest story is strong: national pattern analysis + multi-state hit discovery + per-state attribution in reporting. This requires no engineering work; just clean up the prospect/member copy.

2. **Build the capability.** A per-state pattern-strength layer is a real ZK30 deliverable (the per-state H01Y–H10Y datasets already exist; they're the data the parked ZK30 engine consumes). Roadmap item #9 already references this. Until ZK6 hits the 7-day ≥73% gate, code-wise this is parked — but it is technically achievable and would make the original Claim 1/Claim 2 wording accurate going forward.

The empty `state_confidence_overrides` row suggests someone (likely a prior session) scaffolded the eventual feature but never wrote the consumer. That row is harmless but worth either deleting or implementing — leaving an unused config key in a public table invites drift.

---

## Appendix — Files inspected

- `engines/zk6.ts` (lines 80-145, signals/data fetch; full file scanned via grep)
- `supabase/functions/compute-slate-zk6/index.ts` (lines 150, 284-291, 652-888)
- `supabase/functions/run-hit-detection/index.ts` (lines 80-200, 290-374, full file scanned)
- `components/PickCard.tsx` (lines 1-120, PickItem schema)
- `components/HitCard.tsx` (full)
- `components/PickDetailModal.tsx` (lines 322, 394-445)
- `components/DailyRecapCard.tsx` (lines 14-132)
- `app/(tabs)/index.tsx` (lines 384-984, jurisdiction surfaces)
- `app/(tabs)/explore.tsx` (lines 335-721, matched_state surfaces)
- `app/coming-soon.tsx` (line 47, aspirational copy)
- `app_config` rows matching `%state%`, `%confidence%`, `%jurisdiction%`, `%hot%`
