import json,glob,os,numpy as np,pandas as pd
EQ={'EQ','BE','BZ','SM','ST'}
frames=[]
for f in sorted(glob.glob('ohlc/*.csv')):
    d=pd.read_csv(f,usecols=['TckrSymb','SctySrs','OpnPric','HghPric','LwPric','ClsPric','PrvsClsgPric','TtlTradgVol'])
    d=d[d.SctySrs.isin(EQ)].copy(); d['date']=os.path.basename(f)[:-4]; frames.append(d)
px=pd.concat(frames); px=px.sort_values(['TckrSymb','date']).drop_duplicates(['TckrSymb','date'],keep='first')
px.columns=['sym','ser','o','h','l','c','pc','v','date']
out=[]
for f in glob.glob('stocks/*.json'):
    j=json.load(open(f)); t=j['ticker']
    g=px[px.sym==t]
    if len(g)<150: continue
    s=pd.DataFrame(j['series'])[['d','cr','q','pct','rank']].rename(columns={'d':'date'})
    g=g.merge(s,on='date',how='left').reset_index(drop=True)
    g['q']=g.q.where(g.q>0)
    c=g.c; 
    g['ca']=(g.pc/c.shift(1)-1).abs()>0.005          # price discontinuity (split/bonus/ex-date) on this day
    cacum=g.ca.astype(int).cumsum()
    for k in (1,3,5,10):
        ch=g.q/g.q.shift(k)-1
        bad=(cacum-cacum.shift(k))>0
        g[f'q{k}']=ch.where(~bad)
    # relative: robust z of 3d change vs own trailing 250d, and cumulative drawdown of q from 60d peak
    med=g.q3.rolling(250,min_periods=120).median().shift(1)
    iqr=(g.q3.rolling(250,min_periods=120).quantile(.75)-g.q3.rolling(250,min_periods=120).quantile(.25)).shift(1)
    g['qz3']=(g.q3-med)/iqr.replace(0,np.nan)
    g['qpk']=g.q/g.q.rolling(60,min_periods=20).max()-1
    # candle
    rng=(g.h-g.l).replace(0,np.nan)
    g['lowwick']=(np.minimum(g.o,g.c)-g.l)/rng
    g['upwick']=(g.h-np.maximum(g.o,g.c))/rng
    g['clv']=(g.c-g.l)/rng
    g['body']=(g.c-g.o)/rng
    r=(g.h-g.l)/g.c
    g['rangerel']=r/r.rolling(20).median().shift(1)
    g['volrel']=g.v/g.v.rolling(20).median().shift(1)
    g['gap']=g.o/g.pc-1
    ema=c.ewm(span=20,adjust=False).mean()
    g['dist20']=c/ema-1; g['lowvs20']=g.l/ema-1
    g['dist21']=c/c.rolling(21).mean()-1
    g['above50']=c>c.rolling(50).mean()
    g['dd20']=c/g.h.rolling(20).max()-1
    g['ret60']=c/c.shift(60)-1
    g['ret3']=c/c.shift(3)-1
    # forward from entry at close t+1
    e=c.shift(-1)
    for h in (5,10,20): g[f'f{h}']=c.shift(-1-h)/e-1
    lowmin=pd.concat([g.l.shift(-k) for k in range(2,12)],axis=1).min(axis=1)
    g['mae10']=lowmin/e-1
    g['sym']=t
    out.append(g)
df=pd.concat(out,ignore_index=True)
df.to_pickle('feat.pkl'); print(df.shape, df.date.min(), df.date.max(), df.sym.nunique())
