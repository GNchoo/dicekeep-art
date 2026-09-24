#!/usr/bin/env node
'use strict';

// Browser regression coverage for the visible results of power-ups, chests,
// and probabilistic enhancement. The injected hook only exposes frame helpers;
// actions still use the game's public controls and test hooks.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');

const out = path.resolve(__dirname, '../../gen/e2e/presentation-fx');
fs.mkdirSync(out, { recursive: true });
const report = { scope: 'Presentation effects in the real game at desktop and phone sizes', pass: false, cases: [] };

function check(value, message) { assert.ok(value, message); }

async function clearNotices(page) {
  await page.evaluate(() => {
    for (const id of ['chest-reveal', 'enhance-toast']) {
      const notice = document.getElementById(id);
      if (!notice) continue;
      clearTimeout(notice.hideTimer);
      notice.classList.add('hidden');
    }
  });
}

async function powerSnapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#game');
    const rect = canvas.getBoundingClientRect();
    const w = canvas.width, h = canvas.height;
    const screen = (x, y) => ({ x: +(rect.left + x * rect.width / w).toFixed(1), y: +(rect.top + y * rect.height / h).toFixed(1) });
    const entry = fx => ({ kind: fx.kind, status: fx.status, x: fx.x, y: fx.y, t: +fx.t.toFixed(3), dur: fx.dur,
      realtime: !!fx.realtime, active: DK.fxs.includes(fx), screen: screen(fx.x, fx.y) });
    return {
      mapKey: DK.mapKey, canvas: { w, h }, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      stage: { paused: DK.paused, waveActive: DK.waveActive },
      saved: (window.__powerShotFx || []).map(entry),
      active: DK.fxs.filter(fx => fx.kind === 'towerHalo' || (fx.realtime && ['circle', 'ring'].includes(fx.kind))).map(entry),
      towers: DK.towers.map(tower => ({ face: tower.face, x: tower.x, y: tower.y, screen: screen(tower.x, tower.y - 32) })),
    };
  });
}

async function screenshotStage(page, name, { freezePower = false } = {}) {
  const diagnostic = freezePower && name.startsWith('power-pure-');
  const before = diagnostic ? await powerSnapshot(page) : null;
  const frozen = await page.evaluate(({ freezePower }) => {
    DK.waveActive = true;
    let count = 0;
    if (freezePower) {
      // Screenshot capture can outlive the short real-time FX. Freeze only the
      // power-up's visual particles after their timing assertions have passed.
      for (const fx of window.__powerShotFx || []) {
        if (!['towerHalo', 'circle', 'ring'].includes(fx.kind)) continue;
        if (!DK.fxs.includes(fx)) DK.fxs.push(fx);
        fx.realtime = false;
        fx.t = 0.45;
        fx.dur = Math.max(fx.dur, 1.5);
        count++;
      }
    }
    __presentationQA.draw();
    return count;
  }, { freezePower });
  if (freezePower) check(frozen >= 3, `power-up screenshot has its own frozen particles (${frozen})`);
  const during = diagnostic ? await powerSnapshot(page) : null;
  await page.screenshot({ path: path.join(out, name) });
  if (diagnostic) {
    const after = await powerSnapshot(page);
    fs.writeFileSync(path.join(out, name.replace('.png', '-debug.json')), JSON.stringify({ before, during, after }, null, 2));
  }
  await page.evaluate(() => { DK.waveActive = false; });
}

async function boot(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
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
    assert.equal(source.split(anchor).length, 2, 'one presentation test hook anchor');
    await route.fulfill({ response, body: source.replace(anchor, 'window.__presentationQA={update,advancePresentation,draw,relayoutArena,spawnBurst,acquireFxArt};\n' + anchor) });
  });
  await page.goto(gameUrl());
  await page.waitForFunction(() => window.DK?.phase === 'title' && window.__presentationQA, null, { timeout: 120000 });
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
  return { context, page, errors };
}

