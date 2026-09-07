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
const finite = (n, name) => { if (!Number.isFinite(n)) throw new Error(`${name} must be finite`); return n; };
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const normalizedPoint = (p, label) => {
  if (!Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error(`${label} must be a normalized [x,y]`);
  return p;
};

export async function extractPart(raw, region, name, { componentCount = 1 } = {}) {
  if (![1, 3].includes(componentCount)) throw new Error(`${name}: componentCount must be 1 or the explicitly reviewed 3-body swarm`);
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
  if (significant.length !== componentCount || (componentCount === 3 && significant.some(area => area < s.n * .05))) throw new Error(`${name}: region contains ${significant.length} substantial disconnected pieces (${significant.join(', ')} pixels); expected ${componentCount}${componentCount === 3 ? ' with each body at least 5% of foreground' : ' isolated puppet part'}`);
  const rgba = Buffer.alloc(s.w * s.h * 4), { mask } = s;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const ox = s.x0 + x, oy = s.y0 + y;
    if (mask.keep[(oy - mask.Y0) * mask.w + ox - mask.X0]) raw.data.copy(rgba, (y * s.w + x) * 4, (oy * raw.W + ox) * 4, (oy * raw.W + ox) * 4 + 4);
  }
  let sum = 0, n = 0;
  for (let y = Math.max(0, s.h - Math.ceil(s.h * .035)); y < s.h; y++) for (let x = 0; x < s.w; x++) if (rgba[(y * s.w + x) * 4 + 3] > 150) { sum += x + .5; n++; }
  const png = await sharp(rgba, { raw: { width: s.w, height: s.h, channels: 4 } }).png().toBuffer();
  return { name, regionNormalized: region, width: s.w, height: s.h, sourceBounds: [s.x0, s.y0, s.w, s.h], componentAreas: significant, sole: [n ? sum / n : s.w / 2, s.h], image: `data:image/png;base64,${png.toString('base64')}` };
}

export function solveLeg(hip, ankle, l1, l2, bend, label) {
  const d = distance(hip, ankle), min = Math.abs(l1 - l2), max = l1 + l2;
  if (d < min + .001 || d > max - .001) throw new Error(`${label}: unreachable ankle (distance ${d.toFixed(2)}, allowed ${(min + .001).toFixed(2)}..${(max - .001).toFixed(2)}); adjust hip, legScale, amplitude or lift`);
  const ux = (ankle[0] - hip[0]) / d, uy = (ankle[1] - hip[1]) / d;
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), across = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return [hip[0] + along * ux - bend * across * uy, hip[1] + along * uy + bend * across * ux];
}

