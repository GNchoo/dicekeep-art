const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..'), out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/run-resume'));
const url = new URL('index.html?net=off', process.env.E2E_BASE_URL || 'http://localhost:8137/').href;
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await launchBrowser(), report = { cases: [], pass: false };
  try {
    for (const [name, viewport] of [['desktop', { width: 1240, height: 860 }], ['phone', { width: 440, height: 956 }]]) {
      const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      await page.route('**/game.js*', async route => {
        const r = await route.fetch(), s = await r.text();
        await route.fulfill({ response: r, body: s.replace('window.DK = S;', 'window.__resumeQA={persistRun,readRunSave,restoreRunSave,spawnEnemy,buildInfinityWave,towerDmg,relayoutArena,update};\nwindow.DK = S;') });
      });
      async function boot() { await page.goto(url); await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 }); await page.click('#ov-btn'); await page.evaluate(() => DK.muted = true); }
      try {
        await boot();
        const saved = await page.evaluate(() => {
          DKSAVE.progression.levels[6] = 20; DKSAVE.progression.deck = [1, 2, 3, 4, 6];
          DKstartInf('extreme'); DK.paused = true;
          DK.heldDie = 6; DKplace(0); const t = DK.towers[0]; t.growthCarry = 2.52;
          DK.wave = 203; DK.inf.doneW = 202; DK.inf.kills = 12345; DK.waveActive = true; DK.waveT = 12.25;
          __resumeQA.spawnEnemy(__resumeQA.buildInfinityWave(203)[0]); const e = DK.enemies[0]; e.dist = 150; e.hp *= .6; e.slowT = .8;
          DK.projs.push({ kind: 'dieBomb', x: t.x, y: t.y, tgt: e, src: t, spd: 350, dmg: 100, splash: 50, trail: [], rot: 0, spin: 0 });
          DK.inf.queue = ['primal'];
          DKSLOT.active = true; DKSLOT.final = 6; DKSLOT.kind = 'd6';
          __resumeQA.persistRun();
          return __resumeQA.readRunSave(false);
        });
        assert.ok(saved && saved.enemies.length && saved.projs.length);
        await page.click('#exit-btn'); await page.click('#menu-save');
        assert.ok(await page.locator('#run-resume').isVisible());
        await page.click('#btn-inf-build');
        assert.equal(await page.evaluate(() => DK.phase), 'lobby', 'new run does not silently destroy saved run');
        await page.click('#btn-inf-clear');
        assert.equal(await page.evaluate(() => DK.phase), 'playing', 'pure mode remains available with an unfinished growth run');
        assert.ok(await page.evaluate(() => __resumeQA.readRunSave(false)));
        await boot(); await page.evaluate(() => DKlobbyView('single'));
        await page.click('#run-resume-play'); await page.waitForFunction(() => DK.phase === 'playing');
        const restored = await page.evaluate(() => ({ wave: DK.wave, done: DK.inf.doneW, hp: DK.enemies[0].hp, slow: DK.enemies[0].slowT, gold: DK.gold,
          runId: DK.inf.runId, snapshot: DK.inf.growthSnapshot, queue: DK.inf.queue, waveT: DK.waveT, paused: DK.paused,
          refs: DK.projs[0].tgt === DK.enemies[0] && DK.projs[0].src === DK.towers[0], slot: [DKSLOT.active, DKSLOT.final], carry: DK.towers[0].growthCarry }));
        assert.deepEqual(restored, { wave: 203, done: 202, hp: saved.enemies[0].hp, slow: .8, gold: saved.state.gold, runId: saved.inf.runId,
          snapshot: saved.inf.growthSnapshot, queue: saved.inf.queue, waveT: 12.25, paused: true, refs: true, slot: [true, 6], carry: 2.52 });
        const before = await page.evaluate(() => __resumeQA.towerDmg(DK.towers[0]));
        await page.setViewportSize({ width: viewport.height, height: viewport.width });
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => __resumeQA.towerDmg(DK.towers[0])), before, 'rotation preserves inherited growth');
        await page.evaluate(() => { __resumeQA.persistRun(); });
        await page.screenshot({ path: path.join(out, name + '.png') });
        await page.click('#menu-quit'); await page.waitForFunction(() => DK.phase === 'over');
        const settlement = await page.evaluate(() => ({ saved: __resumeQA.readRunSave(false), shards: DKSAVE.progression.shards, count: DKSAVE.progression.records.extreme.runs.length }));
        assert.equal(settlement.saved, null); assert.equal(settlement.count, 1); assert.ok(settlement.shards > 0);
        await boot(); assert.equal(await page.evaluate(() => DKSAVE.progression.shards), settlement.shards);
        const guards = await page.evaluate(saved => {
          const text = JSON.stringify(saved), p = structuredClone(saved); p.projs[0].target = 9999;
          return [DKRUNSAVE.decode(text, 'another'), DKRUNSAVE.decode('{', 'guest'), DKRUNSAVE.decode(JSON.stringify({ ...saved, rules: 'old' }), 'guest'), DKRUNSAVE.decode(JSON.stringify(p), 'guest')];
        }, saved);
        assert.deepEqual(guards, [null, null, null, null]); assert.deepEqual(errors, []);
        report.cases.push({ name, pass: true, checks: ['active wave/HP/slow/gold/queue/roll restored', 'projectile object references restored', 'frozen growth and run ID preserved', 'rotation retains growth', 'settlement removes checkpoint and pays once', 'owner/version/corruption guards'] });
        console.log('PASS', name);
      } catch (e) { await page.screenshot({ path: path.join(out, name + '-failure.png') }); throw e; }
      finally { await context.close(); }
    }
    report.pass = true;
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
