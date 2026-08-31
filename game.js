'use strict';
(() => {

const W = 1024, H = 576;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ==================== 상수 ====================

// 맵의 흙길을 따라가는 웨이포인트 (포탈 → 크리스탈)
const PATH = [
  [112, 168], [225, 222], [330, 218], [318, 268], [262, 318], [218, 362],
  [214, 402], [320, 410], [442, 406], [458, 352], [466, 242], [560, 231],
  [670, 230], [686, 290], [692, 388], [780, 396], [858, 394], [872, 300],
  [878, 215],
];

// 타워 건설 지점 (발밑 기준)
const SPOTS = [
  [298, 162], [212, 318], [360, 345], [452, 448], [524, 188],
  [660, 188], [522, 295], [724, 345], [848, 345], [812, 448],
];
const SPOT_R = 30;

const ROLL_COST = 40;
const MAX_WAVE = 100;
const START_GOLD = 130;
const START_LIVES = 20;
const INTERMISSION = 9;
const MAX_LVL = 3;

// 주사위 눈(1~6) = 타워 종류. 눈이 높을수록 강력!
const TOWER_DEFS = {
  1: { name: '궁수 주사위', desc: '속사 레이저',        dmg: 8,  rate: 0.50, range: 150, laser: true,                 canAir: true,  color: '#9fd463', topper: 'laserMuzzle' },
  2: { name: '대포 주사위', desc: '쌍포 광역 포격',     dmg: 22, rate: 1.60, range: 135, proj: 'shell',      pspd: 300, splash: 60, canAir: false, color: '#e0862c', topper: 'muzzleFlash' },
  3: { name: '마법 주사위', desc: '자수정 마력탄',      dmg: 24, rate: 0.95, range: 165, proj: 'bolt',       pspd: 430, canAir: true,  color: '#b78bff', topper: 'bolt' },
  4: { name: '서리 주사위', desc: '사방 냉기 둔화',     dmg: 8,  rate: 0.80, range: 140, proj: 'frostShard', pspd: 400, slow: true, canAir: true, color: '#7fd4ff', topper: 'frostShard' },
  5: { name: '전격 주사위', desc: '연쇄 번개',          dmg: 16, rate: 1.10, range: 150, chain: true, canAir: true, color: '#ffe86b', topper: 'spark' },
  6: { name: '폭군 주사위', desc: '최강! 폭발 주사위 투척', dmg: 40, rate: 1.25, range: 175, proj: 'dieBomb', pspd: 340, splash: 55, canAir: false, color: '#ff5555', topper: 'dieBomb' },
};
const LVL_DMG   = [1, 1.6, 2.4];
const LVL_RANGE = [0, 12, 24];
const LVL_RATE  = [1, 0.92, 0.85];

const ENEMY_DEFS = {
  mite:   { name: '이끼 진드기',  hp: 32,  speed: 52, gold: 6,   dmg: 1, size: 42, sheet: 'miteWalk' },
  runner: { name: '잿빛 질주자',  hp: 22,  speed: 92, gold: 7,   dmg: 1, size: 52, sheet: 'runnerWalk' },
  husk:   { name: '석갑 허스크',  hp: 95,  speed: 36, gold: 12,  dmg: 2, size: 62, sheet: 'huskWalk' },
  boss:   { name: '주사위 폭군',  hp: 950, speed: 27, gold: 110, dmg: 5, size: 92, sheet: 'bossWalk' },
};

// ==================== 경로 계산 ====================

const segs = [];
let PATH_LEN = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const [ax, ay] = PATH[i], [bx, by] = PATH[i + 1];
  const len = Math.hypot(bx - ax, by - ay);
  segs.push({ ax, ay, bx, by, len, acc: PATH_LEN });
  PATH_LEN += len;
}
function posAt(d) {
  if (d <= 0) { const s = segs[0]; return { x: s.ax, y: s.ay, dx: (s.bx - s.ax) / s.len }; }
  for (const s of segs) {
    if (d <= s.acc + s.len) {
      const t = (d - s.acc) / s.len;
      return { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t, dx: (s.bx - s.ax) / s.len };
    }
  }
  const s = segs[segs.length - 1];
  return { x: s.bx, y: s.by, dx: (s.bx - s.ax) / s.len };
}

// ==================== 에셋 로딩 / 배경 잔상 제거 ====================

const BASE = (() => {
  const s = document.currentScript;
  if (s && s.src) return s.src.replace(/game\.js(\?.*)?$/, '');
  if (location.pathname.indexOf('/dicekeep') === 0) return '/dicekeep/';
  return '/dicekeep/';
})();
const SRCS = {
  map: BASE + 'map/battlefield.jpg', keyart: BASE + 'ui/title-keyart.jpg',
  gold: BASE + 'ui/gold.png', heart: BASE + 'ui/heart.png',
  d1: BASE + 'dice/dice-1.png', d2: BASE + 'dice/dice-2.png', d3: BASE + 'dice/dice-3.png',
  d4: BASE + 'dice/dice-4.png', d5: BASE + 'dice/dice-5.png', d6: BASE + 'dice/dice-6.png',
  t1: BASE + 'towers/die-1.png', t2: BASE + 'towers/die-2.png', t3: BASE + 'towers/die-3.png',
  t4: BASE + 'towers/die-4.png', t5: BASE + 'towers/die-5.png', t6: BASE + 'towers/die-6.png',
  miteWalk: BASE + 'enemies/mite-walk-2x2.png', runnerWalk: BASE + 'enemies/runner-walk-2x2.png',
  huskWalk: BASE + 'enemies/husk-walk-2x2.png', bossWalk: BASE + 'enemies/boss-walk-2x2.png',
  arrow: BASE + 'vfx/arrow.png', shell: BASE + 'vfx/shell.png', bolt: BASE + 'vfx/bolt.png',
  frostShard: BASE + 'vfx/frost-shard.png', spark: BASE + 'vfx/spark.png', impact: BASE + 'vfx/impact-2x2.png',
  laserBeam: BASE + 'vfx/laser-beam.png', laserMuzzle: BASE + 'vfx/laser-muzzle.png',
  muzzleFlash: BASE + 'vfx/muzzle-flash.png', cannonBlast: BASE + 'vfx/cannon-blast-2x2.png',
  arcaneBurst: BASE + 'vfx/arcane-burst-2x2.png', frostBurst: BASE + 'vfx/frost-burst-2x2.png',
  lightningArc: BASE + 'vfx/lightning-arc.png', dieBomb: BASE + 'vfx/die-bomb.png',
  dieExplode: BASE + 'vfx/die-explode-2x2.png',
};
if (window.DKCONTENT) {
  for (const m of DKCONTENT.maps) SRCS[m.key] = BASE + m.src;
  for (const f of Object.keys(DKCONTENT.towerSkins)) {
    for (const s of DKCONTENT.towerSkins[f]) SRCS[s.key] = BASE + s.src;
  }
  for (const b of DKCONTENT.bases) SRCS[b.sprite] = BASE + b.src;
  for (const b of DKCONTENT.bossBases) SRCS[b.sprite] = BASE + b.src;
}
const A = {};
let corsBlocked = false;

function loadImage(src) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => {
      console.warn('asset missing', src);
      const cv = document.createElement('canvas');
      cv.width = 8; cv.height = 8;
      res(cv);
    };
    img.src = src;
  });
}

