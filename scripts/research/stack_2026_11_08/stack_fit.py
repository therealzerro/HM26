# Consolidated master score: stack every candidate term, fit May–Aug, score Sep 1–Nov 7 untouched.
import json,sys,itertools,datetime as dt,math
import numpy as np
from scipy.optimize import minimize
rng=np.random.default_rng(7)
rows=json.load(open(sys.argv[1])); rows=[r for r in rows if not (r['jurisdiction']=='DC' and r['date_et']<='2026-04-21')]
rows.sort(key=lambda r:(r['date_et'],0 if r['session']=='midday' else 1,r['id']))
sets=sorted({''.join(sorted(f"{i:03d}")) for i in range(1000)}); sidx={s:i for i,s in enumerate(sets)}; NC=len(sets)
kls=np.array([len(set(s)) for s in sets]); perms=np.where(kls==3,6,np.where(kls==2,3,1))
PERMS=[sorted({''.join(p) for p in itertools.permutations(s)}) for s in sets]
orders=[f"{i:03d}" for i in range(1000)]; O=np.array([[int(c) for c in o] for o in orders]); OK=np.array([len(set(o)) for o in orders]); oidx={o:i for i,o in enumerate(orders)}
pairs=sorted({''.join(sorted(p)) for s in orders for p in itertools.combinations(s,2)}); pidx={p:i for i,p in enumerate(pairs)}
set_pairs=[[pidx[''.join(sorted(p))] for p in itertools.combinations(s,2)] for s in sets]; set_digits=[[int(c) for c in s] for s in sets]
sess_keys=sorted({(r['date_et'],0 if r['session']=='midday' else 1) for r in rows}); skey={k:i for i,k in enumerate(sess_keys)}; NS=len(sess_keys)
C=np.zeros((NS,NC),np.int32); P=np.zeros((NS,55),np.int32); D=np.zeros((NS,10),np.int32); N=np.zeros(NS,np.int32)
PP=np.zeros((NS,3,10,10),np.int32); PD=np.zeros((NS,3,10),np.int32)
for r in rows:
    si=skey[(r['date_et'],0 if r['session']=='midday' else 1)]; dig=r['result_digits']; ci=sidx[''.join(sorted(dig))]
    C[si,ci]+=1; N[si]+=1
    for p in itertools.combinations(dig,2): P[si,pidx[''.join(sorted(p))]]+=1
    for i,ch in enumerate(dig): D[si,int(ch)]+=1; PD[si,i,int(ch)]+=1
    for k,(a,b) in enumerate(((0,1),(0,2),(1,2))): PP[si,k,int(dig[a]),int(dig[b])]+=1
dates=[dt.date.fromisoformat(k[0]) for k in sess_keys]; ev=np.array([k[1] for k in sess_keys])
def win(M,k):
    cum=np.vstack([np.zeros((1,)+M.shape[1:],M.dtype),np.cumsum(M,axis=0)]); return np.array([cum[s]-cum[max(s-k,0)] for s in range(M.shape[0])],dtype=float)
Nw=lambda k: np.array([N[max(s-k,0):s].sum() for s in range(NS)],float)
C60,C180,Call=win(C,60),win(C,180),win(C,10**6); N60,N180,Nall=Nw(60),Nw(180),Nw(10**6)
P120=win(P,120); D60=win(D,60); N120=Nw(120)
pair120=np.array([P120[:,sp].sum(1) for sp in set_pairs]).T/np.maximum(N120,1)[:,None]
dig60=np.array([D60[:,sd].sum(1) for sd in set_digits]).T/np.maximum(N60,1)[:,None]
gap=np.zeros((NS,NC)); last=np.full(NC,-1)
for s in range(NS): gap[s]=np.where(last>=0,s-last,200); last=np.where(C[s]>0,s,last)
prev1=np.vstack([np.zeros((1,NC)),(C[:-1]>0)]); prev3=win((C>0).astype(np.int32),3)
# --- ticket-style reference block per session: evening → prev evening + same-day midday; midday → prev day both sessions ---
def ref_idx(s):
    d,e=sess_keys[s]; dd=dt.date.fromisoformat(d); prev=(dd-dt.timedelta(1)).isoformat()
    if e==1: return [skey[k] for k in ((prev,1),(d,0)) if k in skey]
    return [skey[k] for k in ((prev,0),(prev,1)) if k in skey]
def zcls(v,k):
    z=np.zeros_like(v,float)
    for c in (1,2,3):
        m=k==c; mu=v[m].mean(); sd=v[m].std() or 1; z[m]=(v[m]-mu)/sd
    return z
