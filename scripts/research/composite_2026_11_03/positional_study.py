import json,sys,datetime as dt,math,random
import numpy as np
from collections import Counter,defaultdict
from scipy import stats
random.seed(7); np.random.seed(7)
rows=json.load(open(sys.argv[1]))
# exclude DC 4/01–4/21 RNG fault window (ENG-REVIEW-04) so a known defect cannot masquerade as a pattern
rows=[r for r in rows if not (r['jurisdiction']=='DC' and r['date_et']<='2026-04-21')]
for r in rows: r['d']=[int(c) for c in r['result_digits']]; r['wd']=dt.date.fromisoformat(r['date_et']).weekday()
FIT_END='2026-08-31'
fit=[r for r in rows if r['date_et']<=FIT_END]; hold=[r for r in rows if r['date_et']>FIT_END]
print(f"rows {len(rows)} (DC 4/01–4/21 excluded) | fit ≤{FIT_END}: {len(fit)} | hold-out: {len(hold)}")
def bh(pvals,q=0.10):
    p=np.array(pvals); n=len(p); order=np.argsort(p); ranked=p[order]*n/np.arange(1,n+1)
    thr=ranked<=q; k=np.max(np.where(thr)[0])+1 if thr.any() else 0
    return k  # number of survivors
def chi_digits(sub,pos):
    c=np.bincount([r['d'][pos] for r in sub],minlength=10); e=len(sub)/10
    return stats.chisquare(c,[e]*10).pvalue,c
print("\n=== A. MARGINALS per position (digit 0–9 uniform?) ===")
for pos in range(3):
    p,c=chi_digits(rows,pos); print(f" pos{pos+1} all      n={len(rows)} chi2 p={p:.3f} counts {c.tolist()} max/min {c.max()/len(rows):.4f}/{c.min()/len(rows):.4f}")
for sess in ('midday','evening'):
    for pos in range(3):
        p,c=chi_digits([r for r in rows if r['session']==sess],pos); print(f" pos{pos+1} {sess:7} chi2 p={p:.3f}")
# weekday × position
pw=[]
for wd in range(7):
    for pos in range(3):
        sub=[r for r in rows if r['wd']==wd]; p,c=chi_digits(sub,pos); pw.append(p)
print(f" weekday×position: 21 tests, min p={min(pw):.3f}, BH(q=.10) survivors {bh(pw)}")
# state×session×position cells with replication
cells=[]
for (st_,sess),grp in defaultdict(list,{k:[r for r in rows if (r['jurisdiction'],r['session'])==k] for k in {(r['jurisdiction'],r['session']) for r in rows}}).items():
    if len(grp)<150: continue
    for pos in range(3):
        p,c=chi_digits(grp,pos)
        f=[r for r in grp if r['date_et']<=FIT_END]; h=[r for r in grp if r['date_et']>FIT_END]
        cf=np.bincount([r['d'][pos] for r in f],minlength=10)/max(len(f),1)-0.1; ch=np.bincount([r['d'][pos] for r in h],minlength=10)/max(len(h),1)-0.1
        cells.append((p,st_,sess,pos,len(grp),c,np.corrcoef(cf,ch)[0,1] if len(h)>30 else float('nan')))
ps=[c[0] for c in cells]; print(f" state×session×position: {len(cells)} cells (n≥150), BH(q=.10) survivors {bh(ps)}, min p {min(ps):.4f}")
cells.sort(); 
for p,st_,sess,pos,n,c,rep in cells[:6]: print(f"   {st_:9} {sess:7} pos{pos+1} n={n} p={p:.4f} top digit {int(np.argmax(c))} at {c.max()/n:.3f} | fit→hold deviation corr {rep:+.2f}")
allrep=[c[6] for c in cells if not math.isnan(c[6])]; print(f" mean fit→hold deviation correlation over all cells: {np.mean(allrep):+.3f} (null 0; a real per-state positional bias would replicate as positive)")
print("\n=== B. WITHIN-DRAW cross-position dependence (is pos i independent of pos j?) ===")
for sess in ('all','midday','evening'):
    sub=rows if sess=='all' else [r for r in rows if r['session']==sess]
    for a,b in ((0,1),(0,2),(1,2)):
        M=np.zeros((10,10),int)
        for r in sub: M[r['d'][a],r['d'][b]]+=1
        chi2,p,dof,_=stats.chi2_contingency(M)
        eq=np.trace(M)/len(sub); adj=sum(M[i,j] for i in range(10) for j in range(10) if abs(i-j)==1)/len(sub)
        print(f" {sess:7} pos{a+1}×pos{b+1}: chi2 p={p:.3f} | P(equal)={eq:.4f} (0.100) | P(|diff|=1)={adj:.4f} (0.180)")
# positional pair carryover: does a positional pair seen yesterday repeat today more than chance? (the straight scorer's pair term)
print("\n=== C. WITHIN-STATE serial dependence per position (same state+session, consecutive draw days with exactly one row each) ===")
bykey=defaultdict(list)
for r in rows: bykey[(r['jurisdiction'],r['session'],r['date_et'])].append(r)
series=defaultdict(list)
for (j,s,d),g in sorted(bykey.items()):
    if len(g)==1: series[(j,s)].append((d,g[0]))
