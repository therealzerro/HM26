import json, collections, math
import numpy as np
from scipy import stats
rng=np.random.default_rng(7)
rows=json.load(open('data/histories_raw.json'))
for r in rows: r['d']=[int(c) for c in r['result_digits']]
def half(r): return 1 if r['date_et']<='2026-07-11' else 2
out=open('results/followup_log.txt','w')
def P(*a):
    s=' '.join(str(x) for x in a); print(s); out.write(s+'\n')
N=len(rows)
P("=== A. combo 575 ===")
c575=[r for r in rows if r['result_digits']=='575']
P("count",len(c575),"by half",collections.Counter(half(r) for r in c575),"by session",collections.Counter(r['session'] for r in c575))
P("by jur",collections.Counter(r['jurisdiction'] for r in c575))
P("dates",sorted((r['date_et'],r['jurisdiction'],r['session']) for r in c575))
for h in (1,2):
    n=sum(half(r)==h for r in rows); k=sum(half(r)==h for r in c575)
    P(f" H{h}: n={n} 575 count={k} exp={n/1000:.1f} poisson tail p={stats.poisson.sf(k-1,n/1000):.4f}")
# the exact max-count distribution under null: P(max over 1000 combos >= 32) via simulation
sims=rng.multinomial(N,[0.001]*1000,size=20000).max(1)
P(f" P(max combo count over 1000 >= 32 | fair, N={N}) simulated = {np.mean(sims>=32):.4f}; null median max = {np.median(sims)}")
# box set 557
s557=[r for r in rows if ''.join(sorted(r['result_digits']))=='557']
P("set 557 count",len(s557),"by permutation",collections.Counter(r['result_digits'] for r in s557),"by half",collections.Counter(half(r) for r in s557))
P(f" exp set 557 = {N*0.003:.1f}; P(max over 220 sets tail p <= 0.0102) ≈ {1-(1-0.0102)**220:.3f}")
# 575 expected return at 900:1 if the observed rate were real: 32/14510
P(f" 575 naive observed rate {len(c575)/N:.5f} -> EV at 900:1 = {900*len(c575)/N:.3f}; H2-only rate {sum(half(r)==2 for r in c575)/sum(half(r)==2 for r in rows):.5f}")

P("\n=== B. top max-digit cells: half-split replication ===")
cells=collections.defaultdict(list)
for r in rows: cells[(r['jurisdiction'],r['session'])].append(r)
for (j,s,pos,dig) in [('WI','evening',0,0),('CT','evening',0,4),('NY','midday',0,0),('NC','evening',2,5),('IN','midday',0,5),('AR','midday',2,6),('TX','midday',2,8),('CA','midday',0,0),('MS','midday',0,8)]:
    rs=cells[(j,s)]
    tot=sum(r['d'][pos]==dig for r in rs)
    parts=[]
    for h in (1,2):
        hh=[r for r in rs if half(r)==h]; k=sum(r['d'][pos]==dig for r in hh); n=len(hh)
        parts.append(f"H{h}: {k}/{n}={k/n:.3f} (binom p={stats.binom.sf(k-1,n,0.1):.3f})")
    # monthly
    mon=collections.defaultdict(lambda:[0,0])
    for r in rs: m=r['date_et'][:7]; mon[m][1]+=1; mon[m][0]+= r['d'][pos]==dig
    P(f" {j} {s} pos{pos+1} digit {dig}: total {tot}/{len(rs)}={tot/len(rs):.3f} | "+' | '.join(parts)+" | monthly "+' '.join(f"{m[5:]}:{v[0]}/{v[1]}" for m,v in sorted(mon.items())))
# WI evening pos1 digit 0: EV if true
f=37/197
P(f" WI ev pos1 digit0: if p truly {f:.3f}, straight EV at 900:1 (other positions fair) = {900*f*0.01:.3f}; shrunk estimate: posterior mean under Beta(10,90) prior-ish = {(37+10)/(197+100):.3f} -> EV {900*(37+10)/(197+100)*0.01:.3f}")
P(f" Bonferroni over 210 cells x 10 digits of raw binom p 1.0e-4 for 37/197: {2100*stats.binom.sf(36,197,0.1):.3f}")
P(f" null simulation: P(any of 210 cells with its actual n has a digit at freq >= 0.188): ")
hits=0; S=2000
ns=[len(v) for v in cells.values()]
for _ in range(S):
    ok=False
    for n in ns:
        for pos in range(3):
            if rng.multinomial(n,[0.1]*10).max()/n>=0.188: ok=True;break
        if ok: break
    hits+=ok
