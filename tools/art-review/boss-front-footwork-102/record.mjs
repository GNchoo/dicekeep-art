import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { sha256 } from '../../lib/directional-rig.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const review = path.dirname(fileURLToPath(import.meta.url)), out = path.join(review, 'evidence');
fs.mkdirSync(out, { recursive: true });
const groups = ['middle', 'late', 'extreme'], all = [], records = [];
for (const group of groups) {
  const dir = path.join(repo, 'gen/boss-front-footwork', group);
  const qa = JSON.parse(fs.readFileSync(path.join(dir, 'directional-qa.json')));
  for (const name of ['directional-qa.json', 'directional-art.json', 'directional-validation.json', 'directional-moving-qa.json']) {
    const bytes = fs.readFileSync(path.join(dir, name)), compressed = gzipSync(bytes);
    const file = group + '-' + name + '.gz'; fs.writeFileSync(path.join(out, file), compressed);
    records.push({ file, sourceSha256: sha256(bytes), sha256: sha256(compressed) });
  }
  for (const e of qa.entries) all.push({ id: e.assetId, file: path.join(dir, 'review', e.assetId + '-front.png') });
}
for (let page = 0; page < 2; page++) {
  const layers = [], cell = 192, label = 112, rows = all.slice(page * 5, page * 5 + 5);
  for (const [row, e] of rows.entries()) {
    layers.push({ input: Buffer.from(`<svg width="${label}" height="${cell}"><text x="8" y="${cell / 2}" font-size="22" fill="#eef1df" font-family="sans-serif">${e.id}</text></svg>`), left: 0, top: row * cell });
    for (let i = 0; i < 8; i++) layers.push({ input: await sharp(e.file).extract({ left: (i % 4) * 512, top: Math.floor(i / 4) * 512, width: 512, height: 512 }).resize(cell, cell).png().toBuffer(), left: label + i * cell, top: row * cell });
  }
  const file = `front-poses-${page + 1}.jpg`;
  const bytes = await sharp({ create: { width: label + 8 * cell, height: 5 * cell, channels: 3, background: '#253438' } }).composite(layers).jpeg({ quality: 92 }).toBuffer();
  fs.writeFileSync(path.join(out, file), bytes); records.push({ file, ids: rows.map(e => e.id), poses: rows.length * 8, sha256: sha256(bytes) });
}
fs.copyFileSync(path.join(repo, 'gen/boss-front-footwork/promotion.json'), path.join(out, 'promotion.json'));
for (const label of ['baseline', 'after']) {
  const dir = path.join(repo, 'gen/e2e/boss-front-footwork', label), file = path.join(dir, 'report.json');
  if (!fs.existsSync(file)) continue;
  const bytes = fs.readFileSync(file), result = JSON.parse(bytes);
  if (!result.pass) throw new Error('runtime check failed: ' + label);
  const name = label + '-runtime.json.gz', compressed = gzipSync(bytes);
  fs.writeFileSync(path.join(out, name), compressed); records.push({ file: name, sourceSha256: sha256(bytes), sha256: sha256(compressed) });
  if (label === 'after') for (const gif of result.comparison.gifs) {
    const bytes = fs.readFileSync(path.join(dir, gif.file));
    if (sha256(bytes) !== gif.sha256) throw new Error('changed runtime GIF: ' + gif.file);
    fs.writeFileSync(path.join(out, gif.file), bytes); records.push({ file: gif.file, sha256: gif.sha256, frames: gif.frames, source: gif.source });
  }
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ version: 102, files: records }, null, 2) + '\n');
console.log('Recorded ten front views, 80 poses and three validated build records.');
