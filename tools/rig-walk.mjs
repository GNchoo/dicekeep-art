// Bake deterministic, textured stance/swing cycles from reviewed puppet atlases.
// node tools/rig-walk.mjs --config=tools/art-review/pr29-gait/rig-config.json [--out=gen/pr29-gait]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import browserTools from './e2e/browser.cjs';
import { loadRaw, analyzeCell, foregroundMask, positiveInteger, readBackgroundSeeds } from './lib/sheet.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const opt = (key, fallback) => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const configPath = path.resolve(repo, opt('config', 'tools/art-review/pr29-gait/rig-config.json'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const out = path.resolve(repo, opt('out', 'gen/pr29-gait'));
const cell = positiveInteger(config.cell ?? 512, 'cell'), count = positiveInteger(config.frames ?? 8, 'frames');
if (count !== 8 || !Array.isArray(config.waves) || !config.waves.length) throw new Error('rig requires eight frames and at least one configured wave');
if (new Set(config.waves.map(w => w.wave)).size !== config.waves.length) throw new Error('wave numbers must be unique');
const finite = (n, name) => { if (!Number.isFinite(n)) throw new Error(`${name} must be finite`); return n; };
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const normalizedPoint = (p, label) => {
  if (!Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error(`${label} must be a normalized [x,y]`);
  return p;
};

async function extractPart(raw, region, name) {
  if (!Array.isArray(region) || region.length !== 4 || region.some(n => !Number.isFinite(n) || n < 0 || n > 1) || region[2] <= 0 || region[3] <= 0 || region[0] + region[2] > 1.000001 || region[1] + region[3] > 1.000001) throw new Error(`invalid normalized region: ${name}`);
  const x0 = Math.floor(region[0] * raw.W), y0 = Math.floor(region[1] * raw.H), x1 = Math.floor((region[0] + region[2]) * raw.W), y1 = Math.floor((region[1] + region[3]) * raw.H);
  const foreground = foregroundMask(raw);
  const cutPixel = (x, y) => { if (foreground[y * raw.W + x]) throw new Error(`${name}: puppet region boundary cuts artwork at source pixel ${x},${y}; choose an empty atlas gutter`); };
  if (x0 > 0) for (let y = y0; y < y1; y++) { cutPixel(x0 - 1, y); cutPixel(x0, y); }
  if (x1 < raw.W) for (let y = y0; y < y1; y++) { cutPixel(x1 - 1, y); cutPixel(x1, y); }
  if (y0 > 0) for (let x = x0; x < x1; x++) { cutPixel(x, y0 - 1); cutPixel(x, y0); }
  if (y1 < raw.H) for (let x = x0; x < x1; x++) { cutPixel(x, y1 - 1); cutPixel(x, y1); }
  const s = analyzeCell(raw, x0, y0, x1 - x0, y1 - y0, { clean: false });
  if (!s.n) throw new Error(`empty puppet region: ${name}`);
  // A region must isolate one puppet piece, rather than including a second whole
  // limb whose bounding box would silently change the texture scale and joints.
  const seen = new Uint8Array(s.mask.keep.length), stack = [], significant = [];
  for (let p = 0; p < seen.length; p++) {
    if (seen[p] || !s.mask.keep[p]) continue;
    stack.push(p); seen[p] = 1; let area = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % s.mask.w, y = Math.floor(i / s.mask.w); area++;
      for (const j of [x > 0 ? i - 1 : -1, x < s.mask.w - 1 ? i + 1 : -1, y > 0 ? i - s.mask.w : -1, y < s.mask.h - 1 ? i + s.mask.w : -1]) if (j >= 0 && !seen[j] && s.mask.keep[j]) { seen[j] = 1; stack.push(j); }
    }
    if (area >= Math.max(20, s.n * .02)) significant.push(area);
  }
  if (significant.length > 1) throw new Error(`${name}: region contains ${significant.length} substantial disconnected pieces (${significant.join(', ')} pixels); isolate one puppet part`);
  const rgba = Buffer.alloc(s.w * s.h * 4), { mask } = s;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const ox = s.x0 + x, oy = s.y0 + y;
    if (mask.keep[(oy - mask.Y0) * mask.w + ox - mask.X0]) raw.data.copy(rgba, (y * s.w + x) * 4, (oy * raw.W + ox) * 4, (oy * raw.W + ox) * 4 + 4);
  }
  let sum = 0, n = 0;
  for (let y = Math.max(0, s.h - Math.ceil(s.h * .035)); y < s.h; y++) for (let x = 0; x < s.w; x++) if (rgba[(y * s.w + x) * 4 + 3] > 150) { sum += x + .5; n++; }
  const png = await sharp(rgba, { raw: { width: s.w, height: s.h, channels: 4 } }).png().toBuffer();
  return { name, width: s.w, height: s.h, sourceBounds: [s.x0, s.y0, s.w, s.h], sole: [n ? sum / n : s.w / 2, s.h], image: `data:image/png;base64,${png.toString('base64')}` };
}

