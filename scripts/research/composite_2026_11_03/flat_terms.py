# Walk-forward test of "flat"-labelled levers as composite terms, same harness as the pair term (study §6/§7).
# usage: python3 -I flat_terms.py hist.json
import json,sys,datetime as dt,math,statistics as st
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1]))
EARLY={'PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC'}
ALLSETS=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
DG={cs:cs[1::2] for cs in ALLSETS}
def cls(cs): return {3:6,2:3,1:1}[len(set(DG[cs]))]
def setof(d): return '{'+','.join(sorted(d))+'}'
def pairs(d): return [''.join(sorted(d[a]+d[b])) for a,b in ((0,1),(0,2),(1,2))]
SP={cs:pairs(DG[cs]) for cs in ALLSETS}
D=lambda s: dt.date.fromisoformat(s)
dates=sorted({r['date_et'] for r in rows}); di={d:i for i,d in enumerate(dates)}
by=defaultdict(list)
for r in rows: by[(r['date_et'],r['session'])].append(r)
byd=defaultdict(list)
for r in rows: byd[r['date_et']].append(r)
def refs(d,sess):
    prev=(D(d)-dt.timedelta(1)).isoformat()
    return by.get((prev,'evening'),[])+(by.get((d,'midday'),[]) if sess=='evening' else by.get((prev,'midday'),[]))
def seen_before(d,sess):  # all rows strictly before the slate's session
    out=[r for dd in dates if dd<d for r in byd[dd]]
    if sess=='evening': out+=by.get((d,'midday'),[])
    return out
def std(sup):
    out={}
    for k in (6,3,1):
        vals=[sup[cs] for cs in ALLSETS if cls(cs)==k]; mu=st.mean(vals); sd=st.pstdev(vals) or 1
        for cs in ALLSETS:
            if cls(cs)==k: out[cs]=(sup[cs]-mu)/sd
    return out
# ---- terms: each returns raw support per set for (d,sess)
def t_pair(d,sess,ref=None):
    pc=Counter(p for r in (ref if ref is not None else refs(d,sess)) for p in pairs(r['result_digits']))
    return {cs:sum(pc[p] for p in SP[cs]) for cs in ALLSETS}
def t_pair_eve(d,sess):
    prev=(D(d)-dt.timedelta(1)).isoformat(); return t_pair(d,sess,by.get((prev,'evening'),[]))
def t_pair_mid(d,sess):
    prev=(D(d)-dt.timedelta(1)).isoformat(); return t_pair(d,sess,by.get((d,'midday'),[]) if sess=='evening' else by.get((prev,'midday'),[]))
def lastN(d,sess,n):
    out=[]
    for k in range(1,n+1): out+=byd.get((D(d)-dt.timedelta(k)).isoformat(),[])
    if sess=='evening': out+=by.get((d,'midday'),[])
    return out
def t_pair_2d(d,sess): return t_pair(d,sess,lastN(d,sess,2))
def t_pair_3d(d,sess): return t_pair(d,sess,lastN(d,sess,3))
def t_pair_7d(d,sess): return t_pair(d,sess,lastN(d,sess,7))
def t_digit(d,sess):
    dc=Counter(ch for r in refs(d,sess) for ch in r['result_digits'])
    return {cs:sum(dc[ch] for ch in DG[cs]) for cs in ALLSETS}
def t_setrep(d,sess):
    sc=Counter(r['comboset_sorted'] for r in refs(d,sess)); return {cs:sc[cs] for cs in ALLSETS}
def mirror(x): return ''.join(str((int(c)+5)%10) for c in x)
def t_mirror_pair(d,sess):
    pc=Counter(p for r in refs(d,sess) for p in pairs(mirror(r['result_digits'])))
    return {cs:sum(pc[p] for p in SP[cs]) for cs in ALLSETS}
def t_mirror_set(d,sess):
    sc=Counter(setof(mirror(r['result_digits'])) for r in refs(d,sess)); return {cs:sc[cs] for cs in ALLSETS}
def t_rundown(d,sess):
    sc=Counter()
    for r in refs(d,sess):
        x=r['result_digits']
        for k in (1,-1): sc[setof(''.join(str((int(c)+k)%10) for c in x))]+=1
    return {cs:sc[cs] for cs in ALLSETS}
def t_sum(d,sess):
    sc=Counter(sum(map(int,r['result_digits'])) for r in refs(d,sess))
    return {cs:sc[sum(map(int,DG[cs]))] for cs in ALLSETS}
def t_rootsum(d,sess):
    rs=lambda x:(sum(map(int,x))-1)%9+1 if sum(map(int,x)) else 0
    sc=Counter(rs(r['result_digits']) for r in refs(d,sess)); return {cs:sc[rs(DG[cs])] for cs in ALLSETS}
