"""Atölye panolarının fotoğraflarından profil çizimlerini kesip çıkarır.

Her çizim için kutu (fotoğrafın 2000 px genişliğe küçültülmüş halinde) elle verildi;
kutu içinde mavi çerçeve ve kırmızı numara yazısı atılır, çizim sınırına oturtulur.
Çıktı: <out>/pic/<ad>.jpg (renkli çizim), <out>/mask/<ad>.png (çizgi maskesi), <out>/items.json
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from imgutil import components  # noqa: E402

U, OUT = sys.argv[1], sys.argv[2]
S1, S2, S3 = '736d7c30-image.jpg', '09062b71-image.jpg', '0aff41c0-image.jpg'
# (pano, numara, seri, x0, y0, x1, y1)
ITEMS = [
    (S1, '4630', 'Folyolanacak SP1', 385, 370, 560, 615), (S1, '4629', 'Folyolanacak SP1', 630, 370, 830, 610),
    (S1, '8605', 'Folyolanacak SP1', 905, 365, 1035, 650), (S1, '6118', 'Folyolanacak SP1', 1158, 350, 1252, 660),
    (S1, '6115', 'Folyolanacak SP1', 1368, 345, 1442, 650), (S1, '8621', 'Folyolanacak SP1', 1568, 335, 1688, 645),
    (S1, '8620', 'Folyolanacak SP1', 398, 718, 552, 967), (S1, '1723', 'Folyolanacak SP1', 648, 723, 837, 967),
    (S1, '8617', 'Folyolanacak SP1', 978, 733, 1137, 997), (S1, '6119', 'Folyolanacak SP1', 1248, 733, 1397, 1002),
    (S1, '6117', 'Folyolanacak SP1', 1523, 733, 1692, 1007), (S1, '8701', 'Folyolanacak SP1', 418, 1055, 592, 1202),
    (S1, '8700', 'Folyolanacak SP1', 678, 1058, 902, 1202), (S1, '8618', 'Folyolanacak SP1', 998, 1083, 1302, 1177),
    (S1, '8606', 'Folyolanacak SP1', 1413, 1098, 1727, 1172),
    (S2, '19106-38028', 'GSW-17', 148, 266, 404, 416), (S2, '19107-38029', 'GSW-17', 418, 272, 680, 416),
    (S2, '19108-38030', 'GSW-17', 696, 272, 974, 418), (S2, '19109-38031', 'GSW-17', 150, 452, 478, 593),
    (S2, '19110-38032', 'GSW-17', 505, 455, 878, 594), (S2, '19111', 'GSW-17', 156, 618, 285, 733),
    (S2, '19112', 'GSW-17', 302, 620, 516, 733), (S2, '19113', 'GSW-17', 537, 620, 662, 733),
    (S2, '19114', 'GSW-17', 676, 620, 802, 733), (S2, '19115', 'GSW-17', 817, 622, 964, 733),
    (S2, '19095-38018', 'GSW-17', 179, 759, 351, 862), (S2, '19096-38019', 'GSW-17', 382, 759, 605, 862),
    (S2, '19097-38020', 'GSW-17', 641, 759, 883, 860), (S2, '19098-38021', 'GSW-17', 185, 888, 478, 990),
    (S2, '19099-38022', 'GSW-17', 504, 886, 919, 990), (S2, '18784', 'GSW-17', 196, 1014, 337, 1125),
    (S2, '19118', 'GSW-17', 367, 1010, 563, 1121), (S2, '19101-38023', 'GSW-17', 200, 1152, 440, 1265),
    (S2, '19102-38024', 'GSW-17', 462, 1149, 697, 1262), (S2, '19103-38025', 'GSW-17', 721, 1141, 952, 1252),
    (S2, '19104-38026', 'GSW-17', 194, 1300, 460, 1402), (S2, '19105-38027', 'GSW-17', 492, 1287, 827, 1395),
    (S2, '18962', 'GSS-17', 1024, 304, 1174, 497), (S2, '18963', 'GSS-17', 1192, 306, 1379, 499),
    (S2, '18966', 'GSS-17', 1567, 316, 1677, 502), (S2, '18967', 'GSS-17', 1693, 319, 1793, 502),
    (S2, '18968', 'GSS-17', 1034, 547, 1139, 752), (S2, '18981', 'GSS-17', 1162, 551, 1369, 749),
    (S2, '18982', 'GSS-17', 1387, 551, 1589, 749), (S2, '19116', 'GSS-17', 1609, 557, 1753, 737),
    (S2, '19608', 'GSS-17', 1023, 792, 1170, 984), (S2, '19610', 'GSS-17', 1194, 789, 1352, 979),
    (S2, '18976', 'GSS-17', 1372, 792, 1517, 969), (S2, '18977', 'GSS-17', 1537, 789, 1709, 967),
    (S3, '4520', 'VG-15', 164, 185, 444, 315), (S3, '13689', 'VG-15', 470, 154, 702, 312),
    (S3, '13688', 'VG-15', 719, 152, 895, 309), (S3, '13687', 'VG-15', 917, 154, 1037, 309),
    (S3, '13690', 'VG-15', 164, 349, 255, 509), (S3, '13693', 'VG-15', 276, 344, 432, 507),
    (S3, '13694', 'VG-15', 454, 340, 680, 505), (S3, '13695', 'VG-15', 701, 336, 1015, 502),
    (S3, '14919', 'VG-15', 166, 534, 518, 690), (S3, '14921', 'VG-15', 549, 531, 909, 690),
    (S3, '13691', 'VG-15', 172, 731, 299, 877), (S3, '13692', 'VG-15', 332, 731, 459, 875),
    (S3, '14812', 'VG-15', 174, 921, 297, 1242), (S3, '14813', 'VG-15', 337, 916, 460, 1237),
    (S3, '38005-18827', 'VG-17', 1082, 164, 1301, 317), (S3, '38006', 'VG-17', 1320, 162, 1573, 317),
    (S3, '38007-18837', 'VG-17', 1594, 167, 1909, 319), (S3, '38008-18838', 'VG-17', 1094, 344, 1437, 474),
    (S3, '38009-18830', 'VG-17', 1474, 344, 1869, 472),
    (S3, '14920', 'VG-17', 1100, 742, 1458, 896),
    (S3, '18842', 'VG-17', 1479, 704, 1889, 887), (S3, '18782', 'VG-17', 1106, 939, 1325, 1167),
    (S3, '18783', 'VG-17', 1352, 932, 1472, 1159), (S3, '12550', 'VG-17', 1706, 921, 1810, 1222),
    (S3, '12551', 'VG-17', 1826, 917, 1959, 1082), (S3, '18778', 'VG-17', 1114, 1217, 1334, 1359),
]
# soluk renkli (açık sarı/yeşil/pembe) çizimler için daha hassas eşik
PALE = {'4630', '4629', '19109-38031', '19110-38032', '19112', '12551', '13695', '19111', '19114', '19115', '19095-38018'}
# parlama lekesi olanlarda küçük parçaları daha sıkı ele
GLARE = {'13690', '13688', '13687', '4520', '14920', '13695', '38005-18827', '38006', '38008-18838', '19099-38022'}
# siyah ikinci numara yazıları ve parlama lekeleri: silinecek bölgeler (pano koordinatı)
ERASE = {
    '38005-18827': [(1100, 238, 1180, 266)],
    '38007-18837': [(1600, 226, 1695, 260)],
    '38006': [(1330, 236, 1410, 266), (1350, 200, 1440, 238)],
    '38008-18838': [(1100, 402, 1180, 428), (1240, 344, 1340, 385)],
    '38009-18830': [(1492, 392, 1550, 415)],
}
# parlama yüzünden çizgisi okunamayanlar: resmi gösterilir ama tanımada kullanılmaz
NOMATCH = {'13690', '13695', '12551', '38006', '13687'}
K = 4096 / 2000
M = 3   # çerçeve çizgisi girmesin diye kutuyu her yandan biraz daralt
os.makedirs(f'{OUT}/pic', exist_ok=True); os.makedirs(f'{OUT}/mask', exist_ok=True)
cache = {}
out = []
for sheet, n, series, x0, y0, x1, y1 in ITEMS:
    if sheet not in cache:
        cache[sheet] = Image.open(os.path.join(U, sheet)).convert('RGB')
    im = cache[sheet].crop((int((x0 + M) * K), int((y0 + M) * K), int((x1 - M) * K), int((y1 - M) * K)))
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gray = Image.fromarray(np.asarray(im.convert('L')))
    bg = np.asarray(gray.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.BoxBlur(12))).astype(np.float32)
    dark = np.asarray(gray).astype(np.float32) / np.maximum(bg, 1)
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    ink = (dark < 0.86) | (sat > 0.16) if n in PALE else (dark < 0.8) | (sat > 0.28)
    blue = (b > r + 35) & (b > g + 10)            # pano çerçeveleri
    # kırmızı numara yazıları: çekirdeği bul, kenar piksellerini de kapsasın diye genişlet
    red = (r > g + 35) & (r > b + 35)
    red = np.asarray(Image.fromarray((red * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    ink &= ~blue & ~red
    for ex0, ey0, ex1, ey1 in ERASE.get(n, []):
        ox, oy = (x0 + M) * K, (y0 + M) * K
        ink[max(0, int(ey0 * K - oy)):max(0, int(ey1 * K - oy)), max(0, int(ex0 * K - ox)):max(0, int(ex1 * K - ox))] = False
    # parlama/leke gibi küçük parçaları at, çizimi tut
    cs = components(ink)
    big = max(c[4] for c in cs)
    keep = np.zeros_like(ink)
    # parlama: çok parlak bölgenin içindeki/yanındaki lekeler çizim değildir
    glare = np.asarray(gray.point(lambda v: 255 if v > 238 else 0).filter(ImageFilter.MaxFilter(21))) > 0
    for c in cs:
        if c[4] < max(30, (0.12 if n in GLARE else 0.04) * big):
            continue
        part = ink[c[0]:c[1], c[2]:c[3]]
        if n in GLARE and c[4] < 0.5 * big and (glare[c[0]:c[1], c[2]:c[3]] & part).sum() > 0.5 * part.sum():
            continue
        keep[c[0]:c[1], c[2]:c[3]] |= part
    ys, xs = np.flatnonzero(keep.any(1)), np.flatnonzero(keep.any(0))
    ty0, ty1, tx0, tx1 = ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
    pad = 8
    # gösterilecek resimde numara yazılarını (kırmızı ve silinen siyah yazılar) zemin rengine boya: ezberde cevabı ele vermesin
    hide = red.copy()
    for ex0, ey0, ex1, ey1 in ERASE.get(n, []):
        ox, oy = (x0 + M) * K, (y0 + M) * K
        hide[max(0, int(ey0 * K - oy)):max(0, int(ey1 * K - oy)), max(0, int(ex0 * K - ox)):max(0, int(ex1 * K - ox))] = True
    paper = np.asarray(im.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.BoxBlur(10)))
    im = Image.fromarray(np.where(hide[..., None], paper, np.asarray(im)).astype(np.uint8))
    pic = im.crop((max(tx0 - pad, 0), max(ty0 - pad, 0), min(tx1 + pad, im.width), min(ty1 + pad, im.height)))
    pic.thumbnail((360, 360))
    pic.save(f'{OUT}/pic/{n}.jpg', quality=85)
    m = keep[ty0:ty1, tx0:tx1]
    # katalog çizimleriyle aynı ölçek: uzun kenar ~180 px
    s = 180 / max(m.shape)
    mi = Image.fromarray((m * 255).astype(np.uint8)).resize((max(1, round(m.shape[1] * s)), max(1, round(m.shape[0] * s))), Image.BILINEAR)
    Image.fromarray(np.where(np.asarray(mi) > 90, 0, 255).astype(np.uint8)).save(f'{OUT}/mask/{n}.png')
    out.append(dict(n=n, series=series, match=n not in NOMATCH))
json.dump(out, open(f'{OUT}/items.json', 'w'), ensure_ascii=False, indent=0)
print(len(out), 'çizim')