function solveLeg(hip, ankle, l1, l2, bend, label) {
  const d = distance(hip, ankle), min = Math.abs(l1 - l2), max = l1 + l2;
  if (d < min + .001 || d > max - .001) throw new Error(`${label}: unreachable ankle (distance ${d.toFixed(2)}, allowed ${(min + .001).toFixed(2)}..${(max - .001).toFixed(2)}); adjust hip, legScale, amplitude or lift`);
  const ux = (ankle[0] - hip[0]) / d, uy = (ankle[1] - hip[1]) / d;
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), across = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return [hip[0] + along * ux - bend * across * uy, hip[1] + along * uy + bend * across * ux];
}

async function prepareWave(wave) {
  positiveInteger(wave.wave, 'wave');
  if (!['biped', 'quad'].includes(wave.type)) throw new Error(`W${wave.wave}: type must be biped or quad`);
  const file = path.resolve(repo, wave.source);
  const sourceSha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (wave.sourceSha256 && wave.sourceSha256 !== sourceSha256) throw new Error(`W${wave.wave}: source SHA256 mismatch; review puppet regions and joints again`);
  const raw = await loadRaw(file, { background: wave.background ?? 'checkerboard', backgroundSeeds: readBackgroundSeeds(wave.backgroundSeedsFile, file) });
  const keys = wave.type === 'biped' ? ['body', 'near', 'far'] : ['body', 'fore', 'hind'];
  const parts = Object.fromEntries(await Promise.all(keys.map(async key => [key, await extractPart(raw, wave.regions[key], `W${wave.wave} ${key}`)])));
  const body = parts.body;
  const bodyHeight = finite(wave.bodyHeight ?? cell * .56, 'bodyHeight'), bodyTop = finite(wave.bodyTop ?? cell * .1, 'bodyTop');
  if (bodyHeight <= 0) throw new Error('bodyHeight must be positive');
  const bodyScale = bodyHeight / body.height, bodyWidth = body.width * bodyScale, bodyX = finite(wave.bodyX ?? (cell - bodyWidth) / 2, 'bodyX');
  const A = finite(wave.amplitude ?? cell * .1, 'amplitude'), lift = finite(wave.lift ?? cell * .08, 'lift'), groundY = finite(wave.groundY ?? cell * .9, 'groundY');
  const bodyBob = finite(wave.bodyBob ?? 0, 'bodyBob');
  if (A <= 0 || lift <= 0 || groundY <= 0 || groundY >= cell) throw new Error('amplitude and lift must be positive; groundY must be inside the cell');
  const limbDefs = wave.type === 'biped' ? [
    { id: 'near', pair: 'legs', side: 'near', part: 'near', phase: 0, root: wave.nearHip ?? wave.hip ?? [.5, .88], bend: -1 },
    { id: 'far', pair: 'legs', side: 'far', part: 'far', phase: .5, root: wave.farHip ?? wave.hip ?? [.5, .88], bend: -1 },
  ] : [
    { id: 'nearFore', pair: 'fore', side: 'near', part: 'fore', phase: 0, root: wave.nearForeHip ?? wave.foreHip ?? [.75, .72], bend: 1 },
    { id: 'farFore', pair: 'fore', side: 'far', part: 'fore', phase: .5, root: wave.farForeHip ?? wave.foreHip ?? [.75, .72], bend: 1 },
    { id: 'nearHind', pair: 'hind', side: 'near', part: 'hind', phase: .5, root: wave.nearHindHip ?? wave.hindHip ?? [.23, .72], bend: -1 },
    { id: 'farHind', pair: 'hind', side: 'far', part: 'hind', phase: 0, root: wave.farHindHip ?? wave.hindHip ?? [.23, .72], bend: -1 },
  ];
  const limbs = limbDefs.map(def => {
    const part = parts[def.part], override = wave.sourceJoints?.[def.part] ?? {};
    const point = (name, fallback) => { const p = normalizedPoint(override[name] ?? fallback, `${def.part}.${name}`); return [p[0] * part.width, p[1] * part.height]; };
    const hip = point('hip', [.5, .08]), knee = point('knee', [.5, .48]), ankle = point('ankle', [.40, .82]);
    if (!(hip[1] < knee[1] && knee[1] < ankle[1])) throw new Error(`${def.part}: source joints must proceed downward from hip to knee to ankle`);
    const scale = finite(wave.legScales?.[def.part] ?? wave.legScale ?? .46, 'legScale');
    if (scale <= 0) throw new Error('legScale must be positive');
    const root = normalizedPoint(def.root, `${def.id} root`);
    const bend = wave.kneeBend?.[def.id] ?? def.bend;
    if (![1, -1].includes(bend)) throw new Error('kneeBend must be +1 (back) or -1 (forward)');
    return { ...def, root, bend, hip, knee, ankle, sole: part.sole, scale, l1: distance(hip, knee) * scale, l2: distance(knee, ankle) * scale };
  });
  const frames = Array.from({ length: count }, (_, index) => {
    const phase = index / count, bob = bodyBob * Math.sin(phase * Math.PI * 4);
    return { index, phase, rootAdvancePx: index * 4 * A / count, bodyAnchor: [bodyX + bodyWidth / 2, bodyTop + bob], limbs: limbs.map(limb => {
      const p = (phase + limb.phase) % 1, contact = p < .5, u = (p - .5) * 2;
      const hip = [bodyX + limb.root[0] * bodyWidth, bodyTop + bob + limb.root[1] * bodyHeight];
      const sole = [hip[0] + (contact ? A - 4 * A * p : -A + 2 * A * u), groundY - (contact ? 0 : lift * Math.sin(Math.PI * u))];
      const ankle = [sole[0] + (limb.ankle[0] - limb.sole[0]) * limb.scale, sole[1] + (limb.ankle[1] - limb.sole[1]) * limb.scale];
      const knee = solveLeg(hip, ankle, limb.l1, limb.l2, limb.bend, `W${wave.wave} frame ${index} ${limb.id}`);
      return { id: limb.id, hip, knee, ankle, sole, contact };
    }) };
  });
  return { wave: wave.wave, type: wave.type, source: wave.source, sourceSha256, sourceSize: [raw.W, raw.H], parts, limbs, frames, cell, body: { x: bodyX, y: bodyTop, width: bodyWidth, height: bodyHeight, scale: bodyScale }, amplitude: A, lift, groundY, cycleStridePx: 4 * A };
}

