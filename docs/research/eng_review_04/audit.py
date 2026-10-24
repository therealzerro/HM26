import json, collections, math, sys, datetime, csv
import numpy as np
from scipy import stats
rng=np.random.default_rng(20261024)
OUT={}
rows=json.load(open('data/histories_raw.json'))
rows=[r for r in rows if r['jurisdiction'] not in ('MD','PR')]
for r in rows: r['d']=[int(c) for c in r['result_digits']]
rows.sort(key=lambda r:(r['jurisdiction'],r['session'],r['date_et'],r['result_digits']))
N=len(rows); print("N",N)
def cls(d):
    u=len(set(d)); return 'single' if u==3 else ('double' if u==2 else 'triple')
def bset(d): return ''.join(sorted(str(x) for x in d))
def chi_digits(ds):
    n=len(ds); obs=np.bincount(ds,minlength=10)
    if n==0: return (n,obs,float('nan'),float('nan'))
    s,p=stats.chisquare(obs,[n/10]*10); return (n,obs,s,p)
def bh(pvals):
    p=np.asarray(pvals,float); m=len(p); o=np.argsort(p); q=np.empty(m)
    ranked=p[o]*m/np.arange(1,m+1); q[o]=np.minimum.accumulate(ranked[::-1])[::-1]
    return np.minimum(q,1)
log=open('results/audit_log.txt','w')
def P(*a):
    s=' '.join(str(x) for x in a); print(s); log.write(s+'\n')

# ---------- 1. GLOBAL ----------
P("\n=== 1. GLOBAL ===")
g={}
for sess in ['midday','evening','all']:
    sub=[r for r in rows if sess=='all' or r['session']==sess]
    g[sess]={'n':len(sub)}
    for pos in range(3):
        n,obs,s,p=chi_digits(np.array([r['d'][pos] for r in sub]))
        g[sess][f'pos{pos+1}']={'obs':obs.tolist(),'chi2':s,'p':p}
        P(f"{sess:8s} pos{pos+1} n={n} chi2={s:.2f} p={p:.4f} obs={obs.tolist()}")
    cc=collections.Counter(cls(r['d']) for r in sub); n=len(sub)
    obs=[cc['single'],cc['double'],cc['triple']]; exp=[.72*n,.27*n,.01*n]
    s,p=stats.chisquare(obs,exp)
    g[sess]['class']={'obs':obs,'exp':exp,'chi2':s,'p':p}
    P(f"{sess:8s} class obs={obs} rates={[round(x/n,4) for x in obs]} exp={[round(e,1) for e in exp]} chi2={s:.2f} p={p:.4f}")
    # sum of digits
    th=np.zeros(28)
    for a in range(10):
        for b in range(10):
            for c in range(10): th[a+b+c]+=1
    th/=1000
    sums=np.bincount([sum(r['d']) for r in sub],minlength=28)
    # merge tails so expected>=5
    exp=th*n; s,p=stats.chisquare(sums,exp)  # all exp>=5 for n>6000
    g[sess]['sum']={'obs':sums.tolist(),'exp':exp.round(1).tolist(),'chi2':s,'p':p,'mean':float(np.mean([sum(r['d']) for r in sub])),'exp_mean':13.5}
    P(f"{sess:8s} sum-of-digits chi2(df27)={s:.2f} p={p:.4f} mean={np.mean([sum(r['d']) for r in sub]):.3f} (exp 13.5)")
OUT['global']=g

# ---------- 2. PER CELL ----------
P("\n=== 2. PER CELL jur x session x position ===")
cells=collections.defaultdict(list)
for r in rows: cells[(r['jurisdiction'],r['session'])].append(r)
cellstats=[]
for (j,s),rs in sorted(cells.items()):
    for pos in range(3):
        n,obs,st,p=chi_digits(np.array([r['d'][pos] for r in rs]))
        top=int(np.argmax(obs)); 
        cellstats.append({'jur':j,'session':s,'pos':pos+1,'n':n,'chi2':st,'p':p,'obs':obs.tolist(),'top_digit':top,'top_count':int(obs[top]),'top_freq':obs[top]/n})
