'use strict';
(() => {

// 캔버스 크기는 맵이 정한다 (가로 아레나 1024×576 / 세로 아레나 720×1080 / 스테이지 1024×576).
// 그리기·좌표 변환이 전부 W·H 파라메트릭이라 값만 바꾸면 따라온다.
let W = 1024, H = 576;
// 캔버스 텍스트도 DOM 과 같은 서체를 쓴다. 웹폰트가 늦게 오면 로드 후 갈아끼운다.
let UI_FACE = '"Do Hyeon", "Noto Sans KR", "Malgun Gothic", sans-serif';
const uiFont = (px, weight) => `${weight || 'bold'} ${px}px ${UI_FACE}`;
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { /* 로드 완료 — 다음 프레임부터 반영된다 */ });
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function setCanvasSize(w, h) {
  if (!w || !h || (W === w && H === h && canvas.width === w)) return false;
  W = w; H = h;
  canvas.width = w; canvas.height = h;
  const st = document.getElementById('stage');
  if (st) st.style.setProperty('--ar', w + ' / ' + h);
  return true;
}

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
// 모든 타워는 공중 적을 때릴 수 있다 (canAir 는 전부 true — 공중 적의 기믹은 '동선 무시 직행'뿐)
const TOWER_DEFS = {
  1: { name: '궁수 주사위', desc: '속사 레이저',        dmg: 8,  rate: 0.50, range: 150, laser: true,                 canAir: true,  color: '#9fd463', topper: 'laserMuzzle', atk: 'vib' },
  2: { name: '대포 주사위', desc: '쌍포 광역 포격',     dmg: 22, rate: 1.60, range: 135, proj: 'shell',      pspd: 300, splash: 60, canAir: true,  color: '#e0862c', topper: 'muzzleFlash', atk: 'exp' },
  3: { name: '마법 주사위', desc: '자수정 마력탄',      dmg: 24, rate: 0.95, range: 165, proj: 'bolt',       pspd: 430, canAir: true,  color: '#b78bff', topper: 'bolt', atk: 'norm' },
  4: { name: '서리 주사위', desc: '사방 냉기 둔화',     dmg: 8,  rate: 0.80, range: 140, proj: 'frostShard', pspd: 400, slow: true, canAir: true, color: '#7fd4ff', topper: 'frostShard', atk: 'norm' },
  5: { name: '전격 주사위', desc: '연쇄 번개',          dmg: 16, rate: 1.10, range: 150, chain: true, canAir: true, color: '#ffe86b', topper: 'spark', atk: 'norm' },
  6: { name: '폭군 주사위', desc: '최강! 폭발 주사위 투척', dmg: 40, rate: 1.25, range: 175, proj: 'dieBomb', pspd: 340, splash: 55, canAir: true,  color: '#ff5555', topper: 'dieBomb', atk: 'exp' },
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
  // 메운디 등급 특전(인피니티): 14~17★ 에픽 = 방어 무시 + 락다운, 18~19★ 신화 = 공속 ×1.5, 20★ 태초 = 트랙 전체 스플래시 (일반형)
  const perk = g >= 20 ? 'primal' : g >= 18 ? 'myth' : g >= 14 ? 'epic' : null;
  const perkDesc = perk === 'primal' ? ' · 태초: 일반형, 트랙 전체 스플래시' : perk === 'myth' ? ' · 신화: 공속 ×1.5' : perk === 'epic' ? ' · 에픽: 방어 무시 + 락다운' : '';
  TOWER_DEFS[g] = {
    name: `${b.name} ★${g}`, desc: `${g}성 히든 타워 · 폭발 주사위 투척${perkDesc}`, star: g,
    dmg: Math.round(40 * Math.pow(1.28, k)), rate: +(1.25 * Math.pow(0.97, k)).toFixed(3), range: 175 + 5 * k,
    proj: 'dieBomb', pspd: 340 + 6 * k, splash: 55 + 4 * k, canAir: true, color: b.color, rainbow: !!b.rainbow, topper: 'dieBomb',
    atk: perk === 'primal' ? 'norm' : 'exp', perk,
  };
}
const ATK_NAME = { vib: '진동형', exp: '폭발형', norm: '일반형' };
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
  // 아레나는 캔버스를 화면 비율로 만든다 (레터박스 없이 화면을 다 쓴다). 트랙·보드 치수는 그대로, 중심만 옮겨 굽는다
  if (m && m.arena && C.layoutArena && typeof arenaCanvasForScreen === 'function') {
    const a = arenaCanvasForScreen(mapKey);
    C.layoutArena(m, a.w, a.h, a.inset);
  }
  if (m && m.canvas) setCanvasSize(m.canvas[0], m.canvas[1]); else setCanvasSize(1024, 576);
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
  if (m && m.loopAt != null && LANES[0]) LANES[0].loopAt = m.loopAt; // 인피니티: 경로 끝 → loopAt 으로 되돌아가 무한 순환 (어느 분기로 만들었든)
  if (S && S.towers) {
    for (const t of S.towers) {
      if (t.spot >= 0 && t.spot < SPOTS.length) {
        t.x = SPOTS[t.spot][0];
        t.y = SPOTS[t.spot][1];
      }
    }
  }
  ARENA = (m && m.renderRoads) ? { center: m.center || (m.noGoal ? null : [W / 2, H / 2]), noGoal: !!m.noGoal, portals: m.portals || [], tiled: !!m.tiled, theme: m.theme || null, track: m.track || null } : null;
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
  // 아레나는 그리기용 폴리라인(m.roads: 입구·닫힌 트랙·출구)을 따로 쓴다 — 적 경로(path)는 트랙을 여러 바퀴 돌아 겹치기 때문
  const roadLanes = m.roads ? m.roads.map(pts => ({ kind: 'ground', pts })) : LANES;
  for (const lane of roadLanes) if (lane.kind === 'ground' || lane.kind === 'ground2') {
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
  }
  // 연석은 본체(0~43)를 덮었으므로 본체를 다시 그린다 (질감/석판 포함). 모든 연석 뒤에 그려야 입구·출구가 트랙에 매끈하게 붙는다
  for (const lane of roadLanes) if (lane.kind === 'ground' || lane.kind === 'ground2') {
    drawRoad(g, lane.pts, lane.kind === 'ground2' ? 7 : 3, [150, 132, 112], roadTex, true);
    if (!roadTex) drawSlabJoints(g, lane.pts, mulberry(0x5eed + 1));
  }
  // 4. 화로·기둥·잔해: 그림이 있으면 오브젝트, 없으면 코드
  if (m.track) {
    const brazier = art('prop-1'), pillar = art('prop-2'), rubble = art('prop-3');
    for (const [x, y] of arenaPillars(m)) {
      if (pillar) drawGroundSprite(g, pillar, x, y, 80); // 타워(116px)보다 확실히 작게
      else drawCodePillar(g, x, y);
    }
    for (const [x, y] of arenaBraziers(m)) {
      if (brazier) drawGroundSprite(g, brazier, x, y + 4, 56);
      else {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y + 6, 22, 10, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#4a4258'; g.beginPath(); g.ellipse(x, y, 20, 9, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#6a6078'; g.beginPath(); g.ellipse(x, y - 8, 15, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2a2436'; g.beginPath(); g.ellipse(x, y - 9, 10, 4, 0, 0, Math.PI * 2); g.fill();
      }
    }
    if (rubble) for (const [x, y] of [[W * 0.16, H * 0.19], [W * 0.84, H * 0.19], [W * 0.29, H * 0.95], [W * 0.71, H * 0.95]]) drawGroundSprite(g, rubble, x, y, 48, rnd() < 0.5);
  }
  // 5. 시작·도착 그림 (있으면 포탈 그림·크리스탈 대신)
  const st = art('start'), en = art('end');
  if (st && m.portals) for (const p of m.portals) drawGroundSprite(g, st, p[0], p[1] + 26, 84);
  if (en && m.center) drawGroundSprite(g, en, m.center[0], m.center[1] + 28, 128);
  // 6. 연석 바깥은 어둡게: 플레이 영역(보드·트랙)만 밝게 남겨 장식이 타워로 읽히지 않게 한다
  if (m.track) dimOutsideTrack(g, m);
  if (ARENA) { ARENA.hasStart = !!st; ARENA.hasEnd = !!en; ARENA.brazierArt = !!brazierArtFlag(m); }
  return cv;
}
// 임시 캔버스에 어둠을 깔고 트랙+연석(+58px, 가장자리 번짐)을 뚫어서 얹는다. g 에 직접 destination-out 하면 바닥까지 뚫리므로 임시 캔버스를 쓴다.
function dimOutsideTrack(g, m) {
  const t = m.track, pad = 58;
  const ov = document.createElement('canvas'); ov.width = W; ov.height = H;
  const o = ov.getContext('2d');
  o.fillStyle = 'rgba(6,4,14,0.36)'; o.fillRect(0, 0, W, H);
  o.globalCompositeOperation = 'destination-out';
  o.shadowColor = '#000'; o.shadowBlur = 56; o.fillStyle = '#000';
  o.beginPath(); o.roundRect(t.L - pad, t.T - pad, t.R - t.L + pad * 2, t.B - t.T + pad * 2, t.rad + pad); o.fill();
  if (m.roads && t.mid != null) { // 입구·출구 길: 연석 옆은 밝고 화면 가장자리로 갈수록 어둠 속으로 사라진다
    o.shadowBlur = 28;
    const lane = (x0, x1) => { const gr = o.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = gr; o.fillRect(Math.min(x0, x1), t.mid - pad, Math.abs(x1 - x0), pad * 2); };
    lane(t.L, 30);
  }
  g.drawImage(ov, 0, 0);
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
    const gx = bd.gapX || 88, gy = bd.gapY || 72;   // 세로 아레나는 간격이 다르다
    for (let x = bd.x + gx; x < bd.x + bd.w - 1; x += gx) { g.beginPath(); g.moveTo(x, bd.y); g.lineTo(x, bd.y + bd.h); g.stroke(); }
    for (let y = bd.y + gy; y < bd.y + bd.h - 1; y += gy) { g.beginPath(); g.moveTo(bd.x, y); g.lineTo(bd.x + bd.w, y); g.stroke(); }
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
// 캔버스 좌우 가장자리의 돌 기둥 4개: 연석에서 ≥100px 떨어뜨려 타워와 헷갈리지 않게 (HUD 칩 아래)
function arenaPillars(m) {
  const t = m.track; if (!t) return [];
  // 트랙 바깥 네 귀퉁이. 입구 길(y = mid)과 겹치지 않게 위·아래로 비켜선다
  const x0 = Math.max(30, t.L / 2), x1 = W - x0;
  const y0 = Math.max(60, t.T * 0.72), y1 = Math.min(H - 30, t.B + (H - t.B) * 0.5);
  return [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
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
  // 기둥 안쪽, 트랙 좌우 바깥. 역시 입구 길 높이를 피한다
  const x0 = Math.max(60, t.L * 0.62), x1 = W - x0;
  const y0 = t.T + (t.mid - t.T) * 0.35, y1 = t.B - (t.B - t.mid) * 0.35;
  return [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
}
function drawArenaBraziers() {
  if (!ARENA || !ARENA.track) return;
  for (const [x, y] of arenaBraziers({ track: ARENA.track })) {
    const f = Math.sin(S.time * 9 + x) * 3, f2 = Math.sin(S.time * 13 + y) * 2;
    ctx.save();
    ctx.translate(x, y - (ARENA.brazierArt ? 44 : 12)); // 그림 화로는 그릇이 위에 있다
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
  if (!ARENA || ARENA.noGoal) return;
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
  if (d <= 0) { const s = segs[0]; return { x: s.ax, y: s.ay, dx: (s.bx - s.ax) / s.len, dy: (s.by - s.ay) / s.len }; }
  for (const s of segs) {
    if (d <= s.acc + s.len) {
      const t = (d - s.acc) / s.len;
      return { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t, dx: (s.bx - s.ax) / s.len, dy: (s.by - s.ay) / s.len };
    }
  }
  const s = segs[segs.length - 1];
  return { x: s.bx, y: s.by, dx: (s.bx - s.ax) / s.len, dy: (s.by - s.ay) / s.len };
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
const DIR_ART = window.DKDirectionalArt;
const directionalArt = DIR_ART ? DIR_ART.create({ base: BASE, budget: 96 * 1024 * 1024, concurrency: 2 }) : null;
let directionalDemandAt = -Infinity;
function directionalFutureIds(wave) {
  const out = [], inf = window.DKCONTENT && DKCONTENT.INFINITY;
  if (!inf) return out;
  for (let w = Math.max(1, wave); w < Math.max(1, wave) + 3; w++) {
    const n = (w - 1) % 101 + 1, m = inf.monsters[n];
    if (!m) continue;
    const stem = (m.boss ? 'b' : 'w') + String(n).padStart(3, '0');
    out.push(stem); if (m.boss && m.second) out.push(stem + '-2');
  }
  return out;
}
function directionalDrawHeight(e, baseHeight) {
  // A long-bodied rat should not be as tall as a humanoid in the same combat class.
  // Share this presentation scale with spectators; drawHeight also sets the visual stride.
  const characterScale = e.artAssetId === 'w001' ? 0.5 : 1;
  return baseHeight * characterScale * (e.bossRole === 1 ? 0.7 : 1) * (e.isElite ? 1.2 : 1);
}
function directionalPhase(e) {
  if (e.view && Number.isFinite(e.viewPhase)) return e.viewPhase;
  const entry = directionalArt && directionalArt.entry(e.artAssetId);
  const stride = entry && entry.cycleStride * e.drawHeight / entry.referenceHeight;
  if (stride > 0) return DIR_ART.phase(e.artWalkDistance || 0, stride);
  return entry ? DIR_ART.phase(e.animT || 0, entry.cycleSeconds || entry.views.side.frames / 5) : ((e.animT || 0) * 5 % 8) / 8;
}
function refreshDirectionalDemand(force) {
  if (!directionalArt) return;
  const now = performance.now();
  if (!force && now - directionalDemandAt < 120) return;
  directionalDemandAt = now;
  const playing = S.mode === 'infinity' && (S.phase === 'playing' || S.phase === 'spectate');
  const actors = playing ? S.enemies.concat(VIEW.pid ? VIEW.enemies : []) : [];
  const active = actors.filter(e => !e.dead && e.artAssetId && directionalArt.entry(e.artAssetId)).map(e => {
    const p = posAt(e.dist, e.lane || 0);
    e.artDirection = DIR_ART.direction(p.dx, p.dy, e.artDirection);
    return { id: e.artAssetId, view: e.artDirection };
  });
  const future = playing && S.phase === 'playing' ? directionalFutureIds(S.wave || 1) : [];
  if (playing && VIEW.pid && VIEW.sum) future.push(...directionalFutureIds(VIEW.sum.w || 1));
  const retained = playing ? S.corpses.map(c => c.fr && c.fr.cacheKey).filter(Boolean) : [];
  directionalArt.demand(active, future, retained);
}
const SRCS = {
  map: BASE + 'map/battlefield.jpg',
  gold: BASE + 'ui/gold.png', heart: BASE + 'ui/heart.png',
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
  // 획득 연출 아트 (ART-PROMPTS §7.8) — 없으면 코드 그림으로 폴백
  acquireBurst: BASE + 'vfx/acquire-burst-2x2.png', acquireRing: BASE + 'vfx/acquire-ring.png', acquireRingRainbow: BASE + 'vfx/acquire-ring-rainbow.png',
  acquireColumn: BASE + 'vfx/acquire-column.png', confetti: BASE + 'vfx/confetti-2x2.png', starSpark: BASE + 'vfx/star-spark.png', chestOpen: BASE + 'vfx/chest-open-2x2.png',
  uiFrame: BASE + 'ui/frame-panel.png',   // 있으면 body.ui-art (HUD 프레임 그림 사용)
  portal: BASE + 'props/portal.png',
  crystal: BASE + 'props/crystal.png',
  chest: BASE + 'ui/chest.png',
};
for (let g = 7; g <= 20; g++) SRCS['tStar' + g] = BASE + `casual/towers/star-${String(g).padStart(2, '0')}.png?v=93`; // 없으면 6눈 스킨으로 폴백
const DICE_SKINS = window.DKCONTENT.DICE_SKINS;
for (const skin of Object.values(DICE_SKINS.skins)) {
  SRCS[skin.materialKey] = BASE + skin.material + '?v=' + skin.version;
  if (skin.cubeMaterialKey) SRCS[skin.cubeMaterialKey] = BASE + skin.cubeMaterial + '?v=' + skin.cubeMaterialVersion;
}
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
  // 인피니티 101웨이브 새 그림 (준비된 웨이브만 — content.js INF_ART_READY)
  if (DKCONTENT.INFINITY && DKCONTENT.INFINITY.artList) for (const a of DKCONTENT.INFINITY.artList()) SRCS[a.key] = BASE + a.src;
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

// 시트 → 칸 배열. opt.cols×opt.rows 격자(기본 2x2, 왼쪽→오른쪽, 위→아래).
// opt.stabilize (인피니티 걷기 시트): AI 가 뽑은 시트는 칸마다 캐릭터 크기·발 위치·가로 위치가 조금씩 달라(높이 10~30%, 발 5~15%)
// 같은 높이로 그리면 '커졌다 작아졌다 · 앞뒤로 미끄러짐' 으로 보인다. 칸별 실루엣을 재서 (1) 실루엣 넓이로 크기를 ±15% 안에서 보정하고
// (2) 발끝을 공통 바닥선에 (3) 무게중심 x 를 공통 축에 맞춘 뒤 같은 크기의 칸으로 굽는다. tools/lib/sheet.mjs 와 같은 규칙.
// 폭발·연출 시트와 구 로스터 시트(뛰는 동작이 의도된 것)는 안정화하지 않고 합집합 상자로만 자른다.
function processSheet(img, opt) {
  if (img.missing) return null;
  const cols = (opt && opt.cols) || 2, rows = (opt && opt.rows) || 2;
  const cv = toCanvas(img);
  const g = cv.getContext('2d');
  const fw = img.width / cols, fh = img.height / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c * fw, r * fh]);
  try {
    const id = g.getImageData(0, 0, cv.width, cv.height);
    keyImageData(id, cv.width, cv.height);
    if (opt && opt.stabilize) for (const [cx, cy] of cells) dropEdgeFragments(id, cv.width, cx, cy, fw, fh);
    g.putImageData(id, 0, 0);
    const stats = cells.map(([cx, cy]) => cellStats(id, cv.width, cx, cy, fw, fh));
    if (opt && opt.stabilize && stats.every(s => s.n > 0)) return stabilizeCells(cv, cells, stats, fw, fh, opt.anchor);
    let u = null;
    for (const s of stats) {
      const local = { x: s.x0 - s.cx, y: s.y0 - s.cy, w: s.x1 - s.x0, h: s.y1 - s.y0 };
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

// 칸 테두리에 닿은 작은 조각(이웃 칸에서 넘어온 창끝·꼬리 — 실루엣의 3% 미만)을 지운다. 안정화 전에 불러 바운딩박스·무게중심이 조각에 끌리지 않게 한다.
function dropEdgeFragments(id, W, cx, cy, fw, fh) {
  const d = id.data;
  const X0 = Math.floor(cx), Y0 = Math.floor(cy), X1 = Math.floor(cx + fw), Y1 = Math.floor(cy + fh), w = X1 - X0, h = Y1 - Y0;
  const op = (x, y) => d[((Y0 + y) * W + X0 + x) * 4 + 3] > 28;
  let total = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (op(x, y)) total++;
  if (!total) return;
  const seen = new Uint8Array(w * h), stack = [];
  const edge = [];
  for (let x = 0; x < w; x++) edge.push([x, 0], [x, h - 1]);
  for (let y = 1; y < h - 1; y++) edge.push([0, y], [w - 1, y]);
  for (const [ex, ey] of edge) {
    if (seen[ey * w + ex] || !op(ex, ey)) continue;
    const px = []; stack.length = 0; stack.push(ey * w + ex); seen[ey * w + ex] = 1;
    while (stack.length) {   // 테두리에서 시작하는 연결 성분만 훑는다 (본체는 크므로 남긴다)
      const i = stack.pop(); px.push(i);
      const x = i % w, y = (i - x) / w;
      if (x > 0 && !seen[i - 1] && op(x - 1, y)) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && !seen[i + 1] && op(x + 1, y)) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && !seen[i - w] && op(x, y - 1)) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && !seen[i + w] && op(x, y + 1)) { seen[i + w] = 1; stack.push(i + w); }
    }
    if (px.length < total * 0.03) for (const i of px) { const x = i % w, y = (i - x) / w; d[((Y0 + y) * W + X0 + x) * 4 + 3] = 0; }
  }
}

// 칸 하나의 실루엣 통계 (시트 좌표, x1·y1 배타): 바운딩박스 · 픽셀 수 n · 무게중심 mx. α>28 을 실루엣으로 본다 (bbox 와 같은 기준).
function cellStats(id, W, cx, cy, fw, fh) {
  const d = id.data;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0, sx = 0, sy = 0;
  const X0 = Math.floor(cx), Y0 = Math.floor(cy), X1 = Math.floor(cx + fw), Y1 = Math.floor(cy + fh);
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    if (d[(y * W + x) * 4 + 3] <= 28) continue;
    n++; sx += x; sy += y;
    if (x < x0) x0 = x; if (x + 1 > x1) x1 = x + 1; if (y < y0) y0 = y; if (y + 1 > y1) y1 = y + 1;
  }
  if (!n) return { cx, cy, x0: X0, y0: Y0, x1: X1, y1: Y1, n: 0, mx: cx + fw / 2, my: cy + fh / 2 };
  return { cx, cy, x0, y0, x1, y1, n, mx: sx / n, my: sy / n };
}

// anchor 'foot'(기본) = 발끝을 바닥선에 · 'center' = 무게중심 y 를 맞춤 (날것: 날개가 내려간 칸은 맨 아래가 날개 끝이라 발 기준이면 몸이 튄다)
function stabilizeCells(cv, cells, stats, fw, fh, anchor) {
  const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor((s.length - 1) / 2)]; };
  const area = median(stats.map(s => s.n));
  const sc = stats.map(s => Math.min(1.15, Math.max(0.87, Math.sqrt(area / s.n))));   // 실루엣 넓이 기준 크기 보정 (±15% 안)
  const local = stats.map((s, i) => ({ x0: (s.x0 - s.cx) * sc[i], y0: (s.y0 - s.cy) * sc[i], x1: (s.x1 - s.cx) * sc[i], y1: (s.y1 - s.cy) * sc[i], mx: (s.mx - s.cx) * sc[i], my: (s.my - s.cy) * sc[i] }));
  const ay = (l) => (anchor === 'center' ? l.my : l.y1);
  const foot = median(local.map(ay)), axis = median(local.map(l => l.mx));
  const dx = local.map(l => axis - l.mx), dy = local.map(l => foot - ay(l));
  let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
  local.forEach((l, i) => { ux0 = Math.min(ux0, l.x0 + dx[i]); uy0 = Math.min(uy0, l.y0 + dy[i]); ux1 = Math.max(ux1, l.x1 + dx[i]); uy1 = Math.max(uy1, l.y1 + dy[i]); });
  const bw = Math.ceil(ux1 - ux0), bh = Math.ceil(uy1 - uy0);
  return cells.map(([cx, cy], i) => {
    const out = document.createElement('canvas');
    out.width = bw; out.height = bh;
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
    o.drawImage(cv, cx, cy, fw, fh, dx[i] - ux0, dy[i] - uy0, fw * sc[i], fh * sc[i]);
    return { cv: out, w: bw, h: bh };
  });
}

async function loadAssets(onProgress) {
  const keys = Object.keys(SRCS);
  const imgs = {};
  let done = 0;
  await Promise.all(keys.map(async k => {
    imgs[k] = await loadImage(SRCS[k]);
    onProgress(++done / keys.length * 0.6);
  }));
  const sheetOpt = {};
  const sheets = [
    'miteWalk', 'runnerWalk', 'huskWalk', 'bossWalk', 'impact',
    'cannonBlast', 'arcaneBurst', 'frostBurst', 'dieExplode', 'acquireBurst', 'confetti', 'chestOpen',
  ];
  if (window.DKCONTENT) {
    for (const b of DKCONTENT.bases) if (b.walk) sheets.push(b.walk);
    for (const b of DKCONTENT.bossBases) if (b.walk) sheets.push(b.walk);
    if (DKCONTENT.INFINITY && DKCONTENT.INFINITY.artList) for (const a of DKCONTENT.INFINITY.artList()) if (a.sheet) { sheets.push(a.key); sheetOpt[a.key] = { stabilize: a.stabilize !== false, anchor: a.anchor || 'foot' }; }
  }
  // 격자는 파일명 -walk-<열>x<행> 에서 (없으면 2x2). 안정화는 인피니티 새 시트만 (content.js infArtList 의 stabilize)
  for (const k of sheets) { const m = /-walk-(\d+)x(\d+)\.png/i.exec(SRCS[k] || ''); sheetOpt[k] = Object.assign({ cols: m ? +m[1] : 2, rows: m ? +m[2] : 2 }, sheetOpt[k] || {}); }
  const raw = ['map', ...Object.values(DICE_SKINS.skins).flatMap(skin => [skin.materialKey, skin.cubeMaterialKey].filter(Boolean))];
  if (window.DKCONTENT) for (const m of DKCONTENT.maps) if (m.src) raw.push(m.key);
  const isTexture = (k) => /^tl_.*_(floor|road|water|road-straight|board)$/.test(k); // 질감·바닥: 배경 제거 없이 그대로
  let pi = 0;
  for (const k of keys) {
    if (raw.includes(k) || isTexture(k)) A[k] = imgs[k];
    else if (sheets.includes(k)) A[k] = processSheet(imgs[k], sheetOpt[k]);
    else A[k] = processSprite(imgs[k]);
    onProgress(0.6 + (++pi / keys.length) * 0.4);
    await new Promise(r => setTimeout(r, 0));
  }
  if (A.uiFrame && !A.uiFrame.missing && A.uiFrame.w > 8) {
    document.body.classList.add('ui-art');   // 그림 아이콘(ui/icon-*.png) 사용
    // CSS 배경 아이콘은 처음 쓰일 때 받는다 → 배속을 x2 로 바꾸는 순간 아이콘이 잠깐 비었다. 전부 미리 받아 둔다 (23장, 장당 ~5KB)
    window.__iconCache = ['speed1', 'speed2', 'speed3', 'sound', 'mute', 'chat', 'menu', 'close', 'back', 'gear', 'help', 'chest', 'sell', 'enhance', 'trophy', 'infinity', 'users', 'shop', 'stage', 'copy', 'gem', 'dice', 'wave'].map((n) => { const im = new Image(); im.src = BASE + 'ui/icon-' + n + '.png'; return im; });
  }
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
  for (const k of Object.keys(starSpriteCache)) delete starSpriteCache[k]; // 에셋이 바뀌면 구워둔 성 타워도 다시 만든다
}

