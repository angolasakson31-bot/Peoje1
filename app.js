'use strict';
/* Profil Tanıma — internetsiz çalışan profil ezber ve kamera ile tanıma uygulaması */

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* depolama dolu veya kapalı */ } },
};

let PROFILES = [];          // {n, h, a, pts:{xy, ob}, lc}
let BYNUM = new Map();
let FIX = store.get('fix', {});          // yanlış okunan numara düzeltmeleri: {asıl: yeni}
let LEARN = store.get('learn', []).filter(s => s.v === 2);  // öğrenilen fotoğraflar: [{v, n, a, p}]

const shownNum = n => FIX[n] || n;
const picUrl = n => { const p = BYNUM.get(n); return p && p.custom ? p.thumb : `data/pic/${n}.jpg`; };
const rowUrl = n => { const p = BYNUM.get(n); return p && p.custom ? p.thumb : `data/row/${n}.jpg`; };

// Noktalar üçlü baytlar halinde: u, v (0-255) ve kenar yön dilimi (0-7)
function decodePts(b64) {
  const bin = atob(b64), n = bin.length / 3;
  const xy = new Float32Array(n * 2), ob = new Uint8Array(n);
  for (let j = 0; j < n; j++) {
    xy[2 * j] = bin.charCodeAt(3 * j) / 255;
    xy[2 * j + 1] = bin.charCodeAt(3 * j + 1) / 255;
    ob[j] = bin.charCodeAt(3 * j + 2);
  }
  return { xy, ob };
}
function encodePts({ xy, ob }) {
  let s = '';
  const q = v => String.fromCharCode(Math.max(0, Math.min(255, Math.round(v * 255))));
  for (let j = 0; j < ob.length; j++) s += q(xy[2 * j]) + q(xy[2 * j + 1]) + String.fromCharCode(ob[j]);
  return btoa(s);
}

async function loadData() {
  const r = await fetch('data/profiles.json');
  const j = await r.json();
  PROFILES = j.profiles.map(p => ({ ...p, pts: p.p ? decodePts(p.p) : null }));
  BYNUM = new Map(PROFILES.map(p => [p.n, p]));
  try { SIMILAR = await (await fetch('data/similar.json')).json(); } catch (e) { SIMILAR = {}; }
  mergeCustom();
  $('#status').textContent = `${PROFILES.length} profil`;
}

/* ---------------- Gezinme ---------------- */
document.querySelectorAll('nav button').forEach(b => b.onclick = () => showView(b.dataset.view));
function showView(v) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  if (v === 'list') renderList();
  if (v === 'quiz' && !$('#quizCard').innerHTML) ezHome();
  if (v === 'more') renderMore();
}

/* ---------------- Kamera ve kırpma ---------------- */
const photo = { img: null, canvas: $('#photoCanvas'), box: null, rot: 0 };

$('#camInput').onchange = e => openPhoto(e.target.files[0]);
$('#galInput').onchange = e => openPhoto(e.target.files[0]);

function openPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    photo.img = img; photo.rot = 0;
    drawPhoto();
    $('#cropWrap').hidden = false;
    trace.on = false; syncTraceCanvas();
    $('#results').innerHTML = '';
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function drawPhoto() {
  const { img, canvas } = photo;
  const MAX = 1600;
  const rw = photo.rot % 2 ? img.naturalHeight : img.naturalWidth;
  const rh = photo.rot % 2 ? img.naturalWidth : img.naturalHeight;
  const s = Math.min(1, MAX / Math.max(rw, rh));
  canvas.width = Math.round(rw * s); canvas.height = Math.round(rh * s);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(photo.rot * Math.PI / 2);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  requestAnimationFrame(() => {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const side = Math.min(W, H) * 0.6;
    setBox({ x: (W - side) / 2, y: (H - side) / 2, w: side, h: side });
  });
}
$('#rotBtn').onclick = () => { if (photo.img) { photo.rot = (photo.rot + 1) % 4; drawPhoto(); syncTraceCanvas(); } };

function setBox(b) {
  const W = photo.canvas.clientWidth, H = photo.canvas.clientHeight;
  b.w = Math.max(30, Math.min(b.w, W)); b.h = Math.max(30, Math.min(b.h, H));
  b.x = Math.max(0, Math.min(b.x, W - b.w)); b.y = Math.max(0, Math.min(b.y, H - b.h));
  photo.box = b;
  Object.assign($('#cropBox').style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
}

(function cropDrag() {
  const box = $('#cropBox');
  let drag = null;
  box.addEventListener('pointerdown', e => {
    e.preventDefault();
    const h = e.target.classList.contains('h') ? [...e.target.classList].find(c => c.length === 2) : 'move';
    drag = { h, x: e.clientX, y: e.clientY, b: { ...photo.box } };
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, b = { ...drag.b };
    if (drag.h === 'move') { b.x += dx; b.y += dy; }
    else {
      if (drag.h.includes('l')) { b.x += dx; b.w -= dx; }
      if (drag.h.includes('r')) { b.w += dx; }
      if (drag.h.includes('t')) { b.y += dy; b.h -= dy; }
      if (drag.h.includes('b')) { b.h += dy; }
      if (b.w < 30) { if (drag.h.includes('l')) b.x -= 30 - b.w; b.w = 30; }
      if (b.h < 30) { if (drag.h.includes('t')) b.y -= 30 - b.h; b.h = 30; }
    }
    setBox(b);
  });
  const end = () => { drag = null; };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
})();

/* ---------------- Görüntü işleme ---------------- */
const L = 128;   // kırpılan alanın uzun kenarı (piksel)
const T = 10;    // uzaklık sınırı (piksel)
const G = 24;    // kapsama ızgarası
const NB = 8;    // kenar yönü dilimi (0-180°, 22.5° adım)
const CFG = { edgeFrac: 0.14, wRecall: 0.6, wAspect: 0.5, wStretch: 0.25, angStep: 6, scales: [0.9, 1.0], squash: [1, 0.75, 0.55], wSquash: 0.1, topK: 120 };

function cropGray() {
  const c = photo.canvas, b = photo.box;
  const k = c.width / c.clientWidth;
  const sx = b.x * k, sy = b.y * k, sw = b.w * k, sh = b.h * k;
  const s = L / Math.max(sw, sh);
  const W = Math.max(8, Math.round(sw * s)), H = Math.max(8, Math.round(sh * s));
  const t = document.createElement('canvas'); t.width = W; t.height = H;
  const ctx = t.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, sx, sy, sw, sh, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { g, W, H };
}

function blur(g, W, H) {
  const o = new Float32Array(W * H), t = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let k = -1; k <= 1; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += g[y * W + xx]; n++; } }
    t[y * W + x] = s / n;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let k = -1; k <= 1; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += t[yy * W + x]; n++; } }
    o[y * W + x] = s / n;
  }
  return o;
}

