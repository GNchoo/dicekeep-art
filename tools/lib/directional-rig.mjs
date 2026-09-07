// Source-pinned, fixed-scale directional puppet preparation and geometry QA.
// Screen projection is separate from the sagittal joint coordinate system.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { loadRaw } from './sheet.mjs';
import { prepareLegacySheet, rasterizeLegacySheet } from './directional-legacy-sheet.mjs';
import { extractPart, prepareWave, solveLeg, rasterize as rasterizeLegacy } from '../rig-walk.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const finite = (n, name) => { if (!Number.isFinite(n)) throw new Error(name + ' must be finite'); return n; };
const positive = (n, name) => { finite(n, name); if (n <= 0) throw new Error(name + ' must be positive'); return n; };
const point = (p, name) => { if (!Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n))) throw new Error(name + ' must be [x,y]'); return p; };
const unitPoint = (p, name) => { point(p, name); if (p.some(n => n < 0 || n > 1)) throw new Error(name + ' must be normalized'); return p; };
const span = a => Math.max(...a) - Math.min(...a);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mod = n => (n % 1 + 1) % 1;
const angleAt = (a, b, d) => Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b)))) * 180 / Math.PI;
const reachAt = (a, b, angle) => Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(angle * Math.PI / 180));
const forwardFor = name => name === 'side' ? [1, 0] : name === 'front' ? [0, 1] : [0, -1];

// Templates only remove repeated data entry. They never grant visual approval.
export function expandConfig(input) {
  const merge = (a, b) => {
    if (!a || !b || Array.isArray(a) || Array.isArray(b) || typeof a !== 'object' || typeof b !== 'object') return structuredClone(b);
    const r = structuredClone(a); for (const [k, v] of Object.entries(b)) r[k] = k in r ? merge(r[k], v) : structuredClone(v); return r;
  };
  const result = structuredClone(input);
  result.entries = input.entries?.map(entry => {
    if (entry.template && !input.templates?.[entry.template]) throw new Error('unknown template: ' + entry.template);
    const e = entry.template ? merge(input.templates[entry.template], entry) : structuredClone(entry);
    if (entry.template) e.reviewApproved = entry.reviewApproved === true;
    for (const v of Object.values(e.views || {})) if (v.atlasRow) {
      const [top, height] = point(v.atlasRow, 'atlasRow');
      if (top < 0 || height <= 0 || top + height > 1) throw new Error('atlasRow must stay inside source');
      for (const part of [v.body, ...(v.parts || [])]) if (part?.roi) { part.roi[1] = top + part.roi[1] * height; part.roi[3] *= height; }
      delete v.atlasRow;
    }
    return e;
  });
  return result;
}

export function validateEntry(entry, canonicalCell = 512) {
  if (!/^(?:w\d{3}|b\d{3}(?:-2)?)$/.test(entry.assetId || '')) throw new Error('assetId must be wNNN, bNNN or bNNN-2');
  if (!['normal', 'boss', 'secondary'].includes(entry.role)) throw new Error('invalid role');
  if (!['legged', 'flight', 'slither', 'float'].includes(entry.locomotion)) throw new Error('invalid locomotion');
  if (!Number.isInteger(entry.wave) || entry.wave < 1 || entry.wave > 101) throw new Error('wave must be 1..101');
  if (Number(entry.assetId.slice(1, 4)) !== entry.wave) throw new Error('assetId number and wave disagree');
  if ((entry.assetId[0] === 'w') !== (entry.role === 'normal')) throw new Error('assetId and role disagree');
  if (entry.assetId.endsWith('-2') !== (entry.role === 'secondary')) throw new Error('secondary requires -2 assetId');
  if (![256, 512].includes(entry.cell) || entry.cell !== (entry.role === 'normal' ? 256 : 512)) throw new Error('normal requires 256 cell; bosses require 512');
  positive(canonicalCell, 'canonicalCell'); positive(entry.referenceHeight, 'referenceHeight');
  if (['legged', 'slither'].includes(entry.locomotion)) positive(entry.cycleStride, 'cycleStride');
  if (entry.cycleStride != null && finite(entry.cycleStride, 'cycleStride') < 0) throw new Error('cycleStride must not be negative');
  if (entry.cycleSeconds != null) positive(entry.cycleSeconds, 'cycleSeconds');
  if (!entry.views || !Object.keys(entry.views).length || Object.keys(entry.views).some(k => !['side', 'front', 'back'].includes(k))) throw new Error('views must contain side/front/back');
  if (entry.reviewApproved !== undefined && typeof entry.reviewApproved !== 'boolean') throw new Error('reviewApproved must be boolean');
  return { count: ['legged', 'slither'].includes(entry.locomotion) ? 8 : 4, canonicalCell };
}

