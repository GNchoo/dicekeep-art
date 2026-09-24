// Promote the reviewed entrance and goal sprites. No image API call is made.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const review = 'tools/art-review/arena-portals-v142';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const records = [];

for (const name of ['start', 'end']) {
  const source = `${review}/source-${name}.png`;
  const original = `${review}/originals/${name}.png`;
  const target = `casual/tiles/arena/${name}.png`;
  const sourceBytes = await fs.readFile(source);
  const originalBytes = await fs.readFile(original);
  const { width, height } = await sharp(originalBytes).metadata();
  const output = await sharp(sourceBytes).trim({ threshold: 8 })
    .resize(width, height, { fit: 'contain', position: 'bottom', background: '#00000000' })
    .png({ palette: true, quality: 90, effort: 10 }).toBuffer();
  const metadata = await sharp(output).metadata();
  if (metadata.width !== width || metadata.height !== height || !metadata.hasAlpha) {
    throw new Error(`${target}: expected ${width}x${height} RGBA sprite`);
  }
  await fs.writeFile(target, output);
  records.push({ source, sourceSha256: sha256(sourceBytes), original, originalSha256: sha256(originalBytes),
    target, targetSha256: sha256(output), width, height, hasAlpha: true, bytes: output.length });
}

await fs.writeFile(`${review}/promotion.json`, JSON.stringify({
  generatedWith: 'Codex built-in image_gen', apiKeyUsed: false, records,
}, null, 2) + '\n');
console.log(`Promoted ${records.length} casual arena portal sprites.`);