// ★7~20 전용 그림(star-NN.png)이 아직 없다. 6눈 스킨을 밴드색으로 물들이고 밴드별 장식을 얹어
// "6눈보다 강해 보이는" 몸통을 성마다 한 번만 구워 캐시한다. PNG 가 들어오면 buildTowerSprites 가 그쪽을 쓴다.
const starSpriteCache = {};
function buildStarSprite(g, skinIdx) {
  const key = g + ':' + (skinIdx || 0);
  if (starSpriteCache[key]) return starSpriteCache[key];
  const base = (towerSprites[6] || [])[((skinIdx || 0) % ((towerSprites[6] || []).length || 1))] || compositeFallback(6);
  const band = starBand(g), k = g - 6;             // k = 1(★7) … 14(★20)
  const col = band.color;
  const padX = 26, padTop = 30, padBot = 10;
  const cv = document.createElement('canvas');
  cv.width = base.w + padX * 2; cv.height = base.h + padTop + padBot;
  const c = cv.getContext('2d');
  const cx = cv.width / 2, baseY = padTop + base.baseY;
  const grow = Math.min(1, k / 14);                 // 등급이 오를수록 장식이 커진다

  // --- 받침: 밴드색 룬 링 (성이 오를수록 굵고 밝다) ---
  c.save();
  c.translate(cx, baseY + 2);
  c.scale(1, 0.42);
  for (let i = 0; i < 2; i++) {
    c.beginPath(); c.arc(0, 0, 30 + i * 7 + grow * 7, 0, Math.PI * 2);
    c.strokeStyle = col; c.globalAlpha = 0.5 - i * 0.2; c.lineWidth = 3 + grow * 2;
    c.shadowColor = col; c.shadowBlur = 14; c.stroke();
  }
  c.restore();

  // --- 밴드 장식 (몸통 뒤) ---
  c.save();
  c.translate(cx, baseY);
  c.shadowColor = col; c.shadowBlur = 12; c.strokeStyle = col; c.fillStyle = col;
  if (band.min === 7) {                             // 별빛 첨탑: 뒤로 솟은 청색 크리스탈 + 별 조각
    const hgt = 26 + k * 9;
    for (const sx of [-30, 30]) {
      c.beginPath();
      c.moveTo(sx, -6); c.lineTo(sx - 7, -hgt * 0.55); c.lineTo(sx, -hgt); c.lineTo(sx + 7, -hgt * 0.55);
      c.closePath(); c.globalAlpha = 0.85; c.fill();
      c.globalAlpha = 1; c.lineWidth = 2; c.stroke();
    }
    c.globalAlpha = 0.95;
    for (let i = 0; i < 3 + k; i++) {
      const a = i * 1.7, r = 30 + (i % 3) * 9;
      starPoly(c, Math.cos(a) * r, -34 - (i % 4) * 12, 3.2 + (i % 2));
    }
  } else if (band.min === 11) {                     // 성운 요새: 궤도 링 (등급마다 +1)
    for (let i = 0; i <= g - 11; i++) {
      c.save(); c.rotate(-0.5 + i * 0.42); c.scale(1, 0.34);
      c.beginPath(); c.arc(0, -46, 34 + i * 8, 0, Math.PI * 2);
      c.globalAlpha = 0.75; c.lineWidth = 3; c.stroke(); c.restore();
    }
  } else if (band.min === 15) {                     // 천공 옥좌: 금빛 날개 + 후광
    for (const dir of [-1, 1]) {
      c.beginPath();
      c.moveTo(dir * 12, -34);
      c.quadraticCurveTo(dir * (46 + k * 2), -74, dir * (30 + k), -14);
      c.quadraticCurveTo(dir * 26, -34, dir * 12, -34);
      c.globalAlpha = 0.8; c.fill();
    }
    c.globalAlpha = 0.9; c.lineWidth = 3;
    c.beginPath(); c.arc(0, -84, 20 + grow * 6, 0, Math.PI * 2); c.stroke();
  } else {                                          // 차원 군주: 공허 오벨리스크 + 무지개 균열
    c.globalAlpha = 0.9;
    c.beginPath(); c.moveTo(-16, -8); c.lineTo(-11, -96); c.lineTo(0, -112); c.lineTo(11, -96); c.lineTo(16, -8);
    c.closePath(); c.fillStyle = '#160d20'; c.fill(); c.lineWidth = 2.5; c.stroke();
    for (let i = 0; i < 5; i++) {
      c.beginPath(); c.moveTo(-9 + i * 4, -20 - i * 14); c.lineTo(4 - i * 3, -34 - i * 14);
      c.strokeStyle = `hsl(${i * 62}, 95%, 65%)`; c.lineWidth = 2; c.stroke();
    }
  }
  c.restore();

  // --- 몸통: 6눈 스킨을 밴드색으로 물들인다 (음영은 그대로 남긴다) ---
  const body = document.createElement('canvas');
  body.width = base.w; body.height = base.h;
  const bc = body.getContext('2d');
  bc.drawImage(base.cv, 0, 0);
  bc.globalCompositeOperation = 'color';
  bc.globalAlpha = 0.45 + grow * 0.3;
  bc.fillStyle = col; bc.fillRect(0, 0, base.w, base.h);
  bc.globalCompositeOperation = 'destination-in';   // 원래 실루엣만 남긴다
  bc.globalAlpha = 1;
  bc.drawImage(base.cv, 0, 0);
  c.save();
  c.shadowColor = col; c.shadowBlur = 10 + grow * 14;
  c.drawImage(body, padX, padTop);
  c.restore();

  // --- 앞쪽 장식: 떠 있는 작은 주사위 (등급이 오를수록 많다) ---
  const orb = Math.min(4, 1 + Math.floor(k / 4));
  c.save();
  c.translate(cx, baseY - 30);
  for (let i = 0; i < orb; i++) {
    const a = i * (Math.PI * 2 / orb) + 0.6, r = 34 + grow * 8;
    c.save();
    c.translate(Math.cos(a) * r, Math.sin(a) * r * 0.34);
    c.rotate(a);
    c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 10; c.globalAlpha = 0.9;
    c.fillRect(-4, -4, 8, 8);
    c.strokeStyle = '#fff'; c.globalAlpha = 0.7; c.lineWidth = 1; c.strokeRect(-4, -4, 8, 8);
    c.restore();
  }
  c.restore();

  const sp = { cv, w: cv.width, h: cv.height, cx, baseY, dedicated: true, star: g };
  starSpriteCache[key] = sp;
  return sp;
}
function starPoly(c, x, y, r) {                     // 작은 4갈래 별 조각
  c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

function towerSpr(face, skin) {
  if (face > 6 && !towerSprites[face]) return buildStarSprite(face, skin); // 전용 PNG 가 없으면 코드로 구운 성 타워
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
function towerVisualEmitter(t) {
  const xy = window.DKCONTENT && DKCONTENT.STAR_TOWER_EMITTERS && DKCONTENT.STAR_TOWER_EMITTERS[t.face];
  const sp = xy && towerSpr(t.face, t.skin);
  if (!xy || !sp || !sp.dedicated) return { x: t.x, y: t.y - 64 };
  const recoil = (t.kick || 0) ** 2;
  return { x: t.x + (xy[0] * sp.w - sp.cx) * (1 + recoil * 0.07),
    y: t.y + 6 + (xy[1] * sp.h - sp.baseY) * (1 - recoil * 0.09) };
}
function projectileDrawPosition(p) {
  const u = Math.max(0, Math.min(1, (p.visualAge || 0) / 0.1)), weight = (1 - u) ** 2;
  return { x: p.x + (p.launchOffset ? p.launchOffset[0] * weight : 0),
    y: p.y + (p.launchOffset ? p.launchOffset[1] * weight : 0) };
}

// ==================== 사운드 (WebAudio 신디사이저) ====================

// 버스: MASTER(음소거) ← SFX_BUS(효과음) · MUSIC_BUS(BGM, music.js 가 붙는다). 음량은 SAVE.audio 에 저장된다
let AC = null, MASTER = null, SFX_BUS = null, MUSIC_BUS = null;
function audio() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    MASTER = AC.createGain(); MASTER.connect(AC.destination);
    SFX_BUS = AC.createGain(); SFX_BUS.connect(MASTER);
    MUSIC_BUS = AC.createGain(); MUSIC_BUS.connect(MASTER);
    applyAudioSettings();
    if (window.DKBGM) { try { DKBGM.base = BASE; DKBGM.attach(AC, MUSIC_BUS); } catch (e) { console.warn('[bgm]', e); } }
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function applyAudioSettings() {
  const a = (SAVE && SAVE.audio) || { music: 0.6, sfx: 0.8, muted: false };
  S.muted = !!a.muted;
  if (MASTER) { MASTER.gain.value = a.muted ? 0 : 1; SFX_BUS.gain.value = a.sfx; MUSIC_BUS.gain.value = a.music; }
  const mb = $('mute-btn');
  if (mb) { mb.innerHTML = a.muted ? ICON_MUTE : ICON_SOUND; mb.classList.toggle('off', a.muted); mb.dataset.icon = a.muted ? 'mute' : 'sound'; }
  const sm = $('set-mute'); if (sm) sm.textContent = a.muted ? '🔇 음소거 해제' : '🔊 음소거';
  const sMusic = $('set-music'), sSfx = $('set-sfx');
  if (sMusic && document.activeElement !== sMusic) sMusic.value = a.music;
  if (sSfx && document.activeElement !== sSfx) sSfx.value = a.sfx;
}
// BGM 트랙 선택: 플레이 중 보스가 살아 있으면 boss, 아니면 battle. 그 외 화면은 lobby
const bossAlive = () => S.enemies.some(e => !e.dead && (e.isBoss || e.type === 'boss'));
function bgmFor() { return (S.phase === 'playing' || S.phase === 'spectate') ? (bossAlive() ? 'boss' : 'battle') : 'lobby'; }
function bgmSync() { if (window.DKBGM) { try { DKBGM.set(bgmFor()); } catch (e) { /* 무시 */ } } }
// 첫 제스처에서 오디오 컨텍스트를 깨우고 BGM 을 시작한다 (iOS·Chrome 자동재생 정책)
for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, function unlock() { try { audio(); bgmSync(); } catch (e) { /* 무시 */ } }, { once: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!window.DKBGM) return; try { if (document.hidden) DKBGM.suspend(); else DKBGM.resume(); } catch (e) { /* 무시 */ } });
function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
  if (S.muted || COSMETIC) return;
  try {
    const ac = audio();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g).connect(SFX_BUS || ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  } catch (e) { /* 무시 */ }
}
function noise(dur, vol = 0.2, lp = 1200) {
  if (S.muted || COSMETIC) return;
  try {
    const ac = audio();
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = ac.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(SFX_BUS || ac.destination);
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
  jackpot: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'triangle', 0.16), i * 90)); setTimeout(() => noise(0.5, 0.12, 7000), 120); },   // ★19~20 획득
};

// ==================== 게임 상태 ====================

const S = {
  phase: 'loading', // loading | title | lobby | stageSelect | shop | mpRoom | playing | spectate | over | win | stageClear
  gold: START_GOLD, lives: START_LIVES, wave: 0,
  enemies: [], towers: [], projs: [], beams: [], fxs: [], texts: [], corpses: [],
  spawnQ: [], waveActive: false, autoT: 0, waveT: 0,
  shakeT: 0, bannerT: 0, bannerName: '',
  heldDie: 0, dieFocus: true, selTower: null,
  mapKey: 'g1',
  stage: 1, stageData: null, stageWaves: 10,
  mode: 'stage', inf: null, // 'stage' | 'infinity', inf = { sp, power{1..6}, kills, spent }
  net: null,       // 멀티(함께하기) 중이면 { code, pid, seed, t0, timing, rivals, status, … } — 싱글은 항상 null. 웨이브·배속은 싱글과 똑같이 각자 진행한다
  speed: 1, muted: false, paused: false,
  time: 0, hurtT: 0, glowT: 0, glowColor: '',
  mouse: { x: -100, y: -100 },
};

// ==================== 저장 / 진행도 (localStorage) ====================
const SAVE_KEY = 'DKSAVE';
const TOWER_COST = { 1: 0, 2: 0, 3: 0, 4: 30, 5: 55, 6: 90 }; // 젬으로 해금 (1~3 기본)
const SKIN_COST = 20; // 스킨 1종 해금 비용(젬)

