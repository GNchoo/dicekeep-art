#!/usr/bin/env node
'use strict';

// A chest die must look like its advertised solid before the player touches it.
// This inspects the actual resting matrix and the renderer's projected mesh;
// pixel screenshots are saved for human review but are not the sole assertion.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
const { screenTopDieResult } = require('./screen-top-die.cjs');

const reportPath = outputPath('dice-rest-pose.json');
const report = { cases: [], pass: false };
const fixtures = [
  { kind: 'd4', shape: 'd4' },
  { kind: 'd6', shape: 'd6' },
  { kind: 'd8', shape: 'd8' },
  { kind: 'd12', shape: 'd12' },
  { kind: 'd20', shape: 'd20' },
  { kind: 'epic', shape: 'd20' },
  { kind: 'myth', shape: 'd20' },
  { kind: 'primal', shape: 'd20' },
];

function projectPose(model, matrix) {
  const rotate = v => [
    matrix[0] * v[0] + matrix[1] * v[1] + matrix[2] * v[2],
    matrix[3] * v[0] + matrix[4] * v[1] + matrix[5] * v[2],
    matrix[6] * v[0] + matrix[7] * v[1] + matrix[8] * v[2],
  ];
  const points = model.verts.map(v => {
    const p = rotate(v), depth = 10 / (10 - p[2]);
    return [p[0] * depth, p[1] * depth];
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const chain = ordered => {
    const out = [];
    for (const point of ordered) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), point) <= 1e-8) out.pop();
      out.push(point);
    }
    return out;
  };
  const hull = chain(points).slice(0, -1).concat(chain(points.slice().reverse()).slice(0, -1));
  const normals = model.faces.map(face => rotate(face.n)[2]);
  return { hull: hull.length, visibleFaces: normals.filter(z => z > .02).length, normals };
}

function save() { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }

async function boot(browser, name, viewport, mobile) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1');
    localStorage.setItem('dk_infHelpSeen', '1');
  });
  await page.route('**/game.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const anchor = 'window.DK = S;';
    assert.equal(source.split(anchor).length, 2, 'one test hook insertion point');
    await route.fulfill({ response, body: source.replace(anchor,
      'window.__diceRestQA = { poseFor: shape => shape === "d6" ? m3mul(TRAY_TILT, faceTopR(6)) : polyRestR(shape), dieShape, POLY, FACES, DIE_SYMMETRIES, m3apply, m3mul, dieFaceLabels, physicalFaceValue, updateDie };\n  ' +
      'window.__diceRestQA.visualTop=' + screenTopDieResult.toString() + ';\n' + anchor) });
  });
  await page.goto(gameUrl());
  await page.waitForFunction(() => window.DK?.phase === 'title' && window.__diceRestQA, null, { timeout: 120000 });
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
  return { page, context, errors, name };
}

