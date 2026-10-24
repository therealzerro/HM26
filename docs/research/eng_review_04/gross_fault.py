import json,collections,math
rows=json.load(open('audit/data/histories_raw.json'))
rows=[r for r in rows if r['jurisdiction'] not in ('MD','PR')]
rows.sort(key=lambda r:(r['jurisdiction'],r['session'],r['date_et'],r['result_digits']))
by=collections.defaultdict(list)
for r in rows: by[(r['jurisdiction'],r['session'])].append(r)
print("cells:",len(by),"rows:",len(rows))
# 1. AZ-2013 signature: a digit absent from a position for >=30 consecutive draws (null p per start ~0.9^30=0.042; <=1 occurrence in 40: ~0.055). Use stricter: absent >=40 consecutive (0.9^40=0.0148) and report max gap per cell/position/digit.
print("\n== Longest run of consecutive draws with a digit ABSENT from a position (per cell); null P(gap>=L) per digit-start ≈ 0.9^L ==")
worst=[]
for k,rs in by.items():
    n=len(rs)
    for pos in range(3):
        seq=[r['result_digits'][pos] for r in rs]
        for d in '0123456789':
            best=cur=0
            for c in seq:
                cur = cur+1 if c!=d else 0
                best=max(best,cur)
            worst.append((best,k,pos+1,d,n))
worst.sort(reverse=True)
# expected max gap over n draws for one digit ~ log(n)/log(1/0.9) ≈ 2.3*ln n ; at n=200 ≈ 50
for b,k,pos,d,n in worst[:12]:
    exp_max=math.log(n*10/1)/math.log(1/0.9)  # rough: n starts x 10 digits... per-digit: log(n)/0.105
    print(f"  gap {b:3d} draws  {k[0]:>9s} {k[1]:7s} pos{pos} digit {d}  (n={n}; a run that long or longer somewhere in this cell's 30 digit-positions: P≈{min(1,30*n*0.9**b):.3f})")
# any digit with ZERO occurrences in the latest 40 draws of a cell (live fault check)
print("\n== LIVE check: digits absent from a position over the cell's most recent 40 draws ==")
hits=0
for k,rs in by.items():
    last=rs[-40:]
    for pos in range(3):
        seen=set(r['result_digits'][pos] for r in last)
        miss=sorted(set('0123456789')-seen)
        if miss: hits+=1; print(f"  {k[0]:>9s} {k[1]:7s} pos{pos+1} missing {miss} in last {len(last)} draws (null P(one given digit absent in 40)=0.0148; any of 10 ≈ 0.14)")
print("  cells×positions flagged:",hits,"of",len(by)*3,"(expected ≈",round(len(by)*3*0.14,1),"by chance)")
# 2. AZ-2017 signature: identical full combo repeated within 7 draws in the same cell; and same combo >=3 times within any 7-draw window
print("\n== Exact combo repeats within 7 draws, same cell (null per pair ≈ 0.001; expected per cell ≈ 7n/1000) ==")
tot_obs=tot_exp=0; triples=[]
for k,rs in by.items():
    seq=[r['result_digits'] for r in rs]; n=len(seq); obs=0
    for i in range(n):
        for j in range(i+1,min(n,i+8)):
            if seq[i]==seq[j]: obs+=1
        w=seq[i:i+7]
        c=collections.Counter(w).most_common(1)[0]
        if c[1]>=3: triples.append((k,rs[i]['date_et'],c[0],c[1]))
    exp=sum(min(7,n-1-i) for i in range(n))/1000
    tot_obs+=obs; tot_exp+=exp
    if obs>=3: print(f"  {k[0]:>9s} {k[1]:7s}: {obs} repeats within 7 (expected {exp:.2f})")
print(f"  ALL cells: {tot_obs} repeats observed vs {tot_exp:.1f} expected (Poisson p two-sided ≈ {2*min(sum(math.exp(-tot_exp)*tot_exp**i/math.factorial(i) for i in range(tot_obs+1)),1-sum(math.exp(-tot_exp)*tot_exp**i/math.factorial(i) for i in range(tot_obs))):.2f})")
print("  same combo >=3 times in any 7-draw window:",triples if triples else "none")
# 3. Back-to-back identical draws (consecutive) per cell
bb=sum(1 for rs in by.values() for a,b in zip(rs,rs[1:]) if a['result_digits']==b['result_digits'])
print(f"\n== Consecutive identical draws, same cell: {bb} observed vs {sum(len(rs)-1 for rs in by.values())/1000:.1f} expected ==")
