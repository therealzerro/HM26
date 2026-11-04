import json,sys,math,statistics as st
from collections import defaultdict,Counter
# usage: pd_early.py hist.json <prev_eve_date> <target_date> [mid.json]
rows=json.load(open(sys.argv[1])); PREV=sys.argv[2]; TGT=sys.argv[3]
mid=json.load(open(sys.argv[4])) if len(sys.argv)>4 else [r for r in rows if r['date_et']==TGT and r['session']=='midday']
POOL=['PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC']
ALLSETS=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
def digs(cs): return cs[1::2]
def cls(cs): return {3:6,2:3,1:1}[len(set(digs(cs)))]
SP={cs:[''.join(sorted(digs(cs)[a]+digs(cs)[b])) for a,b in ((0,1),(0,2),(1,2))] for cs in ALLSETS}
def drawpairs(s): return [''.join(sorted(s[a]+s[b])) for a,b in ((0,1),(0,2),(1,2))]
prevEve=[r for r in rows if r['date_et']==PREV and r['session']=='evening']
ref=prevEve+mid
print(f"MIDDAY {TGT}: {len(mid)} rows" + ("  — PROVISIONAL (prev evening only)" if not mid else ""))
pc=Counter()
for r in ref:
    for p in drawpairs(r['result_digits']): pc[p]+=1
print(f"reference block: {len(prevEve)} evening {PREV} + {len(mid)} midday {TGT} = {len(ref)} draws")
print("pair repeats >=4:",[(p,c) for p,c in pc.most_common() if c>=4])
sup={cs:sum(pc[p] for p in SP[cs]) for cs in ALLSETS}; zp={}
for k in (6,3,1):
    vals=[sup[cs] for cs in ALLSETS if cls(cs)==k]; mu=st.mean(vals); sd=st.pstdev(vals) or 1
    for cs in ALLSETS:
        if cls(cs)==k: zp[cs]=(sup[cs]-mu)/sd
dc=Counter(ch for r in ref for ch in r['result_digits'])
dsup={cs:sum(dc[ch] for ch in digs(cs)) for cs in ALLSETS}; zd={}
for k in (6,3,1):
    vals=[dsup[cs] for cs in ALLSETS if cls(cs)==k]; mu=st.mean(vals); sd=st.pstdev(vals) or 1
    for cs in ALLSETS:
        if cls(cs)==k: zd[cs]=(dsup[cs]-mu)/sd
print("digit counts:",dict(sorted(dc.items(),key=lambda x:-x[1])))
zpd={cs:zp[cs]+zd[cs] for cs in ALLSETS}
closed={r['comboset_sorted'] for r in mid}
# pool stats
import datetime as dt
T=dt.date.fromisoformat(PREV); D60=(T-dt.timedelta(days=59)).isoformat(); D30=(T-dt.timedelta(days=29)).isoformat()
d=[r for r in rows if r['session']=='evening' and r['jurisdiction'] in POOL and r['date_et']<=PREV]
n=len(d); n60=sum(r['date_et']>=D60 for r in d); n30=sum(r['date_et']>=D30 for r in d)
print(f"early-13 pool evening rows 4/01→{PREV}: {n} (60d since {D60}: {n60}; 30d since {D30}: {n30}); exp box single {n*6/1000:.1f}/{n60*6/1000:.1f}/{n30*6/1000:.1f}, double {n*3/1000:.1f}/{n60*3/1000:.1f}/{n30*3/1000:.1f}")
sb=defaultdict(list)
for r in d: sb[r['comboset_sorted']].append(r)
# national draws-since (all jurisdictions, both sessions) through PREV evening
allr=[r for r in rows if r['date_et']<=PREV]
allr.sort(key=lambda r:(r['date_et'],0 if r['session']=='midday' else 1,r['id']))
last={}
for i,r in enumerate(allr): last[r['comboset_sorted']]=(i,r)
N=len(allr)
def z(o,e): return (o-e)/math.sqrt(e)
ranked=[cs for cs in sorted(ALLSETS,key=lambda cs:(-zpd[cs],cs)) if cs not in closed]
print("\nPAIR+DIGIT RANK — EARLY-13 pool columns (midday-closed excluded)")
for i,cs in enumerate(ranked[:16]):
    m=sb[cs]; k=cls(cs)
    oa=Counter(r['result_digits'] for r in m); o60=Counter(r['result_digits'] for r in m if r['date_et']>=D60)
    lead=max(oa,key=lambda o:(o60[o],oa[o])) if oa else digs(cs)
    if cs in last:
        gi,gr=last[cs]; gap=N-1-gi; due=gap*k/1000; lastس=f"{gr['jurisdiction']} {gr['result_digits']} {gr['date_et'][5:]} {gr['session'][:3]}"
    else: gap=N; due=gap*k/1000; lastس='never'
    print(f"{i+1:2} {cs:8} {'S' if k==6 else 'D' if k==3 else 'T'} P+D {zpd[cs]:+.2f} (pair {zp[cs]:+.2f} digit {zd[cs]:+.2f}) pairs {dict((p,pc[p]) for p in SP[cs])} | pool {len(m)}/{n*k/1000:.1f} 60d {sum(r['date_et']>=D60 for r in m)}/{n60*k/1000:.1f} 30d {sum(r['date_et']>=D30 for r in m)}/{n30*k/1000:.1f} | lead {lead} ({dict(oa.most_common(3))} → 60d {dict(o60.most_common(3))}) | last pool {' · '.join(r['jurisdiction']+' '+r['result_digits']+' '+r['date_et'][5:] for r in m[-2:])} | national last {lastس} gap {gap} due {due:.2f}")
if closed: print("\nclosed by midday:",sorted(closed))
