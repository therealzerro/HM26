# Top States by ZK6 Verified Hits — Last 30 Days

**Generated:** 2026-05-20 (window: 2026-04-20 → 2026-05-20)
**Scope:** ZK6 K6 slates only (`adaptive_tracking`). ZK30 jurisdiction-specific picks not included.
**Read-only:** no schema, RLS, engine, or write operations were performed.

---

## Task 1 — Verification source

**Canonical source: `public.adaptive_tracking`**

Confirmed by two paths:

- **Code (`app/track-record.tsx:99–108`, `app/(tabs)/index.tsx:451`)** — both consumer match-tracking surfaces query `adaptive_tracking` with the filter `matched_state=not.is.null` + `(hit_box.eq.true,hit_straight.eq.true)` + `mode=in.(balanced,conservative,aggressive)`. There is no `verified_hits` view; no other table is used.
- **Schema (`information_schema.tables`)** — candidate tables in `public`: `adaptive_tracking`, `daily_intelligence`, `histories`, `hit_detection_runs`, `slate_snapshots`, plus `v_monthly_hit_rates`, `v_rank_hit_rates`, `v_signal_hit_rates`. Of these, `adaptive_tracking` is the only one carrying per-(state, session) match resolution columns (`matched_state`, `matched_session`, `hit_box`, `hit_straight`, `matched_result`). `daily_intelligence.hit_box` / `hit_straight` are top-30 universe flags with no state attribution; `hit_detection_runs` is an audit log of detector runs, not the hit records themselves.

**Filter contract** (applied to every query in this report):

| # | Filter | Rationale |
|---|---|---|
| 1 | `slate_date >= CURRENT_DATE - 30` | 30-day window |
| 2 | `matched_state IS NOT NULL` | Verified against a draw |
| 3 | `hit_box=true OR hit_straight=true` | Either match form counts |
| 4 | `mode IN ('balanced','conservative','aggressive')` | Production modes only — excludes diagnostic / sweep |
| 5 | scope ↔ matched_session gate | `allday` matches any; `midday`/`evening` strict (matches `scopeMatchesSession` + `feedback_allday_semantics`) |
| 6 | Dedupe by `(slate_date, scope, combo, matched_state)` | Multi-mode hits collapse; multi-state hits stay distinct (BUG-141 / BUG-138 display semantics) |

**Reconciliation with the "102 verified matches" header**

