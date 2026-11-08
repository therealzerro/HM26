# Untested practitioner terms as universe tests: vtrac repeat, odd/even–high/low pattern transition, width transition, sum-bucket transition, previous-sum key digit.
import json,sys,datetime as dt,math
import numpy as np
from scipy import stats
from collections import Counter,defaultdict
rows=json.load(open(sys.argv[1])); rows=[r for r in rows if not (r['jurisdiction']=='DC' and r['date_et']<='2026-04-21')]
for r in rows: r['d']=[int(c) for c in r['result_digits']]
FIT='2026-08-31'
bykey=defaultdict(list)
for r in rows: bykey[(r['jurisdiction'],r['session'],r['date_et'])].append(r)
series=defaultdict(list)
for (j,s,d),g in sorted(bykey.items()):
    if len(g)==1: series[(j,s)].append((d,g[0]))
P=[]
for lst in series.values():
    for (d0,a),(d1,b) in zip(lst,lst[1:]):
        if (dt.date.fromisoformat(d1)-dt.date.fromisoformat(d0)).days<=3: P.append((a,b,d1))
print(f"within-state consecutive pairs: {len(P)}")
def split(fn):
    f=[fn(a,b) for a,b,d in P if d<=FIT]; h=[fn(a,b) for a,b,d in P if d>FIT]; return np.mean(f),len(f),np.mean(h),len(h)
def z(p,n,p0): return (p-p0)/math.sqrt(p0*(1-p0)/n)
# exact null rates by enumeration over 1000×1000 independent pairs
allo=[[int(c) for c in f"{i:03d}"] for i in range(1000)]
vt=lambda d: tuple(sorted(x%5 for x in d))
null_vt=np.mean([vt(a)==vt(b) for a in allo for b in allo[::7]])  # subsample for speed
pat=lambda d: (tuple(x%2 for x in d),tuple(x>=5 for x in d))
null_pat=np.mean([pat(a)==pat(b) for a in allo for b in allo[::7]])
width=lambda d: max(d)-min(d)
null_w=np.mean([width(a)==width(b) for a in allo for b in allo[::7]])
sb=lambda d: min(sum(d)//7,3)  # sum buckets 0-6,7-13,14-20,21-27
null_sb=np.mean([sb(a)==sb(b) for a in allo for b in allo[::7]])
keyd=lambda a,b: (sum(a)%10) in b
null_key=np.mean([keyd(a,b) for a in allo for b in allo[::7]])
rootd=lambda a,b: ((sum(a)-1)%9+1 if sum(a) else 0) in b
null_root=np.mean([rootd(a,b) for a in allo for b in allo[::7]])
print("\n=== Within-state lag-1 terms: P(property holds) fit / hold vs exact null ===")
for name,fn,p0 in (("vtrac set repeat (digits mod 5, any order)",lambda a,b: vt(a['d'])==vt(b['d']),null_vt),
                   ("odd/even+high/low positional pattern repeat",lambda a,b: pat(a['d'])==pat(b['d']),null_pat),
                   ("width (max−min) repeat",lambda a,b: width(a['d'])==width(b['d']),null_w),
                   ("sum bucket repeat (0–6/7–13/14–20/21–27)",lambda a,b: sb(a['d'])==sb(b['d']),null_sb),
                   ("prev sum last digit appears in next draw",lambda a,b: keyd(a['d'],b['d']),null_key),
                   ("prev root sum appears in next draw",lambda a,b: rootd(a['d'],b['d']),null_root)):
    pf,nf,ph,nh=split(fn); print(f" {name:46} fit {pf:.4f} (z {z(pf,nf,p0):+.2f}) | hold {ph:.4f} (z {z(ph,nh,p0):+.2f}) | null {p0:.4f}")
# transition matrices (chi-square independence) within state
print("\n=== Within-state lag-1 transition independence (chi² p) ===")
for name,fn in (("vtrac set",lambda d: vt(d)),("pattern class",lambda d: pat(d)),("width",width),("sum",lambda d: sum(d)),("sum bucket",sb)):
    keys=sorted({fn(a['d']) for a,b,_ in P}|{fn(b['d']) for a,b,_ in P}); ki={k:i for i,k in enumerate(keys)}
    M=np.zeros((len(keys),len(keys)),int)
    for a,b,_ in P: M[ki[fn(a['d'])],ki[fn(b['d'])]]+=1
    M=M[M.sum(1)>0][:,M.sum(0)>0]; chi2,p,dof,_=stats.chi2_contingency(M); print(f" {name:14} states {M.shape[0]}×{M.shape[1]} chi² p={p:.3f}")
# nationwide reference-block versions (the ticket-style reference → today's draws), universe-level
bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
dates=sorted({r['date_et'] for r in rows})
def ref_for(d,sess):
    prev=(dt.date.fromisoformat(d)-dt.timedelta(1)).isoformat()
    return bydate.get((prev,'evening'),[])+bydate.get((d,'midday'),[]) if sess=='evening' else bydate.get((prev,'midday'),[])+bydate.get((prev,'evening'),[])
print("\n=== Nationwide reference-block terms: does the block's most common class predict today's draws? (hit rate on today's draws, fit / hold vs the class's base rate) ===")
for name,fn,nclasses in (("top vtrac set of the block",lambda d: vt(d),None),("top sum of the block",lambda d: sum(d),None),("top width of the block",width,None),("top pattern class",lambda d: pat(d),None),("top sum-last-digit of block as key digit",None,None)):
    res={'fit':[0,0,0.0],'hold':[0,0,0.0]}
    for d in dates:
        for sess in ('midday','evening'):
            g=bydate.get((d,sess),[]); ref=ref_for(d,sess)
            if len(ref)<20 or not g: continue
            per='fit' if d<=FIT else 'hold'
            if fn is None:
                top=Counter(sum(r['d'])%10 for r in ref).most_common(1)[0][0]
                res[per][0]+=sum(top in r['d'] for r in g); res[per][1]+=len(g); res[per][2]+=len(g)*np.mean([top in a for a in allo])
            else:
                top=Counter(fn(r['d']) for r in ref).most_common(1)[0][0]
                base=np.mean([fn(a)==top for a in allo])
                res[per][0]+=sum(fn(r['d'])==top for r in g); res[per][1]+=len(g); res[per][2]+=len(g)*base
    print(f" {name:42} fit {res['fit'][0]}/{res['fit'][2]:.1f} (ratio {res['fit'][0]/res['fit'][2]:.3f}, z {(res['fit'][0]-res['fit'][2])/math.sqrt(res['fit'][2]):+.2f}) | hold {res['hold'][0]}/{res['hold'][2]:.1f} (ratio {res['hold'][0]/res['hold'][2]:.3f}, z {(res['hold'][0]-res['hold'][2])/math.sqrt(res['hold'][2]):+.2f})")
