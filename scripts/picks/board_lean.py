"""Board-leaning picks for one draw block (operator rule, 2026-11-08).

  python3 scripts/picks/board_lean.py --block late29 --date 2026-11-08 [--extra early.json] [--cache DIR]

Pool = the All-Day board + the session board for the block (midday board for
`midday`; evening board for `early13` / `late29` / `evening`). The block's own
data orders that pool; it does not add combos. Universe sets are listed
separately only when LOUD (top-3 of the open universe on the reference-block
pair+digit score AND block 60d count >= expectation).

Rank key (in order):
  1. not yet drawn today (drawn-today sets stay listed, at the bottom)
  2. on BOTH boards (overlap) before single-board
  3. pair+digit z on the reference block (prev evening + today's midday [+ --extra rows];
     for `midday`: prev-day midday + prev-day evening)
  4. block 60d count minus expectation
Straight order = posted order when both boards agree; else the posted order that
matches the block's lead order; else the All-Day posted order.
"""
import argparse, datetime as dt, json, statistics as st, sys
from collections import Counter, defaultdict
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import hm_data as H

ap = argparse.ArgumentParser(); ap.add_argument('--block', required=True, choices=list(H.BLOCKS))
ap.add_argument('--date', required=True); ap.add_argument('--extra', help='json list of rows drawn today not yet imported (jurisdiction,result_digits[,session])')
ap.add_argument('--cache'); ap.add_argument('--top', type=int, default=3); a = ap.parse_args()
D = a.date; PREV = (dt.date.fromisoformat(D) - dt.timedelta(1)).isoformat()
hist = H.histories(a.cache); snaps = H.snapshots(a.cache)
extra = json.load(open(a.extra)) if a.extra else []
for r in extra:
    r.setdefault('session', 'evening'); r['date_et'] = D; r['comboset_sorted'] = H.setof(r['result_digits'])
sess, pool, sboard = H.BLOCKS[a.block]

# boards
boards = {sc: sorted([p for p in snaps if p['date'] == D and p['scope'] == sc], key=lambda p: p['rank']) for sc in ('allday', sboard)}
if not boards['allday'] or not boards[sboard]: sys.exit(f"no live boards for {D} (allday={len(boards['allday'])}, {sboard}={len(boards[sboard])})")
cand = {}
for sc, ps in boards.items():
    for p in ps: cand.setdefault(p['set'], {'orders': {}, 'boards': []}); cand[p['set']]['orders'][sc] = p['order']; cand[p['set']]['boards'].append(f"{sc[:2].upper()}{p['rank']}")

# reference block for pair+digit (same convention as pd_early / pd_late)
byds = defaultdict(list)
for r in hist: byds[(r['date_et'], r['session'])].append(r)
ref = (byds[(PREV, 'midday')] + byds[(PREV, 'evening')]) if a.block == 'midday' else (byds[(PREV, 'evening')] + byds[(D, 'midday')] + extra)
pc = Counter(p for r in ref for p in H.pairs(r['result_digits'])); dc = Counter(ch for r in ref for ch in r['result_digits'])
SP = {cs: H.pairs(H.digs(cs)) for cs in H.ALLSETS}
def zstd(val):
    out = {}
    for k in (6, 3, 1):
        g = [c for c in H.ALLSETS if H.cls(c) == k]; mu = st.mean([val[c] for c in g]); sd = st.pstdev([val[c] for c in g]) or 1
        for c in g: out[c] = (val[c] - mu) / sd
    return out
zp = zstd({cs: sum(pc[p] for p in SP[cs]) for cs in H.ALLSETS}); zd = zstd({cs: sum(dc[ch] for ch in H.digs(cs)) for cs in H.ALLSETS})
z = {cs: zp[cs] + zd[cs] for cs in H.ALLSETS}

