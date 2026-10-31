# Early-13 state scan for combo 175 — 2026-10-31 (Saturday), run after the 10/31 midday import

**Operator question:** "deep think and deep scope, which state in the 1st 13 is showing positive matching patterns to the combo 175? midday imported"

**Board:** 175 is posted as **175** on today's All-Day board (position 2). It is not on today's Evening board (289 · 436 · 349 · 159 · 614 · 805) or Midday board. {1,5,7} was on both the All-Day and Evening boards on 10/28 (571) and 10/29 (517); neither night drew it in the pool.

**10/31 midday import:** 33 rows in `histories`. {1,5,7} did not draw at midday → nothing closes by convention. 10/30 evening = 41 rows (ON missing).

**Pool:** PA SC WV ME,NH,VT TX GA TN MI MN DE OH AR DC (placement cutoff 7:46pm ET, readout ~8:24pm). Saturday = all 13 draw. `histories` does not split the GA / TX / DC evening and night draws — those three carry two rows per date, so their counts are per-draw, not per-early-draw.

**Method:** same lenses as the 10/31 midday 268 scan, applied to every evening row of a pool state, 2026-04-01 → 2026-10-30 (3,186 draws). Each state scored against the enumeration expectation: the set {1,5,7} itself (box 6/1000; straight 175 1/1000), the same in the 60d window (9/01 → 10/30), any two of the digits 1/5/7 in the draw (150/1000) over the full window and the state's last 30 draws, all-odd singles like 175 (60/1000), digit sum 13 (75/1000). "Draws since" = that state's evening draws after its last {1,5,7}. Right-hand columns = the general board-match stat from the 10/29 scan (Eve ∪ AD board sets, z = (box − exp)/√exp) refreshed to 10/30. No stored hit flags used (BUG-162). Sorted by {1,5,7} box excess over expectation.

## 1. Per state