async function purePower(page, row) {
  await clearNotices(page);
  await page.evaluate(() => { DKstartInf('clear'); DK.paused = true; DK.gold = 100000; });
  // The portrait arena is rebuilt after the HUD first appears. A player cannot
  // power up before that paint; wait for the test viewport to finish relayout.
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    DK.towers = []; DK.fxs = []; DK.texts = [];
    const put = (face, spot) => {
      DK.heldDie = face;
      if (!DKplace(spot)) throw Error(`could not place ★${face} at ${spot}`);
      return DK.towers.find(t => t.spot === spot);
    };
    const towers = [put(6, 4), put(7, 5), put(14, 7), put(20, 8), put(5, 0)];
    DK.fxs = []; DK.texts = [];
    const upgraded = DKupgrade(6);
    window.__powerShotFx = DK.fxs.filter(f => f.realtime);
    const halos = DK.fxs.filter(f => f.kind === 'towerHalo' && f.status === 'power');
    return {
      upgraded,
      towers: towers.map(t => ({ face: t.face, x: t.x, y: t.y })),
      halos: halos.map(f => ({ x: f.x, y: f.y, realtime: f.realtime, dur: f.dur })),
      notice: DK.texts.find(t => t.str.includes('파워업 Lv'))?.str,
    };
  });
  check(state.upgraded, 'six-pip power-up succeeds');
  check(state.halos.length === 4, 'six-pip power-up lights ★6 and every ★7+ tower');
  for (const tower of state.towers.filter(t => t.face === 6 || t.face > 6)) {
    check(state.halos.some(f => f.x === tower.x && f.y === tower.y - 32 && f.realtime && f.dur >= 1.8), `★${tower.face} gets a real-time tower halo`);
  }
  check(!state.halos.some(f => f.x === state.towers[4].x && f.y === state.towers[4].y - 32), 'unrelated ★5 tower stays unlit');
  check(state.notice?.includes('파워업'), 'power-up has a readable result line');
  row.checks.push('pure-power');
  await screenshotStage(page, `power-pure-${row.name}.png`, { freezePower: true });
}

async function realtimeAtTripleSpeed(page, row) {
  const deterministic = await page.evaluate(() => {
    DK.paused = true; DK.speed = 3; DK.gold = 100000;
    DK.fxs = []; DK.texts = [];
    if (!DKupgrade(6)) throw Error('could not create a fresh power effect');
    const fx = DK.fxs.find(f => f.kind === 'towerHalo' && f.status === 'power');
    const label = DK.texts.find(t => t.str.includes('파워업 Lv'));
    if (!fx || !label) throw Error('power effect and result text are required');
    const start = [fx.t, label.t];
    for (let i = 0; i < DK.speed; i++) __presentationQA.update(0.1);
    const afterCombat = [fx.t, label.t];
    __presentationQA.advancePresentation(0.1);
    return { start, afterCombat, afterPresentation: [fx.t, label.t] };
  });
  for (let i = 0; i < 2; i++) {
    check(Math.abs(deterministic.afterCombat[i] - deterministic.start[i]) < 1e-6, 'x3 combat steps do not advance important presentation clocks');
    check(Math.abs(deterministic.afterPresentation[i] - deterministic.start[i] - 0.1) < 1e-6, 'one real-time step advances the presentation clock once');
  }

  const liveStart = await page.evaluate(() => {
    DK.fxs = []; DK.texts = []; DK.gold = 100000;
    DK.speed = 3; DK.paused = false;
    if (!DKupgrade(6)) throw Error('could not create live x3 effect');
    const fx = DK.fxs.find(f => f.kind === 'towerHalo' && f.status === 'power');
    const label = DK.texts.find(t => t.str.includes('파워업 Lv'));
    window.__presentationWatch = { fx, label, at: performance.now(), fxT: fx.t, textT: label.t };
    return { fxT: fx.t, textT: label.t };
  });
  await page.waitForTimeout(350);
  const live = await page.evaluate(() => {
    const w = window.__presentationWatch;
    DK.paused = true;
    return { elapsed: (performance.now() - w.at) / 1000, fx: w.fx.t - w.fxT, text: w.label.t - w.textT };
  });
  check(liveStart.fxT < 0.1 && liveStart.textT < 0.1, 'fresh x3 effects begin at time zero');
  check(live.fx > 0.05 && live.fx / live.elapsed < 1.65, `x3 halo follows wall time (${JSON.stringify(live)})`);
  check(live.text > 0.05 && live.text / live.elapsed < 1.65, `x3 result line follows wall time (${JSON.stringify(live)})`);
  row.checks.push('x3-realtime');
}

