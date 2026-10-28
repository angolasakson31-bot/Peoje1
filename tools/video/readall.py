import json,sys,numpy as np
from collections import defaultdict
sys.path.insert(0,'/home/user/work/scripts')
from ocr import *
TRUST=len(sys.argv)>1
T=np.load('templates.npy'); o=OCR(T,np.load('tlabels.npy'))
tracks=json.load(open('tracks.json'))
p1={x['i']:x for x in json.load(open('pass1.json'))}
_hs={i:[w[1]-w[0] for w in x['words']] for i,x in p1.items()}
medh={}
for i in p1:
    hs=[h for j in range(max(0,i-30),i+31) for h in _hs.get(j,[])]
    medh[i]=float(np.median(hs)) if hs else 99
out=[]; allobs=[]
for tid,t in enumerate(tracks):
    votes=defaultdict(float); cnt=defaultdict(int); obs=[]
    for i,w in t:
        if w[1]-w[0]>1.2*medh[i]: continue
        n=prep(f'frames/{i:05d}.jpg',w)
        if n is None: continue
        if n.shape[0]>1.2*4*medh[i]: continue
        import ocr as O
        con=O.LAST_CONTRAST
        r,c=o.read(n)
        if r is None or c<0.7: continue
        trusted = con>=45 and c>=0.8
        allobs.append((tid,i,w,r,round(c,3),bool(trusted)))
        if TRUST and not trusted: continue
        votes[r]+=c; cnt[r]+=1; obs.append((i,r,round(c,3),w))
    if votes:
        top=max(votes,key=votes.get); tot=sum(votes.values())
        out.append(dict(tid=tid,num=top,share=votes[top]/tot,n=cnt[top],nobs=len(t),maxc=max(c for _,r,c,_ in obs if r==top),bi=max((o for o in obs if o[1]==top),key=lambda o:o[2])[0],bw=max((o for o in obs if o[1]==top),key=lambda o:o[2])[3]))
    else:
        out.append(dict(tid=tid,num=None,share=0,n=0,nobs=len(t),maxc=0))
json.dump(out,open('reads.json','w')); json.dump(allobs,open('allobs.json','w'))
ok=[x for x in out if x['num']]
print('tracks',len(out),'read',len(ok),'unique nums',len({x['num'] for x in ok}))
