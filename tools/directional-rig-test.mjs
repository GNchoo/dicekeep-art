import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { validateEntry, prepareView, poseAt, inspectGeometry, rasterizeView, expandConfig, sha256, validatePreparedViews } from './lib/directional-rig.mjs';
import { inspectAlpha } from './lib/directional-image.mjs';
import browserTools from './e2e/browser.cjs';
import { prepareWave, extractPart } from './rig-walk.mjs';
import { loadRaw, foregroundMask } from './lib/sheet.mjs';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const pilot = JSON.parse(fs.readFileSync(new URL('./art-review/directional-101/pilot-forest-rigs.json', import.meta.url), 'utf8'));
const reviewed = JSON.parse(fs.readFileSync(new URL('./art-review/pr29-gait/rig-config.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(new URL('./art-review/pr29-gait/rig-manifest.json', import.meta.url), 'utf8'));
const getView = async name => prepareView(pilot.entries[0], name, pilot.entries[0].views[name], repo);

test('reviewed alpha sources preserve white and translucent foreground without color flooding', async () => {
  const data = Buffer.alloc(40 * 40 * 4);
  for (let y = 8; y < 32; y++) for (let x = 8; x < 32; x++) data.set([255, 255, 255, x === 8 ? 90 : 255], (y * 40 + x) * 4);
  const png = await sharp(data, { raw: { width: 40, height: 40, channels: 4 } }).png().toBuffer();
  const raw = await loadRaw(png, { background: 'alpha' }), mask = foregroundMask(raw);
  assert.equal(mask.reduce((a, b) => a + b, 0), 24 * 24);
  assert.deepEqual(raw.data, data);
  const piece = await extractPart(raw, [0, 0, 1, 1], 'white hair');
  assert.deepEqual(await sharp(Buffer.from(piece.image.split(',')[1], 'base64')).raw().toBuffer(), await sharp(png).extract({ left: 8, top: 8, width: 24, height: 24 }).raw().toBuffer());
  const keyed = foregroundMask(await loadRaw(png, { background: 'checkerboard' }));
  assert.equal(keyed.reduce((a, b) => a + b, 0), 0);
  await assert.rejects(loadRaw(await sharp(png).removeAlpha().png().toBuffer(), { background: 'alpha' }), /existing alpha channel/);
  await assert.rejects(loadRaw(png, { background: 'alpha', backgroundSeeds: [[9, 9]] }), /seeds require/);
});

test('reviewed body reflection preserves source provenance and explicitly authored sockets', async () => {
  const e = pilot.entries[0], v = structuredClone(e.views.side), original = await getView('side');
  v.body.flipX = true;
  const reflected = await prepareView(e, 'side', v, repo);
  const pixels = await sharp(Buffer.from(reflected.body.image.split(',')[1], 'base64')).raw().toBuffer();
  const expected = await sharp(Buffer.from(original.body.image.split(',')[1], 'base64')).flop().raw().toBuffer();
  assert.deepEqual(pixels, expected);
  assert.deepEqual(reflected.limbs.map(l => l.socket), original.limbs.map(l => l.socket));
  assert.equal(reflected.provenance.body.sourceSha256, original.provenance.body.sourceSha256);
  assert.equal(reflected.provenance.body.flipX, true);
  v.body.flipX = 'yes'; await assert.rejects(prepareView(e, 'side', v, repo), /body.flipX must be boolean/);
});

test('explicit swarm preserves exactly three substantial bodies, rejecting extra or undersized pieces', async () => {
  const raw = count => { const data = Buffer.alloc(200 * 100 * 4); for (let i = 0; i < count; i++) for (let y = 20; y < 70; y++) for (let x = 10 + i * 45; x < 40 + i * 45; x++) data.set([150, 30, 20, 255], (y * 200 + x) * 4); return { W: 200, H: 100, data, background: 'runtime' }; };
  const r = raw(3), accepted = await extractPart(r, [0, 0, 1, 1], 'reviewed swarm', { componentCount: 3 });
  assert.equal(accepted.componentAreas.length, 3);
  await assert.rejects(extractPart(r, [0, 0, 1, 1], 'ordinary body'), /expected 1/);
  await assert.rejects(extractPart(raw(4), [0, 0, 1, 1], 'extra insect', { componentCount: 3 }), /expected 3/);
  const tiny = raw(2); for (let y = 30; y < 40; y++) for (let x = 115; x < 125; x++) tiny.data.set([150, 30, 20, 255], (y * 200 + x) * 4);
  await assert.rejects(extractPart(tiny, [0, 0, 1, 1], 'tiny third noise', { componentCount: 3 }), /at least 5%/);
  const view = structuredClone(pilot.entries[0].views.front); view.body.componentCount = 3;
  await assert.rejects(prepareView(pilot.entries[0], 'front', view, repo), /three-body flight swarm/);
});

test('legacy flyer adapter matches the actual game loader pixels and preserves frame cadence/scale', async () => {
  const browser = await browserTools.launchBrowser();
  try {
    const page = await browser.newPage(), game = fs.readFileSync(path.join(repo, 'game.js'), 'utf8');
    await page.addScriptTag({ content: 'let corsBlocked=false;\n' + game.slice(game.indexOf('function isKeyPixel('), game.indexOf('async function loadAssets(')) });
    for (const [id, height, pivot] of [['w004', 328, [255.5, 420]], ['w008', 288, [256, 400]]]) {
      const source = 'casual/enemies/inf/' + id + '-walk-2x2.png', bytes = fs.readFileSync(path.join(repo, source));
      const view = { pivot, legacySheet: { reviewedExisting: true, source, sourceSha256: sha256(bytes), cols: 2, rows: 2, frames: 4, anchor: 'center', stillFrame: 0 } };
      const entry = { assetId: id, wave: Number(id.slice(1)), role: 'normal', cell: 256, locomotion: 'flight', cycleStride: 0, cycleSeconds: .8, referenceHeight: height, views: { side: view } };
      const rig = await prepareView(entry, 'side', view, repo), actual = await rasterizeView(page, rig);
      const expected = await page.evaluate(async src => { const image = new Image(); image.src = src; await image.decode(); return processSheet(image, { cols: 2, rows: 2, stabilize: true, anchor: 'center' }).map(f => ({ w: f.w, h: f.h, png: f.cv.toDataURL('image/png').split(',')[1] })); }, 'data:image/png;base64,' + bytes.toString('base64'));
      for (let i = 0; i < 4; i++) {
        const crop = await sharp(Buffer.from(actual.frames[i], 'base64')).extract({ left: rig.offset[0], top: rig.offset[1], width: expected[i].w, height: expected[i].h }).raw().toBuffer();
        const pixels = await sharp(Buffer.from(expected[i].png, 'base64')).raw().toBuffer();
        assert.equal(sha256(crop), sha256(pixels), id + ' pose ' + i + ' differs from game processSheet');
      }
      assert.equal(actual.still, actual.frames[0]);
      const wrong = structuredClone(view); wrong.legacySheet.sourceSha256 = '0'.repeat(64);
      await assert.rejects(prepareView(entry, 'side', wrong, repo), /SHA256/);
      await assert.rejects(prepareView({ ...entry, referenceHeight: 512 }, 'side', view, repo), /reference mismatch/);
      await assert.rejects(prepareView({ ...entry, cycleSeconds: 1 }, 'side', view, repo), /five fps/);
    }
  } finally { await browser.close(); }
});

test('legacy default configuration reproduces the committed seven landmark trajectories exactly', async () => {
  for (const config of reviewed.waves) {
    const r = await prepareWave(config), old = manifest.waves.find(w => w.wave === config.wave);
    assert.deepEqual(r.frames, old.frames);
    assert.deepEqual(r.kinematics, old.kinematics);
  }
});

test('unmodified 1.5x amplitude rejects old support curves and short quadruped reaches', async () => {
  for (const wave of reviewed.waves) await assert.rejects(prepareWave({ ...wave, amplitude: wave.amplitude * 1.5 }), /support knee|unreachable ankle/);
});

test('widened optional profile retains bones, exact 1.5x stride and 160..175 support', async () => {
  for (const wave of reviewed.waves) {
    const config = { ...wave, amplitude: wave.amplitude * 1.5 };
    if (wave.type === 'biped') config.supportCurve = 'constraint-envelope'; else config.bodyTop += wave.wave === 1 ? 5 : 2;
    const r = await prepareWave(config), old = manifest.waves.find(w => w.wave === wave.wave);
    assert.ok(Math.abs(r.cycleStridePx / old.cycleStridePx - 1.5) < 1e-10);
    for (const limb of r.limbs) assert.deepEqual([limb.l1, limb.l2], old.limbs.find(l => l.id === limb.id).linkLengths);
    if (wave.type === 'biped') { assert.ok(r.kinematics.supportAngleRange[0] >= 160); assert.ok(r.kinematics.supportAngleRange[1] <= 175); }
  }
});

test('legacy moving landmarks preserve physical IDs and original sole coordinates without rerigging', async () => {
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'tools/art-review/directional-101/legacy-wide-rigs.json')));
  for (const entry of config.entries) {
    const view = structuredClone(entry.views.side), quad = [1, 6].includes(entry.wave);
    view.legacyRig.limbIds = quad ? { nearFore: 'rightFore', farFore: 'leftFore', nearHind: 'rightHind', farHind: 'leftHind' } : { near: 'rightLeg', far: 'leftLeg' };
    const rig = await prepareView(entry, 'side', view, repo);
    for (let i = 0; i < 8; i++) for (const old of rig.legacy.frames[i].limbs) {
      const mapped = rig.motionFrames[i].legs.find(l => l.id === view.legacyRig.limbIds[old.id]);
      assert.deepEqual(mapped.screen.sole, old.sole); assert.equal(mapped.contact, old.contact);
      const phase = (i / 8 + rig.legacy.limbs.find(l => l.id === old.id).phase) % 1;
      assert.equal(mapped.phase, phase);
    }
  }
});

