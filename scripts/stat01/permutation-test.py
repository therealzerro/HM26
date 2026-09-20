#!/usr/bin/env python3
"""STAT-01 Phase 3 — composition-matched permutation test over STORED boards.

Reads ONLY docs/stat01/ledger.csv (frozen, sha256 ccf04b08…4e7525) for the
primary and secondaries, and docs/stat01/histories_snapshot.csv (frozen,
sha256 02abe5c8…9c00b) for DUE-01. Never the database. Spec:
docs/stat01/preregistration_v1.md (approved 2026-09-20 evening).

Usage: python3 scripts/stat01/permutation-test.py [--r 100000] [--sanity-runs 100]
Writes docs/stat01/phase3_result.json (+ sanity-null distributions as data).
"""
import argparse, csv, hashlib, itertools, json, sys, time, datetime as dt
from collections import defaultdict
import numpy as np

LEDGER = 'docs/stat01/ledger.csv'
HIST = 'docs/stat01/histories_snapshot.csv'
LEDGER_SHA = 'ccf04b08af359fdd910de55be00d5dbf27d25a102749e69f6ff819fbef4e7525'
HIST_SHA = '02abe5c8b76682fa8c34d657820d8af15f845698f29051c09a2a2b29cf29c00b'
SEED = 20260919
WIN = ('2026-04-18', '2026-09-19'); WIN2 = ('2026-07-23', '2026-09-19')
SCOPES = ['allday', 'midday', 'evening']

# ── 220 box classes: 0..119 six-way, 120..209 doubles, 210..219 triples ──────
def cls_key(digits):  # sorted-digit string
    return ''.join(sorted(digits))
CLASSES = []
for a, b, c in itertools.combinations('0123456789', 3): CLASSES.append(a + b + c)          # 120
for a in '0123456789':
    for b in '0123456789':
        if a != b: CLASSES.append(cls_key(a + a + b))                                        # 90 (dedupe below)
CLASSES = list(dict.fromkeys(CLASSES))
assert len(CLASSES) == 210
CLASSES += [d * 3 for d in '0123456789']                                                     # 10
assert len(CLASSES) == 220
CIDX = {k: i for i, k in enumerate(CLASSES)}
STRATA = {'sixway': (0, 120), 'double': (120, 90), 'triple': (210, 10)}
P_CLASS = np.array([6] * 120 + [3] * 90 + [1] * 10, dtype=float) / 1000.0
def stratum_of(i): return 'sixway' if i < 120 else ('double' if i < 210 else 'triple')
# orderings per class (padded to 6), for the straights secondary
PERMS = np.zeros((220, 6), dtype=np.int64); NPERM = np.zeros(220, dtype=np.int64)
for i, k in enumerate(CLASSES):
    ps = sorted(set(''.join(p) for p in itertools.permutations(k)))
    NPERM[i] = len(ps); PERMS[i, :len(ps)] = [int(p) for p in ps]; PERMS[i, len(ps):] = PERMS[i, 0]

def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

