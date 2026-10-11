import json,urllib.request,concurrent.futures as cf,os,sys
idx=json.load(open('index.json'))['stocks']
def get(t):
    p=f'stocks/{t}.json'
    if os.path.exists(p) and os.path.getsize(p)>1000: return t,True
    for _ in range(3):
        try:
            b=urllib.request.urlopen(urllib.request.Request(f'https://indiamtf.com/history/stock/{t}.json',headers={'User-Agent':'research-backtest'}),timeout=40).read()
            open(p,'wb').write(b); return t,True
        except Exception as e: err=e
    return t,False
with cf.ThreadPoolExecutor(8) as ex: r=list(ex.map(get,idx))
print(sum(ok for _,ok in r),len(r),[t for t,ok in r if not ok][:10])
