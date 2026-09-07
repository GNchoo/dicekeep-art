// 걷기 시트 검사 · 안정화 · 정지컷 자르기.
//   node tools/sheet-check.mjs gen/inf/w001-walk-1.png                       칸별 실루엣(높이·발 y·무게중심 x·넓이)과 편차, 자세 판정
//   node tools/sheet-check.mjs <sheet> --sheet-out=casual/enemies/inf/w001-walk-2x2.png     안정화(발 기준선·중심축·크기 ±15%)해서 다시 굽는다
//   node tools/sheet-check.mjs <sheet> --sheet-out=… --raw                    안정화 없이 원본 그대로 저장 (예전 방식)
//   node tools/sheet-check.mjs <sheet> --still-out=casual/enemies/inf/w001.png   1칸(접지 자세)을 1024² 정지컷으로
//   --grid=3x2   열×행 (기본: 파일명의 -walk-NxM, 없으면 2x2)   --cell=512 출력 칸 크기   --pack 저장하면서 256색 팔레트로   --no-clean 경계 조각 제거 끄기
//   --anchor=center   날것: 발끝 대신 무게중심 y 로 맞춤 (기본 foot)
//   --background=checkerboard   불투명 흰색·연회색 체크무늬 입력에만 사용 (기본 runtime). --grid=1x1 --still-out 은 정지컷 추출.
//   --background-seeds=<JSON 파일 또는 [[x,y],...]>   눈으로 확인한 닫힌 배경 틈만 추가 제거. checkerboard 전용.
// 경고: 안정화 전 편차가 높이 8%·발 8%·중심 8% 를 넘으면 표시 (게임이 알아서 맞추므로 참고용). 자세 판정 static(안 걷음)은 재생성 대상, twoPose(1≈3·2≈4)는 참고용(정상 주기도 그렇게 나온다 — 눈으로 확인).
// 종료 코드: 비었거나 static 인 걷기 시트·잘못된 입력 1, 통과 0. 실패한 시트는 저장하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { loadRaw, readBackgroundSeeds, parseGrid, gridCells, positiveInteger, validateFrames, analyzeCell, stabilizePlan, driftReport, poseMasks, poseFlags, repackSheet, stillFromCell, packPng } from './lib/sheet.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = (k) => args.includes(`--${k}`);
if (!file) { console.error('usage: node tools/sheet-check.mjs <sheet.png> [--grid=2x2] [--sheet-out=…] [--still-out=…] [--raw] [--cell=512] [--pack]'); process.exit(2); }

const cell = positiveInteger(+opt('cell', 512), 'cell');
const explicitGrid = opt('grid');
const grid = explicitGrid === null ? parseGrid(path.basename(file)) : parseGrid(explicitGrid, null);
const raw = await loadRaw(file, { background: opt('background', 'runtime'), backgroundSeeds: readBackgroundSeeds(opt('background-seeds'), file) });
const { fw, fh, cells } = gridCells(raw.W, raw.H, grid);
const stats = cells.map(([cx, cy]) => analyzeCell(raw, cx, cy, fw, fh, { clean: !has('no-clean') }));
validateFrames(stats);
const anchor = opt('anchor', 'foot');
const plan = stabilizePlan(stats, cells, { anchor });
const rep = driftReport(stats, cells, plan, fh);
let warn = 0;
stats.forEach((s, i) => {
  const bad = s.fill < 0.03 || s.w > fw * 0.96 || s.h > fh * 0.96;
  if (bad) warn++;
  console.log(`칸 ${i + 1}: 폭 ${s.w} 높이 ${s.h} 발 y ${s.y1 - cells[i][1]} 중심 x ${(s.mx - cells[i][0]).toFixed(0)} 넓이 ${s.n} 채움 ${s.fill.toFixed(3)} → 배율 ${plan.sc[i].toFixed(3)} 이동 (${plan.dx[i].toFixed(0)}, ${plan.dy[i].toFixed(0)})${s.dropped ? ` 경계 조각 ${s.dropped}px 제거` : ''}${bad ? '  ← 경고 (비었거나 칸 경계에 닿음)' : ''}`);
});
const pct = (v) => (v * 100).toFixed(1) + '%';
console.log(`편차(안정화 전): 높이 ${pct(rep.before.h)}(자세 차이 포함) · ${anchor === 'center' ? '무게중심 y' : '발 y'} ${pct(anchor === 'center' ? rep.before.cy : rep.before.foot)} · 중심 x ${pct(rep.before.cx)}${(anchor === 'center' ? rep.before.cy : rep.before.foot) > 0.08 || rep.before.cx > 0.08 ? '  ← 흔들림 (게임·--sheet-out 이 맞춤)' : ''}`);
const masks = poseMasks(stats, cells, plan);
const pose = poseFlags(masks);
if (stats.length === 1) pose.flags = []; // A still has no walk cycle to classify.
const mat = pose.matrix.map((r) => r.map((v) => v.toFixed(2)).join(' ')).join(' | ');
console.log(`자세 IoU [${mat}] 이웃 최소 ${pose.adjacentMin.toFixed(2)}${pose.flags.length ? '  ← ' + pose.flags.map((f) => f === 'static' ? '거의 안 움직임 (재생성)' : '1≈3·2≈4 (정상 주기도 이렇게 나옴 — 눈으로 확인)').join(', ') : stats.length === 1 ? '  · 정지컷 1장 (보행 판정 제외)' : '  · 보행 주기로 보임'}`);
console.log(`${raw.W}×${raw.H} · ${grid.cols}x${grid.rows} · 기준 ${anchor} · 합집합 상자 ${plan.bw}×${plan.bh} · 경고 ${warn}칸`);
if (stats.length > 1 && pose.flags.includes('static')) { console.error('static 걷기 시트 — 저장하지 않음 (다시 뽑을 것)'); process.exit(1); }

const so = opt('sheet-out'), st = opt('still-out');
if (so && has('raw') && raw.background === 'checkerboard') throw new Error('--raw cannot remove checkerboard; omit --raw to publish a transparent sheet');
if (so) {
  fs.mkdirSync(path.dirname(so), { recursive: true });
  if (has('raw')) fs.copyFileSync(file, so);
  else {
    const img = await repackSheet(raw, stats, cells, plan, { cols: grid.cols, rows: grid.rows, cell });
    fs.writeFileSync(so, has('pack') ? await packPng(await img.toBuffer()) : await img.toBuffer());
  }
  console.log('→', so, has('raw') ? '(원본 그대로)' : `(안정화, 칸 ${cell})`);
}
if (st) {
  fs.mkdirSync(path.dirname(st), { recursive: true });
  const img = await stillFromCell(raw, stats[0]);
  fs.writeFileSync(st, has('pack') ? await packPng(await img.toBuffer(), { width: 512 }) : await img.toBuffer());
  console.log('→', st, '(칸 1)');
}
process.exit(0);
