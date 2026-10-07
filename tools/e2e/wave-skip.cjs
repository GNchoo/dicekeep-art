#!/usr/bin/env node
'use strict';

// Actual wave-button taps, with a paused simulation clock for exact queue/money checks.
// WAVE_SKIP_TEST_REF=<old commit> proves the pre-feature failure without changing files.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..'), out = outputPath('wave-skip'), ref = process.env.WAVE_SKIP_TEST_REF;
fs.mkdirSync(out, { recursive: true });
const report = { ref: ref || 'working tree', pass: false, checks: [] };
const check = (actual, expected, name) => { assert.deepEqual(actual, expected, name); report.checks.push(name); console.log('PASS', name); };
const files = ref ? Object.fromEntries(['game.js', 'run-save.js'].map(f => [f, cp.execFileSync('git', ['show', ref + ':' + f], { cwd: repo, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })])) : null;

async function tap(page) {
  await page.waitForFunction(() => { const b = document.getElementById('wave-btn'); return !b.disabled && !b.classList.contains('hidden'); });
  const r = await page.locator('#wave-btn').boundingBox();
  assert.ok(r && r.width >= 43.9 && r.height >= 43.9, 'wave button has a 44px touch target: '+JSON.stringify(r));
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}
const button = page => page.evaluate(() => ({ text: document.getElementById('wave-btn').textContent, hidden: document.getElementById('wave-btn').classList.contains('hidden') }));
const begin = (page, mode) => page.evaluate(mode => {
  if (mode === 'stage') DKstart(1); else DKstartInf(mode);
  DK.paused = true; DK.muted = true; DKsync();
}, mode);

async function overlap(page, mode) {
  await begin(page, mode);
  check((await button(page)).text, '웨이브 시작', mode + ': opening action');
  await tap(page);
  check(await button(page), { text: '웨이브 스킵', hidden: false }, mode + ': start becomes skip');
  const before = await page.evaluate(() => {
    __waveSkip.update(0.7); DKsync();
    window.__oldLiving = DK.enemies.slice();
    window.__oldPending = DK.spawnQ.map(x => ({ ...x, t: x.t - DK.waveT }));
    window.__expectedQueue = [...__oldPending, ...__waveSkip.buildWave(2)].sort((a,b) => a.t - b.t);
    return { gold: DK.gold, living: DK.enemies.length, pending: DK.spawnQ.length };
  });
  assert.ok(before.living > 0 && before.pending > 0, mode + ': real first-wave spawns and pending remainder exist');
  await tap(page);
  check(await page.evaluate(() => ({
    wave: DK.wave, active: DK.waveActive, t: DK.waveT, auto: DK.autoT,
    refs: __oldLiving.every(e => DK.enemies.includes(e)),
    queue: JSON.stringify(DK.spawnQ) === JSON.stringify(__expectedQueue), gold: DK.gold,
  })), { wave: 2, active: true, t: 0, auto: 0, refs: true, queue: true, gold: before.gold }, mode + ': skip preserves living enemies, rebases every pending spawn, and adds the complete next wave');
  const next = await page.evaluate(() => {
    __waveSkip.update(0.6); DKsync();
    window.__oldLiving = DK.enemies.slice();
    window.__expectedQueue = [...DK.spawnQ.map(x => ({ ...x, t: x.t - DK.waveT })), ...__waveSkip.buildWave(3)].sort((a,b) => a.t-b.t);
    return { gold: DK.gold, count: DK.enemies.length };
  });
  assert.ok(next.count > before.living, mode + ': overlapping new enemies really spawn');
  await tap(page);
  check(await page.evaluate(() => [DK.wave, DK.waveT, DK.autoT, DK.gold, __oldLiving.every(e => DK.enemies.includes(e)), JSON.stringify(DK.spawnQ) === JSON.stringify(__expectedQueue)]),
    [3, 0, 0, next.gold, true, true], mode + ': consecutive skip preserves both previous waves');
  await page.evaluate(() => { __waveSkip.update(0.05); DKsync(); });
  check(await page.evaluate(() => DK.wave), 3, mode + ': old automatic countdown cannot double-advance');

  // Enhancement/hand/menu controls keep their input priority while the skip exists.
  await page.evaluate(() => { DK.heldDie = 1; DKsync(); });
  check((await button(page)).hidden, true, mode + ': held die hides skip');
  await page.evaluate(() => { DK.heldDie = 0; DKSLOT.active = true; DKsync(); });
  check((await button(page)).hidden, true, mode + ': physical roll hides skip');
  await page.evaluate(() => { DKSLOT.active = false; DK.heldDie = 1; DKplace(0); DK.selTower = DK.towers[0]; DKsync(); });
  check((await button(page)).hidden, true, mode + ': selected tower hides skip');
  await page.evaluate(() => { DK.selTower = null; DKsync(); });
  await page.click('#exit-btn');
  check((await button(page)).hidden, true, mode + ': menu hides skip');
  await page.click('#menu-resume');
  await page.evaluate(() => { DK.towers = []; DK.selTower = null; DKsync(); });

  // A skipped batch pays every completion bonus exactly once, never on the tap.
  const paid = await page.evaluate(() => {
    const before = DK.gold, stage = DK.stage;
    DK.spawnQ = []; DK.enemies = []; DK.waveT = 1000;
    __waveSkip.update(0); DKsync();
    return { amount: DK.gold-before, expected: [1,2,3].reduce((sum,w) => sum+20+w*3+stage*2,0), done: DK.inf?.doneW ?? DK.wave, batch: DK.waveBatchStart, wave: DK.wave };
  });
  check([paid.amount, paid.done], [paid.expected, 3], mode + ': batch completion pays all three waves once');
  const once = await page.evaluate(() => DK.gold);
  await page.evaluate(() => __waveSkip.update(0));
  check(await page.evaluate(() => DK.gold), once, mode + ': completion cannot pay twice');
}

