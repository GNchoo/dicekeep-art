// 앱 아이콘·스플래시 자리표시 그림 생성 (sharp). 진짜 그림은 같은 파일명으로 resources/ 에 덮어쓰면 된다 (resources/README.md).
//   node tools/make-resources.mjs  →  resources/icon-only.png · icon-foreground.png · icon-background.png · splash.png · splash-dark.png
// 그 다음: npx @capacitor/assets generate --android --ios --assetPath resources --iconBackgroundColor '#1a140d' --iconBackgroundColorDark '#1a140d' --splashBackgroundColor '#0d0b09' --splashBackgroundColorDark '#0d0b09'
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'resources');
const GOLD = path.join(ROOT, 'ui', 'gold.png');
fs.mkdirSync(OUT, { recursive: true });

const ICON_BG = { r: 0x1a, g: 0x14, b: 0x0d, alpha: 1 };
const SPLASH_BG = { r: 0x0d, g: 0x0b, b: 0x09, alpha: 1 };

async function compose(size, bg, glyphPx, name) {
  const glyph = await sharp(GOLD).resize(glyphPx, glyphPx, { fit: 'inside', withoutEnlargement: false }).png().toBuffer();
  const meta = await sharp(glyph).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: glyph, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png().toFile(path.join(OUT, name));
  console.log('resources/' + name, `${size}x${size}`);
}

await compose(1024, ICON_BG, Math.round(1024 * 0.6), 'icon-only.png');                       // 일반 아이콘
await compose(1024, { r: 0, g: 0, b: 0, alpha: 0 }, Math.round(1024 * 0.66 * 0.8), 'icon-foreground.png'); // 적응형 전경 (안전 영역 66% 안)
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: ICON_BG } }).png().toFile(path.join(OUT, 'icon-background.png'));
console.log('resources/icon-background.png 1024x1024');
await compose(2732, SPLASH_BG, 400, 'splash.png');
await compose(2732, SPLASH_BG, 400, 'splash-dark.png');
