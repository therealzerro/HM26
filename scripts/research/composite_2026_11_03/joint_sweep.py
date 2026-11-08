import json,sys,datetime as dt,math
import numpy as np
from collections import defaultdict
rows=json.load(open(sys.argv[1]))
orders=[f"{i:03d}" for i in range(1000)]; O=np.array([[int(c) for c in o] for o in orders])
KL=np.array([len(set(o)) for o in orders])   # 3 single, 2 double, 1 triple
PAIRIDX=[(0,1),(0,2),(1,2)]
bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
dates=sorted({r['date_et'] for r in rows}); D=lambda s: dt.date.fromisoformat(s)
def sessions_before(d,sess,L,same_only):
    # the L most recent calendar days of draws strictly before target session; same_only → only that session's rows
    out=[]
    cur=D(d); got=0
    # for evening: same-day midday counts as day 0 (ticket convention); for midday: start at prev day
    if sess=='evening' and not same_only: out+=bydate.get((d,'midday'),[])
    day=cur-dt.timedelta(1)
    while got<L:
        ds=day.isoformat()
        if same_only: out+=bydate.get((ds,sess),[])
        else: out+=bydate.get((ds,'midday'),[])+bydate.get((ds,'evening'),[])
        got+=1; day-=dt.timedelta(1)
    return out
def zcls(v):
    z=np.zeros_like(v,dtype=float)
    for k in (1,2,3):
        m=KL==k; mu=v[m].mean(); sd=v[m].std() or 1; z[m]=(v[m]-mu)/sd
    return z
def feats(ref):
    pd=np.zeros((3,10)); pp=np.zeros((3,10,10))
    for r in ref:
        s=[int(c) for c in r['result_digits']]
        for i in range(3): pd[i,s[i]]+=1
        for pi,(a,b) in enumerate(PAIRIDX): pp[pi,s[a],s[b]]+=1
    vpd=sum(pd[i,O[:,i]] for i in range(3))
    vpp=sum(pp[pi,O[:,a],O[:,b]] for pi,(a,b) in enumerate(PAIRIDX))
    return zcls(vpp),zcls(vpd)
FIT_END='2026-08-31'
LS=[1,2,3,5,7,14]; WTS=[(1,0),(0,1),(1,1),(2,1),(1,2),(1,0.5),(0.5,1)]
res={}  # (L,same,w) -> {'fit':[pcts], 'hold':[pcts]} per sess
top1={}
for L in LS:
  for same in (False,True):
    cache={}
    for d in dates:
        if d<'2026-05-01': continue
        for sess in ('midday','evening'):
            pool=bydate.get((d,sess),[])
            if not pool: continue
            ref=sessions_before(d,sess,L,same)
            if len(ref)<20: continue
            zpp,zpd=feats(ref)
            drawn=np.array([int(r['result_digits']) for r in pool])
            per=('fit' if d<=FIT_END else 'hold')
            for w in WTS:
                sc=w[0]*zpp+w[1]*zpd
                key=(L,same,w,sess)
                R=res.setdefault(key,{'fit':[],'hold':[]}); T1=top1.setdefault(key,{'fit':np.zeros((3,2)),'hold':np.zeros((3,2))})
                for x in drawn:
                    k=KL[x]; m=KL==k; R[per].append(((sc[m]<sc[x]).sum()+0.5*(sc[m]==sc[x]).sum())/m.sum())
                # top-1 exact per class
                for ki,k in enumerate((3,2,1)):
                    idx=np.where(KL==k)[0]; best=idx[np.argmax(sc[idx])]
                    T1[per][ki,0]+=np.sum(drawn==best); T1[per][ki,1]+=len(pool)/1000
print("UNIVERSE METRIC = mean percentile of the drawn order within its class under the straight scorer (0.500 = null). fit = 5/01–8/31, hold = 9/01–11/07 (untouched by the choice)")
print(f"{'L':>2} {'ref':5} {'w(pp,pd)':9} | midday fit    hold    | evening fit   hold")
for L in LS:
  for same in (False,True):
    for w in WTS:
        a=res[(L,same,w,'midday')]; b=res[(L,same,w,'evening')]
        f=lambda v: f"{np.mean(v):.4f}±{np.std(v)/math.sqrt(len(v)):.4f}"
        print(f"{L:>2} {'same' if same else 'both':5} {str(w):9} | {f(a['fit'])} {f(a['hold'])} | {f(b['fit'])} {f(b['hold'])}")
# rank configs by fit percentile, show hold-out
print("\nTOP-5 configs by midday FIT percentile → their HOLD-OUT:")
for key in sorted([k for k in res if k[3]=='midday'],key=lambda k:-np.mean(res[k]['fit']))[:5]:
    print(key[:3],f"fit {np.mean(res[key]['fit']):.4f} hold {np.mean(res[key]['hold']):.4f}")
print("TOP-5 configs by evening FIT percentile → their HOLD-OUT:")
for key in sorted([k for k in res if k[3]=='evening'],key=lambda k:-np.mean(res[k]['fit']))[:5]:
    print(key[:3],f"fit {np.mean(res[key]['fit']):.4f} hold {np.mean(res[key]['hold']):.4f}")
print("\nTOP-1 EXACT per class (S/D/T) hits/exp — current config L=1 both (1,1) vs best-fit configs, hold-out 9/01–11/07:")
def show(key):
    for sess in ('midday','evening'):
        T=top1[(key[0],key[1],key[2],sess)]
        print(f"  {key[:3]} {sess:7} "+' | '.join(f"{'SDT'[i]} fit {T['fit'][i,0]:.0f}/{T['fit'][i,1]:.1f} hold {T['hold'][i,0]:.0f}/{T['hold'][i,1]:.1f}" for i in range(3)))
show((1,False,(1,1)))
for key in sorted([k for k in res if k[3]=='evening'],key=lambda k:-np.mean(res[k]['fit']))[:2]: show(key)
for key in sorted([k for k in res if k[3]=='midday'],key=lambda k:-np.mean(res[k]['fit']))[:2]: show(key)
# all-cells summary: how many configs have hold-out percentile > 0.5 by more than 2 se, both sessions
cnt=0; tot=0
for L in LS:
  for same in (False,True):
    for w in WTS:
        tot+=1
        ok=all(np.mean(res[(L,same,w,s)]['hold'])-2*np.std(res[(L,same,w,s)]['hold'])/math.sqrt(len(res[(L,same,w,s)]['hold']))>0.5 for s in ('midday','evening'))
        cnt+=ok
print(f"\nconfigs with HOLD-OUT percentile > 0.500 by 2 se on BOTH pools: {cnt} of {tot}")
