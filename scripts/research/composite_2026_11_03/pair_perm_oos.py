import json,sys,datetime as dt,math,statistics as st,random
from collections import defaultdict,Counter
rows=json.load(open(sys.argv[1])); NPERM=int(sys.argv[2]); random.seed(11)
EARLY=['PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC']
ALLSETS=sorted({'{'+','.join(sorted(f"{i:03d}"))+'}' for i in range(1000)})
def cls(cs): return {3:6,2:3,1:1}[len(set(cs[1::2]))]
SP={cs:[''.join(sorted(cs[1::2][a]+cs[1::2][b])) for a,b in ((0,1),(0,2),(1,2))] for cs in ALLSETS}
def drawpairs(s): return [''.join(sorted(s[a]+s[b])) for a,b in ((0,1),(0,2),(1,2))]
D=lambda s: dt.date.fromisoformat(s)
dates=sorted({r['date_et'] for r in rows}); bydate=defaultdict(list)
for r in rows: bydate[(r['date_et'],r['session'])].append(r)
cache={}
def top5(ref_key,ref_rows):
    if ref_key in cache: return cache[ref_key]
    pc=Counter()
    for r in ref_rows:
        for p in drawpairs(r['result_digits']): pc[p]+=1
    sup={cs:sum(pc[p] for p in SP[cs]) for cs in ALLSETS}; out={}
    for k in (6,3,1):
        vals=[sup[cs] for cs in ALLSETS if cls(cs)==k]; mu=st.mean(vals); sd=st.pstdev(vals) or 1
        for cs in ALLSETS:
            if cls(cs)==k: out[cs]=(sup[cs]-mu)/sd
    t=sorted(ALLSETS,key=lambda cs:(-out[cs],cs))[:5]; cache[ref_key]=t; return t
def run(pool,sess,label):
    pr=[r for r in rows if r['session']==sess and (pool is None or r['jurisdiction'] in pool)]
    pd=defaultdict(list)
    for r in pr: pd[r['date_et']].append(r)
    evald=[d for d in dates if '2026-05-01'<=d<='2026-06-30' and pd.get(d)]
    def refs(d):
        dd=D(d); prev=(dd-dt.timedelta(1)).isoformat()
        return bydate.get((prev,'evening'),[])+(bydate.get((d,'midday'),[]) if sess=='evening' else bydate.get((prev,'midday'),[]))
    def score(refmap):
        h=0;e=0.0
        for d in evald:
            top=top5((refmap[d],sess),refs(refmap[d]))
            drawn=Counter(r['comboset_sorted'] for r in pd[d]); nd=len(pd[d])
            h+=sum(drawn[cs] for cs in top); e+=sum(nd*cls(cs)/1000 for cs in top)
        return (h-e)/math.sqrt(e),h,e
    real=score({d:d for d in evald})
    pool_dates=[d for d in dates if '2026-04-10'<=d<='2026-11-02']
    zs=[]
    for i in range(NPERM):
        zs.append(score({d:random.choice(pool_dates) for d in evald})[0])
    zs.sort()
    print(f"{label}: real z {real[0]:+.2f} ({real[1]}/{real[2]:.1f}) · null z mean {st.mean(zs):+.2f} sd {st.pstdev(zs):.2f} · P(null ≥ real) = {sum(x>=real[0] for x in zs)}/{NPERM} · null 95th pct {zs[int(0.95*NPERM)]:+.2f}")
run(EARLY,'evening','EARLY-13 pair_prevEve+mid top-5'); run(None,'midday','ALL midday pair_prevEve+mid top-5'); run(None,'evening','ALL evening pair_prevEve+mid top-5')
