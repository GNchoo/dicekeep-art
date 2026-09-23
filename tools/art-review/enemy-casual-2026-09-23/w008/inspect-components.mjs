import path from 'node:path';
import sharp from 'sharp';

const file = path.resolve(process.argv[2]);
const threshold = Number(process.argv[3] ?? 64);
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const visited = new Uint8Array(width * height);
const result = [];
const stack = new Int32Array(width * height);
for (let i = 0; i < visited.length; i++) {
  if (visited[i] || data[i * channels + 3] < threshold) continue;
  let n = 0, size = 0, minX = width, minY = height, maxX = 0, maxY = 0;
  stack[n++] = i;
  visited[i] = 1;
  while (n) {
    const p = stack[--n];
    const x = p % width, y = Math.floor(p / width);
    size++;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    for (const q of [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, y > 0 ? p - width : -1, y + 1 < height ? p + width : -1]) {
      if (q < 0 || visited[q] || data[q * channels + 3] < threshold) continue;
      visited[q] = 1;
      stack[n++] = q;
    }
  }
  if (size > 1000) result.push({ size, bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1] });
}
console.log(JSON.stringify({ file, width, height, threshold, components: result.sort((a,b) => b.size - a.size) }, null, 2));
