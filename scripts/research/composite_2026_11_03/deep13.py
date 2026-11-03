import json,sys,datetime as dt,math
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1])); mid=json.load(open(sys.argv[2]))
print('11/03 midday rows in DB:',len(mid),' '.join(r['jurisdiction']+' '+r['result_digits'] for r in mid))
EARLY=['PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC']
END='2026-11-02'; D60='2026-09-04'; D30='2026-10-04'; D7='2026-10-27'
def dow(d): return dt.date.fromisoformat(d).weekday()
def cls(cs): return {3:6,2:3,1:1}[len(set(cs[1::2]))]
d=sorted([r for r in rows if r['session']=='evening' and r['jurisdiction'] in EARLY and r['date_et']<=END],key=lambda r:(r['date_et'],r['id']))
n=len(d); n60=sum(r['date_et']>=D60 for r in d); n30=sum(r['date_et']>=D30 for r in d); ntu=sum(dow(r['date_et'])==1 for r in d)
closed={r['comboset_sorted'] for r in mid}|{'{3,5,7}','{0,5,6}','{0,3,8}'}
print('CLOSED (drawn 11/03 midday):',sorted(closed))
nat7=Counter(r['comboset_sorted'] for r in rows if r['date_et']>=D7)
midE=Counter(r['comboset_sorted'] for r in rows if r['session']=='midday' and r['jurisdiction'] in EARLY and r['date_et']>=D30)
pairs=Counter(); pairsM=Counter()
for r in rows:
    s=r['result_digits']
    if r['date_et']=='2026-11-02' and r['session']=='evening':
        for a,b in ((0,1),(0,2),(1,2)): pairs[''.join(sorted(s[a]+s[b]))]+=1
for r in mid:
    s=r['result_digits']
    for a,b in ((0,1),(0,2),(1,2)): pairsM[''.join(sorted(s[a]+s[b]))]+=1
print('11/03 midday pair repeats >=3:',[(p,c) for p,c in pairsM.most_common() if c>=3])
def z(o,e): return (o-e)/math.sqrt(e)
sb=defaultdict(list)
for i,r in enumerate(d): sb[r['comboset_sorted']].append((i,r))
sets=[]
for cs,m in sb.items():
    k=cls(cs); e_all=n*k/1000; e60=n60*k/1000; e30=n30*k/1000; etu=ntu*k/1000
    b_all=len(m); b60=sum(r['date_et']>=D60 for _,r in m); b30=sum(r['date_et']>=D30 for _,r in m); btu=sum(dow(r['date_et'])==1 for _,r in m)
    comp=z(b_all,e_all)+z(b60,e60)+z(b30,e30)
    st=Counter(r['jurisdiction'] for _,r in m); st60=Counter(r['jurisdiction'] for _,r in m if r['date_et']>=D60)
    digs=sorted(set(cs[1::2])); ps=[''.join(sorted(a+b)) for i,a in enumerate(digs) for b in digs[i+1:]] if k==6 else []
    sets.append(dict(cs=cs,k=k,comp=comp,b_all=b_all,e_all=e_all,b60=b60,e60=e60,b30=b30,e30=e30,btu=btu,etu=etu,states=len(st),st=st,st60=st60,since=n-1-m[-1][0],orders=Counter(r['result_digits'] for _,r in m),orders60=Counter(r['result_digits'] for _,r in m if r['date_et']>=D60),last=[f"{r['jurisdiction']} {r['result_digits']} {r['date_et'][5:]}" for _,r in m[-5:]],nat7=nat7[cs],midE=midE[cs],psup=sum(pairs[p] for p in ps),psupM=sum(pairsM[p] for p in ps),pdet={p:pairs[p] for p in ps if pairs[p]}))
sets.sort(key=lambda s:-s['comp'])
print(f"\npool {n} · 60d {n60} · 30d {n30} · Tue {ntu}; composite = z(all)+z(60d)+z(30d)")
print("== TOP 15 SETS (closed excluded; S=single D=double)")
rank=0
for s in sets:
    if s['cs'] in closed: continue
    rank+=1
    if rank>15: break
    print(f"{rank:2} {s['cs']:8} {'S' if s['k']==6 else 'D'} comp {s['comp']:+.2f} | all {s['b_all']}/{s['e_all']:.1f} 60d {s['b60']}/{s['e60']:.1f} 30d {s['b30']}/{s['e30']:.1f} Tue {s['btu']}/{s['etu']:.1f} | states {s['states']} | since {s['since']} | nat7d {s['nat7']} | mid13-30d {s['midE']} | pairs eve11/02 {s['psup']} {s['pdet']} mid11/03 {s['psupM']}")
    print(f"      orders all {dict(s['orders'].most_common())} · 60d {dict(s['orders60'].most_common())} · states60d {dict(s['st60'].most_common())} · last {' · '.join(s['last'])}")
ex=defaultdict(list)
for i,r in enumerate(d): ex[r['result_digits']].append((i,r))
E=[]
for o,m in ex.items():
    cs='{'+','.join(sorted(o))+'}'
    a=len(m); b=sum(r['date_et']>=D60 for _,r in m); c=sum(r['date_et']>=D30 for _,r in m)
    E.append((z(a,n/1000)+z(b,n60/1000)+z(c,n30/1000),o,cs,a,b,c,len({r['jurisdiction'] for _,r in m}),n-1-m[-1][0],[f"{r['jurisdiction']} {r['date_et'][5:]}" for _,r in m[-4:]]))
E.sort(key=lambda t:-t[0])
print("\n== TOP 12 EXACT ORDERS (closed excluded), exp 3.23/0.93/0.47")
k=0
for comp,o,cs,a,b,c,st,since,last in E:
    if cs in closed: continue
    k+=1
    if k>12: break
    print(f"{k:2} {o} {cs:8} comp {comp:+.2f} | exact all {a} 60d {b} 30d {c} | states {st} | since {since} | {' · '.join(last)}")