// 테두리에서 연결된 저알파(잔상) 픽셀을 플러드필로 제거
function keyImageData(id, w, h) {
  const d = id.data;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const tryPush = (i) => {
    if (visited[i]) return;
    visited[i] = 1;
    if (d[i * 4 + 3] <= 150) { d[i * 4 + 3] = 0; queue[tail++] = i; }
  };
  for (let x = 0; x < w; x++) { tryPush(x); tryPush((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { tryPush(y * w); tryPush(y * w + w - 1); }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w, y = (i / w) | 0;
    if (x > 0) tryPush(i - 1);
    if (x < w - 1) tryPush(i + 1);
    if (y > 0) tryPush(i - w);
    if (y < h - 1) tryPush(i + w);
  }
}

function bbox(id, w, h, x0, y0, x1, y1) {
  const d = id.data;
  let minX = x1, minY = y1, maxX = x0, maxY = y0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (d[(y * w + x) * 4 + 3] > 28) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function toCanvas(img) {
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  cv.getContext('2d').drawImage(img, 0, 0);
  return cv;
}

function processSprite(img) {
  const cv = toCanvas(img);
  const g = cv.getContext('2d');
  try {
    const id = g.getImageData(0, 0, cv.width, cv.height);
    keyImageData(id, cv.width, cv.height);
    const b = bbox(id, cv.width, cv.height, 0, 0, cv.width, cv.height);
    g.putImageData(id, 0, 0);
    const out = document.createElement('canvas');
    out.width = b.w; out.height = b.h;
    out.getContext('2d').drawImage(cv, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return { cv: out, w: b.w, h: b.h };
  } catch (e) {
    corsBlocked = true;
    return { cv, w: cv.width, h: cv.height };
  }
}

function processSheet(img) {
  const cv = toCanvas(img);
  const g = cv.getContext('2d');
  const fw = img.width / 2, fh = img.height / 2;
  const cells = [[0, 0], [fw, 0], [0, fh], [fw, fh]];
  try {
    const id = g.getImageData(0, 0, cv.width, cv.height);
    keyImageData(id, cv.width, cv.height);
    g.putImageData(id, 0, 0);
    let u = null;
    for (const [cx, cy] of cells) {
      const b = bbox(id, cv.width, cv.height, cx, cy, cx + fw, cy + fh);
      const local = { x: b.x - cx, y: b.y - cy, w: b.w, h: b.h };
      if (!u) u = { x0: local.x, y0: local.y, x1: local.x + local.w, y1: local.y + local.h };
      else {
        u.x0 = Math.min(u.x0, local.x); u.y0 = Math.min(u.y0, local.y);
        u.x1 = Math.max(u.x1, local.x + local.w); u.y1 = Math.max(u.y1, local.y + local.h);
      }
    }
    const bw = u.x1 - u.x0, bh = u.y1 - u.y0;
    return cells.map(([cx, cy]) => {
      const out = document.createElement('canvas');
      out.width = bw; out.height = bh;
      out.getContext('2d').drawImage(cv, cx + u.x0, cy + u.y0, bw, bh, 0, 0, bw, bh);
      return { cv: out, w: bw, h: bh };
    });
  } catch (e) {
    corsBlocked = true;
    return cells.map(([cx, cy]) => {
      const out = document.createElement('canvas');
      out.width = fw; out.height = fh;
      out.getContext('2d').drawImage(cv, cx, cy, fw, fh, 0, 0, fw, fh);
      return { cv: out, w: fw, h: fh };
    });
  }
}

function thumbURL(sprite, size, fallbackSrc = '') {
  try {
    const s = Math.min(size / sprite.w, size / sprite.h);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sprite.w * s));
    out.height = Math.max(1, Math.round(sprite.h * s));
    out.getContext('2d').drawImage(sprite.cv, 0, 0, out.width, out.height);
    return out.toDataURL();
  } catch (e) {
    return fallbackSrc; // file:// 등으로 캔버스가 오염된 경우 원본 사용
  }
}

async function loadAssets(onProgress) {
  const keys = Object.keys(SRCS);
  const imgs = {};
  let done = 0;
  await Promise.all(keys.map(async k => {
    imgs[k] = await loadImage(SRCS[k]);
    onProgress(++done / keys.length * 0.6);
  }));
  const sheets = [
    'miteWalk', 'runnerWalk', 'huskWalk', 'bossWalk', 'impact',
    'cannonBlast', 'arcaneBurst', 'frostBurst', 'dieExplode',
  ];
  const raw = ['map', 'keyart'];
  if (window.DKCONTENT) for (const m of DKCONTENT.maps) raw.push(m.key);
  let pi = 0;
  for (const k of keys) {
    if (raw.includes(k)) A[k] = imgs[k];
    else if (sheets.includes(k)) A[k] = processSheet(imgs[k]);
    else A[k] = processSprite(imgs[k]);
    onProgress(0.6 + (++pi / keys.length) * 0.4);
    await new Promise(r => setTimeout(r, 0));
  }
  A.dice = [A.d1, A.d2, A.d3, A.d4, A.d5, A.d6];
}

// ==================== 주사위 타워 스프라이트 합성 ====================
// "주사위가 변신한 타워" — 돌 받침 위에 원소 기운을 두른 주사위

const towerSprites = {};
const TS_W = 116, TS_H = 126, TS_CX = 58, TS_BASE_Y = 104; // 받침 중심 위치
const TOWER_DRAW_H = 118;

function compositeFallback(f) {
  const def = TOWER_DEFS[f];
  const cv = document.createElement('canvas');
  cv.width = TS_W; cv.height = TS_H;
  const g = cv.getContext('2d');
  g.fillStyle = '#242019';
  g.beginPath(); g.ellipse(TS_CX, TS_BASE_Y + 6, 40, 16, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3b342a';
  g.fillRect(TS_CX - 40, TS_BASE_Y - 2, 80, 8);
  const grad = g.createRadialGradient(TS_CX - 8, TS_BASE_Y - 8, 4, TS_CX, TS_BASE_Y - 2, 42);
  grad.addColorStop(0, '#6a6152');
  grad.addColorStop(0.72, '#4c4438');
  grad.addColorStop(1, '#312b22');
  g.fillStyle = grad;
  g.beginPath(); g.ellipse(TS_CX, TS_BASE_Y - 2, 40, 16, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(15,12,9,0.85)';
  g.lineWidth = 2;
  g.stroke();
  g.save();
  g.strokeStyle = def.color;
  g.globalAlpha = 0.55;
  g.lineWidth = 2;
  g.setLineDash([7, 5]);
  g.beginPath(); g.ellipse(TS_CX, TS_BASE_Y - 2, 31, 12, 0, 0, Math.PI * 2); g.stroke();
  g.restore();
  const sp = A.dice[f - 1];
  const dw = 58, dh = dw * sp.h / sp.w;
  g.save();
  g.translate(TS_CX, TS_BASE_Y - 6);
  g.rotate(-0.05);
  g.shadowColor = def.color;
  g.shadowBlur = 22;
  g.drawImage(sp.cv, -dw / 2, -dh, dw, dh);
  g.shadowBlur = 10;
  g.drawImage(sp.cv, -dw / 2, -dh, dw, dh);
  g.restore();
  return { cv, w: TS_W, h: TS_H, cx: TS_CX, baseY: TS_BASE_Y };
}

function scaleTowerArt(art) {
  const s = TOWER_DRAW_H / art.h;
  const w = Math.max(1, Math.round(art.w * s));
  const h = TOWER_DRAW_H;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(art.cv, 0, 0, w, h);
  return { cv, w, h, cx: w / 2, baseY: h - 7, dedicated: true };
}

function buildTowerSprites() {
  for (let f = 1; f <= 6; f++) {
    const pack = [];
    const skins = (window.DKCONTENT && DKCONTENT.towerSkins[f]) || [];
    for (const s of skins) {
      const art = A[s.key];
      if (art && art.cv && art.h > 16) pack.push(scaleTowerArt(art));
    }
    if (!pack.length) {
      const art = A['t' + f];
      if (art && art.cv && art.h > 8) pack.push(scaleTowerArt(art));
    }
    if (!pack.length) pack.push(compositeFallback(f));
    towerSprites[f] = pack;
  }
}

function towerSpr(face, skin) {
  const pack = towerSprites[face] || [];
  if (!pack.length) return compositeFallback(face);
  return pack[((skin || 0) % pack.length + pack.length) % pack.length];
}

// ==================== 사운드 (WebAudio 신디사이저) ====================

let AC = null;
function audio() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
  if (S.muted) return;
  try {
    const ac = audio();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  } catch (e) { /* 무시 */ }
}
function noise(dur, vol = 0.2, lp = 1200) {
  if (S.muted) return;
  try {
    const ac = audio();
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = ac.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  } catch (e) { /* 무시 */ }
}
const SFX = {
  throwDie: () => noise(0.18, 0.15, 5000),
  bounce:   (v) => { noise(0.05, Math.min(0.3, 0.1 + v * 0.25), 2600); tone(140 + Math.random() * 60, 0.06, 'sine', Math.min(0.2, v * 0.18), -50); },
  settle:   () => { tone(660, 0.15, 'triangle', 0.2, 220); setTimeout(() => tone(990, 0.2, 'triangle', 0.16, 120), 100); },
  place:    () => { noise(0.12, 0.25, 500); tone(120, 0.15, 'sine', 0.2, -40); },
  merge:    () => { tone(520, 0.1, 'triangle', 0.18, 200); setTimeout(() => tone(780, 0.16, 'triangle', 0.18, 260), 90); },
  deny:     () => tone(180, 0.18, 'square', 0.1, -60),
  t1: () => tone(880, 0.06, 'triangle', 0.08, -300),
  t2: () => { noise(0.25, 0.3, 700); tone(70, 0.3, 'sine', 0.25, -30); },
  t3: () => tone(520, 0.2, 'sine', 0.12, 400),
  t4: () => tone(1300, 0.15, 'sine', 0.08, -500),
  t5: () => { tone(200, 0.12, 'sawtooth', 0.1, 1600); noise(0.08, 0.08, 5000); },
  t6: () => { noise(0.2, 0.25, 900); tone(90, 0.35, 'sine', 0.25, -50); },
  coin: () => { tone(920, 0.07, 'square', 0.06); setTimeout(() => tone(1240, 0.1, 'square', 0.06), 60); },
  leak: () => tone(300, 0.4, 'sawtooth', 0.15, -180),
  wave: () => { tone(440, 0.12, 'triangle', 0.15); setTimeout(() => tone(660, 0.2, 'triangle', 0.15), 130); },
  win:  () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.18), i * 160)),
  lose: () => [400, 340, 280, 200].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.12), i * 200)),
  sell: () => { tone(700, 0.08, 'square', 0.07); setTimeout(() => tone(500, 0.1, 'square', 0.07), 70); },
  dieHit: (v) => { noise(0.12, Math.min(0.35, 0.12 + v * 0.2), 1800); tone(220 + v * 80, 0.09, 'square', 0.12, -80); },
};

// ==================== 게임 상태 ====================

const S = {
  phase: 'loading', // loading | title | playing | over | win
  gold: START_GOLD, lives: START_LIVES, wave: 0,
  enemies: [], towers: [], projs: [], beams: [], fxs: [], texts: [],
  spawnQ: [], waveActive: false, autoT: 0, waveT: 0,
  heldDie: 0, selTower: null,
  mapKey: 'cMap1',
  speed: 1, muted: false,
  time: 0, hurtT: 0,
  mouse: { x: -100, y: -100 },
};

// ==================== 3D 회전 수학 (3x3 행렬, 행 우선) ====================

