# Recent results vs our data — correlation scan, 2026-11-01 (Sunday, ~7:50pm ET)

**Operator ask:** "scope recent results against our data to see if any of our data shows correlation to the draws."

**Recent window = October 2026 (10/01–10/31, all jurisdictions, both sessions: 2,279 draws; board tests 10/02–10/31, 30 slate days). "Our data" = every stream we hold:** box-frequency history, overdue gap, co-occurrence / positional pair frequency, digit frequency, the four engine signals (BOX, PBURST, CO, DGC) and energy, DI rank, slate membership, posted order, and the draws themselves (carry-over). History = 4/01–9/30 (12,818 draws). Hits computed from `histories` joins — no stored flags (BUG-162). Expected per set-day = 1 − (1 − k/1000)^draws, k = 6 singles / 3 doubles.

## 1. Universe lenses — does a stream's history predict October counts?

| Stream (keys) | Correlation hist → Oct | Oct mean per key | Oct, top-20% by history | Oct, bottom-20% by history |
|---|---|---|---|---|
| Box frequency, 120 singles sets | **−0.171** | 13.84 | 13.46 | 14.21 |
| Overdue gap at 10/01, 120 sets | +0.050 | 13.84 | most-overdue 15.17 | least-overdue 14.38 |
| Co-occurrence pair, 45 distinct-digit pairs | −0.028 | 137.3 | 137.9 | 134.9 |
| Front pair, 100 | +0.057 | 22.8 | 22.7 | 21.5 |
| Back pair, 100 | −0.204 | 22.8 | 21.2 | 23.8 |
| Split pair, 100 | +0.125 | 22.8 | 23.2 | 22.5 |
| Digit, 10 | +0.048 | 683.7 | 691.5 | 688.0 |

Every correlation sits inside ±0.2 (noise band for n = 45–120 is about ±0.1–0.15 at 1σ). The two largest are negative (box frequency −0.17, back pair −0.20): the sets and pairs that led the history drew slightly *less* in October — regression to the mean, not a signal. The pair with the most October draws was 38 (169); the history leaders were 15 / 59 / 48 / 58 / 23. Class mix: October singles 72.9% / triples 0.88% vs Apr–Sep 71.7% / 0.83% (uniform 72.0% / 1.0%).

## 2. Engine output vs October draws (DI top-30 set-days, 10/02–10/31; 842 distinct set-days)

| Lens | Set-days | Drawn same day in scope | Expected |
|---|---|---|---|
| **All top-30** | 842 | **222** | 217.1 |
| On slate (K6) — allday / evening / midday | 180 / 180 / 180 | 69 / 37 / 34 | 64.3 / 39.7 / 31.6 |
| Off slate (ranks 7–30) — allday / evening / midday | 129 / 115 / 58 | 48 / 26 / 8 | 46.0 / 25.4 / 10.2 |
| Rank 1–6 — allday / evening / midday | 81 / 79 / 44 | 29 / 15 / 3 | 28.8 / 17.4 / 7.7 |
| Rank 7–18 | 124 / 103 / 68 | 44 / 28 / 14 | 44.3 / 22.7 / 11.9 |
| Rank 19–30 | 104 / 113 / 126 | 44 / 20 / 25 | 37.1 / 24.9 / 22.1 |

**Slates (posted picks, 10/02–10/31):** allday 69 box / 64.3 exp, 13 straights / 12.8; evening 37 / 39.7, 9 / 7.3; midday 34 / 31.6, 4 / 5.7. Days with ≥1 box: allday 29 of 30, evening 24, midday 24.

**Signal halves within scope (high half vs low half of each signal, hits / expected):**

| Signal | allday high · low | evening high · low | midday high · low |
|---|---|---|---|
| BOX | 59/55.0 · 58/55.3 | 33/32.5 · 30/32.6 | **15/20.7 · 27/21.0** |
| PBURST | 58/55.0 · 59/55.3 | 31/32.4 · 32/32.7 | 22/21.0 · 20/20.8 |
| CO | 54/54.8 · 63/55.5 | 34/32.4 · 29/32.6 | 21/20.7 · 21/21.1 |
| DGC | 55/54.9 · 62/55.4 | 32/32.3 · 31/32.7 | 19/21.0 · 23/20.8 |
| ENERGY | 52/55.2 · **65/55.1** | 32/32.5 · 31/32.5 | 21/20.8 · 21/20.9 |

Largest cells: midday BOX high half 15 vs 20.7 (−1.3σ) with the low half 27 vs 21.0 (+1.3σ); allday ENERGY low half 65 vs 55.1 (+1.3σ); allday rank 19–30 44 vs 37.1 (+1.1σ). Across ~45 cells the expected largest deviation is ≈ 2.2σ; nothing reaches it, and the pulls that exist point to the *lower*-scored half — the same direction as the 11/01 temperature test (`docs/sunday_11-01_temperature_test.md`).

## 3. Draws vs draws (carry-over, October, 1,605 singles-set draws)

| Lens | Repeated | Expected |
|---|---|---|
| Same set drawn in the next session | 298 | 313.1 |
| Same set within the next 3 sessions | 767 | 771.0 |
| Same exact order within the next 3 sessions | 154 | 165.7 |

## Result

No stream we hold correlates with the October draws beyond noise: box frequency, overdue gap, pair frequency (all three positions and co-occurrence), digit frequency, the four engine signals, energy, DI rank, slate membership, posted order, and carry-over all sit at the uniform rate. The on-slate total for October is 140 box / 135.6 expected and 26 straights / 25.8 expected across the three boards. Nothing proposed.

## SQL

