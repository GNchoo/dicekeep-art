// 걷기 시트 공용 모듈 (sharp). 칸 분석(실루엣·경계 조각 제거) · 안정화 계획 · 자세 비교 · 재배치.
// game.js processSheet() 의 배경 제거·안정화 규칙과 같은 수식을 쓴다 (리샘플링·배율 제한에 따른 잔여 편차는 게임에서 재검사).
//
// 왜 안정화하는가: AI 가 뽑은 시트는 칸마다 캐릭터의 크기·발 위치·가로 위치가 조금씩 다르다(높이 10~30%, 발 y 5~15%).
// 게임은 칸을 같은 높이로 그리므로 그 편차가 그대로 '커졌다 작아졌다 · 앞뒤로 미끄러짐' 으로 보여 걷는 게 아니라 떨리는 것처럼 읽힌다.
// 규칙: (0) 칸 테두리에 닿은 작은 조각(이웃 칸에서 넘어온 창끝 등, 실루엣의 3% 미만)은 지운다
//       (1) 실루엣 넓이로 크기를 ±15% 안에서 보정 (자세가 바뀌어도 실루엣 면적은 비슷하다 — 웅크림·활보는 높이·폭만 바뀐다)
//       (2) 보정 뒤 발끝(실루엣 맨 아래) 을 중앙값 바닥선에 (3) 무게중심 x 를 중앙값 축에 맞춘다.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// 배경 판정: 투명(α≤150) 또는 마젠타 키 · 연회색 (game.js isKeyPixel 과 같은 규칙)
export function isBgPx(d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
  if (a <= 150) return true;
  if (r > 180 && g < 90 && b > 80 && r - g > 80) return true;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), avg = (r + g + b) / 3;
  return avg > 185 && avg < 250 && mx - mn < 22;
}

export async function loadRaw(file, { background = 'runtime', backgroundSeeds = [] } = {}) {
  if (!['runtime', 'checkerboard', 'alpha'].includes(background)) throw new Error('background must be runtime, checkerboard or alpha');
  if (background === 'alpha' && !(await sharp(file).metadata()).hasAlpha) throw new Error('background=alpha requires an existing alpha channel');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw = { data, W: info.width, H: info.height, background, backgroundSeeds };
  validateBackgroundSeeds(raw);
  return raw;
}

// CLI: inline [[x,y],...] or a reviewed JSON file. Source-keyed metadata pins coordinates to the original image hash.
export function readBackgroundSeeds(spec, file) {
  if (!spec) return [];
  const value = JSON.parse(spec.trim().startsWith('[') ? spec : fs.readFileSync(spec, 'utf8'));
  if (Array.isArray(value)) return value;
  const source = value?.sources?.[path.basename(file)];
  if (!source) throw new Error(`background seed metadata has no source ${path.basename(file)}`);
  if (source.sha256 && createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== source.sha256) throw new Error('background seed source SHA256 mismatch; review coordinates again');
  if (!Array.isArray(source.backgroundSeeds)) throw new Error('backgroundSeeds must be an array');
  return source.backgroundSeeds;
}

function isRemovableBackground(raw, p) {
  const { data, background } = raw, i = p * 4;
  const light = background === 'checkerboard' && Math.min(data[i], data[i + 1], data[i + 2]) > 185 && Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) < 22;
  return isBgPx(data, i) || light;
}
function validateBackgroundSeeds(raw) {
  const { backgroundSeeds = [], background, W, H } = raw;
  if (!Array.isArray(backgroundSeeds)) throw new Error('backgroundSeeds must be an array');
  if (backgroundSeeds.length && background !== 'checkerboard') throw new Error('reviewed background seeds require background=checkerboard');
  for (const seed of backgroundSeeds) {
    if (!Array.isArray(seed) || seed.length !== 2 || seed.some(n => !Number.isInteger(n))) throw new Error('each background seed must be an integer [x,y] coordinate');
    const [x, y] = seed;
    if (x < 0 || y < 0 || x >= W || y >= H) throw new Error(`background seed ${x},${y} is outside the image`);
    if (!isRemovableBackground(raw, y * W + x)) throw new Error(`background seed ${x},${y} is not a removable background color`);
  }
}