// Kenar pikselleri, her birinin yön dilimi ve baskın açı
function edges(g, W, H) {
  const b = blur(blur(g, W, H), W, H);
  const mag = new Float32Array(W * H), dir = new Uint8Array(W * H);
  const hist = new Float32Array(90);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = -b[i - W - 1] - 2 * b[i - 1] - b[i + W - 1] + b[i - W + 1] + 2 * b[i + 1] + b[i + W + 1];
    const gy = -b[i - W - 1] - 2 * b[i - W] - b[i - W + 1] + b[i + W - 1] + 2 * b[i + W] + b[i + W + 1];
    mag[i] = Math.hypot(gx, gy);
    const a = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180;
    dir[i] = Math.floor(a / 22.5) % NB;
  }
  // en güçlü %14 kenar pikseli
  const sorted = Float32Array.from(mag).sort();
  const thr = Math.max(sorted[Math.floor(sorted.length * (1 - CFG.edgeFrac))], 12);
  const e = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (mag[i] >= thr) {
    e[i] = 1;
    const y = (i / W) | 0, x = i % W;
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
    const gx = -b[i - W - 1] - 2 * b[i - 1] - b[i + W - 1] + b[i - W + 1] + 2 * b[i + 1] + b[i + W + 1];
    const gy = -b[i - W - 1] - 2 * b[i - W] - b[i - W + 1] + b[i + W - 1] + 2 * b[i + W] + b[i + W + 1];
    const a = ((Math.atan2(gy, gx) * 180 / Math.PI) % 90 + 90) % 90;
    hist[Math.floor(a) % 90] += mag[i];
  }
  // baskın açı (90° periyotlu): profil duvarları çoğunlukla birbirine diktir
  let best = 0, angle = 0;
  for (let k = 0; k < 90; k++) {
    let s = 0;
    for (let d = -3; d <= 3; d++) s += hist[(k + d + 90) % 90];
    if (s > best) { best = s; angle = k; }
  }
  return { e, dir, angle };
}

function distTransform(e, W, H) {
  const INF = 1e6, d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = e[i] ? 0 : INF;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) {
      v = Math.min(v, d[i - W] + 3);
      if (x > 0) v = Math.min(v, d[i - W - 1] + 4);
      if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4);
    }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < H - 1) {
      v = Math.min(v, d[i + W] + 3);
      if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4);
      if (x > 0) v = Math.min(v, d[i + W - 1] + 4);
    }
    d[i] = v;
  }
  for (let i = 0; i < W * H; i++) d[i] = Math.min(d[i] / 3, T);
  return d;
}

// Her yön dilimi için ayrı uzaklık haritası; komşu dilimler de kabul edilir (±22.5°)
function orientedDT(e, dir, W, H) {
  const per = [];
  for (let k = 0; k < NB; k++) {
    const ek = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (e[i] && dir[i] === k) ek[i] = 1;
    per.push(distTransform(ek, W, H));
  }
  const out = [];
  for (let k = 0; k < NB; k++) {
    const a = per[k], b = per[(k + 1) % NB], c = per[(k + NB - 1) % NB], m = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) m[i] = Math.min(a[i], b[i], c[i]);
    out.push(m);
  }
  return out;
}

// 8 yön (4 döndürme x ayna) + ince açı; noktalar ve yön dilimleri birlikte dönüşür
function orient(pts, a, o, ang = 0, q = 1) {
  // pts: {xy:[u,v,...] 0..1, ob:[dilim]} ; a = genişlik/yükseklik
  const bw = a >= 1 ? 1 : a, bh = a >= 1 ? 1 / a : 1;
  const xy = pts.xy, n = pts.ob.length;
  const out = new Float32Array(xy.length), ob = new Uint8Array(n);
  const rot = o & 3, mir = o >> 2;
  const shift = Math.round(ang / 22.5);
  let W = bw, H = bh;
  for (let j = 0; j < n; j++) {
    let u = xy[2 * j] * bw, v = xy[2 * j + 1] * bh, k = pts.ob[j];
    if (mir) { u = bw - u; k = (NB - 1 - k); }
    let x, y;
    if (rot === 0) { x = u; y = v; }
    else if (rot === 1) { x = bh - v; y = u; }
    else if (rot === 2) { x = bw - u; y = bh - v; }
    else { x = v; y = bw - u; }
    out[2 * j] = x; out[2 * j + 1] = y;
    ob[j] = ((k + (rot & 1) * 4 + shift) % NB + NB) % NB;
  }
  if (rot & 1) { W = bh; H = bw; }
  // q < 1: çapraz bakınca kesit bir eksende basık görünür
  if (q !== 1) { for (let i = 1; i < out.length; i += 2) out[i] *= q; H *= q; }
  if (!ang) return { p: out, ob, W, H };
  const c = Math.cos(ang * Math.PI / 180), s = Math.sin(ang * Math.PI / 180);
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (let i = 0; i < out.length; i += 2) {
    const x = out[i] * c - out[i + 1] * s, y = out[i] * s + out[i + 1] * c;
    out[i] = x; out[i + 1] = y;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  for (let i = 0; i < out.length; i += 2) { out[i] -= minx; out[i + 1] -= miny; }
  return { p: out, ob, W: Math.max(maxx - minx, 1e-3), H: Math.max(maxy - miny, 1e-3) };
}

const mark = new Uint8Array(G * G);
// Çizimi kırpılan alana yerleştirip puanla (küçük = daha benzer).
// İki yerleştirme denenir: oranı koruyarak sığdırma ve kutuya esnetme
// (yandan/çapraz çekilen profilde kesit bir yönde basık görünür).
function scorePlacement(P, Q, fast = false) {
  const { W, H, odt, cells, nCells } = Q;
  const s0 = Math.min(W / P.W, H / P.H);
  const ap = Math.abs(Math.log((P.W / P.H) / (W / H)));
  const n = P.ob.length;
  const fits = fast ? [[s0 * 0.95, s0 * 0.95, CFG.wAspect * ap]] : CFG.scales.map(f => [s0 * f, s0 * f, CFG.wAspect * ap]);
  const sx = W / P.W * 0.95, sy = H / P.H * 0.95;
  if (!fast) fits.push([sx, sy, CFG.wStretch * Math.abs(Math.log(sx / sy))]);
  let best = 1e9;
  for (const [kx, ky, pen] of fits) {
    const ow = P.W * kx, oh = P.H * ky;
    for (const [ox, oy] of fast ? [[0, 0]] : [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]]) {
      const x0 = (W - ow) / 2 + ox, y0 = (H - oh) / 2 + oy;
      let sum = 0;
      mark.fill(0);
      for (let j = 0; j < n; j++) {
        const x = Math.round(x0 + P.p[2 * j] * kx), y = Math.round(y0 + P.p[2 * j + 1] * ky);
        if (x < 0 || y < 0 || x >= W || y >= H) { sum += T; continue; }
        sum += odt[P.ob[j]][y * W + x];
        mark[Math.min(G - 1, (y * G / H) | 0) * G + Math.min(G - 1, (x * G / W) | 0)] = 1;
      }
      // fotoğraftaki kenarların ne kadarını çizim açıklıyor (1 hücre tolerans)
      let cov = 0;
      for (let c = 0; c < G * G; c++) {
        if (!cells[c]) continue;
        const cy = (c / G) | 0, cx = c % G;
        let hit = 0;
        for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx >= 0 && yy >= 0 && xx < G && yy < G && mark[yy * G + xx]) { hit = 1; break; }
        }
        cov += hit;
      }
      const fwd = sum / n / T;
      const recall = nCells ? cov / nCells : 0;
      const sc = fwd + CFG.wRecall * (1 - recall) + pen;
      if (sc < best) best = sc;
    }
  }
  return best;
}

