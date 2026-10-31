# Midday state scan for combo 268 — 2026-10-31 (Saturday), run ~5:50am ET

**Operator question:** "deep think deep scope, which midday state matches the pattern of combo 268?"

**Board:** 268 is posted as **268** on both today's Midday board and today's All-Day board (not on Evening). Midday board today: 415 · 423 · 354 · 425 · 279 · 268.

**Method:** every midday row in `histories`, 2026-04-01 → 2026-10-30 (6,505 draws, 31 jurisdictions; TX and TN carry two midday rows per date). Each state scored on four lenses of "the pattern of 268", all against the enumeration expectation (per 1,000 draws): the set {2,6,8} itself (box, 6/1000; straight 268, 1/1000), any two of the digits 2/6/8 in the draw (150/1000), all-even singles like 268 (60/1000), and digit sum 16 (69/1000). "Draws since" counts that state's midday draws after its last {2,6,8}. No stored hit flags used (BUG-162). Sorted by box excess over expectation.

## 1. Per state

| State | Sat mid | Draws | {2,6,8} box / exp | 268 straight / exp | Last {2,6,8} (draws since) | ≥2 of {2,6,8} / exp | last-30: ≥2 of {2,6,8} / exp | all-even singles / exp | sum 16 / exp | Singles % |
|---|---|---|---|---|---|---|---|---|---|---|
| DE | ✓ | 205 | 5 / 1.23 | 1 / 0.2 | 862 05-17, 682 06-06, 628 06-19, 862 08-02, 268 09-27 (33) | 38 / 30.8 | 8 / 4.5 | 14 / 12.3 | 17 / 14.1 | 74.6 |
| TX | ✓ | 345 | 5 / 2.07 | 1 / 0.34 | 286 04-27, 286 05-18, 286 06-09, 826 06-10, 268 06-29 (211) | 56 / 51.8 | 3 / 4.5 | 18 / 20.7 | 28 / 23.8 | 73.6 |
| NC | ✓ | 205 | 4 / 1.23 | 0 / 0.2 | 862 07-21, 862 08-30, 628 09-17, 628 10-11 (19) | 33 / 30.8 | 8 / 4.5 | 17 / 12.3 | 15 / 14.1 | 71.2 |
| MS | ✓ | 205 | 3 / 1.23 | 1 / 0.2 | 826 06-15, 628 08-31, 268 09-12 (48) | 35 / 30.8 | 6 / 4.5 | 13 / 12.3 | 13 / 14.1 | 69.8 |
| KY | ✓ | 205 | 3 / 1.23 | 0 / 0.2 | 826 05-19, 862 08-29, 826 10-06 (24) | 31 / 30.8 | 6 / 4.5 | 12 / 12.3 | 10 / 14.1 | 71.2 |
| DC | ✓ | 205 | 3 / 1.23 | 1 / 0.2 | 268 05-14, 862 05-17, 682 09-29 (31) | 25 / 30.8 | 4 / 4.5 | 12 / 12.3 | 14 / 14.1 | 68.8 |
| ME,NH,VT | ✓ | 197 | 2 / 1.18 | 0 / 0.2 | 862 04-19, 682 08-12 (79) | 29 / 29.6 | 7 / 4.5 | 10 / 11.8 | 17 / 13.6 | 75.1 |
| ID | ✓ | 204 | 2 / 1.22 | 0 / 0.2 | 862 04-27, 628 08-06 (84) | 37 / 30.6 | 6 / 4.5 | 11 / 12.2 | 12 / 14.1 | 72.5 |
| KS | ✓ | 204 | 2 / 1.22 | 1 / 0.2 | 268 07-08, 862 07-09 (113) | 35 / 30.6 | 5 / 4.5 | 11 / 12.2 | 15 / 14.1 | 71.6 |
| IN | ✓ | 205 | 2 / 1.23 | 0 / 0.2 | 628 09-14, 862 09-27 (33) | 40 / 30.8 | 6 / 4.5 | 15 / 12.3 | 15 / 14.1 | 71.7 |
| WI | ✓ | 205 | 2 / 1.23 | 0 / 0.2 | 628 04-09, 682 08-01 (90) | 34 / 30.8 | 6 / 4.5 | 13 / 12.3 | 15 / 14.1 | 69.3 |
| IA | ✓ | 205 | 2 / 1.23 | 0 / 0.2 | 628 07-12, 682 07-22 (100) | 31 / 30.8 | 5 / 4.5 | 17 / 12.3 | 13 / 14.1 | 73.7 |
| FL | ✓ | 205 | 2 / 1.23 | 1 / 0.2 | 628 08-24, 268 10-13 (17) | 30 / 30.8 | 6 / 4.5 | 11 / 12.3 | 13 / 14.1 | 71.2 |
| CO | ✓ | 205 | 2 / 1.23 | 0 / 0.2 | 862 04-17, 862 05-19 (164) | 26 / 30.8 | 5 / 4.5 | 10 / 12.3 | 13 / 14.1 | 69.3 |
| OH | ✓ | 205 | 2 / 1.23 | 0 / 0.2 | 862 05-10, 862 06-26 (126) | 23 / 30.8 | 2 / 4.5 | 11 / 12.3 | 13 / 14.1 | 73.7 |
| AR | ✓ | 176 | 1 / 1.06 | 0 / 0.18 | 286 05-08 (150) | 28 / 26.4 | 4 / 4.5 | 10 / 10.6 | 12 / 12.1 | 68.8 |
| SC | ✓ | 176 | 1 / 1.06 | 0 / 0.18 | 628 06-09 (123) | 24 / 26.4 | 6 / 4.5 | 14 / 10.6 | 8 / 12.1 | 73.9 |
| ON | ✓ | 203 | 1 / 1.22 | 0 / 0.2 | 862 09-14 (44) | 23 / 30.4 | 7 / 4.5 | 10 / 12.2 | 10 / 14 | 70.4 |
| CT | ✓ | 205 | 1 / 1.23 | 0 / 0.2 | 826 09-07 (53) | 34 / 30.8 | 5 / 4.5 | 13 / 12.3 | 16 / 14.1 | 64.9 |
| MO | ✓ | 205 | 1 / 1.23 | 0 / 0.2 | 628 09-13 (47) | 34 / 30.8 | 6 / 4.5 | 16 / 12.3 | 15 / 14.1 | 77.1 |
| NM | ✓ | 205 | 1 / 1.23 | 0 / 0.2 | 628 08-30 (61) | 34 / 30.8 | 4 / 4.5 | 10 / 12.3 | 9 / 14.1 | 69.8 |
| NY | ✓ | 205 | 1 / 1.23 | 0 / 0.2 | 682 08-25 (66) | 27 / 30.8 | 5 / 4.5 | 9 / 12.3 | 15 / 14.1 | 73.2 |
| NJ | ✓ | 205 | 1 / 1.23 | 0 / 0.2 | 286 06-23 (129) | 27 / 30.8 | 1 / 4.5 | 11 / 12.3 | 14 / 14.1 | 73.2 |
| AZ | ✓ | 138 | 0 / 0.83 | 0 / 0.14 | never | 25 / 20.7 | 7 / 4.5 | 4 / 8.3 | 6 / 9.5 | 73.9 |
| VA | ✓ | 205 | 0 / 1.23 | 0 / 0.2 | never | 36 / 30.8 | 8 / 4.5 | 10 / 12.3 | 13 / 14.1 | 69.8 |
| CA | ✓ | 205 | 0 / 1.23 | 0 / 0.2 | never | 35 / 30.8 | 5 / 4.5 | 14 / 12.3 | 9 / 14.1 | 77.1 |
| IL | ✓ | 205 | 0 / 1.23 | 0 / 0.2 | never | 32 / 30.8 | 5 / 4.5 | 13 / 12.3 | 17 / 14.1 | 72.7 |
| PA | ✓ | 205 | 0 / 1.23 | 0 / 0.2 | never | 27 / 30.8 | 4 / 4.5 | 13 / 12.3 | 12 / 14.1 | 65.9 |
| MI | ✓ | 205 | 0 / 1.23 | 0 / 0.2 | never | 25 / 30.8 | 3 / 4.5 | 9 / 12.3 | 12 / 14.1 | 73.2 |
| GA | ✓ | 205 | 0 / 1.23 | 0 / 0.2 | never | 24 / 30.8 | 2 / 4.5 | 9 / 12.3 | 10 / 14.1 | 70.2 |
| TN | ✓ | 352 | 0 / 2.11 | 0 / 0.35 | never | 47 / 52.8 | 5 / 4.5 | 20 / 21.1 | 30 / 24.3 | 67.9 |
POOL 6505 draws · {2,6,8} box 49 / 39.0 · 268 straight 6 / 6.5 · ≥2-of 985 / 975.8 · all-even singles 380 / 390.3


