// Explicit tree-version checkpoint coverage, separate from the legacy/v111
// run-resume fixtures. Local fresh browser contexts only; no account or payments.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/tree-resume'); fs.mkdirSync(out, { recursive: true });
const report = { pass: false, cases: [], scope: 'New tree frozen snapshots, skill cooldowns and counters, seven-pip awakened towers, account changes, reload and mobile/desktop rotation. Resource/board preconditions are explicit test fixtures.' };
(async () => {
  const browser = await launchBrowser();
  try {
    for (const [name, viewport] of [['desktop', { width: 1240, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
      const row = { name, checks: [], pass: false }; report.cases.push(row);
      const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); row.checks.push(name); };
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      await page.route('**/game.js*', async route => {
        const response = await route.fetch(), source = await response.text(), anchor = 'window.DK = S;';
        assert.equal(source.split(anchor).length, 2);
        await route.fulfill({ response, body: source.replace(anchor, 'window.__treeResumeQA={persistRun,readRunSave,restoreRunSave,buildInfinityWave,spawnEnemy,towerDmg,towerAwakened,laneLen,saveSave};\n' + anchor) });
      });
      const inspect = () => page.evaluate(() => ({
        snapshot: DK.inf.growthSnapshot, gold: DK.gold, wave: DK.wave, done: DK.inf.doneW, runId: DK.inf.runId,
        supporterCooldown: DK.inf.supporterCooldown, supporterUses: DK.inf.supporterUses, deckPower: DK.inf.deckPower,
        towers: DK.towers.map(t => ({ face: t.face, pips: t.pips, copyHaste: t.copyHaste, abilityT: t.abilityT, shotSerial: t.shotSerial, cd: t.cd, damage: __treeResumeQA.towerDmg(t), awakened: __treeResumeQA.towerAwakened(t), name: t.def.name })),
        enemies: DK.enemies.map(e => ({ hp: e.hp, max: e.max, poisonT: e.poisonT, poisonDps: e.poisonDps })),
        clocks: { time: DK.time, waveT: DK.waveT, autoT: DK.autoT, bossT: DK.inf.bossT },
        refs: DK.projs.every(q => DK.enemies.includes(q.tgt) && DK.towers.includes(q.src)),
        frozen: Object.isFrozen(DK.inf.growthSnapshot) && ['deck', 'levels', 'classes', 'mastery', 'talents', 'awakenings'].every(k => Object.isFrozen(DK.inf.growthSnapshot[k])), paused: DK.paused,
      }));
      async function boot() { await page.goto(gameUrl(false)); await page.waitForFunction(() => window.DK?.phase === 'title' && window.__treeResumeQA, null, { timeout: 120000 }); await page.click('#ov-btn'); }
      try {
        await boot();
        const saved = await page.evaluate(() => {
          const p = DKPROGRESSION.defaultProfile(), deck = [1, 6, 13, 14, 20];
          for (const id of deck) { p.levels[id] = 1; Object.assign(p.collection.cards[id], { owned: true, class: DKDECKRULES.get(id).baseClass }); p.tree.mastery[id] = 3; p.tree.talents[id] = id === 6 ? 'insight' : 'force'; p.tree.awakenings[id] = true; }
          if (!DKPROGRESSION.setPreset(p, 0, deck).ok) throw Error('tree fixture deck rejected');
          p.tree.supporter = 'supply'; DKSAVE.progression = p; DKstartInf('extreme'); DK.muted = true; DK.gold = 10000;
          DK.wave = 33; DK.inf.doneW = 32; DK.waveActive = true; DKSLOT.active = false;
          deck.forEach((face, i) => {
            DK.heldDie = face; if (!DKplace(i)) throw Error('tree fixture placement rejected');
            const t = DK.towers[i]; t.pips = i === 1 ? 6 : 7; t.cd = .375 + i * .125; t.abilityT = 5.25 + i; t.shotSerial = 10 + i;
            if (face === 13) t.copyHaste = true;
          });
          if (!DKsupporter.use()) throw Error('supporter fixture activation failed');
          DKsupporter.tick(17.5); DK.paused = true;
          DK.time = 50.25; DK.waveT = 11.125; DK.autoT = 2.75; DK.inf.bossT = 3.25;
          __treeResumeQA.spawnEnemy(__treeResumeQA.buildInfinityWave(33)[0]);
          const e = DK.enemies[0], t = DK.towers[0]; e.dist = 120; e.hp *= .7; e.poisonT = 1.75; e.poisonDps = 12.5;
          DK.projs.push({ kind: 'dieBomb', x: t.x, y: t.y, tgt: e, src: t, spd: 350, dmg: 100, splash: 50, trail: [], rot: .3, spin: .2 });
          const frozen = JSON.stringify(DK.inf.growthSnapshot);
          p.tree.mastery[1] = 5; p.tree.talents[1] = 'insight'; p.tree.awakenings[1] = false; p.tree.supporter = 'barrage';
          if (JSON.stringify(DK.inf.growthSnapshot) !== frozen) throw Error('profile edit mutated frozen tree run');
          __treeResumeQA.saveSave();
          if (!__treeResumeQA.persistRun()) throw Error('tree checkpoint not saved');
          return __treeResumeQA.readRunSave(false);
        });
        assert.ok(saved); const expected = await inspect();
        check('tree marker and supporter are frozen at run start', { version: saved.inf.growthSnapshot.treeVersion, supporter: saved.inf.growthSnapshot.supporter, uses: saved.inf.supporterUses }, { version: 1, supporter: 'supply', uses: 1 });
        check('all nested tree progression maps are frozen', expected.frozen, true);
        check('seven-pip unlocked towers awaken while six-pip stays dormant', expected.towers.map(t => t.awakened), [true, false, true, true, true]);
        const expectedProgress = await page.evaluate(() => DK.enemies.map(e => e.dist / __treeResumeQA.laneLen(e)));
        await page.reload(); await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 }); await page.click('#ov-btn'); await page.evaluate(() => DKlobbyView('single'));
        await page.click('#run-resume-play'); await page.waitForFunction(() => DK.phase === 'playing');
        check('reload restores frozen tree combat, cooldown, uses, awakened statistics and projectile references', await inspect(), expected);
        check('account edits remain separate from resumed snapshot', await page.evaluate(() => ({ profile: DKSAVE.progression.tree.supporter, run: DK.inf.growthSnapshot.supporter })), { profile: 'barrage', run: 'supply' });
        const oldMap = await page.evaluate(() => DK.mapKey); await page.setViewportSize({ width: viewport.height, height: viewport.width });
        await page.waitForFunction(old => DK.mapKey !== old, oldMap);
        check('rotation preserves logical tree state', await inspect(), expected);
        const progress = await page.evaluate(() => DK.enemies.map(e => e.dist / __treeResumeQA.laneLen(e)));
        check('rotation preserves path progress', progress.every((p, i) => Math.abs(p - expectedProgress[i]) < 1e-10), true);
        const cooldown = await page.evaluate(() => {
          const before = { cooldown: DK.inf.supporterCooldown, gold: DK.gold, uses: DK.inf.supporterUses };
          DKsupporter.tick(100); const paused = DK.inf.supporterCooldown;
          DK.paused = false; DKsupporter.tick(before.cooldown); const ready = DKsupporter.state().ready;
          const used = DKsupporter.use(), second = DKsupporter.use(); DK.paused = true;
          return { before, paused, ready, used, second, uses: DK.inf.supporterUses, gold: DK.gold };
        });
        check('paused reload does not advance supporter cooldown or grant SP', cooldown.paused, cooldown.before.cooldown);
        check('resumed cooldown recharges exactly one activation', { ready: cooldown.ready, used: cooldown.used, second: cooldown.second, uses: cooldown.uses }, { ready: true, used: true, second: false, uses: cooldown.before.uses + 1 });
        check('supporter SP is credited once after resume', cooldown.gold - cooldown.before.gold, 80 + Math.min(40, expected.towers.reduce((n, t) => n + t.pips, 0)));
        const guards = await page.evaluate(saved => {
          const bad = key => { const p = structuredClone(saved); if (key === 'cooldown') p.inf.supporterCooldown = -1; else p.inf.supporterUses = .5; return DKRUNSAVE.valid(p); };
          const map = key => { const s = structuredClone(saved.inf.growthSnapshot); if (key === 'mastery') s.mastery[1] = 6; else if (key === 'talent') s.talents[1] = 'unknown'; else s.supporter = 'unknown'; return DKPROGRESSION.snapshotValid(s); };
          return [bad('cooldown'), bad('uses'), map('mastery'), map('talent'), map('supporter')];
        }, saved);
        check('malformed tree snapshots and skill state are rejected', guards, [false, false, false, false, false]);
        await page.screenshot({ path: path.join(out, name + '.png') }); check('no uncaught browser errors', errors, []);
        row.pass = true; console.log('PASS tree resume', name, row.checks.length, 'checks');
      } catch (error) { row.failure = error.stack || String(error); await page.screenshot({ path: path.join(out, name + '-failure.png') }).catch(() => {}); throw error; }
      finally { await context.close(); }
    }
    report.pass = true;
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
