import json,statistics as st,datetime as dt,math
from collections import Counter,defaultdict
rows=json.load(open('hist.json'))
POOL=['PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC']
ALL=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
digs=lambda cs:cs[1::2]
def cls(cs): return {3:6,2:3,1:1}[len(set(digs(cs)))]
pairs=lambda s:[''.join(sorted(s[a]+s[b])) for a,b in ((0,1),(0,2),(1,2))]
def zstd(val):
    out={}
    for k in (6,3,1):
        g=[c for c in ALL if cls(c)==k]; mu=st.mean([val[c] for c in g]); sd=st.pstdev([val[c] for c in g]) or 1
        for c in g: out[c]=(val[c]-mu)/sd
    return out
def rank(ref):
    pc=Counter(p for r in ref for p in pairs(r['result_digits'])); dc=Counter(ch for r in ref for ch in r['result_digits'])
    zp=zstd({c:sum(pc[p] for p in pairs(digs(c))) for c in ALL}); zd=zstd({c:sum(dc[ch] for ch in digs(c)) for c in ALL})
    z={c:zp[c]+zd[c] for c in ALL}; closed={r['comboset_sorted'] for r in ref if r['session']=='midday'}
    return [c for c in sorted(ALL,key=lambda c:(-z[c],c)) if c not in closed]
rows.sort(key=lambda r:(r['date_et'],0 if r['session']=='midday' else 1,r['id']))
bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
dates=sorted({r['date_et'] for r in rows})
D=lambda s: dt.date.fromisoformat(s)
# walk forward
last={}; idx=0; res=defaultdict(lambda:defaultdict(lambda:[0,0.0]))
WIN={'full':'2026-05-01','60d':'2026-09-05','30d':'2026-10-05'}
for d in dates:
    # consume midday of d before scoring evening of d
    for r in bydate.get((d,'midday'),[]): last[r['comboset_sorted']]=idx; idx+=1
    pool=[r for r in bydate.get((d,'evening'),[]) if r['jurisdiction'] in POOL]
    prev=(D(d)-dt.timedelta(1)).isoformat(); ref=bydate.get((prev,'evening'),[])+bydate.get((d,'midday'),[])
    if pool and len(ref)>=20 and d>='2026-05-01':
        ranked=rank(ref); nt=[c for c in ranked if cls(c)>1]
        def due(c): return (idx-1-last[c])*cls(c)/1000 if c in last else 99
        forms={'A top3':nt[:3],'A top7':nt[:7],
               'B top3 of due<1 in top10':[c for c in nt[:10] if due(c)<1][:3],
               'B top3 of due<1 in top14':[c for c in nt[:14] if due(c)<1][:3],
               'C top3 singles':[c for c in nt if cls(c)==6][:3],
               'D top3 doubles':[c for c in nt if cls(c)==3][:3],
               'E top3 overdue(>=1) in top10':[c for c in nt[:10] if due(c)>=1][:3]}
        for w,ws in WIN.items():
            if d<ws: continue
            for f,sets in forms.items():
                e=sum(cls(c)/1000 for c in sets)*len(pool); h=sum(r['comboset_sorted'] in sets for r in pool)
                res[f][w][0]+=h; res[f][w][1]+=e
    for r in bydate.get((d,'evening'),[]): last[r['comboset_sorted']]=idx; idx+=1
print("walk-forward on the early-13 evening pool (box hit = set drawn any order); hits/exp (z)")
for f in res:
    print(f"{f:32}"+' | '.join(f"{w} {res[f][w][0]:3}/{res[f][w][1]:5.1f} ({(res[f][w][0]-res[f][w][1])/math.sqrt(res[f][w][1]):+.2f})" for w in WIN))
