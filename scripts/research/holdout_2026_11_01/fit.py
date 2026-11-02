import csv, sys, numpy as np, itertools, datetime as dt
from collections import defaultdict
from scipy.optimize import minimize
rng = np.random.default_rng(7)
path = sys.argv[1]
rows = []
with open(path) as f:
    for r in csv.DictReader(f):
        if r['date_et'] < '2026-04-01': continue
        if len(r['result_digits']) != 3: continue
        rows.append((r['date_et'], 0 if r['session']=='midday' else 1, r['jurisdiction'], r['result_digits'], r['comboset_sorted']))
rows.sort()
# universe of 220 sets
sets = sorted({''.join(sorted(d)) for d in (f'{i:03d}' for i in range(1000))})
sidx = {s:i for i,s in enumerate(sets)}
def setkey(cs): return ''.join(ch for ch in cs if ch.isdigit())
kls = np.array([len(set(s)) for s in sets])  # 3 singles,2 doubles,1 triples
perms = np.where(kls==3, 6, np.where(kls==2, 3, 1))
# pairs (55 keys incl same-digit) and digits
pairs = sorted({''.join(sorted(p)) for s in (f'{i:03d}' for i in range(1000)) for p in itertools.combinations(s,2)})
pidx = {p:i for i,p in enumerate(pairs)}
set_pairs = [[pidx[''.join(sorted(p))] for p in itertools.combinations(s,2)] for s in sets]
set_digits = [[int(c) for c in s] for s in sets]
# sessions
sess_keys = sorted({(d,s) for d,s,*_ in rows})
skey = {k:i for i,k in enumerate(sess_keys)}
NS, NC = len(sess_keys), len(sets)
C = np.zeros((NS, NC), dtype=np.int32); P = np.zeros((NS, 55), dtype=np.int32); D = np.zeros((NS, 10), dtype=np.int32); N = np.zeros(NS, dtype=np.int32)
jurs = sorted({r[2] for r in rows}); jidx = {j:i for i,j in enumerate(jurs)}
CJ = np.zeros((len(jurs), NS, NC), dtype=np.int16)
for d,s,j,dig,cs in rows:
    si = skey[(d,s)]; ci = sidx[setkey(cs)]
    C[si,ci] += 1; N[si] += 1; CJ[jidx[j], si, ci] += 1
    for p in itertools.combinations(dig,2): P[si, pidx[''.join(sorted(p))]] += 1
    for ch in dig: D[si, int(ch)] += 1
def win(M, k):
    cum = np.vstack([np.zeros((1,M.shape[1]), M.dtype), np.cumsum(M, axis=0)])
    # strictly before session s: cum[s] - cum[max(s-k,0)]
    out = np.empty_like(M, dtype=np.float64)
    for s in range(M.shape[0]):
        out[s] = cum[s] - cum[max(s-k,0)]
    return out
Nw = lambda k: np.array([N[max(s-k,0):s].sum() for s in range(NS)], dtype=np.float64)
C60, C120, C180, Call = win(C,60), win(C,120), win(C,180), win(C,10**6)
N60, N120, N180, Nall = Nw(60), Nw(120), Nw(180), Nw(10**6)
P120 = win(P,120); D60 = win(D,60)
pair_str = np.zeros((NS,NC)); dig_str = np.zeros((NS,NC))
for ci in range(NC):
    pair_str[:,ci] = P120[:, set_pairs[ci]].sum(1) / np.maximum(N120,1)
    dig_str[:,ci] = D60[:, set_digits[ci]].sum(1) / np.maximum(N60,1)
# gap in sessions since last draw (national), prev-session indicator
gap = np.zeros((NS,NC)); last = np.full(NC, -1)
for s in range(NS):
    gap[s] = np.where(last>=0, s-last, 200)
    last = np.where(C[s]>0, s, last)
