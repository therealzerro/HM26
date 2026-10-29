# Early-13 state scan — 2026-10-29 (Thursday), run ~5:45pm ET after the 10/29 midday import

**Operator question:** "which one state in the evening's 1st 13 drawings has positive stats and box patterns coinciding with our All-Day and Evening board picks."

**Pool:** PA SC WV ME,NH,VT TX GA TN MI MN DE OH AR DC (placement cutoff 7:46pm ET, readout ~8:24pm). `histories` does not split the GA / TX / DC evening and night draws — those three carry two rows per date, so their counts are per-draw, not per-early-draw.

**Method:** every evening row of a pool state, 2026-04-19 → 2026-10-28, scored against that day's Evening and All-Day K6 boards from `adaptive_tracking` (distinct `combo_set` / `posted_order`; no stored hit flags — BUG-162). "either" = the union of the two boards' sets. Expected box per draw = Σ permutations of the distinct sets on the board ÷ 1000; expected straight = distinct posted orders ÷ 1000. z = (box − exp) / √exp. The 60d / 30d windows are 8/30→10/28 and 9/29→10/28. Re-run restricted to days whose live boards are all `post_cutoff = false` gave identical numbers (no live post-cutoff boards in the window).

## 1. Board match — Eve ∪ AD sets ("either"), per state

| State | all: draws | box / exp | z | str / exp | 60d: box / exp | z | str / exp | 30d: box / exp | z | str / exp |
|---|---|---|---|---|---|---|---|---|---|---|
| **PA** | 193 | 15 / 10.3 | +1.46 | 3 / 1.9 | **7 / 3.4** | **+1.97** | **2 / 0.67** | **4 / 1.7** | **+1.77** | **2 / 0.33** |
| **DE** | 192 | 16 / 10.3 | +1.79 | 3 / 1.9 | 6 / 3.3 | +1.47 | 1 / 0.66 | **4 / 1.7** | **+1.77** | 1 / 0.33 |
| **SC** | 193 | **18 / 10.3** | **+2.39** | 3 / 1.9 | 6 / 3.4 | +1.42 | 2 / 0.67 | 2 / 1.7 | +0.24 | 0 / 0.33 |
| DC (2/day) | 386 | 30 / 20.7 | +2.06 | **12 / 3.8** | 4 / 6.8 | −1.06 | 2 / 1.35 | 3 / 3.4 | −0.21 | 2 / 0.66 |
| MN | 193 | 14 / 10.3 | +1.14 | 5 / 1.9 | 5 / 3.4 | +0.88 | 2 / 0.67 | 3 / 1.7 | +1.01 | 1 / 0.33 |
| OH | 193 | 13 / 10.3 | +0.83 | 1 / 1.9 | 5 / 3.4 | +0.88 | 0 / 0.67 | 3 / 1.7 | +1.01 | 0 / 0.33 |
| WV | 165 | 11 / 8.9 | +0.72 | 3 / 1.6 | 1 / 2.9 | −1.10 | 0 / 0.57 | 0 / 1.5 | −1.20 | 0 / 0.29 |
| ME,NH,VT | 193 | 11 / 10.3 | +0.21 | 4 / 1.9 | 2 / 3.4 | −0.75 | 2 / 0.67 | 1 / 1.7 | −0.53 | 1 / 0.33 |
| AR | 193 | 11 / 10.3 | +0.21 | 4 / 1.9 | 2 / 3.4 | −0.75 | 0 / 0.67 | 2 / 1.7 | +0.24 | 0 / 0.33 |
| MI | 197 | 11 / 10.6 | +0.14 | 2 / 2.0 | 2 / 3.4 | −0.75 | 0 / 0.67 | 1 / 1.7 | −0.53 | 0 / 0.33 |
| TX (2/day) | 329 | 18 / 17.7 | +0.08 | 3 / 3.3 | 3 / 5.7 | −1.13 | 0 / 1.14 | 0 / 2.9 | −1.70 | 0 / 0.57 |
| TN | 193 | 10 / 10.3 | −0.10 | 1 / 1.9 | 2 / 3.4 | −0.75 | 0 / 0.67 | 1 / 1.7 | −0.53 | 0 / 0.33 |
| GA (2/day) | 386 | 18 / 20.7 | −0.58 | 2 / 3.8 | 5 / 6.8 | −0.68 | 0 / 1.35 | 3 / 3.4 | −0.21 | 0 / 0.66 |
| **POOL** | 3,006 | 196 / 160.9 | +2.77 | 46 / 29.8 | 50 / 52.5 | −0.34 | 11 / 10.5 | 27 / 26.4 | +0.13 | 7 / 5.2 |

Per board (full window): Evening board — DC 20 / 12.8 (z 2.01), SC 11 / 6.4 (1.82), MN 10 / 6.4 (1.42), PA 10 / 6.4 (1.42), DE 7 / 6.4 (0.25), GA 8 / 12.8 (−1.34). All-Day board — SC 14 / 6.5 (z 2.93), DE 11 / 6.5 (1.78), PA 10 / 6.5 (1.36), TN 2 / 6.5 (−1.77). All-Day 60d: DE 5 / 2.1 (1.97), SC 5 / 2.2 (1.93), PA 5 / 2.2 (1.93). All-Day 30d: PA 3 / 1.1 (1.85), DE 3 / 1.1 (1.85).

