import json,sys,datetime as dt,math,statistics as st
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1])); START=sys.argv[2]; END=sys.argv[3]
EARLY=['PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC']
ALL=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
digs=lambda cs:cs[1::2]
def cls(cs): return {3:6,2:3,1:1}[len(set(digs(cs)))]
SP={cs:[''.join(sorted(digs(cs)[a]+digs(cs)[b])) for a,b in ((0,1),(0,2),(1,2))] for cs in ALL}
def drawpairs(s): return [''.join(sorted(s[a]+s[b])) for a,b in ((0,1),(0,2),(1,2))]
D=lambda s: dt.date.fromisoformat(s)
dates=sorted({r['date_et'] for r in rows}); bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
def zstd(val):
    out={}
    for k in (6,3,1):
        g=[cs for cs in ALL if cls(cs)==k]; mu=st.mean([val[c] for c in g]); sd=st.pstdev([val[c] for c in g]) or 1
        for c in g: out[c]=(val[c]-mu)/sd
    return out
def rank(ref):
    pc=Counter(p for r in ref for p in drawpairs(r['result_digits'])); dc=Counter(ch for r in ref for ch in r['result_digits'])
    zp=zstd({cs:sum(pc[p] for p in SP[cs]) for cs in ALL}); zd=zstd({cs:sum(dc[ch] for ch in digs(cs)) for cs in ALL})
    z={cs:zp[cs]+zd[cs] for cs in ALL}
    closed={r['comboset_sorted'] for r in ref if r['session']=='midday'}
    ranked=[cs for cs in sorted(ALL,key=lambda cs:(-z[cs],cs)) if cs not in closed]
    return ranked
KS=(5,7,10)
stat=defaultdict(lambda:{'n':0,**{f'h{k}':0 for k in KS},**{f'e{k}':0.0 for k in KS},'recent':[]})
for d in dates:
    if d<START or d>END: continue
    pool=[r for r in bydate.get((d,'evening'),[]) if r['jurisdiction'] in EARLY]
    if not pool: continue
    prev=(D(d)-dt.timedelta(1)).isoformat()
    ref=bydate.get((prev,'evening'),[])+bydate.get((d,'midday'),[])
    if len(ref)<20: continue
    ranked=rank(ref); tops={k:ranked[:k] for k in KS}
    # ticket form: boxes = top-k non-triples (what is actually bought); score box hits on the set
    for r in pool:
        j=r['jurisdiction']; cs=r['comboset_sorted']; s=stat[j]; s['n']+=1
        for k in KS:
            top=[c for c in ranked if cls(c)>1][:k]
            s[f'e{k}']+=sum(cls(c)/1000 for c in top); s[f'h{k}']+=cs in top
        if cs in [c for c in ranked if cls(c)>1][:7]: s['recent'].append(f"{r['result_digits']} {d[5:]}")
print(f"early-13 states, evening draws {START}→{END}, PAIR+DIGIT (prev evening + same-day midday; midday-drawn sets closed; boxes = top-K non-triple) — draws · top-5 · top-7 (ticket) · top-10 hits/exp (z) · last top-7 box hits")
out=sorted(stat.items(),key=lambda t:-(t[1]['h7']-t[1]['e7'])/math.sqrt(t[1]['e7']))
for j,s in out:
    cells=' | '.join(f"top{k} {s[f'h{k}']:2}/{s[f'e{k}']:4.1f} ({(s[f'h{k}']-s[f'e{k}'])/math.sqrt(s[f'e{k}']):+.2f})" for k in KS)
    print(f"{j:9} n {s['n']:3} | {cells} | {' · '.join(s['recent'][-4:])}")
T={k:(sum(s[f'h{k}'] for s in stat.values()),sum(s[f'e{k}'] for s in stat.values())) for k in KS}
print("POOL      n",sum(s['n'] for s in stat.values()),'|',' | '.join(f"top{k} {h}/{e:.1f} ({(h-e)/math.sqrt(e):+.2f})" for k,(h,e) in T.items()))