| State | Draws | {1,5,7} box / exp | 60d box / exp | 175 straight / exp | Draws of {1,5,7} (draws since) | ≥2 of {1,5,7} / exp | last-30: ≥2 of {1,5,7} / exp | all-odd singles / exp | sum 13 / exp | Singles % | Board 60d box / exp (z) · str | Board 30d box / exp (z) · str |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MI | 209 | 3 / 1.25 | 0 / 0.36 | 0 / 0.21 | 715 04-19, 517 04-29, 715 08-02 (89) | 33 / 31.4 | 4 / 4.5 | 16 / 12.5 | 16 / 15.7 | 73.2 | 2 / 3.37 (−0.75) · 0 | 1 / 1.69 (−0.53) · 0 |
| **DE** | 204 | 2 / 1.22 | **1 / 0.35** | 0 / 0.20 | 157 05-04, **517 10-24 (6)** | 32 / 30.6 | **8 / 4.5** | **17 / 12.2** | 16 / 15.3 | 73.0 | **6 / 3.31 (+1.48) · 1** | **4 / 1.69 (+1.78) · 1** |
| SC | 205 | 2 / 1.23 | 1 / 0.36 | 0 / 0.21 | 715 08-26, 157 09-04 (56) | 30 / 30.8 | 3 / 4.5 | 13 / 12.3 | 13 / 15.4 | 79.0 | 6 / 3.37 (+1.43) · 2 | 2 / 1.69 (+0.24) · 0 |
| GA (2/day) | 410 | 3 / 2.46 | 2 / 0.72 | 0 / 0.41 | 157 08-14, 517 10-08, 715 10-18 (24) | 63 / 61.5 | 8 / 4.5 | 20 / 24.6 | 33 / 30.8 | 69.8 | 5 / 6.74 (−0.67) · 0 | 2 / 3.37 (−0.75) · 0 |
| WV | 176 | 1 / 1.06 | 1 / 0.31 | 0 / 0.18 | 715 10-16 (12) | 30 / 26.4 | 7 / 4.5 | 14 / 10.6 | 14 / 13.2 | 71.0 | 1 / 2.91 (−1.12) · 0 | 0 / 1.45 (−1.20) · 0 |
| ME,NH,VT | 197 | 1 / 1.18 | 1 / 0.36 | 0 / 0.20 | 715 10-15 (15) | 28 / 29.6 | 4 / 4.5 | 12 / 11.8 | 16 / 14.8 | 67.0 | 2 / 3.37 (−0.75) · 2 | 1 / 1.69 (−0.53) · 1 |
| TN | 205 | 1 / 1.23 | 0 / 0.36 | 0 / 0.21 | 517 05-03 (180) | 37 / 30.8 | 5 / 4.5 | 11 / 12.3 | 23 / 15.4 | 73.2 | 2 / 3.37 (−0.75) · 0 | 0 / 1.69 (−1.30) · 0 |
| PA | 205 | 1 / 1.23 | 0 / 0.36 | 0 / 0.21 | 715 08-15 (76) | 34 / 30.8 | 6 / 4.5 | **20 / 12.3** | 10 / 15.4 | 76.6 | **7 / 3.37 (+1.98) · 2** | **4 / 1.69 (+1.78) · 2** |
| TX (2/day) | 350 | 1 / 2.10 | 0 / 0.62 | 0 / 0.35 | 571 08-22 (117) | 46 / 52.5 | 2 / 4.5 | 18 / 21.0 | 26 / 26.3 | 73.7 | 3 / 5.77 (−1.15) · 0 | 0 / 2.89 (−1.70) · 0 |
| MN | 205 | 0 / 1.23 | 0 / 0.36 | 0 / 0.21 | never (205) | 37 / 30.8 | 5 / 4.5 | 10 / 12.3 | 13 / 15.4 | 71.7 | 5 / 3.37 (+0.89) · 2 | 3 / 1.69 (+1.01) · 1 |
| AR | 205 | 0 / 1.23 | 0 / 0.36 | 0 / 0.21 | never (205) | 37 / 30.8 | 3 / 4.5 | 10 / 12.3 | 15 / 15.4 | 70.7 | 2 / 3.37 (−0.75) · 0 | 2 / 1.69 (+0.24) · 0 |
| OH | 205 | 0 / 1.23 | 0 / 0.36 | 0 / 0.21 | never (205) | 31 / 30.8 | 3 / 4.5 | 15 / 12.3 | 16 / 15.4 | 69.3 | 5 / 3.37 (+0.89) · 0 | 3 / 1.69 (+1.01) · 0 |
| DC (2/day) | 410 | 0 / 2.46 | 0 / 0.72 | 0 / 0.41 | never (410) | 65 / 61.5 | 6 / 4.5 | 29 / 24.6 | 34 / 30.8 | 73.9 | 4 / 6.74 (−1.06) · 2 | 3 / 3.37 (−0.20) · 2 |
| **POOL** | 3,186 | 15 / 19.1 | — | 0 / 3.2 | | 503 / 477.9 | | 205 / 191.2 | | | 50 / 52.45 (−0.34) · 11 | 25 / 26.26 (−0.25) · 7 |

## 2. Last 12 evening draws (newest first)

- **DE** 357 830 761 473 776 570 517 215 234 249 634 007
- **PA** 560 947 595 568 851 421 889 220 130 756 156 275
- **MI** 563 720 555 237 567 980 137 880 831 475 106 788
- **SC** 052 210 657 169 618 740 404 804 810 609 623 850
- **GA** 920 953 707 852 176 746 315 587 010 437 657 747
- **WV** 018 562 948 447 700 529 457 251 166 576 294 441

## 3. Engine lens — {1,5,7} on past Evening / All-Day boards

{1,5,7} has been on an Evening or All-Day board 19 days since 5/22 (All-Day 571 most of August–September; both boards 10/28 571 and 10/29 517; today All-Day 175). The pool drew it on two of those days: **MI 715 on 8/02 (Evening board posted 715 — straight)** and **SC 715 on 8/26 (All-Day 571 — box)**. Pool-wide, {1,5,7} sits under expectation for the full window (15 / 19.1 box, 0 / 3.2 straight 175).

## 4. Answer as the table reads it

