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
let QUIZ = store.get('quiz', {});        // ezber kutuları: {n: {b, t}}

const shownNum = n => FIX[n] || n;
const picUrl = n => `data/pic/${n}.jpg`;
const rowUrl = n => `data/row/${n}.jpg`;

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
  $('#status').textContent = `${PROFILES.length} profil`;
}

/* ---------------- Gezinme ---------------- */
document.querySelectorAll('nav button').forEach(b => b.onclick = () => showView(b.dataset.view));
function showView(v) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  if (v === 'list') renderList();
  if (v === 'quiz' && !$('#quizCard').innerHTML) nextQuestion();
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
$('#rotBtn').onclick = () => { if (photo.img) { photo.rot = (photo.rot + 1) % 4; drawPhoto(); } };

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
const CFG = { edgeFrac: 0.14, wRecall: 0.6, wAspect: 0.5, angStep: 6, scales: [0.9, 1.0] };

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
function orient(pts, a, o, ang = 0) {
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
function scorePlacement(P, Q) {
  const { W, H, odt, cells, nCells } = Q;
  const s0 = Math.min(W / P.W, H / P.H);
  const ap = Math.abs(Math.log((P.W / P.H) / (W / H)));
  const n = P.ob.length;
  let best = 1e9;
  for (const f of CFG.scales) {
    const s = s0 * f, ow = P.W * s, oh = P.H * s;
    for (const [ox, oy] of [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]]) {
      const x0 = (W - ow) / 2 + ox, y0 = (H - oh) / 2 + oy;
      let sum = 0;
      mark.fill(0);
      for (let j = 0; j < n; j++) {
        const x = Math.round(x0 + P.p[2 * j] * s), y = Math.round(y0 + P.p[2 * j + 1] * s);
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
      const sc = fwd + CFG.wRecall * (1 - recall) + CFG.wAspect * ap;
      if (sc < best) best = sc;
    }
  }
  return best;
}

function analyzeCrop() {
  const { g, W, H } = cropGray();
  const { e, dir, angle } = edges(g, W, H);
  const odt = orientedDT(e, dir, W, H);
  const cells = new Uint8Array(G * G); let nCells = 0;
  const idx = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (e[y * W + x]) {
    const c = Math.min(G - 1, (y * G / H) | 0) * G + Math.min(G - 1, (x * G / W) | 0);
    if (!cells[c]) { cells[c] = 1; nCells++; }
    idx.push(y * W + x);
  }
  // kenar görüntüsünü göster
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
  return { W, H, odt, cells, nCells, sample: { xy, ob }, a: W / H, angle };
}

function rank(Q) {
  const res = [];
  // fotoğraftaki baskın açıya göre çizimi döndürerek dene (eğik tutulan profiller için)
  const a0 = Q.a0 = Q.angle > 45 ? Q.angle - 90 : Q.angle;
  const st = CFG.angStep, angles = Math.abs(a0) < 4 ? [0, -st, st] : [a0, a0 - st, a0 + st];
  for (const p of PROFILES) {
    if (!p.pts) continue;
    let best = 1e9;
    for (let o = 0; o < 8; o++) for (const ang of angles) {
      const sc = scorePlacement(orient(p.pts, p.a, o, ang), Q);
      if (sc < best) best = sc;
    }
    res.push({ n: p.n, sc: best, src: 'çizim' });
  }
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

let lastQuery = null;
$('#matchBtn').onclick = () => {
  if (!photo.img || !PROFILES.length) return;
  $('#results').innerHTML = '<p class="muted">Karşılaştırılıyor…</p>';
  setTimeout(() => {
    const t0 = performance.now();
    const Q = analyzeCrop();
    lastQuery = Q;
    const r = rank(Q);
    showResults(r.slice(0, 5), performance.now() - t0);
  }, 30);
};

function showResults(top, ms) {
  const el = $('#results');
  el.innerHTML = `<p class="muted">En yakın 5 aday (${Math.round(ms)} ms). Doğru olana dokun, uygulama öğrensin.</p>`;
  for (const r of top) {
    const d = document.createElement('div');
    d.className = 'card res';
    d.innerHTML = `<img class="pic" src="${picUrl(r.n)}" alt="">
      <div><div class="num">${shownNum(r.n)}</div><div class="sc">benzerlik ${(Math.max(0, 1 - r.sc) * 100).toFixed(0)}% · ${r.src}</div></div>
      <button>✓ Bu</button>`;
    d.querySelector('img').onclick = () => openDetail(r.n);
    d.querySelector('button').onclick = () => confirmMatch(r.n, d);
    el.appendChild(d);
  }
  const other = document.createElement('div');
  other.className = 'card';
  other.innerHTML = `<div class="row"><input type="search" inputmode="numeric" placeholder="Listede yoksa numarayı yaz"><button class="secondary">Kaydet</button></div>`;
  other.querySelector('button').onclick = () => {
    const v = other.querySelector('input').value.trim();
    const p = findByShown(v);
    if (!p) { alert('Bu numara listede yok.'); return; }
    confirmMatch(p.n, other);
  };
  el.appendChild(other);
}

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
    <button id="fixBtn" class="secondary">Numara yanlış mı? Düzelt</button>`;
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

/* ---------------- Ezber ---------------- */
const quizPool = () => {
  const r = $('#quizRange').value;
  return PROFILES.filter(p => p.h && (r === 'all' || shownNum(p.n).padStart(4, '0').startsWith(r)));
};
$('#quizMode').onchange = nextQuestion;
$('#quizRange').onchange = nextQuestion;

function fillRanges() {
  const groups = new Map();
  for (const p of PROFILES) if (p.h) { const k = shownNum(p.n).padStart(4, '0')[0]; groups.set(k, (groups.get(k) || 0) + 1); }
  const sel = $('#quizRange');
  for (const [k, c] of [...groups].sort()) {
    const o = document.createElement('option');
    o.value = k; o.textContent = `${k}000 – ${k}999 (${c} profil)`;
    sel.appendChild(o);
  }
}

function pickQuestion(pool) {
  const now = Date.now();
  // Leitner: düşük kutudakiler (bilinmeyenler) daha sık gelir
  const w = pool.map(p => {
    const s = QUIZ[p.n];
    if (!s) return 1;
    const age = (now - s.t) / 60000;
    return Math.pow(0.35, s.b) * (age < 1 ? 0.1 : 1) + 0.02;
  });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

function distractors(p, pool, k) {
  const near = pool.filter(q => q.n !== p.n && shownNum(q.n).slice(0, 2) === shownNum(p.n).slice(0, 2));
  const rest = pool.filter(q => q.n !== p.n);
  const out = new Set();
  const src = near.length >= k ? near : rest;
  while (out.size < Math.min(k, src.length)) out.add(src[Math.floor(Math.random() * src.length)]);
  return [...out];
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function grade(n, ok) {
  const s = QUIZ[n] || { b: 0, t: 0 };
  s.b = ok ? Math.min(5, s.b + 1) : 0; s.t = Date.now();
  QUIZ[n] = s; store.set('quiz', QUIZ);
  renderQuizStats();
}

function renderQuizStats() {
  const pool = quizPool();
  const learned = pool.filter(p => (QUIZ[p.n] || {}).b >= 3).length;
  $('#quizStats').textContent = `Öğrenilen: ${learned} / ${pool.length}`;
}

function nextQuestion() {
  const pool = quizPool();
  const card = $('#quizCard');
  renderQuizStats();
  if (pool.length < 4) { card.innerHTML = '<p>Yeterli profil yok.</p>'; return; }
  const p = pickQuestion(pool), mode = $('#quizMode').value;
  const answer = shownNum(p.n);
  const after = ok => {
    grade(p.n, ok);
    const fb = card.querySelector('.feedback');
    fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
    fb.textContent = ok ? '✓ Doğru!' : `✗ Doğrusu: ${answer}`;
    setTimeout(nextQuestion, ok ? 900 : 2200);
  };
  if (mode === 'pic2num') {
    const opts = shuffle([p, ...distractors(p, pool, 3)]);
    card.innerHTML = `<img class="pic" src="${picUrl(p.n)}" alt=""><div class="feedback"></div><div class="opts"></div>`;
    for (const o of opts) {
      const b = document.createElement('button'); b.textContent = shownNum(o.n);
      b.onclick = () => {
        card.querySelectorAll('.opts button').forEach(x => { x.disabled = true; if (x.textContent === answer) x.classList.add('ok'); });
        if (o.n !== p.n) b.classList.add('bad');
        after(o.n === p.n);
      };
      card.querySelector('.opts').appendChild(b);
    }
  } else if (mode === 'num2pic') {
    const opts = shuffle([p, ...distractors(p, pool, 3)]);
    card.innerHTML = `<div class="bignum">${answer}</div><div class="feedback"></div><div class="opts"></div>`;
    for (const o of opts) {
      const b = document.createElement('button'); b.className = 'picopt';
      b.innerHTML = `<img src="${picUrl(o.n)}" alt="">`;
      b.onclick = () => {
        card.querySelectorAll('.opts button').forEach((x, i) => { x.disabled = true; if (opts[i].n === p.n) x.classList.add('ok'); });
        if (o.n !== p.n) b.classList.add('bad');
        after(o.n === p.n);
      };
      card.querySelector('.opts').appendChild(b);
    }
  } else {
    card.innerHTML = `<img class="pic" src="${picUrl(p.n)}" alt=""><div class="feedback"></div>
      <div class="row"><input type="search" inputmode="numeric" placeholder="Numara"><button>Kontrol</button></div>`;
    const inp = card.querySelector('input');
    const check = () => { if (inp.disabled) return; inp.disabled = true; after(inp.value.trim().replace(/^0+/, '') === answer.replace(/^0+/, '')); };
    card.querySelector('button').onclick = check;
    inp.onkeydown = e => { if (e.key === 'Enter') check(); };
    inp.focus();
  }
}

/* ---------------- Ayarlar ---------------- */
function renderMore() {
  $('#fixExport').value = Object.keys(FIX).length ? JSON.stringify(FIX) : 'Henüz düzeltme yok.';
  const cnt = new Set(LEARN.map(s => s.n)).size;
  $('#learnInfo').textContent = `${LEARN.length} fotoğraf, ${cnt} farklı profil.`;
}
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
loadData().then(() => { fillRanges(); renderQuizStats(); }).catch(e => { $('#status').textContent = 'Veri yüklenemedi'; console.error(e); });
