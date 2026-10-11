import json,glob,math,statistics as st,sys,collections
from datetime import date
rows=[]  # per stock-day features
H=(5,10,20)
for f in glob.glob('stocks/*.json'):
    d=json.load(open(f)); pr=d.get('price') or []
    if len(pr)<120: continue
    px={a:b for a,b in pr}; dates=[a for a,_ in pr]; cl=[b for _,b in pr]
    ser={s['d']:s for s in d['series']}
    # EMA20, SMA50
    ema=[];e=None
    for c in cl: e=c if e is None else e+(c-e)*2/21; ema.append(e)
    for i,dt in enumerate(dates):
        if i<50 or i+max(H)>=len(dates): continue
        s=ser.get(dt)
        if not s:continue
        # qty 3 trading-day-ago from series using price dates
        p3=ser.get(dates[i-3]); p10=ser.get(dates[i-10])
        if not p3 or not p10 or not p3['q'] or not p10['q']: continue
        sma50=sum(cl[i-49:i+1])/50
        rec=dict(t=d['ticker'],d=dt,cr=s['cr'],q3=s['q']/p3['q']-1,q10=s['q']/p10['q']-1,
                 dist=cl[i]/ema[i]-1,above50=cl[i]>sma50,ret3=cl[i]/cl[i-3]-1,
                 pctbook=s['pct'])
        # entry at close t+1 (data public next morning)
        for h in H: rec[f'f{h}']=cl[i+1+h]/cl[i+1]-1 if i+1+h<len(cl) else None
        rows.append(rec)
print(len(rows),'stock-days', len({r['t'] for r in rows}),'stocks', min(r['d'] for r in rows),max(r['d'] for r in rows))
# eligible universe
el=[r for r in rows if r['cr']>=20 and r['f20'] is not None]
bydate=collections.defaultdict(list)
for r in el: bydate[r['d']].append(r)
mkt={d:{h:st.mean(x[f'f{h}'] for x in v) for h in H} for d,v in bydate.items() if len(v)>=30}
def rep(name,sel):
    ev=[];last={}
    for r in sorted(sel,key=lambda r:r['d']):
        if r['d'] not in mkt: continue
        if r['t'] in last and (date.fromisoformat(r['d'])-last[r['t']]).days<14: continue
        last[r['t']]=date.fromisoformat(r['d']); ev.append(r)
    if len(ev)<10: print(name,'n',len(ev)); return
    out=[name,f'n={len(ev)}',f'dates={len({e["d"] for e in ev})}']
    for h in H:
        ex=[e[f'f{h}']-mkt[e['d']][h] for e in ev]
        out.append(f'{h}d raw {st.mean(e[f"f{h}"] for e in ev)*100:+.1f}% excess mean {st.mean(ex)*100:+.2f}% med {st.median(ex)*100:+.2f}% hit {sum(x>0 for x in ex)/len(ex)*100:.0f}%')
    print(' | '.join(out))
base=lambda r:r['cr']>=20
rep('ALL eligible (control)',[r for r in el if True])
rep('uptrend+near20EMA(|d|<5%) no flush',[r for r in el if r['above50'] and abs(r['dist'])<.05 and r['q3']>-0.03])
for X in (.05,.10,.15):
    rep(f'flush q3<=-{int(X*100)}%',[r for r in el if r['q3']<=-X])
    rep(f'flush q3<=-{int(X*100)}% & above50 & |dist20EMA|<5%',[r for r in el if r['q3']<=-X and r['above50'] and abs(r['dist'])<.05])
    rep(f'flush q3<=-{int(X*100)}% & above50 & price down>=3% in 3d',[r for r in el if r['q3']<=-X and r['above50'] and r['ret3']<=-.03])
rep('q10<=-20% & above50 & |dist|<5%',[r for r in el if r['q10']<=-.20 and r['above50'] and abs(r['dist'])<.05])
rep('REVERSE: q3>=+10% (building) & above50',[r for r in el if r['q3']>=.10 and r['above50']])