export async function prepareWave(wave, { cell = 512, count = 8 } = {}) {
  positiveInteger(cell, 'cell');
  if (count !== 8) throw new Error('legacy ground rig requires eight frames');
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
  const supportKneeAngle = wave.supportKneeAngle == null ? null : finite(wave.supportKneeAngle, 'supportKneeAngle');
  const supportPelvis = supportKneeAngle !== null;
  if (wave.contactRatio !== undefined && wave.stanceDuty !== undefined && wave.contactRatio !== wave.stanceDuty) throw new Error('contactRatio and stanceDuty must agree when both are supplied');
  const contactRatio = finite(wave.contactRatio ?? wave.stanceDuty ?? .5, 'contactRatio');
  if (contactRatio <= 0 || contactRatio >= 1) throw new Error('contactRatio must be between zero and one');
  const ankleCentered = wave.ankleCentered ?? false;
  if (typeof ankleCentered !== 'boolean') throw new Error('ankleCentered must be boolean');
  if (supportPelvis && (wave.type !== 'biped' || contactRatio !== .5 || !ankleCentered || supportKneeAngle < 160 || supportKneeAngle > 175 || bodyBob !== 0)) throw new Error('supportKneeAngle requires an ankle-centered biped, contactRatio .5, no bodyBob, and a target between 160 and 175 degrees');
  const bodyLayer = wave.bodyLayer ?? 'full-alpha-overlay';
  if (!['full-alpha-overlay', 'near-limbs-over-body'].includes(bodyLayer)) throw new Error('invalid bodyLayer');
  const proximalFeather = finite(wave.proximalFeather ?? 0, 'proximalFeather');
  if (proximalFeather < 0 || proximalFeather > .3) throw new Error('proximalFeather must be between zero and .3 of the upper part');
  const proximalEdgeFeather = finite(wave.proximalEdgeFeather ?? 0, 'proximalEdgeFeather');
  if (proximalEdgeFeather < 0 || proximalEdgeFeather > .2) throw new Error('proximalEdgeFeather must be between zero and .2 of the source part width');
  const smoothSwing = supportPelvis || wave.contactRatio !== undefined || wave.stanceDuty !== undefined || wave.limbPhases !== undefined;
  const cycleStridePx = 2 * A / contactRatio;
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
    const hip = point('hip', [.5, .08]), knee = point('knee', [.5, .48]), ankle = point('ankle', override.hock ?? [.40, .82]);
    if (!(hip[1] < knee[1] && knee[1] < ankle[1])) throw new Error(`${def.part}: source joints must proceed downward from hip to knee to ankle`);
    const scale = finite(wave.legScales?.[def.part] ?? wave.legScale ?? .46, 'legScale');
    if (scale <= 0) throw new Error('legScale must be positive');
    const root = normalizedPoint(def.root, `${def.id} root`);
    const socketRoi = wave.socketRegions?.[def.id] ?? wave.socketRegions?.[def.part] ?? null;
    if (socketRoi && (!Array.isArray(socketRoi) || socketRoi.length !== 4 || socketRoi.some(n => !Number.isFinite(n) || n < 0 || n > 1) || socketRoi[2] <= 0 || socketRoi[3] <= 0 || socketRoi[0] + socketRoi[2] > 1 || socketRoi[1] + socketRoi[3] > 1 || root[0] < socketRoi[0] || root[0] > socketRoi[0] + socketRoi[2] || root[1] < socketRoi[1] || root[1] > socketRoi[1] + socketRoi[3])) throw new Error(`${def.id}: socketRoi must be a normalized body rectangle containing the attachment root`);
    const bend = wave.kneeBend?.[def.id] ?? def.bend;
    if (![1, -1].includes(bend)) throw new Error('kneeBend must be +1 (back) or -1 (forward)');
    const phase = finite(wave.limbPhases?.[def.id] ?? def.phase, `${def.id} phase`);
    if (phase < 0 || phase >= 1) throw new Error(`${def.id} phase must be in [0,1)`);
    return { ...def, phase, root, socketRoi, bend, hip, knee, ankle, sole: part.sole, inputScale: scale, scale, proximalFeather, proximalEdgeFeather, distalJoint: override.hock && !override.ankle ? 'hock' : 'ankle', l1: distance(hip, knee) * scale, l2: distance(knee, ankle) * scale };
  });
  let pelvis = null;
  if (supportPelvis) {
    if (Math.abs((limbs[1].phase - limbs[0].phase + 1) % 1 - .5) > 1e-8) throw new Error('support pelvis requires opposite biped phase offsets');
    const angle = supportKneeAngle * Math.PI / 180;
    const reach = limb => Math.sqrt(limb.l1 ** 2 + limb.l2 ** 2 - 2 * limb.l1 * limb.l2 * Math.cos(angle));
    const footHeight = limb => (limb.sole[1] - limb.ankle[1]) * limb.scale;
    // Calibrate source pieces once, never frame by frame. The common body-local
    // standing height includes the ankle-to-sole offset and the torso socket.
    const standingHeight = limbs.reduce((sum, l) => sum + reach(l) + footHeight(l) + l.root[1] * bodyHeight, 0) / limbs.length;
    if (wave.normalizeStandingReach !== false) for (const l of limbs) {
      const factor = (standingHeight - l.root[1] * bodyHeight) / (reach(l) + footHeight(l));
      if (!(factor > 0)) throw new Error('standing reach calibration must have a positive scale');
      l.scale *= factor; l.l1 *= factor; l.l2 *= factor;
    }
    const referenceReach = limbs.reduce((sum, l) => sum + reach(l), 0) / limbs.length;
    if (A >= referenceReach) throw new Error(`W${wave.wave} frame 0 ${limbs[0].id}: unreachable ankle; support stride amplitude must be smaller than support reach`);
    const contactDrop = referenceReach - Math.sqrt(referenceReach ** 2 - A ** 2);
    pelvis = { centerBodyY: groundY - standingHeight, referenceReach, contactDrop, curve: 'support-geometry-cos4', normalizedStandingReach: wave.normalizeStandingReach !== false };
  }
  const poseAt = (phase, index, neutral = false) => {
    // A shared smooth curve avoids both source-length jumps and a velocity cusp
    // at support exchange. Endpoints and midstance use the target knee geometry;
    // all intermediate support angles are independently checked below.
    let bodyY = pelvis ? pelvis.centerBodyY + (neutral ? 0 : pelvis.contactDrop * Math.cos(2 * Math.PI * (phase + limbs[0].phase)) ** 4) : bodyTop + (neutral ? 0 : bodyBob * Math.sin(phase * Math.PI * 4));
    // Optional wider gait: project the preferred pelvis curve into the feasible
    // support envelope. The authored limb lengths and sockets never change.
    // Old configs omit this flag and retain their exact previous pixels/poses.
    if (pelvis && !neutral && wave.supportCurve === 'constraint-envelope') {
      let low = -Infinity, high = Infinity;
      for (const limb of limbs) {
        const p = (phase + limb.phase) % 1;
        if (p >= contactRatio) continue;
        const dx = A - 2 * A * p / contactRatio;
        const ankleY = groundY - (limb.sole[1] - limb.ankle[1]) * limb.scale;
        const reachAt = degrees => Math.sqrt(limb.l1 ** 2 + limb.l2 ** 2 - 2 * limb.l1 * limb.l2 * Math.cos(degrees * Math.PI / 180));
        const minReach = reachAt(161), maxReach = reachAt(174);
        if (Math.abs(dx) >= minReach) throw new Error(`W${wave.wave}: stride exceeds support envelope`);
        low = Math.max(low, ankleY - limb.root[1] * bodyHeight - Math.sqrt(maxReach ** 2 - dx ** 2));
        high = Math.min(high, ankleY - limb.root[1] * bodyHeight - Math.sqrt(minReach ** 2 - dx ** 2));
      }
      if (low > high) throw new Error(`W${wave.wave}: support envelopes do not intersect`);
      bodyY = Math.min(high, Math.max(low, bodyY));
    }
    return { index, phase, rootAdvancePx: phase * cycleStridePx, bodyAnchor: [bodyX + bodyWidth / 2, bodyY], limbs: limbs.map(limb => {
      const p = (phase + limb.phase) % 1, contact = neutral || p < contactRatio, u = (p - contactRatio) / (1 - contactRatio);
      const hip = [bodyX + limb.root[0] * bodyWidth, bodyY + limb.root[1] * bodyHeight];
      const progress = smoothSwing ? (1 - Math.cos(Math.PI * u)) / 2 : u;
      const dx = neutral ? 0 : contact ? A - 2 * A * p / contactRatio : -A + 2 * A * progress;
      const soleY = groundY - (contact ? 0 : lift * Math.sin(Math.PI * u));
      const offset = [(limb.sole[0] - limb.ankle[0]) * limb.scale, (limb.sole[1] - limb.ankle[1]) * limb.scale];
      const ankle = [hip[0] + dx - (ankleCentered || neutral ? 0 : offset[0]), soleY - offset[1]];
      const sole = [ankle[0] + offset[0], soleY];
      const knee = solveLeg(hip, ankle, limb.l1, limb.l2, limb.bend, `W${wave.wave} frame ${index} ${limb.id}`);
      return { id: limb.id, hip, knee, ankle, sole, contact };
    }) };
  };
  const supportAngles = [], preflightSamples = smoothSwing ? 256 : count;
  for (let i = 0; i < preflightSamples; i++) {
    const f = poseAt(i / preflightSamples, `preflight-${i}`);
    if (supportPelvis) for (const l of f.limbs.filter(l => l.contact)) {
      const def = limbs.find(d => d.id === l.id), d = distance(l.hip, l.ankle);
      const angle = Math.acos(Math.max(-1, Math.min(1, (def.l1 ** 2 + def.l2 ** 2 - d ** 2) / (2 * def.l1 * def.l2)))) * 180 / Math.PI;
      if (angle < 160 || angle > 175) throw new Error(`W${wave.wave} ${l.id}: support knee ${angle.toFixed(2)} degrees outside 160..175 at phase ${f.phase}; adjust amplitude or target angle`);
      supportAngles.push(angle);
    }
  }
  const frames = Array.from({ length: count }, (_, index) => poseAt(index / count, index));
  const neutralFrame = poseAt(0, 'neutral', true);
  const kinematics = { mode: supportPelvis ? 'support-leg-pelvis' : 'fixed-body', supportKneeAngle, contactRatio, ankleCentered, swingEasing: smoothSwing ? 'cosine' : 'linear', amplitude: A, lift, pelvis, supportAngleRange: supportAngles.length ? [Math.min(...supportAngles), Math.max(...supportAngles)] : null, preflightSamples };
  if (wave.supportCurve) {
    if (wave.supportCurve !== 'constraint-envelope') throw new Error('unsupported supportCurve');
    kinematics.supportCurve = wave.supportCurve;
  }
  return { wave: wave.wave, type: wave.type, source: wave.source, sourceSha256, sourceSize: [raw.W, raw.H], parts, limbs, frames, neutralFrame, cell, body: { x: bodyX, y: frames[0].bodyAnchor[1], configuredY: bodyTop, width: bodyWidth, height: bodyHeight, scale: bodyScale }, bodyLayer, kinematics, amplitude: A, lift, groundY, cycleStridePx };
}

