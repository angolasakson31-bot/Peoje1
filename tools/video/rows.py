import json, numpy as np, os
from collections import defaultdict
from PIL import Image
p1={x['i']:x for x in json.load(open('pass1.json'))}
tracks=json.load(open('tracks.json')); reads=json.load(open('reads.json'))
def pitch(fr):
    ys=sorted((w[0]+w[1])/2 for w in fr['words'])
    d=np.diff(ys); d=d[d>40]
    return float(np.median(d)) if len(d) else None
_p={i:pitch(fr) for i,fr in p1.items()}
spitch={}
for i in p1:
    v=[_p[j] for j in range(i-30,i+31) if _p.get(j)]
    spitch[i]=float(np.median(v)) if v else 100.0
bynum=defaultdict(list)
allobs=json.load(open('allobs.json'))
ov=json.load(open('overrides.json')); trk={x['tid']:x for x in json.load(open('reads_raw.json'))}
from collections import Counter
fixed=[]
for tid,i,w,r,c,tr in allobs:
    if str(tid) in ov and r==trk[tid]['num']:
        r=ov[str(tid)]
    fixed.append((tid,i,w,r,c,tr))
ACC=set(json.load(open('accept_low.json')))
cnt=Counter(r for tid,i,w,r,c,tr in fixed if tr and r)
for tid,i,w,r,c,tr in fixed:
    if tr and r and (cnt[r]>=8 or r in ACC):
        x=dict(tid=tid,num=r)
        fr=p1[i]; p=spitch[i]
        yc=(w[0]+w[1])/2; y0=int(yc-p/2); y1=int(yc+p/2)
        if y0<-0.1*p or y1>fr['bottom']+0.35*p or w[2]<=3: continue
        y0=max(y0,0); y1=min(y1,fr['bottom'])
        bynum[x['num']].append(dict(tid=x['tid'],i=i,w=w,y0=y0,y1=y1,comp=(y1-y0)/p))
os.makedirs('rows',exist_ok=True)
meta={}
for n,obs in bynum.items():
    best=None
    for o in obs:
        g=np.asarray(Image.open(f"frames/{o['i']:05d}.jpg")).astype(np.float32)[o['y0']:o['y1']]
        lo,hi=np.percentile(g,2),np.percentile(g,98)
        gn=(g-lo)/max(hi-lo,1)
        sh=float(np.abs(np.diff(gn,axis=1)).mean()+np.abs(np.diff(gn,axis=0)).mean())
        sc=sh*min(1,o['comp'])**3
        if best is None or sc>best[0]: best=(sc,o)
    sh,o=best
    Image.open(f"frames/{o['i']:05d}.jpg").crop((0,o['y0'],480,o['y1'])).save(f'rows/{n}.png')
    meta[n]=dict(o,sharp=sh,nobs=len(obs),tids=sorted({q['tid'] for q in obs}))
json.dump(meta,open('rows.json','w'))
print('numbers with full row',len(meta),'of',sum(1 for k,v in cnt.items() if v>=8 or k in ACC))
