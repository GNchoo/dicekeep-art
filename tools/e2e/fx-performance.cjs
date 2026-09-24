#!/usr/bin/env node
'use strict';

// Repeatable visual/performance comparison for the live arena and reward FX.
// Run with --baseline to load the pre-overhaul game.js from Git while all
// other assets come from the current local site. This is a relative diagnostic,
// not an FPS promise for users' hardware.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { launchBrowser, gameUrl } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const baselineCommit = '151d8e076c396411861287562b84c0614a8e1f2f';
const version = process.argv.includes('--baseline') ? 'baseline' : 'current';
const output = path.join(repo, 'gen/e2e/fx-performance');
const imageDir = path.join(output, version);
fs.mkdirSync(imageDir, { recursive: true });
const scenarios = [
  { name: 'battle-15', towers: 15, event: null },
  { name: 'battle-14', towers: 14, event: null },
  { name: 'battle-all-1', towers: 15, event: null, allOne: true },
  { name: 'power-15', towers: 15, event: 'power' },
  { name: 'chest-d20', towers: 14, event: 'chest' },
  { name: 'enhance', towers: 15, event: 'enhance' },
  { name: 'high-die', towers: 15, event: 'highDie' },
];
const viewports = [
  ['desktop', { width: 1240, height: 860 }],
  ['phone', { width: 390, height: 844 }],
];

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return +(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))].toFixed(3));
}
function stats(values) {
  return { count: values.length, medianMs: percentile(values, .5), p95Ms: percentile(values, .95) };
}
function writeCanvasData(name, dataUrl) {
  const filename = path.join(imageDir, name);
  fs.writeFileSync(filename, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return path.relative(output, filename).replaceAll('\\', '/');
}

async function boot(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1');
    localStorage.setItem('dk_infHelpSeen', '1');
    // Time the game's actual RAF callback separately from synchronous draw().
    const nativeRAF = window.requestAnimationFrame.bind(window);
    const samples = { enabled: false, duration: [], intervals: [], last: 0 };
    window.__fxFrameSamples = samples;
    window.requestAnimationFrame = callback => nativeRAF(timestamp => {
      if (callback.name !== 'frame') return callback(timestamp);
      const started = performance.now();
      try { return callback(timestamp); }
      finally {
        if (samples.enabled) {
          samples.duration.push(performance.now() - started);
          if (samples.last) samples.intervals.push(started - samples.last);
          samples.last = started;
        }
      }
    });
  });
  await page.route('**/game.js*', async route => {
    const response = await route.fetch();
    const source = version === 'baseline'
      ? execFileSync('git', ['show', `${baselineCommit}:game.js`], { cwd: repo, encoding: 'utf8' })
      : await response.text();
    const anchor = 'window.DK = S;';
    if (!source.includes(anchor)) throw Error('Missing game QA hook anchor');
    const hook = 'window.__fxPerfQA={draw,advancePresentation,spawnEnemy,buildInfinityWave,refreshDirectionalDemand,spots:()=>SPOTS,lanes:()=>LANES,towerFire,updateVisuals};\n';
    await route.fulfill({ response, contentType: 'application/javascript', body: source.replace(anchor, hook + anchor) });
  });
  await page.goto(gameUrl());
  await page.waitForFunction(() => window.DK?.phase === 'title' && window.__fxPerfQA, null, { timeout: 120000 });
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
  return { context, page, errors };
}