| Count | Source |
|---|---|
| 254 | Raw rows in `adaptive_tracking`, last 30d, all modes |
| 104 | After filters 2–6 above (this report's universe) |
| 102 | What the user sees in `app/track-record.tsx` |

The 2-match delta is explained by the **`followed` states filter** in the consumer view (`track-record.tsx:69–90`). The screen passes the user's followed-states list as a `matched_state=in.(...)` PostgREST filter; any verified match in a state the user is not following is excluded from the on-screen count. The reconciliation is clean: drop the follow filter and you get 104; restore it and you get 102. No data quality concern.

---

## Task 2 — Top 10 states by total verified matches (30d)

Order: `total_matches DESC`, then `straight DESC`, then `latest_hit DESC`.

| Rank | State | Total Matches | Straight | Box | First Hit | Latest Hit |
|------|-------|--------------:|---------:|----:|-----------|------------|
| 1 | **DC** | **6** | 0 | 6 | 4-22 | 5-19 |
| 2 | **NM** | **6** | 0 | 6 | 4-27 | 5-17 |
| 3 | **DE** | 5 | 2 | 3 | 4-20 | 5-17 |
| 4 | **GA** | 5 | 1 | 4 | 4-23 | 5-19 |
| 5 | **MI** | 5 | 0 | 5 | 4-21 | 5-15 |
| 6 | **TX** | 4 | 1 | 3 | 5-05 | 5-19 |
| 7 | **VA** | 4 | 1 | 3 | 5-02 | 5-17 |
| 8 | **QC** | 4 | 1 | 3 | 5-04 | 5-16 |
| 9 | **WI** | 4 | 1 | 3 | 4-20 | 5-15 |
| 10 | **PA** | 4 | 0 | 4 | 4-30 | 5-17 |

**Headline reads**

- DC and NM lead at 6 matches each — both box-dominant. DC is the only top-tier state currently active inside the last 48h.
- DE leads the **straight** column (2). It's also the only top-10 state with two exact matches over 30 days.
- Of the 7-way tie at 4 matches (TX/VA/QC/WI/PA + AR/ID just below cutoff), TX/VA/QC/WI/PA win the tie-break because they each have ≥1 straight hit; PA edges in on `latest_hit DESC`. The single-hit gap between rank 10 (PA, 4) and rank 11 (AR/ID, 4 but 0 straight) is fragile — a single AR or ID hit this week would flip it.

---

## Task 3 — Secondary analysis on the same top-10

### 3a — Slate attribution per state

Which scope's slate caught each match (the `scope` the engine was running when the pick was emitted).

| Rank | State | Midday Slate | All Day Slate | Evening Slate |
|------|-------|-------------:|--------------:|--------------:|
| 1 | DC | 1 | **4** | 1 |
| 2 | NM | **3** | 2 | 1 |
| 3 | DE | 0 | **4** | 1 |
| 4 | GA | 1 | 2 | 2 |
| 5 | MI | **3** | 0 | 2 |
| 6 | TX | 0 | **3** | 1 |
| 7 | VA | 1 | 2 | 1 |
| 8 | QC | 0 | 1 | **3** |
| 9 | WI | 0 | **3** | 1 |
| 10 | PA | 1 | 2 | 1 |

**Reads**

- All Day slate dominates: 24/47 top-10 matches (51%). Consistent with `project_allday_tripwire` — allday remains the strongest scope by 30d baseline as well.
- MI and NM are pulled disproportionately by the **midday** slate (3/5 and 3/6 respectively); QC's hits are concentrated in **evening** (3/4). These are candidates for per-scope attention if state-targeted content is being planned.
- DE and WI score zero off the midday slate over 30d — all of their hits come from allday or evening.

### 3b — Time-of-day distribution per state (draw session)

Which `matched_session` the actual draw occurred in (independent of which slate caught it; `allday` slate hits can resolve in either session).

| Rank | State | Midday Draw | Evening Draw |
|------|-------|------------:|-------------:|
| 1 | DC | **4** | 2 |
| 2 | NM | **5** | 1 |
| 3 | DE | 2 | 3 |
| 4 | GA | 2 | 3 |
| 5 | MI | 3 | 2 |
| 6 | TX | 1 | 3 |
| 7 | VA | 1 | 3 |
| 8 | QC | 0 | **4** |
| 9 | WI | 2 | 2 |
| 10 | PA | 2 | 2 |

**Reads**

- Top-10 aggregate skews slightly evening (25 evening vs 22 midday).
- **NM is a midday-only profile** (5/6 hits midday). DC trends midday too (4/6). If midday-scope content is being prioritized, NM and DC are the strongest case studies.
- **QC, TX, VA hit exclusively or near-exclusively at evening** — natural fit for evening-slate marketing.

### 3c — Recent momentum: last 7d vs prior 23d

| Rank | State | Last 7d | Prior 23d | Last7/day | Prior23/day | Trajectory |
|------|-------|--------:|----------:|----------:|------------:|------------|
| 1 | DC | 4 | 2 | 0.57 | 0.09 | **🟢 Accelerating (6×)** |
| 2 | NM | 2 | 4 | 0.29 | 0.17 | 🟡 Slight uptick |
| 3 | DE | 3 | 2 | 0.43 | 0.09 | **🟢 Accelerating (5×)** |
| 4 | GA | 2 | 3 | 0.29 | 0.13 | 🟡 Slight uptick |
| 5 | MI | 1 | 4 | 0.14 | 0.17 | 🔻 Decelerating |
| 6 | TX | 1 | 3 | 0.14 | 0.13 | ⚪ Steady |
| 7 | VA | 1 | 3 | 0.14 | 0.13 | ⚪ Steady |
| 8 | QC | 1 | 3 | 0.14 | 0.13 | ⚪ Steady |
| 9 | WI | 2 | 2 | 0.29 | 0.09 | **🟢 Accelerating (3×)** |
| 10 | PA | 1 | 3 | 0.14 | 0.13 | ⚪ Steady |

**Reads**

- **DC, DE, WI** are the three states actually accelerating right now. DC at 0.57 hits/day in the last 7 is the hottest cell in the report; if any state demands "currently hot" content, it's DC.
- **MI is the only top-10 state decelerating** — 4 hits in days 8–30 but only 1 in the last week. Watch but don't lead with it.
- The 4–5 states clustered at ~0.14 hits/day last 7 are "steady contributors," not stories.

---

## Strategic implications (for the planning question — not recommendations)

These are observations the data supports, not action items.

1. **ZK30 expansion sequencing.** The two strongest 30-day ZK6 signals are DC (6 / accelerating) and NM (6 / midday-heavy). DE (5 / 2 straight / accelerating) is the only top-10 state with a meaningful straight-hit cluster — historically the strongest publication artifact. These three are the cleanest near-term ZK30 candidates from a "we already match here" standpoint.
2. **Content targeting.** Three distinct profiles exist in the top-10:
   - **Currently-hot:** DC, DE, WI
   - **Midday-resolution:** NM, MI, DC
   - **Evening-resolution:** QC, TX, VA
   Pick the profile that matches the publication slot rather than treating the top-10 as homogeneous.
3. **App Store description data.** The honest 30-day numbers are: **104 verified pattern matches across 37 jurisdictions, 14 exact matches, hits on 29 of 31 days.** (Distinct-state count and daily coverage included below for completeness.)
4. **Watch list (not in top-10 but proximate).** AR and ID both have 4 matches at 0 straights — close enough that next week's draws could push either into the top-10. Worth a re-run on 2026-05-27.

---

## Appendix — universe sanity checks

| Metric | Value |
|---|---|
| Window | 2026-04-20 → 2026-05-20 (30 days) |
| Raw `adaptive_tracking` rows | 254 |
| Rows after all filters | 104 |
| Distinct jurisdictions in universe | 37 |
| Straight matches (any state) | 14 |
| Box-only matches | 90 |
| Days in window with ≥1 match | 29 / 31 |
| Reconciliation gap vs in-app "102" | 2 matches; explained by `followed` filter |

## Appendix — files

- Query: [`docs/queries/top_states_30day.sql`](queries/top_states_30day.sql)
- Report: this file