function m3id() { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; }
function m3mul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
function m3apply(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
function m3transpose(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
function m3axisAngle(ax, ay, az, th) {
  const c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  return [
    t * ax * ax + c,      t * ax * ay - s * az, t * ax * az + s * ay,
    t * ax * ay + s * az, t * ay * ay + c,      t * ay * az - s * ax,
    t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c,
  ];
}
// 누적 곱 오차 보정: 행 벡터 그람-슈미트 직교화
function m3orthonormalize(m) {
  let r0 = [m[0], m[1], m[2]];
  let l0 = Math.hypot(...r0) || 1;
  r0 = [r0[0] / l0, r0[1] / l0, r0[2] / l0];
  let r1 = [m[3], m[4], m[5]];
  const d01 = r0[0] * r1[0] + r0[1] * r1[1] + r0[2] * r1[2];
  r1 = [r1[0] - d01 * r0[0], r1[1] - d01 * r0[1], r1[2] - d01 * r0[2]];
  const l1 = Math.hypot(...r1) || 1;
  r1 = [r1[0] / l1, r1[1] / l1, r1[2] / l1];
  const r2 = [
    r0[1] * r1[2] - r0[2] * r1[1],
    r0[2] * r1[0] - r0[0] * r1[2],
    r0[0] * r1[1] - r0[1] * r1[0],
  ];
  return [...r0, ...r1, ...r2];
}

// 회전 행렬 → 축·각 (정착 애니메이션 보간용)
function m3toAxisAngle(m) {
  const tr = m[0] + m[4] + m[8];
  const ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  if (ang < 1e-4) return { axis: [0, 0, 1], ang: 0 };
  if (Math.PI - ang < 0.02) {
    // 180° 근처: 대각 성분에서 축 복원
    const ax = Math.sqrt(Math.max(0, (m[0] + 1) / 2));
    const ay = Math.sqrt(Math.max(0, (m[4] + 1) / 2)) * (m[1] >= 0 ? 1 : -1);
    const az = Math.sqrt(Math.max(0, (m[8] + 1) / 2)) * (m[2] >= 0 ? 1 : -1);
    const l = Math.hypot(ax, ay, az) || 1;
    return { axis: [ax / l, ay / l, az / l], ang };
  }
  const s = 2 * Math.sin(ang);
  return { axis: [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s], ang };
}

// 큐브 면 정의 (마주 보는 눈의 합 = 7, n: 법선, u/v: 텍스처 축)
const FACES = [
  { val: 1, n: [0, 0, 1],  u: [1, 0, 0],  v: [0, 1, 0] },
  { val: 6, n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { val: 3, n: [1, 0, 0],  u: [0, 0, -1], v: [0, 1, 0] },
  { val: 4, n: [-1, 0, 0], u: [0, 0, 1],  v: [0, 1, 0] },
  { val: 2, n: [0, 1, 0],  u: [1, 0, 0],  v: [0, 0, -1] },
  { val: 5, n: [0, -1, 0], u: [1, 0, 0],  v: [0, 0, 1] },
];
const LIGHT = [-0.33, -0.5, 0.8]; // 좌상단 광원

// 특정 눈이 위(화면 쪽)를 향하는 기본 자세
function faceTopR(val) {
  const face = FACES.find(f => f.val === val);
  const n = face.n;
  const cx = n[1] * 1 - n[2] * 0, cy = n[2] * 0 - n[0] * 1, cz = 0; // n × z
  const l = Math.hypot(cx, cy, cz);
  const dot = n[2];
  if (l < 1e-6) return dot > 0 ? m3id() : m3axisAngle(1, 0, 0, Math.PI);
  return m3axisAngle(cx / l, cy / l, cz / l, Math.acos(Math.max(-1, Math.min(1, dot))));
}
const TRAY_TILT = m3mul(m3axisAngle(1, 0, 0, 0.45), m3axisAngle(0, 1, 0, -0.38));

// 텍스처 삼각형 매핑 (아핀)
function texTri(g, img, s0x, s0y, s1x, s1y, s2x, s2y, d0, d1, d2) {
  const den = s0x * (s1y - s2y) + s1x * (s2y - s0y) + s2x * (s0y - s1y);
  if (Math.abs(den) < 1e-8) return;
  g.save();
  g.beginPath();
  g.moveTo(d0[0], d0[1]); g.lineTo(d1[0], d1[1]); g.lineTo(d2[0], d2[1]);
  g.closePath();
  g.clip();
  const a = (d0[0] * (s1y - s2y) + d1[0] * (s2y - s0y) + d2[0] * (s0y - s1y)) / den;
  const b = (d0[1] * (s1y - s2y) + d1[1] * (s2y - s0y) + d2[1] * (s0y - s1y)) / den;
  const c = (d0[0] * (s2x - s1x) + d1[0] * (s0x - s2x) + d2[0] * (s1x - s0x)) / den;
  const d = (d0[1] * (s2x - s1x) + d1[1] * (s0x - s2x) + d2[1] * (s1x - s0x)) / den;
  const e = d0[0] - a * s0x - c * s0y;
  const f = d0[1] - b * s0x - d * s0y;
  g.transform(a, b, c, d, e, f);
  g.drawImage(img, 0, 0);
  g.restore();
}

const TEX = 128;
const faceTex = {};

// dice-3.png 원본은 3/4 시점 사진이라 눈이 한쪽으로 쏠려 보인다.
// → 정면 사진인 1눈 텍스처에서 눈(pip)을 복제해 정면 3눈 면을 합성한다.
function fixDice3() {
  const base = document.createElement('canvas');
  base.width = TEX; base.height = TEX;
  const g = base.getContext('2d');
  g.fillStyle = '#e4d9bc';
  g.fillRect(0, 0, TEX, TEX);
  g.drawImage(A.dice[0].cv, 0, 0, TEX, TEX); // 중앙 눈 1개 포함
  // 중앙 눈을 원형으로 떼어내 스탬프 제작
  const pr = 16;
  const pip = document.createElement('canvas');
  pip.width = pr * 2; pip.height = pr * 2;
  const pg = pip.getContext('2d');
  pg.drawImage(base, TEX / 2 - pr, TEX / 2 - pr, pr * 2, pr * 2, 0, 0, pr * 2, pr * 2);
  pg.globalCompositeOperation = 'destination-in';
  pg.beginPath(); pg.arc(pr, pr, pr, 0, Math.PI * 2); pg.fill();
  // 대각선(좌상·우하)에 추가 → 3눈 완성
  g.drawImage(pip, TEX * 0.27 - pr, TEX * 0.27 - pr);
  g.drawImage(pip, TEX * 0.73 - pr, TEX * 0.73 - pr);
  A.dice[2] = { cv: base, w: TEX, h: TEX };
}
function buildFaceTex() {
  for (let f = 1; f <= 6; f++) {
    const cv = document.createElement('canvas');
    cv.width = TEX; cv.height = TEX;
    const g = cv.getContext('2d');
    g.fillStyle = '#e4d9bc'; // 모서리 투명 부분을 상아색으로 채움
    g.fillRect(0, 0, TEX, TEX);
    g.drawImage(A.dice[f - 1].cv, 0, 0, TEX, TEX);
    faceTex[f] = cv;
  }
}

// 3D 주사위 렌더링 (g: 대상 컨텍스트, cx,cy: 중심, size: 반 변 길이 px)
function drawCube(g, cx, cy, size, R, glowColor = null, glowStr = 0) {
  if (glowColor && glowStr > 0) {
    const gr = g.createRadialGradient(cx, cy, size * 0.3, cx, cy, size * 2.4);
    gr.addColorStop(0, glowColor + Math.round(glowStr * 110).toString(16).padStart(2, '0'));
    gr.addColorStop(1, glowColor + '00');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, size * 2.4, 0, Math.PI * 2); g.fill();
  }
  // 약한 원근: 계수가 작으면 큐브가 찌그러져 보인다
  const persp = 10;
  const P = v => {
    const w = persp / (persp - v[2]);
    return [cx + v[0] * size * w, cy + v[1] * size * w];
  };
  for (const face of FACES) {
    const n = m3apply(R, face.n);
    if (n[2] <= 0.02) continue; // 뒷면 컬링
    const u = m3apply(R, face.u), v = m3apply(R, face.v);
    const A0 = P([n[0] - u[0] - v[0], n[1] - u[1] - v[1], n[2] - u[2] - v[2]]);
    const B0 = P([n[0] + u[0] - v[0], n[1] + u[1] - v[1], n[2] + u[2] - v[2]]);
    const C0 = P([n[0] + u[0] + v[0], n[1] + u[1] + v[1], n[2] + u[2] + v[2]]);
    const D0 = P([n[0] - u[0] + v[0], n[1] - u[1] + v[1], n[2] - u[2] + v[2]]);
    const quad = () => {
      g.beginPath();
      g.moveTo(A0[0], A0[1]); g.lineTo(B0[0], B0[1]);
      g.lineTo(C0[0], C0[1]); g.lineTo(D0[0], D0[1]);
      g.closePath();
    };
    const tex = faceTex[face.val];
    texTri(g, tex, 0, 0, TEX, 0, TEX, TEX, A0, B0, C0);
    texTri(g, tex, 0, 0, TEX, TEX, 0, TEX, A0, C0, D0);
    // 면별 조명
    const br = 0.58 + 0.42 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    quad();
    g.fillStyle = `rgba(28,18,8,${Math.max(0, (1 - br) * 0.8)})`;
    g.fill();
    quad();
    g.strokeStyle = 'rgba(58,44,26,0.45)';
    g.lineWidth = 1;
    g.stroke();
  }
}

// ==================== 물리 주사위 ====================

const TRAY = { x: 86, y: 526 };
const DIE = {
  state: 'tray', // tray | grab | throw | settle | fly
  x: TRAY.x, y: TRAY.y, z: 0,
  vx: 0, vy: 0, vz: 0,
  R: m3mul(TRAY_TILT, faceTopR(6)), w: [0, 0, 0], // 자세 행렬 + 각속도 벡터
  face: 6, final: 6, forceFinal: 0,
  settleT: 0, flyT: 0,
  settleFrom: null, settleAxis: [0, 0, 1], settleAng: 0,
  history: [],
  grabDX: 0, grabDY: 0,
  hits: [], throwSpd: 0,
};

// 버튼용 빠른 굴림: HUD 슬롯(?박스) 안에서 3D 큐브가 짧게 회전 후 결과 확정
const SLOT = {
  active: false, t: 0, t2: 0, phase: 0,
  R: m3id(), w: [0, 0, 0], final: 1,
  from: null, axis: [0, 0, 1], ang: 0, sndT: 0,
};

function canRoll() {
  return S.phase === 'playing' && DIE.state === 'tray' && !SLOT.active && !S.heldDie && S.gold >= ROLL_COST;
}

function throwDie(vx, vy) {
  S.gold -= ROLL_COST;
  DIE.state = 'throw';
  DIE.vx = vx; DIE.vy = vy;
  const spd = Math.hypot(vx, vy);
  DIE.throwSpd = spd;
  DIE.hits = [];
  DIE.vz = Math.min(720, 220 + spd * 0.42);
  DIE.z = Math.max(2, DIE.z);
  // 진행 방향으로 구르는 회전 + 무작위 비틀림 (결과는 물리가 결정)
  const roll = Math.min(26, 8 + spd / 45);
  DIE.w = [
    (spd > 1 ? -vy / spd : 0) * roll + (Math.random() - 0.5) * 6,
    (spd > 1 ? vx / spd : 0) * roll + (Math.random() - 0.5) * 6,
    (Math.random() - 0.5) * 9,
  ];
  DIE.final = 0;
  SFX.throwDie();
  syncUI();
}

function rollByButton() {
  if (!canRoll()) return;
  S.gold -= ROLL_COST;
  SLOT.active = true;
  SLOT.t = 0; SLOT.t2 = 0; SLOT.phase = 0; SLOT.sndT = 0;
  SLOT.final = 1 + Math.floor(Math.random() * 6);
  SLOT.R = m3mul(m3axisAngle(Math.random(), Math.random(), Math.random() * 0.5 + 0.1, Math.random() * 6), TRAY_TILT);
  SLOT.w = [
    (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 16),
    (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 16),
    (Math.random() - 0.5) * 24,
  ];
  SFX.throwDie();
  syncUI();
}

function updateSlot(dt) {
  if (!SLOT.active) return;
  SLOT.t += dt;
  if (SLOT.phase === 0) {
    // 빠른 회전 (덜그럭 소리)
    const wl = Math.hypot(...SLOT.w);
    if (wl > 1e-4) {
      SLOT.R = m3orthonormalize(m3mul(m3axisAngle(SLOT.w[0] / wl, SLOT.w[1] / wl, SLOT.w[2] / wl, wl * dt), SLOT.R));
    }
    SLOT.w = SLOT.w.map(v => v * Math.pow(0.3, dt));
    SLOT.sndT -= dt;
    if (SLOT.sndT <= 0) { SFX.bounce(0.3); SLOT.sndT = 0.11; }
    if (SLOT.t >= 0.55) {
      SLOT.phase = 1;
      if (DIE.forceFinal) { SLOT.final = DIE.forceFinal; DIE.forceFinal = 0; } // 테스트 훅
      const Rt = faceTopR(SLOT.final);
      const aa = m3toAxisAngle(m3mul(Rt, m3transpose(SLOT.R)));
      SLOT.from = SLOT.R; SLOT.axis = aa.axis; SLOT.ang = aa.ang;
      SFX.settle();
    }
  } else {
    SLOT.t2 += dt;
    const p = Math.min(1, SLOT.t2 / 0.28);
    const o = 1.35;
    const ease = 1 + (o + 1) * Math.pow(p - 1, 3) + o * Math.pow(p - 1, 2);
    if (SLOT.ang > 1e-4) {
      SLOT.R = m3mul(m3axisAngle(SLOT.axis[0], SLOT.axis[1], SLOT.axis[2], SLOT.ang * ease), SLOT.from);
    }
    if (SLOT.t2 > 0.45) {
      SLOT.active = false;
      S.heldDie = SLOT.final;
      SFX.coin();
      diceSlot.classList.add('pop');
      setTimeout(() => diceSlot.classList.remove('pop'), 350);
      syncUI();
    }
  }
}

function drawSlot() {
  if (!SLOT.active) {
    if (!slotCanvas.classList.contains('hidden')) slotCanvas.classList.add('hidden');
    return;
  }
  slotCanvas.classList.remove('hidden');
  sctx.clearRect(0, 0, slotCanvas.width, slotCanvas.height);
  const bounce = SLOT.phase === 0 ? Math.abs(Math.sin(SLOT.t * 16)) * 4 : 0;
  drawCube(sctx, 37, 40 - bounce, 17, SLOT.R);
}

// 현재 자세에서 화면(위)을 향한 눈
function topFace(R) {
  let best = -2, bf = 1;
  for (const f of FACES) {
    const n = m3apply(R, f.n);
    if (n[2] > best) { best = n[2]; bf = f.val; }
  }
  return bf;
}

// 자세 행렬에 각속도 적분 (+ 오차 보정)
function integrateRot(dt) {
  const wl = Math.hypot(DIE.w[0], DIE.w[1], DIE.w[2]);
  if (wl > 1e-4) {
    DIE.R = m3mul(m3axisAngle(DIE.w[0] / wl, DIE.w[1] / wl, DIE.w[2] / wl, wl * dt), DIE.R);
    DIE.R = m3orthonormalize(DIE.R);
  }
}

// 정착 목표 자세: 최종 눈이 정면을 보고, 화면상 각도는 90° 단위로 정렬
function computeSettleTarget(finalVal) {
  const face = FACES.find(f => f.val === finalVal);
  const n = m3apply(DIE.R, face.n);
  const cx = n[1], cy = -n[0]; // n × z
  const cl = Math.hypot(cx, cy);
  const dot = Math.max(-1, Math.min(1, n[2]));
  let R1 = DIE.R;
  if (cl > 1e-5) R1 = m3mul(m3axisAngle(cx / cl, cy / cl, 0, Math.acos(dot)), DIE.R);
  else if (dot < 0) R1 = m3mul(m3axisAngle(1, 0, 0, Math.PI), DIE.R);
  // 면의 u축을 화면상 90° 격자에 스냅
  const uw = m3apply(R1, face.u);
  const th = Math.atan2(uw[1], uw[0]);
  const snap = Math.round(th / (Math.PI / 2)) * (Math.PI / 2) - th;
  const Rt = m3mul(m3axisAngle(0, 0, 1, snap), R1);
  // 시작 → 목표 상대 회전을 축·각으로
  const delta = m3mul(Rt, m3transpose(DIE.R));
  const aa = m3toAxisAngle(delta);
  DIE.settleFrom = DIE.R;
  DIE.settleAxis = aa.axis;
  DIE.settleAng = aa.ang;
}

function strikeEnemiesWithDie() {
  if (!S.enemies.length) return;
  const spd = Math.hypot(DIE.vx, DIE.vy);
  if (spd < 80 && DIE.z < 4) return;
  const dieX = DIE.x;
  const dieY = DIE.y - DIE.z * 0.62;
  const dieR = 26 + Math.min(22, DIE.z * 0.06);
  for (const e of S.enemies) {
    if (e.dead || DIE.hits.includes(e)) continue;
    const p = posAt(e.dist);
    const hitR = dieR + e.def.size * 0.42;
    if (Math.hypot(dieX - p.x, dieY - p.y) > hitR) continue;
    const dmg = Math.max(12, Math.min(220, Math.round(10 + spd * 0.14)));
    DIE.hits.push(e);
    damageEnemy(e, dmg);
    e.dist = Math.max(0, e.dist - (14 + spd * 0.018));
    e.slowT = Math.max(e.slowT, 0.35);
    e.slowPct = Math.max(e.slowPct || 0, 0.25);
    S.texts.push({ str: dmg + '!', x: p.x, y: p.y - e.def.size - 6, t: 0, color: '#ffe27a', big: true });
    S.fxs.push({ kind: 'impact', x: p.x, y: p.y - 10, t: 0, dur: 0.28, size: 36 + Math.min(50, spd * 0.04) });
    SFX.dieHit(Math.min(1.4, spd / 900));
    DIE.vx *= 0.68; DIE.vy *= 0.68;
    DIE.vz = Math.max(DIE.vz, 140);
    DIE.w[0] += (Math.random() - 0.5) * 10;
    DIE.w[1] += (Math.random() - 0.5) * 10;
    break;
  }
}

function updateDie(dt) {
  if (S.phase !== 'playing') return;

  if (DIE.state === 'grab') {
    // 잡고 흔들 때 관성 회전
    integrateRot(dt);
    DIE.w = DIE.w.map(v => v * Math.pow(0.05, dt));
  } else if (DIE.state === 'throw') {
    // 이동 + 마찰
    DIE.x += DIE.vx * dt;
    DIE.y += DIE.vy * dt;
    const spd = Math.hypot(DIE.vx, DIE.vy);
    const fr = (DIE.z > 1 ? 40 : 300) * dt; // 공중에선 덜 감속
    const nspd = Math.max(0, spd - fr);
    if (spd > 0) { DIE.vx *= nspd / spd; DIE.vy *= nspd / spd; }

    // 높이(바운스)
    DIE.vz -= 1650 * dt;
    DIE.z += DIE.vz * dt;
    if (DIE.z <= 0) {
      DIE.z = 0;
      if (DIE.vz < -90) {
        const impact = Math.min(1, -DIE.vz / 700);
        DIE.vz = -DIE.vz * 0.52;
        DIE.vx *= 0.82; DIE.vy *= 0.82;
        // 착지 충격: 회전이 흐트러진다
        DIE.w[0] = DIE.w[0] * 0.7 + (Math.random() - 0.5) * 14 * impact;
        DIE.w[1] = DIE.w[1] * 0.7 + (Math.random() - 0.5) * 14 * impact;
        DIE.w[2] = DIE.w[2] * 0.7 + (Math.random() - 0.5) * 8 * impact;
        SFX.bounce(impact);
        for (let i = 0; i < 4 + impact * 5; i++) {
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14 * (0.5 + impact);
          S.fxs.push({ kind: 'dust', x: DIE.x + Math.cos(a) * r * 0.4, y: DIE.y + Math.sin(a) * r * 0.2,
                       vx: Math.cos(a) * (26 + impact * 60), vy: Math.sin(a) * (13 + impact * 26) - 12,
                       t: 0, dur: 0.35 + Math.random() * 0.25, size: 3 + Math.random() * 4 });
        }
      } else DIE.vz = 0;
    }

    // 벽 반사
    if (DIE.x < 34) { DIE.x = 34; DIE.vx = Math.abs(DIE.vx) * 0.6; SFX.bounce(0.4); }
    if (DIE.x > W - 34) { DIE.x = W - 34; DIE.vx = -Math.abs(DIE.vx) * 0.6; SFX.bounce(0.4); }
    if (DIE.y < 58) { DIE.y = 58; DIE.vy = Math.abs(DIE.vy) * 0.6; SFX.bounce(0.4); }
    if (DIE.y > H - 30) { DIE.y = H - 30; DIE.vy = -Math.abs(DIE.vy) * 0.6; SFX.bounce(0.4); }

    // 3D 회전: 공중에선 자유 회전, 바닥에선 진행 방향으로 구름
    if (DIE.z <= 0.01 && spd > 30) {
      const rollRate = Math.min(24, spd / 22);
      const tx = -DIE.vy / spd * rollRate, ty = DIE.vx / spd * rollRate;
      const k = 1 - Math.pow(0.03, dt); // 구름 회전으로 빠르게 수렴
      DIE.w[0] += (tx - DIE.w[0]) * k;
      DIE.w[1] += (ty - DIE.w[1]) * k;
      DIE.w[2] *= Math.pow(0.2, dt);
    } else {
      DIE.w = DIE.w.map(v => v * Math.pow(0.8, dt)); // 공기 감쇠
    }
    integrateRot(dt);

    strikeEnemiesWithDie();

    // 정지 판정 → 위를 향한 면이 결과
    if (spd < 26 && DIE.z <= 0 && Math.abs(DIE.vz) < 40) {
      DIE.final = DIE.forceFinal || topFace(DIE.R);
      DIE.forceFinal = 0;
      computeSettleTarget(DIE.final);
      DIE.state = 'settle';
      DIE.settleT = 0;
      DIE.face = DIE.final;
      DIE.w = [0, 0, 0];
      SFX.settle();
      S.texts.push({ str: DIE.final + '!', x: DIE.x, y: DIE.y - 44, t: 0, color: '#ffe9a0', big: true });
      S.fxs.push({ kind: 'ring', x: DIE.x, y: DIE.y - 14, t: 0, dur: 0.5, size: 60, color: TOWER_DEFS[DIE.final].color });
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * 2 * i / 10 + Math.random() * 0.4;
        S.fxs.push({ kind: 'sparkle', x: DIE.x, y: DIE.y - 16,
                     vx: Math.cos(a) * (60 + Math.random() * 70), vy: Math.sin(a) * (40 + Math.random() * 50) - 40,
                     t: 0, dur: 0.55, size: 2.5 + Math.random() * 2 });
      }
    }
  } else if (DIE.state === 'settle') {
    DIE.settleT += dt;
    // 마지막 기울어짐이 탄성 있게 바로 서는 연출 (살짝 오버슈트)
    const p = Math.min(1, DIE.settleT / 0.42);
    const o = 1.35;
    const ease = 1 + (o + 1) * Math.pow(p - 1, 3) + o * Math.pow(p - 1, 2);
    if (DIE.settleAng > 1e-4) {
      DIE.R = m3mul(
        m3axisAngle(DIE.settleAxis[0], DIE.settleAxis[1], DIE.settleAxis[2], DIE.settleAng * ease),
        DIE.settleFrom
      );
    }
    if (DIE.settleT > 0.8) {
      DIE.state = 'fly';
      DIE.flyT = 0;
      DIE.fromX = DIE.x; DIE.fromY = DIE.y - DIE.z;
    }
  } else if (DIE.state === 'fly') {
    // 획득 연출: 트레이로 날아가며 흡수
    DIE.flyT += dt;
    const p = Math.min(1, DIE.flyT / 0.38);
    const e = 1 - Math.pow(1 - p, 3);
    DIE.x = DIE.fromX + (TRAY.x - DIE.fromX) * e;
    DIE.y = DIE.fromY + (TRAY.y - DIE.fromY) * e;
    DIE.z = 0;
    if (p >= 1) {
      S.heldDie = DIE.final;
      DIE.state = 'tray';
      DIE.face = DIE.final;
      DIE.R = m3mul(TRAY_TILT, faceTopR(DIE.face));
      SFX.coin();
      diceSlot.classList.add('pop');
      setTimeout(() => diceSlot.classList.remove('pop'), 350);
      syncUI();
    }
  }
}

function drawDie() {
  if (S.phase !== 'playing') return;
  const hidden = S.heldDie > 0 && DIE.state === 'tray';

  // 트레이 (항상 표시)
  ctx.save();
  ctx.translate(TRAY.x, TRAY.y + 12);
  ctx.scale(1, 0.45);
  ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,14,8,0.55)';
  ctx.fill();
  ctx.strokeStyle = canRoll() ? `rgba(232,182,74,${0.5 + 0.3 * Math.sin(S.time * 4)})` : 'rgba(120,100,70,0.4)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
  if (hidden) return;

  const grabbing = DIE.state === 'grab';
  const size = (DIE.state === 'fly' ? 24 * (1 - Math.min(1, DIE.flyT / 0.38) * 0.4) : 24)
    * (1 + DIE.z / 300) * (grabbing ? 1.14 : 1);
  const gy = DIE.y - DIE.z * 0.62 - (grabbing ? 10 : 0);

  // 그림자
  if (DIE.state !== 'fly') {
    const shScale = Math.max(0.35, 1 - DIE.z / 380);
    ctx.save();
    ctx.translate(DIE.x, DIE.y + 10);
    ctx.scale(1, 0.4);
    ctx.beginPath(); ctx.arc(0, 0, 24 * shScale, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${0.4 * shScale})`;
    ctx.fill();
    ctx.restore();
  }

  // 본체: 텍스처 입힌 3D 큐브
  let glowColor = null, glowStr = 0;
  if (DIE.state === 'settle') {
    glowColor = TOWER_DEFS[DIE.final].color;
    glowStr = 0.5 + 0.5 * Math.sin(DIE.settleT * 18);
  } else if (grabbing) {
    glowColor = '#ffe9a0';
    glowStr = 0.55;
  }
  drawCube(ctx, DIE.x, gy, size, DIE.R, glowColor, glowStr);

  // 트레이 대기 중 안내
  if (DIE.state === 'tray' && canRoll()) {
    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,233,160,${0.6 + 0.3 * Math.sin(S.time * 4)})`;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText('잡아서 던지기!', TRAY.x, TRAY.y - 38);
    ctx.fillText('잡아서 던지기!', TRAY.x, TRAY.y - 38);
    ctx.restore();
  }
}

