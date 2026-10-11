import json,urllib.request,concurrent.futures as cf,os,datetime as dt
# trading dates: union of dates from a few liquid stocks' MTF series (since 2024-01-01)
s=set()
for t in ('RELIANCE','HDFCBANK','INFY'):
    s|={x['d'] for x in json.load(open(f'stocks/{t}.json'))['series'] if x['d']>='2024-01-01'}
dates=sorted(s)
F="TckrSymb,ISIN,SctySrs,OpnPric,HghPric,LwPric,ClsPric,PrvsClsgPric,TtlTradgVol"
def get(d):
    p=f'ohlc/{d}.csv'
    if os.path.exists(p) and os.path.getsize(p)>2000: return d,True
    for _ in range(3):
        try:
            u=f'https://mtf.trading/api/v1/bhavcopy?date={d}&exchange=nse&fields={F}&format=csv&limit=100000'
            b=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'research-backtest'}),timeout=60).read()
            if len(b)>2000: open(p,'wb').write(b); return d,True
        except Exception as e: pass
    return d,False
with cf.ThreadPoolExecutor(8) as ex: r=list(ex.map(get,dates))
bad=[d for d,ok in r if not ok]; print(len(dates),'days',len(bad),'failed',bad[:10])