// Kenar haritasından sorgu: yön dilimli uzaklık haritaları, kapsama ızgarası, öğrenme örneği
function buildQuery(e, dir, angle, W, H) {
  const odt = orientedDT(e, dir, W, H);
  const cells = new Uint8Array(G * G); let nCells = 0;
  const idx = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (e[y * W + x]) {
    const c = Math.min(G - 1, (y * G / H) | 0) * G + Math.min(G - 1, (x * G / W) | 0);
    if (!cells[c]) { cells[c] = 1; nCells++; }
    idx.push(y * W + x);
  }
  const ec = $('#edgeCanvas'); ec.width = W; ec.height = H;
  const ectx = ec.getContext('2d'), im = ectx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = e[i] ? 255 : 0; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  ectx.putImageData(im, 0, 0);
  // öğrenme için en fazla 300 kenar noktası: u=x/W, v=y/H ve yön dilimi
  const step = Math.max(1, Math.floor(idx.length / 300));
  const xy = [], ob = [];
  for (let k = 0; k < idx.length; k += step) {
    const i = idx[k];
    xy.push((i % W) / W, ((i / W) | 0) / H); ob.push(dir[i]);
  }
  return { W, H, odt, cells, nCells, sample: { xy, ob }, a: W / H, angle, a0: angle > 45 ? angle - 90 : angle };
}

function analyzeCrop() {
  const { g, W, H } = cropGray();
  const { e, dir, angle } = edges(g, W, H);
  return buildQuery(e, dir, angle, W, H);
}

// Elle çizilen çizgilerden sorgu: çizgi pikselleri katalog çizimleri gibi nokta olur,
// yönleri bulanıklaştırılmış çizginin eğiminden gelir (katalogla aynı yöntem).
function inkQuery(srcCanvas, box) {
  const c = srcCanvas, ctx0 = c.getContext('2d');
  const d0 = ctx0.getImageData(0, 0, c.width, c.height).data;
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  const x1 = box ? box.x1 : c.width, y1 = box ? box.y1 : c.height;
  for (let y = box ? box.y0 : 0; y < y1; y++) for (let x = box ? box.x0 : 0; x < x1; x++) {
    if (d0[(y * c.width + x) * 4 + 3] > 60) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  if (maxx < 0) return null;
  const sw = maxx - minx + 1, sh = maxy - miny + 1;
  const s = (L - 6) / Math.max(sw, sh);
  const W = Math.max(8, Math.round(sw * s) + 6), H = Math.max(8, Math.round(sh * s) + 6);
  const t = document.createElement('canvas'); t.width = W; t.height = H;
  const ctx = t.getContext('2d');
  ctx.drawImage(c, minx, miny, sw, sh, 3, 3, W - 6, H - 6);
  const d = ctx.getImageData(0, 0, W, H).data;
  const ink = new Float32Array(W * H), e = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { ink[i] = d[i * 4 + 3] > 60 ? 255 : 0; e[i] = ink[i] ? 1 : 0; }
  const b = blur(blur(ink, W, H), W, H);
  const dir = new Uint8Array(W * H), hist = new Float32Array(90);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = -b[i - W - 1] - 2 * b[i - 1] - b[i + W - 1] + b[i - W + 1] + 2 * b[i + 1] + b[i + W + 1];
    const gy = -b[i - W - 1] - 2 * b[i - W] - b[i - W + 1] + b[i + W - 1] + 2 * b[i + W] + b[i + W + 1];
    const a = Math.atan2(gy, gx) * 180 / Math.PI;
    dir[i] = Math.floor(((a % 180) + 180) % 180 / 22.5) % NB;
    if (e[i]) hist[Math.floor(((a % 90) + 90) % 90) % 90] += Math.hypot(gx, gy);
  }
  let best = 0, angle = 0;
  for (let k = 0; k < 90; k++) {
    let s2 = 0;
    for (let q = -3; q <= 3; q++) s2 += hist[(k + q + 90) % 90];
    if (s2 > best) { best = s2; angle = k; }
  }
  return buildQuery(e, dir, angle, W, H);
}

function rank(Q) {
  // fotoğraftaki baskın açıya göre çizimi döndürerek dene (çapraz tutulan profiller için)
  const a0 = Q.a0 = Q.angle > 45 ? Q.angle - 90 : Q.angle;
  const st = CFG.angStep, base = Math.abs(a0) < 4 ? 0 : a0;
  const angles = [base, base - st, base + st, base - 2 * st, base + 2 * st];
  const score = (p, fast) => {
    let best = 1e9;
    const angs = fast ? [base] : angles, qs = fast ? [1, 0.65] : CFG.squash;
    for (let o = 0; o < 8; o++) for (const ang of angs) for (const q of qs) {
      const sc = scorePlacement(orient(p.pts, p.a, o, ang - (p.ang || 0), q), Q, fast) + CFG.wSquash * (1 - q);
      if (sc < best) best = sc;
    }
    return best;
  };
  // 1. aşama: hepsini kaba ara; 2. aşama: en iyi adayları ayrıntılı ara
  const cand = PROFILES.filter(p => p.pts).map(p => ({ p, sc: score(p, true) }));
  cand.sort((a, b) => a.sc - b.sc);
  const res = cand.map((c, i) => ({ n: c.p.n, sc: i < CFG.topK ? score(c.p, false) : c.sc + 0.05, src: c.p.custom ? 'senin eklediğin' : 'çizim' }));
  // öğrenilen fotoğraflarla karşılaştır (onaylanan eski çekimler)
  const learned = new Map();
  for (const s of LEARN) {
    const pts = decodePts(s.p);
    let best = 1e9;
    // profilin öbür ucundan bakılınca görüntü aynalanır; bu yüzden 8 yönün hepsi denenir
    for (let o = 0; o < 8; o++) for (const ang of angles) best = Math.min(best, scorePlacement(orient(pts, s.a, o, ang - s.ang), Q));
    best *= 0.85;
    if (!learned.has(s.n) || learned.get(s.n) > best) learned.set(s.n, best);
  }
  for (const r of res) if (learned.has(r.n) && learned.get(r.n) < r.sc) { r.sc = learned.get(r.n); r.src = 'senin fotoğrafın'; }
  res.sort((a, b) => a.sc - b.sc);
  return res;
}