export function validatePreparedViews(entry, views) {
  if (entry.locomotion !== 'legged') return { checked: false, reason: 'no walking limb identities' };
  const signatures = [];
  for (const [name, rig] of Object.entries(views)) {
    const legacy = rig.kind === 'legacy', defs = legacy ? rig.legacy.limbs : rig.limbs;
    if (legacy && Object.keys(views).length > 1 && !entry.views[name].legacyRig.limbIds) throw new Error('legacy side with other views requires explicit legacyRig.limbIds physical identity map');
    const legs = defs.map(l => ({ id: legacy ? entry.views[name].legacyRig.limbIds?.[l.id] ?? l.id : l.id, phase: l.phase, socket: l.socket, layer: l.layer }));
    const signature = legs.map(l => [l.id, l.phase]).sort((a, b) => a[0].localeCompare(b[0]));
    if (signatures.length && JSON.stringify(signature) !== JSON.stringify(signatures[0].limbs)) throw new Error(entry.assetId + ': physical limb IDs/phases change between directions');
    if (!legacy) for (const left of legs.filter(l => /^left(?:Fore|Hind|Leg[1-4]?)$/.test(l.id))) {
      const right = legs.find(l => l.id === left.id.replace(/^left/, 'right'));
      if (!right) throw new Error('physical left limb lacks right partner');
      if (name === 'front' && left.socket[0] <= right.socket[0]) throw new Error('front physical left limb must appear on screen right');
      if (name === 'back' && left.socket[0] >= right.socket[0]) throw new Error('back physical left limb must appear on screen left');
      if (name === 'side' && left.layer >= right.layer) throw new Error('right-facing side physical left limb is far, behind right limb');
    }
    signatures.push({ view: name, limbs: signature });
  }
  return { checked: true, signatures, convention: 'physical animal left/right; front left appears screen-right, back left screen-left, right-facing side sees right near limbs' };
}

