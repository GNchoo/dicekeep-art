#!/usr/bin/env node
'use strict';

// Real-browser coverage for the pure-luck chest's manual physical roll.
// Only the chest grade is fixed: the thrown physical die determines its own face.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
const { cameraFacingDieResult } = require('./camera-facing-die.cjs');

const reportPath = outputPath('manual-chest-roll.json');
const report = { scope: 'Local pure-luck chest input, settlement, enemy isolation, reward queue, and responsive controls', cases: [], pass: false };
const fixtures = [
  ['d1', false], ['d4', true],
  ['d6', true], ['d8', true], ['d12', true], ['d20', true],
  ['epic', true], ['myth', true], ['primal', true],
];

function save() { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
async function boot(browser, name, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1');
    localStorage.setItem('dk_infHelpSeen', '1');
  });
  await page.route('**/game.js*', async route => {
    const response = await route.fetch();
    let source = await response.text();
    const anchor = 'window.DK = S;';
    assert.equal(source.split(anchor).length, 2, 'single browser test hook');
    assert.equal(source.split('function strikeEnemiesWithDie() {').length, 2, 'enemy strike observer hook exists');
    source = source.replace('function strikeEnemiesWithDie() {', 'function strikeEnemiesWithDie() { window.__manualDieStrikes=(window.__manualDieStrikes||0)+1;');
    source = source.replace(anchor,
      'window.__manualQA={updateDie,updateSlot,pumpQueue,spawnEnemy,buildInfinityWave,TRAY,LOG,clearLog,finishSlot,readRunSave,ROLL_SHOW,dieFaceLabels,physicalFaceValue,dieShape,POLY,FACES,m3apply};\n' +
      'window.__manualQA.cameraFace=' + cameraFacingDieResult.toString() + ';\n' + anchor);
    await route.fulfill({ response, body: source });
  });
  await page.goto(gameUrl());
  try {
    await page.waitForFunction(() => window.DK && DK.phase === 'title' && window.__manualQA, null, { timeout: 120000 });
  } catch (error) {
    const state = await page.evaluate(() => ({ phase: window.DK?.phase, hook: !!window.__manualQA,
      load: document.querySelector('#ov-load-txt')?.textContent, ready: document.readyState,
      src: document.querySelector('script[src*="game.js"]')?.src, visibleText: document.body.innerText.slice(0, 600) })).catch(() => null);
    throw new Error(name + ' boot timeout: ' + JSON.stringify({ state, errors, cause: error.message }));
  }
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
  return { page, context, errors, name };
}

async function prepare(page, kind) {
  return page.evaluate(kind => {
    DKstartInf('clear');
    DK.paused = true;
    DK.gold = 10000;
    window.__manualDieStrikes = 0;
    const ch = DKCONTENT.INFINITY.chest;
    const draw = ch.draw, roll = ch.roll;
    let draws = 0, rolls = 0;
    try {
      ch.draw = () => { draws++; return kind; };
      ch.roll = () => { rolls++; if (kind !== 'd1') throw Error('A physical die face was selected before it landed'); return 1; };
      const goldBefore = DK.gold;
      const bought = DKchest();
      return {
        bought, draws, rolls,
        goldBefore, goldAfter: DK.gold, chests: DK.inf.chests,
        slot: { active: DKSLOT.active, phase: DKSLOT.phase, kind: DKSLOT.kind, final: DKSLOT.final },
        dieState: DKDIE.state, held: DK.heldDie,
        drawButtonDisabled: document.querySelector('#roll-btn').disabled,
        drawButtonText: document.querySelector('#roll-btn').textContent,
        dieCanvasVisible: !!document.querySelector('#game')?.getBoundingClientRect().width,
      };
    } finally { ch.draw = draw; ch.roll = roll; }
  }, kind);
}

async function stepUntilHeld(page, maxFrames = 540) {
  return page.evaluate(maxFrames => {
    const q = window.__manualQA, kind = DKSLOT.kind;
    let landing = null;
    for (let i = 0; i < maxFrames && !DK.heldDie; i++) {
      const priorState = DKDIE.state;
      q.updateDie(1 / 60);
      q.updateSlot(1 / 60);
      if (!landing && priorState === 'throw' && DKDIE.state === 'settle') {
        const visual = q.cameraFace(kind, DKDIE.R, q.dieFaceLabels(kind), q);
        landing = { visual: visual.value, physical: q.physicalFaceValue(kind, DKDIE.R),
          final: DKDIE.final, slot: DKSLOT.final };
      }
    }
    return { held: DK.heldDie, active: DKSLOT.active, phase: DKSLOT.phase, final: DKSLOT.final,
      dieState: DKDIE.state, strikes: window.__manualDieStrikes || 0, gold: DK.gold,
      enemyHp: DK.enemies.map(e => e.hp), landing };
  }, maxFrames);
}

