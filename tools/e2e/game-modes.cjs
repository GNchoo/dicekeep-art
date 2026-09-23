// Local deterministic progression integration QA. No payments or combat win rates.
// Test-only closure exports accelerate boundary setup; natural rolls are separate.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/game-modes'));
const url = new URL('index.html', (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/'));
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'integration QA must use a local server');
url.searchParams.set('net', 'off');
url.searchParams.set('v', Date.now());
fs.mkdirSync(out, { recursive: true });
const report = { scope: 'Actual local game/UI and saved progression. Deterministic RNG intervals and prepared wave boundaries are test fixtures; they are not empirical odds or full combat runs.', url: url.href, started: new Date().toISOString(), viewports: [], pass: false };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function check(row, name, actual, expected) { assert.deepEqual(actual, expected, name); row.checks.push({ name, pass: true }); }
async function ready(page) {
  await page.waitForFunction(() => window.__modeQAError || /준비하지 못했습니다/.test(document.querySelector('#ov-load-txt')?.textContent || '') || (window.DK && DK.phase === 'title' && window.DKPROGRESSION), null, { timeout: 120000 });
  const error = await page.evaluate(() => window.__modeQAError || (/준비하지 못했습니다/.test(document.querySelector('#ov-load-txt')?.textContent || '') ? document.querySelector('#ov-load-txt').textContent : null));
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
  row.console = []; row.failedRequests = [];
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) row.console.push({ type: message.type(), text: message.text() }); });
  page.on('requestfailed', request => row.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
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
  check(row, 'old mixed records stay legacy; all seven record lanes start empty', await page.evaluate(() => ({ legacy: DKSAVE.progression.legacy, modes: Object.fromEntries(Object.entries(DKSAVE.progression.records).map(([k, r]) => [k, r.best])) })), { legacy: { best: 77, clears: 3 }, modes: { clear: 0, build: 0, extreme: 0, multi: 0, extremeMulti: 0, duel: 0, coop: 0 } });
  await page.waitForSelector('#btn-inf-build');
  row.lobbyLayout = await layout(page, ['#btn-inf-clear', '#btn-inf-build', '#btn-infinity', '#btn-deck-open']);
  check(row, 'three mode buttons fit without overlap', row.lobbyLayout.issues, []);
  await page.click('#theme-guide > summary');
  const chapters = await page.locator('#theme-guide-list .theme-guide-card').allTextContents();
  check(row, 'ten-wave themes cover both hundred-wave sets', chapters.length, 20);
  for (const [index, label] of [[1, '숲의 야수'], [3, '고블린·오크 군단'], [5, '언데드 군단']]) {
    check(row, `chapter ${index + 1} displays its authored faction`, chapters[index].includes(label), true);
  }
  check(row, 'theme guide fits viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.click('#theme-guide > summary');
  await page.screenshot({ path: path.join(dir, 'lobby-three-modes.png'), fullPage: true });
  // Full tree editing, deterministic unlocks and supporter UI are covered by tree-collection.cjs.
  check(row, 'legacy record import receives six starters and deterministic tree research', await page.evaluate(() => ({
    owned: Object.values(DKSAVE.progression.collection.cards).filter(c => c.owned).length,
    packs: DKSAVE.progression.collection.packs, deck: DKSAVE.progression.deck, tree: DKSAVE.progression.tree.version,
  })), { owned: 6, packs: 0, deck: [1, 2, 3, 4, 5], tree: 1 });
}

async function combatFixture(page, deck = [1, 4, 8, 13, 20]) {
  await page.evaluate(deck => {
    const p = DKPROGRESSION.defaultProfile(DKSAVE.progression.legacy);
    for (const c of DKDECKRULES.catalog) {
      p.levels[c.id] = 1;
      p.collection.cards[c.id] = { owned: true, class: c.baseClass + 3, copies: 0 };
      p.tree.mastery[c.id] = 3;
    }
    p.deck = deck.slice();
    p.collection.presets.forEach(preset => { preset.faces = deck.slice(); });
    DKSAVE.progression = p;
  }, deck);
}

async function modeDraws(page, row, dir) {
  await combatFixture(page);
  for (const [mode, selector] of [['clear', '#btn-inf-clear'], ['build', '#btn-inf-build'], ['extreme', '#btn-infinity']]) {
    // Each case starts a new fixture run; recovery itself has a separate end-to-end suite.
    await page.evaluate(() => { DKlobby(); localStorage.removeItem('dk_growth_run_v1:guest'); DKlobbyView('single'); });
    await page.click(selector); await page.waitForFunction(m => DK.phase === 'playing' && DK.inf.mode === m, mode);
    row.modes ??= {};
    row.modes[mode] = await page.evaluate(() => {
      DK.gold = 900000; DK.paused = true;
      DK.heldDie = 1; DKplace(0);
      const t = DK.towers[0];
      const snap = DK.inf.growthSnapshot;
      const damage = __modeQA.towerDmg(t), cls = snap.classes?.[1], mastery = snap.mastery?.[1];
      const old = DKSAVE.progression.tree.mastery[1];
      DKSAVE.progression.tree.mastery[1] = 5;
      const snapshotStable = snap.mastery?.[1] === mastery && __modeQA.towerDmg(t) === damage;
      DKSAVE.progression.tree.mastery[1] = old;
      return { mode: DK.inf.mode, recordKey: DK.inf.recordKey, clearWave: DK.inf.clearWave, growth: snap.growth,
        deck: snap.deck, deckSystem: snap.deckSystem || 0, damage, base: t.def.dmg,
        class: cls ?? null, pips: t.pips ?? null, name: t.def.name, snapshotStable, treeVersion: snap.treeVersion || 0, mastery: mastery ?? null,
        frozen: Object.isFrozen(snap) && Object.isFrozen(snap.deck) && Object.isFrozen(snap.levels) && (!snap.growth || Object.isFrozen(snap.classes)&&Object.isFrozen(snap.mastery)&&Object.isFrozen(snap.talents)&&Object.isFrozen(snap.awakenings)) };
    });
    check(row, mode + ' record and finite boundary', { key: row.modes[mode].recordKey, line: row.modes[mode].clearWave }, { key: mode, line: mode === 'extreme' ? 0 : 101 });
    const m = row.modes[mode];
    check(row, mode + ' uses the correct independent collection and battle contract',
      { growth: m.growth, ds: m.deckSystem, deck: m.deck, class: m.class, pips: m.pips, tree: m.treeVersion, mastery: m.mastery },
      mode === 'clear' ? { growth: false, ds: 0, deck: [1, 2, 3, 4, 5], class: null, pips: null, tree: 0, mastery: null }
        : { growth: true, ds: 1, deck: [1, 4, 8, 13, 20], class: 4, pips: 1, tree: 1, mastery: 3 });
    if (mode === 'clear') check(row, 'pure tower uses unchanged base damage', m.damage, m.base);
    else {
      assert.ok(Math.abs(m.damage / m.base - 1.09) < 1e-12, 'tree mastery raises damage by exactly9%, without adding legacy class');
      check(row, mode + ' tower uses the horizontal card definition', m.name, '속사 주사위');
    }
    check(row, mode + ' tree and deck snapshot are frozen and ignore mid-run profile edits', [m.frozen, m.snapshotStable], [true, true]);
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
        if (!t || t.face !== face || t.pips !== 1 || t.lvl !== 1 || t.deckSystem !== 1 || t.def.name !== DKDECKRULES.get(face)?.name || kind !== 'd20') violations.push({ i, kind, face, tower: t && t.face, pips: t?.pips });
        counts[face] = (counts[face] || 0) + 1;
        if (i % 25 === 0) rows.push({ kind, face, tower: t && t.face });
      }
      return { counts, rows, violations, chestCalls, faceCalls };
    } finally { Math.random = rng; ch.draw = oldDraw; ch.roll = oldRoll; DK.towers = []; DK.heldDie = 0; DKSLOT.active = false; }
  });
  check(row, '125 stratified RNG positions allocate 25 to each selected card', row.deckDraws.counts, { 1: 25, 4: 25, 8: 25, 13: 25, 20: 25 });
  check(row, 'all draws place the selected card definition at independent 1 pip', row.deckDraws.violations, []);
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
      return { face, kind, final, tower: t && t.face, name: t && t.def.name, pips: t && t.pips, lvl: t && t.lvl };
    });
    row.naturalRolls.push(sample);
    check(row, 'natural roll/settlement/placement ' + sample.face, [sample.face, sample.final, sample.tower], Array(3).fill([1, 4, 8, 13, 20][index]));
    check(row, 'natural roll card ' + sample.face + ' has one battle pip regardless of identity', [sample.pips, sample.lvl], [1, 1]);
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
  check(row, 'completed waves convert all former pack rewards into deterministic research gold', row.rewards.first.result.collectionRewards, { gold: 1120, packs: 0 });
  check(row, 'duplicate end/settle cannot change wallet, gems or records', row.rewards.duplicateUnchanged, true);
  check(row, 'repeated run retains repeat shards and no repeated first milestone', row.rewards.repeat, { shards: 25, wallet: 70 });
  check(row, 'zero completed waves award zero shards', row.rewards.zero, 0);
  check(row, 'duplicate and zero-wave settlement cannot add extra collection rewards',
    { gold: row.rewards.progression.collection.gold, packs: row.rewards.progression.collection.packs }, { gold: 4020, packs: 0 });
  check(row, 'reward records are isolated and old records preserved', { clear: row.rewards.progression.records.clear.best, build: row.rewards.progression.records.build.best, extreme: row.rewards.progression.records.extreme.best, legacy: row.rewards.progression.legacy }, { clear: 25, build: 0, extreme: 0, legacy: { best: 77, clears: 3 } });
  await page.reload(); await ready(page);
  check(row, 'complete progression and gems survive a real reload after settlement', await page.evaluate(() => ({ progression: DKSAVE.progression, gems: DKSAVE.gems })), { progression: row.rewards.progression, gems: row.rewards.gems });
}