- **DE** is the pool state positive on every lens that is recent: the only state to draw {1,5,7} in the last 10 draws (517 on 10/24, 6 draws ago; 60d 1 / 0.35), last-30 draws carrying ≥2 of the digits 1/5/7 8× vs 4.5 (top among single-draw states), all-odd singles 17 / 12.2, and the general board-match stat positive in both windows (60d 6 / 3.31 z +1.48, 30d 4 / 1.69 z +1.78, one posted-order straight: 634 on 10/20). Same state the 10/29 scan named.
- **PA** leads on board stats alone (60d z +1.98, 30d z +1.78, two posted-order straights in 30d) and on all-odd singles (20 / 12.3), but {1,5,7} itself is at expectation in PA (1 / 1.23) with none since 8/15 (76 draws) and 0 in 60d.
- **MI** has the most {1,5,7} in the full window (3 / 1.25) but none since 8/02 (89 draws), 0 in 60d, last-30 pair lens under (4 / 4.5), board stats negative.
- **GA** shows 3 / 2.46 with two in 60d (517 10/08, 715 10/18) but counts two draws per night, all-odd singles under (20 / 24.6), board stats negative both windows.
- Pool total: {1,5,7} under expectation (15 / 19.1), straight 175 never drawn in the pool evening since 4/01 (0 / 3.2), pair and all-odd lenses at expectation, board-match at expectation in both windows (z −0.34 / −0.25). Nothing proposed here.

## SQL (re-runnable in the Supabase SQL editor)

```sql
-- §1 left: per-state lenses for {1,5,7} / 175, evening, early-13 pool, 2026-04-01 → 2026-10-30
with d as (
  select jurisdiction, date_et, result_digits, comboset_sorted,
         (substr(comboset_sorted,2,1)<>substr(comboset_sorted,4,1) and substr(comboset_sorted,4,1)<>substr(comboset_sorted,6,1)) single,
         result_digits ~ '^[13579]{3}$' all_odd,
         (substr(result_digits,1,1)::int+substr(result_digits,2,1)::int+substr(result_digits,3,1)::int) dsum,
         ((position('1' in result_digits)>0)::int+(position('5' in result_digits)>0)::int+(position('7' in result_digits)>0)::int) n157
  from histories where session='evening'
    and jurisdiction in ('PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC')
    and date_et between '2026-04-01' and '2026-10-30'),
last30 as (select * from (select d.*, row_number() over (partition by jurisdiction order by date_et desc, result_digits) rn from d) x where rn<=30),
d60 as (select * from d where date_et >= '2026-09-01')
select d.jurisdiction, count(*) draws,
  sum((comboset_sorted='{1,5,7}')::int) box_157, round(count(*)*6/1000.0,2) exp_box,
  (select sum((comboset_sorted='{1,5,7}')::int) from d60 where d60.jurisdiction=d.jurisdiction) box_157_60d,
  round((select count(*) from d60 where d60.jurisdiction=d.jurisdiction)*6/1000.0,2) exp_box_60d,
  sum((result_digits='175')::int) str_175, round(count(*)/1000.0,2) exp_str,
  string_agg(result_digits||' '||to_char(date_et,'MM-DD'), ', ' order by date_et) filter (where comboset_sorted='{1,5,7}') draws_of_157,
  (select count(*) from d x where x.jurisdiction=d.jurisdiction and x.date_et > coalesce((select max(date_et) from d y where y.jurisdiction=d.jurisdiction and comboset_sorted='{1,5,7}'), '2026-01-01')) draws_since,
  sum((n157>=2)::int) two_of_157, round(count(*)*150/1000.0,1) exp_two,
  (select sum((n157>=2)::int) from last30 l where l.jurisdiction=d.jurisdiction) two_of_157_last30,
  sum((all_odd and single)::int) all_odd_singles, round(count(*)*60/1000.0,1) exp_all_odd,
  sum((dsum=13)::int) sum13, round(count(*)*75/1000.0,1) exp_sum13,
  round(100.0*sum(single::int)/count(*),1) pct_singles
from d group by 1 order by sum((comboset_sorted='{1,5,7}')::int) - count(*)*6/1000.0 desc;

-- §1 right: board-match stat (Eve ∪ AD sets), 60d / 30d, refreshed to 10/30
with win as (select '60d' w, date '2026-09-01' s union all select '30d', date '2026-10-01'),
picks as (select distinct slate_date, scope, combo_set, posted_order from adaptive_tracking
          where scope in ('evening','allday') and slate_date between '2026-09-01' and '2026-10-30'),
boards as (select distinct slate_date, combo_set, posted_order from picks),
sets as (select distinct slate_date, combo_set from boards),
perm as (select slate_date, combo_set,
  case when substr(combo_set,2,1)=substr(combo_set,4,1) and substr(combo_set,4,1)=substr(combo_set,6,1) then 1
       when substr(combo_set,2,1)=substr(combo_set,4,1) or substr(combo_set,4,1)=substr(combo_set,6,1) or substr(combo_set,2,1)=substr(combo_set,6,1) then 3
       else 6 end perms from sets),
expb as (select slate_date, sum(perms)/1000.0 p_box from perm group by 1),
exps as (select slate_date, count(distinct posted_order)/1000.0 p_str from boards group by 1),
draws as (select date_et, jurisdiction, result_digits, comboset_sorted from histories
          where session='evening' and jurisdiction in ('PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC')
            and date_et between '2026-09-01' and '2026-10-30'),
scored as (select d.*, e.p_box, s.p_str,
 (exists (select 1 from sets x where x.slate_date=d.date_et and x.combo_set=d.comboset_sorted))::int hit_box,
 (exists (select 1 from boards x where x.slate_date=d.date_et and x.posted_order=d.result_digits))::int hit_str
 from draws d join expb e on e.slate_date=d.date_et join exps s on s.slate_date=d.date_et)
select w.w, coalesce(sc.jurisdiction,'POOL') st, count(*) draws, sum(hit_box) box, round(sum(p_box),2) exp_box,
       round((sum(hit_box)-sum(p_box))/sqrt(sum(p_box)),2) z_box, sum(hit_str) str, round(sum(p_str),2) exp_str
from scored sc join win w on sc.date_et >= w.s
group by grouping sets ((w.w, sc.jurisdiction),(w.w)) order by 1, 6 desc;

-- §3: {1,5,7} board days and pool evening draws of it those days
with b as (select slate_date, string_agg(distinct scope||' '||posted_order, ', ') boards from adaptive_tracking
           where scope in ('evening','allday') and combo_set='{1,5,7}' and slate_date between '2026-04-01' and '2026-10-31' group by 1)
select b.slate_date, b.boards,
       (select string_agg(jurisdiction||' '||result_digits, ', ') from histories h where h.session='evening' and h.date_et=b.slate_date and h.comboset_sorted='{1,5,7}'
          and h.jurisdiction in ('PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC')) pool_draws_157
from b order by 1;
```

