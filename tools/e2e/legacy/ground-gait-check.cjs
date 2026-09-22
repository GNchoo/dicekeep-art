// Rig gait validation: actual foot crossing/contact/swing, textured soles and game-space planting.
// node tools/e2e/ground-gait-check.cjs [manifest.json] [--waves=9] [--no-browser] [--preview-assets] [--self-test]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { launchBrowser, gameUrl, outputPath, watchArtErrors } = require('./browser.cjs');
const REPO = path.resolve(__dirname, '../..');
const REQUIRED = [1, 2, 3, 5, 6, 7, 9];
const span = values => Math.max(...values) - Math.min(...values);
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const rms = values => Math.sqrt(mean(values.map(value => value * value)));
const finitePoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const localPhase = (frame, limb) => (frame.phase + limb.phaseOffset) % 1;
const kneeAngle = limb => {
  const a = [limb.hip[0] - limb.knee[0], limb.hip[1] - limb.knee[1]], b = [limb.ankle[0] - limb.knee[0], limb.ankle[1] - limb.knee[1]];
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))))) * 180 / Math.PI;
};
const bendSign = limb => Math.sign((limb.ankle[0] - limb.hip[0]) * (limb.knee[1] - limb.hip[1]) - (limb.ankle[1] - limb.hip[1]) * (limb.knee[0] - limb.hip[0]));

// These checks measure the saved geometry, not the renderer's claimed angle or
// preflight range. Plausible texture seams and anatomy still require visual review.
function validateAnatomy(wave, tracks, check) {
  const result = { profile: wave.kinematics?.mode, limbs: [], pelvis: null, sockets: [], footfalls: null };
  const biped = wave.limbs.length === 2, bodyY = wave.frames.map(frame => frame.bodyAnchor[1]);
  if (biped) {
    check(wave.kinematics?.mode === 'support-leg-pelvis' && wave.kinematics.ankleCentered === true, 'biped requires ankle-centered support-leg pelvis profile');
    check(wave.kinematics.contactRatio === .5, 'biped supporting-leg profile requires half-cycle stance');
    const heightSpan = span(bodyY), rises = [];
    check(heightSpan > 2, 'biped pelvis has no meaningful source-height cycle (>2px required)');
    for (const def of wave.limbs) {
      const stance = wave.frames.filter(frame => tracks[def.id][frame.index].contact);
      const start = [...stance].sort((a, b) => localPhase(a, def) - localPhase(b, def))[0];
      const center = [...stance].sort((a, b) => Math.abs(localPhase(a, def) - wave.kinematics.contactRatio / 2) - Math.abs(localPhase(b, def) - wave.kinematics.contactRatio / 2))[0];
      const rise = start && center ? start.bodyAnchor[1] - center.bodyAnchor[1] : NaN;
      check(Number.isFinite(rise) && rise >= Math.max(1, heightSpan * .4), def.id + ': pelvis does not rise over the supporting foot at midstance');
      rises.push({ id: def.id, startFrame: start?.index, centerFrame: center?.index, rise });
    }
    result.pelvis = { sourceHeightSpan: heightSpan, midstanceRises: rises };
  }
  for (const def of wave.limbs) {
    const track = tracks[def.id], lengths = def.linkLengths;
    const lengthsValid = Array.isArray(lengths) && lengths.length === 2 && lengths.every(n => Number.isFinite(n) && n > 0);
    check(lengthsValid, def.id + ': missing fixed link lengths');
    if (!lengthsValid) continue;
    const angles = track.map(kneeAngle), stanceAngles = angles.filter((_, i) => track[i].contact), swingAngles = angles.filter((_, i) => !track[i].contact);
    const socket = track.map((limb, i) => limb.hip.map((v, axis) => v - wave.frames[i].bodyAnchor[axis]));
    const footOffset = track.map(limb => limb.sole.map((v, axis) => v - limb.ankle[axis]));
    const maximumSocketDrift = Math.max(...socket.map(p => distance(p, socket[0])));
    const maximumBoneError = Math.max(...track.flatMap(limb => [Math.abs(distance(limb.hip, limb.knee) - lengths[0]), Math.abs(distance(limb.knee, limb.ankle) - lengths[1])]));
    check(maximumSocketDrift <= .25, def.id + ': socket moves relative to the body');
    check(maximumBoneError <= .25, def.id + ': bone length changes between poses');
    check(Math.max(...footOffset.map(p => distance(p, footOffset[0]))) <= .25, def.id + ': ankle-to-sole shape changes between poses');
    const signs = track.map(bendSign);
    check(signs.every(sign => sign !== 0 && sign === signs[0]), def.id + ': knee bend flips or locks straight');
    if (Number.isFinite(def.kneeBend)) check(signs.every(sign => sign === def.kneeBend), def.id + ': knee bends against its authored direction');
    if (wave.body && finitePoint(def.bodySocket?.local)) {
      check(track.every((limb, i) => distance([limb.hip[0] - wave.body.x, limb.hip[1] - wave.frames[i].bodyAnchor[1]], def.bodySocket.local) <= .25), def.id + ': hip does not match the authored body-local socket');
    }
    let maximumJointStep = 0, maximumAngleStep = 0, maximumBodyStep = 0;
    for (let i = 0; i < track.length; i++) {
      const next = (i + 1) % track.length;
      for (const joint of ['hip', 'knee', 'ankle', 'sole']) maximumJointStep = Math.max(maximumJointStep, distance(track[i][joint], track[next][joint]));
      maximumAngleStep = Math.max(maximumAngleStep, Math.abs(angles[i] - angles[next]));
      maximumBodyStep = Math.max(maximumBodyStep, distance(wave.frames[i].bodyAnchor, wave.frames[next].bodyAnchor));
    }
    check(maximumJointStep <= (lengths[0] + lengths[1]) * .55 && maximumAngleStep <= 65, def.id + ': discontinuous joint trajectory including loop boundary');
    check(maximumBodyStep <= Math.max(2, (lengths[0] + lengths[1]) * .08), def.id + ': pelvis/body jumps between poses');
    if (def.sourceJoints && Number.isFinite(def.legScale)) {
      const s = def.sourceJoints;
      check(finitePoint(s.hip) && finitePoint(s.knee) && finitePoint(s.ankle) && Math.abs(distance(s.hip, s.knee) * def.legScale - lengths[0]) <= .25 && Math.abs(distance(s.knee, s.ankle) * def.legScale - lengths[1]) <= .25, def.id + ': fixed lengths do not match scaled source bones');
    }
    if (biped) {
      check(stanceAngles.length > 0 && stanceAngles.every(angle => angle >= 160 && angle <= 175), def.id + ': supporting knee must extend to 160–175 degrees in every contact pose');
      check(swingAngles.length > 0 && Math.min(...swingAngles) <= Math.min(...stanceAngles) - 12, def.id + ': swing knee never flexes more than support knee');
      check(span(track.map(limb => limb.hip[1])) > 2, def.id + ': hip remains at a crouched fixed height');
    }
    result.limbs.push({ id: def.id, kneeAngles: angles, stanceKneeRange: [Math.min(...stanceAngles), Math.max(...stanceAngles)], swingKneeRange: [Math.min(...swingAngles), Math.max(...swingAngles)], maximumSocketDrift, maximumBoneError, bendSigns: [...new Set(signs)], maximumJointStep, maximumAngleStep, maximumBodyStep });
  }
  if (!biped) {
    check(wave.kinematics.contactRatio === .65, 'quadruped lateral walk requires reviewed .65 stance duty');
    check(wave.bodyLayer === 'near-limbs-over-body', 'quadruped near legs must remain over the body at their attachment');
    const expectedStarts = ['nearHind', 'nearFore', 'farHind', 'farFore'];
    const starts = wave.limbs.map(def => ({ id: def.id, phase: (1 - def.phaseOffset) % 1 })).sort((a, b) => a.phase - b.phase);
    // A phase offset is added to time, so footfall time is its negative modulo 1.
    check(new Set(starts.map(start => start.phase)).size === 4 && starts.every((start, i) => start.id === expectedStarts[i] && Math.abs(start.phase - i / 4) < 1e-7), 'quadruped must have four distinct lateral-walk contact starts in reviewed order');
    const supports = wave.frames.map(frame => frame.limbs.filter(limb => limb.contact).length);
    check(supports.every(n => n >= 2), 'quadruped walk has fewer than two supporting feet');
    result.footfalls = { starts, supportingFeetPerFrame: supports };
    const body = wave.body;
    check(body && [body.x, body.width, body.height].every(Number.isFinite) && body.width > 0 && body.height > 0, 'quadruped requires body bounds for socket validation');
    if (body && body.width > 0 && body.height > 0) for (const def of wave.limbs) {
      const roi = def.socketRoi;
      const roiValid = Array.isArray(roi) && roi.length === 4 && roi.every(Number.isFinite) && roi[0] >= 0 && roi[1] >= 0 && roi[2] > 0 && roi[3] > 0 && roi[0] + roi[2] <= 1 && roi[1] + roi[3] <= 1;
      check(roiValid, def.id + ': missing reviewed normalized body socket ROI');
      if (!roiValid) continue;
      const points = tracks[def.id].map((limb, i) => [(limb.hip[0] - body.x) / body.width, (limb.hip[1] - wave.frames[i].bodyAnchor[1]) / body.height]);
      check(points.every(p => p[0] >= roi[0] && p[0] <= roi[0] + roi[2] && p[1] >= roi[1] && p[1] <= roi[1] + roi[3]), def.id + ': attachment leaves its reviewed shoulder/haunch ROI');
      check(finitePoint(def.rootNormalized) && points.every(p => distance(p, def.rootNormalized) <= 1e-6), def.id + ': attachment disagrees with authored normalized root');
      const bounds = wave.parts?.body?.sourceBounds;
      const sourceSocket = bounds && [bounds[0] + points[0][0] * bounds[2], bounds[1] + points[0][1] * bounds[3]];
      result.sockets.push({ id: def.id, reviewedRoi: roi, normalizedPoints: points, sourceSocket, sourceAtlas: wave.source });
    }
  }
  return result;
}

