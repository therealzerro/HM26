#!/usr/bin/env python3
"""RESEARCH ONLY (2026-10-14, LP consensus scan). Not imported by anything; not wired
into any workflow. Grades six-combination boards against `histories` draws for the
same date (the All-Day pool: every draw that day), with the briefResolve law:
box = sorted set equals the draw's sorted set; straight = exact order equals
result_digits. Null = STAT-01 method: random boards of the SAME class composition
graded against the SAME draws (R replicates, without replacement within stratum).
Lift = observed / mean(null); 95% CI = bootstrap over DATES of the lift
(STAT-01 convention) plus the permutation p (two-sided, +1 corrected).

Usage: grade_boards.py --boards boards.json --histories histories.json [--r 10000] [--label X]
boards.json: {"YYYY-MM-DD": [{"set": "024", "order": "240"}, ...]}  (set = sorted digits)
histories.json: rows with date_et, jurisdiction, game, session, result_digits, comboset_sorted
Prints a JSON result + a per-date table.
"""
import argparse, itertools, json, re, sys
from collections import defaultdict
import numpy as np

CLASSES = [''.join(c) for c in itertools.combinations('0123456789', 3)]                 # 120 six-way
CLASSES += list(dict.fromkeys(''.join(sorted(a + a + b)) for a in '0123456789' for b in '0123456789' if a != b))  # 90 doubles
CLASSES += [d * 3 for d in '0123456789']                                                 # 10 triples
assert len(CLASSES) == 220
CIDX = {k: i for i, k in enumerate(CLASSES)}
STRATA = {'sixway': (0, 120), 'double': (120, 90), 'triple': (210, 10)}
P_BOX = {'sixway': .006, 'double': .003, 'triple': .001}

def stratum(ci): return 'sixway' if ci < 120 else ('double' if ci < 210 else 'triple')
def set_digits(s): return ''.join(sorted(re.findall(r'\d', s)))

def load_draws(path):
    """distinct draw events per date, production dedupe key (jurisdiction, game, date, session, digits)."""
    rows = json.load(open(path)); seen = set(); by = defaultdict(list)
    for r in rows:
        k = (r['jurisdiction'], r.get('game'), r['date_et'], r['session'], r['result_digits'])
        if k in seen: continue
        seen.add(k); by[r['date_et']].append(r)
    return by

def grade(boards, draws, r=10000, seed=20261014):
    rng = np.random.default_rng(seed)
    dates = sorted(d for d in boards if d in draws)
    obs_box = np.zeros(len(dates)); obs_str = np.zeros(len(dates)); exp_box = np.zeros(len(dates))
    null_box = np.zeros((r, len(dates))); null_str = np.zeros((r, len(dates)))
    per_date = []
    for di, d in enumerate(dates):
        picks = boards[d]; dr = draws[d]
        cnt = np.zeros(220); cnt_ord = np.zeros(1000)
        for x in dr:
            cnt[CIDX[set_digits(x['comboset_sorted'])]] += 1
            if re.fullmatch(r'\d{3}', x['result_digits'] or ''): cnt_ord[int(x['result_digits'])] += 1
        cls = [CIDX[set_digits(p['set'])] for p in picks]
        assert len(set(cls)) == len(cls), f'duplicate class on board {d}'
        ob = cnt[cls].sum(); os_ = sum(cnt_ord[int(p['order'])] for p in picks if re.fullmatch(r'\d{3}', p.get('order') or ''))
        obs_box[di] = ob; obs_str[di] = os_
        comp = {s: sum(stratum(c) == s for c in cls) for s in STRATA}
        # analytic expectation under composition-matched null = Σ_s n_s · mean class count in stratum s
        exp_box[di] = sum(n * cnt[o:o + z].mean() for (s, n), (o, z) in zip(comp.items(), STRATA.values()))
        # replicates
        nb = np.zeros(r); ns = np.zeros(r)
        for s, n in comp.items():
            if n == 0: continue
            o, z = STRATA[s]
            idx = np.array([rng.choice(z, size=n, replace=False) for _ in range(r)]) + o      # (r, n)
            nb += cnt[idx].sum(axis=1)
            # straight: random ordering of each sampled class
            for j in range(n):
                perms = [sorted(set(''.join(p) for p in itertools.permutations(CLASSES[c]))) for c in idx[:, j]]
                ordered = np.array([int(ps[rng.integers(len(ps))]) for ps in perms])
                ns += cnt_ord[ordered]
        null_box[:, di] = nb; null_str[:, di] = ns
        per_date.append({'date': d, 'draws': len(dr), 'board': ' '.join(p['order'] for p in picks),
                         'comp': f"{comp['sixway']}/{comp['double']}/{comp['triple']}", 'box': int(ob), 'exp_box': round(float(exp_box[di]), 3), 'straight': int(os_),
                         'matched': ' '.join(sorted({set_digits(x['comboset_sorted']) + ':' + x['jurisdiction'] + '-' + x['session'][0] for x in dr if CIDX[set_digits(x['comboset_sorted'])] in cls}))})
    S_obs = obs_box.sum(); S_null = null_box.sum(axis=1)
    lift = S_obs / S_null.mean() if S_null.mean() > 0 else float('nan')
    p_two = min(1.0, 2 * min((1 + (S_null >= S_obs).sum()) / (r + 1), (1 + (S_null <= S_obs).sum()) / (r + 1)))
    # bootstrap over dates of Σobs/Σexp (STAT-01 convention)
    D = len(dates); pk = rng.integers(0, D, size=(10000, D))
    bl = obs_box[pk].sum(axis=1) / np.maximum(exp_box[pk].sum(axis=1), 1e-9)
    ci = (float(np.percentile(bl, 2.5)), float(np.percentile(bl, 97.5)))
    T_obs = obs_str.sum(); T_null = null_str.sum(axis=1)
    lift_s = T_obs / T_null.mean() if T_null.mean() > 0 else float('nan')
    p_s = min(1.0, 2 * min((1 + (T_null >= T_obs).sum()) / (r + 1), (1 + (T_null <= T_obs).sum()) / (r + 1)))
    days_any = int((obs_box > 0).sum()); days_any_null = float((null_box > 0).sum(axis=1).mean())
    return {'dates': D, 'draw_events': int(sum(len(draws[d]) for d in dates)), 'R': r,
            'box_obs': int(S_obs), 'box_null_mean': round(float(S_null.mean()), 2), 'box_null_sd': round(float(S_null.std()), 2),
            'box_lift': round(float(lift), 3), 'box_lift_ci95_boot_dates': [round(ci[0], 3), round(ci[1], 3)], 'box_p_two_sided': round(float(p_two), 4),
            'straight_obs': int(T_obs), 'straight_null_mean': round(float(T_null.mean()), 2), 'straight_lift': round(float(lift_s), 3), 'straight_p_two_sided': round(float(p_s), 4),
            'days_with_any_box_match': days_any, 'days_with_any_box_match_null_mean': round(days_any_null, 2),
            'per_date': per_date}

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--boards', required=True); ap.add_argument('--histories', required=True)
    ap.add_argument('--r', type=int, default=10000); ap.add_argument('--label', default='boards'); ap.add_argument('--out')
    a = ap.parse_args()
    res = grade(json.load(open(a.boards)), load_draws(a.histories), r=a.r); res['label'] = a.label
    if a.out: json.dump(res, open(a.out, 'w'), indent=1)
    pd = res.pop('per_date'); print(json.dumps(res, indent=1))
    for row in pd: print(row['date'], row['draws'], row['comp'], row['board'], 'box', row['box'], 'exp', row['exp_box'], 'str', row['straight'], row['matched'])
