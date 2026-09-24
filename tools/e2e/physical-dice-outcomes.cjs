#!/usr/bin/env node
'use strict';

// A thrown chest die must award the center number on the face pointed most
// toward the player (+Z), including d4. The topmost numeral in 2D screen
// coordinates can belong to another face. Buying a rare die chooses its set
// of printed numbers, not its landing result.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
const { cameraFacingDieResult } = require('./camera-facing-die.cjs');

const reportPath = outputPath('physical-dice-outcomes.json');
const report = { cases: [], pass: false };
const expectedLabels = {
  d4: [[1, 1], [2, 1], [3, 1], [4, 1]],
  d6: Array.from({ length: 6 }, (_, i) => [i + 1, 1]),
  d8: Array.from({ length: 8 }, (_, i) => [i + 1, 1]),
  d12: Array.from({ length: 12 }, (_, i) => [i + 1, 1]),
  d20: Array.from({ length: 20 }, (_, i) => [i + 1, 1]),
  epic: [[14, 5], [15, 5], [16, 5], [17, 5]],
  myth: [[18, 10], [19, 10]],
  primal: [[20, 20]],
};
const kinds = Object.keys(expectedLabels);
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

function deltaAngle(a, b) {
  // Rotation from the first stationary frame to the last, in radians.
  const trace = [0, 1, 2].reduce((sum, i) => sum + [0, 1, 2].reduce((v, j) => v + a[i * 3 + j] * b[i * 3 + j], 0), 0);
  return Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));
}

async function boot(browser, name, viewport, mobile) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1');
    localStorage.setItem('dk_infHelpSeen', '1');
  });
  await page.route('**/game.js*', async route => {
    const response = await route.fetch(), source = await response.text(), anchor = 'window.DK = S;';
    assert.equal(source.split(anchor).length, 2, 'unique private-test hook');
    await route.fulfill({ response, body: source.replace(anchor,
      'window.__physicalQA={dieFaceLabels,physicalFaceValue,dieShape,POLY,FACES,DIE_SYMMETRIES,m3apply,m3mul,updateDie,updateSlot};\n' +
      'window.__physicalQA.cameraFace=' + cameraFacingDieResult.toString() + ';\n' + anchor) });
  });
  await page.goto(gameUrl());
  await page.waitForFunction(() => window.DK?.phase === 'title' && window.__physicalQA, null, { timeout: 120000 });
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
  return { context, page, errors, name };
}

async function inspectLabels(page, kind, basePose) {
  return page.evaluate(({ kind, basePose }) => {
    const q = __physicalQA, shape = q.dieShape(kind), labels = q.dieFaceLabels(kind);
    const normals = shape === 'd6' ? q.FACES.map(f => f.n) : q.POLY[shape].faces.map(f => f.n);
    const printedAt = i => shape === 'd6' ? labels[q.FACES[i].val - 1] : labels[i];
    const samples = normals.map((normal, i) => {
      // Right-multiplication by a solid symmetry permutes its engraved faces
      // without changing the world-space silhouette or the settled support.
      // Every controlled pose therefore stays physically at rest while a
      // different printed face occupies the same camera-facing position.
      const pose = q.DIE_SYMMETRIES[shape].map(G => q.m3mul(basePose, G))
        .find(R => q.cameraFace(kind, R, labels, q).index === i);
      if (!pose) throw Error(`${kind} face ${i + 1}: cannot expose it toward the camera`);
      const visible = q.cameraFace(kind, pose, labels, q);
      return { face: i, R: pose, expected: printedAt(i), visible: visible.value,
        physical: q.physicalFaceValue(kind, pose) };
    });
    return { shape, labels, samples };
  }, { kind, basePose });
}

async function inspectChestBounds(page) {
  return page.evaluate(() => {
    const chest = DKCONTENT.INFINITY.chest, table = chest.table;
    const sum = table.reduce((total, [, weight]) => total + weight, 0);
    const original = Math.random, boundaries = [];
    try {
      let cumulative = 0;
      for (let i = 0; i < table.length - 1; i++) {
        cumulative += table[i][1];
        Math.random = () => (cumulative - 1e-8) / sum;
        const before = chest.draw();
        Math.random = () => (cumulative + 1e-8) / sum;
        const after = chest.draw();
        boundaries.push({ expectedBefore: table[i][0], before, expectedAfter: table[i + 1][0], after });
      }
      Math.random = () => 0;
      const first = chest.draw();
      Math.random = () => 0.999999999999;
      const last = chest.draw();
      return { sum, first, last, boundaries };
    } finally { Math.random = original; }
  });
}

