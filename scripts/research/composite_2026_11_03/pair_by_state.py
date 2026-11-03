import json,sys,datetime as dt,math,statistics as st
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1])); START=sys.argv[2]
EARLY=['PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC']
ALLSETS=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
def cls(cs): return {3:6,2:3,1:1}[len(set(cs[1::2]))]
SP={cs:[''.join(sorted(cs[1::2][a]+cs[1::2][b])) for a,b in ((0,1),(0,2),(1,2))] for cs in ALLSETS}
def drawpairs(s): return [''.join(sorted(s[a]+s[b])) for a,b in ((0,1),(0,2),(1,2))]
D=lambda s: dt.date.fromisoformat(s)
dates=sorted({r['date_et'] for r in rows}); bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
def pair_rank(ref):
    pc=Counter()
    for r in ref:
        for p in drawpairs(r['result_digits']): pc[p]+=1
    sup={cs:sum(pc[p] for p in SP[cs]) for cs in ALLSETS}; zp={}
    for k in (6,3,1):
        vals=[sup[cs] for cs in ALLSETS if cls(cs)==k]; mu=st.mean(vals); sd=st.pstdev(vals) or 1
        for cs in ALLSETS:
            if cls(cs)==k: zp[cs]=(sup[cs]-mu)/sd
    ranked=sorted(ALLSETS,key=lambda cs:(-zp[cs],cs)); pos={cs:i for i,cs in enumerate(ranked)}
    return zp,ranked[:5],ranked[:10],pos
# per date: build once
cache={}
stat=defaultdict(lambda:dict(n=0,h5=0,e5=0.0,h10=0,e10=0.0,zsum=0.0,pct=0.0,recent=[]))
for d in dates:
    if d<START: continue
    eve=bydate.get((d,'evening'),[]); pool=[r for r in eve if r['jurisdiction'] in EARLY]
    if not pool: continue
    prev=(D(d)-dt.timedelta(1)).isoformat()
    ref=bydate.get((prev,'evening'),[])+bydate.get((d,'midday'),[])
    if len(ref)<20: continue
    zp,top5,top10,pos=pair_rank(ref)
    e5=sum(cls(cs)/1000 for cs in top5); e10=sum(cls(cs)/1000 for cs in top10)
    for r in pool:
        j=r['jurisdiction']; cs=r['comboset_sorted']; s=stat[j]
        s['n']+=1; s['e5']+=e5; s['e10']+=e10
        s['h5']+=cs in top5; s['h10']+=cs in top10; s['zsum']+=zp[cs]; s['pct']+=1-pos[cs]/219
        if cs in top5: s['recent'].append(f"{r['result_digits']} {d[5:]}")
print(f"early-13 states, evening draws {START}→11/02, pair term (prev evening + same-day midday) — per state: draws · top-5 hits / exp (z) · top-10 hits / exp (z) · mean z of drawn set · mean rank pct of drawn set · last top-5 hits")
out=[]
for j,s in stat.items():
    z5=(s['h5']-s['e5'])/math.sqrt(s['e5']); z10=(s['h10']-s['e10'])/math.sqrt(s['e10'])
    out.append((z5,j,s))
for z5,j,s in sorted(out,key=lambda t:-t[0]):
    z10=(s['h10']-s['e10'])/math.sqrt(s['e10'])
    print(f"{j:9} n {s['n']:3} | top5 {s['h5']:2} / {s['e5']:4.1f} ({z5:+.2f}) | top10 {s['h10']:2} / {s['e10']:4.1f} ({z10:+.2f}) | mean z {s['zsum']/s['n']:+.3f} | pct {s['pct']/s['n']:.3f} | {' · '.join(s['recent'][-4:])}")
tot=dict(n=sum(s['n'] for s in stat.values()),h5=sum(s['h5'] for s in stat.values()),e5=sum(s['e5'] for s in stat.values()),h10=sum(s['h10'] for s in stat.values()),e10=sum(s['e10'] for s in stat.values()))
print(f"POOL      n {tot['n']} | top5 {tot['h5']} / {tot['e5']:.1f} ({(tot['h5']-tot['e5'])/math.sqrt(tot['e5']):+.2f}) | top10 {tot['h10']} / {tot['e10']:.1f} ({(tot['h10']-tot['e10'])/math.sqrt(tot['e10']):+.2f})")