/* ---------------- Fotoğrafın üstünden çizme ---------------- */
const trace = { on: false, canvas: $('#traceCanvas'), strokes: [] };
function syncTraceCanvas() {
  trace.canvas.width = photo.canvas.width; trace.canvas.height = photo.canvas.height;
  trace.strokes = []; redrawStrokes(trace.canvas, trace.strokes, '#facc15');
  updateTraceUi();
}
function updateTraceUi() {
  $('#traceBtn').textContent = trace.on ? '✓ Çizimi bitir' : '✏️ Üstünden çiz';
  $('#traceBtn').classList.toggle('active', trace.on);
  trace.canvas.style.pointerEvents = trace.on ? 'auto' : 'none';
  $('#cropBox').style.display = trace.on ? 'none' : '';
  $('#traceTools').hidden = !trace.on && !trace.strokes.length;
  $('#traceHint').hidden = !trace.on;
}
$('#traceBtn').onclick = () => { trace.on = !trace.on; updateTraceUi(); };
$('#traceUndo').onclick = () => { trace.strokes.pop(); redrawStrokes(trace.canvas, trace.strokes, '#facc15'); updateTraceUi(); };
$('#traceClear').onclick = () => { trace.strokes = []; redrawStrokes(trace.canvas, trace.strokes, '#facc15'); updateTraceUi(); };

function redrawStrokes(c, strokes, color) {
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.strokeStyle = color; x.lineCap = 'round'; x.lineJoin = 'round';
  x.lineWidth = Math.max(c.width, c.height) * 0.012;
  for (const s of strokes) {
    x.beginPath();
    s.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py));
    if (s.length === 1) x.lineTo(s[0][0] + 0.1, s[0][1]);
    x.stroke();
  }
}

// Parmakla çizim (hem fotoğraf üstü hem çizim sayfası)
function enableDrawing(c, strokes, color, onChange) {
  let cur = null;
  const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', e => { e.preventDefault(); c.setPointerCapture(e.pointerId); cur = [pos(e)]; strokes().push(cur); redrawStrokes(c, strokes(), color); });
  c.addEventListener('pointermove', e => { if (!cur) return; cur.push(pos(e)); redrawStrokes(c, strokes(), color); });
  const end = () => { if (cur) { cur = null; onChange && onChange(); } };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}
enableDrawing(trace.canvas, () => trace.strokes, '#facc15', updateTraceUi);

// Tanı: çizim varsa çizimden, yoksa çerçevedeki fotoğraftan
function currentQuery() {
  if (trace.strokes.length) return inkQuery(trace.canvas);
  return analyzeCrop();
}

let lastQuery = null, lastRank = [];
$('#matchBtn').onclick = () => {
  if (!photo.img || !PROFILES.length) return;
  if (trace.on) { trace.on = false; updateTraceUi(); }
  $('#results').innerHTML = '<p class="muted">Karşılaştırılıyor… (birkaç saniye sürebilir)</p>';
  setTimeout(() => {
    const t0 = performance.now();
    const Q = currentQuery();
    if (!Q) { $('#results').innerHTML = '<p class="muted">Önce kesiti çiz.</p>'; return; }
    lastQuery = Q;
    lastRank = rank(Q);
    showResults($('#results'), lastRank, performance.now() - t0, true);
  }, 30);
};

/* ---------------- Yeni profil ekleme ---------------- */
let CUSTOM = store.get('custom', []);   // [{n, a, ang, p, thumb}]
function photoThumb() {
  // çizim varsa çizimin sınırları, yoksa sarı çerçeve
  const c = photo.canvas;
  let sx, sy, sw, sh;
  if (trace.strokes.length) {
    const xs = trace.strokes.flat().map(p => p[0]), ys = trace.strokes.flat().map(p => p[1]);
    sx = Math.min(...xs); sy = Math.min(...ys); sw = Math.max(...xs) - sx; sh = Math.max(...ys) - sy;
    const m = Math.max(sw, sh) * 0.08; sx -= m; sy -= m; sw += 2 * m; sh += 2 * m;
  } else {
    const k = c.width / c.clientWidth, b = photo.box;
    sx = b.x * k; sy = b.y * k; sw = b.w * k; sh = b.h * k;
  }
  const s = 220 / Math.max(sw, sh), t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(sw * s)); t.height = Math.max(1, Math.round(sh * s));
  t.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.72);
}
function addCustomProfile(n, Q) {
  const entry = { n, a: Q.a, ang: Q.a0, p: encodePts(Q.sample), thumb: photoThumb() };
  CUSTOM = CUSTOM.filter(c => c.n !== n);
  CUSTOM.push(entry);
  store.set('custom', CUSTOM);
  mergeCustom();
}
function mergeCustom() {
  PROFILES = PROFILES.filter(p => !p.custom);
  for (const c of CUSTOM) if (!BYNUM.has(c.n) || BYNUM.get(c.n).custom)
    PROFILES.push({ n: c.n, h: 1, custom: 1, a: c.a, ang: c.ang, pts: decodePts(c.p), thumb: c.thumb });
  BYNUM = new Map(PROFILES.map(p => [p.n, p]));
  $('#status').textContent = `${PROFILES.length} profil`;
}
$('#addBtn').onclick = () => {
  if (!photo.img) return;
  const v = (prompt('Bu profilin numarası:') || '').trim();
  if (!v) return;
  if (trace.on) { trace.on = false; updateTraceUi(); }
  const Q = currentQuery();
  if (!Q) { alert('Önce kesiti çiz.'); return; }
  const p = findByShown(v);
  if (p && !p.custom) {
    // katalogda var: fotoğrafı o profile öğret
    lastQuery = Q;
    confirmMatch(p.n, $('#results'));
    return;
  }
  addCustomProfile(v, Q);
  $('#results').innerHTML = `<div class="card"><b>✓ ${v} yeni profil olarak eklendi.</b> Listede ve ezberde de var; bir dahaki çekimde tanınacak.</div>`;
};

