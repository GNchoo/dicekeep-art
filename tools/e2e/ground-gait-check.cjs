// Rig gait validation: actual foot crossing/contact/swing, textured soles and game-space planting.
// node tools/e2e/ground-gait-check.cjs [manifest.json] [--waves=9] [--no-browser] [--preview-assets] [--self-test]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { launchBrowser, gameUrl, outputPath, watchArtErrors } = require('./browser.cjs');
const REPO = path.resolve(__dirname, '../..');
const REQUIRED = [1, 2, 3, 5, 6, 7, 9];
const span = values => Math.max(...values) - Math.min(...values);
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const rms = values => Math.sqrt(mean(values.map(value => value * value)));
const finitePoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

function validateWave(wave, cell = 512, count = 8) {
  const errors = [], limbs = [], pairs = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(Number.isInteger(wave.wave) && REQUIRED.includes(wave.wave), 'unknown grounded wave');
  check(Number.isFinite(wave.cycleStridePx) && wave.cycleStridePx > 0, 'invalid cycleStridePx');
  check(Number.isFinite(wave.groundY) && wave.groundY > 0 && wave.groundY < cell, 'invalid groundY');
  check(Array.isArray(wave.frames) && wave.frames.length === count, 'expected ' + count + ' frames');
  check(Array.isArray(wave.limbs) && [2, 4].includes(wave.limbs.length), 'expected two or four defined legs');
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
    check(near.every((point, i) => point.contact !== far[i].contact), pair + ': near/far stance phases are not opposed');
    const nx = near.map(point => point.sole[0]), fx = far.map(point => point.sole[0]), nm = mean(nx), fm = mean(fx);
    const phaseError = rms(nx.map((x, i) => x - nm - (fx[(i + count / 2) % count] - fm)));
    const liftError = rms(near.map((point, i) => point.sole[1] - far[(i + count / 2) % count].sole[1]));
    check(phaseError <= Math.max(2, wave.cycleStridePx * 0.05) && liftError <= 2, pair + ': limbs do not match at half-cycle offset');
    pairs.push({ pair, minimumNearMinusFarX: Math.min(...difference), maximumNearMinusFarX: Math.max(...difference), phaseError, liftError });
  }
  if (ids.length === 4 && ids.every(id => ['nearFore', 'farFore', 'nearHind', 'farHind'].includes(id))) {
    check(tracks.nearFore.every((point, i) => point.contact === tracks.farHind[i].contact && point.contact !== tracks.nearHind[i].contact), 'quadruped diagonal phase pairing is wrong');
  }
  return { wave: wave.wave, errors, limbs, pairs };
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
  return { wave: wave.wave, file: path.relative(REPO, file).replaceAll('\\', '/'), crop, feet, errors };
}