// A saturated but bounded arena: five authored monster themes, 80 walkers,
// 14/15 real tower positions, durable targets and no synthetic combat sprites.
async function fixture(page, scenario) {
  const state = await page.evaluate(({ towers, event, allOne }) => {
    const q = window.__fxPerfQA;
    DKstartInf('clear');
    DK.paused = true; DK.muted = true; DK.gold = 100000000;
    DK.lives = 100000; DK.wave = 80; DK.waveActive = true; DK.spawnQ = [];
    DK.enemies = []; DK.towers = []; DK.projs = []; DK.beams = [];
    DK.fxs = []; DK.texts = []; DK.corpses = []; DK.shakeT = 0; DK.bannerT = 0;
    DK.heldDie = 0; DKSLOT.active = false; DK.selTower = null;
    const waves = [1, 4, 35, 64, 80], lanes = q.lanes();
    for (let i = 0; i < 80; i++) {
      const wave = waves[i % waves.length];
      q.spawnEnemy(q.buildInfinityWave(wave)[0]);
      const enemy = DK.enemies.at(-1), lane = lanes[enemy.lane];
      enemy.dist = (lane.loopAt || 0) + (lane.len - (lane.loopAt || 0)) * (i / 80);
      enemy.entranceT = -1; enemy.hp = enemy.max = 1e12;
      enemy.artWalkDistance = i * 11;
    }
    const spots = q.spots();
    if (spots.length < towers) throw Error(`Need ${towers} tower spots, got ${spots.length}`);
    DK.towers = Array.from({ length: towers }, (_, i) => {
      const face = event === 'power' || allOne ? 1 : i + 1;
      return { face, def: DKTD[face], lvl: 1, spot: i, x: spots[i][0], y: spots[i][1], skin: 0, cd: 0 };
    });
    q.refreshDirectionalDemand(true);
    return { enemies: DK.enemies.length, towers: DK.towers.length, map: DK.mapKey, canvas: [document.querySelector('#game').width, document.querySelector('#game').height] };
  }, scenario);
  await page.waitForFunction(() => !window.DKART?.state().running, null, { timeout: 60000 });
  assert.equal(state.enemies, 80, 'all 80 authored enemy instances are active');
  assert.equal(state.towers, scenario.towers, 'all tower positions are active');
  return state;
}

async function trigger(page, event) {
  if (!event) return { triggered: false };
  return page.evaluate(event => {
    DK.fxs = []; DK.texts = []; DK.projs = []; DK.beams = [];
    if (event === 'power') {
      const success = DKupgrade(1);
      return { triggered: success, effectCount: DK.fxs.length, matchingTowers: DK.towers.filter(t => t.face === 1).length };
    }
    if (event === 'chest') {
      const chest = DKCONTENT.INFINITY.chest, original = chest.draw;
      let kind;
      try { chest.draw = () => 'd20'; kind = DKchest(); }
      finally { chest.draw = original; }
      return { triggered: kind === 'd20', kind, effectCount: DK.fxs.length };
    }
    if (event === 'enhance') {
      DK.selTower = DK.towers.find(t => t.face === 7);
      const random = Math.random;
      let result;
      try { Math.random = () => 0; result = DKenhance(); }
      finally { Math.random = random; }
      return { triggered: result === 'up', result, effectCount: DK.fxs.length };
    }
    if (event === 'highDie') {
      DKacquire(20);
      return { triggered: true, effectCount: DK.fxs.length };
    }
    throw Error(`Unknown effect: ${event}`);
  }, event);
}

async function sampleDraw(page, scenario, tag) {
  const data = await page.evaluate(() => {
    const q = window.__fxPerfQA, canvas = document.querySelector('#game');
    // Warm common backgrounds and text first, then time the first 1 s of FX.
    for (let i = 0; i < 20; i++) q.draw();
    const draws = [], frames = [];
    const originalRandom = Math.random;
    let seed = 0x42d1ce;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    try {
      for (let i = 0; i < 60; i++) {
        for (const e of DK.enemies) { e.animT += 1 / 60; e.artWalkDistance += .4; }
        for (const t of DK.towers) q.towerFire(t, 1 / 60);
        q.updateVisuals(1 / 60);
        q.advancePresentation(1 / 60);
        const start = performance.now(); q.draw(); draws.push(performance.now() - start);
        if ([8, 24, 48].includes(i)) frames.push({ frame: i, image: canvas.toDataURL('image/png') });
      }
    } finally { Math.random = originalRandom; }
    return { draws, frames, remainingFx: DK.fxs.length, projectiles: DK.projs.length };
  });
  const filmstrip = data.frames.map(({ frame, image }) => writeCanvasData(`${tag}-${scenario.name}-${String(frame).padStart(2, '0')}.png`, image));
  assert.equal(data.draws.length, 60, 'measure exactly one second of draw calls');
  assert.equal(filmstrip.length, 3, 'capture three visual checkpoints');
  return { draw: stats(data.draws), filmstrip, remainingFx: data.remainingFx, projectiles: data.projectiles };
}

