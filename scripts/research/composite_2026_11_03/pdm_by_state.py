import json,sys,datetime as dt,math,statistics as st
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1])); START=sys.argv[2]; END=sys.argv[3]; TARGETS=sys.argv[4].split(';')
ALL=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
digs=lambda cs:cs[1::2]
def cls(cs): return {3:6,2:3,1:1}[len(set(digs(cs)))]
SP={cs:[''.join(sorted(digs(cs)[a]+digs(cs)[b])) for a,b in ((0,1),(0,2),(1,2))] for cs in ALL}
def drawpairs(s): return [''.join(sorted(s[a]+s[b])) for a,b in ((0,1),(0,2),(1,2))]
D=lambda s: dt.date.fromisoformat(s)
dates=sorted({r['date_et'] for r in rows}); bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
def zstd(val):
    out={}
    for k in (6,3,1):
        g=[cs for cs in ALL if cls(cs)==k]; mu=st.mean([val[c] for c in g]); sd=st.pstdev([val[c] for c in g]) or 1
        for c in g: out[c]=(val[c]-mu)/sd
    return out
def rank(ref):
    pc=Counter(p for r in ref for p in drawpairs(r['result_digits'])); dc=Counter(ch for r in ref for ch in r['result_digits'])
    zp=zstd({cs:sum(pc[p] for p in SP[cs]) for cs in ALL}); zd=zstd({cs:sum(dc[ch] for ch in digs(cs)) for cs in ALL})
    z={cs:zp[cs]+zd[cs] for cs in ALL}
    return [cs for cs in sorted(ALL,key=lambda cs:(-z[cs],cs))],z
KS=(5,7,10)
stat=defaultdict(lambda:{'n':0,**{f'h{k}':0 for k in KS},**{f'e{k}':0.0 for k in KS},'recent':[],'tgt':defaultdict(list)})
W60=(D(END)-dt.timedelta(60)).isoformat(); W30=(D(END)-dt.timedelta(30)).isoformat()
for d in dates:
    if d<START or d>END: continue
    pool=bydate.get((d,'midday'),[])
    if not pool: continue
    prev=(D(d)-dt.timedelta(1)).isoformat()
    ref=bydate.get((prev,'midday'),[])+bydate.get((prev,'evening'),[])
    if len(ref)<20: continue
    ranked,z=rank(ref); nt=[c for c in ranked if cls(c)>1]; pos={c:i+1 for i,c in enumerate(nt)}
    for r in pool:
        j=r['jurisdiction']; cs=r['comboset_sorted']; s=stat[j]; s['n']+=1
        for k in KS:
            top=nt[:k]; s[f'e{k}']+=sum(cls(c)/1000 for c in top); s[f'h{k}']+=cs in top
        if cs in nt[:7]: s['recent'].append(f"{r['result_digits']} {d[5:]}")
        if cs in TARGETS: s['tgt'][cs].append((d,r['result_digits'],pos[cs]))
print(f"MIDDAY states, midday draws {START}→{END}, PAIR+DIGIT (ref = previous day midday + evening; boxes = top-K non-triple) — draws · top-5 · top-7 · top-10 hits/exp (z) · last top-7 box landings")
out=sorted(stat.items(),key=lambda t:-(t[1]['h7']-t[1]['e7'])/math.sqrt(t[1]['e7']))
for j,s in out:
    cells=' | '.join(f"top{k} {s[f'h{k}']:2}/{s[f'e{k}']:4.1f} ({(s[f'h{k}']-s[f'e{k}']):+.1f}, z{(s[f'h{k}']-s[f'e{k}'])/math.sqrt(s[f'e{k}']):+.2f})" for k in KS)
    print(f"{j:9} n {s['n']:3} | {cells} | {' · '.join(s['recent'][-4:])}")
T={k:(sum(s[f'h{k}'] for s in stat.values()),sum(s[f'e{k}'] for s in stat.values())) for k in KS}
print("POOL      n",sum(s['n'] for s in stat.values()),'|',' | '.join(f"top{k} {h}/{e:.1f} (z{(h-e)/math.sqrt(e):+.2f})" for k,(h,e) in T.items()))
print()
print(f"TARGET SETS {TARGETS} — per midday state: landings all / 60d(≥{W60}) / 30d(≥{W30}) vs expected (n×6/1000 per set), each landing = date order (scorer rank that day, non-triple list)")
for cs in TARGETS:
    print(f"== {cs}")
    tot=[0,0,0]; te=[0,0,0]
    rowsj=[]
    for j,s in stat.items():
        L=s['tgt'].get(cs,[]); n=s['n']
        # per-state 60d/30d draw counts
        n60=sum(1 for d in dates if START<=d<=END and d>=W60 for r in bydate.get((d,'midday'),[]) if r['jurisdiction']==j)
        n30=sum(1 for d in dates if START<=d<=END and d>=W30 for r in bydate.get((d,'midday'),[]) if r['jurisdiction']==j)
        h=len(L); h60=sum(1 for x in L if x[0]>=W60); h30=sum(1 for x in L if x[0]>=W30)
        e,e60,e30=n*.006,n60*.006,n30*.006
        for i,(a,b) in enumerate(((h,e),(h60,e60),(h30,e30))): tot[i]+=a; te[i]+=b
        rowsj.append((h-e,j,n,h,e,h60,e60,h30,e30,L))
    for _,j,n,h,e,h60,e60,h30,e30,L in sorted(rowsj,reverse=True):
        print(f"{j:9} n {n:3} | all {h}/{e:.2f} | 60d {h60}/{e60:.2f} | 30d {h30}/{e30:.2f} | {' · '.join(f'{b} {a[5:]} (r{c})' for a,b,c in L)}")
    print(f"POOL      | all {tot[0]}/{te[0]:.1f} | 60d {tot[1]}/{te[1]:.1f} | 30d {tot[2]}/{te[2]:.1f}")
# today's rank
last=max(dates); ref=bydate.get((last,'midday'),[])+bydate.get((last,'evening'),[])
ranked,z=rank(ref); nt=[c for c in ranked if cls(c)>1]
print()
print(f"TODAY's midday scorer, ref = {last} midday + evening = {len(ref)} draws; top-10 non-triple: {', '.join(f'{c} {z[c]:+.2f}' for c in nt[:10])}")
for cs in TARGETS: print(f"  {cs}: rank {nt.index(cs)+1} of 220 non-triple, P+D {z[cs]:+.2f}")
pc=Counter(p for r in ref for p in drawpairs(r['result_digits'])); dc=Counter(ch for r in ref for ch in r['result_digits'])
print("  block pairs:",', '.join(f'{p}×{c}' for p,c in pc.most_common(12)),'| digits:',', '.join(f'{d}×{c}' for d,c in dc.most_common(10)))
