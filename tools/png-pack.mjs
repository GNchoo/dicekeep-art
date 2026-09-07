// 생성 PNG 를 게임용으로 줄인다: 지정 크기로 리사이즈 + 256색 팔레트 양자화 (1024² 시트 2.2MB → 약 350KB, 알파 유지).
//   node tools/png-pack.mjs --size=512 casual/enemies/inf/w001.png …          정지컷 (게임은 시트가 없을 때만 그린다)
//   node tools/png-pack.mjs --size=1024 casual/enemies/inf/w001-walk-2x2.png … 걷기 시트 (칸 512 — 화면 60px 높이·3배 DPR 에 충분)
// 제자리에서 덮어쓴다. 원본은 gen/ 에 남아 있다.
import fs from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const size = +opt('size', 0), colours = +opt('colours', 256);
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) { console.error('usage: node tools/png-pack.mjs [--size=512] [--colours=256] <png…>'); process.exit(2); }
for (const f of files) {
  const before = fs.statSync(f).size;
  let img = sharp(f);
  if (size) img = img.resize({ width: size, height: size, fit: 'inside', kernel: 'lanczos3' });
  const buf = await img.png({ compressionLevel: 9, palette: true, colours, quality: 90, effort: 10 }).toBuffer();
  fs.writeFileSync(f, buf);
  const m = await sharp(buf).metadata();
  console.log(`${f}: ${Math.round(before / 1024)}KB → ${Math.round(buf.length / 1024)}KB (${m.width}×${m.height})`);
}
