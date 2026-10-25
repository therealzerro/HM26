-- COHORT-02 (2026-10-25) — "is any box combo ever due?" — five scans over the 220-set universe.
-- Window: histories 2026-04-01 → 2026-10-24 (April = warm-up). Classes scored separately (singles 6/1000, doubles 3/1000, triples 1/1000 per draw).
-- Each block returns an aggregated table: bucket, n, hits, rate, class base rate, z. See docs/research/due_threshold_scan_2026-10-25.md.

-- ===== 1. National draws-since, scaled by expected gap =====
with draws as (
  select date_et d, comboset_sorted cs, row_number() over (order by date_et, created_at, jurisdiction, session) seq
  from histories where date_et between '2026-04-01' and '2026-10-24'),
day_start as (select d, min(seq) seq0 from draws group by d),
app as (select cs, d, max(seq) last_seq from draws group by cs, d),
app2 as (select *, lead(d) over (partition by cs order by d) next_d from app),
sets as (select cs, array_length(array(select distinct unnest(string_to_array(trim(both '{}' from cs), ','))),1) ndist from (select distinct cs from draws) s),
grid as (select ds.d, ds.seq0, s.cs, s.ndist from day_start ds cross join sets s where ds.d >= '2026-05-01'),
feat as (select g.d, g.cs, g.ndist, coalesce(g.seq0 - a.last_seq, g.seq0) gap_draws,
                exists (select 1 from app h where h.cs=g.cs and h.d=g.d) hit
         from grid g left join app2 a on a.cs=g.cs and a.d < g.d and coalesce(a.next_d, date '9999-01-01') >= g.d),
scaled as (select *, case ndist when 3 then 'singles' when 2 then 'doubles' else 'triples' end cls,
                  gap_draws::numeric / (case ndist when 3 then 1000.0/6 when 2 then 1000.0/3 else 1000.0 end) gap_x from feat),
base as (select cls, avg(hit::int) base_rate from scaled group by cls)
select s.cls, width_bucket(gap_x, array[0.5,1,1.5,2,3,4]) bucket, count(*) n, sum(hit::int) hits, round(100*avg(hit::int),2) rate_pct,
       round(100*max(b.base_rate),2) base_pct,
       round((avg(hit::int)-max(b.base_rate))/sqrt(max(b.base_rate)*(1-max(b.base_rate))/count(*)),2) z
from scaled s join base b using (cls) group by 1,2 order by 1,2;

-- ===== 2. Cumulative days-absent ladder (national) =====
with draws as (select date_et d, comboset_sorted cs from histories where date_et between '2026-04-01' and '2026-10-24'),
app as (select cs, d from draws group by cs, d),
app2 as (select *, lead(d) over (partition by cs order by d) next_d from app),
sets as (select cs, array_length(array(select distinct unnest(string_to_array(trim(both '{}' from cs), ','))),1) ndist from (select distinct cs from draws) s),
days as (select distinct d from draws where d >= '2026-05-01'),
feat as (select dd.d, s.cs, case s.ndist when 3 then 'singles' when 2 then 'doubles' else 'triples' end cls,
                coalesce(dd.d - a.d, dd.d - date '2026-03-31') gap_days,
                exists (select 1 from app h where h.cs=s.cs and h.d=dd.d) hit
         from days dd cross join sets s
         left join app2 a on a.cs=s.cs and a.d < dd.d and coalesce(a.next_d, date '9999-01-01') >= dd.d),
base as (select cls, avg(hit::int) base_rate from feat group by cls),
ladder as (select * from (values (3),(5),(7),(10),(14),(21),(30),(45)) v(t))
select f.cls, l.t as absent_at_least_days, count(*) n, sum(hit::int) hits, round(100*avg(hit::int),2) rate_pct, round(100*max(b.base_rate),2) base_pct,
       round((avg(hit::int)-max(b.base_rate))/sqrt(max(b.base_rate)*(1-max(b.base_rate))/count(*)),2) z
from feat f join base b using (cls) cross join ladder l where f.gap_days >= l.t group by 1,2 order by 1,2;

-- ===== 3. Trailing frequency quintiles (30d, 90d) within class and day =====
with draws as (select date_et d, comboset_sorted cs from histories where date_et between '2026-04-01' and '2026-10-24'),
days as (select distinct d from draws where d >= '2026-07-01'),
sets as (select cs, array_length(array(select distinct unnest(string_to_array(trim(both '{}' from cs), ','))),1) ndist from (select distinct cs from draws) s),
feat as (select dd.d, s.cs, case s.ndist when 3 then 'singles' when 2 then 'doubles' else 'triples' end cls,
                (select count(*) from draws x where x.cs=s.cs and x.d >= dd.d - 90 and x.d < dd.d) cnt90,
                (select count(*) from draws x where x.cs=s.cs and x.d >= dd.d - 30 and x.d < dd.d) cnt30,
                exists (select 1 from draws x where x.cs=s.cs and x.d=dd.d) hit
         from days dd cross join sets s),