export async function prepareView(entry, name, view, repo, canonicalCell = 512) {
  const { count } = validateEntry(entry, canonicalCell);
  const pivot = point(view.pivot, name + '.pivot');
  if (pivot.some(n => n < 0 || n > canonicalCell)) throw new Error('pivot outside canonical cell');
  if (view.legacySheet) return prepareLegacySheet(entry, name, view, repo, canonicalCell);
  if (view.legacyRig) {
    if (name !== 'side' || entry.locomotion !== 'legged') throw new Error('legacyRig supports legged side only');
    const config = JSON.parse(fs.readFileSync(path.resolve(repo, view.legacyRig.config), 'utf8'));
    const original = config.waves.find(w => w.wave === view.legacyRig.wave);
    if (!original) throw new Error('legacy wave missing');
    const wave = { ...structuredClone(original), ...(view.legacyRig.overrides || {}) };
    wave.amplitude *= view.legacyRig.strideMultiplier ?? 1;
    const legacy = await prepareWave(wave, { cell: canonicalCell, count });
    if (Math.abs(legacy.cycleStridePx - entry.cycleStride) > 1e-6) throw new Error('legacy stride and entry cycleStride differ');
    const motionFrames = legacy.frames.map(frame => ({ phase: frame.phase, legs: frame.limbs.map(l => ({ id: view.legacyRig.limbIds?.[l.id] ?? l.id, contact: l.contact, phase: mod(frame.phase + legacy.limbs.find(d => d.id === l.id).phase), screen: { hip: l.hip, knee: l.knee, ankle: l.ankle, sole: l.sole } })) }));
    return { name, kind: 'legacy', legacy, pivot, canonicalCell, count, frames: legacy.frames, motionFrames,
      provenance: { source: legacy.source, sourceSha256: legacy.sourceSha256, sourceSize: legacy.sourceSize },
      geometry: { passed: true, samples: 256, jointCoordinateSystem: 'unprojected sagittal plane', supportAngleRange: legacy.kinematics.supportAngleRange, sourceStride: legacy.cycleStridePx } };
  }
  const file = path.resolve(repo, view.source), sourceSha256 = sha256(fs.readFileSync(file));
  if (!/^[a-f0-9]{64}$/i.test(view.sourceSha256 || '') || sourceSha256 !== view.sourceSha256.toLowerCase()) throw new Error(name + ': source SHA256 does not match reviewed coordinates');
  const raw = await loadRaw(file, { background: view.background || 'checkerboard', backgroundSeeds: view.backgroundSeeds || [] });
  if (!view.body?.roi || !view.body.target) throw new Error(name + ': body roi and target rectangle required');
  let bodyRaw = raw, bodySource = view.source, bodySha256 = sourceSha256;
  if (view.body.source) {
    bodySource = view.body.source;
    const bodyFile = path.resolve(repo, bodySource); bodySha256 = sha256(fs.readFileSync(bodyFile));
    if (!/^[a-f0-9]{64}$/i.test(view.body.sourceSha256 || '') || bodySha256 !== view.body.sourceSha256.toLowerCase()) throw new Error(name + ': body source SHA256 does not match reviewed coordinates');
    bodyRaw = await loadRaw(bodyFile, { background: view.body.background ?? view.background ?? 'checkerboard', backgroundSeeds: view.body.backgroundSeeds || [] });
  } else if (view.body.sourceSha256) throw new Error('body sourceSha256 requires body.source');
  if (view.body.componentCount !== undefined && (entry.locomotion !== 'flight' || view.body.componentCount !== 3)) throw new Error('body.componentCount is limited to an explicitly reviewed three-body flight swarm');
  const bodyPart = await extractPart(bodyRaw, view.body.roi, entry.assetId + ' ' + name + ' body', { componentCount: view.body.componentCount ?? 1 });
  if (view.body.flipX !== undefined && typeof view.body.flipX !== 'boolean') throw new Error('body.flipX must be boolean');
  if (view.body.flipX) {
    const mirrored = await sharp(Buffer.from(bodyPart.image.split(',')[1], 'base64')).flop().png().toBuffer();
    bodyPart.image = 'data:image/png;base64,' + mirrored.toString('base64');
  }
  let target = view.body.target;
  if (!Array.isArray(target)) { const h = positive(target.height, 'body height'), w = h * bodyPart.width / bodyPart.height; target = [(target.centerX ?? canonicalCell / 2) - w / 2, target.top, w, h]; }
  if (target.length !== 4) throw new Error('body target must be rectangle or {height,top,centerX}');
  const [x, y, width, height] = target.map((n, i) => finite(n, 'body.target[' + i + ']'));
  positive(width, 'body width'); positive(height, 'body height');
  if (Math.abs(width / height / (bodyPart.width / bodyPart.height) - 1) > .015) throw new Error(name + ': body target stretches the authored proportions');
  const parts = {};
  const limbs = [], appendages = [], segments = [];
  const definitions = view.parts || [];
  if (new Set(definitions.map(p => p.id)).size !== definitions.length) throw new Error('duplicate part id');
  for (const original of definitions) {
    const def = structuredClone(original);
    if (def.heightAxis !== undefined) {
      const axis = point(def.heightAxis, def.id + '.heightAxis');
      if (def.type !== 'leg' || entry.locomotion !== 'legged' || entry.anatomy !== 'arthropod' || ![6, 8].includes(definitions.filter(p => p.type === 'leg').length)) throw new Error('heightAxis requires an explicit six/eight-legged arthropod');
      if (Math.abs(Math.hypot(...axis) - 1) > 1e-6 || axis[1] <= 0 || Math.abs(axis[0]) > .65) throw new Error('heightAxis must be a downward unit vector with |x| <= .65');
      if (entry.gait?.pelvis && entry.gait.pelvis !== 'fixed') throw new Error('splayed arthropod heightAxis requires fixed pelvis');
    }
    if (def.flipX !== undefined && (typeof def.flipX !== 'boolean' || !['leg', 'wing', 'appendage', 'segment'].includes(def.type))) throw new Error(def.id + ': flipX must be boolean on leg/wing/appendage/segment');
    if (def.socketNormalized) { unitPoint(def.socketNormalized, def.id + '.socketNormalized'); def.socket = [def.socketNormalized[0] * width, def.socketNormalized[1] * height]; }
    if (def.socketRoiNormalized) { const r = def.socketRoiNormalized; if (!Array.isArray(r) || r.length !== 4 || r.some(n => !Number.isFinite(n) || n < 0 || n > 1) || r[0] + r[2] > 1 || r[1] + r[3] > 1) throw new Error('socketRoiNormalized outside body'); def.socketRoi = [r[0] * width, r[1] * height, r[2] * width, r[3] * height]; }
    if (!/^[a-zA-Z][\w-]*$/.test(def.id || '') || def.id === 'body') throw new Error('invalid part id');
    const part = await extractPart(raw, def.roi, entry.assetId + ' ' + name + ' ' + def.id);
    if (def.type === 'leg' && def.flipX) {
      const mirrored = await sharp(Buffer.from(part.image.split(',')[1], 'base64')).flop().png().toBuffer();
      part.image = 'data:image/png;base64,' + mirrored.toString('base64'); part.sole[0] = part.width - part.sole[0];
    }
    parts[def.id] = part;
    const socket = point(def.socket, def.id + '.socket');
    const layer = finite(def.layer ?? 1, def.id + '.layer');
    const phase = finite(def.phase ?? 0, def.id + '.phase');
    if (phase < 0 || phase >= 1) throw new Error('phase must be 0..1');
    if (def.type === 'leg') {
      const joints = {};
      for (const key of ['hip', 'knee', 'ankle', 'sole']) {
        const p = unitPoint(def.sourceJoints?.[key], def.id + '.' + key);
        joints[key] = [(def.flipX ? 1 - p[0] : p[0]) * part.width, p[1] * part.height];
      }
      if (!(joints.hip[1] < joints.knee[1] && joints.knee[1] < joints.ankle[1] && joints.ankle[1] < joints.sole[1])) throw new Error(def.id + ': isolated source leg must run hip→knee→ankle→sole downward');
      if (def.calibrate) {
        const desired = (positive(def.calibrate.groundY, 'calibrate.groundY') - y - socket[1]) / (def.heightAxis?.[1] ?? 1);
        const angle = finite(def.calibrate.maximumStanceAngle ?? 166, 'maximumStanceAngle');
        if (angle < 160 || angle > 175 || desired <= 0) throw new Error('invalid fixed-scale standing calibration');
        const a = distance(joints.hip, joints.knee), b = distance(joints.knee, joints.ankle), f = joints.sole[1] - joints.ankle[1];
        const A = entry.cycleStride * (entry.gait?.stanceDuty ?? (definitions.filter(p => p.type === 'leg').length === 2 ? .5 : .65)) / 2, r = reachAt(a, b, angle), q = r * r - f * f;
        if (q <= 0) throw new Error('calibration has incompatible foot and leg lengths');
        def.legScale = (-2 * desired * f + Math.sqrt((2 * desired * f) ** 2 + 4 * q * (desired * desired + A * A))) / (2 * q);
        def.standingReach = desired - f * def.legScale;
      }
      const scale = positive(def.legScale, def.id + '.legScale');
      const links = [distance(joints.hip, joints.knee) * scale, distance(joints.knee, joints.ankle) * scale];
      const H = positive(def.standingReach ?? reachAt(...links, 168), def.id + '.standingReach');
      if (![1, -1].includes(def.bend)) throw new Error(def.id + ': bend must be +/-1 in sagittal space');
      const socketRoi = def.socketRoi;
      if (!Array.isArray(socketRoi) || socketRoi.length !== 4 || socketRoi.some(n => !Number.isFinite(n)) || socketRoi[2] <= 0 || socketRoi[3] <= 0 || socket[0] < socketRoi[0] || socket[0] > socketRoi[0] + socketRoi[2] || socket[1] < socketRoi[1] || socket[1] > socketRoi[1] + socketRoi[3]) throw new Error(def.id + ': reviewed body-local socketRoi must contain socket');
      limbs.push({ ...def, socket, socketRoi, layer, phase, joints, links, scale, H, footOffset: joints.sole.map((v, i) => (v - joints.ankle[i]) * scale) });
    } else if (def.type === 'wing' || def.type === 'appendage') {
      const sp = unitPoint(def.sourcePivot, def.id + '.sourcePivot');
      const swing = point(def.angleDeg, def.id + '.angleDeg [mean,amplitude]');
      positive(Math.abs(swing[1]), 'articulated appendage amplitude');
      appendages.push({ ...def, socket, layer, phase, sourcePivot: [sp[0] * part.width, sp[1] * part.height], scale: positive(def.scale, def.id + '.scale'), angleDeg: swing });
    } else if (def.type === 'segment') {
      const start = unitPoint(def.sourceJoints?.start, def.id + '.start'), end = unitPoint(def.sourceJoints?.end, def.id + '.end');
      const a = [start[0] * part.width, start[1] * part.height], b = [end[0] * part.width, end[1] * part.height];
      const scale = positive(def.scale, def.id + '.scale');
      segments.push({ ...def, socket, layer, phase, start: a, end: b, length: distance(a, b) * scale, scale, angleDeg: point(def.angleDeg, def.id + '.angleDeg') });
    } else throw new Error('unsupported part type: ' + def.type);
  }
  if (entry.locomotion === 'legged' && entry.anatomy === 'hand') {
    const fingers = ['thumb', 'index', 'middle', 'ring', 'little'];
    if (limbs.length !== 5 || fingers.some(id => !limbs.some(l => l.id === id)) || new Set(limbs.map(l => l.phase)).size !== 5) throw new Error('hand requires five named fingers with distinct footfalls');
  } else if (entry.locomotion === 'legged' && ![2, 4, 6, 8].includes(limbs.length)) throw new Error('legged requires 2/4/6/8 articulated legs; whole-body bob is not a gait');
  if (entry.locomotion === 'flight' && appendages.filter(a => a.type === 'wing').length < 2) throw new Error('flight requires at least two independently articulated wing parts');
  if (entry.locomotion === 'slither' && segments.length < 3) throw new Error('slither requires at least three linked moving segments');
  const names = ['body', ...definitions.map(p => p.id)];
  if (view.layerOrderFrames) {
    if (view.layerOrderFrames.length !== count || view.layerOrderFrames.some(order => order.length !== names.length || new Set(order).size !== names.length || names.some(id => !order.includes(id)))) throw new Error('layerOrderFrames must list every body/part exactly once for each frame');
  }
  const projection = { forward: point(view.projection?.forward || forwardFor(name), name + '.forward'), height: point(view.projection?.height || [0, 1], name + '.height') };
  const expected = forwardFor(name);
  if (distance(projection.forward, expected) > 1e-6) throw new Error('forward projection must match unit game direction; do not hide stride changes by per-view scaling');
  if (projection.height[1] <= 0 || Math.abs(projection.height[0]) > .05) throw new Error('height projection must remain downwards');
  const gait = { duty: entry.gait?.stanceDuty ?? (limbs.length === 2 ? .5 : .65), lift: entry.gait?.lift ?? 20, pelvis: entry.gait?.pelvis ?? (limbs.length === 2 ? 'support' : 'fixed') };
  if (limbs.length && (!(gait.duty > 0 && gait.duty < 1) || !(gait.lift > 0))) throw new Error('invalid contact duty/lift');
  if (limbs.length === 2 && Math.abs(mod(limbs[1].phase - limbs[0].phase) - .5) > 1e-8) throw new Error('biped legs must be half a cycle apart');
  if (limbs.length === 4 && new Set(limbs.map(l => l.phase)).size !== 4) throw new Error('quadruped walking requires four distinct footfalls');
  const rig = { name, kind: 'projected', assetId: entry.assetId, locomotion: entry.locomotion, pivot, canonicalCell, count,
    anatomy: entry.anatomy || null,
    stride: entry.cycleStride || 0, body: { ...bodyPart, x, y, width, height, layer: view.body.layer ?? 0 }, parts, limbs, appendages, segments, projection, gait,
    layerOrderFrames: view.layerOrderFrames || null, hover: entry.hover || { lift: canonicalCell * .012, roll: 1.5 },
    provenance: { source: view.source, sourceSha256, sourceSize: [raw.W, raw.H], body: { source: bodySource, sourceSha256: bodySha256, sourceSize: [bodyRaw.W, bodyRaw.H], roi: view.body.roi, sourceBounds: bodyPart.sourceBounds }, parts: definitions.map(p => ({ id: p.id, roi: p.roi, sourceBounds: parts[p.id].sourceBounds, flipX: p.flipX === true, sourceJoints: p.sourceJoints || null })) } };
  rig.provenance.body.componentCount = bodyPart.componentAreas.length;
  rig.provenance.body.componentAreas = bodyPart.componentAreas;
  rig.provenance.body.flipX = view.body.flipX === true;
  const dense = Array.from({ length: 256 }, (_, i) => poseAt(rig, i / 256));
  rig.geometry = inspectGeometry(rig, dense);
  if (!rig.geometry.passed) throw new Error(entry.assetId + ' ' + name + ': ' + rig.geometry.errors.join('; '));
  rig.frames = Array.from({ length: count }, (_, i) => poseAt(rig, i / count));
  rig.neutral = poseAt(rig, 0, true);
  return rig;
}

