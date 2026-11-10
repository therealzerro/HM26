"""Doubles on the boards — backtest (operator 11/10: "back test your new doubles method to see if this should be added to our boards").
  python3 scripts/picks/doubles_board_test.py <cache dir> [--to YYYY-MM-DD]
Boards are graded by matches (pick % and slate %), the ticket by dollars. This measures both lenses, per scope, from
histories x live snapshots (never stored hit flags — BUG-162):
  1. the boards as posted: picks by class, pick-match % and expectation
  2. the doubles selector walk-forward (top doubles by 60-day count): matches vs expectation
  3. candidate boards: the posted board with its last 1 / 2 / 3 picks swapped for the top 60-day doubles not already on it
     (30d and 60d windows + full record): pick %, slate %, and dollars at 1B per pick on every draw of the scope
"""
import sys, math
from collections import Counter, defaultdict
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import hm_data as H
TO = sys.argv[sys.argv.index('--to') + 1] if '--to' in sys.argv else None
hist = [r for r in H.histories(sys.argv[1], max_age=7200) if not TO or r['date_et'] <= TO]; snaps = H.snapshots(sys.argv[1], max_age=7200)
days = sorted({r['date_et'] for r in hist}); di = {d: i for i, d in enumerate(days)}
rows = {sc: defaultdict(list) for sc in ('midday', 'evening', 'allday')}
for r in hist: rows[r['session']][r['date_et']].append(r); rows['allday'][r['date_et']].append(r)
cnt = {sc: {d: Counter(r['comboset_sorted'] for r in rows[sc][d]) for d in days} for sc in rows}
allc = {d: Counter(r['comboset_sorted'] for r in rows['allday'][d]) for d in days}
S3 = [c for c in H.ALLSETS if H.cls(c) == 3]; PAY = {6: 37.5, 3: 75.0, 1: 0}
board = defaultdict(list)
for p in snaps: board[(p['date'], p['scope'])].append(p)
def top_doubles(d, n, skip=()):
    i = di[d]; w = days[max(0, i - 60):i]; c = Counter()
    for x in w: c.update({s: allc[x][s] for s in S3})
    return [s for s in sorted(S3, key=lambda s: (-c[s], s)) if s not in skip][:n]
def grade(sc, d, sets):
    n = len(rows[sc][d]); hits = [cnt[sc][d][s] for s in sets]
    exp_pick = sum(1 - (1 - H.cls(s) / 1000) ** n for s in sets)
    return dict(picks=len(sets), hit=sum(h > 0 for h in hits), slate=any(hits), exp=exp_pick, cost=n * 0.25 * len(sets), paid=sum(h * PAY[H.cls(s)] for h, s in zip(hits, sets)))
def tot(g): return {k: sum(x[k] for x in g) for k in ('picks', 'hit', 'slate', 'exp', 'cost', 'paid')} | {'n': len(g)}
def line(lab, t): return f"  {lab:34} pick {100*t['hit']/t['picks']:5.1f}% (exp {100*t['exp']/t['picks']:4.1f}) · slate {100*t['slate']/t['n']:5.1f}% · $ at 1B/pick: staked {t['cost']:9,.2f} paid {t['paid']:9,.2f} net {t['paid']-t['cost']:+9,.2f}"
bd = sorted({d for d, sc in board if d in di and di[d] >= 60 and rows['allday'][d]})
print(f"board days graded: {bd[0]} → {bd[-1]} ({len(bd)} days; 60-day lookback available from the first)\n")
print("1. BOARDS AS POSTED — by class")
for sc in ('allday', 'evening', 'midday'):
    for k, lab in ((6, 'singles'), (3, 'doubles')):
        g = [grade(sc, d, [p['set'] for p in board[(d, sc)] if H.cls(p['set']) == k]) for d in bd if board[(d, sc)]]
        t = tot([x for x in g if x['picks']]); 
        if t['picks']: print(f"  {sc:8} {lab}: {t['picks']:4} picks · matched {t['hit']:4} = {100*t['hit']/t['picks']:5.1f}% (exp {100*t['exp']/t['picks']:4.1f}%) · z {(t['hit']-t['exp'])/math.sqrt(t['exp']):+.2f}")
print("\n2. DOUBLES SELECTOR WALK-FORWARD — top-3 doubles by 60-day count, every draw of the day")
g = [grade('allday', d, top_doubles(d, 3)) for d in bd]; t = tot(g); m = sum(sum(cnt['allday'][d][s] for s in top_doubles(d, 3)) for d in bd); e = sum(len(rows['allday'][d]) for d in bd) * 0.009
print(f"  matches {m} / {e:.1f} exp (ratio {m/e:.3f}, z {(m-e)/math.sqrt(e):+.2f}) · days with a match {t['slate']} of {t['n']} = {100*t['slate']/t['n']:.1f}%")
print("\n3. CANDIDATE BOARDS — posted board vs last N picks swapped for the top 60-day doubles")
for sc in ('allday', 'evening', 'midday'):
    for wl, ds in (('full record', bd), ('last 60d', bd[-60:]), ('last 30d', bd[-30:])):
        ds = [d for d in ds if len(board[(d, sc)]) == 6 and rows[sc][d]]
        print(f" {sc} · {wl} ({len(ds)} boards)")
        for n in (0, 1, 2, 3, 6):
            g = []
            for d in ds:
                b = [p['set'] for p in sorted(board[(d, sc)], key=lambda p: p['rank'])]
                keep = b[:6 - n]; g.append(grade(sc, d, keep + top_doubles(d, n, skip=keep)))
            print(line('BASELINE (as posted)' if n == 0 else f'CANDIDATE swap last {n} for doubles' if n < 6 else 'CANDIDATE all six doubles', tot(g)))