test('front/back project distinct directions while preserving actual contact positions', async () => {
  for (const name of ['side', 'front', 'back']) {
    const rig = await getView(name);
    assert.equal(rig.geometry.passed, true);
    assert.equal(rig.geometry.checks.length, 4);
    assert.ok(rig.geometry.checks.every(c => c.projectedContactSlip < 1e-6));
    assert.ok(rig.frames.every(p => p.legs.filter(l => l.contact).length >= 2));
    const a = poseAt(rig, 0), b = poseAt(rig, 1);
    for (const limb of a.legs) for (const key of ['hip', 'knee', 'ankle', 'sole']) {
      const q = b.legs.find(x => x.id === limb.id).screen[key];
      assert.ok(Math.hypot(q[0] - limb.screen[key][0], q[1] - limb.screen[key][1]) < 1e-6);
    }
  }
});

test('static whole-body legged fixture fails even with valid count and alpha', async () => {
  const rig = await getView('front'), neutral = poseAt(rig, 0, true);
  const report = inspectGeometry(rig, Array.from({ length: 256 }, () => structuredClone(neutral)));
  assert.equal(report.passed, false);
  assert.ok(report.errors.some(e => /stance and swing|relative foot travel|lifted swing/.test(e)));
});

test('contact corruption rejects world slip and modified bones independently', async () => {
  const rig = await getView('back'), poses = Array.from({ length: 256 }, (_, i) => poseAt(rig, i / 256));
  poses[5].legs[2].screen.sole[1] += 4;
  poses[5].legs[2].sagittal.knee[0] += 10;
  const result = inspectGeometry(rig, poses);
  assert.ok(result.errors.some(e => /projected contact moves/.test(e)));
  assert.ok(result.errors.some(e => /changing bone/.test(e)));
});