async function bossesAndSave(page) {
  await begin(page, 'build');
  await page.evaluate(() => { DK.wave = 9; DK.inf.doneW = 9; __waveSkip.startWave(); DK.spawnQ = []; DKspawnEnemy(__waveSkip.buildWave(10).find(x => x.isBoss)); __waveSkip.update(17); DKsync(); window.__oldBoss = DK.enemies.find(e => e.isBoss); });
  const before = await page.evaluate(() => [__oldBoss.hp, __oldBoss.bossT]);
  await tap(page);
  check(await page.evaluate(() => [DK.wave, DK.enemies.includes(__oldBoss), __oldBoss.hp, __oldBoss.bossT]), [11, true, ...before], 'older boss remains with the same health and deadline after skip');
  const held = await page.evaluate(() => {
    DK.spawnQ = []; DK.waveT = 1000; const gold = DK.gold; __waveSkip.update(0); DKsync();
    return [DK.waveActive, DK.inf.doneW, DK.gold === gold];
  });
  check(held, [true, 9, true], 'wave 11 cannot settle while the wave 10 boss is alive');
  await page.evaluate(() => { DK.wave = 19; DK.waveT = 12; DK.spawnQ = []; DKsync(); });
  await tap(page);
  await page.evaluate(() => {
    for (const item of __waveSkip.buildWave(20).filter(x => x.isBoss)) DKspawnEnemy(item);
    DK.spawnQ = []; DK.waveT = 0; DKsync();
  });
  check(await page.evaluate(() => DK.enemies.filter(e => e.isBoss).map(e => [e.wave, e.bossT])), [[10, before[1]], [20,320], [20,320]], 'new boss wave gets its own deadline, shared by its two bosses');
  const saved = await page.evaluate(async () => {
    const q = __waveSkip; q.persistRun(); const p = q.readRunSave(false);
    const expected = [DK.wave, DK.waveBatchStart, DK.enemies.map(e => [e.wave,e.hp,e.bossT]), DK.spawnQ];
    await q.restoreRunSave(p); DK.paused = true; DKsync();
    return { valid: !!p, restored: JSON.stringify([DK.wave, DK.waveBatchStart, DK.enemies.map(e => [e.wave,e.hp,e.bossT]), DK.spawnQ]) === JSON.stringify(expected) };
  });
  check(saved, { valid: true, restored: true }, 'resume preserves skipped batch progress and every boss deadline');
  // Compatibility with checkpoints made before individual boss deadlines existed.
  check(await page.evaluate(async () => {
    const q = __waveSkip; q.persistRun(); const p = q.readRunSave(false);
    for (const e of p.enemies) delete e.bossT;
    delete p.state.waveBatchStart; p.inf.bossT = 41;
    await q.restoreRunSave(p); DK.paused = true;
    q.update(1); DKsync();
    return DK.enemies.filter(e => e.isBoss).every(e => e.bossT === 40);
  }), true, 'old saved bosses inherit the remaining saved countdown');
}

