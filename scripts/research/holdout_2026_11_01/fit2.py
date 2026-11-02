import csv, sys, numpy as np, itertools, datetime as dt
from scipy.optimize import minimize
exec(open(sys.argv[2]).read().split('train_s = np.array')[0].replace("path = sys.argv[1]", "path = sys.argv[1]"))  # reuse data prep from fit.py
train_s = np.array([(d>=dt.date(2026,5,1)) and (d<=dt.date(2026,8,31)) for d in dates])
test_s  = np.array([(d>=dt.date(2026,9,1)) and (d<=dt.date(2026,10,31)) for d in dates])
singles = kls==3; idxS = np.where(singles)[0]
Xall, names = feats(np.ones(NC,bool)); yall = Y.reshape(-1)
keep = [i for i,n in enumerate(names) if n not in ('evening','logN','is_double','is_triple')]
names2 = [names[i] for i in keep]
sess_of_row = np.repeat(np.arange(NS), NC); set_of_row = np.tile(np.arange(NC), NS)
tr = train_s[sess_of_row]&singles[set_of_row]; te = test_s[sess_of_row]&singles[set_of_row]
X2 = Xall[:, keep]
pred, w = fit_logit(X2[tr], yall[tr])
def within_auc(scorefn, mask_sess):
    vals=[]
    for s in np.where(mask_sess)[0]:
        sc = scorefn(X2[s*NC+idxS]); y = Y[s, idxS]
        if 0 < y.sum() < len(y): vals.append(auc(sc, y))
    return np.mean(vals)
print('== NATIONAL singles model, session-level features removed ==')
print(f'pooled AUC train {auc(pred(X2[tr]), yall[tr]):.3f} test {auc(pred(X2[te]), yall[te]):.3f}; WITHIN-SESSION mean AUC train {within_auc(pred, train_s):.3f} test {within_auc(pred, test_s):.3f}')
print('coefficients:', ', '.join(f'{n} {c:+.3f}' for n,c in zip(names2, w[1:])))
print('within-session mean AUC per feature (train / test):')
for i,n in enumerate(names2):
    print(f'   {n:10s} {within_auc(lambda X,i=i: X[:,i], train_s):.3f} / {within_auc(lambda X,i=i: X[:,i], test_s):.3f}')
def topk(scorefn, mask_sess, k=6):
    hits=0; exp=0.0
    for s in np.where(mask_sess)[0]:
        sc = scorefn(X2[s*NC+idxS]); top = idxS[np.argsort(-sc)[:k]]
        hits += int((C[s, top]>0).sum()); exp += k*(1-(1-0.006)**N[s])
    return hits, exp
# Monte Carlo noise band for random top-6
def mc(mask_sess, reps=2000, k=6):
    out=[]
    ss = np.where(mask_sess)[0]
    for _ in range(reps):
        h=0
        for s in ss:
            h += int((C[s, rng.choice(idxS, k, replace=False)]>0).sum())
        out.append(h)
    return np.mean(out), np.std(out)
mtr, sdtr = mc(train_s, 400); mte, sdte = mc(test_s, 400)
print(f'\nrandom top-6 reference: train {mtr:.1f} ± {sdtr:.1f}, test {mte:.1f} ± {sdte:.1f}')
print(f'{"ranking rule":34s} {"TRAIN hits/exp (z)":>22s} {"TEST hits/exp (z)":>22s}')
rules = [('logit fit on train', pred), ('most overdue (gap)', lambda X: X[:,names2.index('gap')]), ('least overdue', lambda X: -X[:,names2.index('gap')]),
 ('highest all-time rate', lambda X: X[:,names2.index('rate_all')]), ('lowest all-time rate', lambda X: -X[:,names2.index('rate_all')]),
 ('highest 60-session rate', lambda X: X[:,names2.index('rate60')]), ('lowest 60-session rate', lambda X: -X[:,names2.index('rate60')]),
 ('highest 180-session rate', lambda X: X[:,names2.index('rate180')]), ('pressure (gap x rate)', lambda X: X[:,names2.index('pressure')]),
 ('pair strength 120', lambda X: X[:,names2.index('pair120')]), ('digit strength 60', lambda X: X[:,names2.index('dig60')]),
 ('drawn last session', lambda X: X[:,names2.index('prev1')]+1e-6*X[:,names2.index('pair120')]), ('NOT drawn last 3 sessions, most overdue', lambda X: (X[:,names2.index('prev3')]==0)*X[:,names2.index('gap')])]
for name, fn in rules:
    h1,e1 = topk(fn, train_s); h2,e2 = topk(fn, test_s)
    print(f'{name:34s} {h1:4d}/{e1:6.1f} ({(h1-mtr)/sdtr:+.1f})      {h2:4d}/{e2:6.1f} ({(h2-mte)/sdte:+.1f})')
# rolling monthly: fit on all prior months (from May), test next month
print('\nrolling: fit on months ≤ M-1 (from May), test month M — logit top-6 hits/exp, and most-overdue top-6')
months = [(6,'Jun'),(7,'Jul'),(8,'Aug'),(9,'Sep'),(10,'Oct')]
for m, lab in months:
    trm = np.array([(d>=dt.date(2026,5,1)) and (d.month<m) for d in dates]); tem = np.array([d.month==m for d in dates])
    trr = trm[sess_of_row]&singles[set_of_row]
    p,_ = fit_logit(X2[trr], yall[trr])
    h,e = topk(p, tem); h2,e2 = topk(lambda X: X[:,names2.index('gap')], tem)
    print(f'   {lab}: logit {h}/{e:.1f}   most-overdue {h2}/{e2:.1f}   within-session AUC logit {within_auc(p, tem):.3f}')
