// Infinity crowd-limit regressions against the actual browser combat loop.
// The lower cap is a test fixture only; content.js and runtime assets stay untouched.
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
    await page.goto(gameUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.DK?.phase === 'title' && window.DKspawnEnemy && window.DKcombatStep, null, { timeout: 120000 });

    const observed = await page.evaluate(() => {
      const actualCap = DKCONTENT.INFINITY.fieldCap;
      const start = cap => {
        DKstartInf('clear');
        DK.paused = true;
        DK.muted = true;
        DKCONTENT.INFINITY.fieldCap = cap;
        DK.towers = [];
      };
      const enemy = () => ({ type: 'mite', wave: 1 });
      const live = () => DK.enemies.filter(e => !e.dead).length;

      start(2);
      DKspawnEnemy(enemy());
      DKspawnEnemy(enemy());
      const exactCap = { cap: 2, lives: DK.lives, total: DK.enemies.length, live: live() };
      DKspawnEnemy(enemy());
      const oneExtra = { lives: DK.lives, total: DK.enemies.length, live: live(), phase: DK.phase };

      start(2);
      DKspawnEnemy(enemy());
      DKspawnEnemy(enemy());
      // damageEnemy marks a tower kill dead; update's earlier filtering has already run.
      const killed = DK.enemies[1];
      DKdamage(killed, killed.hp + 1, null);
      const beforeReplacement = { lives: DK.lives, total: DK.enemies.length, live: live() };
      DKspawnEnemy(enemy());
      const afterReplacement = { lives: DK.lives, total: DK.enemies.length, live: live(), phase: DK.phase };

      start(2);
      DKspawnEnemy(enemy());
      DKspawnEnemy(enemy());
      DK.wave = 1;
      DK.waveActive = true;
      DK.spawnQ = [];
      DK.waveT = 139.9;
      DKcombatStep(0.2); // Pure normal rounds advance at 140 seconds, preserving survivors.
      const priorWaveDone = { wave: DK.wave, completedWave: DK.inf.doneW, live: live(), waveActive: DK.waveActive };
      DK.waveT = DK.spawnQ[0].t - 0.001;
      DKcombatStep(0.01); // First wave-2 enemy joins the existing crowd.
      const carryOver = { wave: DK.wave, completedWave: DK.inf.doneW, live: live(), lives: DK.lives, phase: DK.phase };

      start(1);
      DK.lives = 1;
      DK.spawnQ = [
        { ...enemy(), t: 0 },
        { ...enemy(), t: 0 },
        { ...enemy(), t: 0, isBoss: true },
      ];
      DK.waveActive = true;
      DK.waveT = 0;
      const goldBefore = DK.gold;
      DKcombatStep(0.016);
      const afterTerminalTick = {
        phase: DK.phase,
        lives: DK.lives,
        remainingQueue: DK.spawnQ.length,
        total: DK.enemies.length,
        live: live(),
        goldBefore,
        goldAfter: DK.gold,
        completedWave: DK.inf.doneW,
        bossTimer: DK.inf.bossT,
        bossBanner: DK.bannerT,
        capLogs: DKlogs().filter(s => s.includes('한계선 초과')).length,
        settled: !!DK.inf.settledResult,
      };

      start(1);
      DK.lives = 1;
      DKspawnEnemy(enemy());
      DKspawnEnemy({ ...enemy(), isBoss: true });
      const terminalBossSpawn = {
        phase: DK.phase,
        lives: DK.lives,
        bossTimer: DK.inf.bossT,
        bossBanner: DK.bannerT,
        settled: !!DK.inf.settledResult,
      };
      DKCONTENT.INFINITY.fieldCap = actualCap;
      return { actualCap, exactCap, oneExtra, beforeReplacement, afterReplacement, priorWaveDone, carryOver, afterTerminalTick, terminalBossSpawn };
    });

    const checks = [];
    const check = (name, fn) => {
      try { fn(); checks.push({ name, pass: true }); }
      catch (error) { checks.push({ name, pass: false, error: error.message }); }
    };
    check('original configured cap is 200', () => assert.equal(observed.actualCap, 200));
    check('exactly cap living enemies costs no life', () => {
      assert.equal(observed.exactCap.lives, 20);
      assert.equal(observed.exactCap.live, 2);
    });
    check('one living enemy over cap leaks exactly once', () => {
      assert.equal(observed.oneExtra.lives, 19);
      assert.equal(observed.oneExtra.live, 2);
      assert.equal(observed.oneExtra.phase, 'playing');
    });
    check('dead tower kill does not count toward field cap', () => {
      assert.equal(observed.beforeReplacement.live, 1);
      assert.equal(observed.beforeReplacement.total, 2);
      assert.equal(observed.afterReplacement.lives, observed.beforeReplacement.lives);
      assert.equal(observed.afterReplacement.live, 2);
    });
    check('survivors carry over and count toward the next ordinary wave cap', () => {
      assert.equal(observed.priorWaveDone.completedWave, 1);
      assert.equal(observed.priorWaveDone.wave, 2);
      assert.equal(observed.priorWaveDone.waveActive, true);
      assert.equal(observed.priorWaveDone.live, 2);
      assert.equal(observed.carryOver.wave, 2);
      assert.equal(observed.carryOver.completedWave, 1);
      assert.equal(observed.carryOver.live, 2);
      assert.equal(observed.carryOver.lives, 19);
      assert.equal(observed.carryOver.phase, 'playing');
    });
    check('terminal cap leak stops remaining due spawns in same tick', () => {
      assert.equal(observed.afterTerminalTick.phase, 'over');
      assert.equal(observed.afterTerminalTick.lives, 0);
      assert.equal(observed.afterTerminalTick.remainingQueue, 1);
      assert.equal(observed.afterTerminalTick.live, 1);
      assert.equal(observed.afterTerminalTick.capLogs, 1);
    });
    check('terminal cap leak neither awards a wave nor starts postmortem boss effects', () => {
      assert.equal(observed.afterTerminalTick.settled, true);
      assert.equal(observed.afterTerminalTick.goldAfter, observed.afterTerminalTick.goldBefore);
      assert.equal(observed.afterTerminalTick.completedWave, 0);
      assert.equal(observed.afterTerminalTick.bossTimer, 0);
      assert.equal(observed.afterTerminalTick.bossBanner, 0);
    });
    check('the spawn that ends a run does not start its own boss effects', () => {
      assert.equal(observed.terminalBossSpawn.phase, 'over');
      assert.equal(observed.terminalBossSpawn.lives, 0);
      assert.equal(observed.terminalBossSpawn.settled, true);
      assert.equal(observed.terminalBossSpawn.bossTimer, 0);
      assert.equal(observed.terminalBossSpawn.bossBanner, 0);
    });
    check('browser reports no uncaught error', () => assert.deepEqual(pageErrors, []));

    const report = { command: 'node tools/e2e/field-cap.cjs', observed, checks, pass: checks.every(c => c.pass) };
    fs.writeFileSync(outputPath('field-cap-report.json'), JSON.stringify(report, null, 2));
    for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.error ? ': ' + c.error : ''}`);
    console.log('report', outputPath('field-cap-report.json'));
    if (!report.pass) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