async function portraitPowerRelayout(page, row) {
  const sample = await page.evaluate(() => {
    DK.paused = true; DK.gold = 100000;
    DK.fxs = []; DK.texts = [];
    if (!DKupgrade(6)) throw Error('could not create halo for portrait relayout');
    const canvas = document.querySelector('#game');
    const hud = document.querySelector('#hud');
    const previousHudHeight = hud.style.height;
    const mapKey = DK.mapKey;
    const view = () => ({
      mapKey: DK.mapKey, width: canvas.width, height: canvas.height,
      towers: DK.towers.map(t => ({ spot: t.spot, face: t.face, x: t.x, y: t.y })),
      halos: DK.fxs.filter(f => f.kind === 'towerHalo' && f.status === 'power').map(f => ({
        spot: f.anchorSpot, x: f.x, y: f.y, t: f.t, dur: f.dur, realtime: f.realtime,
      })),
    });
    const before = view();
    let after;
    try {
      hud.style.height = `${hud.offsetHeight + 80}px`;
      __presentationQA.relayoutArena(mapKey, true);
      after = view();
    } finally {
      hud.style.height = previousHudHeight;
      __presentationQA.relayoutArena(mapKey, true);
    }
    return { before, after };
  });
  check(sample.before.mapKey === 'cInfP' && sample.after.mapKey === 'cInfP', 'portrait relayout keeps the same arena orientation');
  check(sample.after.height !== sample.before.height, 'changed HUD height rebuilds portrait canvas coordinates');
  check(sample.before.halos.length === 4 && sample.after.halos.length === 4, 'all four power halos survive same-direction relayout');
  for (const halo of sample.after.halos) {
    const tower = sample.after.towers.find(t => t.spot === halo.spot);
    check(tower && halo.x === tower.x && halo.y === tower.y - 32 && halo.realtime, `power halo stays on its new tower spot ${halo.spot}`);
  }
  row.relayout = sample;
  row.checks.push('portrait-power-relayout');
}

