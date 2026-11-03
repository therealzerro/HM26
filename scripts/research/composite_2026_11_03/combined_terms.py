# Combined scorer test: composite (+pair) + candidate terms that survived the sign check in flat_terms.py
import json,sys,datetime as dt,math,statistics as st
from collections import defaultdict,Counter
sys.argv=[sys.argv[0],sys.argv[1]]
exec(open(__file__.replace('combined_terms.py','flat_terms.py')).read().split('TERMS=[')[0])  # reuse term defs + helpers
POOLS=[('EARLY-13 eve',EARLY,'evening'),('ALL midday',None,'midday'),('ALL evening',None,'evening')]
WIN={'IS 7/01→11/02':('2026-07-01','2026-11-02'),'OOS 5/01→6/30':('2026-05-01','2026-06-30')}
def zf(o,e): return (o-e)/math.sqrt(e) if e>0 else 0
def composite(d,sess,pool):
    hist=[r for x in dates if x<d for r in byd[x] if r['session']==sess and (pool is None or r['jurisdiction'] in pool)]
    d60=(D(d)-dt.timedelta(60)).isoformat(); d30=(D(d)-dt.timedelta(30)).isoformat()
    n=len(hist); n60=sum(r['date_et']>=d60 for r in hist); n30=sum(r['date_et']>=d30 for r in hist)
    c=Counter(r['comboset_sorted'] for r in hist); c60=Counter(r['comboset_sorted'] for r in hist if r['date_et']>=d60); c30=Counter(r['comboset_sorted'] for r in hist if r['date_et']>=d30)
    return {cs:zf(c[cs],n*cls(cs)/1000)+zf(c60[cs],n60*cls(cs)/1000)+zf(c30[cs],n30*cls(cs)/1000) for cs in ALLSETS}
VARIANTS={'comp':['comp'],'comp+pair':['comp','pair'],'comp+pair+digit':['comp','pair','digit'],'comp+pair+wkday':['comp','pair','wkday'],
          'comp+pair+digit+wkday':['comp','pair','digit','wkday'],'comp+digit':['comp','digit'],'pair+digit':['pair','digit'],'comp+pair+midpair':['comp','pair','midpair']}
for pn,pool,sess in POOLS:
    pr=defaultdict(list)
    for r in rows:
        if r['session']==sess and (pool is None or r['jurisdiction'] in pool): pr[r['date_et']].append(r)
    acc={(v,w):{5:[0,0.0],10:[0,0.0],'anti':[0,0.0]} for v in VARIANTS for w in WIN}
    for d in dates:
        w=next((wn for wn,(s,e) in WIN.items() if s<=d<=e),None)
        if not w or not pr.get(d): continue
        T={'comp':composite(d,sess,pool),'pair':std(t_pair(d,sess)),'digit':std(t_digit(d,sess)),'wkday':std(t_weekday(d,sess)),'midpair':std(t_pair_mid(d,sess))}
        drawn=Counter(r['comboset_sorted'] for r in pr[d]); nd=len(pr[d])
        for v,parts in VARIANTS.items():
            sc={cs:sum(T[p][cs] for p in parts) for cs in ALLSETS}; ranked=sorted(ALLSETS,key=lambda cs:(-sc[cs],cs))
            for K in (5,10):
                acc[(v,w)][K][0]+=sum(drawn[cs] for cs in ranked[:K]); acc[(v,w)][K][1]+=sum(nd*cls(cs)/1000 for cs in ranked[:K])
            acc[(v,w)]['anti'][0]+=sum(drawn[cs] for cs in ranked[-5:]); acc[(v,w)]['anti'][1]+=sum(nd*cls(cs)/1000 for cs in ranked[-5:])
    print(f"\n== {pn} ==\n{'variant':24s} | {'IS top5 (z)':18s} {'IS top10 (z)':18s} {'IS anti5':14s} | {'OOS top5 (z)':18s} {'OOS top10 (z)':18s} {'OOS anti5':14s}")
    for v in VARIANTS:
        a=acc[(v,'IS 7/01→11/02')]; b=acc[(v,'OOS 5/01→6/30')]
        f=lambda x:f"{x[0]:3d}/{x[1]:5.1f} ({zf(*x):+.2f})"
        print(f"{v:24s} | {f(a[5]):18s} {f(a[10]):18s} {f(a['anti']):14s} | {f(b[5]):18s} {f(b[10]):18s} {f(b['anti']):14s}",flush=True)