async function finalBoundary(page, mode) {
  await begin(page, mode);
  const target = mode === 'stage' ? await page.evaluate(() => DK.stageWaves) : 101;
  await page.evaluate(target => {
    DK.wave = target-1; DK.waveActive = true; DK.waveBatchStart = target-1; DK.waveT = 0;
    if (DK.inf) DK.inf.doneW = target-2;
    DK.spawnQ = [{ ...__waveSkip.buildWave(target-1)[0], t: 300 }];
    DKspawnEnemy(__waveSkip.buildWave(target-1)[0]); DKsync();
  }, target);
  await tap(page);
  check(await page.evaluate(() => [DK.wave, DK.enemies.length > 0, DK.spawnQ.some(x => x.t === 300), document.getElementById('wave-btn').classList.contains('hidden')]), [target, true, true, true], mode + ': final wave hides skip and retains older unfinished spawns');
  await page.evaluate(() => { DK.waveT = 10; __waveSkip.update(0); });
  check(await page.evaluate(() => DK.phase), 'playing', mode + ': final cannot clear with old pending spawns');
  await page.evaluate(() => { DK.spawnQ = []; __waveSkip.update(0); });
  check(await page.evaluate(() => DK.phase), 'playing', mode + ': final cannot clear with old living enemies');
  await page.evaluate(() => { DK.enemies = []; DK.waveT = DK.mode === 'infinity' ? Math.max(40,DKCONTENT.INFINITY.waveForMode(DK.wave,DK.inf.mode).roundSeconds || 0) : 40; __waveSkip.update(0); });
  check(await page.evaluate(() => DK.phase !== 'playing' && DK.wave === (DK.mode === 'stage' ? DK.stageWaves : 101)), true, mode + ': final settles only after all overlapping work is gone');
}

(async () => {
  const browser = await launchBrowser(), errors = [];
  try {
    const context = await browser.newContext({ viewport: { width:844,height:390 } }), page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('dk_coachDone','1'); localStorage.setItem('dk_infHelpSeen','1'); });
    await page.route('**/*', async route => {
      const file = new URL(route.request().url()).pathname.split('/').pop();
      if (file !== 'game.js' && !(files && file in files)) return route.continue();
      const response = await route.fetch(), source = files?.[file] ?? await response.text();
      if (file !== 'game.js') return route.fulfill({ response, body: source });
      const anchor = 'window.DK = S;'; assert.equal(source.split(anchor).length,2);
      await route.fulfill({ response, body: source.replace(anchor, 'window.__waveSkip={startWave,buildWave,update,draw,persistRun,readRunSave,restoreRunSave}; '+anchor) });
    });
    await page.goto(gameUrl()); await page.waitForFunction(() => window.DK?.phase === 'title', null, {timeout:120000}); await page.click('#ov-btn');
    for (const mode of ['clear','build','extreme','stage']) await overlap(page,mode);
    await bossesAndSave(page);
    for (const mode of ['clear','build','stage']) await finalBoundary(page,mode);
    await begin(page,'extreme');
    await page.evaluate(() => { DK.wave=101; DK.waveActive=true; DK.waveBatchStart=101; DK.inf.doneW=100; DKsync(); });
    await tap(page);
    check(await page.evaluate(() => DK.wave),102,'extreme remains skippable beyond 101 waves');
    for (const [name,viewport] of [['landscape',{width:844,height:390}],['portrait',{width:390,height:844}]]) {
      await page.setViewportSize(viewport); await begin(page,'clear'); await tap(page); await tap(page);
      const target = await page.locator('#wave-btn').boundingBox();
      check(target.x >= 0 && target.y >= 0 && target.x+target.width <= viewport.width && target.y+target.height <= viewport.height, true, name+': skip stays inside screen');
      await page.evaluate(() => { __waveSkip.update(1); __waveSkip.draw(); DKsync(); });
      await page.waitForFunction(() => !document.getElementById('wave-btn').disabled);
      await page.screenshot({ path:path.join(out,name+'.png') });
    }
    check(errors,[], 'no browser exceptions'); report.pass = true;
  } catch (error) { report.error = error.stack; console.error(error.stack); process.exitCode = 1; }
  finally { fs.writeFileSync(path.join(out,ref?'before-report.json':'report.json'),JSON.stringify(report,null,2)); await browser.close(); }
})();