States positive in all three windows on the union: PA, DE, SC, MN, OH. Top of 60d and 30d: PA, then DE.

## 2. Receipts — the 60d board matches for the three leaders (evening draw → board order)

| State | Date | Drawn | Board order(s) | Straight |
|---|---|---|---|---|
| PA | 10/27 | 568 | AD 865 | |
| PA | 10/16 | 937 | AD 937, Eve 739 | **STRAIGHT (AD)** |
| PA | 10/10 | 951 | AD 195 | |
| PA | 10/08 | 895 | Eve 895 | **STRAIGHT (Eve)** |
| PA | 09/28 | 803 | AD 830, Eve 830 | |
| PA | 09/07 | 598 | Eve 895 | |
| PA | 09/05 | 524 | AD 425, Eve 425 | |
| DE | 10/25 | 570 | AD 705 | |
| DE | 10/20 | 634 | Eve 634 | **STRAIGHT (Eve)** |
| DE | 10/12 | 749 | AD 794 | |
| DE | 10/10 | 067 | AD 706, Eve 670 | |
| DE | 09/28 | 940 | AD 094 | |
| DE | 09/04 | 840 | AD 408, Eve 084 | |
| SC | 10/19 | 850 | AD 085, Eve 085 | |
| SC | 10/14 | 038 | AD 830, Eve 803 | |
| SC | 09/24 | 168 | AD 681, Eve 861 | |
| SC | 09/19 | 125 | AD 125 | **STRAIGHT (AD)** |
| SC | 09/09 | 835 | AD 385, Eve 385 | |
| SC | 09/08 | 146 | Eve 146 | **STRAIGHT (Eve)** |

## 3. Box patterns — tonight's eight Eve ∪ AD sets in each state's evening history (4/09 → 10/28)

Tonight's sets: {4,6,9} {1,5,7} {2,5,9} {3,5,7} {0,4,8} {0,4,7} {2,3,5} {0,5,7}. Expected per state = draws × 48/1000.

| State | Eve draws | Singles % | Tonight's sets drawn / exp | Last | Most recent draws of tonight's sets |
|---|---|---|---|---|---|
| **DE** | 202 | 72.8 | **16 / 9.7 (1.65×)** | **10/25** | 570 10/25, 517 10/24, 074 10/15, 496 10/01, 084 09/07, 840 09/04 |
| SC | 203 | 78.8 | 13 / 9.7 (1.33×) | 10/25 | 740 10/25, 804 10/23, 740 10/04, 946 10/01, 157 09/04 |
| MI | 207 | 72.9 | 13 / 9.9 (1.31×) | 09/08 | 532 09/08, 735 09/04, 469 08/25, 357 08/08 |
| DC (2/day) | 406 | 73.9 | 27 / 19.5 (1.39×) | 09/30 | 750 09/30, 740 09/24, 804 09/14, 750 09/08 |
| OH | 203 | 69.0 | 11 / 9.7 | 10/13 | 074 10/13, 352 10/12, 537 09/27, 952 09/14 |
| WV | 174 | 70.7 | 10 / 8.4 | 10/24 | 529 10/24, 715 10/16, 570 08/13 |
| ME,NH,VT | 195 | 67.2 | 10 / 9.4 | 10/15 | 715 10/15, 084 10/11, 408 10/08 |
| GA (2/day) | 406 | 69.7 | 20 / 19.5 | 10/21 | 496 10/21, 470 10/20, 715 10/18, 517 10/08 |
| PA | 203 | 76.4 | 9 / 9.7 | 08/26 | 735 08/26, 715 08/15, 084 08/07 |
| AR | 203 | 70.4 | 9 / 9.7 | 09/11 | 592 09/11, 408 08/08 |
| TX (2/day) | 339 | 73.2 | 13 / 16.3 | 09/30 | 952 09/30, 325 09/29, 469 09/26, 480 09/25 |
| TN | 203 | 72.9 | 7 / 9.7 | 09/28 | 735 09/28, 946 09/26 |
| MN | 203 | 72.4 | 6 / 9.7 | 10/25 | 480 10/25, 470 09/21 |

Last 12 evening draws: DE 761 473 776 570 517 215 234 249 634 007 884 853 · PA 595 568 851 421 889 220 130 756 156 275 008 593 · SC 657 169 618 740 404 804 810 609 623 850 338 695 · MN 121 271 576 480 467 902 118 725 453 708 911 520.

## 4. Answer as the table reads it

- **DE** is the one pool state positive on **both** lenses: board matches above expectation in every window (16 / 10.3 all, 6 / 3.3 60d, 4 / 1.7 30d; 1 straight in 60d) **and** tonight's eight sets drawn 16× vs 9.7 expected in its evening history, the two most recent being tonight's sets {1,5,7} (517, 10/24) and {0,5,7} (570, 10/25).
- **PA** is the leader on board-match stats alone (60d z +1.97, 30d z +1.77, two posted-order straights in 30d) but tonight's sets sit at expectation in PA (9 / 9.7) with none since 8/26.
- **SC** has the largest full-window excess (z +2.39) and is flat in 30d (2 / 1.7).
- Pool total is at expectation in both recent windows (60d z −0.34, 30d z +0.13).

