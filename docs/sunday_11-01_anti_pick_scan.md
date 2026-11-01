# Anti-pick scan — 2026-11-01 (Sunday), run ~7:00am ET

**Operator question:** "for the last 3 weeks it seems as if we are actually picking what will not be drawn … deeply scope the past results to possibly find what we are doing wrong."

**Method:** every K6 pick = distinct (slate_date, scope, combo_set) in `adaptive_tracking`, strict-joined to `histories` on the same date and a compatible session (midday→midday, evening→evening, allday→either). No stored hit flags (BUG-162). Expected matches per pick = 1 − (1 − 6/1000)^N for a single set, N = draws in the pool that day (3/1000 doubles; none on the boards in the window). z = (matched − expected) / √Σp(1−p). "Last 3 weeks" = 10/11 → 10/31 (21 slate days).

## 1. Engine boards vs the whole pool (every jurisdiction)

| Window | Scope | days | picks | matched | expected | z | matched % | expected % |
|---|---|---|---|---|---|---|---|---|
| last 21d 10/11–10/31 | allday | 21 | 126 | 48 | 44.9 | +0.58 | 38.1 | 35.6 |
| last 21d 10/11–10/31 | midday | 21 | 126 | 26 | 22.0 | +0.93 | 20.6 | 17.5 |
| last 21d 10/11–10/31 | evening | 21 | 126 | 22 | 27.7 | −1.23 | 17.5 | 22.0 |
| prior 21d 9/20–10/10 | allday | 21 | 127 | 45 | 45.4 | −0.08 | 35.4 | 35.8 |
| prior 21d 9/20–10/10 | midday | 21 | 127 | 19 | 22.3 | −0.77 | 15.0 | 17.6 |
| prior 21d 9/20–10/10 | evening | 21 | 127 | 27 | 28.1 | −0.23 | 21.3 | 22.1 |
| prior 60d 7/22–9/19 | allday | 60 | 357 | 133 | 128.1 | +0.54 | 37.3 | 35.9 |
| prior 60d 7/22–9/19 | midday | 60 | 360 | 57 | 63.4 | −0.88 | 15.8 | 17.6 |
| prior 60d 7/22–9/19 | evening | 60 | 360 | 85 | 79.9 | +0.65 | 23.6 | 22.2 |
| post-10/13 ship 10/13–10/31 | allday | 19 | 114 | 43 | 40.8 | +0.43 | 37.7 | 35.8 |
| post-10/13 ship 10/13–10/31 | midday | 19 | 114 | 22 | 20.1 | +0.46 | 19.3 | 17.6 |
| post-10/13 ship 10/13–10/31 | evening | 19 | 114 | 20 | 25.1 | −1.16 | 17.5 | 22.0 |
| pre-10/13 30d 9/13–10/12 | allday | 30 | 181 | 61 | 64.5 | −0.54 | 33.7 | 35.6 |
| pre-10/13 30d 9/13–10/12 | midday | 30 | 181 | 30 | 31.6 | −0.31 | 16.6 | 17.4 |
| pre-10/13 30d 9/13–10/12 | evening | 30 | 181 | 37 | 39.9 | −0.52 | 20.4 | 22.0 |
| since 4/01 | allday | 193 | 1,112 | 433 | 394.9 | +2.39 | 38.9 | 35.5 |
| since 4/01 | midday | 186 | 1,083 | 190 | 188.9 | +0.09 | 17.5 | 17.4 |
| since 4/01 | evening | 193 | 1,089 | 256 | 240.3 | +1.15 | 23.5 | 22.1 |

Every window, every scope: |z| < 1.3. The 10/13 engine ship (ENG-REVIEW-03 batch) did not move the rate. Evening's last-21d deficit is 5.7 picks on 126, inside one slate's noise. Over the whole record no scope is below expectation.

## 2. Exact order (posted_order vs result_digits)