async function stepSlot(page, frames) {
  return page.evaluate(frames => {
    for (let i = 0; i < frames; i++) window.__manualQA.updateSlot(1 / 60);
    return { active: DKSLOT.active, phase: DKSLOT.phase, held: DK.heldDie };
  }, frames);
}

async function runKinds(page, row) {
  for (const [kind, manual] of fixtures) {
    const before = await prepare(page, kind);
    assert.equal(before.bought, kind, kind + ': correct purchased grade');
    assert.equal(before.draws, 1, kind + ': grade drawn once');
    assert.equal(before.rolls, 0, kind + ': the chest grade does not secretly sample a face');
    assert.equal(before.goldBefore - before.goldAfter, 160, kind + ': chest charged once');
    assert.equal(before.chests, 1, kind + ': chest count increments once');
    assert.equal(before.slot.kind, kind);
    if (manual) {
      assert.deepEqual([before.slot.active, before.slot.phase, before.dieState, before.held], [true, -1, 'tray', 0], kind + ': waits for a physical throw');
      assert.ok(!before.slot.final, kind + ': the physical result is still unknown');
      assert.equal(before.drawButtonDisabled, false, kind + ': accessible throw button remains available');
      assert.match(before.drawButtonText, /던지기/, kind + ': purchase button becomes a throw control');
      assert.equal(before.dieCanvasVisible, true, kind + ': playfield is visible');
      if (kind === 'd20') {
        await page.screenshot({ path: path.join(path.dirname(reportPath), row.name + '-d20-pending.png') });
        await page.evaluate(() => { DK.paused = false; });
        await page.waitForTimeout(2300);
        await page.evaluate(() => { DK.paused = true; });
        assert.deepEqual(await page.evaluate(() => [DKSLOT.phase, DK.heldDie]), [-1, 0], 'real-time effects do not auto-throw d20');
        await page.screenshot({ path: path.join(path.dirname(reportPath), row.name + '-d20-pending-after-fx.png') });
      }
      const waiting = await stepSlot(page, 180);
      assert.deepEqual(waiting, { active: true, phase: -1, held: 0 }, kind + ': time alone never resolves purchase');
      const blocked = await page.evaluate(() => {
        const gold = DK.gold, chests = DK.inf.chests;
        const extra = DKchest();
        return { extra, goldDelta: gold - DK.gold, chestsDelta: DK.inf.chests - chests };
      });
      assert.deepEqual(blocked, { extra: null, goldDelta: 0, chestsDelta: 0 }, kind + ': pending purchase stays single');
      const enemy = await page.evaluate(() => {
        window.__manualQA.spawnEnemy(window.__manualQA.buildInfinityWave(1)[0]);
        const e = DK.enemies[0]; e.hp = e.max = 1000000;
        return e.hp;
      });
      await page.evaluate(() => DKthrow(1200, -250));
      assert.equal(await page.evaluate(() => DKDIE.state), 'throw', kind + ': actual physics throw begins');
      const after = await stepUntilHeld(page);
      const chest = await page.evaluate(k => ({ min: DKCONTENT.INFINITY.chest.min[k], max: DKCONTENT.INFINITY.chest.sides[k] }), kind);
      assert.ok(after.held >= chest.min && after.held <= chest.max, kind + ': physical reward remains within its visibly marked grade');
      assert.equal(after.final, after.held, kind + ': physical result reaches the hand');
      assert.deepEqual(after.landing, { visual: after.held, physical: after.held, final: after.held, slot: after.held },
        kind + ': the rendered upper face, physical result, slot, and reward agree');
      assert.equal(after.active, false, kind + ': roll no longer busy after settling');
      assert.equal(after.gold, before.goldAfter, kind + ': throw does not charge again');
      assert.equal(after.strikes, 0, kind + ': chest die never calls enemy strike');
      assert.deepEqual(after.enemyHp, [enemy], kind + ': enemy HP is unchanged');
      row.cases.push({ kind, manual, face: after.held, result: after });
    } else {
      assert.equal(before.slot.active, true, kind + ': automatic slot animation starts');
      assert.notEqual(before.slot.phase, -1, kind + ': no user throw is required');
      const after = await stepSlot(page, 120);
      assert.equal(after.held, 1, kind + ': the single-sided automatic result reaches the hand');
      assert.equal(after.active, false, kind + ': automatic slot finishes');
      row.cases.push({ kind, manual, face: after.held, result: after });
    }
  }
}