function validateWave(wave, cell = 512, count = 8) {
  const errors = [], limbs = [], pairs = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(Number.isInteger(wave.wave) && REQUIRED.includes(wave.wave), 'unknown grounded wave');
  check(Number.isFinite(wave.cycleStridePx) && wave.cycleStridePx > 0, 'invalid cycleStridePx');
  check(Number.isFinite(wave.groundY) && wave.groundY > 0 && wave.groundY < cell, 'invalid groundY');
  check(Array.isArray(wave.frames) && wave.frames.length === count, 'expected ' + count + ' frames');
  check(Array.isArray(wave.limbs) && [2, 4].includes(wave.limbs.length), 'expected two or four defined legs');
  if (errors.length) return { wave: wave.wave, errors, limbs, pairs };
  const duty = wave.kinematics?.contactRatio;
  check(Number.isFinite(duty) && duty >= .5 && duty <= .7, 'missing/unsupported stance contact ratio');
  for (const limb of wave.limbs) check(Number.isFinite(limb.phaseOffset) && limb.phaseOffset >= 0 && limb.phaseOffset < 1, limb.id + ': missing/invalid phaseOffset');
  if (errors.length) return { wave: wave.wave, errors, limbs, pairs };
  const ids = wave.limbs.map(limb => limb.id);
  check(new Set(ids).size === ids.length, 'duplicate limb ID');
  for (const limb of wave.limbs) check(typeof limb.id === 'string' && typeof limb.pair === 'string' && ['near', 'far'].includes(limb.side), 'invalid limb definition');
  for (let i = 0; i < count; i++) {
    const frame = wave.frames[i];
    check(frame && frame.index === i && Math.abs(frame.phase - i / count) < 1e-7, 'frame order/phase mismatch at ' + i);
    if (!frame) continue;
    check(Number.isFinite(frame.rootAdvancePx) && Math.abs(frame.rootAdvancePx - i * wave.cycleStridePx / count) < 0.01, 'root advance mismatch at ' + i);
    check(finitePoint(frame.bodyAnchor), 'invalid body anchor at ' + i);
    check(Array.isArray(frame.limbs) && frame.limbs.length === ids.length && new Set(frame.limbs.map(limb => limb.id)).size === ids.length, 'missing/duplicate frame limbs at ' + i);
    for (const id of ids) {
      const limb = frame.limbs?.find(limb => limb.id === id);
      check(!!limb && typeof limb.contact === 'boolean', 'missing contact state for ' + id + ' frame ' + i);
      for (const joint of ['hip', 'knee', 'ankle', 'sole']) {
        check(limb && finitePoint(limb[joint]) && limb[joint].every(v => v >= 0 && v < cell), 'invalid/out-of-cell ' + id + '.' + joint + ' frame ' + i);
      }
    }
  }
  if (errors.length) return { wave: wave.wave, errors, limbs, pairs };
  const tracks = Object.fromEntries(ids.map(id => [id, wave.frames.map(frame => frame.limbs.find(limb => limb.id === id))]));
  const step = wave.cycleStridePx / count, contactTolerance = 1, slipTolerance = Math.max(1, step * 0.04);
  for (const id of ids) {
    const track = tracks[id], contacts = track.filter(point => point.contact);
    const lift = track.map(point => wave.groundY - point.sole[1]);
    const x = track.map(point => point.sole[0]);
    const def = wave.limbs.find(limb => limb.id === id);
    check(track.every((point, i) => point.contact === (localPhase(wave.frames[i], def) < duty)), id + ': contact state disagrees with declared stance duty and phase');
    let stanceEdges = 0, swingEdges = 0, contactTransitions = 0, maximumSlip = 0, maximumLoopStep = 0;
    check(contacts.length >= 3 && contacts.length <= count - 2, id + ': missing stance or swing interval');
    check(Math.max(...lift) >= cell * 0.02, id + ': swing foot is not visibly lifted');
    check(Math.min(...lift) >= -contactTolerance, id + ': foot penetrates the floor');
    check(contacts.every(point => Math.abs(point.sole[1] - wave.groundY) <= contactTolerance), id + ': contact flag does not match sole height');
    check(span(x) >= wave.cycleStridePx * 0.35, id + ': insufficient forward/backward stride');
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count, a = track[i], b = track[next];
      const dx = b.sole[0] - a.sole[0];
      const dy = b.sole[1] - a.sole[1];
      if (a.contact !== b.contact) contactTransitions++;
      maximumLoopStep = Math.max(maximumLoopStep, Math.hypot(dx, dy));
      if (a.contact && b.contact) {
        stanceEdges++;
        const slip = Math.abs(dx + step);
        maximumSlip = Math.max(maximumSlip, slip);
        check(dx < -step * 0.5, id + ': stance foot does not travel backward relative to body');
        check(slip <= slipTolerance, id + ': planted foot slides in reference world coordinates');
      }
      if (!a.contact && !b.contact) { swingEdges++; check(dx > step * 0.5, id + ': swing foot does not recover forward'); }
    }
    check(contactTransitions === 2, id + ': stance/swing is not one continuous cycle');
    check(stanceEdges >= 2 && swingEdges >= 1, id + ': insufficient measurable stance/swing samples');
    check(maximumLoopStep <= wave.cycleStridePx * 0.5, id + ': discontinuous pose/loop boundary');
    limbs.push({ id, stanceFrames: contacts.length, maximumLift: Math.max(...lift), footXSpan: span(x), maximumReferenceSlip: maximumSlip, maximumLoopStep });
  }
  for (const pair of new Set(wave.limbs.map(limb => limb.pair))) {
    const defs = wave.limbs.filter(limb => limb.pair === pair);
    check(defs.length === 2 && new Set(defs.map(limb => limb.side)).size === 2, pair + ': requires one near and one far leg');
    if (defs.length !== 2 || !defs.some(limb => limb.side === 'near') || !defs.some(limb => limb.side === 'far')) continue;
    const near = tracks[defs.find(limb => limb.side === 'near').id], far = tracks[defs.find(limb => limb.side === 'far').id];
    const difference = near.map((point, i) => point.sole[0] - far[i].sole[0]);
    const margin = Math.max(6, wave.cycleStridePx * 0.1);
    check(Math.min(...difference) < -margin && Math.max(...difference) > margin, pair + ': near/far feet never exchange front/back X order');
    const nearDef = defs.find(limb => limb.side === 'near'), farDef = defs.find(limb => limb.side === 'far');
    check(Math.abs((nearDef.phaseOffset - farDef.phaseOffset + 1) % 1 - .5) < 1e-7, pair + ': near/far phase offsets are not half a cycle apart');
    check(near.every((point, i) => point.contact === far[(i + count / 2) % count].contact), pair + ': near/far contact cycles are not phase opposed');
    const nx = near.map(point => point.sole[0]), fx = far.map(point => point.sole[0]), nm = mean(nx), fm = mean(fx);
    const phaseError = rms(nx.map((x, i) => x - nm - (fx[(i + count / 2) % count] - fm)));
    const liftError = rms(near.map((point, i) => point.sole[1] - far[(i + count / 2) % count].sole[1]));
    check(phaseError <= Math.max(2, wave.cycleStridePx * 0.05) && liftError <= 2, pair + ': limbs do not match at half-cycle offset');
    pairs.push({ pair, minimumNearMinusFarX: Math.min(...difference), maximumNearMinusFarX: Math.max(...difference), phaseError, liftError });
  }
  const anatomy = validateAnatomy(wave, tracks, check);
  return { wave: wave.wave, errors, limbs, pairs, anatomy };
}