q=bh([c['p'] for c in cellstats])
for c,qq in zip(cellstats,q): c['q']=float(qq)
P(f"cells={len(cellstats)}; expected # with p<0.01 under null = {len(cellstats)*0.01:.2f}")
for c in sorted(cellstats,key=lambda c:c['p']):
    if c['p']<0.01: P(f"  {c['jur']:9s} {c['session']:8s} pos{c['pos']} n={c['n']} chi2={c['chi2']:.2f} p={c['p']:.5f} q={c['q']:.3f} top={c['top_digit']} x{c['top_count']} ({c['top_freq']:.3f}) obs={c['obs']}")
P("BH FDR 0.05 survivors:",[ (c['jur'],c['session'],c['pos'],round(c['q'],3)) for c in cellstats if c['q']<0.05])
P("min q =",min(c['q'] for c in cellstats))
# uniformity of the p-values themselves
ks=stats.kstest([c['p'] for c in cellstats],'uniform'); P(f"KS test of cell p-values vs U(0,1): D={ks.statistic:.3f} p={ks.pvalue:.3f}")
OUT['cells']=cellstats
# pairwise independence df81 + most common combo
P("\n--- per jur x session: pairwise position independence (df 81) + most common combo ---")
indep=[]
def pair_chi(a,b):
    t=np.zeros((10,10)); np.add.at(t,(a,b),1)
    exp=np.outer(t.sum(1),t.sum(0))/t.sum()
    return float(((t-exp)**2/exp).sum())
for (j,s),rs in sorted(cells.items()):
    D=np.array([r['d'] for r in rs]); n=len(D)
    rec={'jur':j,'session':s,'n':n}
    for (a,b) in [(0,1),(0,2),(1,2)]:
        st=pair_chi(D[:,a],D[:,b]); p=stats.chi2.sf(st,81)
        # permutation p (asymptotics weak with ~2 per cell)
        perm=np.array([pair_chi(D[:,a],rng.permutation(D[:,b])) for _ in range(1000)])
        pp=(np.sum(perm>=st)+1)/(1001)
        rec[f'p{a+1}{b+1}']={'chi2':st,'p_asym':p,'p_perm':pp}
    cnt=collections.Counter(r['result_digits'] for r in rs); combo,m=cnt.most_common(1)[0]
    p1=stats.binom.sf(m-1,n,0.001); pmax=1-(1-p1)**1000
    rec['top_combo']={'combo':combo,'count':m,'exp':n/1000,'p_single':p1,'p_max_of_1000':pmax}
    indep.append(rec)
allp=[rec[k]['p_perm'] for rec in indep for k in ('p12','p13','p23')]
qi=bh(allp)
P(f"pairwise tests={len(allp)}; # perm p<0.01: {sum(p<0.01 for p in allp)} (expected {len(allp)*0.01:.2f}); min BH q={qi.min():.3f}")
for rec in indep:
    flags=[k for k in ('p12','p13','p23') if rec[k]['p_perm']<0.01]
    if flags or rec['top_combo']['p_max_of_1000']<0.05:
        P(f"  {rec['jur']:9s} {rec['session']:8s} n={rec['n']} "+' '.join(f"{k}:chi2={rec[k]['chi2']:.1f} asym={rec[k]['p_asym']:.4f} perm={rec[k]['p_perm']:.4f}" for k in ('p12','p13','p23'))+f" | top combo {rec['top_combo']['combo']} x{rec['top_combo']['count']} (exp {rec['top_combo']['exp']:.2f}) p_single={rec['top_combo']['p_single']:.2e} p_max={rec['top_combo']['p_max_of_1000']:.3f}")
topc=sorted(indep,key=lambda r:r['top_combo']['p_max_of_1000'])[:5]
P("most extreme top combos:",[(r['jur'],r['session'],r['top_combo']['combo'],r['top_combo']['count'],round(r['top_combo']['p_max_of_1000'],3)) for r in topc])
OUT['indep']=indep

