import json,sys,datetime as dt,math,random
import numpy as np
from collections import Counter,defaultdict
from scipy import stats
random.seed(11); rng=np.random.default_rng(11)
rows=json.load(open(sys.argv[1])); rows=[r for r in rows if not (r['jurisdiction']=='DC' and r['date_et']<='2026-04-21')]
FIT_END='2026-08-31'
byday=defaultdict(list)
for r in rows: byday[r['date_et']].append(r)
days=sorted(byday)
CL=lambda cs:len(set(cs[1::2]))  # 3 single 2 double 1 triple
def setkey(x): return ''.join(sorted(f"{x:03d}"))
SK=np.array([len(set(f"{i:03d}")) for i in range(1000)])
print(f"days {len(days)} ({days[0]}→{days[-1]}), draws {len(rows)}, mean draws/day {len(rows)/len(days):.1f}")
# ---- 1. multiplicity per day vs simulation ----
obs=Counter(); sim=Counter(); obs_exact=0; sim_exact=0.0; NSIM=400
obs_days_with=Counter(); sim_days_with=Counter()
multi_sets=[]  # (day, set, count, rows)
for d in days:
    g=byday[d]; N=len(g)
    c=Counter(r['comboset_sorted'] for r in g)
    m=[(s,k) for s,k in c.items() if k>=2]
    for s,k in m: obs[k]+=1; multi_sets.append((d,s,k,[r for r in g if r['comboset_sorted']==s]))
    obs_days_with[len(m)]+=1
    ce=Counter(r['result_digits'] for r in g); obs_exact+=sum(1 for v in ce.values() if v>=2)
    draws=rng.integers(0,1000,size=(NSIM,N))
    for row in draws:
        cs=Counter(setkey(x) for x in row); mm=[k for k in cs.values() if k>=2]
        for k in mm: sim[k]+=1/NSIM
        sim_days_with[len(mm)]+=1/NSIM
        sim_exact+=sum(1 for v in Counter(row.tolist()).values() if v>=2)/NSIM
print("\n=== 1. Sets drawn k times in one day (all states, both sessions): observed vs uniform simulation (same N per day) ===")
for k in sorted(set(obs)|{k for k in sim if sim[k]>=0.5}):
    print(f" k={k}: observed {obs[k]:4d}  simulated {sim[k]:7.1f}  ratio {obs[k]/sim[k] if sim[k] else float('nan'):.3f}")
print(" days by number of multi-drawn sets: "+' | '.join(f"{n}: obs {obs_days_with[n]} sim {sim_days_with[n]:.1f}" for n in sorted(set(obs_days_with)|{n for n in sim_days_with if sim_days_with[n]>=0.5})))
print(f" exact same straight ≥2× in one day: observed {obs_exact}  simulated {sim_exact:.1f}  ratio {obs_exact/sim_exact:.3f}")
# ---- 2. class mix of multi-drawn sets ----
print("\n=== 2. Class of multi-drawn sets ===")
oc=Counter(CL(s) for d,s,k,_ in multi_sets)
# expected class share of a repeated set ∝ (#sets in class) × p²: singles 120×(.006)² , doubles 90×(.003)², triples 10×(.001)²
w={3:120*0.006**2,2:90*0.003**2,1:10*0.001**2}; tot=sum(w.values()); n=len(multi_sets)
for k,name in ((3,'single'),(2,'double'),(1,'triple')): print(f" {name:6}: observed {oc[k]:4d} ({oc[k]/n:.3f})  expected share {w[k]/tot:.3f} → {n*w[k]/tot:.1f}")
# ---- 3. session mix of the repeats ----
print("\n=== 3. Session mix of same-day repeats (pairs within a multi-drawn set) ===")
pm=Counter(); pe=Counter()
for d in days:
    g=byday[d]; nm=sum(r['session']=='midday' for r in g); ne=len(g)-nm
    tot_pairs=len(g)*(len(g)-1)/2
    if tot_pairs==0: continue
    pe['mid-mid']+=nm*(nm-1)/2/tot_pairs; pe['eve-eve']+=ne*(ne-1)/2/tot_pairs; pe['mid-eve']+=nm*ne/tot_pairs