function footCoverage(mask, width, height, x, y, radius = 6) {
  let pixels = 0, closest = Infinity;
  for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(height - 1, Math.ceil(y + radius)); py++) {
    for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(width - 1, Math.ceil(x + radius)); px++) {
      const distance = Math.hypot(px - x, py - y);
      if (distance <= radius && mask[py * width + px]) { pixels++; closest = Math.min(closest, distance); }
    }
  }
  return { pixels, closest: Number.isFinite(closest) ? closest : null, valid: pixels >= 3 };
}

function resolveSheet(wave, manifestFile) {
  const name = wave.sheet || 'casual/enemies/inf/w' + String(wave.wave).padStart(3, '0') + '-walk-4x2.png';
  const candidates = [path.resolve(path.dirname(manifestFile), name), path.resolve(REPO, name)];
  const file = candidates.find(file => fs.existsSync(file));
  if (!file) throw new Error('W' + wave.wave + ': missing rendered sheet ' + name);
  return file;
}

async function inspectTexture(wave, manifest, manifestFile) {
  const { loadRaw, cellStats } = await import(pathToFileURL(path.resolve(__dirname, '../lib/sheet.mjs')).href);
  const file = resolveSheet(wave, manifestFile), raw = await loadRaw(file);
  const errors = [], feet = [], bounds = [];
  const sourceFile = typeof wave.source === 'string' ? path.resolve(REPO, wave.source) : '';
  const sourceAtlas = { file: wave.source, sha256: null, matchesReviewedAtlas: false };
  if (!sourceFile || !fs.existsSync(sourceFile)) errors.push('reviewed source atlas is missing');
  else {
    sourceAtlas.sha256 = createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
    sourceAtlas.matchesReviewedAtlas = sourceAtlas.sha256 === wave.sourceSha256;
    if (!sourceAtlas.matchesReviewedAtlas) errors.push('source atlas changed after socket/joint review (SHA256 mismatch)');
  }
  if (raw.W !== manifest.cols * manifest.cell || raw.H !== manifest.rows * manifest.cell) return { wave: wave.wave, file, errors: ['sheet dimensions do not match fixed cells'] };
  for (let i = 0; i < manifest.frames; i++) {
    const cx = i % manifest.cols * manifest.cell, cy = Math.floor(i / manifest.cols) * manifest.cell;
    const stats = cellStats(raw, cx, cy, manifest.cell, manifest.cell);
    if (!stats.n) errors.push('empty textured frame ' + i);
    bounds.push({ x0: stats.x0 - cx, y0: stats.y0 - cy, x1: stats.x1 - cx, y1: stats.y1 - cy });
    for (const limb of wave.frames[i].limbs) {
      const coverage = footCoverage(stats.mask.keep, manifest.cell, manifest.cell, ...limb.sole);
      feet.push({ frame: i, id: limb.id, ...coverage });
      if (!coverage.valid) errors.push('frame ' + i + ' ' + limb.id + ': no rendered foot at declared sole');
    }
  }
  const crop = { x: Math.min(...bounds.map(b => b.x0)), y: Math.min(...bounds.map(b => b.y0)) };
  crop.w = Math.max(...bounds.map(b => b.x1)) - crop.x;
  crop.h = Math.max(...bounds.map(b => b.y1)) - crop.y;
  return { wave: wave.wave, file: path.relative(REPO, file).replaceAll('\\', '/'), sourceAtlas, crop, feet, errors };
}