# ---------- 3. REPLICATION ----------
P("\n=== 3. REPLICATION first half (<=07-11) vs second half ===")
def half(r): return 1 if r['date_et']<='2026-07-11' else 2
rep=[]
for (j,s),rs in sorted(cells.items()):
    h1=[r for r in rs if half(r)==1]; h2=[r for r in rs if half(r)==2]
    for pos in range(3):
        n1,o1,s1,p1=chi_digits(np.array([r['d'][pos] for r in h1])); n2,o2,s2,p2=chi_digits(np.array([r['d'][pos] for r in h2]))
        if n1==0 or n2==0: continue
        dev1=o1-n1/10; top=int(np.argmax(np.abs(dev1))); sign1=np.sign(dev1[top])
        dev2=o2-n2/10; sign2=np.sign(dev2[top])
        # one-sided binomial for that digit in same direction in half 2
        if sign1>0: pb=stats.binom.sf(o2[top]-1,n2,0.1)
        else: pb=stats.binom.cdf(o2[top],n2,0.1)
        rep.append({'jur':j,'session':s,'pos':pos+1,'n1':n1,'chi2_1':s1,'p1':p1,'top_digit':top,'dev1':float(dev1[top]),'freq1':o1[top]/n1,'n2':n2,'chi2_2':s2,'p2':p2,'dev2':float(dev2[top]),'freq2':o2[top]/n2,'same_sign':bool(sign1==sign2),'binom_p2_same_dir':float(pb),'replicates':bool(sign1==sign2 and p2<0.05)})
sel=[r for r in rep if r['p1']<0.01]
P(f"cells with p<0.01 in H1: {len(sel)} of {len(rep)} (expected {len(rep)*0.01:.2f})")
for r in sel:
    P(f"  {r['jur']:9s} {r['session']:8s} pos{r['pos']} H1 n={r['n1']} chi2={r['chi2_1']:.1f} p={r['p1']:.4f} digit {r['top_digit']} dev={r['dev1']:+.1f} f={r['freq1']:.3f} | H2 n={r['n2']} chi2={r['chi2_2']:.1f} p={r['p2']:.4f} dev={r['dev2']:+.1f} f={r['freq2']:.3f} same_sign={r['same_sign']} binom_same_dir_p={r['binom_p2_same_dir']:.3f} REPLICATES={r['replicates']}")
nrep=sum(r['replicates'] for r in sel)
# chance: P(same sign)~0.5 (slightly less for top digit), P(p2<0.05)=0.05 -> ~0.025 each
P(f"replicating (same digit same sign AND H2 chi2 p<0.05): {nrep} / {len(sel)}; chance expectation ≈ {len(sel)*0.025:.2f} (0.5 x 0.05)")
P(f"same-sign only: {sum(r['same_sign'] for r in sel)} / {len(sel)} (chance ≈ {len(sel)*0.5:.1f})")
# also looser: p1<0.05
sel5=[r for r in rep if r['p1']<0.05]
P(f"looser: H1 p<0.05 cells={len(sel5)} (exp {len(rep)*0.05:.1f}); same-sign={sum(r['same_sign'] for r in sel5)}; replicate={sum(r['replicates'] for r in sel5)} (chance ≈ {len(sel5)*0.025:.2f})")
# correlation of per-cell chi2 across halves
c1=[r['chi2_1'] for r in rep]; c2=[r['chi2_2'] for r in rep]
P(f"Spearman(chi2 H1, chi2 H2) over {len(rep)} cells: rho={stats.spearmanr(c1,c2).statistic:.3f} p={stats.spearmanr(c1,c2).pvalue:.3f}")
# per-digit deviation correlation
d1=[];d2=[]
for (j,s),rs in cells.items():
    h1=[r for r in rs if half(r)==1]; h2=[r for r in rs if half(r)==2]
    if not h1 or not h2: continue
    for pos in range(3):
        o1=np.bincount([r['d'][pos] for r in h1],minlength=10)/len(h1)-0.1; o2=np.bincount([r['d'][pos] for r in h2],minlength=10)/len(h2)-0.1
        d1+=o1.tolist(); d2+=o2.tolist()