---

## Follow-up — "which combo from our boards is showing the best positive pattern for the 1st 13?"

Ten distinct sets on tonight's Evening ∪ All-Day boards, each scored over the pool evening rows (4/01 → 10/30 = 3,186 draws; 60d = 9/01 → = 934; 30d = 10/01 → = 468). Expected box = draws × 6/1000; expected straight = draws × (posted orders) / 1000. "≥2 digits 30d" = pool draws in October carrying two of the set's digits (exp 70.2). Sorted by 60d box excess. **{3,4,9} drew TN 943 at the 10/31 midday → closed by convention.**

| Set | Board(s) | Box all / 19.1 | 60d / 5.6 | 30d / 2.8 | Posted-order straight / 3.2 | States drawn | Last 6 (pool) | ≥2 digits 30d / 70.2 |
|---|---|---|---|---|---|---|---|---|
| **{1,5,9}** | Eve 159 | **28** | **11** | 4 | **5** | **13 / 13** | TN 915 10-17, DE 915 10-13, PA 951 10-10, MN 951 10-06, WV 951 09-24, TN 159 09-18 | 72 |
| {1,4,6} | Eve 614 | 24 | 10 | 4 | 3 | 9 | DC 146 10-18, AR 416 10-12, TX 416 10-07, DC 641 10-02, TN 416 09-29, DC 641 09-21 | 73 |
| {1,3,4} | AD 413 | 22 | 9 | 4 | 5 | 12 | TX 134 10-16, PA 314 10-14, SC 341 10-09, OH 143 10-08, WV 143 09-28, MN 431 09-25 | 64 |
| {2,8,9} | Eve 289 + AD 289 | 20 | 8 | 4 | 4 | 10 | DC 829 10-22, TX 982 10-21, SC 298 10-11, MI 289 10-03, PA 892 09-25, ME,NH,VT 892 09-23 | 61 |
| {3,4,9} — CLOSED midday (TN 943) | Eve 349 | 16 | 7 | 1 | 3 | 11 | TN 493 10-01, ME,NH,VT 394 09-30, DE 493 09-27 | 66 |
| {1,5,7} | AD 175 | 15 | 6 | **5** | 0 | 9 | DE 517 10-24, GA 715 10-18, WV 715 10-16, ME,NH,VT 715 10-15, GA 517 10-08 | 77 |
| {0,5,8} | Eve 805 + AD 805 | 21 | 5 | 2 | 1 | 7 | SC 850 10-19, DC 085 10-09, TX 850 09-15, GA 850 09-08 | **80** |
| {3,4,6} | Eve 436 | 18 | 5 | 1 | 1 | 10 | DE 634 10-20, WV 634 09-19, MI 643 09-15 | 65 |
| {2,6,8} | AD 268 | 14 | 4 | 1 | 1 | 8 | MI 628 10-04, ME,NH,VT 862 09-24, DC 628 09-13 | 66 |
| {1,4,5} | AD 415 | 16 | 3 | 3 | 3 | 7 | DC 451 10-27, TX 145 10-14, TN 514 10-13 | 78 |