async function rasterize(page, rig) {
  return page.evaluate(async rig => {
    const images = {};
    await Promise.all(Object.entries(rig.parts).map(async ([key, part]) => { const im = new Image(); im.src = part.image; await im.decode(); images[key] = im; }));
    const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const colors = { near: '#49d7e8', far: '#ff9274', nearFore: '#49d7e8', farFore: '#ad8bff', nearHind: '#f9d468', farHind: '#ff9274' };
    const segment = (g, im, a, b, toA, toB, scale) => {
      g.save(); g.translate(toA[0], toA[1]);
      g.rotate(Math.atan2(toB[1] - toA[1], toB[0] - toA[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]));
      g.scale(scale, scale);
      g.drawImage(im, -a[0], -a[1]);
      g.restore();
    };
    // Circular ends share one joint center and radius under rotation. Straight strip
    // crops would rotate bits of the boot instep into a shelf above the flat foot.
    const pieces = {};
    for (const def of rig.limbs) {
      const im = images[def.part], sample = cv(im.width, im.height), sg = sample.getContext('2d'); sg.drawImage(im, 0, 0);
      const alpha = sg.getImageData(0, 0, im.width, im.height).data;
      const radius = joint => {
        let x0 = im.width, x1 = -1;
        for (let y = Math.max(0, Math.round(joint[1]) - 2); y <= Math.min(im.height - 1, Math.round(joint[1]) + 2); y++) for (let x = 0; x < im.width; x++) if (alpha[(y * im.width + x) * 4 + 3] > 150) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        return Math.max(8, Math.min(im.width * .32, (x1 - x0 + 1) / 2));
      };
      const kr = radius(def.knee), ar = radius(def.ankle);
      const make = kind => {
        const c = cv(im.width, im.height), g = c.getContext('2d'); g.beginPath();
        const circle = (joint, r) => { g.moveTo(joint[0] + r, joint[1]); g.arc(joint[0], joint[1], r, 0, Math.PI * 2); };
        if (kind === 'upper') { g.rect(0, 0, im.width, def.knee[1]); circle(def.knee, kr); }
        if (kind === 'lower') { g.rect(0, def.knee[1], im.width, def.ankle[1] - def.knee[1]); circle(def.knee, kr); circle(def.ankle, ar); }
        if (kind === 'foot') { g.rect(0, def.ankle[1], im.width, im.height - def.ankle[1]); circle(def.ankle, ar); }
        g.clip(); g.drawImage(im, 0, 0); return c;
      };
      pieces[def.id] = { upper: make('upper'), lower: make('lower'), foot: make('foot') };
    }
    const limbArt = (g, def, f) => {
      const part = pieces[def.id]; g.save();
      // The authored flat sole is the limb's lowest point. A rotated source cap
      // may contain a sliver of boot texture; it must not extend below that sole.
      g.beginPath(); g.rect(0, 0, rig.cell, Math.max(0, f.sole[1])); g.clip();
      if (def.side === 'far') g.filter = 'brightness(85%)';
      segment(g, part.upper, def.hip, def.knee, f.hip, f.knee, def.scale);
      segment(g, part.lower, def.knee, def.ankle, f.knee, f.ankle, def.scale);
      g.drawImage(part.foot, f.sole[0] - def.sole[0] * def.scale, f.sole[1] - def.sole[1] * def.scale, part.foot.width * def.scale, part.foot.height * def.scale);
      g.restore();
    };
    const textured = [], preview = [], debug = [];
    for (const f of rig.frames) {
      const c = cv(rig.cell, rig.cell), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      const bodyY = f.bodyAnchor[1];
      for (const side of ['far', 'near']) {
        if (side === 'near') g.drawImage(images.body, rig.body.x, bodyY, rig.body.width, rig.body.height);
        for (const def of rig.limbs.filter(l => l.side === side)) limbArt(g, def, f.limbs.find(l => l.id === def.id));
      }
      // The body atlas contains no legs. Its complete original alpha mask covers
      // the attachment roots and clothing hem; feet and exposed legs stay visible.
      g.drawImage(images.body, rig.body.x, bodyY, rig.body.width, rig.body.height);
      const d = g.getImageData(0, 0, rig.cell, rig.cell).data;
      for (let i = 0; i < rig.cell; i++) if (d[i * 4 + 3] > 28 || d[((rig.cell - 1) * rig.cell + i) * 4 + 3] > 28 || d[(i * rig.cell) * 4 + 3] > 28 || d[(i * rig.cell + rig.cell - 1) * 4 + 3] > 28) throw new Error(`W${rig.wave} frame ${f.index}: artwork touches output boundary`);
      textured.push(c.toDataURL('image/png').split(',')[1]);
      const p = cv(rig.cell, rig.cell), pg = p.getContext('2d'); pg.fillStyle = '#253438'; pg.fillRect(0, 0, p.width, p.height);
      pg.strokeStyle = '#6c8389'; pg.lineWidth = 1; pg.beginPath(); pg.moveTo(0, rig.groundY); pg.lineTo(rig.cell, rig.groundY); pg.stroke();
      const spacing = rig.cycleStridePx / 4;
      for (let x = -f.rootAdvancePx % spacing; x < rig.cell; x += spacing) { pg.beginPath(); pg.moveTo(x, rig.groundY); pg.lineTo(x, rig.groundY + 9); pg.stroke(); }
      pg.drawImage(c, 0, 0); pg.fillStyle = '#eef1df'; pg.font = 'bold 18px sans-serif'; pg.fillText(`W${rig.wave}  ${f.index + 1}/8`, 14, 27);
      preview.push(p.toDataURL('image/png').split(',')[1]);
      const db = cv(rig.cell * 2, rig.cell), dg = db.getContext('2d'); dg.drawImage(p, 0, 0); dg.drawImage(p, rig.cell, 0); dg.save(); dg.translate(rig.cell, 0);
      for (const limb of f.limbs) {
        dg.strokeStyle = colors[limb.id]; dg.fillStyle = colors[limb.id]; dg.lineWidth = 3;
        dg.beginPath(); dg.moveTo(...limb.hip); dg.lineTo(...limb.knee); dg.lineTo(...limb.ankle); dg.lineTo(...limb.sole); dg.stroke();
        for (const pt of [limb.hip, limb.knee, limb.ankle]) { dg.beginPath(); dg.arc(...pt, 4, 0, Math.PI * 2); dg.fill(); }
        dg.beginPath(); dg.arc(...limb.sole, limb.contact ? 7 : 5, 0, Math.PI * 2); dg.stroke();
        dg.font = '14px sans-serif'; dg.fillText(`${limb.id} ${limb.contact ? 'SUPPORT' : 'SWING'}`, limb.sole[0] - 35, Math.min(rig.cell - 8, limb.sole[1] + 24));
      }
      dg.restore(); debug.push(db.toDataURL('image/png').split(',')[1]);
    }
    return { textured, preview, debug };
  }, rig);
}