pairz=np.zeros((NS,NC)); digz=np.zeros((NS,NC)); posz=np.zeros((NS,NC)); closed=np.zeros((NS,NC)); nref=np.zeros(NS)
for s in range(NS):
    R=ref_idx(s)
    if not R: continue
    pc=P[R].sum(0); dc=D[R].sum(0); nref[s]=N[R].sum()
    pairz[s]=zcls(np.array([pc[sp].sum() for sp in set_pairs],float),kls); digz[s]=zcls(np.array([dc[sd].sum() for sd in set_digits],float),kls)
    pp=PP[R].sum(0); pd=PD[R].sum(0)
    vpp=sum(pp[k,O[:,a],O[:,b]] for k,(a,b) in enumerate(((0,1),(0,2),(1,2)))); vpd=sum(pd[i,O[:,i]] for i in range(3))
    zo=zcls(vpp.astype(float),OK)+zcls(vpd.astype(float),OK)
    posz[s]=np.array([max(zo[oidx[o]] for o in PERMS[ci]) for ci in range(NC)])
    # closed = drawn in the same-day midday (evening target) / prev day (midday target) — the ticket convention
    closed[s]=(C[R].sum(0)>0)
Y=(C>0).astype(float)
names=['rate60','rate180','rate_all','gap','log_gap','prev1','prev3','pair120','dig60','pressure','PAIR_z','DIGIT_z','POS_z','closed','is_double','is_triple','evening']
def feats():
    F=[]
    for s in range(NS):
        F.append(np.column_stack([C60[s]/max(N60[s],1)*1000,C180[s]/max(N180[s],1)*1000,Call[s]/max(Nall[s],1)*1000,np.minimum(gap[s],200),np.log1p(gap[s]),prev1[s],prev3[s],pair120[s]*1000,dig60[s]*100,np.minimum(gap[s],200)*Call[s]/max(Nall[s],1)*1000,pairz[s],digz[s],posz[s],closed[s],(kls==2).astype(float),(kls==1).astype(float),np.full(NC,ev[s],float)]))
    return np.vstack(F)
X=feats(); y=Y.reshape(-1); sess_of=np.repeat(np.arange(NS),NC); set_of=np.tile(np.arange(NC),NS)
valid=np.array([nref[s]>=20 and dates[s]>=dt.date(2026,5,1) for s in range(NS)])
train=np.array([valid[s] and dates[s]<=dt.date(2026,8,31) for s in range(NS)]); test=np.array([valid[s] and dates[s]>=dt.date(2026,9,1) for s in range(NS)])
tr=train[sess_of]; te=test[sess_of]
def auc(score,yy):
    order=np.argsort(score); r=np.empty(len(score)); r[order]=np.arange(1,len(score)+1)
    _,inv,cnt=np.unique(score,return_inverse=True,return_counts=True); r=(np.bincount(inv,weights=r)/cnt)[inv]
    npos=yy.sum(); return (r[yy==1].sum()-npos*(npos+1)/2)/(npos*(len(yy)-npos))
def fit_logit(Xm,yy,l2=1.0):
    mu,sd=Xm.mean(0),Xm.std(0)+1e-9; Z=np.column_stack([np.ones(len(Xm)),(Xm-mu)/sd])
    def f(w):
        p=1/(1+np.exp(-(Z@w))); eps=1e-12
        return -(yy*np.log(p+eps)+(1-yy)*np.log(1-p+eps)).sum()+l2*(w[1:]**2).sum()/2, Z.T@(p-yy)+np.r_[0,l2*w[1:]]
    w=minimize(f,np.zeros(Z.shape[1]),jac=True,method='L-BFGS-B').x
    return (lambda Xn: np.column_stack([np.ones(len(Xn)),(Xn-mu)/sd])@w), w
print(f"sessions valid {valid.sum()} (train {train.sum()}, test {test.sum()}); draws train {N[train].sum()} test {N[test].sum()}; rows train {tr.sum()} test {te.sum()}")
print("\n== 1. FULL STACK (all 220 sets; class indicators included) ==")
pred,w=fit_logit(X[tr],y[tr])
print(f" train AUC {auc(pred(X[tr]),y[tr]):.4f} | TEST AUC {auc(pred(X[te]),y[te]):.4f}")
# within-class AUC (removes the trivial class effect)
for c,nm in ((3,'singles'),(2,'doubles')):
    m=te&(kls[set_of]==c); mt=tr&(kls[set_of]==c); print(f"   within {nm}: train AUC {auc(pred(X[mt]),y[mt]):.4f} | TEST AUC {auc(pred(X[m]),y[m]):.4f}")
# bootstrap CI on coefficients (resample training sessions)
B=40; W=[]
tr_sess=np.where(train)[0]
for b in range(B):
    bs=rng.choice(tr_sess,len(tr_sess),replace=True); idx=np.concatenate([np.arange(s*NC,(s+1)*NC) for s in bs])
    _,wb=fit_logit(X[idx],y[idx]); W.append(wb[1:])