for d,s,k,rs in multi_sets:
    for i in range(len(rs)):
        for j in range(i+1,len(rs)):
            a,b=sorted([rs[i]['session'],rs[j]['session']]); pm['mid-mid' if a==b=='midday' else 'eve-eve' if a==b=='evening' else 'mid-eve']+=1
tp=sum(pm.values()); te=sum(pe.values())
for k in ('mid-mid','mid-eve','eve-eve'): print(f" {k}: observed {pm[k]:4d} ({pm[k]/tp:.3f})  expected share {pe[k]/te:.3f} → {tp*pe[k]/te:.1f}")
# ---- 4. weekday distribution of multi-drawn sets vs per-day simulation (corrected 11/07: distinct sets, not colliding pairs) ----
print("\n=== 4. Weekday: multi-drawn sets per day vs per-day uniform simulation ===")
wd_obs=Counter(); wd_exp=Counter(); wd_days=Counter()
for d in days:
    g=byday[d]; N=len(g); w_=dt.date.fromisoformat(d).weekday(); wd_days[w_]+=1
    wd_obs[w_]+=sum(1 for k in Counter(r['comboset_sorted'] for r in g).values() if k>=2)
    sims=rng.integers(0,1000,size=(300,N)); wd_exp[w_]+=np.mean([sum(1 for k in Counter(setkey(x) for x in row).values() if k>=2) for row in sims])
for w_ in range(7): print(f" {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][w_]}: days {wd_days[w_]} obs {wd_obs[w_]:3d} exp {wd_exp[w_]:6.1f} z {(wd_obs[w_]-wd_exp[w_])/math.sqrt(wd_exp[w_]):+.2f}")
SP2=120*0.006**2+90*0.003**2+10*0.001**2
# ---- 5. carryover: set drawn ≥2 on day D → drawn on D+1, D+2, D+3..D+7 ----
print("\n=== 5. Carryover after a multi-draw day (set drawn ≥2× on day D) ===")
def rate_after(lagset,per):
    h=e=0
    for d,s,k,_ in multi_sets:
        if per=='fit' and d>FIT_END: continue
        if per=='hold' and d<=FIT_END: continue
        for lag in lagset:
            d2=(dt.date.fromisoformat(d)+dt.timedelta(lag)).isoformat(); g=byday.get(d2,[])
            if not g: continue
            h+=sum(r['comboset_sorted']==s for r in g); e+=len(g)*{3:6,2:3,1:1}[CL(s)]/1000
    return h,e
for lbl,ls in (('D+1',[1]),('D+2',[2]),('D+3',[3]),('D+4..7',[4,5,6,7]),('D+1..3',[1,2,3])):
    hf,ef=rate_after(ls,'fit'); hh,eh=rate_after(ls,'hold')
    print(f" {lbl:7} fit {hf:4d}/{ef:7.1f} ({(hf-ef)/math.sqrt(ef):+.2f}) | hold {hh:4d}/{eh:7.1f} ({(hh-eh)/math.sqrt(eh):+.2f})")
# same-day: set drawn at midday → re-drawn same evening (vs base)
h=e=0; hs=es=0
for d in days:
    g=byday[d]; mids={r['comboset_sorted'] for r in g if r['session']=='midday'}; eves=[r for r in g if r['session']=='evening']
    for s in mids:
        h+=sum(r['comboset_sorted']==s for r in eves); e+=len(eves)*{3:6,2:3,1:1}[CL(s)]/1000