async function writeGif(frames, width, height, file) {
  const raw = await sharp({ create: { width, height: height * count, channels: 4, background: '#253438' } }).composite(frames.map((input, i) => ({ input: Buffer.from(input, 'base64'), left: 0, top: i * height }))).raw().toBuffer();
  await sharp(raw, { raw: { width, height: height * count, channels: 4, pageHeight: height } }).gif({ delay: Array(count).fill(config.frameDelayMs ?? 100), loop: 0, effort: 7 }).toFile(file);
}

const prepared = [];
for (const wave of config.waves) prepared.push(await prepareWave(wave));
const manifest = { version: 1, frames: count, cols: 4, rows: 2, cell, waves: [] };
const browser = await browserTools.launchBrowser();
try {
  const page = await browser.newPage();
  await page.goto('about:blank');
  for (const rig of prepared) {
    const rendered = await rasterize(page, rig), id = `w${String(rig.wave).padStart(3, '0')}`, assets = path.join(out, 'casual/enemies/inf');
    fs.mkdirSync(assets, { recursive: true });
    await sharp({ create: { width: cell * 4, height: cell * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(rendered.textured.map((b64, i) => ({ input: Buffer.from(b64, 'base64'), left: i % 4 * cell, top: Math.floor(i / 4) * cell }))).png().toFile(path.join(assets, `${id}-walk-4x2.png`));
    fs.writeFileSync(path.join(assets, `${id}.png`), Buffer.from(rendered.textured[0], 'base64'));
    await writeGif(rendered.preview, cell, cell, path.join(out, `${id}-preview.gif`));
    await writeGif(rendered.debug, cell * 2, cell, path.join(out, `${id}-debug.gif`));
    fs.writeFileSync(path.join(out, `${id}-debug.png`), Buffer.from(rendered.debug[0], 'base64'));
    manifest.waves.push({ wave: rig.wave, type: rig.type, source: rig.source, sourceSha256: rig.sourceSha256, sourceSize: rig.sourceSize, sheet: `casual/enemies/inf/${id}-walk-4x2.png`, still: `casual/enemies/inf/${id}.png`, cycleStridePx: rig.cycleStridePx, groundY: rig.groundY, body: rig.body, bodyLayer: 'full-alpha-overlay', parts: Object.fromEntries(Object.entries(rig.parts).map(([name, part]) => [name, { sourceBounds: part.sourceBounds, width: part.width, height: part.height }])), limbs: rig.limbs.map(l => ({ id: l.id, pair: l.pair, side: l.side, sourcePart: l.part, sourceJoints: { hip: l.hip, knee: l.knee, ankle: l.ankle, sole: l.sole }, legScale: l.scale, linkLengths: [l.l1, l.l2] })), frames: rig.frames });
    console.log(`W${rig.wave}: ${count} frames, stride ${rig.cycleStridePx}px; ${rig.limbs.map(l => `${l.id} links=${l.l1.toFixed(1)}+${l.l2.toFixed(1)}`).join(', ')}`);
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, 'rig-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Rig output: ${out}`);