def pairs_lag(lag,per=None):
    out=[]
    for (j,s),lst in series.items():
        for i in range(len(lst)-lag):
            d0,r0=lst[i]; d1,r1=lst[i+lag]
            if (dt.date.fromisoformat(d1)-dt.date.fromisoformat(d0)).days>lag+2: continue
            if per=='fit' and d1>FIT_END: continue
            if per=='hold' and d1<=FIT_END: continue
            out.append((r0,r1,j,s))
    return out
for lag in (1,2,3,5):
    P=pairs_lag(lag)
    line=f" lag {lag} (n={len(P)}): "
    for pos in range(3):
        rep=sum(a['d'][pos]==b['d'][pos] for a,b,_,_ in P)/len(P)
        M=np.zeros((10,10),int)
        for a,b,_,_ in P: M[a['d'][pos],b['d'][pos]]+=1
        _,p,_,_=stats.chi2_contingency(M)
        line+=f"pos{pos+1} P(repeat)={rep:.4f} z={(rep-0.1)/math.sqrt(0.09/len(P)):+.2f} transition-matrix p={p:.3f} | "
    print(line)
# per-state repeat rates lag 1 with BH + replication
P1=pairs_lag(1); st_cells=[]
for (j,s) in {(j,s) for _,_,j,s in P1}:
    sub=[(a,b) for a,b,jj,ss in P1 if (jj,ss)==(j,s)]
    for pos in range(3):
        k=sum(a['d'][pos]==b['d'][pos] for a,b in sub); n=len(sub)
        p=stats.binomtest(k,n,0.1).pvalue
        hf=[(a,b) for a,b in sub if b['date_et']<=FIT_END]; hh=[(a,b) for a,b in sub if b['date_et']>FIT_END]
        rf=sum(a['d'][pos]==b['d'][pos] for a,b in hf)/max(len(hf),1); rh=sum(a['d'][pos]==b['d'][pos] for a,b in hh)/max(len(hh),1)
        st_cells.append((p,j,s,pos,k,n,rf,rh))
st_cells.sort(); print(f" per state×session×position lag-1 repeat: {len(st_cells)} cells, BH(q=.10) survivors {bh([c[0] for c in st_cells])}")
for p,j,s,pos,k,n,rf,rh in st_cells[:5]: print(f"   {j:9} {s:7} pos{pos+1} {k}/{n} = {k/n:.3f} p={p:.4f} | fit {rf:.3f} → hold {rh:.3f}")
dev_f=[c[6]-0.1 for c in st_cells]; dev_h=[c[7]-0.1 for c in st_cells]; print(f" fit→hold correlation of per-cell repeat deviations: {np.corrcoef(dev_f,dev_h)[0,1]:+.3f}")
print("\n=== D. WITHIN-STATE cross-position lag-1 (digit at pos i today = digit at pos j next draw?) ===")
for a in range(3):
    line=f" from pos{a+1}: "
    for b in range(3):
        if a==b: continue
        rep=sum(x['d'][a]==y['d'][b] for x,y,_,_ in P1)/len(P1); line+=f"→pos{b+1} {rep:.4f} (z {(rep-0.1)/math.sqrt(0.09/len(P1)):+.2f})  "
    print(line)
anyrep=sum(len(set(x['d'])&set(y['d']))>0 for x,y,_,_ in P1)/len(P1)
# expected P(share ≥1 digit) under independence depends on class mix; estimate by shuffling y within pool
ys=[y for _,y,_,_ in P1]; xs=[x for x,_,_,_ in P1]; sh=[]
for _ in range(20):
    random.shuffle(ys); sh.append(sum(len(set(x['d'])&set(y['d']))>0 for x,y in zip(xs,ys))/len(P1))
print(f" P(next draw shares ≥1 digit with today, same state+session) = {anyrep:.4f} vs shuffled {np.mean(sh):.4f}±{np.std(sh):.4f}")
print("\n=== E. NATIONWIDE day-to-day positional carryover (do today's positional digit frequencies predict tomorrow's?) ===")
bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
dates=sorted({r['date_et'] for r in rows})
def vec(g): 
    v=np.zeros(30)
    for r in g:
        for i in range(3): v[i*10+r['d'][i]]+=1
    return v/len(g)-0.1 if g else None