export async function rasterize(page, rig) {
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
      // Deterministic two-pass chamfer distance inside the original alpha mask.
      // Padding treats the trimmed image border as transparent without blurring
      // colors into the matte. The original silhouette supplies the distance,
      // so the artificial knee segment boundary never receives edge feathering.
      let edgeDistance = null, edgeStride = im.width + 2;
      if (def.proximalEdgeFeather > 0) {
        edgeDistance = new Float32Array(edgeStride * (im.height + 2));
        for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (alpha[(y * im.width + x) * 4 + 3] > 28) edgeDistance[(y + 1) * edgeStride + x + 1] = Infinity;
        const diagonal = Math.SQRT2;
        for (let y = 1; y <= im.height; y++) for (let x = 1; x <= im.width; x++) {
          const i = y * edgeStride + x;
          edgeDistance[i] = Math.min(edgeDistance[i], edgeDistance[i - 1] + 1, edgeDistance[i - edgeStride] + 1, edgeDistance[i - edgeStride - 1] + diagonal, edgeDistance[i - edgeStride + 1] + diagonal);
        }
        for (let y = im.height; y > 0; y--) for (let x = im.width; x > 0; x--) {
          const i = y * edgeStride + x;
          edgeDistance[i] = Math.min(edgeDistance[i], edgeDistance[i + 1] + 1, edgeDistance[i + edgeStride] + 1, edgeDistance[i + edgeStride - 1] + diagonal, edgeDistance[i + edgeStride + 1] + diagonal);
        }
      }
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
        g.clip(); g.drawImage(im, 0, 0);
        if (kind === 'upper' && def.proximalFeather > 0) {
          // Feather only the very top attachment, leaving the rounded haunch,
          // knee cap and the remainder of the thigh at their authored opacity.
          const fadeEnd = def.knee[1] * def.proximalFeather;
          const fade = g.createLinearGradient(0, 0, 0, fadeEnd);
          fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
          g.globalCompositeOperation = 'destination-in'; g.fillStyle = fade;
          g.fillRect(0, 0, im.width, im.height);
        }
        if (kind === 'upper' && edgeDistance) {
          const pixels = g.getImageData(0, 0, im.width, im.height), featherPx = def.proximalEdgeFeather * im.width;
          const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
          // Keep side-edge cleanup through the bulky proximal thigh. Starting
          // the taper at the hip left the lower oval outline almost untouched.
          // The final section fades smoothly to zero at the knee; neither the
          // lower segment nor the rigid hock/foot receives this mask.
          const taperStart = def.hip[1] + .55 * (def.knee[1] - def.hip[1]), taperEnd = def.knee[1];
          for (let y = 0; y < Math.min(im.height, Math.ceil(taperEnd)); y++) {
            const weight = 1 - smooth((y - taperStart) / (taperEnd - taperStart));
            for (let x = 0; x < im.width; x++) {
              const a = (y * im.width + x) * 4 + 3, ramp = smooth(edgeDistance[(y + 1) * edgeStride + x + 1] / featherPx);
              pixels.data[a] = Math.round(pixels.data[a] * (1 - weight + weight * ramp));
            }
          }
          g.putImageData(pixels, 0, 0);
        }
        return c;
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
    const textured = [], preview = [], debug = []; let neutral = null;
    for (const f of [...rig.frames, rig.neutralFrame]) {
      const c = cv(rig.cell, rig.cell), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      const bodyY = f.bodyAnchor[1];
      for (const side of ['far', 'near']) {
        if (side === 'near') g.drawImage(images.body, rig.body.x, bodyY, rig.body.width, rig.body.height);
        for (const def of rig.limbs.filter(l => l.side === side)) limbArt(g, def, f.limbs.find(l => l.id === def.id));
      }
      // The body atlas contains no legs. Its complete original alpha mask covers
      // the attachment roots and clothing hem; feet and exposed legs stay visible.
      if (rig.bodyLayer === 'full-alpha-overlay') g.drawImage(images.body, rig.body.x, bodyY, rig.body.width, rig.body.height);
      const d = g.getImageData(0, 0, rig.cell, rig.cell).data;
      for (let i = 0; i < rig.cell; i++) if (d[i * 4 + 3] > 28 || d[((rig.cell - 1) * rig.cell + i) * 4 + 3] > 28 || d[(i * rig.cell) * 4 + 3] > 28 || d[(i * rig.cell + rig.cell - 1) * 4 + 3] > 28) throw new Error(`W${rig.wave} frame ${f.index}: artwork touches output boundary`);
      const encoded = c.toDataURL('image/png').split(',')[1];
      if (f.index === 'neutral') { neutral = encoded; continue; }
      textured.push(encoded);
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
    return { textured, preview, debug, neutral };
  }, rig);
}