```sql
-- §1 sets: history frequency / gap vs October (singles = 120 sets)
with d as (select * from histories where jurisdiction is not null and date_et between '2026-04-01' and '2026-10-31'),
sets as (select distinct comboset_sorted cs from d where comboset_sorted ~ '^\{(\d),(\d),(\d)\}$' and substr(comboset_sorted,2,1)<>substr(comboset_sorted,4,1) and substr(comboset_sorted,4,1)<>substr(comboset_sorted,6,1)),
hist as (select cs, count(x.id) h, max(x.date_et) last_h from sets left join d x on x.comboset_sorted=sets.cs and x.date_et<'2026-10-01' group by cs),
octo as (select cs, count(x.id) o from sets left join d x on x.comboset_sorted=sets.cs and x.date_et>='2026-10-01' group by cs),
gap as (select cs, (select count(*) from d where d.date_et<'2026-10-01' and d.date_et>coalesce(last_h,'2026-03-31')) g from hist),
j as (select h.cs, h.h, o.o, g.g from hist h join octo o using(cs) join gap g using(cs))
select count(*), sum(o), round(avg(o),2), round(corr(h,o)::numeric,3) corr_hist, round(corr(g,o)::numeric,3) corr_gap,
 (select round(avg(o),2) from (select o, ntile(5) over (order by h) q from j) z where q=5) top20_hist,
 (select round(avg(o),2) from (select o, ntile(5) over (order by h) q from j) z where q=1) bot20_hist,
 (select round(avg(o),2) from (select o, ntile(5) over (order by g) q from j) z where q=5) most_overdue,
 (select round(avg(o),2) from (select o, ntile(5) over (order by g) q from j) z where q=1) least_overdue from j;

-- §1 pairs / digits: build keys per draw (co-occurrence = three unordered pairs, distinct digits only; front = substr(r,1,2); back = substr(r,2,2); split = substr(r,1,1)||substr(r,3,1); digit = each position), then per lens:
--   select lens, count(*), round(corr(h,o)::numeric,3), avg(o), top-quintile avg(o), bottom-quintile avg(o) from (select lens, k, count(*) filter (where date_et<'2026-10-01') h, count(*) filter (where date_et>='2026-10-01') o ... group by lens, k) f group by lens;

-- §2 DI top-30 set-days vs same-day draws in scope
with di as (select distinct slate_date, scope, combo_set, min(rank) rk, bool_or(on_slate) on_slate, max(energy_score) energy, max(signal_box) sbox, max(signal_pburst) spb, max(signal_co) sco, max(signal_dgc) sdgc from daily_intelligence where slate_date between '2026-10-02' and '2026-10-31' and scope in ('midday','evening','allday') group by 1,2,3),
nd as (select date_et, session, count(*) n from histories where jurisdiction is not null and date_et between '2026-10-02' and '2026-10-31' group by 1,2),
x as (select di.*, case when substr(combo_set,2,1)=substr(combo_set,4,1) or substr(combo_set,4,1)=substr(combo_set,6,1) then 3 else 6 end k,
  (select coalesce(sum(n),0) from nd where nd.date_et=di.slate_date and (di.scope='allday' or nd.session=di.scope)) ndraws,
  exists (select 1 from histories h where h.jurisdiction is not null and h.date_et=di.slate_date and (di.scope='allday' or h.session=di.scope) and h.comboset_sorted=di.combo_set) hit from di),
y as (select *, 1-power(1-k/1000.0, ndraws) p from x)
select scope, case when rk<=6 then 'rank 1-6' when rk<=18 then 'rank 7-18' else 'rank 19-30' end tier, count(*), sum(hit::int), round(sum(p),1) from y group by 1,2
union all select scope, case when on_slate then 'on slate' else 'off slate' end, count(*), sum(hit::int), round(sum(p),1) from y group by 1,2;
-- signal halves: ntile(2) over (partition by scope order by <signal>) on y, then sum(hit::int) / sum(p) per half.

-- §2 slates (posted picks)
with s as (select slate_date, scope, (e->>'bestOrder') posted, (e->>'comboSet') cs from slate_snapshots, jsonb_array_elements(top_k_straights_json) e where slate_date between '2026-10-02' and '2026-10-31' and deleted_at is null and jurisdiction is null and scope in ('midday','evening','allday')),
nd as (select date_et, session, count(*) n from histories where jurisdiction is not null and date_et between '2026-10-02' and '2026-10-31' group by 1,2),
x as (select s.*, case when substr(cs,2,1)=substr(cs,4,1) or substr(cs,4,1)=substr(cs,6,1) then 3 else 6 end k,
 (select coalesce(sum(n),0) from nd where nd.date_et=s.slate_date and (s.scope='allday' or nd.session=s.scope)) ndraws,
 exists (select 1 from histories h where h.jurisdiction is not null and h.date_et=s.slate_date and (s.scope='allday' or h.session=s.scope) and h.comboset_sorted=s.cs) box,
 exists (select 1 from histories h where h.jurisdiction is not null and h.date_et=s.slate_date and (s.scope='allday' or h.session=s.scope) and h.result_digits=s.posted) str from s)
select scope, count(*), sum(box::int), round(sum(1-power(1-k/1000.0,ndraws)),1), sum(str::int), round(sum(1-power(1-1/1000.0,ndraws)),1), count(distinct slate_date) filter (where box) from x group by 1;

-- §3 carry-over: number sessions (midday=0, evening=1 within a date) 9/20–10/31; for each October singles-set draw, exists same set (or same result_digits) in session sn+1 / sn+1..sn+3; expected = Σ 1−(1−0.006)^draws_in_window (0.001 for exact order).
```
