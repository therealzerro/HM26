#!/usr/bin/env python3
"""RESEARCH ONLY — consensus counting + grading over picks.csv (from parse_lp_pages.py).
Counting: a member counts ONCE per (date, state, session, combination) — exact-order
and box-set scored separately. Levels: L1 per (date,state,session); L2 per date across
states/sessions; L3 across the window. Pools: TOP-HOT = today's snapshot ONLY (never
graded: its ranking overlaps the window — selection bias); TOP-LIFE and ALL are graded.
A. consensus board per past date = top 6 box sets by L2 distinct members (ties → more
   distinct states → lower box set), graded vs every histories draw that date, null =
   STAT-01 composition-matched random boards (grade_boards.grade).
B. state-level agreement: (date,state,session) sets backed by ≥2 TOP-LIFE members (≥3 for
   ALL) vs that state's that-session draw; observed vs expected (.006/.003/.001 box, .001 exact).
C. coverage: LP state codes with picks that histories does not carry.
Usage: consensus.py picks.csv histories.json out_dir today=YYYY-MM-DD
Writes consensus_L1/L2/L3.csv (counts only, no member names), graded.json, today.json.
"""
import csv, json, os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grade_boards import grade, load_draws, P_BOX, set_digits

def cls_of(box): return 'sixway' if len(set(box)) == 3 else ('double' if len(set(box)) == 2 else 'triple')

def load_picks(path):
    rows = list(csv.DictReader(open(path)))
    uniq = {}
    for r in rows: uniq[(r['member'], r['pool'], r['date'], r['state'], r['session'], r['exact'])] = r
    return list(uniq.values())

def levels(rows, pool, key_fn):
    """distinct members / states / dates per (key, combo) for box and exact."""
    out = {}
    for kind in ('box', 'exact'):
        agg = defaultdict(lambda: {'members': set(), 'states': set(), 'dates': set()})
        for r in rows:
            if r['pool'] != pool: continue
            a = agg[(key_fn(r), r[kind])]; a['members'].add(r['member']); a['states'].add(r['state']); a['dates'].add(r['date'])
        out[kind] = {k: {'members': len(v['members']), 'states': len(v['states']), 'dates': len(v['dates'])} for k, v in agg.items()}
    return out

def write_level(path, data, keycols):
    with open(path, 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['pool', 'kind'] + keycols + ['combo', 'distinct_members', 'distinct_states', 'distinct_dates'])
        for pool, kinds in data.items():
            for kind, d in kinds.items():
                for (key, combo), v in sorted(d.items(), key=lambda kv: (-kv[1]['members'], -kv[1]['states'], kv[0])):
                    w.writerow([pool, kind] + list(key if isinstance(key, tuple) else (key,)) + [combo, v['members'], v['states'], v['dates']])

def board_for(l2_box, date):
    cands = [(v['members'], v['states'], combo) for (d, combo), v in l2_box.items() if d == date]
    cands.sort(key=lambda t: (-t[0], -t[1], t[2]))
    out = []; seen = set()
    for m, s, combo in cands:
        if combo in seen: continue
        seen.add(combo); out.append({'set': combo, 'order': combo, 'members': m, 'states': s})
        if len(out) == 6: break
    return out

def main(picks_csv, hist_json, out_dir, today):
    os.makedirs(out_dir, exist_ok=True)
    rows = load_picks(picks_csv); draws = load_draws(hist_json)
    past = [r for r in rows if r['date'] < today]; todays = [r for r in rows if r['date'] == today]
    L = {}
    for pool in ('TOP-LIFE', 'ALL'):
        L[pool] = {'L1': levels(past, pool, lambda r: (r['date'], r['state'], r['session'])),
                   'L2': levels(past, pool, lambda r: r['date']),
                   'L3': levels(past, pool, lambda r: 'window')}
    write_level(f'{out_dir}/consensus_L1.csv', {p: L[p]['L1'] for p in L}, ['date', 'state', 'session'])
    write_level(f'{out_dir}/consensus_L2.csv', {p: L[p]['L2'] for p in L}, ['date'])
    write_level(f'{out_dir}/consensus_L3.csv', {p: L[p]['L3'] for p in L}, ['window'])
    result = {'A': {}, 'B': {}, 'C': {}}
    for pool in ('TOP-LIFE', 'ALL'):
        boards = {d: board_for(L[pool]['L2']['box'], d) for d in sorted({r['date'] for r in past})}
        boards = {d: b for d, b in boards.items() if len(b) == 6 and d in draws}
        result['A'][pool] = grade(boards, draws) if boards else {'note': 'no complete boards'}
        result['A'][pool]['boards'] = {d: ' '.join(f"{p['set']}×{p['members']}" for p in b) for d, b in boards.items()}
        # B — state-level agreement
        thr = 2 if pool == 'TOP-LIFE' else 3
        obs_b = obs_e = 0; exp_b = exp_e = 0.0; n = 0
        for (key, combo), v in L[pool]['L1']['box'].items():
            if v['members'] < thr: continue
            d, st, sess = key; n += 1
            dr = [x for x in draws.get(d, []) if x['jurisdiction'] == st and x['session'] == sess]
            exp_b += P_BOX[cls_of(combo)] * len(dr)
            obs_b += sum(set_digits(x['comboset_sorted']) == combo for x in dr)
        for (key, combo), v in L[pool]['L1']['exact'].items():
            if v['members'] < thr: continue
            d, st, sess = key
            dr = [x for x in draws.get(d, []) if x['jurisdiction'] == st and x['session'] == sess]
            exp_e += .001 * len(dr); obs_e += sum(x['result_digits'] == combo for x in dr)
        result['B'][pool] = {'threshold_members': thr, 'agreement_cells': n, 'box_obs': obs_b, 'box_exp': round(exp_b, 2), 'exact_obs': obs_e, 'exact_exp': round(exp_e, 2)}
    hist_j = {x['jurisdiction'] for d in draws for x in draws[d]}
    lp_states = {r['state'] for r in rows}
    result['C'] = {'lp_codes_seen': sorted(lp_states), 'histories_codes': sorted(hist_j),
                   'lp_codes_not_in_histories': sorted(lp_states - hist_j),
                   'picks_ungradeable': sum(r['state'] not in hist_j for r in past)}
    json.dump(result, open(f'{out_dir}/graded.json', 'w'), indent=1, default=str)
    tod = {}
    for pool in ('TOP-HOT', 'TOP-LIFE', 'ALL'):
        l2 = levels(todays, pool, lambda r: r['date'])['box']
        tod[pool] = board_for(l2, today)
    json.dump(tod, open(f'{out_dir}/today.json', 'w'), indent=1)
    print(json.dumps({'A': {p: {k: v for k, v in result['A'][p].items() if k not in ('per_date', 'boards')} for p in result['A']}, 'B': result['B'], 'C': result['C']}, indent=1, default=str))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split('=')[-1])
