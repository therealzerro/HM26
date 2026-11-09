"""Landing tracker: does a pick draw the same day (D), or within D+1 / D+2?
Scores every board pick (slate_snapshots, all three scopes) and every operator
pick in docs/operator_picks.csv against histories; prints rates vs the exact
uniform expectation for the same draw windows, plus the OPEN RIDES (picks from
the last 3 days that have not landed yet).

  python3 scripts/picks/track_landings.py --to 2026-11-07 [--from 2026-04-18] [--cache DIR]

Expectation per pick = 1 - prod(1 - k/1000) over the draws in the window
(k = 6 single / 3 double / 1 triple); straight = 1 - prod(1 - 1/1000).
Only histories rows are used (never stored hit flags — BUG-162)."""
import argparse, csv, datetime as dt, math, sys
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import hm_data as H

ap = argparse.ArgumentParser(); ap.add_argument('--to', required=True); ap.add_argument('--from', dest='frm', default='2026-04-18')
ap.add_argument('--cache'); ap.add_argument('--operator', default=str(H.ROOT / 'docs/operator_picks.csv')); a = ap.parse_args()
hist = H.histories(a.cache); snaps = H.snapshots(a.cache)
byd = defaultdict(list)
for r in hist: byd[r['date_et']].append(r)
last_full = max(d for d in byd if byd[d])
def day(d, off): return (dt.date.fromisoformat(d) + dt.timedelta(off)).isoformat()

def land(cs, order, d0, horizon=2, block=None, box_only=False):
    """returns per-offset list of (box_rows, straight_rows) and p_box/p_str expectations"""
    out = []; pbox_miss = 1.0; pstr_miss = 1.0; k = H.cls(cs)
    for off in range(horizon + 1):
        d = day(d0, off); rows = byd.get(d, [])
        if off == 0 and block: rows = [r for r in rows if H.in_block(r, block)]
        if d > a.to: out.append(None); continue
        b = [r for r in rows if r['comboset_sorted'] == cs]; s = [] if box_only else [r for r in b if r['result_digits'] == order]
        pbox_miss *= (1 - k / 1000) ** len(rows); pstr_miss *= (1 - 1 / 1000) ** len(rows)
        out.append((b, s, 1 - pbox_miss, 1 - pstr_miss))
    return out

def summarize(title, picks):
    """picks: list of dicts(date,set,order,block or None)"""
    N = len(picks); print(f"\n{title}: {N} picks {a.frm}→{a.to}")
    if not N: return
    hdr = f"{'window':10} {'box n':>6} {'box exp':>8} {'z':>6} {'box %':>6} | {'str n':>6} {'str exp':>8} {'z':>6} {'str %':>6}"
    print(hdr); print('-' * len(hdr))
    for off, lab in ((0, 'same day'), (1, 'by D+1'), (2, 'by D+2')):
        bn = be = sn = se = 0; m = 0
        for p in picks:
            L = p['L']
            if len(L) <= off or L[off] is None: continue
            m += 1
            hit_b = any(L[o] and L[o][0] for o in range(off + 1)); hit_s = any(L[o] and L[o][1] for o in range(off + 1))
            bn += hit_b; sn += hit_s; be += L[off][2]; se += L[off][3]
        if not m: continue
        zb = (bn - be) / math.sqrt(be * (1 - be / m)) if be else 0; zs = (sn - se) / math.sqrt(se) if se else 0
        print(f"{lab:10} {bn:6} {be:8.1f} {zb:+6.2f} {100*bn/m:5.1f}% | {sn:6} {se:8.1f} {zs:+6.2f} {100*sn/m:5.1f}%   (n={m})")
    # first-landing offset split
    first = defaultdict(int)
    for p in picks:
        L = p['L']
        for o in range(3):
            if len(L) > o and L[o] and L[o][0]: first[o] += 1; break
        else: first['none'] += 1
    print(f"first box landing: same day {first[0]} · D+1 {first[1]} · D+2 {first[2]} · none within 2d {first['none']}")

# board picks
bp = []
for p in snaps:
    if not (a.frm <= p['date'] <= a.to): continue
    bp.append(dict(date=p['date'], scope=p['scope'], set=p['set'], order=p['order'], L=land(p['set'], p['order'], p['date'])))
for sc in ('midday', 'evening', 'allday'):
    summarize(f"BOARD PICKS · {sc} (same day = any draw that day; D+1/D+2 = any draw)", [p for p in bp if p['scope'] == sc])
summarize("BOARD PICKS · all three scopes", bp)

# operator picks
op = []
f = Path(a.operator)
if f.exists():
    for r in csv.DictReader(open(f)):
        if not r['date'] or not (a.frm <= r['date'] <= a.to): continue
        cs = r['set'] if r['set'].startswith('{') else H.setof(r['set']); order = r.get('order') or H.digs(cs)
        blk = r['block'] if r['block'] in H.BLOCKS else None
        op.append(dict(date=r['date'], set=cs, order=order, block=blk, typ=r.get('type',''), placed=r.get('placed', ''), L=land(cs, order, r['date'], block=blk, box_only=(r.get('type','').upper()=='B'))))
    summarize("OPERATOR PICKS · all rows (same day = the pick's own block; D+1/D+2 = any draw)", op)
    summarize("OPERATOR PICKS · placed only", [p for p in op if p['placed'].lower().startswith('y')])
    print("\nOPERATOR PICK DETAIL (newest first):")
    for p in sorted(op, key=lambda p: p['date'], reverse=True):
        cells = []
        for o, L in enumerate(p['L']):
            if L is None: cells.append(f"D+{o} —"); continue
            b, s, _, _ = L
            cells.append(f"D+{o} " + ('STRAIGHT ' + ','.join(r['jurisdiction'] for r in s) if s else 'box ' + ','.join(r['jurisdiction'] + ' ' + r['result_digits'] for r in b) if b else '·'))
        print(f"  {p['date']} {p['block'] or '-':8} {p['order']} {p['typ'] or ' '} {p['set']:8} placed={p['placed'] or '?':3} | " + ' | '.join(cells))
else:
    print(f"\n(no operator picks file at {f})")

# open rides: picks from the last 3 days (through --to) with no landing yet
print(f"\nOPEN RIDES as of {a.to} (histories complete through {last_full}): picks dated {day(a.to,-2)}→{a.to} with no box landing yet")
for p in sorted(bp + op, key=lambda p: (p['date'], p.get('scope') or p.get('block') or '')):
    if p['date'] < day(a.to, -2): continue
    if any(L and L[0] for L in p['L']): continue
    age = (dt.date.fromisoformat(a.to) - dt.date.fromisoformat(p['date'])).days
    print(f"  {p['date']} {(p.get('scope') or ('OP ' + (p.get('block') or ''))):10} {p['order']} {p['set']:8} day {age+1} of 3")