// 원본 픽셀은 불변. 게임처럼 시트 바깥 테두리에 연결된 배경만 제거한다.
// 갑옷·뼈 안쪽의 연회색 하이라이트나 반투명 픽셀은 배경색이라는 이유만으로 지우지 않는다.
// checkerboard 는 흰색까지 포함하는 명시적 입력 옵션: 불투명 체크무늬 생성물에만 사용하고 투명 PNG 로 다시 굽는다.
const foregroundCache = new WeakMap();
export function foregroundMask(raw) {
  if (foregroundCache.has(raw)) return foregroundCache.get(raw);
  validateBackgroundSeeds(raw);
  const { data, W, H, backgroundSeeds = [] } = raw;
  // Reviewed RGBA derivatives already encode the foreground. White hair and
  // pale edge colors must not be interpreted as a color-key background again.
  if (raw.background === 'alpha') {
    const keep = Uint8Array.from({ length: W * H }, (_, p) => data[p * 4 + 3] > 28 ? 1 : 0);
    foregroundCache.set(raw, keep);
    return keep;
  }
  const seen = new Uint8Array(W * H), bg = new Uint8Array(W * H), queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  const push = (p) => {
    if (seen[p]) return;
    seen[p] = 1;
    if (isRemovableBackground(raw, p)) { bg[p] = 1; queue[tail++] = p; }
  };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  // Explicitly reviewed enclosed gaps only; other interior gray/white highlights remain intact.
  for (const [x, y] of backgroundSeeds) push(y * W + x);
  while (head < tail) {
    const p = queue[head++], x = p % W, y = Math.floor(p / W);
    if (x > 0) push(p - 1); if (x < W - 1) push(p + 1);
    if (y > 0) push(p - W); if (y < H - 1) push(p + W);
  }
  const keep = new Uint8Array(W * H);
  for (let p = 0; p < keep.length; p++) keep[p] = !bg[p] && data[p * 4 + 3] > 28 ? 1 : 0;
  foregroundCache.set(raw, keep);
  return keep;
}

export function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

// '3x2' · 파일명 '…-walk-3x2.png' → { cols, rows } (열 × 행). 없으면 2x2.
export function parseGrid(s, fallback = '2x2') {
  const m = (fallback === null ? /^(\d+)x(\d+)$/ : /(\d+)x(\d+)/).exec(s || '') || (fallback && /^(\d+)x(\d+)$/.exec(fallback));
  if (!m) throw new Error('grid must be <columns>x<rows>');
  return { cols: positiveInteger(+m[1], 'columns'), rows: positiveInteger(+m[2], 'rows') };
}
export function gridCells(W, H, { cols, rows }) {
  positiveInteger(W, 'image width'); positiveInteger(H, 'image height');
  positiveInteger(cols, 'columns'); positiveInteger(rows, 'rows');
  if (cols > W || rows > H) throw new Error('grid cells must contain at least one pixel');
  const fw = W / cols, fh = H / rows, cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c * fw, r * fh]);
  return { fw, fh, cells };
}

// 칸 하나 분석: 실루엣 마스크(keep, 칸 크기) + 통계(시트 좌표, x1·y1 배타, n 픽셀 수, mx·my 무게중심).
// clean: 칸 테두리에 닿은 연결 성분 중 실루엣의 minFrag 미만인 것을 지운다 (이웃 칸의 창끝·꼬리가 경계를 넘어온 조각).
export function analyzeCell(raw, cx, cy, fw, fh, { clean = true, minFrag = 0.03 } = {}) {
  const { W } = raw, foreground = foregroundMask(raw);
  const X0 = Math.floor(cx), Y0 = Math.floor(cy), X1 = Math.floor(cx + fw), Y1 = Math.floor(cy + fh), w = X1 - X0, h = Y1 - Y0;
  const keep = new Uint8Array(w * h);
  let total = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (foreground[(Y0 + y) * W + X0 + x]) { keep[y * w + x] = 1; total++; }
  let dropped = 0;
  if (clean && total) {
    const lab = new Int32Array(w * h); let nl = 0; const size = [0], edge = [false];
    const stack = new Int32Array(w * h);
    for (let s0 = 0; s0 < w * h; s0++) {
      if (!keep[s0] || lab[s0]) continue;
      nl++; let sz = 0, touch = false, sp = 0; stack[sp++] = s0; lab[s0] = nl;
      while (sp) {
        const i = stack[--sp]; sz++;
        const x = i % w, y = (i - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch = true;
        if (x > 0 && keep[i - 1] && !lab[i - 1]) { lab[i - 1] = nl; stack[sp++] = i - 1; }
        if (x < w - 1 && keep[i + 1] && !lab[i + 1]) { lab[i + 1] = nl; stack[sp++] = i + 1; }
        if (y > 0 && keep[i - w] && !lab[i - w]) { lab[i - w] = nl; stack[sp++] = i - w; }
        if (y < h - 1 && keep[i + w] && !lab[i + w]) { lab[i + w] = nl; stack[sp++] = i + w; }
      }
      size.push(sz); edge.push(touch);
    }
    const drop = size.map((sz, l) => l > 0 && edge[l] && sz < minFrag * total);
    if (drop.some(Boolean)) for (let i = 0; i < w * h; i++) if (keep[i] && drop[lab[i]]) { keep[i] = 0; dropped++; }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!keep[y * w + x]) continue;
    n++; sx += X0 + x; sy += Y0 + y;
    if (X0 + x < x0) x0 = X0 + x; if (X0 + x + 1 > x1) x1 = X0 + x + 1; if (Y0 + y < y0) y0 = Y0 + y; if (Y0 + y + 1 > y1) y1 = Y0 + y + 1;
  }
  const mask = { X0, Y0, w, h, keep };
  if (!n) return { x0: X0, y0: Y0, x1: X0 + 1, y1: Y0 + 1, w: 1, h: 1, n: 0, mx: cx + fw / 2, my: cy + fh / 2, fill: 0, dropped, mask };
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, n, mx: sx / n, my: sy / n, fill: n / (fw * fh), dropped, mask };
}
export const cellStats = (raw, cx, cy, fw, fh) => analyzeCell(raw, cx, cy, fw, fh, { clean: false });

