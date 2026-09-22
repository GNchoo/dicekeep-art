// Reproduce the first casual pilot from preserved built-in ImageGen sources.
// No API calls. Run from the repository root after installing dependencies.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const source = 'tools/art-review/casual-pilot-2026-09-23';
const outputs = [];
async function write(input, target, transform) {
  const bytes = await transform(sharp(`${source}/${input}`)).toBuffer();
  await fs.writeFile(target, bytes);
  const {width, height, hasAlpha} = await sharp(bytes).metadata();
  outputs.push({source: input, target, width, height, hasAlpha,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
}
await write('keyart/portrait-candidate-1.png', 'ui/title-keyart-p.jpg', p => p.jpeg({quality: 82, mozjpeg: true}));
await write('keyart/landscape-candidate-1.png', 'ui/title-keyart-l.jpg', p => p.resize(1600, 900, {fit: 'cover'}).jpeg({quality: 82, mozjpeg: true}));
await write('keyart/landscape-candidate-1.png', 'ui/title-keyart-l-blur.jpg', p => p.resize(480, 270, {fit: 'cover'}).blur(12).jpeg({quality: 70, mozjpeg: true}));
for (const target of ['towers/die-1.png', 'casual/towers/t1-a.png']) {
  await write('tower/die-1-candidate-1.png', target, p => p.trim({threshold: 8}).resize({height: 384, width: 242, fit: 'inside'}).png({palette: true, quality: 95}));
}
await write('ui/mail-candidate-1.png', 'ui/rewards/mail.webp', p => p.resize(512, 512).webp({quality: 90, alphaQuality: 100}));
await fs.writeFile(`${source}/promotion.json`, JSON.stringify({
  schemaVersion: 1,
  generatedWith: 'Codex built-in image_gen',
  apiKeyUsed: false,
  outputs,
  deferred: [
    {file: 'character/ground-biped-candidate-1.png', reason: 'Matching walk frames and foot pivot validation required; preserve current animated enemy.'},
    {file: 'vfx/muzzle-flash-candidate-1.png', reason: 'Directional origin and renderer rotation need validation.'},
    {file: 'environment/arena-board-candidate-1.png', reason: 'Rejected: visible repeating seams.'},
  ],
}, null, 2) + '\n');
console.log(`Promoted ${outputs.length} runtime files. Run npm run art:manifest next.`);