| Window | Scope | picks | box matched | straight rows | expected straight rows |
|---|---|---|---|---|---|
| last 21d | allday | 126 | 48 | 10 | 9.2 |
| last 21d | midday | 126 | 26 | 3 | 4.0 |
| last 21d | evening | 126 | 22 | 4 | 5.2 |
| 9/20–10/10 | allday | 127 | 45 | 7 | 9.3 |
| 9/20–10/10 | midday | 127 | 19 | 1 | 4.1 |
| 9/20–10/10 | evening | 127 | 27 | 8 | 5.3 |
| since 4/01 | allday | 1,049 | 409 | 88 | 77.1 |
| since 4/01 | midday | 1,025 | 183 | 30 | 32.8 |
| since 4/01 | evening | 1,031 | 239 | 53 | 42.9 |

17 straights in the last 21 days vs 18.4 expected. Of the box rows, 15–18 % land in the posted order (1 in 6 = 16.7 % expected).

## 3. Timing lens — last 21 days, board sets vs draws on day D−1 … D+3

| Scope | D−1 | D (board day) | D+1 | D+2 | D+3 |
|---|---|---|---|---|---|
| allday | **0 / 44.9 (z −8.4)** | 48 / 45.8 (+0.4) | 49 / 44.6 (+0.8) | 42 / 42.0 (0.0) | 46 / 39.3 (+1.3) |
| midday | **0 / 22.0 (z −5.2)** | 26 / 22.0 (+0.9) | 29 / 21.2 (+1.9) | 24 / 20.1 (+1.0) | 20 / 19.0 (+0.2) |
| evening | **0 / 27.7 (z −6.0)** | 22 / 27.7 (−1.2) | 30 / 26.5 (+0.8) | 29 / 25.1 (+0.9) | 25 / 23.8 (+0.3) |

D−1 is zero in every scope **by construction**: the 3-day post-hit block (hardcoded in 5 files, [[project_post_hit_block_2day_refuted]]) never lets a set that just drew onto the board. So the boards are, literally, "what was not drawn yesterday." On the board day and the three days after, the sets draw at the uniform rate — the block removes yesterday's sets, it does not make today's sets colder (COHORT-02: hazard flat to 400 draws, no due threshold).

## 4. The operator's pool — early-13 evening (PA SC WV ME,NH,VT TX GA TN MI MN DE OH AR DC)

| Window | Lens | sets | matched | expected | z |
|---|---|---|---|---|---|
| last 21d | Evening board | 126 | 9 | 11.3 | −0.71 |
| last 21d | All-Day board | 126 | 11 | 11.3 | −0.08 |
| last 21d | Either board (union, ~9 sets/day) | 191 | 15 | 17.0 | −0.52 |
| prior 21d | Evening board | 127 | 11 | 11.3 | −0.10 |
| prior 21d | All-Day board | 127 | 14 | 11.3 | +0.84 |
| prior 21d | Either board (union) | 202 | 18 | 18.0 | 0.00 |

Per state, last 21 days, either board (expected ≈ 1.1 per 21 draws, 2.3 for GA/DC with two rows, 2.0 for TX): DE 3 · AR 2 · DC 2 · OH 2 · PA 2 · SC 2 · GA 1 · MN 1 · ME,NH,VT 0 · MI 0 · TN 0 · TX 0 · WV 0. Five dry states on 21 draws each is the normal spread (P(0 | 1.1) = 33 %).

## 5. The placed tickets, 10/11 → 10/31 (operator-word PLACED only; `docs/bet_log.md`)