async function sampleOrientationOdds(page, kind, sampleCount = 10000) {
  return page.evaluate(({ kind, sampleCount }) => {
    // Uniform SO(3) quaternions, from a reproducible local stream. This checks
    // the geometry/engraving odds without letting battle or FX RNG skew them.
    let seed = 0x714b3f91;
    const random = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const counts = {};
    for (let i = 0; i < sampleCount; i++) {
      const u1 = random(), u2 = random() * 2 * Math.PI, u3 = random() * 2 * Math.PI;
      const x = Math.sqrt(1 - u1) * Math.sin(u2), y = Math.sqrt(1 - u1) * Math.cos(u2);
      const z = Math.sqrt(u1) * Math.sin(u3), w = Math.sqrt(u1) * Math.cos(u3);
      const R = [
        1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
        2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
        2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
      ];
      const value = __physicalQA.physicalFaceValue(kind, R);
      counts[value] = (counts[value] || 0) + 1;
    }
    return { sampleCount, counts };
  }, { kind, sampleCount });
}

async function sampleButtonThrows(page, kind, sampleCount = 200) {
  return page.evaluate(({ kind, sampleCount }) => {
    DKstartInf('clear'); DK.paused = true; DK.gold = 1000000;
    const ch = DKCONTENT.INFINITY.chest, oldDraw = ch.draw, oldRoll = ch.roll, oldRandom = Math.random;
    let seed = 0x456709ab;
    Math.random = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    ch.draw = () => kind;
    ch.roll = () => { throw Error('A button throw must not preselect a die face'); };
    const counts = {}, d8Areas = [], landedFaceDepths = [];
    let maxFrames = 0;
    const d8AreaRatio = R => {
      const q = __physicalQA, project = v => {
        const p = q.m3apply(R, v), w = 10 / (10 - p[2]);
        return [p[0] * w, p[1] * w];
      };
      const points = q.POLY.d8.verts.map(project).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const chain = values => {
        const out = [];
        for (const point of values) {
          while (out.length > 1 && cross(out.at(-2), out.at(-1), point) <= 1e-9) out.pop();
          out.push(point);
        }
        return out;
      };
      const hull = chain(points).slice(0, -1).concat(chain(points.slice().reverse()).slice(0, -1));
      const area = polygon => Math.abs(polygon.reduce((sum, a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        return sum + a[0] * b[1] - b[0] * a[1];
      }, 0)) / 2;
      const hullArea = area(hull), labels = q.dieFaceLabels(kind);
      const winner = q.cameraFace(kind, R, labels, q);
      const candidates = q.POLY.d8.faces.map((face, i) => {
        const z = q.m3apply(R, face.n)[2];
        if (z <= .02) return null;
        const polygon = face.idx.map(vi => project(q.POLY.d8.verts[vi]));
        return { face: labels[i], z, ratio: area(polygon) / hullArea };
      }).filter(Boolean);
      const visibleAreaRatio = candidates.reduce((sum, candidate) => sum + candidate.ratio, 0);
      // Independent geometric read of the projected mesh. The normal with
      // greatest camera depth is the skyward face, regardless of its 2D y.
      const cameraFace = candidates.reduce((best, candidate) =>
        !best || candidate.z > best.z ? candidate : best, null);
      return { face: winner.value, ratio: winner.area / hullArea, R: R.slice(),
        visibleAreaRatio, cameraMatchesWinner: cameraFace?.face === winner.value,
        hullVertices: hull.length, visibleFaces: candidates.length,
        cameraFace: cameraFace?.face || null, cameraZ: cameraFace?.z || null,
        cameraRatio: cameraFace?.ratio || null };
    };
    try {
      for (let i = 0; i < sampleCount; i++) {
        DK.gold = 1000000; DK.heldDie = 0; DKSLOT.active = false; DKDIE.state = 'tray';
        DK.enemies.length = 0; DK.fxs.length = 0; DK.texts.length = 0;
        if (DKchest() !== kind) throw Error(kind + ': button sample could not buy chest ' + i);
        DKthrow(920, -300); // exactly the on-screen button's impulse
        let frames = 0;
        while (!DK.heldDie && frames++ < 900) {
          const priorState = DKDIE.state;
          __physicalQA.updateDie(1 / 60); __physicalQA.updateSlot(1 / 60);
          if (priorState === 'throw' && DKDIE.state === 'settle') {
            landedFaceDepths.push(__physicalQA.cameraFace(kind, DKDIE.R,
              __physicalQA.dieFaceLabels(kind), __physicalQA).z);
            if (kind === 'd8') d8Areas.push(d8AreaRatio(DKDIE.R));
          }
        }
        if (!DK.heldDie) throw Error(kind + ': button sample did not settle ' + i);
        maxFrames = Math.max(maxFrames, frames);
        counts[DK.heldDie] = (counts[DK.heldDie] || 0) + 1;
      }
      d8Areas.sort((a, b) => a.ratio - b.ratio);
      const cameraSamples = d8Areas.filter(item => item.cameraFace);
      const cameraCounts = {};
      for (const item of cameraSamples) cameraCounts[item.cameraFace] = (cameraCounts[item.cameraFace] || 0) + 1;
      return { kind, sampleCount, counts, maxFrames,
        landedFaceDepth: { samples: landedFaceDepths.length, minZ: Math.min(...landedFaceDepths),
          below999: landedFaceDepths.filter(z => z < .999).length },
        d8Area: kind === 'd8' ? { samples: d8Areas.length, min: d8Areas[0],
          p5: d8Areas[Math.floor(d8Areas.length * .05)], smallest: d8Areas.slice(0, 10),
          cameraFace: { withCandidate: cameraSamples.length,
            independentlyMatched: cameraSamples.filter(item => item.cameraMatchesWinner).length,
            counts: cameraCounts,
            minZ: Math.min(...cameraSamples.map(item => item.cameraZ)),
            minAreaRatio: Math.min(...cameraSamples.map(item => item.cameraRatio)) },
          silhouette: { minHull: Math.min(...d8Areas.map(item => item.hullVertices)),
            minVisible: Math.min(...d8Areas.map(item => item.visibleFaces)),
            triangular: d8Areas.filter(item => item.hullVertices < 4).length,
            fewFaces: d8Areas.filter(item => item.visibleFaces < 4).length,
            smallest: d8Areas.filter(item => item.hullVertices < 4 || item.visibleFaces < 4).slice(0, 10) } } : null };
    } finally { ch.draw = oldDraw; ch.roll = oldRoll; Math.random = oldRandom; }
  }, { kind, sampleCount });
}

