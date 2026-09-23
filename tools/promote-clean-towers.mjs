// Rebuild the reviewed, plant-free tower variants from their saved imagegen outputs.
// No API key or image-generation call is needed to reproduce the runtime sprites.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const review = 'tools/art-review/plant-free-2026-09-23';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const records = [];

for (let face = 1; face <= 6; face++) {
  const source = `${review}/tower-${face}.png`;
  const reference = `casual/towers/t${face}-a.png`;
  const target = `casual/towers/t${face}-clean.png`;
  const sourceBytes = await fs.readFile(source);
  const referenceBytes = await fs.readFile(reference);
  const output = await sharp(sourceBytes)
    .trim({ threshold: 8 })
    .resize({ width: 140, height: 192, fit: 'inside' })
    .png({ palette: true, quality: 100, effort: 10 })
    .toBuffer();
  const info = await sharp(output).metadata();
  if (!info.hasAlpha || info.width > 140 || info.height > 192 || info.height < 125) {
    throw new Error(`${target}: invalid transparent sprite size`);
  }
  await fs.writeFile(target, output);
  records.push({ face, source, sourceSha256: hash(sourceBytes), reference,
    referenceSha256: hash(referenceBytes), target, targetSha256: hash(output),
    width: info.width, height: info.height, bytes: output.length });
}

await fs.writeFile(`${review}/promotion.json`, JSON.stringify({
  generatedWith: 'Codex built-in image_gen', apiKeyUsed: false,
  styleDirection: 'plant-free, fewer seams, broad two-tone casual planes',
  records,
}, null, 2) + '\n');
console.log(`Promoted ${records.length} plant-free tower variants.`);