async function inspect(page, fixture) {
  return page.evaluate(({ kind }) => {
    DKstartInf('clear');
    DK.paused = true;
    DK.gold = 10000;
    const chest = DKCONTENT.INFINITY.chest;
    const originalDraw = chest.draw, originalRoll = chest.roll;
    try {
      chest.draw = () => kind;
      chest.roll = () => { throw Error('The visible die must not preselect a reward face'); };
      const bought = DKchest();
      const { dieShape, poseFor, POLY, m3apply } = window.__diceRestQA;
      const shape = dieShape(kind), actual = DKDIE.R.slice(), expected = poseFor(shape);
      const symmetryCount = window.__diceRestQA.DIE_SYMMETRIES[shape].length;
      const matchesSymmetry = window.__diceRestQA.DIE_SYMMETRIES[shape].some(G =>
        window.__diceRestQA.m3mul(expected, G).every((v, i) => Math.abs(v - actual[i]) < 1e-6));
      const model = shape === 'd6'
        ? { verts: [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z]))), faces: [] }
        : POLY[shape];
      const projected = model.verts.map(v => {
        const p = m3apply(actual, v), w = 10 / (10 - p[2]);
        return [p[0] * w, p[1] * w];
      });
      const points = projected.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const chain = values => {
        const out = [];
        for (const p of values) {
          while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 1e-8) out.pop();
          out.push(p);
        }
        return out;
      };
      const hull = chain(points).slice(0, -1).concat(chain(points.slice().reverse()).slice(0, -1));
      const visibleFaces = model.faces.filter(f => m3apply(actual, f.n)[2] > .02).length;
      const canvas = document.querySelector('#game'), rect = canvas.getBoundingClientRect();
      const dieX = rect.left + DKDIE.x * rect.width / canvas.width;
      const dieY = rect.top + DKDIE.y * rect.height / canvas.height;
      return {
        bought, shape, phase: DKSLOT.phase, state: DKDIE.state, held: DK.heldDie,
        actual, expected, matchesSymmetry, symmetryCount, projected, hull, visibleFaces,
        mesh: { vertices: model.verts.length, faces: model.faces.length, sides: [...new Set(model.faces.map(f => f.idx.length))] },
        dieTarget: document.elementFromPoint(dieX, dieY)?.id || null,
      };
    } finally {
      chest.draw = originalDraw; chest.roll = originalRoll;
    }
  }, fixture);
}

async function inspectD8Results(page) {
  return page.evaluate(() => {
    DKstartInf('clear');
    DK.paused = true;
    DK.gold = 10000;
    const chest = DKCONTENT.INFINITY.chest;
    const originalDraw = chest.draw, originalRoll = chest.roll;
    try {
      chest.draw = () => 'd8';
      chest.roll = () => { throw Error('The d8 must not preselect a reward face'); };
      const bought = DKchest();
      const qa = window.__diceRestQA;
      DKthrow(1200, -250);
      let frames = 0;
      for (; frames < 600; frames++) {
        qa.updateDie(1 / 60);
        if (DKDIE.state === 'settle' && DKDIE.settleT >= .5) break;
      }
      return {
        bought, model: qa.POLY.d8, frames,
        actual: DKDIE.R.slice(), landing: DKDIE.settleFrom?.slice(),
        dieState: DKDIE.state, settleT: DKDIE.settleT, final: DKDIE.final, slotFinal: DKSLOT.final,
        physicalAtLanding: qa.physicalFaceValue('d8', DKDIE.settleFrom || DKDIE.R),
        physicalAfterSettle: qa.physicalFaceValue('d8', DKDIE.R),
        visualAtLanding: qa.visualTop('d8', DKDIE.settleFrom || DKDIE.R, qa.dieFaceLabels('d8'), qa).value,
        visualAfterSettle: qa.visualTop('d8', DKDIE.R, qa.dieFaceLabels('d8'), qa).value,
      };
    } finally {
      chest.draw = originalDraw;
      chest.roll = originalRoll;
    }
  });
}

