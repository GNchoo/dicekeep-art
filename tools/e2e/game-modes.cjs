// Local deterministic progression integration QA. No payments or combat win rates.
// Test-only closure exports accelerate boundary setup; natural rolls are separate.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/game-modes'));
const url = new URL('index.html', (process.env.E2E_BASE_URL || 'http://localhost:8138/').replace(/\/?$/, '/'));
url.searchParams.set('net', 'off');
url.searchParams.set('v', Date.now());
fs.mkdirSync(out, { recursive: true });
const report = { scope: 'Actual local game/UI and saved progression. Deterministic RNG intervals and prepared wave boundaries are test fixtures; they are not empirical odds or full combat runs.', url: url.href, started: new Date().toISOString(), viewports: [], pass: false };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function check(row, name, actual, expected) { assert.deepEqual(actual, expected, name); row.checks.push({ name, pass: true }); }
async function ready(page) {
  await page.waitForFunction(() => window.__modeQAError || (window.DK && DK.phase === 'title' && window.DKPROGRESSION), null, { timeout: 120000 });
  const error = await page.evaluate(() => window.__modeQAError);
  if (error) throw new Error(error);
}

async function layout(page, selectors, { cards = false } = {}) {
  return page.evaluate(({ selectors, cards }) => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const boxes = selectors.map(selector => ({ selector, ...rect(document.querySelector(selector)) }));
    const issues = [];
    for (const b of boxes) if (b.width <= 0 || b.height <= 0 || b.x < -1 || b.right > innerWidth + 1) issues.push('horizontal bounds: ' + b.selector);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1) issues.push('overlap: ' + a.selector + '/' + b.selector);
    }
    if (cards) for (const el of document.querySelectorAll('#deck-grid .deck-card')) {
      const r = rect(el);
      for (const button of el.querySelectorAll('button')) { const b = rect(button); if (b.x < r.x - 1 || b.right > r.right + 1 || b.bottom > r.bottom + 1) issues.push('card control overflow: ' + button.dataset.face + '/' + button.dataset.grow); }
    }
    return { viewport: [innerWidth, innerHeight], boxes, issues };
  }, { selectors, cards });
}

async function boot(browser, viewport, row) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', e => row.errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1');
    if (!sessionStorage.getItem('modes-initialized')) {
      localStorage.setItem('DKSAVE', JSON.stringify({ infBest: 77, infClears: 3, gems: 0 }));
      sessionStorage.setItem('modes-initialized', '1');
    }
  });
  await page.route('**/game.js*', async route => {
    try {
      const response = await route.fetch(), original = await response.text();
      const hash = sha(original);
      if (row.gameSha256 && row.gameSha256 !== hash) throw new Error('Game changed during this viewport; rerun against a frozen candidate');
      row.gameSha256 = hash;
      const anchor = 'window.DK = S;';
      assert.equal(original.split(anchor).length, 2, 'unique test hook anchor');
      const hook = 'window.__modeQA={finishSlot,update,startWave,settleInfRun,checkInfClear,saveSave,towerDmg};\n';
      await route.fulfill({ response, body: original.replace(anchor, hook + anchor) });
    } catch (error) {
      row.errors.push('test route: ' + error.message);
      await route.fulfill({ contentType: 'application/javascript', body: 'window.__modeQAError=' + JSON.stringify(error.message) + ';' }).catch(() => {});
    }
  });
  await page.goto(url.href);
  await ready(page);
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; DKlobbyView('single'); });
  return { page, context };
}