export function poseAt(rig, phase, neutral = false) {
  const { gait, limbs, projection } = rig;
  const A = rig.stride * gait.duty / 2;
  let bodyDrop = 0;
  if (limbs.length && gait.pelvis === 'support' && !neutral) {
    const H = limbs.reduce((s, l) => s + l.H, 0) / limbs.length;
    if (A >= H) throw new Error('amplitude exceeds standing reach');
    bodyDrop = (H - Math.sqrt(H * H - A * A)) * Math.cos(2 * Math.PI * phase) ** 4;
    let low = -Infinity, high = Infinity;
    for (const l of limbs) {
      const p = mod(phase + l.phase); if (p >= gait.duty) continue;
      const dx = A - 2 * A * p / gait.duty, [a, b] = l.links;
      const rlo = reachAt(a, b, 161), rhi = reachAt(a, b, 174);
      if (Math.abs(dx) >= rlo) throw new Error(l.id + ': stride outside support angle envelope');
      low = Math.max(low, l.H - Math.sqrt(rhi * rhi - dx * dx));
      high = Math.min(high, l.H - Math.sqrt(rlo * rlo - dx * dx));
    }
    if (low > high) throw new Error('incompatible support legs');
    bodyDrop = Math.max(low, Math.min(high, bodyDrop));
  }
  const hoverY = rig.locomotion === 'float' && !neutral ? rig.hover.lift * Math.sin(2 * Math.PI * phase) : 0;
  const body = { x: rig.body.x, y: rig.body.y + bodyDrop - hoverY, roll: rig.locomotion === 'float' && !neutral ? rig.hover.roll * Math.cos(2 * Math.PI * phase) : 0 };
  const project = (socket, p, height = projection.height) => [body.x + socket[0] + projection.forward[0] * p[0] + height[0] * p[1], body.y + socket[1] + projection.forward[1] * p[0] + height[1] * p[1]];
  const legs = limbs.map(l => {
    const p = mod(phase + l.phase), contact = neutral || p < gait.duty, u = (p - gait.duty) / (1 - gait.duty);
    const dx = neutral ? 0 : contact ? A - 2 * A * p / gait.duty : -A + A * (1 - Math.cos(Math.PI * u));
    const lift = contact ? 0 : gait.lift * Math.sin(Math.PI * u);
    const hip = [0, 0], ankle = [dx, l.H - bodyDrop - lift], knee = solveLeg(hip, ankle, ...l.links, l.bend, rig.assetId + ' ' + rig.name + ' ' + l.id);
    const sole = [dx, ankle[1] + l.footOffset[1]];
    const screen = Object.fromEntries(Object.entries({ hip, knee, ankle, sole }).map(([key, p]) => [key, project(l.socket, p, l.heightAxis)]));
    // Foot texture offset is screen horizontal, not a forward direction offset.
    screen.sole[0] += l.footOffset[0];
    return { id: l.id, contact, phase: p, lift, ...(l.heightAxis ? { heightAxis: l.heightAxis } : {}), sagittal: { hip, knee, ankle, sole }, screen, kneeAngle: angleAt(...l.links, distance(hip, ankle)), layer: l.layer };
  });
  const appendages = rig.appendages.map(a => ({ id: a.id, socket: [body.x + a.socket[0], body.y + a.socket[1]], angle: (a.angleDeg[0] + (neutral ? 0 : a.angleDeg[1] * Math.sin(2 * Math.PI * (phase + a.phase)))) * Math.PI / 180, layer: a.layer }));
  const segments = []; let previous = null;
  for (const s of rig.segments) {
    const angle = (s.angleDeg[0] + (neutral ? 0 : s.angleDeg[1] * Math.sin(2 * Math.PI * (phase + s.phase)))) * Math.PI / 180;
    const start = previous || [body.x + s.socket[0], body.y + s.socket[1]];
    const end = [start[0] + Math.cos(angle) * s.length, start[1] + Math.sin(angle) * s.length];
    segments.push({ id: s.id, start, end, layer: s.layer }); previous = end;
  }
  return { phase, rootAdvance: phase * rig.stride, body, legs, appendages, segments };
}