async function run(browser, name, viewport, mobile) {
  const row = { name, viewport, cases: [] };
  report.cases.push(row);
  const { page, context, errors } = await boot(browser, name, viewport, mobile);
  try {
    for (const fixture of fixtures) {
      const result = await inspect(page, fixture);
      assert.equal(result.bought, fixture.kind, fixture.kind + ': correct chest reward');
      assert.equal(result.shape, fixture.shape, fixture.kind + ': expected real solid');
      assert.deepEqual([result.phase, result.state, result.held], [-1, 'tray', 0], fixture.kind + ': awaits player input');
      assert.equal(result.dieTarget, 'game', fixture.kind + ': waiting die is on the interactive canvas');
      assert.equal(result.matchesSymmetry, true, fixture.kind + ': its visible initial orientation is a valid solid symmetry of the canonical pose');
      assert.equal(result.symmetryCount, { d4: 12, d6: 24, d8: 24, d12: 60, d20: 60 }[fixture.shape],
        fixture.kind + ': full rotational symmetry group randomizes numbered faces fairly');
      const expectedMesh = { d4: [4, 4, 3], d8: [6, 8, 3], d12: [20, 12, 5], d20: [12, 20, 3] }[fixture.shape];
      if (expectedMesh) assert.deepEqual([result.mesh.vertices, result.mesh.faces, ...result.mesh.sides], expectedMesh, fixture.kind + ': renderer uses the correct mesh');
      if (fixture.shape === 'd8') {
        assert.ok(result.hull.length >= 4, 'd8 rests with at least a diamond silhouette, never a tetrahedron-like triangle');
        assert.ok(result.visibleFaces >= 4, 'd8 shows both pyramids rather than one flat triangular face');
      }
      if (fixture.shape === 'd12' || fixture.shape === 'd20') {
        assert.ok(result.hull.length >= 5, fixture.kind + ': many-sided projected silhouette');
        assert.ok(result.visibleFaces >= 4, fixture.kind + ': multiple visible faces show its volume');
      }
      row.cases.push({ kind: fixture.kind, shape: result.shape, hull: result.hull.length,
        visibleFaces: result.visibleFaces, mesh: result.mesh });
      if (fixture.kind === 'd8') {
        await page.screenshot({ path: path.join(path.dirname(reportPath), `${name}-d8-rest.png`) });
      }
    }
    const previews = await page.evaluate(() => Object.fromEntries(['d4', 'd8', 'd12', 'd20'].map(shape => [shape, {
      model: window.__diceRestQA.POLY[shape], matrix: window.__diceRestQA.poseFor(shape),
    }])));
    const previewHulls = Object.fromEntries(Object.entries(previews).map(([shape, { model, matrix }]) =>
      [shape, projectPose(model, matrix).hull]));
    assert.equal(previewHulls.d4, 3, 'cosmetic d4 preview has a clear triangular silhouette');
    assert.equal(previewHulls.d8, 4, 'cosmetic d8 preview has a clear diamond silhouette');
    assert.ok(previewHulls.d12 >= 5 && previewHulls.d20 >= 5, 'larger dice previews keep many-sided silhouettes');
    row.previewHulls = previewHulls;
    const outcomes = await inspectD8Results(page);
    assert.equal(outcomes.bought, 'd8', 'physical d8 fixture was purchased');
    assert.equal(outcomes.dieState, 'settle', 'representative d8 completes actual throw physics');
    assert.ok(outcomes.final >= 1 && outcomes.final <= 8, 'physical d8 awards a valid landed face');
    assert.deepEqual([outcomes.physicalAtLanding, outcomes.physicalAfterSettle,
      outcomes.visualAtLanding, outcomes.visualAfterSettle, outcomes.slotFinal],
    [outcomes.final, outcomes.final, outcomes.final, outcomes.final, outcomes.final],
    'd8 awards the screen-top face without switching it during settle');
    const settled = projectPose(outcomes.model, outcomes.actual);
    assert.ok(settled.hull >= 4 && settled.visibleFaces >= 3,
      `actual settled d8 stays volumetric (hull=${settled.hull}, visible=${settled.visibleFaces}, final=${outcomes.final})`);
    row.d8Physical = { frames: outcomes.frames, final: outcomes.final, hull: settled.hull, visibleFaces: settled.visibleFaces };
    assert.deepEqual(errors, [], name + ': no uncaught browser errors');
  } finally {
    row.pageErrors = errors;
    save();
    await context.close();
  }
}

(async () => {
  const browser = await launchBrowser();
  try {
    if (!process.argv.includes('--phone-only')) await run(browser, 'desktop', { width: 1240, height: 860 }, false);
    if (!process.argv.includes('--desktop-only')) await run(browser, 'phone', { width: 390, height: 844 }, true);
    report.pass = true;
    save();
    console.log('dice rest pose PASS', report.cases.map(x => x.name).join(', '));
  } finally { await browser.close(); }
})().catch(error => { report.error = error.stack; save(); console.error(error); process.exitCode = 1; });