async function collection(page, row, dir) {
  check(row, 'old mixed records stay legacy; all five new record lanes start empty', await page.evaluate(() => ({ legacy: DKSAVE.progression.legacy, modes: Object.fromEntries(Object.entries(DKSAVE.progression.records).map(([k, r]) => [k, r.best])) })), { legacy: { best: 77, clears: 3 }, modes: { clear: 0, build: 0, extreme: 0, multi: 0, extremeMulti: 0 } });
  await page.waitForSelector('#btn-inf-build');
  row.lobbyLayout = await layout(page, ['#btn-inf-clear', '#btn-inf-build', '#btn-infinity', '#btn-deck-open']);
  check(row, 'three mode buttons fit without overlap', row.lobbyLayout.issues, []);
  await page.screenshot({ path: path.join(dir, 'lobby-three-modes.png'), fullPage: true });
  await page.click('#btn-deck-open');
  check(row, 'collection has 20 unique existing tower cards', await page.locator('#deck-grid .deck-card').count(), 20);
  check(row, 'no shards cannot unlock card 7', await page.locator('[data-grow="7"]').isDisabled(), true);
  check(row, 'five selected cards prevent selecting a sixth', await page.locator('[data-face="6"]').isDisabled(), true);
  await page.click('[data-face="1"]');
  check(row, 'four-card draft cannot save', await page.locator('#deck-save').isDisabled(), true);
  await page.click('[data-face="6"]'); await page.click('#deck-save');
  check(row, 'UI saves exactly five selected unlocked cards', await page.evaluate(() => DKSAVE.progression.deck), [2, 3, 4, 5, 6]);
  // Test wallet funding only: subsequent spending uses actual UI handlers.
  await page.evaluate(() => { DKSAVE.progression.shards = 100; });
  await page.click('#btn-deck-open'); await page.click('#btn-deck-open');
  await page.click('[data-grow="7"]'); await page.click('[data-grow="7"]');
  check(row, 'UI unlock 80 + upgrade 10 debits once and persists', await page.evaluate(() => ({ shards: DKSAVE.progression.shards, level: DKSAVE.progression.levels[7], saved: JSON.parse(localStorage.getItem('DKSAVE')).progression.levels[7] })), { shards: 10, level: 2, saved: 2 });
  row.deckLayout = await layout(page, ['#deck-grid', '#deck-save'], { cards: true });
  check(row, 'collection buttons fit their card and save remains in flow', row.deckLayout.issues, []);
  // The lobby itself scrolls; a screenshot of the tall panel clips against that
  // ancestor. Keep real viewport captures at three scroll positions instead.
  for (const [index, name] of [[0, 'top'], [8, 'middle'], [19, 'bottom']]) {
    await page.locator('#deck-grid .deck-card').nth(index).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(dir, 'collection-' + name + '.png') });
  }
  await page.reload(); await ready(page);
  check(row, 'deck, shard wallet and level survive reload', await page.evaluate(() => ({ deck: DKSAVE.progression.deck, shards: DKSAVE.progression.shards, level: DKSAVE.progression.levels[7] })), { deck: [2, 3, 4, 5, 6], shards: 10, level: 2 });
  await page.click('#ov-btn'); await page.evaluate(() => { DK.muted = true; DKlobbyView('single'); });
}

