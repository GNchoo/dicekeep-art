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
    window.addEventListener('error', event => { if (!window.DK && event.error) window.__modeQAError = event.message; });
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
      const hook = 'window.__modeQA={finishSlot,update,advancePresentation,startWave,settleInfRun,checkInfClear,saveSave,towerDmg,towerRate,towerSynergy,enhanceDef};\n';
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
  row.lobbyLayout = await layout(page, ['#btn-inf-clear', '#btn-inf-build', '#btn-infinity', '#btn-stage-select']);
  check(row, 'three mode buttons fit without overlap', row.lobbyLayout.issues, []);
  await page.click('#theme-guide > summary');
  const chapters = await page.locator('.menu-subpage .theme-guide-card').allTextContents();
  check(row, 'ten-wave themes cover both hundred-wave sets', chapters.length, 20);
  for (const [index, label] of [[1, '숲의 야수'], [3, '고블린·오크 군단'], [5, '언데드 군단']]) {
    check(row, `chapter ${index + 1} displays its authored faction`, chapters[index].includes(label), true);
  }
  check(row, 'theme guide fits viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.locator('.menu-subpage > header button').click();
  await page.screenshot({ path: path.join(dir, 'lobby-three-modes.png'), fullPage: true });
  // Full tree editing, deterministic unlocks and supporter UI are covered by tree-collection.cjs.
  check(row, 'legacy record import receives six starters and deterministic tree research', await page.evaluate(() => ({
    owned: Object.values(DKSAVE.progression.collection.cards).filter(c => c.owned).length,
    packs: DKSAVE.progression.collection.packs, deck: DKSAVE.progression.deck, tree: DKSAVE.progression.tree.version,
  })), { owned: 6, packs: 0, deck: [1, 2, 3, 4, 5], tree: 1 });
}

async function combatFixture(page, legacyPreset = [1, 4, 8, 13, 20]) {
  await page.evaluate(legacyPreset => {
    const p = DKPROGRESSION.defaultProfile(DKSAVE.progression.legacy);
    for (const c of DKDECKRULES.catalog) {
      p.levels[c.id] = 1;
      p.collection.cards[c.id] = { owned: true, class: c.baseClass + 3, copies: 0 };
      p.tree.mastery[c.id] = 3;
    }
    p.deck = legacyPreset.slice();
    p.collection.presets.forEach(preset => { preset.faces = legacyPreset.slice(); });
    DKSAVE.progression = p;
  }, legacyPreset);
}