prev1 = np.vstack([np.zeros((1,NC)), (C[:-1]>0)])
prev3 = win((C>0).astype(np.int32), 3)
dates = np.array([dt.date.fromisoformat(k[0]) for k in sess_keys])
dow = np.array([d.weekday() for d in dates]); sess_ev = np.array([k[1] for k in sess_keys])
Y = (C>0).astype(np.float64)
def feats(mask_sets):
    F = []
    names = ['rate60','rate120','rate180','rate_all','gap','log_gap','prev1','prev3','pair120','dig60','pressure','is_double','is_triple','evening','logN']
    for s in range(NS):
        n = max(N[s],1)
        f = np.column_stack([
            C60[s]/max(N60[s],1)*1000, C120[s]/max(N120[s],1)*1000, C180[s]/max(N180[s],1)*1000, Call[s]/max(Nall[s],1)*1000,
            np.minimum(gap[s],200), np.log1p(gap[s]), prev1[s], prev3[s], pair_str[s]*1000, dig_str[s]*100,
            np.minimum(gap[s],200)*Call[s]/max(Nall[s],1)*1000,
            (kls==2).astype(float), (kls==1).astype(float), np.full(NC, sess_ev[s], float), np.full(NC, np.log(n))])
        F.append(f[mask_sets])
    return np.vstack(F), names
def auc(score, y):
    order = np.argsort(score); r = np.empty(len(score)); r[order] = np.arange(1,len(score)+1)
    # average ranks for ties
    _, inv, cnt = np.unique(score, return_inverse=True, return_counts=True)
    sums = np.bincount(inv, weights=r); r = (sums/cnt)[inv]
    npos = y.sum(); nneg = len(y)-npos
    return (r[y==1].sum() - npos*(npos+1)/2)/(npos*nneg)
def fit_logit(X, y, l2=1.0):
    mu, sd = X.mean(0), X.std(0)+1e-9; Z = (X-mu)/sd; Z = np.column_stack([np.ones(len(Z)), Z])
    def f(w):
        z = Z@w; p = 1/(1+np.exp(-z)); eps=1e-12
        ll = -(y*np.log(p+eps)+(1-y)*np.log(1-p+eps)).sum() + l2*(w[1:]**2).sum()/2
        g = Z.T@(p-y); g[1:] += l2*w[1:]
        return ll, g
    w = minimize(f, np.zeros(Z.shape[1]), jac=True, method='L-BFGS-B').x
    return lambda Xn: ((np.column_stack([np.ones(len(Xn)), (Xn-mu)/sd]))@w), w
train_s = np.array([(d>=dt.date(2026,5,1)) and (d<=dt.date(2026,8,31)) for d in dates])
test_s  = np.array([(d>=dt.date(2026,9,1)) and (d<=dt.date(2026,10,31)) for d in dates])
singles = kls==3
Xall, names = feats(np.ones(NC,bool)); yall = Y.reshape(-1)
sess_of_row = np.repeat(np.arange(NS), NC); set_of_row = np.tile(np.arange(NC), NS)
tr = train_s[sess_of_row]; te = test_s[sess_of_row]; sg = singles[set_of_row]
print(f'sessions {NS} ({train_s.sum()} train, {test_s.sum()} test); rows train {tr.sum()}, test {te.sum()}; draws train {N[train_s].sum()} test {N[test_s].sum()}')
print('\n== A. NATIONAL model (set drawn anywhere this session), singles only ==')
m = tr&sg; mt = te&sg
pred, w = fit_logit(Xall[m], yall[m])
print(f'logit all-features: train AUC {auc(pred(Xall[m]), yall[m]):.3f}  TEST AUC {auc(pred(Xall[mt]), yall[mt]):.3f}')
pred_te, _ = fit_logit(Xall[mt], yall[mt])
print(f'  (fit ON test, scored on test = in-sample ceiling): {auc(pred_te(Xall[mt]), yall[mt]):.3f}')
print('  coefficients (standardized):', ', '.join(f'{n} {c:+.3f}' for n,c in zip(names, w[1:])))
print('  single-feature TEST AUC (sign as-is):')
for i,n in enumerate(names[:11]):
    print(f'    {n:10s} train {auc(Xall[m][:,i], yall[m]):.3f}  test {auc(Xall[mt][:,i], yall[mt]):.3f}')