async function modeDraws(page, row, dir) {
  await page.evaluate(() => {
    const p = DKPROGRESSION.defaultProfile(DKSAVE.progression.legacy);
    for (let f = 1; f <= 20; f++) p.levels[f] = 200;
    p.deck = [1, 4, 8, 13, 20]; DKSAVE.progression = p;
  });
  for (const [mode, selector] of [['clear', '#btn-inf-clear'], ['build', '#btn-inf-build'], ['extreme', '#btn-infinity']]) {
    await page.evaluate(() => { DKlobby(); DKlobbyView('single'); });
    await page.click(selector); await page.waitForFunction(m => DK.phase === 'playing' && DK.inf.mode === m, mode);
    row.modes ??= {};
    row.modes[mode] = await page.evaluate(() => {
      DK.gold = 900000; DK.paused = true;
      const t = { face: 1, lvl: 1, def: DKTD[1] };
      const snap = DK.inf.growthSnapshot;
      return { mode: DK.inf.mode, recordKey: DK.inf.recordKey, clearWave: DK.inf.clearWave, growth: snap.growth, cap: snap.levelCap, deck: snap.deck, damage: (window.DKtowerDamage || __modeQA.towerDmg)(t) / t.def.dmg };
    });
    const expectedDamage = mode === 'clear' ? 1 : mode === 'build' ? 2.52 : 2.52 * Math.pow(1.08, 180);
    check(row, mode + ' record and finite boundary', { key: row.modes[mode].recordKey, line: row.modes[mode].clearWave }, { key: mode, line: mode === 'extreme' ? 0 : 101 });
    assert.ok(Math.abs(row.modes[mode].damage / expectedDamage - 1) < 1e-12, mode + ' actual tower damage multiplier');
    row.checks.push({ name: mode + ' actual tower damage obeys growth policy', pass: true });
    check(row, mode + ' run snapshot is immutable', await page.evaluate(() => Object.isFrozen(DK.inf.growthSnapshot) && Object.isFrozen(DK.inf.growthSnapshot.deck) && Object.isFrozen(DK.inf.growthSnapshot.levels)), true);
    const playLayout = await layout(page, ['#roll-btn', '#wave-btn', '#exit-btn']);
    check(row, mode + ' gameplay buttons do not overlap', playLayout.issues, []);
    await page.screenshot({ path: path.join(dir, mode + '-game.png') });
  }
  row.pureDraw = await page.evaluate(() => {
    DKstartInf('clear'); DK.paused = true; DK.gold = 90000;
    const ch = DKCONTENT.INFINITY.chest, oldDraw = ch.draw, oldRoll = ch.roll;
    let draws = 0, rolls = 0;
    try {
      ch.draw = () => { draws++; return 'd8'; }; ch.roll = () => { rolls++; return 7; };
      DKchest(); return { draws, rolls, kind: DKSLOT.kind, final: DKSLOT.final };
    } finally { ch.draw = oldDraw; ch.roll = oldRoll; DKSLOT.active = false; DK.heldDie = 0; }
  });
  check(row, 'pure mode delegates to original chest kind and face roll', row.pureDraw, { draws: 1, rolls: 1, kind: 'd8', final: 7 });
  row.deckDraws = await page.evaluate(() => {
    DKstartInf('build'); DK.paused = true; DK.gold = 900000;
    const rng = Math.random, ch = DKCONTENT.INFINITY.chest, oldDraw = ch.draw, oldRoll = ch.roll;
    const rows = [], counts = {}, violations = []; let chestCalls = 0, faceCalls = 0;
    try {
      ch.draw = (...a) => { chestCalls++; return oldDraw(...a); }; ch.roll = (...a) => { faceCalls++; return oldRoll(...a); };
      for (let i = 0; i < 125; i++) {
        let n = 0; Math.random = () => n++ === 0 ? (i + .5) / 125 : .5;
        DK.towers = []; DK.heldDie = 0; DKSLOT.active = false;
        const kind = DKchest(), face = DKSLOT.final;
        __modeQA.finishSlot(); DKplace(0);
        const t = DK.towers[0];
        if (!t || t.face !== face || t.def !== DKTD[face] || face < (ch.min[kind] || 1) || face > ch.sides[kind]) violations.push({ i, kind, face, tower: t && t.face });
        counts[face] = (counts[face] || 0) + 1;
        if (i % 25 === 0) rows.push({ kind, face, tower: t && t.face });
      }
      return { counts, rows, violations, chestCalls, faceCalls };
    } finally { Math.random = rng; ch.draw = oldDraw; ch.roll = oldRoll; DK.towers = []; DK.heldDie = 0; DKSLOT.active = false; }
  });
  check(row, '125 stratified RNG positions allocate 25 to each selected card', row.deckDraws.counts, { 1: 25, 4: 25, 8: 25, 13: 25, 20: 25 });
  check(row, 'forced faces match real renderer range and placed tower definition', row.deckDraws.violations, []);
  check(row, 'deck summons bypass original chest probability and second face roll', [row.deckDraws.chestCalls, row.deckDraws.faceCalls], [0, 0]);
  row.naturalRolls = [];
  for (let index = 0; index < 5; index++) {
    await page.evaluate(i => {
      DK.paused = false; DK.towers = []; DK.heldDie = 0; DKSLOT.active = false; DK.gold = 900000;
      const old = Math.random; let n = 0;
      try { Math.random = () => n++ === 0 ? (i + .5) / 5 : old(); DKchest(); } finally { Math.random = old; }
    }, index);
    await page.waitForFunction(() => !!DK.heldDie && !DKSLOT.active, null, { timeout: 20000 });
    const sample = await page.evaluate(() => {
      const face = DK.heldDie, kind = DKSLOT.kind, final = DKSLOT.final;
      DKplace(0); const t = DK.towers[0];
      return { face, kind, final, tower: t && t.face, name: t && t.def.name };
    });
    row.naturalRolls.push(sample);
    check(row, 'natural roll/settlement/placement ' + sample.face, [sample.face, sample.final, sample.tower], Array(3).fill([1, 4, 8, 13, 20][index]));
    await page.screenshot({ path: path.join(dir, 'build-natural-face-' + sample.face + '.png') });
  }
}

