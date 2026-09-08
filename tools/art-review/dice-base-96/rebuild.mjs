import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = new URL('./source.png', import.meta.url);
const target = new URL('../../../dice/skins/ivory-worn/material.png', import.meta.url);
const bytes = await fs.readFile(source);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha !== 'd5a190c5e76e255cb1b138b05ac03de2f4309f3f64fd0e78063d51f0a1899322') {
  throw new Error('Dice material source changed; review the new image before rebuilding.');
}
await fs.mkdir(new URL('.', target), { recursive: true });
await sharp(bytes).resize(512, 512).png({ compressionLevel: 9 }).toFile(fileURLToPath(target));
console.log('Rebuilt dice/skins/ivory-worn/material.png from the reviewed built-in image generation.');
