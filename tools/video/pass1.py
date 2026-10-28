import sys, subprocess, json, os, numpy as np
sys.path.insert(0,'/home/user/work/scripts')
from detect import *
W,H=480,852
FPS=10
os.makedirs('frames',exist_ok=True)
p=subprocess.Popen(['ffmpeg','-v','error','-i','video.mp4','-vf',f'fps={FPS}','-f','rawvideo','-pix_fmt','gray','-'],stdout=subprocess.PIPE)
res=[]; i=0; colx=None
while True:
    buf=p.stdout.read(W*H)
    if len(buf)<W*H: break
    im=Image.frombuffer('L',(W,H),buf)
    r=detect(im,colx)
    if r['cx'] is not None: colx=r['cx']
    f=r['f'][:r['bottom']]
    sharp=float(np.abs(np.diff(f,axis=1)).mean()+np.abs(np.diff(f,axis=0)).mean())
    res.append(dict(i=i,words=[list(map(int,w)) for w in r['words']],bottom=int(r['bottom']),cx=r['cx'],sharp=sharp))
    im.save(f'frames/{i:05d}.jpg',quality=92)
    i+=1
    if i%500==0: print(i,flush=True)
json.dump(res,open('pass1.json','w'))
print('done',i)
