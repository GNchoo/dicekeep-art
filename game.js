'use strict';
(() => {

const W = 1024, H = 576;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ==================== 상수 ====================

// 맵의 흙길을 따라가는 웨이포인트 (포탈 → 크리스탈). 맵별로 content.js가 덮어씀.
const DEFAULT_PATH = [
  [148, 208], [228, 248], [292, 278], [312, 338], [298, 398],
  [372, 448], [490, 455], [590, 418], [648, 352], [698, 292],
  [758, 248], [838, 198],
];

// 타워 건설 지점 (발밑 기준) — 길 옆 잔디/석단
const DEFAULT_SPOTS = [
  [268, 158], [168, 328], [392, 298], [360, 478], [518, 158],
  [648, 158], [538, 292], [768, 308], [200, 458], [798, 238],
];
let SPOTS = DEFAULT_SPOTS;
let SPOT_BASE = DEFAULT_SPOTS.length; // 기본 석단 수 (그 뒤는 티어 추가 석단)
const SPOT_R = 28;

const ROLL_COST = 40;
const START_GOLD = 130;
const START_LIVES = 20;
const INTERMISSION = 9;
const MAX_LVL = 3;
const BOSS_ENTRANCE = 1.25; // 보스 등장 연출 시간(초)

// 주사위 눈(1~6) = 타워 종류. 눈이 높을수록 강력!
const TOWER_DEFS = {
  1: { name: '궁수 주사위', desc: '속사 레이저',        dmg: 8,  rate: 0.50, range: 150, laser: true,                 canAir: true,  color: '#9fd463', topper: 'laserMuzzle' },
  2: { name: '대포 주사위', desc: '쌍포 광역 포격',     dmg: 22, rate: 1.60, range: 135, proj: 'shell',      pspd: 300, splash: 60, canAir: false, color: '#e0862c', topper: 'muzzleFlash' },
  3: { name: '마법 주사위', desc: '자수정 마력탄',      dmg: 24, rate: 0.95, range: 165, proj: 'bolt',       pspd: 430, canAir: true,  color: '#b78bff', topper: 'bolt' },
  4: { name: '서리 주사위', desc: '사방 냉기 둔화',     dmg: 8,  rate: 0.80, range: 140, proj: 'frostShard', pspd: 400, slow: true, canAir: true, color: '#7fd4ff', topper: 'frostShard' },
  5: { name: '전격 주사위', desc: '연쇄 번개',          dmg: 16, rate: 1.10, range: 150, chain: true, canAir: true, color: '#ffe86b', topper: 'spark' },
  6: { name: '폭군 주사위', desc: '최강! 폭발 주사위 투척', dmg: 40, rate: 1.25, range: 175, proj: 'dieBomb', pspd: 340, splash: 55, canAir: false, color: '#ff5555', topper: 'dieBomb' },
};
// 성(★) 타워 7~20: 인피니티 보물상자의 다면체 주사위에서만 나온다. 6눈(폭군)을 바탕으로 기하급수 강화.
const STAR_BANDS = [
  { min: 7,  max: 10, name: '별빛 첨탑', color: '#7fd4ff' },
  { min: 11, max: 14, name: '성운 요새', color: '#c78bff' },
  { min: 15, max: 18, name: '천공 옥좌', color: '#ffd452' },
  { min: 19, max: 20, name: '차원 군주', color: '#ff7ad9', rainbow: true },
];
const starBand = (g) => STAR_BANDS.find((b) => g >= b.min && g <= b.max) || STAR_BANDS[STAR_BANDS.length - 1];
for (let g = 7; g <= 20; g++) {
  const b = starBand(g), k = g - 6;
  TOWER_DEFS[g] = {
    name: `${b.name} ★${g}`, desc: `${g}성 히든 타워 · 폭발 주사위 투척`, star: g,
    dmg: Math.round(40 * Math.pow(1.28, k)), rate: +(1.25 * Math.pow(0.97, k)).toFixed(3), range: 175 + 5 * k,
    proj: 'dieBomb', pspd: 340 + 6 * k, splash: 55 + 4 * k, canAir: true, color: b.color, rainbow: !!b.rainbow, topper: 'dieBomb',
  };
}
const LVL_DMG   = [1, 1.6, 2.4];
const LVL_RANGE = [0, 12, 24];
const LVL_RATE  = [1, 0.92, 0.85];

const ENEMY_DEFS = {
  mite:   { name: '이끼 진드기',  hp: 32,  speed: 52, gold: 6,   dmg: 1, size: 42, sheet: 'miteWalk' },
  runner: { name: '잿빛 질주자',  hp: 22,  speed: 92, gold: 7,   dmg: 1, size: 52, sheet: 'runnerWalk' },
  husk:   { name: '석갑 허스크',  hp: 95,  speed: 36, gold: 12,  dmg: 2, size: 62, sheet: 'huskWalk' },
  boss:   { name: '주사위 폭군',  hp: 950, speed: 27, gold: 110, dmg: 5, size: 92, sheet: 'bossWalk' },
};

// ==================== 레인(동선) 계산 ====================
// 레인 = 적이 따라가는 폴리라인. 티어에 따라 흙길·하늘길·땅굴·두 번째 흙길이 생긴다 (content.js buildLayout).

let LANES = []; // { kind, pts, segs, len, label }
const avoidCache = {}; // mapKey → 물 판정 함수
let ROAD_LAYER = null;   // 코드 렌더 맵(아레나)의 바닥+도로 오프스크린 캔버스
let ARENA = null;        // { center, portals } — 코드 렌더 맵일 때만
function buildLane(kind, pts, label) {
  const segs = [];
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const l = Math.hypot(bx - ax, by - ay);
    if (l < 1) continue;
    segs.push({ ax, ay, bx, by, len: l, acc: len });
    len += l;
  }
  return { kind, pts, segs, len, label };
}
function applyMapLayout(mapKey, tier) {
  const C = window.DKCONTENT;
  const m = C && C.maps && C.maps.find(x => x.key === mapKey);
  if (m && C.buildLayout) {
    // 배경 픽셀로 물 판정 → 코드 생성 석단이 물 위에 걸리지 않게
    let avoid = null;
    if (C.makeAvoidFromImage && A[mapKey] && A[mapKey].width) {
      if (!avoidCache[mapKey]) avoidCache[mapKey] = C.makeAvoidFromImage(A[mapKey]) || (() => false);
      avoid = avoidCache[mapKey];
    }
    const L = C.buildLayout(m, tier || 1, { avoid });
    LANES = L.lanes.map(l => buildLane(l.kind, l.pts, l.label));
    SPOTS = L.spots;
    SPOT_BASE = L.baseSpotCount;
  } else {
    LANES = [buildLane('ground', (m && m.path && m.path.length > 1) ? m.path : DEFAULT_PATH, '흙길')];
    SPOTS = (m && m.spots && m.spots.length) ? m.spots : DEFAULT_SPOTS;
    SPOT_BASE = SPOTS.length;
  }
  if (S && S.towers) {
    for (const t of S.towers) {
      if (t.spot >= 0 && t.spot < SPOTS.length) {
        t.x = SPOTS[t.spot][0];
        t.y = SPOTS[t.spot][1];
      }
    }
  }
  ARENA = (m && m.renderRoads) ? { center: m.center || [W / 2, H / 2], portals: m.portals || [], tiled: !!m.tiled, theme: m.theme || null, track: m.track || null } : null;
  ROAD_LAYER = null;
  if (m && m.tiled) {
    const layer = buildTileLayer(m);
    ROAD_LAYER = layer.cv;
    ARENA.hasStart = layer.hasStart; ARENA.hasEnd = layer.hasEnd;
    SPOT_BASE = layer.hasPad ? SPOTS.length : 0; // 석단 타일이 있으면 레이어에 굽고, 없으면 코드 받침을 전부 그린다
  } else if (ARENA) ROAD_LAYER = buildRoadLayer(m);
}

// ==================== 코드 렌더 맵 (아레나): 바닥 + 도로 레이어 ====================
// 타일셋으로 바꿀 때는 drawRoad() 만 교체하면 된다.
function buildRoadLayer(m) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const art = (n) => { const a = A['tl_arena_' + n]; return (a && a.cv && a.h > 8) ? a : null; };
  const tex = (n) => { const a = A['tl_arena_' + n]; return (a && !a.missing && a.width > 8) ? a : null; };
  const rnd = mulberry(0x5eed);
  // 1. 바닥: 아레나 바닥 그림(map-inf-arena.jpg 또는 tiles/arena/floor.jpg) → 없으면 코드 바닥
  const bg = A[m.key];
  if (bg && !bg.missing && bg.width > 8) g.drawImage(bg, 0, 0, W, H);
  else if (tex('floor')) g.drawImage(tex('floor'), 0, 0, W, H);
  else drawArenaFloor(g, m, rnd);
  // 2. 보드 (돌 단): 질감 패턴 or 코드 돌 + 베벨 + 소켓
  drawArenaBoard(g, m, makePattern(g, tex('board'), 256), art('pad'), rnd);
  // 3. 트랙: 모양은 코드, 표면은 질감(road.png) 패턴, 없으면 코드 석판
  const roadTex = makePattern(g, tex('road'), 160);
  for (const lane of LANES) if (lane.kind === 'ground' || lane.kind === 'ground2') {
    drawRoad(g, lane.pts, lane.kind === 'ground2' ? 7 : 3, [150, 132, 112], roadTex);
    if (!roadTex) drawSlabJoints(g, lane.pts, rnd);
    // 경사 연석: 바깥 밝은 띠(46~50) + 안쪽 어두운 띠(40~46)
    const pts = lane.pts;
    const stroke = (w, style) => { g.strokeStyle = style; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); };
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    g.globalCompositeOperation = 'source-over';
    stroke(52, 'rgba(0,0,0,0.35)');
    stroke(50, 'rgba(226,210,178,0.85)');
    stroke(46, 'rgba(78,64,58,0.95)');
    stroke(43, 'rgba(0,0,0,0.18)');
    g.restore();
    // 연석은 본체(0~43)를 덮었으므로 본체를 다시 그린다 (질감/석판 포함)
    drawRoad(g, pts, lane.kind === 'ground2' ? 7 : 3, [150, 132, 112], roadTex, true);
    if (!roadTex) drawSlabJoints(g, pts, mulberry(0x5eed + 1));
  }
  // 4. 화로·기둥·잔해: 그림이 있으면 오브젝트, 없으면 코드
  if (m.track) {
    const brazier = art('prop-1'), pillar = art('prop-2'), rubble = art('prop-3');
    for (const [x, y] of arenaPillars(m)) {
      if (pillar) drawGroundSprite(g, pillar, x, y, 112);
      else drawCodePillar(g, x, y);
    }
    for (const [x, y] of arenaBraziers(m)) {
      if (brazier) drawGroundSprite(g, brazier, x, y + 4, 64);
      else {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y + 6, 22, 10, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#4a4258'; g.beginPath(); g.ellipse(x, y, 20, 9, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#6a6078'; g.beginPath(); g.ellipse(x, y - 8, 15, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2a2436'; g.beginPath(); g.ellipse(x, y - 9, 10, 4, 0, 0, Math.PI * 2); g.fill();
      }
    }
    if (rubble) for (const [x, y] of [[m.track.L - 80, m.track.T + 60], [m.track.R + 80, m.track.B - 40], [m.track.L - 30, m.track.B + 88], [m.track.R + 60, m.track.T - 70]]) drawGroundSprite(g, rubble, x, y, 48, rnd() < 0.5);
  }
  // 5. 시작·도착 그림 (있으면 포탈 그림·크리스탈 대신)
  const st = art('start'), en = art('end');
  if (st && m.portals) for (const p of m.portals) drawGroundSprite(g, st, p[0], p[1] + 26, 84);
  if (en && m.center) drawGroundSprite(g, en, m.center[0], m.center[1] + 28, 128);
  if (ARENA) { ARENA.hasStart = !!st; ARENA.hasEnd = !!en; ARENA.brazierArt = !!brazierArtFlag(m); }
  return cv;
}
// 코드 석판: 트랙 진행 방향을 따라 어긋난 줄눈 (질감 그림이 없을 때)
function drawSlabJoints(g, pts, rnd) {
  const C = window.DKCONTENT;
  const len = C.pathLength(pts);
  g.save();
  g.lineCap = 'round';
  let row = 0;
  for (let d = 24; d < len; d += 44 + rnd() * 10, row++) {
    const p = C.pathAt(pts, d);
    const nx = -p.dy, ny = p.dx;
    // 가로 줄눈 (길 폭 전체)
    g.strokeStyle = 'rgba(40,30,26,0.55)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(p.x + nx * 18, p.y + ny * 18); g.lineTo(p.x - nx * 18, p.y - ny * 18); g.stroke();
    g.strokeStyle = 'rgba(255,240,220,0.14)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(p.x + nx * 18 + p.dx * 2, p.y + ny * 18 + p.dy * 2); g.lineTo(p.x - nx * 18 + p.dx * 2, p.y - ny * 18 + p.dy * 2); g.stroke();
    // 세로 줄눈 (칸마다 어긋나게)
    const off = (row % 2 === 0 ? 1 : -1) * (4 + rnd() * 6);
    const q = C.pathAt(pts, Math.min(len, d + 22));
    g.strokeStyle = 'rgba(40,30,26,0.45)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(p.x + nx * off, p.y + ny * off); g.lineTo(q.x + nx * off, q.y + ny * off); g.stroke();
    if (rnd() < 0.25) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(p.x + nx * (rnd() - 0.5) * 20, p.y + ny * (rnd() - 0.5) * 20, 5 + rnd() * 6, 3 + rnd() * 3, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}
// 보드(돌 단): 그림자 → 옆면 → 상판(질감 or 돌 그라데이션 + 노이즈) → 베벨 → 룬 테두리 → 소켓
function drawArenaBoard(g, m, boardTex, padArt, rnd) {
  const bd = m.board; if (!bd) return;
  const r = 22;
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(bd.x - 8, bd.y + 10, bd.w + 16, bd.h + 10, r + 4); g.fill();
  g.fillStyle = '#2a2236'; g.beginPath(); g.roundRect(bd.x, bd.y + 8, bd.w, bd.h, r); g.fill();          // 옆면
  g.fillStyle = '#3a3048'; g.beginPath(); g.roundRect(bd.x, bd.y + 4, bd.w, bd.h, r); g.fill();
  if (boardTex) { g.fillStyle = boardTex; g.beginPath(); g.roundRect(bd.x, bd.y, bd.w, bd.h, r); g.fill(); }
  else {
    const gr = g.createLinearGradient(0, bd.y, 0, bd.y + bd.h);
    gr.addColorStop(0, '#5c5074'); gr.addColorStop(1, '#43395a');
    g.fillStyle = gr; g.beginPath(); g.roundRect(bd.x, bd.y, bd.w, bd.h, r); g.fill();
    g.save(); g.beginPath(); g.roundRect(bd.x, bd.y, bd.w, bd.h, r); g.clip();
    for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; g.beginPath(); g.ellipse(bd.x + rnd() * bd.w, bd.y + rnd() * bd.h, 2 + rnd() * 5, 1 + rnd() * 2, rnd() * 3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.5;
    for (let x = bd.x + 88; x < bd.x + bd.w; x += 88) { g.beginPath(); g.moveTo(x, bd.y); g.lineTo(x, bd.y + bd.h); g.stroke(); }
    for (let y = bd.y + 72; y < bd.y + bd.h; y += 72) { g.beginPath(); g.moveTo(bd.x, y); g.lineTo(bd.x + bd.w, y); g.stroke(); }
    g.restore();
  }
  // 베벨: 위쪽 밝게, 아래쪽 어둡게, 안쪽 인셋 그림자
  g.save(); g.beginPath(); g.roundRect(bd.x, bd.y, bd.w, bd.h, r); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 3; g.beginPath(); g.roundRect(bd.x + 1.5, bd.y + 1.5, bd.w - 3, bd.h - 3, r); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.beginPath(); g.roundRect(bd.x + 3, bd.y + 6, bd.w - 6, bd.h - 3, r); g.stroke();
  g.restore();
  g.strokeStyle = 'rgba(232,182,74,0.55)'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(bd.x + 9, bd.y + 9, bd.w - 18, bd.h - 18, r - 6); g.stroke();
  g.fillStyle = 'rgba(232,182,74,0.55)';
  for (const [x, y] of [[bd.x + 16, bd.y + 16], [bd.x + bd.w - 16, bd.y + 16], [bd.x + 16, bd.y + bd.h - 16], [bd.x + bd.w - 16, bd.y + bd.h - 16]]) {
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill();
  }
  // 석단 소켓
  for (const [sx, sy] of (m.spots || [])) {
    if (padArt) { drawGroundSprite(g, padArt, sx, sy + 18, 40); continue; }
    const gr = g.createRadialGradient(sx, sy + 4, 6, sx, sy + 2, 36);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0.15)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(sx, sy + 2, 36, 18, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy + 2, 36, 18, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy + 3, 34, 16, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();   // 아래 림 하이라이트
    g.strokeStyle = 'rgba(232,182,74,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(sx, sy + 2, 30, 14, 0, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}
// 바깥 룬 원 위의 돌 기둥 6개 (트랙·HUD 와 겹치지 않는 자리)
function arenaPillars(m) {
  const bd = m.board; if (!bd || !m.track) return [];
  const cx = bd.x + bd.w / 2, cy = bd.y + bd.h / 2;
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;
    const x = cx + Math.cos(a) * 372, y = cy + Math.sin(a) * 372 * 0.62 + 30;
    if (y < 120 || y > H - 8 || x < 30 || x > W - 30) continue; // 맨 위 기둥은 안내 문구·HUD 칩과 겹치므로 뺀다
    out.push([Math.round(x), Math.round(y)]);
  }
  return out;
}
function drawCodePillar(g, x, y) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y + 4, 18, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a4258'; g.beginPath(); g.roundRect(x - 14, y - 8, 28, 10, 3); g.fill();          // 받침
  const gr = g.createLinearGradient(x - 9, 0, x + 9, 0); gr.addColorStop(0, '#5f5674'); gr.addColorStop(0.5, '#8a7fa2'); gr.addColorStop(1, '#4a4258');
  g.fillStyle = gr; g.fillRect(x - 9, y - 58, 18, 52);                                           // 몸통
  g.fillStyle = '#6a6080'; g.beginPath(); g.roundRect(x - 13, y - 64, 26, 8, 3); g.fill();          // 갓돌
  g.fillStyle = '#c99cff'; g.shadowColor = '#c99cff'; g.shadowBlur = 12; g.beginPath(); g.moveTo(x, y - 78); g.lineTo(x + 6, y - 68); g.lineTo(x, y - 60); g.lineTo(x - 6, y - 68); g.closePath(); g.fill(); // 보석
  g.restore();
}
function brazierArtFlag() { const a = A['tl_arena_prop-1']; return !!(a && a.cv && a.h > 8); }
function arenaBraziers(m) {
  const t = m.track; if (!t) return [];
  return [[t.L - 40, t.T - 24], [t.R + 40, t.T - 24], [t.L - 40, t.B + 30], [t.R + 40, t.B + 30]];
}
function drawArenaBraziers() {
  if (!ARENA || !ARENA.track) return;
  for (const [x, y] of arenaBraziers({ track: ARENA.track })) {
    const f = Math.sin(S.time * 9 + x) * 3, f2 = Math.sin(S.time * 13 + y) * 2;
    ctx.save();
    ctx.translate(x, y - (ARENA.brazierArt ? 50 : 12)); // 그림 화로는 그릇이 위에 있다
    ctx.shadowColor = '#ff9a3a'; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(255,120,40,0.85)';
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(-11 + f2, -14, 0 + f, -30); ctx.quadraticCurveTo(11 + f2, -14, 9, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,120,0.95)';
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-5, -8, 0 + f * 0.5, -16); ctx.quadraticCurveTo(5, -8, 4, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
// 코드 바닥: 방사 그라데이션 + 노이즈 얼룩 + 미세 점 + 비네트 + 룬 원 (아레나 바닥 그림이 없을 때)
function drawArenaFloor(g, m, rnd) {
  rnd = rnd || mulberry(0x5eed);
  const bd = m.board;
  const cx = bd ? bd.x + bd.w / 2 : W / 2, cy = bd ? bd.y + bd.h / 2 : H / 2;
  const gr = g.createRadialGradient(cx, cy, 60, cx, cy, 640);
  gr.addColorStop(0, '#3b3050'); gr.addColorStop(0.5, '#28213a'); gr.addColorStop(1, '#0f0c17');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const noise = valueNoise(0x5eed);
  for (let i = 0; i < 420; i++) { // 큰 얼룩
    const x = rnd() * W, y = rnd() * H, n = noise(x / W, y / H);
    g.fillStyle = n > 0.5 ? `rgba(120,100,160,${0.05 + n * 0.06})` : `rgba(0,0,0,${0.06 + (0.5 - n) * 0.12})`;
    g.beginPath(); g.ellipse(x, y, 14 + rnd() * 40, 8 + rnd() * 22, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 1600; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
  // 큰 석판 줄눈 (바닥)
  g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1.5;
  for (let x = 0; x <= W; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 32; y <= H; y += 96) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // 룬 원 두 겹
  g.save();
  for (const [r, a, dash] of [[330, 0.2, [22, 14]], [372, 0.12, [6, 10]]]) {
    g.strokeStyle = `rgba(214,150,255,${a})`; g.lineWidth = 3; g.setLineDash(dash);
    g.beginPath(); g.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
  // 비네트
  const vg = g.createRadialGradient(cx, cy, 300, cx, cy, 720);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}
// 흙길 브러시: 그림자 → 어두운 테두리 → 본체 → 밝은 띠 → 점·돌 (결정적 의사난수)
// tex: 이음새 없는 도로 질감 패턴(CanvasPattern). 있으면 본체를 질감으로 채우고 점·밝은 띠는 줄인다.
function drawRoad(g, pts, seed, color, tex, bodyOnly) {
  const base = color || [178, 140, 92];
  const rgba = (mul, a) => `rgba(${Math.round(base[0] * mul)},${Math.round(base[1] * mul)},${Math.round(base[2] * mul)},${a})`;
  const stroke = (w, style) => { g.strokeStyle = style; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); };
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (!bodyOnly) { stroke(54, 'rgba(0,0,0,0.22)'); stroke(48, rgba(0.74, 1)); }
  stroke(40, tex || rgba(1, 1));
  stroke(24, rgba(1.12, tex ? 0.18 : 0.5));
  let s = seed * 7919 + 17;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const C = window.DKCONTENT;
  const len = C.pathLength(pts);
  for (let d = 0; d < len; d += tex ? 18 : 6) {
    const p = C.pathAt(pts, d);
    const off = (rnd() - 0.5) * 30;
    const x = p.x - p.dy * off, y = p.y + p.dx * off;
    g.fillStyle = rnd() < 0.5 ? rgba(0.82, 0.35) : rgba(1.2, 0.35);
    g.beginPath(); g.ellipse(x, y, 2 + rnd() * 4, 1.5 + rnd() * 2, 0, 0, Math.PI * 2); g.fill();
    if (rnd() < 0.1) {
      const side = rnd() < 0.5 ? 1 : -1;
      const sx = p.x - p.dy * 25 * side, sy = p.y + p.dx * 25 * side;
      g.fillStyle = 'rgba(60,54,48,0.9)'; g.beginPath(); g.ellipse(sx, sy + 1, 4, 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(150,142,130,0.95)'; g.beginPath(); g.ellipse(sx, sy, 3.5, 2.5, 0, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}
// ==================== 타일 맵 레이어 (테마 타일 + 코드 폴백) ====================
const TILE = 64;
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const tileArt = (th, name) => { const a = A[`tl_${th.id}_${name}`]; return (a && a.cv && a.h > 8) ? a : null; };
// 질감 이미지를 repeatPx 정사각으로 줄여 반복 패턴으로 (1024 원본을 64px 로 줄이면 디테일이 사라지므로 칸보다 크게 반복)
function makePattern(g, img, repeatPx) {
  if (!img || img.missing || !(img.width > 8)) return null;
  const cv = document.createElement('canvas');
  cv.width = repeatPx; cv.height = repeatPx;
  cv.getContext('2d').drawImage(img, 0, 0, repeatPx, repeatPx);
  return g.createPattern(cv, 'repeat');
}
// road.png 가 없고 직선 도로 타일(회색 배경에 가로 띠)만 있으면 띠 가운데를 정사각으로 잘라 질감으로 쓴다
function roadTextureFromStraight(img) {
  if (!img || img.missing || !(img.width > 8)) return null;
  try {
    const cv = toCanvas(img);
    const g = cv.getContext('2d', { willReadFrequently: true });
    const col = g.getImageData(Math.floor(cv.width / 2), 0, 1, cv.height).data;
    let top = -1, bot = -1;
    for (let y = 0; y < cv.height; y++) if (!isKeyPixel(col, y)) { if (top < 0) top = y; bot = y; }
    const h = bot - top + 1;
    if (top < 0 || h < 16) return null;
    const size = Math.max(16, h - 8);
    const out = document.createElement('canvas');
    out.width = size; out.height = size;
    out.getContext('2d').drawImage(cv, Math.floor(cv.width / 2 - size / 2), top + 4, size, size, 0, 0, size, size);
    return out;
  } catch (e) { return null; }
}
// 바닥 아래에 앉히는 소품/석단/성: 바닥 중심 (x, y) 에 높이 h 로
function drawGroundSprite(g, sp, x, y, h, flip) {
  const w = h * sp.w / sp.h;
  g.save();
  g.translate(x, y);
  if (flip) g.scale(-1, 1);
  g.drawImage(sp.cv, -w / 2, -h, w, h);
  g.restore();
}
function drawCodeFloor(g, th, rnd) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, th.floor[0]); gr.addColorStop(1, th.floor[1]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 얼룩·풀결
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 40;
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y - 3 - rnd() * 5); g.stroke();
  }
}
function drawCodeWater(g, th, cells, tex) {
  // 셀들의 합집합을 마스크로 만들어 한 번에 채운다 (칸마다 따로 칠하면 겹치는 자리에 이음새가 보인다)
  const union = (pad, radius) => {
    const m = document.createElement('canvas');
    m.width = W; m.height = H;
    const mg = m.getContext('2d');
    mg.fillStyle = '#000';
    for (const [r, c] of cells) { mg.beginPath(); mg.roundRect(c * TILE - pad, r * TILE - pad, TILE + pad * 2, TILE + pad * 2, radius); mg.fill(); }
    return m;
  };
  const fillMasked = (mask, style) => {
    const mg = mask.getContext('2d');
    mg.globalCompositeOperation = 'source-in';
    mg.fillStyle = style; mg.fillRect(0, 0, W, H);
    g.drawImage(mask, 0, 0);
  };
  g.save();
  fillMasked(union(7, 20), 'rgba(0,0,0,0.28)');       // 물가 그늘
  fillMasked(union(3, 18), tex || th.water);           // 물 표면 (질감 패턴)
  g.fillStyle = 'rgba(255,255,255,0.22)';
  for (const [r, c] of cells) { g.beginPath(); g.ellipse(c * TILE + 24, r * TILE + 20, 13, 4, -0.3, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
function drawCodeProp(g, th, kind, x, y, h, rnd) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(0, 2, h * 0.3, h * 0.11, 0, 0, Math.PI * 2); g.fill();
  if (kind === 'tree' || kind === 'tree2') {
    g.fillStyle = '#5a3d22'; g.fillRect(-h * 0.06, -h * 0.35, h * 0.12, h * 0.36);
    g.fillStyle = th.propB; g.beginPath(); g.ellipse(0, -h * 0.5, h * 0.3, h * 0.36, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = th.propA; g.beginPath(); g.ellipse(-h * 0.06, -h * 0.58, h * 0.22, h * 0.26, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.ellipse(-h * 0.12, -h * 0.68, h * 0.09, h * 0.07, 0, 0, Math.PI * 2); g.fill();
  } else if (kind === 'rock') {
    g.fillStyle = th.rock; g.beginPath(); g.moveTo(-h * 0.5, 0); g.lineTo(-h * 0.35, -h * 0.55); g.lineTo(h * 0.1, -h * 0.75); g.lineTo(h * 0.5, -h * 0.3); g.lineTo(h * 0.4, 0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(-h * 0.3, -h * 0.5); g.lineTo(h * 0.05, -h * 0.68); g.lineTo(h * 0.1, -h * 0.5); g.closePath(); g.fill();
  } else if (kind === 'bush') {
    g.fillStyle = th.propB; g.beginPath(); g.ellipse(0, -h * 0.3, h * 0.55, h * 0.35, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = th.propA; g.beginPath(); g.ellipse(-h * 0.15, -h * 0.4, h * 0.32, h * 0.26, 0, 0, Math.PI * 2); g.fill();
  } else if (kind === 'flowers') {
    for (let i = 0; i < 5; i++) { g.fillStyle = ['#ff8fb0', '#ffe27a', '#b9a3ff', '#ffffff'][i % 4]; g.beginPath(); g.arc((rnd() - 0.5) * h * 1.4, -rnd() * h * 0.5, h * 0.09, 0, Math.PI * 2); g.fill(); }
  } else { // artifact: 테마색 기둥/비석
    g.fillStyle = th.rock; g.fillRect(-h * 0.16, -h * 0.85, h * 0.32, h * 0.85);
    g.fillStyle = th.glow; g.globalAlpha = 0.85; g.beginPath(); g.arc(0, -h * 0.6, h * 0.1, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
// 소품 금지 마스크: 1 이면 소품 스프라이트가 닿으면 안 되는 픽셀
function buildForbidMask(L, th) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#000';
  for (const lane of LANES) if (lane.kind === 'ground' || lane.kind === 'ground2') {
    g.lineWidth = 58; // 길 40 + 양쪽 여백 9
    g.beginPath(); g.moveTo(lane.pts[0][0], lane.pts[0][1]); for (let i = 1; i < lane.pts.length; i++) g.lineTo(lane.pts[i][0], lane.pts[i][1]); g.stroke();
  }
  for (const [x, y] of SPOTS) { // 석단 타원 + 그 위 타워 그림 자리
    g.beginPath(); g.ellipse(x, y + 2, 42, 24, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(x - 40, y - 104, 80, 108);
  }
  for (const p of [L.start, L.start2]) if (p) g.fillRect(p[0] - 50, p[1] - 92, 100, 118);
  if (L.end) g.fillRect(L.end[0] - 72, L.end[1] - 132, 144, 156);
  g.fillRect(0, 0, 480, 54); g.fillRect(W - 170, 0, 170, 54); // HUD 칩·버튼 자리
  for (const [r, c] of L.water) g.fillRect(c * TILE - 4, r * TILE - 4, TILE + 8, TILE + 8);
  const d = g.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  return mask;
}
// 브리드슨 포아송 디스크 샘플링: 최소 거리 r 를 지키며 영역을 고르게 채우는 점들 (블루 노이즈)
function poissonDisc(w, h, r, rnd) {
  const cell = r / Math.SQRT2, gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [], active = [];
  const put = (p) => { pts.push(p); active.push(pts.length - 1); grid[Math.floor(p[1] / cell) * gw + Math.floor(p[0] / cell)] = pts.length - 1; };
  const ok = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++) for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
      const i = grid[yy * gw + xx];
      if (i >= 0 && Math.hypot(pts[i][0] - x, pts[i][1] - y) < r) return false;
    }
    return true;
  };
  put([rnd() * w, rnd() * h]);
  while (active.length) {
    const ai = Math.floor(rnd() * active.length);
    const p = pts[active[ai]];
    let found = false;
    for (let k = 0; k < 20; k++) {
      const ang = rnd() * Math.PI * 2, dist = r * (1 + rnd());
      const x = p[0] + Math.cos(ang) * dist, y = p[1] + Math.sin(ang) * dist;
      if (ok(x, y)) { put([x, y]); found = true; break; }
    }
    if (!found) active.splice(ai, 1);
  }
  return pts;
}
// 저주파 값 노이즈 (0~1): 4×3 격자 난수를 부드럽게 보간 → 숲 덤불/트인 풀밭 무리
function valueNoise(seed) {
  const r = mulberry(seed);
  const NX = 5, NY = 4;
  const v = [];
  for (let i = 0; i < NX * NY; i++) v.push(r());
  const sm = (t) => t * t * (3 - 2 * t);
  return (u, w) => { // u, w ∈ [0,1]
    const x = u * (NX - 1), y = w * (NY - 1);
    const x0 = Math.min(NX - 2, Math.floor(x)), y0 = Math.min(NY - 2, Math.floor(y));
    const tx = sm(x - x0), ty = sm(y - y0);
    const a = v[y0 * NX + x0], b = v[y0 * NX + x0 + 1], c = v[(y0 + 1) * NX + x0], d = v[(y0 + 1) * NX + x0 + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}
// 테마 타일 맵을 오프스크린에 한 번 굽는다. 타일이 없으면 각 요소를 코드로 그린다.
function buildTileLayer(m) {
  const C = window.DKCONTENT;
  const th = m.theme, L = m.layout, grid = L.grid, GW = C.GW, GH = C.GH;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const T = (n) => tileArt(th, n);
  let seed = 7; for (const ch of m.key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = mulberry(seed);
  // 1. 바닥
  const floor = A[`tl_${th.id}_floor`];
  if (floor && !floor.missing && floor.width > 8) g.drawImage(floor, 0, 0, W, H); else drawCodeFloor(g, th, rnd);
  // 2. 물: 질감(water.png)이 있으면 패턴으로 채우고, 모양은 코드
  if (L.water.length) drawCodeWater(g, th, L.water, makePattern(g, A[`tl_${th.id}_water`], 256));
  // 3. 도로: 모양·폭·코너·합류는 코드 브러시, 표면은 질감(road.png; 없으면 직선 타일에서 잘라낸 질감; 그것도 없으면 테마색)
  let roadImg = A[`tl_${th.id}_road`];
  if (!roadImg || roadImg.missing || !(roadImg.width > 8)) roadImg = roadTextureFromStraight(A[`tl_${th.id}_road-straight`]);
  const roadTex = makePattern(g, roadImg, 160);
  for (const lane of LANES) if (lane.kind === 'ground' || lane.kind === 'ground2') drawRoad(g, lane.pts, lane.kind === 'ground2' ? 7 : 3, th.road, roadTex);
  // 4. 석단
  const pad = T('pad');
  if (pad) for (const [x, y] of SPOTS) drawGroundSprite(g, pad, x, y + 18, 40);
  // 5. 소품 산포 (자연스럽게, 그러나 길·석단·타워·포탈·성을 절대 가리지 않게)
  //    (1) 금지 마스크: 길(폭 40 + 여백)·석단 타원과 그 위 타워 자리·포탈/성 그림·HUD 칩·물 을 오프스크린에 칠한다
  //    (2) 브리드슨 포아송 디스크(블루 노이즈)로 맵 전체에 고르게 후보점을 뿌린다 — 구석에 몰리지 않고 가운데도 채워진다
  //    (3) 저주파 밀도 노이즈로 "숲 덤불 / 트인 풀밭" 무리를 만든다 (나무는 노이즈가 높은 곳에 몰림)
  //    (4) 후보마다 종류·크기를 정한 뒤 그 스프라이트 사각형이 마스크에 닿으면 버린다 — 길 위쪽(뒤)에는 큰 나무가 서도 되고,
  //        길 아래쪽(앞)에는 캐노피가 길을 덮으므로 자동으로 안 선다. 소품끼리는 30% 까지 겹쳐 무리를 이룬다
  const forbid = buildForbidMask(L, th);
  const hits = (x, y, w, h) => {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(W - 1, Math.ceil(x + w)), y1 = Math.min(H - 1, Math.ceil(y + h));
    for (let yy = y0; yy <= y1; yy += 6) for (let xx = x0; xx <= x1; xx += 6) if (forbid[yy * W + xx]) return true;
    return false;
  };
  const density = valueNoise(seed ^ 0x9e3779b9);
  const KINDS = [['tree', 'prop-1', 96], ['tree2', 'prop-2', 80], ['rock', 'prop-3', 40], ['bush', 'prop-4', 42], ['flowers', 'prop-5', 30], ['artifact', 'prop-6', 70]];
  const artW = (k, h) => { const a = T(KINDS[k][1]); return a ? h * a.w / a.h : h * 0.8; };
  const pickKind = (d, v) => { // d: 밀도 노이즈 0~1, v: 난수
    const treeP = 0.15 + 0.55 * d;                                   // 숲 덤불일수록 나무
    if (v < treeP) return v < treeP * 0.55 ? 0 : 1;
    const rest = (v - treeP) / (1 - treeP);
    return rest < 0.18 ? 2 : rest < 0.55 ? 3 : rest < 0.9 ? 4 : 5;   // 바위 18% · 덤불 37% · 꽃무리 35% · 상징물 10%
  };
  const props = [];
  const overlapOK = (r) => props.every((p) => {
    const ix = Math.max(0, Math.min(r.x + r.w, p.bx + p.bw) - Math.max(r.x, p.bx));
    const iy = Math.max(0, Math.min(r.y + r.h, p.by + p.bh) - Math.max(r.y, p.by));
    return ix * iy <= 0.3 * Math.min(r.w * r.h, p.bw * p.bh);
  });
  const tryPlace = (x, y, k, s, flip) => {
    const h = KINDS[k][2] * s, w = artW(k, h);
    const r = { x: x - w / 2, y: y - h, w, h };
    if (r.y < -6 || r.x < 8 || r.x + r.w > W - 8 || y > H - 2) return false;
    if (hits(r.x, r.y, r.w, r.h)) return false;
    if (!overlapOK(r)) return false;
    props.push({ x, y, k, s, flip, bx: r.x, by: r.y, bw: r.w, bh: r.h });
    return true;
  };
  for (const [r, c] of L.props) tryPlace(c * TILE + TILE / 2, r * TILE + TILE / 2 + 22, 0, 1.05, false); // 템플릿 T 칸: 큰 나무 고정
  const pts = poissonDisc(W, H, 38, rnd);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  const MAX_PROPS = 90;
  for (const [x, y] of pts) {
    if (props.length >= MAX_PROPS) break;
    const d = density(x / W, y / H);
    if (rnd() > 0.35 + 0.5 * d) continue;           // 트인 곳은 듬성듬성
    let k = pickKind(d, rnd());
    const flip = rnd() < 0.5;
    if (tryPlace(x, y, k, 0.85 + rnd() * 0.3, flip)) continue;
    if (k <= 1 || k === 5) { k = 2 + Math.floor(rnd() * 3); tryPlace(x, y, k, 0.85 + rnd() * 0.3, flip); } // 큰 것이 안 들어가면 작은 것으로
  }
  props.sort((a, b) => a.y - b.y);
  for (const p of props) {
    const [kind, name, h] = KINDS[p.k];
    const art = T(name);
    if (art) drawGroundSprite(g, art, p.x, p.y, h * p.s, p.flip); else drawCodeProp(g, th, kind, p.x, p.y, h * p.s * 0.8, rnd);
  }
  // 6. 시작·도착 (그림이 없으면 게임이 포탈/크리스탈을 매 프레임 그린다)
  const start = T('start'), end = T('end');
  if (start) { for (const p of [L.start, L.start2]) if (p) drawGroundSprite(g, start, p[0], p[1] + 26, 84); }
  if (end && L.end) drawGroundSprite(g, end, L.end[0], L.end[1] + 28, 128);
  return { cv, hasPad: !!pad, hasStart: !!start, hasEnd: !!end };
}

// 중심 크리스탈 (코드 렌더 맵). 테마 도착 타일이 구워져 있으면 맥동 링만 그린다.
function drawArenaCrystal() {
  if (!ARENA) return;
  const [cx, cy] = ARENA.center;
  const pulse = 0.5 + 0.5 * Math.sin(S.time * 2.4);
  if (ARENA.hasEnd) {
    ctx.save();
    ctx.translate(cx, cy + 10);
    ctx.scale(1, 0.5);
    ctx.beginPath(); ctx.arc(0, 0, 40 + pulse * 6, 0, Math.PI * 2);
    ctx.strokeStyle = (ARENA.theme && ARENA.theme.glow) || '#9fdcff'; ctx.globalAlpha = 0.35 + pulse * 0.3; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(cx, cy + 8);
  ctx.scale(1, 0.5);
  ctx.beginPath(); ctx.arc(0, 0, 44 + pulse * 6, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(120,200,255,${0.18 + pulse * 0.12})`; ctx.fill();
  ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
  const sp = A.crystal;
  if (sp && sp.cv) {
    const h = 118, w = h * sp.w / sp.h;
    ctx.save();
    ctx.shadowColor = '#7fd4ff'; ctx.shadowBlur = 18 + pulse * 14;
    ctx.drawImage(sp.cv, cx - w / 2, cy - h + 12, w, h);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(cx, cy - 40);
    ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(24, 0); ctx.lineTo(0, 50); ctx.lineTo(-24, 0); ctx.closePath();
    ctx.fillStyle = '#8fd8ff'; ctx.shadowColor = '#7fd4ff'; ctx.shadowBlur = 20; ctx.fill();
    ctx.restore();
  }
}
LANES = [buildLane('ground', DEFAULT_PATH, '흙길')];
function posAt(d, laneIdx) {
  const lane = LANES[laneIdx || 0] || LANES[0];
  const segs = lane.segs;
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
const epos = e => posAt(e.dist, e.lane);
const laneLen = e => (LANES[e.lane || 0] || LANES[0]).len;
// 이동 방식에 맞는 레인 고르기 (같은 종류 레인이 여럿이면 순번으로 분배)
function laneFor(move, seq) {
  const want = move === 'air' ? ['air'] : move === 'burrow' ? ['tunnel'] : ['ground', 'ground2'];
  const idxs = [];
  LANES.forEach((l, i) => { if (want.includes(l.kind)) idxs.push(i); });
  if (!idxs.length) return 0;
  return idxs[(seq || 0) % idxs.length];
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
  portal: BASE + 'props/portal.png',
  crystal: BASE + 'props/crystal.png',
  chest: BASE + 'ui/chest.png',
};
for (let g = 7; g <= 20; g++) SRCS['tStar' + g] = BASE + `casual/towers/star-${String(g).padStart(2, '0')}.png`; // 없으면 6눈 스킨으로 폴백
for (const k of ['d1', 'd4', 'd8', 'd12', 'd20']) SRCS['poly' + k] = BASE + `dice/poly-${k}.png`;                 // 없으면 코드 다각형
// 인피니티 아레나 조각 (casual/tiles/arena/): 질감 3(floor·road·board) + 오브젝트 6. 없으면 코드가 그린다.
for (const n of ['floor', 'road', 'board', 'pad', 'start', 'end', 'prop-1', 'prop-2', 'prop-3']) SRCS['tl_arena_' + n] = BASE + `casual/tiles/arena/${n}.${n === 'floor' ? 'jpg' : 'png'}`;
if (window.DKCONTENT) {
  for (const m of DKCONTENT.maps) if (m.src) SRCS[m.key] = BASE + m.src;
  // 테마 타일: casual/tiles/<theme>/<name>.png (floor 만 jpg). 없으면 코드가 그린다.
  for (const th of DKCONTENT.THEMES) {
    for (const n of DKCONTENT.TILE_ASSETS) SRCS[`tl_${th.id}_${n}`] = BASE + `casual/tiles/${th.id}/${n}.${n === 'floor' ? 'jpg' : 'png'}`;
    SRCS[`tl_${th.id}_road-straight`] = BASE + `casual/tiles/${th.id}/road-straight.png`; // road.png 가 없을 때 직선 타일에서 질감을 잘라 쓴다 (임시 호환)
  }
  for (const f of Object.keys(DKCONTENT.towerSkins)) {
    for (const s of DKCONTENT.towerSkins[f]) SRCS[s.key] = BASE + s.src;
  }
  for (const b of DKCONTENT.bases) {
    SRCS[b.sprite] = BASE + b.src;
    if (b.walk && b.walkSrc) SRCS[b.walk] = BASE + b.walkSrc;
  }
  for (const b of DKCONTENT.bossBases) {
    SRCS[b.sprite] = BASE + b.src;
    if (b.walk && b.walkSrc) SRCS[b.walk] = BASE + b.walkSrc;
  }
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
      cv.missing = true; // 없는 파일: 스프라이트/시트 처리에서 null 로 바꿔 정지컷 폴백을 쓰게 한다
      res(cv);
    };
    img.src = src;
  });
}

function isKeyPixel(d, i) {
  const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
  if (a <= 150) return true;
  if (r > 180 && g < 90 && b > 80 && r - g > 80) return true;
  const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
  const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
  const avg = (r + g + b) / 3;
  if (avg > 185 && avg < 250 && mx - mn < 22) return true;
  return false;
}

// 테두리에서 연결된 배경(잔상) 픽셀을 플러드필로 제거
function keyImageData(id, w, h) {
  const d = id.data;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const tryPush = (i) => {
    if (visited[i]) return;
    visited[i] = 1;
    if (isKeyPixel(d, i)) { d[i * 4 + 3] = 0; queue[tail++] = i; }
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
  if (img.missing) return null;
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
  if (img.missing) return null;
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
  if (window.DKCONTENT) {
    for (const b of DKCONTENT.bases) if (b.walk) sheets.push(b.walk);
    for (const b of DKCONTENT.bossBases) if (b.walk) sheets.push(b.walk);
  }
  const raw = ['map', 'keyart'];
  if (window.DKCONTENT) for (const m of DKCONTENT.maps) if (m.src) raw.push(m.key);
  const isTexture = (k) => /^tl_.*_(floor|road|water|road-straight|board)$/.test(k); // 질감·바닥: 배경 제거 없이 그대로
  let pi = 0;
  for (const k of keys) {
    if (raw.includes(k) || isTexture(k)) A[k] = imgs[k];
    else if (sheets.includes(k)) A[k] = processSheet(imgs[k]);
    else A[k] = processSprite(imgs[k]);
    onProgress(0.6 + (++pi / keys.length) * 0.4);
    await new Promise(r => setTimeout(r, 0));
  }
  A.dice = [A.d1, A.d2, A.d3, A.d4, A.d5, A.d6];
  // 아레나 등 배경이 아직 없는 맵은 지정된 다른 맵 배경으로 폴백
  if (window.DKCONTENT) for (const m of DKCONTENT.maps) {
    if (m.fallbackKey && (!A[m.key] || A[m.key].missing) && A[m.fallbackKey]) A[m.key] = A[m.fallbackKey];
  }
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
  const maxH = 96, maxW = 70;
  const s = Math.min(maxH / art.h, maxW / art.w);
  const w = Math.max(1, Math.round(art.w * s));
  const h = Math.max(1, Math.round(art.h * s));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(art.cv, 0, 0, w, h);
  return { cv, w, h, cx: w / 2, baseY: h - 5, dedicated: true };
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
  for (let g = 7; g <= 20; g++) { const art = A['tStar' + g]; if (art && art.cv && art.h > 16) towerSprites[g] = [scaleTowerArt(art)]; }
}

function towerSpr(face, skin) {
  if (face > 6 && !towerSprites[face]) return towerSpr(6, skin); // 성 타워 그림이 없으면 6눈 스킨 + 별 배지
  const pack = towerSprites[face] || [];
  if (!pack.length) return compositeFallback(face);
  return pack[((skin || 0) % pack.length + pack.length) % pack.length];
}

// 공격 모션: 배치된 스킨 스프라이트를 그대로 쓰고 반동(눌림)과 원소색 발광만 얹는다.
// tN-attack-2x2 시트는 스킨과 디자인이 달라 사용하지 않는다 (교체 시 "다른 타워가 공격"하는 것처럼 보임).
function paintTowerBody(t, sp) {
  const kick = t.kick || 0;
  const cx = sp.cx ?? TS_CX, by = sp.baseY ?? TS_BASE_Y;
  const k = kick * kick; // 발사 직후 가장 강하고 빠르게 풀린다
  ctx.save();
  ctx.scale(1 + k * 0.07, 1 - k * 0.09);
  if (kick > 0.05) {
    ctx.shadowColor = (t.def && t.def.color) || '#ffd452';
    ctx.shadowBlur = 6 + 22 * kick;
  }
  ctx.drawImage(sp.cv, -cx, -by);
  ctx.restore();
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
  bossRoar: () => { noise(0.6, 0.35, 380); tone(90, 0.7, 'sawtooth', 0.16, -40); setTimeout(() => tone(60, 0.5, 'square', 0.12, -20), 180); },
  stomp: () => { noise(0.08, 0.12, 400); tone(70, 0.1, 'sine', 0.1, -30); },
};

// ==================== 게임 상태 ====================

const S = {
  phase: 'loading', // loading | title | lobby | stageSelect | shop | playing | over | win | stageClear
  gold: START_GOLD, lives: START_LIVES, wave: 0,
  enemies: [], towers: [], projs: [], beams: [], fxs: [], texts: [], corpses: [],
  spawnQ: [], waveActive: false, autoT: 0, waveT: 0,
  shakeT: 0, bannerT: 0, bannerName: '',
  heldDie: 0, selTower: null,
  mapKey: 'g1',
  stage: 1, stageData: null, stageWaves: 10,
  mode: 'stage', inf: null, // 'stage' | 'infinity', inf = { sp, power{1..6}, kills, spent }
  speed: 1, muted: false,
  time: 0, hurtT: 0,
  mouse: { x: -100, y: -100 },
};

// ==================== 저장 / 진행도 (localStorage) ====================
const SAVE_KEY = 'DKSAVE';
const TOWER_COST = { 1: 0, 2: 0, 3: 0, 4: 30, 5: 55, 6: 90 }; // 젬으로 해금 (1~3 기본)
const SKIN_COST = 20; // 스킨 1종 해금 비용(젬)

function defaultSave() {
  const skins = {}, equip = {};
  for (let f = 1; f <= 6; f++) { skins[f] = ['a']; equip[f] = 'a'; }
  return { cleared: [], gems: 40, unlockedTowers: [1, 2, 3], unlockedSkins: skins, equippedSkin: equip, infBest: 0, infRuns: [], infMilestones: [] };
}
let SAVE = defaultSave();
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { SAVE = defaultSave(); return; }
    const s = JSON.parse(raw);
    const d = defaultSave();
    SAVE = {
      cleared: Array.isArray(s.cleared) ? s.cleared : d.cleared,
      gems: typeof s.gems === 'number' ? s.gems : d.gems,
      unlockedTowers: Array.isArray(s.unlockedTowers) && s.unlockedTowers.length ? s.unlockedTowers : d.unlockedTowers,
      unlockedSkins: Object.assign(d.unlockedSkins, s.unlockedSkins || {}),
      equippedSkin: Object.assign(d.equippedSkin, s.equippedSkin || {}),
      infBest: typeof s.infBest === 'number' ? s.infBest : 0,
      infRuns: Array.isArray(s.infRuns) ? s.infRuns.slice(0, 5) : [],
      infMilestones: Array.isArray(s.infMilestones) ? s.infMilestones : [],
    };
    // 기본 3종은 항상 해금 보장
    for (const f of [1, 2, 3]) if (!SAVE.unlockedTowers.includes(f)) SAVE.unlockedTowers.push(f);
    SAVE.unlockedTowers.sort((a, b) => a - b);
  } catch (e) { SAVE = defaultSave(); }
}
function saveSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* 무시 */ }
}
function stageUnlocked(n) { return n === 1 || SAVE.cleared.includes(n - 1); }
function infinityUnlocked() { return window.DKINF_OPEN === true || SAVE.cleared.length >= 50; } // ?inf=1 이면 임시 개방
function stageCleared(n) { return SAVE.cleared.includes(n); }

// 굴리기 결과를 해금된 눈으로 제한
function unlockedFaces() {
  if (S.mode === 'infinity') return [1, 2, 3, 4, 5, 6]; // 인피니티는 풀파워: 모든 눈 해금
  const u = (SAVE.unlockedTowers || []).filter((f) => f >= 1 && f <= 6);
  return u.length ? u : [1];
}
function pickUnlockedFace() {
  const u = unlockedFaces();
  return u[Math.floor(Math.random() * u.length)];
}
function nearestUnlockedFace(v) {
  const u = unlockedFaces();
  if (u.includes(v)) return v;
  let best = u[0], bd = Infinity;
  for (const f of u) { const d = Math.abs(f - v); if (d < bd || (d === bd && f < best)) { bd = d; best = f; } }
  return best;
}
function equippedSkinIndex(face) {
  if (face > 6) return 0;
  const letters = (window.DKCONTENT && DKCONTENT.skinLetters) || ['a', 'b', 'c', 'd', 'e'];
  const eq = (SAVE.equippedSkin && SAVE.equippedSkin[face]) || 'a';
  const i = letters.indexOf(eq);
  return i < 0 ? 0 : i;
}

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
  active: false, t: 0, t2: 0, phase: 0, kind: 'd6',
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
  SLOT.active = true; SLOT.kind = 'd6';
  SLOT.t = 0; SLOT.t2 = 0; SLOT.phase = 0; SLOT.sndT = 0;
  SLOT.final = pickUnlockedFace();
  SLOT.R = m3mul(m3axisAngle(Math.random(), Math.random(), Math.random() * 0.5 + 0.1, Math.random() * 6), TRAY_TILT);
  SLOT.w = [
    (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 16),
    (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 16),
    (Math.random() - 0.5) * 24,
  ];
  SFX.throwDie();
  syncUI();
}

// 인피니티 보물상자: 골드 → 다면체 주사위 1개 (가방). 가방의 주사위를 굴리면 나온 숫자 = 타워 성.
function chestDef() { const C = window.DKCONTENT; return C && C.INFINITY && C.INFINITY.chest; }
function chestCost() { const ch = chestDef(); return ch && S.inf ? ch.cost(S.inf.chests || 0) : Infinity; }
function buyChest() {
  const ch = chestDef();
  if (!ch || S.mode !== 'infinity' || !S.inf || S.phase !== 'playing') return null;
  const cost = chestCost();
  if (S.gold < cost) { SFX.deny(); return null; }
  S.gold -= cost;
  S.inf.chests = (S.inf.chests || 0) + 1;
  const kind = ch.draw();
  S.inf.bag[kind] = (S.inf.bag[kind] || 0) + 1;
  const rare = kind === 'd20' ? 3 : kind === 'd12' ? 2 : kind === 'd8' ? 1 : 0;
  const col = kind === 'd1' ? '#9a9a9a' : ['#e9dfc4', '#7fd4ff', '#c78bff', '#ffd452'][rare];
  S.texts.push({ str: kind === 'd1' ? '꽝… 외눈 주사위' : `보물상자: ${ch.label[kind]}(${kind}) 획득!`, x: W / 2, y: 140, t: 0, color: col });
  S.fxs.push({ kind: 'ring', x: W / 2, y: 150, t: 0, dur: 0.6 + rare * 0.2, size: 90 + rare * 40, color: col });
  if (rare >= 2) SFX.win(); else if (kind === 'd1') SFX.deny(); else SFX.coin();
  syncUI();
  return kind;
}
function rollBagDie(kind) {
  const ch = chestDef();
  if (!ch || S.mode !== 'infinity' || !S.inf || S.phase !== 'playing') return false;
  if (SLOT.active || S.heldDie || DIE.state !== 'tray' || !(S.inf.bag[kind] > 0)) { SFX.deny(); return false; }
  S.inf.bag[kind]--;
  SLOT.active = true; SLOT.kind = kind;
  SLOT.t = 0; SLOT.t2 = 0; SLOT.phase = 0; SLOT.sndT = 0;
  SLOT.final = ch.roll(kind);
  SFX.throwDie();
  syncUI();
  return true;
}
function finishSlot() {
  SLOT.active = false;
  S.heldDie = SLOT.final;
  SFX.coin();
  diceSlot.classList.add('pop');
  setTimeout(() => diceSlot.classList.remove('pop'), 350);
  if (S.heldDie > 6) { // 성 타워 당첨 연출
    const def = TOWER_DEFS[S.heldDie];
    S.texts.push({ str: `★${S.heldDie} ${def.name.replace(/ ★\d+$/, '')} 등장!`, x: W / 2, y: 120, t: 0, color: def.color, big: true });
    S.fxs.push({ kind: 'ring', x: W / 2, y: H / 2, t: 0, dur: 0.9, size: 260, color: def.color });
    S.shakeT = S.heldDie >= 15 ? 0.5 : 0.2;
    if (S.heldDie >= 15) SFX.win(); else SFX.merge();
  }
  syncUI();
}

function updateSlot(dt) {
  if (!SLOT.active) return;
  SLOT.t += dt;
  if (SLOT.kind && SLOT.kind !== 'd6') { // 다면체: 숫자가 빠르게 바뀌다가 멈춘다
    if (SLOT.phase === 0) {
      SLOT.sndT -= dt;
      if (SLOT.sndT <= 0) { SFX.bounce(0.25); SLOT.sndT = 0.09; }
      if (SLOT.t >= 0.8) {
        SLOT.phase = 1; SLOT.t2 = 0;
        const ch = chestDef();
        if (DIE.forceFinal) { SLOT.final = Math.max(1, Math.min(ch ? ch.sides[SLOT.kind] : 6, DIE.forceFinal)); DIE.forceFinal = 0; }
        SFX.settle();
      }
    } else {
      SLOT.t2 += dt;
      if (SLOT.t2 > 0.5) finishSlot();
    }
    return;
  }
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
    if (SLOT.t2 > 0.45) finishSlot();
  }
}
// 다면체 주사위 (슬롯용): 그림이 있으면 회전, 없으면 변 수에 맞는 다각형 + 숫자
const POLY_SIDES = { d1: 0, d4: 3, d8: 4, d12: 5, d20: 6 };
function drawPolyDie(g, cx, cy, size, kind, num, rot, col) {
  const sp = A['poly' + kind];
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  if (sp && sp.cv) {
    const h = size * 2.2, w = h * sp.w / sp.h;
    g.drawImage(sp.cv, -w / 2, -h / 2, w, h);
  } else {
    const n = POLY_SIDES[kind] || 4;
    g.beginPath();
    if (n === 0) g.arc(0, 0, size, 0, Math.PI * 2);
    else for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / n; const x = Math.cos(a) * size, y = Math.sin(a) * size; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.closePath();
    const gr = g.createLinearGradient(-size, -size, size, size); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(1, col);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = '#2a2018'; g.lineWidth = 2.5; g.stroke();
  }
  g.rotate(-rot);
  g.fillStyle = '#1a1208'; g.font = `bold ${Math.round(size * 0.95)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.strokeText(String(num), 0, 1); g.fillText(String(num), 0, 1);
  g.restore();
}

function drawSlot() {
  if (!SLOT.active) {
    if (!slotCanvas.classList.contains('hidden')) slotCanvas.classList.add('hidden');
    return;
  }
  slotCanvas.classList.remove('hidden');
  sctx.clearRect(0, 0, slotCanvas.width, slotCanvas.height);
  const bounce = SLOT.phase === 0 ? Math.abs(Math.sin(SLOT.t * 16)) * 4 : 0;
  if (SLOT.kind && SLOT.kind !== 'd6') {
    const ch = chestDef();
    const sides = ch ? ch.sides[SLOT.kind] : 6;
    const num = SLOT.phase === 0 ? 1 + (Math.floor(SLOT.t * 22) * 7) % sides : SLOT.final;
    const rot = SLOT.phase === 0 ? SLOT.t * 9 : Math.max(0, 0.4 - SLOT.t2) * 2;
    const col = SLOT.kind === 'd20' ? '#ffd452' : SLOT.kind === 'd12' ? '#c78bff' : SLOT.kind === 'd8' ? '#7fd4ff' : SLOT.kind === 'd1' ? '#9a9a9a' : '#d9c9a0';
    drawPolyDie(sctx, 37, 40 - bounce, 22, SLOT.kind, num, rot, col);
    return;
  }
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
    const p = epos(e);
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
      DIE.final = nearestUnlockedFace(DIE.forceFinal || topFace(DIE.R));
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

const FAST_AIR = new Set(['bat', 'bee', 'wasp', 'paperplane', 'dandelion', 'hornet', 'hummingbird', 'swift', 'sparrow']);

// 스테이지 스코프 웨이브: 한 판 = 선택 스테이지의 웨이브들. 맵은 스테이지 시작 시 고정.
// 인피니티 웨이브: 전 레인 사용, 500종 순환, 5웨이브 정예, 10웨이브 보스
function buildInfinityWave(w) {
  const C = window.DKCONTENT;
  const INF = C.INFINITY;
  const P = INF.wave(w);
  const q = [];
  let t = 0.45;
  const add = (type, extra) => { q.push(Object.assign({ type, t, hpMult: P.hpMult, goldMult: P.goldMult, spdMult: P.speedMult }, extra || {})); };
  const seq = { ground: 0, air: 0, burrow: 0 };
  const eliteSlots = new Set();
  if (w % INF.eliteEvery === 0) for (let k = 0; k < P.elites; k++) eliteSlots.add(Math.floor((k + 0.5) * P.count / P.elites));
  for (let i = 0; i < P.count; i++) {
    const sid = (w * 23 + i * 17) % C.species.length;
    const sp = C.species[sid];
    const base = C.bases.find((b) => b.id === sp.base) || C.bases[0];
    const lane = laneFor(base.move, seq[base.move]++);
    const elite = eliteSlots.has(i);
    add(base.id, {
      speciesId: sid, name: (elite ? '정예 ' : '') + sp.name, hue: sp.hue, lane,
      hpMult: P.hpMult * sp.hpM * (elite ? 3 : 1), goldMult: P.goldMult * (elite ? 3 : 1), isElite: elite,
    });
    t += P.gap * (FAST_AIR.has(base.id) ? 0.72 : 1);
  }
  if (w % INF.bossEvery === 0) {
    t += 1.2;
    for (let k = 0; k < P.bosses; k++) {
      const bi = (w / INF.bossEvery - 1 + k * 37) % C.bosses.length;
      const boss = C.bosses[bi];
      const bbase = C.bossBases.find((b) => b.id === boss.base) || C.bossBases[0];
      add(bbase.id, { name: boss.name, hue: boss.hue, hpMult: P.hpMult * P.bossHp, isBoss: true, lane: laneFor(bbase.move, k) });
      t += 1.5;
    }
  }
  return q;
}

function buildWave(w) {
  if (S.mode === 'infinity') return buildInfinityWave(w);
  const q = [];
  let t = 0.45;
  const C = window.DKCONTENT;
  const sd = S.stageData || {};
  const totalW = S.stageWaves;
  // 밸런스: content.js 의 스테이지 필드를 그대로 쓴다 (없으면 옛 공식)
  const hpMult = (sd.hpScale || Math.pow(1.05, S.stage - 1)) * Math.pow(sd.waveGrowth || 1.07, w - 1);
  const goldMult = (sd.goldMult || 1) * (1 + w * 0.03);
  const add = (type, extra) => { q.push(Object.assign({ type, t, hpMult, goldMult }, extra || {})); };
  const n = (sd.countBase || 8) + Math.floor(w * 1.2);
  const gap = Math.max(0.34, 0.9 - w * 0.01);
  const unlockAir = w >= 3;
  const unlockBurrow = w >= 5;
  let pool = (sd && sd.bases) ? sd.bases.slice() : ['slime', 'chicken', 'goblin'];
  if (C && C.bases) {
    pool = pool.filter((id) => {
      const b = C.bases.find((x) => x.id === id);
      if (!b) return false;
      if (b.move === 'air' && !unlockAir) return false;
      if (b.move === 'burrow' && !unlockBurrow) return false;
      return true;
    });
  }
  if (!pool.length) pool = ['slime'];
  const isBossWave = w >= totalW;
  const seq = { ground: 0, air: 0, burrow: 0 };
  for (let i = 0; i < n; i++) {
    let type = pool[(i * 3 + w * 5) % pool.length];
    const sid = ((S.stage - 1) * 37 + (w - 1) * 11 + i * 17) % 500;
    const sp = C && C.species[sid];
    if (sp) {
      const spBase = C.bases.find((b) => b.id === sp.base);
      if (spBase && pool.includes(spBase.id)) type = spBase.id;
    }
    const base = C && C.bases.find((b) => b.id === type);
    const move = base ? base.move : 'ground';
    const lane = laneFor(move, seq[move]++);
    add(type, Object.assign({ lane }, sp ? { speciesId: sid, name: sp.name, hue: sp.hue, hpMult: hpMult * sp.hpM, goldMult } : {}));
    t += gap * (FAST_AIR.has(type) ? 0.72 : 1);
  }
  if (isBossWave) {
    t += 1.2;
    const bi = sd ? sd.bossIndex : 0;
    const boss = C && C.bosses[bi % C.bosses.length];
    const bbase = C && C.bossBases[bi % C.bossBases.length];
    const btype = bbase ? bbase.id : 'boss';
    const lane = laneFor(bbase ? bbase.move : 'ground', 0);
    add(btype, boss ? { name: boss.name, hue: boss.hue, hpMult: hpMult * (1.1 + S.stage * 0.015), isBoss: true, lane } : { isBoss: true, lane });
  }
  return q;
}

function startWave() {
  if (S.waveActive || S.wave >= S.stageWaves || S.phase !== 'playing') return;
  S.wave++;
  S.spawnQ = buildWave(S.wave);
  S.waveActive = true;
  S.waveT = 0;
  S.autoT = 0;
  SFX.wave();
  syncUI();
}

// 선택한 스테이지 시작 (로비/스테이지선택에서 호출)
function startStage(n) {
  const C = window.DKCONTENT;
  const sd = C && C.stages && C.stages[n - 1];
  if (!sd) return;
  S.mode = 'stage'; S.inf = null;
  S.stage = n;
  S.stageData = sd;
  S.stageWaves = sd.waves;
  S.mapKey = sd.mapKey;
  S.gold = sd.startGold || START_GOLD;
  S.lives = START_LIVES;
  S.wave = 0;
  S.enemies = []; S.towers = []; S.projs = []; S.beams = []; S.fxs = []; S.texts = []; S.corpses = [];
  S.spawnQ = []; S.waveActive = false; S.autoT = 0; S.waveT = 0;
  S.heldDie = 0; S.selTower = null; S.shakeT = 0; S.bannerT = 0;
  DIE.state = 'tray'; DIE.z = 0; DIE.final = 0;
  SLOT.active = false;
  applyMapLayout(sd.mapKey, sd.tier || 1);
  S.phase = 'playing';
  showScreen('playing');
  syncUI();
}

// 인피니티 런 시작 (로비에서 호출)
function startInfinity() {
  const C = window.DKCONTENT;
  const INF = C && C.INFINITY;
  if (!INF) return;
  S.mode = 'infinity';
  S.inf = { sp: 0, power: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }, kills: 0, spent: 0, bag: { d1: 0, d4: 0, d6: 0, d8: 0, d12: 0, d20: 0 }, chests: 0 };
  S.stage = 0;
  S.stageData = { n: 0, name: '무한 투기장', tier: INF.tier.tier, tierName: INF.tier.name, tierColor: INF.tier.color, lanes: INF.tier.lanes.length, waves: Infinity, bases: [], gem: 0 };
  S.stageWaves = Infinity;
  S.mapKey = INF.mapKey;
  S.gold = INF.startGold;
  S.lives = INF.lives;
  S.wave = 0;
  S.enemies = []; S.towers = []; S.projs = []; S.beams = []; S.fxs = []; S.texts = []; S.corpses = [];
  S.spawnQ = []; S.waveActive = false; S.autoT = 0; S.waveT = 0;
  S.heldDie = 0; S.selTower = null; S.shakeT = 0; S.bannerT = 0;
  DIE.state = 'tray'; DIE.z = 0; DIE.final = 0;
  SLOT.active = false;
  applyMapLayout(INF.mapKey, INF.tier);
  S.phase = 'playing';
  showScreen('playing');
  syncUI();
}

// 인피니티 런 종료: 기록·젬 저장 + 결과 화면
function endInfinity() {
  const C = window.DKCONTENT;
  const INF = C.INFINITY;
  S.phase = 'over';
  S.waveActive = false;
  const reached = Math.max(0, S.waveActive ? S.wave - 1 : S.wave - (S.enemies.length ? 1 : 0));
  const wave = Math.max(0, S.wave - 1); // 마지막으로 '완료'한 웨이브
  const r = INF.gems(wave, SAVE.infMilestones);
  SAVE.gems += r.gems;
  SAVE.infMilestones = (SAVE.infMilestones || []).concat(r.newly);
  const isBest = wave > (SAVE.infBest || 0);
  if (isBest) SAVE.infBest = wave;
  SAVE.infRuns = [{ wave, kills: S.inf.kills, date: new Date().toISOString().slice(0, 10) }].concat(SAVE.infRuns || []).slice(0, 5);
  saveSave();
  SFX.lose();
  showOverlay(
    isBest ? '신기록!' : '런 종료',
    `<b>무한 투기장</b> 웨이브 <b>${wave}</b> 까지 버텼습니다${isBest ? ' — <b>최고 기록 갱신!</b>' : ` (최고 ${SAVE.infBest})`}<br>` +
    `처치 <b>${S.inf.kills}</b> · 강화에 쓴 SP <b>${S.inf.spent}</b><br>` +
    `젬 <b>+${r.gems}</b>${r.newly.length ? ` (마일스톤 ${r.newly.join(', ')} 달성 보너스 포함)` : ''}`,
    '로비로'
  );
  void reached;
}

// 스테이지 클리어 처리: 젬 보상 + 다음 스테이지 해금 + 저장
function onStageClear() {
  S.phase = 'stageClear';
  S.waveActive = false;
  const sd = S.stageData;
  const first = !SAVE.cleared.includes(S.stage);
  const reward = first ? sd.gem : Math.max(2, Math.ceil(sd.gem / 3));
  SAVE.gems += reward;
  if (first) SAVE.cleared.push(S.stage);
  saveSave();
  SFX.win();
  const nextInfo = S.stage < 50 ? `다음 스테이지 <b>${S.stage + 1}</b> 해금!` : '모든 스테이지 정복!';
  showOverlay(
    '스테이지 클리어!',
    `<b>${sd.name}</b> (스테이지 ${S.stage}) 완료!<br>젬 <b>+${reward}</b> 획득 ${first ? '(최초 클리어 보상)' : '(재도전 보상)'}<br>${nextInfo}`,
    '스테이지 선택'
  );
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
  const lane = (item.lane != null && LANES[item.lane]) ? item.lane : laneFor(move, 0);
  const isBoss = !!item.isBoss;
  if (item.isElite) { def = Object.assign({}, def, { size: Math.round((size || def.size) * 1.2) }); }
  const e = {
    type: item.type, def, isElite: !!item.isElite, spdMult: item.spdMult || 1,
    hp: def.hp * (item.hpMult || 1), max: def.hp * (item.hpMult || 1),
    gold: Math.round(def.gold * (item.goldMult || 1)),
    dist: 0, slowT: 0, slowPct: 0,
    animT: Math.random(), face: 1, dead: false,
    move, sprite, hue, name: name || def.name,
    hidden: false, burrowT: Math.random() * 2,
    isBoss, lane, flashT: 0,
    entranceT: isBoss ? 0 : -1, // 보스 등장 연출 (>=0 이면 진행 중)
    stompPhase: 0,
  };
  S.enemies.push(e);
  const p = epos(e);
  if (isBoss) {
    // 보스 등장: 포탈 폭발 + 화면 흔들림 + 배너 + 포효
    S.shakeT = 0.7;
    S.bannerT = 2.6; S.bannerName = e.name;
    S.fxs.push({ kind: 'ring', x: p.x, y: p.y - 20, t: 0, dur: 0.9, size: 150, color: '#ff5a5a' });
    S.fxs.push({ kind: 'circle', x: p.x, y: p.y, t: 0, dur: 1.3, size: 110, color: '#ff5a5a' });
    S.fxs.push({ kind: 'impact', x: p.x, y: p.y - 30, t: 0, dur: 0.5, size: 140 });
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 2 * i / 16;
      S.fxs.push({ kind: 'dust', x: p.x, y: p.y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 50 - 30, t: 0, dur: 0.7, size: 5 + Math.random() * 4 });
    }
    SFX.bossRoar();
  } else {
    // 일반 적: 포탈에서 살짝 튀어나오는 스폰 링
    S.fxs.push({ kind: 'ring', x: p.x, y: p.y - (move === 'air' ? 42 : 10), t: 0, dur: 0.35, size: 34, color: move === 'air' ? '#cfe9ff' : move === 'burrow' ? '#c9a06a' : '#d9a0ff' });
  }
}

function damageEnemy(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flashT = 0.13; // 피격 플래시
  if (e.hp <= 0) {
    e.dead = true;
    S.gold += e.gold;
    if (S.inf) S.inf.kills++;
    const p = epos(e);
    S.texts.push({ str: '+' + e.gold, x: p.x, y: p.y - e.def.size, t: 0, color: '#ffd870' });
    spawnDeath(e, p);
    if (e.isBoss || e.type === 'boss') {
      S.fxs.push({ kind: 'impact', x: p.x, y: p.y - 20, t: 0, dur: 0.45, size: 150 });
      S.fxs.push({ kind: 'ring', x: p.x, y: p.y - 20, t: 0, dur: 0.8, size: 160, color: '#ffd870' });
      S.shakeT = Math.max(S.shakeT || 0, 0.45);
      noise(0.4, 0.3, 500);
    }
    SFX.coin();
    syncUI();
  }
}

// 사망 연출: 스프라이트가 떠오르며 희미해지고 발밑에 먼지가 퍼진다
function spawnDeath(e, p) {
  const airY = e.move === 'air' ? 42 : 0;
  const fr = currentEnemyFrame(e);
  if (fr) {
    S.corpses.push({ fr, x: p.x, y: p.y + 4 - airY, h: e.def.size, hue: e.hue, t: 0, dur: e.isBoss ? 0.7 : 0.42, boss: e.isBoss });
  }
  const n = e.isBoss ? 18 : 7;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 2 * i / n + Math.random() * 0.5;
    const spd = (e.isBoss ? 70 : 40) + Math.random() * 40;
    S.fxs.push({ kind: 'dust', x: p.x, y: p.y - airY + 2, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd * 0.45 - 30,
                 t: 0, dur: 0.4 + Math.random() * 0.3, size: (e.isBoss ? 5 : 3) + Math.random() * 3, color: e.move === 'air' ? '#e8f4ff' : undefined });
  }
}

// 지금 화면에 그려질 적 프레임 (걷기 시트 > 정지컷 > 구 시트)
function currentEnemyFrame(e) {
  const walk = e.def && e.def.walk && A[e.def.walk];
  if (Array.isArray(walk) && walk.length) {
    const fr = walk[Math.floor(e.animT * 5) % walk.length];
    if (fr && fr.cv) return fr;
  }
  const spr = e.sprite && A[e.sprite];
  if (spr && spr.cv) return spr;
  const sheet = e.def && e.def.sheet && A[e.def.sheet];
  if (Array.isArray(sheet) && sheet.length) return sheet[Math.floor(e.animT * 5) % sheet.length];
  return null;
}

function towerAt(spotIdx) {
  return S.towers.find(t => t.spot === spotIdx) || null;
}

// 인피니티 눈별 강화 (SP). 스테이지 모드에서는 항상 0.
const powerLv = face => (S.mode === 'infinity' && S.inf) ? (S.inf.power[face] || 0) : 0;
const DP = () => window.DKCONTENT && DKCONTENT.DICE_POWER;
const powerTier = face => DP() ? DP().tier(powerLv(face)) : 0;
const powerSpecial = (face, key) => { const d = DP(); const s = d && d.special[face]; return (s && s[key] != null) ? s[key] : null; };
const towerDmg   = t => {
  let m = LVL_DMG[t.lvl - 1];
  const d = DP();
  if (d) { m *= d.dmgMult(powerLv(t.face)); const ex = powerSpecial(t.face, 'dmg'); if (ex) m *= 1 + ex * powerTier(t.face); }
  return t.def.dmg * m;
};
const towerRange = t => t.def.range + LVL_RANGE[t.lvl - 1] + (DP() ? DP().rangeAdd(powerLv(t.face)) : 0) + (S.mode === 'infinity' && window.DKCONTENT ? (DKCONTENT.INFINITY.rangeBonus || 0) : 0);
const towerRate  = t => { let r = t.def.rate * LVL_RATE[t.lvl - 1]; const ex = powerSpecial(t.face, 'rate'); if (ex) r *= Math.pow(ex, powerTier(t.face)); return r; };
const towerSplash = t => (t.def.splash || 0) + ((powerSpecial(t.face, 'splash') || 0) * powerTier(t.face));
const towerSlowPct = t => 0.26 + 0.06 * t.lvl + ((powerSpecial(t.face, 'slow') || 0) * powerTier(t.face));
const towerChain = t => 2 + t.lvl + ((powerSpecial(t.face, 'chain') || 0) * powerTier(t.face));

// SP 로 눈 강화 (인피니티 전용)
function upgradeFace(f) {
  const d = DP();
  if (S.mode !== 'infinity' || !S.inf || !d) return false;
  const lv = S.inf.power[f] || 0;
  if (lv >= d.maxLv) { SFX.deny(); return false; }
  const cost = d.cost(lv);
  if (S.inf.sp < cost) { SFX.deny(); return false; }
  S.inf.sp -= cost; S.inf.spent += cost;
  S.inf.power[f] = lv + 1;
  const def = TOWER_DEFS[f];
  for (const t of S.towers) if (t.face === f) {
    S.fxs.push({ kind: 'circle', x: t.x, y: t.y + 4, t: 0, dur: 0.7, size: 110, color: def.color, pips: f });
    S.fxs.push({ kind: 'ring', x: t.x, y: t.y - 40, t: 0, dur: 0.45, size: 70, color: def.color });
  }
  S.texts.push({ str: `${def.name} 강화 Lv${lv + 1}!`, x: W / 2, y: H / 2 - 70, t: 0, color: def.color, big: true });
  SFX.merge();
  syncUI();
  return true;
}

function towerFire(t, dt) {
  t.cd -= dt;
  if (t.cd > 0) return;
  const range = towerRange(t);
  let best = null;
  for (const e of S.enemies) {
    if (e.dead) continue;
    if (e.hidden) continue;
    if (e.move === 'air' && !t.def.canAir) continue;
    const p = epos(e);
    const d = Math.hypot(p.x - t.x, p.y - (t.y - 30) - (e.move === 'air' ? 42 : 0));
    if (d <= range && (!best || e.dist > best.dist)) best = e;
  }
  if (!best) return;
  t.cd = towerRate(t);
  t.kick = 1;
  const dmg = towerDmg(t);
  const from = { x: t.x, y: t.y - 64 };

  if (t.def.laser) {
    const tp = epos(best);
    const to = { x: tp.x, y: tp.y - best.def.size * 0.45 - (best.move === 'air' ? 42 : 0) };
    damageEnemy(best, dmg);
    S.beams.push({ pts: [from, to], t: 0, dur: 0.11, style: 'laser' });
    S.fxs.push({ kind: 'laserMuzzle', x: from.x, y: from.y, t: 0, dur: 0.1, size: 28 });
    SFX.t1();
  } else if (t.def.chain) {
    const maxChain = towerChain(t);
    const hitList = [best];
    let cur = best;
    while (hitList.length < maxChain) {
      const cp = epos(cur);
      let next = null, nd = 115;
      for (const e of S.enemies) {
        if (e.dead || e.hidden || hitList.includes(e)) continue;
        if (e.move === 'air' && !t.def.canAir) continue;
        const p = epos(e);
        const d = Math.hypot(p.x - cp.x, p.y - cp.y);
        if (d < nd) { nd = d; next = e; }
      }
      if (!next) break;
      hitList.push(next); cur = next;
    }
    const pts = [from];
    let dd = dmg;
    for (const e of hitList) {
      const p = epos(e);
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
      spd: t.def.pspd, dmg, splash: towerSplash(t),
      slow: t.def.slow ? { pct: towerSlowPct(t), dur: 1.8 } : null,
      rot: 0, spin: 0,
    });
    if (t.face === 2) {
      S.fxs.push({ kind: 'muzzleFlash', x: from.x, y: from.y, t: 0, dur: 0.12, size: 38 });
    }
    (SFX['t' + t.face] || SFX.t6)();
  }
}

function sheetHit(kind, x, y, size, dur) {
  S.fxs.push({ kind, x, y, t: 0, dur: dur || 0.32, size });
}

function projHit(p) {
  const tp = epos(p.tgt);
  const hx = tp.x, hy = tp.y - p.tgt.def.size * 0.4;
  if (p.splash) {
    for (const e of S.enemies) {
      if (e.dead) continue;
      const ep = epos(e);
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
    if (e.flashT > 0) e.flashT -= dt;
    // 보스 등장 연출 중에는 제자리에서 몸을 부풀린다
    if (e.entranceT >= 0) {
      e.entranceT += dt;
      if (e.entranceT < BOSS_ENTRANCE) continue;
      e.entranceT = -1;
    }
    let sp = e.def.speed * (e.spdMult || 1);
    if (e.slowT > 0) { e.slowT -= dt; sp *= (1 - e.slowPct); }
    e.dist += sp * dt;
    e.animT += dt * (sp / 38);
    if (e.move === 'burrow') {
      e.burrowT += dt;
      e.hidden = (e.burrowT % 2.6) < 1.15;
    } else e.hidden = false;
    const p = epos(e);
    if (Math.abs(p.dx) > 0.3) e.face = Math.sign(p.dx);
    // 보스 쿵쿵 걷기: 발을 디딜 때마다 먼지 + 소리
    if (e.isBoss && e.move !== 'air') {
      const ph = Math.floor(e.animT * 2);
      if (ph !== e.stompPhase) {
        e.stompPhase = ph;
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          S.fxs.push({ kind: 'dust', x: p.x + (Math.random() - 0.5) * 30, y: p.y + 4, vx: Math.cos(a) * 45, vy: -20 - Math.random() * 25, t: 0, dur: 0.35, size: 3 + Math.random() * 3 });
        }
        S.shakeT = Math.max(S.shakeT, 0.12);
        SFX.stomp();
      }
    }
    if (e.dist >= laneLen(e)) {
      e.dead = true;
      S.lives -= e.def.dmg;
      S.hurtT = 0.5;
      SFX.leak();
      S.fxs.push({ kind: 'impact', x: p.x, y: p.y - 20, t: 0, dur: 0.3, size: 80 });
      syncUI();
      if (S.lives <= 0) { S.lives = 0; if (S.mode === 'infinity') endInfinity(); else gameEnd(false); return; }
    }
  }
  S.enemies = S.enemies.filter(e => !e.dead);
  for (const c of S.corpses) c.t += dt;
  S.corpses = S.corpses.filter(c => c.t < c.dur);
  if (S.shakeT > 0) S.shakeT -= dt;
  if (S.bannerT > 0) S.bannerT -= dt;

  // 타워 공격
  for (const t of S.towers) towerFire(t, dt);

  // 투사체
  for (const p of S.projs) {
    if (p.tgt.dead || p.tgt.dist >= laneLen(p.tgt)) { p.gone = true; continue; }
    const tp = epos(p.tgt);
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
    const bonus = 20 + S.wave * 3 + S.stage * 2;
    S.gold += bonus;
    S.texts.push({ str: '웨이브 클리어! +' + bonus + 'G', x: W / 2, y: H / 2 - 40, t: 0, color: '#a0ffc8' });
    SFX.coin();
    if (S.mode === 'infinity') {
      const sp = DKCONTENT.INFINITY.spPerWave(S.wave);
      S.inf.sp += sp;
      S.texts.push({ str: `강화 포인트 +${sp} SP`, x: W / 2, y: H / 2 - 12, t: 0, color: '#ff9ae0' });
      S.autoT = DKCONTENT.INFINITY.intermission;
      syncUI();
      return;
    }
    if (S.wave >= S.stageWaves) { onStageClear(); return; }
    S.autoT = INTERMISSION;
    syncUI();
  }
  if (!S.waveActive && S.wave > 0 && S.wave < S.stageWaves && S.autoT > 0) {
    S.autoT -= dt;
    if (S.autoT <= 0) startWave();
    else syncWaveBtn();
  }
}

function gameEnd(win) {
  if (S.mode === 'infinity') { endInfinity(); return; }
  S.phase = win ? 'win' : 'over';
  (win ? SFX.win : SFX.lose)();
  const sd = S.stageData;
  showOverlay(
    win ? '승리!' : '패배...',
    win
      ? `크리스탈을 지켜냈습니다!<br>남은 목숨 <b>${S.lives}</b>`
      : `크리스탈이 파괴되었습니다.<br><b>${sd ? sd.name : ''}</b> 스테이지 ${S.stage}, 웨이브 <b>${S.wave}</b>에서 함락 — 다시 도전해 보세요!`,
    '스테이지 선택'
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

// 성 타워: 밴드색 오라 링 + 머리 위 ★n 배지 (19·20 은 무지개)
function starColor(def) { return def.rainbow ? `hsl(${(S.time * 90) % 360},95%,65%)` : def.color; }
function drawStarBadge(t) {
  const col = starColor(t.def);
  const pulse = 0.5 + 0.5 * Math.sin(S.time * 4 + t.x * 0.01);
  ctx.save();
  ctx.translate(t.x, t.y + 6);
  ctx.scale(1, 0.5);
  ctx.beginPath(); ctx.arc(0, 0, SPOT_R + 6 + pulse * 4, 0, Math.PI * 2);
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + pulse * 0.3;
  ctx.shadowColor = col; ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const txt = `★${t.face}`;
  const w = ctx.measureText(txt).width + 12, y = t.y - 112;
  ctx.fillStyle = 'rgba(10,8,14,0.82)'; ctx.beginPath(); ctx.roundRect(t.x - w / 2, y - 9, w, 18, 9); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = col; ctx.fillText(txt, t.x, y + 0.5);
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

// 피격 플래시용 흰 실루엣 (프레임 캔버스별로 캐시)
const flashCache = new WeakMap();
function flashCanvas(fr) {
  if (!fr || !fr.cv) return null;
  let cv = flashCache.get(fr.cv);
  if (cv) return cv;
  try {
    cv = document.createElement('canvas');
    cv.width = fr.cv.width; cv.height = fr.cv.height;
    const g2 = cv.getContext('2d');
    g2.drawImage(fr.cv, 0, 0);
    g2.globalCompositeOperation = 'source-in';
    g2.fillStyle = '#ffffff';
    g2.fillRect(0, 0, cv.width, cv.height);
    flashCache.set(fr.cv, cv);
    return cv;
  } catch (e) { return null; }
}

// 코드 생성 레인(하늘길·땅굴)과 추가 포탈을 배경 위에 그린다
function drawLanes() {
  for (let li = 0; li < LANES.length; li++) {
    const lane = LANES[li];
    if (lane.kind === 'ground') { if (ARENA) drawPortal(lane.pts[0][0], lane.pts[0][1], lane); continue; }
    const pts = lane.pts;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (lane.kind === 'air') {
      // 하늘길: 구름 점선 (y −42 공중 높이)
      ctx.translate(0, -42);
      ctx.setLineDash([4, 14]);
      ctx.lineDashOffset = -S.time * 30;
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 1; i < pts.length - 1; i += 3) {
        const [x, y] = pts[i];
        const bob = Math.sin(S.time * 1.5 + i) * 2;
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.ellipse(x, y + bob, 14, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(x - 8, y + 2 + bob, 8, 5, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 9, y + 2 + bob, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (lane.kind === 'tunnel') {
      // 땅굴: 갈라진 흙 자국 + 흙더미
      ctx.strokeStyle = 'rgba(70,45,20,0.28)';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = 'rgba(120,80,40,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 1; i < pts.length - 1; i += 2) {
        const [x, y] = pts[i];
        ctx.fillStyle = 'rgba(112,74,36,0.75)';
        ctx.beginPath(); ctx.ellipse(x, y, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(150,104,56,0.8)';
        ctx.beginPath(); ctx.ellipse(x - 2, y - 3, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (lane.kind === 'ground2') {
      // 두 번째 흙길은 아트에 있으므로 포탈만 표시
    }
    ctx.restore();
    // 추가 포탈 (첫 레인의 포탈은 배경 아트에 있음). 시작점이 첫 레인과 같으면 생략.
    const p0 = pts[0], m0 = LANES[0].pts[0];
    if (Math.hypot(p0[0] - m0[0], p0[1] - m0[1]) > 30) drawPortal(p0[0], p0[1], lane);
    else if (ARENA && li === 0) drawPortal(p0[0], p0[1], lane);
    // 레인 이름표 (웨이브 전에만)
    if (!S.waveActive && S.wave < S.stageWaves) {
      const lp = pts[Math.floor(pts.length / 2)];
      const ly = Math.max(62, lp[1] - (lane.kind === 'air' ? 56 : 14));
      ctx.save();
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.fillStyle = lane.kind === 'air' ? '#e4f3ff' : lane.kind === 'tunnel' ? '#f0d3a0' : '#ffe0c0';
      const txt = (lane.kind === 'air' ? '☁ ' : lane.kind === 'tunnel' ? '⛏ ' : '') + lane.label;
      ctx.strokeText(txt, lp[0], ly); ctx.fillText(txt, lp[0], ly);
      ctx.restore();
    }
  }
}
function drawPortal(x, y, lane) {
  const col = lane.kind === 'air' ? '#9fd8ff' : lane.kind === 'tunnel' ? '#d9a35a' : '#d08cff';
  const pulse = 0.5 + 0.5 * Math.sin(S.time * 3);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.5);
  ctx.beginPath(); ctx.arc(0, 0, 26 + pulse * 4, 0, Math.PI * 2);
  ctx.fillStyle = col + '55'; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
  const sp = A.portal;
  const baked = ARENA && ARENA.hasStart && lane.kind !== 'air' && lane.kind !== 'tunnel'; // 테마 시작 타일이 레이어에 있음
  if (baked) return;
  if (sp && sp.cv) {
    const h = 64, w = h * sp.w / sp.h;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = col; ctx.shadowBlur = 14 + pulse * 10;
    ctx.drawImage(sp.cv, x - w / 2, y - h + 8, w, h);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(x, y - 22);
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 24, 0, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.globalAlpha = 0.55 + pulse * 0.3; ctx.fill();
    ctx.restore();
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (S.phase === 'loading') return;
  ctx.save();
  if (S.shakeT > 0) {
    const k = Math.min(1, S.shakeT / 0.4) * 5;
    ctx.translate((Math.random() - 0.5) * k * 2, (Math.random() - 0.5) * k * 2);
  }
  if (ROAD_LAYER) ctx.drawImage(ROAD_LAYER, -3, -3, W + 6, H + 6);
  else {
    const mk = S.mapKey && A[S.mapKey] ? A[S.mapKey] : A.map;
    ctx.drawImage(mk, -3, -3, W + 6, H + 6);
  }
  drawLanes();
  drawArenaCrystal();
  drawArenaBraziers();

  // 건설 지점 표시
  for (let i = 0; i < SPOTS.length; i++) {
    const [sx, sy] = SPOTS[i];
    const occupied = towerAt(i);
    const extra = i >= SPOT_BASE; // 티어 추가 석단 (아트에 없음 → 항상 받침을 그린다)
    const hover = Math.hypot(S.mouse.x - sx, S.mouse.y - sy) < SPOT_R
      || (DRAG.active && DRAG.overSpot === i);
    const dragging = DRAG.active && S.heldDie;
    const mergePad = occupied && occupied.face === heldFace() && occupied.lvl < MAX_LVL;
    if (extra) {
      // 코드로 그린 돌 받침
      ctx.save();
      ctx.translate(sx, sy + 3);
      ctx.scale(1, 0.5);
      ctx.beginPath(); ctx.arc(0, 5, SPOT_R + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,16,10,0.28)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, SPOT_R + 1, 0, Math.PI * 2);
      const gr = ctx.createRadialGradient(-8, -8, 4, 0, 0, SPOT_R + 1);
      gr.addColorStop(0, '#d9cdb1'); gr.addColorStop(0.7, '#b3a58a'); gr.addColorStop(1, '#8a7d66');
      ctx.fillStyle = gr; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(60,48,30,0.7)'; ctx.lineWidth = 2; ctx.stroke();
      // 이끼 테두리 + 돌 틈
      ctx.strokeStyle = 'rgba(90,140,60,0.45)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, SPOT_R + 3, 0.3, 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, SPOT_R + 3, 3.4, 4.6); ctx.stroke();
      ctx.strokeStyle = 'rgba(70,58,40,0.35)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, SPOT_R - 9, 0, Math.PI * 2); ctx.stroke();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (SPOT_R - 9), Math.sin(a) * (SPOT_R - 9)); ctx.lineTo(Math.cos(a) * (SPOT_R + 1), Math.sin(a) * (SPOT_R + 1)); ctx.stroke(); }
      ctx.restore();
    }
    if (occupied && !hover && !dragging && !mergePad) continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, SPOT_R, 0, Math.PI * 2);
    if (!occupied) {
      const held = !!S.heldDie;
      const pulse = held ? 0.6 + 0.25 * Math.sin(S.time * 5) : 0.5;
      ctx.fillStyle = held ? `rgba(70,120,60,0.30)` : `rgba(35,30,24,0.30)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,238,180,${pulse})`;
      ctx.lineWidth = hover ? 5 : 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, SPOT_R - 7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${held ? 0.5 : 0.28})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
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
  for (const e of S.enemies) { const p = epos(e); ents.push({ y: p.y, kind: 'e', o: e, p }); }
  for (const c of S.corpses) ents.push({ y: c.y, kind: 'c', o: c });
  ents.sort((a, b) => a.y - b.y);

  for (const ent of ents) {
    if (ent.kind === 't') {
      const t = ent.o;
      const sp = towerSpr(t.face, t.skin);
      const kick = t.kick || 0;
      if (t.kick > 0) t.kick = Math.max(0, t.kick - 0.045);
      const face = heldFace();
      const mergeable = face && t.face === face && t.lvl < MAX_LVL;
      const hovered = mergeable && DRAG.active && DRAG.overSpot === t.spot;
      if (mergeable) {
        drawMergeHalo(t, sp, hovered);
      } else {
        ctx.save();
        ctx.translate(t.x, t.y + 6);
        if (face && t.face !== face) ctx.globalAlpha = 0.72;
        paintTowerBody(t, sp);
        ctx.restore();
      }
      if (!sp.dedicated) drawTopper(t);
      if (t.face > 6) drawStarBadge(t);
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
    } else if (ent.kind === 'c') {
      // 사망 잔상: 떠오르며 사라진다
      const c = ent.o;
      const pr = c.t / c.dur;
      const fr = c.fr;
      const h = c.h * (1 + pr * (c.boss ? 0.35 : 0.2));
      const w = h * (fr.w / fr.h);
      ctx.save();
      ctx.globalAlpha = (1 - pr) * 0.85;
      if (c.hue) ctx.filter = `hue-rotate(${c.hue}deg)`;
      ctx.drawImage(fr.cv, c.x - w / 2, c.y - h - pr * 26, w, h);
      ctx.filter = 'none';
      ctx.restore();
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
      const fr = currentEnemyFrame(e);
      // 보스: 등장 스케일업(오버슈트) + 쿵쿵 스쿼시
      let sx = 1, sy = 1;
      if (e.isBoss) {
        if (e.entranceT >= 0) {
          const q = Math.min(1, e.entranceT / (BOSS_ENTRANCE * 0.8));
          const o = 1.7;
          const ease = 1 + (o + 1) * Math.pow(q - 1, 3) + o * Math.pow(q - 1, 2);
          sx = sy = 0.15 + 0.85 * Math.max(0, ease);
        } else if (e.move !== 'air') {
          const st = Math.abs(Math.sin(e.animT * Math.PI * 2 / 1));
          sy = 1 - 0.07 * st; sx = 1 + 0.06 * st;
        }
      }
      ctx.save();
      if (e.hidden) ctx.globalAlpha = 0.22;
      ctx.translate(p.x, drawY);
      ctx.scale(sx * (e.face < 0 && e.isBoss ? 1 : 1), sy);
      if (e.hue) ctx.filter = `hue-rotate(${e.hue}deg)`;
      if (fr && fr.cv) {
        const h = e.def.size;
        const w = h * (fr.w / fr.h);
        ctx.drawImage(fr.cv, -w / 2, -h, w, h);
        if (e.flashT > 0) {
          // 피격 플래시: 흰 실루엣을 겹친다
          const fl = flashCanvas(fr, w, h);
          if (fl) { ctx.filter = 'none'; ctx.globalAlpha = Math.min(1, e.flashT / 0.13) * 0.85; ctx.drawImage(fl, -w / 2, -h, w, h); }
        }
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
      if (e.isElite && !e.hidden) {
        ctx.save();
        ctx.translate(p.x, p.y - airY + 6);
        ctx.scale(1, 0.45);
        ctx.beginPath(); ctx.arc(0, 0, e.def.size * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,200,60,${0.6 + 0.3 * Math.sin(S.time * 6)})`; ctx.lineWidth = 3;
        ctx.shadowColor = '#ffc83c'; ctx.shadowBlur = 10; ctx.stroke();
        ctx.restore();
      }
      if (e.hp < e.max) {
        const bw = Math.max(26, e.def.size * 0.7), bh = e.isBoss ? 6 : 4;
        const bx = p.x - bw / 2, by = drawY - e.def.size * sy - 8;
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
      ctx.fillStyle = f.color || '#b7a888';
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
    } else if (f.kind === 'circle') {
      // 배치/합체 마법진: 바닥에 눕힌 이중 원 + 회전하는 룬 눈금 + 별
      const col = f.color || '#ffe9a0';
      const grow = Math.min(1, pr * 2.6);
      const R = f.size * 0.5 * (0.3 + 0.7 * grow);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(1, 0.5);
      ctx.globalAlpha = (1 - pr) * 0.95;
      ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(S.time * 1.8 + (f.spin || 0));
      const n = f.pips || 6;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 2 * i / n;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
      }
      ctx.rotate(-S.time * 3);
      ctx.beginPath();
      const k = f.merge ? 6 : 5;
      for (let i = 0; i < k * 2; i++) {
        const a = Math.PI * i / k, r = (i % 2 === 0 ? R * 0.62 : R * 0.26);
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
      // 솟아오르는 빛기둥
      if (pr < 0.6) {
        ctx.save();
        ctx.globalAlpha = (0.6 - pr) * 0.55;
        const gr = ctx.createLinearGradient(0, f.y - 90 * grow, 0, f.y);
        gr.addColorStop(0, col + '00'); gr.addColorStop(1, col);
        ctx.fillStyle = gr;
        ctx.fillRect(f.x - R * 0.5, f.y - 90 * grow, R, 90 * grow);
        ctx.restore();
      }
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
  if (S.phase === 'playing' && !S.waveActive && S.wave < S.stageWaves) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 4;
    const msg = S.wave === 0
      ? '주사위를 던져 타워를 배치하고, 준비되면 웨이브를 시작하세요!'
      : `다음 웨이브까지 ${Math.ceil(S.autoT)}초`;
    // 좌상단 재화·웨이브 칩(HTML, 화면이 작을수록 캔버스 기준으로 커진다)과 겹치지 않게 아래로 내린다
    ctx.strokeText(msg, W / 2, 92);
    ctx.fillText(msg, W / 2, 92);
    ctx.restore();
  }

  // 보스 등장 배너
  if (S.bannerT > 0) {
    const life = 2.6;
    const pr = 1 - S.bannerT / life;
    const inA = Math.min(1, pr / 0.12), outA = Math.min(1, (1 - pr) / 0.25);
    const a = Math.min(inA, outA);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(40,0,0,0.55)';
    ctx.fillRect(0, H / 2 - 52, W, 92);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(0, H / 2 - 52, W, 3); ctx.fillRect(0, H / 2 + 37, W, 3);
    ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.font = `bold ${Math.round(40 - (1 - inA) * 12)}px sans-serif`;
    ctx.fillStyle = '#ffd2d2';
    ctx.strokeText('BOSS 등장!', W / 2, H / 2 - 8);
    ctx.fillText('BOSS 등장!', W / 2, H / 2 - 8);
    ctx.font = 'bold 20px sans-serif';
    ctx.lineWidth = 4;
    ctx.fillStyle = '#ffe9a0';
    ctx.strokeText(S.bannerName || '', W / 2, H / 2 + 24);
    ctx.fillText(S.bannerName || '', W / 2, H / 2 + 24);
    ctx.restore();
  }
  ctx.restore(); // 흔들림
}

// ==================== UI 연동 ====================

const $ = id => document.getElementById(id);
const overlayEl = $('overlay'), statsEl = $('stats'), hudEl = $('hud'), miniEl = $('mini-top');
const wrapEl = $('wrap'), stageEl = $('stage');

// 스테이지(16:9)와 HUD 폭을 화면에 맞춘다: 가로·세로 중 더 빡빡한 쪽에 맞추고 HUD 높이만큼 뺀다.
// HUD 는 스테이지와 같은 폭을 우선하되, 그 폭에서 두 줄로 접히면 화면 폭까지 넓혀 한 줄을 유지한다.
function fitStage() {
  const cs = getComputedStyle(wrapEl);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const gap = parseFloat(cs.rowGap) || 8;
  const availW = wrapEl.clientWidth - padX;
  const availH = wrapEl.clientHeight - padY;
  const maxW = Math.max(240, Math.min(availW, 1280));
  const hudHidden = hudEl.classList.contains('hidden');
  const setW = (el, w) => { const px = Math.floor(w) + 'px'; if (el.style.width !== px) el.style.width = px; };
  const hudH = () => hudHidden ? 0 : hudEl.offsetHeight + gap;
  const stageW = (h) => Math.max(240, Math.min(maxW, (availH - h) * 16 / 9));
  setW(hudEl, maxW);
  const wideH = hudH();
  let w = stageW(wideH);
  setW(hudEl, w);
  if (!hudHidden && hudEl.offsetHeight + gap > wideH + 1) setW(hudEl, maxW); // 좁히면 접히는 경우 → 넓은 폭 유지
  w = stageW(hudH());
  setW(stageEl, w);
}
window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', fitStage);
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => fitStage());
  ro.observe(wrapEl); ro.observe(hudEl);
}
fitStage();
const diceSlot = $('dice-slot'), diceImg = $('dice-img'), diceQ = $('dice-q');
const slotCanvas = $('slot-canvas'), sctx = slotCanvas.getContext('2d');
const rollBtn = $('roll-btn'), waveBtn = $('wave-btn');
const infoPanel = $('info-panel');
let diceURLs = [];
const starIconCache = {};
// 눈(1~6) 은 주사위 그림, 성(7~20) 은 코드로 만든 별 배지 아이콘
function dieIconURL(face) {
  if (face <= 6) return diceURLs[face - 1] || SRCS['d' + face];
  if (starIconCache[face]) return starIconCache[face];
  const def = TOWER_DEFS[face];
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 96, 96); gr.addColorStop(0, def.color); gr.addColorStop(1, '#1a1428');
  g.fillStyle = gr; g.beginPath(); g.roundRect(6, 6, 84, 84, 18); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
  g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('★' + face, 48, 50);
  return (starIconCache[face] = cv.toDataURL());
}

function syncUI() {
  $('gold-val').textContent = S.gold;
  $('lives-val').textContent = S.lives;
  const sd = S.stageData;
  if (S.mode === 'infinity') $('wave-val').textContent = `∞ 웨이브 ${S.wave} · 최고 ${SAVE.infBest || 0}`;
  else $('wave-val').textContent = `S${S.stage}${sd && sd.tierName ? ' ' + sd.tierName : ''} · 웨이브 ${S.wave} / ${S.stageWaves}`;
  $('wave-val').style.color = sd && sd.tierColor ? sd.tierColor : '';
  syncInfPanel();
  const heldInfo = $('held-info');
  if (S.heldDie) {
    const def = TOWER_DEFS[S.heldDie];
    diceSlot.classList.add('has-die');
    diceImg.src = dieIconURL(S.heldDie);
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

// 인피니티 강화 패널 (HUD)
function syncInfPanel() {
  const panel = $('inf-panel');
  if (!panel) return;
  const on = S.mode === 'infinity' && S.phase === 'playing' && S.inf;
  panel.classList.toggle('hidden', !on);
  const gachaEl = $('inf-gacha'); if (gachaEl) gachaEl.classList.toggle('hidden', !on);
  const brk = $('hud-break'); if (brk) brk.classList.toggle('hidden', !on);
  if (!on) return;
  const d = DP();
  $('inf-sp').textContent = S.inf.sp;
  for (let f = 1; f <= 6; f++) {
    const btn = $('inf-face-' + f);
    if (!btn) continue;
    const lv = S.inf.power[f] || 0;
    const maxed = lv >= d.maxLv;
    const cost = maxed ? 0 : d.cost(lv);
    btn.querySelector('.inf-lv').textContent = maxed ? 'MAX' : `Lv${lv}`;
    btn.querySelector('.inf-cost').textContent = maxed ? '—' : `${cost} SP`;
    btn.disabled = maxed || S.inf.sp < cost || !unlockedFaces().includes(f);
    btn.classList.toggle('maxed', maxed);
    btn.title = `${TOWER_DEFS[f].name} · 피해 ×${d.dmgMult(lv).toFixed(2)} · 사거리 +${d.rangeAdd(lv)} · ${d.special[f].label} (${d.tier(lv)}단계)`;
  }
  // 보물상자 + 주사위 가방
  const gacha = $('inf-gacha');
  if (gacha) {
    gacha.classList.remove('hidden');
    const cost = chestCost();
    const cb = $('chest-btn');
    cb.querySelector('small').textContent = `${cost} G`;
    cb.disabled = S.gold < cost;
    const ch = chestDef();
    for (const k of ['d1', 'd4', 'd6', 'd8', 'd12', 'd20']) {
      const b = $('bag-' + k); if (!b) continue;
      const n = (S.inf.bag && S.inf.bag[k]) || 0;
      b.querySelector('.bag-n').textContent = n;
      b.classList.toggle('empty', n === 0);
      b.disabled = n === 0 || SLOT.active || !!S.heldDie || DIE.state !== 'tray';
      b.title = ch ? `${ch.label[k]} — 굴리면 1~${ch.sides[k]} 성 타워` : k;
    }
  }
}

function syncWaveBtn() {
  if (S.phase !== 'playing' || (S.wave >= S.stageWaves && !S.waveActive)) { waveBtn.disabled = true; waveBtn.textContent = '웨이브 종료'; return; }
  waveBtn.disabled = S.waveActive;
  waveBtn.textContent = S.waveActive
    ? `웨이브 ${S.wave} 진행 중`
    : (S.wave === 0 ? '웨이브 시작' : `다음 웨이브 (${Math.ceil(S.autoT)}초)`);
}

function syncInfo() {
  if (!S.selTower) { infoPanel.classList.add('hidden'); return; }
  const t = S.selTower;
  infoPanel.classList.remove('hidden');
  $('info-dice').src = dieIconURL(t.face);
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
  $('lobby').classList.add('hidden');
  $('stage-select').classList.add('hidden');
  $('shop').classList.add('hidden');
  statsEl.classList.add('hidden');
  hudEl.classList.add('hidden');
  miniEl.classList.add('hidden');
  overlayEl.classList.remove('hidden');
}

// ==================== 화면 전환 (로비 / 스테이지선택 / 상점 / 플레이) ====================
function showScreen(name) {
  overlayEl.classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('stage-select').classList.add('hidden');
  $('shop').classList.add('hidden');
  statsEl.classList.add('hidden');
  hudEl.classList.add('hidden');
  miniEl.classList.add('hidden');
  if (name === 'title' || name === 'result') overlayEl.classList.remove('hidden');
  else if (name === 'lobby') { $('lobby').classList.remove('hidden'); renderLobby(); }
  else if (name === 'stageSelect') { $('stage-select').classList.remove('hidden'); renderStageSelect(); }
  else if (name === 'shop') { $('shop').classList.remove('hidden'); renderShop(); }
  else if (name === 'playing') { statsEl.classList.remove('hidden'); hudEl.classList.remove('hidden'); miniEl.classList.remove('hidden'); }
}
function gotoLobby() { S.phase = 'lobby'; showScreen('lobby'); }
function gotoStageSelect() { S.phase = 'stageSelect'; showScreen('stageSelect'); }
function gotoShop() { S.phase = 'shop'; showScreen('shop'); }

function syncInfButtons() {
  const ok = infinityUnlocked();
  const btn = $('btn-infinity');
  if (btn) {
    btn.disabled = !ok;
    btn.classList.toggle('locked', !ok);
    btn.innerHTML = ok ? '&#8734; 인피니티 · 무한 투기장' : '&#128274; 인피니티 · 무한 투기장';
  }
  const banner = $('ss-inf-btn');
  if (banner) {
    banner.disabled = !ok;
    banner.classList.toggle('locked', !ok);
    banner.textContent = ok
      ? '∞ 인피니티 · 무한 투기장 입장'
      : '🔒 인피니티 · 무한 투기장 — 50 스테이지 클리어 후 해금';
  }
  const info = $('lobby-inf');
  if (info) {
    info.innerHTML = ok
      ? `무한 투기장 최고 기록 <b>${SAVE.infBest || 0}</b> 웨이브${(SAVE.infRuns || []).length ? ` · 최근 ${SAVE.infRuns.slice(0, 3).map(r => r.wave).join(' / ')}` : ''}`
      : `인피니티는 로비 아래 <b>분홍 버튼</b>입니다. 50 스테이지를 모두 깨면 열립니다 (현재 ${SAVE.cleared.length}/50).`;
  }
}

function renderLobby() {
  $('lobby-gems').textContent = SAVE.gems;
  $('lobby-progress').innerHTML = `클리어 <b>${SAVE.cleared.length}</b> / 50 스테이지 · 해금 타워 <b>${unlockedFaces().length}</b>/6`;
  syncInfButtons();
}

function renderStageSelect() {
  $('ss-gems').textContent = SAVE.gems;
  syncInfButtons();
  const grid = $('stage-grid');
  grid.innerHTML = '';
  const C = window.DKCONTENT;
  if (!C || !C.stages) return;
  const legend = $('tier-legend');
  if (legend && C.tiers) {
    legend.innerHTML = C.tiers.map((T) => {
      const laneTxt = T.lanes.map((k) => ({ ground: '흙길', ground2: '흙길2', air: '하늘길', tunnel: '땅굴' }[k] || k)).join('+');
      return `<span class="tier-pill" style="--tc:${T.color}">T${T.tier} ${T.name} <small>${laneTxt} · 석단 +${T.extraSpots}</small></span>`;
    }).join('');
  }
  for (let n = 1; n <= 50; n++) {
    const sd = C.stages[n - 1];
    const cell = document.createElement('button');
    cell.className = 'stage-cell';
    const unlocked = stageUnlocked(n);
    const cleared = stageCleared(n);
    if (!unlocked) cell.classList.add('locked');
    if (cleared) cell.classList.add('cleared');
    if (n === S.stage) cell.classList.add('current');
    cell.classList.add('tier-' + (sd.tier || 1));
    let html = `<span>${n}</span>`;
    if (cleared) html += '<span class="clear-mark">&#10003;</span>';
    if (!unlocked) html += '<span class="lock">&#128274;</span>';
    html += `<span class="cell-name">${sd.name}</span>`;
    cell.innerHTML = html;
    const themeName = C.themeForStage ? C.themeForStage(n).name : '';
    cell.title = `${sd.name} · ${themeName} 테마 · ${sd.tierName || ''} 티어 · 동선 ${sd.lanes || 1} · 웨이브 ${sd.waves}`;
    if (unlocked) cell.addEventListener('click', () => startStage(n));
    grid.appendChild(cell);
  }
}

function skinThumb(key) {
  const art = A[key];
  if (art && art.cv && art.h > 8) { try { return thumbURL(art, 64, SRCS[key]); } catch (e) { /* fallback */ } }
  return SRCS[key];
}

function renderShop() {
  $('shop-gems').textContent = SAVE.gems;
  const C = window.DKCONTENT;
  if (!C) return;
  const towersEl = $('shop-towers');
  towersEl.innerHTML = '';
  for (let f = 1; f <= 6; f++) {
    const def = TOWER_DEFS[f];
    const owned = SAVE.unlockedTowers.includes(f);
    const cost = TOWER_COST[f] || 0;
    const card = document.createElement('div');
    card.className = 'shop-tower' + (owned ? '' : ' locked');
    const img = diceURLs[f - 1] || SRCS['d' + f];
    card.innerHTML = `<img src="${img}" alt=""><div class="t-name">${f}눈 · ${def.name}</div>`;
    if (owned) {
      const s = document.createElement('div'); s.className = 'owned'; s.textContent = '보유중';
      card.appendChild(s);
    } else {
      const btn = document.createElement('button');
      btn.innerHTML = `&#128142; ${cost}`;
      btn.disabled = SAVE.gems < cost;
      btn.addEventListener('click', () => buyTower(f, cost));
      card.appendChild(btn);
    }
    towersEl.appendChild(card);
  }
  const skinsEl = $('shop-skins');
  skinsEl.innerHTML = '';
  const letters = C.skinLetters || ['a', 'b', 'c', 'd', 'e'];
  for (let f = 1; f <= 6; f++) {
    const face = document.createElement('div');
    face.className = 'skin-face';
    face.innerHTML = `<div class="face-title">${f}눈 · ${TOWER_DEFS[f].name}</div>`;
    const list = document.createElement('div');
    list.className = 'skin-list';
    (C.towerSkins[f] || []).forEach((sk, idx) => {
      const letter = sk.letter || letters[idx];
      const ownedSkin = (SAVE.unlockedSkins[f] || []).includes(letter);
      const equipped = (SAVE.equippedSkin[f] || 'a') === letter;
      const cell = document.createElement('div');
      cell.className = 'skin-cell' + (equipped ? ' equipped' : '') + (ownedSkin ? '' : ' faded');
      cell.innerHTML = `<img src="${skinThumb(sk.key)}" alt="">`;
      const btn = document.createElement('button');
      if (!ownedSkin) {
        btn.innerHTML = `&#128142; ${SKIN_COST}`;
        btn.disabled = SAVE.gems < SKIN_COST;
        btn.addEventListener('click', () => buySkin(f, letter));
      } else if (equipped) {
        btn.textContent = '장착됨';
        btn.disabled = true;
      } else {
        btn.textContent = '장착';
        btn.addEventListener('click', () => equipSkin(f, letter));
      }
      cell.appendChild(btn);
      list.appendChild(cell);
    });
    face.appendChild(list);
    skinsEl.appendChild(face);
  }
}

function buyTower(f, cost) {
  if (SAVE.unlockedTowers.includes(f) || SAVE.gems < cost) return;
  SAVE.gems -= cost;
  SAVE.unlockedTowers.push(f);
  SAVE.unlockedTowers.sort((a, b) => a - b);
  saveSave();
  SFX.coin();
  renderShop();
}
function buySkin(f, letter) {
  if (SAVE.gems < SKIN_COST) return;
  const arr = SAVE.unlockedSkins[f] || (SAVE.unlockedSkins[f] = []);
  if (arr.includes(letter)) return;
  SAVE.gems -= SKIN_COST;
  arr.push(letter);
  SAVE.equippedSkin[f] = letter;
  saveSave();
  SFX.coin();
  renderShop();
}
function equipSkin(f, letter) {
  if (!(SAVE.unlockedSkins[f] || []).includes(letter)) return;
  SAVE.equippedSkin[f] = letter;
  saveSave();
  SFX.place();
  renderShop();
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
    S.towers.push({ face: S.heldDie, def, lvl: 1, spot: idx, x: sx, y: sy, cd: 0, skin: equippedSkinIndex(S.heldDie) });
    S.fxs.push({ kind: 'circle', x: sx, y: sy + 4, t: 0, dur: 0.85, size: 120, color: def.color, pips: S.heldDie });
    S.fxs.push({ kind: 'ring', x: sx, y: sy - 30, t: 0, dur: 0.5, size: 70, color: def.color });
    S.fxs.push({ kind: 'impact', x: sx, y: sy - 30, t: 0, dur: 0.28, size: 70 });
    S.texts.push({ str: def.name + '!', x: sx, y: sy - 90, t: 0, color: def.color });
    S.heldDie = 0;
    SFX.place();
  } else if (existing.face === S.heldDie) {
    if (existing.lvl < MAX_LVL) {
      existing.lvl++;
      S.heldDie = 0;
      S.fxs.push({ kind: 'circle', x: existing.x, y: existing.y + 4, t: 0, dur: 1.1, size: 150, color: '#ffe27a', pips: existing.face, merge: true, spin: 1 });
      S.fxs.push({ kind: 'ring', x: existing.x, y: existing.y - 40, t: 0, dur: 0.5, size: 80, color: existing.def.color });
      for (let i = 0; i < 12; i++) {
        const a = Math.PI * 2 * i / 12;
        S.fxs.push({ kind: 'sparkle', x: existing.x, y: existing.y - 30, vx: Math.cos(a) * 80, vy: Math.sin(a) * 40 - 70, t: 0, dur: 0.6, size: 3 });
      }
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
  ghostDie.src = dieIconURL(S.heldDie);
  ghostTower.src = SRCS['t' + Math.min(6, S.heldDie)];
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
  else if (S.mode === 'infinity' && ev.key >= '1' && ev.key <= '6') upgradeFace(parseInt(ev.key, 10));
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
  if (S.phase === 'over' || S.phase === 'win' || S.phase === 'stageClear') {
    if (S.mode === 'infinity') { S.mode = 'stage'; S.inf = null; gotoLobby(); } else gotoStageSelect();
    return;
  }
  // 타이틀 → 로비 (?start=inf 이면 바로 인피니티)
  if (window.DKAUTOSTART === 'inf' && infinityUnlocked()) { window.DKAUTOSTART = null; startInfinity(); return; }
  gotoLobby();
});
$('btn-stage-select').addEventListener('click', () => { audio(); gotoStageSelect(); });
$('btn-infinity').addEventListener('click', () => { if (!infinityUnlocked()) return; audio(); startInfinity(); });
const ssInf = $('ss-inf-btn');
if (ssInf) ssInf.addEventListener('click', () => { if (!infinityUnlocked()) return; audio(); startInfinity(); });
for (let f = 1; f <= 6; f++) { const b = $('inf-face-' + f); if (b) b.addEventListener('click', () => upgradeFace(f)); }
if ($('chest-btn')) $('chest-btn').addEventListener('click', () => { audio(); buyChest(); });
for (const k of ['d1', 'd4', 'd6', 'd8', 'd12', 'd20']) { const b = $('bag-' + k); if (b) b.addEventListener('click', () => { audio(); rollBagDie(k); }); }
$('btn-shop').addEventListener('click', () => { audio(); gotoShop(); });
$('ss-back').addEventListener('click', () => gotoLobby());
$('shop-back').addEventListener('click', () => gotoLobby());
// 어두운 배경을 누르면 로비로 (상점에 갇히지 않게)
['shop', 'stage-select'].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener('click', (e) => { if (e.target === el) gotoLobby(); });
});
$('exit-btn').addEventListener('click', () => {
  if (S.phase !== 'playing') return;
  if (S.mode === 'infinity') { endInfinity(); return; } // 포기 = 런 종료 (기록 저장)
  gotoStageSelect();
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
  const pct = Math.max(0, Math.min(100, Math.round(pr * 100)));
  ctx.fillStyle = '#0d0b09';
  ctx.fillRect(0, 0, W, H);
  const load = $('ov-load');
  const bar = $('ov-load-bar');
  const txt = $('ov-load-txt');
  const box = $('overlay-box');
  if (box) box.classList.add('loading');
  if (load) load.classList.remove('hidden');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = '에셋 불러오는 중… ' + pct + '%';
}

(async () => {
  drawLoading(0);
  $('ov-btn').disabled = true;
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
  loadSave();
  // 개발용 URL 플래그: ?unlock=all → 50 스테이지 클리어·타워 전부 해금 상태로 시작 (저장은 플레이 후 갱신될 때만)
  //                    ?start=inf  → 타이틀 버튼을 누르면 로비 대신 바로 인피니티 시작
  //                    ?inf=1      → 인피니티만 임시 개방 (50 스테이지 클리어 없이, 저장 데이터 변경 없음)
  const qs = new URLSearchParams(location.search);
  if (qs.get('unlock') === 'all' || window.__DK_UNLOCK_ALL) {
    SAVE.cleared = Array.from({ length: 50 }, (_, i) => i + 1);
    SAVE.unlockedTowers = [1, 2, 3, 4, 5, 6];
    if (SAVE.gems < 200) SAVE.gems = 200;
  }
  window.DKAUTOSTART = qs.get('start');
  window.DKINF_OPEN = qs.get('inf') === '1';   // ?inf=1 → 인피니티만 임시 개방 (스테이지 진행·저장은 그대로)
  // 디버그 훅 (콘솔): DK 게임 상태, DKA 스프라이트, DKDIE/DKSLOT 주사위, DKthrow 던지기, DKLANES 레인
  window.DK = S; window.DKA = A; window.DKDIE = DIE; window.DKSLOT = SLOT;
  window.DKthrow = (vx, vy) => { if (canRoll()) throwDie(vx, vy); };
  window.DKLANES = () => LANES;
  window.DKstart = startStage;
  window.DKstartInf = startInfinity;
  window.DKinf = () => S.inf;
  window.DKupgrade = upgradeFace;
  window.DKchest = buyChest; window.DKbag = () => S.inf && S.inf.bag; window.DKrollBag = rollBagDie; // 인피니티 갓챠 훅
  window.DKtowerSpr = towerSpr;
  window.DKplace = tryPlace;                      // 보유 주사위를 석단 idx 에 놓기
  window.DKroll = () => { if (S.phase === 'playing' && !S.heldDie && S.gold >= ROLL_COST) { S.gold -= ROLL_COST; S.heldDie = pickUnlockedFace(); syncUI(); return S.heldDie; } return 0; }; // 즉시 굴림 (테스트용)
  window.DKspots = () => SPOTS;
  window.DKSAVE = SAVE;
  S.phase = 'title';
  const loadEl = $('ov-load');
  if (loadEl) loadEl.classList.add('hidden');
  const box = $('overlay-box');
  if (box) box.classList.remove('loading');
  $('ov-btn').disabled = false;
  $('ov-btn').textContent = '게임 시작';
  requestAnimationFrame(frame);
})();

})();
