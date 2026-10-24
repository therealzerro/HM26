import json,collections,math
from math import comb
rows=json.load(open('audit/data/histories_raw.json'))
rows=[r for r in rows if r['jurisdiction'] not in ('MD','PR')]
N=len(rows)
from math import lgamma,log
from math import exp as mexp
def lpmf(i,n,p): return lgamma(n+1)-lgamma(i+1)-lgamma(n-i+1)+i*log(p)+(n-i)*log(1-p)
def binom_two(k,n,p):
    pk=lpmf(k,n,p)
    return min(1,sum(mexp(lpmf(i,n,p)) for i in range(n+1) if lpmf(i,n,p)<=pk+1e-9))
def binom_lower(k,n,p): return sum(mexp(lpmf(i,n,p)) for i in range(k+1))
digits=[r['result_digits'] for r in rows]
cnt=collections.Counter(digits)
classes={
 'triples 000..999 (10)': [str(d)*3 for d in range(10)],
 'ascending runs 012..789 (8)': [''.join(str(i+j) for j in range(3)) for i in range(8)],
 'descending runs 210..987 (8)': [''.join(str(i+2-j) for j in range(3)) for i in range(8)],
 'culture combos 777 711 911 420 666 123 321 369 (8)': ['777','711','911','420','666','123','321','369'],
 'all even digits (125)': [f"{a}{b}{c}" for a in '02468' for b in '02468' for c in '02468'],
 'all odd digits (125)': [f"{a}{b}{c}" for a in '13579' for b in '13579' for c in '13579'],
 'date-like MDD/MMD 101..931 (≈365)': sorted(set([f"{m}{d:02d}" for m in range(1,10) for d in range(1,32)]+[f"{m:02d}{d}" for m in range(10,13) for d in range(1,10)])),
 'sum 13-14 (middle, popular "sum" plays)': [f"{a}{b}{c}" for a in range(10) for b in range(10) for c in range(10) if 13<=a+b+c<=14],
 'doubles (270)': [f"{a}{b}{c}" for a in range(10) for b in range(10) for c in range(10) if len({a,b,c})==2],
}
print(f"N draws = {N}")
print(f"{'class':52s} {'k':>5s} {'obs':>5s} {'exp':>8s} {'ratio':>6s} {'z':>6s} {'p(two)':>8s} {'p(under)':>9s}")
for name,combos in classes.items():
    combos=[c for c in combos if len(c)==3 and c.isdigit()]
    k=len(set(combos)); p=k/1000; obs=sum(cnt[c] for c in set(combos)); exp=N*p
    z=(obs-exp)/math.sqrt(N*p*(1-p))
    print(f"{name:52s} {k:5d} {obs:5d} {exp:8.1f} {obs/exp:6.3f} {z:+6.2f} {binom_two(obs,N,p):8.3f} {binom_lower(obs,N,p):9.3f}")
# triples by half and session
H1=[r for r in rows if r['date_et']<='2026-07-11']; H2=[r for r in rows if r['date_et']>'2026-07-11']
for lab,rs in (('H1',H1),('H2',H2),('midday',[r for r in rows if r['session']=='midday']),('evening',[r for r in rows if r['session']=='evening'])):
    t=sum(1 for r in rs if len(set(r['result_digits']))==1); e=len(rs)*0.01
    print(f"triples {lab:8s}: {t} vs {e:.1f} expected (ratio {t/e:.2f}, p(under) {binom_lower(t,len(rs),0.01):.3f})")
# triples by jurisdiction: list the most under-drawn
print("\ntriples per jurisdiction (obs / exp):")
byj=collections.defaultdict(list)
for r in rows: byj[r['jurisdiction']].append(r['result_digits'])
out=[]
for j,ds in byj.items():
    t=sum(1 for d in ds if len(set(d))==1); out.append((t-len(ds)*0.01,j,t,len(ds)*0.01))
out.sort()
print("  ", ", ".join(f"{j} {t}/{e:.1f}" for _,j,t,e in out))
json.dump({j:[t,e] for _,j,t,e in out},open('triples_by_jur.json','w'))
