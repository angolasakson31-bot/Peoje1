import numpy as np
from PIL import Image, ImageFilter

def runs(b, gap=0):
    idx=np.flatnonzero(b)
    if len(idx)==0: return []
    out=[]; s=idx[0]; p=idx[0]
    for i in idx[1:]:
        if i-p>gap+1: out.append((s,p+1)); s=i
        p=i
    out.append((s,p+1)); return out

def flatten(gimg):
    bg=np.asarray(gimg.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.BoxBlur(10))).astype(np.float32)
    return np.asarray(gimg).astype(np.float32)/np.maximum(bg,1)

def taskbar(g):
    rm=g.mean(1); d=rm<90
    for y in range(150,len(d)-15):
        if d[y:y+15].all(): return y
    return len(d)

def components(mask):
    """run-based connected components; returns list of bboxes (y0,y1,x0,x1,npix)"""
    parent={}
    def find(a):
        while parent[a]!=a:
            parent[a]=parent[parent[a]]; a=parent[a]
        return a
    prev=[]; allruns=[]
    for y in range(mask.shape[0]):
        row=mask[y]
        if not row.any(): prev=[]; continue
        d=np.diff(np.concatenate(([0],row.view(np.int8),[0])))
        st=np.flatnonzero(d==1); en=np.flatnonzero(d==-1)
        cur=[]
        for s,e in zip(st,en):
            k=len(allruns); allruns.append((y,s,e)); parent[k]=k
            for (pk,ps,pe) in prev:
                if ps<e+1 and s<pe+1:
                    ra,rb=find(k),find(pk)
                    if ra!=rb: parent[ra]=rb
            cur.append((k,s,e))
        prev=cur
    boxes={}
    for k,(y,s,e) in enumerate(allruns):
        r=find(k); b=boxes.get(r)
        if b is None: boxes[r]=[y,y+1,s,e,e-s]
        else:
            b[0]=min(b[0],y); b[1]=max(b[1],y+1); b[2]=min(b[2],s); b[3]=max(b[3],e); b[4]+=e-s
    return list(boxes.values())

def words_in(mask, x0off=0, minh=6, maxh=18):
    dil=mask.copy()
    for k in range(1,4):
        dil[:,k:]|=mask[:,:-k]
    out=[]
    for y0,y1,x0,x1,n in components(dil):
        if minh<=y1-y0<=maxh:
            out.append((y0,y1,x0+x0off,x1+x0off-3))
    return out

def number_column(f, bottom):
    W=f.shape[1]
    m=f[:bottom,:int(W*0.5)]<0.7
    ws=[w for w in words_in(m) if 16<=w[3]-w[2]<=45]
    if not ws: return None
    cs=np.array([(w[2]+w[3])/2 for w in ws]); wd=np.array([w[3]-w[2] for w in ws])
    for c in sorted(cs):
        sel=np.abs(cs-c)<8
        if sel.sum()>=2 and wd[sel].mean()<=38:
            return cs[sel].mean()
    return None

def detect(gimg, colx=None):
    g=np.asarray(gimg).astype(np.float32)
    H,W=g.shape
    f=flatten(gimg)
    tb=taskbar(g); bottom=max(tb-50,50)
    cx=number_column(f,bottom)
    if cx is None: cx=colx
    if cx is None: return dict(words=[],bottom=bottom,cx=None,f=f)
    a=max(int(cx-30),0); b=int(cx+30)
    m=f[:bottom,a:b]<0.8
    nums=[]
    for (y0,y1,x0,x1) in words_in(m,a):
        if 14<=x1-x0<=40 and abs((x0+x1)/2-cx)<12:
            nums.append((y0,y1,x0,x1))
    return dict(words=nums,bottom=bottom,cx=cx,f=f)