// ==================== 웨이브 구성 ====================

function buildWave(w) {
  const q = [];
  let t = 0.45;
  const hpMult = Math.pow(1.085, w - 1);
  const goldMult = 1 + w * 0.035;
  const C = window.DKCONTENT;
  const add = (type, extra) => { q.push(Object.assign({ type, t, hpMult, goldMult }, extra || {})); };
  const n = 7 + Math.floor(w * 1.15);
  const gap = Math.max(0.38, 0.88 - w * 0.006);
  const unlockAir = w >= 6;
  const unlockBurrow = w >= 10;
  for (let i = 0; i < n; i++) {
    let pool = ['slime', 'shroom', 'pig', 'chicken', 'goblin', 'sheep', 'penguin'];
    if (w >= 4) pool = pool.concat(['cactus', 'fox']);
    if (unlockAir) pool = pool.concat(['bee', 'balloon', 'bat', 'owl', 'parrot']);
    if (unlockBurrow) pool = pool.concat(['mole', 'worm', 'arma', 'beetle', 'crab']);
    const type = pool[(i * 3 + w * 5) % pool.length];
    const sid = ((w - 1) * 11 + i * 17) % 500;
    const sp = C && C.species[sid];
    add(type, sp ? { speciesId: sid, name: sp.name, hue: sp.hue, hpMult: hpMult * sp.hpM, goldMult } : null);
    t += gap * (type === 'bat' || type === 'bee' ? 0.72 : 1);
  }
  if (w % 5 === 0) {
    t += 1.2;
    const bid = Math.min(99, Math.floor(w / 5) - 1);
    const boss = C && C.bosses[bid];
    const btype = C ? C.bossBases[bid % C.bossBases.length].id : 'boss';
    add(btype, boss ? { name: boss.name, hue: boss.hue, hpMult: hpMult * boss.hpM, isBoss: true } : { isBoss: true });
  }
  return q;
}