# top-6 per test session vs uniform
def topk_eval(scorefn, X, mask_sess, k=6, label=''):
    hits=0; exp=0.0; ns=0
    for s in np.where(mask_sess)[0]:
        idx = np.where(singles)[0]
        sc = scorefn(X[s*NC+idx]); top = idx[np.argsort(-sc)[:k]]
        hits += int((C[s, top]>0).sum()); exp += k*(1-(1-0.006)**N[s]); ns+=1
    print(f'  {label} top-{k} singles per session: {hits} hits vs {exp:.1f} uniform-expected over {ns} sessions ({hits/ns:.2f} vs {exp/ns:.2f} per session, lift x{hits/exp:.2f})')
topk_eval(pred, Xall, test_s, label='TEST (fit on train)')
topk_eval(pred, Xall, train_s, label='TRAIN (in-sample)')
topk_eval(lambda X: -X[:,4], Xall, test_s, label='TEST most-overdue')
topk_eval(lambda X: X[:,3], Xall, test_s, label='TEST highest all-time rate')
topk_eval(lambda X: X[:,0], Xall, test_s, label='TEST highest 60-session rate')
topk_eval(lambda X: rng.random(len(X)), Xall, test_s, label='TEST random control')
print('\n== B. STATE model (set drawn in jurisdiction j this session) ==')
# build rows for every (session, jurisdiction that drew that session)
drew = (CJ.sum(2)>0)  # J x NS
CJ60 = np.stack([win(CJ[j],60) for j in range(len(jurs))]); CJall = np.stack([win(CJ[j],10**6) for j in range(len(jurs))])
gapj = np.zeros((len(jurs),NS,NC))
for j in range(len(jurs)):
    last = np.full(NC,-1)
    for s in range(NS):
        gapj[j,s] = np.where(last>=0, s-last, 300); last = np.where(CJ[j,s]>0, s, last)
Xs=[]; ys=[]; sess_s=[]; 
for j in range(len(jurs)):
    for s in np.where(drew[j])[0]:
        nat = Xall[s*NC:(s+1)*NC]
        f = np.column_stack([nat[:, [0,3,4,8,11,12]], CJ60[j,s], CJall[j,s], np.minimum(gapj[j,s],300), np.log1p(gapj[j,s])])
        Xs.append(f); ys.append((CJ[j,s]>0).astype(float)); sess_s.append(np.full(NC, s))
Xs=np.vstack(Xs); ys=np.concatenate(ys); sess_s=np.concatenate(sess_s); sgs = np.tile(singles, len(ys)//NC)
trs = train_s[sess_s]&sgs; tes = test_s[sess_s]&sgs
snames = ['nat_rate60','nat_rate_all','nat_gap','nat_pair120','is_double','is_triple','state_c60','state_c_all','state_gap','state_log_gap']
preds, ws = fit_logit(Xs[trs], ys[trs])
print(f'rows train {trs.sum()} test {tes.sum()}; logit: train AUC {auc(preds(Xs[trs]), ys[trs]):.3f}  TEST AUC {auc(preds(Xs[tes]), ys[tes]):.3f}')
print('  coefficients:', ', '.join(f'{n} {c:+.3f}' for n,c in zip(snames, ws[1:])))
for i,n in enumerate(snames):
    if n.startswith('is_'): continue
    print(f'    {n:12s} train {auc(Xs[trs][:,i], ys[trs]):.3f}  test {auc(Xs[tes][:,i], ys[tes]):.3f}')
# top-1 per state-session: pick the single best set per state draw; hit rate vs 0.006
sc = preds(Xs); hits=0; n=0
for key in np.unique(sess_s[tes]):
    pass
# vectorized: group by (row block of NC)
blocks = len(ys)//NC
hits=0; n=0; hits_rand=0
for b in range(blocks):
    sl = slice(b*NC,(b+1)*NC)
    if not test_s[sess_s[b*NC]]: continue
    idx = np.where(singles)[0]; top = idx[np.argmax(sc[sl][idx])]
    hits += int(ys[sl][top]>0); n+=1
    hits_rand += int(ys[sl][rng.choice(idx)]>0)
print(f'  TEST top-1 set per state-draw: {hits} straight-set hits in {n} draws = {100*hits/n:.2f}% vs 0.60% uniform (random control {100*hits_rand/n:.2f}%)')
