import numpy as np
from PIL import Image
SW,SH=14,20
LAST_CONTRAST=0
def prep(frame_path, w):
    y0,y1,x0,x1=w
    im=Image.open(frame_path).convert('L')
    c=im.crop((x0-3,y0-3,x1+3,y1+3))
    g=np.asarray(c.resize((c.width*4,c.height*4),Image.BICUBIC)).astype(np.float32)
    lo,hi=np.percentile(g,3),np.percentile(g,92)
    if hi-lo<15: return None
    global LAST_CONTRAST; LAST_CONTRAST=hi-lo
    n=((hi-g)/(hi-lo)).clip(0,1)
    ink=n>0.5
    ys=np.flatnonzero(ink.mean(1)>0.05); xs=np.flatnonzero(ink.mean(0)>0.05)
    if len(ys)<8 or len(xs)<16: return None
    return n[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
def split(n,k):
    h,wd=n.shape; cp=n.sum(0); dw=wd/k
    cuts=[0]
    for j in range(1,k):
        c=j*dw; a=int(max(c-dw*0.3,cuts[-1]+2)); b=int(min(c+dw*0.3,wd-2))
        cuts.append(a+int(np.argmin(cp[a:b+1])) if b>a else int(c))
    cuts.append(wd)
    out=[]
    for j in range(k):
        s=n[:, cuts[j]:cuts[j+1]]
        xs=np.flatnonzero(s.max(0)>0.5)
        if len(xs): s=s[:, xs[0]:xs[-1]+1]
        # pad to aspect SW/SH keeping scale (digit height = h)
        tw=int(round(h*SW/SH)); pw=max(tw,s.shape[1])
        P=np.zeros((h,pw),np.float32); o=(pw-s.shape[1])//2; P[:,o:o+s.shape[1]]=s
        s=np.asarray(Image.fromarray((P*255).astype(np.uint8)).resize((SW,SH),Image.BILINEAR)).astype(np.float32)/255
        out.append(s.ravel())
    v=np.array(out); v=v-v.mean(1,keepdims=True)
    return v/np.maximum(np.linalg.norm(v,axis=1,keepdims=True),1e-6)
def ndigits(n):
    asp=n.shape[1]/n.shape[0]
    return 3 if 1.6<asp<2.55 else 4 if asp<3.5 else None
class OCR:
    def __init__(self,T,TL=None): self.T=T; self.TL=np.arange(10) if TL is None else TL
    def read(self,n,k=None):
        k=k or ndigits(n)
        if k is None: return None,0
        v=split(n,k); s=v@self.T.T
        d=self.TL[s.argmax(1)]; conf=float(s.max(1).min())
        return ''.join(map(str,d)),conf