# drawn today (any session) incl. extra rows
today = byds[(D, 'midday')] + byds[(D, 'evening')] + extra
drawn_today = defaultdict(list)
for r in today: drawn_today[r['comboset_sorted']].append(f"{r['jurisdiction']} {r['result_digits']} {r['session'][:3]}")

# block stats through PREV (block = session x pool jurisdictions)
blk = [r for r in hist if H.in_block(r, a.block) and r['date_et'] <= PREV]
D60 = (dt.date.fromisoformat(PREV) - dt.timedelta(59)).isoformat(); D30 = (dt.date.fromisoformat(PREV) - dt.timedelta(29)).isoformat()
n, n60, n30 = len(blk), sum(r['date_et'] >= D60 for r in blk), sum(r['date_et'] >= D30 for r in blk)
sb = defaultdict(list)
for r in blk: sb[r['comboset_sorted']].append(r)
def bstat(cs):
    m = sb[cs]; k = H.cls(cs)
    c60 = sum(r['date_et'] >= D60 for r in m); c30 = sum(r['date_et'] >= D30 for r in m)
    oa = Counter(r['result_digits'] for r in m); o60 = Counter(r['result_digits'] for r in m if r['date_et'] >= D60)
    lead = max(oa, key=lambda o: (o60[o], oa[o])) if oa else None
    last = ' · '.join(f"{r['jurisdiction']} {r['result_digits']} {r['date_et'][5:]}" for r in m[-2:]) or 'never'
    return dict(all=len(m), e_all=n * k / 1000, c60=c60, e60=n60 * k / 1000, c30=c30, e30=n30 * k / 1000, lead=lead, o60=dict(o60.most_common(3)), oa=dict(oa.most_common(3)), last=last)

# block size for pricing = most recent same weekday's row count in this block
wd = dt.date.fromisoformat(D).weekday(); same_wd = sorted({r['date_et'] for r in blk if dt.date.fromisoformat(r['date_et']).weekday() == wd})
ndraws = len([r for r in blk if r['date_et'] == same_wd[-1]]) if same_wd else 0

rows = []
for cs, c in cand.items():
    b = bstat(cs); ov = len(c['orders']) == 2; orders = c['orders']
    if ov and len(set(orders.values())) == 1: straight = orders['allday']; why = 'both boards same order'
    elif b['lead'] in orders.values(): straight = b['lead']; why = 'posted order = block lead'
    else: straight = orders.get('allday') or next(iter(orders.values())); why = 'All-Day posted order'
    rows.append(dict(set=cs, drawn=cs in drawn_today, overlap=ov, z=z[cs], d60=b['c60'] - b['e60'], b=b, straight=straight, why=why, orders=orders, boards=c['boards']))
rows.sort(key=lambda r: (r['drawn'], not r['overlap'], -r['z'], -r['d60'], r['set']))

print(f"BOARD-LEAN · block {a.block} ({sess}{'' if pool is None else f', {len(pool)} jurisdictions'}) · target {D} · boards All-Day + {sboard}")
print(f"reference block for pair+digit: {len(ref)} draws ({'prev midday+evening' if a.block=='midday' else f'{PREV} evening {len(byds[(PREV,'evening')])} + {D} midday {len(byds[(D,'midday')])} + extra {len(extra)}'})"
      + ('  — PROVISIONAL (today midday not imported)' if a.block != 'midday' and not byds[(D, 'midday')] else ''))
