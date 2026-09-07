// Encode the edited, already composed title backgrounds without adding a second fade.
// node tools/art-review/pr29-keyart/rebuild.mjs [output-directory]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const review = fileURLToPath(new URL('./', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const out = path.resolve(repo, process.argv[2] || 'gen/pr29-keyart');
fs.mkdirSync(out, { recursive: true });
await sharp(path.join(review, 'sources/portrait-d6.png')).resize(1400, 2100, { fit: 'fill' }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(out, 'title-keyart-p.jpg'));
const landscape = await sharp(path.join(review, 'sources/landscape-d6.png')).resize(2400, 1000, { fit: 'fill' }).png().toBuffer();
await sharp(landscape).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(out, 'title-keyart-l.jpg'));
await sharp(landscape).resize(480, 200).blur(6).jpeg({ quality: 70, mozjpeg: true }).toFile(path.join(out, 'title-keyart-l-blur.jpg'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const assets = [];
for (const name of ['title-keyart-p.jpg', 'title-keyart-l.jpg', 'title-keyart-l-blur.jpg']) {
  const file = path.join(out, name), metadata = await sharp(file).metadata();
  assets.push({ file: 'ui/' + name, width: metadata.width, height: metadata.height, bytes: fs.statSync(file).size, sha256: hash(file), matchesRuntime: hash(file) === hash(path.join(repo, 'ui', name)) });
}
fs.writeFileSync(path.join(out, 'asset-manifest.json'), JSON.stringify(assets, null, 2) + '\n');
console.log(JSON.stringify(assets, null, 2));
