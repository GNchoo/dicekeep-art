// 생성한 키아트 원본 두 장 → 게임이 쓰는 세 파일. (게임 쪽 연결: game.js KEYART · index.html preload · style.css #overlay.title)
//   node tools/keyart-build.mjs --portrait=gen/keyart/portrait-1.png --landscape=gen/keyart/landscape-1.png [--v=90]
//   ui/title-keyart-p.jpg      세로: 1400 폭, 아래 22% 를 #0d0b09 로 페이드 (UI 자리)
//   ui/title-keyart-l.jpg      가로: 2400×1000 — 가운데 그림 높이 맞춤 + 양옆은 같은 그림을 흐리고 어둡게 + 120px 페더 (CSS 는 auto 100%)
//   ui/title-keyart-l-blur.jpg 초광폭용 밑바탕 480px (CSS 세 번째 겹, cover)
import fs from 'node:fs';
import sharp from 'sharp';

const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const P = opt('portrait'), L = opt('landscape');
if (!P || !L) { console.error('usage: node tools/keyart-build.mjs --portrait=<png> --landscape=<png>'); process.exit(2); }
const DARK = '#0d0b09';

// ---- 세로
{
  const src = sharp(P); const m = await src.metadata();
  const W = 1400, H = Math.round(m.height * W / m.width);
  const fadeH = Math.round(H * 0.22);
  const grad = Buffer.from(`<svg width="${W}" height="${fadeH}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${DARK}" stop-opacity="0"/><stop offset="0.6" stop-color="${DARK}" stop-opacity="0.85"/><stop offset="1" stop-color="${DARK}" stop-opacity="1"/></linearGradient></defs><rect width="${W}" height="${fadeH}" fill="url(#g)"/></svg>`);
  await sharp(P).resize({ width: W }).composite([{ input: grad, left: 0, top: H - fadeH }]).jpeg({ quality: 82, mozjpeg: true }).toFile('ui/title-keyart-p.jpg');
  console.log('ui/title-keyart-p.jpg', W, H);
}
// ---- 가로 (페더 합성)
{
  const H = 1000, W = 2400, F = 120;
  const m = await sharp(L).metadata();
  const pw = Math.round(m.width * H / m.height);
  const base = await sharp(L).resize({ width: W, height: H, fit: 'cover' }).blur(22).modulate({ brightness: 0.55, saturation: 0.8 }).png().toBuffer();
  const pic = await sharp(L).resize({ width: pw, height: H }).ensureAlpha().png().toBuffer();
  const mask = Buffer.from(`<svg width="${pw}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${(F / pw).toFixed(4)}" stop-color="#fff" stop-opacity="1"/><stop offset="${(1 - F / pw).toFixed(4)}" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="${pw}" height="${H}" fill="url(#g)"/></svg>`);
  const feathered = await sharp(pic).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const wide = await sharp(base).composite([{ input: feathered, left: Math.round((W - pw) / 2), top: 0 }]).png().toBuffer();
  await sharp(wide).jpeg({ quality: 80, mozjpeg: true }).toFile('ui/title-keyart-l.jpg');
  await sharp(wide).resize({ width: 480 }).blur(6).jpeg({ quality: 70, mozjpeg: true }).toFile('ui/title-keyart-l-blur.jpg');
  console.log('ui/title-keyart-l.jpg', W, H, '(그림 폭', pw, ')', '· ui/title-keyart-l-blur.jpg');
}
for (const f of ['ui/title-keyart-p.jpg', 'ui/title-keyart-l.jpg', 'ui/title-keyart-l-blur.jpg']) console.log(f, Math.round(fs.statSync(f).size / 1024) + 'KB');
console.log('다음: index.html preload 와 game.js KEYART 의 ?v= 를 올리세요');