function startWave() {
  if (S.waveActive || S.wave >= MAX_WAVE || S.phase !== 'playing') return;
  S.wave++;
  S.mapKey = (window.DKCONTENT && DKCONTENT.maps[(S.wave - 1) % DKCONTENT.maps.length].key) || 'map';
  S.spawnQ = buildWave(S.wave);
  S.waveActive = true;
  S.waveT = 0;
  S.autoT = 0;
  SFX.wave();
  syncUI();
}

// ==================== 전투 로직 ====================

function spawnEnemy(item) {
  const C = window.DKCONTENT;
  let def = ENEMY_DEFS[item.type];
  let move = 'ground', sprite = null, hue = item.hue || 0, size, name;
  if (C) {
    const base = C.bases.find(b => b.id === item.type) || C.bossBases.find(b => b.id === item.type);
    if (base) {
      def = base;
      move = base.move;
      sprite = base.sprite;
      size = base.size;
      name = item.name || base.name;
    }
  }
  if (!def) def = ENEMY_DEFS.mite;
  S.enemies.push({
    type: item.type, def,
    hp: def.hp * (item.hpMult || 1), max: def.hp * (item.hpMult || 1),
    gold: Math.round(def.gold * (item.goldMult || 1)),
    dist: 0, slowT: 0, slowPct: 0,
    animT: Math.random(), face: 1, dead: false,
    move, sprite, hue, name: name || def.name,
    hidden: false, burrowT: Math.random() * 2,
    isBoss: !!item.isBoss,
  });
}

function damageEnemy(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg;
  if (e.hp <= 0) {
    e.dead = true;
    S.gold += e.gold;
    const p = posAt(e.dist);
    S.texts.push({ str: '+' + e.gold, x: p.x, y: p.y - e.def.size, t: 0, color: '#ffd870' });
    if (e.isBoss || e.type === 'boss') { S.fxs.push({ kind: 'impact', x: p.x, y: p.y - 20, t: 0, dur: 0.45, size: 150 }); noise(0.4, 0.3, 500); }
    SFX.coin();
    syncUI();
  }
}

function towerAt(spotIdx) {
  return S.towers.find(t => t.spot === spotIdx) || null;
}

const towerDmg   = t => t.def.dmg * LVL_DMG[t.lvl - 1];
const towerRange = t => t.def.range + LVL_RANGE[t.lvl - 1];
const towerRate  = t => t.def.rate * LVL_RATE[t.lvl - 1];

function towerFire(t, dt) {
  t.cd -= dt;
  if (t.cd > 0) return;
  const range = towerRange(t);
  let best = null;
  for (const e of S.enemies) {
    if (e.dead) continue;
    if (e.hidden) continue;
    if (e.move === 'air' && !t.def.canAir) continue;
    const p = posAt(e.dist);
    const d = Math.hypot(p.x - t.x, p.y - (t.y - 30) - (e.move === 'air' ? 42 : 0));
    if (d <= range && (!best || e.dist > best.dist)) best = e;
  }
  if (!best) return;
  t.cd = towerRate(t);
  t.kick = 1;
  const dmg = towerDmg(t);
  const from = { x: t.x, y: t.y - 64 };

  if (t.def.laser) {
    const tp = posAt(best.dist);
    const to = { x: tp.x, y: tp.y - best.def.size * 0.45 - (best.move === 'air' ? 42 : 0) };
    damageEnemy(best, dmg);
    S.beams.push({ pts: [from, to], t: 0, dur: 0.11, style: 'laser' });
    S.fxs.push({ kind: 'laserMuzzle', x: from.x, y: from.y, t: 0, dur: 0.1, size: 28 });
    SFX.t1();
  } else if (t.def.chain) {
    const maxChain = 2 + t.lvl;
    const hitList = [best];
    let cur = best;
    while (hitList.length < maxChain) {
      const cp = posAt(cur.dist);
      let next = null, nd = 115;
      for (const e of S.enemies) {
        if (e.dead || e.hidden || hitList.includes(e)) continue;
        if (e.move === 'air' && !t.def.canAir) continue;
        const p = posAt(e.dist);
        const d = Math.hypot(p.x - cp.x, p.y - cp.y);
        if (d < nd) { nd = d; next = e; }
      }
      if (!next) break;
      hitList.push(next); cur = next;
    }
    const pts = [from];
    let dd = dmg;
    for (const e of hitList) {
      const p = posAt(e.dist);
      pts.push({ x: p.x, y: p.y - e.def.size * 0.45 });
      damageEnemy(e, dd);
      dd *= 0.75;
      S.fxs.push({ kind: 'spark', x: p.x, y: p.y - e.def.size * 0.4, t: 0, dur: 0.16, size: 34 });
    }
    S.beams.push({ pts, t: 0, dur: 0.16, style: 'lightning' });
    SFX.t5();
  } else {
    S.projs.push({
      kind: t.def.proj, x: from.x, y: from.y, tgt: best,
      spd: t.def.pspd, dmg, splash: t.def.splash || 0,
      slow: t.def.slow ? { pct: 0.26 + 0.06 * t.lvl, dur: 1.8 } : null,
      rot: 0, spin: 0,
    });
    if (t.face === 2) {
      S.fxs.push({ kind: 'muzzleFlash', x: from.x, y: from.y, t: 0, dur: 0.12, size: 38 });
    }
    SFX['t' + t.face]();
  }
}

function sheetHit(kind, x, y, size, dur) {
  S.fxs.push({ kind, x, y, t: 0, dur: dur || 0.32, size });
}

function projHit(p) {
  const tp = posAt(p.tgt.dist);
  const hx = tp.x, hy = tp.y - p.tgt.def.size * 0.4;
  if (p.splash) {
    for (const e of S.enemies) {
      if (e.dead) continue;
      const ep = posAt(e.dist);
      if (Math.hypot(ep.x - hx, ep.y - hy + e.def.size * 0.4) <= p.splash) damageEnemy(e, p.dmg);
    }
    if (p.kind === 'dieBomb' || p.kind === 'die6') {
      sheetHit('dieExplode', hx, hy, p.splash * 2.2, 0.4);
    } else {
      sheetHit('cannonBlast', hx, hy, p.splash * 2, 0.34);
    }
  } else {
    damageEnemy(p.tgt, p.dmg);
    if (p.slow && !p.tgt.dead) {
      p.tgt.slowT = Math.max(p.tgt.slowT, p.slow.dur);
      p.tgt.slowPct = Math.max(p.tgt.slowPct, p.slow.pct);
      sheetHit('frostBurst', hx, hy, 48, 0.3);
    } else if (p.kind === 'bolt') {
      sheetHit('arcaneBurst', hx, hy, 46, 0.3);
    } else {
      S.fxs.push({ kind: 'hit', x: hx, y: hy, t: 0, dur: 0.15, size: 16 });
    }
  }
}

// ==================== 업데이트 ====================

function update(dt) {
  S.time += dt;
  if (S.hurtT > 0) S.hurtT -= dt;
  if (S.phase !== 'playing') return;

  // 스폰
  if (S.waveActive) {
    S.waveT += dt;
    while (S.spawnQ.length && S.spawnQ[0].t <= S.waveT) spawnEnemy(S.spawnQ.shift());
  }

  // 적 이동
  for (const e of S.enemies) {
    if (e.dead) continue;
    let sp = e.def.speed;
    if (e.slowT > 0) { e.slowT -= dt; sp *= (1 - e.slowPct); }
    e.dist += sp * dt;
    e.animT += dt * (sp / 38);
    if (e.move === 'burrow') {
      e.burrowT += dt;
      e.hidden = (e.burrowT % 2.6) < 1.15;
    } else e.hidden = false;
    const p = posAt(e.dist);
    if (Math.abs(p.dx) > 0.3) e.face = Math.sign(p.dx);
    if (e.dist >= PATH_LEN) {
      e.dead = true;
      S.lives -= e.def.dmg;
      S.hurtT = 0.5;
      SFX.leak();
      S.fxs.push({ kind: 'impact', x: 878, y: 200, t: 0, dur: 0.3, size: 80 });
      syncUI();
      if (S.lives <= 0) { S.lives = 0; gameEnd(false); return; }
    }
  }
  S.enemies = S.enemies.filter(e => !e.dead);

  // 타워 공격
  for (const t of S.towers) towerFire(t, dt);

  // 투사체
  for (const p of S.projs) {
    if (p.tgt.dead || p.tgt.dist >= PATH_LEN) { p.gone = true; continue; }
    const tp = posAt(p.tgt.dist);
    const tx = tp.x, ty = tp.y - p.tgt.def.size * 0.4 - (p.tgt.move === 'air' ? 42 : 0);
    const dx = tx - p.x, dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    p.rot = Math.atan2(dy, dx);
    p.spin += dt * 13;
    const step = p.spd * dt;
    if (d <= step + 8) { projHit(p); p.gone = true; }
    else { p.x += dx / d * step; p.y += dy / d * step; }
  }
  S.projs = S.projs.filter(p => !p.gone);

  // 이펙트
  for (const f of S.fxs) {
    f.t += dt;
    if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 160 * dt; }
  }
  S.fxs = S.fxs.filter(f => f.t < f.dur);
  for (const b of S.beams) b.t += dt;
  S.beams = S.beams.filter(b => b.t < b.dur);
  for (const tx of S.texts) tx.t += dt;
  S.texts = S.texts.filter(tx => tx.t < 1.1);

  // 웨이브 종료 판정
  if (S.waveActive && S.spawnQ.length === 0 && S.enemies.length === 0) {
    S.waveActive = false;
    const bonus = 25 + S.wave * 3;
    S.gold += bonus;
    S.texts.push({ str: '웨이브 클리어! +' + bonus + 'G', x: W / 2, y: H / 2 - 40, t: 0, color: '#a0ffc8' });
    SFX.coin();
    if (S.wave >= MAX_WAVE) { gameEnd(true); return; }
    S.autoT = INTERMISSION;
    syncUI();
  }
  if (!S.waveActive && S.wave > 0 && S.wave < MAX_WAVE && S.autoT > 0) {
    S.autoT -= dt;
    if (S.autoT <= 0) startWave();
    else syncWaveBtn();
  }
}

function gameEnd(win) {
  S.phase = win ? 'win' : 'over';
  (win ? SFX.win : SFX.lose)();
  showOverlay(
    win ? '승리!' : '패배...',
    win
      ? `크리스탈을 지켜냈습니다!<br>웨이브 ${MAX_WAVE}까지 모두 격퇴 — 남은 목숨 <b>${S.lives}</b>`
      : `크리스탈이 파괴되었습니다.<br>웨이브 <b>${S.wave}</b>에서 함락 — 다시 도전해 보세요!`,
    '다시 시작'
  );
}

// ==================== 렌더링 ====================

function drawSprite(sp, x, y, drawH, flip = false) {
  const s = drawH / sp.h;
  const dw = sp.w * s;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sp.cv, -dw / 2, -drawH, dw, drawH);
  ctx.restore();
}