async function runQueue(page, row) {
  await prepare(page, 'd8');
  const pending = await page.evaluate(() => {
    DK.inf.queue.push('d12');
    window.__manualQA.pumpQueue();
    return { queue: DK.inf.queue.slice(), kind: DKSLOT.kind, phase: DKSLOT.phase, chests: DK.inf.chests };
  });
  assert.deepEqual(pending, { queue: ['d12'], kind: 'd8', phase: -1, chests: 1 }, 'boss reward cannot overwrite a pending throw');
  await page.evaluate(() => DKthrow(1200, -250));
  const settled = await stepUntilHeld(page);
  assert.ok(settled.held >= 1 && settled.held <= 8, 'queued d8 physically settles within 1–8');
  const after = await page.evaluate(() => {
    window.__manualQA.pumpQueue();
    const held = DK.heldDie, queueBeforePlace = DK.inf.queue.slice();
    const placed = DKplace(0);
    window.__manualQA.pumpQueue();
    return { held, queueBeforePlace, placed, queueAfterPlace: DK.inf.queue.slice(),
      nextKind: DKSLOT.kind, nextPhase: DKSLOT.phase, nextActive: DKSLOT.active, tower: DK.towers[0]?.face };
  });
  assert.equal(after.held, settled.held);
  assert.deepEqual(after.queueBeforePlace, ['d12'], 'held die blocks queued reward');
  assert.equal(after.placed, true, 'first die can be placed');
  assert.deepEqual(after.queueAfterPlace, [], 'queued reward begins after placement');
  assert.deepEqual([after.nextKind, after.nextPhase, after.nextActive, after.tower], ['d12', -1, true, settled.held], 'queued d12 also waits for throw');
  row.queue = { pending, after };
}

async function runDeck(page, row) {
  const result = await page.evaluate(() => {
    DKstartInf('build'); DK.paused = true; DK.gold = 1000;
    const before = DK.gold, kind = DKchest();
    return { kind, spent: before - DK.gold, phase: DKSLOT.phase, active: DKSLOT.active, held: DK.heldDie };
  });
  assert.equal(result.kind, 'd20', 'deck summon still advertises its card draw');
  assert.equal(result.spent, 30, 'first deck summon keeps its 30 SP cost');
  assert.equal(result.active, true);
  assert.equal(result.phase, 0, 'deck d20 card reveal remains automatic');
  assert.equal(result.held, 0);
  const done = await stepSlot(page, 120);
  assert.equal(done.active, false);
  assert.ok(done.held >= 1 && done.held <= 20, 'deck card reaches the hand without manual throw');
  row.deck = { result, done };
}

async function runLegacyDeck(page, row) {
  const deck = [1, 4, 7, 13, 20];
  const kinds = ['d1', 'd4', 'd8', 'd20', 'primal'];
  row.legacyDeck = [];
  for (let index = 0; index < deck.length; index++) {
    const result = await page.evaluate(({ deck, index }) => {
      DKstartInf('build'); DK.paused = true; DK.muted = true; DK.gold = 1000;
      const legacy = JSON.parse(JSON.stringify(DK.inf.growthSnapshot));
      delete legacy.deckSystem; delete legacy.treeVersion;
      delete legacy.duelRules; delete legacy.mastery; delete legacy.talents;
      delete legacy.awakenings; delete legacy.supporter;
      legacy.deck = deck.slice();
      for (const face of deck) legacy.levels[face] = Math.max(1, legacy.levels[face] || 0);
      if (!DKPROGRESSION.snapshotValid(legacy)) throw Error('legacy five-card snapshot is invalid');
      DK.inf.growthSnapshot = legacy;
      const chest = DKCONTENT.INFINITY.chest;
      const oldRandom = Math.random, oldDraw = chest.draw, oldRoll = chest.roll;
      let bought;
      try {
        Math.random = () => (index + .5) / deck.length;
        chest.draw = () => { throw Error('legacy deck unexpectedly drew a chest grade'); };
        chest.roll = () => { throw Error('legacy deck unexpectedly rolled a different face'); };
        bought = DKchest();
      } finally { Math.random = oldRandom; chest.draw = oldDraw; chest.roll = oldRoll; }
      const awarded = DK.heldDie, slotActive = DKSLOT.active,
        reveal = __manualQA.ROLL_SHOW.t, dieState = DKDIE.state, focus = DK.dieFocus,
        chests = DK.inf.chests, gold = DK.gold;
      const placed = DKplace(0), tower = DK.towers[0]?.face;
      return { bought, awarded, slotActive, reveal, dieState, focus, chests, gold, placed, tower };
    }, { deck, index });
    assert.equal(result.bought, kinds[index], `legacy card ${index + 1}: advertised grade`);
    assert.equal(result.awarded, deck[index], `legacy card ${index + 1}: exact saved-deck face is granted`);
    assert.equal(result.slotActive, false, `legacy card ${index + 1}: no rotating chest die`);
    assert.equal(result.reveal, 0, `legacy card ${index + 1}: no physical die result reveal`);
    assert.equal(result.dieState, 'tray', `legacy card ${index + 1}: field die is not thrown`);
    assert.deepEqual([result.focus, result.chests, result.gold, result.placed, result.tower],
      [true, 1, 840, true, deck[index]], `legacy card ${index + 1}: direct reward places the intended tower`);
    row.legacyDeck.push({ face: deck[index], ...result });
  }
}

