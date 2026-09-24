// Rebuild the reviewed v126 arena surfaces. The placement pad was superseded
// in v142 and is promoted separately by promote-arena-props-v142.mjs.
// The original v123 runtime art is kept in the review folder. No API call is made.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const review = 'tools/art-review/arena-clean-2026-09-23';
const jobs = [
  { name: 'floor', ext: 'jpg', width: 1280, height: 720, background: '#514968' },
  { name: 'board', ext: 'png', width: 1024, height: 1024, background: '#433c58' },
  { name: 'road', ext: 'png', width: 1024, height: 1024, background: '#efe1c7', repeat: true },
];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Source paintings are not guaranteed to meet exactly at a repeat boundary.
// Feather only the outer 32 source pixels; the road repeats at 160px.
function closeRepeatEdges(input, width, height, channels = 3, feather = 32) {
  const output = Buffer.from(input);
  for (let y = 0; y < height; y++) for (let c = 0; c < channels; c++) {
    const left = (y * width) * channels + c;
    const right = (y * width + width - 1) * channels + c;
    const edge = Math.round((input[left] + input[right]) / 2);
    for (let d = 0; d < feather; d++) {
      const amount = (feather - 1 - d) / (feather - 1);
      const l = (y * width + d) * channels + c;
      const r = (y * width + width - 1 - d) * channels + c;
      output[l] = Math.round(input[l] * (1 - amount) + edge * amount);
      output[r] = Math.round(input[r] * (1 - amount) + edge * amount);
    }
  }
  const horizontal = Buffer.from(output);
  for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
    const top = x * channels + c;
    const bottom = ((height - 1) * width + x) * channels + c;
    const edge = Math.round((horizontal[top] + horizontal[bottom]) / 2);
    for (let d = 0; d < feather; d++) {
      const amount = (feather - 1 - d) / (feather - 1);
      const t = (d * width + x) * channels + c;
      const b = ((height - 1 - d) * width + x) * channels + c;
      output[t] = Math.round(horizontal[t] * (1 - amount) + edge * amount);
      output[b] = Math.round(horizontal[b] * (1 - amount) + edge * amount);
    }
  }
  return output;
}

const records = [];
for (const job of jobs) {
  const source = `${review}/source-${job.name}.png`;
  const original = `${review}/originals/${job.name}.${job.ext}`;
  const target = `casual/tiles/arena/${job.name}.${job.ext}`;
  const sourceBytes = await fs.readFile(source);
  const originalBytes = await fs.readFile(original);
  let output;
  if (job.alpha) {
    output = await sharp(sourceBytes).trim({ threshold: 8 })
      .resize(job.width, job.height, { fit: 'contain', background: '#00000000' })
      .png({ palette: true, quality: 90, effort: 10 }).toBuffer();
  } else {
    const opaque = sharp(sourceBytes).resize(job.width, job.height, { fit: 'cover' })
      .flatten({ background: job.background });
    if (job.repeat) {
      const pixels = await opaque.removeAlpha().raw().toBuffer();
      const closed = closeRepeatEdges(pixels, job.width, job.height);
      output = await sharp(closed, { raw: { width: job.width, height: job.height, channels: 3 } })
        .png({ palette: true, quality: 90, effort: 10 }).toBuffer();
    } else if (job.ext === 'png') {
      output = await opaque.png({ palette: true, quality: 90, effort: 10 }).toBuffer();
    } else {
      output = await opaque.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    }
  }
  const metadata = await sharp(output).metadata();
  if (metadata.width !== job.width || metadata.height !== job.height || Boolean(metadata.hasAlpha) !== Boolean(job.alpha)) {
    throw new Error(`${target}: unexpected dimensions or alpha`);
  }
  await fs.writeFile(target, output);
  records.push({ source, sourceSha256: sha256(sourceBytes), original, originalSha256: sha256(originalBytes),
    target, targetSha256: sha256(output), width: metadata.width, height: metadata.height,
    hasAlpha: Boolean(metadata.hasAlpha), bytes: output.length });
}
await fs.writeFile(`${review}/promotion.json`, JSON.stringify({
  generatedWith: 'Codex built-in image_gen', apiKeyUsed: false,
  seamFeatherSourcePixels: 32, records,
}, null, 2) + '\n');
console.log(`Promoted ${records.length} simplified Infinity arena surfaces.`);
