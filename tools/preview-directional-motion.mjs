// Review real baked PNG frames over a fixed world grid; no rig rerender/override.
// node tools/preview-directional-motion.mjs gen/directional-pilot
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { sha256 } from './lib/directional-rig.mjs';
const root = path.resolve(process.argv[2] || 'gen/directional-pilot');
const manifestBytes = fs.readFileSync(path.join(root, 'directional-art.json'));
const manifest = JSON.parse(manifestBytes), qa = JSON.parse(fs.readFileSync(path.join(root, 'directional-qa.json')));
const cycles = 3, samplesPerCycle = 256;
const directions = [{ name: 'RIGHT', view: 'side', axis: [1, 0] }, { name: 'LEFT', view: 'side', axis: [-1, 0], flip: true }, { name: 'DOWN / FRONT', view: 'front', axis: [0, 1] }, { name: 'UP / BACK', view: 'back', axis: [0, -1] }];
const report = { manifestSha256: sha256(manifestBytes), cycles, samplesPerCycle, coordinateSystem: 'output PNG pixels = canonical pixels * view.scale; review is not a game-speed or anatomy approval', entries: [], errors: [] };
const extent = points => Math.hypot(...[0, 1].map(k => Math.max(...points.map(p => p[k])) - Math.min(...points.map(p => p[k]))));
for (const [id, entry] of Object.entries(manifest.entries)) {
  if (directions.some(d => !entry.views[d.view])) continue;
  const grounded = entry.locomotion === 'legged';
  const distanceDriven = ['legged', 'slither'].includes(entry.locomotion);
  // Airborne motion has no distance stride. Use a labelled review path while
  // retaining its authored time cycle; this is not a game speed measurement.
  const reviewTravelCanonical = distanceDriven ? entry.cycleStride : entry.referenceHeight * .4;
  if (!(reviewTravelCanonical > 0)) throw new Error(id + ': invalid motion review travel');
  const evidence = qa.entries.find(e => e.assetId === id), views = {}, checks = [];
  for (const name of ['side', 'front', 'back']) {
    const view = entry.views[name], sheet = fs.readFileSync(path.join(root, view.sheet));
    const frames = [];
    for (let i = 0; i < view.frames; i++) frames.push(await sharp(sheet).extract({ left: i % view.cols * view.cell, top: Math.floor(i / view.cols) * view.cell, width: view.cell, height: view.cell }).png().toBuffer());
    const rawFrames = await Promise.all(frames.map(f => sharp(f).ensureAlpha().raw().toBuffer()));
    views[name] = { view, frames, rawFrames, evidence: evidence.views[name] };
  }
  // Use every baked foreground bound over all three cycles. A stride-only
  // estimate misses high pivots/capes and can let a correct sprite hit captions.
  const count = Math.max(...Object.values(views).map(v => v.view.frames)), extents = [];
  for (const d of directions) {
    const { view, evidence } = views[d.view], scale = 256 / view.cell, stride = reviewTravelCanonical * view.scale * scale;
    for (let i = 0; i < count * cycles; i++) {
      const b = evidence.frameStats[Math.floor((i % count) / count * view.frames)].bounds, advance = (i / count - (cycles - 1 / count) / 2) * stride;
      const pivotX = (d.flip ? view.cell - view.pivot[0] : view.pivot[0]) * scale;
      const left = advance * d.axis[0] - pivotX + (d.flip ? view.cell - b[0] - b[2] : b[0]) * scale;
      const top = advance * d.axis[1] - view.pivot[1] * scale + b[1] * scale;
      extents.push([left, top, left + b[2] * scale, top + b[3] * scale]);
    }
  }
  const loX = Math.min(...extents.map(b => b[0])), loY = Math.min(...extents.map(b => b[1])), hiX = Math.max(...extents.map(b => b[2])), hiY = Math.max(...extents.map(b => b[3]));
  const panel = Math.max(640, Math.ceil(Math.max(hiX - loX + 44, hiY - loY + 94) / 80) * 80), width = panel * 2;
  const origin = [panel / 2 - (loX + hiX) / 2, 72 + (panel - 94 - hiY + loY) / 2 - loY];
  for (const d of directions) {
    const { view, rawFrames, evidence: vq } = views[d.view], f = vq.motionFrames || vq.frames;
    if (!grounded) {
      const uniqueRasterFrames = new Set(rawFrames.map(sha256)).size;
      if (f.length !== view.frames || uniqueRasterFrames < (view.frames === 8 ? 6 : 3)) report.errors.push(id + ' ' + d.name + ': missing/repeated animation poses');
      const recordedPhases = f.map(p => p.phase);
      if (recordedPhases.some((p, i) => !Number.isFinite(p) || Math.abs(p - i / view.frames) > 1e-9)) report.errors.push(id + ' ' + d.name + ': recorded phase sequence does not cover one complete cycle');
      checks.push({ direction: d.name, profile: entry.locomotion, frameCount: view.frames, uniqueRasterFrames, recordedPhases, phaseDriver: distanceDriven ? 'distance/cycleStride' : 'time/cycleSeconds', contactAssessment: 'not applicable: no discrete foot support landmarks' });
      continue;
    }
    if (!f.every(p => Array.isArray(p.legs))) throw new Error('motion review expects projected leg landmarks: ' + id);
    const limit = entry.cycleStride / view.frames * view.scale;
    for (const limb of f[0].legs) {
      const contactPoints = [], runs = []; let run = [];
      const captured = [], captureRuns = []; let capturedRun = [];
      let textureHits = 0, textureSamples = 0;
      const world = (pose, phase) => {
        const p = pose.screen.sole, x = (d.flip ? -p[0] : p[0]) * view.scale, y = p[1] * view.scale;
        return [x + phase * entry.cycleStride * view.scale * d.axis[0], y + phase * entry.cycleStride * view.scale * d.axis[1]];
      };
      for (let i = 0; i < cycles * samplesPerCycle; i++) {
        const phase = i / samplesPerCycle, index = Math.floor((i % samplesPerCycle) / samplesPerCycle * view.frames), pose = f[index].legs.find(l => l.id === limb.id);
        if (!pose.contact || (run.length && pose.phase < run.at(-1).phase)) { if (run.length > 1) runs.push(run.map(p => p.point)); run = []; }
        if (pose.contact) { const point = world(pose, phase); run.push({ phase: pose.phase, point }); contactPoints.push(point); }
      }
      if (run.length > 1) runs.push(run.map(p => p.point));
      for (let i = 0; i < cycles * view.frames; i++) {
        const index = i % view.frames, pose = f[index].legs.find(l => l.id === limb.id);
        if (!pose.contact || (capturedRun.length && pose.phase < capturedRun.at(-1).phase)) { if (capturedRun.length > 1) captureRuns.push(capturedRun.map(p => p.point)); capturedRun = []; }
        if (pose.contact) { const point = world(pose, i / view.frames); capturedRun.push({ phase: pose.phase, point }); captured.push(point); }
        // Composite texture cannot identify an occluded physical limb. Record
        // proximity hits without mislabeling another limb's pixels as proof.
        const x = Math.round(pose.screen.sole[0] * view.scale), y = Math.floor(pose.screen.sole[1] * view.scale); let hit = false;
        for (let yy = y - 4; yy <= y; yy++) for (let xx = x - 4; xx <= x + 4; xx++) if (xx >= 0 && yy >= 0 && xx < view.cell && yy < view.cell && rawFrames[index][(yy * view.cell + xx) * 4 + 3] > 28) hit = true;
        textureSamples++; if (hit) textureHits++;
      }
      if (capturedRun.length > 1) captureRuns.push(capturedRun.map(p => p.point));
      const residual = Math.max(0, ...captureRuns.map(extent)), excursion = Math.max(0, ...runs.map(extent));
      if (residual > 1e-6 || excursion > limit + 1e-6) report.errors.push(id + ' ' + d.name + ' ' + limb.id + ': contact drift beyond frame quantization');
      checks.push({ direction: d.name, limb: limb.id, contactCaptures: captured.length, contactContinuousSamples: contactPoints.length, capturedPoseContactResidualPx: residual, heldRasterContactExcursionPx: excursion, oneFrameQuantizationLimitPx: limit, textureProximityHits: textureHits, textureSamples, textureCaveat: 'A composite proximity hit is not physical limb identity or occlusion verification.' });
    }
  }
  const outputFrames = [];
  for (let i = 0; i < count * cycles; i++) {
    const phase = i / count, frameIndex = i % count, composites = [];
    for (let k = 0; k < directions.length; k++) {
      const d = directions[k], { view, frames } = views[d.view], ox = k % 2 * panel, oy = Math.floor(k / 2) * panel;
      const displayScale = 256 / view.cell;
      const travel = reviewTravelCanonical * view.scale * displayScale, advance = (phase - (cycles - 1 / count) / 2) * travel;
      const viewIndex = Math.floor((i % count) / count * view.frames);
      const rootX = origin[0] + advance * d.axis[0], rootY = origin[1] + advance * d.axis[1];
      const pivotX = (d.flip ? view.cell - view.pivot[0] : view.pivot[0]) * displayScale;
      let sprite = await sharp(frames[viewIndex]).resize(256, 256).png().toBuffer(); if (d.flip) sprite = await sharp(sprite).flop().png().toBuffer();
      const left = Math.round(rootX - pivotX), top = Math.round(rootY - view.pivot[1] * displayScale);
      const bounds = views[d.view].evidence.frameStats[viewIndex].bounds, bx = d.flip ? view.cell - bounds[0] - bounds[2] : bounds[0];
      if (left + bx * displayScale < 20 || left + (bx + bounds[2]) * displayScale > panel - 20 || top + bounds[1] * displayScale < 70 || top + (bounds[1] + bounds[3]) * displayScale > panel - 20) throw new Error(id + ' ' + d.name + ': moving review crosses caption/panel boundary');
      composites.push({ input: sprite, left: ox + left, top: oy + top });
    }
    let lines = '';
    for (let k = 0; k < directions.length; k++) {
      const ox = k % 2 * panel, oy = Math.floor(k / 2) * panel;
      for (let n = 40; n < panel; n += 20) lines += `<path d="M${ox + n} ${oy + 70}V${oy + panel - 20}M${ox + 20} ${oy + n + 60}H${ox + panel - 20}" stroke="#3d5356" stroke-width="1"/>`;
      lines += `<text x="${ox + 20}" y="${oy + 32}" fill="#f1f2df" font-size="23">${id} ${directions[k].name} · cycle ${Math.floor(phase) + 1}/3 · pose ${frameIndex + 1}/${count}</text><text x="${ox + 20}" y="${oy + 58}" fill="#c0d3c5" font-size="16">Grid 20 px · 256px cell · ${distanceDriven ? 'stride' : 'review travel'} ${(reviewTravelCanonical * entry.views.side.scale * 256 / entry.views.side.cell).toFixed(2)} px/cycle${distanceDriven ? '' : ' (not game speed)'}</text>`;
    }
    const bg = Buffer.from(`<svg width="${width}" height="${width}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#253438"/>${lines}</svg>`);
    outputFrames.push(await sharp(bg).composite(composites).png().toBuffer());
  }
  const reset = await sharp(Buffer.from(`<svg width="${width}" height="${width}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#253438"/><text x="${width / 2}" y="${width / 2}" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#eee">RESET TO START — REVIEW LOOP</text></svg>`)).png().toBuffer();
  outputFrames.push(reset);
  const raw = await sharp({ create: { width, height: width * outputFrames.length, channels: 4, background: '#253438' } }).composite(outputFrames.map((input, i) => ({ input, left: 0, top: i * width }))).raw().toBuffer();
  const frameDelayMs = distanceDriven ? 150 : Math.round((entry.cycleSeconds || .8) * 1000 / count);
  const gif = await sharp(raw, { raw: { width, height: width * outputFrames.length, channels: 4, pageHeight: width } }).gif({ loop: 0, effort: 4, delay: [...Array(count * cycles).fill(frameDelayMs), 650] }).toBuffer();
  const gifFile = 'review/' + id + '-moving.gif'; fs.writeFileSync(path.join(root, gifFile), gif);
  fs.writeFileSync(path.join(root, 'review/' + id + '-moving.png'), outputFrames[4]);
  report.entries.push({ assetId: id, locomotion: entry.locomotion, phaseDriver: distanceDriven ? 'distance' : 'time', reviewTravelCanonical, frameDelayMs, gif: gifFile, gifSha256: sha256(gif), panelPx: panel, captionAndPanelBoundsChecked: true, fixedReviewScale: 256 / entry.views.side.cell, motionFrames: count * cycles, resetFrames: 1, checks });
  console.log('reviewed', id, checks.length + (grounded ? ' direction/limb traces' : ' direction/phase traces'), gifFile);
}
report.passed = report.errors.length === 0 && report.entries.length > 0;
fs.writeFileSync(path.join(root, 'directional-moving-qa.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ entries: report.entries.length, passed: report.passed, errors: report.errors })); if (!report.passed) process.exitCode = 1;
