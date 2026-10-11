import pandas as pd,numpy as np,json
df=pd.read_pickle('feat2.pkl')
tot=pd.DataFrame(json.load(open('totals.json')))
n=tot[tot.exchange=='NSE'].copy().sort_values('date')
n['liq']=n.exposure_liquidated/n.beginning_outstanding
n['net1']=n.end_outstanding/n.beginning_outstanding-1
n['net5']=n.end_outstanding/n.end_outstanding.shift(5)-1
n['net10']=n.end_outstanding/n.end_outstanding.shift(10)-1
mk=n[['date','liq','net1','net5','net10']]
base=df[(df.cr>=20)&df.q1.notna()]
br=base.groupby('date').apply(lambda g: pd.Series({'breadth':(g.q1<=-.03).mean(),'breadth5':(g.q5<=-.10).mean()})).reset_index()
df=df.merge(mk,on='date',how='left').merge(br,on='date',how='left')
df=df[(df.cr>=20)&df.f20.notna()&df.qz3.notna()].copy()
for h in (5,10,20): df[f'x{h}']=df[f'f{h}']-df.groupby('date')[f'f{h}'].transform('median')
dates=sorted(df.date.unique()); di={d:i for i,d in enumerate(dates)}
split='2025-07-01'
loc=df.above50&df.dist20.between(-.06,.03); wick=df.lowwick>=.4
lead=(df.ret120_rank>=.6)&(df.hi250>=-.25)
G4=loc&wick&(df.q10<=-.15)&lead
def pick(mask,cool=10):
    s=df[mask].sort_values(['sym','date']); s=s.assign(di=s.date.map(di)); keep=[];last={}
    for r in s.itertuples():
        if r.sym in last and r.di-last[r.sym]<cool: continue
        last[r.sym]=r.di; keep.append(r.Index)
    return s.loc[keep]
s=pick(G4)
print('G4 n',len(s), 'tr',(s.date<split).sum(),'te',(s.date>=split).sum())
def rep(lab,p):
    if len(p)<15: return f'{lab} n={len(p)}'
    return f"{lab} n={len(p)} 20d {p.x20.median()*100:+.2f}%/{(p.x20>0).mean()*100:.0f}% 10d {p.x10.median()*100:+.2f}%/{(p.x10>0).mean()*100:.0f}%"
for m in ['liq','net1','net5','net10','breadth','breadth5']:
    med=s[m].median()
    hi=s[s[m]>med] if m in('liq','breadth','breadth5') else s[s[m]<med]   # 'stress' side: high liq/breadth, or low (more negative) net change
    lo=s[~s.index.isin(hi.index)]
    print(f'--- {m} (median {med:.4f}); stress side = {"above" if m in("liq","breadth","breadth5") else "below"} median')
    for lab,p in (('stress',hi),('calm  ',lo)):
        print('  ',rep(lab+' ALL',p),'||',rep('tr',p[p.date<split]),'||',rep('te',p[p.date>=split]))
# stock-level flush on days when many stocks flush at once (broker-wide) vs idiosyncratic
