import json,sys,numpy as np
sys.path.insert(0,'/home/user/work/scripts')
from detect import flatten
from PIL import Image
_fc={}
def fl(i):
    if i not in _fc:
        if len(_fc)>200: _fc.clear()
        _fc[i]=flatten(Image.open(f'frames/{i:05d}.jpg').convert('L'))
    return _fc[i]
def shift_est(a,b):
    A=np.fft.fft2(a-a.mean()); B=np.fft.fft2(b-b.mean())
    R=A*np.conj(B); R/=np.abs(R)+1e-6
    r=np.real(np.fft.ifft2(R)); y,x=np.unravel_index(r.argmax(),r.shape)
    if y>a.shape[0]//2: y-=a.shape[0]
    if x>a.shape[1]//2: x-=a.shape[1]
    return y,x,r.max()
def stacked(obs_list, ref, K=9, pad=6):
    """obs: dicts with i,w,y0,y1 ; returns averaged flattened row band aligned to ref"""
    H=ref['y1']-ref['y0']; W=480
    base=fl(ref['i'])[ref['y0']:ref['y1']]
    ry=(ref['w'][0]+ref['w'][1])/2; rx=ref['w'][2]
    rh=ref['w'][1]-ref['w'][0]
    acc=[base]
    cands=sorted(obs_list,key=lambda o:-o.get('sh',0))
    for o in cands:
        if o['i']==ref['i']: continue
        h=o['w'][1]-o['w'][0]
        if abs(h-rh)>1: continue   # similar scale
        dy=int(round((o['w'][0]+o['w'][1])/2-ry)); dx=o['w'][2]-rx
        F=fl(o['i'])
        y0=ref['y0']+dy
        if y0<0 or y0+H>F.shape[0]: continue
        x0=max(dx,0); 
        img=np.ones((H,W),np.float32)
        src=F[y0:y0+H]
        if dx>=0: img[:,:W-dx]=src[:,dx:]
        else: img[:,-dx:]=src[:,:W+dx]
        sy,sx,pk=shift_est(base,img)
        if abs(sy)>4 or abs(sx)>4: continue
        img=np.roll(np.roll(img,sy,0),sx,1)
        acc.append(img)
        if len(acc)>=K: break
    return np.median(np.stack(acc),0), len(acc)