function transformedPoint(draw, point, crop) {
  const [dx, dy, dw, dh] = draw.args, m = draw.matrix;
  const x = dx + (point[0] - crop.x) * dw / crop.w, y = dy + (point[1] - crop.y) * dh / crop.h;
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

// A .65-duty stance can span frame 7 -> 0. Group actual consecutive contact
// events, never merge the end of one planting with the next footfall.
function contactPoseRuns(draws, frames, id) {
  const runs = [];
  let current = null, previousContact = null;
  for (const draw of draws) {
    const contact = frames[draw.index].limbs.find(limb => limb.id === id).contact;
    if (contact) {
      if (!current) current = { completeStart: previousContact === false, completeEnd: false, draws: [] };
      if (current.draws.at(-1)?.index !== draw.index) current.draws.push(draw);
    } else if (current) {
      current.completeEnd = true; runs.push(current); current = null;
    }
    previousContact = contact;
  }
  if (current) runs.push(current);
  return runs;
}

async function browserCheck(waves, textures, previewAssets = false) {
  const browser = await launchBrowser(), results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 860 } }), allErrors = watchArtErrors(page);
    if (previewAssets) await page.route('**/casual/enemies/inf/*-walk-4x2.png', route => {
      const match = /\/w(\d+)-walk-4x2\.png/.exec(route.request().url());
      const texture = match && textures.find(texture => texture.wave === Number(match[1]));
      return texture ? route.fulfill({ path: path.resolve(REPO, texture.file), contentType: 'image/png' }) : route.continue();
    });
    await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
    for (const wave of waves) {
      const texture = textures.find(texture => texture.wave === wave.wave);
      const loaded = await page.evaluate(({ wave, crop }) => {
        const inf = DKCONTENT.INFINITY, art = inf.art(wave.wave), frames = DKA['infW' + wave.wave + 'Walk'];
        const errors = [], feet = [];
        if (art.stabilize !== false || art.walkStride !== wave.cycleStridePx) errors.push('runtime rig stride/stabilize metadata mismatch');
        if (!Array.isArray(frames) || frames.length !== wave.frames.length) return { errors: [...errors, 'runtime frame count mismatch'], feet };
        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i];
          if (!frame?.cv || frame.w !== crop.w || frame.h !== crop.h) { errors.push('runtime crop/scaling mismatch frame ' + i); continue; }
          const data = frame.cv.getContext('2d').getImageData(0, 0, frame.w, frame.h).data;
          for (const limb of wave.frames[i].limbs) {
            const x = limb.sole[0] - crop.x, y = limb.sole[1] - crop.y;
            let pixels = 0;
            for (let py = Math.max(0, Math.floor(y - 6)); py <= Math.min(frame.h - 1, Math.ceil(y + 6)); py++) for (let px = Math.max(0, Math.floor(x - 6)); px <= Math.min(frame.w - 1, Math.ceil(x + 6)); px++) {
              if (Math.hypot(px - x, py - y) <= 6 && data[(py * frame.w + px) * 4 + 3] > 28) pixels++;
            }
            feet.push({ frame: i, id: limb.id, pixels });
            if (pixels < 3) errors.push('runtime missing textured sole: frame ' + i + ' ' + limb.id);
          }
        }
        return { errors, feet };
      }, { wave, crop: texture.crop });
      results.push({ wave: wave.wave, loaded, errors: [...loaded.errors] });
    }
    if (results.some(result => result.errors.length)) return { waves: results, errors: allErrors };
    await page.click('#ov-btn');
    await page.evaluate(() => { DK.muted = true; DKstartInf('clear'); DK.speed = 1; });
    await page.waitForFunction(() => DK.phase === 'playing');
    await page.evaluate(() => {
      const skip = document.getElementById('coach-skip'); if (skip) skip.click();
      const help = document.getElementById('help-close'); if (help) help.click();
      const original = CanvasRenderingContext2D.prototype.drawImage;
      const frames = new WeakMap();
      for (const [key, value] of Object.entries(DKA)) if (/^infW\d+Walk$/.test(key) && Array.isArray(value)) value.forEach((frame, index) => frames.set(frame.cv, { key, index }));
      window.__gaitDraws = [];
      CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
        const frame = frames.get(source), enemy = DK.enemies[0];
        if (this.canvas.id === 'game' && frame && enemy && frame.key === enemy.artWalk && window.__gaitDraws.length < 1000) {
          const m = this.getTransform();
          window.__gaitDraws.push({ index: frame.index, args, matrix: { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f }, distance: enemy.artWalkDistance, dist: enemy.dist, time: DK.time });
        }
        return original.call(this, source, ...args);
      };
    });
    for (const wave of waves) {
      const result = results.find(result => result.wave === wave.wave), crop = textures.find(texture => texture.wave === wave.wave).crop;
      await page.evaluate(w => { DK.paused = false; DK.enemies = []; DK.spawnQ = []; DK.waveActive = false; DK.wave = w - 1; DK.autoT = 0; DKsync(); document.getElementById('wave-btn').disabled = false; }, wave.wave);
      await page.click('#wave-btn');
      await page.waitForFunction(() => DK.enemies.length > 0, null, { timeout: 15000 });
      const setup = await page.evaluate(() => {
        const enemy = DK.enemies[0], lane = DKLANES()[enemy.lane || 0], frames = DKA[enemy.artWalk];
        const stride = enemy.artWalkStride * enemy.def.size / frames[0].h;
        const segment = lane.segs.find(segment => segment.bx > segment.ax && Math.abs(segment.by - segment.ay) < 0.01 && segment.len > stride * 2.2 + 20);
        if (!segment) throw new Error('No horizontal lane long enough for gait observation');
        DK.enemies = [enemy]; DK.spawnQ = [{ type: enemy.type, t: 1e9 }]; DK.waveActive = true;
        enemy.dist = segment.acc + 10; enemy.artWalkDistance = 0; enemy.face = 1; enemy.burrowT = 1.2;
        window.__gaitDraws = [];
        return { stride, size: enemy.def.size, speed: enemy.def.speed * enemy.spdMult };
      });
      await page.waitForFunction(stride => DK.enemies[0].artWalkDistance >= stride * 2.05 && new Set(window.__gaitDraws.map(draw => draw.index)).size === 8, setup.stride, { timeout: 15000 });
      const draws = await page.evaluate(() => { DK.paused = true; return window.__gaitDraws; });
      const samples = Array.from({ length: 8 }, (_, index) => draws.find(draw => draw.index === index));
      if (samples.some(draw => !draw || draw.args.length !== 4 || ![draw.distance, draw.dist, ...Object.values(draw.matrix)].every(Number.isFinite))) result.errors.push('invalid/missing actual drawn frame');
      const feet = [];
      if (!result.errors.length) {
        for (const limb of wave.limbs) {
          const points = wave.frames.map((frame, index) => ({ index, contact: frame.limbs.find(point => point.id === limb.id).contact, xy: transformedPoint(samples[index], frame.limbs.find(point => point.id === limb.id).sole, crop) }));
          const contactRuns = contactPoseRuns(draws, wave.frames, limb.id);
          const run = contactRuns.find(run => run.completeStart && run.completeEnd);
          const planted = run ? run.draws.map(draw => ({ index: draw.index, xy: transformedPoint(draw, wave.frames[draw.index].limbs.find(point => point.id === limb.id).sole, crop) })) : [];
          const expectedContactPoses = wave.frames.filter(frame => frame.limbs.find(point => point.id === limb.id).contact).length;
          if (planted.length !== expectedContactPoses) { result.errors.push(limb.id + ': did not capture one complete stance with every contact pose'); continue; }
          const slip = span(planted.map(point => point.xy[0])), lift = span(planted.map(point => point.xy[1]));
          const tolerance = Math.max(2, setup.stride / 8);
          if (slip > tolerance) result.errors.push(limb.id + ': actual drawn stance slips ' + slip.toFixed(3) + 'px (limit ' + tolerance.toFixed(3) + ')');
          if (lift > 0.75) result.errors.push(limb.id + ': actual drawn stance bobs ' + lift.toFixed(3) + 'px');
          feet.push({ id: limb.id, points, stanceSamples: planted, stanceFrames: planted.length, measurement: 'First actual draw of each pose within one complete contact event; discrete poses do not prove zero slip between captures.', maximumWorldSwingLift: mean(planted.map(point => point.xy[1])) - Math.min(...points.map(point => point.xy[1])), stanceWorldXSpan: slip, stanceWorldYSpan: lift, slipTolerance: tolerance });
        }
        for (let i = 1; i < draws.length; i++) if (Math.abs((draws[i].distance - draws[i - 1].distance) - (draws[i].dist - draws[i - 1].dist)) > 1e-6) { result.errors.push('gait distance is not actual forward movement'); break; }
      }
      const stopped = await page.evaluate(() => { const enemy = DK.enemies[0]; enemy.stunT = 1; DK.paused = false; return { dist: enemy.dist, distance: enemy.artWalkDistance }; });
      await page.waitForTimeout(220);
      const frozen = await page.evaluate(() => ({ dist: DK.enemies[0].dist, distance: DK.enemies[0].artWalkDistance }));
      if (stopped.dist !== frozen.dist || stopped.distance !== frozen.distance) result.errors.push('stun does not freeze movement/gait');
      const slowStart = await page.evaluate(() => { const enemy = DK.enemies[0]; enemy.stunT = 0; enemy.slowT = 2; enemy.slowPct = 0.5; return { time: DK.time, distance: enemy.artWalkDistance }; });
      await page.waitForFunction(start => DK.time - start >= 0.35, slowStart.time);
      const slowEnd = await page.evaluate(() => ({ time: DK.time, distance: DK.enemies[0].artWalkDistance }));
      const slowRatio = (slowEnd.distance - slowStart.distance) / (slowEnd.time - slowStart.time) / setup.speed;
      if (Math.abs(slowRatio - 0.5) > 0.08) result.errors.push('slowdown is not reflected in gait distance: ' + slowRatio);
      const beforeWrap = await page.evaluate(() => { const enemy = DK.enemies[0], lane = DKLANES()[enemy.lane || 0]; enemy.slowT = 0; enemy.dist = lane.len - 0.1; enemy.laps = 0; return enemy.artWalkDistance; });
      await page.waitForFunction(() => DK.enemies[0].laps > 0, null, { timeout: 2000 });
      const afterWrap = await page.evaluate(() => DK.enemies[0].artWalkDistance);
      if (!(afterWrap > beforeWrap && afterWrap - beforeWrap < setup.speed * 0.25)) result.errors.push('lane wrap resets or jumps gait distance');
      Object.assign(result, { setup, actualFrameOrder: draws.filter((draw, i) => i === 0 || draw.index !== draws[i - 1].index).map(draw => draw.index), feet, stunFrozen: stopped.dist === frozen.dist && stopped.distance === frozen.distance, slowRatio, wrapDistanceDelta: afterWrap - beforeWrap });
      console.log((result.errors.length ? 'FAIL' : 'PASS') + ' gameplay W' + wave.wave + ' ' + result.errors.join('; '));
    }
    const relevant = allErrors.filter(error => {
      const match = /\/inf\/w(\d+)/.exec(error);
      return !match || waves.some(wave => wave.wave === Number(match[1]));
    });
    return { waves: results, errors: relevant, outOfScopeAssetErrors: allErrors.filter(error => !relevant.includes(error)) };
  } finally { await browser.close(); }
}

