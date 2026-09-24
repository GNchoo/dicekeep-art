#!/usr/bin/env node
'use strict';

// Verify positions sent to the real canvas, not a duplicate particle implementation.
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 860 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/game.js*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const anchor = 'window.DK = S;';
      assert.equal(source.split(anchor).length, 2);
      await route.fulfill({ response, body: source.replace(anchor,
        'window.__motionQA={updateVisuals,advancePresentation,draw};\n' + anchor) });
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
    const cases = await page.evaluate(() => {
      DKstartInf('clear'); DK.paused = true; DK.towers = []; DK.enemies = [];
      DK.projs = []; DK.beams = []; DK.texts = [];
      const context = document.querySelector('#game').getContext('2d');
      const originalArc = context.arc, originalImage = context.drawImage;
      const paint = effect => {
        DK.fxs = [effect];
        let point = null;
        context.arc = function(x, y, ...args) {
          if (this.fillStyle === '#ff00f1') point = { x, y };
          return originalArc.call(this, x, y, ...args);
        };
        context.drawImage = function(image, ...args) {
          if (image === DKA.starSpark.cv) {
            const matrix = this.getTransform();
            point = { x: matrix.e, y: matrix.f };
          }
          return originalImage.call(this, image, ...args);
        };
        try { __motionQA.draw(); }
        finally { context.arc = originalArc; context.drawImage = originalImage; }
        return point;
      };
      const run = (kind, realtime, steps, delay = 0) => {
        const effect = { kind, img: 'starSpark', x: 310, y: 270, vx: 80, vy: -60,
          t: -delay, dur: 2, size: 6, color: '#ff00f1', realtime };
        DK.fxs = [effect];
        for (const dt of steps) {
          __motionQA.updateVisuals(dt);
          __motionQA.advancePresentation(dt);
        }
        return { kind, realtime, time: effect.t, origin: { x: effect.x, y: effect.y }, point: paint(effect) };
      };
      const rows = [];
      for (const kind of ['sprite', 'burst']) for (const realtime of [false, true]) {
        rows.push({ name: `${kind}-${realtime ? 'wall' : 'simulation'}-half-second`, ...run(kind, realtime, [0.5]) });
        rows.push({ name: `${kind}-${realtime ? 'wall' : 'simulation'}-60hz`, ...run(kind, realtime, Array(30).fill(1 / 60)) });
        rows.push({ name: `${kind}-${realtime ? 'wall' : 'simulation'}-delayed-hidden`, ...run(kind, realtime, [0.1], 0.2) });
        rows.push({ name: `${kind}-${realtime ? 'wall' : 'simulation'}-delayed-visible`, ...run(kind, realtime, [0.15, 0.1], 0.2) });
      }
      // Integrated sparks/dust must also remain stationary before their scheduled start.
      const spark = { kind: 'sparkle', x: 310, y: 270, vx: 80, vy: -60, t: -0.2, dur: 2, size: 3 };
      DK.fxs = [spark]; __motionQA.updateVisuals(0.1);
      rows.push({ name: 'integrated-delay', origin: { x: spark.x, y: spark.y }, vy: spark.vy });
      __motionQA.updateVisuals(0.15);
      rows.push({ name: 'integrated-start', origin: { x: spark.x, y: spark.y }, vy: spark.vy });
      return rows;
    });
    const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.0001, `${message}: ${actual} vs ${expected}`);
    for (const row of cases) {
      if (row.name === 'integrated-delay') {
        assert.deepEqual(row.origin, { x: 310, y: 270 }); near(row.vy, -60, row.name);
      } else if (row.name === 'integrated-start') {
        near(row.origin.x, 314, row.name); near(row.origin.y, 267.2, row.name); near(row.vy, -52, row.name);
      } else {
        assert.deepEqual(row.origin, { x: 310, y: 270 }, `${row.name}: original emission point stays fixed`);
        if (row.time < 0) assert.equal(row.point, null, `${row.name}: delayed particle is not painted`);
        else {
          assert.ok(row.point, `${row.name}: particle painted`);
          near(row.point.x, 310 + 80 * row.time, `${row.name} x`);
          near(row.point.y, 270 - 60 * row.time + (row.kind === 'burst' ? 160 * row.time ** 2 : 0), `${row.name} y`);
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${cases.length} rendered particle motion cases: stable origins, delayed start, single integration, simulation/wall clocks`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