export function validateFrames(stats, { minFill = 0.02 } = {}) {
  if (!stats.length) throw new Error('no frames found');
  const bad = stats.flatMap((s, i) => !Number.isFinite(s.n) || s.n <= 0 || !Number.isFinite(s.fill) || s.fill < minFill ? [i + 1] : []);
  if (bad.length) throw new Error(`empty or underfilled frames: ${bad.join(', ')} (minimum fill ${minFill})`);
}

const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor((s.length - 1) / 2)]; };

// 안정화 계획. local = 칸 원점 기준 좌표. sc 배율 · dx/dy 이동(배율 적용 뒤) · 합집합 상자(ux0,uy0,bw,bh).
// anchor: 'foot' = 발끝(실루엣 맨 아래)을 바닥선에 (걷는 것) · 'center' = 무게중심 y 를 맞춤 (날것 — 날개가 내려간 칸은 맨 아래가 발이 아니라 날개 끝이라 발 기준이면 몸이 튄다)
export function stabilizePlan(stats, cells, { minS = 0.87, maxS = 1.15, anchor = 'foot' } = {}) {
  validateFrames(stats, { minFill: 0 });
  if (stats.length !== cells.length) throw new Error('frame statistics and grid cell counts differ');
  if (!['foot', 'center'].includes(anchor)) throw new Error('anchor must be foot or center');
  const area = median(stats.map((s) => s.n));
  const sc = stats.map((s) => (s.n ? Math.min(maxS, Math.max(minS, Math.sqrt(area / s.n))) : 1));
  const local = stats.map((s, i) => {
    const [cx, cy] = cells[i], k = sc[i];
    return { x0: (s.x0 - cx) * k, y0: (s.y0 - cy) * k, x1: (s.x1 - cx) * k, y1: (s.y1 - cy) * k, mx: (s.mx - cx) * k, my: (s.my - cy) * k };
  });
  const foot = median(local.map((l) => (anchor === 'center' ? l.my : l.y1))), axis = median(local.map((l) => l.mx));
  const dx = local.map((l) => axis - l.mx), dy = local.map((l) => foot - (anchor === 'center' ? l.my : l.y1));
  let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
  local.forEach((l, i) => { ux0 = Math.min(ux0, l.x0 + dx[i]); uy0 = Math.min(uy0, l.y0 + dy[i]); ux1 = Math.max(ux1, l.x1 + dx[i]); uy1 = Math.max(uy1, l.y1 + dy[i]); });
  return { sc, dx, dy, local, ux0, uy0, bw: Math.ceil(ux1 - ux0), bh: Math.ceil(uy1 - uy0), foot, axis, area };
}

// 편차 보고 (안정화 전). 비율은 칸 높이 기준 (높이는 가장 큰 칸 기준).
export function driftReport(stats, cells, plan, fh) {
  const span = (a) => Math.max(...a) - Math.min(...a);
  return { before: { h: span(stats.map((s) => s.h)) / Math.max(...stats.map((s) => s.h)), foot: span(stats.map((s, i) => s.y1 - cells[i][1])) / fh, cy: span(stats.map((s, i) => s.my - cells[i][1])) / fh, cx: span(stats.map((s, i) => s.mx - cells[i][0])) / fh } };
}