// 타워 머리 위를 도는 속성 문양
function drawTopper(t) {
  const def = t.def;
  const topY = t.y - 78 + Math.sin(S.time * 2.2 + t.x * 0.05) * 3.5;
  ctx.save();
  ctx.translate(t.x, topY);
  if (def.topper === 'die6') {
    const sp = A.dice[5];
    const s = 20 / sp.w;
    ctx.rotate(S.time * 2.2);
    ctx.shadowColor = def.color; ctx.shadowBlur = 10;
    ctx.drawImage(sp.cv, -10, -sp.h * s / 2, 20, sp.h * s);
  } else {
    const sp = A[def.topper];
    const len = def.topper === 'arrow' ? 26 : 20;
    const s = len / Math.max(sp.w, sp.h);
    if (def.topper === 'arrow' || def.topper === 'shell') ctx.rotate(S.time * 1.6);
    else ctx.rotate(Math.sin(S.time * 2.5 + t.x) * 0.25);
    if (def.topper === 'spark') ctx.globalAlpha = 0.65 + 0.35 * Math.sin(S.time * 9 + t.x);
    ctx.shadowColor = def.color; ctx.shadowBlur = 9;
    ctx.drawImage(sp.cv, -sp.w * s / 2, -sp.h * s / 2, sp.w * s, sp.h * s);
  }
  ctx.restore();
}

function heldFace() {
  return (DRAG.active && DRAG.face) || S.heldDie || 0;
}