/* ---------------- Sonuç listesi ---------------- */
function showResults(el, list, ms, fromPhoto) {
  let shown = 0;
  el.innerHTML = `<p class="muted">En çok benzeyenler (${Math.round(ms)} ms).${fromPhoto ? ' Doğru olana "✓ Bu" de, uygulama öğrensin.' : ' Dokunarak ayrıntısını aç.'}</p><div class="resList"></div>`;
  const box = el.querySelector('.resList');
  const more = document.createElement('button');
  more.className = 'secondary wide'; more.textContent = 'Daha fazla göster';
  const render = () => {
    const end = Math.min(shown + 10, list.length);
    for (; shown < end; shown++) {
      const r = list[shown];
      const d = document.createElement('div');
      d.className = 'card res';
      d.innerHTML = `<span class="rk">${shown + 1}</span><img class="pic" src="${picUrl(r.n)}" alt="">
        <div><div class="num">${shownNum(r.n)}</div><div class="sc">benzerlik ${(Math.max(0, 1 - r.sc) * 100).toFixed(0)}%${r.src !== 'çizim' ? ' · ' + r.src : ''}</div></div>
        ${fromPhoto ? '<button>✓ Bu</button>' : ''}`;
      d.querySelector('img').onclick = e => { e.stopPropagation(); openDetail(r.n); };
      if (fromPhoto) d.querySelector('button').onclick = () => confirmMatch(r.n, d);
      else d.onclick = () => openDetail(r.n);
      box.appendChild(d);
    }
    more.hidden = shown >= list.length;
  };
  render();
  more.onclick = render;
  el.appendChild(more);
  if (!fromPhoto) return;
  const other = document.createElement('div');
  other.className = 'card';
  other.innerHTML = `<div class="row"><input type="search" inputmode="numeric" placeholder="Listede yoksa numarayı yaz"><button class="secondary">Kaydet</button></div>`;
  other.querySelector('button').onclick = () => {
    const v = other.querySelector('input').value.trim();
    if (!v) return;
    const p = findByShown(v);
    if (p && !p.custom) { confirmMatch(p.n, other); return; }
    addCustomProfile(v, lastQuery);
    other.innerHTML = `<b>✓ ${v} yeni profil olarak eklendi.</b>`;
  };
  el.appendChild(other);
}

/* ---------------- Elle çizerek arama ---------------- */
const sketch = { canvas: $('#sketchCanvas'), strokes: [] };
enableDrawing(sketch.canvas, () => sketch.strokes, '#111827');
$('#sketchUndo').onclick = () => { sketch.strokes.pop(); redrawStrokes(sketch.canvas, sketch.strokes, '#111827'); };
$('#sketchClear').onclick = () => { sketch.strokes = []; redrawStrokes(sketch.canvas, sketch.strokes, '#111827'); $('#sketchResults').innerHTML = ''; };
$('#sketchBtn').onclick = () => {
  if (!sketch.strokes.length || !PROFILES.length) return;
  $('#sketchResults').innerHTML = '<p class="muted">Karşılaştırılıyor…</p>';
  setTimeout(() => {
    const t0 = performance.now();
    const Q = inkQuery(sketch.canvas);
    showResults($('#sketchResults'), rank(Q), performance.now() - t0, false);
    $('#sketchResults').scrollIntoView({ behavior: 'smooth' });
  }, 30);
};

function findByShown(v) {
  for (const p of PROFILES) if (shownNum(p.n) === v) return p;
  return BYNUM.get(v) || BYNUM.get(v.padStart(4, '0'));
}

function confirmMatch(n, el) {
  if (!lastQuery) return;
  LEARN.push({ v: 2, n, a: lastQuery.a, ang: lastQuery.a0, p: encodePts(lastQuery.sample) });
  if (LEARN.length > 2000) LEARN.shift();
  store.set('learn', LEARN);
  el.innerHTML = `<b>✓ ${shownNum(n)} olarak kaydedildi.</b> Bir dahaki sefere daha iyi tanıyacak.`;
}

/* ---------------- Liste ---------------- */
let listLimit = 60;
$('#search').oninput = () => { listLimit = 60; renderList(); };
function renderList() {
  const q = $('#search').value.trim();
  // önce numarası aranan rakamlarla başlayanlar, sonra içinde geçenler
  const items = !q ? PROFILES : [
    ...PROFILES.filter(p => shownNum(p.n).startsWith(q)),
    ...PROFILES.filter(p => !shownNum(p.n).startsWith(q) && shownNum(p.n).includes(q)),
  ];
  $('#listInfo').textContent = `${items.length} profil`;
  const el = $('#list'); el.innerHTML = '';
  for (const p of items.slice(0, listLimit)) {
    const d = document.createElement('div');
    d.className = 'item';
    d.innerHTML = `<img class="pic" loading="lazy" src="${p.h ? picUrl(p.n) : rowUrl(p.n)}" alt=""><b>${shownNum(p.n)}</b>${p.h ? '' : '<span class="badge">resim yok</span>'}${FIX[p.n] ? '<span class="badge">düzeltildi</span>' : ''}`;
    d.onclick = () => openDetail(p.n);
    el.appendChild(d);
  }
  if (items.length > listLimit) {
    const b = document.createElement('button');
    b.className = 'secondary'; b.textContent = 'Daha fazla göster';
    b.onclick = () => { listLimit += 120; renderList(); };
    el.appendChild(b);
  }
}

function openDetail(n) {
  const p = BYNUM.get(n);
  const nl = LEARN.filter(s => s.n === n).length;
  $('#detailBody').innerHTML = `
    <div class="bignum">${shownNum(n)}</div>
    ${FIX[n] ? `<p class="muted">Videodan okunan: ${n}</p>` : ''}
    <img class="rowimg" src="${rowUrl(n)}" alt="">
    <p class="muted">Excel satırının videodan alınmış hali. ${nl ? `Bu profil için ${nl} fotoğrafın kayıtlı.` : ''}</p>
    ${NOTES[n] ? `<p>İpucun: ${NOTES[n]}</p>` : ''}
    ${p && p.h && lookalikes(n, 4).length ? '<p class="muted">Buna en çok benzeyenler:</p><div class="alikes" id="detAlikes"></div>' : ''}
    ${p && p.custom ? '<button id="delCustom" class="danger">Bu eklediğin profili sil</button>' : '<button id="fixBtn" class="secondary">Numara yanlış mı? Düzelt</button>'}`;
  if (p && p.custom) {
    $('#delCustom').onclick = () => {
      if (!confirm(`${n} silinsin mi?`)) return;
      CUSTOM = CUSTOM.filter(c => c.n !== n); store.set('custom', CUSTOM); mergeCustom();
      $('#detail').close(); renderList();
    };
    if (!$('#detail').open) $('#detail').showModal();
    return;
  }
  const da = $('#detAlikes');
  if (da) for (const m of lookalikes(n, 4)) {
    const d = document.createElement('div'); d.className = 'alike';
    d.appendChild(picCanvas(m, 0, 'pic small')); d.insertAdjacentHTML('beforeend', `<b>${shownNum(m)}</b>`);
    d.onclick = () => openDetail(m);
    da.appendChild(d);
  }
  $('#fixBtn').onclick = () => {
    const v = prompt('Doğru numara:', shownNum(n));
    if (v === null) return;
    const t = v.trim();
    if (!t || t === n) delete FIX[n]; else FIX[n] = t;
    store.set('fix', FIX);
    openDetail(n); renderList();
  };
  if (!$('#detail').open) $('#detail').showModal();
}