export function inspectGeometry(rig, poses) {
  const errors = [], checks = [];
  const fail = (condition, text) => { if (!condition) errors.push(text); };
  let minSupport = Infinity, maxSupport = -Infinity;
  for (const def of rig.limbs) {
    const samples = poses.map(p => p.legs.find(l => l.id === def.id));
    const contact = samples.filter(l => l.contact), swing = samples.filter(l => !l.contact);
    fail(contact.length > 0 && swing.length > 0, def.id + ': requires stance and swing');
    fail(span(samples.map(l => l.sagittal.sole[0])) >= rig.stride * rig.gait.duty * .95, def.id + ': insufficient relative foot travel');
    fail(Math.max(...samples.map(l => l.lift)) >= rig.gait.lift * .95, def.id + ': missing lifted swing');
    for (let i = 0; i < samples.length; i++) {
      const l = samples[i], s = l.sagittal;
      fail(Math.abs(distance(s.hip, s.knee) - def.links[0]) < 1e-6 && Math.abs(distance(s.knee, s.ankle) - def.links[1]) < 1e-6, def.id + ': changing bone length');
      if (l.contact) { minSupport = Math.min(minSupport, l.kneeAngle); maxSupport = Math.max(maxSupport, l.kneeAngle); }
      if (l.contact && rig.gait.pelvis === 'support') fail(l.kneeAngle >= 160 - 1e-8 && l.kneeAngle <= 175 + 1e-8, def.id + ': crouched/hyperextended support');
    }
    const runs = []; let run = [];
    for (let i = 0; i < poses.length; i++) {
      const l = samples[i]; if (!l.contact || (run.length && l.phase < run.at(-1).phase)) { if (run.length > 2) runs.push(run); run = []; }
      if (l.contact) run.push({ phase: l.phase, point: l.screen.sole.map((v, j) => v + poses[i].rootAdvance * rig.projection.forward[j]) });
    }
    if (run.length > 2) runs.push(run);
    const slip = Math.max(0, ...runs.map(r => Math.hypot(span(r.map(p => p.point[0])), span(r.map(p => p.point[1])))));
    fail(slip <= 1e-6, def.id + ': projected contact moves with root (slip ' + slip + ')');
    checks.push({ id: def.id, contacts: contact.length, swings: swing.length, maximumSwingLift: Math.max(...samples.map(l => l.lift)), projectedContactSlip: slip });
  }
  if (rig.anatomy === 'hand') fail(poses.every(p => p.legs.filter(l => l.contact).length >= 3 && p.legs.filter(l => !l.contact).length <= 2), 'finger walk requires at least three supports and no more than two swinging digits');
  else if (rig.limbs.length >= 4) fail(poses.every(p => p.legs.filter(l => l.contact).length >= 2), 'multi-legged walk has fewer than two support feet');
  if (rig.locomotion === 'flight') fail(rig.appendages.filter(a => a.type === 'wing').every(a => span(poses.map(p => p.appendages.find(x => x.id === a.id).angle)) > .25), 'wings do not flap relative to torso');
  if (rig.locomotion === 'slither') {
    fail(new Set(rig.segments.map(s => s.phase)).size >= 3, 'slither segments require a traveling phase wave');
    fail(poses.some(p => p.segments.some((s, i) => i > 0 && Math.abs(Math.atan2(s.end[1] - s.start[1], s.end[0] - s.start[0]) - Math.atan2(p.segments[i - 1].end[1] - p.segments[i - 1].start[1], p.segments[i - 1].end[0] - p.segments[i - 1].start[0])) > .1)), 'slither is a rigid whole-body motion');
  }
  return { passed: errors.length === 0, samples: poses.length, jointCoordinateSystem: rig.anatomy === 'hand' ? 'unprojected finger bend plane; legacy kneeAngle field is the middle finger-joint angle, not a human knee' : 'unprojected sagittal plane; never inferred from front/back PNG angles', sourceStride: rig.stride, supportAngleRange: Number.isFinite(minSupport) ? [minSupport, maxSupport] : null, checks, errors: [...new Set(errors)] };
}