# ── Ledger → boards ──────────────────────────────────────────────────────────
class Boards:
    """Per board: classes (list of class idx), best-order ints, pool counts."""
    def __init__(self, rows, jur_index):
        by = defaultdict(list)
        for r in rows: by[(r['date'], r['scope'])].append(r)
        self.keys = sorted(by)
        B = len(self.keys); self.B = B
        self.dates = [k[0] for k in self.keys]; self.scopes = [k[1] for k in self.keys]
        self.date_idx = np.array([sorted(set(self.dates)).index(d) for d in self.dates])
        self.classes = []; self.orders = []
        self.counts = np.zeros((B, 220), dtype=np.int32)
        self.counts_ord = np.zeros((B, 1000), dtype=np.int32)
        J = len(jur_index); self.counts_j = np.zeros((B, 220, J), dtype=np.int16)
        self.n_draws = np.zeros(B, dtype=np.int64)
        for b, k in enumerate(self.keys):
            rs = by[k]; r0 = rs[0]
            combos = r0['board_combos'].split(); orders = r0['board_best_orders'].split()
            cl = [CIDX[cls_key(c)] for c in combos]
            assert len(set(cl)) == len(cl), f'duplicate class on board {k}'
            self.classes.append(cl); self.orders.append([int(o) for o in orders])
            comp = (sum(stratum_of(i) == 'sixway' for i in cl), sum(stratum_of(i) == 'double' for i in cl), sum(stratum_of(i) == 'triple' for i in cl))
            assert comp == (int(r0['n_sixway']), int(r0['n_double']), int(r0['n_triple'])), f'composition mismatch {k}'
            for r in rs:
                ci = CIDX[cls_key(r['winning_digits'])]
                self.counts[b, ci] += 1; self.counts_ord[b, int(r['winning_digits'])] += 1
                self.counts_j[b, ci, jur_index[r['jurisdiction']]] += 1
            self.n_draws[b] = len(rs)
        self.comp = np.array([[sum(stratum_of(i) == s for i in cl) for s in ('sixway', 'double', 'triple')] for cl in self.classes])
        self.scope_mask = {s: np.array([sc == s for sc in self.scopes]) for s in SCOPES}
        self.stratum_mean = np.stack([self.counts[:, o:o + n].mean(axis=1) for o, n in STRATA.values()], axis=1)  # (B,3)

    def observed(self):
        box = np.array([self.counts[b, cl].sum() for b, cl in enumerate(self.classes)])
        st = np.array([self.counts_ord[b, o].sum() for b, o in enumerate(self.orders)])
        return box, st
    def expected(self):  # analytic E[M_b] under the composition-matched null
        return (self.comp * self.stratum_mean).sum(axis=1)

# ── sampler: composition-matched replacement boards, without replacement within stratum ──
def sample_stratum(rng, n, size, K):
    B = len(n); m = int(n.max()) if len(n) else 0
    if m == 0: return np.zeros((K, B, 0), dtype=np.int64), np.zeros((K, B, 0), dtype=bool)
    valid = np.arange(m)[None, :] < n[:, None]                      # (B,m)
    sent = size + np.arange(m)                                       # distinct sentinels for padding
    idx = rng.integers(0, size, size=(K, B, m))
    idx = np.where(valid[None], idx, sent[None, None, :])
    while True:
        s = np.sort(idx, axis=2)
        dup = (s[:, :, 1:] == s[:, :, :-1]).any(axis=2)
        if not dup.any(): break
        kk, bb = np.nonzero(dup)
        new = rng.integers(0, size, size=(len(kk), m))
        idx[kk, bb] = np.where(valid[bb], new, sent[None, :])
    return idx, np.broadcast_to(valid[None], (K, B, m))

def null_chunk(rng, bd, K, want_straight=False, want_jur=False):
    """One chunk of K replicates. Returns per-board box matches M (K,B), straight matches (K,B) or None, per-jurisdiction sums (K,J) or None."""
    B = bd.B; M = np.zeros((K, B), dtype=np.int64)
    MS = np.zeros((K, B), dtype=np.int64) if want_straight else None
    MJ = np.zeros((K, bd.counts_j.shape[2]), dtype=np.int64) if want_jur else None
    bidx = np.arange(B)[None, :, None]
    for si, (name, (off, size)) in enumerate(STRATA.items()):
        n = bd.comp[:, si]
        if n.max() == 0: continue
        idx, valid = sample_stratum(rng, n, size, K)
        idx_c = np.where(valid, idx, 0)
        g = bd.counts[:, off:off + size][bidx, idx_c] * valid
        M += g.sum(axis=2)
        if want_straight:
            gi = off + idx_c
            o = rng.integers(0, 6, size=idx_c.shape) % NPERM[gi]
            ordered = PERMS[gi, o]
            MS += (bd.counts_ord[bidx, ordered] * valid).sum(axis=2)
        if want_jur:
            gj = bd.counts_j[:, off:off + size, :][bidx, idx_c]            # (K,B,m,J)
            MJ += (gj * valid[..., None]).sum(axis=(1, 2))
    return M, MS, MJ

