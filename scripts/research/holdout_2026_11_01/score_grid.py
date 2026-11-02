import csv, sys, glob, numpy as np
from collections import defaultdict
files = sys.argv[1:]
agg = defaultdict(lambda: dict(slates=0, hits=0, exp=0.0, shit=0, sexp=0.0, straights=0, sexp_str=0.0, rmexp=0.0))
for fp in files:
    for r in csv.DictReader(open(fp)):
        win = 'train' if r['date'] <= '2026-08-31' else 'test'
        n = int(r['results_in_scope'])
        for sc in (r['scope'], 'ALL'):
            a = agg[(r['config_name'], win, sc)]
            a['slates'] += 1; a['hits'] += int(r['total_hits']); a['exp'] += float(r['baseline_expected_pick_hits'])
            a['shit'] += 1 if int(r['total_hits'])>0 else 0; a['sexp'] += float(r['baseline_slate_prob'])
            a['straights'] += int(r['hits_straight']); a['sexp_str'] += 6*(1-(1-1/1000)**n)
            a['rmexp'] += float(r['rail_matched_expected_pick_hits'])
cfgs = sorted({k[0] for k in agg})
def row(c, w, sc):
    a = agg[(c,w,sc)]
    if a['slates']==0: return None
    return a
print(f"{'config':14s} | {'TRAIN pick lift':>15s} {'slate%/base%':>14s} {'str/exp':>9s} | {'TEST pick lift':>14s} {'slate%/base%':>14s} {'str/exp':>9s} | per-scope TEST pick lift mid/eve/all")
res=[]
for c in cfgs:
    tr, te = row(c,'train','ALL'), row(c,'test','ALL')
    if not tr or not te: continue
    ltr = tr['hits']/tr['exp']; lte = te['hits']/te['exp']
    ps = []
    for sc in ('midday','evening','allday'):
        a = row(c,'test',sc); ps.append(f"{a['hits']/a['exp']:.2f}" if a else '-')
    res.append((c, ltr, lte))
    print(f"{c:14s} | {ltr:6.3f} ({tr['hits']}/{tr['exp']:.0f}) {100*tr['shit']/tr['slates']:5.1f}/{100*tr['sexp']/tr['slates']:5.1f} {tr['straights']:3d}/{tr['sexp_str']:5.1f} | {lte:6.3f} ({te['hits']}/{te['exp']:.0f}) {100*te['shit']/te['slates']:5.1f}/{100*te['sexp']/te['slates']:5.1f} {te['straights']:3d}/{te['sexp_str']:5.1f} | {' / '.join(ps)}   slates {tr['slates']}/{te['slates']}")
if len(res)>2:
    from scipy.stats import spearmanr, pearsonr
    a = np.array([r[1] for r in res]); b = np.array([r[2] for r in res])
    print(f"\nconfigs {len(res)}: Spearman(train lift, test lift) = {spearmanr(a,b)[0]:+.2f}, Pearson {pearsonr(a,b)[0]:+.2f}")
    best = max(res, key=lambda r: r[1]); worst = min(res, key=lambda r: r[1])
    print(f"best on TRAIN = {best[0]} (train {best[1]:.3f} → test {best[2]:.3f}); worst on TRAIN = {worst[0]} ({worst[1]:.3f} → {worst[2]:.3f}); parity test = {[r[2] for r in res if r[0]=='parity']}")
