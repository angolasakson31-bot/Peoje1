"""Ortak görüntü yardımcıları: bağlı bileşenler ve leke temizliği."""
import numpy as np


def components(mask):
    """Satır-koşu tabanlı bağlı bileşenler: [(y0, y1, x0, x1, piksel), ...]"""
    parent = {}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    prev, runs = [], []
    for y in range(mask.shape[0]):
        d = np.diff(np.concatenate(([0], mask[y].astype(np.int8), [0])))
        cur = []
        for s0, e0 in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)):
            k = len(runs)
            runs.append((y, s0, e0))
            parent[k] = k
            for pk, ps, pe in prev:
                if ps < e0 + 1 and s0 < pe + 1:
                    ra, rb = find(k), find(pk)
                    if ra != rb:
                        parent[ra] = rb
            cur.append((k, s0, e0))
        prev = cur
    boxes = {}
    for k, (y, s0, e0) in enumerate(runs):
        r = find(k)
        b = boxes.setdefault(r, [y, y + 1, s0, e0, 0])
        b[0] = min(b[0], y); b[1] = max(b[1], y + 1); b[2] = min(b[2], s0); b[3] = max(b[3], e0); b[4] += e0 - s0
    return list(boxes.values())


def clean(m):
    """Ekran çizgilenmesinden kalan küçük lekeleri at, yalnız çizimin büyük parçalarını tut."""
    cs = components(m)
    if not cs:
        return m
    big = max(c[4] for c in cs)
    keep = np.zeros_like(m)
    for y0, y1, x0, x1, npx in cs:
        if npx >= max(25, 0.15 * big):
            keep[y0:y1, x0:x1] |= m[y0:y1, x0:x1]
    ys, xs = np.flatnonzero(keep.any(1)), np.flatnonzero(keep.any(0))
    if len(ys) == 0:
        return m
    return keep[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
MAXPTS = 220