// 자세 비교: 안정화 좌표계에 실루엣을 size×size 로 내려 그려 칸끼리 IoU 를 잰다.
export function poseMasks(stats, cells, plan, size = 96) {
  const k = size / Math.max(plan.bw, plan.bh);
  return cells.map(([cx, cy], i) => {
    const m = new Uint8Array(size * size), s = stats[i], { X0, Y0, w, h, keep } = s.mask;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!keep[y * w + x]) continue;
      const ox = Math.floor(((X0 + x - cx) * plan.sc[i] + plan.dx[i] - plan.ux0) * k), oy = Math.floor(((Y0 + y - cy) * plan.sc[i] + plan.dy[i] - plan.uy0) * k);
      if (ox >= 0 && oy >= 0 && ox < size && oy < size) m[oy * size + ox] = 1;
    }
    return m;
  });
}
export function iou(a, b) { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { if (a[k] & b[k]) i++; if (a[k] | b[k]) u++; } return u ? i / u : 1; }
// 판정: static = 전부 거의 같음(걷지 않음, 재생성). twoPose = 1≈3·2≈4 — 참고용: 옆에서 본 정상 보행 주기(접지·통과·접지·통과)도 실루엣은 이렇게 나오므로 눈으로 확인한다
export function poseFlags(masks) {
  const n = masks.length, m = [];
  for (let a = 0; a < n; a++) { m.push([]); for (let b = 0; b < n; b++) m[a].push(a === b ? 1 : iou(masks[a], masks[b])); }
  const adj = []; for (let a = 0; a < n; a++) adj.push(m[a][(a + 1) % n]);
  const minAdj = Math.min(...adj);
  const flags = [];
  if (minAdj > 0.9) flags.push('static');
  if (n === 4 && m[0][2] > 0.8 && m[1][3] > 0.8 && Math.max(m[0][1], m[1][2], m[2][3], m[3][0]) < 0.75) flags.push('twoPose');
  return { matrix: m, adjacentMin: minAdj, flags };
}

// 칸의 실루엣(바운딩박스 안, 마스크 밖은 투명)을 RGBA 버퍼로
function cellRgba(raw, s) {
  const { data, W } = raw, { X0, Y0, w, keep } = s.mask;
  const out = Buffer.alloc(s.w * s.h * 4);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const sx = s.x0 + x, sy = s.y0 + y;
    if (!keep[(sy - Y0) * w + (sx - X0)]) continue;
    const i = (sy * W + sx) * 4, o = (y * s.w + x) * 4;
    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = data[i + 3];
  }
  return sharp(out, { raw: { width: s.w, height: s.h, channels: 4 } });
}

// 칸 목록을 안정화해 (cols × rows) 시트로 다시 굽는다. 출력 칸은 cell×cell 정사각, 캐릭터 합집합 상자가 칸의 fit 비율 안에 들어가도록 한 번에 같은 배율로 맞춘다 (원본이 작으면 최대 1.5배).
export async function repackSheet(raw, stats, cells, plan, { cols, rows, cell = 512, fit = 0.82 } = {}) {
  positiveInteger(cell, 'cell'); gridCells(cell * cols, cell * rows, { cols, rows });
  validateFrames(stats);
  if (cols * rows !== stats.length) throw new Error('output grid must match the frame count');
  const k = Math.min(1.5, (cell * fit) / Math.max(plan.bw, plan.bh));
  const bw = plan.bw * k, bh = plan.bh * k;
  const ox = (cell - bw) / 2, oy = cell * (1 - (1 - fit) / 2) - bh;     // 가로 가운데, 발은 칸 아래쪽 여백 위
  const layers = [];
  for (let j = 0; j < stats.length; j++) {
    const s = stats[j];
    const [cx, cy] = cells[j], f = plan.sc[j] * k;
    const w = Math.max(1, Math.round(s.w * f)), h = Math.max(1, Math.round(s.h * f));
    const buf = await cellRgba(raw, s).resize({ width: w, height: h, kernel: 'lanczos3' }).png().toBuffer();
    const col = j % cols, row = Math.floor(j / cols);
    const left = Math.round(col * cell + ox + ((s.x0 - cx) * plan.sc[j] + plan.dx[j] - plan.ux0) * k);
    const top = Math.round(row * cell + oy + ((s.y0 - cy) * plan.sc[j] + plan.dy[j] - plan.uy0) * k);
    layers.push({ input: buf, left: Math.max(0, left), top: Math.max(0, top) });
  }
  return sharp({ create: { width: cell * cols, height: cell * rows, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png();
}

// 정지컷: 칸 하나의 실루엣을 size² 캔버스에 fill 비율로 (발은 아래쪽, 가로 가운데)
export async function stillFromCell(raw, s, { size = 1024, fill = 0.8 } = {}) {
  positiveInteger(size, 'size'); validateFrames([s]);
  const k = Math.min(1.5, (size * fill) / Math.max(s.w, s.h));
  const w = Math.max(1, Math.round(s.w * k)), h = Math.max(1, Math.round(s.h * k));
  const buf = await cellRgba(raw, s).resize({ width: w, height: h, kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: buf, left: Math.round((size - w) / 2), top: Math.round(size * (1 - (1 - fill) / 2) - h) }]).png();
}

// 게임용 축소 + 256색 팔레트 (png-pack 과 같은 설정). width 기준.
export async function packPng(input, { width = null, colours = 256 } = {}) {
  let img = sharp(input);
  if (width) img = img.resize({ width, kernel: 'lanczos3' });
  return img.png({ compressionLevel: 9, palette: true, colours, quality: 90, effort: 10 }).toBuffer();
}
