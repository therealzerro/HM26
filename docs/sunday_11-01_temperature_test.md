# Does the board temperature predict a match today? — 2026-11-01 (Sunday)

**Operator question:** "deep scope, is there any evidence that the combo temperatures displayed on the board indicates a combo more likely to match today?"

**What the temperature is:** the tile's `energy` — the combo's **percentile rank of its final indicator score** among the scored pool (engines/zk6.ts line 10, `percentileRankOf`), 0–100. The label ladder is `lib/theme/heat.ts`: ON FIRE ≥90 · BLAZING ≥80 · HOT ≥65 · WARM ≥45 · COOL <45. So "hotter" = the engine's own score ranked higher. The question is therefore: does the engine's score rank, among the six it posted, predict which one lands.

**Method:** every live board (one per scope per day: `jurisdiction IS NULL`, `deleted_at IS NULL`, `post_cutoff` not true, newest `updated_at_et`), 2026-04-18 → 2026-10-31 = 591 boards per scope, 3,543 picks. Hits recomputed from `histories` (BUG-162 — stored flags never used): box = the pick's set drawn that day in the scope's session (allday = any session); straight = `bestOrder` drawn exactly. Expected per pick = 1 − (1 − perms/1000)^draws, perms 6 singles / 3 doubles, draws = that day's ledger rows in the scope's session(s).

## 1. Temperature tier vs outcome (all scopes)

| Tier | Picks | Box hits | Box % | Expected % | Straight hits | Straight % | Expected % |
|---|---|---|---|---|---|---|---|
| ON FIRE 90+ | 2,947 | 761 | 25.8 | 26.0 | 141 | 4.78 | 5.03 |
| BLAZING 80–89 | 379 | 58 | 15.3 | 18.6 | 13 | 3.43 | 3.41 |
| HOT 65–79 | 200 | 27 | 13.5 | 18.1 | 6 | 3.00 | 3.30 |
| WARM 45–64 | 3 | 0 | 0.0 | 18.8 | 0 | 0 | 4.12 |
| COOL <45 | 14 | 2 | 14.3 | 24.4 | 0 | 0 | 5.00 |

Per scope the 90+ tier sits on its expectation everywhere: allday 35.5 vs 35.4, evening 21.4 vs 21.8, midday 16.5 vs 17.0. The sub-90 tiers are mostly midday picks (473 of 596) because midday's energy floor is lower.

**Singles only, by window** (removes the doubles mix):

| Window | Tier | Picks | Box % | Expected % | z |
|---|---|---|---|---|---|
| all | 90+ | 2,862 | 26.3 | 26.4 | −0.18 |
| all | <90 | 584 | 14.4 | 18.7 | **−2.67** |
| 60d | 90+ | 903 | 27.0 | 26.5 | +0.37 |
| 60d | <90 | 195 | 16.9 | 18.9 | −0.71 |
| 30d | 90+ | 441 | 26.5 | 26.6 | −0.02 |
| 30d | <90 | 117 | 20.5 | 19.6 | +0.25 |

The one non-zero number — cooler singles under expectation in the full window — is confined to the pre-September era and is flat in 60d and 30d (sign flips 30d). Era artifact, not a live effect.

## 2. Within-board: hottest tile vs coolest tile (same board, same day)

| Energy rank on the board | Picks | Avg energy | Box % |
|---|---|---|---|
| 1 (hottest) | 591 | 98.7 | 23.5 |
| 2 | 591 | 97.4 | 23.5 |
| 3 | 591 | 95.7 | 27.4 |
| 4 | 591 | 94.1 | 23.2 |
| 5 | 591 | 92.3 | 21.7 |
| 6 (coolest) | 588 | 88.8 | 24.3 |

Flat. The hottest tile on a board lands no more often than the coolest.

## 3. Correlation energy → hit

| Scope | Window | Picks | corr(energy, hit) | Avg energy of hits | Avg energy of misses |
|---|---|---|---|---|---|
| allday | all | 1,181 | +0.016 | 97.7 | 97.5 |
| allday | 60d | 366 | −0.050 | 97.3 | 97.5 |
| evening | all | 1,181 | +0.079 | 96.7 | 95.5 |
| evening | 60d | 366 | +0.075 | 95.5 | 94.7 |
| midday | all | 1,181 | +0.007 | 90.4 | 90.2 |
| midday | 60d | 366 | +0.040 | 90.6 | 89.7 |

Evening's +0.08 is the sub-90 era artifact above (32 picks under 80, 2 hits); the 90+ evening tier is at expectation (21.4 vs 21.8).

## 4. Answer

**No.** An ON FIRE tile matches at exactly the uniform rate for its draw count (26.3% vs 26.4% expected on 2,862 singles), the hottest tile on a board lands as often as the coolest, and the energy→hit correlation is ≈0 in every scope and window. The temperature tells you where the combo ranked on the engine's score; it does not tell you it is more likely to land today. This is the same finding as ENG-REVIEW-01 (universe AUC 0.500) and the information-ceiling analysis, now measured on the displayed temperature itself. Nothing proposed; no UI change (subscriber surfaces hands-off).

## SQL

```sql
with b as (
  select distinct on (scope, slate_date) scope, slate_date, top_k_straights_json picks
  from slate_snapshots where jurisdiction is null and deleted_at is null and post_cutoff is not true
    and slate_date between '2026-04-18' and '2026-10-31' order by scope, slate_date, updated_at_et desc),
p as (select b.scope, b.slate_date, (x->>'energy')::int energy, x->>'comboSet' cs, x->>'bestOrder' bo, x->>'multiplicity' mult
      from b cross join lateral jsonb_array_elements(b.picks) x),
n as (select date_et, session, count(*) draws from histories where date_et between '2026-04-18' and '2026-10-31' group by 1,2),
s as (select p.*, case when energy>=90 then '1 ON FIRE 90+' when energy>=80 then '2 BLAZING 80-89' when energy>=65 then '3 HOT 65-79' when energy>=45 then '4 WARM 45-64' else '5 COOL <45' end tier,
    exists (select 1 from histories h where h.date_et=p.slate_date and h.comboset_sorted=p.cs and (p.scope='allday' or h.session=p.scope)) hit_box,
    exists (select 1 from histories h where h.date_et=p.slate_date and h.result_digits=p.bo and (p.scope='allday' or h.session=p.scope)) hit_str,
    (select coalesce(sum(draws),0) from n where n.date_et=p.slate_date and (p.scope='allday' or n.session=p.scope)) draws,
    case mult when 'singles' then 6 when 'doubles' then 3 else 1 end perms from p)
select scope, tier, count(*) picks, sum(hit_box::int) box_hits, round(100.0*avg(hit_box::int),1) box_pct,
  round(100.0*avg(1-power(1-perms/1000.0, draws)),1) exp_box_pct,
  sum(hit_str::int) str_hits, round(100.0*avg(hit_str::int),2) str_pct, round(100.0*avg(1-power(1-1/1000.0, draws)),2) exp_str_pct
from s group by grouping sets ((scope,tier),(tier)) order by coalesce(scope,'~all'), tier;
-- §2: add rank() over (partition by scope, slate_date order by energy desc, (x->>'rank')::int) and group by it.
-- §3: corr(energy, hit::int) per scope, with and without slate_date >= '2026-09-01'.
```