async function growthRegressions(page, row) {
  await combatFixture(page);
  const legacy = await page.evaluate(() => {
    DKstartInf('build');DK.paused=true;
    const {treeVersion,mastery,talents,awakenings,supporter,...v111}=DK.inf.growthSnapshot;
    v111.classes={...v111.classes,1:20};DK.inf.growthSnapshot=Object.freeze(v111);
    DK.heldDie=1;DKplace(0);const t=DK.towers[0];t.pips=7;
    return {damageRatio:__modeQA.towerDmg(t)/t.def.dmg,tree:DK.inf.growthSnapshot.treeVersion||0,supporter:DKsupporter.state(),awake:DKDECKRULES.awakened(t,DK.inf.growthSnapshot)};
  });
  check(row,'explicit frozen v111 snapshot retains class20 and no tree/awakening/supporter',legacy,{damageRatio:1.5699999999999998,tree:0,supporter:null,awake:false});
  const r = await page.evaluate(() => {
    DKstartInf('build'); DK.paused = true; DK.gold = 100000;
    const snapshot = JSON.stringify(DK.inf.growthSnapshot);
    DK.heldDie = 1; DKplace(0); DK.heldDie = 1; DKplace(1);
    const source = DK.towers[0], target = DK.towers[1], random = Math.random;
    let merged;
    try { Math.random = () => .99; merged = DKdeckMerge(source, target); } finally { Math.random = random; }
    const merge = { ok: merged, count: DK.towers.length, face: target.face, pips: target.pips, lvl: target.lvl, spot: target.spot };
    DK.heldDie = 20; DKplace(2);
    const low = DK.towers.find(t => t.spot === 2), beforeInvalid = JSON.stringify(DK.towers);
    const mismatched = { accepted: DKdeckMerge(low, target), unchanged: JSON.stringify(DK.towers) === beforeInvalid };
    const damage = __modeQA.towerDmg(target), gold = DK.gold, powers = [];
    for (let i = 0; i < 5; i++) powers.push(DKupgrade(20));
    const power = { results: powers, spent: gold - DK.gold, level: DK.inf.deckPower[20], other: DK.inf.deckPower[1], pips: target.pips, damageBefore: damage, damageAfter: __modeQA.towerDmg(target), snapshotUnchanged: JSON.stringify(DK.inf.growthSnapshot) === snapshot };
    DK.selTower = target; DKsync();
    const beforeSell = DK.gold;
    document.getElementById('sell-btn').click();
    const soldGrowth = !DK.towers.includes(target) && DK.gold - beforeSell === 20;
    DK.heldDie = 20; DKsync(); document.getElementById('held-sell').click();
    const soldHeld = !DK.heldDie;
    DKstartInf('build'); DK.paused = true;
    const reset = { towers: DK.towers.length, powers: Object.values(DK.inf.deckPower) };
    DKstartInf('clear'); DK.paused = true; DK.heldDie = 20; DKplace(0); DK.selTower = DK.towers[0];
    DKsync(); document.getElementById('sell-btn').click();
    const pureKept = DK.towers.length === 1;
    DK.heldDie = 20; DKsync(); document.getElementById('held-sell').click();
    const pureHeldKept = DK.heldDie === 20;
    DK.heldDie = 1; DKplace(1); DK.selTower = DK.towers.find(t => t.spot === 1); DKsync();
    const pureGold = DK.gold;
    document.getElementById('sell-btn').click();
    const pureBasicSold = !DK.towers.some(t => t.spot === 1) && DK.gold - pureGold === 11;
    return { merge, mismatched, power, reset, soldGrowth, soldHeld, pureKept, pureHeldKept, pureBasicSold };
  });
  row.deckCombat = r;
  check(row, 'board merge consumes two equal types/pips and rolls one deck type with +1 pip', r.merge, { ok: true, count: 1, face: 20, pips: 2, lvl: 1, spot: 1 });
  check(row, 'same type with mismatched pips cannot merge or mutate the board', r.mismatched, { accepted: false, unchanged: true });
  check(row, 'SP power is per card, costs 100/200/400/700, caps at 5 and leaves pips/class intact',
    { results: r.power.results, spent: r.power.spent, level: r.power.level, other: r.power.other, pips: r.power.pips, snapshotUnchanged: r.power.snapshotUnchanged },
    { results: [true, true, true, true, false], spent: 1400, level: 5, other: 1, pips: 2, snapshotUnchanged: true });
  assert.ok(r.power.damageAfter > r.power.damageBefore, 'SP power affects actual card damage');
  check(row, 'new run resets board and all five SP powers', r.reset, { towers: 0, powers: [1, 1, 1, 1, 1] });
  check(row, 'deck sells by battle pip; pure high-star restrictions and basic refund stay unchanged',
    [r.soldGrowth, r.soldHeld, r.pureKept, r.pureHeldKept, r.pureBasicSold], [true, true, true, true, true]);
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
        await growthRegressions(page, row);
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