P(f"Pearson(digit freq deviation H1, H2) over {len(d1)} cell-digits: r={stats.pearsonr(d1,d2).statistic:.4f} p={stats.pearsonr(d1,d2).pvalue:.3f}")
OUT['replication']=rep

# ---------- 4. SERIAL ----------
P("\n=== 4. SERIAL DEPENDENCE ===")
serial=[]
def trans_chi(seq,lag):
    a=np.array(seq[:-lag]); b=np.array(seq[lag:])
    t=np.zeros((10,10)); np.add.at(t,(a,b),1)
    exp=np.outer(t.sum(1),t.sum(0))/t.sum()
    st=float(((t-exp)**2/exp).sum()); 
    perm=np.array([pair_chi(a,rng.permutation(b)) for _ in range(500)])
    return st, stats.chi2.sf(st,81), (np.sum(perm>=st)+1)/501
def runs_test(x):
    x=np.asarray(x); n1=x.sum(); n0=len(x)-n1
    if n1==0 or n0==0: return float('nan'),float('nan')
    R=1+np.sum(x[1:]!=x[:-1]); mu=1+2*n1*n0/(n1+n0); var=2*n1*n0*(2*n1*n0-n1-n0)/((n1+n0)**2*(n1+n0-1))
    z=(R-mu)/math.sqrt(var); return z, 2*stats.norm.sf(abs(z))
for (j,s),rs in sorted(cells.items()):
    for pos in range(3):
        seq=[r['d'][pos] for r in rs]
        rec={'jur':j,'session':s,'pos':pos+1,'n':len(seq)}
        for lag in (1,2):
            st,pa,pp=trans_chi(seq,lag); rec[f'lag{lag}']={'chi2':st,'p_asym':pa,'p_perm':pp}
        z,p=runs_test([d>=5 for d in seq]); rec['runs']={'z':z,'p':p}
        serial.append(rec)
for key in ('lag1','lag2'):
    ps=[r[key]['p_perm'] for r in serial]; qq=bh(ps)
    P(f"{key}: tests={len(ps)} perm p<0.01: {sum(p<0.01 for p in ps)} (exp {len(ps)*0.01:.2f}); p<0.05: {sum(p<0.05 for p in ps)} (exp {len(ps)*0.05:.1f}); min BH q={qq.min():.3f}")
    for r,q_ in zip(serial,qq):
        if r[key]['p_perm']<0.01: P(f"   {r['jur']} {r['session']} pos{r['pos']} n={r['n']} chi2={r[key]['chi2']:.1f} asym={r[key]['p_asym']:.4f} perm={r[key]['p_perm']:.4f} q={q_:.3f}")
ps=[r['runs']['p'] for r in serial]; qq=bh(ps)
P(f"runs test (digit>=5): p<0.01: {sum(p<0.01 for p in ps)} (exp {len(ps)*0.01:.2f}); p<0.05: {sum(p<0.05 for p in ps)} (exp {len(ps)*0.05:.1f}); min q={qq.min():.3f}")
for r,q_ in zip(serial,qq):
    if r['runs']['p']<0.01: P(f"   {r['jur']} {r['session']} pos{r['pos']} n={r['n']} z={r['runs']['z']:.2f} p={r['runs']['p']:.4f} q={q_:.3f}")
zs=[r['runs']['z'] for r in serial]; P(f"runs z: mean={np.mean(zs):.3f} sd={np.std(zs):.3f} (null 0,1); KS vs N(0,1) p={stats.kstest(zs,'norm').pvalue:.3f}")
OUT['serial']=serial
# same-day repeats
P("\n--- same-day repeats ---")
byday=collections.defaultdict(lambda: collections.defaultdict(list))
for r in rows: byday[r['date_et']][(r['jurisdiction'],r['session'])].append(r)
# P two independent draws share box set
p_same_set=120*0.006**2+90*0.003**2+10*0.001**2
pairs=0; hits=0; sraight=0
for d,m in byday.items():
    for (j,s),rs in m.items():
        if s!='midday': continue
        ev=m.get((j,'evening'),[])
        for a in rs:
            for b in ev:
                pairs+=1; hits+= bset(a['d'])==bset(b['d']); sraight+= a['d']==b['d']
