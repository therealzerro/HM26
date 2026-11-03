# Draws-since drill-down (operator ask 11/03 evening). Families NOT in COHORT-02:
#  B. draws-since × pair+digit interaction (within the top-K of tonight's ticket scorer)
#  C. straight-level (ordered 000-999) draws-since
#  E. same-session draws-since (evening-only / midday-only gap)
#  A. national any-session draws-since deciles (COHORT-02 family, reproduced as control)
import json,sys,datetime as dt,math,statistics as st
from collections import defaultdict,Counter
_a=sys.argv; sys.argv=[sys.argv[0],sys.argv[1]]
exec(open(__file__.replace('draws_since_drill.py','flat_terms.py')).read().split('TERMS=[')[0])
sys.argv=_a
POOLS=[('EARLY-13 eve',EARLY,'evening'),('ALL evening',None,'evening'),('ALL midday',None,'midday')]
START,END=(sys.argv[2],sys.argv[3]) if len(sys.argv)>3 else ('2026-05-01','2026-11-02')
def zf(o,e): return (o-e)/math.sqrt(e) if e>0 else 0
# ordered rows in time: (date, session_order, row). midday before evening.
SESS={'midday':0,'evening':1}
timeline=sorted(rows,key=lambda r:(r['date_et'],SESS.get(r['session'],2),r['jurisdiction']))
def run_pool(pn,pool,sess):
    pr=defaultdict(list)
    for r in rows:
        if r['session']==sess and (pool is None or r['jurisdiction'] in pool): pr[r['date_et']].append(r)
    # incremental state: draws-since counters (in national draws), per set / per straight / per session-set
    ds_set=defaultdict(int); ds_str=defaultdict(int); ds_sess=defaultdict(int); n_nat=0; n_sess=0
    seen_set=set(); seen_str=set(); seen_sess=set()
    A=defaultdict(lambda:[0,0.0]); C=defaultdict(lambda:[0,0.0]); E=defaultdict(lambda:[0,0.0]); B=defaultdict(lambda:[0,0.0])
    i=0; T=len(timeline)
    for d in dates:
        # 1) advance timeline through everything strictly before this slate session
        def consume(r):
            nonlocal n_nat,n_sess
            cs=r['comboset_sorted']; n_nat+=1
            ds_set[cs]=0; seen_set.add(cs); ds_str[r['result_digits']]=0; seen_str.add(r['result_digits'])
            if r['session']==sess:
                n_sess+=1; ds_sess[cs]=0; seen_sess.add(cs)
        while i<T and (timeline[i]['date_et']<d or (timeline[i]['date_et']==d and SESS.get(timeline[i]['session'],2)<SESS[sess])):
            consume(timeline[i]); i+=1
        if START<=d<=END and pr.get(d):
            # draws-since in draws = n_nat - index of last; we track by resetting to 0 and reading n at hit → store last index instead
            pass
        if START<=d<=END and pr.get(d):
            drawn=Counter(r['comboset_sorted'] for r in pr[d]); nd=len(pr[d]); drawn_str=Counter(r['result_digits'] for r in pr[d])
            # A: national any-session draws-since, in units of expected draws for the class (gap / (n per set expectation)) → bucket by gap×cls/1000 (expected hits elapsed)
            # For sets never seen: treat gap as n_nat.
            for cs in ALLSETS:
                k=cls(cs); gap=(n_nat-LAST_SET[cs]) if cs in LAST_SET else n_nat
                ex=gap*k/1000   # expected hits elapsed since last draw
                b='<0.5' if ex<0.5 else '0.5–1' if ex<1 else '1–2' if ex<2 else '2–3' if ex<3 else '3–5' if ex<5 else '5+'
                A[b][0]+=drawn[cs]; A[b][1]+=nd*k/1000
                gs=(n_sess-LAST_SESS[cs]) if cs in LAST_SESS else n_sess; exs=gs*k/1000
                bs='<0.5' if exs<0.5 else '0.5–1' if exs<1 else '1–2' if exs<2 else '2–3' if exs<3 else '3–5' if exs<5 else '5+'
                E[bs][0]+=drawn[cs]; E[bs][1]+=nd*k/1000
            # C: straight-level
            for s in (f"{j:03d}" for j in range(1000)):
                gap=(n_nat-LAST_STR[s]) if s in LAST_STR else n_nat; ex=gap/1000
                b='<0.5' if ex<0.5 else '0.5–1' if ex<1 else '1–2' if ex<2 else '2–3' if ex<3 else '3–5' if ex<5 else '5+'
                C[b][0]+=drawn_str[s]; C[b][1]+=nd/1000
            # B: within pair+digit top-10 / top-20, split by expected-hits-elapsed above/below 1.0
            sc={cs:std(t_pair(d,sess))[cs]+std(t_digit(d,sess))[cs] for cs in ALLSETS}; ranked=sorted(ALLSETS,key=lambda cs:(-sc[cs],cs))
            for K in (10,20):
                for cs in ranked[:K]:
                    k=cls(cs); gap=(n_nat-LAST_SET[cs]) if cs in LAST_SET else n_nat; ex=gap*k/1000
                    b=f"top{K} due<1" if ex<1 else f"top{K} due1–2" if ex<2 else f"top{K} due2+"
                    B[b][0]+=drawn[cs]; B[b][1]+=nd*k/1000
        # consume this slate session's own rows AFTER scoring (they're in timeline at date d, session sess)
        while i<T and timeline[i]['date_et']==d and SESS.get(timeline[i]['session'],2)==SESS[sess]:
            r=timeline[i]; LAST_SET[r['comboset_sorted']]=n_nat; LAST_STR[r['result_digits']]=n_nat
            if r['session']==sess: LAST_SESS[r['comboset_sorted']]=n_sess
            consume(r); i+=1
    def show(title,Dct,order):
        print(f"\n[{pn}] {title}")
        print(f"{'bucket':14s} {'hits':>6s} {'exp':>8s} {'obs/exp':>8s} {'z':>6s}")
        for b in order:
            if b in Dct: h,e=Dct[b]; print(f"{b:14s} {h:6d} {e:8.1f} {h/e if e else 0:8.2f} {zf(h,e):+6.2f}")
    O=['<0.5','0.5–1','1–2','2–3','3–5','5+']
    show('A. national any-session draws-since, bucket = expected hits elapsed (gap × class/1000) — COHORT-02 control',A,O)
    show('E. SAME-SESSION draws-since (gap counted in this session\'s national draws only)',E,O)
    show('C. STRAIGHT (ordered 000–999) national draws-since, bucket = gap/1000; hits = exact-order matches',C,O)
    show('B. pair+digit top-K × national draws-since',B,['top10 due<1','top10 due1–2','top10 due2+','top20 due<1','top20 due1–2','top20 due2+'])
for pn,pool,sess in POOLS:
    LAST_SET={}; LAST_STR={}; LAST_SESS={}
    run_pool(pn,pool,sess)
