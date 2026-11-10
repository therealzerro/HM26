"""Drill-down for a box ticket (operator 11/10). Sets + end date are fixed at the top; edit SETS / PREV to reuse.
  python3 scripts/picks/drill_boxes.py <cache dir>
Per set: session / weekday / month counts vs expectation, orders, states, days with a draw, two-day windows, day after a 2+ day.
Then the ticket backfilled at 6B, the pair+digit top-3 selector walk-forward, and the 46 pair. histories only (BUG-162)."""
import sys, json, datetime as dt, statistics as st
from collections import Counter, defaultdict
sys.path.insert(0,'scripts/picks'); import hm_data as H
hist=H.histories(sys.argv[1], max_age=7200)
PREV='2026-11-09'; hist=[r for r in hist if r['date_et']<=PREV]
SETS=['{4,6,9}','{4,4,6}','{4,5,6}']
byd=defaultdict(list)
for r in hist: byd[r['date_et']].append(r)
days=sorted(byd); N=len(hist)
def since(n): return (dt.date.fromisoformat(PREV)-dt.timedelta(n-1)).isoformat()
PAY={6:37.5,3:75.0}
for cs in SETS:
    k=H.cls(cs); p=k/1000; m=[r for r in hist if r['comboset_sorted']==cs]
    print(f"\n=== {cs} ({k}-way) — {len(m)} draws / {N*p:.1f} exp since 4/01")
    for lab,f in (('midday',lambda r:r['session']=='midday'),('evening',lambda r:r['session']=='evening'),
                  ('Tuesdays',lambda r:dt.date.fromisoformat(r['date_et']).weekday()==1),('Wednesdays',lambda r:dt.date.fromisoformat(r['date_et']).weekday()==2)):
        n=sum(1 for r in hist if f(r)); c=sum(1 for r in m if f(r)); print(f"  {lab:10} {c:3} / {n*p:5.1f} exp ({n} draws)")
    mo=Counter(r['date_et'][:7] for r in m); mn=Counter(r['date_et'][:7] for r in hist)
    print("  by month: "+' · '.join(f"{x[5:]} {mo[x]}/{mn[x]*p:.1f}" for x in sorted(mn)))
    oa=Counter(r['result_digits'] for r in m); o60=Counter(r['result_digits'] for r in m if r['date_et']>=since(60))
    print("  orders all: "+' '.join(f"{o}×{c}" for o,c in oa.most_common())+"  | 60d: "+' '.join(f"{o}×{c}" for o,c in o60.most_common()))
    s60=Counter(r['jurisdiction'] for r in m if r['date_et']>=since(60)); sa=Counter(r['jurisdiction'] for r in m)
    print("  states 60d: "+' '.join(f"{o}×{c}" for o,c in s60.most_common(8))+f"  ({len(s60)} states) | all-time top: "+' '.join(f"{o}×{c}" for o,c in sa.most_common(5))+f" ({len(sa)} states)")
    print("  last 8: "+' · '.join(f"{r['jurisdiction']} {r['result_digits']} {r['date_et'][5:]}{r['session'][0]}" for r in m[-8:]))
    dd=Counter(r['date_et'] for r in m)
    for lab,ds in (('all',days),('60d',[d for d in days if d>=since(60)]),('30d',[d for d in days if d>=since(30)]),('14d',[d for d in days if d>=since(14)])):
        h=[dd[d] for d in ds]; e=st.mean([1-(1-p)**len(byd[d]) for d in ds])
        print(f"  days with ≥1 draw {lab:3}: {sum(x>0 for x in h)} of {len(ds)} ({100*sum(x>0 for x in h)/len(ds):.0f}% · exp {100*e:.0f}%) · 2+ draws {sum(x>1 for x in h)} days")
    print("  last 14 days, draws per day: "+' '.join(f"{d[8:]}:{dd[d]}" for d in days[-14:]))
    # two-day windows
    w=[(dd[days[i]]+dd[days[i+1]]) for i in range(len(days)-1)]; w60=w[-60:]
    print(f"  two-day windows with ≥1 draw: all {sum(x>0 for x in w)}/{len(w)} ({100*sum(x>0 for x in w)/len(w):.0f}%) · last 60 {sum(x>0 for x in w60)}/60")
    # after a day with 2+ draws: next-day count vs exp (this set)
    nx=[(dd[days[i+1]],len(byd[days[i+1]])) for i in range(len(days)-1) if dd[days[i]]>=2]
    if nx: print(f"  day after a 2+ draw day ({len(nx)} times): {sum(a for a,_ in nx)} draws / {sum(b for _,b in nx)*p:.1f} exp")
# combined ticket record at 6B
print("\n=== TICKET RECORD — the three boxes at 6B on every draw (backfilled; the sets were chosen 11/10 on 11/09 data)")
def daynet(d, sets, u=6):
    rows=byd[d]; cost=len(rows)*0.25*u*len(sets); paid=sum(PAY[H.cls(r['comboset_sorted'])]*u for r in rows if r['comboset_sorted'] in sets); return cost,paid,sum(r['comboset_sorted'] in sets for r in rows)