function drawMergeHalo(t, sp, hovered) {
  const cx = sp.cx ?? TS_CX, by = sp.baseY ?? TS_BASE_Y;
  const pulse = 0.5 + 0.5 * Math.sin(S.time * 7);
  const col = t.def.color;
  ctx.save();
  ctx.translate(t.x, t.y + 6);
  ctx.save();
  ctx.scale(1, 0.48);
  ctx.beginPath();
  ctx.arc(0, 0, SPOT_R + 10 + pulse * 8, 0, Math.PI * 2);
  ctx.strokeStyle = hovered ? `rgba(255,236,140,0.98)` : `rgba(255,214,90,${0.55 + pulse * 0.4})`;
  ctx.lineWidth = hovered ? 8 : 5.5;
  ctx.shadowColor = col;
  ctx.shadowBlur = hovered ? 28 : 16;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, SPOT_R + 1, 0, Math.PI * 2);
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();
  ctx.shadowColor = hovered ? '#ffe27a' : col;
  ctx.shadowBlur = 20 + pulse * 18;
  ctx.drawImage(sp.cv, -cx, -by);
  ctx.shadowBlur = 7;
  ctx.drawImage(sp.cv, -cx, -by);
  ctx.restore();

  const label = hovered ? '놓으면 강화!' : `합체 → Lv${t.lvl + 1}`;
  ctx.save();
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.fillStyle = hovered ? '#fff3a8' : '#ffe27a';
  const ly = t.y - Math.min(92, sp.h * 0.78) + Math.sin(S.time * 5) * 2;
  ctx.strokeText(label, t.x, ly);
  ctx.fillText(label, t.x, ly);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (S.phase === 'loading') return;
  const mk = S.mapKey && A[S.mapKey] ? A[S.mapKey] : A.map;
  ctx.drawImage(mk, 0, 0, W, H);

  // 건설 지점 표시
  for (let i = 0; i < SPOTS.length; i++) {
    const [sx, sy] = SPOTS[i];
    const occupied = towerAt(i);
    const hover = Math.hypot(S.mouse.x - sx, S.mouse.y - sy) < SPOT_R
      || (DRAG.active && DRAG.overSpot === i);
    const dragging = DRAG.active && S.heldDie;
    const mergePad = occupied && occupied.face === heldFace() && occupied.lvl < MAX_LVL;
    if (occupied && !hover && !dragging && !mergePad) continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, SPOT_R, 0, Math.PI * 2);
    if (!occupied) {
      const pulse = S.heldDie ? 0.45 + 0.25 * Math.sin(S.time * 5) : 0.18;
      ctx.strokeStyle = `rgba(232,214,150,${pulse})`;
      ctx.lineWidth = hover ? 4 : 2;
      ctx.stroke();
      ctx.fillStyle = `rgba(220,200,140,${S.heldDie ? 0.14 : 0.05})`;
      ctx.fill();
    } else if (occupied.face === heldFace() && occupied.lvl < MAX_LVL) {
      const pulse = 0.55 + 0.4 * Math.sin(S.time * 7);
      ctx.strokeStyle = hover ? `rgba(255,230,120,0.95)` : `rgba(255,210,80,${pulse})`;
      ctx.lineWidth = hover ? 6 : 4;
      ctx.stroke();
      ctx.fillStyle = `rgba(255,210,80,${hover ? 0.28 : 0.12})`;
      ctx.fill();
    } else if (hover) {
      ctx.strokeStyle = occupied.face === heldFace() ? 'rgba(180,180,180,0.6)' : 'rgba(255,110,90,0.7)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 사거리 원 (선택된 타워 / 배치 미리보기)
  let rangePrev = null;
  if (S.selTower) {
    rangePrev = { x: S.selTower.x, y: S.selTower.y, r: towerRange(S.selTower), c: S.selTower.def.color };
  } else if (S.heldDie) {
    const idx = DRAG.active ? DRAG.overSpot : spotAt(S.mouse.x, S.mouse.y);
    if (idx >= 0 && !towerAt(idx)) {
      rangePrev = { x: SPOTS[idx][0], y: SPOTS[idx][1], r: TOWER_DEFS[S.heldDie].range, c: TOWER_DEFS[S.heldDie].color };
    }
  }
  if (rangePrev) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(rangePrev.x, rangePrev.y - 30, rangePrev.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(140,200,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = rangePrev.c || 'rgba(160,210,255,0.45)';
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 개체 (y순 정렬)
  const ents = [];
  for (const t of S.towers) ents.push({ y: t.y, kind: 't', o: t });
  for (const e of S.enemies) { const p = posAt(e.dist); ents.push({ y: p.y, kind: 'e', o: e, p }); }
  ents.sort((a, b) => a.y - b.y);

  for (const ent of ents) {
    if (ent.kind === 't') {
      const t = ent.o;
      const sp = towerSpr(t.face, t.skin);
      const cx = sp.cx ?? TS_CX, by = sp.baseY ?? TS_BASE_Y;
      const kick = t.kick || 0;
      if (t.kick > 0) t.kick = Math.max(0, t.kick - 0.08);
      const face = heldFace();
      const mergeable = face && t.face === face && t.lvl < MAX_LVL;
      const hovered = mergeable && DRAG.active && DRAG.overSpot === t.spot;
      if (mergeable) {
        drawMergeHalo(t, sp, hovered);
      } else {
        ctx.save();
        ctx.translate(t.x, t.y + 6);
        if (face && t.face !== face) ctx.globalAlpha = 0.72;
        const sc = 1 - kick * 0.04;
        ctx.scale(sc, sc);
        ctx.drawImage(sp.cv, -cx, -by);
        ctx.restore();
      }
      if (!sp.dedicated) drawTopper(t);
      // 레벨 표시 (받침 앞의 금색 점)
      for (let i = 0; i < MAX_LVL; i++) {
        ctx.beginPath();
        ctx.arc(t.x - 12 + i * 12, t.y + 15, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = i < t.lvl ? '#ffd452' : 'rgba(0,0,0,0.45)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (S.selTower === t) {
        ctx.save();
        ctx.translate(t.x, t.y + 6);
        ctx.scale(1, 0.5);
        ctx.beginPath(); ctx.arc(0, 0, SPOT_R + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,225,140,0.85)'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();
      }
    } else {
      const e = ent.o, p = ent.p;
      const airY = e.move === 'air' ? 42 : 0;
      const bob = Math.sin(e.animT * 6) * (e.move === 'air' ? 5 : 2);
      const drawY = p.y + 4 - airY - bob;
      if (e.slowT > 0) {
        ctx.save();
        ctx.translate(p.x, p.y - airY);
        ctx.scale(1, 0.45);
        ctx.beginPath(); ctx.arc(0, 0, e.def.size * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120,190,255,0.3)'; ctx.fill();
        ctx.restore();
      }
      const spr = e.sprite && A[e.sprite];
      ctx.save();
      if (e.hidden) ctx.globalAlpha = 0.22;
      if (e.hue) ctx.filter = `hue-rotate(${e.hue}deg)`;
      if (spr && spr.cv) {
        const h = e.def.size;
        const w = h * (spr.w / spr.h);
        ctx.drawImage(spr.cv, p.x - w / 2, drawY - h, w, h);
      } else if (A[e.def.sheet]) {
        const frames = A[e.def.sheet];
        const fr = frames[Math.floor(e.animT * 5) % 4];
        drawSprite(fr, p.x, drawY, e.def.size, e.face > 0);
      }
      ctx.filter = 'none';
      ctx.restore();
      if (e.move === 'air' && !e.hidden) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 8, 12, 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#000'; ctx.fill();
        ctx.restore();
      }
      if (e.move === 'burrow' && e.hidden) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 16, 7, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#6b4a28'; ctx.fill();
        ctx.restore();
      }
      if (e.hp < e.max) {
        const bw = Math.max(26, e.def.size * 0.7), bh = 4;
        const bx = p.x - bw / 2, by = drawY - e.def.size - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        const ratio = Math.max(0, e.hp / e.max);
        ctx.fillStyle = ratio > 0.5 ? '#6fd06f' : ratio > 0.25 ? '#e0c04a' : '#d05050';
        ctx.fillRect(bx, by, bw * ratio, bh);
      }
    }
  }

  if (DRAG.active && S.heldDie && DRAG.overCanvas) {
    const sp = towerSpr(S.heldDie, S.wave);
    if (sp) {
      const idx = DRAG.overSpot;
      let gx = S.mouse.x, gy = S.mouse.y;
      if (idx >= 0) { gx = SPOTS[idx][0]; gy = SPOTS[idx][1]; }
      const cx = sp.cx ?? TS_CX, by = sp.baseY ?? TS_BASE_Y;
      const mode = ghostMode(idx);
      const preview = 0.72;
      if (mode !== 'merge') {
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.4 * DRAG.morph;
        ctx.translate(gx, gy + 6);
        ctx.scale(preview, preview);
        ctx.drawImage(sp.cv, -cx, -by);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(gx, gy + 6);
      ctx.scale(1, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, SPOT_R + 2, 0, Math.PI * 2);
      ctx.strokeStyle = mode === 'ok' ? 'rgba(140,240,170,0.95)'
        : mode === 'merge' ? 'rgba(255,230,120,0.98)'
        : mode === 'bad' ? 'rgba(255,110,90,0.95)'
        : 'rgba(232,214,150,0.7)';
      ctx.lineWidth = mode === 'merge' ? 6 : 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 투사체
  for (const p of S.projs) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.kind === 'dieBomb' || p.kind === 'die6') {
      const sp = A.dieBomb || A.dice[5];
      const s = 26 / sp.w;
      ctx.rotate(p.spin);
      ctx.shadowColor = '#ff5555'; ctx.shadowBlur = 8;
      ctx.drawImage(sp.cv, -13, -sp.h * s / 2, 26, sp.h * s);
    } else {
      const sp = A[p.kind];
      const len = p.kind === 'arrow' ? 36 : p.kind === 'shell' ? 22 : 26;
      const s = len / sp.w;
      ctx.rotate(p.rot);
      ctx.drawImage(sp.cv, -len / 2, -sp.h * s / 2, len, sp.h * s);
    }
    ctx.restore();
  }

  // 레이저 / 전격 빔
  for (const b of S.beams) {
    const alpha = 1 - b.t / b.dur;
    if (b.style === 'laser' && A.laserBeam) {
      const a = b.pts[0], c = b.pts[b.pts.length - 1];
      const dx = c.x - a.x, dy = c.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const sp = A.laserBeam;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(a.x, a.y);
      ctx.rotate(Math.atan2(dy, dx));
      const hh = 14;
      ctx.drawImage(sp.cv, 0, -hh / 2, len, hh);
      ctx.restore();
    } else {
      for (let pass = 0; pass < 2; pass++) {
        ctx.save();
        ctx.strokeStyle = pass === 0 ? `rgba(120,200,255,${alpha * 0.55})` : `rgba(255,255,220,${alpha * 0.9})`;
        ctx.lineWidth = pass === 0 ? 5 : 1.8;
        ctx.beginPath();
        for (let i = 0; i < b.pts.length - 1; i++) {
          const a = b.pts[i], c = b.pts[i + 1];
          ctx.moveTo(a.x, a.y);
          const midx = (a.x + c.x) / 2 + (Math.random() - 0.5) * 14;
          const midy = (a.y + c.y) / 2 + (Math.random() - 0.5) * 14;
          ctx.lineTo(midx, midy);
          ctx.lineTo(c.x, c.y);
        }
        ctx.stroke();
        ctx.restore();
      }
      if (A.lightningArc) {
        for (let i = 0; i < b.pts.length - 1; i++) {
          const a = b.pts[i], c = b.pts[i + 1];
          const dx = c.x - a.x, dy = c.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const sp = A.lightningArc;
          ctx.save();
          ctx.globalAlpha = alpha * 0.85;
          ctx.translate(a.x, a.y);
          ctx.rotate(Math.atan2(dy, dx));
          const hh = 22;
          ctx.drawImage(sp.cv, 0, -hh / 2, len, hh);
          ctx.restore();
        }
      }
    }
  }

  // 이펙트
  for (const f of S.fxs) {
    const pr = f.t / f.dur;
    const sheetMap = {
      impact: A.impact, cannonBlast: A.cannonBlast, arcaneBurst: A.arcaneBurst,
      frostBurst: A.frostBurst, dieExplode: A.dieExplode,
    };
    if (sheetMap[f.kind]) {
      const frames = sheetMap[f.kind];
      const fr = frames[Math.min(3, Math.floor(pr * 4))];
      const s = f.size / Math.max(fr.w, fr.h);
      ctx.save();
      ctx.globalAlpha = 1 - pr * 0.4;
      ctx.drawImage(fr.cv, f.x - fr.w * s / 2, f.y - fr.h * s / 2, fr.w * s, fr.h * s);
      ctx.restore();
    } else if (f.kind === 'spark') {
      const sp = A.spark;
      const s = f.size / Math.max(sp.w, sp.h) * (1 + pr * 0.6);
      ctx.save();
      ctx.globalAlpha = 1 - pr;
      ctx.drawImage(sp.cv, f.x - sp.w * s / 2, f.y - sp.h * s / 2, sp.w * s, sp.h * s);
      ctx.restore();
    } else if (f.kind === 'frostHit') {
      ctx.save();
      ctx.globalAlpha = (1 - pr) * 0.8;
      ctx.strokeStyle = '#bfe8ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, 6 + pr * f.size, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'dust') {
      ctx.save();
      ctx.globalAlpha = (1 - pr) * 0.5;
      ctx.fillStyle = '#b7a888';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.size * (1 + pr), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (f.kind === 'sparkle') {
      ctx.save();
      ctx.globalAlpha = 1 - pr;
      ctx.fillStyle = '#ffe9a0';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.size * (1 - pr * 0.5), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (f.kind === 'ring') {
      ctx.save();
      ctx.globalAlpha = (1 - pr) * 0.9;
      ctx.strokeStyle = f.color || '#ffe9a0';
      ctx.lineWidth = 3 * (1 - pr) + 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, 8 + pr * f.size, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'laserMuzzle' || f.kind === 'muzzleFlash') {
      const sp = f.kind === 'laserMuzzle' ? A.laserMuzzle : A.muzzleFlash;
      if (sp) {
        const s = f.size / Math.max(sp.w, sp.h) * (1 + pr * 0.4);
        ctx.save();
        ctx.globalAlpha = 1 - pr;
        ctx.drawImage(sp.cv, f.x - sp.w * s / 2, f.y - sp.h * s / 2, sp.w * s, sp.h * s);
        ctx.restore();
      }
    } else { // hit
      ctx.save();
      ctx.globalAlpha = (1 - pr) * 0.9;
      ctx.fillStyle = '#ffe9a0';
      ctx.beginPath(); ctx.arc(f.x, f.y, 3 + pr * f.size * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // 물리 주사위 (개체 위에 표시)
  drawDie();

  // 플로팅 텍스트
  for (const t of S.texts) {
    const pr = t.t / 1.1;
    ctx.save();
    ctx.globalAlpha = 1 - pr;
    ctx.fillStyle = t.color;
    ctx.font = t.big ? 'bold 26px sans-serif' : 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = t.big ? 5 : 3;
    ctx.strokeText(t.str, t.x, t.y - pr * 30);
    ctx.fillText(t.str, t.x, t.y - pr * 30);
    ctx.restore();
  }

  // 피격 시 붉은 테두리
  if (S.hurtT > 0) {
    ctx.save();
    const a = Math.min(0.5, S.hurtT);
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.75);
    grad.addColorStop(0, 'rgba(200,30,30,0)');
    grad.addColorStop(1, `rgba(200,30,30,${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 웨이브 예고
  if (S.phase === 'playing' && !S.waveActive && S.wave < MAX_WAVE) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 4;
    const msg = S.wave === 0
      ? '주사위를 던져 타워를 배치하고, 준비되면 웨이브를 시작하세요!'
      : `다음 웨이브까지 ${Math.ceil(S.autoT)}초`;
    ctx.strokeText(msg, W / 2, 40);
    ctx.fillText(msg, W / 2, 40);
    ctx.restore();
  }
}

// ==================== UI 연동 ====================

const $ = id => document.getElementById(id);
const overlayEl = $('overlay'), statsEl = $('stats'), hudEl = $('hud');
const diceSlot = $('dice-slot'), diceImg = $('dice-img'), diceQ = $('dice-q');
const slotCanvas = $('slot-canvas'), sctx = slotCanvas.getContext('2d');
const rollBtn = $('roll-btn'), waveBtn = $('wave-btn');
const infoPanel = $('info-panel');
let diceURLs = [];

function syncUI() {
  $('gold-val').textContent = S.gold;
  $('lives-val').textContent = S.lives;
  $('wave-val').textContent = `웨이브 ${S.wave} / ${MAX_WAVE}`;
  const heldInfo = $('held-info');
  if (S.heldDie) {
    const def = TOWER_DEFS[S.heldDie];
    diceSlot.classList.add('has-die');
    diceImg.src = diceURLs[S.heldDie - 1];
    diceImg.classList.remove('hidden'); diceQ.classList.add('hidden');
    diceSlot.title = def.name + ' — 필드로 끌어다 놓아 설치';
    heldInfo.classList.remove('hidden');
    heldInfo.style.setProperty('--elem', def.color);
    $('held-name').textContent = def.name;
    $('held-desc').textContent = def.desc + ' · 같은 눈 타워에 놓으면 합체';
  } else {
    diceSlot.classList.remove('has-die');
    diceImg.classList.add('hidden');
    diceQ.classList.toggle('hidden', SLOT.active);
    diceSlot.title = SLOT.active ? '굴리는 중…' : '보유 주사위';
    heldInfo.classList.add('hidden');
  }
  diceSlot.classList.toggle('rolling', SLOT.active);
  rollBtn.disabled = !canRoll();
  syncWaveBtn();
  syncInfo();
}

function syncWaveBtn() {
  if (S.phase !== 'playing' || (S.wave >= MAX_WAVE && !S.waveActive)) { waveBtn.disabled = true; waveBtn.textContent = '웨이브 종료'; return; }
  waveBtn.disabled = S.waveActive;
  waveBtn.textContent = S.waveActive
    ? `웨이브 ${S.wave} 진행 중`
    : (S.wave === 0 ? '웨이브 시작' : `다음 웨이브 (${Math.ceil(S.autoT)}초)`);
}

function syncInfo() {
  if (!S.selTower) { infoPanel.classList.add('hidden'); return; }
  const t = S.selTower;
  infoPanel.classList.remove('hidden');
  $('info-dice').src = diceURLs[t.face - 1];
  $('info-name').textContent = `${t.def.name} · Lv${t.lvl}`;
  const dmg = Math.round(towerDmg(t));
  const rng = Math.round(towerRange(t));
  let extra = '';
  if (t.def.splash) extra = `\n광역 반경 ${t.def.splash}`;
  if (t.def.slow) extra = `\n둔화 ${Math.round((0.26 + 0.06 * t.lvl) * 100)}%`;
  if (t.def.chain) extra = `\n연쇄 ${2 + t.lvl}회`;
  const up = t.lvl < MAX_LVL ? `\n같은 눈(${t.face})을 올리면 레벨 업` : '\n최대 레벨';
  $('info-body').textContent = `피해 ${dmg} · 사거리 ${rng}${extra}${up}`;
  $('sell-btn').textContent = `판매 (+${sellPrice(t)} G)`;
}

const sellPrice = t => 6 + 5 * t.face + 12 * (t.lvl - 1);

function showOverlay(title, descHTML, btnLabel) {
  $('ov-title').textContent = title;
  $('ov-desc').innerHTML = descHTML;
  $('ov-btn').textContent = btnLabel;
  overlayEl.classList.remove('hidden');
}

// ==================== 입력 ====================

function canvasPos(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
}
function canvasToClient(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + cx * r.width / W, y: r.top + cy * r.height / H };
}
function spotAt(x, y, extra) {
  const lim = SPOT_R + (extra == null ? 6 : extra);
  let best = -1, bd = lim;
  for (let i = 0; i < SPOTS.length; i++) {
    const d = Math.hypot(x - SPOTS[i][0], y - SPOTS[i][1]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function tryPlace(idx) {
  if (!S.heldDie || idx < 0) return false;
  const existing = towerAt(idx);
  const def = TOWER_DEFS[S.heldDie];
  const [sx, sy] = SPOTS[idx];
  if (!existing) {
    S.towers.push({ face: S.heldDie, def, lvl: 1, spot: idx, x: sx, y: sy, cd: 0, skin: (S.wave + idx) % 8 });
    S.fxs.push({ kind: 'ring', x: sx, y: sy - 30, t: 0, dur: 0.5, size: 70, color: def.color });
    S.fxs.push({ kind: 'impact', x: sx, y: sy - 30, t: 0, dur: 0.28, size: 70 });
    S.texts.push({ str: def.name + '!', x: sx, y: sy - 90, t: 0, color: def.color });
    S.heldDie = 0;
    SFX.place();
  } else if (existing.face === S.heldDie) {
    if (existing.lvl < MAX_LVL) {
      existing.lvl++;
      S.heldDie = 0;
      S.fxs.push({ kind: 'ring', x: existing.x, y: existing.y - 40, t: 0, dur: 0.5, size: 80, color: existing.def.color });
      S.texts.push({ str: `Lv${existing.lvl} 강화!`, x: existing.x, y: existing.y - 95, t: 0, color: '#a0e8ff' });
      SFX.merge();
    } else {
      S.texts.push({ str: '이미 최대 레벨!', x: existing.x, y: existing.y - 95, t: 0, color: '#ff9f9f' });
      SFX.deny();
      return false;
    }
  } else {
    S.texts.push({ str: `${existing.face} 눈에는 ${S.heldDie} 눈을 올릴 수 없어요`, x: sx, y: sy - 30, t: 0, color: '#ff9f9f' });
    SFX.deny();
    return false;
  }
  S.selTower = null;
  syncUI();
  return true;
}

const DRAG = {
  active: false, face: 0, morph: 0,
  startX: 0, startY: 0, x: 0, y: 0,
  overSpot: -1, pid: 0, overCanvas: false,
};
const ghostEl = $('place-ghost');
const ghostDie = $('ghost-die');
const ghostTower = $('ghost-tower');

function ghostMode(idx) {
  if (idx < 0) return '';
  const ex = towerAt(idx);
  if (!ex) return 'ok';
  if (ex.face === DRAG.face && ex.lvl < MAX_LVL) return 'merge';
  return 'bad';
}

function updateGhost(clientX, clientY) {
  DRAG.x = clientX; DRAG.y = clientY;
  const stage = $('stage').getBoundingClientRect();
  const overCanvas = clientX >= stage.left && clientX <= stage.right && clientY >= stage.top && clientY <= stage.bottom;
  const dist = Math.hypot(clientX - DRAG.startX, clientY - DRAG.startY);
  DRAG.morph = overCanvas ? 1 : Math.min(1, dist / 90);
  DRAG.overCanvas = overCanvas;
  let gx = clientX, gy = clientY;
  DRAG.overSpot = -1;
  if (overCanvas) {
    const p = canvasPos({ clientX, clientY });
    S.mouse = p;
    const idx = spotAt(p.x, p.y, 22);
    DRAG.overSpot = idx;
    if (idx >= 0) {
      const [sx, sy] = SPOTS[idx];
      const c = canvasToClient(sx, sy - 8);
      gx = c.x; gy = c.y;
    }
  }
  ghostEl.style.opacity = overCanvas ? '0' : '1';
  const mode = ghostMode(DRAG.overSpot);
  const cr = canvas.getBoundingClientRect();
  const gs = cr.width / W;
  ghostEl.style.width = Math.round(52 * gs) + 'px';
  ghostEl.style.height = Math.round(60 * gs) + 'px';
  ghostEl.style.left = gx + 'px';
  ghostEl.style.top = gy + 'px';
  ghostDie.style.opacity = String(1 - DRAG.morph);
  ghostTower.style.opacity = String(DRAG.morph);
  const sc = 0.78 + DRAG.morph * 0.1;
  ghostEl.style.transform = `translate(-50%, -78%) scale(${sc})`;
  ghostEl.classList.toggle('show', dist > 8 || overCanvas);
  ghostEl.classList.toggle('ok', mode === 'ok');
  ghostEl.classList.toggle('merge', mode === 'merge');
  ghostEl.classList.toggle('bad', mode === 'bad');
}

function startPlaceDrag(ev) {
  if (S.phase !== 'playing' || !S.heldDie || SLOT.active) return;
  DRAG.active = true;
  DRAG.face = S.heldDie;
  DRAG.morph = 0;
  DRAG.startX = ev.clientX; DRAG.startY = ev.clientY;
  DRAG.pid = ev.pointerId;
  DRAG.overSpot = -1;
  ghostDie.src = diceURLs[S.heldDie - 1] || SRCS['d' + S.heldDie];
  ghostTower.src = SRCS['t' + S.heldDie];
  diceSlot.classList.add('dragging');
  document.body.classList.add('placing');
  try { diceSlot.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  updateGhost(ev.clientX, ev.clientY);
  ev.preventDefault();
}

function movePlaceDrag(ev) {
  if (!DRAG.active) return;
  updateGhost(ev.clientX, ev.clientY);
  ev.preventDefault();
}

function endPlaceDrag(ev) {
  if (!DRAG.active) return;
  updateGhost(ev.clientX, ev.clientY);
  const dist = Math.hypot(ev.clientX - DRAG.startX, ev.clientY - DRAG.startY);
  const idx = DRAG.overSpot;
  let placed = false;
  if (idx >= 0 && dist > 18) placed = tryPlace(idx);
  if (!placed && dist <= 18) {
    /* tap on slot — keep die */
  } else if (!placed) {
    SFX.deny();
  }
  stopPlaceDrag();
  ev.preventDefault();
}

function stopPlaceDrag() {
  DRAG.active = false;
  DRAG.overSpot = -1;
  DRAG.overCanvas = false;
  DRAG.morph = 0;
  ghostEl.classList.remove('show', 'ok', 'merge', 'bad');
  ghostEl.style.opacity = '1';
  diceSlot.classList.remove('dragging');
  document.body.classList.remove('placing');
}

let suppressClick = false;

canvas.addEventListener('pointerdown', ev => {
  const p = canvasPos(ev);
  S.mouse = p;
  // 트레이의 주사위 잡기
  if (canRoll() && Math.hypot(p.x - DIE.x, p.y - DIE.y) < 42) {
    DIE.state = 'grab';
    DIE.grabDX = DIE.x - p.x;
    DIE.grabDY = DIE.y - p.y;
    DIE.history = [{ t: performance.now(), x: p.x, y: p.y }];
    DIE.z = 0;
    DIE.w = [0, 0, 0];
    canvas.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  }
});

canvas.addEventListener('pointermove', ev => {
  const p = canvasPos(ev);
  S.mouse = p;
  if (DIE.state === 'grab') {
    DIE.x = Math.max(30, Math.min(W - 30, p.x + DIE.grabDX));
    DIE.y = Math.max(56, Math.min(H - 26, p.y + DIE.grabDY));
    DIE.history.push({ t: performance.now(), x: p.x, y: p.y });
    if (DIE.history.length > 12) DIE.history.shift();
    // 손 움직임에 따라 자연스럽게 기우뚱거리는 회전
    const h = DIE.history;
    if (h.length >= 2) {
      const a = h[h.length - 2], b = h[h.length - 1];
      const ms = Math.max(8, b.t - a.t);
      const pvx = (b.x - a.x) / ms * 1000, pvy = (b.y - a.y) / ms * 1000;
      const k = 1 / 55;
      DIE.w[0] = Math.max(-8, Math.min(8, -pvy * k));
      DIE.w[1] = Math.max(-8, Math.min(8, pvx * k));
    }
  }
});

function endGrab(ev) {
  if (DIE.state !== 'grab') return;
  const now = performance.now();
  // 최근 ~90ms 동안의 이동으로 던지기 속도 계산
  const hist = DIE.history;
  let ref = hist[0];
  for (const h of hist) { if (now - h.t <= 95) { ref = h; break; } }
  const last = hist[hist.length - 1];
  const dtms = Math.max(8, last.t - ref.t);
  const vx = (last.x - ref.x) / dtms * 1000;
  const vy = (last.y - ref.y) / dtms * 1000;
  const spd = Math.hypot(vx, vy);
  const moved = Math.hypot(last.x - hist[0].x, last.y - hist[0].y);
  if (moved > 12) suppressClick = true;

  if (spd > 330 && S.gold >= ROLL_COST) {
    const cap = Math.min(1, 1500 / Math.max(1, spd));
    throwDie(vx * 0.95 * cap, vy * 0.95 * cap);
  } else {
    // 너무 약하게 놓으면 트레이로 반환 (비용 없음)
    DIE.state = 'tray';
    DIE.x = TRAY.x; DIE.y = TRAY.y;
    DIE.R = m3mul(TRAY_TILT, faceTopR(DIE.face));
    DIE.w = [0, 0, 0];
    if (spd > 120) { SFX.deny(); S.texts.push({ str: '더 세게 던지세요!', x: DIE.x, y: DIE.y - 46, t: 0, color: '#ffd0a0' }); }
  }
}

canvas.addEventListener('pointerup', endGrab);
canvas.addEventListener('pointercancel', endGrab);

canvas.addEventListener('click', ev => {
  if (suppressClick) { suppressClick = false; return; }
  if (DRAG.active) return;
  if (S.phase !== 'playing') return;
  const { x, y } = canvasPos(ev);
  const idx = spotAt(x, y);
  if (idx >= 0) {
    if (S.heldDie) {
      tryPlace(idx);
      return;
    }
    S.selTower = towerAt(idx);
    syncUI();
    return;
  }
  S.selTower = null;
  syncUI();
});

diceSlot.addEventListener('pointerdown', startPlaceDrag);
diceSlot.addEventListener('pointermove', movePlaceDrag);
diceSlot.addEventListener('pointerup', endPlaceDrag);
diceSlot.addEventListener('pointercancel', ev => { if (DRAG.active) { stopPlaceDrag(); ev.preventDefault(); } });
window.addEventListener('pointermove', ev => {
  if (DRAG.active && ev.pointerId === DRAG.pid) movePlaceDrag(ev);
}, { passive: false });
window.addEventListener('pointerup', ev => {
  if (DRAG.active && ev.pointerId === DRAG.pid) endPlaceDrag(ev);
}, { passive: false });

document.addEventListener('keydown', ev => {
  if (ev.key === 'r' || ev.key === 'R' || ev.key === 'ㄱ') rollByButton();
  else if (ev.key === 'Escape') {
    if (DRAG.active) stopPlaceDrag();
    S.selTower = null;
    syncUI();
  }
});

rollBtn.addEventListener('click', rollByButton);
waveBtn.addEventListener('click', startWave);
$('sell-btn').addEventListener('click', () => {
  if (!S.selTower) return;
  S.gold += sellPrice(S.selTower);
  S.towers = S.towers.filter(t => t !== S.selTower);
  S.selTower = null;
  SFX.sell();
  syncUI();
});
$('speed-btn').addEventListener('click', () => {
  S.speed = S.speed === 1 ? 2 : 1;
  $('speed-btn').textContent = 'x' + S.speed;
});
$('mute-btn').addEventListener('click', () => {
  S.muted = !S.muted;
  $('mute-btn').innerHTML = S.muted ? '&#128263;' : '&#128266;';
});

$('ov-btn').addEventListener('click', () => {
  if (S.phase === 'loading') return;
  audio();
  if (S.phase === 'over' || S.phase === 'win') { location.reload(); return; }
  overlayEl.classList.add('hidden');
  statsEl.classList.remove('hidden');
  hudEl.classList.remove('hidden');
  S.phase = 'playing';
  syncUI();
});

// ==================== 메인 루프 ====================

let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  for (let i = 0; i < S.speed; i++) update(dt);
  updateDie(dt); // 주사위 물리는 배속과 무관하게 실제 시간으로
  updateSlot(dt);
  draw();
  drawSlot();
  requestAnimationFrame(frame);
}

// ==================== 부팅 ====================

function drawLoading(pr) {
  ctx.fillStyle = '#0d0b09';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e9dfc4';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('에셋 불러오는 중... ' + Math.round(pr * 100) + '%', W / 2, H / 2 - 10);
  ctx.strokeStyle = '#6b5636';
  ctx.strokeRect(W / 2 - 150, H / 2 + 12, 300, 14);
  ctx.fillStyle = '#e8b64a';
  ctx.fillRect(W / 2 - 148, H / 2 + 14, 296 * pr, 10);
}

(async () => {
  drawLoading(0);
  $('ov-btn').disabled = true;
  $('ov-btn').textContent = '불러오는 중...';
  try {
    await loadAssets(pr => drawLoading(pr));
  } catch (e) {
    console.warn(e);
  }
  try { fixDice3(); } catch (e) { console.warn(e); }
  try { buildTowerSprites(); } catch (e) { console.warn(e); }
  try { buildFaceTex(); } catch (e) { console.warn(e); }
  try {
    diceURLs = A.dice.map((d, i) => thumbURL(d, 96, SRCS['d' + (i + 1)]));
    $('icon-gold').src = A.gold ? thumbURL(A.gold, 44, SRCS.gold) : SRCS.gold;
    $('icon-heart').src = A.heart ? thumbURL(A.heart, 44, SRCS.heart) : SRCS.heart;
    overlayEl.style.backgroundImage = `linear-gradient(rgba(5,4,3,.45), rgba(5,4,3,.7)), url('${SRCS.keyart}')`;
  } catch (e) { console.warn(e); }
  if (corsBlocked) {
    $('ov-desc').innerHTML += '<br><span style="color:#ff9f9f">⚠ file:// 로 열면 이미지 배경 보정이 생략됩니다. start.bat 또는 로컬 서버 사용을 권장합니다.</span>';
  }
  S.phase = 'title';
  $('ov-btn').disabled = false;
  $('ov-btn').textContent = '게임 시작';
  window.DK = S;
  window.DKDIE = DIE;
  window.DKSLOT = SLOT;
  window.DKthrow = throwDie;
  requestAnimationFrame(frame);
})();

})();
