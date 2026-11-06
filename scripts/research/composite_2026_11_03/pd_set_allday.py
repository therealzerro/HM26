import json,sys,datetime as dt,math,statistics as st
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1])); START=sys.argv[2]; END=sys.argv[3]; TGT=sys.argv[4]; ORDER=sys.argv[5]
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
    return [cs for cs in sorted(ALL,key=lambda cs:(-z[cs],cs)) if cls(cs)>1],z,pc,dc
W60=(D(END)-dt.timedelta(60)).isoformat(); W30=(D(END)-dt.timedelta(30)).isoformat()
KS=(5,7,10)
stat=defaultdict(lambda:{'n':0,'n60':0,'n30':0,**{f'h{k}':0 for k in KS},**{f'e{k}':0.0 for k in KS},'recent':[],'tgt':[]})
ordc={'all':Counter(),'60':Counter(),'30':Counter()}; sess_ord=defaultdict(Counter); exact=[]
alltgt=[]
for d in dates:
    if d<START or d>END: continue
    prev=(D(d)-dt.timedelta(1)).isoformat()
    for sess in ('midday','evening'):
        pool=bydate.get((d,sess),[])
        if not pool: continue
        ref=(bydate.get((prev,'midday'),[])+bydate.get((prev,'evening'),[])) if sess=='midday' else (bydate.get((prev,'evening'),[])+bydate.get((d,'midday'),[]))
        if len(ref)<20: continue
        nt,z,_,_=rank(ref); pos={c:i+1 for i,c in enumerate(nt)}
        for r in pool:
            j=r['jurisdiction']; cs=r['comboset_sorted']; s=stat[j]; s['n']+=1; s['n60']+=d>=W60; s['n30']+=d>=W30
            for k in KS:
                top=nt[:k]; s[f'e{k}']+=sum(cls(c)/1000 for c in top); s[f'h{k}']+=cs in top
            if cs in nt[:7]: s['recent'].append(f"{r['result_digits']} {d[5:]}{sess[0]}")
            if cs==TGT:
                rec=(d,sess,j,r['result_digits'],pos[cs]); s['tgt'].append(rec); alltgt.append(rec)
                ordc['all'][r['result_digits']]+=1
                if d>=W60: ordc['60'][r['result_digits']]+=1
                if d>=W30: ordc['30'][r['result_digits']]+=1
                sess_ord[sess][r['result_digits']]+=1
                if r['result_digits']==ORDER: exact.append(rec)
N=sum(s['n'] for s in stat.values())
print(f"== {TGT} / straight {ORDER} — ALL DRAWS (midday+evening = allday), {START}→{END}; {N} draws; 60d ≥{W60}, 30d ≥{W30}")
print(f"nationwide any-order: all {sum(ordc['all'].values())} / exp {N*.006:.1f} · 60d {sum(ordc['60'].values())} / {sum(s['n60'] for s in stat.values())*.006:.1f} · 30d {sum(ordc['30'].values())} / {sum(s['n30'] for s in stat.values())*.006:.1f}")
for w in ('all','60','30'): print(f"  orders {w:>3}: "+', '.join(f"{o}×{c}" for o,c in sorted(ordc[w].items(),key=lambda t:-t[1])) )
for sess in ('midday','evening'): print(f"  {sess:8}: "+', '.join(f"{o}×{c}" for o,c in sorted(sess_ord[sess].items(),key=lambda t:-t[1])))
print(f"exact {ORDER} landings ({len(exact)} / exp {N/1000:.1f}): "+' · '.join(f"{j} {d[5:]}{s[0]} (r{p})" for d,s,j,o,p in exact))
print(f"last any-order: "+' · '.join(f"{j} {o} {d[5:]}{s[0]} (r{p})" for d,s,j,o,p in alltgt[-8:]))
print()
print(f"PER STATE — {TGT} landings all/60d/30d vs exp (n×6/1000); scorer rank at the draw in parens; exact {ORDER} starred")
rowsj=[]
for j,s in stat.items():
    L=s['tgt']; h=len(L); h60=sum(1 for x in L if x[0]>=W60); h30=sum(1 for x in L if x[0]>=W30)
    rowsj.append(((h-s['n']*.006),j,s,h,h60,h30,L))
for _,j,s,h,h60,h30,L in sorted(rowsj,key=lambda t:(-t[0],t[1])):
    z7=(s['h7']-s['e7'])/math.sqrt(s['e7'])
    print(f"{j:9} n {s['n']:3} | all {h}/{s['n']*.006:.2f} | 60d {h60}/{s['n60']*.006:.2f} | 30d {h30}/{s['n30']*.006:.2f} | scorer top7 {s['h7']:2}/{s['e7']:4.1f} z{z7:+.2f} | "+' · '.join(f"{'*' if o==ORDER else ''}{o} {d[5:]}{ss[0]} (r{p})" for d,ss,jj,o,p in L))
print()
print("SCORER PER-STATE WALK-FORWARD, all draws (top-5 · top-7 · top-10 hits/exp z), sorted by top-7 z:")
for j,s in sorted(stat.items(),key=lambda t:-(t[1]['h7']-t[1]['e7'])/math.sqrt(t[1]['e7'])):
    cells=' | '.join(f"top{k} {s[f'h{k}']:2}/{s[f'e{k}']:5.1f} z{(s[f'h{k}']-s[f'e{k}'])/math.sqrt(s[f'e{k}']):+.2f}" for k in KS)
    print(f"{j:9} n {s['n']:3} | {cells} | {' · '.join(s['recent'][-3:])}")
T={k:(sum(s[f'h{k}'] for s in stat.values()),sum(s[f'e{k}'] for s in stat.values())) for k in KS}
print("POOL      n",N,'|',' | '.join(f"top{k} {h}/{e:.1f} z{(h-e)/math.sqrt(e):+.2f}" for k,(h,e) in T.items()))
print()
last=max(dates); ref=bydate.get((last,'midday'),[])+bydate.get((last,'evening'),[])
nt,z,pc,dc=rank(ref)
print(f"TODAY ref = {last} midday+evening ({len(ref)} draws): {TGT} rank {nt.index(TGT)+1} of 220 non-triple, P+D {z[TGT]:+.2f}; its pairs in block: "+', '.join(f"{p}×{pc[p]}" for p in SP[TGT])+"; digits: "+', '.join(f"{ch}×{dc[ch]}" for ch in digs(TGT)))
print("top-10 today:",', '.join(f"{c} {z[c]:+.2f}" for c in nt[:10]))
# gap since last national any-order and last exact
seq=[(r['date_et'],r['session'],r['jurisdiction'],r['result_digits'],r['comboset_sorted']) for d in dates for sess in ('midday','evening') for r in bydate.get((d,sess),[])]
li=max(i for i,x in enumerate(seq) if x[4]==TGT); print(f"draws since last {TGT} nationally: {len(seq)-1-li} (exp gap 167)")
ex=[i for i,x in enumerate(seq) if x[3]==ORDER]; print(f"draws since last exact {ORDER}: {len(seq)-1-ex[-1] if ex else 'never'} (exp gap 1000)")
