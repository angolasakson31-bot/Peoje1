import json,sys,numpy as np
sys.path.insert(0,'/home/user/work/scripts')
from detect import flatten, components
from PIL import Image
info=json.load(open('out/info.json')); meta=json.load(open('rows.json'))
res={}
for n,v in info.items():
    o=meta[n]; f=flatten(Image.open(f"frames/{o['i']:05d}.jpg").convert('L'))[o['y0']:o['y1']]
    H,W=f.shape
    xa=o['w'][3]+12; xb=(v['descX']-6) if v['descX'] else int(W*0.68)
    R=f[:,xa:xb]
    if R.size==0: res[n]='empty'; continue
    if (R<0.5).mean()>0.2: res[n]='blackbox'; continue
    st=R<0.62
    dil=st.copy()
    for k in range(1,6): dil[:,k:]|=st[:,:-k]
    lines=[c for c in components(dil) if 7<=c[1]-c[0]<=22 and c[3]-c[2]>=25]
    weak=R<0.85
    for c in lines: weak[max(c[0]-3,0):c[1]+3, max(c[2]-3,0):c[3]+3]=False
    big=[c for c in components(weak) if max(c[1]-c[0],c[3]-c[2])>=25 and c[4]>=40]
    if lines and not big: res[n]='text'
    elif not big: res[n]='nodraw'
    else: res[n]='draw'
json.dump(res,open('out/kind.json','w'))
from collections import Counter; print(Counter(res.values()))
for n in ['0001','4310','4514','7539','8656','8802','8899','8960','5402','7368','8727','9033','6375','8984','9119','9654','8846','679','1521','3349','8670','9095']:
    print(n,res.get(n))
