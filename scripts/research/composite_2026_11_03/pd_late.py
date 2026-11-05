import json,sys,math,statistics as st,datetime as dt
from collections import defaultdict,Counter
# usage: pd_late.py hist.json <prev_eve_date> <target_date> [early.json]
# reference = prev evening (all) + target midday (from hist) + early-13 rows (json list of {jurisdiction,result_digits,comboset_sorted}) if given
# closed = target-midday sets + early-13 sets (convention). Pool columns = late-26 evening pool through prev date.
rows=json.load(open(sys.argv[1])); PREV=sys.argv[2]; TGT=sys.argv[3]
early=json.load(open(sys.argv[4])) if len(sys.argv)>4 else []
mid=[r for r in rows if r['date_et']==TGT and r['session']=='midday']
POOL=['AZ','CA','CO','CT','FL','IA','ID','IL','IN','KS','KY','LA','MO','MS','NC','NE','NJ','NM','NY','OK','ON','QC','VA','W.Canada','WA','WI']
ALLSETS=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
def digs(cs): return cs[1::2]
def cls(cs): return {3:6,2:3,1:1}[len(set(digs(cs)))]
SP={cs:[''.join(sorted(digs(cs)[a]+digs(cs)[b])) for a,b in ((0,1),(0,2),(1,2))] for cs in ALLSETS}
def drawpairs(s): return [''.join(sorted(s[a]+s[b])) for a,b in ((0,1),(0,2),(1,2))]
prevEve=[r for r in rows if r['date_et']==PREV and r['session']=='evening']
ref=prevEve+mid+early
print(f"reference block: {len(prevEve)} evening {PREV} + {len(mid)} midday {TGT} + {len(early)} early-13 {TGT} = {len(ref)} draws" + ("  — PROVISIONAL (early-13 not yet added)" if not early else ""))
pc=Counter()
for r in ref:
    for p in drawpairs(r['result_digits']): pc[p]+=1
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
closed={r['comboset_sorted'] for r in mid}|{r['comboset_sorted'] for r in early}
T=dt.date.fromisoformat(PREV); D60=(T-dt.timedelta(days=59)).isoformat(); D30=(T-dt.timedelta(days=29)).isoformat()
d=[r for r in rows if r['session']=='evening' and r['jurisdiction'] in POOL and r['date_et']<=PREV]
n=len(d); n60=sum(r['date_et']>=D60 for r in d); n30=sum(r['date_et']>=D30 for r in d)
print(f"late-26 pool evening rows 4/01→{PREV}: {n} (60d since {D60}: {n60}; 30d since {D30}: {n30}); exp box single {n*6/1000:.1f}/{n60*6/1000:.1f}/{n30*6/1000:.1f}, double {n*3/1000:.1f}/{n60*3/1000:.1f}/{n30*3/1000:.1f}")
sb=defaultdict(list)
for r in d: sb[r['comboset_sorted']].append(r)
allr=[r for r in rows if r['date_et']<=PREV]
allr.sort(key=lambda r:(r['date_et'],0 if r['session']=='midday' else 1,r['id']))
last={}
for i,r in enumerate(allr): last[r['comboset_sorted']]=(i,r)
N=len(allr)
ranked=[cs for cs in sorted(ALLSETS,key=lambda cs:(-zpd[cs],cs)) if cs not in closed]
print("\nPAIR+DIGIT RANK — LATE-26 pool columns (closed excluded)")
for i,cs in enumerate(ranked[:16]):
    m=sb[cs]; k=cls(cs)
    oa=Counter(r['result_digits'] for r in m); o60=Counter(r['result_digits'] for r in m if r['date_et']>=D60)
    lead=max(oa,key=lambda o:(o60[o],oa[o])) if oa else digs(cs)
    if cs in last:
        gi,gr=last[cs]; gap=N-1-gi; due=gap*k/1000; ls=f"{gr['jurisdiction']} {gr['result_digits']} {gr['date_et'][5:]} {gr['session'][:3]}"
    else: gap=N; due=gap*k/1000; ls='never'
    print(f"{i+1:2} {cs:8} {'S' if k==6 else 'D' if k==3 else 'T'} P+D {zpd[cs]:+.2f} (pair {zp[cs]:+.2f} digit {zd[cs]:+.2f}) pairs {dict((p,pc[p]) for p in SP[cs])} | pool {len(m)}/{n*k/1000:.1f} 60d {sum(r['date_et']>=D60 for r in m)}/{n60*k/1000:.1f} 30d {sum(r['date_et']>=D30 for r in m)}/{n30*k/1000:.1f} | lead {lead} ({dict(oa.most_common(3))} → 60d {dict(o60.most_common(3))}) | last pool {' · '.join(r['jurisdiction']+' '+r['result_digits']+' '+r['date_et'][5:] for r in m[-2:])} | national last {ls} gap {gap} due {due:.2f}")
print("\nclosed:",sorted(closed))