async function modeDraws(page, row, dir) {
  await combatFixture(page);
  for (const [mode, selector] of [['clear', '#btn-inf-clear'], ['build', '#btn-inf-build'], ['extreme', '#btn-infinity']]) {
    // Each case starts a new fixture run; recovery itself has a separate end-to-end suite.
    await page.evaluate(() => { DKlobby(); localStorage.removeItem('dk_growth_run_v1:guest'); DKlobbyView('single'); });
    await page.click(selector); await page.waitForFunction(m => DK.phase === 'playing' && DK.inf.mode === m, mode);
    row.modes ??= {};
    row.modes[mode] = await page.evaluate(() => {
      const startGold = DK.gold;
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
        deck: snap.deck, deckSystem: snap.deckSystem || 0, gradeSystem: snap.gradeSystem || 0, startGold, damage, base: t.def.dmg,
        class: cls ?? null, pips: t.pips ?? null, name: t.def.name, snapshotStable, treeVersion: snap.treeVersion || 0, mastery: mastery ?? null,
        frozen: Object.isFrozen(snap) && Object.isFrozen(snap.deck) && Object.isFrozen(snap.levels) && (!snap.growth || Object.isFrozen(snap.classes)&&Object.isFrozen(snap.mastery)&&Object.isFrozen(snap.talents)&&Object.isFrozen(snap.awakenings)) };
    });
    check(row, mode + ' record and finite boundary', { key: row.modes[mode].recordKey, line: row.modes[mode].clearWave }, { key: mode, line: mode === 'extreme' ? 0 : 101 });
    const m = row.modes[mode];
    check(row, mode + ' uses grades while preserving unused old preset metadata',
      { growth: m.growth, gs: m.gradeSystem, ds: m.deckSystem, deck: m.deck, class: m.class, pips: m.pips, tree: m.treeVersion, mastery: m.mastery },
      mode === 'clear' ? { growth: false, gs: 1, ds: 0, deck: [1, 2, 3, 4, 5], class: 1, pips: null, tree: 0, mastery: null }
        : { growth: true, gs: 1, ds: 0, deck: [1, 4, 8, 13, 20], class: 4, pips: null, tree: 1, mastery: 3 });
    check(row, mode + ' starts with original chest economy', m.startGold, 400);
    if (mode === 'clear') check(row, 'pure tower uses unchanged base damage', m.damage, m.base);
    else {
      assert.ok(Math.abs(m.damage / m.base - 1.09) < 1e-12, 'tree mastery raises damage by exactly 9%, without adding legacy class');
      check(row, mode + ' tower uses the original grade definition', m.name, '궁수 주사위');
    }
    check(row, mode + ' tree and deck snapshot are frozen and ignore mid-run profile edits', [m.frozen, m.snapshotStable], [true, true]);
    const playLayout = await layout(page, ['#roll-btn', '#wave-btn', '#exit-btn']);
    check(row, mode + ' gameplay buttons do not overlap', playLayout.issues, []);
    await page.screenshot({ path: path.join(dir, mode + '-game.png') });
  }
  row.physicalRolls = [];
  for (const mode of ['clear', 'build']) {
  const opening = await page.evaluate(mode => {
    DKstartInf(mode); DK.paused = false; DK.gold = 90000;
    const ch = DKCONTENT.INFINITY.chest, oldDraw = ch.draw, oldRoll = ch.roll;
    let draws = 0, rolls = 0;
    ch.draw = () => { draws++; return 'd8'; }; ch.roll = () => { rolls++; throw new Error('face must come from the landed die'); };
    window.__chestRestore = () => { ch.draw = oldDraw; ch.roll = oldRoll; return { draws, rolls }; };
    const gold = DK.gold;
    DKchest();
    return { draws, spent: gold - DK.gold, kind: DKSLOT.kind, final: DKSLOT.final, phase: DKSLOT.phase, held: DK.heldDie, die: DKDIE.state };
  }, mode);
  check(row, mode + ' d8 chest costs 160G and waits without a preselected grade', opening,
    { draws: 1, spent: 160, kind: 'd8', final: 0, phase: -1, held: 0, die: 'tray' });
  const beforeReveal = await page.evaluate(() => {
    DKthrow(900, -300);
    return { phase: DKSLOT.phase, held: DK.heldDie, die: DKDIE.state };
  });
  check(row, mode + ' throw cannot skip the visible chest opening', beforeReveal,
    { phase: -1, held: 0, die: 'tray' });
  await page.evaluate(() => __modeQA.advancePresentation(2.3));
  await page.evaluate(() => DKthrow(900, -300));
  await page.waitForFunction(() => DK.heldDie > 0 && !DKSLOT.active, null, { timeout: 12000 });
  const physicalOutcome = await page.evaluate(() => {
    const outcome = { ...__chestRestore(), face: DK.heldDie, final: DKSLOT.final };
    DKplace(0); outcome.tower = DK.towers[0].face; outcome.pips = DK.towers[0].pips ?? null;
    return outcome;
  });
  row.physicalRolls.push({ mode, opening, physicalOutcome });
  check(row, mode + ' player throw awards the physical d8 result without a hidden face roll',
    [physicalOutcome.draws, physicalOutcome.rolls, physicalOutcome.face === physicalOutcome.final,
      physicalOutcome.face >= 1 && physicalOutcome.face <= 8],
    [1, 0, true, true]);
  check(row, mode + ' physical grade places the original tower without separate pips', [physicalOutcome.tower, physicalOutcome.pips], [physicalOutcome.face, null]);
  }
  row.gradeDraws = await page.evaluate(() => {
    DKstartInf('build'); DK.paused = true; DK.gold = 900000;
    const rng = Math.random, ch = DKCONTENT.INFINITY.chest, oldDraw = ch.draw, oldRoll = ch.roll;
    const rows = [], violations = []; let chestCalls = 0, faceCalls = 0;
    const table = ch.table.map(x => x.slice()), total = table.reduce((sum, [, p]) => sum + p, 0);
    try {
      ch.draw = (...a) => { chestCalls++; return oldDraw.apply(ch, a); }; ch.roll = () => { faceCalls++; throw Error('hidden grade roll'); };
      let cumulative = 0;
      for (const [expected, weight] of table) {
        let n = 0; const sample = (cumulative + weight / 2) / total; cumulative += weight;
        Math.random = () => n++ === 0 ? sample : .5;
        DK.towers = []; DK.heldDie = 0; DKSLOT.active = false;
        const gold = DK.gold, kind = DKchest(), final = DKSLOT.final;
        rows.push({ expected, kind, final, spent: gold - DK.gold });
        if (kind !== expected || final !== (kind === 'd1' ? 1 : 0) || DK.heldDie || gold - DK.gold !== 160) violations.push(rows.at(-1));
      }
      // Prepared physical landings exercise the actual award/placement path for
      // every grade. These fixtures are separate from natural physics above.
      const landings = [];
      ch.draw = () => window.__preparedKind;
      for (let face = 1; face <= 20; face++) {
        const kind = face <= 4 ? 'd4' : face <= 6 ? 'd6' : face <= 8 ? 'd8' : face <= 12 ? 'd12' : face <= 13 ? 'd20' : face <= 17 ? 'epic' : face <= 19 ? 'myth' : 'primal';
        window.__preparedKind = kind;
        DK.towers = []; DK.heldDie = 0; DKSLOT.active = false;
        DKchest(); DKSLOT.final = face; __modeQA.finishSlot(); DKplace(0);
        const t = DK.towers[0];
        landings.push({ kind, face, tower: t?.face, lvl: t?.lvl, pips: t?.pips ?? null, ds: t?.deckSystem ?? null, name: t?.def.name });
        if (!t || t.face !== face || t.pips !== undefined || t.deckSystem !== undefined || t.lvl !== 1 || t.def !== DKTD[face]) violations.push(landings.at(-1));
      }
      const rareLow = [];
      for (const kind of ['d8', 'd12', 'd20']) {
        window.__preparedKind = kind; DK.towers = []; DK.heldDie = 0; DKSLOT.active = false;
        DKchest(); DKSLOT.final = 1; __modeQA.finishSlot(); DKplace(0);
        rareLow.push({ kind, face: DK.towers[0].face });
      }
      return { table, rows, landings, rareLow, violations, chestCalls, faceCalls };
    } finally { Math.random = rng; ch.draw = oldDraw; ch.roll = oldRoll; DK.towers = []; DK.heldDie = 0; DKSLOT.active = false; }
  });
  check(row, 'growth retains all nine original chest weights', row.gradeDraws.table, [['d1', .5], ['d4', .331], ['d6', .102], ['d8', .051], ['d12', .008], ['d20', .005], ['epic', .002], ['myth', .0008], ['primal', .00019]]);
  check(row, 'each chest RNG interval selects its die, and all 20 landings award their grade outside old preset limits', row.gradeDraws.violations, []);
  check(row, 'new growth uses the original chest draw and no second grade sampling', [row.gradeDraws.chestCalls, row.gradeDraws.faceCalls], [9, 0]);
  check(row, 'rare die type does not guarantee a high-grade result', row.gradeDraws.rareLow, [{ kind: 'd8', face: 1 }, { kind: 'd12', face: 1 }, { kind: 'd20', face: 1 }]);
  row.naturalRolls = [];
  for (const kind of ['d4', 'd6']) {
    await page.evaluate(kind => {
      DKstartInf('build');
      DK.paused = false; DK.towers = []; DK.heldDie = 0; DKSLOT.active = false; DK.gold = 900000;
      const ch = DKCONTENT.INFINITY.chest, oldDraw = ch.draw;
      try { ch.draw = () => kind; DKchest(); } finally { ch.draw = oldDraw; }
    }, kind);
    await page.waitForFunction(() => !!DK.heldDie && !DKSLOT.active, null, { timeout: 20000 });
    const sample = await page.evaluate(() => {
      const face = DK.heldDie, kind = DKSLOT.kind, final = DKSLOT.final;
      DKplace(0); const t = DK.towers[0];
      return { face, kind, final, tower: t && t.face, name: t && t.def.name, pips: t?.pips ?? null, lvl: t && t.lvl, originalDef: t?.def === DKTD[face] };
    });
    row.naturalRolls.push(sample);
    check(row, 'natural ' + kind + ' settlement matches the physical face and original tower', [sample.kind, sample.face === sample.final, sample.tower === sample.face, sample.face >= 1 && sample.face <= Number(kind.slice(1)), sample.originalDef], [kind, true, true, true, true]);
    check(row, 'natural ' + kind + ' grade starts at merge Lv1 without legacy pips', [sample.pips, sample.lvl], [null, 1]);
    await page.screenshot({ path: path.join(dir, 'build-natural-' + kind + '.png') });
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
      DK.spawnQ = []; DK.enemies = [];
      DK.waveT = DKCONTENT.INFINITY.waveForMode(101, mode).roundSeconds || 0;
      __modeQA.update(0);
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
    const {gradeSystem,treeVersion,mastery,talents,awakenings,supporter,...v111}=DK.inf.growthSnapshot;
    v111.deckSystem=1;v111.classes=Object.freeze({...v111.classes,1:20});DK.inf.growthSnapshot=Object.freeze(v111);
    DK.heldDie=1;DKplace(0);const t=DK.towers[0];t.pips=7;
    return {damageRatio:__modeQA.towerDmg(t)/t.def.dmg,tree:DK.inf.growthSnapshot.treeVersion||0,supporter:DKsupporter.state(),awake:DKDECKRULES.awakened(t,DK.inf.growthSnapshot)};
  });
  check(row,'explicit frozen v111 snapshot retains class20 and no tree/awakening/supporter',legacy,{damageRatio:1.5699999999999998,tree:0,supporter:null,awake:false});
  const r = await page.evaluate(() => {
    DKstartInf('build'); DK.paused = true; DK.gold = 100000;
    const snapshot = JSON.stringify(DK.inf.growthSnapshot);
    DK.heldDie = 1; DKplace(0); const target = DK.towers[0], merge = [];
    for (let i = 0; i < 3; i++) {
      DK.heldDie = 1; const ok = DKplace(0);
      merge.push({ ok, face: target.face, lvl: target.lvl, held: DK.heldDie, count: DK.towers.length });
    }
    DK.heldDie = 2;
    const beforeInvalid = JSON.stringify(DK.towers);
    const mismatched = { accepted: DKplace(0), unchanged: JSON.stringify(DK.towers) === beforeInvalid, held: DK.heldDie };
    DK.heldDie = 0; DK.selTower = target;
    const random = Math.random, enhanced = [], goldBeforeEnhance = DK.gold;
    try {
      Math.random = () => 0;
      for (let grade = 1; grade < 20; grade++) {
        const before = DK.gold, result = DKenhance();
        enhanced.push({ result, face: target.face, lvl: target.lvl, spent: before - DK.gold, originalDef: target.def === DKTD[grade + 1] });
      }
    } finally { Math.random = random; }
    const beforeMax = DK.gold;
    const max = { result: DKenhance(), unchanged: beforeMax === DK.gold, face: target.face, lvl: target.lvl };
    const enhancement = { rows: enhanced, spent: goldBeforeEnhance - DK.gold, max, damageCarry: target.growthCarry };
    DK.heldDie = 6; DKplace(2); const risky = DK.towers.find(t => t.spot === 2);
    DK.selTower = risky;
    const oldGold = DK.gold; DK.gold = 699;
    const poor = { result: DKenhance(), gold: DK.gold, face: risky.face };
    DK.gold = oldGold;
    let keep, boom;
    try {
      Math.random = () => .6; let before = DK.gold;
      keep = { result: DKenhance(), spent: before - DK.gold, face: risky.face, alive: DK.towers.includes(risky) };
      Math.random = () => .999; before = DK.gold;
      boom = { result: DKenhance(), spent: before - DK.gold, alive: DK.towers.includes(risky), selected: DK.selTower === null };
    } finally { Math.random = random; }
    const damage = __modeQA.towerDmg(target), gold = DK.gold, powers = [];
    for (let i = 0; i < 11; i++) powers.push(DKupgrade(6));
    const power = { results: powers, spent: gold - DK.gold, level: DK.inf.power[6], other: DK.inf.power[1], lvl: target.lvl, damageBefore: damage, damageAfter: __modeQA.towerDmg(target), snapshotUnchanged: JSON.stringify(DK.inf.growthSnapshot) === snapshot };
    DK.selTower = target; DKsync();
    const beforeSell = DK.gold;
    document.getElementById('sell-btn').click();
    const soldGrowth = !DK.towers.includes(target) && DK.gold - beforeSell === 130;
    DK.heldDie = 20; DKsync(); const beforeHeld = DK.gold; document.getElementById('held-sell').click();
    const soldHeld = !DK.heldDie && DK.gold - beforeHeld === 106;
    DKstartInf('build'); DK.paused = true;
    const reset = { towers: DK.towers.length, powers: Object.values(DK.inf.power), legacyPower: DK.inf.deckPower ?? null };
    DKstartInf('clear'); DK.paused = true; DK.heldDie = 20; DKplace(0); DK.selTower = DK.towers[0];
    DKsync(); document.getElementById('sell-btn').click();
    const pureKept = DK.towers.length === 1;
    DK.heldDie = 20; DKsync(); document.getElementById('held-sell').click();
    const pureHeldKept = DK.heldDie === 20;
    DK.heldDie = 1; DKplace(1); DK.selTower = DK.towers.find(t => t.spot === 1); DKsync();
    const pureGold = DK.gold;
    document.getElementById('sell-btn').click();
    const pureBasicSold = !DK.towers.some(t => t.spot === 1) && DK.gold - pureGold === 11;
    return { merge, mismatched, enhancement, poor, keep, boom, power, reset, soldGrowth, soldHeld, pureKept, pureHeldKept, pureBasicSold };
  });
  row.gradeCombat = r;
  check(row, 'hand merge preserves grade and upgrades only Lv1→2→3; max rejects without consuming the die', r.merge,
    [{ ok: true, face: 1, lvl: 2, held: 0, count: 1 }, { ok: true, face: 1, lvl: 3, held: 0, count: 1 }, { ok: false, face: 1, lvl: 3, held: 1, count: 1 }]);
  check(row, 'different grades cannot hand-merge or mutate the board', r.mismatched, { accepted: false, unchanged: true, held: 2 });
  check(row, 'successful enhancements traverse all 20 original definitions without resetting merge Lv3', r.enhancement.rows,
    Array.from({ length: 19 }, (_, i) => ({ result: 'up', face: i + 2, lvl: 3, spent: 250 + i * 90, originalDef: true })));
  check(row, 'enhancement cost and 20-grade cap preserve money and grade', { spent: r.enhancement.spent, max: r.enhancement.max }, { spent: 20140, max: { result: null, unchanged: true, face: 20, lvl: 3 } });
  assert.ok(Math.abs(r.enhancement.damageCarry - 1.09) < 1e-12, 'enhancement carries earned research once without stacking it');
  check(row, 'insufficient gold cannot enhance or charge', r.poor, { result: null, gold: 699, face: 6 });
  check(row, 'keep branch charges once and retains the grade', r.keep, { result: 'keep', spent: 700, face: 6, alive: true });
  check(row, 'destruction branch charges once and removes the tower and selection', r.boom, { result: 'boom', spent: 700, alive: false, selected: true });
  check(row, 'sixth gold power serves high grades, costs 8250G to Lv10, caps and preserves the frozen research snapshot',
    { results: r.power.results, spent: r.power.spent, level: r.power.level, other: r.power.other, lvl: r.power.lvl, snapshotUnchanged: r.power.snapshotUnchanged },
    { results: [...Array(10).fill(true), false], spent: 8250, level: 10, other: 0, lvl: 3, snapshotUnchanged: true });
  assert.ok(Math.abs(r.power.damageAfter / r.power.damageBefore - 2.5) < 1e-12, 'gold power affects actual high-grade damage');
  check(row, 'new run resets board and all six original gold powers', r.reset, { towers: 0, powers: [0, 0, 0, 0, 0, 0], legacyPower: null });
  check(row, 'growth sells by grade/merge level; pure high-grade restrictions and basic refund stay unchanged',
    [r.soldGrowth, r.soldHeld, r.pureKept, r.pureHeldKept, r.pureBasicSold], [true, true, true, true, true]);

  row.gradeDamage = await page.evaluate(() => {
    DKstartInf('clear'); DK.paused = true;
    const rows = [];
    for (let face = 1; face <= 20; face++) {
      DK.towers = []; DK.heldDie = face; DKplace(0); const t = DK.towers[0];
      const dmg = __modeQA.towerDmg(t), rate = __modeQA.towerRate(t);
      rows.push({ face, dmg, rate, dps: dmg / rate, lvl: t.lvl, pips: t.pips ?? null });
    }
    return rows;
  });
  check(row, 'all 20 grades have positive damage/rate and no legacy pip system', row.gradeDamage.every(t => t.dmg > 0 && t.rate > 0 && t.lvl === 1 && t.pips === null), true);
  check(row, 'each higher grade beats the previous isolated single-target DPS, including 2→3 and 19→20', row.gradeDamage.slice(1).every((t, i) => t.dps > row.gradeDamage[i].dps), true);

  row.synergies = await page.evaluate(() => {
    const place = face => { DK.heldDie = face; DKplace(DK.towers.length); return DK.towers.at(-1); };
    DKstartInf('build'); DK.paused = true;
    const archer = place(1), cannon = place(2), rate = __modeQA.towerRate(cannon);
    const swift = __modeQA.towerSynergy(cannon);
    archer.moving = true;
    const aloneRate = __modeQA.towerRate(cannon), moving = __modeQA.towerSynergy(cannon);
    DKstartInf('build'); DK.paused = true; place(3); const star = place(8), damage = __modeQA.towerDmg(star);
    const arcane = __modeQA.towerSynergy(star); DK.towers.shift(); const aloneDamage = __modeQA.towerDmg(star);
    return { swift: swift.active, swiftRatio: aloneRate / rate, moving: moving.active, arcane: arcane.active, arcaneRatio: damage / aloneDamage };
  });
  check(row, 'actual adjacent grade towers activate their named synergies and lifted supporters stop applying', [row.synergies.swift, row.synergies.moving, row.synergies.arcane], [['swift'], [], ['arcane']]);
  assert.ok(Math.abs(row.synergies.swiftRatio - 1.1) < 1e-12 && Math.abs(row.synergies.arcaneRatio - 1.12) < 1e-12, 'synergies change real attack rate and damage by the displayed amounts');

  row.gradeResearch = await page.evaluate(() => {
    const tree = DKSAVE.progression.tree;
    tree.talents[20] = 'force'; tree.awakenings[20] = true;
    tree.talents[3] = 'insight';
    const values = {};
    for (const mode of ['clear', 'build']) {
      DKstartInf(mode); DK.paused = true;
      DK.heldDie = 20; DKplace(0); const t = DK.towers[0];
      const damageRatio = __modeQA.towerDmg(t) / t.def.dmg;
      DK.towers = []; DK.heldDie = 3; DKplace(0); const mage = DK.towers[0];
      values[mode] = { damageRatio, speedRatio: mage.def.rate / __modeQA.towerRate(mage), supporter: !!DKsupporter.state() };
    }
    tree.talents[20] = null; tree.awakenings[20] = false; tree.talents[3] = null;
    return values;
  });
  check(row, 'pure combat ignores mastery, force, awakening, insight and supporters', row.gradeResearch.clear, { damageRatio: 1, speedRatio: 1, supporter: false });
  assert.ok(Math.abs(row.gradeResearch.build.damageRatio - 1.09 * 1.1 * 1.15) < 1e-12 && Math.abs(row.gradeResearch.build.speedRatio - 1.1) < 1e-12 && row.gradeResearch.build.supporter, 'growth applies high-grade mastery/force/awakening and actual insight rate from battle start');

  row.gradeSupporters = await page.evaluate(() => {
    const profile = DKSAVE.progression, results = {};
    const start = (supporter, faces) => {
      profile.tree.supporter = supporter; DKstartInf('build'); DK.paused = false; DK.waveActive = true;
      for (let i = 0; i < faces.length; i++) { DK.heldDie = faces[i]; DKplace(i); }
    };
    start('supply', [1, 20]); let before = DK.gold;
    results.supply = { ok: DKsupporter.use(), gold: DK.gold - before, cooldown: DK.inf.supporterCooldown };
    before = DK.gold; results.supply.repeat = { ok: DKsupporter.use(), unchanged: DK.gold === before };
    start('supply', [20, 20, 20]); before = DK.gold;
    results.cap = { ok: DKsupporter.use(), gold: DK.gold - before };
    start('crusher', [20]); const target = DK.towers[0]; DK.selTower = target; before = DK.gold;
    results.crusher = { ok: DKsupporter.use(), gold: DK.gold - before, count: DK.towers.length, selected: DK.selTower === null, cooldown: DK.inf.supporterCooldown };
    start('barrage', [1, 20]);
    for (let i = 0; i < 9; i++) {
      DKspawnEnemy({ type: 'mite', wave: 1, isBoss: i === 8 });
      const e = DK.enemies.at(-1); e.hp = e.max = 10000; e.armor = 0; e.dist = i; e.hidden = false;
    }
    results.barrage = { ok: DKsupporter.use(), damage: DK.enemies.map(e => 10000 - e.hp), cooldown: DK.inf.supporterCooldown };
    DK.paused = true; profile.tree.supporter = 'supply';
    return results;
  });
  check(row, 'grade supply uses field grades, enforces the cap and cooldown, without legacy pip income', row.gradeSupporters.supply, { ok: true, gold: 101, cooldown: 45, repeat: { ok: false, unchanged: true } });
  check(row, 'grade supply bonus caps at 40', row.gradeSupporters.cap, { ok: true, gold: 120 });
  check(row, 'grade crusher destroys the selected tower for grade ×40G rather than rolling a preset replacement', row.gradeSupporters.crusher, { ok: true, gold: 800, count: 0, selected: true, cooldown: 45 });
  check(row, 'grade barrage hits the leading eight enemies using total grade and quarter boss damage', row.gradeSupporters.barrage, { ok: true, damage: [0, 458, 458, 458, 458, 458, 458, 458, 114.5], cooldown: 35 });
}