// Independent analytic fixtures use equal-length links. Their knee is constructed
// from a chord midpoint/perpendicular, without importing the production solver.
function fixture({ quad = false, crouched = false, phases } = {}) {
  const ground = 460, length = quad ? 110 : 90, A = quad ? 35 : 46.8, duty = quad ? .65 : .5;
  const stride = 2 * A / duty, lift = quad ? 28 : 23.4;
  const body = { x: quad ? 110 : 156, width: quad ? 292 : 200, height: quad ? 180 : 200 };
  const defs = quad ? [
    { id: 'nearFore', pair: 'fore', side: 'near', phaseOffset: .75, x: 330 },
    { id: 'farFore', pair: 'fore', side: 'far', phaseOffset: .25, x: 330 },
    { id: 'nearHind', pair: 'hind', side: 'near', phaseOffset: 0, x: 182 },
    { id: 'farHind', pair: 'hind', side: 'far', phaseOffset: .5, x: 182 },
  ] : [{ id: 'near', pair: 'biped', side: 'near', phaseOffset: 0, x: 256 }, { id: 'far', pair: 'biped', side: 'far', phaseOffset: .5, x: 256 }];
  for (const def of defs) {
    if (phases && def.id in phases) def.phaseOffset = phases[def.id];
    const y = quad ? 100 : 180;
    Object.assign(def, { linkLengths: [length, length], kneeBend: -1, bodySocket: { local: [def.x - body.x, y] }, rootNormalized: [(def.x - body.x) / body.width, y / body.height] });
    if (quad) def.socketRoi = def.pair === 'fore' ? [.65, .4, .2, .3] : [.15, .4, .2, .3];
  }
  const supportReach = 2 * length * Math.sin(168 * Math.PI / 360);
  const frames = Array.from({ length: 8 }, (_, index) => {
    const phase = index / 8, supportPhase = phase % .5;
    const supportX = A - stride * supportPhase;
    const bodyY = quad ? 170 : crouched ? 140 : ground - 10 - Math.sqrt(supportReach ** 2 - supportX ** 2) - 180;
    return { index, phase, rootAdvancePx: index * stride / 8, bodyAnchor: [256, bodyY], limbs: defs.map(def => {
      const p = (phase + def.phaseOffset) % 1, contact = p < duty, u = (p - duty) / (1 - duty);
      const dx = contact ? A - stride * p : -A * Math.cos(Math.PI * u);
      const hip = [def.x, bodyY + def.bodySocket.local[1]], sole = [def.x + dx, ground - (contact ? 0 : lift * Math.sin(Math.PI * u))], ankle = [sole[0], sole[1] - 10];
      const d = distance(hip, ankle), half = d / 2, perpendicular = Math.sqrt(length ** 2 - half ** 2);
      const knee = [(hip[0] + ankle[0]) / 2 + perpendicular * (ankle[1] - hip[1]) / d, (hip[1] + ankle[1]) / 2 - perpendicular * (ankle[0] - hip[0]) / d];
      return { id: def.id, hip, knee, ankle, sole, contact };
    }) };
  });
  return { wave: quad ? 1 : 9, type: quad ? 'quad' : 'biped', cycleStridePx: stride, groundY: ground, body, bodyLayer: quad ? 'near-limbs-over-body' : 'full-alpha-overlay', kinematics: { mode: quad ? 'fixed-body' : 'support-leg-pelvis', contactRatio: duty, supportKneeAngle: quad ? null : 168, ankleCentered: !quad }, limbs: defs, frames };
}

