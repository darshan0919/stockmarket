import pandas as pd,numpy as np
df=pd.read_pickle('feat.pkl')
df=df[(df.cr>=20)&df.f20.notna()&df.qz3.notna()].copy()
# same-date MEDIAN forward return of eligible stocks = market control
for h in (5,10,20): df[f'x{h}']=df[f'f{h}']-df.groupby('date')[f'f{h}'].transform('median')
df['mae_x']=df.mae10
split='2025-07-01'
rng=np.random.default_rng(0)
def run(name,mask,cool=10):
    s=df[mask].sort_values(['sym','date'])
    # cooldown: keep first event per symbol per `cool` sessions (by row index in global date order)
    dates=sorted(df.date.unique()); di={d:i for i,d in enumerate(dates)}
    s=s.assign(di=s.date.map(di)); keep=[];last={}
    for r in s.itertuples():
        if r.sym in last and r.di-last[r.sym]<cool: continue
        last[r.sym]=r.di; keep.append(r.Index)
    s=s.loc[keep]
    res=[]
    for lab,part in (('train<2025-07',s[s.date<split]),('test>=2025-07',s[s.date>=split])):
        if len(part)<15: res.append(f'{lab} n={len(part)}'); continue
        o=[f'{lab} n={len(part)} d={part.date.nunique()}']
        for h in (5,10,20):
            x=part[f'x{h}']; 
            # date-clustered bootstrap CI of mean excess
            g=part.groupby('date')[f'x{h}'].mean().values; b=[rng.choice(g,len(g)).mean() for _ in range(400)]
            o.append(f'{h}d med {x.median()*100:+.2f}% mean {x.mean()*100:+.2f}% [{np.percentile(b,5)*100:+.1f},{np.percentile(b,95)*100:+.1f}] hit {(x>0).mean()*100:.0f}%')
        o.append(f'MAE10 med {part.mae10.median()*100:.1f}%')
        res.append(' | '.join(o))
    print(name); [print('   ',r) for r in res]
loc=(df.above50)&(df.dist20.between(-0.06,0.03))
wick=df.lowwick>=0.40
vol=df.volrel>=1.5
run('BASE: all eligible',df.f20.notna())
run('A  location only (above50, dist20 -6..+3%)',loc)
run('B  location+lowerwick>=.4 (price-only, NO MTF)',loc&wick)
run('C  location+lowerwick+volume>=1.5x (price-only)',loc&wick&vol)
run('D  MTF relative flush qz3<=-1.5 + location',loc&(df.qz3<=-1.5))
run('E  D + lowerwick>=.4',loc&(df.qz3<=-1.5)&wick)
run('F  D + wick + volume>=1.5x',loc&(df.qz3<=-1.5)&wick&vol)
run('G  MTF 10d cumulative q10<=-15% + wick + location',loc&(df.q10<=-0.15)&wick)
run('H  book 25% below 60d peak (qpk<=-.25) + wick + location',loc&(df.qpk<=-0.25)&wick)
run('I  qz3<=-2.5 (extreme) + wick + volume',loc&(df.qz3<=-2.5)&wick&vol)
run('J  REVERSE test: MTF book rising qz3>=+1.5 + location + wick',loc&(df.qz3>=1.5)&wick)