async function writeGif(frames, width, height, file, delay = 100) {
  const count = frames.length;
  const raw = await sharp({ create: { width, height: height * count, channels: 4, background: '#253438' } }).composite(frames.map((input, i) => ({ input: Buffer.from(input, 'base64'), left: 0, top: i * height }))).raw().toBuffer();
  await sharp(raw, { raw: { width, height: height * count, channels: 4, pageHeight: height } }).gif({ delay: Array(count).fill(delay), loop: 0, effort: 7 }).toFile(file);
}

async function main() {
const args = process.argv.slice(2);
const opt = (key, fallback) => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const configPath = path.resolve(repo, opt('config', 'tools/art-review/pr29-gait/rig-config.json'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const out = path.resolve(repo, opt('out', 'gen/pr29-gait'));
const cell = positiveInteger(config.cell ?? 512, 'cell'), count = positiveInteger(config.frames ?? 8, 'frames');
if (count !== 8 || !Array.isArray(config.waves) || !config.waves.length) throw new Error('rig requires eight frames and at least one configured wave');
if (new Set(config.waves.map(w => w.wave)).size !== config.waves.length) throw new Error('wave numbers must be unique');
const prepared = [];
for (const wave of config.waves) prepared.push(await prepareWave(wave, { cell, count }));
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
    await writeGif(rendered.preview, cell, cell, path.join(out, `${id}-preview.gif`), config.frameDelayMs ?? 100);
    await writeGif(rendered.debug, cell * 2, cell, path.join(out, `${id}-debug.gif`), config.frameDelayMs ?? 100);
    fs.writeFileSync(path.join(out, `${id}-debug.png`), Buffer.from(rendered.debug[0], 'base64'));
    fs.writeFileSync(path.join(out, `${id}-neutral.png`), Buffer.from(rendered.neutral, 'base64'));
    manifest.waves.push({
      wave: rig.wave, type: rig.type, source: rig.source, sourceSha256: rig.sourceSha256, sourceSize: rig.sourceSize,
      sheet: `casual/enemies/inf/${id}-walk-4x2.png`, still: `casual/enemies/inf/${id}.png`,
      neutral: `${id}-neutral.png`, neutralPose: rig.neutralFrame,
      cycleStridePx: rig.cycleStridePx, groundY: rig.groundY, body: rig.body, bodyLayer: rig.bodyLayer, kinematics: rig.kinematics,
      parts: Object.fromEntries(Object.entries(rig.parts).map(([name, part]) => [name, { regionNormalized: part.regionNormalized, sourceBounds: part.sourceBounds, width: part.width, height: part.height }])),
      limbs: rig.limbs.map(l => ({
        id: l.id, pair: l.pair, side: l.side, phaseOffset: l.phase, sourcePart: l.part,
        sourceJoints: { hip: l.hip, knee: l.knee, ankle: l.ankle, sole: l.sole }, rootNormalized: l.root, socketRoi: l.socketRoi,
        bodySocket: { normalized: l.root, local: [l.root[0] * rig.body.width, l.root[1] * rig.body.height] },
        kneeBend: l.bend, distalJoint: l.distalJoint, proximalFeather: l.proximalFeather, proximalEdgeFeather: l.proximalEdgeFeather,
        inputLegScale: l.inputScale, legScale: l.scale, standingReachScaleFactor: l.scale / l.inputScale, linkLengths: [l.l1, l.l2],
      })), frames: rig.frames,
    });
    console.log(`W${rig.wave}: ${count} frames, stride ${rig.cycleStridePx}px; ${rig.limbs.map(l => `${l.id} links=${l.l1.toFixed(1)}+${l.l2.toFixed(1)}`).join(', ')}`);
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, 'rig-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Rig output: ${out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