async function throwAndObserve(page, kind, chosenIndex = null, chosenPose = null) {
  return page.evaluate(({ kind, chosenIndex, chosenPose }) => {
    DKstartInf('clear'); DK.paused = true; DK.gold = 10000;
    const q = __physicalQA, ch = DKCONTENT.INFINITY.chest;
    const oldDraw = ch.draw, oldRoll = ch.roll;
    let faceRollCalls = 0;
    const geometryValue = R => q.cameraFace(kind, R, q.dieFaceLabels(kind), q).value;
    try {
      ch.draw = () => kind;
      ch.roll = () => { faceRollCalls++; throw new Error('Manual die face was preselected before landing'); };
      const goldBefore = DK.gold, bought = DKchest();
      const awaiting = { state: DKDIE.state, phase: DKSLOT.phase, held: DK.heldDie, final: DKSLOT.final };
      DKthrow(900, -300);
      if (chosenPose) {
        DKDIE.R = chosenPose.slice();
        DKDIE.w = [0, 0, 0]; DKDIE.vx = 0; DKDIE.vy = 0; DKDIE.vz = 0; DKDIE.z = 0;
      }
      let landing = null, finalPose = null, frames = 0;
      for (; frames < 900 && !DK.heldDie; frames++) {
        const priorState = DKDIE.state;
        q.updateDie(1 / 60); q.updateSlot(1 / 60);
        if (!landing && priorState === 'throw' && DKDIE.state === 'settle') {
          const R = DKDIE.R.slice();
          landing = { R, geometry: geometryValue(R), physical: q.physicalFaceValue(kind, R),
            cameraZ: q.cameraFace(kind, R, q.dieFaceLabels(kind), q).z,
            awarded: DKDIE.final, slot: DKSLOT.final };
        }
        if (!finalPose && priorState === 'settle' && DKDIE.state === 'fly') {
          const R = DKDIE.R.slice();
          finalPose = { R, geometry: geometryValue(R), physical: q.physicalFaceValue(kind, R),
            cameraZ: q.cameraFace(kind, R, q.dieFaceLabels(kind), q).z };
        }
      }
      return { bought, goldSpent: goldBefore - DK.gold, faceRollCalls, awaiting, frames,
        landing, finalPose, held: DK.heldDie, final: DKDIE.final, slotFinal: DKSLOT.final, state: DKDIE.state };
    } finally { ch.draw = oldDraw; ch.roll = oldRoll; }
  }, { kind, chosenIndex, chosenPose });
}

