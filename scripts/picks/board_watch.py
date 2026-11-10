"""Day watch — the three boards against today's draws, and what carries into tomorrow (operator 11/10).

  python3 scripts/picks/board_watch.py --date 2026-11-10 [--extra rows.json] [--cache DIR]

Re-run after each import / paste (midday import, 8:24 early-13 paste, evening import). Prints:
  1. every pick on today's Midday / Evening / All-Day board: landed (state, digits, box / STRAIGHT) or open
  2. today's draw tally so far: pair repeats (distinct per draw), digit counts, sets drawn 2+ times
     — this IS tomorrow's reference block for `board_lean.py --block allday --date <tomorrow>`
  3. carry list: today's All-Day picks still open (ride day 2 tomorrow) with today's pair+digit score so far,
     plus open rides from the previous two days' All-Day boards (day 3 / day 2 tomorrow)
  4. board persistence 4/18→yesterday: how often an All-Day pick is on the next day's All-Day board,
     split by whether its set drew that day (what tomorrow's pool usually keeps)
`--extra` = JSON list of rows drawn today not yet imported (jurisdiction, result_digits[, session]).
Rates from `histories` only (BUG-162).
"""
import argparse, datetime as dt, json, statistics as st, sys
from collections import Counter, defaultdict
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import hm_data as H

ap = argparse.ArgumentParser(); ap.add_argument('--date', required=True); ap.add_argument('--extra'); ap.add_argument('--cache'); a = ap.parse_args()
D = a.date; day = lambda n: (dt.date.fromisoformat(D) + dt.timedelta(n)).isoformat()
hist = H.histories(a.cache); snaps = H.snapshots(a.cache)
extra = json.load(open(a.extra)) if a.extra else []
for r in extra: r.setdefault('session', 'evening'); r['date_et'] = D; r['comboset_sorted'] = H.setof(r['result_digits'])
have = {(r['date_et'], r['session'], r['jurisdiction'], r['result_digits']) for r in hist}
hist = hist + [r for r in extra if (r['date_et'], r['session'], r['jurisdiction'], r['result_digits']) not in have]
byd = defaultdict(list)
for r in hist: byd[r['date_et']].append(r)
today = byd[D]; nm = sum(r['session'] == 'midday' for r in today); ne = len(today) - nm
board = lambda d, sc: sorted([p for p in snaps if p['date'] == d and p['scope'] == sc], key=lambda p: p['rank'])
def land(p, rows):
    m = [r for r in rows if r['comboset_sorted'] == p['set']]
    return ', '.join(f"{r['jurisdiction']} {r['result_digits']} {r['session'][:3]}{' STRAIGHT' if r['result_digits'] == p['order'] else ''}" for r in m)

print(f"DAY WATCH · {D} · draws in so far: midday {nm} + evening {ne} = {len(today)}" + (f" (incl. {len(extra)} pasted)" if extra else ''))
for sc in ('allday', 'midday', 'evening'):
    rows = today if sc == 'allday' else [r for r in today if r['session'] == sc]
    b = board(D, sc); hit = sum(bool(land(p, rows)) for p in b)
    print(f"\n{sc.upper()} board — {hit} of {len(b)} landed" + ('' if rows else ' (no draws in yet)'))
    for p in b: print(f"  {p['rank']} {p['order']} {p['set']:8} {land(p, rows) or '· open'}")

# 2. today's tally = tomorrow's reference
pc = Counter(p for r in today for p in set(H.pairs(r['result_digits']))); dc = Counter(ch for r in today for ch in r['result_digits'])
sc_ = Counter(r['comboset_sorted'] for r in today)
print(f"\nTODAY'S TALLY ({len(today)} draws) — tomorrow's reference block")
print("  pairs ≥4:", ' · '.join(f"{p} ×{c}" for p, c in pc.most_common() if c >= 4) or 'none yet')
print("  digits:", ' · '.join(f"{d} ×{c}" for d, c in dc.most_common()) or 'none yet')
print("  sets drawn 2+:", ' · '.join(f"{s} ×{c}" for s, c in sc_.most_common() if c >= 2) or 'none')

# 3. carry list
SP = {cs: sorted(set(H.pairs(H.digs(cs)))) for cs in H.ALLSETS}
def zstd(val):
    out = {}
    for k in (6, 3, 1):
        g = [c for c in H.ALLSETS if H.cls(c) == k]; mu = st.mean([val[c] for c in g]); sd = st.pstdev([val[c] for c in g]) or 1
        for c in g: out[c] = (val[c] - mu) / sd
    return out
zp = zstd({cs: sum(pc[p] for p in SP[cs]) for cs in H.ALLSETS}); zd = zstd({cs: sum(dc[ch] for ch in H.digs(cs)) for cs in H.ALLSETS})
print("\nCARRY INTO TOMORROW — All-Day picks with no box landing yet (P+D = pair+digit z on today's draws so far)")
for back, lab in ((0, 'day 2 tomorrow'), (-1, 'day 3 tomorrow (final)')):
    d0 = day(back); rows = [r for r in hist if d0 <= r['date_et'] <= D]
    for p in board(d0, 'allday'):
        if land(p, rows): continue
        also = [f"{sc[:3]} {q['order']}" for sc in ('midday', 'evening') for q in board(D, sc) if q['set'] == p['set']]
        print(f"  {d0[5:]} All-Day #{p['rank']} {p['order']} {p['set']:8} P+D {zp[p['set']] + zd[p['set']]:+5.2f} · {lab}" + (f" · also on today's {', '.join(also)}" if also else ''))

# 4. persistence
dates = sorted({p['date'] for p in snaps if p['scope'] == 'allday' and p['date'] < D})
t = {True: [0, 0], False: [0, 0]}
for d0 in dates:
    d1 = (dt.date.fromisoformat(d0) + dt.timedelta(1)).isoformat(); nxt = {p['set'] for p in board(d1, 'allday')}
    if not nxt: continue
    drew = {r['comboset_sorted'] for r in byd[d0]}
    for p in board(d0, 'allday'): k = p['set'] in drew; t[k][0] += 1; t[k][1] += p['set'] in nxt
print(f"\nBOARD PERSISTENCE 4/18→{dates[-1] if dates else '—'} — an All-Day pick is on the NEXT day's All-Day board:")
for k, lab in ((False, 'set did not draw that day'), (True, 'set drew that day')):
    n, x = t[k]; print(f"  {lab}: {x} of {n} = {100 * x / n:.1f}%" if n else f"  {lab}: no rows")
print(f"\nTomorrow, after the Daily Workflow posts the boards:  python3 scripts/picks/board_lean.py --block allday --date {day(1)}")
