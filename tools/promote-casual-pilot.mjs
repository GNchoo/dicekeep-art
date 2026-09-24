// Reproduce the first casual pilot from preserved built-in ImageGen sources.
// No API calls. Run from the repository root after installing dependencies.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

// This historical replay also rewrites the first tower skin. Require an explicit
// flag so title-only work cannot accidentally restore that older tower.
if (!process.argv.includes('--replay-legacy-pilot')) {
  throw new Error('Historical pilot replay rewrites the older tower skin. For the current title art run tools/art-review/title-d6-v143/promote.mjs; add --replay-legacy-pilot only to intentionally restore the legacy pilot.');
}

const source = 'tools/art-review/casual-pilot-2026-09-23';
const outputs = [];
async function writeFrom(input, target, transform) {
  const bytes = await transform(sharp(input)).toBuffer();
  await fs.writeFile(target, bytes);
  const {width, height, hasAlpha} = await sharp(bytes).metadata();
  outputs.push({source: input, target, width, height, hasAlpha,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
}
const write = (input, target, transform) => writeFrom(`${source}/${input}`, target, transform);
// Keep the current corrected D6 faces when replaying the original casual pilot.
const title = 'tools/art-review/title-d6-v143';
await writeFrom(`${title}/source-portrait.png`, 'ui/title-keyart-p.jpg', p => p.jpeg({quality: 82, mozjpeg: true}));
await writeFrom(`${title}/source-landscape.png`, 'ui/title-keyart-l.jpg', p => p.resize(1600, 900, {fit: 'cover'}).jpeg({quality: 82, mozjpeg: true}));
await writeFrom(`${title}/source-landscape.png`, 'ui/title-keyart-l-blur.jpg', p => p.resize(480, 270, {fit: 'cover'}).blur(12).jpeg({quality: 70, mozjpeg: true}));
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