# follower table: F[S][T] = times set T drawn the day after S was drawn (any session), from dates < d
Fcache={}
def t_follower(d,sess):
    F=defaultdict(Counter); 
    for i in range(1,di[d]):  # transitions ending at dates[i] < d
        if dates[i]>=d: break
        prevsets=set(r['comboset_sorted'] for r in byd[dates[i-1]]); nxt=Counter(r['comboset_sorted'] for r in byd[dates[i]])
        for S in prevsets: F[S].update(nxt)
    sc=Counter()
    for r in refs(d,sess):
        tot=sum(F[r['comboset_sorted']].values()) or 1
        for T,c in F[r['comboset_sorted']].items(): sc[T]+=c/tot
    return {cs:sc[cs] for cs in ALLSETS}
def t_overdue(d,sess):
    last={}
    for r in seen_before(d,sess): last[r['comboset_sorted']]=max(last.get(r['comboset_sorted'],'0'),r['date_et'])
    return {cs:(D(d)-D(last[cs])).days if cs in last else (D(d)-D('2026-04-01')).days for cs in ALLSETS}
def t_hot(d,sess,n):
    sc=Counter(r['comboset_sorted'] for r in lastN(d,sess,n)); return {cs:sc[cs] for cs in ALLSETS}
def t_hot7(d,sess): return t_hot(d,sess,7)
def t_hot14(d,sess): return t_hot(d,sess,14)
def t_weekday(d,sess):
    wd=D(d).weekday(); sc=Counter(r['comboset_sorted'] for r in seen_before(d,sess) if D(r['date_et']).weekday()==wd and r['session']==sess)
    return {cs:sc[cs] for cs in ALLSETS}
TERMS=[('pair_ref(base)',t_pair),('pair_prevEve_only',t_pair_eve),('pair_sameMid_only',t_pair_mid),('pair_2d',t_pair_2d),('pair_3d',t_pair_3d),('pair_7d',t_pair_7d),
 ('digit_ref',t_digit),('set_repeat_ref',t_setrep),('mirror_pair_ref',t_mirror_pair),('mirror_set_ref',t_mirror_set),('rundown±1_ref',t_rundown),
 ('sum_ref',t_sum),('rootsum_ref',t_rootsum),('follower',t_follower),('overdue_days',t_overdue),('hot7',t_hot7),('hot14',t_hot14),('weekday',t_weekday)]
POOLS=[('EARLY-13 eve',EARLY,'evening'),('ALL midday',None,'midday'),('ALL evening',None,'evening')]
WIN={'IS 7/01→11/02':('2026-07-01','2026-11-02'),'OOS 5/01→6/30':('2026-05-01','2026-06-30')}
def z(h,e): return (h-e)/math.sqrt(e) if e>0 else 0
def evaluate(fn,pool,sess,s,e):
    pr=defaultdict(list)
    for r in rows:
        if r['session']==sess and (pool is None or r['jurisdiction'] in pool): pr[r['date_et']].append(r)
    H={5:0,10:0,'anti':0}; E={5:0.0,10:0.0,'anti':0.0}; pcts=[]
    for d in dates:
        if not (s<=d<=e) or not pr.get(d): continue
        zz=std(fn(d,sess)); ranked=sorted(ALLSETS,key=lambda cs:(-zz[cs],cs)); rk={cs:i for i,cs in enumerate(ranked)}
        drawn=Counter(r['comboset_sorted'] for r in pr[d]); nd=len(pr[d])
        for K in (5,10):
            H[K]+=sum(drawn[cs] for cs in ranked[:K]); E[K]+=sum(nd*cls(cs)/1000 for cs in ranked[:K])
        H['anti']+=sum(drawn[cs] for cs in ranked[-5:]); E['anti']+=sum(nd*cls(cs)/1000 for cs in ranked[-5:])
        pcts+=[rk[cs]/219 for cs in drawn.elements()]
    return H,E,st.mean(pcts)
print(f"{'term':20s} {'pool':13s} | {'IS top5 h/e (z)':22s} {'IS top10 (z)':16s} | {'OOS top5 (z)':20s} {'OOS top10 (z)':16s} | {'anti5 IS+OOS (z)':18s} pct")
for name,fn in TERMS:
    for pn,pool,sess in POOLS:
        res={}
        for wn,(s,e) in WIN.items(): res[wn]=evaluate(fn,pool,sess,s,e)
        (Hi,Ei,pi),(Ho,Eo,po)=res['IS 7/01→11/02'],res['OOS 5/01→6/30']
        ah=Hi['anti']+Ho['anti']; ae=Ei['anti']+Eo['anti']
        print(f"{name:20s} {pn:13s} | {Hi[5]:3d}/{Ei[5]:5.1f} ({z(Hi[5],Ei[5]):+.2f})      {Hi[10]:3d}/{Ei[10]:5.1f} ({z(Hi[10],Ei[10]):+.2f}) | {Ho[5]:3d}/{Eo[5]:5.1f} ({z(Ho[5],Eo[5]):+.2f})    {Ho[10]:3d}/{Eo[10]:5.1f} ({z(Ho[10],Eo[10]):+.2f}) | {ah:3d}/{ae:5.1f} ({z(ah,ae):+.2f})     {(pi+po)/2:.3f}",flush=True)