async function rareChest(page, row) {
  await clearNotices(page);
  const state = await page.evaluate(() => {
    DKstartInf('clear');
    DK.paused = true; DK.gold = 100000;
    DK.fxs = []; DK.texts = []; DK.towers = [];
    DK.heldDie = 0; DKSLOT.active = false;
    const chest = DKCONTENT.INFINITY.chest;
    const original = chest.draw;
    let kind;
    try { chest.draw = () => 'd8'; kind = DKchest(); }
    finally { chest.draw = original; }
    const fx = DK.fxs.find(f => f.kind === 'chestOpen');
    const notice = document.querySelector('#chest-reveal');
    return {
      kind,
      slotKind: DKSLOT.kind,
      fx: fx && { realtime: fx.realtime, dur: fx.dur, size: fx.size, add: fx.add },
      notice: { visible: !notice.classList.contains('hidden'), text: notice.textContent, tier: notice.dataset.tier },
      artFrames: DKA.chestOpen?.length || 0,
    };
  });
  check(state.kind === 'd8' && state.slotKind === 'd8', 'forced d8 chest enters the real roll flow');
  check(state.fx?.realtime && state.fx.dur >= 1.1 && state.fx.size <= 280 && state.fx.add !== true, 'd8 chest uses a readable, board-sized real-time sprite');
  check(state.notice.visible && state.notice.text.includes('상자 개봉') && state.notice.tier === 'rare', 'd8 chest has a visible stage result notice');
  check(state.artFrames === 4, 'four chest animation frames loaded');

  const composites = await page.evaluate(() => {
    __presentationQA.advancePresentation(0.92);
    const canvas = document.querySelector('#game');
    const context = canvas.getContext('2d');
    const original = context.drawImage;
    const chestFrames = new Set(DKA.chestOpen.map(frame => frame.cv));
    const seen = [];
    context.drawImage = function(image, ...args) {
      if (chestFrames.has(image)) seen.push(this.globalCompositeOperation);
      return original.call(this, image, ...args);
    };
    try { __presentationQA.draw(); }
    finally { context.drawImage = original; }
    return seen;
  });
  check(composites.includes('source-over'), `chest art is actually painted source-over (${composites.join(', ')})`);
  const chestMotion = await sheetMotion(page, 'chestOpen', [0.10, 0.13, 0.68]);
  check(Math.abs(chestMotion[1].width - chestMotion[0].width) > 0.2, 'chest changes scale between adjacent animation frames');
  check(chestMotion[2].frame === 3, 'chest reaches its open frame within the first 0.7 seconds');
  row.checks.push('rare-chest');
  await screenshotStage(page, `chest-d8-${row.name}.png`);
}

async function legendaryChest(page, row) {
  await clearNotices(page);
  const state = await page.evaluate(() => {
    DKstartInf('clear');
    DK.paused = true; DK.gold = 100000; DK.fxs = []; DK.texts = []; DK.towers = [];
    DK.heldDie = 0; DKSLOT.active = false;
    const chest = DKCONTENT.INFINITY.chest;
    const original = chest.draw;
    let kind;
    try { chest.draw = () => 'd20'; kind = DKchest(); }
    finally { chest.draw = original; }
    const fx = DK.fxs.find(f => f.kind === 'chestOpen');
    return { kind, size: fx?.size, dur: fx?.dur, realtime: fx?.realtime,
      burstCount: DK.fxs.filter(f => f.kind === 'burst').length };
  });
  check(state.kind === 'd20' && state.realtime, 'legendary chest uses the real physical-die roll');
  check(state.size <= 270 && state.size >= 180, `legendary chest does not obscure the board (${state.size}px)`);
  check(state.dur <= 1.6 && state.burstCount <= 20, 'legendary chest stays brisk with a bounded particle count');
  const motion = await sheetMotion(page, 'chestOpen', [0.10, 0.13, 0.68]);
  check(Math.abs(motion[1].width - motion[0].width) > 0.2 && motion[2].frame === 3, 'legendary chest opens with continuous motion between illustration frames');
  row.checks.push('legendary-chest');
  await screenshotStage(page, `chest-d20-${row.name}.png`);
}

async function sheetMotion(page, kind, times) {
  return page.evaluate(({ kind, times }) => {
    const fx = DK.fxs.find(f => f.kind === kind);
    if (!fx) throw Error(`missing ${kind} effect`);
    const frames = DKA[kind];
    const canvas = document.querySelector('#game');
    const ctx = canvas.getContext('2d');
    const source = ctx.drawImage;
    const seen = [];
    for (const t of times) {
      fx.t = t;
      const draws = [];
      ctx.drawImage = function(image, ...args) {
        const frame = frames.findIndex(item => item.cv === image);
        if (frame >= 0) draws.push({ frame, width: args[2], alpha: this.globalAlpha });
        return source.call(this, image, ...args);
      };
      try { __presentationQA.draw(); }
      finally { ctx.drawImage = source; }
      if (!draws.length) throw Error(`${kind} was not painted at ${t}`);
      seen.push(draws.reduce((a, b) => a.width >= b.width ? a : b));
    }
    return seen;
  }, { kind, times });
}

