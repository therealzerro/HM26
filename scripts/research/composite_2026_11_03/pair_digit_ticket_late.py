import json,sys,datetime as dt,math,statistics as st
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1])); mid=json.load(open(sys.argv[2]))
EXTRA=[{'jurisdiction':'SC','result_digits':'375','comboset_sorted':'{3,5,7}'},{'jurisdiction':'NY','result_digits':'506','comboset_sorted':'{0,5,6}'},{'jurisdiction':'AR','result_digits':'803','comboset_sorted':'{0,3,8}'}]
if not mid: mid=EXTRA; print("MIDDAY REFERENCE = operator paste only (3 rows) — PROVISIONAL")
else: print(f"MIDDAY REFERENCE = imported {len(mid)} rows")
EARLY=['AZ','CA','CO','CT','FL','IA','ID','IL','IN','KS','KY','LA','MO','MS','NC','NE','NJ','NM','NY','OK','ON','QC','VA','W.Canada','WA','WI']
ALLSETS=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
def cls(cs): return {3:6,2:3,1:1}[len(set(cs[1::2]))]
SP={cs:[''.join(sorted(cs[1::2][a]+cs[1::2][b])) for a,b in ((0,1),(0,2),(1,2))] for cs in ALLSETS}
def drawpairs(s): return [''.join(sorted(s[a]+s[b])) for a,b in ((0,1),(0,2),(1,2))]
prevEve=[r for r in rows if r['date_et']=='2026-11-02' and r['session']=='evening']
ref=prevEve+mid
pc=Counter()
for r in ref:
    for p in drawpairs(r['result_digits']): pc[p]+=1
print(f"reference block: {len(prevEve)} evening 11/02 + {len(mid)} midday 11/03 = {len(ref)} draws; pair repeats ≥4: {[(p,c) for p,c in pc.most_common() if c>=4]}")
sup={cs:sum(pc[p] for p in SP[cs]) for cs in ALLSETS}; zp={}
for k in (6,3,1):
    vals=[sup[cs] for cs in ALLSETS if cls(cs)==k]; mu=st.mean(vals); sd=st.pstdev(vals) or 1
    for cs in ALLSETS:
        if cls(cs)==k: zp[cs]=(sup[cs]-mu)/sd
dc=Counter(ch for r in ref for ch in r['result_digits'])
dsup={cs:sum(dc[ch] for ch in cs[1::2]) for cs in ALLSETS}; zd={}
for k in (6,3,1):
    vals=[dsup[cs] for cs in ALLSETS if cls(cs)==k]; mu=st.mean(vals); sd=st.pstdev(vals) or 1
    for cs in ALLSETS:
        if cls(cs)==k: zd[cs]=(dsup[cs]-mu)/sd
print(f"digit counts in reference: {dict(sorted(dc.items()))}")
zpd={cs:zp[cs]+zd[cs] for cs in ALLSETS}
closed={r['comboset_sorted'] for r in mid}|{'{3,5,7}','{0,5,6}','{0,3,8}'}
# pool stats for drill columns
D60='2026-09-04'; D30='2026-10-04'
d=[r for r in rows if r['session']=='evening' and r['jurisdiction'] in EARLY and r['date_et']<='2026-11-02']
n=len(d); n60=sum(r['date_et']>=D60 for r in d); n30=sum(r['date_et']>=D30 for r in d)
sb=defaultdict(list)
for r in d: sb[r['comboset_sorted']].append(r)
def z(o,e): return (o-e)/math.sqrt(e)
ranked=[cs for cs in sorted(ALLSETS,key=lambda cs:(-zpd[cs],cs)) if cs not in closed]
print("\nPAIR+DIGIT RANK (no composite) — LATE-26 POOL columns (closed excluded): set · class · pair z · support (pairs) · composite · all/60d/30d vs exp · leading order all→60d · last three in pool")
for i,cs in enumerate(ranked[:14]):
    m=sb[cs]; k=cls(cs); comp=z(len(m),n*k/1000)+z(sum(r['date_et']>=D60 for r in m),n60*k/1000)+z(sum(r['date_et']>=D30 for r in m),n30*k/1000)
    oa=Counter(r['result_digits'] for r in m); o60=Counter(r['result_digits'] for r in m if r['date_et']>=D60)
    lead=max(oa,key=lambda o:(o60[o],oa[o])) if oa else '-'
    print(f"{i+1:2} {cs:8} {'S' if k==6 else 'D' if k==3 else 'T'} P+D {zpd[cs]:+.2f} (pair {zp[cs]:+.2f} digit {zd[cs]:+.2f}) sup {sup[cs]} {dict((p,pc[p]) for p in SP[cs])} | comp {comp:+.2f} | {len(m)}/{n*k/1000:.1f} {sum(r['date_et']>=D60 for r in m)}/{n60*k/1000:.1f} {sum(r['date_et']>=D30 for r in m)}/{n30*k/1000:.1f} | lead {lead} ({dict(oa.most_common(3))} → {dict(o60.most_common(3))}) | {' · '.join(r['jurisdiction']+' '+r['result_digits']+' '+r['date_et'][5:] for r in m[-3:])}")
