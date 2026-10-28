"""Her profil için şekilce en çok benzeyen profilleri hesaplar (ezberde karıştırılanlar).

Girdi: data/profiles.json  Çıktı: data/similar.json  {numara: [benzer numaralar...]}
Çizim noktaları 48x48 kareye oturtulur; 8 yön (döndürme+ayna) denenerek
iki yönlü ortalama uzaklık (chamfer) ile karşılaştırılır.
"""
import base64, json, sys
import numpy as np

S = 48
K = 8
prof = [p for p in json.load(open(sys.argv[1]))['profiles'] if p.get('p')]


def points(p):
    b = np.frombuffer(base64.b64decode(p['p']), np.uint8).reshape(-1, 3)
    a = p['a']
    bw, bh = (1, 1 / a) if a >= 1 else (a, 1)
    return b[:, 0] / 255 * bw, b[:, 1] / 255 * bh, bw, bh


def orient(u, v, bw, bh, o):
    rot, mir = o & 3, o >> 2
    if mir:
        u = bw - u
    if rot == 0: x, y, W, H = u, v, bw, bh
    elif rot == 1: x, y, W, H = bh - v, u, bh, bw
    elif rot == 2: x, y, W, H = bw - u, bh - v, bw, bh
    else: x, y, W, H = v, bw - u, bh, bw
    s = (S - 2) / max(W, H)
    x = x * s + (S - W * s) / 2
    y = y * s + (S - H * s) / 2
    xi = np.clip(np.round(x).astype(int), 0, S - 1)
    yi = np.clip(np.round(y).astype(int), 0, S - 1)
    return yi * S + xi


gy, gx = np.mgrid[0:S, 0:S]
grid = np.stack([gx.ravel(), gy.ravel()], 1).astype(np.float32)
N = len(prof)
NP = 220
IDX = np.zeros((N, 8, NP), np.int32)
DT = np.zeros((N, 8, S * S), np.float32)
for i, p in enumerate(prof):
    u, v, bw, bh = points(p)
    for o in range(8):
        idx = orient(u, v, bw, bh, o)
        IDX[i, o] = np.resize(idx, NP)
        pts = grid[np.unique(idx)]
        d = np.sqrt(((grid[:, None, :] - pts[None]) ** 2).sum(2)).min(1)
        DT[i, o] = np.minimum(d, 8)
best = np.full((N, N), 1e9, np.float32)
flat0 = DT[:, 0]                          # (N, S*S)
rows = np.arange(N)[:, None]
for i in range(N):
    for o in range(8):
        f = flat0[rows, IDX[i, o][None, :]].mean(1)          # i(o) -> diğerleri
        g = DT[i, o][IDX[:, 0]].mean(1)                     # diğerleri -> i(o)
        best[i] = np.minimum(best[i], f + g)
np.fill_diagonal(best, 1e9)
best = np.minimum(best, best.T)
out = {}
for i, p in enumerate(prof):
    order = np.argsort(best[i])[:8]
    out[p['n']] = [prof[j]['n'] for j in order]
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'))
print(len(out), 'profil')