async function enhancementSuccess(page, row) {
  await clearNotices(page);
  const state = await page.evaluate(() => {
    DKstartInf('clear');
    DK.paused = true; DK.gold = 100000;
    DK.heldDie = 7;
    if (!DKplace(5)) throw Error('could not place enhancement tower');
    DK.fxs = []; DK.texts = [];
    const tower = DK.towers[0];
    DK.selTower = tower;
    const random = Math.random;
    let result;
    try { Math.random = () => 0; result = DKenhance(); }
    finally { Math.random = random; }
    const notice = document.querySelector('#enhance-toast');
    const halo = DK.fxs.find(f => f.kind === 'towerHalo' && f.status === 'up');
    return {
      result, face: tower.face, selected: DK.selTower === tower,
      halo: halo && { realtime: halo.realtime, dur: halo.dur, x: halo.x, y: halo.y },
      notice: { visible: !notice.classList.contains('hidden'), text: notice.textContent, result: notice.dataset.result },
    };
  });
  check(state.result === 'up' && state.face === 8 && state.selected, 'successful enhancement upgrades the same selected tower');
  check(state.halo?.realtime && state.halo.dur >= 1.8, 'successful enhancement creates a lasting tower halo');
  check(state.notice.visible && state.notice.result === 'up' && state.notice.text.includes('★7 → ★8'), 'success is visible outside the log');
  const upgradeMotion = await sheetMotion(page, 'acquireBurst', [0.10, 0.13]);
  check(Math.abs(upgradeMotion[1].width - upgradeMotion[0].width) > 0.2, 'enhancement sparkle expands smoothly between sheet frames');
  const upgradeStars = await page.evaluate(() => DK.fxs.filter(f => f.kind === 'sprite' && f.img === 'starSpark' && f.anchorTower).length);
  check(upgradeStars >= 6, 'successful enhancement has several short tower-attached star accents');
  row.checks.push('enhancement-success');
  await page.evaluate(() => { __presentationQA.advancePresentation(0.3); __presentationQA.draw(); });
  await screenshotStage(page, `enhance-success-${row.name}.png`);
}

async function highDie(page, row) {
  await clearNotices(page);
  const state = await page.evaluate(() => {
    DKstartInf('clear'); DK.paused = true;
    DK.fxs = []; DK.texts = [];
    DKacquire(20);
    return { bursts: DK.fxs.filter(f => f.kind === 'burst').length, sparks: DK.fxs.filter(f => f.kind === 'sprite' && f.img === 'starSpark').length,
      rings: DK.fxs.filter(f => f.kind === 'ringImg').map(f => f.size), columns: DK.fxs.filter(f => f.kind === 'column').length,
      confetti: DK.fxs.filter(f => f.kind === 'confetti').length };
  });
  check(state.bursts <= 36 && state.sparks <= 16, `high die avoids an excessive number of blurred particles (${JSON.stringify(state)})`);
  check(state.rings.length === 1 && state.rings[0] <= 370 && state.columns <= 1 && state.confetti <= 1,
    `high die has one bounded primary ring, beam and confetti layer (${JSON.stringify(state)})`);
  const motion = await sheetMotion(page, 'acquireBurst', [0.10, 0.13, 0.56]);
  check(Math.abs(motion[1].width - motion[0].width) > 0.2, 'high-die reward burst expands smoothly');
  check(motion[2].frame === 3, 'high-die burst reaches its final illustration promptly');
  row.checks.push('high-die');
  await screenshotStage(page, `acquire-d20-${row.name}.png`);
  await page.evaluate(() => { for (const fx of DK.fxs) if (fx.realtime) fx.t = Math.min(0.9, fx.dur * 0.65); __presentationQA.draw(); });
  await screenshotStage(page, `acquire-d20-late-${row.name}.png`);
}