for lbl,src,dst in (('mid→next mid','midday','midday'),('eve→next eve','evening','evening'),('eve→next-day mid','evening','midday'),('mid→same-day eve','midday','evening')):
    cs={'fit':[],'hold':[]}
    for i,d in enumerate(dates):
        d2=d if lbl=='mid→same-day eve' else (dt.date.fromisoformat(d)+dt.timedelta(1)).isoformat()
        g1=bydate.get((d,src),[]); g2=bydate.get((d2,dst),[])
        if len(g1)<20 or len(g2)<20: continue
        c=np.corrcoef(vec(g1),vec(g2))[0,1]; cs['fit' if d2<=FIT_END else 'hold'].append(c)
    # permutation null: pair with a random other day
    allv=[vec(bydate[(d,dst)]) for d in dates if len(bydate.get((d,dst),[]))>=20]; null=[]
    for _ in range(300):
        i,j=random.sample(range(len(allv)),2); null.append(np.corrcoef(allv[i],allv[j])[0,1])
    print(f" {lbl:18} mean corr fit {np.mean(cs['fit']):+.4f} (n {len(cs['fit'])}, se {np.std(cs['fit'])/math.sqrt(len(cs['fit'])):.4f}) | hold {np.mean(cs['hold']):+.4f} (n {len(cs['hold'])}, se {np.std(cs['hold'])/math.sqrt(len(cs['hold'])):.4f}) | random-day null {np.mean(null):+.4f}±{np.std(null)/math.sqrt(300):.4f}")
# single most-frequent positional digit yesterday → today's rate
print(" rule 'yesterday's top digit at pos i (both sessions) → today's rate at pos i':")
for pos in range(3):
    hits=[0,0]; n=[0,0]
    for i in range(len(dates)-1):
        g=bydate.get((dates[i],'midday'),[])+bydate.get((dates[i],'evening'),[]); g2=bydate.get((dates[i+1],'midday'),[])+bydate.get((dates[i+1],'evening'),[])
        if len(g)<30 or not g2: continue
        top=Counter(r['d'][pos] for r in g).most_common(1)[0][0]; per=0 if dates[i+1]<=FIT_END else 1
        hits[per]+=sum(r['d'][pos]==top for r in g2); n[per]+=len(g2)
    print(f"   pos{pos+1}: fit {hits[0]}/{n[0]} = {hits[0]/n[0]:.4f} | hold {hits[1]}/{n[1]} = {hits[1]/n[1]:.4f} (0.1000 null; se ≈ {math.sqrt(0.09/n[1]):.4f})")
print("\n=== F. POSITIONAL DUE (within state+session+position: draws since digit d last appeared → P(d appears now)) ===")
buckets=[(0,4),(5,9),(10,19),(20,39),(40,79),(80,10**6)]; agg={b:[0,0,0,0] for b in buckets}  # fit hits, fit n, hold hits, hold n
maxgap=[]
for (j,s),lst in series.items():
    last={}
    for idx,(d,r) in enumerate(lst):
        for pos in range(3):
            for dgt in range(10):
                key=(pos,dgt)
                if key in last:
                    gap=idx-last[key]-1
                    for b in buckets:
                        if b[0]<=gap<=b[1]:
                            o=0 if d<=FIT_END else 2
                            agg[b][o+1]+=1; agg[b][o]+=(r['d'][pos]==dgt); break
            if idx==len(lst)-1:
                for dgt in range(10): maxgap.append((idx-last.get((pos,dgt),-1)-1,j,s,pos,dgt))
        for pos in range(3): last[(pos,r['d'][pos])]=idx
for b in buckets:
    f,fn,h,hn=agg[b]; print(f" gap {b[0]:>2}–{b[1] if b[1]<10**6 else '∞':>3}: fit {f}/{fn} = {f/fn:.4f} | hold {h}/{hn} = {h/hn:.4f}   (0.1000 null)")
maxgap.sort(reverse=True); print(" longest current positional absences (state, session, pos, digit, draws since):",[(j,s,f"pos{p+1}",d,g) for g,j,s,p,d in maxgap[:6]])
print("\n=== G. POSITIONAL PAIR carryover (positional pair seen in reference block → repeats next session? the straight scorer's pair term) ===")
for lbl,src,dst in (('eve→next mid','evening','midday'),('mid→same-day eve','midday','evening')):
    res={'fit':[0,0],'hold':[0,0]}
    for d in dates:
        d2=d if src=='midday' else (dt.date.fromisoformat(d)+dt.timedelta(1)).isoformat()
        g1=bydate.get((d,src),[]); g2=bydate.get((d2,dst),[])
        if len(g1)<20 or not g2: continue
        seen={(a,b,r['d'][a],r['d'][b]) for r in g1 for a,b in ((0,1),(0,2),(1,2))}
        per='fit' if d2<=FIT_END else 'hold'
        for r in g2:
            res[per][0]+=sum((a,b,r['d'][a],r['d'][b]) in seen for a,b in ((0,1),(0,2),(1,2))); res[per][1]+=3
        # expected = |seen|/300 per positional pair slot, accumulate separately
        res.setdefault(per+'_e',0); res[per+'_e']=res.get(per+'_e',0)+len(g2)*3*len(seen)/300
    print(f" {lbl:17} fit {res['fit'][0]}/{res['fit'][1]} = {res['fit'][0]/res['fit'][1]:.4f} vs exp {res['fit_e']/res['fit'][1]:.4f} | hold {res['hold'][0]}/{res['hold'][1]} = {res['hold'][0]/res['hold'][1]:.4f} vs exp {res['hold_e']/res['hold'][1]:.4f}")