W=np.array(W); lo,hi=np.percentile(W,[2.5,97.5],axis=0)
print(" standardized coefficients (train) with 95% bootstrap CI; * = CI excludes 0:")
for i,n in enumerate(names): print(f"   {n:10} {w[i+1]:+.4f}  [{lo[i]:+.4f}, {hi[i]:+.4f}] {'*' if lo[i]>0 or hi[i]<0 else ''}")
print("\n== 2. SINGLE-TERM TEST AUC within class (singles / doubles), sign as-is ==")
for i,n in enumerate(names[:13]):
    out=[]
    for c in (3,2):
        m=te&(kls[set_of]==c); mt=tr&(kls[set_of]==c); out.append(f"{'S' if c==3 else 'D'} train {auc(X[mt][:,i],y[mt]):.4f} test {auc(X[m][:,i],y[m]):.4f}")
    print(f"   {n:10} "+' | '.join(out))
print("\n== 3. MASTER SCORE = positive-CI terms only (weights from train), TEST ==")
pos=[i for i in range(len(names)) if lo[i]>0 and names[i] not in ('is_double','is_triple','evening','closed')]
print("   terms with positive CI on train:",[names[i] for i in pos] or 'none')
def topk_eval(scorefn,mask_sess,K=5,label='',cls_only=None):
    hits=0;exp=0.0;ns=0;pct=[]
    for s in np.where(mask_sess)[0]:
        idx=np.arange(NC) if cls_only is None else np.where(kls==cls_only)[0]
        idx=idx[closed[s,idx]==0] if cls_only is None else idx
        sc=scorefn(X[s*NC+idx]); top=idx[np.argsort(-sc)[:K]]
        hits+=int((C[s,top]>0).sum()); exp+=sum(1-(1-perms[t]/1000)**N[s] for t in top); ns+=1
        drawn=np.where(C[s]>0)[0]
        for dset in drawn:
            same=idx[kls[idx]==kls[dset]]
            if dset in same: scs=scorefn(X[s*NC+same]); pct.append(((scs<scorefn(X[s*NC+dset:s*NC+dset+1])[0]).sum()+0.5*(scs==scorefn(X[s*NC+dset:s*NC+dset+1])[0]).sum())/len(same))
    print(f"   {label:44} top-{K} hits {hits} / exp {exp:.1f} (ratio {hits/exp:.3f}, z {(hits-exp)/math.sqrt(exp):+.2f}) over {ns} sessions | drawn-set within-class percentile {np.mean(pct):.4f}")
if pos:
    mu=X[tr][:,pos].mean(0); sd=X[tr][:,pos].std(0)+1e-9; wpos=w[1:][pos]
    master=lambda Xn: ((Xn[:,pos]-mu)/sd)@wpos
    topk_eval(master,test,label='MASTER (positive terms, train weights) TEST')
    topk_eval(master,train,label='MASTER TRAIN (in-sample)')
topk_eval(pred,test,label='full stack TEST')
topk_eval(pred,train,label='full stack TRAIN (in-sample)')
topk_eval(lambda Xn: Xn[:,10]+Xn[:,11],test,label='PAIR_z + DIGIT_z (the ticket scorer) TEST')
topk_eval(lambda Xn: Xn[:,10]+Xn[:,11]+Xn[:,12],test,label='PAIR+DIGIT+POS TEST')
topk_eval(lambda Xn: Xn[:,10],test,label='PAIR_z alone TEST')
topk_eval(lambda Xn: Xn[:,2],test,label='all-time rate TEST')
topk_eval(lambda Xn: -Xn[:,3],test,label='most overdue TEST')
topk_eval(lambda Xn: rng.random(len(Xn)),test,label='random control TEST')
print("\n== 4. Rolling month-ahead: fit on everything before month M, score M (full stack) ==")
for m0 in (6,7,8,9,10,11):
    trm=np.array([valid[s] and dates[s]<dt.date(2026,m0,1) and dates[s]>=dt.date(2026,5,1) for s in range(NS)]); tem=np.array([valid[s] and dates[s].month==m0 for s in range(NS)])
    if tem.sum()<10 or trm.sum()<20: continue
    pm,_=fit_logit(X[trm[sess_of]],y[trm[sess_of]])
    mS=tem[sess_of]&(kls[set_of]==3); print(f"   month {m0:2}: train sessions {trm.sum():3} → test {tem.sum():3}; singles TEST AUC {auc(pm(X[mS]),y[mS]):.4f}",end=''); topk_eval(pm,tem,label='')