async function cosmeticRandomIsolation(page, row) {
  const calls = await page.evaluate(() => {
    DKstartInf('clear'); DK.paused = true; DK.fxs = []; DK.texts = [];
    const random = Math.random;
    let gameplayRandomCalls = 0;
    Math.random = () => { gameplayRandomCalls++; return 0.5; };
    try {
      __presentationQA.spawnBurst(240, 240, '#ffd452', 20, 120, 0.8);
      __presentationQA.acquireFxArt(20, 4, '#ffd452', 300, 300);
      DK.shakeT = 0.3;
      __presentationQA.draw();
    } finally { Math.random = random; }
    return gameplayRandomCalls;
  });
  check(calls === 0, `reward particles and screen shake never advance gameplay RNG (${calls} calls)`);
  row.checks.push('cosmetic-rng-isolation');
}

async function deckPower(page, row) {
  await clearNotices(page);
  const state = await page.evaluate(() => {
    const profile = DKPROGRESSION.defaultProfile();
    const deck = [1, 4, 7, 13, 14];
    for (const face of deck) {
      profile.levels[face] = 1;
      Object.assign(profile.collection.cards[face], { owned: true, class: DKDECKRULES.get(face).baseClass });
    }
    profile.deck = deck;
    DKSAVE.progression = profile;
    DKstartInf('build');
    DK.paused = true; DK.gold = 100000;
    DK.towers = []; DK.fxs = []; DK.texts = [];
    const put = (face, spot) => {
      DK.heldDie = face;
      if (!DKplace(spot)) throw Error(`could not place deck card ${face}`);
      return DK.towers.find(t => t.spot === spot);
    };
    const towers = [put(1, 4), put(1, 7), put(4, 2), put(7, 3)];
    DK.fxs = []; DK.texts = [];
    const upgraded = DKupgrade(1);
    window.__powerShotFx = DK.fxs.filter(f => f.realtime);
    return {
      deckSystem: DK.inf.growthSnapshot.deckSystem,
      upgraded,
      towers: towers.map(t => ({ face: t.face, x: t.x, y: t.y })),
      halos: DK.fxs.filter(f => f.kind === 'towerHalo' && f.status === 'power').map(f => ({ x: f.x, y: f.y, realtime: f.realtime })),
    };
  });
  check(state.deckSystem === 1 && state.upgraded, 'deck-specific power-up succeeds');
  check(state.halos.length === 2, 'each matching deck tower gets its own halo');
  for (const tower of state.towers.filter(t => t.face === 1)) check(state.halos.some(f => f.x === tower.x && f.y === tower.y - 32 && f.realtime), 'matching deck tower is lit');
  for (const tower of state.towers.filter(t => t.face !== 1)) check(!state.halos.some(f => f.x === tower.x && f.y === tower.y - 32), 'unrelated deck tower stays unlit');
  row.checks.push('deck-power');
  await screenshotStage(page, `power-deck-${row.name}.png`, { freezePower: true });
}

(async () => {
  const browser = await launchBrowser();
  try {
    for (const [name, viewport] of [['desktop', { width: 1240, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
      const row = { name, viewport, checks: [], errors: [] };
      report.cases.push(row);
      const { context, page, errors } = await boot(browser, viewport);
      try {
        await purePower(page, row);
        if (name === 'phone') await portraitPowerRelayout(page, row);
        await realtimeAtTripleSpeed(page, row);
        await rareChest(page, row);
        await legendaryChest(page, row);
        await enhancementSuccess(page, row);
        await highDie(page, row);
        await cosmeticRandomIsolation(page, row);
        await deckPower(page, row);
        assert.deepEqual(errors, [], `${name} has no browser errors`);
        console.log('PASS', name, row.checks.join(', '));
      } finally { row.errors.push(...errors); await context.close(); }
    }
    report.pass = true;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
