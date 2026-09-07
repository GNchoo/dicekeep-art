import sharp from 'sharp';

// Validate the decoded pixels, including neutral and inline fallback images.
export async function inspectAlpha(bytes, label = 'image') {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let pixels = 0, edges = 0, x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 28) {
    pixels++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
    if (!x || !y || x === info.width - 1 || y === info.height - 1) edges++;
  }
  if (pixels < info.width * info.height * .005 || edges) throw new Error(label + ': empty/clipped alpha');
  return { width: info.width, height: info.height, pixels, bounds: [x0, y0, x1 - x0, y1 - y0], edgePixels: edges };
}
