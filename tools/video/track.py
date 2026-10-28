import json, numpy as np, os
from PIL import Image
r=json.load(open('pass1.json'))
def ghost(x):
    ys=sorted(((w[0]+w[1])/2,w[1]-w[0]) for w in x['words'])
    return any(b[0]-a[0]<1.8*max(a[1],b[1]) for a,b in zip(ys,ys[1:]))
cache={}
def frame(i):
    if i not in cache:
        if len(cache)>50: cache.clear()
        cache[i]=np.asarray(Image.open(f'frames/{i:05d}.jpg')).astype(np.float32)
    return cache[i]
def ncrop(i,w):
    y0,y1,x0,x1=w; g=frame(i)[max(y0-2,0):y1+2, max(x0-2,0):x1+2]
    return g
def sim(a,b):
    h=min(a.shape[0],b.shape[0]); w=min(a.shape[1],b.shape[1])
    if h<4 or w<8: return 0
    a=a[:h,:w]; b=b[:h,:w]
    a=a-a.mean(); b=b-b.mean()
    return float((a*b).sum()/np.sqrt((a*a).sum()*(b*b).sum()+1e-6))
tracks=[]  # list of list of (frame, word)
active={}  # word index in prev frame -> track id
prev=None
for x in r:
    i=x['i']
    if ghost(x) or not x['words']:
        continue
    ws=x['words']; yc=[(w[0]+w[1])/2 for w in ws]
    newactive={}
    if prev is not None and i-prev['i']<=5:
        pws=prev['words']; pyc=[(w[0]+w[1])/2 for w in pws]
        maxd=45*(i-prev['i'])
        best=(0,0)
        for a in pyc:
            for b in yc:
                d=b-a
                if abs(d)>min(maxd,45): continue
                sc=sum(1 for a2 in pyc if any(abs(b2-a2-d)<6 for b2 in yc))
                if (sc,-abs(d))>(best[0],-abs(best[1])): best=(sc,d)
        sc,d=best
        if sc>0:
            for k,b in enumerate(yc):
                for j,a in enumerate(pyc):
                    if abs(b-a-d)<6 and j in active:
                        if sim(ncrop(prev['i'],pws[j]),ncrop(i,ws[k]))>0.5:
                            newactive[k]=active[j]
                        break
    for k,w in enumerate(ws):
        if k not in newactive:
            tracks.append([]); newactive[k]=len(tracks)-1
        tracks[newactive[k]].append((i,w))
    active=newactive; prev=x
print('tracks',len(tracks), 'len>=3',sum(len(t)>=3 for t in tracks))
json.dump(tracks,open('tracks.json','w'))
