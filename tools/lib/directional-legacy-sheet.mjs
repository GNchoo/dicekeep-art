// Preserve the two reviewed four-pose flyers as displayed by the legacy loader.
// New generated art cannot use this adapter to bypass articulated-flight QA.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadRaw, gridCells, analyzeCell, stabilizePlan } from './sheet.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');

export async function prepareLegacySheet(entry, name, view, repo, canonicalCell) {
  const spec = view.legacySheet;
  if (!['w004', 'w008'].includes(entry.assetId) || name !== 'side' || entry.locomotion !== 'flight' || spec.reviewedExisting !== true) throw new Error('legacySheet is restricted to the reviewed W4/W8 side flight poses');
  const expected = `casual/enemies/inf/${entry.assetId}-walk-2x2.png`;
  if (spec.source !== expected || spec.cols !== 2 || spec.rows !== 2 || spec.frames !== 4 || spec.anchor !== 'center' || spec.stillFrame !== 0) throw new Error('legacySheet requires the exact reviewed 2x2 source, center stabilization and explicit stillFrame 0');
  if (entry.cycleStride !== 0 || (entry.cycleSeconds ?? .8) !== .8) throw new Error('legacySheet preserves four poses at five fps');
  const file = path.resolve(repo, spec.source), bytes = fs.readFileSync(file), sourceSha256 = hash(bytes);
  if (sourceSha256 !== spec.sourceSha256) throw new Error('legacySheet source SHA256 mismatch');
  const raw = await loadRaw(file), { cells, fw, fh } = gridCells(raw.W, raw.H, spec);
  const stats = cells.map(([x, y]) => analyzeCell(raw, x, y, fw, fh)), plan = stabilizePlan(stats, cells, { anchor: 'center' });
  const offset = [Math.floor((canonicalCell - plan.bw) / 2), Math.floor((canonicalCell - plan.bh) / 2)];
  const pivot = [offset[0] + plan.bw / 2, offset[1] + plan.bh];
  if (offset.some(n => n < 2) || entry.referenceHeight !== plan.bh || view.pivot.some((n, i) => n !== pivot[i])) throw new Error(`legacySheet fixed padding/reference mismatch: referenceHeight=${plan.bh}, pivot=${JSON.stringify(pivot)}`);
  const removed = [];
  for (const s of stats) for (let y = 0; y < s.mask.h; y++) for (let x = 0; x < s.mask.w; x++) if (!s.mask.keep[y * s.mask.w + x]) { const p = (s.mask.Y0 + y) * raw.W + s.mask.X0 + x; if (raw.data[p * 4 + 3] > 28) removed.push(p); }
  return { kind: 'legacy-sheet', name, assetId: entry.assetId, count: 4, canonicalCell, pivot, image: 'data:image/png;base64,' + bytes.toString('base64'), removed, cells, fw, fh, plan, offset,
    frames: cells.map((sourceCell, index) => ({ index, phase: index / 4, sourceCell, existingScale: plan.sc[index], existingTranslate: [plan.dx[index] - plan.ux0, plan.dy[index] - plan.uy0] })),
    provenance: { source: spec.source, sourceSha256, sourceSize: [raw.W, raw.H], legacySheet: { cols: 2, rows: 2, frames: 4, anchor: 'center', stillFrame: 0, displayedCrop: [plan.bw, plan.bh], fixedPadding: offset } },
    geometry: { passed: true, samples: 4, profile: 'reviewed existing flight poses; exact legacy display stabilization, then one fixed padding transform', articulatedJointClaim: false } };
}

export async function rasterizeLegacySheet(page, rig) {
  return page.evaluate(async r => {
    const image = new Image(); image.src = r.image; await image.decode();
    const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
    const context = source.getContext('2d'); context.drawImage(image, 0, 0);
    const id = context.getImageData(0, 0, source.width, source.height), data = id.data, W = source.width, H = source.height;
    const visited = new Uint8Array(W * H), queue = new Int32Array(W * H); let head = 0, tail = 0;
    const push = p => { if (visited[p]) return; visited[p] = 1; const i = p * 4, red = data[i], green = data[i + 1], blue = data[i + 2], avg = (red + green + blue) / 3;
      if (data[i + 3] <= 150 || (red > 180 && green < 90 && blue > 80 && red - green > 80) || (avg > 185 && avg < 250 && Math.max(red, green, blue) - Math.min(red, green, blue) < 22)) { data[i + 3] = 0; queue[tail++] = p; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); } for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (head < tail) { const p = queue[head++], x = p % W, y = Math.floor(p / W); if (x) push(p - 1); if (x < W - 1) push(p + 1); if (y) push(p - W); if (y < H - 1) push(p + W); }
    // The statistics mask tracks opaque foreground only. Keep enclosed alpha
    // <=28 exactly as the game does; deleting it changes antialiased edges.
    for (const p of r.removed) if (data[p * 4 + 3] > 28) data[p * 4 + 3] = 0;
    context.putImageData(id, 0, 0);
    const frames = [], preview = [];
    for (let i = 0; i < r.count; i++) {
      const crop = document.createElement('canvas'); crop.width = r.plan.bw; crop.height = r.plan.bh;
      const c = crop.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(source, ...r.cells[i], r.fw, r.fh, r.plan.dx[i] - r.plan.ux0, r.plan.dy[i] - r.plan.uy0, r.fw * r.plan.sc[i], r.fh * r.plan.sc[i]);
      const out = document.createElement('canvas'); out.width = out.height = r.canonicalCell;
      const g = out.getContext('2d'); g.drawImage(crop, ...r.offset); frames.push(out.toDataURL('image/png').split(',')[1]);
      g.fillStyle = '#253438'; g.globalCompositeOperation = 'destination-over'; g.fillRect(0, 0, out.width, out.height); g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#ecedda'; g.font = '18px sans-serif'; g.fillText(r.assetId + ' side · preserved flight pose ' + (i + 1) + '/4', 16, 25);
      preview.push(out.toDataURL('image/png').split(',')[1]);
    }
    return { frames, still: frames[0], preview };
  }, rig);
}
