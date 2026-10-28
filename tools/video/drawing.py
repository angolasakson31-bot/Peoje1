import json,sys,numpy as np
sys.path.insert(0,'/home/user/work/scripts')
from detect import flatten, components
from PIL import Image, ImageFilter
def desc_start(f, y0, y1, W):
    """leftmost x of description text line in row band"""
    m=f[y0:y1]<0.78
    dil=m.copy()
    for k in range(1,5): dil[:,k:]|=m[:,:-k]
    boxes=[b for b in components(dil) if 6<=b[1]-b[0]<=18 and b[3]-b[2]>=20 and b[2]>W*0.45]
    if not boxes: return None
    # group boxes on similar baseline; take the line with most total width
    boxes.sort(key=lambda b:b[2])
    return min(b[2] for b in boxes)
def extract(frame_path, o, bottom):
    im=Image.open(frame_path).convert('L'); W=im.width
    f=flatten(im)
    y0,y1=o['y0'],o['y1']; w=o['w']
    xd=desc_start(f,y0,y1,W)
    xa=w[3]+12; xb=(xd-6) if xd else int(W*0.68)
    reg=f[y0:y1, xa:xb]
    m=reg<0.86
    # remove specks
    keep=np.zeros_like(m)
    for b in components(m):
        by0,by1,bx0,bx1,npx=b
        if npx>=12 and max(by1-by0,bx1-bx0)>=6:
            keep[by0:by1,bx0:bx1]|=m[by0:by1,bx0:bx1]
    ys=np.flatnonzero(keep.any(1)); xs=np.flatnonzero(keep.any(0))
    if len(ys)<5 or len(xs)<5: return None, (xa,xb,xd)
    g=np.asarray(im).astype(np.float32)[y0:y1, xa:xb]
    box=(ys[0],ys[-1]+1,xs[0],xs[-1]+1)
    return dict(mask=keep[box[0]:box[1],box[2]:box[3]], gray=g[box[0]:box[1],box[2]:box[3]], box=(box[0]+y0,box[1]+y0,box[2]+xa,box[3]+xa)), (xa,xb,xd)
