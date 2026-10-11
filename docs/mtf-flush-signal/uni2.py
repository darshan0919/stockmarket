import pandas as pd,numpy as np
df=pd.read_pickle('feat2.pkl')
df=df[(df.cr>=20)&df.f20.notna()&df.qz3.notna()].copy()
for h in (5,10,20): df[f'x{h}']=df[f'f{h}']-df.groupby('date')[f'f{h}'].transform('median')
dates=sorted(df.date.unique()); di={d:i for i,d in enumerate(dates)}
split='2025-07-01'
def run(name,mask,cool=10):
    s=df[mask].sort_values(['sym','date']); s=s.assign(di=s.date.map(di)); keep=[];last={}
    for r in s.itertuples():
        if r.sym in last and r.di-last[r.sym]<cool: continue
        last[r.sym]=r.di; keep.append(r.Index)
    s=s.loc[keep]; o=[]
    for lab,p in (('tr',s[s.date<split]),('te',s[s.date>=split])):
        if len(p)<15: o.append(f'{lab} n={len(p)}'); continue
        o.append(f"{lab} n={len(p)} 10d {p.x10.median()*100:+.2f}%/{(p.x10>0).mean()*100:.0f}% 20d {p.x20.median()*100:+.2f}%/{(p.x20>0).mean()*100:.0f}% MAE {p.mae10.median()*100:.1f}%")
    print(f'{name:58s}',' || '.join(o))
loc=df.above50&df.dist20.between(-.06,.03); wick=df.lowwick>=.4
lead=(df.ret120_rank>=.6)&(df.hi250>=-.25)
dhi=df.dper_rel>=1.3; dlo=df.dper_rel<=.9; down=df.ret1<0
G=loc&wick&(df.q10<=-.15); H=loc&wick&(df.qpk<=-.25)
print('(med excess vs same-date median / hit-rate; tr=<2025-07, te=>=2025-07)')
run('A  location only',loc)
run('P0 price-only: loc+wick',loc&wick)
run('P1 price-only: loc+wick+down day+delivery>=1.3x',loc&wick&down&dhi)
run('P2 price-only: loc+wick+leader',loc&wick&lead)
run('P3 price-only: loc+wick+leader+down+deliv>=1.3x',loc&wick&lead&down&dhi)
run('G0 MTF10d<=-15%+wick+loc',G)
run('G1  + delivery>=1.3x',G&dhi)
run('G2  + delivery<=0.9x',G&dlo)
run('G3  + down day & delivery>=1.3x (June-note signature)',G&down&dhi)
run('G4  + leader (120d RS top40%, within 25% of 52w high)',G&lead)
run('G5  + leader + delivery>=1.3x',G&lead&dhi)
run('H0 book<=-25% from 60d peak+wick+loc',H)
run('H4  + leader',H&lead)
run('H5  + leader + delivery>=1.3x',H&lead&dhi)
run('HG both G and H + leader',G&H&lead)