def p_upper(stat_null, obs):  # one-sided, +1 correction
    return (1 + int((stat_null >= obs).sum())) / (len(stat_null) + 1)
def p_two(stat_null, obs):
    pu = p_upper(stat_null, obs); pl = (1 + int((stat_null <= obs).sum())) / (len(stat_null) + 1)
    return min(1.0, 2 * min(pu, pl))

def boot_lift(rng, obs_b, exp_b, date_idx, Bboot=10000):
    """Bootstrap over DATES of lift = Σobs/Σexp."""
    D = date_idx.max() + 1
    ob = np.bincount(date_idx, weights=obs_b, minlength=D); eb = np.bincount(date_idx, weights=exp_b, minlength=D)
    picks = rng.integers(0, D, size=(Bboot, D))
    lifts = ob[picks].sum(axis=1) / np.maximum(eb[picks].sum(axis=1), 1e-9)
    return float(np.percentile(lifts, 2.5)), float(np.percentile(lifts, 97.5))

def run_harness(bd, R, seed, chunk=500, want_straight=True, want_jur=True, log=None):
    rng = np.random.default_rng(seed)
    B = bd.B; obs_box, obs_st = bd.observed(); exp_b = bd.expected()
    S_obs = int(obs_box.sum())
    Snull = np.zeros(R, dtype=np.int64); Snull_scope = {s: np.zeros(R, dtype=np.int64) for s in SCOPES}
    Snull_st = np.zeros(R, dtype=np.int64); Snull_st_scope = {s: np.zeros(R, dtype=np.int64) for s in SCOPES}
    days1 = {s: np.zeros(R, dtype=np.int64) for s in SCOPES}; anyday = np.zeros(R, dtype=np.int64)
    J = bd.counts_j.shape[2]; Sj = np.zeros((R, J), dtype=np.int64) if want_jur else None
    order = np.argsort(bd.date_idx, kind='stable'); starts = np.flatnonzero(np.r_[1, np.diff(bd.date_idx[order])])
    t0 = time.time()
    for c0 in range(0, R, chunk):
        K = min(chunk, R - c0); M, MS, MJ = null_chunk(rng, bd, K, want_straight, want_jur)
        Snull[c0:c0 + K] = M.sum(axis=1)
        hit = M > 0
        for s in SCOPES:
            mk = bd.scope_mask[s]; Snull_scope[s][c0:c0 + K] = M[:, mk].sum(axis=1); days1[s][c0:c0 + K] = hit[:, mk].sum(axis=1)
        anyday[c0:c0 + K] = np.maximum.reduceat(hit[:, order].astype(np.int8), starts, axis=1).sum(axis=1)
        if want_straight:
            Snull_st[c0:c0 + K] = MS.sum(axis=1)
            for s in SCOPES: Snull_st_scope[s][c0:c0 + K] = MS[:, bd.scope_mask[s]].sum(axis=1)
        if want_jur: Sj[c0:c0 + K] = MJ
        if log and (c0 // chunk) % 40 == 0: log(f'  replicates {c0 + K}/{R}  {time.time() - t0:.0f}s')
    out = dict(R=R, seed=seed, S_obs=S_obs, S_null_mean=float(Snull.mean()), S_null_sd=float(Snull.std()), E_analytic=float(exp_b.sum()),
               p_one_sided=p_upper(Snull, S_obs), p_one_sided_R10k=p_upper(Snull[:10000], S_obs) if R >= 10000 else None,
               lift=S_obs / Snull.mean(), lift_ci95_dates=boot_lift(rng, obs_box, exp_b, bd.date_idx),
               excess_matches=S_obs - float(Snull.mean()), graded_draws=int(bd.n_draws.sum()),
               per_1000_draws_obs=1000 * S_obs / bd.n_draws.sum(), per_1000_draws_null=1000 * float(Snull.mean()) / bd.n_draws.sum(),
               null_quantiles={q: float(np.percentile(Snull, q)) for q in (1, 5, 25, 50, 75, 95, 99)})
    sec = {}
    for s in SCOPES:
        mk = bd.scope_mask[s]; o = int(obs_box[mk].sum()); nl = Snull_scope[s]
        sec[s] = dict(boards=int(mk.sum()), S_obs=o, null_mean=float(nl.mean()), lift=o / nl.mean(), lift_ci95_dates=boot_lift(rng, obs_box[mk], exp_b[mk], bd.date_idx[mk]), p_two_sided=p_two(nl, o))
    st_o = int(obs_st.sum()); exp_st = bd.comp[:, 0] * bd.counts_ord.sum(axis=1) / 1000.0 + bd.comp[:, 1] * bd.counts_ord.sum(axis=1) / 1000.0 + bd.comp[:, 2] * bd.counts_ord.sum(axis=1) / 1000.0
    sec['straights_all_boards'] = dict(S_obs=st_o, null_mean=float(Snull_st.mean()), lift=(st_o / Snull_st.mean()) if want_straight else None, lift_ci95_dates=boot_lift(rng, obs_st, exp_st, bd.date_idx) if want_straight else None, p_two_sided=p_two(Snull_st, st_o) if want_straight else None,
                                       per_scope={s: dict(S_obs=int(obs_st[bd.scope_mask[s]].sum()), null_mean=float(Snull_st_scope[s].mean()), p_two_sided=p_two(Snull_st_scope[s], int(obs_st[bd.scope_mask[s]].sum()))) for s in SCOPES})
    d1 = {}
    for s in SCOPES:
        mk = bd.scope_mask[s]; o = int((obs_box[mk] > 0).sum()); nl = days1[s]
        d1[s] = dict(boards=int(mk.sum()), obs_days=o, null_mean=float(nl.mean()), lift=o / nl.mean(), p_two_sided=p_two(nl, o))
    D = bd.date_idx.max() + 1; any_obs = int(len(set(bd.date_idx[obs_box > 0])))
    d1['any_board_per_calendar_day'] = dict(dates=int(D), obs_days=any_obs, null_mean=float(anyday.mean()), lift=any_obs / anyday.mean(), p_two_sided=p_two(anyday, any_obs))
    sec['days_with_ge1_match'] = d1
    return out, sec, Sj, Snull

def per_jurisdiction(bd, Sj, jurs, obs_rows_by_j):
    res = []; ps = []
    for j, code in enumerate(jurs):
        o = obs_rows_by_j[code]; nl = Sj[:, j]; p = p_two(nl, o); ps.append(p)
        res.append(dict(jurisdiction=code, S_obs=int(o), null_mean=float(nl.mean()), lift=(o / nl.mean()) if nl.mean() > 0 else None, p_two_sided=p))
    # Benjamini–Hochberg q = 0.05
    m = len(ps); idx = np.argsort(ps); thresh = 0.05 * (np.arange(1, m + 1) / m); passed = np.array(ps)[idx] <= thresh
    kmax = int(np.flatnonzero(passed).max() + 1) if passed.any() else 0
    sig = set(idx[:kmax].tolist())
    for j, r in enumerate(res): r['bh_significant_q05'] = j in sig
    return dict(m=m, bh_q=0.05, significant=[res[j]['jurisdiction'] for j in sorted(sig)], min_p=float(min(ps)), table=sorted(res, key=lambda r: r['p_two_sided']))

# ── DUE-01 ───────────────────────────────────────────────────────────────────
def due01(hist_rows, window, seed, Bboot=10000):
    rng = np.random.default_rng(seed)
    dates_all = sorted(set(r['date_et'] for r in hist_rows))
    d0 = dt.date.fromisoformat(dates_all[0])
    def dn(s): return (dt.date.fromisoformat(s) - d0).days
    win = [d for d in dates_all if window[0] <= d <= window[1]]
    out = {}
    pooled = {}
    for scope in SCOPES:
        rows = [r for r in hist_rows if scope == 'allday' or r['session'] == scope]
        by_date = defaultdict(list)
        for r in rows: by_date[r['date_et']].append(CIDX[cls_key(r['result_digits'])])
        last = np.full(220, -10**6, dtype=np.int64)  # last appearance day-number
        obs = {st: np.zeros((len(win), 12)) for st in STRATA}; exp = {st: np.zeros((len(win), 12)) for st in STRATA}  # 10 deciles + unseen(10) + ds>=100(11)
        cells_ge100 = {st: 0 for st in STRATA}
        wi = 0
        for d in dates_all:
            n = dn(d)
            if d in win:
                ds = np.where(last > -10**6, n - last, -1)  # -1 = unseen as of d-1
                draws = by_date.get(d, [])
                nd = len(draws)
                drawn = np.bincount(draws, minlength=220) if nd else np.zeros(220, dtype=np.int64)
                for st, (off, size) in STRATA.items():
                    sl = slice(off, off + size); dss = ds[sl]; seen = np.flatnonzero(dss >= 0)
                    # rank seen classes: most overdue first; ties by class key (index)
                    orderk = seen[np.lexsort((seen, -dss[seen]))]
                    dec = np.full(size, 10)  # 10 = unseen bin
                    if len(orderk):
                        edges = np.linspace(0, len(orderk), 11).round().astype(int)
                        for k in range(10): dec[orderk[edges[k]:edges[k + 1]]] = k
                    for k in range(11):
                        mk = dec == k
                        obs[st][wi, k] += drawn[sl][mk].sum(); exp[st][wi, k] += nd * P_CLASS[sl][mk].sum()
                    ge = dss >= 100; cells_ge100[st] += int(ge.sum())
                    obs[st][wi, 11] += drawn[sl][ge].sum(); exp[st][wi, 11] += nd * P_CLASS[sl][ge].sum()
                wi += 1
            for c in by_date.get(d, []): last[c] = max(last[c], n)  # update AFTER grading d (as-of d-1 rule)
        res = {}
        for st in STRATA:
            picks = rng.integers(0, len(win), size=(Bboot, len(win)))
            rows_out = []
            for k, label in [(k, f'D{k + 1}') for k in range(10)] + [(10, 'unseen as of d-1'), (11, 'engine threshold DS>=100')]:
                o = obs[st][:, k].sum(); e = exp[st][:, k].sum()
                bl = obs[st][picks, k].sum(axis=1) / np.maximum(exp[st][picks, k].sum(axis=1), 1e-9)
                rows_out.append(dict(bin=label, observed=int(o), expected=round(float(e), 2), lift=(round(float(o / e), 4) if e > 0 else None),
                                     ci95=[round(float(np.percentile(bl, 2.5)), 4), round(float(np.percentile(bl, 97.5)), 4)] if e > 0 else None))
            res[st] = dict(rows=rows_out, cells_ds_ge100=cells_ge100[st])
            pooled.setdefault(st, []).append((obs[st], exp[st]))
        out[scope] = dict(dates=len(win), graded_draws=int(sum(len(by_date.get(d, [])) for d in win)), strata=res)
    # pooled across scopes (sum obs/exp per date across the three scope series; bootstrap over dates)
    pres = {}
    for st, lst in pooled.items():
        O = sum(o for o, e in lst); E = sum(e for o, e in lst)
        picks = rng.integers(0, O.shape[0], size=(Bboot, O.shape[0])); rows_out = []
        for k, label in [(k, f'D{k + 1}') for k in range(10)] + [(10, 'unseen as of d-1'), (11, 'engine threshold DS>=100')]:
            o = O[:, k].sum(); e = E[:, k].sum(); bl = O[picks, k].sum(axis=1) / np.maximum(E[picks, k].sum(axis=1), 1e-9)
            rows_out.append(dict(bin=label, observed=int(o), expected=round(float(e), 2), lift=(round(float(o / e), 4) if e > 0 else None), ci95=[round(float(np.percentile(bl, 2.5)), 4), round(float(np.percentile(bl, 97.5)), 4)] if e > 0 else None))
        pres[st] = dict(rows=rows_out)
    out['pooled_three_scopes'] = pres
    out['note'] = 'D1 = most overdue decile (largest draws-since), D10 = least; deciles formed within stratum over classes seen as-of d-1; unseen bin separate; DS>=100 = the live engine threshold (pressure_threshold=100, legacy curve peak). Times-drawn ranking not reconstructible as-of-date (no history stored) — not run (G8).'
    return out

# ── main ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--r', type=int, default=100000); ap.add_argument('--sanity-runs', type=int, default=100); ap.add_argument('--out', default='docs/stat01/phase3_result.json')
    a = ap.parse_args()
    log = lambda s: print(s, file=sys.stderr, flush=True)
    assert sha(LEDGER) == LEDGER_SHA, 'ledger hash mismatch — refusing to run'
    assert sha(HIST) == HIST_SHA, 'histories snapshot hash mismatch — refusing to run'
    rows = [r for r in csv.DictReader(open(LEDGER)) if r['excluded'] == '0']
    jurs = sorted(set(r['jurisdiction'] for r in rows)); jur_index = {j: i for i, j in enumerate(jurs)}
    bd = Boards(rows, jur_index)
    obs_box, obs_st = bd.observed()
    log(f'boards={bd.B} rows={len(rows)} S_obs(box)={obs_box.sum()} straights={obs_st.sum()} E_analytic={bd.expected().sum():.1f}')
    assert int(obs_box.sum()) == 632 and int(obs_st.sum()) == 110, 'S_obs does not reproduce the frozen ledger'
    result = dict(study='STAT-01', phase=3, run_at=dt.datetime.now(dt.timezone.utc).isoformat(), ledger_sha256=LEDGER_SHA, histories_snapshot_sha256=HIST_SHA, R=a.r, seed=SEED, rng='numpy default_rng (PCG64)')

    # ── 5. SANITY NULLS FIRST (reported as data before the real result is looked at) ──
    log('sanity (a): random-board input ×%d' % a.sanity_runs)
    pa = []
    for s in range(1, a.sanity_runs + 1):
        rb = np.random.default_rng(s)
        fake = Boards.__new__(Boards); fake.__dict__.update(bd.__dict__)
        cls = []
        for b in range(bd.B):
            picks = []
            for si, (st, (off, size)) in enumerate(STRATA.items()):
                n = int(bd.comp[b, si])
                if n: picks += (off + rb.choice(size, n, replace=False)).tolist()
            cls.append(picks)
        fake.classes = cls
        o, _, _, Snull = run_harness(fake, a.r, seed=SEED + s, want_straight=False, want_jur=False)
        pa.append(o['p_one_sided'])
        if s % 20 == 0: log(f'  run {s}: p={o["p_one_sided"]:.4f}')
    pa = np.array(pa)
    result['sanity_a_random_board_p_distribution'] = dict(runs=len(pa), seeds='1..N (board generation), null seed 20260919+s', min=float(pa.min()), median=float(np.median(pa)), max=float(pa.max()),
                                                          decile_histogram=np.histogram(pa, bins=np.linspace(0, 1, 11))[0].tolist(), ks_uniform_D=float(np.max(np.abs(np.sort(pa) - (np.arange(1, len(pa) + 1) / len(pa))))), p_values=[round(float(x), 5) for x in pa])
    # (b) self-test: each board replaced by itself → the null path grades our own boards
    log('sanity (b): self-test')
    self_M = np.array([bd.counts[b, cl].sum() for b, cl in enumerate(bd.classes)])
    R_b = a.r; Snull_b = np.full(R_b, int(self_M.sum()))
    result['sanity_b_self_test'] = dict(null_path_S_of_our_boards=int(self_M.sum()), equals_S_obs=bool(int(self_M.sum()) == int(obs_box.sum())), p_ge_rule=p_upper(Snull_b, int(obs_box.sum())), p_strict_rule=(1 + int((Snull_b > obs_box.sum()).sum())) / (R_b + 1), mid_p=0.5 * ((1 + int((Snull_b > obs_box.sum()).sum())) / (R_b + 1) + p_upper(Snull_b, int(obs_box.sum()))),
                                       note='S* ≡ S_obs by construction: the ≥ rule gives 1.0, the strict rule ≈0, the mid-p (ties counted half) is the ≈0.5 the pre-registration refers to. The substantive check is that the null-path grading of our own boards reproduces S_obs exactly.')
    # (c) planted edge
    log('sanity (c): planted edge')
    rc = np.random.default_rng(SEED); n_plant = int(round(0.05 * bd.B)); plant_b = rc.choice(bd.B, n_plant, replace=False)
    planted = Boards.__new__(Boards); planted.__dict__.update(bd.__dict__); pc = [list(c) for c in bd.classes]; injected_delta = 0
    for b in plant_b:
        pool = np.flatnonzero(bd.counts[b]); cand = [c for c in pool if c not in pc[b]]
        if not cand: continue
        c_new = int(rc.choice(cand)); pos = int(rc.integers(0, len(pc[b])))
        injected_delta += int(bd.counts[b, c_new] - bd.counts[b, pc[b][pos]]); pc[b][pos] = c_new
    planted.classes = pc
    planted.comp = np.array([[sum(stratum_of(i) == s for i in cl) for s in ('sixway', 'double', 'triple')] for cl in pc])
    oc, _, _, _ = run_harness(planted, a.r, seed=SEED, want_straight=False, want_jur=False)
    result['sanity_c_planted_edge'] = dict(boards_planted=int(n_plant), S_planted=oc['S_obs'], S_obs_original=int(obs_box.sum()), injected_extra_matches=injected_delta, injected_lift_analytic=oc['S_obs'] / oc['E_analytic'], recovered_lift=oc['lift'], recovered_lift_ci95=oc['lift_ci95_dates'], p_one_sided=oc['p_one_sided'], null_mean=oc['S_null_mean'])
    log(f'  planted: S={oc["S_obs"]} lift={oc["lift"]:.3f} p={oc["p_one_sided"]:.5f}')

    # ── 3/4. PRIMARY (once) + 6. secondaries ──
    log('PRIMARY run (R=%d, seed %d)' % (a.r, SEED))
    prim, sec, Sj, Snull = run_harness(bd, a.r, seed=SEED, log=log)
    obs_by_j = defaultdict(int)
    for r in rows: obs_by_j[r['jurisdiction']] += int(r['box_match'])
    sec['per_jurisdiction_box'] = per_jurisdiction(bd, Sj, jurs, obs_by_j)
    result['primary'] = prim; result['secondaries_primary_window'] = sec
    log(f'PRIMARY: S_obs={prim["S_obs"]} null mean={prim["S_null_mean"]:.1f} lift={prim["lift"]:.3f} CI={prim["lift_ci95_dates"]} p={prim["p_one_sided"]:.5f}')
    # secondary window 7/23→9/19
    rows2 = [r for r in rows if WIN2[0] <= r['date'] <= WIN2[1]]
    bd2 = Boards(rows2, jur_index)
    prim2, sec2, _, _ = run_harness(bd2, a.r, seed=SEED, want_jur=False, log=log)
    result['secondary_window_2026-07-23_to_09-19'] = dict(primary_statistic_descriptive=prim2, secondaries=sec2)
    # ── 7. DUE-01 ──
    log('DUE-01')
    hist = list(csv.DictReader(open(HIST)))
    result['due01'] = due01(hist, WIN, SEED)
    json.dump(result, open(a.out, 'w'), indent=1, default=float)
    log(f'wrote {a.out}')

if __name__ == '__main__':
    main()