export async function rasterizeView(page, rig) {
  if (rig.kind === 'legacy-sheet') return rasterizeLegacySheet(page, rig);
  if (rig.kind === 'legacy') {
    const result = await rasterizeLegacy(page, rig.legacy);
    return { frames: result.textured, still: result.neutral, preview: result.preview };
  }
  return page.evaluate(async rig => {
    const cv = () => { const c = document.createElement('canvas'); c.width = c.height = rig.canonicalCell; return c; };
    const images = {};
    for (const [id, part] of Object.entries({ body: rig.body, ...rig.parts })) { const im = new Image(); im.src = part.image; await im.decode(); images[id] = im; }
    const pieces = {};
    for (const def of rig.limbs) {
      const im = images[def.id], j = def.joints;
      pieces[def.id] = {};
      const sample = document.createElement('canvas'); sample.width = im.width; sample.height = im.height;
      const sg = sample.getContext('2d'); sg.drawImage(im, 0, 0);
      const alpha = sg.getImageData(0, 0, im.width, im.height).data;
      const radius = joint => {
        let x0 = im.width, x1 = -1;
        for (let y = Math.max(0, Math.round(joint[1]) - 2); y <= Math.min(im.height - 1, Math.round(joint[1]) + 2); y++) for (let x = 0; x < im.width; x++) if (alpha[(y * im.width + x) * 4 + 3] > 150) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        return Math.max(4, Math.min(im.width * .32, (x1 - x0 + 1) / 2));
      };
      for (const name of ['upper', 'lower', 'foot']) {
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.beginPath();
        const circle = joint => { const r = radius(joint); g.moveTo(joint[0] + r, joint[1]); g.arc(joint[0], joint[1], r, 0, Math.PI * 2); };
        if (name === 'upper') { g.rect(0, 0, im.width, j.knee[1]); circle(j.knee); }
        if (name === 'lower') { g.rect(0, j.knee[1], im.width, j.ankle[1] - j.knee[1]); circle(j.knee); circle(j.ankle); }
        if (name === 'foot') { g.rect(0, j.ankle[1], im.width, im.height - j.ankle[1]); circle(j.ankle); }
        g.clip(); g.drawImage(im, 0, 0);
        if (name === 'upper' && def.proximalFeather > 0) {
          const fade = g.createLinearGradient(0, 0, 0, j.knee[1] * def.proximalFeather);
          fade.addColorStop(0, 'transparent'); fade.addColorStop(1, '#fff');
          g.globalCompositeOperation = 'destination-in'; g.fillStyle = fade; g.fillRect(0, 0, im.width, im.height);
        }
        if (name === 'upper' && def.proximalEdgeFeather > 0) {
          const pixels = g.getImageData(0, 0, im.width, im.height), feather = def.proximalEdgeFeather * im.width;
          const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
          for (let y = 0; y < Math.ceil(j.knee[1]); y++) {
            let left = im.width, right = -1;
            for (let x = 0; x < im.width; x++) if (alpha[(y * im.width + x) * 4 + 3] > 28) { left = Math.min(left, x); right = Math.max(right, x); }
            const weight = 1 - smooth((y - (j.hip[1] + .55 * (j.knee[1] - j.hip[1]))) / (.45 * (j.knee[1] - j.hip[1])));
            for (let x = left; x <= right; x++) {
              const i = (y * im.width + x) * 4 + 3;
              pixels.data[i] = Math.round(pixels.data[i] * (1 - weight + weight * smooth(Math.min(x - left, right - x) / feather)));
            }
          }
          g.putImageData(pixels, 0, 0);
        }
        pieces[def.id][name] = c;
      }
    }
    const rasterDiagnostics = [];
    const bone = (g, im, a, b, x, y, widthScale, part, frame) => {
      const su = [b[0] - a[0], b[1] - a[1]], tu = [y[0] - x[0], y[1] - x[1]], sl = Math.hypot(...su), tl = Math.hypot(...tu);
      // An end-on projected segment shorter than one normal-output pixel turns
      // a long texture into an erroneous horizontal hairline. Its rounded
      // adjacent pieces already cover the coincident joints. Cull that strip,
      // retaining all landmark/contact calculations and the rigid paw cap.
      if (part && rig.name !== 'side' && tl < 2) { rasterDiagnostics.push({ frame, part, action: 'cull subpixel end-on bone strip', projectedLengthCanonicalPx: tl, thresholdCanonicalPx: 2 }); return; }
      if (tl < .05 || sl < .05) throw new Error('projected bone collapses');
      g.save(); g.translate(...x); g.rotate(Math.atan2(tu[1], tu[0])); g.scale(tl / sl, widthScale); g.rotate(-Math.atan2(su[1], su[0])); g.drawImage(im, -a[0], -a[1]); g.restore();
    };
    const output = [], preview = []; let still;
    for (const [index, frame] of [...rig.frames, rig.neutral].entries()) {
      const c = cv(), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      const layers = [{ id: 'body', layer: rig.body.layer, draw() {
        g.save(); g.translate(frame.body.x + rig.body.width / 2, frame.body.y + rig.body.height / 2); g.rotate(frame.body.roll * Math.PI / 180); g.drawImage(images.body, -rig.body.width / 2, -rig.body.height / 2, rig.body.width, rig.body.height); g.restore();
      } }];
      for (const f of frame.legs) {
        const d = rig.limbs.find(l => l.id === f.id), p = pieces[d.id];
        // Upper limbs belong behind the torso in these views. Lower links and
        // paws keep the explicitly authored overlap order; a raised thigh must
        // not become an extra ball pasted on the chest or rump.
        layers.push({ id: d.id + ':upper', owner: d.id, upper: true, layer: d.upperLayer ?? Math.min(rig.body.layer - .1, f.layer), draw() {
          g.save(); g.beginPath(); g.rect(0, 0, rig.canonicalCell, Math.max(0, f.screen.sole[1])); g.clip();
          bone(g, p.upper, d.joints.hip, d.joints.knee, f.screen.hip, f.screen.knee, d.scale, d.id + ':upper', index);
          g.restore();
        } });
        layers.push({ id: d.id, layer: f.layer, draw() {
          g.save(); g.beginPath(); g.rect(0, 0, rig.canonicalCell, Math.max(0, f.screen.sole[1])); g.clip();
          bone(g, p.lower, d.joints.knee, d.joints.ankle, f.screen.knee, f.screen.ankle, d.scale, d.id + ':lower', index);
          g.drawImage(p.foot, f.screen.sole[0] - d.joints.sole[0] * d.scale, f.screen.sole[1] - d.joints.sole[1] * d.scale, p.foot.width * d.scale, p.foot.height * d.scale);
          g.restore();
        } });
      }
      for (const f of frame.appendages) { const d = rig.appendages.find(a => a.id === f.id); layers.push({ id: d.id, layer: f.layer, draw() { g.save(); g.translate(...f.socket); g.rotate(f.angle); g.scale(d.flipX ? -d.scale : d.scale, d.scale); g.drawImage(images[d.id], -d.sourcePivot[0], -d.sourcePivot[1]); g.restore(); } }); }
      for (const f of frame.segments) { const d = rig.segments.find(a => a.id === f.id); layers.push({ id: d.id, layer: f.layer, draw() {
        let im = images[d.id], start = d.start, end = d.end;
        // Mirror source art and its pivots together, then attach both mirrored
        // endpoints to the unchanged chain. The gait never breaks at a socket.
        if (d.flipX) { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const cg = c.getContext('2d'); cg.translate(c.width, 0); cg.scale(-1, 1); cg.drawImage(im, 0, 0); im = c; start = [c.width - start[0], start[1]]; end = [c.width - end[0], end[1]]; }
        bone(g, im, start, end, f.start, f.end, d.scale);
      } }); }
      const order = rig.layerOrderFrames?.[index < rig.count ? index : 0];
      const rank = l => l.upper ? Math.min(order.indexOf('body') - .1, order.indexOf(l.owner)) : order.indexOf(l.id);
      layers.sort((a, b) => order ? rank(a) - rank(b) : a.layer - b.layer);
      for (const l of layers) l.draw();
      const data = g.getImageData(0, 0, c.width, c.height).data;
      for (let p = 0; p < c.width; p++) if ([p, (c.height - 1) * c.width + p, p * c.width, p * c.width + c.width - 1].some(i => data[i * 4 + 3] > 28)) throw new Error(rig.assetId + ' ' + rig.name + ': artwork touches output boundary');
      const encoded = c.toDataURL('image/png').split(',')[1];
      if (index === rig.count) { still = encoded; continue; }
      output.push(encoded);
      const pc = cv(), pg = pc.getContext('2d'); pg.fillStyle = '#253438'; pg.fillRect(0, 0, pc.width, pc.height); pg.drawImage(c, 0, 0);
      pg.fillStyle = '#eef1df'; pg.font = 'bold 18px sans-serif'; pg.fillText(`${rig.assetId} ${rig.name} ${index + 1}/${rig.count}`, 12, 24);
      preview.push(pc.toDataURL('image/png').split(',')[1]);
    }
    return { frames: output, still, preview, rasterDiagnostics };
  }, rig);
}
