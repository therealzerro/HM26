import json,sys,datetime as dt,math,statistics as st
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1])); START=sys.argv[2]; STOP=sys.argv[3]; K=int(sys.argv[4])
EARLY=['PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC']
ALLSETS=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
def cls(cs): return {3:6,2:3,1:1}[len(set(cs[1::2]))]
def z(o,e): return (o-e)/math.sqrt(e)
def setpairs(cs):
    d=cs[1::2]; return [''.join(sorted(d[a]+d[b])) for a,b in ((0,1),(0,2),(1,2))]
SP={cs:setpairs(cs) for cs in ALLSETS}
def drawpairs(s): return [''.join(sorted(s[a]+s[b])) for a,b in ((0,1),(0,2),(1,2))]
D=lambda s: dt.date.fromisoformat(s)
dates=sorted({r['date_et'] for r in rows})
bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
def pair_z(ref_rows):
    pc=Counter()
    for r in ref_rows:
        for p in drawpairs(r['result_digits']): pc[p]+=1
    sup={cs:sum(pc[p] for p in SP[cs]) for cs in ALLSETS}
    out={}
    for k in (6,3,1):
        vals=[sup[cs] for cs in ALLSETS if cls(cs)==k]; mu=st.mean(vals); sd=st.pstdev(vals) or 1
        for cs in ALLSETS:
            if cls(cs)==k: out[cs]=(sup[cs]-mu)/sd
    return out
def study(pool,sess,label):
    pr=[r for r in rows if r['session']==sess and (pool is None or r['jurisdiction'] in pool)]
    pd=defaultdict(list)
    for r in pr: pd[r['date_et']].append(r)
    evald=[d for d in dates if START<=d<=STOP and pd.get(d)]
    res=defaultdict(lambda:[0,0.0,[]])
    for d in evald:
        dd=D(d); d60=(dd-dt.timedelta(60)).isoformat(); d30=(dd-dt.timedelta(30)).isoformat(); d3=(dd-dt.timedelta(3)).isoformat()
        prev=(dd-dt.timedelta(1)).isoformat()
        hist=[r for x in dates if x<d for r in pd.get(x,[])]
        n=len(hist); n60=sum(r['date_et']>=d60 for r in hist); n30=sum(r['date_et']>=d30 for r in hist)
        cnt=Counter(r['comboset_sorted'] for r in hist); c60=Counter(r['comboset_sorted'] for r in hist if r['date_et']>=d60); c30=Counter(r['comboset_sorted'] for r in hist if r['date_et']>=d30)
        comp={cs: z(cnt[cs],n*cls(cs)/1000)+z(c60[cs],n60*cls(cs)/1000)+z(c30[cs],n30*cls(cs)/1000) for cs in ALLSETS}
        # pair references (nationwide, all jurisdictions)
        prevEve=bydate.get((prev,'evening'),[])
        midToday=bydate.get((d,'midday'),[]) if sess=='evening' else bydate.get((prev,'midday'),[])
        last3=[r for x in dates if d3<=x<d for r in bydate.get((x,'evening'),[])+bydate.get((x,'midday'),[])]
        zp1=pair_z(prevEve); zp2=pair_z(prevEve+midToday); zp3=pair_z(last3)
        scores={cs:{'composite':comp[cs],'pair_prevEve':zp1[cs],'pair_prevEve+mid':zp2[cs],'pair_last3d':zp3[cs],
                    'comp+pair_prevEve':comp[cs]+zp1[cs],'comp+pair_prevEve+mid':comp[cs]+zp2[cs],'comp+pair_last3d':comp[cs]+zp3[cs],
                    'comp+2x_pair_prevEve+mid':comp[cs]+2*zp2[cs],'anti_pair_prevEve+mid':-zp2[cs]} for cs in ALLSETS}
        today=pd[d]; drawn=Counter(r['comboset_sorted'] for r in today); nd=len(today)
        for name in scores[ALLSETS[0]]:
            ranked=sorted(ALLSETS,key=lambda cs:(-scores[cs][name],cs)); top=ranked[:K]
            R=res[name]; R[0]+=sum(drawn[cs] for cs in top); R[1]+=sum(nd*cls(cs)/1000 for cs in top)
            pos={cs:i for i,cs in enumerate(ranked)}
            for cs,c in drawn.items(): R[2]+=[1-pos[cs]/219]*c
    print(f"\n== {label}: {len(evald)} days {evald[0]}→{evald[-1]}, {sum(len(pd[d]) for d in evald)} draws, top-{K}")
    print(f"{'scorer':26} {'hits':>5} {'exp':>7} {'ratio':>6} {'z':>6} {'pct':>6}")
    for name,(h,e,pc) in sorted(res.items(),key=lambda kv:-(kv[1][0]-kv[1][1])/math.sqrt(kv[1][1])):
        print(f"{name:26} {h:5d} {e:7.1f} {h/e:6.2f} {(h-e)/math.sqrt(e):+6.2f} {sum(pc)/len(pc):6.3f}")
study(EARLY,'evening','EARLY-13 evening'); study(None,'evening','ALL evening'); study(None,'midday','ALL midday')