test('source hash, cropped ROI, stretched body, stale socket, fake direction scaling reject before raster', async () => {
  const e = pilot.entries[0];
  for (const [mutate, error] of [
    [v => { v.sourceSha256 = '0'.repeat(64); }, /source SHA256/],
    [v => { v.body.source = v.source; v.body.sourceSha256 = '0'.repeat(64); }, /body source SHA256/],
    [v => { v.body.roi[2] = .25; }, /boundary cuts artwork/],
    [v => { v.body.target[2] *= 1.2; }, /stretches/],
    [v => { v.parts[0].socket[0] += 100; }, /socketRoi/],
    [v => { v.projection = { forward: [0, .5] }; }, /unit game direction/],
  ]) {
    const v = structuredClone(e.views.front); mutate(v);
    await assert.rejects(prepareView(e, 'front', v, repo), error);
  }
});

test('stable boss and subordinate identities cannot silently mix roles', () => {
  const normal = pilot.entries[0];
  validateEntry({ ...normal, assetId: 'b020-2', wave: 20, role: 'secondary', cell: 512 });
  assert.throws(() => validateEntry({ ...normal, assetId: 'b020-2', wave: 20, role: 'boss', cell: 512 }), /secondary/);
  assert.throws(() => validateEntry({ ...normal, assetId: 'b020', wave: 20, role: 'boss' }), /512/);
  assert.throws(() => validateEntry({ ...normal, cycleStride: NaN }), /finite/);
});