print(f"block history 4/01→{PREV}: {n} draws (60d {n60}, 30d {n30}); last same-weekday block = {ndraws} draws → ${ndraws*0.25:.2f}/unit")
print(f"pair repeats ≥4: {[(p,c) for p,c in pc.most_common() if c>=4]} · digits: {dict(dc.most_common(5))}")
print(f"drawn today so far: {sum(1 for r in today)} rows, {len(drawn_today)} sets\n")
hdr = f"{'#':>2} {'set':8} {'cls':3} {'boards':12} {'P+D':>6} {'block all':>11} {'60d':>9} {'30d':>9}  straight (why)                 lead-order / last in block"
print(hdr); print('-' * len(hdr))
for i, r in enumerate(rows, 1):
    b = r['b']; k = {6: 'S', 3: 'D', 1: 'T'}[H.cls(r['set'])]
    flag = ' DRAWN TODAY ' + '; '.join(drawn_today[r['set']]) if r['drawn'] else ''
    ov = '*' if r['overlap'] else ' '
    print(f"{i:2} {r['set']:8} {k:3} {ov}{'+'.join(r['boards']):11} {r['z']:+6.2f} {b['all']:4}/{b['e_all']:6.1f} {b['c60']:3}/{b['e60']:5.1f} {b['c30']:3}/{b['e30']:5.1f}  {r['straight']} ({r['why']:<22}) lead {b['lead']} {b['o60'] or b['oa']} · {b['last']}{flag}")
print("\n* = on both boards.  Posted orders:", {r['set']: r['orders'] for r in rows})

# ── per-pair detail (operator ask 11/08: "more data points") ────────────────
srcs = {}
if a.block == 'midday': srcs = {'prev mid': byds[(PREV, 'midday')], 'prev eve': byds[(PREV, 'evening')]}
else: srcs = {'prev eve': byds[(PREV, 'evening')], 'today mid': byds[(D, 'midday')], 'early/extra': extra}
dpairs = lambda s: set(H.pairs(s))
src_cnt = {k: Counter(p for r in v for p in dpairs(r['result_digits'])) for k, v in srcs.items()}
blk60 = [r for r in blk if r['date_et'] >= D60]
pc60 = Counter(p for r in blk60 for p in dpairs(r['result_digits']))
pair_base = {True: 0.028, False: 0.054}  # P(draw contains doubled pair) / mixed pair
recent = [r for r in hist if r['date_et'] > (dt.date.fromisoformat(D) - dt.timedelta(7)).isoformat()] + extra
print("\nPER-PAIR DETAIL · reference counts by source · block 60d count vs expectation · 7-day national scan of the set")
for r in rows:
    cs = r['set']; parts = []
    for p in sorted(set(SP[cs])):
        dbl = p[0] == p[1]; e60 = len(blk60) * pair_base[dbl]
        src = ' '.join(f"{k.split()[0][:3]}{src_cnt[k][p]}" for k in srcs)
        parts.append(f"{p}: ref {sum(src_cnt[k][p] for k in srcs)} ({src}) · blk60 {pc60[p]}/{e60:.0f}")
    hits7 = [f"{x['jurisdiction']} {x['result_digits']} {x['date_et'][5:]}{x['session'][:1]}" for x in recent if x['comboset_sorted'] == cs]
    print(f"  {cs} {r['straight']}: " + ' | '.join(parts) + f" | 7d set draws: {', '.join(hits7) or 'none'}")

# loud universe
open_sets = [cs for cs in H.ALLSETS if cs not in drawn_today and H.cls(cs) > 1]
uni = sorted(open_sets, key=lambda cs: (-z[cs], cs))
loud = [cs for cs in uni[:3] if cs not in cand and bstat(cs)['c60'] >= bstat(cs)['e60']]
print(f"\nLOUD UNIVERSE (open universe top-3 by P+D, not on a board, block 60d ≥ expectation): {'none' if not loud else ''}")
for cs in loud:
    b = bstat(cs); print(f"   {cs} P+D {z[cs]:+.2f} (universe #{uni.index(cs)+1}) block {b['all']}/{b['e_all']:.1f} · 60d {b['c60']}/{b['e60']:.1f} · 30d {b['c30']}/{b['e30']:.1f} · lead {b['lead']} · last {b['last']}")
top = [r for r in rows if not r['drawn']][:a.top]
print(f"\nTOP {a.top} (undrawn, overlap first): " + ' · '.join(f"{r['straight']} S / {r['set']} B" for r in top))
