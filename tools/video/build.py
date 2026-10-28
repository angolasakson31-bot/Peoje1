import json,sys,os,numpy as np
sys.path.insert(0,'/home/user/work/scripts')
from stack import stacked, fl
from detect import components
from drawing import desc_start
from collections import defaultdict
from PIL import Image
meta=json.load(open('rows.json')); allobs=json.load(open('allobs.json'))
ACC=set(json.load(open('accept_low.json')))
obsby=defaultdict(list)
for tid,i,w,r,c,tr in allobs:
    if tr and r and r in meta: obsby[r].append(dict(i=i,w=w))
os.makedirs('out/rows',exist_ok=True); os.makedirs('out/draw',exist_ok=True)
info={}
for k,n in enumerate(sorted(meta,key=lambda s:s.zfill(4))):
    ref=meta[n]
    S,cnt=stacked(obsby[n],ref,K=12)
    H,W=S.shape
    # display row: contrast stretch
    lo,hi=np.percentile(S,1),np.percentile(S,97)
    disp=((S-lo)/max(hi-lo,1e-3)).clip(0,1)
    Image.fromarray((disp*255).astype(np.uint8)).save(f'out/rows/{n}.jpg',quality=85)
    # drawing region
    xd=desc_start(S,0,H,W)
    xa=ref['w'][3]+12; xb=(xd-6) if xd else int(W*0.68)
    reg=S[:,xa:xb]
    m=reg<0.9
    keep=np.zeros_like(m); comps=[]
    for b in components(m):
        y0,y1,x0,x1,npx=b
        if npx>=15 and max(y1-y0,x1-x0)>=8:
            keep[y0:y1,x0:x1]|=m[y0:y1,x0:x1]; comps.append(b)
    has=False; box=None
    if comps:
        ys=np.flatnonzero(keep.any(1)); xs=np.flatnonzero(keep.any(0))
        box=[int(ys[0]),int(ys[-1]+1),int(xs[0]+xa),int(xs[-1]+1+xa)]
        big=max(max(b[1]-b[0],b[3]-b[2]) for b in comps)
        has = big>=18   # text-only rows have only small glyphs
        mk=keep[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
        Image.fromarray(((~mk)*255).astype(np.uint8)).save(f'out/draw/{n}.png')
    info[n]=dict(frame=ref['i'],stack=cnt,hasDrawing=bool(has),box=box,descX=int(xd) if xd else None,numBox=ref['w'],h=H,lowconf=n in ACC)
    if k%100==0: print(k,flush=True)
json.dump(info,open('out/info.json','w'))
print('done',len(info),'with drawing',sum(v['hasDrawing'] for v in info.values()))