function transformedPoint(draw, point, crop) {
  const [dx, dy, dw, dh] = draw.args, m = draw.matrix;
  const x = dx + (point[0] - crop.x) * dw / crop.w, y = dy + (point[1] - crop.y) * dh / crop.h;
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
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
        const segment = lane.segs.find(segment => segment.bx > segment.ax && Math.abs(segment.by - segment.ay) < 0.01 && segment.len > stride * 2 + 20);
        if (!segment) throw new Error('No horizontal lane long enough for gait observation');
        DK.enemies = [enemy]; DK.spawnQ = [{ type: enemy.type, t: 1e9 }]; DK.waveActive = true;
        enemy.dist = segment.acc + 10; enemy.artWalkDistance = 0; enemy.face = 1; enemy.burrowT = 1.2;
        window.__gaitDraws = [];
        return { stride, size: enemy.def.size, speed: enemy.def.speed * enemy.spdMult };
      });
      await page.waitForFunction(stride => DK.enemies[0].artWalkDistance >= stride * 1.15 && new Set(window.__gaitDraws.map(draw => draw.index)).size === 8, setup.stride, { timeout: 15000 });
      const draws = await page.evaluate(() => { DK.paused = true; return window.__gaitDraws; });
      const samples = Array.from({ length: 8 }, (_, index) => draws.find(draw => draw.index === index));
      if (samples.some(draw => !draw || draw.args.length !== 4 || ![draw.distance, draw.dist, ...Object.values(draw.matrix)].every(Number.isFinite))) result.errors.push('invalid/missing actual drawn frame');
      const feet = [];
      if (!result.errors.length) {
        for (const limb of wave.limbs) {
          const points = wave.frames.map((frame, index) => ({ index, contact: frame.limbs.find(point => point.id === limb.id).contact, xy: transformedPoint(samples[index], frame.limbs.find(point => point.id === limb.id).sole, crop) }));
          const planted = points.filter(point => point.contact);
          const slip = span(planted.map(point => point.xy[0])), lift = span(planted.map(point => point.xy[1]));
          const tolerance = Math.max(2, setup.stride / 8);
          if (slip > tolerance) result.errors.push(limb.id + ': actual drawn stance slips ' + slip.toFixed(3) + 'px (limit ' + tolerance.toFixed(3) + ')');
          if (lift > 0.75) result.errors.push(limb.id + ': actual drawn stance bobs ' + lift.toFixed(3) + 'px');
          feet.push({ id: limb.id, points, stanceFrames: planted.length, maximumWorldSwingLift: mean(planted.map(point => point.xy[1])) - Math.min(...points.map(point => point.xy[1])), stanceWorldXSpan: slip, stanceWorldYSpan: lift, slipTolerance: tolerance });
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

function fixture() {
  const stride = 220, ground = 460, defs = [{ id: 'near', pair: 'biped', side: 'near' }, { id: 'far', pair: 'biped', side: 'far' }];
  return { wave: 9, cycleStridePx: stride, groundY: ground, limbs: defs, frames: Array.from({ length: 8 }, (_, index) => ({
    index, phase: index / 8, rootAdvancePx: index * stride / 8, bodyAnchor: [256, 60],
    limbs: defs.map((def, j) => {
      const phase = (index / 8 + j / 2) % 1, contact = phase < 0.5, u = (phase - 0.5) * 2;
      const x = 256 + (contact ? 55 - 220 * phase : -55 + 110 * u), y = ground - (contact ? 0 : Math.sin(Math.PI * u) * 42);
      return { id: def.id, hip: [256, 300], knee: [(256 + x) / 2, 365], ankle: [x, y - 15], sole: [x, y], contact };
    }),
  })) };
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
  const quad = structuredClone(good);
  quad.wave = 1;
  quad.limbs = [
    { id: 'nearFore', pair: 'fore', side: 'near' }, { id: 'farFore', pair: 'fore', side: 'far' },
    { id: 'nearHind', pair: 'hind', side: 'near' }, { id: 'farHind', pair: 'hind', side: 'far' },
  ];
  quad.frames.forEach(frame => {
    const original = frame.limbs;
    frame.limbs = quad.limbs.map((def, index) => {
      const limb = structuredClone(original[index < 2 ? index : 3 - index]);
      limb.id = def.id;
      for (const joint of ['hip', 'knee', 'ankle', 'sole']) limb[joint][0] += index < 2 ? 55 : -55;
      return limb;
    });
  });
  assert.deepEqual(validateWave(quad).errors, [], 'diagonal quadruped gait must pass');
  const badQuad = structuredClone(quad);
  badQuad.frames.forEach(frame => {
    [frame.limbs[2], frame.limbs[3]] = [frame.limbs[3], frame.limbs[2]];
    frame.limbs[2].id = 'nearHind'; frame.limbs[3].id = 'farHind';
  });
  assert.ok(validateWave(badQuad).errors.some(error => error.includes('diagonal')), 'wrong quadruped diagonal timing must fail');
  const empty = new Uint8Array(64 * 64), painted = new Uint8Array(empty);
  for (let y = 28; y <= 31; y++) for (let x = 29; x <= 34; x++) painted[y * 64 + x] = 1;
  assert.equal(footCoverage(empty, 64, 64, 32, 32).valid, false);
  assert.equal(footCoverage(painted, 64, 64, 32, 32).valid, true);
  assert.equal(footCoverage(painted, 64, 64, 50, 50).valid, false);
  console.log('PASS gait self-test: good biped/diagonal quadruped + 13 rejected kinematic fixtures + missing/displaced texture rejection');
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
  const report = { manifest: path.relative(REPO, manifestFile).replaceAll('\\', '/'), selected, browserRequested: !noBrowser, previewAssets, kinematics: [], textures: [], browser: null, errors: [] };
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
module.exports = { validateWave, footCoverage, transformedPoint, fixture };