Per-state leaders for the top sets: {1,5,9} — TN 4 / 1.23 (60d 2, last 10-17), PA 3 / 1.23 (60d 2, last 10-10), TX 3, ME,NH,VT 3, DC 3; {1,4,6} — TX 6 / 2.10, DE 6 / 1.22 (last 09-17), TN 4 / 1.23 (60d 2), DC 3 (60d 3, last 10-18); {1,3,4} — PA 5 / 1.23 (last 10-14), DC 4; {2,8,9} — PA 5 / 1.23, MI 3, SC 2 (60d 2).

**Answer as the table reads it:** **{1,5,9} (Evening board, posted 159)** — above expectation in every window (28 / 19.1 all, 11 / 5.6 in 60d, 4 / 2.8 in 30d), the only tonight set drawn in all 13 pool states, posted-order 159 drawn straight 5× vs 3.2, most recently TN 915 10/17 and DE 915 10/13. {1,4,6} (Eve 614) is second on the same lenses. {1,5,7} (AD 175) has the most October pool draws (5 / 2.8) but sits under expectation on the full window. Frequency-selected sets measured at the fair rate in the 10/4–10/17 walk-forward (dead rule); this is a pattern read, not a lever. Nothing proposed.

```sql
-- tonight's sets over the pool, three windows + posted-order straights
with sets as (select distinct combo_set, string_agg(distinct scope||' '||posted_order, ', ') boards, string_agg(distinct posted_order, ',') orders
              from adaptive_tracking where slate_date='2026-10-31' and scope in ('evening','allday') group by combo_set),
d as (select jurisdiction, date_et, result_digits, comboset_sorted from histories where session='evening'
      and jurisdiction in ('PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC')
      and date_et between '2026-04-01' and '2026-10-30'),
tot as (select count(*) n, sum((date_et>='2026-09-01')::int) n60, sum((date_et>='2026-10-01')::int) n30 from d)
select * from (
select s.combo_set, s.boards,
  sum((d.comboset_sorted=s.combo_set)::int) box_all, round((select n from tot)*6/1000.0,1) exp_all,
  sum((d.comboset_sorted=s.combo_set and d.date_et>='2026-09-01')::int) box_60d, round((select n60 from tot)*6/1000.0,1) exp_60d,
  sum((d.comboset_sorted=s.combo_set and d.date_et>='2026-10-01')::int) box_30d, round((select n30 from tot)*6/1000.0,1) exp_30d,
  sum((d.result_digits = any(string_to_array(s.orders,',')))::int) str_posted, round((select n from tot)*array_length(string_to_array(s.orders,','),1)/1000.0,1) exp_str,
  count(distinct d.jurisdiction) filter (where d.comboset_sorted=s.combo_set) states_drawn,
  (select string_agg(x.jurisdiction||' '||x.result_digits||' '||to_char(x.date_et,'MM-DD'), ', ' order by x.date_et desc) from (select * from d where comboset_sorted=s.combo_set order by date_et desc limit 6) x) last6,
  (select string_agg(jurisdiction||' '||result_digits, ', ') from histories h where h.session='midday' and h.date_et='2026-10-31' and h.comboset_sorted=s.combo_set) midday_1031
from sets s cross join d group by s.combo_set, s.boards, s.orders) q order by box_60d - exp_60d desc, box_all desc;
```

---

## Follow-up — "which state in the 1st 13 matches 159 best?"

Same lenses as §1, for {1,5,9} / 159 (sum 15, expectation 73/1000). Evening rows 4/01 → 10/30. Sorted by {1,5,9} box excess.

