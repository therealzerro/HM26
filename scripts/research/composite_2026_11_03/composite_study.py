import json,sys,datetime as dt,math,random
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1]))
EARLY=['PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC']
ALLSETS=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
assert len(ALLSETS)==220
def cls(cs): return {3:6,2:3,1:1}[len(set(cs[1::2]))]
def z(o,e): return (o-e)/math.sqrt(e)
D=lambda s: dt.date.fromisoformat(s)
bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
dates=sorted({r['date_et'] for r in rows})
START='2026-07-01'
def pool_rows(pool,sess): return [r for r in rows if r['session']==sess and (pool is None or r['jurisdiction'] in pool)]
def study(pool,sess,label,K=5,KX=5):
    pr=sorted(pool_rows(pool,sess),key=lambda r:r['date_et'])
    # prefix structures: per date list
    pd=defaultdict(list)
    for r in pr: pd[r['date_et']].append(r)
    evald=[d for d in dates if d>=START and pd.get(d)]
    nat=defaultdict(list)
    for r in rows: nat[r['date_et']].append(r)
    res=defaultdict(lambda:[0,0.0,0,[]])  # hits, expected, picks, percentiles
    for d in evald:
        dd=D(d); d60=(dd-dt.timedelta(60)).isoformat(); d30=(dd-dt.timedelta(30)).isoformat(); d7=(dd-dt.timedelta(7)).isoformat(); d3=(dd-dt.timedelta(3)).isoformat()
        hist=[r for x in dates if x<d for r in pd.get(x,[])]
        n=len(hist); n60=sum(r['date_et']>=d60 for r in hist); n30=sum(r['date_et']>=d30 for r in hist)
        cnt=Counter(r['comboset_sorted'] for r in hist); c60=Counter(r['comboset_sorted'] for r in hist if r['date_et']>=d60); c30=Counter(r['comboset_sorted'] for r in hist if r['date_et']>=d30)
        last={}
        for i,r in enumerate(hist): last[r['comboset_sorted']]=i
        nat7=Counter(r['comboset_sorted'] for x in dates if d7<=x<d for r in nat[x])
        blk={r['comboset_sorted'] for x in dates if d3<=x<d for r in nat[x]}
        midtoday={r['comboset_sorted'] for r in bydate.get((d,'midday'),[])}
        scores={}
        for cs in ALLSETS:
            k=cls(cs); e=n*k/1000; e60=n60*k/1000; e30=n30*k/1000
            za=z(cnt[cs],e) if e>0 else 0; z60=z(c60[cs],e60) if e60>0 else 0; z30=z(c30[cs],e30) if e30>0 else 0
            comp=za+z60+z30
            scores[cs]=dict(composite=comp, c30=c30[cs]*6/k, c60=c60[cs]*6/k, call=cnt[cs]*6/k, due=-(last.get(cs,-1)), nat7=nat7[cs]*6/k, anti=-comp,
                            comp_nonoverlap=za*0+z(cnt[cs]-c60[cs],max(e-e60,1e-9))+z(c60[cs]-c30[cs],max(e60-e30,1e-9))+z30,
                            z30_only=z30, z60_only=z60, comp_singles=comp if k==6 else -99, comp_noblock=comp if cs not in blk else -99,
                            comp_nomid=comp if cs not in midtoday else -99, comp_blockonly=comp if cs in blk else -99)
        today=pd[d]; drawn=Counter(r['comboset_sorted'] for r in today); nd=len(today)
        for name in scores[ALLSETS[0]]:
            ranked=sorted(ALLSETS,key=lambda cs:(-scores[cs][name],cs))
            top=ranked[:K]
            hits=sum(drawn[cs] for cs in top); exp=sum(nd*cls(cs)/1000 for cs in top)
            R=res[name]; R[0]+=hits; R[1]+=exp; R[2]+=len(top)
            # percentile of each drawn set (ties: average)
            pos={cs:i for i,cs in enumerate(ranked)}
            for cs,c in drawn.items(): R[3]+= [1-pos[cs]/219]*c
        # exact orders composite straight top-KX
        oc=Counter(r['result_digits'] for r in hist); o60=Counter(r['result_digits'] for r in hist if r['date_et']>=d60); o30=Counter(r['result_digits'] for r in hist if r['date_et']>=d30)
        ex={}
        for i in range(1000):
            o=f"{i:03d}"; ex[o]=z(oc[o],n/1000)+z(o60[o],n60/1000)+z(o30[o],n30/1000)
        topo=sorted(ex,key=lambda o:(-ex[o],o))[:KX]; hd=Counter(r['result_digits'] for r in today)
        R=res['EXACT_composite_top5']; R[0]+=sum(hd[o] for o in topo); R[1]+=nd*KX/1000; R[2]+=KX
        rank_o={o:i for i,o in enumerate(sorted(ex,key=lambda o:(-ex[o],o)))}
        for o,c in hd.items(): R[3]+=[1-rank_o[o]/999]*c
    print(f"\n== {label}: {len(evald)} eval days from {evald[0]} to {evald[-1]}, {sum(len(pd[d]) for d in evald)} draws; top-{K} sets / top-{KX} exact; expected = draws × class/1000")
    print(f"{'scorer':22} {'hits':>5} {'exp':>7} {'ratio':>6} {'z':>6}  {'mean pct of drawn':>18}")
    for name,(h,e,p,pc) in sorted(res.items(),key=lambda kv:-(kv[1][0]-kv[1][1])/math.sqrt(kv[1][1])):
        print(f"{name:22} {h:5d} {e:7.1f} {h/e:6.2f} {(h-e)/math.sqrt(e):+6.2f}  {sum(pc)/len(pc):18.3f}")
study(EARLY,'evening','EARLY-13 pool evening')
study(None,'evening','ALL jurisdictions evening')
study(None,'midday','ALL jurisdictions midday')