async function sampleRAF(page) {
  await page.evaluate(() => {
    const sample = window.__fxFrameSamples;
    sample.duration = []; sample.intervals = []; sample.last = 0; sample.enabled = true;
    DK.paused = false;
  });
  await page.waitForTimeout(1100);
  return page.evaluate(() => {
    const sample = window.__fxFrameSamples;
    sample.enabled = false; DK.paused = true;
    return { duration: sample.duration, intervals: sample.intervals };
  });
}

function attachRelativeCosts(rows) {
  for (const row of rows) {
    const control = row.scenario === 'power-15' ? 'battle-all-1' : `battle-${row.fixture.towers}`;
    const baseline = rows.find(other => other.viewport === row.viewport && other.scenario === control);
    if (!baseline || baseline === row) continue;
    row.relativeTo = baseline.scenario;
    const delta = (value, base) => value == null || base == null ? null : +(value - base).toFixed(3);
    row.addedCost = {
      drawMedianMs: delta(row.draw.medianMs, baseline.draw.medianMs),
      drawP95Ms: delta(row.draw.p95Ms, baseline.draw.p95Ms),
      rafMedianMs: delta(row.raf.duration.medianMs, baseline.raf.duration.medianMs),
      rafP95Ms: delta(row.raf.duration.p95Ms, baseline.raf.duration.p95Ms),
    };
  }
}

function writeFilmstrip(rows) {
  const cards = rows.filter(row => row.filmstrip.length).map(row => `<section><h2>${row.viewport} · ${row.scenario}</h2><p>draw median ${row.draw.medianMs} ms · p95 ${row.draw.p95Ms} ms · RAF frames ${row.raf.duration.count}</p><div>${row.filmstrip.map(file => `<img src="${file}" alt="${row.scenario} animation frame">`).join('')}</div></section>`).join('\n');
  fs.writeFileSync(path.join(output, `filmstrip-${version}.html`), `<!doctype html><meta charset="utf-8"><title>Dicekeep FX ${version}</title><style>body{background:#17151d;color:#f8edcf;font:16px sans-serif;margin:24px}section{margin:0 0 30px}h2{font-size:18px}p{color:#b9b3c5}div{display:flex;gap:8px;overflow:auto}img{width:32%;min-width:240px;object-fit:contain;background:#39344f}</style><h1>${version} FX filmstrip</h1>${cards}`);
}
function writeComparison() {
  const beforePath = path.join(output, 'report-baseline.json');
  const afterPath = path.join(output, 'report-current.json');
  if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) return;
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
  const rows = after.rows.map(current => {
    const old = before.rows.find(row => row.viewport === current.viewport && row.scenario === current.scenario);
    if (!old) return null;
    return {
      viewport: current.viewport, scenario: current.scenario,
      draw: { before: old.draw, after: current.draw },
      raf: { before: old.raf, after: current.raf },
      relativeAddedCost: { before: old.addedCost || null, after: current.addedCost || null },
      filmstrip: { before: old.filmstrip, after: current.filmstrip },
    };
  }).filter(Boolean);
  fs.writeFileSync(path.join(output, 'comparison.json'), JSON.stringify({ baselineCommit, note: 'Paired relative diagnostics on the same machine; browser refresh/compositor behavior is hardware-dependent.', rows }, null, 2));
  const cards = rows.map(row => `<section><h2>${row.viewport} · ${row.scenario}</h2><p>Old: draw ${row.draw.before.medianMs}/${row.draw.before.p95Ms} ms, ${row.raf.before.duration.count} RAF callbacks · New: draw ${row.draw.after.medianMs}/${row.draw.after.p95Ms} ms, ${row.raf.after.duration.count} RAF callbacks</p><div class="pair"><div><h3>Before</h3><div class="frames">${row.filmstrip.before.map(file => `<img src="${file}" alt="Old ${row.scenario}">`).join('')}</div></div><div><h3>After</h3><div class="frames">${row.filmstrip.after.map(file => `<img src="${file}" alt="New ${row.scenario}">`).join('')}</div></div></div></section>`).join('\n');
  fs.writeFileSync(path.join(output, 'comparison.html'), `<!doctype html><meta charset="utf-8"><title>Dicekeep FX comparison</title><style>body{background:#17151d;color:#f8edcf;font:16px sans-serif;margin:24px}section{margin:0 0 38px;padding-bottom:24px;border-bottom:1px solid #625b6c}h2{font-size:19px}h3{font-size:16px}p{color:#b9b3c5}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.frames{display:flex;gap:4px}.frames img{width:33%;min-width:0;object-fit:contain;background:#39344f}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>Dicekeep FX · before / after</h1><p>Relative browser diagnostics on this machine, not a device FPS guarantee.</p>${cards}`);
}

