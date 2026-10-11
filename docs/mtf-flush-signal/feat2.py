import glob,os,pandas as pd,numpy as np
df=pd.read_pickle('feat.pkl')
fr=[]
for f in sorted(glob.glob('deliv/*.csv')):
    d=pd.read_csv(f,skipinitialspace=True,usecols=['SYMBOL','SERIES','DELIV_QTY','DELIV_PER'],na_values=['-',' -'])
    d=d[d.SERIES.isin(['EQ','BE','BZ','SM','ST'])].copy(); d['date']=os.path.basename(f)[:-4]
    d['DELIV_QTY']=pd.to_numeric(d.DELIV_QTY,errors='coerce'); d['DELIV_PER']=pd.to_numeric(d.DELIV_PER,errors='coerce')
    fr.append(d[['SYMBOL','date','DELIV_QTY','DELIV_PER']])
dv=pd.concat(fr).drop_duplicates(['SYMBOL','date']).rename(columns={'SYMBOL':'sym','DELIV_QTY':'dq','DELIV_PER':'dper'})
df=df.merge(dv,on=['sym','date'],how='left').sort_values(['sym','date']).reset_index(drop=True)
g=df.groupby('sym',group_keys=False)
df['dper_rel']=df.dper/g.dper.apply(lambda s:s.rolling(20,min_periods=10).median().shift(1))
df['dq_rel']=df.dq/g.dq.apply(lambda s:s.rolling(20,min_periods=10).median().shift(1))
df['ret1']=df.c/g.c.shift(1)-1
df['ret120']=df.c/g.c.shift(120)-1
df['hi250']=df.c/g.c.apply(lambda s:s.rolling(250,min_periods=120).max())-1
df['ret120_rank']=df.groupby('date').ret120.rank(pct=True)
df.to_pickle('feat2.pkl'); print(df.shape, df.dper.notna().mean())