## 2. Last 12 midday draws of the leaders

- **DE** 186 642 489 440 872 018 346 465 274 062 831 236
- **TX** 981 857 064 934 308 302 913 863 069 447 282 589
- **NC** 830 686 138 143 049 641 289 591 602 422 752 856
- **MS** 608 229 504 036 537 515 417 917 666 282 499 253
- **KY** 816 421 090 848 156 266 122 374 313 828 344 305
- **DC** 921 575 228 385 995 140 997 882 624 726 979 935


## 3. Engine lens — {2,6,8} on past Midday boards

- midday draws of {2,6,8} on those board days: NC 628 2026-10-11, CT 826 2026-09-07

## 4. Answer as the table reads it

- **DE** is the midday state that matches 268 on every lens: {2,6,8} drawn 5× vs 1.23 expected (the most of any state, 4.1×), the only state to draw it both as 268 straight (9/27) and as 862 twice; last {2,6,8} 33 draws ago; last-30 draws carry ≥2 of the digits 2/6/8 8× vs 4.5; all-even singles and sum-16 both above expectation. DE draws midday on Saturday.
- **NC** is second: 4 / 1.23 box, most recent {2,6,8} of any leader (628 on 10/11, 19 draws ago), last-30 pair lens 8 / 4.5, all-even singles 17 / 12.3. No 268 straight.
- **TX** has 5 box on 345 draws (2.4×) but nothing since 6/29 (211 draws) and the last-30 pair lens is under expectation.
- Pool total sits at expectation on every lens (box 49 / 39.0, straight 6 / 6.5, pair 985 / 976, all-even 380 / 390). Nothing proposed here.

