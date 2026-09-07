// 여러 몬스터를 한 장에 뽑은 시트(행 = 몬스터, 열 = 프레임)를 몬스터별 걷기 시트 + 정지컷으로 나눈다.
//   node tools/sheet-split.mjs gen/inf/t1-06-09-1.png --rows=w006,w007,w008,w009 [--cols=4] [--out-dir=casual/enemies/inf] [--cell=512] [--pack] [--dry]
// 행마다: 칸 통계 → 안정화(발 기준선·중심축·크기 ±15%) → 4프레임은 2x2 · 6프레임은 3x2 · 8프레임은 4x2 로 다시 굽는다 → <id>-walk-<열>x<행>.png
//         정지컷은 1칸(접지 자세) → <id>.png (1024², --pack 이면 512²). 자세 판정(static·twoPose)이 뜬 행은 그 행만 다시 뽑는다.
// 한 장(1024×1536)에 5행 × 4열이면 칸이 256×307 — 게임은 42~58px(3배 DPR 174px)로 그리므로 충분하다. --cell 은 출력 칸 크기(기본 512, 원본 칸이 작으면 최대 1.5배까지만 키운다).
import fs from 'node:fs';
import path from 'node:path';
import { loadRaw, analyzeCell, stabilizePlan, driftReport, poseMasks, poseFlags, repackSheet, stillFromCell, packPng } from './lib/sheet.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = (k) => args.includes(`--${k}`);
const ids = (opt('rows') || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!file || !ids.length) { console.error('usage: node tools/sheet-split.mjs <multi.png> --rows=w006,w007,… [--cols=4] [--out-dir=casual/enemies/inf] [--cell=512] [--pack] [--dry]'); process.exit(2); }
const cols = +opt('cols', 4), outDir = opt('out-dir', 'casual/enemies/inf'), cell = +opt('cell', 512);
const outGrid = { 4: [2, 2], 6: [3, 2], 8: [4, 2] }[cols] || [cols, 1];

const raw = await loadRaw(file);
const rows = ids.length, fw = raw.W / cols, fh = raw.H / rows;
console.log(`${file}: ${raw.W}×${raw.H} → ${rows}행 × ${cols}열, 원본 칸 ${Math.round(fw)}×${Math.round(fh)}, 출력 ${outGrid[0]}x${outGrid[1]} (칸 ${cell})`);
let bad = 0;
for (let r = 0; r < rows; r++) {
  const id = ids[r];
  const cells = []; for (let c = 0; c < cols; c++) cells.push([c * fw, r * fh]);
  const stats = cells.map(([cx, cy]) => analyzeCell(raw, cx, cy, fw, fh));
  if (stats.some((s) => s.fill < 0.02)) { console.log(`행 ${r + 1} ${id}: 빈 칸이 있음 — 건너뜀 (다시 뽑을 것)`); bad++; continue; }
  const plan = stabilizePlan(stats, cells);
  const rep = driftReport(stats, cells, plan, fh);
  const pose = poseFlags(poseMasks(stats, cells, plan));
  const pct = (v) => (v * 100).toFixed(0) + '%';
  console.log(`행 ${r + 1} ${id}: 편차 높이 ${pct(rep.before.h)} 발 ${pct(rep.before.foot)} 중심 ${pct(rep.before.cx)} · 배율 [${plan.sc.map((v) => v.toFixed(2)).join(' ')}] · 자세 이웃 IoU 최소 ${pose.adjacentMin.toFixed(2)}${pose.flags.length ? ' ← ' + pose.flags.join(',') + ' (다시 뽑을 것)' : ''}`);
  if (pose.flags.length) bad++;
  if (has('dry')) continue;
  fs.mkdirSync(outDir, { recursive: true });
  const sheetOut = path.join(outDir, `${id}-walk-${outGrid[0]}x${outGrid[1]}.png`);
  const sheet = await repackSheet(raw, stats, cells, plan, { cols: outGrid[0], rows: outGrid[1], cell });
  fs.writeFileSync(sheetOut, has('pack') ? await packPng(await sheet.toBuffer()) : await sheet.toBuffer());
  const stillOut = path.join(outDir, `${id}.png`);
  const still = await stillFromCell(raw, stats[0]);
  fs.writeFileSync(stillOut, has('pack') ? await packPng(await still.toBuffer(), { width: 512 }) : await still.toBuffer());
  console.log(`   → ${sheetOut} · ${stillOut}`);
}
process.exit(bad ? 1 : 0);
