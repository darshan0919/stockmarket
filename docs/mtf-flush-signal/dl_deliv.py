import os,glob,urllib.request,concurrent.futures as cf,datetime as dt
dates=sorted(os.path.basename(f)[:-4] for f in glob.glob('ohlc/*.csv'))
def get(d):
    p=f'deliv/{d}.csv'
    if os.path.exists(p) and os.path.getsize(p)>5000: return d,True
    y,m,dd=d.split('-'); u=f'https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{dd}{m}{y}.csv'
    for _ in range(3):
        try:
            b=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=40).read()
            if len(b)>5000: open(p,'wb').write(b); return d,True
        except Exception: pass
    return d,False
with cf.ThreadPoolExecutor(6) as ex: r=list(ex.map(get,dates))
bad=[d for d,ok in r if not ok]; print(len(dates),len(bad),bad[:12])
