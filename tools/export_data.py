"""Videodan çıkarılan profilleri uygulamanın data/ klasörüne aktarır.

Girdi (iş klasörü): out/info.json, out/rows/<n>.jpg, out/draw/<n>.png
Çıktı: data/profiles.json, data/row/<n>.jpg, data/pic/<n>.jpg
"""
import base64, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from imgutil import clean  # noqa: E402

work, dest = sys.argv[1], sys.argv[2]
info = json.load(open(os.path.join(work, 'out/info.json')))
# satır türü: draw / text / nodraw (videoda resmi olmayan satırlar elle ve otomatik işaretlendi)
kind = json.load(open(os.path.join(work, 'out/kind.json')))
for n, v in info.items():
    v['hasDrawing'] = v['hasDrawing'] and kind.get(n) == 'draw'
os.makedirs(os.path.join(dest, 'row'), exist_ok=True)
os.makedirs(os.path.join(dest, 'pic'), exist_ok=True)
rng = np.random.default_rng(0)
MAXPTS = 220


def encode_mask(m):
    """Çizgi maskesinden en fazla MAXPTS nokta: konum (0-255) ve kenar yön dilimi (0-7)."""
    h, w = m.shape
    # her noktanın kenar yönü (çizginin normali, 0-180° arası 8 dilim)
    blur = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32)
    gy, gx = np.gradient(blur)
    ys, xs = np.nonzero(m)
    if len(xs) > MAXPTS:
        sel = rng.choice(len(xs), MAXPTS, replace=False)
        xs, ys = xs[sel], ys[sel]
    ang = np.degrees(np.arctan2(gy[ys, xs], gx[ys, xs])) % 180
    ob = (np.floor(ang / 22.5).astype(int) % 8).astype(np.uint8)
    u = np.clip(np.round((xs + 0.5) / w * 255), 0, 255).astype(np.uint8)
    vv = np.clip(np.round((ys + 0.5) / h * 255), 0, 255).astype(np.uint8)
    pts = np.stack([u, vv, ob], 1).ravel().tobytes()
    return dict(a=round(w / h, 4), p=base64.b64encode(pts).decode())


profiles = []
for n in sorted(info, key=lambda s: (int(s), s)):
    v = info[n]
    row = Image.open(os.path.join(work, f'out/rows/{n}.jpg')).convert('L')
    row.save(os.path.join(dest, f'row/{n}.jpg'), quality=80)
    entry = dict(n=n, h=1 if v['hasDrawing'] else 0)
    if v.get('lowconf'):
        entry['lc'] = 1
    if v['box']:
        y0, y1, x0, x1 = v['box']
        pad = 6
        pic = row.crop((max(x0 - pad, 0), max(y0 - pad, 0), min(x1 + pad, row.width), min(y1 + pad, row.height)))
        pic.save(os.path.join(dest, f'pic/{n}.jpg'), quality=82)
    mpath = os.path.join(work, f'out/draw/{n}.png')
    if v['hasDrawing'] and (not v['box'] or not os.path.exists(mpath)):
        # maske yoksa çizim sütununu satır resminden eşikle
        g = np.asarray(row).astype(np.float32)
        xa = v['numBox'][3] + 12
        xb = (v['descX'] - 6) if v['descX'] else int(row.width * 0.68)
        reg = g[:, xa:xb]
        m = reg < np.median(reg) * 0.75
        ys, xs = np.nonzero(m)
        if len(xs) >= 20:
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            Image.fromarray(np.where(m[y0:y1, x0:x1], 0, 255).astype(np.uint8)).save(mpath)
            v['box'] = [int(y0), int(y1), int(x0 + xa), int(x1 + xa)]
            pic = row.crop((max(int(x0 + xa) - 6, 0), max(int(y0) - 6, 0), min(int(x1 + xa) + 6, row.width), min(int(y1) + 6, row.height)))
            pic.save(os.path.join(dest, f'pic/{n}.jpg'), quality=82)
        else:
            v['hasDrawing'] = False
            entry['h'] = 0
    if v['hasDrawing']:
        raw = np.asarray(Image.open(mpath)) < 128
        m = clean(raw)
        # netlik puanı: lekelerden arınmış çizimin ham maskeye oranı (düşükse resim bulanık)
        entry['q'] = round(float(m.sum()) / max(int(raw.sum()), 1), 2)
        entry.update(encode_mask(m))
    profiles.append(entry)
# Atölye panolarından alınan net çizimler (tools/sheets.py çıktısı); videodakinden iyi olduğu için onun yerine geçer
board = os.path.join(work, 'sheets')
if len(sys.argv) > 3:
    board = sys.argv[3]
if os.path.exists(os.path.join(board, 'items.json')):
    import shutil
    os.makedirs(os.path.join(dest, 'board'), exist_ok=True)
    byn = {p['n']: p for p in profiles}
    added = 0
    for it in json.load(open(os.path.join(board, 'items.json'))):
        n = it['n']
        shutil.copy(os.path.join(board, f'pic/{n}.jpg'), os.path.join(dest, f'board/{n}.jpg'))
        e = byn.get(n)
        if e is None:
            e = dict(n=n, h=1, r=0)
            profiles.append(e); byn[n] = e; added += 1
        e.update(h=1, b=1, s=it['series'])
        if it['match']:
            m = clean(np.asarray(Image.open(os.path.join(board, f'mask/{n}.png'))) < 128)
            e.update(encode_mask(m)); e['q'] = 1
    print('panodan', added, 'yeni profil')

json.dump(dict(profiles=profiles), open(os.path.join(dest, 'profiles.json'), 'w'), separators=(',', ':'))
print(len(profiles), 'profil,', sum(p['h'] for p in profiles), 'çizimli')