function nonGround(locomotion) {
  return { assetId: 'b030-2', name: 'front', locomotion, stride: locomotion === 'slither' ? 120 : 0, body: { x: 100, y: 100 }, limbs: [], gait: { duty: .65, lift: 0, pelvis: 'fixed' }, projection: { forward: [0, 1], height: [0, 1] }, hover: { lift: 6, roll: 2 },
    appendages: locomotion === 'flight' ? [{ id: 'leftWing', type: 'wing', socket: [0, 0], phase: 0, angleDeg: [0, 32], layer: 1 }, { id: 'rightWing', type: 'wing', socket: [40, 0], phase: .5, angleDeg: [0, 32], layer: -1 }] : [],
    segments: locomotion === 'slither' ? Array.from({ length: 4 }, (_, i) => ({ id: 'tail' + i, socket: [20, 20], length: 28, phase: i / 4, angleDeg: [90, 18], layer: i })) : [] };
}
test('flight moves both wings relative to torso; frozen-wing negative fixture rejects', () => {
  const rig = nonGround('flight'), poses = Array.from({ length: 256 }, (_, i) => poseAt(rig, i / 256));
  assert.equal(inspectGeometry(rig, poses).passed, true);
  for (const p of poses) for (const wing of p.appendages) wing.angle = 0;
  assert.equal(inspectGeometry(rig, poses).passed, false);
});
test('slither has connected segment chain and traveling bends, not rigid bob', () => {
  const rig = nonGround('slither'), poses = Array.from({ length: 256 }, (_, i) => poseAt(rig, i / 256));
  for (const p of poses) for (let i = 1; i < p.segments.length; i++) assert.deepEqual(p.segments[i].start, p.segments[i - 1].end);
  assert.equal(inspectGeometry(rig, poses).passed, true);
  rig.segments.forEach(s => { s.phase = 0; s.angleDeg[1] = 0; });
  assert.equal(inspectGeometry(rig, Array.from({ length: 256 }, (_, i) => poseAt(rig, i / 256))).passed, false);
});
test('float hover is explicitly floating and does not claim any planted limb', () => {
  const rig = nonGround('float'), poses = Array.from({ length: 4 }, (_, i) => poseAt(rig, i / 4));
  assert.equal(new Set(poses.map(p => p.body.y)).size, 3);
  assert.ok(poses.every(p => p.legs.length === 0));
});