async function endings(page, row, dir) {
  row.boundaries = [];
  for (const mode of ['clear', 'build', 'extreme']) {
    const result = await page.evaluate(mode => {
      DKSAVE.progression = DKPROGRESSION.defaultProfile(DKSAVE.progression.legacy); DKSAVE.gems = 0;
      DKstartInf(mode); DK.paused = true; DK.wave = 100; DK.inf.doneW = 100;
      __modeQA.startWave();
      const before = { phase: DK.phase, wave: DK.wave, done: DK.inf.doneW, queued: DK.spawnQ.length };
      const prematurelyCleared = __modeQA.checkInfClear();
      // Prepared completion boundary: remove combat fixtures and call real update.
      DK.spawnQ = []; DK.enemies = []; __modeQA.update(0);
      const completed = { phase: DK.phase, wave: DK.wave, done: DK.inf.doneW, cleared: DK.inf.cleared, result: DK.inf.settledResult && { shards: DK.inf.settledResult.shards, wave: DK.inf.settledResult.wave }, record: DKSAVE.progression.records[mode] };
      if (mode === 'extreme') { DK.autoT = .01; __modeQA.update(.02); }
      return { mode, before, prematurelyCleared, completed, afterWave: DK.wave, afterPhase: DK.phase };
    }, mode);
    row.boundaries.push(result);
    check(row, mode + ' entering 101 cannot count as completing it', [result.before.wave, result.before.done, result.prematurelyCleared], [101, 100, false]);
    if (mode === 'extreme') {
      check(row, 'extreme automatically continues to wave 102 without settlement', [result.afterWave, result.afterPhase, result.completed.cleared, !!result.completed.result], [102, 'playing', 0, false]);
    } else {
      check(row, mode + ' actual completion event ends 101 with correct first clear reward', [result.completed.phase, result.completed.done, result.completed.record.clears, result.completed.result.shards], ['over', 101, 1, 170]);
    }
    await page.screenshot({ path: path.join(dir, mode + '-wave-101-boundary.png') });
  }
  row.rewards = await page.evaluate(() => {
    DKSAVE.progression = DKPROGRESSION.defaultProfile({ best: 77, clears: 3 }); DKSAVE.gems = 0;
    DKstartInf('clear'); DK.paused = true; DK.wave = 26; DK.inf.doneW = 25; DK.inf.kills = 200;
    DKend(false);
    const first = { result: DK.inf.settledResult, wallet: DKSAVE.progression.shards, gems: DKSAVE.gems };
    const afterFirst = JSON.stringify(DKSAVE);
    DKend(false); __modeQA.settleInfRun(false);
    const duplicateUnchanged = JSON.stringify(DKSAVE) === afterFirst;
    DKstartInf('clear'); DK.paused = true; DK.wave = 26; DK.inf.doneW = 25; DKend(false);
    const repeat = { shards: DK.inf.settledResult.shards, wallet: DKSAVE.progression.shards };
    DKstartInf('build'); DK.paused = true; DK.wave = 1; DK.inf.doneW = 0; DKend(false);
    return { first, duplicateUnchanged, repeat, zero: DK.inf.settledResult.shards, progression: DKSAVE.progression, gems: DKSAVE.gems };
  });
  check(row, 'loss during wave 26 settles completed 25 only', [row.rewards.first.result.wave, row.rewards.first.result.shards], [25, 45]);
  check(row, 'duplicate end/settle cannot change wallet, gems or records', row.rewards.duplicateUnchanged, true);
  check(row, 'repeated run retains repeat shards and no repeated first milestone', row.rewards.repeat, { shards: 25, wallet: 70 });
  check(row, 'zero completed waves award zero shards', row.rewards.zero, 0);
  check(row, 'reward records are isolated and old records preserved', { clear: row.rewards.progression.records.clear.best, build: row.rewards.progression.records.build.best, extreme: row.rewards.progression.records.extreme.best, legacy: row.rewards.progression.legacy }, { clear: 25, build: 0, extreme: 0, legacy: { best: 77, clears: 3 } });
  await page.reload(); await ready(page);
  check(row, 'complete progression and gems survive a real reload after settlement', await page.evaluate(() => ({ progression: DKSAVE.progression, gems: DKSAVE.gems })), { progression: row.rewards.progression, gems: row.rewards.gems });
}

(async () => {
  const browser = await launchBrowser();
  try {
    const selected = process.argv.includes('--phone') ? 'phone' : process.argv.includes('--desktop') ? 'desktop' : null;
    report.selected = selected || 'both';
    for (const [tag, viewport] of [['phone', { width: 440, height: 956 }], ['desktop', { width: 1240, height: 860 }]].filter(([tag]) => !selected || tag === selected)) {
      const row = { tag, viewport, checks: [], errors: [] }; report.viewports.push(row);
      const dir = path.join(out, tag); fs.mkdirSync(dir, { recursive: true });
      const { page, context } = await boot(browser, viewport, row);
      try {
        await collection(page, row, dir);
        await modeDraws(page, row, dir);
        await endings(page, row, dir);
        check(row, 'no uncaught browser errors', row.errors, []);
        row.pass = true; console.log('PASS', tag, row.checks.length, 'checks', row.gameSha256);
      } catch (error) {
        row.failure = error.stack; await page.screenshot({ path: path.join(dir, 'failure.png'), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
    }
    assert.equal(new Set(report.viewports.map(v => v.gameSha256)).size, 1, 'all evidence uses the same production game source');
    report.pass = true;
  } finally {
    report.finished = new Date().toISOString(); report.checks = report.viewports.reduce((sum, r) => sum + r.checks.length, 0);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close();
  }
  console.log('PASS game modes', report.checks, 'checks;', path.join(out, 'report.json'));
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
