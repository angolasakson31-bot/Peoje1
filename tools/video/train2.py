import json,sys,numpy as np
sys.path.insert(0,'/home/user/work/scripts')
from ocr import *
best=json.load(open('best.json')); sel=[b for b in best if b['full']]
L=[dict(i=sel[int(k)]['i'],w=sel[int(k)]['w'],lab=v) for k,v in json.load(open('labels.json')).items()]+json.load(open('labels2.json'))
X=[];Y=[];items=[]
for e in L:
    n=prep(f"frames/{e['i']:05d}.jpg",e['w'])
    if n is None: continue
    v=split(n,len(e['lab'])); items.append((e,v))
    for d,vv in zip(e['lab'],v): X.append(vv);Y.append(int(d))
X=np.array(X);Y=np.array(Y)
# kNN bank with small shift augmentation
A=[];AL=[]
for v,y in zip(X,Y):
    im=v.reshape(SH,SW)
    for dy,dx in [(0,0),(1,0),(-1,0),(0,1),(0,-1)]:
        a=np.roll(np.roll(im,dy,0),dx,1).ravel(); a=a-a.mean(); a/=max(np.linalg.norm(a),1e-6)
        A.append(a); AL.append(y)
np.save('templates.npy',np.array(A)); np.save('tlabels.npy',np.array(AL))
print('labels',len(items),'digits',np.bincount(Y))