| Date | Pool (rows) | Leg | In-pool result | Same set elsewhere that day | Same set next 3 days (any state) | Prev 3 days |
|---|---|---|---|---|---|---|
| 10/18 | early-11 (13) | {3,6,7} 3B | blank | — | 10-19 GA eve 673 | — |
| 10/18 | early-11 | {0,6,7} 3B | blank | — | — | — |
| 10/18 | early-11 | {2,4,5} 3B | blank | — | 10-19 OH mid 524 | — |
| 10/20 | early-13 (16) | {3,4,6} 1B | **DE 634 box** | — | 10-22 NM eve 364 | — |
| 10/20 | early-13 | {3,6,9} 1B + 639 1S | blank | — | 10-22 VA mid 963, 10-23 VA mid 936 | — |
| 10/20 | early-13 | {0,2,3} 1B | blank | — | 10-23 IL eve 023, NJ mid 032 | — |
| 10/20 | early-13 | {0,4,6} 1B | blank | — | 10-23 CT eve 460 | — |
| 10/20 | early-13 | {2,4,8} 1B | blank | — | — | — |
| 10/20 | early-13 | {2,6,8} 1B | blank | — | 10-23 IA eve 826 | — |
| 10/20 | late-29 (26) | {2,4,8} 4B + 824 3S | blank | — | — | — |
| 10/20 | late-29 | {3,6,9} 4B | blank | — | 10-22 VA mid 963, 10-23 VA mid 936 | — |
| 10/23 | full day (75) | 824 2S | blank | — | 10-25 CA eve 842, 10-26 TX eve 842 | — |
| 10/23 | full day | {2,6,8} 3B | **IA 826 box** | — | — | — |
| 10/24 | early-13 (16) | {2,4,8} 2B + 824 1S | blank | — | 10-25 CA 842, 10-26 TX 842, 10-27 IN mid 824 | — |
| 10/24 | early-13 | {5,7,9} 2B | blank | — | 10-26 IN eve 597 | — |
| 10/24 | early-13 | {3,7,9} 2B | blank | — | 10-25 MO mid 739, 10-26 IA mid 739, 10-27 SC mid 973 | — |
| 10/24 | early-13 | {4,6,7} 1B | **MN 467 box** | — | 10-27 QC eve 746 | — |
| 10/24 | early-13 | {0,3,4} 1B | blank | — | 10-26 PA mid 304 | — |
| 10/24 | late-29 (26) | {2,4,8} 1B + 824 1S | blank | — | (as above) | — |
| 10/24 | late-29 | {5,7,9} / {3,7,9} / {0,3,4} 1B | blank | — | (as above) | — |
| 10/28 | midday (33) | {1,5,7} 3B | blank | — | — | — |
| 10/28 | midday | 573 2S | blank | — | 10-30 DE eve 357, DC eve 753 | — |

Box legs: **3 in-pool hits on 24 legs; fair expectation 3.2** (early-11 7.5 % · early-13 9.2 % · late-29 14.5 % · full day 36.3 % · midday-33 18.0 % per set). Straight legs: 0 exact on 6 units of posted order; expectation 0.19. "Prev 3 days" is empty on every leg because the engine block and the ride/convention rules drop any set that just drew. "Next 3 days" is filled on 16 of 24 legs; with ~75 draws a day, a single set drawing somewhere in the next three days is 74 % likely — 16 / 24 = 67 % is that rate. The −$140.25 is the 10 % house take on $320 staked, plus 0 straights on ~0.19 expected.

## 6. Verdict as the tables read

- No lens shows picks being drawn **less** than a random set of the same class: whole pool, each scope, the operator's early-13 pool, the placed legs, box and exact — every one sits inside ±1.3 z in the last 3 weeks and the 3 weeks before.
- Nothing changed on 10/13: pre/post rates are identical.
- What the operator is seeing is real but structural: (a) the board never contains what drew yesterday (block), so every miss looks like "we had it and dropped it" when yesterday's set draws again; (b) a set drawing somewhere in the 38-state pool within three days is the norm (74 %), so almost every blank leg is followed by a "see, it came" draw in a state outside the ticket; (c) a 13-draw pool pays a box 9 % of the time per set, so 2 of 3 early tickets blank is the base rate.
- Standing verdicts hold: AUC 0.500 (ENG-REVIEW-01), information ceiling at zero pick-level lift, no due threshold (COHORT-02). Nothing proposed.