function selfTest() {
  const good = fixture();
  assert.deepEqual(validateWave(good).errors, []);
  const cases = [
    ['static feet', w => w.frames.forEach(f => f.limbs.forEach((l, i) => { l.sole = [...w.frames[0].limbs[i].sole]; }))],
    ['lockstep legs', w => w.frames.forEach(f => { f.limbs[1] = { ...structuredClone(f.limbs[0]), id: 'far' }; })],
    ['no swing lift', w => w.frames.forEach(f => f.limbs.forEach(l => { l.sole[1] = w.groundY; }))],
    ['whole-body translation', w => w.frames.forEach(f => f.limbs.forEach(l => { l.sole[0] = 240 + f.rootAdvancePx; }))],
    ['contact slide', w => w.frames.forEach(f => f.limbs.forEach(l => { if (l.contact) l.sole[0] += f.index * 5; }))],
    ['wrong contact flags', w => w.frames.forEach(f => f.limbs.forEach(l => { l.contact = !l.contact; }))],
    ['missing frame', w => w.frames.pop()],
    ['NaN landmark', w => { w.frames[3].limbs[0].sole[0] = NaN; }],
    ['loop jump', w => { w.frames[7].limbs[0].sole[0] += 150; }],
    ['frame ordering', w => { w.frames[2].index = 3; }],
    ['missing limb', w => { w.frames[2].limbs.pop(); }],
    ['lying root advance', w => { w.frames[2].rootAdvancePx = 0; }],
  ];
  for (const [name, mutate] of cases) { const bad = structuredClone(good); mutate(bad); assert.ok(validateWave(bad).errors.length, name + ' must fail'); }
  const anatomyCases = [
    ['socket drifting', w => { for (const joint of ['hip', 'knee', 'ankle', 'sole']) w.frames[2].limbs[0][joint][0] += 3; }, 'socket moves'],
    ['bone stretch', w => { w.frames[2].limbs[0].knee[0] += 8; }, 'bone length'],
    ['knee direction inversion', w => { const l = w.frames[2].limbs[0]; l.knee[0] = l.hip[0] + l.ankle[0] - l.knee[0]; l.knee[1] = l.hip[1] + l.ankle[1] - l.knee[1]; }, 'knee bend flips'],
    ['pelvis motion without hip motion', w => { w.frames[2].bodyAnchor[1] -= 8; }, 'socket moves'],
    ['missing anatomy metadata', w => { delete w.kinematics; }, 'contact ratio'],
    ['one contact remains crouched', w => { const l = w.frames[0].limbs[0]; l.knee[0] += 45; }, 'supporting knee'],
    ['discontinuous whole pose', w => { w.frames[7].bodyAnchor[0] += 105; w.frames[7].limbs.forEach(limb => { for (const joint of ['hip', 'knee', 'ankle', 'sole']) limb[joint][0] += 105; }); }, 'discontinuous joint'],
  ];
  for (const [name, mutate, reason] of anatomyCases) { const bad = structuredClone(good); mutate(bad); assert.ok(validateWave(bad).errors.some(error => error.includes(reason)), name + ' must fail for ' + reason); }
  const oldCrouch = fixture({ crouched: true });
  assert.ok(validateWave(oldCrouch).errors.some(error => error.includes('supporting knee')), 'old permanently crouched stance must fail on support geometry');
  assert.ok(validateWave(oldCrouch).errors.some(error => error.includes('source-height cycle')), 'old fixed pelvis must fail');
  const swingOnly = structuredClone(oldCrouch);
  swingOnly.frames.forEach((frame, i) => frame.limbs.forEach((limb, j) => { if (!limb.contact) limb.knee = [...good.frames[i].limbs[j].knee]; }));
  assert.ok(swingOnly.frames.some(frame => frame.limbs.some(limb => !limb.contact && kneeAngle(limb) > 160)), 'swing-only fixture must actually contain a straightened swing knee');
  assert.ok(validateWave(swingOnly).errors.some(error => error.includes('supporting knee')), 'extension only in swing must fail supporting-knee check');
  const quad = fixture({ quad: true });
  assert.deepEqual(validateWave(quad).errors, [], 'four-footfall lateral quadruped gait with overlapping contacts must pass');
  assert.ok(validateWave(quad).limbs.every(limb => limb.stanceFrames === 6), 'six sampled contacts per quad leg are valid at duty .65');
  const quadCases = [
    ['missing socket ROI', w => { delete w.limbs[0].socketRoi; }, 'socket ROI'],
    ['belly-edge attachment outside reviewed ROI', w => { w.frames.forEach(frame => { frame.limbs[0].hip[1] += 55; }); }, 'shoulder/haunch ROI'],
    ['upper leg covered by full body overlay', w => { w.bodyLayer = 'full-alpha-overlay'; }, 'remain over the body'],
    ['single support', w => { w.frames[0].limbs.forEach((limb, i) => { limb.contact = i === 0; }); }, 'fewer than two'],
    ['lying authored socket', w => { w.limbs[0].rootNormalized[0] -= .1; }, 'authored normalized root'],
  ];
  for (const [name, mutate, reason] of quadCases) { const bad = structuredClone(quad); mutate(bad); assert.ok(validateWave(bad).errors.some(error => error.includes(reason)), name + ' must fail for ' + reason); }
  const badQuad = fixture({ quad: true, phases: { nearFore: 0, farFore: .5, nearHind: .5, farHind: 0 } });
  assert.ok(validateWave(badQuad).errors.some(error => error.includes('four distinct')), 'old diagonal trot must fail the requested four-footfall walk');
  const observed = Array.from({ length: 17 }, (_, i) => ({ index: i % 8 }));
  for (const def of quad.limbs) {
    const run = contactPoseRuns(observed, quad.frames, def.id).find(run => run.completeStart && run.completeEnd);
    assert.equal(run?.draws.length, 6, def.id + ': capture must contain one entire six-pose stance, including wrapped stances');
  }
  assert.deepEqual(contactPoseRuns(observed, quad.frames, 'farHind').find(run => run.completeStart && run.completeEnd).draws.map(draw => draw.index), [4, 5, 6, 7, 0, 1]);
  const empty = new Uint8Array(64 * 64), painted = new Uint8Array(empty);
  for (let y = 28; y <= 31; y++) for (let x = 29; x <= 34; x++) painted[y * 64 + x] = 1;
  assert.equal(footCoverage(empty, 64, 64, 32, 32).valid, false);
  assert.equal(footCoverage(painted, 64, 64, 32, 32).valid, true);
  assert.equal(footCoverage(painted, 64, 64, 50, 50).valid, false);
  console.log('PASS gait self-test: upright biped + four-footfall quadruped; ' + (cases.length + anatomyCases.length + quadCases.length + 3) + ' rejected gait/anatomy fixtures; wrapped-stance capture + missing/displaced texture checks');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const noBrowser = args.includes('--no-browser'), previewAssets = args.includes('--preview-assets'), selectedArg = args.find(arg => arg.startsWith('--waves='));
  const selected = selectedArg ? selectedArg.slice(8).split(',').map(Number) : REQUIRED;
  assert.ok(selected.length && selected.every(wave => REQUIRED.includes(wave)) && new Set(selected).size === selected.length, '--waves must contain unique grounded wave numbers');
  const positional = args.filter(arg => !arg.startsWith('--'));
  assert.ok(positional.length <= 1 && args.every(arg => !arg.startsWith('--') || ['--no-browser', '--preview-assets'].includes(arg) || arg.startsWith('--waves=')), 'Unknown argument');
  const manifestFile = positional[0] ? path.resolve(positional[0]) : path.resolve(REPO, 'tools/art-review/pr29-gait/rig-manifest.json');
  const report = { manifest: path.relative(REPO, manifestFile).replaceAll('\\', '/'), selected, browserRequested: !noBrowser, previewAssets, interpretation: 'Geometry and source-atlas provenance checks do not validate the separate assembled anatomical masters or replace visual review of socket anatomy, occlusion, texture seams, character tone or perceived weight. Gameplay planting is measured at the first actual draw of each pose within a complete contact event; discrete frames allow movement between captures.', kinematics: [], textures: [], browser: null, errors: [] };
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''));
    assert.ok(manifest.version === 1 && manifest.frames === 8 && manifest.cols === 4 && manifest.rows === 2 && manifest.cell === 512 && Array.isArray(manifest.waves), 'Unsupported rig manifest header');
    assert.equal(new Set(manifest.waves.map(wave => wave.wave)).size, manifest.waves.length, 'duplicate manifest wave');
    const waves = selected.map(number => { const wave = manifest.waves.find(wave => wave.wave === number); assert.ok(wave, 'required grounded W' + number + ' missing from manifest (use --waves for explicit partial check)'); return wave; });
    for (const wave of waves) {
      const result = validateWave(wave, manifest.cell, manifest.frames);
      report.kinematics.push(result);
      if (!result.errors.length) report.textures.push(await inspectTexture(wave, manifest, manifestFile));
      console.log((result.errors.length ? 'FAIL' : 'PASS') + ' landmarks W' + wave.wave + ' ' + result.errors.join('; '));
    }
    if (report.kinematics.some(row => row.errors.length) || report.textures.some(row => row.errors.length)) throw new Error('Landmark/texture validation failed');
    if (!noBrowser) report.browser = await browserCheck(waves, report.textures, previewAssets);
    if (report.browser && (report.browser.errors.length || report.browser.waves.some(row => row.errors.length))) throw new Error('Loaded texture/gameplay validation failed');
    console.log('PASS grounded gait ' + selected.join(',') + (noBrowser ? ' (manifest/texture only; gameplay not checked)' : previewAssets ? ' (landmarks, textured soles and gameplay with preview asset overrides)' : ' (landmarks, textured soles and actual gameplay)'));
  } catch (error) { report.errors.push(error.message); throw error; }
  finally { fs.writeFileSync(outputPath('ground-gait-check.json'), JSON.stringify(report, null, 2) + '\n'); }
}

if (require.main === module) main().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
module.exports = { validateWave, footCoverage, transformedPoint, contactPoseRuns, fixture };