function defaultSave() {
  const skins = {}, equip = {};
  for (let f = 1; f <= 6; f++) { skins[f] = ['a']; equip[f] = 'a'; }
  return { cleared: [], gems: 40, unlockedTowers: [1, 2, 3], unlockedSkins: skins, equippedSkin: equip, infBest: 0, infRuns: [], infMilestones: [], infClears: 0,
           name: '', mp: { games: 0, wins: 0, best: 0 }, audio: { music: 0.6, sfx: 0.8, muted: false } };   // name: 멀티 닉네임 · mp: 함께하기 전적 · audio: 음량
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
      infClears: typeof s.infClears === 'number' ? s.infClears : 0,
      name: typeof s.name === 'string' ? s.name.slice(0, 12) : '',
      mp: Object.assign(d.mp, (s.mp && typeof s.mp === 'object') ? s.mp : {}),
      audio: Object.assign(d.audio, (s.audio && typeof s.audio === 'object') ? s.audio : {}),
    };
    const cl = (v, dv) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : dv);
    SAVE.audio = { music: cl(SAVE.audio.music, 0.6), sfx: cl(SAVE.audio.sfx, 0.8), muted: !!SAVE.audio.muted };
    // 기본 3종은 항상 해금 보장
    for (const f of [1, 2, 3]) if (!SAVE.unlockedTowers.includes(f)) SAVE.unlockedTowers.push(f);
    SAVE.unlockedTowers.sort((a, b) => a - b);
  } catch (e) { SAVE = defaultSave(); }
}
function saveSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* 무시 */ }
}
function stageUnlocked(n) { return n === 1 || SAVE.cleared.includes(n - 1); }
function infinityUnlocked() { return true; } // 인피니티는 스테이지 진행과 무관하게 처음부터 열려 있다
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
  if (face > 6) face = 6;              // ★ 타워는 6눈 몸통을 쓰므로 6눈 장착 스킨을 그대로 따른다
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
  const c = Math.max(-1, Math.min(1, (m[0] + m[4] + m[8] - 1) / 2));
  const skew = [m[7] - m[5], m[2] - m[6], m[3] - m[1]], skewLength = Math.hypot(...skew);
  const ang = Math.atan2(skewLength / 2, c);
  if (ang < 1e-4) return { axis: [0, 0, 1], ang: 0 };
  if (Math.PI - ang < 0.02) {
    // Near 180 degrees an individual off-diagonal mixes axis products with
    // sin(angle), so its sign can point to the wrong final face. Recover the
    // largest axis component first and use symmetric pairs for the others.
    const i = m[0] >= m[4] && m[0] >= m[8] ? 0 : m[4] >= m[8] ? 1 : 2;
    const axis = [0, 0, 0], t = 1 - c;
    axis[i] = Math.sqrt(Math.max(0, (m[i * 4] - c) / t));
    for (let j = 0; j < 3; j++) if (j !== i) axis[j] = (m[i * 3 + j] + m[j * 3 + i]) / (2 * t * axis[i]);
    const sign = axis.reduce((sum, v, j) => sum + v * skew[j], 0) < 0 ? -1 : 1;
    const scale = sign / Math.hypot(...axis);
    return { axis: axis.map(v => v * scale), ang };
  }
  return { axis: skew.map(v => v / skewLength), ang };
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
function texTri(g, img, s0x, s0y, s1x, s1y, s2x, s2y, d0, d1, d2, clipBleed = 0) {
  const den = s0x * (s1y - s2y) + s1x * (s2y - s0y) + s2x * (s0y - s1y);
  if (Math.abs(den) < 1e-8) return;
  g.save();
  g.beginPath();
  if (clipBleed) {
    // Sphere mesh neighbours share continuous UVs. Overlap only their clipping
    // masks by a subpixel amount; keep the affine UV transform unchanged.
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
    [d0, d1, d2].forEach((p, i) => { const k = 1 + clipBleed / (Math.hypot(p[0] - cx, p[1] - cy) || 1), x = cx + (p[0] - cx) * k, y = cy + (p[1] - cy) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  } else { g.moveTo(d0[0], d0[1]); g.lineTo(d1[0], d1[1]); g.lineTo(d2[0], d2[1]); }
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

// Rounded unit cube for drawing only. FACES remains the six logical result faces.
// The edge and corner grids use identical normalized integer barycentric weights.
function makeCubeRenderMesh(subdivisions) {
  const radius = .18, inner = 1 - radius, patches = [];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = a => { const length = Math.hypot(...a); return a.map(x => x / length); };
  const mean = values => values[0].map((_, i) => values.reduce((sum, v) => sum + v[i], 0) / values.length);
  // Welding also makes both sides of a seam use bit-identical point arrays.
  const welded = new Map();
  const weld = point => {
    const key = point.map(x => Math.round(x * 1e12)).join(',');
    if (!welded.has(key)) welded.set(key, point);
    return welded.get(key);
  };
  const add = (kind, val, inputPoints, inputNormals, face) => {
    const points = inputPoints.map(weld), normals = inputNormals.slice();
    const n = unit(mean(normals)), center = mean(points);
    if (dot(cross(sub(points[1], points[0]), sub(points[2], points[0])), n) < 0) {
      points.reverse(); normals.reverse();
    }
    // A fixed object-space projection for unmarked edge/corner material. It is
    // chosen during mesh construction, never from the animated camera rotation.
    const basis = face || FACES.reduce((best, f) => dot(f.n, n) > dot(best.n, n) ? f : best, FACES[0]);
    const uv = points.map(p => [.5 + .5 * dot(p, basis.u), .5 + .5 * dot(p, basis.v)]);
    const planeNormal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    patches.push({ val, points, normals, uv, n, planeNormal, center, kind });
  };

  for (const face of FACES) {
    const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
      face.n.map((x, i) => x + inner * (u * face.u[i] + v * face.v[i])));
    add('face', face.val, points, points.map(() => face.n.slice()), face);
  }

  // Twelve rounded edges. Each has two longitudinal endpoints for every normal
  // in the same barycentric boundary sequence used by its two corner caps.
  for (let axis1 = 0; axis1 < 3; axis1++) for (let axis2 = axis1 + 1; axis2 < 3; axis2++) {
    const tangent = 3 - axis1 - axis2;
    for (const sign1 of [-1, 1]) for (const sign2 of [-1, 1]) {
      const boundary = [];
      for (let step = 0; step <= subdivisions; step++) {
        const weight = [0, 0, 0]; weight[axis1] = sign1 * (subdivisions - step); weight[axis2] = sign2 * step;
        const normal = unit(weight);
        const endpoints = [-1, 1].map(sign => {
          const p = normal.map(x => radius * x);
          p[axis1] += inner * sign1; p[axis2] += inner * sign2; p[tangent] += inner * sign;
          return p;
        });
        boundary.push({ normal, endpoints });
      }
      for (let step = 0; step < subdivisions; step++) {
        const a = boundary[step], b = boundary[step + 1];
        add('edge', 0, [a.endpoints[0], a.endpoints[1], b.endpoints[1], b.endpoints[0]], [a.normal, a.normal, b.normal, b.normal]);
      }
    }
  }

  // Eight spherical octants, each tessellated into subdivisions squared
  // triangles. The edge with one zero barycentric weight exactly matches above.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const signs = [sx, sy, sz], grid = new Map();
    for (let i = 0; i <= subdivisions; i++) for (let j = 0; j <= subdivisions - i; j++) {
      const normal = unit([sx * i, sy * j, sz * (subdivisions - i - j)]);
      const point = normal.map((x, k) => signs[k] * inner + radius * x);
      grid.set(i + ',' + j, { point, normal });
    }
    const triangle = coords => {
      const vertices = coords.map(([i, j]) => grid.get(i + ',' + j));
      add('corner', 0, vertices.map(v => v.point), vertices.map(v => v.normal));
    };
    for (let i = 0; i < subdivisions; i++) for (let j = 0; j < subdivisions - i; j++) {
      triangle([[i, j], [i + 1, j], [i, j + 1]]);
      if (i + j < subdivisions - 1) triangle([[i + 1, j], [i + 1, j + 1], [i, j + 1]]);
    }
  }
  return patches;
}
const CUBE_RENDER_MESH = makeCubeRenderMesh(6);
const CUBE_SLOT_MESH = makeCubeRenderMesh(3);

// 3D 주사위 렌더링 (g: 대상 컨텍스트, cx,cy: 중심, size: 반 변 길이 px)
function drawCube(g, cx, cy, size, R, glowColor = null, glowStr = 0, skinId, detail = 'full') {
  const material = diceMaterial(skinId), T = DICE_MAT_TEX;
  if (glowColor && glowStr > 0) {
    const gr = g.createRadialGradient(cx, cy, size * 0.3, cx, cy, size * 2.4);
    gr.addColorStop(0, glowColor + Math.round(glowStr * 110).toString(16).padStart(2, '0'));
    gr.addColorStop(1, glowColor + '00');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, size * 2.4, 0, Math.PI * 2); g.fill();
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const half = [LIGHT[0], LIGHT[1], LIGHT[2] + 1], hl = Math.hypot(...half);
  half.forEach((v, i) => { half[i] = v / hl; });
  const projected = new Map();
  const project = point => {
    if (!projected.has(point)) {
      const p = m3apply(R, point), w = 10 / (10 - p[2]);
      projected.set(point, { p, xy: [cx + p[0] * size * w, cy + p[1] * size * w] });
    }
    return projected.get(point);
  };
  // The tiny HUD slot has its own fixed mesh; the central pop-in and cached
  // icons always retain full detail, with no geometry switch during a roll.
  const mesh = detail === 'slot' ? CUBE_SLOT_MESH : CUBE_RENDER_MESH;
  const visible = mesh.map(patch => {
    const n = m3apply(R, patch.planeNormal), c = m3apply(R, patch.center);
    return { patch, c, facing: dot(n, [-c[0], -c[1], 10 - c[2]]), verts: patch.points.map(project) };
  }).filter(p => p.facing > 1e-7).sort((a, b) => a.c[2] - b.c[2]);
  // A single convex silhouette clip keeps overlapping surface patches inside
  // the rounded outline. No strokes or transparent cracks between bevels.
  const points = [...projected.values()].map(v => v.xy).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower = [], upper = [];
  for (const p of points) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (let i = points.length - 1; i >= 0; i--) { const p = points[i]; while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  const path = (pts, bleed = 0) => {
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    g.beginPath(); pts.forEach(([x, y], i) => { const k = 1 + bleed / (Math.hypot(x - mx, y - my) || 1); x = mx + (x - mx) * k; y = my + (y - my) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
  };
  g.save(); path(hull); g.clip(); g.fillStyle = '#d8c7a5'; g.fill();
  for (const { patch, verts } of visible) {
    const xy = verts.map(v => v.xy), uv = patch.uv.map(p => p.map(v => v * T));
    const tex = patch.val ? material.cube[patch.val - 1] : material.cubeSurface;
    g.save();
    if (patch.val) { path(xy, .35); g.clip(); }
    for (let i = 1; i < xy.length - 1; i++) texTri(g, tex, ...uv[0], ...uv[i], ...uv[i + 1], xy[0], xy[i], xy[i + 1], patch.val ? 1.6 : .6);
    g.restore();
    const normals = patch.normals.map(n => m3apply(R, n));
    const shade = (values, rgb) => {
      let lo = 0, hi = 0; values.forEach((v, i) => { if (v < values[lo]) lo = i; if (v > values[hi]) hi = i; });
      if (values[hi] < .001) return;
      if (values[hi] - values[lo] < .002) g.fillStyle = `rgba(${rgb},${values[hi]})`;
      else {
        let start, end;
        if (xy.length === 3) {
          // A planar scalar gradient through all three vertex values avoids
          // artificial diagonal bands on the spherical corner patches.
          const [p0, p1, p2] = xy, dx1 = p1[0] - p0[0], dy1 = p1[1] - p0[1], dx2 = p2[0] - p0[0], dy2 = p2[1] - p0[1];
          const den = dx1 * dy2 - dy1 * dx2;
          const gx = ((values[1] - values[0]) * dy2 - (values[2] - values[0]) * dy1) / den;
          const gy = (dx1 * (values[2] - values[0]) - dx2 * (values[1] - values[0])) / den, gg = gx * gx + gy * gy;
          if (Math.abs(den) > 1e-10 && gg > 1e-14) {
            start = [p0[0] + gx * (values[lo] - values[0]) / gg, p0[1] + gy * (values[lo] - values[0]) / gg];
            end = [p0[0] + gx * (values[hi] - values[0]) / gg, p0[1] + gy * (values[hi] - values[0]) / gg];
          }
        } else {
          const mid = value => { const pts = xy.filter((_, i) => Math.abs(values[i] - value) < 1e-9); return [0, 1].map(k => pts.reduce((sum, p) => sum + p[k], 0) / pts.length); };
          start = mid(values[lo]); end = mid(values[hi]);
        }
        const grad = start && end ? g.createLinearGradient(...start, ...end) : null;
        if (!grad) { g.fillStyle = `rgba(${rgb},${values.reduce((a, b) => a + b, 0) / values.length})`; path(xy, .45); g.fill(); return; }
        grad.addColorStop(0, `rgba(${rgb},${values[lo]})`); grad.addColorStop(1, `rgba(${rgb},${values[hi]})`); g.fillStyle = grad;
      }
      path(xy, .45); g.fill();
    };
    shade(normals.map(n => (1 - (.55 + .45 * Math.max(0, dot(n, LIGHT)))) * .88), '42,25,10');
    shade(normals.map(n => Math.pow(Math.max(0, dot(n, half)), 20) * .16), '255,246,218');
  }
  g.restore();
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
// 굴림이 끝난 뒤 화면 중앙에 잠깐 남는 주사위 (획득 연출과 겹쳐 '이게 나왔다'를 보여준다). drawCenterRoll 이 그린다
const ROLL_SHOW = { t: 0, dur: 0.45, R: null, kind: 'd6' };

// 새 굴림을 시작해도 되는가 — 손이 비어 있고 슬롯이 놀고 있을 때만. 뽑기·보상 큐·캐주얼 굴림이 전부 이 하나를 본다
// (손에 든 주사위를 덮어쓰는 경로가 생기지 않도록 게이트를 한 곳에 둔다)
function canStartRoll() {
  return S.phase === 'playing' && !S.heldDie && !SLOT.active && (S.mode === 'infinity' || DIE.state === 'tray');
}
function canRoll() {
  if (S.mode === 'infinity') return false; // 인피니티는 기본 주사위 없음 — 뽑기(보물상자)만
  return canStartRoll() && S.gold >= ROLL_COST;
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
  if (VIEW.pid) return;
  if (S.mode === 'infinity') { buyChest(); return; } // 인피니티: 뽑기 버튼
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

// 인피니티 보물상자: 골드 → 다면체 주사위 1개. 그 자리에서 굴려 나온 숫자 = 타워 성.
function openInfHelp() {
  const h = $('inf-help'); if (!h) return;
  const t = $('help-title');
  if (t) t.textContent = S.inf && S.inf.mode === 'clear' ? '무한 투기장 · 도전 안내' : '무한 투기장 · 무한 안내';
  h.classList.remove('hidden');
}
function closeInfHelp() {
  const h = $('inf-help'); if (h) h.classList.add('hidden');
  try { localStorage.setItem('dk_infHelpSeen', '1'); } catch (e) { /* 사파리 프라이빗 */ } // 실제로 닫아야 본 것으로 친다
}
function helpSeen() { try { return localStorage.getItem('dk_infHelpSeen') === '1'; } catch (e) { return false; } }
function chestDef() { const C = window.DKCONTENT; return C && C.INFINITY && C.INFINITY.chest; }
function chestCost() { const ch = chestDef(); return ch && S.inf ? ch.cost(S.inf.chests || 0) : Infinity; }
function buyChest() {
  const ch = chestDef();
  if (!ch || S.mode !== 'infinity' || !S.inf || S.phase !== 'playing') return null;
  const cost = chestCost();
  if (!canStartRoll() || !canPlaceAnywhere()) { SFX.deny(); return null; }   // 배치부터 — 굴리는 중·손이 찬 채로는 뽑지 않는다
  if (S.gold < cost) { SFX.deny(); return null; }
  S.gold -= cost;
  S.inf.chests = (S.inf.chests || 0) + 1;
  const kind = ch.draw(S.wave);
  const rk = ch.rank(kind);
  const rare = rk >= 5 ? 3 : rk === 4 ? 2 : rk === 3 ? 1 : 0;
  const col = dieKindColor(kind);
  // 글자는 위쪽 HUD 바로 아래, 상자 열림·링·버스트는 주사위가 크게 뜨는 화면 중앙(drawCenterRoll)과 같은 자리
  S.texts.push({ str: kind === 'd1' ? '꽝… 일반: 외눈 주사위' : `보물상자: ${ch.grade[kind]} — ${ch.label[kind]} 획득!`, x: W / 2, y: topTextY(), t: 0, color: col });
  const fx = W / 2, fy = H / 2;
  S.fxs.push({ kind: 'ring', x: fx, y: fy, t: 0, dur: 0.6 + rare * 0.2, size: 140 + rare * 50, color: col });
  if (rk >= 3) spawnBurst(fx, fy, col, 6 + rk * 3, 100 + rk * 24, 0.6);
  if (rk >= 6) { S.shakeT = Math.max(S.shakeT || 0, 0.3); S.fxs.push({ kind: 'circle', x: fx, y: fy, t: 0, dur: 1.2, size: 260, color: col }); }
  if (rk >= 3 && hasArt('chestOpen')) S.fxs.push({ kind: 'chestOpen', x: fx, y: fy, t: 0, dur: 0.6 + rare * 0.15, size: 260 + rare * 50, add: true });
  if (rare >= 2) SFX.win(); else if (kind === 'd1') SFX.deny(); else SFX.coin();
  if (rk >= 3) netLog(`${ch.grade[kind]} ${ch.label[kind]}를 뽑았습니다`, 'gacha'); // 유물 이상은 방에 알린다
  rollDie(kind); // 뽑으면 무조건 굴러서 타워가 된다 — 배치부터 하고 다시 뽑는다
  coachHit('roll');
  syncUI();
  return kind;
}
const DIE_KIND_COLORS = { d1: '#9a9a9a', d4: '#d9c9a0', d6: '#e9dfc4', d8: '#7fd4ff', d12: '#c78bff', d20: '#ffd452', epic: '#ff8a5c', myth: '#ff5fa8', primal: '#ffffff' };
const dieKindColor = k => DIE_KIND_COLORS[k] || '#e9dfc4';
const dieShape = k => { const ch = chestDef(); return (ch && ch.shape && ch.shape[k]) || k; };
// 뽑기 결과를 바로 굴린다 (주머니 없음). 손이 차 있으면 대기열에 넣고, 배치해서 손이 비면 자동으로 이어 굴린다.
function rollDie(kind) {
  const ch = chestDef();
  if (!ch || S.mode !== 'infinity' || !S.inf || S.phase !== 'playing') return false;
  if (!canStartRoll()) return false;            // 손이 차 있으면 굴리지 않는다 — 큐는 호출자(pumpQueue)가 든다
  SLOT.active = true; SLOT.kind = kind;
  SLOT.t = 0; SLOT.t2 = 0; SLOT.phase = 0; SLOT.sndT = 0;
  SLOT.final = ch.roll(kind);
  SLOT.R = m3mul(m3axisAngle(Math.random(), Math.random(), Math.random() * 0.5 + 0.1, Math.random() * 6), TRAY_TILT);
  SLOT.w = [14 + Math.random() * 8, 12 + Math.random() * 8, 9 + Math.random() * 6];
  SFX.throwDie();
  syncUI();
  return true;
}
// 대기열(보스 보상 등)을 손이 비는 대로 하나씩 굴린다
// 지금 주사위를 놓을 자리가 있는가 — 빈 석단이 있거나, 합체 여지가 있는 타워가 있으면 된다
function canPlaceAnywhere() {
  for (let i = 0; i < SPOTS.length; i++) if (!towerAt(i)) return true;
  return S.towers.some(t => t.lvl < MAX_LVL);
}
function pumpQueue() {
  if (S.mode !== 'infinity' || !S.inf || !S.inf.queue || !S.inf.queue.length) return;
  if (!canStartRoll()) return;
  if (!canPlaceAnywhere()) return;   // 자리가 날 때까지 보상은 큐에 남는다
  if (rollDie(S.inf.queue[0])) S.inf.queue.shift();   // 굴림이 실제로 시작됐을 때만 큐에서 뺀다 (주사위가 조용히 사라지지 않게)
}
function finishSlot() {
  if (S.heldDie) return;             // 손이 차 있으면 절대 덮어쓰지 않는다 — 슬롯은 '완성 대기'로 남아 손이 빌 때 온다
  SLOT.active = false;
  ROLL_SHOW.t = ROLL_SHOW.dur; ROLL_SHOW.R = SLOT.R; ROLL_SHOW.kind = SLOT.kind || 'd6';
  S.heldDie = SLOT.final;
  S.dieFocus = true;      // 새로 온 주사위는 배치 모드로 시작
  if (SLOT.final <= 6) SFX.coin();   // ★7+ 는 acquireFx 가 소리를 낸다 (겹침 방지)
  diceSlot.classList.add('pop');
  setTimeout(() => diceSlot.classList.remove('pop'), 350);
  acquireFx(S.heldDie);
  syncUI();
}
// 그림 에셋이 실제로 로드됐는가 (없으면 코드 그림으로 폴백)
const hasArt = (k) => { const a = A[k]; return !!(a && !a.missing && (Array.isArray(a) ? a.length && a[0] && a[0].cv : a.cv && a.w > 8)); };
// 굴려 나온 눈(1~20)에 따라 단계별 획득 연출. 뽑기·보스 보상·큐 재개가 전부 finishSlot 으로 수렴하므로 여기 한 곳
// 그림(vfx/acquire-*, ART-PROMPTS §7.8)이 있으면 그림 연출, 없으면 코드 프리미티브(링·마법진·파티클)
function acquireFx(face) {
  const def = TOWER_DEFS[face]; if (!def) return;
  const col = def.color, cx = W / 2, cy = H / 2;
  const name = def.name.replace(/ ★\d+$/, '');
  const tier = face <= 6 ? 0 : face >= 19 ? 4 : face >= 15 ? 3 : face >= 11 ? 2 : 1;   // ★7~10 · ★11~14 · ★15~18 · ★19~20
  if (hasArt('acquireBurst')) acquireFxArt(face, tier, col, cx, cy); else acquireFxCode(face, tier, col, cx, cy);
  if (!tier) return;
  S.texts.push({ str: `★${face}성 ${name} 획득!`, x: cx, y: topTextY() + 34, t: 0, color: col, big: true });
  if (tier >= 3) { S.glowT = 0.9; S.glowColor = col; }        // 화면 가장자리 빛 (★15+)
  S.shakeT = Math.max(S.shakeT || 0, [0, 0.2, 0.3, 0.5, 0.7][tier]);
  if (tier >= 4) SFX.jackpot(); else if (tier >= 3) SFX.win(); else SFX.merge();
  if (tier >= 3 && window.DKBGM) { try { DKBGM.duck(0.45, 1.4); } catch (e) { /* 무시 */ } }
  netLog(`★${face}성 ${name} 타워를 획득하였습니다`, 'gacha');   // ★7 이상만 방에 알린다
}
function acquireFxCode(face, tier, col, cx, cy) {
  if (!tier) {                                                // 1~6눈: 작은 링 + 눈 색
    S.fxs.push({ kind: 'ring', x: cx, y: cy, t: 0, dur: 0.5, size: 120, color: col });
    spawnBurst(cx, cy, col, 6, 90, 0.45);
    return;
  }
  S.fxs.push({ kind: 'ring', x: cx, y: cy, t: 0, dur: 0.9, size: 260 + tier * 60, color: col });
  S.fxs.push({ kind: 'circle', x: cx, y: cy + 40, t: 0, dur: 1.1 + tier * 0.15, size: 180 + tier * 40, color: col, pips: Math.min(12, face - 6) });
  spawnBurst(cx, cy, col, 12 + tier * 10, 140 + tier * 40, 0.7 + tier * 0.1);
  if (tier >= 2) { S.fxs.push({ kind: 'ring', x: cx, y: cy, t: 0, dur: 1.3, size: 420, color: '#ffffff' }); }
  if (tier >= 4) { for (let i = 0; i < 3; i++) S.fxs.push({ kind: 'ring', x: cx, y: cy, t: -i * 0.18, dur: 1.2, size: 520, color: ['#ff7ad9', '#ffd452', '#7fd4ff'][i] }); spawnBurst(cx, cy, '#ffffff', 24, 260, 1.1); }
}
function acquireFxArt(face, tier, col, cx, cy) {
  const sparks = (n, spread, sz) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = spread * (0.4 + Math.random() * 0.8); S.fxs.push({ kind: 'sprite', img: 'starSpark', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spread * 0.3, t: -Math.random() * 0.15, dur: 0.6 + Math.random() * 0.4, size: sz * (0.6 + Math.random() * 0.8), phase: Math.random() * 6 }); } };
  if (!tier) { S.fxs.push({ kind: 'ring', x: cx, y: cy, t: 0, dur: 0.5, size: 120, color: col }); if (hasArt('starSpark')) sparks(4, 90, 26); else spawnBurst(cx, cy, col, 6, 90, 0.45); return; }
  S.fxs.push({ kind: 'acquireBurst', x: cx, y: cy, t: 0, dur: 0.6 + tier * 0.1, size: 240 + tier * 40, add: true });
  if (hasArt('acquireRing')) S.fxs.push({ kind: 'ringImg', img: 'acquireRing', x: cx, y: cy, t: 0, dur: 0.9, size: 320 + tier * 40 });
  else S.fxs.push({ kind: 'ring', x: cx, y: cy, t: 0, dur: 0.9, size: 260 + tier * 60, color: col });
  spawnBurst(cx, cy, col, 8 + tier * 6, 120 + tier * 30, 0.6 + tier * 0.1);
  if (hasArt('starSpark')) sparks(6 + tier * 4, 160 + tier * 40, 30);
  if (tier >= 2) { if (hasArt('acquireColumn')) S.fxs.push({ kind: 'column', x: cx, y: cy + 40, t: 0, dur: 0.8, size: 420 + tier * 40 }); S.fxs.push({ kind: 'ring', x: cx, y: cy, t: 0, dur: 1.3, size: 420, color: '#ffffff' }); }
  if (tier >= 3) { if (hasArt('confetti')) S.fxs.push({ kind: 'confetti', x: cx, y: cy - 40, t: 0, dur: 1.1, size: 380 + tier * 30 }); if (hasArt('acquireColumn')) S.fxs.push({ kind: 'column', x: cx, y: cy + 40, t: -0.15, dur: 0.9, size: 520 }); }
  if (tier >= 4) {
    const img = hasArt('acquireRingRainbow') ? 'acquireRingRainbow' : 'acquireRing';
    for (let i = 0; i < 3; i++) { if (hasArt(img)) S.fxs.push({ kind: 'ringImg', img, x: cx, y: cy, t: -i * 0.18, dur: 1.2, size: 560, spin: 0.8 + i * 0.4, phase: i * 2 }); else S.fxs.push({ kind: 'ring', x: cx, y: cy, t: -i * 0.18, dur: 1.2, size: 520, color: ['#ff7ad9', '#ffd452', '#7fd4ff'][i] }); }
    if (hasArt('confetti')) S.fxs.push({ kind: 'confetti', x: cx, y: cy - 60, t: -0.35, dur: 1.2, size: 460 });
    spawnBurst(cx, cy, '#ffffff', 24, 260, 1.1);
  }
}
// '#rrggbb' → 'rgba(r,g,b,a)'
function hexA(hex, a) { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return `rgba(255,212,82,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
// 색 파티클 다발 (burst): 중심에서 퍼지며 중력으로 떨어진다
function spawnBurst(x, y, color, n, speed, dur) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.5 + Math.random() * 0.7);
    S.fxs.push({ kind: 'burst', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - speed * 0.35, t: 0, dur: dur * (0.7 + Math.random() * 0.5), size: 3 + Math.random() * 4, color });
  }
}

function updateSlot(dt) {
  if (!SLOT.active || S.phase !== 'playing') return;
  SLOT.t += dt;
  const poly = SLOT.kind && SLOT.kind !== 'd6';
  if (SLOT.phase === 0) {
    // 빠른 회전 (덜그럭 소리)
    const wl = Math.hypot(...SLOT.w);
    if (wl > 1e-4) {
      SLOT.R = m3orthonormalize(m3mul(m3axisAngle(SLOT.w[0] / wl, SLOT.w[1] / wl, SLOT.w[2] / wl, wl * dt), SLOT.R));
    }
    SLOT.w = SLOT.w.map(v => v * Math.pow(0.3, dt));
    SLOT.sndT -= dt;
    if (SLOT.sndT <= 0) { SFX.bounce(0.3); SLOT.sndT = 0.11; }
    if (SLOT.t >= (poly ? 0.7 : 0.55)) {
      SLOT.phase = 1;
      if (DIE.forceFinal) { // 테스트 훅
        const ch = chestDef();
        SLOT.final = poly && ch ? Math.max(ch.min[SLOT.kind] || 1, Math.min(ch.sides[SLOT.kind], DIE.forceFinal)) : DIE.forceFinal;
        DIE.forceFinal = 0;
      }
      const Rt = slotTargetR();
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
    if (SLOT.t2 > 0.45) { if (S.heldDie) return; finishSlot(); }   // 손이 차 있으면(다른 경로로 들어온 주사위) 굴린 결과를 보존한 채 기다린다
  }
}
// ==================== 다면체 주사위 (d4·d8·d12·d20) ====================
// d6 은 drawCube, d1 은 구슬. 나머지는 정다면체 정점·면을 만들어 큐브와 같은 방식으로 3D 렌더한다.
const POLY = (() => {
  const N = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const SUB = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const CROSS = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const DOT = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const CEN = vs => { let x = 0, y = 0, z = 0; for (const v of vs) { x += v[0]; y += v[1]; z += v[2]; } return [x / vs.length, y / vs.length, z / vs.length]; };
  // 한 면의 정점을 바깥 법선 기준 반시계로 정렬
  const face = (idx, verts) => {
    const c = CEN(idx.map(i => verts[i])), n = N(c);
    const ref = N(SUB(verts[idx[0]], c)), bi = CROSS(n, ref);
    const ang = i => Math.atan2(DOT(SUB(verts[i], c), bi), DOT(SUB(verts[i], c), ref));
    return { idx: idx.slice().sort((a, b) => ang(a) - ang(b)), n, c };
  };
  const solid = (verts, faceIdx) => { const vs = verts.map(N); return { verts: vs, faces: faceIdx.map(f => face(f, vs)) }; };
  const tetra = solid([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]);
  const octa = solid([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]);
  // 정이십면체: 황금비 좌표 12개 → 최소 변 길이로 삼각형 20개를 찾는다
  const phi = (1 + Math.sqrt(5)) / 2, iv = [];
  for (const a of [1, -1]) for (const b of [1, -1]) iv.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a]);
  const IV = iv.map(N);
  let min = Infinity;
  for (let i = 0; i < IV.length; i++) for (let j = i + 1; j < IV.length; j++) min = Math.min(min, Math.hypot(...SUB(IV[i], IV[j])));
  const near = (a, b) => Math.abs(Math.hypot(...SUB(IV[a], IV[b])) - min) < 1e-6;
  const itri = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) if (near(i, j) && near(j, k) && near(i, k)) itri.push([i, j, k]);
  const icosa = solid(iv, itri);
  // 정십이면체 = 정이십면체의 쌍대: 삼각형 중심이 정점, 한 정점을 둘러싼 삼각형 5개가 한 면
  const dodeca = solid(icosa.faces.map(f => f.n), Array.from({ length: 12 }, (_, i) => itri.map((t, ti) => (t.indexOf(i) >= 0 ? ti : -1)).filter(x => x >= 0)));
  return { d4: tetra, d8: octa, d12: dodeca, d20: icosa };
})();
// 법선을 화면 쪽(+z)으로 보내는 회전
function alignR(n) {
  const l = Math.hypot(n[1], -n[0], 0);
  if (l < 1e-6) return n[2] > 0 ? m3id() : m3axisAngle(1, 0, 0, Math.PI);
  return m3axisAngle(n[1] / l, -n[0] / l, 0, Math.acos(Math.max(-1, Math.min(1, n[2]))));
}
// 최종 눈이 정면을 보는 자세 (d6 은 기존 faceTopR)
function slotTargetR() {
  if (SLOT.kind === 'd6' || !POLY[dieShape(SLOT.kind)]) return faceTopR(Math.max(1, Math.min(6, SLOT.final)));
  const P = POLY[dieShape(SLOT.kind)];
  return alignR(P.faces[Math.max(1, Math.min(P.faces.length, SLOT.final)) - 1].n);
}
// Face-local textures: the engraved value and grain rotate with the face.
// Two cached appearance sets at most (~15 MiB); rarity kinds share the d20 set.
const DICE_MAT_TEX = 192, diceMaterialCache = new Map();
// Face-local, orthographic pips. Opposite faces are defined by FACES (sum = 7).
const CUBE_PIPS = [
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
];
function diceSkin(id) {
  const key = Object.prototype.hasOwnProperty.call(DICE_SKINS.skins, id) ? id : DICE_SKINS.defaultId;
  return { id: key, ...DICE_SKINS.skins[key] };
}
function diceMaterialTile(skin, w, h, materialKey = skin.materialKey) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), supplied = A[materialKey];
  const image = supplied && !supplied.missing ? supplied : A[skin.materialKey];
  g.fillStyle = '#e4d9bc'; g.fillRect(0, 0, w, h);
  if (image && !image.missing) g.drawImage(image, 0, 0, w, h);
  // A missing material keeps the same opaque ivory base, without old face art.
  return cv;
}
function engraveDiceValue(g, value, x, y, fontSize, mark) {
  g.font = uiFont(fontSize); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(255,242,210,.7)'; g.strokeText(String(value), x, y + 1.1);
  g.fillStyle = '#321e20'; g.fillText(String(value), x, y - .6);
  g.fillStyle = mark; g.fillText(String(value), x, y + .35);
  // Disambiguate an inverted 6/9 without a screen-facing overlay.
  if (value === 6 || value === 9) {
    g.fillRect(x - fontSize * .15, y + fontSize * .43, fontSize * .3, Math.max(1, fontSize * .035));
  }
}
function buildDiceMaterial(skin) {
  const out = { faces: {}, orb: null, cube: [], cubeSurface: null }, T = DICE_MAT_TEX, dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
  for (const [kind, P] of Object.entries(POLY)) out.faces[kind] = P.faces.map((f, i) => {
    // Use the same final alignment as slotTargetR: the winning numeral is upright.
    const inv = m3transpose(alignR(f.n)), u = m3apply(inv, [1, 0, 0]), v = m3apply(inv, [0, 1, 0]);
    const offsets = f.idx.map(vi => P.verts[vi].map((n, j) => n - f.c[j]));
    const scale = T * .455 / Math.max(...offsets.map(o => Math.hypot(...o)));
    const uv = offsets.map(o => [T / 2 + dot(o, u) * scale, T / 2 + dot(o, v) * scale]);
    const cv = diceMaterialTile(skin, T, T), g = cv.getContext('2d');
    const path = inset => { g.beginPath(); uv.forEach(([x, y], j) => { x = T / 2 + (x - T / 2) * inset; y = T / 2 + (y - T / 2) * inset; j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
    g.save(); path(1); g.clip(); g.lineJoin = 'round';
    path(1); g.strokeStyle = 'rgba(102,74,44,.38)'; g.lineWidth = 7; g.stroke();
    const rim = g.createLinearGradient(0, 0, T, T);
    rim.addColorStop(0, 'rgba(255,243,211,.85)'); rim.addColorStop(.45, 'rgba(238,220,181,.4)'); rim.addColorStop(1, 'rgba(129,93,52,.38)');
    path(.97); g.strokeStyle = rim; g.lineWidth = 2.7; g.stroke();
    engraveDiceValue(g, i + 1, T / 2, T / 2, T * (f.idx.length === 5 ? .36 : i < 9 ? .32 : .27), skin.mark || '#542b30');
    g.restore();
    return { cv, uv };
  });
  out.orb = diceMaterialTile(skin, T * 2, T);
  engraveDiceValue(out.orb.getContext('2d'), 1, T, T / 2, T * .25, skin.mark || '#542b30');
  out.cubeSurface = diceMaterialTile(skin, T, T, skin.cubeMaterialKey || skin.materialKey);
  out.cube = CUBE_PIPS.map(pips => {
    const cv = document.createElement('canvas'); cv.width = T; cv.height = T;
    const g = cv.getContext('2d'); g.drawImage(out.cubeSurface, 0, 0);
    for (const [u, v] of pips) {
      const x = T * (.5 + u * .245), y = T * (.5 + v * .245), r = T * .096;
      // A worn stone lip around a recessed, red-pigmented bowl.
      g.beginPath(); g.arc(x, y + 1.1, r + 1.35, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,239,199,.85)'; g.fill();
      g.beginPath(); g.arc(x, y - .25, r + .6, 0, Math.PI * 2);
      g.fillStyle = 'rgba(87,55,29,.72)'; g.fill();
      const bowl = g.createRadialGradient(x, y + r * .58, r * .32, x, y, r);
      bowl.addColorStop(0, skin.cubeMark || '#912321'); bowl.addColorStop(.56, '#8b1c20');
      bowl.addColorStop(.8, '#681015'); bowl.addColorStop(.95, '#3e0b0d'); bowl.addColorStop(1, '#280909');
      g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = bowl; g.fillRect(x - r, y - r, r * 2, r * 2);
      // The same mineral grain subtly breaks up the pigment without random stamps.
      g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .2;
      g.drawImage(out.cubeSurface, 0, 0);
      g.restore();
    }
    return cv;
  });
  return out;
}
function diceMaterial(id) {
  const skin = diceSkin(id);
  if (diceMaterialCache.has(skin.id)) {
    const value = diceMaterialCache.get(skin.id);
    diceMaterialCache.delete(skin.id); diceMaterialCache.set(skin.id, value); return value;
  }
  const value = buildDiceMaterial(skin);
  if (diceMaterialCache.size >= 2) diceMaterialCache.delete(diceMaterialCache.keys().next().value);
  diceMaterialCache.set(skin.id, value); return value;
}
function buildDiceSprites() {
  // Icons, fallback towers and the rolling die share the same six 3D faces.
  A.dice = CUBE_PIPS.map((_, i) => {
    const cv = document.createElement('canvas'), T = DICE_MAT_TEX;
    cv.width = T; cv.height = T;
    drawCube(cv.getContext('2d'), T / 2, T / 2, T * .3, m3mul(TRAY_TILT, faceTopR(i + 1)));
    return { cv, w: T, h: T };
  });
}
// 정다면체: 기존 정점/면/최종 자세를 유지하고 큐브와 같은 광원으로 재질을 비춘다.
function drawPoly3D(g, cx, cy, size, kind, R, skinId) {
  const P = POLY[kind]; if (!P) return;
  const textures = diceMaterial(skinId).faces[kind];
  const persp = 10;
  const pv = P.verts.map(v => { const p = m3apply(R, v); const w = persp / (persp - p[2]); return [cx + p[0] * size * w, cy + p[1] * size * w]; });
  const order = P.faces.map((f, i) => ({ i, z: m3apply(R, f.n)[2] })).sort((a, b) => a.z - b.z);
  g.save();
  g.lineJoin = 'round';
  for (const { i, z } of order) {
    if (z <= 0.02) continue; // 뒷면
    const f = P.faces[i];
    const path = () => { g.beginPath(); f.idx.forEach((vi, k) => (k ? g.lineTo(pv[vi][0], pv[vi][1]) : g.moveTo(pv[vi][0], pv[vi][1]))); g.closePath(); };
    const n = m3apply(R, f.n);
    const tex = textures[i], uv = tex.uv;
    // A fan triangulates both the triangle and pentagon using the original vertices.
    // Underfill prevents subpixel seams from becoming transparent at the shared edges.
    path(); g.fillStyle = '#d9cdb0'; g.fill();
    for (let j = 1; j < f.idx.length - 1; j++) {
      texTri(g, tex.cv, ...uv[0], ...uv[j], ...uv[j + 1], pv[f.idx[0]], pv[f.idx[j]], pv[f.idx[j + 1]]);
    }
    const br = 0.58 + 0.42 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    path(); g.fillStyle = `rgba(28,18,8,${Math.max(0, (1 - br) * 0.8)})`; g.fill();
    path(); g.strokeStyle = 'rgba(94,71,43,.35)'; g.lineWidth = .65; g.stroke();
  }
  g.restore();
}
// Low-resolution sphere UV mesh, shared by both views of d1. Its material and 1
// follow SLOT.R as well; lighting stays in world space and has no plastic glint.
const ORB_MESH = (() => {
  const cols = 24, rows = 12, verts = [], quads = [];
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) {
    const lon = (x / cols - .5) * Math.PI * 2, lat = (y / rows - .5) * Math.PI;
    verts.push({ p: [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)], uv: [x / cols * DICE_MAT_TEX * 2, y / rows * DICE_MAT_TEX] });
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const a = y * (cols + 1) + x; quads.push([a, a + 1, a + cols + 2, a + cols + 1]); }
  return { verts, quads };
})();
function drawOrb(g, cx, cy, size, R, skinId) {
  const tex = diceMaterial(skinId).orb;
  const verts = ORB_MESH.verts.map(v => { const p = m3apply(R, v.p); return { z: p[2], xy: [cx + p[0] * size, cy + p[1] * size] }; });
  const order = ORB_MESH.quads.map(idx => ({ idx, z: idx.reduce((sum, vi) => sum + verts[vi].z, 0) / 4 })).filter(q => q.z > 0).sort((a, b) => a.z - b.z);
  g.save(); g.beginPath(); g.arc(cx, cy, size, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#e4d9bc'; g.fillRect(cx - size, cy - size, size * 2, size * 2);
  for (const { idx } of order) for (let j = 1; j < 3; j++) {
    const tri = [idx[0], idx[j], idx[j + 1]];
    texTri(g, tex, ...ORB_MESH.verts[tri[0]].uv, ...ORB_MESH.verts[tri[1]].uv, ...ORB_MESH.verts[tri[2]].uv, ...tri.map(i => verts[i].xy), .6);
  }
  const gr = g.createRadialGradient(cx + size * LIGHT[0], cy + size * LIGHT[1], size * .08, cx, cy, size * 1.05);
  gr.addColorStop(0, 'rgba(28,18,8,.065)'); gr.addColorStop(.55, 'rgba(28,18,8,.13)'); gr.addColorStop(1, 'rgba(28,18,8,.36)');
  g.fillStyle = gr; g.fillRect(cx - size, cy - size, size * 2, size * 2); g.restore();
  g.beginPath(); g.arc(cx, cy, size, 0, Math.PI * 2); g.strokeStyle = 'rgba(94,71,43,.4)'; g.lineWidth = .8; g.stroke();
}
function drawPolyDie(g, cx, cy, size, kind, R, skinId) {
  const shape = dieShape(kind);
  if (shape === 'd1') drawOrb(g, cx, cy, size, R, skinId);
  else drawPoly3D(g, cx, cy, size, shape, R, skinId);
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
    drawPolyDie(sctx, 37, 40 - bounce, 21, SLOT.kind, SLOT.R);
    return;
  }
  drawCube(sctx, 37, 40 - bounce, 17, SLOT.R, null, 0, undefined, 'slot');
}

// 굴리는 동안 아레나 한가운데에 큰 주사위. 획득 연출(acquireFx)이 같은 자리(W/2,H/2)에서 터지므로 굴림→결과가 한 곳에서 이어진다.
// 상대 필드를 보는 중(VIEW)에는 내 굴림을 그리지 않는다
function drawCenterRoll() {
  if (VIEW.pid || S.phase !== 'playing') return;
  const live = SLOT.active, linger = !live && ROLL_SHOW.t > 0 && ROLL_SHOW.R;
  if (!live && !linger) return;
  const cx = W / 2, cy = H / 2;
  const base = Math.round(Math.min(W, H) * 0.085);   // 큐브 반변 — 세로 아레나(720 폭)에서 61 → 주사위가 화면 폭의 1/5 쯤
  const kind = live ? (SLOT.kind || 'd6') : ROLL_SHOW.kind, R = live ? SLOT.R : ROLL_SHOW.R;
  const poly = kind !== 'd6';
  let scale = 1, alpha = 1, bounce = 0, glow = 0;
  if (live) {
    if (SLOT.t < 0.16) scale = 0.55 + 0.45 * (SLOT.t / 0.16);                      // 팝인
    bounce = SLOT.phase === 0 ? Math.abs(Math.sin(SLOT.t * 16)) * base * 0.35 : 0; // 튀기
    if (SLOT.phase === 1) glow = Math.min(1, SLOT.t2 / 0.25);                     // 멈추면서 금빛
  } else {
    const p = ROLL_SHOW.t / ROLL_SHOW.dur;                                          // 여운: 살짝 커지며 사라진다
    alpha = Math.min(1, p * 1.6); scale = 1 + (1 - p) * 0.3; glow = p;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  const halo = ctx.createRadialGradient(cx, cy, base * 0.5, cx, cy, base * 2.8);   // 어두운 원반 — 배경 위에서 주사위가 읽히게
  halo.addColorStop(0, 'rgba(0,0,0,0.46)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, base * 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.38)';                                               // 바닥 그림자 (튀어오르면 작아진다)
  const sh = 1 - bounce / (base * 0.35) * 0.3;
  ctx.beginPath(); ctx.ellipse(cx, cy + base * 1.35, base * 1.15 * scale * sh, base * 0.4 * scale * sh, 0, 0, Math.PI * 2); ctx.fill();
  const size = base * scale, dy = cy - bounce;
  if (poly) {
    if (glow > 0) { const g = ctx.createRadialGradient(cx, dy, size * 0.3, cx, dy, size * 2.4); g.addColorStop(0, hexA('#ffd452', 0.4 * glow)); g.addColorStop(1, hexA('#ffd452', 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, dy, size * 2.4, 0, Math.PI * 2); ctx.fill(); }
    drawPolyDie(ctx, cx, dy, size * 1.24, kind, R);
  } else {
    drawCube(ctx, cx, dy, size, R, glow > 0 ? '#ffd452' : null, glow * 0.6);
  }
  ctx.restore();
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
  if (S.mode === 'infinity') return; // 인피니티는 트레이 주사위를 쓰지 않는다
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
    ctx.font = uiFont(11);
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
  const P = INF.wave(w, !!(S.inf && S.inf.gauntlet)); // 도전 모드만 최종 관문 곡선
  const M = INF.monsterFor(w); // 메운디식 로스터: 웨이브 하나 = 몬스터 한 종류 (보스 웨이브는 보스만)
  const q = [];
  let t = 0.45;
  const add = (type, extra) => { q.push(Object.assign({ type, t, hpMult: P.hpMult, goldMult: P.goldMult, spdMult: P.speedMult, sizeClass: M.cls, armor: M.armor, wave: w }, extra || {})); };
  if (M.boss) {
    t += 0.6;
    for (let k = 0; k < P.bosses; k++) {
      const boss = INF.bossFor ? INF.bossFor(INF.bossOrdinal(w), k) : C.bosses[(INF.bossOrdinal(w) - 1 + k * 37) % C.bosses.length]; // 겉보기 약한 보스부터 (순번 기준)
      const bbase = C.bossBases.find((b) => b.id === boss.base) || C.bossBases[0];
      const bart = INF.art ? INF.art((w - 1) % 101 + 1, k) : null;   // 새 보스 그림이 준비됐으면 설계된 군주·부관으로
      const dart = INF.directionalArt ? INF.directionalArt(w, k) : null;
      // W111/212/... retain the existing second combat boss and use the same
      // reviewed slot10 character at the secondary drawing scale.
      const sharedFirstBoss = k === 1 && (w - 1) % 101 + 1 === 10 && directionalArt && directionalArt.entry('b010');
      const directionalName = dart ? dart.name : sharedFirstBoss ? INF.monsters[10].name + ' 부관' : null;
      add(bbase.id, { name: M.prefix + (directionalName || (bart ? bart.name : boss.name)), hue: bart || directionalName ? 0 : boss.hue, hpMult: P.hpMult * P.bossHp, isBoss: true, bossCount: P.bosses, bossRole: k, lane: laneFor(bbase.move, k), art: bart && bart.key });
      t += 1.5;
    }
    return q;
  }
  const eliteSlots = new Set();
  if (w % INF.eliteEvery === 0) for (let k = 0; k < P.elites; k++) eliteSlots.add(Math.floor((k + 0.5) * M.count / P.elites));
  for (let i = 0; i < M.count; i++) {
    const elite = eliteSlots.has(i);
    add(M.base.id, {
      name: (elite ? '정예 ' : '') + M.name, hue: M.hue, lane: laneFor(M.base.move, i), art: M.art && M.art.key, artWalk: M.art && M.art.walkKey, artWalkStride: M.art && M.art.walkStride,
      hpMult: P.hpMult * M.hpMult * (elite ? 3 : 1), goldMult: P.goldMult * (elite ? 3 : 1), isElite: elite,
    });
    t += P.gap * (FAST_AIR.has(M.base.id) ? 0.72 : 1);
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
  refreshDirectionalDemand(true);
  announceWave(S.wave);
  SFX.wave();
  coachHit('wave');
  syncUI();
}
// 메운디: 크기·방어력 예고
function announceWave(n) {
  if (S.mode !== 'infinity' || !window.DKCONTENT) return;
  const INF = DKCONTENT.INFINITY, M = INF.monsterFor(n), hi = INF.highArmor(n);
  const who = M.boss ? '보스' : `${M.name} ×${M.count}`;
  S.texts.push({ str: `웨이브 ${n} · ${who} · ${INF.sizeName[M.cls]}${M.armor ? ` · 방어 ${M.armor}` : ''}${hi ? ' · 고방어!' : ''}`, x: W / 2, y: H / 2 - 70, t: 0, color: hi ? '#ff7a7a' : M.boss ? '#ffd452' : '#ffe6b0' });
  if (M.boss || hi || n % 10 === 1) pushLog(`웨이브 ${n} — ${who}${hi ? ' · 고방어!' : ''}`, M.boss ? 'boss' : 'sys'); // 굵직한 웨이브만
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
  S.heldDie = 0; S.dieFocus = true; S.selTower = null; S.shakeT = 0; S.bannerT = 0;
  DIE.state = 'tray'; DIE.z = 0; DIE.final = 0;
  SLOT.active = false;
  applyMapLayout(sd.mapKey, sd.tier || 1);
  S.phase = 'playing';
  showScreen('playing');
  syncUI();
}

// 인피니티 런 시작 (로비에서 호출)
// net: 함께하기 방 정보 { code, pid, seed, t0, timing } — 있으면 도전 규칙(101웨이브 완주)으로, 웨이브·배속은 각자 진행 (mpOnStart 가 만든다)
function startInfinity(kind, net) {
  const C = window.DKCONTENT;
  const INF = C && C.INFINITY;
  if (!INF) return;
  S.mode = 'infinity';
  if (net) kind = 'clear';                                     // 멀티는 언제나 도전 규칙(101웨이브 완주 = 클리어)
  const MODE = INF.modeOf(kind === 'clear' || kind === 'endless' ? kind : 'endless'); // 도전(클리어 있음) / 무한(진짜 무한)
  clearLog();
  S.net = net || null;
  S.inf = { sp: 0, power: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }, kills: 0, spent: 0, queue: [], chests: 0, bossT: 0, cleared: 0, mode: MODE.key, gauntlet: MODE.gauntlet };
  S.stage = 0;
  S.stageData = { n: 0, name: '무한 투기장', tier: INF.tier.tier, tierName: INF.tier.name + ' · ' + MODE.name, tierColor: INF.tier.color, lanes: INF.tier.lanes.length, waves: Infinity, bases: [], gem: 0 };
  S.stageWaves = Infinity;
  setTimeout(() => pushLog(net ? `함께하기 — 첫 웨이브까지 ${Math.round(net.timing.prep / 1000)}초 · 각자 자기 속도로 진행합니다. 먼저 완주하면 1위` : MODE.key === 'clear' ? `도전 시작 — ${INF.clearWave}웨이브 완주가 목표입니다` : '무한 시작 — 버틸 수 있는 데까지', 'sys'), 60);
  S.mapKey = arenaKeyForScreen();   // 세로 화면이면 세로 아레나
  S.gold = INF.startGold;
  S.lives = INF.lives;
  S.wave = 0;
  S.enemies = []; S.towers = []; S.projs = []; S.beams = []; S.fxs = []; S.texts = []; S.corpses = [];
  S.spawnQ = []; S.waveActive = false; S.autoT = 0; S.waveT = 0;
  S.heldDie = 0; S.dieFocus = true; S.selTower = null; S.shakeT = 0; S.bannerT = 0;
  DIE.state = 'tray'; DIE.z = 0; DIE.final = 0;
  SLOT.active = false; SLOT.final = 0;
  applyMapLayout(S.mapKey, INF.tier);
  S.phase = 'playing';
  if (net) {   // 멀티: 전원 x1 로 출발 (배속은 각자 바꾼다). 첫 웨이브는 준비 시간이 끝나면 자동으로, 버튼으로 앞당길 수도 있다
    setSpeed(1);
    S.autoT = Math.max(1, (net.t0 - (window.DKNET ? DKNET.serverNow() : Date.now())) / 1000);
  }
  refreshDirectionalDemand(true);
  stageEl.classList.toggle('mp', !!net);
  // 첫 런은 코치가 먼저 돈다. 코치가 끝나면 도움말을 한 번 연다.
  // 이미 코치를 본 사람인데 도움말을 아직 안 봤다면 도움말만 연다. (멀티는 시계가 흐르므로 생략)
  if (!net) {
    if (!coachDone()) setTimeout(coachStart, 500);
    else if (!helpSeen()) setTimeout(openInfHelp, 300);
  }
  showScreen('playing');
  syncUI();
}

// 인피니티 런 종료: 기록·젬 저장 + 결과 화면
// 도전 모드 클리어: 101웨이브를 완주하면 승리로 런이 끝난다. 무한 모드에는 클리어가 없다.
function checkInfClear() {
  const INF = window.DKCONTENT && DKCONTENT.INFINITY;
  if (!INF || !S.inf || S.mode !== 'infinity' || S.inf.mode !== 'clear') return false;
  const line = S.net ? S.net.timing.clearWave : (INF.clearWave || 101);
  if (S.wave < line || S.inf.cleared) return false;
  S.inf.cleared = 1;
  SAVE.infClears = (SAVE.infClears || 0) + 1;
  S.shakeT = Math.max(S.shakeT || 0, 0.5);
  for (let i = 0; i < 5; i++) S.fxs.push({ kind: 'ring', x: W / 2, y: 200, t: 0, dur: 1.1 + i * 0.25, size: 160 + i * 60, color: '#ffd452' });
  S.texts.push({ str: `무한 투기장 클리어! ${line}웨이브 완주`, x: W / 2, y: H / 2 - 90, t: 0, color: '#ffd452', big: true });
  netLog(`무한 투기장 · ${S.net ? '함께' : '도전'} ${line}웨이브 완주 — 클리어!`, 'up');
  endInfinity(true);
  return true;
}

// 런의 젬·최고 기록·최근 런을 계산해 저장한다 (싱글 종료와 멀티 사망/완주가 같이 쓴다 — 멀티는 먼저 죽어도 이 즉시 저장된다)
function settleInfRun(won) {
  const INF = window.DKCONTENT.INFINITY;
  const wave = won ? S.wave : Math.max(0, S.wave - 1); // 클리어는 그 웨이브를 완료한 것
  const prevBest = SAVE.infBest || 0;
  const r = INF.gems(wave, SAVE.infMilestones, prevBest);   // 신기록 보너스는 갱신 전 기록으로 판정
  const gems = r.gems + (won ? (INF.clearGems || 60) : 0);
  SAVE.gems += gems;
  SAVE.infMilestones = (SAVE.infMilestones || []).concat(r.newly);
  const isBest = wave > (SAVE.infBest || 0);
  if (isBest) SAVE.infBest = wave;
  const run = { wave, kills: S.inf.kills, mode: S.inf.mode, date: new Date().toISOString().slice(0, 10) };
  if (S.net) { run.mp = 1; run.code = S.net.code; }
  SAVE.infRuns = [run].concat(SAVE.infRuns || []).slice(0, 5);
  saveSave();
  return { wave, gems, isBest, newly: r.newly };
}
// 결과 오버레이 본문 (싱글은 종료 즉시, 멀티는 방 전체 결과가 모였을 때 순위표와 함께)
function infResultHTML(won, res) {
  const INF = window.DKCONTENT.INFINITY;
  const modeName = S.net ? '함께' : S.inf.mode === 'clear' ? '도전' : '무한';
  const line = S.net ? S.net.timing.clearWave : INF.clearWave;
  return (won
      ? `<b>무한 투기장 · ${modeName}</b> ${line}웨이브를 완주했습니다 — <b>클리어!</b><br>통산 클리어 <b>${SAVE.infClears || 0}</b>회<br>`
      : `${S.inf.bossLeak ? (S.inf.bossTimeout ? `보스 <b>${S.inf.bossLeak}</b>: 제한시간(5분 20초) 안에 잡지 못했습니다!<br>` : `보스 <b>${S.inf.bossLeak}</b>가 한계선을 넘었습니다!<br>`) : ''}<b>무한 투기장 · ${modeName}</b> 웨이브 <b>${res.wave}</b> 까지 버텼습니다${res.isBest ? ' — <b>최고 기록 갱신!</b>' : ` (최고 ${SAVE.infBest})`}<br>`) +
    `<div class="stat-grid"><span>도달 웨이브</span><b>${won ? `${line} 완주` : res.wave}</b><span>처치</span><b>${S.inf.kills}</b><span>쓴 골드</span><b>${S.inf.spent}</b><span>젬</span><b class="gem">+${res.gems}</b></div>` +
    `<small>${res.newly.length ? `마일스톤 ${res.newly.join(', ')} 달성 보너스 포함` : ''}${won ? `${res.newly.length ? ' · ' : ''}클리어 보너스 +${INF.clearGems || 60} 포함` : ''}</small>`;
}
function endInfinity(won) {
  if (S.net && !S.net.spectating) return netRunOver(won);   // 함께하기: 기록은 즉시 저장하고 관전으로
  S.phase = 'over';
  S.waveActive = false;
  const res = settleInfRun(won);
  if (!won) netLog(`런 종료 — 웨이브 ${res.wave} 까지`, 'life');
  (won ? SFX.win : SFX.lose)();
  showOverlay(won ? '클리어!' : res.isBest ? '신기록!' : '런 종료', infResultHTML(won, res), '로비로');
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

// 인피니티 필드 한계선: 살아있는 적이 fieldCap 을 넘으면 가장 먼저 스폰된 적이 사라지며 목숨 차감. 보스가 사라지면 런 종료.
function enforceFieldCap() {
  const INF = DKCONTENT.INFINITY, cap = INF.fieldCap || 200;
  while (S.enemies.length > cap) {
    const old = S.enemies.find(x => !x.dead); if (!old) break;
    old.dead = true;
    const op = epos(old);
    S.fxs.push({ kind: 'ring', x: op.x, y: op.y - 10, t: 0, dur: 0.5, size: 70, color: '#ff7a7a' });
    S.fxs.push({ kind: 'impact', x: op.x, y: op.y - 20, t: 0, dur: 0.3, size: 80 });
    S.lives -= INF.capDmg || 1;
    S.hurtT = 0.5;
    SFX.leak();
    netLog(old.isBoss ? `보스 ${old.name}가 한계선을 넘었습니다 — 런 종료` : `한계선 초과! ${old.name} 이탈 · 목숨 ${Math.max(0, S.lives)}`, 'life');
    if (old.isBoss) { S.lives = 0; S.inf.bossLeak = old.name; }
    S.enemies = S.enemies.filter(x => !x.dead);
    if (S.lives <= 0) { S.lives = 0; syncUI(); endInfinity(); return; }
  }
  syncUI();
}
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
  const INFC = window.DKCONTENT && DKCONTENT.INFINITY;
  // Collision size is determined by the existing roster contract, never by a network/cache result.
  const artOk = !!item.art;
  if (artOk && item.sizeClass && INFC && INFC.artSize && INFC.artSize[item.sizeClass]) {   // 인피니티 새 그림: 등급별 고정 높이 (content.js artSize · 보스는 artSizeBoss)
    const tbl = isBoss && INFC.artSizeBoss && INFC.artSizeBoss[item.sizeClass] ? INFC.artSizeBoss : INFC.artSize;
    def = Object.assign({}, def, { size: tbl[item.sizeClass] });
  }
  else if (item.sizeClass && INFC && INFC.sizeScale) { const k = INFC.sizeScale[item.sizeClass] || 1; if (k !== 1) def = Object.assign({}, def, { size: Math.round(def.size * k) }); }
  if (item.isElite) { def = Object.assign({}, def, { size: Math.round(def.size * 1.2) }); }
  const e = {
    type: item.type, def, isElite: !!item.isElite, spdMult: item.spdMult || 1,
    sizeClass: item.sizeClass || null, armor: item.armor || 0, wave: item.wave || S.wave, stunT: 0,
    hp: def.hp * (item.hpMult || 1), max: def.hp * (item.hpMult || 1),
    gold: Math.round(def.gold * (item.goldMult || 1)),
    dist: 0, slowT: 0, slowPct: 0,
    animT: Math.random(), face: 1, dead: false,
    move, sprite, hue, name: name || def.name,
    hidden: false, burrowT: Math.random() * 2,
    isBoss, bossCount: item.bossCount || 1, bossRole: item.bossRole || 0, lane, flashT: 0,
    entranceT: isBoss ? 0 : -1, // 보스 등장 연출 (>=0 이면 진행 중)
    stompPhase: 0,
    art: item.art || null,
    artWalk: item.artWalk || null,
    artWalkStride: Number.isFinite(item.artWalkStride) && item.artWalkStride > 0 ? item.artWalkStride : 0, // 원본 PNG 픽셀 / 보행 한 주기
    artWalkDistance: 0, // 실제 전진 거리 누적: 레인 순환·넉백·화면 재배치로 프레임이 건너뛰지 않는다
  };
  if (S.mode === 'infinity' && DIR_ART) {
    e.appearanceCode = DIR_ART.appearance(e.wave, e.bossRole === 1, e.isElite);
    const appearance = DIR_ART.decodeAppearance(e.appearanceCode);
    e.artAssetId = appearance && appearance.assetId;
    const table = e.isBoss ? INFC.artSizeBoss : INFC.artSize;
    e.drawHeight = directionalDrawHeight(e, table[e.sizeClass] || def.size);
  }
  S.enemies.push(e);
  if (S.mode === 'infinity') enforceFieldCap();
  const p = epos(e);
  if (isBoss && S.mode === 'infinity' && S.inf && !(S.inf.bossT > 0)) S.inf.bossT = S.net ? (S.net.timing.bossLimit / 1000) : (DKCONTENT.INFINITY.bossTimeLimit || 320); // 메운디: 보스 제한시간 (멀티는 방 규칙)
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
    if (window.DKBGM) { try { DKBGM.set('boss'); DKBGM.duck(0.4, 1.0); } catch (err) { /* 무시 */ } }
  } else {
    // 일반 적: 포탈에서 살짝 튀어나오는 스폰 링
    S.fxs.push({ kind: 'ring', x: p.x, y: p.y - (move === 'air' ? 42 : 10), t: 0, dur: 0.35, size: 34, color: move === 'air' ? '#cfe9ff' : move === 'burrow' ? '#c9a06a' : '#d9a0ff' });
  }
}

let COSMETIC = false;   // 관전 뷰의 시각 전용 시뮬: 피해·처치·소리 없음, 명중 연출만
function damageEnemy(e, dmg, src) {
  if (e.dead) return;
  if (COSMETIC) { e.flashT = 0.13; return; }
  if (S.mode === 'infinity' && S.inf && window.DKCONTENT) { // 메운디: 상성 · 방어력 · 에픽 락다운 (인피니티 전용)
    const INF = DKCONTENT.INFINITY, def = src && src.def;
    if (def && e.sizeClass && INF.sizeMult) { const m = INF.sizeMult[def.atk || 'norm']; if (m && m[e.sizeClass] != null) dmg *= m[e.sizeClass]; }
    const ignoreArmor = !!(def && def.perk === 'epic');
    if (e.armor > 0 && !ignoreArmor) dmg = Math.max(dmg * 0.1, dmg - e.armor);
    if (def && def.perk === 'epic' && INF.stun && Math.random() < INF.stun.p) e.stunT = Math.max(e.stunT || 0, e.isBoss ? INF.stun.bossDur : INF.stun.dur);
  }
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
      const ch = chestDef();
      if (S.mode === 'infinity' && S.inf && ch && DKCONTENT.INFINITY.bossReward) { // 메운디 보스 보상 — 보스 한 마리마다 (주사위는 전부, 골드는 그 웨이브 보스 수로 나눈다)
        const r = DKCONTENT.INFINITY.bossReward(e.wave || S.wave);
        const nBoss = Math.max(1, e.bossCount || 1);
        const gold = Math.round(r.gold / nBoss);
        S.gold += gold;
        for (const k of r.dice) S.inf.queue.push(k); // 손이 비면 자동으로 굴러간다 (손이 차 있어도 큐에서 기다린다)
        const left = S.enemies.filter(x => x !== e && !x.dead && x.isBoss && x.wave === e.wave).length;
        S.texts.push({ str: `보스 보상: +${gold}G · ${r.dice.map(k => ch.grade[k] + ' ' + ch.label[k]).join(' + ')}!`, x: W / 2, y: 170, t: 0, color: dieKindColor(r.dice[0]) });
        netLog(`보스 ${e.name} 처치! +${gold}G · ${r.dice.map(k => ch.grade[k]).join(' + ')}${left ? ` (보스 ${left}마리 남음)` : ''}`, 'boss');
        syncUI();   // '보상 대기' 칩을 바로 갱신 (자리가 없으면 큐에 쌓인 채로 기다린다)
        if (!S.enemies.some(x => x !== e && !x.dead && x.isBoss)) S.inf.bossT = 0; // 제한시간 해제
      }
      S.fxs.push({ kind: 'impact', x: p.x, y: p.y - 20, t: 0, dur: 0.45, size: 150 });
      S.fxs.push({ kind: 'ring', x: p.x, y: p.y - 20, t: 0, dur: 0.8, size: 160, color: '#ffd870' });
      S.shakeT = Math.max(S.shakeT || 0, 0.45);
      noise(0.4, 0.3, 500);
      if (!S.enemies.some(x => x !== e && !x.dead && (x.isBoss || x.type === 'boss')) && window.DKBGM) { try { DKBGM.set('battle'); } catch (err) { /* 무시 */ } }
    }
    SFX.coin();
    syncUI();
  }
}

// 그림을 좌우로 뒤집어야 하는가. 걷기 시트는 전부 오른쪽 향(ART-PROMPTS §2)이고, 정지컷은 그림마다 달라
// content.js 의 base 에 faceLeft(정지컷이 왼쪽을 봄) 를 적어 둔다. 시트를 쓰는 동안은 faceLeft 를 무시한다
function enemyFlip(e) {
  if (e.directionalFrame) return e.renderView === 'side' && e.face < 0;
  const movingLeft = e.face < 0;
  const usingSheet = !!(e.def && e.def.walk && A[e.def.walk]);
  const nativeLeft = !e.art && !e.artWalk && !usingSheet && !!(e.def && e.def.faceLeft);   // 인피니티 새 그림은 전부 오른쪽 향
  return movingLeft !== nativeLeft;
}
// 사망 연출: 스프라이트가 떠오르며 희미해지고 발밑에 먼지가 퍼진다
function enemyAirHeight(e, p, fr) {
  if (e.move !== 'air') return 0;
  const lane = LANES[e.lane || 0] || LANES[0];
  if (!fr || !fr.directional || (lane.loopAt != null && e.dist < lane.loopAt)) return 42;
  // On the upper road a tall flyer needs room for its head. Reduce only its
  // display altitude, using the fixed authored frame pivot plus 5px bob/8px margin.
  // Entry motion, path distance, targeting and the ground shadow stay unchanged.
  const headroom = p.y + 4 - fr.pivot[1] * e.drawHeight / fr.referenceHeight - 13;
  return Math.min(42, Math.max(0, headroom));
}
function spawnDeath(e, p) {
  const fr = currentEnemyFrame(e);
  const airY = enemyAirHeight(e, p, fr);
  if (fr) {
    S.corpses.push({ fr, x: p.x, y: p.y + 4 - airY, h: fr.directional ? e.drawHeight : e.def.size, hue: e.hue, t: 0, dur: e.isBoss ? 0.7 : 0.42, boss: e.isBoss, flip: enemyFlip(e) });
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
function enemyWalkFrameIndex(e, frames) {
  if (e.artWalkStride > 0 && frames[0] && frames[0].h > 0 && e.def.size > 0) {
    // 그리기와 같은 높이 비율을 쓴다. 정예의 확대된 몸·다리도 그에 맞는 긴 보폭으로 이동한다.
    const stride = e.artWalkStride * e.def.size / frames[0].h;
    return Math.floor((e.artWalkDistance || 0) / stride * frames.length) % frames.length;
  }
  return Math.floor(e.animT * 5) % frames.length;
}
function currentEnemyFrame(e) {
  e.directionalFrame = false;
  if (directionalArt && e.artAssetId && directionalArt.entry(e.artAssetId)) {
    const p = epos(e);
    e.artDirection = DIR_ART.direction(p.dx, p.dy, e.artDirection);
    const fr = directionalArt.frame(e.artAssetId, e.artDirection, directionalPhase(e));
    if (fr && fr.cv && fr.cv.width) { e.directionalFrame = true; e.renderView = fr.view; return fr; }
    return null; // An approved identity may never turn into unrelated legacy art.
  }
  if (e.artWalk) { const aw = A[e.artWalk]; if (Array.isArray(aw) && aw.length) { const fr = aw[enemyWalkFrameIndex(e, aw)]; if (fr && fr.cv) return fr; } }
  if (e.art) { const a = A[e.art]; if (a && a.cv) return a; }
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
const powerLv = face => (S.mode === 'infinity' && S.inf) ? (S.inf.power[face > 6 ? 6 : face] || 0) : 0; // ★ 히든 타워(7+)는 6눈(폭군) 파워업을 따른다
const DP = () => window.DKCONTENT && DKCONTENT.DICE_POWER;
const powerTier = face => DP() ? DP().tier(powerLv(face)) : 0;
const powerSpecial = (face, key) => { const d = DP(); const s = d && d.special[face]; return (s && s[key] != null) ? s[key] : null; };
const towerDmg   = t => {
  let m = LVL_DMG[t.lvl - 1];
  const d = DP();
  if (d) { m *= d.dmgMult(powerLv(t.face)); const ex = powerSpecial(t.face, 'dmg'); if (ex) m *= 1 + ex * powerTier(t.face); }
  return t.def.dmg * m;
};
// 인피니티 사거리 보너스는 아레나마다 다르다 — 세로 아레나는 트랙이 길어 중앙 타워가 더 멀리 닿아야 한다
function arenaRangeBonus() {
  if (S.mode !== 'infinity' || !window.DKCONTENT) return 0;
  const m = DKCONTENT.maps && DKCONTENT.maps.find(x => x.key === S.mapKey);
  return (m && m.rangeBonus != null) ? m.rangeBonus : (DKCONTENT.INFINITY.rangeBonus || 0);
}
const towerRange = t => t.def.range + LVL_RANGE[t.lvl - 1] + (DP() ? DP().rangeAdd(powerLv(t.face)) : 0) + arenaRangeBonus();
const towerRate  = t => { let r = t.def.rate * LVL_RATE[t.lvl - 1]; const ex = powerSpecial(t.face, 'rate'); if (ex) r *= Math.pow(ex, powerTier(t.face)); if (S.mode === 'infinity' && t.def.perk === 'myth' && window.DKCONTENT) r /= DKCONTENT.INFINITY.mythRate || 1.5; return r; };
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
  if (S.gold < cost) { SFX.deny(); return false; } // 랜덤다이스식: 골드로 파워업
  S.gold -= cost; S.inf.spent += cost;
  S.inf.power[f] = lv + 1;
  const def = TOWER_DEFS[f];
  for (const t of S.towers) if (t.face === f) {
    S.fxs.push({ kind: 'circle', x: t.x, y: t.y + 4, t: 0, dur: 0.7, size: 110, color: def.color, pips: f });
    S.fxs.push({ kind: 'ring', x: t.x, y: t.y - 40, t: 0, dur: 0.45, size: 70, color: def.color });
  }
  S.texts.push({ str: `${def.name} 파워업 Lv${lv + 1}!`, x: W / 2, y: H / 2 - 70, t: 0, color: def.color, big: true });
  coachHit('power');
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
  const visualFrom = towerVisualEmitter(t);

  if (t.def.laser) {
    const tp = epos(best);
    const to = { x: tp.x, y: tp.y - best.def.size * 0.45 - (best.move === 'air' ? 42 : 0) };
    damageEnemy(best, dmg, t);
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
      damageEnemy(e, dd, t);
      dd *= 0.75;
      S.fxs.push({ kind: 'spark', x: p.x, y: p.y - e.def.size * 0.4, t: 0, dur: 0.16, size: 34 });
    }
    S.beams.push({ pts, t: 0, dur: 0.16, style: 'lightning' });
    SFX.t5();
  } else {
    S.projs.push({
      kind: t.def.proj, x: from.x, y: from.y, tgt: best,
      launchOffset: [visualFrom.x - from.x, visualFrom.y - from.y], visualAge: 0,
      spd: t.def.pspd, dmg, splash: towerSplash(t),
      star: t.def.star || 0, color: t.def.star ? starColor(t.def) : null, trail: [],
      slow: t.def.slow ? { pct: towerSlowPct(t), dur: 1.8 } : null,
      rot: 0, spin: 0, src: t,
    });
    if (t.face === 2) {
      S.fxs.push({ kind: 'muzzleFlash', x: from.x, y: from.y, t: 0, dur: 0.12, size: 38 });
    }
    if (t.def.star) { // ★ 타워: 밴드색 발사 섬광 + 링 — 성이 높을수록 크다
      const sc = starColor(t.def), k = t.def.star - 6;
      S.fxs.push({ kind: 'muzzleFlash', x: visualFrom.x, y: visualFrom.y, t: 0, dur: 0.13, size: 34 + k * 3 });
      S.fxs.push({ kind: 'ring', x: visualFrom.x, y: visualFrom.y, t: 0, dur: 0.26, size: 34 + k * 4, color: sc });
    }
    (SFX['t' + t.face] || SFX.t6)();
  }
}

// 투사체·이펙트·빔·텍스트 갱신 — update() 와 관전 뷰(mpViewAdvance, 시각 전용 시뮬)가 같이 쓴다
function updateVisuals(dt) {
  // 투사체
  for (const p of S.projs) {
    if (p.tgt.dead || (LANES[p.tgt.lane || 0].loopAt == null && p.tgt.dist >= laneLen(p.tgt))) { p.gone = true; continue; }
    const tp = epos(p.tgt);
    const tx = tp.x, ty = tp.y - p.tgt.def.size * 0.4 - (p.tgt.move === 'air' ? 42 : 0);
    const dx = tx - p.x, dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    p.rot = Math.atan2(dy, dx);
    p.spin += dt * 13;
    const step = p.spd * dt;
    if (p.trail) { p.trail.push(projectileDrawPosition(p)); if (p.trail.length > 3) p.trail.shift(); }
    p.visualAge = (p.visualAge || 0) + dt;
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
}

function sheetHit(kind, x, y, size, dur) {
  S.fxs.push({ kind, x, y, t: 0, dur: dur || 0.32, size });
}

// ★ 타워 명중 연출: 밴드색 충격파 + 파편, 등급 특전마다 다르게 보이게 한다
function starImpact(p, hx, hy) {
  const col = p.color || '#ffd452', k = p.star - 6;
  S.fxs.push({ kind: 'ring', x: hx, y: hy, t: 0, dur: 0.3 + k * 0.012, size: p.splash * 2 + k * 8, color: col });
  const shards = Math.min(10, 3 + Math.floor(k / 2));
  for (let i = 0; i < shards; i++) {
    const a = Math.random() * Math.PI * 2, v = 90 + Math.random() * 110;
    S.fxs.push({ kind: 'spark', x: hx, y: hy, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, t: 0, dur: 0.3, size: 12 + k, color: col });
  }
  const perk = p.src && p.src.def.perk;
  if (perk === 'epic') {        // 방어 무시: 흰 파쇄 샤드
    S.fxs.push({ kind: 'ring', x: hx, y: hy, t: 0, dur: 0.22, size: p.splash * 1.3, color: '#ffffff' });
  } else if (perk === 'myth') { // 공속: 이중 링으로 연타감
    S.fxs.push({ kind: 'ring', x: hx, y: hy, t: 0, dur: 0.44, size: p.splash * 2.6, color: col }); // 느리게 퍼지는 두 번째 링
  }
}

function projHit(p) {
  const tp = epos(p.tgt);
  const hx = tp.x, hy = tp.y - p.tgt.def.size * 0.4;
  if (p.src && p.src.def.perk === 'primal' && S.mode === 'infinity') { // 태초: 트랙 위 모든 적에게 스플래시
    for (const e of S.enemies) if (!e.dead) damageEnemy(e, p.dmg, p.src);
    sheetHit('dieExplode', hx, hy, 260, 0.5);
    S.fxs.push({ kind: 'ring', x: hx, y: hy, t: 0, dur: 0.5, size: 420, color: '#ffffff' });
    S.texts.push({ str: '태초의 일격!', x: hx, y: hy - 40, t: 0, color: '#ffffff' });
  } else if (p.splash) {
    for (const e of S.enemies) {
      if (e.dead) continue;
      const ep = epos(e);
      if (Math.hypot(ep.x - hx, ep.y - hy + e.def.size * 0.4) <= p.splash) damageEnemy(e, p.dmg, p.src);
    }
    if (p.kind === 'dieBomb' || p.kind === 'die6') {
      sheetHit('dieExplode', hx, hy, p.splash * 2.2, 0.4);
    } else {
      sheetHit('cannonBlast', hx, hy, p.splash * 2, 0.34);
    }
    if (p.star) starImpact(p, hx, hy);
  } else {
    damageEnemy(p.tgt, p.dmg, p.src);
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
  if (S.glowT > 0) S.glowT -= dt;
  if (S.phase !== 'playing') return;

  if (S.mode === 'infinity') pumpQueue(); // 보상 대기열: 손이 비면 자동으로 굴림
  if (window.__coachOn) { COACH.t = (COACH.t || 0) + dt; if (COACH.t > 0.4) { COACH.t = 0; coachRender(); } } // 대상이 생기면 잡아준다

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
    if (e.stunT > 0) { e.stunT -= dt; continue; } // 락다운
    let sp = e.def.speed * (e.spdMult || 1);
    if (e.slowT > 0) { e.slowT -= dt; sp *= (1 - e.slowPct); }
    const previousDist = e.dist;
    e.dist += sp * dt;
    if (e.appearanceCode || (e.artWalk && e.artWalkStride > 0)) e.artWalkDistance += Math.max(0, e.dist - previousDist);
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
      const ln = LANES[e.lane || 0] || LANES[0];
      if (ln.loopAt != null) { e.dist = ln.loopAt + (e.dist - ln.len); e.laps = (e.laps || 0) + 1; continue; } // 인피니티: 영원히 돈다
      e.dead = true;
      S.lives -= e.def.dmg;
      S.hurtT = 0.5;
      SFX.leak();
      pushLog(`${e.name || e.def.name} 이(가) 성채에 도달! 목숨 ${Math.max(0, S.lives)}`, 'life');
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
  if (ROLL_SHOW.t > 0) ROLL_SHOW.t -= dt;

  // 타워 공격
  for (const t of S.towers) towerFire(t, dt);

  updateVisuals(dt);

  // 메운디 보스 제한시간: 보스가 살아있는 동안 카운트다운, 0이 되면 런 종료
  if (S.mode === 'infinity' && S.inf && S.inf.bossT > 0) {
    const boss = S.enemies.find(x => !x.dead && x.isBoss);
    if (!boss) S.inf.bossT = 0;
    else {
      S.inf.bossT -= dt;
      if (S.inf.bossT <= 0) { S.inf.bossT = 0; S.lives = 0; S.inf.bossLeak = boss.name; S.inf.bossTimeout = true; syncUI(); endInfinity(); return; }
    }
  }
  // 웨이브 종료 판정
  // 인피니티: 스폰이 끝나면 완료 (남은 적은 계속 돈다). 단 보스 웨이브는 메운디 보스 라운드처럼 보스를 잡을 때까지 다음 웨이브를 막는다 (제한시간 5분 20초)
  const infBossHold = S.mode === 'infinity' && DKCONTENT.INFINITY.isBossWave(S.wave) && S.enemies.some(e => e.isBoss && !e.dead);
  if (S.waveActive && S.spawnQ.length === 0 && (S.enemies.length === 0 || (S.mode === 'infinity' && !infBossHold))) {
    S.waveActive = false;
    const bonus = 20 + S.wave * 3 + S.stage * 2;
    S.gold += bonus;
    S.texts.push({ str: '웨이브 클리어! +' + bonus + 'G', x: W / 2, y: H / 2 - 40, t: 0, color: '#a0ffc8' });
    SFX.coin();
    if (S.mode === 'infinity') {
      if (S.net) { S.net.doneW = S.wave; if (window.DKNET) DKNET.done(S.wave); }   // 방에 완료 보고 (통계·카드용)
      if (checkInfClear()) return;              // 도전 모드: 101웨이브 완주 = 클리어
      S.autoT = DKCONTENT.INFINITY.intermission;
      syncUI();
      return;
    }
    if (S.wave >= S.stageWaves) { onStageClear(); return; }
    S.autoT = INTERMISSION;
    syncUI();
  }
  if (!S.waveActive && (S.wave > 0 || S.net) && S.wave < S.stageWaves && S.autoT > 0) {   // 멀티는 첫 웨이브도 준비 시간이 끝나면 자동
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
  ctx.font = uiFont(13); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
  ctx.font = uiFont(14);
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
let directionalFlash = null;
function flashCanvas(fr, drawW, drawH) {
  if (!fr || !fr.cv) return null;
  if (fr.directional) {
    // One small presentation scratch surface, not a second copy of every cached animation frame.
    if (!directionalFlash) directionalFlash = document.createElement('canvas');
    directionalFlash.width = Math.max(1, Math.min(512, Math.ceil(drawW || fr.w)));
    directionalFlash.height = Math.max(1, Math.min(512, Math.ceil(drawH || fr.h)));
    const c = directionalFlash.getContext('2d');
    c.drawImage(fr.cv, 0, 0, directionalFlash.width, directionalFlash.height);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = '#fff'; c.fillRect(0, 0, directionalFlash.width, directionalFlash.height);
    c.globalCompositeOperation = 'source-over';
    return directionalFlash;
  }
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
function enemyFramePlacement(fr, height) {
  if (fr.directional) {
    // Keep the rat readable head-on without changing its side size or gait phase.
    // Scale around the authored ground pivot, including stills and death frames.
    const viewScale = fr.assetId === 'w001' && (fr.view === 'front' || fr.view === 'back') ? 1.6 : 1;
    const scale = height * viewScale / fr.referenceHeight;
    return { w: fr.w * scale, h: fr.h * scale, x: -fr.pivot[0] * scale, y: -fr.pivot[1] * scale };
  }
  const w = height * fr.w / fr.h;
  return { w, h: height, x: -w / 2, y: -height };
}

// 코드 생성 레인(하늘길·땅굴)과 추가 포탈을 배경 위에 그린다
function drawLanes() {
  for (let li = 0; li < LANES.length; li++) {
    const lane = LANES[li];
    if (lane.kind === 'ground') { if (ARENA && !ARENA.noGoal) drawPortal(lane.pts[0][0], lane.pts[0][1], lane); continue; }
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
      ctx.font = uiFont(12); ctx.textAlign = 'center';
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
      const place = enemyFramePlacement(fr, h);
      ctx.save();
      ctx.globalAlpha = (1 - pr) * 0.85;
      if (c.hue) ctx.filter = `hue-rotate(${c.hue}deg)`;
      ctx.translate(c.x, c.y - pr * 26);
      if (c.flip) ctx.scale(-1, 1);            // 죽을 때 보던 방향 그대로
      if (fr.cv.width) ctx.drawImage(fr.cv, place.x, place.y, place.w, place.h);
      ctx.filter = 'none';
      ctx.restore();
    } else {
      const e = ent.o, p = ent.p;
      const fr = currentEnemyFrame(e);
      const airY = enemyAirHeight(e, p, fr);
      const authored = directionalArt && directionalArt.entry(e.artAssetId);
      const bob = (authored || (e.artWalk && e.artWalkStride > 0)) && e.move !== 'air' ? 0 : Math.sin(e.animT * 6) * (e.move === 'air' ? 5 : 2);
      const drawY = p.y + 4 - airY - bob;
      if (e.slowT > 0) {
        ctx.save();
        ctx.translate(p.x, p.y - airY);
        ctx.scale(1, 0.45);
        ctx.beginPath(); ctx.arc(0, 0, e.def.size * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120,190,255,0.3)'; ctx.fill();
        ctx.restore();
      }
      // 보스: 등장 스케일업(오버슈트) + 쿵쿵 스쿼시
      let sx = 1, sy = 1;
      if (e.isBoss) {
        if (e.entranceT >= 0) {
          const q = Math.min(1, e.entranceT / (BOSS_ENTRANCE * 0.8));
          const o = 1.7;
          const ease = 1 + (o + 1) * Math.pow(q - 1, 3) + o * Math.pow(q - 1, 2);
          sx = sy = 0.15 + 0.85 * Math.max(0, ease);
        } else if (e.move !== 'air' && !(fr && fr.directional)) {
          const st = Math.abs(Math.sin(e.animT * Math.PI * 2 / 1));
          sy = 1 - 0.07 * st; sx = 1 + 0.06 * st;
        }
      }
      ctx.save();
      if (e.hidden) ctx.globalAlpha = 0.22;
      ctx.translate(p.x, drawY);
      // 진행 방향(e.face: 접선 부호, 세로 구간은 직전 값 유지) ⊕ 그림의 원래 방향(faceLeft) → 왼쪽으로 갈 때 뒤집는다
      ctx.scale(sx * (enemyFlip(e) ? -1 : 1), sy);
      if (e.hue) ctx.filter = `hue-rotate(${e.hue}deg)`;
      if (fr && fr.cv) {
        const h = fr.directional ? e.drawHeight : e.def.size;
        const place = enemyFramePlacement(fr, h);
        ctx.drawImage(fr.cv, place.x, place.y, place.w, place.h);
        if (e.flashT > 0) {
          // 피격 플래시: 흰 실루엣을 겹친다
          const fl = flashCanvas(fr, place.w, place.h);
          if (fl) { ctx.filter = 'none'; ctx.globalAlpha = Math.min(1, e.flashT / 0.13) * 0.85; ctx.drawImage(fl, place.x, place.y, place.w, place.h); }
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
      if (e.stunT > 0 && !e.hidden) { // 락다운 표시
        ctx.save(); ctx.font = uiFont(16); ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.fillStyle = '#ffe86b';
        const yy = p.y - airY - e.def.size - 4; ctx.strokeText('⚡', p.x, yy); ctx.fillText('⚡', p.x, yy); ctx.restore();
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
    if (p.trail && p.trail.length) { // ★ 탄: 지나온 자리에 짧은 잔상
      ctx.save();
      for (let i = 0; i < p.trail.length; i++) {
        const q = p.trail[i], a = (i + 1) / (p.trail.length + 1);
        ctx.globalAlpha = a * 0.4;
        ctx.fillStyle = p.color || '#ff5555';
        ctx.beginPath(); ctx.arc(q.x, q.y, 4 + a * 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    const drawPoint = projectileDrawPosition(p);
    ctx.translate(drawPoint.x, drawPoint.y);
    if (p.kind === 'dieBomb' || p.kind === 'die6') {
      const sp = A.dieBomb || A.dice[5];
      const w = 26 + (p.star ? (p.star - 6) * 1.1 : 0);   // ★ 가 높을수록 큰 탄
      const s = w / sp.w;
      ctx.rotate(p.spin);
      ctx.shadowColor = p.color || '#ff5555'; ctx.shadowBlur = p.star ? 15 : 8;
      ctx.drawImage(sp.cv, -w / 2, -sp.h * s / 2, w, sp.h * s);
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
      acquireBurst: A.acquireBurst, confetti: A.confetti, chestOpen: A.chestOpen,
    };
    if (pr < 0) continue;                                       // 지연 시작 (t 가 음수)
    if (sheetMap[f.kind]) {
      const frames = sheetMap[f.kind];
      const fr = frames[Math.min(3, Math.floor(pr * 4))];
      const s = f.size / Math.max(fr.w, fr.h);
      ctx.save();
      ctx.globalAlpha = 1 - pr * 0.4;
      if (f.add) ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(fr.cv, f.x - fr.w * s / 2, f.y - fr.h * s / 2, fr.w * s, fr.h * s);
      ctx.restore();
    } else if (f.kind === 'ringImg') {                          // 그림 링: 회전하며 커지고 사라진다
      const im = A[f.img]; if (!im || !im.cv) continue;
      const sz = f.size * (0.3 + 0.9 * pr);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - pr) * 0.95; ctx.globalCompositeOperation = 'lighter';
      ctx.translate(f.x, f.y); ctx.rotate(S.time * (f.spin || 1.2) + (f.phase || 0));
      ctx.drawImage(im.cv, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    } else if (f.kind === 'column') {                           // 빛기둥: 아래에서 위로 뻗는다
      const im = A.acquireColumn; if (!im || !im.cv) continue;
      const hgt = f.size * Math.min(1, pr * 3), wd = hgt * (im.w / im.h);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - pr) * 0.9; ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(im.cv, f.x - wd / 2, f.y - hgt, wd, hgt);
      ctx.restore();
    } else if (f.kind === 'sprite') {                           // 단일 그림 파티클 (반짝이)
      const im = A[f.img]; if (!im || !im.cv) continue;
      const tt = Math.max(0, f.t), sz = f.size * (1 + pr * 0.4);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - pr); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(f.x + (f.vx || 0) * tt, f.y + (f.vy || 0) * tt); ctx.rotate(S.time * 3 + (f.phase || 0));
      ctx.drawImage(im.cv, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    } else if (f.kind === 'burst') {
      const g = 320;                                            // 중력
      const tt = Math.max(0, f.t);
      const bx = f.x + f.vx * tt, by = f.y + f.vy * tt + 0.5 * g * tt * tt;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - pr) * 0.95;
      ctx.fillStyle = f.color || '#ffe9a0';
      ctx.shadowColor = f.color || '#ffe9a0'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(bx, by, f.size * (1 - pr * 0.5), 0, Math.PI * 2); ctx.fill();
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
      if (pr < 0) continue;                                     // 시작을 늦춘 링(t<0)은 아직 그리지 않는다
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
  // 뽑기·굴림 주사위를 화면 중앙에 크게 (좌하단 슬롯의 작은 굴림은 그대로 두고, 눈에 띄는 쪽을 하나 더)
  drawCenterRoll();

  // 플로팅 텍스트
  for (const t of S.texts) {
    const pr = t.t / 1.1;
    ctx.save();
    ctx.globalAlpha = 1 - pr;
    ctx.fillStyle = t.color;
    ctx.font = uiFont(t.big ? 26 : 15);
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = t.big ? 5 : 3;
    ctx.strokeText(t.str, t.x, t.y - pr * 30);
    ctx.fillText(t.str, t.x, t.y - pr * 30);
    ctx.restore();
  }

  // 피격 시 붉은 테두리
  if (S.glowT > 0) {                                          // 고성 획득: 가장자리가 타워 색으로 빛난다
    ctx.save();
    const a = Math.min(0.55, S.glowT * 0.7);
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.hypot(W, H) * 0.28, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, hexA(S.glowColor || '#ffd452', a));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (S.hurtT > 0) {
    ctx.save();
    const a = Math.min(0.5, S.hurtT);
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.hypot(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.54);
    grad.addColorStop(0, 'rgba(200,30,30,0)');
    grad.addColorStop(1, `rgba(200,30,30,${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 웨이브 예고 · 보스 남은 시간 — 같은 말풍선. (보스 시간을 칩에 넣으면 칩이 길어져 우상단 미니 버튼이 둘째 줄로 밀린다)
  const bossT = S.mode === 'infinity' && S.inf && S.inf.bossT > 0 ? S.inf.bossT : 0;
  if (S.phase === 'playing' && !VIEW.pid && (bossT > 0 || (!S.waveActive && S.wave < S.stageWaves))) {
    ctx.save();
    ctx.textAlign = 'center';
    const cd = waveCountdown();
    const urgent = bossT > 0 && bossT < 30;
    const msg = bossT > 0
      ? `보스 웨이브 ${S.wave} · 남은 시간 ${Math.floor(bossT / 60)}:${String(Math.floor(bossT % 60)).padStart(2, '0')}`
      : S.net
        ? (S.wave === 0 ? `첫 웨이브까지 ${cd}초 — 뽑기(160G)로 타워를 놓으세요` : `다음 웨이브까지 ${cd}초`)
        : S.wave === 0
          ? (S.mode === 'infinity' ? '뽑기(160G)를 눌러 주사위를 뽑고, 굴러 나온 타워를 석단에 놓으세요!' : '주사위를 던져 타워를 배치하고, 준비되면 웨이브를 시작하세요!')
          : `다음 웨이브까지 ${cd}초`;
    // 화면에서 항상 같은 크기로 읽히게 한다 (세로 아레나는 캔버스가 커서 그냥 비례시키면 깨알같이 작다)
    const sc = stageScale() || 1;
    let fs = Math.round(17 / sc);
    ctx.font = uiFont(fs);
    while (fs > 12 && ctx.measureText(msg).width > W - 48) { fs -= 1; ctx.font = uiFont(fs); }
    const tw = ctx.measureText(msg).width;
    const pw = Math.min(W - 40, tw + 34), ph = fs + 18;
    // 좌상단 칩·우상단 미니 버튼(HTML) 바로 아래. 높이는 화면 기준이라 캔버스로 환산한다 (좁은 세로 화면은 미니 버튼이 둘째 줄로 내려온다)
    const by = Math.round(hudTopPx() / sc + ph / 2);
    ctx.fillStyle = bossT > 0 ? 'rgba(46,8,8,0.78)' : 'rgba(14,10,6,0.72)';                         // 보스: 붉은 말풍선, 30초 밑이면 테두리·글자가 깜빡인다
    ctx.strokeStyle = urgent ? (Math.floor(S.time * 2) % 2 ? 'rgba(255,110,110,0.95)' : 'rgba(255,60,60,0.6)') : bossT > 0 ? 'rgba(255,140,120,0.65)' : 'rgba(232,182,74,0.5)';
    ctx.lineWidth = urgent ? 2 : 1.5;
    ctx.beginPath(); ctx.roundRect(W / 2 - pw / 2, by - ph / 2, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = urgent ? '#ffb0a0' : bossT > 0 ? '#ffe0d0' : 'rgba(255,240,200,0.95)';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, W / 2, by);
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
    const by0 = H / 2 - 52, bh = 92;
    const rib = ctx.createLinearGradient(0, by0, 0, by0 + bh);   // 위아래로 어두워지는 리본
    rib.addColorStop(0, 'rgba(96,10,10,0.72)');
    rib.addColorStop(0.5, 'rgba(38,0,0,0.82)');
    rib.addColorStop(1, 'rgba(96,10,10,0.72)');
    ctx.fillStyle = rib;
    ctx.fillRect(0, by0, W, bh);
    const edge = ctx.createLinearGradient(0, 0, W, 0);           // 좌우로 빠지는 금속 테두리
    edge.addColorStop(0, 'rgba(255,90,90,0)');
    edge.addColorStop(0.5, '#ff8a8a');
    edge.addColorStop(1, 'rgba(255,90,90,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, by0, W, 3); ctx.fillRect(0, by0 + bh - 3, W, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, by0 + 3, W, 2);                              // 상단 하이라이트
    ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.font = uiFont(Math.round(40 - (1 - inA) * 12));
    ctx.fillStyle = '#ffd2d2';
    ctx.strokeText('BOSS 등장!', W / 2, H / 2 - 8);
    ctx.fillText('BOSS 등장!', W / 2, H / 2 - 8);
    ctx.font = uiFont(20);
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

// 화면에 맞춰 스테이지와 HUD 를 배치한다. 세 가지 배치가 있고 JS 가 실제 가용 공간으로 고른다
// (스테이지 크기는 뷰포트 폭이 아니라 세로 여유가 정하므로 미디어쿼리로는 맞출 수 없다):
//   over    — 인피니티 가로: 아레나 캔버스가 화면 비율로 만들어져 화면을 꽉 채우고, HUD 는 한 줄로 아레나 아래쪽에 겹친다
//   bleed   — 인피니티 세로: 아래 두 줄 HUD 를 뺀 나머지를 아레나가 전부 쓴다 (캔버스 높이가 화면 비율을 따른다)
//   side    — 스테이지 모드, 가로로 넓고 낮은 화면(가로 폰): #wrap 을 row 로, HUD 를 오른쪽 세로 열로
//   stacked — 그 외(세로 폰·데스크톱): 스테이지 위, HUD 아래. 남는 세로 공간은 HUD 를 키워 채운다
const SIDE_MIN_HUD = 150, SIDE_MAX_HUD = 240, ROOMY_GAP = 120, ROOMY_MAX = 430;
const OVER_MAX_W = 1600, OVER_TOP_INSET = 44;   // 겹침 배치 최대 폭 · 위쪽 자원 칩 줄 높이(css px)
let RELAYOUTING = false;
let rotateHintOff = false;
try { rotateHintOff = localStorage.getItem('dk_rotateHint') === 'off'; } catch (e) { /* 사파리 프라이빗 */ }
function wrapAvail() {
  const cs = getComputedStyle(wrapEl);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  return { availW: wrapEl.clientWidth - padX, availH: wrapEl.clientHeight - padY, gap: parseFloat(cs.rowGap) || 8 };
}
const arenaPlaying = () => S.mode === 'infinity' && (S.phase === 'playing' || S.phase === 'spectate');
// 아레나 캔버스 크기: 짧은 변은 고정(가로 576 / 세로 720)이고 긴 변이 화면 비율을 따른다.
// 가로는 위(칩 줄)·아래(겹침 HUD) 만큼 트랙을 비켜 세우도록 inset 을 캔버스 좌표로 넘긴다.
function arenaCanvasForScreen(key) {
  const { availW, availH, gap } = wrapAvail();
  const hudH = hudEl.classList.contains('hidden') ? 0 : hudEl.offsetHeight;
  if (key === 'cInfP') {
    const boxH = Math.max(200, availH - hudH - gap);
    const h = Math.max(880, Math.min(2000, Math.round(720 * boxH / Math.max(200, availW))));   // 880: 트랙(±360)+여백 · 2000: 폴더블 커버·초장신 화면
    // 거의 정사각형 화면(폴더블 펼침): HUD 두 줄 위의 상자가 납작하면 세로 아레나를 옆으로 넓혀 여백을 채운다 (보드·트랙은 가운데 그대로)
    const w = h === 880 && boxH / Math.max(200, availW) < 880 / 720 ? Math.min(1400, Math.round(880 * availW / boxH)) : 720;
    return { w, h, inset: { top: 0, bottom: 0 } };
  }
  const w = Math.max(680, Math.min(OVER_MAX_W, Math.round(576 * availW / Math.max(200, availH))));   // 680: 트랙(±262+52)+여백 — 거의 정사각 화면(폴더블 펼침)도 레터박스 없이
  const sc = Math.min(availH, availW / (w / 576)) / 576;      // 캔버스 1px 이 화면에서 몇 px 인지
  return { w, h: 576, inset: { top: Math.round(OVER_TOP_INSET / sc), bottom: Math.round((hudH + 4) / sc) } };
}
function fitStage() {
  // 모바일 키보드: 채팅 입력 중 visualViewport 가 줄어들면 아레나를 다시 굽지 않는다 (로그 패널만 --kb 만큼 올린다)
  const ae = document.activeElement;
  const kb = ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && window.visualViewport && visualViewport.height < window.innerHeight * 0.8;
  if (kb) { wrapEl.style.setProperty('--kb', Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop) + 'px'); return; }
  wrapEl.style.setProperty('--kb', '0px');
  const hudHidden = hudEl.classList.contains('hidden');
  const inf = arenaPlaying();
  const portraitScreen = typeof screenIsPortrait === 'function' && screenIsPortrait();
  const over = inf && !hudHidden && !portraitScreen;
  wrapEl.classList.toggle('bleed', inf);
  wrapEl.classList.toggle('over', over);
  const { availW, availH, gap } = wrapAvail();
  // 좁은 가로(작은 폰 가로): 겹침 HUD 한 줄이 안 들어가면 부품을 줄이고(narrow), 그래도 모자라면 파워업 줄을 아래로(xnarrow)
  wrapEl.classList.toggle('narrow', over && availW < 760);
  wrapEl.classList.toggle('xnarrow', over && availW < 600);
  wrapEl.classList.toggle('short', !inf && availH < 480);
  // 우상단 미니 버튼 폭 → 좌상단 칩이 비킬 여유 (버튼 수가 멀티에서 늘어난다)
  stageEl.style.setProperty('--mini-w', miniEl.classList.contains('hidden') ? '0px' : miniEl.offsetWidth + 'px');
  if (!RELAYOUTING && inf && typeof arenaKeyForScreen === 'function') {
    // 방향이 바뀌었거나 화면 비율이 캔버스와 2% 이상 어긋나면 아레나를 다시 굽는다 (타워 칸·적 진행률은 보존)
    const want = arenaKeyForScreen();
    const a = arenaCanvasForScreen(want);
    const cur = (window.DKCONTENT.maps.find(x => x.key === S.mapKey) || {}).inset || { top: 0, bottom: 0 };
    if (want !== S.mapKey || Math.abs(a.w / a.h - W / H) > 0.02 * (W / H) || Math.abs(a.inset.bottom - cur.bottom) > 10 || Math.abs(a.inset.top - cur.top) > 10) {
      RELAYOUTING = true; try { relayoutArena(want, true); } finally { RELAYOUTING = false; } return;
    }
  }
  const AR = W / H;                       // 현재 아레나 비율 (세로 아레나면 <1)
  const portraitArena = AR < 1;
  // 세로 아레나는 화면도 세로라는 뜻이므로 HUD 를 옆으로 보내지 않는다
  const side = !inf && !portraitArena && !hudHidden && availH > 0 && availW / availH >= 1.45 && availH < 620;
  wrapEl.classList.toggle('side', side);
  const setPx = (el, k, v) => { const px = Math.floor(v) + 'px'; if (el.style[k] !== px) el.style[k] = px; };
  const clearPx = (el, k) => { if (el.style[k]) el.style[k] = ''; };
  const rh = $('rotate-hint');

  let w;
  if (over) {
    // 아레나가 화면을 다 쓰고 HUD 한 줄이 그 아래쪽에 겹친다. 캔버스 비율이 화면과 같으니 보통 여백이 없다
    w = Math.max(240, Math.min(availW, availH * AR, OVER_MAX_W));
    const h = w / AR;
    hudEl.classList.remove('roomy');
    clearPx(hudEl, 'height');
    setPx(hudEl, 'width', w);
    setPx(hudEl, 'left', (wrapEl.clientWidth - w) / 2);
    setPx(hudEl, 'bottom', (wrapEl.clientHeight - h) / 2);
    wrapEl.style.setProperty('--hud-h', hudEl.offsetHeight + 'px');
    if (rh) rh.classList.add('hidden');
  } else if (side) {
    // HUD 를 오른쪽 세로 열로: 스테이지가 세로를 다 쓰고 남은 폭을 HUD 가 갖는다
    const hudW = Math.min(SIDE_MAX_HUD, Math.max(SIDE_MIN_HUD, availW - availH * AR - gap));
    clearPx(hudEl, 'left'); clearPx(hudEl, 'bottom');
    setPx(hudEl, 'width', hudW);
    setPx(hudEl, 'height', availH);
    w = Math.max(240, Math.min(availW - hudW - gap, availH * AR));
    hudEl.classList.remove('roomy');
    if (rh) rh.classList.add('hidden');
  } else {
    clearPx(hudEl, 'height'); clearPx(hudEl, 'left'); clearPx(hudEl, 'bottom');
    const maxW = Math.max(240, Math.min(availW, inf ? availW : 1280));
    const hudH = () => hudHidden ? 0 : hudEl.offsetHeight + gap;
    const stageW = (h) => Math.max(240, Math.min(maxW, (availH - h) * AR));
    setPx(hudEl, 'width', maxW);
    const wideH = hudH();
    w = stageW(wideH);
    setPx(hudEl, 'width', w);
    if (!hudHidden && hudEl.offsetHeight + gap > wideH + 1) setPx(hudEl, 'width', maxW); // 좁히면 접히는 경우 → 넓은 폭 유지
    w = stageW(hudH());
    if (inf) {
      // 인피니티 세로: 남는 공간은 아레나 캔버스가 (화면 비율로) 먹었으므로 HUD 는 자연 높이 그대로
      hudEl.classList.remove('roomy');
      if (rh) rh.classList.add('hidden');
    } else {
      // 세로 폰: 스테이지가 폭에 막혀 위아래가 남으면 그 공간을 HUD 에 준다 (터치 타겟 확대)
      const target = availH - w / AR - gap;          // HUD 가 차지할 수 있는 높이
      clearPx(hudEl, 'height');
      const natural = hudEl.offsetHeight;            // 인라인 높이 없는 상태의 자연 높이
      const roomy = !hudHidden && target > natural + ROOMY_GAP;
      hudEl.classList.toggle('roomy', roomy);
      // 세로로 크게 남을 때만 '가로로 돌리세요' 안내
      if (rh) rh.classList.toggle('hidden', !roomy || rotateHintOff || availW >= availH);
      // 남는 만큼 다 먹으면 빈 갈색 벽이 된다 — 적당히만 키우고 나머지는 위아래 여백으로 둔다
      if (roomy) setPx(hudEl, 'height', Math.max(hudEl.offsetHeight, Math.min(target, ROOMY_MAX)));
    }
  }
  setPx(stageEl, 'width', w);
  // 칩·미니버튼 축소는 뷰포트 폭이 아니라 실제 스테이지 폭으로 정한다 (가로 폰은 폭이 넓어도 스테이지가 좁다)
  stageEl.classList.toggle('small', w < 680);
  stageEl.classList.toggle('tiny', w < 520);
  fitTopRow(w);
  if (window.__coachOn) coachRender();   // 링·말풍선도 새 배치에 맞춘다
  if (S.net && typeof mpLayoutCards === 'function') mpLayoutCards();   // 상대 요약 카드도 새 배치에 맞춘다
}
// 좌상단 칩 + 우상단 미니 버튼이 한 줄에 들어가면 같은 줄, 안 들어가면(작은 폰 + 멀티 채팅 버튼 등) 미니 버튼만 둘째 줄로.
// 칩은 overflow:hidden 으로 줄어들 수 있어 scrollWidth(원래 폭)로 잰다 — 줄어든 폭으로 재면 항상 '들어간다'가 된다
function fitTopRow(w) {
  w = w || stageEl.clientWidth || stageEl.offsetWidth;
  if (!w || miniEl.classList.contains('hidden') || statsEl.classList.contains('hidden')) { stageEl.classList.remove('mini-drop'); return; }
  // 여백·칩 간격은 CSS 가 화면 폭마다 다르게 준다(10/6px, gap 8/3px) — 추정하지 말고 실측한다 (추정치는 360px 폰에서 6~8px 과대 → 늘 둘째 줄이었다)
  const sg = stageEl.getBoundingClientRect(), sr = statsEl.getBoundingClientRect(), mr = miniEl.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(statsEl).columnGap) || 8;
  let chips = 0, n = 0;
  for (const c of statsEl.children) { if (c.classList.contains('hidden') || !c.offsetWidth) continue; chips += Math.max(c.offsetWidth, c.scrollWidth + 2); n++; }
  const left = Math.max(0, sr.left - sg.left), right = Math.max(0, sg.right - mr.right);
  const need = left + chips + gap * Math.max(0, n - 1) + 6 + miniEl.offsetWidth + right;
  stageEl.classList.toggle('mini-drop', need > w + 0.5);
}
window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', fitStage);
if (window.visualViewport) { // 모바일 주소창이 접히고 펴질 때 resize 가 오지 않는 경우가 있다
  visualViewport.addEventListener('resize', fitStage);
  visualViewport.addEventListener('scroll', fitStage);
}
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
function thumbURL(sprite, size, fallback = '') {
  if (!sprite || !sprite.cv || sprite.missing) return fallback;
  try {
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const scale = size / Math.max(sprite.w, sprite.h), w = sprite.w * scale, h = sprite.h * scale;
    cv.getContext('2d').drawImage(sprite.cv, (size - w) / 2, (size - h) / 2, w, h);
    return cv.toDataURL();
  } catch { return fallback; }
}
// 눈(1~6) 은 주사위 그림, 성(7~20) 은 코드로 만든 별 배지 아이콘
function dieIconURL(face) {
  if (face <= 6) return diceURLs[face - 1] || '';
  if (starIconCache[face]) return starIconCache[face];
  const def = TOWER_DEFS[face];
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 96, 96); gr.addColorStop(0, def.color); gr.addColorStop(1, '#1a1428');
  g.fillStyle = gr; g.beginPath(); g.roundRect(6, 6, 84, 84, 18); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
  g.fillStyle = '#fff'; g.font = uiFont(30); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('★' + face, 48, 50);
  return (starIconCache[face] = cv.toDataURL());
}

function syncUI() { syncStats(); syncUIRest(); }
// 상단 칩 (골드·목숨·웨이브) — syncUI 에서만 돈다. 보스 남은 시간·막간 카운트다운은 draw() 의 캔버스 말풍선이 매 프레임 그린다
function syncStats() {
  $('gold-val').textContent = S.gold;
  $('lives-val').textContent = S.lives;
  $('lives-val').parentElement.classList.toggle('low', S.lives > 0 && S.lives <= 5);
  const sd = S.stageData;
  if (S.mode === 'infinity') {
    const INF = DKCONTENT.INFINITY, cap = INF.fieldCap || 200, n = S.enemies.length;
    const M = S.wave > 0 && INF.monsterFor ? INF.monsterFor(S.wave) : null;
    const sz = M ? ` · ${M.boss ? '보스' : M.name}(${INF.sizeName[M.cls]})` : '';
    // 보스 남은 시간은 칩에 넣지 않는다 — 칩이 길어져 우상단 미니 버튼이 둘째 줄로 밀렸다. 캔버스 말풍선(draw)이 보여준다
    const line = INF.clearWave || 101, cyc = Math.floor(Math.max(0, S.wave - 1) / 101);
    const wtxt = S.inf && S.inf.mode === 'clear'
      ? `${S.wave}/${S.net ? S.net.timing.clearWave : line}`  // 도전: 101웨이브 완주가 클리어
      : `${S.wave}${cyc ? ` (${cyc + 1}주기)` : ''}`;          // 무한: 끝이 없다
    const roomTxt = S.net && window.DKNET ? ` · 방 ${DKNET.members().length}명` : '';
    // 좁은 화면에서는 칩이 두 줄로 넘쳐 아레나를 가린다 — 몬스터 이름·최고 기록을 접는다
    const tight = stageEl.classList.contains('tiny'), mid = stageEl.classList.contains('small');
    $('wave-val').textContent = tight
      ? `${S.wave}${S.inf && S.inf.mode === 'clear' ? '/' + line : ''} · ${n}/${cap}`
      : mid
        ? `웨이브 ${wtxt} · 필드 ${n}/${cap}${roomTxt}`
        : `∞ 웨이브 ${wtxt}${sz} · 최고 ${SAVE.infBest || 0} · 필드 ${n}/${cap}${roomTxt}`;
    $('wave-val').classList.toggle('hot', n >= cap * 0.9);
  }
  else $('wave-val').textContent = stageEl.classList.contains('tiny')
    ? `S${S.stage} · ${S.wave}/${S.stageWaves}`
    : `S${S.stage}${sd && sd.tierName ? ' ' + sd.tierName : ''} · 웨이브 ${S.wave} / ${S.stageWaves}`;
  $('wave-val').style.color = sd && sd.tierColor ? sd.tierColor : '';
  if (S.phase === 'playing' && typeof fitTopRow === 'function') fitTopRow();   // 칩 글자 길이가 바뀌면 미니 버튼 줄도 다시 판정
}
function syncUIRest() {
  syncInfPanel();
  const heldInfo = $('held-info');
  if (S.heldDie) {
    const def = TOWER_DEFS[S.heldDie];
    diceSlot.classList.add('has-die');
    diceSlot.classList.toggle('unfocused', !S.dieFocus);
    diceImg.src = dieIconURL(S.heldDie);
    diceImg.classList.remove('hidden'); diceQ.classList.add('hidden');
    diceSlot.title = S.dieFocus
      ? def.name + ' — 석단을 눌러 설치 (한 번 더 누르면 잠시 내려놓기)'
      : def.name + ' — 내려놓은 상태입니다. 다시 누르면 배치 모드';
    heldInfo.classList.remove('hidden');
    heldInfo.classList.toggle('parked', !S.dieFocus);
    heldInfo.style.setProperty('--elem', def.color);
    $('held-name').textContent = (S.dieFocus ? '' : '보류 · ') + def.name;
    $('held-desc').textContent = S.dieFocus ? def.desc + ' · 같은 눈 타워에 놓으면 합체' : '주사위 칸을 다시 누르면 배치 모드로 돌아갑니다';
    const hs = $('held-sell');   // 약한 눈이 나와 놓을 데가 없을 때: 놓지 않고 바로 판다 (★7+ 는 판매 불가 규칙 그대로)
    if (hs) { const canSell = S.phase === 'playing' && !(S.mode === 'infinity' && S.heldDie >= 7); hs.classList.toggle('hidden', !canSell); hs.textContent = `판매 +${sellPrice({ face: S.heldDie, lvl: 1 })}G`; }
  } else {
    diceSlot.classList.remove('has-die');
    diceSlot.classList.remove('unfocused');
    diceImg.classList.add('hidden');
    diceQ.classList.toggle('hidden', SLOT.active);
    diceSlot.title = SLOT.active ? '굴리는 중…' : '보유 주사위';
    heldInfo.classList.add('hidden');
  }
  diceSlot.classList.toggle('rolling', SLOT.active);
  if (S.mode === 'infinity') { // 인피니티: 뽑기 버튼 (보물상자)
    const cost = chestCost();
    rollBtn.childNodes[0].nodeValue = document.body.classList.contains('ui-art') ? '뽑기' : '🎁 뽑기';   // 그림 아이콘(::before 상자)이 있으면 이모지는 뺀다 (아이콘 두 개 방지)
    rollBtn.title = '골드로 주사위를 뽑습니다. 등급이 정해지고 바로 굴러 타워가 되니 먼저 석단에 배치하세요 (굴려 나온 숫자 = 성★)\n일반 50% · 레어 33.1% · 고대 10.2% · 유물 5.1% · 서사 0.8% · 전설 0.5% · 에픽 0.2% · 신화 0.08% · 태초 0.019%';
    const busy = SLOT.active || !!S.heldDie;
    const full = !busy && !canPlaceAnywhere();   // 빈 칸도 합체 여지도 없다
    $('roll-cost').textContent = SLOT.active ? '굴리는 중…' : S.heldDie ? (S.dieFocus ? '배치 후 가능' : '주사위 보류 중') : full ? '석단이 가득 참' : `${cost} G`;
    rollBtn.disabled = busy || full || !(S.inf && S.phase === 'playing' && S.gold >= cost);
    const q = $('queue-chip');
    if (q) { const n = (S.inf && S.inf.queue) ? S.inf.queue.length : 0; q.classList.toggle('hidden', n === 0); q.querySelector('b').textContent = n; }
  } else {
    rollBtn.childNodes[0].nodeValue = '주사위 굴리기';
    $('roll-cost').textContent = `${ROLL_COST} G`;
    rollBtn.title = '';
    rollBtn.disabled = !canRoll();
    const q = $('queue-chip'); if (q) q.classList.add('hidden');
  }
  syncWaveBtn();
  syncInfo();
}

// 인피니티 강화 패널 (HUD)
function syncInfPanel() {
  const panel = $('inf-panel');
  if (!panel) return;
  const on = S.mode === 'infinity' && S.phase === 'playing' && S.inf;
  panel.classList.toggle('hidden', !on);
  const brk = $('hud-break'); if (brk) brk.classList.toggle('hidden', !on);
  if (!on) return;
  const d = DP();
  for (let f = 1; f <= 6; f++) {
    const btn = $('inf-face-' + f);
    if (!btn) continue;
    const lv = S.inf.power[f] || 0;
    const maxed = lv >= d.maxLv;
    const cost = maxed ? 0 : d.cost(lv);
    btn.querySelector('.inf-lv').textContent = maxed ? 'MAX' : `Lv${lv}`;
    btn.querySelector('.inf-cost').textContent = maxed ? '—' : `${cost} G`;
    btn.disabled = maxed || S.gold < cost || !unlockedFaces().includes(f);
    btn.classList.toggle('maxed', maxed);
    btn.title = `${TOWER_DEFS[f].name} 파워업 · 피해 ×${d.dmgMult(lv).toFixed(2)} · 사거리 +${d.rangeAdd(lv)} · ${d.special[f].label} (${d.tier(lv)}단계)${f === 6 ? ' · ★ 히든 타워 포함' : ''} — 다음 ${maxed ? '없음' : cost + 'G'}`;
  }
}

// 다음 웨이브까지 남은 초 (싱글·멀티 공통 autoT)
function waveCountdown() { return Math.max(0, Math.ceil(S.autoT)); }
function syncWaveBtn() {
  if (S.phase === 'spectate') { waveBtn.disabled = true; waveBtn.textContent = '관전 중'; return; }
  if (S.phase !== 'playing' || (S.wave >= S.stageWaves && !S.waveActive)) { waveBtn.disabled = true; waveBtn.textContent = '웨이브 종료'; return; }
  waveBtn.disabled = S.waveActive;
  waveBtn.textContent = S.waveActive
    ? (S.enemies.some(e => e.isBoss && !e.dead) ? `보스 웨이브 ${S.wave}` : `웨이브 ${S.wave} 진행 중`)
    : (S.wave === 0 ? (S.net ? `첫 웨이브 (${waveCountdown()}초)` : '웨이브 시작') : `다음 웨이브 (${waveCountdown()}초)`);
}

function syncInfo() {
  const hint = $('hud-hint');
  if (!S.selTower) {
    infoPanel.classList.add('hidden');
    if (hint) {
      // 손에 타워가 있는 그 순간이 "어떻게 놓지?" 인 순간이다 — 이때 숨기지 않는다
      hint.textContent = S.heldDie
        ? (S.dieFocus
            ? '빈 석단을 눌러 타워를 놓으세요 (끌어다 놓아도 됩니다). 같은 눈 위에 놓으면 합체.'
            : '주사위를 보류했습니다. 타워를 눌러 판매·확률강화할 수 있고, 주사위 칸을 다시 누르면 배치 모드, 아래 "바로 판매"로 팔 수도 있습니다.')
        : S.mode === 'infinity'
          ? '석단의 타워를 누르면 여기에서 판매·확률강화를 할 수 있습니다.'
          : '석단의 타워를 누르면 여기에서 능력치와 판매를 확인할 수 있습니다.';
      hint.classList.toggle('hidden', S.phase !== 'playing');
    }
    return;
  }
  if (hint) hint.classList.add('hidden');
  const t = S.selTower, inf = S.mode === 'infinity';
  infoPanel.classList.remove('hidden');
  $('info-dice').src = dieIconURL(t.face);
  $('info-name').textContent = `${t.def.name} · Lv${t.lvl}`;
  const atkEl = $('info-atk');
  if (atkEl) { const a = inf && t.def.atk ? ATK_NAME[t.def.atk] : ''; atkEl.textContent = a; atkEl.classList.toggle('hidden', !a); }
  const bits = [`피해 ${Math.round(towerDmg(t))}`, `사거리 ${Math.round(towerRange(t))}`];
  if (t.def.splash) bits.push(`광역 ${Math.round(towerSplash(t))}`);
  if (t.def.slow) bits.push(`둔화 ${Math.round(towerSlowPct(t) * 100)}%`);
  if (t.def.chain) bits.push(`연쇄 ${towerChain(t)}회`);
  bits.push(t.lvl < MAX_LVL ? `같은 눈 합체 시 Lv${t.lvl + 1}` : '최대 레벨');
  $('info-body').textContent = bits.join(' · ');
  const noSell = inf && t.face >= 7; // 7★ 이상은 판매 불가
  $('sell-btn').disabled = noSell;
  $('sell-btn').textContent = noSell ? '판매 불가 (7★ 이상)' : `판매 +${sellPrice(t)}G`;
  const eb = $('enhance-btn'), eo = $('enhance-odds'), en = enhanceDef(t);
  if (eb) {
    eb.classList.toggle('hidden', !inf);
    eb.disabled = !en || S.gold < en.cost || S.phase !== 'playing';
    eb.textContent = en ? `확률강화 ${en.cost.toLocaleString()}G` : '최대 등급';
  }
  if (eo) {
    eo.classList.toggle('hidden', !inf || !en);
    if (inf && en) eo.innerHTML = `<b class="up">강화 ${Math.round(en.up * 100)}%</b> · 유지 ${Math.round(en.keep * 100)}% · <b class="boom">소멸 ${Math.round(en.boom * 100)}%</b>`;
  }
}
// 타워 확률강화: 골드를 내고 강화(★+1) / 유지 / 소멸 중 하나. 합체 레벨은 유지된다.
function enhanceDef(t) {
  const INF = window.DKCONTENT && DKCONTENT.INFINITY;
  if (!INF || !INF.enhance || S.mode !== 'infinity' || !t || t.face >= INF.enhance.maxFace) return null;
  const o = INF.enhance.odds(t.face);
  return { cost: INF.enhance.cost(t.face), up: o.up, keep: o.keep, boom: o.boom, next: t.face + 1 };
}
function enhanceTower() {
  const t = S.selTower, en = enhanceDef(t);
  if (!t || !en || S.gold < en.cost || S.phase !== 'playing') { SFX.deny(); return null; }
  S.gold -= en.cost;
  S.inf.spent = (S.inf.spent || 0) + en.cost;
  const x = t.x, y = t.y - 40, r = Math.random();
  if (r < en.up) {
    t.face = en.next; t.def = TOWER_DEFS[en.next]; t.skin = equippedSkinIndex(t.face);
    const col = t.def.color || '#ffd452';
    S.texts.push({ str: `강화 성공! ${t.def.name}`, x, y, t: 0, color: col, big: t.face >= 14 });
    S.fxs.push({ kind: 'ring', x: t.x, y: t.y - 20, t: 0, dur: 0.8, size: 130, color: col });
    S.fxs.push({ kind: 'circle', x: t.x, y: t.y + 4, t: 0, dur: 0.8, size: 120, color: col, pips: t.face <= 6 ? t.face : 4 + Math.min(8, t.face - 6) });
    if (t.face >= 14) S.shakeT = Math.max(S.shakeT || 0, 0.3);
    netLog(`${t.def.name} 확률강화에 성공했습니다`, 'up');
    SFX.win(); syncUI(); return 'up';
  }
  if (r < en.up + en.keep) {
    S.texts.push({ str: '강화 실패 — 타워는 그대로', x, y, t: 0, color: '#d9c9a0' });
    S.fxs.push({ kind: 'ring', x: t.x, y: t.y - 20, t: 0, dur: 0.5, size: 80, color: '#9a9a9a' });
    pushLog('확률강화 실패 — 타워는 그대로', 'sys');
    SFX.deny(); syncUI(); return 'keep';
  }
  S.texts.push({ str: '강화 실패 — 타워 소멸!', x, y, t: 0, color: '#ff7a7a', big: true });
  S.fxs.push({ kind: 'impact', x: t.x, y: t.y - 20, t: 0, dur: 0.45, size: 120 });
  S.fxs.push({ kind: 'ring', x: t.x, y: t.y - 20, t: 0, dur: 0.6, size: 140, color: '#ff7a7a' });
  const lost = t.def.name;
  S.towers = S.towers.filter(o => o !== t);
  S.selTower = null;
  S.shakeT = Math.max(S.shakeT || 0, 0.35);
  netLog(`확률강화에 실패해 ${lost}가 소멸했습니다`, 'boom');
  SFX.deny(); syncUI(); return 'boom';
}

const sellPrice = t => 6 + 5 * t.face + 12 * (t.lvl - 1);

function showOverlay(title, descHTML, btnLabel) {
  bgmSync();
  const isTitle = S.phase === 'title' || S.phase === 'loading';
  $('overlay-box').classList.toggle('result', !isTitle);
  $('overlay-box').classList.toggle('title', isTitle);
  $('overlay').classList.toggle('title', isTitle);
  $('ov-title').textContent = title;
  $('ov-desc').innerHTML = descHTML;
  $('ov-btn').textContent = btnLabel;
  for (const id of SCREENS) $(id).classList.add('hidden');
  statsEl.classList.add('hidden');
  hudEl.classList.add('hidden');
  miniEl.classList.add('hidden');
  for (const id of ['rivals', 'spectate', 'view-bar']) { const el = $(id); if (el) el.classList.add('hidden'); }
  overlayEl.classList.remove('hidden');
}

// ==================== 화면 전환 (로비 / 스테이지선택 / 상점 / 플레이) ====================
const SCREENS = ['lobby', 'stage-select', 'shop', 'mp-room'];   // 전체화면 .screen 들 — 전환 때 전부 숨긴다
function showScreen(name) {
  if (S.paused) setPaused(false);
  if (menuOpen()) $('menu').classList.add('hidden');
  overlayEl.classList.add('hidden');
  for (const id of SCREENS) $(id).classList.add('hidden');
  statsEl.classList.add('hidden');
  hudEl.classList.add('hidden');
  miniEl.classList.add('hidden');
  for (const id of ['rivals', 'spectate', 'view-bar']) { const el = $(id); if (el) el.classList.add('hidden'); }
  { const cb = $('chat-btn'); if (cb) cb.classList.toggle('hidden', !(S.net && name === 'playing')); }
  if (name === 'title' || name === 'result') overlayEl.classList.remove('hidden');
  else if (name === 'lobby') { $('lobby').classList.remove('hidden'); renderLobby(); }
  else if (name === 'stageSelect') { $('stage-select').classList.remove('hidden'); renderStageSelect(); }
  else if (name === 'shop') { $('shop').classList.remove('hidden'); renderShop(); }
  else if (name === 'mpRoom') { $('mp-room').classList.remove('hidden'); renderMpRoom(); }
  else if (name === 'playing') { statsEl.classList.remove('hidden'); hudEl.classList.remove('hidden'); miniEl.classList.remove('hidden'); if (S.net) $('rivals').classList.remove('hidden'); }
  bgmSync();
  wakeLockSync(name === 'playing');
  if (name === 'playing') fitStage();   // 💬 버튼 유무로 미니 버튼 폭이 바뀐다
}
// 플레이 중 화면 꺼짐 방지 (지원 브라우저·앱 웹뷰에서만, 실패는 무시)
let WAKE = null;
function wakeLockSync(on) {
  try {
    if (on) { if (!WAKE && navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { WAKE = w; w.addEventListener('release', () => { WAKE = null; }); }).catch(() => {}); }
    else if (WAKE) { WAKE.release().catch(() => {}); WAKE = null; }
  } catch (e) { /* 무시 */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.phase === 'playing') wakeLockSync(true); });
// 로비는 허브(싱글·멀티·상점) 아래 갈래(single/multi)가 같은 상자 안에서 펼쳐진다. 어디서 돌아왔는지에 따라 그 갈래를 바로 연다
let LOBBY_VIEW = 'hub';
function lobbyShow(view) {
  view = view === 'single' || view === 'multi' ? view : 'hub';
  LOBBY_VIEW = view;
  for (const v of ['hub', 'single', 'multi']) { const el = $('lobby-' + v); if (el) el.classList.toggle('hidden', v !== view); }
  const box = $('lobby-box'); if (box) box.dataset.view = view;
  const back = $('lobby-back'); if (back) back.classList.toggle('hidden', view === 'hub');
  const h = $('lobby-title'); if (h) h.textContent = view === 'single' ? '싱글플레이' : view === 'multi' ? '멀티플레이' : '주사위 성채';
  const box2 = document.querySelector('#lobby .screen-box'); if (box2) box2.scrollTop = 0;
}
function gotoLobby(view) { S.phase = 'lobby'; showScreen('lobby'); lobbyShow(view || 'hub'); }
function gotoMpRoom() { S.phase = 'mpRoom'; showScreen('mpRoom'); }
function gotoStageSelect() { S.phase = 'stageSelect'; showScreen('stageSelect'); }
function gotoShop() { S.phase = 'shop'; showScreen('shop'); }

// ==================== 첫 런 코치 (단계별 손잡이 안내) ====================
// 인피니티가 처음부터 열려 있으므로, 스테이지 모드를 거치지 않은 사람에게 조작을 직접 가르친다.
// 각 단계는 "실제로 그 행동을 했을 때"만 넘어간다. 링·말풍선만 얹고 클릭은 통과시킨다.
const COACH = {
  on: false, i: 0,
  steps: [
    { key: 'roll',   text: '<b>뽑기</b>를 눌러 주사위를 뽑으세요. 굴러 나온 숫자가 타워가 됩니다.', at: () => $('roll-btn') },
    { key: 'place',  text: '<b>빈 석단을 눌러</b> 타워를 놓으세요. 끌어다 놓아도 됩니다.', at: () => coachSpot() },
    { key: 'wave',   text: '준비됐으면 <b>웨이브를 시작</b>하세요. 적이 트랙을 돌기 시작합니다.', at: () => $('wave-btn') },
    { key: 'select', text: '놓은 <b>타워를 누르면</b> 아래에서 판매·확률강화를 할 수 있습니다.', at: () => coachTower() },
    { key: 'power',  text: '마지막으로 <b>파워업</b> — 골드로 그 눈의 타워를 전부 세게 만듭니다.', at: () => $('inf-panel') },
  ],
};
function coachDone() { try { return localStorage.getItem('dk_coachDone') === '1'; } catch (e) { return true; } }
function coachSpot() {   // 비어 있는 첫 석단을 화면 좌표로
  for (let i = 0; i < SPOTS.length; i++) {
    if (towerAt(i)) continue;
    const p = canvasToClient(SPOTS[i][0], SPOTS[i][1]);
    return { left: p.x - 34, top: p.y - 34, width: 68, height: 68 };
  }
  return null;
}
function coachTower() {  // 배치된 첫 타워를 화면 좌표로
  const t = S.towers[0];
  if (!t) return null;
  const p = canvasToClient(t.x, t.y);
  return { left: p.x - 34, top: p.y - 44, width: 68, height: 78 };
}
function coachStart() {
  if (coachDone() || S.mode !== 'infinity') return;
  COACH.on = true; COACH.i = 0;
  window.__coachOn = true;
  coachRender();
}
function coachStop(finished) {
  if (!COACH.on) return;
  COACH.on = false;
  window.__coachOn = false;
  const el = $('coach'); if (el) el.classList.add('hidden');
  try { localStorage.setItem('dk_coachDone', '1'); } catch (e) { /* 사파리 프라이빗 */ }
  if (finished && !helpSeen()) setTimeout(openInfHelp, 400); // 조작을 익힌 뒤에 시스템 설명
}
// 그 단계의 행동을 했을 때 호출한다 (buyChest / tryPlace / startWave / 타워 선택 / upgradeFace)
function coachHit(key) {
  if (!COACH.on) return;
  const step = COACH.steps[COACH.i];
  if (!step || step.key !== key) return;
  COACH.i++;
  if (COACH.i >= COACH.steps.length) { coachStop(true); return; }
  // 4단계에서 연 타워 정보창이 5단계 대상(파워업 패널)을 덮는다 — 다음 대상이 HUD 안이면 카드를 닫는다
  const next = COACH.steps[COACH.i];
  if (next && next.key === 'power' && S.selTower) { S.selTower = null; syncUI(); }
  coachRender();
}
// 안전영역(노치·홈바) — style.css 의 --sa-* 를 숫자로 (앱은 플러그인, 테스트는 인라인 변수로 채운다)
function safeArea() {
  const cs = getComputedStyle(document.documentElement);
  const n = (k) => { const v = parseFloat(cs.getPropertyValue(k)); return isFinite(v) ? Math.max(0, v) : 0; };
  return { t: n('--sa-t'), r: n('--sa-r'), b: n('--sa-b'), l: n('--sa-l') };
}
function coachRender() {
  const el = $('coach'), ring = $('coach-ring'), tip = $('coach-tip');
  if (!el || !COACH.on) return;
  const step = COACH.steps[COACH.i];
  const target = step && step.at();
  if (!target) { el.classList.add('hidden'); return; }   // 대상이 아직 없으면 다음 프레임에
  const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
  const pad = 6;
  el.classList.remove('hidden');
  ring.style.left = (r.left - pad) + 'px';
  ring.style.top = (r.top - pad) + 'px';
  ring.style.width = (r.width + pad * 2) + 'px';
  ring.style.height = (r.height + pad * 2) + 'px';
  $('coach-step').textContent = `${COACH.i + 1} / ${COACH.steps.length}`;
  $('coach-text').innerHTML = step.text;
  // 말풍선은 대상 위에, 위가 좁으면 아래에 둔다
  tip.style.left = '0px'; tip.style.top = '0px';
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  const cx = r.left + r.width / 2;
  const sa = safeArea();
  tip.style.left = Math.max(8 + sa.l, Math.min(window.innerWidth - sa.r - tw - 8, cx - tw / 2)) + 'px';
  tip.style.top = (r.top - th - 14 >= 8 + sa.t ? r.top - th - 14 : Math.min(window.innerHeight - sa.b - th - 8, r.top + r.height + 14)) + 'px';
}

// ==================== 화면 방향에 따른 아레나 교체 ====================
// 가로/데스크톱은 16:9(cInf), 세로 폰은 세로 아레나(cInfP). 런 도중 돌려도 상태를 보존한 채 갈아끼운다.
function screenIsPortrait() {
  const { availW, availH } = wrapAvail();
  return availH > 0 && availW / availH < 0.95;
}
function arenaKeyForScreen() { return screenIsPortrait() ? 'cInfP' : 'cInf'; }
// 두 아레나는 보드가 3열×5행 / 5열×3행 이라 같은 석단 '번호'가 서로 다른 칸이다.
// 화면을 돌리면 보드도 같이 돌아야 하므로 격자 좌표를 90° 회전시켜 옮긴다.
function boardOf(key) {
  const m = window.DKCONTENT && DKCONTENT.maps && DKCONTENT.maps.find(x => x.key === key);
  return (m && m.board) || null;
}
function remapSpot(fromKey, toKey, idx) {
  const a = boardOf(fromKey), b = boardOf(toKey);
  if (!a || !b || !a.cols || !b.cols) return idx;
  if (a.cols === b.cols) return idx;
  const cf = idx % a.cols, rf = Math.floor(idx / a.cols);
  // 넓어지면(세로→가로) 시계방향, 좁아지면(가로→세로) 반시계방향으로 돈다 — 되돌리면 제자리
  const ct = b.cols > a.cols ? (b.cols - 1 - rf) : rf;
  const rt = b.cols > a.cols ? cf : (a.cols - 1 - cf);
  const out = rt * b.cols + ct;
  return (out >= 0 && out < b.cols * b.rows) ? out : idx;
}
// force: 같은 방향이라도 캔버스 비율이 화면과 어긋났을 때 다시 굽는다 (타워는 같은 칸, 적은 같은 진행률)
function relayoutArena(key, force) {
  const INF = window.DKCONTENT && DKCONTENT.INFINITY;
  if (!INF || S.mode !== 'infinity' || (S.mapKey === key && !force)) return false;
  // 좌표는 버리고 '어느 칸', '경로의 몇 %' 만 남긴다
  const from = S.mapKey;
  const towers = S.towers.map(t => ({ spot: remapSpot(from, key, t.spot), face: t.face, def: t.def, lvl: t.lvl, skin: t.skin, cd: t.cd }));
  const selSpot = S.selTower ? remapSpot(from, key, S.selTower.spot) : -1;
  const enemies = S.enemies.map(e => ({ e, ratio: e.dist / Math.max(1, laneLen(e)) }));
  S.mapKey = key;
  applyMapLayout(key, INF.tier);
  for (const t of towers) { const sp = SPOTS[t.spot]; if (sp) { t.x = sp[0]; t.y = sp[1]; } }
  S.towers = towers.filter(t => SPOTS[t.spot]).map(t => Object.assign(t, { kick: 0 }));
  for (const { e, ratio } of enemies) e.dist = Math.min(laneLen(e) - 1, ratio * laneLen(e));
  S.selTower = selSpot >= 0 ? (S.towers.find(t => t.spot === selSpot) || null) : null;
  S.projs = []; S.beams = []; S.fxs = []; S.texts = [];   // 수명 1초 미만이라 버린다
  if (DRAG.active) stopPlaceDrag();
  fitStage();
  syncUI();
  return true;
}

function syncInfButtons() {
  const INF = window.DKCONTENT && DKCONTENT.INFINITY;
  const line = (INF && INF.clearWave) || 101;
  const setBtn = (id, icon, emoji, name, sub) => {    // 도전 / 무한 두 갈래 (해금 없음)
    const b = $(id);
    if (!b) return;
    b.disabled = false;
    b.classList.remove('locked');
    b.innerHTML = `<span class="bi" data-icon="${icon}">${emoji}</span>인피니티 · ${name}<small>${sub}</small>`;   // 아이콘 슬롯(.bi): 그림이 있으면 ui/icon-*.png, 없으면 이모지
  };
  setBtn('btn-inf-clear', 'trophy', '&#127942;', '도전', `${line}웨이브 완주 = 클리어`);
  setBtn('btn-infinity', 'infinity', '&#8734;', '무한', '끝이 없는 기록 도전');
  const info = $('lobby-inf');
  if (info) {
    const played = (SAVE.infBest || 0) > 0 || (SAVE.infRuns || []).length;
    info.innerHTML = played   // 처음이면 모드 설명, 해 봤으면 기록
      ? `최고 기록 <b>${SAVE.infBest || 0}</b> 웨이브 · 도전 클리어 <b>${SAVE.infClears || 0}</b>회${(SAVE.infRuns || []).length ? ` · 최근 ${SAVE.infRuns.slice(0, 3).map(r => r.wave).join(' / ')}` : ''}`
      : `<b>도전</b> ${line}웨이브 완주 = 클리어 · <b>무한</b> 끝없는 기록`;
  }
}

function renderLobby() {
  $('lobby-gems').textContent = SAVE.gems;
  const un = (SAVE.unlockedTowers || []).length;
  $('lobby-progress').innerHTML = `스테이지 <b>${SAVE.cleared.length}</b>/50 클리어 · 해금 타워 <b>${un}</b>/6`;
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
    const img = dieIconURL(f);
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
// 스테이지가 줄어들면 캔버스 내부 좌표 1px 이 화면에서 1px 보다 작아진다.
// 터치 판정은 화면(CSS px) 기준으로 고정해야 작은 폰에서도 석단을 누를 수 있다.
function stageScale() { const r = canvas.getBoundingClientRect(); return r.width > 0 ? r.width / W : 1; }
// 캔버스 위에 얹힌 HTML(좌상단 칩·우상단 미니 버튼)의 아래 끝 — 캔버스 위쪽 기준 css px. 안내 말풍선을 그 밑에 놓는다. 0.5초 캐시
let HUD_TOP = { v: 58, at: -1e9 };
// 위쪽 HUD·안내 말풍선 밑에 놓는 알림 글자의 y (캔버스 좌표)
function topTextY() { const sc = stageScale() || 1; return Math.round((hudTopPx() + 62) / sc); }
function hudTopPx() {
  const now = performance.now();
  if (now - HUD_TOP.at < 500) return HUD_TOP.v;
  HUD_TOP.at = now;
  const cr = canvas.getBoundingClientRect(); let bottom = 0;
  for (const id of ['stats', 'mini-top']) { const el = $(id); if (!el || el.classList.contains('hidden')) continue; const r = el.getBoundingClientRect(); if (r.height > 0) bottom = Math.max(bottom, r.bottom - cr.top); }
  HUD_TOP.v = Math.max(58, Math.round(bottom + 6));
  return HUD_TOP.v;
}
// 화면 기준 반경(css px) 을 캔버스 내부 좌표 여유로 바꾼다
function touchExtra(cssRadius) { return Math.max(6, cssRadius / stageScale() - SPOT_R); }
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
    S.dieFocus = true;
    SFX.place();
    coachHit('place');
  } else if (existing.face === S.heldDie) {
    if (existing.lvl < MAX_LVL) {
      existing.lvl++;
      S.heldDie = 0;
      S.dieFocus = true;
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
    const idx = spotAt(p.x, p.y, touchExtra(50)); // 드래그 배치: 화면 기준 50px
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
  if (S.phase !== 'playing' || !S.heldDie || SLOT.active || VIEW.pid) return;
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
    // 슬롯 탭 = 포커스 토글. 풀면 굴리기 전처럼 타워를 고를 수 있어 석단이 가득 차도 막히지 않는다
    if (S.heldDie) { S.dieFocus = !S.dieFocus; if (!S.dieFocus) S.selTower = null; syncUI(); }
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
  if (VIEW.pid) return;                                   // 상대 필드 보기: 캔버스 조작 없음
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

  if (spd > 330 * stageScale() && S.gold >= ROLL_COST) { // 던지기 속도도 화면 기준
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
  if (DRAG.active || VIEW.pid) return;
  if (S.phase !== 'playing') return;
  const { x, y } = canvasPos(ev);
  const idx = spotAt(x, y, touchExtra(24)); // 탭 선택: 화면 기준 24px 반경(=48px 타겟)
  if (idx >= 0) {
    if (S.heldDie && S.dieFocus) {
      tryPlace(idx);
      return;
    }
    const hit = towerAt(idx);
    S.selTower = (hit && hit === S.selTower) ? null : hit;   // 같은 타워를 다시 누르면 닫는다
    if (S.selTower) coachHit('select');
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

// ==================== 로그 · 채팅 (스타크래프트식) ====================
// 로그는 모드와 상관없이 뜬다. 채팅은 멀티(방 안)에서만 열린다.
// 줄은 LOG.ttl 초 동안 남았다가 서서히 사라진다 — CSS 애니메이션이라 프레임 비용이 없다.
const LOG = { ttl: 9, fade: 1.2, max: 8, nodes: [] };
const LOG_KIND = { sys: 'sys', gacha: 'gacha', up: 'up', boom: 'boom', boss: 'boss', life: 'life', chat: 'chat' };
function pushLog(text, kind, who, color) {
  const box = $('log-lines');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'log-line ' + (LOG_KIND[kind] || 'sys');
  const asPlayer = who && (kind === 'gacha' || kind === 'up' || kind === 'boom' || kind === 'boss' || kind === 'life');
  const whoTag = who ? `<span class="who"${color ? ` style="color:${color}"` : ''}>${kind === 'chat' ? '● ' : ''}${escapeHtml(who)}</span>` : '';
  el.innerHTML = who
    ? (asPlayer ? `${whoTag} 플레이어가 ${escapeHtml(text)}` : `${whoTag}: ${escapeHtml(text)}`)
    : escapeHtml(text);
  box.appendChild(el);
  LOG.nodes.push(el);
  while (LOG.nodes.length > LOG.max) { const old = LOG.nodes.shift(); if (old.parentNode) old.parentNode.removeChild(old); }
  el._fadeT = setTimeout(() => el.classList.add('fade'), (LOG.ttl - LOG.fade) * 1000);
  el._killT = setTimeout(() => {
    const i = LOG.nodes.indexOf(el); if (i >= 0) LOG.nodes.splice(i, 1);
    if (el.parentNode) el.parentNode.removeChild(el);
  }, LOG.ttl * 1000);
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function clearLog() { for (const el of LOG.nodes) { clearTimeout(el._fadeT); clearTimeout(el._killT); if (el.parentNode) el.parentNode.removeChild(el); } LOG.nodes.length = 0; }
// 방 안이면 같은 줄을 다른 플레이어에게도 보낸다 (내 이름표를 달아서)
function netLog(text, kind) {
  pushLog(text, kind);
  const N = window.DKNET;
  if (N && S.net && N.inRoom()) N.log(text, kind);
}
// ---- 채팅 입력 ----
const chatForm = $('chat-form'), chatInput = $('chat-input');
function chatOpen() {
  const N = window.DKNET;
  if (!chatForm || !N || !N.inRoom()) return false;
  if (S.phase === 'mpRoom') { const inp = $('mp-chat-input'); if (inp) inp.focus(); return true; }   // 대기실은 항상 열려 있는 입력칸
  if (!(S.phase === 'playing' || S.phase === 'spectate')) return false;
  chatForm.classList.remove('hidden');
  chatInput.focus();
  return true;
}
function chatClose() { if (chatForm) { chatForm.classList.add('hidden'); chatInput.value = ''; chatInput.blur(); } setTimeout(fitStage, 50); }
function chatSend() {
  const N = window.DKNET, txt = (chatInput.value || '').trim().slice(0, 120);
  chatClose();
  if (!txt || !N || !N.inRoom()) return;
  N.chat(txt);                                          // 서버가 본인에게도 에코한다 → 수신 때 찍힌다
}
if (chatForm) {
  chatForm.addEventListener('submit', (ev) => { ev.preventDefault(); chatSend(); });
  chatInput.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') chatClose(); });
}
// 대기실 채팅 목록 (#mp-chat-lines, 최근 30줄). 게임 중 채팅도 여기 쌓여 대기실로 돌아와도 남는다
function pushRoomChat(name, text, color) {
  const box = $('mp-chat-lines'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'mp-chat-line';
  el.innerHTML = `<span class="who" style="color:${color || '#7fd4ff'}">${escapeHtml(name)}</span> ${escapeHtml(text)}`;
  box.appendChild(el);
  while (box.childElementCount > 30) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
}
function clearRoomChat() { const box = $('mp-chat-lines'); if (box) box.innerHTML = ''; }
if (window.DKNET) {
  const LOG_KINDS = ['sys', 'gacha', 'up', 'boom', 'boss', 'life'];
  DKNET.on('chat', (m) => {
    const name = String(m.name || '?').slice(0, 12), text = String(m.text || '').slice(0, 120);
    const color = typeof PC !== 'undefined' && m.pid ? PC[mpSeat(m.pid)] : '';
    pushRoomChat(name, text, color);
    if (S.phase !== 'mpRoom') pushLog(text, 'chat', name, color);
  });
  DKNET.on('log', (m) => pushLog(String(m.text || '').slice(0, 120), LOG_KINDS.includes(m.kind) ? m.kind : 'sys', String(m.name || '?').slice(0, 12)));
  DKNET.on('net:state', (st) => { if (!DKNET.inRoom()) chatClose(); });
}

document.addEventListener('keydown', ev => {
  if (document.activeElement === chatInput) return;                   // 채팅 입력 중에는 단축키를 막는다
  if (document.activeElement === $('mp-chat-input')) return;
  if (ev.key === 'Enter' && chatOpen()) { ev.preventDefault(); return; } // 멀티: Enter 로 채팅
  if (VIEW.pid && ev.key !== 'Escape') return;                              // 상대 필드를 보는 중에는 내 조작을 막는다
  if (ev.key === 'r' || ev.key === 'R' || ev.key === 'ㄱ') rollByButton();
  else if (S.mode === 'infinity' && ev.key >= '1' && ev.key <= '6') upgradeFace(parseInt(ev.key, 10));
  else if (ev.key === 'Escape') {
    if (settingsOpen()) { closeSettings(); return; }
    if (S.phase === 'lobby' && LOBBY_VIEW !== 'hub') { lobbyShow('hub'); return; }
    const help = $('inf-help');
    if (help && !help.classList.contains('hidden')) { closeInfHelp(); return; } // 도움말이 열려 있으면 먼저 닫는다
    if (menuOpen()) { closeMenu(); return; }
    if (VIEW.pid) { mpViewExit(); return; }
    if (DRAG.active) stopPlaceDrag();
    S.selTower = null;
    syncUI();
  }
});

rollBtn.addEventListener('click', rollByButton);
waveBtn.addEventListener('click', () => startWave());
$('held-sell').addEventListener('click', () => {   // 손에 든 주사위 바로 판매
  if (!S.heldDie || S.phase !== 'playing') return;
  if (S.mode === 'infinity' && S.heldDie >= 7) { SFX.deny(); return; }
  const price = sellPrice({ face: S.heldDie, lvl: 1 }), def = TOWER_DEFS[S.heldDie];
  S.gold += price;
  S.texts.push({ str: `${def.name} 판매 +${price}G`, x: W / 2, y: H / 2 - 30, t: 0, color: '#ffd452' });
  S.heldDie = 0; S.dieFocus = true;
  if (DRAG.active) stopPlaceDrag();
  SFX.sell();
  syncUI();
});
$('sell-btn').addEventListener('click', () => {
  if (!S.selTower) return;
  if (S.mode === 'infinity' && S.selTower.face >= 7) { SFX.deny(); return; } // 전설 이상 판매 불가
  S.gold += sellPrice(S.selTower);
  S.towers = S.towers.filter(t => t !== S.selTower);
  S.selTower = null;
  SFX.sell();
  syncUI();
});
function setSpeed(n) { S.speed = Math.max(1, Math.min(3, n | 0)); const b = $('speed-btn'); b.textContent = 'x' + S.speed; b.dataset.icon = 'speed' + S.speed; }
$('speed-btn').addEventListener('click', () => {
  setSpeed(S.speed >= 3 ? 1 : S.speed + 1);           // x1 → x2 → x3 → x1 (싱글·멀티 공통, 멀티는 각자)
});
const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 8.5a5 5 0 0 1 0 7"/><path d="M20 6a9 9 0 0 1 0 12"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>';
$('mute-btn').addEventListener('click', () => { audio(); SAVE.audio.muted = !SAVE.audio.muted; applyAudioSettings(); saveSave(); });
// ---- 토스트 · 앱(Capacitor) 다리: 뒤로가기 체인 ----
let TOAST_T = 0;
function toast(msg, ms) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(TOAST_T); TOAST_T = setTimeout(() => el.classList.add('hidden'), ms || 1600);
}
// 하드웨어 뒤로가기: 열린 것을 하나 닫으면 true, 더 닫을 게 없으면(로비) false → app.js 가 두 번 누름으로 종료
window.DKAPP = {
  toast,
  back() {
    if (settingsOpen()) { closeSettings(); return true; }
    const help = $('inf-help'); if (help && !help.classList.contains('hidden')) { closeInfHelp(); return true; }
    if (menuOpen()) { closeMenu(); return true; }
    if (chatForm && !chatForm.classList.contains('hidden')) { chatClose(); return true; }
    if (typeof VIEW !== 'undefined' && VIEW.pid) { mpViewExit(); return true; }
    if (S.phase === 'playing' && S.selTower) { S.selTower = null; syncUI(); return true; }
    if (S.phase === 'playing' || S.phase === 'spectate') { openMenu(); return true; }
    if (S.phase === 'stageSelect' || S.phase === 'shop') { const b = document.querySelector(`#${S.phase === 'shop' ? 'shop' : 'stage-select'} .back-btn`); if (b) b.click(); return true; }
    if (S.phase === 'mpRoom') { $('mp-leave').click(); return true; }
    if (S.phase === 'title' || S.phase === 'over' || S.phase === 'win' || S.phase === 'stageClear') { $('ov-btn').click(); return true; }
    if (S.phase === 'lobby' && LOBBY_VIEW !== 'hub') { lobbyShow('hub'); return true; }   // 갈래 → 허브, 허브에서는 앱 종료(두 번)
    return false;
  },
};
// ---- 설정 모달 (음악·효과음 음량, 음소거) — 로비·대기실의 ⚙ 와 앱 뒤로가기 체인 ----
function openSettings() { const el = $('settings'); if (!el) return; audio(); applyAudioSettings(); el.classList.remove('hidden'); }
function closeSettings() { const el = $('settings'); if (el) el.classList.add('hidden'); }
function settingsOpen() { const el = $('settings'); return !!(el && !el.classList.contains('hidden')); }
for (const id of ['lobby-settings', 'room-settings']) { const b = $(id); if (b) b.addEventListener('click', openSettings); }
if ($('settings')) {
  $('settings-close').addEventListener('click', closeSettings);
  $('settings').addEventListener('click', (ev) => { if (ev.target === $('settings')) closeSettings(); });
  $('set-music').addEventListener('input', () => { SAVE.audio.music = +$('set-music').value; applyAudioSettings(); saveSave(); });
  $('set-sfx').addEventListener('input', () => { SAVE.audio.sfx = +$('set-sfx').value; applyAudioSettings(); saveSave(); });
  $('set-sfx').addEventListener('change', () => SFX.coin());
  $('set-mute').addEventListener('click', () => { SAVE.audio.muted = !SAVE.audio.muted; applyAudioSettings(); saveSave(); });
}

$('ov-btn').addEventListener('click', () => {
  if (S.phase === 'loading') return;
  audio();
  if (S.phase === 'over' || S.phase === 'win' || S.phase === 'stageClear') {
    if (S.mode === 'infinity') { const wasNet = !!S.net; if (S.net) mpLeave(); S.mode = 'stage'; S.inf = null; gotoLobby(wasNet ? 'multi' : 'single'); } else gotoStageSelect();
    return;
  }
  // 타이틀 → 로비 (?start=inf 이면 바로 인피니티, 새로고침 전 방이 있으면 그 방으로)
  if (mpResumeAfterTitle()) return;
  if ((window.DKAUTOSTART === 'inf' || window.DKAUTOSTART === 'clear') && infinityUnlocked()) { const k = window.DKAUTOSTART === 'clear' ? 'clear' : 'endless'; window.DKAUTOSTART = null; startInfinity(k); return; }
  gotoLobby();
});
$('btn-stage-select').addEventListener('click', () => { audio(); gotoStageSelect(); });
const startInf = (kind) => { if (!infinityUnlocked()) return; audio(); startInfinity(kind); };
$('btn-infinity').addEventListener('click', () => startInf('endless'));
if ($('btn-inf-clear')) $('btn-inf-clear').addEventListener('click', () => startInf('clear'));
for (let f = 1; f <= 6; f++) { const b = $('inf-face-' + f); if (b) b.addEventListener('click', () => upgradeFace(f)); }
if ($('help-btn')) $('help-btn').addEventListener('click', () => { audio(); openInfHelp(); });
if ($('coach-skip')) $('coach-skip').addEventListener('click', () => { audio(); coachStop(false); });
if ($('rotate-hint')) $('rotate-hint').addEventListener('click', () => {
  rotateHintOff = true;
  try { localStorage.setItem('dk_rotateHint', 'off'); } catch (e) { /* 저장 못해도 이번 세션은 닫힌다 */ }
  $('rotate-hint').classList.add('hidden');
  fitStage();
});
if ($('help-close')) $('help-close').addEventListener('click', () => { audio(); closeInfHelp(); });
if ($('inf-help')) $('inf-help').addEventListener('click', (ev) => { if (ev.target === $('inf-help')) closeInfHelp(); }); // 배경 클릭으로 닫기
if ($('enhance-btn')) $('enhance-btn').addEventListener('click', () => {
  audio();
  if (enhanceTower()) { S.selTower = null; syncUI(); }   // 강화하면 카드를 닫아 다시 뽑기·파워업 칸이 보인다
});
if ($('info-close')) $('info-close').addEventListener('click', () => { audio(); S.selTower = null; syncUI(); });
$('btn-shop').addEventListener('click', () => { audio(); gotoShop(); });
$('ss-back').addEventListener('click', () => gotoLobby('single'));
$('shop-back').addEventListener('click', () => gotoLobby('hub'));
$('hub-single').addEventListener('click', () => { audio(); lobbyShow('single'); });
$('hub-multi').addEventListener('click', () => { audio(); lobbyShow('multi'); });
$('lobby-back').addEventListener('click', () => { audio(); lobbyShow('hub'); });
// 어두운 배경을 누르면 로비로 (상점에 갇히지 않게)
['shop', 'stage-select'].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener('click', (e) => { if (e.target === el) gotoLobby(id === 'stage-select' ? 'single' : 'hub'); });   // 배경 클릭도 뒤로 버튼과 같은 갈래로
});
// ---- 게임 메뉴 (≡): 싱글은 여는 동안 멈춘다. 멀티는 계속 돈다(일시정지 불가) ----
function menuOpen() { return !$('menu').classList.contains('hidden'); }
function setPaused(on) {
  S.paused = !!on && !S.net && S.phase === 'playing';
  const b = $('menu-pause');
  if (b) {
    b.disabled = !!S.net || S.phase !== 'playing';
    $('menu-pause-txt').textContent = S.net ? '일시정지 (멀티에서는 불가)' : S.paused ? '재개 (메뉴는 열어 둠)' : '일시정지';
    b.querySelector('.bi').dataset.icon = S.paused ? 'speed1' : 'pause';
  }
  if (window.DKBGM) { try { DKBGM.duck(S.paused ? 0.35 : 1, 0.3); } catch (e) { /* 무시 */ } }
}
function openMenu() {
  if (S.phase !== 'playing' && S.phase !== 'spectate') return;
  audio();
  $('menu').classList.remove('hidden');
  const spec = S.phase === 'spectate';
  $('menu-note').innerHTML = spec ? '관전 중입니다. 기록·젬은 이미 저장됐습니다.' : S.net ? '<b>함께하기</b> 중에는 게임이 멈추지 않습니다. 포기하면 관전으로 넘어가고 기록·젬은 저장됩니다.' : (S.mode === 'infinity' ? '메뉴가 열려 있는 동안 게임이 멈춥니다. 포기하면 지금까지의 기록·젬이 저장됩니다.' : '메뉴가 열려 있는 동안 게임이 멈춥니다.');
  $('menu-quit-txt').textContent = spec ? '관전 끝내고 나가기' : S.mode === 'infinity' ? '포기하고 나가기 (기록 저장)' : '스테이지 선택으로 나가기';
  $('menu-help').classList.toggle('hidden', S.mode !== 'infinity');
  setPaused(!spec);
}
function closeMenu() { $('menu').classList.add('hidden'); setPaused(false); }
function quitToMenu() {
  closeMenu();
  if (S.phase === 'spectate') { mpLeave(); S.mode = 'stage'; S.inf = null; gotoLobby('multi'); return; }   // 관전 중 나가기 (기록은 이미 저장됨)
  if (S.phase !== 'playing') return;
  if (S.mode === 'infinity') { S.inf.quit = true; endInfinity(); return; }   // 포기 = 런 종료 (기록 저장)
  gotoStageSelect();
}
$('exit-btn').addEventListener('click', () => { if (menuOpen()) closeMenu(); else openMenu(); });
$('menu-resume').addEventListener('click', () => { audio(); closeMenu(); });
$('menu-pause').addEventListener('click', () => { audio(); setPaused(!S.paused); });
$('menu-settings').addEventListener('click', () => { audio(); openSettings(); });
$('menu-help').addEventListener('click', () => { audio(); closeMenu(); openInfHelp(); });
$('menu-quit').addEventListener('click', () => { audio(); quitToMenu(); });
$('menu').addEventListener('click', (ev) => { if (ev.target === $('menu')) closeMenu(); });

// ==================== 멀티 (인피니티 · 함께) ====================
// 서버(Cloudflare Worker + Room DO)는 방·시계·시드·중계만 갖고, 시뮬레이션은 각자 자기 보드에서 돈다 (GAME-SPEC §6.5).
// net.js(DKNET) 가 소켓·재접속·시각 동기를 맡고, 여기서는 게임 규칙에 붙인다:
//   - 시작 신호(start{seed,t0,timing})만 같고, 그 뒤는 각자 싱글과 똑같이 진행한다 (막간 자동·웨이브 버튼·배속 x1~x3). 아무도 기다리지 않는다
//   - 2초마다 요약(sum)을 보내고 상대 요약으로 카드(#rivals)를 그린다
//   - 먼저 죽으면 기록·젬을 그 즉시 저장하고 관전(#spectate)으로. 전원이 완주/탈락하면 순위표 (완주는 빠른 순, 탈락은 웨이브 순)
const MP = { sumTimer: 0, sumEvery: 0, tickAt: 0, resumeRoom: null, statsDone: false, quick: false, queue: null, baseIdx: null };
// 상대 필드 보기: 상대 sum(tw·en·ll) 으로 만든 타워·적 목록. frame() 이 draw() 직전에 S 와 바꿔 그린다
const VIEW = { pid: null, towers: [], enemies: [], projs: [], beams: [], fxs: [], sum: null, at: 0 };
const PC = ['#7fd4ff', '#ffd452', '#8ef0b0', '#ff7ad9'];   // 좌석색 (입장 순)
const MP_LOG_KINDS = ['sys', 'gacha', 'up', 'boom', 'boss', 'life'];
const mpOn = () => !!(window.DKNET && DKNET.CFG && DKNET.CFG.url);
const mpPlayers = () => ((window.DKNET && DKNET.room && DKNET.room.players) || []).slice();
const mpMePid = () => (window.DKNET && DKNET.me && DKNET.me.pid) || '';
const mpSeat = (pid) => { const i = mpPlayers().findIndex(p => p.pid === pid); return i < 0 ? 0 : i; };
const mpNameOf = (pid) => { const p = mpPlayers().find(x => x.pid === pid); return p ? p.name : '?'; };
const mpErrText = (e) => {
  const c = e && e.code;
  const T = { 'bad-code': '그런 방이 없습니다', full: '방이 가득 찼습니다 (최대 4명)', started: '이미 시작된 방입니다', version: '게임 버전이 다릅니다 — 새로고침해 주세요',
    expired: '끝난 방입니다', rate: '너무 자주 시도했습니다. 잠시 뒤 다시', origin: '허용되지 않은 주소입니다', name: '이름을 확인해 주세요', timeout: '서버가 응답하지 않습니다',
    'not-ready': '2명 이상 모여야 시작할 수 있습니다', 'not-host': '방장만 시작할 수 있습니다', 'bad-key': '이 방의 좌석이 아닙니다', 'bad-request': '잘못된 요청', busy: '지금은 방을 더 만들 수 없습니다. 잠시 뒤 다시', left: '상대가 나가 매칭이 취소되었습니다' };
  return T[c] || (`연결 실패${c ? ` (${c})` : ''}`);
};
function mpStatus(txt, err) { const el = $('mp-status'); if (el) { el.textContent = txt || ''; el.classList.toggle('err', !!err); } }
function mpNameInput() {
  const inp = $('mp-name');
  const raw = ((inp && inp.value) || '').trim().slice(0, 12);
  if (raw !== (SAVE.name || '')) { SAVE.name = raw; saveSave(); }
  return raw;
}
async function mpCreate() {
  if (!mpOn() || S.phase !== 'lobby') return;
  audio(); mpStatus('방을 만드는 중…');
  try { await DKNET.create(mpNameInput()); MP.quick = false; clearRoomChat(); mpStatus(''); gotoMpRoom(); }
  catch (e) { mpStatus(mpErrText(e), true); }
}
async function mpQuick() {
  if (!mpOn() || S.phase !== 'lobby') return;
  audio(); mpStatus('매칭 서버에 붙는 중…');
  try { await DKNET.quick(mpNameInput()); MP.quick = true; MP.queue = null; clearRoomChat(); mpStatus(''); gotoMpRoom(); }
  catch (e) { mpStatus(mpErrText(e), true); }
}
async function mpJoin(code) {
  if (!mpOn() || S.phase !== 'lobby') return;
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) { mpStatus('방 코드는 6자리입니다', true); return; }
  audio(); mpStatus('방에 들어가는 중…');
  try { await DKNET.join(code, mpNameInput()); MP.quick = false; clearRoomChat(); mpStatus(''); gotoMpRoom(); }
  catch (e) { mpStatus(mpErrText(e), true); }
}
function mpLeave() {
  mpStopSum();
  if (VIEW.pid) mpViewExit(true);
  MP.resumeRoom = null; MP.quick = false; MP.queue = null;
  S.net = null;                                  // leave() 가 net:closed 를 동기 발화하므로 먼저 비운다
  if (window.DKNET) DKNET.leave();
  const rv = $('rivals'); if (rv) { rv.innerHTML = ''; rv.classList.add('hidden'); }
  const sp = $('spectate'); if (sp) sp.classList.add('hidden');
  stageEl.classList.remove('spectating', 'mp');
}

// ---- 대기실 ----
function renderMpRoom() {
  const N = window.DKNET; if (!N) return;
  const queue = N.inQueue();
  $('mp-queue').classList.toggle('hidden', !queue);
  $('mp-code-wrap').classList.toggle('hidden', queue || MP.quick);
  $('mp-slots').classList.toggle('hidden', queue);
  $('mp-room-title').textContent = queue || MP.quick ? '빠른 매칭' : '대기실';
  if (queue) {   // 대기열: 방이 아직 없다
    const q = MP.queue || { n: 1, eta: null };
    $('mp-count').textContent = `${q.n || 1}/4`;
    $('mp-queue-txt').innerHTML = (q.n || 1) >= 2 ? `상대를 찾는 중 <b>${q.n}/4</b> · ${q.eta != null ? `${Math.max(0, Math.ceil(q.eta / 1000))}초 뒤 시작` : '곧 시작'}` : '상대를 찾는 중… <small>(2명 이상 모이면 10초 뒤, 4명이면 바로 시작)</small>';
    $('mp-start').classList.add('hidden');
    $('mp-room-status').textContent = '나가기를 누르면 매칭을 취소합니다';
    return;
  }
  if (!N.room) return;
  const ps = mpPlayers(), me = mpMePid();
  $('mp-code-big').textContent = N.code || '------';
  $('mp-count').textContent = `${ps.length}/4`;
  const slots = $('mp-slots'); slots.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = ps[i], d = document.createElement('div');
    d.className = 'mp-slot' + (p ? '' : ' empty');
    d.innerHTML = p
      ? `<span class="mp-dot" style="background:${PC[i]}"></span><span class="mp-slot-name">${escapeHtml(p.name)}</span>${p.host ? '<span class="mp-crown" title="방장">👑</span>' : ''}${p.pid === me ? '<span class="mp-me">나</span>' : ''}<span class="mp-conn${p.connected ? ' on' : ''}" title="${p.connected ? '접속 중' : '연결 끊김'}"></span>`
      : '<span class="mp-slot-name dim">초대 대기</span>';
    slots.appendChild(d);
  }
  const quickRoom = MP.quick || (N.room && N.room.kind === 'quick');
  const host = N.isHost() && !quickRoom, conn = ps.filter(p => p.connected).length, st = $('mp-start');
  st.classList.toggle('hidden', !host);
  st.disabled = conn < 2;
  st.textContent = `시작 (${conn}/4)`;
  $('mp-room-status').textContent = quickRoom ? `상대를 찾았습니다 — 전원이 들어오면 바로 시작합니다 (${conn}/${ps.length})` : host ? (conn < 2 ? '친구가 코드로 들어오면 시작할 수 있습니다 (2명 이상)' : '준비되면 시작을 누르세요') : '방장이 시작하면 바로 게임이 열립니다';
}

// ---- 런 시작 ----
function mpOnStart(m) {
  const N = window.DKNET;
  const net = { code: N.code, pid: mpMePid(), seed: m.seed, t0: m.t0, timing: m.timing,
    rivals: {}, status: 'alive', doneW: 0, savedResult: null, spectating: false, forced: false, ended: null, watchers: 0 };
  if (VIEW.pid) mpViewExit(true);
  startInfinity('clear', net);
  mpStartSum();
  mpRenderRivals();
  mpLayoutCards();
}
// 0.5초마다: 카드 배지(자리 비움·응답 없음)·웨이브 버튼 갱신
function mpTick() {
  const now = performance.now();
  if (now - MP.tickAt < 500) return;
  MP.tickAt = now;
  syncWaveBtn();
  mpRenderRivals();
}

// ---- 요약 송신 ----
function mpSummary(withField) {
  const net = S.net, boss = S.enemies.find(e => e.isBoss && !e.dead);
  const m = {
    w: Math.max(0, Math.min(101, S.wave | 0)), dw: Math.max(0, Math.min(101, net.doneW | 0)),
    l: Math.max(0, Math.min(20, S.lives | 0)), g: Math.max(0, Math.min(1e7, Math.floor(S.gold))), k: Math.max(0, Math.min(1e6, S.inf.kills | 0)),
    f: Math.min(200, S.enemies.length), sp: Math.max(1, Math.min(3, S.speed | 0)), hid: document.hidden ? 1 : 0,
    b: boss ? Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.max))) : null, o: W < H ? 'p' : 'l',
    tw: S.towers.slice(0, 15).map(t => [t.spot, t.face, t.lvl]),
  };
  if (withField) { m.ll = Math.round(LANES[0] ? LANES[0].len : 0); m.en = mpEnemyStream(); }
  return m;
}
// 적 스트림 "i,d,h;…" — i: bases 인덱스(보스는 1000+bossBases 인덱스), d: 진행 거리(정수), h: 체력 0~9. 보는 사람이 있을 때만 싣는다
function mpBaseIdx(e) {
  if (!MP.baseIdx) {
    const C = window.DKCONTENT, map = {};
    (C.bases || []).forEach((b, i) => { map[b.id] = i; });
    (C.bossBases || []).forEach((b, i) => { map['B:' + b.id] = 1000 + i; });
    MP.baseIdx = map;
  }
  const k = e.isBoss ? MP.baseIdx['B:' + e.type] : undefined;
  return k != null ? k : MP.baseIdx[e.type];   // 보스 그림이 일반 base 인 경우도 있다
}
function mpEnemyStream() {
  const parts = [], rows = [];
  for (const e of S.enemies) {
    if (e.dead || parts.length >= 200) continue;
    const i = mpBaseIdx(e);
    if (i == null) continue;
    rows.push({ i, d: e.dist, h: Math.max(0, Math.min(9, Math.round(e.hp / Math.max(1, e.max) * 9))), a: e.appearanceCode || 0,
      p: directionalArt && directionalArt.entry(e.artAssetId) ? directionalPhase(e) : null });
    parts.push(`${i},${Math.max(0, Math.round(e.dist))},${Math.max(0, Math.min(9, Math.round(e.hp / Math.max(1, e.max) * 9)))}`);
  }
  if (DIR_ART) return DIR_ART.enemyStream(rows);
  let out = parts.join(';');
  while (out.length > 3000) { parts.pop(); out = parts.join(';'); }
  return out;
}
function mpStartSum() {
  const every = (S.net && S.net.watchers > 0) ? ((window.DKNET && DKNET.CFG.watchInterval) || 1000) : ((window.DKNET && DKNET.CFG.sumInterval) || 2000);
  if (MP.sumTimer && MP.sumEvery === every) return;
  mpStopSum();
  MP.sumEvery = every;
  const send = () => {
    if (!S.net || S.phase !== 'playing' || !window.DKNET || !DKNET.inGame()) return;
    DKNET.sum(mpSummary(S.net.watchers > 0));
    try { sessionStorage.setItem('dk_mp_run', JSON.stringify({ wave: S.wave, kills: S.inf.kills | 0 })); } catch (e) { /* 저장 못해도 진행 */ }
  };
  MP.sumTimer = setInterval(send, every);
  send();
}
function mpStopSum() { if (MP.sumTimer) { clearInterval(MP.sumTimer); MP.sumTimer = 0; MP.sumEvery = 0; } }

// ---- 상대 필드 보기 ----
// 카드를 누르면 그 플레이어의 타워(tw)·적(en) 을 내 아레나 좌표로 옮겨 그린다. 내 게임은 뒤에서 그대로 돈다 (타워는 알아서 싸운다)
function mpView(pid) {
  if (!S.net || !pid || pid === mpMePid()) { mpViewExit(); return; }
  const p = mpPlayers().find(x => x.pid === pid);
  if (!p || (p.status !== 'alive' && p.status !== 'cleared')) { pushLog('지금은 볼 수 없는 필드입니다', 'sys'); return; }
  if (VIEW.pid === pid) { mpViewExit(); return; }
  VIEW.pid = pid; VIEW.towers = []; VIEW.enemies = []; VIEW.projs = []; VIEW.beams = []; VIEW.fxs = []; VIEW.sum = null; VIEW.at = 0;
  if (window.DKNET) DKNET.watch(pid);
  const last = S.net.rivals[pid];
  if (last) mpViewBuild(last);
  stageEl.classList.add('viewing'); wrapEl.classList.add('viewing');
  $('view-bar').classList.remove('hidden');
  if (S.phase === 'spectate') mpSpectateCollapse(true);
  if (DRAG.active) stopPlaceDrag();
  S.selTower = null;
  mpViewBar();
  mpRenderRivals();
  fitStage();
}
function mpViewExit(silent) {
  if (!VIEW.pid) return;
  VIEW.pid = null; VIEW.towers = []; VIEW.enemies = []; VIEW.projs = []; VIEW.beams = []; VIEW.fxs = []; VIEW.sum = null;
  if (!silent && window.DKNET && DKNET.inRoom()) DKNET.watch(null);
  stageEl.classList.remove('viewing'); wrapEl.classList.remove('viewing');
  $('view-bar').classList.add('hidden');
  if (S.net) mpRenderRivals();
  syncUI();
  fitStage();
}
function mpViewBar() {
  if (!VIEW.pid) return;
  const p = mpPlayers().find(x => x.pid === VIEW.pid), sum = VIEW.sum || S.net.rivals[VIEW.pid];
  const name = p ? p.name : '?', seat = mpSeat(VIEW.pid);
  const st = sum ? `W${sum.w} ♥${sum.l} · 필드 ${sum.f}${sum.sp > 1 ? ` · x${sum.sp}` : ''}` : '요약을 기다리는 중…';
  const mine = S.net.status === 'alive' ? ` <small>· 나 W${S.wave} ♥${S.lives}</small>` : '';
  $('view-txt').innerHTML = `<span class="mp-dot" style="background:${PC[seat]}"></span><b>${escapeHtml(name)}</b>의 필드 · ${st}${mine}`;
}
function mpViewBuild(sum) {
  const C = window.DKCONTENT;
  VIEW.sum = sum; VIEW.at = performance.now();
  const myKey = S.mapKey === 'cInfP' ? 'cInfP' : 'cInf', fromKey = sum.o === 'p' ? 'cInfP' : 'cInf';
  const towers = [], prevT = new Map();
  for (const t of VIEW.towers) prevT.set(t.spot + ':' + t.face + ':' + t.lvl, t);
  for (const t of (Array.isArray(sum.tw) ? sum.tw.slice(0, 15) : [])) {
    if (!Array.isArray(t)) continue;
    const spot = t[0] | 0, face = t[1] | 0, lvl = t[2] | 0;
    if (spot < 0 || spot > 14 || face < 1 || face > 20 || lvl < 1 || lvl > 3) continue;
    const idx = remapSpot(fromKey, myKey, spot), def = TOWER_DEFS[face];
    if (!def || idx < 0 || !SPOTS[idx]) continue;
    towers.push(prevT.get(idx + ':' + face + ':' + lvl) || { face, def, lvl, spot: idx, x: SPOTS[idx][0], y: SPOTS[idx][1], cd: Math.random() * 0.5, kick: 0, skin: 0 });
  }
  VIEW.towers = towers;
  const ll = sum.ll | 0, len = LANES[0] ? LANES[0].len : 0, k = ll > 0 && len > 0 ? len / ll : 1;
  const prev = new Map();
  for (const e of VIEW.enemies) prev.set(e.key, e);
  const enemies = [];
  if (typeof sum.en === 'string' && sum.en) {
    const parts = DIR_ART ? DIR_ART.parseEnemyStream(sum.en) : sum.en.split(';').map(row => { const f = row.split(',').map(Number); return { i: f[0], d: f[1], h: f[2], a: 0, p: null }; });
    for (let n = 0; n < parts.length && n < 200; n++) {
      const row = parts[n], i = row.i, d = row.d, h = row.h;
      const baseBoss = i >= 1000, base = baseBoss ? C.bossBases[i - 1000] : C.bases[i];
      if (!base) continue;
      const appearance = row.appearance, isBoss = appearance ? appearance.role !== 'normal' : baseBoss;
      const key = i + ':' + (row.a || 0) + ':' + n, old = prev.get(key);
      const e = old || { type: base.id, def: base, sprite: base.sprite, move: base.move, name: base.name, lane: laneFor(base.move, 0), animT: Math.random(), face: 1, dead: false, hidden: false, hue: 0, slowT: 0, stunT: 0, flashT: 0, isElite: false, isBoss, entranceT: -1, stompPhase: 0, key, view: true };
      if (appearance) {
        const inf = C.INFINITY, mon = inf.monsters[appearance.wave], cls = inf.monsterFor(appearance.wave).cls;
        const legacy = inf.art(appearance.wave, appearance.role === 'secondary' ? 1 : 0);
        const table = isBoss ? inf.artSizeBoss : inf.artSize;
        const logicalSize = legacy ? table[cls] : Math.round(base.size * (inf.sizeScale[cls] || 1));
        e.def = Object.assign({}, base, { size: Math.round(logicalSize * (appearance.elite ? 1.2 : 1)) });
        e.appearanceCode = row.a; e.artAssetId = appearance.assetId; e.isElite = appearance.elite; e.isBoss = isBoss;
        e.bossRole = appearance.role === 'secondary' ? 1 : 0; e.wave = appearance.wave; e.sizeClass = cls;
        e.drawHeight = directionalDrawHeight(e, table[cls]);
        e.name = (e.isElite ? '정예 ' : '') + (e.bossRole ? mon.second || mon.name + ' 부관' : mon.name);
        e.art = legacy && legacy.key; e.artWalk = legacy && legacy.walkKey; e.artWalkStride = legacy && legacy.walkStride || 0;
        e.artWalkDistance ||= 0;
        e.spdMult = inf.wave(appearance.wave, true).speedMult;
      }
      const stamp = performance.now(), elapsed = old && old.sourceAt != null ? (stamp - old.sourceAt) / 1000 : 0;
      if (elapsed > 0.05 && elapsed < 5 && old.sourceLength === ll) {
        let delta = d - old.sourceDist;
        const loopStart = (LANES[0] && LANES[0].loopAt || 0) * (ll / Math.max(1, len));
        if (delta < -ll / 2) delta += ll - loopStart;
        const maxSpeed = base.speed * (e.spdMult || 1) * Math.max(1, sum.sp || 1) * k * 1.5;
        e.viewSpeed = Math.max(0, Math.min(maxSpeed, delta * k / elapsed));
      } else e.viewSpeed = null;
      e.dist = d * k; e.max = base.hp; e.hp = base.hp * h / 9;
      e.sourceDist = d; e.sourceLength = ll; e.sourceAt = stamp; e.viewSourceScale = k;
      const entry = directionalArt && directionalArt.entry(e.artAssetId);
      const stride = entry && entry.cycleStride * e.drawHeight / entry.referenceHeight;
      if (!Number.isFinite(e.viewPhase)) e.viewPhase = row.p != null ? row.p : stride > 0 ? DIR_ART.phase(e.dist, stride) : 0;
      else if (row.p != null) e.viewPhaseCorrection = DIR_ART.phaseError(row.p, e.viewPhase);
      if (isBoss && !appearance) e.def = base;
      enemies.push(e);
    }
  }
  VIEW.enemies = enemies;
  const alive = new Set(enemies);   // 요약이 바뀌어 사라진 적을 노리던 투사체는 버린다
  VIEW.projs = VIEW.projs.filter(p => alive.has(p.tgt));
  refreshDirectionalDemand(true);
  mpViewBar();
}
// 요약 사이(1초)에는 상대 배속으로 전진시켜 흔들리지 않게 한다
function mpViewAdvance(dt) {
  const sp = VIEW.sum ? Math.max(1, Math.min(3, VIEW.sum.sp | 0)) : 1;
  for (const e of VIEW.enemies) {
    const ln = LANES[e.lane || 0] || LANES[0]; if (!ln) continue;
    const spd = Number.isFinite(e.viewSpeed) ? e.viewSpeed : ((e.def && e.def.speed) || 40) * (e.spdMult || 1) * sp * (e.viewSourceScale || 1);
    const advance = Math.max(0, spd * dt);
    e.dist += advance;
    e.artWalkDistance = (e.artWalkDistance || 0) + advance;
    const entry = directionalArt && directionalArt.entry(e.artAssetId), stride = entry && entry.cycleStride * e.drawHeight / entry.referenceHeight;
    if (entry) {
      const correction = (e.viewPhaseCorrection || 0) * (1 - Math.exp(-dt / 0.15));
      const phaseAdvance = stride > 0 ? advance / stride : DIR_ART.timePhaseAdvance(advance, e.viewSourceScale || 1, entry.cycleSeconds || entry.views.side.frames / 5);
      e.viewPhase = DIR_ART.phase((e.viewPhase || 0) + phaseAdvance + correction, 1);
      e.viewPhaseCorrection = (e.viewPhaseCorrection || 0) - correction;
    }
    if (e.dist >= ln.len) { if (ln.loopAt != null) e.dist = ln.loopAt + (e.dist - ln.len); else e.dist = ln.len; }
    e.animT += dt * sp;
    const p = posAt(e.dist, e.lane || 0);
    if (Math.abs(p.dx) > 0.3) e.face = Math.sign(p.dx);
    if (DIR_ART) e.artDirection = DIR_ART.direction(p.dx, p.dy, e.artDirection);
  }
  // 상대 타워의 공격 연출: 피해·처치·소리 없는 시각 전용 시뮬 (COSMETIC) — 실제 전투는 상대 기기에서 돈다
  withView(() => {
    COSMETIC = true;
    try {
      for (let i = 0; i < sp; i++) { for (const t of S.towers) towerFire(t, dt); updateVisuals(dt); }
      for (const e of S.enemies) if (e.flashT > 0) e.flashT -= dt;
    } finally { COSMETIC = false; }
    VIEW.projs = S.projs; VIEW.beams = S.beams; VIEW.fxs = S.fxs;
  });
}
// draw() 가 읽는 S 필드를 VIEW 것으로 바꿔 그리고 되돌린다
const VIEW_KEYS = ['towers', 'enemies', 'projs', 'beams', 'fxs', 'texts', 'corpses', 'selTower', 'heldDie', 'shakeT', 'bannerT', 'glowT', 'hurtT', 'mouse'];
function withView(fn) {
  const saved = {};
  for (const k of VIEW_KEYS) saved[k] = S[k];
  S.towers = VIEW.towers; S.enemies = VIEW.enemies; S.projs = VIEW.projs; S.beams = VIEW.beams; S.fxs = VIEW.fxs; S.texts = []; S.corpses = [];
  S.selTower = null; S.heldDie = 0; S.shakeT = 0; S.bannerT = 0; S.glowT = 0; S.hurtT = 0; S.mouse = { x: -999, y: -999 };
  try { fn(); } finally { for (const k of VIEW_KEYS) S[k] = saved[k]; }
}

// ---- 사망 · 완주 · 관전 · 결과 ----
function netRunOver(won) {
  const net = S.net;
  if (!net || net.spectating) return;
  S.waveActive = false;
  const res = settleInfRun(won);                    // 젬·기록은 지금 저장 (남을 기다리다 나가도 잃지 않는다)
  net.savedResult = { won, res };
  net.spectating = true;
  net.status = won ? 'cleared' : 'dead';
  mpStopSum();
  try { sessionStorage.removeItem('dk_mp_run'); } catch (e) { /* 무시 */ }
  if (!net.forced && window.DKNET) {
    if (won) DKNET.clear(S.wave, S.inf.kills | 0);
    else DKNET.dead(S.wave, S.inf.kills | 0, S.inf.reload ? 'reload' : S.inf.afk ? 'afk' : S.inf.quit ? 'quit' : S.inf.bossTimeout ? 'bossTimeout' : S.inf.bossLeak ? 'bossLeak' : 'lives');
  }
  if (!won) netLog(`탈락 — 웨이브 ${res.wave} 까지`, 'life');
  (won ? SFX.win : SFX.lose)();
  S.phase = 'spectate';
  S.selTower = null; S.heldDie = 0;
  SLOT.active = false; SLOT.final = 0;
  if (DRAG.active) stopPlaceDrag();
  mpOpenSpectate(won, res);
  if (net.ended) mpShowResult(net.ended);   // 방 결과가 먼저 와 있었다면 바로 순위표
}
function mpOpenSpectate(won, res) {
  const sp = $('spectate'); if (!sp) return;
  hudEl.classList.add('hidden'); statsEl.classList.add('hidden');
  stageEl.classList.add('spectating');
  sp.classList.remove('hidden');
  sp.classList.remove('collapsed');
  $('spec-title').textContent = won ? '완주! 결과를 기다리는 중' : `탈락 — 웨이브 ${res.wave}까지`;
  mpRenderSpectate();
  fitStage();
}
function mpSpectateCollapse(on) {
  const sp = $('spectate'); if (!sp) return;
  sp.classList.toggle('collapsed', !!on);
  const rv = $('rivals'); if (rv) rv.classList.toggle('zoomall', !!on);
}
function mpRenderSpectate() {
  const sp = $('spectate'); if (!sp || sp.classList.contains('hidden') || !S.net) return;
  const ps = mpPlayers(), me = mpMePid();
  const alive = ps.filter(p => p.status === 'alive');
  const myRank = mpLiveRank(me);
  const res = S.net.savedResult ? S.net.savedResult.res : null;
  $('spec-sub').innerHTML = `${S.net.status === 'cleared' ? '완주했습니다' : `현재 <b>${myRank}위</b>`} · 남은 <b>${alive.length}</b>명${res ? ` · 젬 <b>+${res.gems}</b> · 기록 저장됨` : ''}<br><small>Enter 로 채팅 · 방이 끝나면 순위표가 나옵니다</small>`;
  $('spec-pill').textContent = `관전 중 · 남은 ${alive.length}명`;
  const list = $('spec-list'); list.innerHTML = '';
  for (const p of ps) { const el = mpCardEl(p, true); if (p.pid !== me) el.addEventListener('click', () => { audio(); mpView(p.pid); }); else el.classList.add('me'); list.appendChild(el); }
}
function mpLiveRank(pid) {   // 관전 중 '현재 순위': 살아 있는 사람은 전부 나보다 위
  const ps = mpPlayers(), me = ps.find(p => p.pid === pid);
  if (!me) return ps.length;
  const better = ps.filter(p => p.pid !== pid && (p.status === 'alive' || p.status === 'cleared' || ((p.deathWave || 0) > (me.deathWave || 0))));
  return better.length + 1;
}
function mpOnEnd(m) {
  if (!S.net) return;
  if (VIEW.pid) mpViewExit(true);
  S.net.ended = m;
  if (S.phase === 'playing') { S.net.forced = true; endInfinity(!!S.inf.cleared); return; }   // 서버 판정 우선 (lost 등) → netRunOver 가 순위표까지
  mpShowResult(m);
}
function mpShowResult(m) {
  const net = S.net; if (!net || !m) return;
  const me = mpMePid(), ranking = (m.ranking || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const mine = ranking.find(r => r.pid === me) || {};
  const saved = net.savedResult || { won: false, res: { wave: Math.max(0, S.wave - 1), gems: 0, isBest: false, newly: [] } };
  if (!MP.statsDone) {
    MP.statsDone = true;
    SAVE.mp = SAVE.mp || { games: 0, wins: 0, best: 0 };
    SAVE.mp.games++; if (mine.rank === 1) SAVE.mp.wins++; SAVE.mp.best = Math.max(SAVE.mp.best || 0, saved.res.wave || 0);
    if (SAVE.infRuns && SAVE.infRuns[0] && SAVE.infRuns[0].mp) SAVE.infRuns[0].rank = mine.rank || 0;
    saveSave();
  }
  const REASON = { lives: '목숨', bossLeak: '보스 한계선', bossTimeout: '보스 시간초과', quit: '포기', reload: '새로고침', afk: '자리 비움' };
  const STATUS = { cleared: '🏆 클리어', dead: '탈락', lost: '미완료', left: '나감', alive: '진행 중' };
  const clearTxt = (r) => (r.clearAt != null && net.t0 != null ? `완주 · ${mpDur(r.clearAt - net.t0)}` : `${net.timing.clearWave} 완주`);
  const rows = ranking.map(r => `<tr class="${r.pid === me ? 'me' : ''}"><td>${r.rank || '-'}</td><td><span class="mp-dot" style="background:${PC[mpSeat(r.pid)]}"></span>${escapeHtml(r.name || '?')}</td><td>${STATUS[r.status] || r.status || ''}</td><td>${r.status === 'cleared' ? clearTxt(r) : `웨이브 ${r.wave || 0}`}</td><td>${r.kills || 0}</td></tr>`).join('');
  const html = `<table class="rank"><thead><tr><th>순위</th><th>이름</th><th>결과</th><th>도달</th><th>처치</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="rank-reason">${m.reason === 'cleared' ? '전원 완주 또는 탈락 — 완주는 빠른 순, 탈락은 웨이브 순' : m.reason === 'all-dead' ? '전원 탈락' : m.reason === 'timeout' ? '시간 종료' : m.reason === 'empty' ? '모두 나가 방이 닫혔습니다' : ''}${S.inf && S.inf.bossLeak && !saved.won ? ` · 내 탈락 사유: ${REASON[S.inf.bossTimeout ? 'bossTimeout' : 'bossLeak']}` : ''}</div>` +
    infResultHTML(saved.won, saved.res);
  const title = saved.won ? (mine.rank === 1 ? '클리어! 1위' : `클리어! ${mine.rank || '-'}위`) : mine.rank === 1 ? '1위!' : `${mine.rank || '-'}위 · 웨이브 ${saved.res.wave}`;
  S.phase = 'over';
  showOverlay(title, html, '로비로');
}
function mpDur(ms) { const t = Math.max(0, Math.round(ms / 1000)); return t >= 60 ? `${Math.floor(t / 60)}분 ${t % 60}초` : `${t}초`; }
function mpDisconnected(code) {
  if (!S.net) return;
  if (VIEW.pid) mpViewExit(true);
  pushLog('방과의 연결이 끊어졌습니다', 'life');
  if (S.phase === 'playing') { S.net.forced = true; endInfinity(!!S.inf.cleared); }
  if (S.phase === 'spectate' && !S.net.ended) {
    const res = S.net.savedResult ? S.net.savedResult.res : { wave: 0, gems: 0, isBest: false, newly: [] };
    S.phase = 'over';
    showOverlay('연결 끊김', `방과의 연결이 끊어져 순위표를 받지 못했습니다.<br>${infResultHTML(!!(S.net.savedResult && S.net.savedResult.won), res)}`, '로비로');
  }
}

// ---- 상대 요약 카드 ----
function mpCardEl(p, big) {
  const card = document.createElement('div');
  card.className = 'rival' + (big ? ' big' : '');
  card.dataset.pid = p.pid;
  card.innerHTML = '<div class="rv-head"><span class="mp-dot"></span><span class="rv-name"></span><span class="rv-badge"></span></div><div class="rv-stats"></div><div class="rv-boss hidden"><i></i></div><div class="rv-board"></div>';
  mpFillCard(card, p);
  return card;
}
function mpFillCard(card, p) {
  const net = S.net;
  // 내 카드(관전 목록)는 요약 수신이 없으니 내 상태로 채운다
  const sum = net ? (p.pid === mpMePid() ? Object.assign(mpSummary(), { _at: performance.now(), w: net.status === 'alive' ? S.wave : (p.deathWave || S.wave) }) : net.rivals[p.pid] || null) : null;
  const seat = mpSeat(p.pid);
  card.querySelector('.mp-dot').style.background = PC[seat];
  card.querySelector('.rv-name').textContent = p.name || '?';
  const stale = sum && performance.now() - sum._at > 7000;
  let badge = '';
  if (p.status === 'cleared') badge = '🏆 완주';
  else if (p.status === 'dead') badge = `💀 W${p.deathWave || 0}`;
  else if (p.status === 'left') badge = '📵 나감';
  else if (p.status === 'lost') badge = '⌛ 미완료';
  else if (!p.connected) badge = '↻ 재접속';
  else if (sum && sum.hid) badge = '⏸ 자리 비움';
  else if (stale) badge = '⏸ 응답 없음';
  else if (sum && sum.sp > 1) badge = `x${sum.sp}`;
  card.querySelector('.rv-badge').textContent = badge;
  card.classList.toggle('out', p.status === 'dead' || p.status === 'left' || p.status === 'lost');
  card.classList.toggle('viewing', VIEW.pid === p.pid);
  card.classList.toggle('done', p.status === 'cleared');
  const w = sum ? sum.w : (p.wave || 0), l = sum ? sum.l : '·', k = sum ? sum.k : (p.kills || 0), f = sum ? sum.f : 0;
  card.querySelector('.rv-stats').innerHTML = `<b>W${w}</b> <span class="rv-l">♥${l}</span> <span class="rv-k">⚔${k}</span> <span class="rv-f">필드 ${f}</span>`;
  const bossEl = card.querySelector('.rv-boss');
  if (sum && sum.b != null) { bossEl.classList.remove('hidden'); bossEl.firstChild.style.width = Math.round(sum.b * 100) + '%'; }
  else bossEl.classList.add('hidden');
  const board = card.querySelector('.rv-board');
  const myKey = S.mapKey === 'cInfP' ? 'cInfP' : 'cInf', cols = myKey === 'cInfP' ? 3 : 5;
  board.dataset.cols = cols;
  if (board.childElementCount !== 15) { board.innerHTML = ''; for (let i = 0; i < 15; i++) { const c = document.createElement('i'); c.className = 'cell'; board.appendChild(c); } }
  const cells = board.children;
  for (let i = 0; i < 15; i++) { cells[i].className = 'cell'; cells[i].textContent = ''; cells[i].removeAttribute('data-face'); cells[i].style.background = ''; }
  if (sum && Array.isArray(sum.tw)) {
    const fromKey = sum.o === 'p' ? 'cInfP' : 'cInf';
    for (const t of sum.tw.slice(0, 15)) {
      if (!Array.isArray(t)) continue;
      const spot = t[0] | 0, face = t[1] | 0, lvl = t[2] | 0;
      if (spot < 0 || spot > 14 || face < 1 || face > 20 || lvl < 1 || lvl > 3) continue;
      const idx = remapSpot(fromKey, myKey, spot);
      const def = TOWER_DEFS[face]; if (!def || idx < 0 || idx > 14) continue;
      const c = cells[idx];
      c.className = 'cell on lv' + lvl;
      c.dataset.face = face;
      c.style.background = def.color;
      c.textContent = face >= 7 ? '★' + face : '';
    }
  }
}
function mpRenderRivals(onlyPid) {
  const wrap = $('rivals'); if (!wrap || !S.net) return;
  try {
    const me = mpMePid(), ps = mpPlayers().filter(p => p.pid !== me);
    const keep = new Set(ps.map(p => p.pid));
    for (const el of Array.from(wrap.children)) if (!keep.has(el.dataset.pid)) el.remove();
    for (const p of ps) {
      let card = wrap.querySelector(`.rival[data-pid="${p.pid}"]`);
      if (!card) {
        card = mpCardEl(p, false);
        card.addEventListener('click', () => { audio(); mpView(p.pid); });
        wrap.appendChild(card);
      } else if (!onlyPid || onlyPid === p.pid) mpFillCard(card, p);
    }
    if (wrap.childElementCount !== (wrap._n || 0)) { wrap._n = wrap.childElementCount; mpLayoutCards(); }
    if (S.phase === 'spectate') {
      const list = $('spec-list');
      if (list && !$('spectate').classList.contains('hidden')) for (const el of Array.from(list.children)) { const p = mpPlayers().find(x => x.pid === el.dataset.pid); if (p) mpFillCard(el, p); }
    }
  } catch (e) { console.warn('[mp] 카드 렌더 실패', e); }
}
// 카드 자리·크기: 가로(over)는 트랙 오른쪽 여백의 세로 열, 세로(bleed)는 아래 띠 오른쪽.
// 폭 클래스(small/tiny)가 아니라 '가용 높이 ÷ 상대 수' 와 '트랙 여백 폭' 으로 정한다
function mpLayoutCards() {
  const wrap = $('rivals'); if (!wrap || !S.net) return;
  const n = Math.max(1, wrap.childElementCount);
  const over = wrapEl.classList.contains('over');
  const portrait = W < H;
  wrap.classList.toggle('lay-strip', portrait);
  wrap.classList.toggle('lay-col', !portrait);
  wrap.classList.remove('full', 'mid', 'slim', 'line', 'compact');
  const sr = stageEl.getBoundingClientRect();
  if (portrait) {
    wrap.classList.add('line');
    wrap.style.setProperty('--rv-w', 'auto');
    wrap.style.setProperty('--rv-h', '64px');
    const hudH = hudEl.classList.contains('hidden') ? 0 : hudEl.offsetHeight;
    wrap.style.bottom = (over ? hudH + 8 : 8) + 'px';
    return;
  }
  const sc = sr.width / W || 1;
  const track = (window.DKCONTENT.maps.find(m => m.key === S.mapKey) || {}).track;
  const halfTrack = track ? Math.max(track.R - W / 2, W / 2 - track.L) : 262;
  const margin = (W / 2 - halfTrack - 24) * sc;
  const sa = safeArea();
  const top = (stageEl.classList.contains('small') ? 42 : 52) + sa.t;
  const hudH = over && !hudEl.classList.contains('hidden') ? hudEl.offsetHeight + 8 : 8;
  const availH = sr.height - top - hudH;
  const cardW = Math.max(60, Math.min(150, margin - 12));
  const cardH = Math.floor((availH - 6 * (n - 1)) / n);
  wrap.classList.add(cardH >= 104 ? 'full' : cardH >= 80 ? 'mid' : cardH >= 60 ? 'slim' : 'line');
  if (cardW < 96) wrap.classList.add('compact');
  wrap.style.setProperty('--rv-w', cardW + 'px');
  wrap.style.setProperty('--rv-h', Math.max(22, Math.min(cardH, 150)) + 'px');
  wrap.style.top = top + 'px';
  wrap.style.bottom = hudH + 'px';
}

// ---- 서버 이벤트 ----
function mpOnRoom(m) {
  if (S.phase === 'mpRoom') renderMpRoom();
  if (!S.net) return;
  mpRenderRivals();
  if (S.phase === 'spectate') mpRenderSpectate();
  syncUI();
}
function mpOnPlayer(m) {
  if (S.phase === 'mpRoom') { renderMpRoom(); return; }
  if (!S.net) return;
  if (m.pid === mpMePid() && (m.status === 'left' || m.status === 'lost') && S.phase === 'playing') {   // 서버 판정 우선
    pushLog(m.status === 'lost' ? '서버가 이 런을 미완료로 정리했습니다' : '서버가 이 좌석을 정리했습니다', 'life');
    S.net.forced = true; endInfinity(false); return;
  }
  if (m.status && m.pid !== mpMePid()) {
    if (VIEW.pid === m.pid && m.status !== 'alive' && m.status !== 'cleared') mpViewExit();
    const p = mpPlayers().find(x => x.pid === m.pid);
    if (m.status === 'dead') pushLog(`${p ? p.name : '?'} 탈락 — 웨이브 ${m.deathWave != null ? m.deathWave : (p && p.deathWave) || 0}까지`, 'life');
    else if (m.status === 'cleared') pushLog(`${p ? p.name : '?'} 완주!`, 'up');
    else if (m.status === 'left') pushLog(`${p ? p.name : '?'} 나감`, 'sys');
  }
  mpRenderRivals(m.pid);
  if (S.phase === 'spectate') mpRenderSpectate();
  syncUI();
}
function mpOnSum(m) {
  if (!S.net || !m.pid) return;
  m._at = performance.now();
  S.net.rivals[m.pid] = m;
  if (VIEW.pid === m.pid) mpViewBuild(m);
  mpRenderRivals(m.pid);
}
function mpOnWatched(m) {   // 내 필드를 보는 사람 수 — 있으면 1초마다 적 스트림을 실어 보낸다
  if (!S.net) return;
  S.net.watchers = Math.max(0, m.n | 0);
  if (S.phase === 'playing') mpStartSum();
}
function mpOnQueued(m) { MP.queue = { n: m.n | 0, eta: m.eta == null ? null : +m.eta }; if (S.phase === 'mpRoom') renderMpRoom(); }
function mpOnMatched() { MP.queue = null; if (S.phase === 'mpRoom') $('mp-room-status').textContent = '상대를 찾았습니다! 방으로 이동 중…'; }
function mpOnErr(m) {
  if (S.phase === 'lobby') { if (LOBBY_VIEW !== 'multi') toast(mpErrText(m)); mpStatus(mpErrText(m), true); }   // 멀티 갈래가 닫혀 있으면 상태 줄이 안 보인다 → 토스트
  else pushLog(`오류: ${mpErrText(m)}`, 'life');
}
function mpOnState(st) {
  if (S.phase === 'mpRoom') { renderMpRoom(); return; }
  if (!S.net) return;
  if (st === 'reconnecting') pushLog('연결이 끊겨 다시 붙는 중…', 'sys');
  syncWaveBtn();
}
const CLOSE_CODE_NAME = { 4001: 'replaced', 4400: 'bad-request', 4403: 'bad-key', 4404: 'bad-code', 4409: 'started', 4410: 'expired', 4426: 'version', 4429: 'rate' };
function mpOnClosed(m) {
  const code = m && m.code;
  if (code === 4000) return;                                        // 내가 나간 것 (mpLeave)
  const why = code === 4001 ? '다른 탭에서 같은 좌석으로 들어와 이 탭의 연결이 끊겼습니다' : mpErrText({ code: (m && typeof m.reason === 'string' && m.reason) || CLOSE_CODE_NAME[code] });
  if (S.phase === 'mpRoom') { mpLeave(); gotoLobby('multi'); mpStatus(why, true); return; }
  if (S.net && (S.phase === 'playing' || S.phase === 'spectate')) mpDisconnected(code);
}

// ---- 부팅 · 새로고침 복귀 ----
async function mpTryResume() {
  if (!mpOn() || !window.DKNET.resume) return;
  try {
    const room = await DKNET.resume();
    if (room) MP.resumeRoom = room;
  } catch (e) { /* 복귀 실패 → 그냥 새로 시작 */ }
}
// 타이틀 버튼을 눌렀을 때: 새로고침 전 방이 있었으면 로비 대신 그 방으로. 판이 진행 중이면 보드가 없으니 탈락 처리 후 관전
function mpResumeAfterTitle() {
  const room = MP.resumeRoom; MP.resumeRoom = null;
  if (!room || !window.DKNET || !DKNET.inRoom()) return false;
  if (room.phase === 'lobby') { gotoMpRoom(); return true; }
  if (room.phase === 'playing' && room.game) {
    let last = { wave: 0, kills: 0 };
    try { last = JSON.parse(sessionStorage.getItem('dk_mp_run') || 'null') || last; } catch (e) { /* 없음 */ }
    mpOnStart({ seed: room.game.seed || 0, t0: room.game.t0, timing: room.game.timing });
    S.wave = Math.max(0, last.wave | 0); S.inf.kills = last.kills | 0; S.inf.reload = true;
    endInfinity(false);
    return true;
  }
  DKNET.leave();
  return false;
}
function mpInit() {
  const N = window.DKNET; if (!N || !$('mp-block')) return;
  const nameInp = $('mp-name'); if (nameInp) nameInp.value = SAVE.name || '';
  if (!mpOn()) { $('mp-block').classList.add('off'); mpStatus('이 주소에는 멀티 서버가 없습니다 (?net=ws://… 로 지정할 수 있습니다)'); }
  $('mp-create').addEventListener('click', mpCreate);
  $('mp-quick').addEventListener('click', mpQuick);
  $('mp-chat-form').addEventListener('submit', (ev) => { ev.preventDefault(); const inp = $('mp-chat-input'); const txt = (inp.value || '').trim().slice(0, 120); inp.value = ''; if (txt && N.inRoom()) N.chat(txt); });
  $('mp-chat-input').addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') ev.target.blur(); });
  $('chat-btn').addEventListener('click', () => { audio(); if (chatForm && !chatForm.classList.contains('hidden')) chatClose(); else chatOpen(); });
  $('view-back').addEventListener('click', () => { audio(); mpViewExit(); });
  $('mp-join').addEventListener('click', () => { audio(); const f = $('mp-join-form'); f.classList.toggle('hidden'); if (!f.classList.contains('hidden')) $('mp-code').focus(); });
  $('mp-join-form').addEventListener('submit', (ev) => { ev.preventDefault(); mpJoin($('mp-code').value); });
  $('mp-code').addEventListener('input', () => { const el = $('mp-code'); el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  $('mp-leave').addEventListener('click', () => { audio(); mpLeave(); gotoLobby('multi'); });
  $('mp-copy').addEventListener('click', async () => {
    const code = N.code || '';
    try { await navigator.clipboard.writeText(code); $('mp-copy').textContent = '복사됨'; setTimeout(() => { $('mp-copy').textContent = '복사'; }, 1200); }
    catch (e) { const r = document.createRange(); r.selectNodeContents($('mp-code-big')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  });
  $('mp-start').addEventListener('click', () => { audio(); if (!N.start()) mpStatus('시작할 수 없습니다', true); });
  $('spec-collapse').addEventListener('click', () => mpSpectateCollapse(true));
  $('spec-pill').addEventListener('click', () => mpSpectateCollapse(false));
  $('spec-leave').addEventListener('click', () => { audio(); mpLeave(); S.mode = 'stage'; S.inf = null; gotoLobby('multi'); });
  N.on('room', mpOnRoom); N.on('player', mpOnPlayer); N.on('start', mpOnStart);
  N.on('sum', mpOnSum); N.on('end', mpOnEnd); N.on('err', mpOnErr); N.on('net:state', mpOnState); N.on('net:closed', mpOnClosed);
  N.on('watched', mpOnWatched); N.on('queued', mpOnQueued); N.on('matched', mpOnMatched);
  window.DKMP = {   // 테스트 훅
    state: () => S.net,
    speed: setSpeed,
    die: (r) => { if (S.net && S.phase === 'playing') { if (r === 'quit') S.inf.quit = true; else if (r === 'afk') S.inf.afk = true; S.lives = 0; endInfinity(false); } },
    bossKill: () => { let n = 0; for (const e of S.enemies) if (e.isBoss && !e.dead) { damageEnemy(e, e.hp * 100 + 1e9); n++; } return n; },
    summary: mpSummary,
    render: () => { mpRenderRivals(); mpLayoutCards(); },
    view: mpView, viewExit: mpViewExit, viewState: () => VIEW, quick: mpQuick,
  };
}

// ==================== 메인 루프 ====================

let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (!S.paused) {
    for (let i = 0; i < S.speed; i++) update(dt);
    updateDie(dt); // 주사위 물리는 배속과 무관하게 실제 시간으로
    updateSlot(dt * S.speed);   // 뽑기 슬롯은 배속을 따라간다 (x3 에서 보상 큐가 굳지 않게)
  }
  if (S.net) mpTick();
  refreshDirectionalDemand(false);
  if (VIEW.pid) { mpViewAdvance(dt); withView(draw); }   // 상대 필드 보기: 내 시뮬은 위에서 돌았고, 그리기만 상대 것으로
  else draw();
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
  if (box) { box.classList.add('loading'); box.classList.add('title'); }
  const ov = $('overlay'); if (ov) ov.classList.add('title');
  if (load) load.classList.remove('hidden');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = '불러오는 중 ' + pct + '%';
}

(async () => {
  // 키아트는 로딩 첫 프레임부터 깔린다 (CSS 가 직접 받아온다 — 에셋 로딩을 기다리면 로딩 화면이 검은 화면이 된다)
  // 키아트(산 위 주사위 성)는 CSS 배경으로만 쓴다 — SRCS 에 넣으면 loadAssets 가 두 방향을 다 내려받는다. CSS 는 미디어 쿼리에 맞는 한 장만 받는다
  const KEYART = { l: BASE + 'ui/title-keyart-l.jpg?v=91', p: BASE + 'ui/title-keyart-p.jpg?v=91', blur: BASE + 'ui/title-keyart-l-blur.jpg?v=91' };   // ?v= 는 index.html 의 preload href 와 같아야 한다 (같은 URL 이어야 미리 받은 걸 쓴다)   // l·p: 글자 없는 그림(세로·가로 모두 CSS 금박 제목을 얹는다) · blur: 가로 양옆 밑바탕
  document.body.style.setProperty('--keyart-bg', `linear-gradient(rgba(5,4,3,.45), rgba(5,4,3,.7)), url('${KEYART.l}')`);
  document.body.style.setProperty('--keyart-title', `linear-gradient(rgba(5,4,3,.10), rgba(5,4,3,.10) 45%, rgba(5,4,3,.82) 100%), url('${KEYART.l}'), url('${KEYART.blur}')`);   // 가로·데스크톱 타이틀: 그림을 높이에 맞춰 통째로 + 양옆은 흐린 밑바탕, 위에 CSS 제목
  document.body.style.setProperty('--keyart-title-p', `linear-gradient(rgba(5,4,3,.04), rgba(5,4,3,.04) 80%, rgba(5,4,3,.55) 100%), url('${KEYART.p}')`);   // 세로 타이틀: 그림의 돌 제목을 그대로, 맨 아래(버튼 자리)만 살짝
  drawLoading(0);
  $('ov-btn').disabled = true;
  // Approved identities have an inline same-character still before any gameplay or room resume.
  // This is a boot gate only: network art never holds a later spawn or simulation tick.
  try {
    if (!directionalArt || !window.INF_DIRECTIONAL_ART) throw new Error('directional art bootstrap unavailable');
    await directionalArt.init();
  }
  catch (error) {
    console.error('[directional art] boot fallback', error);
    $('ov-load-txt').textContent = '캐릭터 그림을 준비하지 못했습니다. 다시 불러와 주세요.';
    $('ov-btn').disabled = false; $('ov-btn').textContent = '다시 불러오기';
    $('ov-btn').onclick = () => location.reload();
    return;
  }
  // 키아트가 화면에 뜬 뒤에 에셋 로딩을 시작한다 — 800장 넘는 PNG 요청과 섞이면 폰에서 배경이 한참 검게 남았다. (실패·지연은 4초에서 끊고 진행)
  { const box = $('overlay-box'); if (box) box.classList.add('preload');
    const portrait = window.matchMedia && matchMedia('(max-aspect-ratio: 3/4)').matches;
    await new Promise((res) => { const im = new Image(); let done = false; const fin = () => { if (!done) { done = true; res(); } }; im.onload = () => { (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(fin); }; im.onerror = fin; im.src = portrait ? KEYART.p : KEYART.l; setTimeout(fin, window.DKAPP_NATIVE ? 1500 : 4000); });   // 앱은 로컬 파일이라 금방 온다 — 스플래시를 오래 붙들지 않게 짧게
    if (box) box.classList.remove('preload'); }
  try {
    await loadAssets(pr => drawLoading(pr));
  } catch (e) {
    console.warn(e);
  }
  try { buildDiceSprites(); } catch (e) { console.warn(e); }
  try { buildTowerSprites(); } catch (e) { console.warn(e); }
  try {
    diceURLs = A.dice.map(d => thumbURL(d, 96));
    $('icon-gold').src = A.gold ? thumbURL(A.gold, 44, SRCS.gold) : SRCS.gold;
    $('icon-heart').src = A.heart ? thumbURL(A.heart, 44, SRCS.heart) : SRCS.heart;
  } catch (e) { console.warn(e); }
  if (corsBlocked) {
    $('ov-desc').innerHTML += '<br><span style="color:#ff9f9f">⚠ file:// 로 열면 이미지 배경 보정이 생략됩니다. start.bat 또는 로컬 서버 사용을 권장합니다.</span>';
  }
  loadSave();
  applyAudioSettings();
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
  if (qs.get('name')) { SAVE.name = String(qs.get('name')).slice(0, 12); }   // 테스트용 이름 지정
  try { mpInit(); } catch (e) { console.warn('[mp] init', e); }
  mpTryResume();                                    // 새로고침 전 방이 있으면 조용히 다시 붙는다
  window.DKINF_OPEN = qs.get('inf') === '1';   // ?inf=1 → 인피니티만 임시 개방 (스테이지 진행·저장은 그대로)
  // 디버그 훅 (콘솔): DK 게임 상태, DKA 스프라이트, DKDIE/DKSLOT 주사위, DKthrow 던지기, DKLANES 레인
  window.DK = S; window.DKA = A; window.DKDIE = DIE; window.DKSLOT = SLOT;
  window.DKthrow = (vx, vy) => { if (canRoll()) throwDie(vx, vy); };
  window.DKLANES = () => LANES;
  window.DKstart = startStage;
  window.DKstartInf = startInfinity;
  window.DKinf = () => S.inf;
  window.DKupgrade = upgradeFace;
  window.DKchest = buyChest; // 인피니티 갓챠 훅
  window.DKtowerSpr = towerSpr;
  window.DKART = directionalArt;
  window.DKappearance = DIR_ART;
  window.DKTD = TOWER_DEFS;                        // 테스트 훅
  window.DKdamage = damageEnemy; window.DKenhance = enhanceTower; window.DKqueue = () => S.inf && S.inf.queue; window.DKhelp = openInfHelp; // 메운디 시스템 테스트 훅
  window.DKlog = pushLog; window.DKlogs = () => LOG.nodes.map(n => n.textContent); window.DKchatOpen = chatOpen; // 로그·채팅 훅
  window.DKNETLOG = window.DKNET && DKNET._debug;   // 멀티 소켓 로그
  window.DKplace = tryPlace;                      // 보유 주사위를 석단 idx 에 놓기
  window.DKend = gameEnd;                         // 결과 화면 (레이아웃 테스트)
  window.DKlobbyView = lobbyShow;                  // 로비 갈래 열기 (테스트: 'hub' | 'single' | 'multi')
  window.DKlobby = () => { if (S.net) mpLeave(); closeInfHelp(); closeSettings(); if (COACH.on) coachStop(false); S.mode = 'stage'; S.inf = null; S.selTower = null; S.heldDie = 0; DIE.state = 'tray'; SLOT.active = false; gotoLobby(); fitStage(); };   // 레이아웃 테스트: 어느 화면에서든 로비로
  window.DKacquire = acquireFx;                   // 획득 연출 미리보기 (콘솔: DKacquire(20))
  window.DKsync = syncUI;
  window.DKsafeArea = safeArea;
  window.DKroll = () => { if (S.phase === 'playing' && !S.heldDie && S.gold >= ROLL_COST) { S.gold -= ROLL_COST; S.heldDie = pickUnlockedFace(); syncUI(); return S.heldDie; } return 0; }; // 즉시 굴림 (테스트용)
  window.DKspots = () => SPOTS;
  window.DKrange = towerRange;                     // 테스트 훅
  window.DKSAVE = SAVE;
  S.phase = 'title';
  const loadEl = $('ov-load');
  if (loadEl) loadEl.classList.add('hidden');
  const box = $('overlay-box');
  if (box) box.classList.remove('loading');
  $('ov-btn').disabled = false;
  $('ov-btn').textContent = '게임 시작';
  requestAnimationFrame(frame);
  if (window.DKAPP_NATIVE && DKAPP_NATIVE.ready) { try { DKAPP_NATIVE.ready(); } catch (e) { /* 무시 */ } }   // 앱: 스플래시 내림
})();

})();
