// Re-encode the preserved built-in imagegen edits of the casual title art.
// Run from any working directory: node tools/art-review/title-d6-v143/promote.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const review = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(review, '../../..');
const outputs = [
  ['source-portrait.png', 'title-keyart-p.jpg', image => image.jpeg({ quality: 82, mozjpeg: true })],
  ['source-landscape.png', 'title-keyart-l.jpg', image => image.resize(1600, 900, { fit: 'cover' }).jpeg({ quality: 82, mozjpeg: true })],
  ['source-landscape.png', 'title-keyart-l-blur.jpg', image => image.resize(480, 270, { fit: 'cover' }).blur(12).jpeg({ quality: 70, mozjpeg: true })],
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const records = [];
for (const [source, name, transform] of outputs) {
  const input = path.join(review, source);
  const target = path.join(repo, 'ui', name);
  const sourceBytes = await fs.readFile(input);
  const outputBytes = await transform(sharp(sourceBytes)).toBuffer();
  await fs.writeFile(target, outputBytes);
  const { width, height } = await sharp(outputBytes).metadata();
  records.push({ source, sourceSha256: sha256(sourceBytes), target: `ui/${name}`,
    targetSha256: sha256(outputBytes), width, height, bytes: outputBytes.length });
  console.log(path.relative(repo, target));
}
await fs.writeFile(path.join(review, 'promotion.json'), JSON.stringify({
  generatedWith: 'Codex built-in image_gen', apiKeyUsed: false, records,
}, null, 2) + '\n');
