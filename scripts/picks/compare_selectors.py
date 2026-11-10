"""Selector comparison (operator 11/10: "compare most expected against pairs and most drawn").
  python3 scripts/picks/compare_selectors.py <cache dir> [--to YYYY-MM-DD]
Every day D (walk-forward, only data before D), each selector names 3 non-triple boxes, 6B on every draw of D:
  OWED   = furthest BELOW its expected count over the lookback   ("most expected")
  DRAWN  = furthest ABOVE its expected count over the lookback   ("most drawn")
  PAIRS  = top pair+digit score on day D-1 (distinct pairs)      (the 11/10 universe scan)
Counts are standardized (count - exp) / sqrt(exp) so 3-way and 6-way sets compare. Lookbacks 7 / 30 / 60 days.
All selectors graded on the same days (first day with a full 60-day lookback onward). histories only (BUG-162).
Book: $0.25/unit/draw; 6-way box $37.50, 3-way $75.00 per unit per hitting state."""
import sys, datetime as dt, statistics as st, math
from collections import Counter, defaultdict
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import hm_data as H
TO = sys.argv[sys.argv.index('--to') + 1] if '--to' in sys.argv else None
hist = [r for r in H.histories(sys.argv[1], max_age=7200) if not TO or r['date_et'] <= TO]
byd = defaultdict(list)
for r in hist: byd[r['date_et']].append(r)
days = sorted(byd); U = [c for c in H.ALLSETS if H.cls(c) > 1]; P = {c: H.cls(c) / 1000 for c in U}; PAY = {6: 37.5, 3: 75.0}
cnt = {d: Counter(r['comboset_sorted'] for r in byd[d]) for d in days}; nd = {d: len(byd[d]) for d in days}
SP = {cs: sorted(set(H.pairs(H.digs(cs)))) for cs in H.ALLSETS}; G = {k: [c for c in H.ALLSETS if H.cls(c) == k] for k in (6, 3, 1)}
def look(i, L):   # standardized excess over the L days before day i
    w = days[i - L:i]; n = sum(nd[d] for d in w); c = Counter()
    for d in w: c.update(cnt[d])
    return {s: (c[s] - n * P[s]) / math.sqrt(n * P[s]) for s in U}
def pairs_sel(i):
    ref = byd[days[i - 1]]; pc = Counter(p for r in ref for p in set(H.pairs(r['result_digits']))); dc = Counter(ch for r in ref for ch in r['result_digits']); z = {}
    for val in ({cs: sum(pc[p] for p in SP[cs]) for cs in H.ALLSETS}, {cs: sum(dc[ch] for ch in H.digs(cs)) for cs in H.ALLSETS}):
        for k, g in G.items():
            mu = st.mean([val[c] for c in g]); sd = st.pstdev([val[c] for c in g]) or 1
            for c in g: z[c] = z.get(c, 0) + (val[c] - mu) / sd
    return sorted(U, key=lambda c: (-z[c], c))[:3]
SEL = {'PAIRS  D-1': pairs_sel}
for L in (7, 30, 60):
    SEL[f'OWED   {L}d'] = lambda i, L=L: (lambda x: sorted(U, key=lambda c: (x[c], c))[:3])(look(i, L))
    SEL[f'DRAWN  {L}d'] = lambda i, L=L: (lambda x: sorted(U, key=lambda c: (-x[c], c))[:3])(look(i, L))
def grade(d, sets, u=6):
    m = sum(cnt[d][s] for s in sets); return nd[d] * 0.25 * u * 3, sum(cnt[d][s] * PAY[H.cls(s)] * u for s in sets), m, sum(P[s] for s in sets) * nd[d]
idx = list(range(60, len(days)))
print(f"graded days {days[60]} → {days[-1]} ({len(idx)} days, {sum(nd[days[i]] for i in idx)} draws) · 3 boxes at 6B on every draw\n")
print(f"{'selector':11} {'window':8} {'matches':>8} {'exp':>7} {'ratio':>6} {'z':>6} {'days≥1':>7} {'pos days':>9} {'staked':>12} {'paid':>12} {'net':>12}")
for name, f in SEL.items():
    picks = {i: f(i) for i in idx}
    for lab, ii in (('all', idx), ('last 60', idx[-60:]), ('last 30', idx[-30:])):
        g = [grade(days[i], picks[i]) for i in ii]; c = sum(x[0] for x in g); p = sum(x[1] for x in g); m = sum(x[2] for x in g); e = sum(x[3] for x in g)
        print(f"{name:11} {lab:8} {m:8} {e:7.1f} {m / e:6.3f} {(m - e) / math.sqrt(e):+6.2f} {sum(x[2] > 0 for x in g):7} {sum(x[1] > x[0] for x in g):5}/{len(ii):<3} {c:12,.2f} {p:12,.2f} {p - c:+12,.2f}")
    # two-day hold: pick on D, hold D and D+1
    g2 = [(grade(days[i], picks[i]), grade(days[i + 1], picks[i])) for i in idx[:-1]]
    c = sum(a[0] + b[0] for a, b in g2); p = sum(a[1] + b[1] for a, b in g2); m = sum(a[2] + b[2] for a, b in g2); e = sum(a[3] + b[3] for a, b in g2)
    print(f"{name:11} {'2-day':8} {m:8} {e:7.1f} {m / e:6.3f} {(m - e) / math.sqrt(e):+6.2f} {sum(a[2] + b[2] > 0 for a, b in g2):7} {sum(a[1] + b[1] > a[0] + b[0] for a, b in g2):5}/{len(g2):<3} {c:12,.2f} {p:12,.2f} {p - c:+12,.2f}\n")
print("NEXT DAY'S PICKS (data through " + days[-1] + "):")
n = len(days)
for name, f in SEL.items():
    L = name.split()[1]; x = look(n, int(L[:-1])) if L.endswith('d') and L[:-1].isdigit() else None
    if name.startswith('PAIRS'):
        ref_i = n; byd['~'] = []; days.append('~'); s = f(n); days.pop()
    else: s = sorted(U, key=lambda c: ((x[c] if name.startswith('OWED') else -x[c]), c))[:3]
    def det(c):
        if x is None: return c
        w = days[n - int(L[:-1]):n]; k = sum(cnt[d][c] for d in w); e = sum(nd[d] for d in w) * P[c]; return f"{c} {k}/{e:.1f}"
    print(f"  {name:11} " + ' · '.join(det(c) for c in s))