P(f"own midday->evening box repeat: {hits}/{pairs} = {hits/pairs:.5f}; expected {p_same_set:.5f} ({p_same_set*pairs:.1f}); binom p(two-sided)={stats.binomtest(hits,pairs,p_same_set).pvalue:.3f}; straight repeats {sraight} (exp {pairs/1000:.1f})")
OUT['same_day_own']={'pairs':pairs,'box_hits':hits,'exp_p':p_same_set,'straight_hits':sraight}
# cross-jur: set drawn anywhere midday drawn anywhere evening same day
pset={}
for a in range(10):
    for b in range(a,10):
        for c in range(b,10):
            u=len({a,b,c}); pset[f"{a}{b}{c}"]= .006 if u==3 else (.003 if u==2 else .001)
obs_tot=0; exp_tot=0; var_tot=0; days=0; per_day=[]
for d,m in byday.items():
    M=[bset(r['d']) for (j,s),rs in m.items() if s=='midday' for r in rs]
    E=[bset(r['d']) for (j,s),rs in m.items() if s=='evening' for r in rs]
    if not M or not E: continue
    days+=1; nM=len(M); nE=len(E); Ms=set(M); Es=set(E)
    o=len(Ms&Es); 
    # expectation under uniform for both: sum_s P(s in M)P(s in E); condition on M observed: sum_{s in Ms} P(s in E)
    e=sum(1-(1-pset[s])**nE for s in Ms); v=sum((1-(1-pset[s])**nE)*(1-pset[s])**nE for s in Ms)
    obs_tot+=o; exp_tot+=e; var_tot+=v; per_day.append((d,nM,nE,o,round(e,2)))
z=(obs_tot-exp_tot)/math.sqrt(var_tot)
P(f"cross-jurisdiction: days={days}; midday sets re-drawn anywhere evening same day: obs={obs_tot} exp={exp_tot:.1f} (conditioning on observed midday sets, uniform evening) z={z:.2f} p={2*stats.norm.sf(abs(z)):.3f}")
# also rate per midday set: 
nMtot=sum(x[1] for x in per_day); P(f"  per distinct-midday-set rate: {obs_tot/sum(len(set()) or 1 for _ in [0])}" if False else f"  mean midday draws/day={nMtot/days:.1f}, mean evening draws/day={sum(x[2] for x in per_day)/days:.1f}")
OUT['same_day_cross']={'days':days,'obs':obs_tot,'exp':exp_tot,'z':z,'per_day':per_day}

# ---------- 5. DAY OF WEEK ----------
P("\n=== 5. DAY OF WEEK ===")
dow=collections.defaultdict(list)
for r in rows: dow[datetime.date.fromisoformat(r['date_et']).strftime('%a')].append(r)
dw=[]
for day in ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:
    rs=dow[day]; n=len(rs); cc=collections.Counter(cls(r['d']) for r in rs)
    obs=[cc['single'],cc['double'],cc['triple']]; s,p=stats.chisquare(obs,[.72*n,.27*n,.01*n])
    rec={'day':day,'n':n,'class_obs':obs,'class_rates':[round(x/n,4) for x in obs],'class_chi2':s,'class_p':p}
    for pos in range(3):
        n_,o,s_,p_=chi_digits(np.array([r['d'][pos] for r in rs])); rec[f'pos{pos+1}']={'chi2':s_,'p':p_,'obs':o.tolist()}
    dw.append(rec)
ps=[r['class_p'] for r in dw]+[r[f'pos{p}']['p'] for r in dw for p in (1,2,3)]; qq=bh(ps)
for r in dw: P(f"  {r['day']} n={r['n']} class={r['class_rates']} class_p={r['class_p']:.3f} pos_p={[round(r[f'pos{p}']['p'],3) for p in (1,2,3)]}")
P(f"weekday tests={len(ps)}; raw p<0.05: {sum(p<0.05 for p in ps)}; min BH q={qq.min():.3f}")
OUT['dow']=dw