/* ---------------- Ezber ----------------
   Amaç: kesilmiş profilin ucuna bakınca numarasını hemen söyleyebilmek.
   - Aralıklı tekrar (SM-2 benzeri): bilinenler seyrek, unutulanlar sık gelir.
   - Her gün ayarlanabilir sayıda yeni profil; önce tanıtım, sonra hemen sorma.
   - Resim rastgele döndürülüp aynalanır (parça elde her yönden gelebilir).
   - Şıklar şekilce en çok benzeyen profillerden seçilir (ayırt etmeyi öğretir).
   - Cevap süresi ölçülür; yavaş bilinenler daha erken tekrar edilir. */
const MIN = 60000, DAY = 86400000;
const STEPS = [1 * MIN, 10 * MIN];     // öğrenme adımları
let SRS = store.get('srs', {});        // {n: {st, step, ivl, ease, due, reps, lapses, ms}}
let EZ = Object.assign({ newPerDay: 10, answer: 'type', rotate: true, order: 'num', range: 'all' }, store.get('ezberSet', {}));
let NOTES = store.get('notes', {});
let TODAY = store.get('ezberDay', {});
let SIMILAR = {};

const todayKey = () => new Date().toLocaleDateString('sv');
function today() {
  if (TODAY.date !== todayKey()) {
    const prev = TODAY.date;
    const yest = new Date(Date.now() - DAY).toLocaleDateString('sv');
    TODAY = { date: todayKey(), newDone: 0, extra: 0, done: 0, ok: 0, streak: prev === yest && TODAY.done ? (TODAY.streak || 0) : (prev === todayKey() ? TODAY.streak : 0) };
    store.set('ezberDay', TODAY);
  }
  return TODAY;
}
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
const saveSrs = () => store.set('srs', SRS);
let SKIP = store.get('skip', {});      // kullanıcının 'resim bozuk' dediği profiller
const studyPool = () => PROFILES.filter(p => p.h && !SKIP[p.n]);

function newCandidates() {
  const r = EZ.range;
  let list = studyPool().filter(p => !SRS[p.n] && (r === 'all' || shownNum(p.n).padStart(4, '0')[0] === r));
  if (EZ.order === 'random') {
    // her gün aynı karışık sıra (sayfa yenilense de değişmesin)
    const seed = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };
    list = list.map(p => [seed(p.n + todayKey()), p]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  }
  // resmi bulanık olanlar en sona
  return [...list.filter(p => (p.q ?? 1) >= 0.4), ...list.filter(p => (p.q ?? 1) < 0.4)];
}

function counts() {
  const now = Date.now(), eod = endOfToday();
  let learn = 0, due = 0, known = 0, seen = 0;
  for (const p of studyPool()) {
    const s = SRS[p.n]; if (!s) continue;
    seen++;
    if (s.st === 'learn') learn++;
    else if (s.due <= eod) due++;
    if (s.st === 'review' && s.ivl >= 21) known++;
  }
  const t = today();
  const newLeft = Math.max(0, Math.min(EZ.newPerDay + t.extra - t.newDone, newCandidates().length));
  return { learn, due, newLeft, known, seen, total: studyPool().length };
}

let lastShown = null;
function nextCard() {
  const now = Date.now(), eod = endOfToday();
  const items = studyPool().map(p => [p, SRS[p.n]]).filter(([, s]) => s);
  const pick = arr => arr.find(([p]) => p.n !== lastShown) || arr[0];
  const learnDue = items.filter(([, s]) => s.st === 'learn' && s.due <= now).sort((a, b) => a[1].due - b[1].due);
  if (learnDue.length) return { p: pick(learnDue)[0] };
  const revDue = items.filter(([, s]) => s.st === 'review' && s.due <= eod).sort((a, b) => a[1].due - b[1].due);
  if (revDue.length) return { p: pick(revDue)[0] };
  const t = today();
  if (t.newDone < EZ.newPerDay + t.extra) {
    const c = newCandidates();
    if (c.length) return { p: c[0], isNew: true };
  }
  const learnLater = items.filter(([, s]) => s.st === 'learn').sort((a, b) => a[1].due - b[1].due);
  if (learnLater.length) return { p: pick(learnLater)[0] };
  return null;
}

// grade: 0 bilemedi, 1 zor, 2 iyi, 3 kolay
function schedule(n, g, ms) {
  const now = Date.now();
  const s = SRS[n] || { st: 'learn', step: 0, ivl: 0, ease: 2.5, due: now, reps: 0, lapses: 0, ms: 0 };
  s.reps++;
  if (ms) s.ms = s.ms ? Math.round(s.ms * 0.6 + ms * 0.4) : ms;
  if (s.st === 'learn') {
    if (g === 0) { s.step = 0; s.due = now + STEPS[0]; }
    else if (g === 1) { s.due = now + STEPS[s.step]; }
    else if (g === 2 && s.step + 1 < STEPS.length) { s.step++; s.due = now + STEPS[s.step]; }
    else { s.st = 'review'; s.ivl = Math.max(s.ivl || 0, g === 3 ? 4 : 1); s.due = now + s.ivl * DAY; }
  } else {
    if (g === 0) {
      s.lapses++; s.ease = Math.max(1.3, s.ease - 0.2);
      s.st = 'learn'; s.step = 0; s.ivl = Math.max(1, Math.round(s.ivl * 0.3)); s.due = now + STEPS[0];
    } else {
      if (g === 1) { s.ivl = Math.max(s.ivl + 1, s.ivl * 1.2); s.ease = Math.max(1.3, s.ease - 0.15); }
      if (g === 2) s.ivl = Math.max(s.ivl + 1, s.ivl * s.ease);
      if (g === 3) { s.ivl = Math.max(s.ivl + 2, s.ivl * s.ease * 1.3); s.ease += 0.15; }
      s.ivl = Math.min(365, s.ivl);
      s.due = now + s.ivl * DAY * (0.95 + Math.random() * 0.1);
    }
  }
  SRS[n] = s; saveSrs();
}

// Profil resmini döndürülmüş / aynalanmış olarak çiz (o: 0-7)
function picCanvas(n, o, cls = 'pic') {
  const c = document.createElement('canvas');
  c.className = cls;
  const img = new Image();
  img.onload = () => {
    const rot = o & 3, mir = o >> 2, w = img.naturalWidth, h = img.naturalHeight;
    c.width = rot & 1 ? h : w; c.height = rot & 1 ? w : h;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 2); if (mir) x.scale(-1, 1);
    x.drawImage(img, -w / 2, -h / 2);
  };
  img.src = picUrl(n);
  return c;
}

function lookalikes(n, k) {
  const list = (SIMILAR[n] || []).filter(m => BYNUM.get(m) && BYNUM.get(m).h);
  return list.slice(0, k);
}

