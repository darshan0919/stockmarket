import pandas as pd,numpy as np
df=pd.read_pickle('feat2.pkl')
last=sorted(df.date.unique())[-1]; print('last price date',last)
loc=df.above50&df.dist20.between(-.06,.03); wick=df.lowwick>=.4
lead=(df.ret120_rank>=.6)&(df.hi250>=-.25)
G4=loc&wick&(df.q10<=-.15)&lead&(df.cr>=20)
H4=loc&wick&(df.qpk<=-.25)&lead&(df.cr>=20)
df['G4']=G4; df['H4']=H4
dates=sorted(df.date.unique())[-6:]
nxt=df[df.date==last].set_index('sym').c
out=df[(df.date.isin(dates))&(G4|H4)].copy()
out['after']=out.sym.map(nxt)/out.c-1
cols=['date','sym','cr','q10','qpk','qz3','lowwick','dist20','volrel','dper_rel','ret120_rank','hi250','G4','H4','after']
out=out.sort_values(['date','cr'],ascending=[False,False])[cols]
pd.set_option('display.width',250,'display.max_columns',40)
print(out.round(3).head(40).to_string(index=False)); print(len(out))
m=df[(df.sym=='MOREPENLAB')&(df.date>='2026-10-06')][['date','c','o','h','l','lowwick','dist20','q3','q10','qpk','qz3','dper_rel','ret120_rank','hi250']]; print(m.round(3).to_string(index=False))