async function runGesture(page, context, touch, row) {
  await prepare(page, 'd6');
  const p = await page.evaluate(() => {
    const c = document.querySelector('#game'), r = c.getBoundingClientRect();
    const x = r.left + DKDIE.x * r.width / c.width, y = r.top + DKDIE.y * r.height / c.height;
    return { x, y, dx: Math.min(110, r.width * .26), dy: Math.min(90, r.height * .2),
      target: document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.tagName,
      canvas: { x: r.x, y: r.y, w: r.width, h: r.height, logicalW: c.width, logicalH: c.height },
      die: { x: DKDIE.x, y: DKDIE.y, state: DKDIE.state }, slot: { active: DKSLOT.active, phase: DKSLOT.phase } };
  });
  assert.equal(p.target, 'game', 'physical die has an unobstructed canvas pointer target');
  if (touch) {
    const cdp = await context.newCDPSession(page);
    const at = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(p.x, p.y) });
    assert.equal(await page.evaluate(() => DKDIE.state), 'grab', 'touch begins a real die grab ' + JSON.stringify(p));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(p.x + p.dx * .45, p.y - p.dy * .45) });
    await page.waitForTimeout(16);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(p.x + p.dx, p.y - p.dy) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    assert.equal(await page.evaluate(() => DKDIE.state), 'grab', 'mouse begins a real die grab ' + JSON.stringify(p));
    await page.mouse.move(p.x + p.dx * .45, p.y - p.dy * .45);
    await page.waitForTimeout(16);
    await page.mouse.move(p.x + p.dx, p.y - p.dy);
    await page.mouse.up();
  }
  assert.equal(await page.evaluate(() => DKDIE.state), 'throw', 'flick starts physical movement');
  const settled = await stepUntilHeld(page);
  assert.ok(settled.held >= 1 && settled.held <= 6, 'gesture resolves a real d6 face');
  assert.equal(settled.gold, 9840, 'gesture does not charge a second time');
  row.gesture = { touch, settled };
}

async function runButton(page, row) {
  await prepare(page, 'd8');
  await page.click('#roll-btn');
  assert.equal(await page.evaluate(() => DKDIE.state), 'throw', 'on-screen throw button starts the same physical die');
  const settled = await stepUntilHeld(page);
  assert.ok(settled.held >= 1 && settled.held <= 8, 'button throw resolves a real d8 face');
  assert.equal(settled.gold, 9840, 'button throw is free after buying the chest');
  assert.equal(settled.strikes, 0, 'button throw cannot damage enemies');
  row.button = settled;
}

async function runLog(page, row) {
  // Fake time tests real timers, avoiding a 30-second sleep per viewport.
  await page.waitForTimeout(100);
  await page.clock.install();
  await page.evaluate(() => {
    window.__manualQA.clearLog();
    DKlog('QA 기록 하나', 'sys');
    DKlog('QA 기록 둘', 'sys');
    DKlog('QA 기록 셋', 'sys');
  });
  await page.clock.fastForward(12000);
  const at12 = await page.evaluate(() => DKlogs().filter(x => x.startsWith('QA 기록')));
  assert.deepEqual(at12, ['QA 기록 하나', 'QA 기록 둘', 'QA 기록 셋'], 'last three lines remain readable beyond old 9-second TTL');
  await page.clock.fastForward(24000);
  const at36 = await page.evaluate(() => DKlogs().filter(x => x.startsWith('QA 기록')));
  assert.deepEqual(at36, [], 'extended log lines eventually expire');
  row.logs = { at12, at36 };
}

async function run(browser, name, viewport, touch) {
  const row = { name, viewport, touch, cases: [], pageErrors: [] };
  report.cases.push(row);
  const { page, context, errors } = await boot(browser, name, viewport, touch);
  try {
    await runKinds(page, row);
    await runQueue(page, row);
    await runDeck(page, row);
    await runLegacyDeck(page, row);
    await runLog(page, row);
    await runButton(page, row);
    await runGesture(page, context, touch, row);
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
    console.log('manual chest roll PASS', report.cases.map(x => x.name).join(', '));
  } finally { await browser.close(); }
})().catch(error => { report.error = error.stack; save(); console.error(error); process.exitCode = 1; });
