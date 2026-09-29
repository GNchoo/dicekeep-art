// Pure-luck normal waves keep 79 spawns: rounds 1-9 take 60 seconds, later rounds 140.
// 79 is the chosen all-normal-round design; only round 1 has external count evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await page.addInitScript(() => {
      localStorage.setItem('dk_coachDone', '1');
      localStorage.setItem('dk_infHelpSeen', '1');
    });
    await page.route('**/game.js*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const anchor = 'window.DK = S;';
      assert.equal(source.split(anchor).length, 2, 'one test-hook anchor in game.js');
      const hook = `window.__pureWaveQA = { startWave, buildInfinityWave, readRoundClock: () => {
        const lines = [], original = ctx.fillText;
        ctx.fillText = function(text, ...args) { lines.push(String(text)); return original.call(this, text, ...args); };
        try { draw(); } finally { ctx.fillText = original; }
        return lines.find(text => text.includes(normalRoundLabel())) || '';
      } }; `;
      await route.fulfill({ response, body: source.replace(anchor, hook + anchor) });
    });
    await page.goto(gameUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.DK?.phase === 'title' && window.DKcombatStep && window.DKspawnEnemy && window.__pureWaveQA, null, { timeout: 120000 });

    const observed = await page.evaluate(() => {
      const INF = DKCONTENT.INFINITY;
      const pick = (w, mode) => {
        const p = INF.waveForMode(w, mode);
        return { count: p.count, gap: p.gap, roundSeconds: p.roundSeconds || 0, boss: INF.isBossWave(w) };
      };
      const profiles = {
        clear1: pick(1, 'clear'), clear9: pick(9, 'clear'), clear11: pick(11, 'clear'),
        clear10: pick(10, 'clear'), clear20: pick(20, 'clear'),
        build1: pick(1, 'build'), extreme1: pick(1, 'extreme'),
        legacyBuild1: INF.wave(1, true), legacyExtreme1: INF.wave(1, false),
        bossTimeLimit: INF.bossTimeLimit,
      };
      DKstartInf('clear');
      DK.paused = true;
      const sourceAudit = {};
      for (const mode of ['clear', 'build', 'extreme']) {
        DK.inf.mode = mode;
        sourceAudit[mode] = Array.from({ length: 101 }, (_, index) => {
          const wave = index + 1;
          const q = __pureWaveQA.buildInfinityWave(wave);
          const p = INF.waveForMode(wave, mode);
          const original = INF.wave(wave, mode !== 'extreme');
          const boss = INF.isBossWave(wave);
          const monster = INF.monsterFor(wave);
          const first = q[0]?.t ?? null, last = q.at(-1)?.t ?? null;
          const interval = q.length > 1 ? q[1].t - q[0].t : null;
          const expectedPureInterval = (130 - 0.45) / 78 * (wave <= 9 ? 60 / 140 : 1);
          const packed=i=>Math.floor(i/5)*5+(i%5)*.15;
          const maxPureError = boss || mode !== 'clear' ? null : Math.max(...q.map((item, i) => Math.abs(item.t - (0.45 + 78 * expectedPureInterval * packed(i)/packed(78)))));
          const maxUniformError = q.length < 2 ? 0 : Math.max(...q.map((item, i) => Math.abs(item.t - (first + i * interval))));
          return {
            wave, boss, count: q.length, profileCount: p.count, profileNormalCount: p.normalCount || 0, profileGap: p.gap,
            profileBosses: p.bosses, roundSeconds: p.roundSeconds || 0,
            first, last, interval, maxPureError, maxUniformError,
            originalCount: original.count, originalGap: original.gap,
            rosterCount: monster.count,
            elites: q.filter(item => item.isElite).length,
            assignedGoldCount: q.filter(item => Object.hasOwn(item, 'gold')).length,
            assignedGoldSum: q.reduce((sum, item) => sum + (item.gold || 0), 0),
            zeroGoldCount: q.filter(item => item.gold === 0).length,
            invalidGoldCount: q.filter(item => Object.hasOwn(item, 'gold') && (!Number.isInteger(item.gold) || item.gold < 0)).length,
            legacyGoldBudget: boss ? 0 : q.reduce((sum, item) => sum + Math.round(monster.base.gold * item.goldMult), 0),
          };
        });
      }
      const begin = (mode, previousWave = 0) => {
        DKstartInf(mode);
        DK.paused = true;
        DK.muted = true;
        DK.towers = [];
        DK.wave = previousWave;
        DK.waveActive = false;
        DK.spawnQ = [];
        DK.autoT = 0;
        DKsync();
        const btn = document.getElementById('wave-btn');
        if (previousWave === 0) btn.click(); else __pureWaveQA.startWave();
        return btn;
      };
      const state = () => ({
        wave: DK.wave, active: DK.waveActive, waveT: DK.waveT, autoT: DK.autoT,
        completed: DK.inf.doneW, queue: DK.spawnQ.length, enemies: DK.enemies.filter(e => !e.dead).length,
        buttonDisabled: document.getElementById('wave-btn').disabled,
        buttonHidden: document.getElementById('wave-btn').getClientRects().length === 0,
      });

      begin('clear');
      const hudClock = { start: __pureWaveQA.readRoundClock() };
      const sourceSchedule = { clear1: DK.spawnQ.map(e => e.t) };
      const queuedZero = DK.spawnQ.find(item => item.gold === 0);
      const zeroItem = queuedZero || { ...DK.spawnQ[0], gold: 0 };
      const positiveItem = DK.spawnQ.find(item => item.gold > 0);
      const zeroGoldBefore = DK.gold;
      DKspawnEnemy(zeroItem);
      const spawnedZero = DK.enemies.at(-1);
      const spawnedZeroGold = spawnedZero.gold;
      DKdamage(spawnedZero, spawnedZero.hp + 1, null);
      const zeroGoldAfter = DK.gold;
      DKspawnEnemy(positiveItem);
      const spawnedPositive = DK.enemies.at(-1);
      const spawnedPositiveGold = spawnedPositive.gold;
      DKdamage(spawnedPositive, spawnedPositive.hp + 1, null);
      const positiveGoldAfter = DK.gold;
      const spawnGold = {
        queuedZero: !!queuedZero, zeroGoldBefore, spawnedZeroGold, zeroGoldAfter,
        expectedPositiveGold: positiveItem.gold, spawnedPositiveGold, positiveGoldAfter,
      };
      DK.spawnQ = [];
      DK.enemies = [];
      DK.waveT = 29.9;
      DKcombatStep(0.2);
      hudClock.mid = __pureWaveQA.readRoundClock();
      DK.waveT = 58.9;
      DKcombatStep(0.2);
      hudClock.lastSecond = __pureWaveQA.readRoundClock();
      DK.waveT = 59.8;
      DKcombatStep(0.1);
      const beforeDeadline = state();
      document.getElementById('wave-btn').click();
      const afterEarlyClick = state();
      DKcombatStep(0.2);
      const atDeadline = state();
      hudClock.nextWave = __pureWaveQA.readRoundClock();

      begin('clear', 8);
      sourceSchedule.clear9 = DK.spawnQ.map(e => e.t);
      DK.spawnQ = [];
      DKspawnEnemy({ type: 'mite', wave: 9 });
      const survivor = DK.enemies[0];
      DK.waveT = 59.9;
      DKcombatStep(0.2);
      const carryIntoBoss = { ...state(), survivorRetained: DK.enemies.includes(survivor) };

      begin('clear', 10);
      sourceSchedule.clear11 = DK.spawnQ.map(e => e.t);
      hudClock.lateStart = __pureWaveQA.readRoundClock();
      DK.spawnQ = [];
      DK.enemies = [];
      DK.waveT = 59.9;
      DKcombatStep(0.2);
      const lateWaveAt60 = state();
      DK.waveT = 139.9;
      DKcombatStep(0.2);
      const lateWaveAt140 = state();

      begin('clear', 9);
      sourceSchedule.clear10 = DK.spawnQ.map(e => e.t);
      DKcombatStep(1.1); // First boss is due at t=1.05.
      const boss = DK.enemies.find(e => e.isBoss && !e.dead);
      const bossSpawn = { ...state(), bossTimer: DK.inf.bossT, bossPresent: !!boss };
      DK.waveT = 139.9;
      DKcombatStep(0.2);
      const bossAtNormalDeadline = { ...state(), bossTimer: DK.inf.bossT };
      if (boss) DKdamage(boss, boss.hp + 1, null);
      DKcombatStep(0.016);
      const bossAfterKill = { ...state(), bossTimer: DK.inf.bossT };
      document.getElementById('wave-btn').click();
      const bossIntermissionClick = state();
      DKcombatStep(6.01);
      const bossAutoContinue = state();

      const legacy = {};
      for (const mode of ['build', 'extreme']) {
        begin(mode);
        sourceSchedule[mode + '1'] = DK.spawnQ.map(e => e.t);
        DK.spawnQ = [];
        DK.enemies = [];
        DKcombatStep(0.016);
        legacy[mode] = state();
        document.getElementById('wave-btn').click();
        legacy[mode].afterClick = state();
        DKcombatStep(6.01);
        legacy[mode].next = state();
      }
      begin('clear', 100);
      DK.inf.doneW = 100;
      DK.spawnQ = [];
      DKspawnEnemy({ type: 'mite', wave: 101 });
      DK.waveT = 139.9;
      DKcombatStep(0.2);
      const finalWithSurvivor = {
        ...state(), phase: DK.phase, lives: DK.lives, finalTimeout: !!DK.inf.finalTimeout,
        cleared: DK.inf.cleared, settledWave: DK.inf.settledResult?.wave ?? null,
        clock: __pureWaveQA.readRoundClock(),
      };
      DK.waveT = 319.9;
      DKcombatStep(0.2);
      const finalTimedOut = {
        ...state(), phase: DK.phase, lives: DK.lives, finalTimeout: !!DK.inf.finalTimeout,
        cleared: DK.inf.cleared, settledWave: DK.inf.settledResult?.wave ?? null,
      };

      begin('clear', 100);
      DK.inf.doneW = 100;
      DK.spawnQ = [];
      DKspawnEnemy({ type: 'mite', wave: 101 });
      DK.waveT = 199.9;
      DKcombatStep(0.2);
      const finalWaitingAt200 = { ...state(), phase: DK.phase, clock: __pureWaveQA.readRoundClock() };
      const lastEnemy = DK.enemies.find(enemy => !enemy.dead);
      if (lastEnemy) DKdamage(lastEnemy, lastEnemy.hp + 1, null);
      DKcombatStep(0.016);
      const finalCleanedAt200 = {
        ...state(), phase: DK.phase, finalTimeout: !!DK.inf.finalTimeout,
        cleared: DK.inf.cleared, settledWave: DK.inf.settledResult?.wave ?? null,
      };

      begin('clear', 100);
      DK.inf.doneW = 100;
      DK.spawnQ = [];
      DK.enemies = [];
      DK.waveT = 139.9;
      DKcombatStep(0.2);
      const finalEmpty = {
        ...state(), phase: DK.phase, lives: DK.lives, finalTimeout: !!DK.inf.finalTimeout,
        cleared: DK.inf.cleared, settledWave: DK.inf.settledResult?.wave ?? null,
      };
      return { profiles, sourceAudit, sourceSchedule, spawnGold, hudClock, beforeDeadline, afterEarlyClick, atDeadline,
        carryIntoBoss, lateWaveAt60, lateWaveAt140, bossSpawn, bossAtNormalDeadline, bossAfterKill, bossIntermissionClick, bossAutoContinue, legacy,
        finalWithSurvivor, finalTimedOut, finalWaitingAt200, finalCleanedAt200, finalEmpty };
    });

    const checks = [];
    const check = (name, fn) => {
      try { fn(); checks.push({ name, pass: true }); }
      catch (error) { checks.push({ name, pass: false, error: error.message }); }
    };
    const p = observed.profiles;
    const close = (actual, expected, label, tolerance = 1e-7) =>
      assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
    check('all 91 ordinary clear profiles and queues contain exactly 79 grouped spawns with unchanged first/last times', () => {
      const normal = observed.sourceAudit.clear.filter(row => !row.boss);
      assert.equal(normal.length, 91);
      for (const row of normal) {
        const early = row.wave <= 9;
        assert.equal(row.profileNormalCount, 79, `profile W${row.wave}`);
        assert.equal(row.count, 79, `queue W${row.wave}`);
        assert.equal(row.roundSeconds, early ? 60 : 140, `clock W${row.wave}`);
        close(row.first, 0.45, `first W${row.wave}`);
        close(row.last, early ? 55.97142857142857 : 130, `last W${row.wave}`);
        assert.ok(row.maxPureError <= 1e-7, `spacing W${row.wave}: ${row.maxPureError}`);
        assert.ok(row.maxUniformError > 1 && row.interval > 0, `grouped intervals W${row.wave}`);
      }
    });
    check('first nine rounds total 540 game seconds with all 711 monsters retained', () => {
      const early = observed.sourceAudit.clear.filter(row => row.wave <= 9);
      assert.equal(early.length, 9);
      assert.equal(early.reduce((sum, row) => sum + row.roundSeconds, 0), 540);
      assert.equal(early.reduce((sum, row) => sum + row.count, 0), 711);
    });
    check('all 91 clear round gold sums equal their legacy normal-plus-elite kill budget', () => {
      const normal = observed.sourceAudit.clear.filter(row => !row.boss);
      for (const row of normal) {
        const legacy = observed.sourceAudit.build[row.wave - 1];
        assert.equal(row.elites, legacy.elites, `elite count W${row.wave}`);
        assert.equal(row.assignedGoldCount, 79, `assigned gold W${row.wave}`);
        assert.equal(row.invalidGoldCount, 0, `integer nonnegative gold W${row.wave}`);
        assert.equal(row.assignedGoldSum, legacy.legacyGoldBudget, `gold budget W${row.wave}`);
      }
    });
    check('spawn and kill preserve explicit zero and positive item gold exactly', () => {
      const s = observed.spawnGold;
      assert.equal(s.spawnedZeroGold, 0);
      assert.equal(s.zeroGoldAfter, s.zeroGoldBefore);
      assert.ok(s.expectedPositiveGold > 0);
      assert.equal(s.spawnedPositiveGold, s.expectedPositiveGold);
      assert.equal(s.positiveGoldAfter - s.zeroGoldAfter, s.expectedPositiveGold);
    });
    check('all 10 boss profiles retain their own count and no 140-second clock', () => {
      const bosses = observed.sourceAudit.clear.filter(row => row.boss);
      assert.equal(bosses.length, 10);
      for (const row of bosses) {
        assert.equal(row.count, row.profileBosses, `boss W${row.wave}`);
        assert.equal(row.roundSeconds, 0, `boss clock W${row.wave}`);
        close(row.first, 1.05, `boss first W${row.wave}`);
      }
    });
    check('build and extreme keep legacy profile and queue timing through 101 waves', () => {
      for (const mode of ['build', 'extreme']) {
        const rows = observed.sourceAudit[mode];
        assert.equal(rows.length, 101);
        for (const row of rows) {
          assert.equal(row.roundSeconds, 0, `${mode} clock W${row.wave}`);
          assert.equal(row.profileCount, row.originalCount, `${mode} count W${row.wave}`);
          close(row.profileGap, row.originalGap, `${mode} gap W${row.wave}`);
          if (row.boss) {
            assert.equal(row.count, row.profileBosses, `${mode} boss W${row.wave}`);
            close(row.first, 1.05, `${mode} boss first W${row.wave}`);
          } else {
            assert.equal(row.count, row.rosterCount, `${mode} queue W${row.wave}`);
            close(row.first, 0.45, `${mode} first W${row.wave}`);
            assert.ok(row.last < 40, `${mode} legacy finish W${row.wave}: ${row.last}`);
            const gapError = Math.min(Math.abs(row.interval - row.originalGap), Math.abs(row.interval - row.originalGap * 0.72));
            assert.ok(gapError <= 1e-7, `${mode} interval W${row.wave}: ${row.interval}`);
            assert.ok(row.maxUniformError <= 1e-7, `${mode} uniformity W${row.wave}`);
          }
        }
      }
    });
    check('pure early normal profiles specify 60 seconds, later normals 140; bosses have no round clock', () => {
      for (const key of ['clear1', 'clear9', 'clear11']) {
        assert.equal(p[key].boss, false);
        assert.equal(p[key].roundSeconds, key === 'clear11' ? 140 : 60);
      }
      for (const key of ['clear10', 'clear20']) {
        assert.equal(p[key].boss, true);
        assert.equal(p[key].roundSeconds, 0);
      }
    });
    check('build and extreme profiles retain legacy count, gap, and no round clock', () => {
      for (const [key, old] of [['build1', 'legacyBuild1'], ['extreme1', 'legacyExtreme1']]) {
        assert.equal(p[key].count, p[old].count);
        assert.equal(p[key].gap, p[old].gap);
        assert.equal(p[key].roundSeconds, 0);
      }
    });
    check('started clear waves use the scheduled 79-enemy queue', () => {
      for (const key of ['clear1', 'clear9', 'clear11']) {
        const times = observed.sourceSchedule[key];
        assert.equal(times.length, 79, key);
        close(times[0], 0.45, `${key} first`);
        close(times.at(-1), key === 'clear11' ? 130 : 55.97142857142857, `${key} last`);
      }
      assert.equal(observed.sourceSchedule.clear10.length, 1);
    });
    check('top arena banner displays the early 1:00 clock and restores 2:20 after the first boss', () => {
      assert.match(observed.hudClock.start, /1:00/);
      assert.match(observed.hudClock.mid, /0:30/);
      assert.match(observed.hudClock.lastSecond, /0:01/);
      assert.match(observed.hudClock.nextWave, /1:00/);
      assert.match(observed.hudClock.lateStart, /2:20/);
    });
    check('build and extreme actual queues keep the short legacy spacing', () => {
      for (const key of ['build1', 'extreme1']) {
        const times = observed.sourceSchedule[key];
        assert.ok(times.length > 1, key);
        assert.ok(times.at(-1) < 30, `${key} last spawn ${times.at(-1)}s`);
      }
    });
    check('empty field and drained queue cannot complete or skip at 59.9 seconds', () => {
      const a = observed.beforeDeadline, b = observed.afterEarlyClick;
      close(a.waveT, 59.9, 'early round before deadline');
      assert.equal(a.wave, 1);
      assert.equal(a.active, true);
      assert.equal(a.completed, 0);
      assert.equal(a.buttonDisabled, true);
      assert.equal(a.buttonHidden, true);
      assert.equal(b.wave, 1);
      assert.equal(b.active, true);
      assert.equal(b.completed, 0);
    });
    check('normal deadline completes wave and starts the next with no six-second intermission', () => {
      const s = observed.atDeadline;
      assert.equal(s.wave, 2);
      assert.equal(s.active, true);
      assert.equal(s.completed, 1);
      assert.equal(s.autoT, 0);
      assert.equal(s.waveT, 0);
      assert.ok(s.queue > 0);
      assert.equal(s.buttonHidden, true);
    });
    check('normal deadline advances to a boss even with previous enemies alive', () => {
      const s = observed.carryIntoBoss;
      assert.equal(s.wave, 10);
      assert.equal(s.active, true);
      assert.equal(s.completed, 9);
      assert.equal(s.autoT, 0);
      assert.equal(s.survivorRetained, true);
    });
    check('wave 11 remains active at 60 seconds and advances only at 140 seconds', () => {
      const a = observed.lateWaveAt60, b = observed.lateWaveAt140;
      assert.equal(a.wave, 11);
      assert.equal(a.active, true);
      close(a.waveT, 60.1, 'late round still running');
      assert.equal(b.wave, 12);
      assert.equal(b.active, true);
      assert.equal(b.completed, 11);
      assert.equal(b.autoT, 0);
      assert.equal(b.waveT, 0);
    });
    check('boss still uses a 320-second timer and stays active past normal deadline', () => {
      assert.equal(p.bossTimeLimit, 320);
      assert.equal(observed.bossSpawn.bossPresent, true);
      assert.ok(observed.bossSpawn.bossTimer > 318 && observed.bossSpawn.bossTimer <= 320);
      assert.equal(observed.bossAtNormalDeadline.wave, 10);
      assert.equal(observed.bossAtNormalDeadline.active, true);
      assert.equal(observed.bossAtNormalDeadline.completed, 0);
      assert.ok(observed.bossAtNormalDeadline.bossTimer > 0);
    });
    check('boss kill retains legacy six-second intermission', () => {
      const s = observed.bossAfterKill;
      assert.equal(s.wave, 10);
      assert.equal(s.active, false);
      assert.equal(s.completed, 10);
      assert.equal(s.autoT, 6);
    });
    check('boss intermission hides the one-time start action and advances automatically', () => {
      const before=observed.bossAfterKill, clicked=observed.bossIntermissionClick, next=observed.bossAutoContinue;
      assert.equal(before.buttonHidden,true);
      assert.equal(before.buttonDisabled,true);
      assert.equal(clicked.wave,10);
      assert.equal(clicked.autoT,6);
      assert.equal(next.wave,11);
      assert.equal(next.active,true);
      assert.equal(next.buttonHidden,true);
      assert.ok(next.queue>0);
    });
    check('build and extreme still complete drained waves by legacy rule', () => {
      for (const key of ['build', 'extreme']) {
        const s = observed.legacy[key];
        assert.equal(s.wave, 1);
        assert.equal(s.active, false);
        assert.equal(s.completed, 1);
        assert.equal(s.autoT, 6);
        assert.equal(s.buttonHidden,true);
        assert.equal(s.buttonDisabled,true);
        assert.equal(s.afterClick.wave,1);
        assert.equal(s.afterClick.autoT,6);
        assert.equal(s.next.wave,2);
        assert.equal(s.next.active,true);
        assert.equal(s.next.buttonHidden,true);
      }
    });
    check('final clear round stays active after 140 seconds if one enemy survives', () => {
      const s = observed.finalWithSurvivor;
      assert.equal(s.phase, 'playing');
      assert.equal(s.active, true);
      assert.equal(s.lives, 20);
      assert.equal(s.finalTimeout, false);
      assert.equal(s.cleared, 0);
      assert.equal(s.completed, 100);
      assert.equal(s.settledWave, null);
      assert.match(s.clock, /최종 정리.*3:00/);
    });
    check('final clear round loses at 320 seconds if an enemy still survives', () => {
      const s = observed.finalTimedOut;
      assert.equal(s.phase, 'over');
      assert.equal(s.lives, 0);
      assert.equal(s.finalTimeout, true);
      assert.equal(s.cleared, 0);
      assert.equal(s.completed, 100);
      assert.equal(s.settledWave, 100);
    });
    check('final clear round wins if survivors are cleaned up before 320 seconds', () => {
      assert.equal(observed.finalWaitingAt200.phase, 'playing');
      assert.equal(observed.finalWaitingAt200.active, true);
      assert.match(observed.finalWaitingAt200.clock, /최종 정리.*2:00/);
      const s = observed.finalCleanedAt200;
      assert.equal(s.phase, 'over');
      assert.equal(s.finalTimeout, false);
      assert.equal(s.cleared, 1);
      assert.equal(s.completed, 101);
      assert.equal(s.settledWave, 101);
    });
    check('final clear round wins at 140 seconds when the field is empty', () => {
      const s = observed.finalEmpty;
      assert.equal(s.phase, 'over');
      assert.equal(s.lives, 20);
      assert.equal(s.finalTimeout, false);
      assert.equal(s.cleared, 1);
      assert.equal(s.completed, 101);
      assert.equal(s.settledWave, 101);
    });
    check('browser reports no uncaught error', () => assert.deepEqual(pageErrors, []));

    const report = { command: 'node tools/e2e/pure-wave-schedule.cjs', observed, checks, pass: checks.every(c => c.pass) };
    fs.writeFileSync(outputPath('pure-wave-schedule-report.json'), JSON.stringify(report, null, 2));
    for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.error ? ': ' + c.error : ''}`);
    console.log('report', outputPath('pure-wave-schedule-report.json'));
    if (!report.pass) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