function checkRoll(result, kind, index) {
  const label = index === null ? 'real throw' : `face ${index + 1} landing`;
  assert.equal(result.bought, kind, `${kind} ${label}: chest grade`);
  assert.equal(result.faceRollCalls, 0, `${kind} ${label}: no hidden preselected face`);
  assert.equal(result.goldSpent, 160, `${kind} ${label}: one chest cost`);
  assert.deepEqual([result.awaiting.state, result.awaiting.phase, result.awaiting.held], ['tray', -1, 0], `${kind} ${label}: waits for the player`);
  assert.ok(result.landing && result.finalPose, `${kind} ${label}: traverses throw, landing, settle and fly`);
  assert.equal(result.landing.physical, result.landing.geometry, `${kind} ${label}: physics reads the camera-facing printed number`);
  assert.equal(result.landing.awarded, result.landing.geometry, `${kind} ${label}: no hidden reward substitution at landing`);
  assert.equal(result.landing.slot, result.landing.geometry, `${kind} ${label}: slot records the same landed number`);
  assert.equal(result.finalPose.geometry, result.landing.geometry, `${kind} ${label}: settle never flips to a different face`);
  assert.equal(result.finalPose.physical, result.landing.geometry, `${kind} ${label}: final visible number stays unchanged`);
  assert.equal(result.held, result.landing.geometry, `${kind} ${label}: award matches the die on screen`);
  assert.equal(result.final, result.held, `${kind} ${label}: die state matches the hand`);
  assert.equal(result.slotFinal, result.held, `${kind} ${label}: slot matches the hand`);
  assert.equal(result.state, 'tray', `${kind} ${label}: physical die returns to its tray`);
  if (kind !== 'd4') {
    assert.ok(result.landing.cameraZ >= .999,
      `${kind} ${label}: awarded face points squarely skyward at landing (normal z=${result.landing.cameraZ})`);
    assert.ok(result.finalPose.cameraZ >= .999,
      `${kind} ${label}: awarded face stays skyward through the result display (normal z=${result.finalPose.cameraZ})`);
  }
  const angle = deltaAngle(result.landing.R, result.finalPose.R);
  assert.ok(angle < 0.02, `${kind} ${label}: the die holds its landed orientation without a late correction (${angle})`);
  return { label, face: result.held, frames: result.frames, settleAngle: +angle.toFixed(3) };
}

