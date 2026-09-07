// 2×2 걷기 시트 검사 + 정지컷 자르기.
//   node tools/sheet-check.mjs gen/inf/w001-walk-1.png            네 칸의 캐릭터 바운딩박스(투명·연회색 키잉 기준)와 편차 보고
//   node tools/sheet-check.mjs <sheet> --sheet-out=casual/enemies/inf/w001-walk-2x2.png [--still-out=casual/enemies/inf/w001.png]
//   편차: 칸마다 캐릭터 높이·발 위치(바닥 y)가 평균에서 8% 넘게 어긋나면 경고 (게임은 칸 = w/2·h/2 로 자르고 발 위치를 기준으로 그린다)
import fs from 'node:fs';
import sharp from 'sharp';

const file = process.argv[2];
const opt = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
if (!file) { console.error('usage: node tools/sheet-check.mjs <sheet.png> [--sheet-out=…] [--still-out=…]'); process.exit(2); }
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, cw = W / 2, ch = H / 2;
// 배경 판정: 투명(α≤150) 또는 연회색·마젠타 (game.js isKeyPixel 과 같은 규칙)
const isBg = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]; if (a <= 150) return true; if (r > 180 && g < 90 && b > 80 && r - g > 80) return true; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), avg = (r + g + b) / 3; return avg > 185 && avg < 250 && mx - mn < 22; };
const cells = [];
for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
  let minX = W, minY = H, maxX = -1, maxY = -1, n = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = ((cy * ch + y) * W + (cx * cw + x)) * 4; if (!isBg(i)) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
  cells.push({ cell: cy * 2 + cx + 1, w: maxX - minX + 1, h: maxY - minY + 1, foot: maxY, cx: (minX + maxX) / 2, fill: +(n / (cw * ch)).toFixed(3) });
}
const mean = (k) => cells.reduce((s, c) => s + c[k], 0) / 4;
const mh = mean('h'), mf = mean('foot');
let warn = 0;
for (const c of cells) {
  const dh = Math.abs(c.h - mh) / mh, df = Math.abs(c.foot - mf) / ch;
  const bad = dh > 0.08 || df > 0.08 || c.fill < 0.04 || c.w > cw * 0.96 || c.h > ch * 0.96;
  if (bad) warn++;
  console.log(`칸 ${c.cell}: 폭 ${c.w} 높이 ${c.h} 발 y ${c.foot} 중심 x ${c.cx.toFixed(0)} 채움 ${c.fill}${bad ? '  ← 경고 (높이 편차 ' + (dh * 100).toFixed(1) + '% · 발 편차 ' + (df * 100).toFixed(1) + '%)' : ''}`);
}
// 테두리가 배경인지 (키잉이 통째로 먹히는지)
let edgeBg = 0, edgeN = 0;
for (let x = 0; x < W; x += 4) { edgeN += 2; if (isBg((0 * W + x) * 4)) edgeBg++; if (isBg(((H - 1) * W + x) * 4)) edgeBg++; }
console.log(`테두리 배경 비율 ${(edgeBg / edgeN * 100).toFixed(0)}% · ${W}×${H} · 경고 ${warn}칸`);
const so = opt('sheet-out'), st = opt('still-out');
if (so) { fs.mkdirSync(so.replace(/\/[^/]+$/, ''), { recursive: true }); await sharp(file).png().toFile(so); console.log('→', so); }
if (st) { fs.mkdirSync(st.replace(/\/[^/]+$/, ''), { recursive: true }); await sharp(file).extract({ left: 0, top: 0, width: Math.floor(cw), height: Math.floor(ch) }).resize({ width: 1024, height: 1024, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(st); console.log('→', st, '(칸 1)'); }
process.exit(warn ? 1 : 0);
