import pandas as pd,numpy as np
df=pd.read_pickle('feat.pkl')
ev=[('LUMAXTECH','2025-09-24'),('GRSE','2025-10-01'),('DEEDEV','2026-02-24'),('AYE','2026-05-04'),('MTARTECH','2026-06-01'),('MTARTECH','2026-06-16'),('STLTECH','2026-06-23'),('ALLCARGO','2026-08-25'),('MOREPENLAB','2026-10-09')]
cols=['q1','q3','q5','q10','qz3','qpk','lowwick','upwick','clv','body','rangerel','volrel','gap','dist20','lowvs20','dist21','dd20','ret3','above50','f5','f10','f20','mae10']
# cross-sectional percentile helpers over liquid book>=20cr stock-days
u=df[(df.cr>=20)]
def pct(col,val):
    s=u[col].dropna(); return float((s<val).mean()*100) if pd.notna(val) else np.nan
pd.set_option('display.width',250,'display.max_columns',50)
rows=[]
for s,d in ev:
    g=df[df.sym==s].reset_index(drop=True)
    if g.empty: print('missing',s); continue
    i=g.index[g.date<=d].max()
    # window ±2 sessions: pick the day with the lowest q3 (strongest MTF drop) and also report call day
    w=g.iloc[max(0,i-2):i+1]
    for lab,r in (('call',g.iloc[i]),('minQ3',w.loc[w.q3.idxmin()] if w.q3.notna().any() else g.iloc[i])):
        rows.append(dict(sym=s,call=d,lab=lab,date=r.date,book=r.cr,**{c:(round(float(r[c]),3) if pd.notna(r[c]) and c!='above50' else r[c]) for c in cols}))
t=pd.DataFrame(rows); print(t.to_string(index=False))
print('\nPERCENTILES of call-day values vs all liquid stock-days (low q3/qz3 = bigger MTF drop):')
for s,d in ev:
    g=df[df.sym==s].reset_index(drop=True); r=g.iloc[g.index[g.date<=d].max()]
    print(s,d,{c:round(pct(c,r[c])) for c in ['q3','qz3','qpk','lowwick','volrel','rangerel','dist20','dd20'] if pd.notna(r[c])})