# ---------- 6. EFFECT SIZE SCREEN ----------
P("\n=== 6. EFFECT-SIZE SCREEN ===")
for c in cellstats:
    c['binom_p_top']=float(stats.binom.sf(c['top_count']-1,c['n'],0.1))
    c['binom_p_top_adj10']=float(1-(1-c['binom_p_top'])**10)
qb=bh([c['binom_p_top'] for c in cellstats])
for c,q_ in zip(cellstats,qb): c['binom_q']=float(q_)
P("top-frequency cells (by exact binomial p of the max digit; note max-of-10 selection):")
for c in sorted(cellstats,key=lambda c:c['binom_p_top'])[:12]:
    P(f"  {c['jur']:9s} {c['session']:8s} pos{c['pos']} n={c['n']} digit {c['top_digit']} x{c['top_count']} f={c['top_freq']:.3f} binom_p={c['binom_p_top']:.4f} adj10={c['binom_p_top_adj10']:.3f} BHq={c['binom_q']:.3f}")
P(f"cells with max-digit freq >=0.15: {sum(c['top_freq']>=0.15 for c in cellstats)}; >=0.13: {sum(c['top_freq']>=0.13 for c in cellstats)}; >=0.111: {sum(c['top_freq']>=0.111 for c in cellstats)} of {len(cellstats)}")
# distribution of max freq under null by simulation for the actual n's
sim=[]
for c in cellstats:
    sims=rng.multinomial(c['n'],[0.1]*10,size=2000).max(1)/c['n']; sim.append(np.mean(sims>=c['top_freq']))
P(f"per-cell P(null max freq >= observed): mean={np.mean(sim):.3f} (should be ~0.5 if fair); # cells <0.01: {sum(s<0.01 for s in sim)} (exp {len(sim)*0.01:.2f})")
# full combos
cnt=collections.Counter(r['result_digits'] for r in rows); expc=N/1000
combo_rows=[]
for combo in [f"{i:03d}" for i in range(1000)]:
    k=cnt.get(combo,0); combo_rows.append({'combo':combo,'count':k,'p_tail':float(stats.poisson.sf(k-1,expc))})
qc=bh([c['p_tail'] for c in combo_rows])
for c,q_ in zip(combo_rows,qc): c['q']=float(q_)
P(f"full combos: expected per combo {expc:.2f}; threshold 3x = {3*expc:.1f}; max count = {max(cnt.values())}; combos with count>=3x: {[(c['combo'],c['count']) for c in combo_rows if c['count']>=3*expc]}")
P("top 10 full combos:",[(c['combo'],c['count'],f"p={c['p_tail']:.4f}",f"q={c['q']:.3f}") for c in sorted(combo_rows,key=lambda c:-c['count'])[:10]])
P(f"combo count distribution: var/mean = {np.var([c['count'] for c in combo_rows])/np.mean([c['count'] for c in combo_rows]):.3f} (Poisson=1); chi2 over 1000 combos = {stats.chisquare([c['count'] for c in combo_rows]).statistic:.1f} p={stats.chisquare([c['count'] for c in combo_rows]).pvalue:.3f}; zero-count combos={sum(c['count']==0 for c in combo_rows)} (exp {1000*math.exp(-expc):.1f})")
# box sets
scnt=collections.Counter(bset(r['d']) for r in rows)
set_rows=[]
for s_,p_ in pset.items():
    k=scnt.get(s_,0); e=N*p_; set_rows.append({'set':s_,'class':cls([int(x) for x in s_]),'count':k,'exp':e,'ratio':k/e,'p_tail':float(stats.binom.sf(k-1,N,p_))})