(async () => {
  const report = { version, baselineCommit, note: 'Relative Chromium diagnostics on this machine; not a device FPS guarantee.', rows: [], errors: [] };
  const browser = await launchBrowser();
  try {
    for (const [viewportName, viewport] of viewports) {
      const { context, page, errors } = await boot(browser, viewport);
      try {
        // Prime directional sprite frames, tower rasters and V8 paths before
        // the first measured scenario; otherwise it alone pays cache setup.
        await fixture(page, scenarios[0]);
        await page.evaluate(() => {
          const q = window.__fxPerfQA;
          for (let i = 0; i < 140; i++) {
            for (const e of DK.enemies) { e.animT += 1 / 60; e.artWalkDistance += .4; }
            q.draw();
          }
        });
        for (const scenario of scenarios) {
          const fixtureState = await fixture(page, scenario);
          const event = await trigger(page, scenario.event);
          if (scenario.event && !event.triggered) throw Error(`${scenario.name}: trigger failed ${JSON.stringify(event)}`);
          const tag = viewportName;
          const draw = await sampleDraw(page, scenario, tag);
          // Run the same event again for naturally scheduled frame measurements.
          await fixture(page, scenario);
          await trigger(page, scenario.event);
          const raf = await sampleRAF(page);
          assert.ok(raf.duration.length > 10 && raf.intervals.length > 9, `${viewportName}/${scenario.name}: scheduled frames captured`);
          const row = { viewport: viewportName, scenario: scenario.name, fixture: fixtureState, event,
            ...draw, raf: { duration: stats(raf.duration), intervals: stats(raf.intervals) } };
          report.rows.push(row);
          console.log(`${version} ${viewportName} ${scenario.name}: draw ${row.draw.medianMs}/${row.draw.p95Ms} ms, RAF ${row.raf.duration.count} frames ${row.raf.duration.medianMs}/${row.raf.duration.p95Ms} ms`);
        }
        report.errors.push(...errors.map(error => `${viewportName}: ${error}`));
      } finally { await context.close(); }
    }
    attachRelativeCosts(report.rows);
    if (report.errors.length) throw Error(`Browser errors: ${report.errors.join(' | ')}`);
    writeFilmstrip(report.rows);
  } finally {
    fs.writeFileSync(path.join(output, `report-${version}.json`), JSON.stringify(report, null, 2));
    writeComparison();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