function choiceOptions(p) {
  const opts = new Set(lookalikes(p.n, 3));
  const pool = studyPool();
  while (opts.size < 3) { const q = pool[Math.floor(Math.random() * pool.length)]; if (q.n !== p.n) opts.add(q.n); }
  return shuffle([p.n, ...opts]);
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* --- ekranlar --- */
let mode = 'srs';   // srs | practice | weak
function ezHome() {
  const c = counts(), t = today();
  $('#quizCard').innerHTML = '';
  $('#ezHome').hidden = false;
  $('#ezStats').innerHTML = `
    <div class="stat"><b>${c.learn + c.due}</b><span>tekrar bekliyor</span></div>
    <div class="stat"><b>${c.newLeft}</b><span>yeni (bugün)</span></div>
    <div class="stat"><b>${c.known}</b><span>kalıcı öğrenildi</span></div>
    <div class="stat"><b>${c.seen}/${c.total}</b><span>görülen</span></div>`;
  $('#ezToday').textContent = t.done ? `Bugün ${t.done} soru, %${Math.round(100 * t.ok / t.done)} doğru.${t.streak ? ` ${t.streak + 1}. gün üst üste 🔥` : ''}` : (t.streak ? `${t.streak} gündür üst üste çalışıyorsun 🔥` : '');
  $('#ezStart').textContent = c.learn + c.due + c.newLeft ? '▶ Bugünkü çalışmaya başla' : '✓ Bugünlük bitti — 5 yeni profil daha ekle';
}

$('#ezStart').onclick = () => {
  const c = counts();
  if (!(c.learn + c.due + c.newLeft)) { today().extra += 5; store.set('ezberDay', TODAY); }
  mode = 'srs'; startSession();
};
$('#ezPractice').onclick = () => { mode = 'practice'; startSession(); };
$('#ezWeak').onclick = () => { mode = 'weak'; startSession(); };

function startSession() { $('#ezHome').hidden = true; showNext(); }

function practicePick() {
  let pool = studyPool().filter(p => SRS[p.n]);
  if (mode === 'weak') pool = pool.filter(p => SRS[p.n].lapses >= 1 || SRS[p.n].ms > 6000);
  if (!pool.length) return null;
  // zayıf olanlar (çok unutulan, yavaş bilinen) daha sık
  const w = pool.map(p => 1 + SRS[p.n].lapses * 2 + Math.min(4, (SRS[p.n].ms || 0) / 3000));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0 && pool[i].n !== lastShown) return pool[i]; }
  return pool[0];
}

function showNext() {
  let next;
  if (mode === 'srs') next = nextCard();
  else { const p = practicePick(); next = p && { p }; }
  if (!next) {
    $('#quizCard').innerHTML = `<div class="card center"><div class="bignum">🎉</div>
      <p>${mode === 'srs' ? 'Bugünkü çalışma bitti. Yarın tekrar gel; unutmaya başladıklarını o zaman soracağım.' : 'Henüz çalıştığın profil yok. Önce günlük çalışmaya başla.'}</p>
      <button id="ezBack">Ana ekrana dön</button></div>`;
    $('#ezBack').onclick = ezHome;
    return;
  }
  lastShown = next.p.n;
  if (next.isNew) introduce(next.p); else ask(next.p);
}

function introduce(p) {
  const card = $('#quizCard');
  card.innerHTML = `<div class="card">
      <div class="tag">YENİ PROFİL</div>
      <div class="bignum">${shownNum(p.n)}</div>
      <div class="introPic"></div>
      <p class="muted">Elinde şöyle de görebilirsin:</p>
      <div class="variants"></div>
      <p class="muted">Bunlarla karıştırma:</p>
      <div class="alikes"></div>
      <p class="muted">Excel'deki satırı:</p><img class="rowimg" src="${rowUrl(p.n)}" alt="">
      <label class="muted">Hafıza ipucun (isteğe bağlı): <input class="note" type="text" placeholder="ör. 'iki dişli tarak, 91 ile başlar'" value="${(NOTES[p.n] || '').replace(/"/g, '&quot;')}"></label>
      <button class="go">Tamam, sor bakalım</button>
      <button class="secondary skip">Resim bozuk, bu profili atla</button>
      <button class="secondary back">Ana ekran</button></div>`;
  card.querySelector('.skip').onclick = () => { SKIP[p.n] = 1; store.set('skip', SKIP); showNext(); };
  card.querySelector('.introPic').appendChild(picCanvas(p.n, 0, 'pic big'));
  for (const o of [1, 2, 4, 3]) card.querySelector('.variants').appendChild(picCanvas(p.n, o, 'pic small'));
  for (const m of lookalikes(p.n, 3)) {
    const d = document.createElement('div'); d.className = 'alike';
    d.appendChild(picCanvas(m, 0, 'pic small')); d.insertAdjacentHTML('beforeend', `<b>${shownNum(m)}</b>`);
    card.querySelector('.alikes').appendChild(d);
  }
  card.querySelector('.go').onclick = () => {
    const note = card.querySelector('.note').value.trim();
    if (note) NOTES[p.n] = note; else delete NOTES[p.n];
    store.set('notes', NOTES);
    today().newDone++; store.set('ezberDay', TODAY);
    SRS[p.n] = { st: 'learn', step: 0, ivl: 0, ease: 2.5, due: Date.now(), reps: 0, lapses: 0, ms: 0 }; saveSrs();
    lastShown = null;   // tanıttıktan hemen sonra bir kez sor
    ask(p);
  };
  card.querySelector('.back').onclick = ezHome;
}

