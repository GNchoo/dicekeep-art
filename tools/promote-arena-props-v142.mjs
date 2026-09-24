// Promote the reviewed built-in imagegen paintings for the shared arena props.
// Source paintings and the previous runtime files remain in art-review.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const review = 'tools/art-review/arena-props-v142';
const names = ['pad', 'prop-1', 'prop-2', 'prop-3'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const records = [];

for (const name of names) {
  // Keep the approved D6 face correction when rebuilding the older prop pack.
  const source = name === 'prop-3'
    ? 'tools/art-review/dice-face-v143/source-arena-prop-3.png'
    : `${review}/source-${name}.png`;
  const original = `${review}/originals/${name}.png`;
  const target = `casual/tiles/arena/${name}.png`;
  const sourceBytes = await fs.readFile(source);
  const originalBytes = await fs.readFile(original);
  const output = await sharp(sourceBytes).trim({ threshold: 8 })
    .resize(1024, 1024, { fit: 'contain', background: '#00000000' })
    .png({ palette: true, quality: 90, effort: 10 }).toBuffer();
  const meta = await sharp(output).metadata();
  if (meta.width !== 1024 || meta.height !== 1024 || !meta.hasAlpha) {
    throw new Error(`${name}: expected 1024px transparent runtime sprite`);
  }
  await fs.writeFile(target, output);
  records.push({ name, source, sourceSha256: sha256(sourceBytes), original,
    originalSha256: sha256(originalBytes), target, targetSha256: sha256(output),
    width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha, bytes: output.length });
}

await fs.writeFile(`${review}/promotion.json`, JSON.stringify({
  generatedWith: 'Codex built-in image_gen', apiKeyUsed: false, records,
}, null, 2) + '\n');
console.log(`Promoted ${records.length} simplified arena props.`);