ranked as (select *, ntile(5) over (partition by d, cls order by cnt90, cs) q90, ntile(5) over (partition by d, cls order by cnt30, cs) q30 from feat),
base as (select cls, avg(hit::int) base_rate from feat group by cls)
select r.cls, 'cnt90 q'||q90 bucket, count(*) n, sum(hit::int) hits, round(100*avg(hit::int),2) rate_pct, round(100*max(b.base_rate),2) base_pct,
       round((avg(hit::int)-max(b.base_rate))/sqrt(max(b.base_rate)*(1-max(b.base_rate))/count(*)),2) z
from ranked r join base b using (cls) group by 1,2
union all
select r.cls, 'cnt30 q'||q30, count(*), sum(hit::int), round(100*avg(hit::int),2), round(100*max(b.base_rate),2),
       round((avg(hit::int)-max(b.base_rate))/sqrt(max(b.base_rate)*(1-max(b.base_rate))/count(*)),2)
from ranked r join base b using (cls) group by 1,2 order by 1,2;

-- ===== 4. Pair recency (min / max / sum of the set's three digit-pair gaps, national) =====
with draws as (select date_et d, comboset_sorted cs,
                      split_part(trim(both '{}' from comboset_sorted), ',', 1) a,
                      split_part(trim(both '{}' from comboset_sorted), ',', 2) b,
                      split_part(trim(both '{}' from comboset_sorted), ',', 3) c
               from histories where date_et between '2026-04-01' and '2026-10-24'),
pair_days as (select distinct d, pr from (select d, a||','||b pr from draws union all select d, a||','||c from draws union all select d, b||','||c from draws) u),
pair_days2 as (select *, lead(d) over (partition by pr order by d) next_d from pair_days),
sets as (select distinct cs, a, b, c, array_length(array(select distinct unnest(array[a,b,c])),1) ndist from draws),
set_pairs as (select cs, ndist, a||','||b pr from sets union all select cs, ndist, a||','||c from sets union all select cs, ndist, b||','||c from sets),
days as (select distinct d from draws where d >= '2026-05-01'),
pg as (select dd.d, sp.cs, sp.ndist, coalesce(dd.d - p.d, dd.d - date '2026-03-31') pair_gap
       from days dd cross join set_pairs sp
       left join pair_days2 p on p.pr=sp.pr and p.d < dd.d and coalesce(p.next_d, date '9999-01-01') >= dd.d),
feat as (select d, cs, case ndist when 3 then 'singles' when 2 then 'doubles' else 'triples' end cls, min(pair_gap) pg_min, max(pair_gap) pg_max, sum(pair_gap) pg_sum,
                exists (select 1 from draws x where x.cs=pg.cs and x.d=pg.d) hit from pg group by d, cs, ndist),
base as (select cls, avg(hit::int) base_rate from feat group by cls)
select f.cls, 'sum pair gaps' metric, width_bucket(pg_sum, array[4,7,11,21]) bucket, count(*) n, sum(hit::int) hits, round(100*avg(hit::int),2) rate_pct, round(100*max(b.base_rate),2) base_pct,
       round((avg(hit::int)-max(b.base_rate))/sqrt(max(b.base_rate)*(1-max(b.base_rate))/count(*)),2) z
from feat f join base b using (cls) group by 1,2,3 order by 1,2,3;

-- ===== 5. Per-state hazard by gap (intervals per jurisdiction×session×set stream, right-censored at window end) =====
with draws as (select jurisdiction||'|'||session stream, date_et d, comboset_sorted cs,
                      array_length(array(select distinct unnest(string_to_array(trim(both '{}' from comboset_sorted), ','))),1) ndist,
                      row_number() over (partition by jurisdiction, session order by date_et, created_at, result_digits) seq
               from histories where date_et between '2026-04-01' and '2026-10-24'),
stream_end as (select stream, max(seq) seq_end from draws group by stream),
app as (select stream, cs, ndist, seq, lag(seq) over (partition by stream, cs order by seq) prev_seq from draws),
intervals as (select ndist, seq - prev_seq len, 1 event from app where prev_seq is not null
              union all
              select a.ndist, e.seq_end - a.seq, 0 from (select stream, cs, ndist, max(seq) seq from app group by 1,2,3) a join stream_end e using (stream) where e.seq_end > a.seq),
buckets as (select * from (values ('a 1-30',1,30),('b 31-60',31,60),('c 61-100',61,100),('d 101-150',101,150),('e 151-200',151,200),('f 201-300',201,300),('g 301-400',301,400),('h 401+',401,100000)) v(b, lo, hi))
select case ndist when 3 then 'singles' when 2 then 'doubles' else 'triples' end cls, b.b gap_bucket,
       sum(least(i.len, b.hi) - b.lo + 1) filter (where i.len >= b.lo) exposures,
       sum(i.event) filter (where i.len between b.lo and b.hi) hits,
       round(1000.0 * sum(i.event) filter (where i.len between b.lo and b.hi) / nullif(sum(least(i.len, b.hi) - b.lo + 1) filter (where i.len >= b.lo),0), 2) hazard_per_1000,
       case ndist when 3 then 6.0 when 2 then 3.0 else 1.0 end fair_per_1000
from intervals i cross join buckets b group by 1,2, ndist order by 1,2;