## SQL (re-runnable in the Supabase SQL editor)

```sql
-- §1: per-state lenses for {2,6,8} / 268, midday, 2026-04-01 → 2026-10-30
with d as (
  select jurisdiction, date_et, result_digits, comboset_sorted,
         (substr(comboset_sorted,2,1)<>substr(comboset_sorted,4,1) and substr(comboset_sorted,4,1)<>substr(comboset_sorted,6,1)) single,
         result_digits ~ '^[02468]{3}$' all_even,
         (substr(result_digits,1,1)::int+substr(result_digits,2,1)::int+substr(result_digits,3,1)::int) dsum,
         ((position('2' in result_digits)>0)::int+(position('6' in result_digits)>0)::int+(position('8' in result_digits)>0)::int) n268
  from histories where session='midday' and date_et between '2026-04-01' and '2026-10-30'),
last30 as (select * from (select d.*, row_number() over (partition by jurisdiction order by date_et desc, result_digits) rn from d) x where rn<=30)
select d.jurisdiction, count(*) draws,
  sum((comboset_sorted='{2,6,8}')::int) box_268, round(count(*)*6/1000.0,2) exp_box,
  sum((result_digits='268')::int) str_268, round(count(*)/1000.0,2) exp_str,
  string_agg(result_digits||' '||to_char(date_et,'MM-DD'), ', ' order by date_et) filter (where comboset_sorted='{2,6,8}') draws_of_268,
  sum((n268>=2)::int) two_of_268, round(count(*)*150/1000.0,1) exp_two,
  (select sum((n268>=2)::int) from last30 l where l.jurisdiction=d.jurisdiction) two_of_268_last30,
  sum((all_even and single)::int) all_even_singles, round(count(*)*60/1000.0,1) exp_all_even,
  sum((dsum=16)::int) sum16, round(count(*)*69/1000.0,1) exp_sum16,
  round(100.0*sum(single::int)/count(*),1) pct_singles
from d group by 1 order by box_268 - count(*)*6/1000.0 desc;

-- §3: {2,6,8} on past Midday boards and the midday draws of it those days
select slate_date, posted_order from adaptive_tracking
 where scope='midday' and combo_set='{2,6,8}' and slate_date between '2026-04-01' and '2026-10-30'
 group by 1,2 order by 1;
select h.jurisdiction, h.result_digits, h.date_et from histories h
 where h.session='midday' and h.comboset_sorted='{2,6,8}'
   and h.date_et in (select slate_date from adaptive_tracking where scope='midday' and combo_set='{2,6,8}');
```