(async () => {
  const browser = await launchBrowser();
  try {
    const selected = process.argv.includes('--phone') ? 'phone' : process.argv.includes('--desktop') ? 'desktop' : null;
    report.selected = selected || 'both';
    for (const [tag, viewport] of [['phone', { width: 440, height: 956 }], ['desktop', { width: 1240, height: 860 }]].filter(([tag]) => !selected || tag === selected)) {
      const row = { tag, viewport, checks: [], errors: [] }; report.viewports.push(row);
      const dir = path.join(out, tag); fs.mkdirSync(dir, { recursive: true });
      let page, context;
      try {
        ({ page, context } = await boot(browser, viewport, row));
        await collection(page, row, dir);
        await modeDraws(page, row, dir);
        await endings(page, row, dir);
        await growthRegressions(page, row);
        check(row, 'no uncaught browser errors', row.errors, []);
        row.pass = true; console.log('PASS', tag, row.checks.length, 'checks', row.gameSha256);
      } catch (error) {
        row.failure = error.stack;
        const connectionFailure = /ECONNREFUSED|ECONNRESET|ERR_CONNECTION_(?:REFUSED|RESET)/;
        row.failureKind = connectionFailure.test(error.stack || '') || row.failedRequests?.some(r => connectionFailure.test(r.error || '')) ? 'local-server-unavailable' : 'assertion-or-runtime';
        if (page) await page.screenshot({ path: path.join(dir, 'failure.png'), fullPage: true }).catch(() => {});
        throw error;
      } finally { if (context) await context.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
    }
    assert.equal(new Set(report.viewports.map(v => v.gameSha256)).size, 1, 'all evidence uses the same production game source');
    report.pass = true;
  } finally {
    report.finished = new Date().toISOString(); report.checks = report.viewports.reduce((sum, r) => sum + r.checks.length, 0);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close();
  }
  console.log('PASS game modes', report.checks, 'checks;', path.join(out, 'report.json'));
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