P(f"   = {hits/S:.3f}")

P("\n=== C. serial tests with within-day order randomized (lumped multi-row cells) ===")
def pair_chi(a,b):
    t=np.zeros((10,10)); np.add.at(t,(a,b),1); e=np.outer(t.sum(1),t.sum(0))/t.sum(); return float(((t-e)**2/e).sum())
def runs_z(x):
    x=np.asarray(x); n1=x.sum(); n0=len(x)-n1; R=1+np.sum(x[1:]!=x[:-1]); mu=1+2*n1*n0/(n1+n0); var=2*n1*n0*(2*n1*n0-n1-n0)/((n1+n0)**2*(n1+n0-1)); return (R-mu)/math.sqrt(var)
for (j,s) in [('TX','evening'),('GA','evening'),('DC','evening'),('TN','midday'),('TX','midday'),('NJ','midday'),('IA','evening'),('NY','midday'),('ON','evening'),('CA','evening')]:
    rs=cells[(j,s)]; byd=collections.defaultdict(list)
    for r in rs: byd[r['date_et']].append(r)
    multi=sum(len(v)>1 for v in byd.values())
    res={'lag1':[], 'runs':[]}
    for rep in range(200):
        seq=[]
        for d in sorted(byd):
            v=list(byd[d]); rng.shuffle(v); seq+=[r['d'][0] for r in v]
        seq=np.array(seq)
        st=pair_chi(seq[:-1],seq[1:]); perm=[pair_chi(seq[:-1],rng.permutation(seq[1:])) for _ in range(200)]
        res['lag1'].append((np.sum(np.array(perm)>=st)+1)/201)
        res['runs'].append(runs_z(seq>=5))
    # sorted-order (as in audit.py)
    seqs=np.array([r['d'][0] for r in sorted(rs,key=lambda r:(r['date_et'],r['result_digits']))])
    P(f" {j} {s} pos1 n={len(rs)} multi-row days={multi}: sorted-order runs z={runs_z(seqs>=5):.2f}; within-day-shuffled: median lag1 perm p={np.median(res['lag1']):.3f} (IQR {np.percentile(res['lag1'],25):.3f}-{np.percentile(res['lag1'],75):.3f}), runs z median={np.median(res['runs']):.2f} (IQR {np.percentile(res['runs'],25):.2f}..{np.percentile(res['runs'],75):.2f})")
# Alternative for lumped cells: lag-2 within sorted stream pairs same bucket? Not identifiable. Also test day-to-day: first-row-of-day sequence (lowest digits) is biased; instead use day-level: does any digit of day t predict day t+1 — use min/max invariant: set of pos1 digits of day t vs day t+1 (both rows), chi2 on (digit in day t) x (digit in day t+1) pairs
P("\n day-to-day dependence for lumped cells (all pos1 digits day t x all pos1 digits day t+1, permutation p):")
for (j,s) in [('TX','evening'),('GA','evening'),('DC','evening'),('TN','midday'),('TX','midday')]:
    rs=cells[(j,s)]; byd=collections.defaultdict(list)
    for r in rs: byd[r['date_et']].append(r['d'][0])
    days=sorted(byd); a=[];b=[]
    for d0,d1 in zip(days[:-1],days[1:]):
        for x in byd[d0]:
            for y in byd[d1]: a.append(x);b.append(y)
    a=np.array(a);b=np.array(b); st=pair_chi(a,b)
    # permute days
    perm=[]
    for _ in range(500):
        pd=rng.permutation(len(days)); bb=[]
        for i in range(len(days)-1):
            for x in byd[days[i]]:
                for y in byd[days[pd[i+1]] if False else days[(i+1)]]: pass
        # simpler: permute day labels of the "next day" block
        order=rng.permutation(len(days)-1); b2=[]
        for i in range(len(days)-1):
            nxt=byd[days[order[i]+1]]
            for x in byd[days[i]]:
                for y in nxt: b2.append(y)
        # lengths may differ when day sizes differ; align by truncation
        a2=[];
        for i in range(len(days)-1):
            nxt=byd[days[order[i]+1]]
            for x in byd[days[i]]:
                for y in nxt: a2.append(x)
        perm.append(pair_chi(np.array(a2),np.array(b2)))
    P(f" {j} {s}: pairs={len(a)} chi2={st:.1f} day-permutation p={(np.sum(np.array(perm)>=st)+1)/501:.3f}")
out.close()