test('templates transform atlas rows without inheriting art approval or losing physical limb IDs', () => {
  const template = structuredClone(pilot.entries[0]); template.reviewApproved = true;
  const input = { templates: { quad: template }, entries: [{ template: 'quad', assetId: 'w014', wave: 14, views: { side: { atlasRow: [.5, .5] } } }] };
  const e = expandConfig(input).entries[0];
  assert.equal(e.reviewApproved, false);
  assert.equal(e.views.side.body.roi[1], .5 + template.views.side.body.roi[1] * .5);
  assert.equal(e.views.side.body.roi[3], template.views.side.body.roi[3] * .5);
  assert.deepEqual(e.views.front.parts.map(p => [p.id, p.phase]), template.views.front.parts.map(p => [p.id, p.phase]));
  assert.deepEqual(input.templates.quad, template);
  assert.throws(() => expandConfig({ entries: [{ template: 'missing' }] }), /unknown template/);
});

test('physical leg phase and front/back left-right orientation are preserved between views', async () => {
  const e = pilot.entries[0], views = Object.fromEntries(await Promise.all(['side', 'front', 'back'].map(async name => [name, await getView(name)])));
  assert.equal(validatePreparedViews(e, views).checked, true);
  const wrongPhase = structuredClone(views); wrongPhase.back.limbs[0].phase = .125;
  assert.throws(() => validatePreparedViews(e, wrongPhase), /IDs\/phases change/);
  const wrongSocket = structuredClone(views); [wrongSocket.front.limbs[0].socket, wrongSocket.front.limbs[1].socket] = [wrongSocket.front.limbs[1].socket, wrongSocket.front.limbs[0].socket];
  assert.throws(() => validatePreparedViews(e, wrongSocket), /front physical left/);
  const wrongLayer = structuredClone(views); wrongLayer.side.limbs[0].layer = 2;
  assert.throws(() => validatePreparedViews(e, wrongLayer), /left limb is far/);
});

test('legacy wide reference heights preserve world scale and exact 1.5x stride across all seven sizes', () => {
  const wide = JSON.parse(fs.readFileSync(new URL('./art-review/directional-101/legacy-wide-rigs.json', import.meta.url)));
  const old = JSON.parse(fs.readFileSync(new URL('./art-review/pr29-gait/evidence/walk-jitter.json', import.meta.url)));
  for (const e of wide.entries) {
    const row = old.rows.find(r => r.key === 'infW' + e.wave + 'Walk'); assert.equal(e.referenceHeight, row.fh);
    for (const drawSize of [32, 42, 68, 93.5]) {
      const oldStride = row.walkStride * drawSize / row.fh, newStride = e.cycleStride * drawSize / e.referenceHeight;
      assert.ok(Math.abs(newStride / oldStride - 1.5) < 1e-10);
      assert.equal(drawSize / e.referenceHeight, drawSize / row.fh);
    }
  }
});

