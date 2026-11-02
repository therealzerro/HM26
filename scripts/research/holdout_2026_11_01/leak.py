import sys, numpy as np, datetime as dt
exec(open(sys.argv[2]).read().split('train_s = np.array')[0])
train_s = np.array([(d>=dt.date(2026,5,1)) and (d<=dt.date(2026,8,31)) for d in dates])
test_s  = np.array([(d>=dt.date(2026,9,1)) and (d<=dt.date(2026,10,31)) for d in dates])
singles = kls==3; idxS = np.where(singles)[0]
tot = C.sum(0).astype(float)  # whole-period count 4/01-10/31 (includes the target sessions = LEAK)
def topk(score, mask, k=6):
    h=0; e=0.0
    for s in np.where(mask)[0]:
        top = idxS[np.argsort(-score[idxS])[:k]]; h += int((C[s,top]>0).sum()); e += k*(1-(1-0.006)**N[s])
    return h, e
for lab, m in (('TRAIN May-Aug', train_s), ('TEST Sep-Oct', test_s)):
    h,e = topk(tot, m); print(f'{lab}: rank by WHOLE-PERIOD count (leaked): top-6 {h}/{e:.1f} = lift x{h/e:.2f}')
    # leak-free: count strictly before 5/01 only (static), as a static-frequency control
    pre = C[dates < dt.date(2026,5,1)].sum(0).astype(float); h2,e2 = topk(pre, m); print(f'   rank by count before 5/01 only (no leak): {h2}/{e2:.1f} = x{h2/e2:.2f}')
    # blend like the engine: 0.6*freq(leaked whole period) + 0.4*pressure(as-of gap) -> approximate