for lab,ds in (('4/01→11/09',days),('last 60d',[d for d in days if d>=since(60)]),('last 30d',[d for d in days if d>=since(30)]),('last 7d',days[-7:])):
    x=[daynet(d,SETS) for d in ds]; c=sum(a for a,_,_ in x); pd_=sum(b for _,b,_ in x); mt=sum(n for *_,n in x)
    e=sum(len(byd[d]) for d in ds)*0.015
    print(f"  {lab:11} {len(ds):3} days · matches {mt} / {e:.1f} exp · days with ≥1 match {sum(n>0 for *_,n in x)} · positive days {sum(b>a for a,b,_ in x)} · staked ${c:,.2f} paid ${pd_:,.2f} net ${pd_-c:+,.2f}")
print("  last 14 days (matches · net): "+' | '.join(f"{d[5:]} {daynet(d,SETS)[2]} {daynet(d,SETS)[1]-daynet(d,SETS)[0]:+.0f}" for d in days[-14:]))
# selector walk-forward
SP={cs:sorted(set(H.pairs(H.digs(cs)))) for cs in H.ALLSETS}
G={k:[c for c in H.ALLSETS if H.cls(c)==k] for k in (6,3,1)}
def top3(d):
    ref=byd[d]; pc=Counter(p for r in ref for p in set(H.pairs(r['result_digits']))); dc=Counter(ch for r in ref for ch in r['result_digits'])
    z={}
    for val in ({cs:sum(pc[p] for p in SP[cs]) for cs in H.ALLSETS},{cs:sum(dc[ch] for ch in H.digs(cs)) for cs in H.ALLSETS}):
        for k,g in G.items():
            mu=st.mean([val[c] for c in g]); sd=st.pstdev([val[c] for c in g]) or 1
            for c in g: z[c]=z.get(c,0)+(val[c]-mu)/sd
    return sorted([c for c in H.ALLSETS if H.cls(c)>1], key=lambda c:(-z[c],c))[:3]
print("\n=== SELECTOR RECORD — every day since 4/02: top-3 non-triple by pair+digit on day D−1, boxed 6B on all draws (walk-forward)")
rec=[]
for i in range(1,len(days)):
    s=top3(days[i-1]); a=daynet(days[i],s); b=daynet(days[i+1],s) if i+1<len(days) else None
    exp=sum(H.cls(c)/1000 for c in s)*len(byd[days[i]]); rec.append((days[i],s,a,b,exp))
for lab,rr in (('4/02→11/09',rec),('last 60d',rec[-60:]),('last 30d',rec[-30:])):
    c=sum(a[0] for _,_,a,_,_ in rr); p_=sum(a[1] for _,_,a,_,_ in rr); mt=sum(a[2] for _,_,a,_,_ in rr); e=sum(x[4] for x in rr)
    print(f"  day D   {lab:11} {len(rr):3} days · matches {mt} / {e:.1f} exp · days ≥1 match {sum(a[2]>0 for _,_,a,_,_ in rr)} · positive days {sum(a[1]>a[0] for _,_,a,_,_ in rr)} · staked ${c:,.2f} paid ${p_:,.2f} net ${p_-c:+,.2f}")
    r2=[x for x in rr if x[3]]
    c=sum(a[0]+b[0] for _,_,a,b,_ in r2); p_=sum(a[1]+b[1] for _,_,a,b,_ in r2)
    print(f"  D + D+1 {lab:11} {len(r2):3} windows · windows ≥1 match {sum(a[2]+b[2]>0 for _,_,a,b,_ in r2)} · positive windows {sum(a[1]+b[1]>a[0]+b[0] for _,_,a,b,_ in r2)} · staked ${c:,.2f} paid ${p_:,.2f} net ${p_-c:+,.2f}")
print("  last 10 days: "+' | '.join(f"{d[5:]} {' '.join(x[1::2].replace(',','') if False else x for x in s)} → {a[2]} match {a[1]-a[0]:+.0f}" for d,s,a,b,e in rec[-10:]))
# pair 46
print("\n=== PAIR 46")
pd_=Counter(); 
for d in days: pd_[d]=sum('46' in set(H.pairs(r['result_digits'])) for r in byd[d])
tot=sum(pd_.values()); print(f"  draws containing 4 and 6: {tot} / {N*0.054:.0f} exp since 4/01 · 60d {sum(pd_[d] for d in days if d>=since(60))} / {sum(len(byd[d]) for d in days if d>=since(60))*0.054:.0f} · 30d {sum(pd_[d] for d in days if d>=since(30))} / {sum(len(byd[d]) for d in days if d>=since(30))*0.054:.0f}")
print("  last 14 days: "+' '.join(f"{d[8:]}:{pd_[d]}" for d in days[-14:])+f"  (≈4 exp per 75-draw day)")
big=[i for i in range(len(days)-1) if pd_[days[i]]>=10]
print(f"  days with 46 in 10+ draws: {len(big)} · next day: "+' '.join(f"{days[i][5:]}({pd_[days[i]]})→{pd_[days[i+1]]}" for i in big)+f" · next-day total {sum(pd_[days[i+1]] for i in big)} / {sum(len(byd[days[i+1]]) for i in big)*0.054:.1f} exp")
anyp=[]; 
for i in range(len(days)-1):
    pc=Counter(p for r in byd[days[i]] for p in set(H.pairs(r['result_digits'])) if p[0]!=p[1])
    for p,c in pc.items():
        if c>=10: anyp.append((sum(p in set(H.pairs(r['result_digits'])) for r in byd[days[i+1]]), len(byd[days[i+1]])))
print(f"  ANY mixed pair in 10+ draws of a day ({len(anyp)} cases) → next day {sum(a for a,_ in anyp)} draws / {sum(b for _,b in anyp)*0.054:.1f} exp")