test('reviewed leg reflection mirrors texture and original joints together without changing link lengths', async () => {
  const e = pilot.entries[0], v = structuredClone(e.views.side), original = await getView('side');
  v.parts[0].flipX = true; const reflected = await prepareView(e, 'side', v, repo);
  const a = original.limbs[0], b = reflected.limbs[0], width = original.parts[a.id].width;
  for (const name of ['hip', 'knee', 'ankle', 'sole']) { assert.ok(Math.abs(a.joints[name][0] + b.joints[name][0] - width) < 1e-9); assert.equal(a.joints[name][1], b.joints[name][1]); }
  a.links.forEach((n, i) => assert.ok(Math.abs(n - b.links[i]) < 1e-9));
  assert.ok(Math.abs(a.footOffset[0] + b.footOffset[0]) < 1e-9);
  const decode = p => sharp(Buffer.from(p.image.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer();
  const pixels = await decode(reflected.parts[a.id]), expected = await sharp(Buffer.from(original.parts[a.id].image.split(',')[1], 'base64')).flop().ensureAlpha().raw().toBuffer();
  assert.deepEqual(pixels, expected);
  assert.equal(reflected.provenance.sourceSha256, original.provenance.sourceSha256);
  assert.equal(reflected.provenance.parts[0].flipX, true);
  assert.deepEqual(reflected.provenance.parts[0].sourceJoints, v.parts[0].sourceJoints);
});

test('declared five-finger hand gait preserves all digits with at most two swinging', async () => {
  const e = structuredClone(pilot.entries[0]); e.assetId = 'w056'; e.wave = 56; e.anatomy = 'hand'; e.cycleStride = 100; e.gait = { stanceDuty: .7, lift: 12, pelvis: 'fixed' };
  const v = e.views.front, original = v.parts[0];
  v.parts = ['thumb', 'index', 'middle', 'ring', 'little'].map((id, i) => ({ ...structuredClone(original), id, phase: i / 5, socket: [25 + i * 22, original.socket[1]], socketRoi: [20 + i * 22, original.socket[1] - 10, 12, 20] }));
  const rig = await prepareView(e, 'front', v, repo);
  assert.equal(rig.limbs.length, 5);
  assert.ok(Array.from({ length: 256 }, (_, i) => poseAt(rig, i / 256)).every(p => p.legs.filter(l => l.contact).length >= 3));
  assert.match(rig.geometry.jointCoordinateSystem, /finger/);
  await assert.rejects(prepareView({ ...e, anatomy: undefined }, 'front', v, repo), /2\/4\/6\/8/);
  const missing = structuredClone(v); missing.parts.pop(); await assert.rejects(prepareView(e, 'front', missing, repo), /five named fingers/);
  const badDuty = { ...e, gait: { ...e.gait, stanceDuty: .4 } }; await assert.rejects(prepareView(badDuty, 'front', v, repo), /three supports/);
});

test('six/eight arthropod legs splay in screen space while preserving fixed sockets, bones and world contacts', async () => {
  const browser = await browserTools.launchBrowser();
  try {
    const page = await browser.newPage();
    for (const count of [6, 8]) {
      const e = structuredClone(pilot.entries[0]); e.anatomy = 'arthropod'; e.cycleStride = 64; e.gait = { stanceDuty: .7, lift: 12, pelvis: 'fixed' };
      const v = structuredClone(e.views.front), source = v.parts[0];
      v.body.target = { height: 130, top: 140, centerX: 256 }; v.pivot = [256, 350];
      v.parts = Array.from({ length: count }, (_, i) => {
        const right = i % 2 === 1, x = right ? .32 : .68, y = .3 + Math.floor(i / 2) * .1;
        return { ...structuredClone(source), id: (right ? 'right' : 'left') + 'Leg' + (Math.floor(i / 2) + 1), socketNormalized: [x, y], socketRoiNormalized: [x - .04, y - .04, .08, .08], phase: i / count, heightAxis: [right ? -.5 : .5, Math.sqrt(.75)], calibrate: { groundY: 350, maximumStanceAngle: 168 } };
      });
      const rig = await prepareView(e, 'front', v, repo);
      validatePreparedViews(e, { front: rig });
      for (const l of rig.neutral.legs) { assert.ok(Math.abs(l.screen.sole[1] - 350) < 1e-6); assert.ok(Math.abs(l.screen.sole[0] - l.screen.hip[0]) > 50); }
      assert.ok(rig.geometry.checks.every(c => c.projectedContactSlip < 1e-6));
      const rendered = await rasterizeView(page, rig);
      assert.equal(rendered.frames.length, 8); assert.ok(new Set(rendered.frames).size >= 6);
      for (const f of [...rendered.frames, rendered.still]) await inspectAlpha(Buffer.from(f, 'base64'), 'arthropod ' + count);
      const wrongSide = structuredClone(rig); [wrongSide.limbs[0].socket, wrongSide.limbs[1].socket] = [wrongSide.limbs[1].socket, wrongSide.limbs[0].socket];
      assert.throws(() => validatePreparedViews(e, { front: wrongSide }), /physical left/);
      for (const axis of [[.5, .5], [.7, Math.sqrt(.51)], [0, -1], [NaN, 1]]) { const bad = structuredClone(v); bad.parts[0].heightAxis = axis; await assert.rejects(prepareView(e, 'front', bad, repo), /heightAxis/); }
      await assert.rejects(prepareView({ ...e, anatomy: undefined }, 'front', v, repo), /explicit six\/eight/);
      await assert.rejects(prepareView({ ...e, gait: { ...e.gait, pelvis: 'support' } }, 'front', v, repo), /fixed pelvis/);
    }
  } finally { await browser.close(); }
});

test('end-on projected hind shin cannot leave the reviewed W18 horizontal hairline', async () => {
  const config = JSON.parse(fs.readFileSync(new URL('./art-review/directional-101/forest-quad-02-rigs.json', import.meta.url)));
  const e = config.entries.find(e => e.wave === 18), rig = await prepareView(e, 'front', e.views.front, repo);
  const browser = await browserTools.launchBrowser();
  try {
    const page = await browser.newPage(), rendered = await rasterizeView(page, rig);
    assert.ok(rendered.rasterDiagnostics.some(d => d.frame === 2 && d.part === 'rightHind:lower' && d.projectedLengthCanonicalPx < 1));
    const data = await sharp(Buffer.from(rendered.frames[2], 'base64')).resize(256, 256).ensureAlpha().raw().toBuffer();
    let opaque = 0; for (let y = 171; y < 175; y++) for (let x = 83; x < 96; x++) if (data[(y * 256 + x) * 4 + 3] > 28) opaque++;
    assert.equal(opaque, 0, 'detached subpixel strip outside the reviewed body/leg silhouette');
    assert.equal(rig.geometry.passed, true);
  } finally { await browser.close(); }
});

test('neutral and 64px fallback checks reject empty and edge-clipped decoded alpha', async () => {
  for (const cell of [64, 256, 512]) {
    const blank = await sharp({ create: { width: cell, height: cell, channels: 4, background: '#0000' } }).png().toBuffer();
    const clipped = await sharp({ create: { width: cell, height: cell, channels: 4, background: '#123456' } }).png().toBuffer();
    await assert.rejects(inspectAlpha(blank), /empty\/clipped/);
    await assert.rejects(inspectAlpha(clipped), /empty\/clipped/);
  }
});

test('flight/slither/float render actual distinct PNG poses; mirror acts about the fixed wing socket', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'directional-raster-'));
  let browser;
  try {
    const file = path.join(directory, 'synthetic-test-atlas.png');
    const atlas = await sharp(Buffer.from('<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg"><ellipse cx="100" cy="120" rx="60" ry="90" fill="#c06b24"/><path d="M235 40 L370 75 L320 150 L235 145 Z" fill="#2bc055"/><path d="M450 45 L485 50 L500 135 L445 135 Z" fill="#3a7cc3"/></svg>')).png().toBuffer();
    fs.writeFileSync(file, atlas);
    const bodyFile = path.join(directory, 'separate-body-source.png');
    const bodyPng = await sharp(Buffer.from('<svg width="200" height="240" xmlns="http://www.w3.org/2000/svg"><ellipse cx="100" cy="120" rx="60" ry="90" fill="#c06b24"/></svg>')).png().toBuffer(); fs.writeFileSync(bodyFile, bodyPng);
    const baseView = { source: file, sourceSha256: sha256(atlas), background: 'runtime', pivot: [256, 350], body: { source: bodyFile, sourceSha256: sha256(bodyPng), background: 'runtime', roi: [0, 0, 1, 1], target: { height: 160, top: 130, centerX: 256 }, layer: 1 }, parts: [] };
    const wing = (id, flipX) => ({ id, type: 'wing', roi: [1 / 3, 0, 1 / 3, 1], socket: [53, 70], sourcePivot: [.05, .5], scale: .8, angleDeg: [0, 28], phase: flipX ? .5 : 0, layer: 0, flipX });
    browser = await browserTools.launchBrowser(); const page = await browser.newPage();
    let mirrorRig;
    for (const locomotion of ['flight', 'slither', 'float']) {
      const v = structuredClone(baseView);
      if (locomotion === 'flight') v.parts = [wing('leftWing', true), wing('rightWing', false)];
      if (locomotion === 'slither') v.parts = Array.from({ length: 4 }, (_, i) => ({ id: 'segment' + i, type: 'segment', roi: [2 / 3, 0, 1 / 3, 1], socket: [53, 120], sourceJoints: { start: [.5, .1], end: [.5, .9] }, scale: .5, angleDeg: [75, 22], phase: i / 4, layer: -1, flipX: i % 2 === 1 }));
      const e = { assetId: 'w016', wave: 16, role: 'normal', cell: 256, locomotion, cycleStride: locomotion === 'slither' ? 100 : 0, cycleSeconds: .8, referenceHeight: 300, views: { front: v } };
      validateEntry(e); const rig = await prepareView(e, 'front', v, repo), rendered = await rasterizeView(page, rig);
      assert.equal(rig.provenance.body.sourceSha256, sha256(bodyPng)); assert.notEqual(rig.provenance.source, rig.provenance.body.source);
      assert.equal(rendered.frames.length, locomotion === 'slither' ? 8 : 4);
      assert.ok(new Set(rendered.frames).size >= (locomotion === 'slither' ? 6 : 3));
      for (const f of [...rendered.frames, rendered.still]) await inspectAlpha(Buffer.from(f, 'base64'), locomotion);
      if (locomotion === 'flight') {
        mirrorRig = rig;
        const bad = structuredClone(v); bad.parts[0].flipX = 'yes';
        await assert.rejects(prepareView(e, 'front', bad, repo), /flipX must be boolean/);
        assert.throws(() => validateEntry({ ...e, cycleStride: NaN }), /finite/);
        assert.throws(() => validateEntry({ ...e, cycleSeconds: 0 }), /positive/);
      }
    }
    // Green texture is the asymmetric wing; compare its centroid about a fixed
    // socket with body/angles unchanged, so whole-body motion cannot pass this.
    const centroid = async flipX => {
      const r = structuredClone(mirrorRig); r.appendages = [r.appendages[1]]; r.appendages[0].flipX = flipX;
      r.frames = r.frames.map(p => ({ ...p, appendages: [p.appendages[1]] })); r.neutral.appendages = [r.neutral.appendages[1]];
      const pixels = await sharp(Buffer.from((await rasterizeView(page, r)).still, 'base64')).ensureAlpha().raw().toBuffer();
      let n = 0, sum = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > pixels[i] * 1.5 && pixels[i + 1] > pixels[i + 2] * 1.5 && pixels[i + 3] > 128) { n++; sum += (i / 4) % 512; }
      assert.ok(n > 100); return sum / n;
    };
    const a = await centroid(false), b = await centroid(true), socketX = mirrorRig.neutral.appendages[1].socket[0];
    assert.ok(a > socketX + 20 && b < socketX - 20);
    assert.ok(Math.abs((a + b) / 2 - socketX) < 1);
  } finally {
    if (browser) await browser.close();
    if (!directory.startsWith(path.join(os.tmpdir(), 'directional-raster-'))) throw new Error('unexpected test cleanup path');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
