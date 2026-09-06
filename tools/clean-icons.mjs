// ui/icon-*.png 정리 — 시트에서 잘라낸 아이콘에 남은 마젠타 키 배경(아래 줄·가장자리 테두리)을 지우고,
// 내용을 가운데에 맞춰 64×64 로 다시 굽는다 (버튼 글자와 높이가 맞도록). 되돌릴 수 없으니 원본은 ui/icons-sheet.png 에 남는다.
//   node tools/clean-icons.mjs            ui/icon-*.png 를 덮어쓴다
//   node tools/clean-icons.mjs --dry      바뀔 내용만 출력
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const SIZE = 64, PAD = 3;   // 내용을 58×58 안에 맞춘다
// 마젠타 키 색: 빨강이 높고 초록이 낮고 파랑이 중간 (보라 보석은 파랑 > 빨강이라 걸리지 않는다)
const isKey = (r, g, b) => g < 0.45 * r && b > 0.45 * r && r >= b * 0.95 && r > 28;

for (const f of fs.readdirSync(path.join(ROOT, 'ui')).filter((n) => /^icon-.*\.png$/.test(n)).sort()) {
  const p = path.join(ROOT, 'ui', f);
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let keyed = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (data[o + 3] && isKey(data[o], data[o + 1], data[o + 2])) { data[o + 3] = 0; keyed++; }
  }
  // 내용 상자 (alpha > 24)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { console.log(f, '내용 없음 — 건너뜀'); continue; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const scale = Math.min((SIZE - PAD * 2) / cw, (SIZE - PAD * 2) / ch, 1.25);
  const nw = Math.round(cw * scale), nh = Math.round(ch * scale);
  console.log(f.padEnd(20), `키잉 ${String(keyed).padStart(4)}px  내용 ${x0},${y0}-${x1},${y1} (${cw}×${ch}) → ${nw}×${nh} 가운데`);
  if (DRY) continue;
  const cropped = await sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: cw, height: ch })
    .resize(nw, nh, { kernel: 'lanczos3' })
    .png().toBuffer();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cropped, left: Math.round((SIZE - nw) / 2), top: Math.round((SIZE - nh) / 2) }])
    .png({ compressionLevel: 9 }).toFile(p + '.tmp');
  fs.renameSync(p + '.tmp', p);
}