| State | Draws | {1,5,9} box / exp | 60d / exp | 159 straight / exp | Draws of {1,5,9} (draws since) | ≥2 of 1/5/9 / exp | last-30 / 4.5 | all-odd singles / exp | sum 15 / exp |
|---|---|---|---|---|---|---|---|---|---|
| **TN** | 205 | **4 / 1.23** | **2 / 0.36** | **2 / 0.21** | 915 04-19, 159 05-31, 159 09-18, **915 10-17 (13)** | 35 / 30.8 | 5 | 11 / 12.3 | 14 / 15.0 |
| **PA** | 205 | 3 / 1.23 | **2 / 0.36** | 0 / 0.21 | 591 08-02, 195 09-14, **951 10-10 (20)** | **43 / 30.8** | **10** | **20 / 12.3** | **19 / 15.0** |
| ME,NH,VT | 197 | 3 / 1.18 | 1 / 0.36 | 0 / 0.20 | 951 05-07, 591 05-23, 591 09-02 (58) | 27 / 29.6 | 3 | 12 / 11.8 | 13 / 14.4 |
| WV | 176 | 2 / 1.06 | 2 / 0.31 | 1 / 0.18 | 159 09-12, 951 09-24 (31) | 27 / 26.4 | 6 | 14 / 10.6 | 13 / 12.8 |
| TX (2/day) | 350 | 3 / 2.10 | 1 / 0.62 | 1 / 0.35 | 951 04-15, 951 07-21, 159 09-18 (71) | 52 / 52.5 | 4 | 18 / 21.0 | 26 / 25.6 |
| DE | 204 | 2 / 1.22 | 1 / 0.35 | 0 / 0.20 | 951 05-10, 915 10-13 (17) | 33 / 30.6 | 6 | 17 / 12.2 | 15 / 14.9 |
| MN | 205 | 2 / 1.23 | 1 / 0.36 | 0 / 0.21 | 915 08-01, 951 10-06 (24) | 32 / 30.8 | 3 | 10 / 12.3 | 15 / 15.0 |
| AR | 205 | 2 / 1.23 | 0 / 0.36 | 1 / 0.21 | 195 04-10, 159 06-23 (129) | 42 / 30.8 | 7 | 10 / 12.3 | 8 / 15.0 |
| DC (2/day) | 410 | 3 / 2.46 | 1 / 0.72 | 0 / 0.41 | 951 05-31, 195 08-23, 951 09-01 (118) | 70 / 61.5 | 6 | 29 / 24.6 | 32 / 29.9 |
| OH | 205 | 1 / 1.23 | 0 | 0 | 195 08-11 (80) | 30 / 30.8 | 4 | 15 / 12.3 | 16 / 15.0 |
| SC | 205 | 1 / 1.23 | 0 | 0 | 591 07-08 (114) | 30 / 30.8 | 3 | 13 / 12.3 | 15 / 15.0 |
| MI | 209 | 1 / 1.25 | 0 | 0 | 951 05-10 (177) | 25 / 31.4 | 3 | 16 / 12.5 | 20 / 15.3 |
| GA (2/day) | 410 | 1 / 2.46 | 0 | 0 | 951 06-26 (252) | 49 / 61.5 | 3 | 20 / 24.6 | 23 / 29.9 |

Board lens: {1,5,9} has been on an Evening or All-Day board 30 days since 5/27 (Evening 915 in May–June, All-Day 195 through October, Evening 195 on 10/30, Evening 159 tonight). Pool draws on those days: TN 159 + DC 951 (5/31), SC 591 (7/08), WV 951 (9/24), MN 951 (10/06), PA 951 (10/10). None in posted order.

**Answer as the table reads it:** **TN** matches the set itself best — {1,5,9} drawn 4× vs 1.23 (two in 60d), the exact order **159 drawn twice** (5/31, 9/18) against 0.21 expected, most recent 915 on 10/17 (13 draws ago). Its digit lenses sit at expectation. **PA** matches the broader 159 pattern best — 3 / 1.23 with two in 60d (last 951 on 10/10), the pair lens far above expectation (43 / 30.8 full window, 10 / 4.5 in its last 30), all-odd singles 20 / 12.3, sum-15 19 / 15.0, and the general board-match stat positive in both windows (60d z +1.98, 30d z +1.78). Nothing proposed.