qs=bh([c['p_tail'] for c in set_rows])
for c,q_ in zip(set_rows,qs): c['q']=float(q_)
P(f"box sets with count>=2x expected: {[(c['set'],c['count'],round(c['exp'],1)) for c in set_rows if c['ratio']>=2]}")
P("top 10 box sets by tail p:",[(c['set'],c['class'],c['count'],round(c['exp'],1),f"p={c['p_tail']:.4f}",f"q={c['q']:.3f}") for c in sorted(set_rows,key=lambda c:c['p_tail'])[:10]])
P(f"singles set counts: mean={np.mean([c['count'] for c in set_rows if c['class']=='single']):.1f} max={max(c['count'] for c in set_rows if c['class']=='single')} min={min(c['count'] for c in set_rows if c['class']=='single')}; chi2 over 220 sets p={stats.chisquare([c['count'] for c in set_rows],[c['exp'] for c in set_rows]).pvalue:.3f}")
OUT['combos']=combo_rows; OUT['sets']=set_rows

# ---------- 7. POWER ----------
P("\n=== 7. POWER ===")
ns=[c['n'] for c in cellstats if c['pos']==1]
P(f"draws per jur-session cell: count={len(ns)} min={min(ns)} median={np.median(ns):.0f} max={max(ns)}")
m=len(cellstats); alpha_bh=0.05/m
P(f"cells tested={m}; BH-effective alpha for a lone true effect ≈ 0.05/{m} = {alpha_bh:.5f}")
pw={}
for n_label,n_ in [('min',min(ns)),('median',int(np.median(ns))),('max',max(ns))]:
    for pdig in (0.11,0.12,0.13,0.15,0.20):
        probs=[pdig]+[(1-pdig)/9]*9; lam=n_*sum((pp-0.1)**2/0.1 for pp in probs)
        for a_label,a in [('raw0.05',0.05),('BH',alpha_bh)]:
            crit=stats.chi2.isf(a,9); power=stats.ncx2.sf(crit,9,lam)
            pw[(n_label,pdig,a_label)]=power
    P(f"  n={n_} ({n_label}): "+'; '.join(f"p={pdig}: raw={pw[(n_label,pdig,'raw0.05')]:.2f} BH={pw[(n_label,pdig,'BH')]:.3f}" for pdig in (0.11,0.12,0.13,0.15,0.20)))
# n required for 80% power
def n_req(pdig,a):
    probs=[pdig]+[(1-pdig)/9]*9; w=sum((pp-0.1)**2/0.1 for pp in probs); crit=stats.chi2.isf(a,9)
    lo,hi=10,10**7
    while hi-lo>1:
        mid=(lo+hi)//2
        if stats.ncx2.sf(crit,9,mid*w)>=0.8: hi=mid
        else: lo=mid
    return hi
for pdig in (0.11,0.12,0.13,0.15,0.20):
    P(f"  80% power needs n ≈ {n_req(pdig,0.05)} (raw alpha .05) / {n_req(pdig,alpha_bh)} (BH alpha {alpha_bh:.5f}) for digit p={pdig}")
# detectable p at 80% power at median n
def detectable(n_,a):
    lo,hi=0.1,0.9
    for _ in range(60):
        mid=(lo+hi)/2; probs=[mid]+[(1-mid)/9]*9; lam=n_*sum((pp-0.1)**2/0.1 for pp in probs)
        if stats.ncx2.sf(stats.chi2.isf(a,9),9,lam)>=0.8: hi=mid
        else: lo=mid
    return hi
for n_label,n_ in [('min',min(ns)),('median',int(np.median(ns))),('max',max(ns))]:
    P(f"  smallest detectable digit p at 80% power, n={n_} ({n_label}): raw={detectable(n_,0.05):.3f} BH={detectable(n_,alpha_bh):.3f}")
OUT['power']={'ns':ns,'alpha_bh':alpha_bh,'table':{f"{k[0]}|{k[1]}|{k[2]}":v for k,v in pw.items()}}

json.dump(OUT,open('results/audit_results.json','w'),default=float)
with open('results/cells.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(cellstats[0].keys())); w.writeheader(); w.writerows(cellstats)
with open('results/replication.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rep[0].keys())); w.writeheader(); w.writerows(rep)
with open('results/combos.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(combo_rows[0].keys())); w.writeheader(); w.writerows(combo_rows)
with open('results/sets.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(set_rows[0].keys())); w.writeheader(); w.writerows(set_rows)
log.close()