async function run(browser, name, viewport, mobile) {
  const row = { name, viewport, outcomes: [] }; report.cases.push(row);
  const { context, page, errors } = await boot(browser, name, viewport, mobile);
  try {
    const chestBounds = await inspectChestBounds(page);
    assert.ok(Math.abs(chestBounds.sum - .99999) < 1e-10, 'displayed grade weights sum to 99.999%, including the small final grade');
    assert.deepEqual([chestBounds.first, chestBounds.last], ['d1', 'primal'], 'both ends of the normalized grade draw are reachable');
    for (const boundary of chestBounds.boundaries) {
      assert.equal(boundary.before, boundary.expectedBefore, 'grade immediately below a boundary');
      assert.equal(boundary.after, boundary.expectedAfter, 'grade immediately above a boundary');
    }
    row.chestBounds = chestBounds;
    for (const kind of kinds) {
      const realResult = await throwAndObserve(page, kind);
      const info = await inspectLabels(page, kind, realResult.landing.R), actual = new Map();
      for (const value of info.labels) actual.set(value, (actual.get(value) || 0) + 1);
      assert.deepEqual([...actual].sort((a, b) => a[0] - b[0]), expectedLabels[kind], `${kind}: every physical side has the promised printed grade label`);
      assert.ok(info.samples.every(s => s.expected === s.visible && s.visible === s.physical), `${kind}: face-center geometry and value mapping agree`);
      const odds = await sampleOrientationOdds(page, kind);
      const expected = odds.sampleCount / expectedLabels[kind].length;
      for (const [value] of expectedLabels[kind]) {
        const observed = odds.counts[value] || 0;
        assert.ok(Math.abs(observed - expected) < Math.max(6, 4.5 * Math.sqrt(expected)),
          `${kind} value ${value}: uniform physical orientations should not favor an engraved result (${observed} vs ${expected})`);
      }
      const outcomes = [checkRoll(realResult, kind, null)];
      // Two controlled last-contact poses prove the result actually changes
      // with the die, rather than matching one sampled value by coincidence.
      const low = 0, high = info.samples.findIndex(sample => sample.expected !== info.samples[0].expected);
      for (const index of [low, high].filter(i => i >= 0)) {
        const result = await throwAndObserve(page, kind, index, info.samples[index].R);
        outcomes.push(checkRoll(result, kind, index));
        assert.equal(result.held, info.samples[index].expected, `${kind} face ${index + 1}: chosen physical contact controls reward`);
      }
      row.outcomes.push({ kind, shape: info.shape, labelCounts: [...actual], orientationSample: odds, outcomes });
    }
    if (!mobile) {
      // A fixed rest pose and a fixed button impulse can bias real trajectories
      // even when the geometry is uniform under arbitrary orientations.
      row.buttonSamples = [];
      for (const kind of ['d4', 'd6', 'd8', 'd12', 'd20', 'epic', 'myth', 'primal']) {
        const sample = await sampleButtonThrows(page, kind);
        const values = expectedLabels[kind].map(([value]) => sample.counts[value] || 0);
        const expected = sample.sampleCount / values.length;
        const chiSquare = values.reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0);
        assert.equal(values.reduce((sum, observed) => sum + observed, 0), sample.sampleCount, `${kind}: every button throw yields a valid face`);
        assert.ok(chiSquare < values.length + 5 * Math.sqrt(2 * values.length),
          `${kind}: fixed button impulse severely favors some faces (${JSON.stringify(sample.counts)}; chi²=${chiSquare.toFixed(2)})`);
        assert.equal(sample.landedFaceDepth.samples, sample.sampleCount,
          `${kind}: every button throw records its final camera-facing face normal`);
        if (kind !== 'd4') assert.ok(sample.landedFaceDepth.minZ >= .999,
          `${kind}: all ${sample.sampleCount} settled faces point squarely skyward ` +
          `(min z=${sample.landedFaceDepth.minZ}; ${sample.landedFaceDepth.below999} ambiguous landings)`);
        if (kind === 'd8') assert.equal(sample.d8Area.samples, sample.sampleCount,
          'each actual d8 button throw provides a projected winning-face area');
        if (kind === 'd8') assert.deepEqual(
          [sample.d8Area.cameraFace.withCandidate, sample.d8Area.cameraFace.independentlyMatched],
          [sample.sampleCount, sample.sampleCount],
          'every physical d8 has a camera-facing face and its projected normal agrees with the award');
        if (kind === 'd8') assert.ok(
          sample.d8Area.silhouette.minHull >= 6 && sample.d8Area.silhouette.minVisible >= 4,
          `all landed d8 keep a six-corner octahedral silhouette with four visible triangles ` +
          `(min hull=${sample.d8Area.silhouette.minHull}, min faces=${sample.d8Area.silhouette.minVisible})`);
        row.buttonSamples.push({ ...sample, chiSquare: +chiSquare.toFixed(2) });
      }
    }
    assert.deepEqual(errors, [], name + ': no uncaught browser errors');
  } finally { row.pageErrors = errors; save(); await context.close(); }
}

(async () => {
  const browser = await launchBrowser();
  try {
    if (!process.argv.includes('--phone-only')) await run(browser, 'desktop', { width: 1240, height: 860 }, false);
    if (!process.argv.includes('--desktop-only')) await run(browser, 'phone', { width: 390, height: 844 }, true);
    report.pass = true; save();
    console.log('physical dice outcomes PASS', report.cases.map(c => c.name).join(', '));
  } finally { await browser.close(); }
})().catch(error => { report.error = error.stack; save(); console.error(error); process.exitCode = 1; });
