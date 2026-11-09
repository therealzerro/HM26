"""Does a pair drawn in the early-13 pool (or at midday) repeat in the late-26 pool
the SAME night more or less often than a pair that was not drawn there?
Universe-level, all nights since 4/01, STRATIFIED by pair kind (mixed ab vs
doubled aa — base rates 54 vs 28 per 1000) and counting DISTINCT pairs per draw.
  python3 scripts/picks/pair_carry_test.py [--cache DIR] [--to DATE]"""
import argparse, math, sys
from collections import defaultdict, Counter
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import hm_data as H
ap = argparse.ArgumentParser(); ap.add_argument('--cache'); ap.add_argument('--to', default='2026-11-07'); a = ap.parse_args()
hist = [r for r in H.histories(a.cache) if r['date_et'] <= a.to]
byd = defaultdict(lambda: defaultdict(list))
for r in hist:
    if H.in_block(r, 'early13'): byd[r['date_et']]['early'].append(r)
    elif H.in_block(r, 'late29'): byd[r['date_et']]['late'].append(r)
    elif r['session'] == 'midday': byd[r['date_et']]['mid'].append(r)
ALLP = sorted({''.join(sorted((str(i), str(j)))) for i in range(10) for j in range(10)})
KIND = {p: ('double' if p[0] == p[1] else 'mixed') for p in ALLP}
dp = lambda s: set(H.pairs(s))
def ztest(h1, n1, h0, n0):
    r1, r0 = h1 / n1, h0 / n0; se = math.sqrt(r1 * (1 - r1) / n1 + r0 * (1 - r0) / n0)
    return r1 / r0 if r0 else float('nan'), (r1 - r0) / se if se else 0
def test(src_key, label, minsrc=8):
    tot = defaultdict(lambda: [0, 0]); nights = 0
    for d, b in byd.items():
        src, late = b.get(src_key, []), b.get('late', [])
        if len(src) < minsrc or len(late) < 15: continue
        nights += 1; drawn = set().union(*(dp(r['result_digits']) for r in src))
        lc = Counter(p for r in late for p in dp(r['result_digits']))
        for p in ALLP: t = tot[(KIND[p], p in drawn)]; t[0] += len(late); t[1] += lc[p]
    print(f"\n{label}: {nights} nights")
    for kind in ('mixed', 'double'):
        (n1, h1), (n0, h0) = tot[(kind, True)], tot[(kind, False)]
        ratio, z = ztest(h1, n1, h0, n0)
        print(f"  {kind:6} pairs: drawn-in-{src_key:5} {h1/n1*1000:6.2f}/1000 (hits {h1:5} / {n1:6})  vs not-drawn {h0/n0*1000:6.2f}/1000 (hits {h0:5} / {n0:6})  → ratio {ratio:.3f}  z {z:+.2f}")
test('early', 'PAIR drawn in the EARLY-13 → same night LATE-26 pool')
test('mid', 'PAIR drawn at MIDDAY (all states) → same night LATE-26 pool', minsrc=20)
# reference-block count buckets, stratified
tot = defaultdict(lambda: [0, 0]); dates = sorted(byd)
for i, d in enumerate(dates[1:], 1):
    prev = dates[i - 1]; ref = byd[prev]['late'] + byd[prev]['early'] + byd[d]['mid'] + byd[d]['early']; late = byd[d]['late']
    if len(ref) < 40 or len(late) < 15: continue
    rc = Counter(p for r in ref for p in dp(r['result_digits'])); lc = Counter(p for r in late for p in dp(r['result_digits']))
    for p in ALLP: t = tot[(KIND[p], min(rc[p], 8))]; t[0] += len(late); t[1] += lc[p]
print("\nPAIR count in the full reference block (prev evening + today midday + early-13; distinct pairs) → late-pool rate per 1000 draws, by pair kind:")
for kind in ('mixed', 'double'):
    draws = sum(v[0] for k, v in tot.items() if k[0] == kind); hits = sum(v[1] for k, v in tot.items() if k[0] == kind); base = hits / draws
    print(f"  {kind} base {base*1000:.2f}/1000")
    for b in range(9):
        n, h = tot[(kind, b)]
        if n < 2000: continue
        z = (h - n * base) / math.sqrt(n * base * (1 - base))
        print(f"    ref count {b if b<8 else '8+'}: {h/n*1000:6.2f} / 1000  (hits {h:5} / {n:6}; z {z:+.2f})")