Boards tonight (posted order): Evening 496 · 517 · 925 · 537 · 408 · 074; All-Day 469 · 735 · 517 · 408 · 253 · 705. Same posted order on both boards: 517 ({1,5,7}, also Midday #3 751 → all three boards) and 408 ({0,4,8}). 10/29 midday: no Eve or AD set drew (32 rows; ON missing). Nothing proposed here.

## SQL (re-runnable in the Supabase SQL editor)

```sql
-- §1: per-state box/straight vs the Evening, All-Day and union boards, three windows
with win as (select 'all' w, date '2026-04-19' s union all select '60d', date '2026-08-30' union all select '30d', date '2026-09-29'),
picks as (select distinct slate_date, scope, combo_set, posted_order from adaptive_tracking
          where scope in ('evening','allday') and slate_date between '2026-04-19' and '2026-10-28'),
boards as (select slate_date, 'evening' b, combo_set, posted_order from picks where scope='evening'
 union select slate_date, 'allday', combo_set, posted_order from picks where scope='allday'
 union select slate_date, 'either', combo_set, posted_order from picks),
sets as (select distinct slate_date, b, combo_set from boards),
perm as (select slate_date, b, combo_set,
  case when substr(combo_set,2,1)=substr(combo_set,4,1) and substr(combo_set,4,1)=substr(combo_set,6,1) then 1
       when substr(combo_set,2,1)=substr(combo_set,4,1) or substr(combo_set,4,1)=substr(combo_set,6,1) or substr(combo_set,2,1)=substr(combo_set,6,1) then 3
       else 6 end perms from sets),
expb as (select slate_date, b, sum(perms)/1000.0 p_box from perm group by 1,2),
exps as (select slate_date, b, count(distinct posted_order)/1000.0 p_str from boards group by 1,2),
draws as (select date_et, jurisdiction, result_digits, comboset_sorted from histories
          where session='evening' and jurisdiction in ('PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC')
            and date_et between '2026-04-19' and '2026-10-28'),
scored as (select d.*, e.b, e.p_box, s.p_str,
 (exists (select 1 from sets x where x.slate_date=d.date_et and x.b=e.b and x.combo_set=d.comboset_sorted))::int hit_box,
 (exists (select 1 from boards x where x.slate_date=d.date_et and x.b=e.b and x.posted_order=d.result_digits))::int hit_str
 from draws d join expb e on e.slate_date=d.date_et join exps s on s.slate_date=d.date_et and s.b=e.b)
select w.w, sc.b, coalesce(sc.jurisdiction,'POOL') st, count(*) draws, sum(hit_box) box, round(sum(p_box),2) exp_box,
       round((sum(hit_box)-sum(p_box))/sqrt(sum(p_box)),2) z_box, sum(hit_str) str, round(sum(p_str),2) exp_str
from scored sc join win w on sc.date_et >= w.s
group by grouping sets ((w.w, sc.b, sc.jurisdiction),(w.w, sc.b)) order by 2, 1, 7 desc;

-- §3: tonight's eight sets in each pool state's evening history
select jurisdiction, count(*) draws,
 round(100.0*sum((substr(comboset_sorted,2,1)<>substr(comboset_sorted,4,1) and substr(comboset_sorted,4,1)<>substr(comboset_sorted,6,1))::int)/count(*),1) pct_singles,
 sum((comboset_sorted in ('{4,6,9}','{1,5,7}','{2,5,9}','{3,5,7}','{0,4,8}','{0,4,7}','{2,3,5}','{0,5,7}'))::int) tonight_sets_drawn,
 round(count(*)*48/1000.0,2) expected,
 string_agg(result_digits||' '||date_et::text, ', ' order by date_et desc)
   filter (where comboset_sorted in ('{4,6,9}','{1,5,7}','{2,5,9}','{3,5,7}','{0,4,8}','{0,4,7}','{2,3,5}','{0,5,7}')) draws_of_tonight_sets
from histories where session='evening'
  and jurisdiction in ('PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC')
  and date_et between '2026-04-09' and '2026-10-28'
group by 1 order by tonight_sets_drawn desc;

-- §2: receipts (60d matches with board orders)
with picks as (select distinct slate_date, scope, combo_set, posted_order from adaptive_tracking
               where scope in ('evening','allday') and slate_date between '2026-08-30' and '2026-10-28')
select h.date_et, h.jurisdiction, h.result_digits, string_agg(p.scope||' '||p.posted_order, ', ' order by p.scope) boards,
       bool_or(p.posted_order=h.result_digits) straight
from histories h join picks p on p.slate_date=h.date_et and p.combo_set=h.comboset_sorted
where h.session='evening' and h.jurisdiction in ('PA','DE','SC') and h.date_et between '2026-08-30' and '2026-10-28'
group by 1,2,3 order by 2,1 desc;
```
