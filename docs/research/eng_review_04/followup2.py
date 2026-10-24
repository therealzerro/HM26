import json, collections, math
import numpy as np
from scipy import stats
rng=np.random.default_rng(11)
rows=json.load(open('data/histories_raw.json'))
for r in rows: r['d']=[int(c) for c in r['result_digits']]
def half(r): return 1 if r['date_et']<='2026-07-11' else 2
out=open('results/followup2_log.txt','w')
def P(*a):
    s=' '.join(str(x) for x in a); print(s); out.write(s+'\n')
def pair_chi(a,b):
    t=np.zeros((10,10)); np.add.at(t,(a,b),1); e=np.outer(t.sum(1),t.sum(0))/t.sum(); return float(((t-e)**2/e).sum())
def runs(x):
    x=np.asarray(x); n1=x.sum(); n0=len(x)-n1; R=1+np.sum(x[1:]!=x[:-1]); mu=1+2*n1*n0/(n1+n0); var=2*n1*n0*(2*n1*n0-n1-n0)/((n1+n0)**2*(n1+n0-1)); z=(R-mu)/math.sqrt(var); return R,mu,z,2*stats.norm.sf(abs(z))
nj=sorted([r for r in rows if r['jurisdiction']=='NJ' and r['session']=='midday'],key=lambda r:r['date_et'])
P("=== NJ midday pos1 serial, by half ===")
for h in (0,1,2):
    seq=np.array([r['d'][0] for r in nj if h==0 or half(r)==h])
    st=pair_chi(seq[:-1],seq[1:]); perm=np.array([pair_chi(seq[:-1],rng.permutation(seq[1:])) for _ in range(2000)])
    R,mu,z,p=runs(seq>=5)
    # most over-represented transitions
    t=np.zeros((10,10)); np.add.at(t,(seq[:-1],seq[1:]),1); e=np.outer(t.sum(1),t.sum(0))/t.sum(); dev=(t-e)
    top=np.dstack(np.unravel_index(np.argsort(-dev.ravel())[:4],(10,10)))[0]
    P(f" {'all' if h==0 else 'H'+str(h)}: n={len(seq)} lag1 chi2={st:.1f} perm p={(np.sum(perm>=st)+1)/2001:.4f}; runs R={R} exp={mu:.1f} z={z:.2f} p={p:.4f}; same-digit repeats={int(np.sum(seq[:-1]==seq[1:]))} exp={(len(seq)-1)/10:.1f}; top transitions {[(int(a),int(b),int(t[a,b]),round(e[a,b],1)) for a,b in top]}")
P("\n=== prospective n to confirm 575 at observed rate ===")
for p1 in (0.00222,0.0015,0.00111):
    # one-sided test H0 p=0.001 alpha .05 power .8, normal approx
    za=stats.norm.isf(0.05); zb=stats.norm.isf(0.2)
    n=((za*math.sqrt(0.001*0.999)+zb*math.sqrt(p1*(1-p1)))/(p1-0.001))**2
    P(f" alt p={p1}: n ≈ {n:,.0f} draws ≈ {n/70.8:.0f} ledger-days at 70.8 draws/day")
out.close()
