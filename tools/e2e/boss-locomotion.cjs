// Compare movement against the independently authored art locomotion, including
// old checkpoints, missing art metadata and spectator reconstruction. No combat cheats
// or production diagnostic hooks are shipped by this test.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..'), before = process.argv.includes('--capture-before');
const out = path.join(repo, 'gen/e2e/boss-locomotion'); fs.mkdirSync(out, { recursive: true });
const game = fs.readFileSync(path.join(repo, 'game.js'), 'utf8');
(async () => {
  const browser = await launchBrowser(), report = { before, viewports: [], passed: false };
  try {
    for (const [tag, viewport] of [['phone', { width: 440, height: 956 }], ['desktop', { width: 1240, height: 860 }]]) {
      const page = await browser.newPage({ viewport }), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/game.js*', r => r.fulfill({ contentType: 'application/javascript', body: game.replace('window.DK = S;',
        'Object.assign(window,{buildInfinityWave,spawnEnemy,epos,currentEnemyFrame,enemyAirHeight,refreshDirectionalDemand,persistRun,readRunSave,restoreRunSave,mpViewBuild,VIEW}); Object.defineProperty(window,"LANES",{get:()=>LANES}); window.DK = S;') }));
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      await page.goto(gameUrl()); await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
      const audit = await page.evaluate(() => {
        DKstartInf('clear'); DK.paused = true; DK.muted = true;
        DK.spawnQ = []; DK.autoT = 999; DK.waveActive = false;
        const I = DKCONTENT.INFINITY, rows = [];
        for (let cycle = 0; cycle < 8; cycle++) for (let slot = 10; slot <= 100; slot += 10) {
          const wave = cycle * 101 + slot; DK.wave = wave; DK.enemies = [];
          for (const item of buildInfinityWave(wave)) {
            spawnEnemy(item); const e = DK.enemies.at(-1), art = I.directionalArt(wave, e.bossRole);
            rows.push({ wave, role: e.bossRole, id: art.assetId, gait: art.entry.locomotion, move: e.move,
              hp: e.hp, expectedHp: e.def.hp * item.hpMult, speed: e.spdMult, expectedSpeed: item.spdMult,
              gold: e.gold, expectedGold: Math.round(e.def.gold * item.goldMult) });
          }
        }
        DK.wave = 100; DK.enemies = []; DK.corpses = [];
        for (const item of buildInfinityWave(100)) spawnEnemy(item);
        const lane = LANES[0];
        DK.enemies.forEach((e, i) => { e.dist = (lane.loopAt || 0) + (lane.len - (lane.loopAt || 0)) * (.18 + i * .16); e.entranceT = -1; e.animT = .5; e.artWalkDistance = 40; });
        DK.fxs = []; DK.texts = []; DK.bannerT = 0; DK.shakeT = 0;
        refreshDirectionalDemand(true);
        return rows;
      });
      await page.waitForFunction(() => !DKART.state().running && !DKART.state().queued, null, { timeout: 60000 });
      const visible = await page.evaluate(() => DK.enemies.map(e => ({ name: e.name, role: e.bossRole, move: e.move,
        altitude: enemyAirHeight(e, epos(e), currentEnemyFrame(e)), id: currentEnemyFrame(e).assetId })));
      await page.screenshot({ path: path.join(out, `${tag}-${before ? 'before' : 'after'}.png`) });
      const row = { tag, audit, visible, errors }; report.viewports.push(row);
      if (!before) {
        for (const e of audit) {
          if (e.gait === 'legged') assert.equal(e.move, 'ground', JSON.stringify(e));
          if (e.gait === 'flight') assert.equal(e.move, 'air', JSON.stringify(e));
          assert.equal(e.hp, e.expectedHp); assert.equal(e.speed, e.expectedSpeed); assert.equal(e.gold, e.expectedGold);
        }
        assert.equal(visible[0].altitude, 0); assert.equal(visible[1].move, 'air'); assert.ok(visible[1].altitude > 0);
        row.spectator = await page.evaluate(() => {
          DK.net = { rivals: { peer: {} }, status: 'alive' }; VIEW.pid = 'peer'; VIEW.enemies = [];
          const en = DK.enemies.map(e => `${1000 + DKCONTENT.bossBases.findIndex(b => b.id === e.type)},${Math.round(e.dist)},9,${e.appearanceCode},64`).join(';');
          mpViewBuild({ w: 100, sp: 1, o: DK.mapKey === 'cInfP' ? 'p' : 'l', ll: LANES[0].len, l: 20, f: 2, tw: [], en });
          const result = VIEW.enemies.map(e => ({ role: e.bossRole, move: e.move }));
          VIEW.pid = null; VIEW.enemies = []; DK.net = null; return result;
        });
        assert.deepEqual(row.spectator, [{ role: 0, move: 'ground' }, { role: 1, move: 'air' }]);
        row.restored = await page.evaluate(async () => {
          DKstartInf('extreme'); DK.paused = true; DK.wave = 100; DK.inf.doneW = 99; DK.spawnQ = [];
          for (const item of buildInfinityWave(100)) spawnEnemy(item);
          // This is an existing v105 save, not a fresh corrected spawn.
          DK.enemies[0].move = 'air'; DK.enemies[1].move = 'ground';
          persistRun(); const p = readRunSave(false), hp = p.enemies.map(e => e.hp), id = p.inf.runId;
          await restoreRunSave(p, null);
          return { moves: DK.enemies.map(e => e.move), hp: DK.enemies.map(e => e.hp), expectedHp: hp, sameRun: DK.inf.runId === id };
        });
        assert.deepEqual(row.restored.moves, ['ground', 'air']); assert.equal(row.restored.sameRun, true);
        assert.deepEqual(row.restored.hp, row.restored.expectedHp);
        // Art delivery cannot change movement classification.
        row.withoutArt = await page.evaluate(() => {
          const a = window.INF_DIRECTIONAL_ART, b = window.INF_EXTREME_ART;
          try { window.INF_DIRECTIONAL_ART = { entries: {} }; window.INF_EXTREME_ART = { entries: {} };
            return [0, 1].map(role => DKCONTENT.INFINITY.bossMoveFor(100, role, role ? 'ground' : 'air'));
          } finally { window.INF_DIRECTIONAL_ART = a; window.INF_EXTREME_ART = b; }
        });
        assert.deepEqual(row.withoutArt, ['ground', 'air']);
      }
      assert.deepEqual(errors, []); await page.close();
    }
    report.passed = true;
  } finally { fs.writeFileSync(path.join(out, before ? 'before-report.json' : 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log(before ? 'Captured pre-fix boss movement' : 'PASS boss locomotion: 8 cycles, 2 viewports, spectator, v105 recovery and missing art');
})().catch(e => { console.error(e); process.exitCode = 1; });