function ask(p) {
  const card = $('#quizCard');
  const o = EZ.rotate ? Math.floor(Math.random() * 8) : 0;
  const answer = shownNum(p.n);
  const t0 = performance.now();
  card.innerHTML = `<div class="card">
      <div class="qhead"><span class="muted">${mode === 'srs' ? 'Bu hangi profil?' : mode === 'weak' ? 'Zayıfların' : 'Hızlı tekrar'}</span><span class="timer">0.0 sn</span></div>
      <div class="qpic"></div>
      <div class="feedback"></div>
      <div class="answer"></div>
      <button class="secondary back">Ana ekran</button></div>`;
  card.querySelector('.qpic').appendChild(picCanvas(p.n, o, 'pic big'));
  card.querySelector('.back').onclick = () => { clearInterval(tm); ezHome(); };
  const timer = card.querySelector('.timer');
  const tm = setInterval(() => { timer.textContent = ((performance.now() - t0) / 1000).toFixed(1) + ' sn'; }, 100);
  const box = card.querySelector('.answer');

  const finish = (ok, given, selfGrade) => {
    clearInterval(tm);
    const ms = performance.now() - t0;
    const g = selfGrade !== undefined ? selfGrade : !ok ? 0 : ms < 3500 ? 3 : ms < 9000 ? 2 : 1;
    if (mode === 'srs') schedule(p.n, g, ms);
    else if (!ok) { const s = SRS[p.n]; if (s) { s.lapses++; s.due = Math.min(s.due, Date.now()); saveSrs(); } }
    const t = today(); t.done++; if (ok) t.ok++; store.set('ezberDay', TODAY);
    const fb = card.querySelector('.feedback');
    fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
    fb.innerHTML = ok ? `✓ ${answer} <small>(${(ms / 1000).toFixed(1)} sn${g === 1 ? ' — biraz yavaş' : ''})</small>` : `✗ Doğrusu: <b>${answer}</b>`;
    box.innerHTML = '';
    if (NOTES[p.n]) box.insertAdjacentHTML('beforeend', `<p class="muted">İpucun: ${NOTES[p.n]}</p>`);
    const gp = given && findByShown(given);
    if (!ok && gp && gp.h) {
      // yanlış cevabın resmi ile yan yana: farkı gör
      box.insertAdjacentHTML('beforeend', '<div class="compare"><div><b>' + answer + '</b> (bu)</div><div><b>' + shownNum(gp.n) + '</b> (senin dediğin)</div></div>');
      const cmp = box.querySelector('.compare');
      cmp.children[0].prepend(picCanvas(p.n, 0, 'pic small'));
      cmp.children[1].prepend(picCanvas(gp.n, 0, 'pic small'));
    }
    const nb = document.createElement('button'); nb.textContent = 'Devam →'; nb.className = 'go';
    nb.onclick = showNext; box.appendChild(nb);
    if (ok) setTimeout(() => { if (nb.isConnected) showNext(); }, 1300);
  };

  if (EZ.answer === 'choice') {
    const opts = document.createElement('div'); opts.className = 'opts';
    for (const n of choiceOptions(p)) {
      const b = document.createElement('button'); b.textContent = shownNum(n);
      b.onclick = () => {
        opts.querySelectorAll('button').forEach(x => { x.disabled = true; if (x.textContent === answer) x.classList.add('ok'); });
        if (n !== p.n) b.classList.add('bad');
        finish(n === p.n, shownNum(n));
      };
      opts.appendChild(b);
    }
    box.appendChild(opts);
  } else if (EZ.answer === 'self') {
    const b = document.createElement('button'); b.textContent = 'Cevabı göster'; b.className = 'go';
    b.onclick = () => {
      clearInterval(tm);
      box.innerHTML = `<div class="bignum">${answer}</div><div class="grades">
        <button data-g="0" class="danger">Bilemedim</button><button data-g="1" class="secondary">Zor</button>
        <button data-g="2">Bildim</button><button data-g="3" class="okbtn">Kolay</button></div>`;
      box.querySelectorAll('[data-g]').forEach(x => x.onclick = () => finish(+x.dataset.g > 0, null, +x.dataset.g));
    };
    box.appendChild(b);
  } else {
    box.innerHTML = `<div class="row"><input class="numIn" type="text" inputmode="numeric" autocomplete="off" placeholder="Numara"><button class="chkBtn">Kontrol</button></div>
      <button class="secondary idk">Bilmiyorum</button>`;
    const inp = box.querySelector('input');
    const norm = v => v.trim().replace(/^0+/, '');
    const check = () => { if (inp.disabled) return; inp.disabled = true; const v = inp.value.trim(); finish(!!v && norm(v) === norm(answer), v); };
    box.querySelector(".chkBtn").onclick = check;
    box.querySelector('.idk').onclick = () => { inp.value = ''; check(); };
    inp.onkeydown = e => { if (e.key === 'Enter') check(); };
    setTimeout(() => inp.focus(), 50);
  }
}

/* --- ezber ayarları --- */
function initEzberSettings() {
  const groups = new Map();
  for (const p of studyPool()) { const k = shownNum(p.n).padStart(4, '0')[0]; groups.set(k, (groups.get(k) || 0) + 1); }
  const sel = $('#ezRange');
  for (const [k, c] of [...groups].sort()) sel.insertAdjacentHTML('beforeend', `<option value="${k}">${k}000 – ${k}999 (${c})</option>`);
  for (const [id, key] of [['#ezNew', 'newPerDay'], ['#ezAnswer', 'answer'], ['#ezOrder', 'order'], ['#ezRange', 'range']]) {
    const el = $(id); el.value = String(EZ[key]);
    el.onchange = () => { EZ[key] = key === 'newPerDay' ? +el.value : el.value; store.set('ezberSet', EZ); ezHome(); };
  }
  $('#ezRotate').checked = EZ.rotate;
  $('#ezRotate').onchange = () => { EZ.rotate = $('#ezRotate').checked; store.set('ezberSet', EZ); };
}

/* ---------------- Ayarlar ---------------- */
function renderMore() {
  $('#fixExport').value = Object.keys(FIX).length ? JSON.stringify(FIX) : 'Henüz düzeltme yok.';
  const cnt = new Set(LEARN.map(s => s.n)).size;
  $('#learnInfo').textContent = `${LEARN.length} fotoğraf, ${cnt} farklı profil.`;
  const sk = Object.keys(SKIP);
  $('#skipInfo').textContent = sk.length ? `Resmi bozuk diye atladıkların: ${sk.map(shownNum).join(', ')}` : 'Atladığın profil yok.';
}
$('#unskip').onclick = () => { SKIP = {}; store.set('skip', SKIP); renderMore(); };
$('#copyFix').onclick = async () => {
  try { await navigator.clipboard.writeText($('#fixExport').value); $('#copyFix').textContent = 'Kopyalandı ✓'; }
  catch (e) { $('#fixExport').select(); }
};
$('#clearLearn').onclick = () => {
  if (!confirm('Öğrenilen bütün fotoğraflar silinsin mi?')) return;
  LEARN = []; store.set('learn', LEARN); renderMore();
};
$('#offlineBtn').onclick = async () => {
  const urls = PROFILES.flatMap(p => [rowUrl(p.n), ...(p.h ? [picUrl(p.n)] : [])]);
  let done = 0, fail = 0;
  const info = $('#offlineInfo');
  const queue = urls.slice();
  const worker = async () => {
    while (queue.length) {
      const u = queue.pop();
      try { const r = await fetch(u); if (!r.ok) fail++; } catch (e) { fail++; }
      done++;
      if (done % 20 === 0 || done === urls.length) info.textContent = `${done} / ${urls.length} indirildi${fail ? `, ${fail} hata` : ''}`;
    }
  };
  $('#offlineBtn').disabled = true;
  await Promise.all(Array.from({ length: 6 }, worker));
  $('#offlineBtn').disabled = false;
  info.textContent = fail ? `Bitti ama ${fail} dosya indirilemedi, tekrar dene.` : 'Hepsi indirildi ✓ Artık internetsiz çalışır.';
};

/* ---------------- Başlat ---------------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
loadData().then(() => { initEzberSettings(); ezHome(); }).catch(e => { $('#status').textContent = 'Veri yüklenemedi'; console.error(e); });
