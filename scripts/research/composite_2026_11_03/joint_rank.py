import json,sys,statistics as st
from collections import Counter
from itertools import combinations,permutations
rows=json.load(open(sys.argv[1])); early=json.load(open(sys.argv[2])) if len(sys.argv)>2 else []
mid=[r for r in rows if r['date_et']=='2026-11-07' and r['session']=='midday']
blk=mid+early
closed={tuple(sorted(r['result_digits'])) for r in blk}
allsets=sorted({tuple(sorted(f"{i:03d}")) for i in range(1000)}); klass=lambda t:len(set(t))
pc=Counter(); dc=Counter(); ppc=Counter(); pdc=Counter()
for r in blk:
    s=r['result_digits']; dc.update(s)
    for a,b in combinations(range(3),2): pc[''.join(sorted(s[a]+s[b]))]+=1; ppc[(a,b,s[a],s[b])]+=1
    for i,ch in enumerate(s): pdc[(i,ch)]+=1
def zb(items,f,kf):
    out={}
    for k in sorted({kf(t) for t in items}):
        g=[t for t in items if kf(t)==k]; v=[f(t) for t in g]; mu=st.mean(v); sd=st.pstdev(v) or 1
        for t,x in zip(g,v): out[t]=(x-mu)/sd
    return out
zp=zb(allsets,lambda t:sum(pc[''.join(sorted(t[a]+t[b]))] for a,b in combinations(range(3),2)),klass)
zd=zb(allsets,lambda t:sum(dc[c] for c in t),klass)
zbox={t:zp[t]+zd[t] for t in allsets}
def rankof(items,score,kf):
    out={}
    for k in (3,2,1):
        g=[t for t in sorted(items,key=lambda t:(-score[t],t)) if kf(t)==k and tuple(sorted(t)) not in closed]
        for i,t in enumerate(g): out[t]=i+1
    return out
boxrank=rankof(allsets,zbox,klass); pairrank=rankof(allsets,zp,klass)
orders=[f"{i:03d}" for i in range(1000)]; ok=lambda o:len(set(o))
zpp=zb(orders,lambda o:sum(ppc[(a,b,o[a],o[b])] for a,b in combinations(range(3),2)),ok)
zpd=zb(orders,lambda o:sum(pdc[(i,c)] for i,c in enumerate(o)),ok)
zstr={o:zpp[o]+zpd[o] for o in orders}
strrank=rankof(orders,zstr,ok)
print(f"reference {len(blk)} draws | pairs: "+', '.join(f"{p}x{n}" for p,n in pc.most_common(6)))
print("positional digits: "+', '.join(f"pos{i+1}={c} x{n}" for (i,c),n in sorted(pdc.items(),key=lambda x:-x[1])[:9]))
print("positional pairs ≥3: "+', '.join(f"p{a+1}={x}&p{b+1}={y} x{n}" for (a,b,x,y),n in sorted(ppc.items(),key=lambda x:-x[1]) if n>=3))
def bo(t): return min((''.join(o) for o in set(permutations(t))),key=lambda o:strrank[o])
for k,name in ((3,'SINGLES'),(2,'DOUBLES'),(1,'TRIPLES')):
    print(f"\n=== {name} ===")
    print(" BOX top-5:      "+' | '.join([f"{''.join(t)} b{boxrank[t]} p{pairrank[t]} best-order {bo(t)} s{strrank[bo(t)]}" for t in sorted(boxrank,key=boxrank.get) if klass(t)==k][:5]))
    print(" PAIR top-5:     "+' | '.join([f"{''.join(t)} p{pairrank[t]} b{boxrank[t]} best-order {bo(t)} s{strrank[bo(t)]}" for t in sorted(pairrank,key=pairrank.get) if klass(t)==k][:5]))
    print(" STRAIGHT top-5: "+' | '.join([f"{o} s{strrank[o]} z{zstr[o]:+.2f} b{boxrank[tuple(sorted(o))]} p{pairrank[tuple(sorted(o))]}" for o in sorted(strrank,key=strrank.get) if ok(o)==k][:5]))
    c=sorted((max(boxrank[tuple(sorted(o))],pairrank[tuple(sorted(o))],strrank[o]),boxrank[tuple(sorted(o))]+pairrank[tuple(sorted(o))]+strrank[o],o) for o in strrank if ok(o)==k)
    print(" JOINT (lowest worst-rank across the 3, then sum): "+' | '.join(f"{o}: box b{boxrank[tuple(sorted(o))]} pair p{pairrank[tuple(sorted(o))]} straight s{strrank[o]}" for _,_,o in c[:4]))
