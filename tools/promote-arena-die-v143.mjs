// Rebuild the corrected broken D6 arena sprite from the reviewed imagegen source.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const review = 'tools/art-review/dice-face-v143';
const source = `${review}/source-arena-prop-3.png`;
const previous = `${review}/previous-arena-prop-3.png`;
const target = 'casual/tiles/arena/prop-3.png';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await fs.readFile(source);
const previousBytes = await fs.readFile(previous);
const output = await sharp(sourceBytes).trim({ threshold: 8 })
  .resize(1024, 1024, { fit: 'contain', background: '#00000000' })
  .png({ palette: true, quality: 90, effort: 10 }).toBuffer();
const meta = await sharp(output).metadata();
if (meta.width !== 1024 || meta.height !== 1024 || !meta.hasAlpha) {
  throw new Error('Corrected die prop must be a 1024px transparent sprite');
}
await fs.writeFile(target, output);
await fs.writeFile(`${review}/promotion-arena.json`, JSON.stringify({
  generatedWith: 'Codex built-in image_gen', apiKeyUsed: false,
  source, sourceSha256: hash(sourceBytes), previous, previousSha256: hash(previousBytes),
  target, targetSha256: hash(output), width: meta.width, height: meta.height,
  hasAlpha: meta.hasAlpha, bytes: output.length,
}, null, 2) + '\n');
console.log('Promoted corrected arena D6 rubble.');