## SQL (re-runnable in the Supabase SQL editor)

```sql
-- §1 picks × histories, strict join, windows × scope
with p as (
  select distinct slate_date, scope, combo_set,
         (select count(distinct x) from unnest(string_to_array(trim(both '{}' from combo_set), ',')) x) nd
  from adaptive_tracking where slate_date between '2026-04-01' and '2026-10-31' and scope in ('midday','evening','allday')),
h as (select date_et, session, comboset_sorted from histories where date_et between '2026-04-01' and '2026-10-31' and session in ('midday','evening')),
pool as (select date_et, session, count(*) n from h group by 1,2),
pk as (
  select p.*, case nd when 3 then 6 when 2 then 3 else 1 end k,
    (select coalesce(sum(n),0) from pool where pool.date_et=p.slate_date and (p.scope='allday' or pool.session=p.scope)) npool,
    exists (select 1 from h where h.date_et=p.slate_date and h.comboset_sorted=p.combo_set and (p.scope='allday' or h.session=p.scope)) hit
  from p),
w as (select * from (values ('1 last 21d','2026-10-11'::date,'2026-10-31'::date),('2 prior 21d','2026-09-20','2026-10-10'),('3 prior 60d','2026-07-22','2026-09-19'),('4 since 4/01','2026-04-01','2026-10-31'),('5 post-10/13','2026-10-13','2026-10-31'),('6 pre-10/13 30d','2026-09-13','2026-10-12')) v(win,d0,d1))
select w.win, pk.scope, count(distinct slate_date) days, count(*) picks, sum(hit::int) matched, round(sum(1-power(1-k/1000.0,npool)),1) expected,
  round((sum(hit::int)-sum(1-power(1-k/1000.0,npool)))/sqrt(sum((1-power(1-k/1000.0,npool))*power(1-k/1000.0,npool))),2) z
from pk join w on pk.slate_date between w.d0 and w.d1 group by 1,2 order by 1,2;

-- §2 exact order: add posted_order to p and count h.result_digits = posted_order the same way.

-- §3 timing lens (last 21d; joins, not correlated subqueries — the subquery form times out)
with p as (select distinct slate_date, scope, combo_set from adaptive_tracking where slate_date between '2026-10-11' and '2026-10-31' and scope in ('midday','evening','allday')),
lag as (select * from (values (-1),(0),(1),(2),(3)) v(lg)),
pl as (select p.*, lg, (slate_date+lg) tgt from p cross join lag),
hs as (select date_et, session, comboset_sorted, count(*) c from histories where date_et between '2026-10-10' and '2026-10-31' and session in ('midday','evening') group by 1,2,3),
pool as (select date_et, session, sum(c) n from hs group by 1,2),
pk as (select pl.scope, pl.lg, pl.tgt, coalesce(sum(pool.n),0) npool, coalesce(sum(hs.c),0)>0 hit
  from pl left join pool on pool.date_et=pl.tgt and (pl.scope='allday' or pool.session=pl.scope)
  left join hs on hs.date_et=pl.tgt and hs.comboset_sorted=pl.combo_set and (pl.scope='allday' or hs.session=pl.scope)
  group by pl.scope, pl.lg, pl.tgt, pl.slate_date, pl.combo_set)
select scope, lg, count(*) picks, sum(hit::int) matched, round(sum(1-power(0.994,npool)),1) expected
from pk where npool>0 and tgt<='2026-10-31' group by 1,2 order by 1,2;

-- §4 early-13 pool: restrict h to session='evening' and the 13 jurisdictions; lenses = evening board, all-day board, union.
-- §5 placed legs: VALUES table of (date, pool, set, posted order) joined to histories on the pool's session/jurisdictions, D−3..D+3.
```
