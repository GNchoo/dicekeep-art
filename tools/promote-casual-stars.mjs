// Rebuild the reviewed 7–20★ casual sprites from saved imagegen outputs.
// Generation is intentionally separate: promotion itself needs no API call.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const review = 'tools/art-review/star-casual-2026-09-23';
const partial = process.argv.includes('--partial');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const records = [];

for (let face = 7; face <= 20; face++) {
  const n = String(face).padStart(2, '0');
  const source = `${review}/clean-${n}.png`;
  let sourceBytes;
  try { sourceBytes = await fs.readFile(source); }
  catch (error) { if (partial && error.code === 'ENOENT') continue; throw error; }
  const reference = `casual/towers/star-${n}.png`;
  const target = `casual/towers/star-${n}-casual.png`;
  const referenceBytes = await fs.readFile(reference);
  const output = await sharp(sourceBytes)
    .trim({ threshold: 8 })
    .resize({ width: 140, height: 192, fit: 'inside' })
    .png({ palette: true, quality: 100, effort: 10 })
    .toBuffer();
  const info = await sharp(output).metadata();
  if (!info.hasAlpha || info.width > 140 || info.height > 192 || info.height < 140) {
    throw new Error(`${target}: invalid transparent sprite size`);
  }
  await fs.writeFile(target, output);
  records.push({ face, source, sourceSha256: hash(sourceBytes), reference,
    referenceSha256: hash(referenceBytes), target, targetSha256: hash(output),
    width: info.width, height: info.height, bytes: output.length });
}

if (!partial && records.length !== 14) throw new Error(`Expected 14 selected sources, got ${records.length}`);
await fs.writeFile(`${review}/promotion.json`, JSON.stringify({
  generatedWith: 'Codex built-in image_gen', apiKeyUsed: false,
  styleDirection: 'plant-free, simplified broad two-tone casual star towers',
  records,
}, null, 2) + '\n');
console.log(`Promoted ${records.length}/14 casual star towers.`);
