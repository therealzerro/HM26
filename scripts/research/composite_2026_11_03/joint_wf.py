import json,sys,statistics as st,datetime as dt,math
from collections import Counter,defaultdict
from itertools import combinations,permutations
rows=json.load(open(sys.argv[1]))
allsets=sorted({tuple(sorted(f"{i:03d}")) for i in range(1000)}); klass=lambda t:len(set(t))
orders=[f"{i:03d}" for i in range(1000)]; ok=lambda o:len(set(o))
PERMS={t:sorted({''.join(p) for p in permutations(t)}) for t in allsets}
def zb(items,f,kf):
    out={}
    for k in (3,2,1):
        g=[t for t in items if kf(t)==k]; v=[f(t) for t in g]; mu=st.mean(v); sd=st.pstdev(v) or 1
        for t,x in zip(g,v): out[t]=(x-mu)/sd
    return out
def score(blk,closed):
    pc=Counter(); dc=Counter(); ppc=Counter(); pdc=Counter()
    for r in blk:
        s=r['result_digits']; dc.update(s)
        for a,b in combinations(range(3),2): pc[''.join(sorted(s[a]+s[b]))]+=1; ppc[(a,b,s[a],s[b])]+=1
        for i,ch in enumerate(s): pdc[(i,ch)]+=1
    zp=zb(allsets,lambda t:sum(pc[''.join(sorted(t[a]+t[b]))] for a,b in combinations(range(3),2)),klass)
    zd=zb(allsets,lambda t:sum(dc[c] for c in t),klass)
    zbox={t:zp[t]+zd[t] for t in allsets}
    zpp=zb(orders,lambda o:sum(ppc[(a,b,o[a],o[b])] for a,b in combinations(range(3),2)),ok)
    zpd=zb(orders,lambda o:sum(pdc[(i,c)] for i,c in enumerate(o)),ok)
    zstr={o:zpp[o]+zpd[o] for o in orders}
    def rk(items,sc,kf):
        out={}
        for k in (3,2,1):
            g=[t for t in sorted(items,key=lambda t:(-sc[t],t)) if kf(t)==k and tuple(sorted(t)) not in closed]
            for i,t in enumerate(g): out[t]=i+1
        return out
    return rk(allsets,zbox,klass),rk(allsets,zp,klass),rk(orders,zstr,ok),zstr
bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
dates=sorted({r['date_et'] for r in rows}); D=lambda s: dt.date.fromisoformat(s)
WIN={'full':'2026-05-01','60d':'2026-09-08','30d':'2026-10-08'}
R=defaultdict(lambda:defaultdict(lambda:defaultdict(lambda:[0,0.0])))   # R[universe][form][win]=[hits,exp]
pct=defaultdict(lambda:defaultdict(list))  # drawn-order percentile under straight scorer, by universe/win
for d in dates:
    if d<'2026-05-01': continue
    prev=(D(d)-dt.timedelta(1)).isoformat()
    for sess in ('midday','evening'):
        pool=bydate.get((d,sess),[])
        if sess=='midday': ref=bydate.get((prev,'midday'),[])+bydate.get((prev,'evening'),[]); closed={tuple(sorted(r['result_digits'])) for r in ref}
        else: ref=bydate.get((prev,'evening'),[])+bydate.get((d,'midday'),[]); closed={tuple(sorted(r['result_digits'])) for r in bydate.get((d,'midday'),[])}
        if not pool or len(ref)<20: continue
        boxrank,pairrank,strrank,zstr=score(ref,closed)
        n=len(pool); drawn=[r['result_digits'] for r in pool]
        picks={}
        for k,name in ((3,'S'),(2,'D'),(1,'T')):
            top_str=min((o for o in strrank if ok(o)==k),key=strrank.get)
            top_box=min((t for t in boxrank if klass(t)==k),key=boxrank.get)
            top_pair=min((t for t in pairrank if klass(t)==k),key=pairrank.get)
            joint=min((o for o in strrank if ok(o)==k),key=lambda o:(max(boxrank[tuple(sorted(o))],pairrank[tuple(sorted(o))],strrank[o]),boxrank[tuple(sorted(o))]+pairrank[tuple(sorted(o))]+strrank[o]))
            # box-set lead order = the current straight method proxy: the box top set's best straight-universe order
            box_best=min(PERMS[top_box],key=strrank.get)
            picks[f'{name} straight#1 EXACT']=('x',top_str); picks[f'{name} straight#1 ANY-ORDER']=('b',top_str)
            picks[f'{name} box#1 ANY-ORDER']=('b',''.join(top_box)); picks[f'{name} box#1 best-order EXACT']=('x',box_best)
            picks[f'{name} pair#1 ANY-ORDER']=('b',''.join(top_pair))
            picks[f'{name} JOINT EXACT']=('x',joint); picks[f'{name} JOINT ANY-ORDER']=('b',joint)
        for w,ws in WIN.items():
            if d<ws: continue
            for f,(mode,o) in picks.items():
                if mode=='x': h=sum(x==o for x in drawn); e=n/1000
                else: s=tuple(sorted(o)); h=sum(tuple(sorted(x))==s for x in drawn); e=n*len(PERMS[s])/1000
                R[sess][f][w][0]+=h; R[sess][f][w][1]+=e
            # universe-level: percentile of each drawn order's straight score within its class (0.5 = null)
            for x in drawn:
                k=ok(x); g=[zstr[o] for o in orders if ok(o)==k]; pct[sess][w].append(sum(v<zstr[x] for v in g)/len(g))
for sess in ('midday','evening'):
    print(f"\n==== {sess.upper()} pool, all states (ref = {'prev-day midday+evening, prev-day sets closed' if sess=='midday' else 'prev evening + same-day midday, midday sets closed'}) — hits / expected (z) ====")
    for f in R[sess]:
        print(f"{f:30}"+' | '.join(f"{w} {R[sess][f][w][0]:4}/{R[sess][f][w][1]:6.1f} ({(R[sess][f][w][0]-R[sess][f][w][1])/math.sqrt(R[sess][f][w][1]):+.2f})" for w in WIN))
    print("drawn-order percentile under STRAIGHT scorer (0.500 = null): "+' | '.join(f"{w} {st.mean(pct[sess][w]):.4f} (n {len(pct[sess][w])}, se {st.pstdev(pct[sess][w])/math.sqrt(len(pct[sess][w])):.4f})" for w in WIN))