print(f" midday set → same-day evening: {h}/{e:.1f} ({(h-e)/math.sqrt(e):+.2f})")
# ---- 6. triple-and-more days: sets drawn 3+ times — list ----
print("\n=== 6. Sets drawn 3+ times in one day ===")
for d,s,k,rs in sorted([m for m in multi_sets if m[2]>=3],key=lambda m:-m[2]): print(f" {d} {s} ×{k}: "+' '.join(f"{r['jurisdiction']}:{r['result_digits']}({r['session'][:1]})" for r in rs))
# ---- 7. state pairs co-drawing the same set same day vs expectation ----
print("\n=== 7. State pairs sharing a set on the same day ===")
pc=Counter(); days_both=Counter()
states=sorted({r['jurisdiction'] for r in rows})
for d in days:
    g=byday[d]; bys=defaultdict(list)
    for r in g: bys[r['jurisdiction']].append(r['comboset_sorted'])
    js=sorted(bys)
    for i in range(len(js)):
        for j in range(i+1,len(js)):
            a,b=js[i],js[j]; days_both[(a,b)]+=len(bys[a])*len(bys[b])
            pc[(a,b)]+=sum(1 for x in bys[a] for y in bys[b] if x==y)
ps=[]
for k,n in days_both.items():
    o=pc[k]; e=n*SP2*2  # P(two independent draws share a set) = Σ_sets p_s² = SP2... careful: SP2 defined per set over sets; P(match)=Σp²
    ps.append((stats.poisson.sf(o-1,n*SP2) if o>0 else 1.0,k,o,n*SP2))
# fix expectation: P(two draws same set)=Σ_s p_s² = 120*.006²+90*.003²+10*.001² = SP2
ps=[(stats.poisson.sf(o-1,e) if o>0 else 1.0,k,o,e) for p,k,o,e in [(p,k,o,days_both[k]*SP2) for p,k,o,_ in ps]]
ps.sort(); tot_o=sum(o for _,_,o,_ in ps); tot_e=sum(e for *_,e in ps)
print(f" all pairs: observed {tot_o} expected {tot_e:.1f} (z {(tot_o-tot_e)/math.sqrt(tot_e):+.2f}); {len(ps)} state pairs tested")
m=len(ps); srt=sorted(p for p,*_ in ps); bh=max([i+1 for i,p in enumerate(srt) if p<=0.10*(i+1)/m],default=0)
print(f" BH(q=.10) survivors: {bh}")
for p,k,o,e in ps[:6]: print(f"   {k[0]:9}×{k[1]:9} obs {o:2d} exp {e:4.1f} p={p:.4f}")
# ---- 8. multi-drawn set: was it drawn the day before? (lead-in) ----
print("\n=== 8. Lead-in: was a multi-drawn set also drawn on D−1? ===")
h=e=0
for d,s,k,_ in multi_sets:
    d0=(dt.date.fromisoformat(d)-dt.timedelta(1)).isoformat(); g=byday.get(d0,[])
    if not g: continue
    h+=sum(r['comboset_sorted']==s for r in g); e+=len(g)*{3:6,2:3,1:1}[CL(s)]/1000
print(f" drawn on D−1: {h}/{e:.1f} ({(h-e)/math.sqrt(e):+.2f})")
# ---- 9. which sets repeat-draw most often across the record vs their own frequency ----
print("\n=== 9. Sets with the most multi-draw days ===")
mc=Counter(s for d,s,k,_ in multi_sets); tot_by_set=Counter(r['comboset_sorted'] for r in rows)
for s,c in mc.most_common(8): print(f" {s} multi-days {c} | total draws {tot_by_set[s]} / exp {len(rows)*{3:6,2:3,1:1}[CL(s)]/1000:.1f}")
# are multi-draw counts just a function of total frequency? correlation across sets
xs=[tot_by_set[s] for s in tot_by_set]; ys=[mc[s] for s in tot_by_set]
print(f" corr(total draws, multi-days) across sets = {np.corrcoef(xs,ys)[0,1]:+.3f} (expected positive by construction)")
