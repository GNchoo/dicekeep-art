// Actual game functions and decoded checked-in PNGs for three review regressions.
// E2E_BASE_URL=http://127.0.0.1:8137 node tools/e2e/directional-review-regressions.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..');
process.env.E2E_OUTPUT_DIR ||= path.join(repo, 'gen/e2e/directional-review');

(async () => {
  const browser = await launchBrowser(), report = { pass: false, errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 440, height: 956 } });
    page.on('pageerror', e => report.errors.push(e.message));
    await page.route('**/game.js*', route => {
      const source = fs.readFileSync(path.join(repo, 'game.js'), 'utf8');
      const hook = 'Object.assign(window,{buildInfinityWave,spawnEnemy,directionalPhase,currentEnemyFrame,mpViewBuild,mpViewAdvance,update,VIEW}); Object.defineProperty(window,"LANES",{get:()=>LANES});\n';
      return route.fulfill({ contentType: 'application/javascript', body: source.replace('window.DK = S;', hook + 'window.DK = S;') });
    });
    await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
    report.flight = await page.evaluate(() => {
      DKstartInf('clear'); DK.paused = true; DK.muted = true; DK.spawnQ = []; DK.waveActive = false; DK.autoT = 999; DK.towers = [];
      const originalNow = Object.getOwnPropertyDescriptor(performance, 'now'), rows = [];
      // Freeze only the summary arrival clock so source-distance estimates are deterministic.
      let stamp = 100000;
      Object.defineProperty(performance, 'now', { configurable: true, value: () => stamp });
      try {
        for (const wave of [4, 12, 52]) for (const pathRatio of [.6, 1, 1.8]) for (const speed of [1, 3]) for (const status of ['normal', 'slow', 'stun']) {
          DK.net = null; VIEW.pid = null; VIEW.enemies = []; DK.wave = wave; DK.enemies = []; DK.spawnQ = [];
          spawnEnemy(buildInfinityWave(wave)[0]);
          const e = DK.enemies[0], entry = DKART.entry(e.artAssetId), cycle = entry.cycleSeconds;
          e.animT = cycle / 4; e.dist = 400; e.entranceT = -1;
          e.stunT = status === 'stun' ? 3 : 0; e.slowT = status === 'slow' ? 3 : 0; e.slowPct = .5;
          const sourceVelocity = status === 'stun' ? 0 : e.def.speed * e.spdMult * speed * (status === 'slow' ? .5 : 1);
          const sourceLength = Math.round(LANES[0].len / pathRatio), k = LANES[0].len / sourceLength;
          const i = DKCONTENT.bases.findIndex(b => b.id === e.type);
          DK.net = { rivals: { peer: {} }, status: 'alive' }; VIEW.pid = 'peer';
          const sum = { w: wave, sp: speed, o: 'p', ll: sourceLength, l: 20, f: 1, tw: [] };
          mpViewBuild({ ...sum, en: `${i},${400 - Math.round(sourceVelocity)},9,${e.appearanceCode},64` });
          stamp += 1000;
          mpViewBuild({ ...sum, en: `${i},400,9,${e.appearanceCode},64` });
          const v = VIEW.enemies[0];
          e.animT = cycle / 4; v.viewPhase = .25; v.viewPhaseCorrection = 0;
          const before = { distance: e.dist, phase: directionalPhase(e), hp: e.hp };
          const dt = .02;
          for (let step = 0; step < speed; step++) update(dt);
          mpViewAdvance(dt);
          rows.push({ wave, status, speed, sourceScale: k, sourceVelocity, measuredSourceVelocity: v.viewSpeed / k,
            localPhaseAdvance: DKappearance.phaseError(directionalPhase(e), before.phase),
            spectatorPhaseAdvance: DKappearance.phaseError(v.viewPhase, .25),
            localDistance: e.dist - before.distance, expectedDistance: sourceVelocity * dt,
            hpUnchanged: e.hp === before.hp, tolerance: dt / 38 / cycle + 1e-10 });
        }
      } finally {
        if (originalNow) Object.defineProperty(performance, 'now', originalNow); else delete performance.now;
        VIEW.pid = null; VIEW.enemies = []; DK.net = null;
      }
      return rows;
    });
    assert.equal(report.flight.length, 54);
    for (const row of report.flight) {
      assert.ok(Math.abs(row.localPhaseAdvance - row.spectatorPhaseAdvance) <= row.tolerance, JSON.stringify(row));
      assert.ok(Math.abs(row.localDistance - row.expectedDistance) < 1e-8, JSON.stringify(row));
      assert.equal(row.hpUnchanged, true);
      if (row.status === 'stun') { assert.equal(row.localPhaseAdvance, 0); assert.equal(row.spectatorPhaseAdvance, 0); }
    }
    report.cycles = await page.evaluate(() => {
      const rows = [];
      for (const wave of [10, 20, 111, 121, 212]) {
        DK.wave = wave; DK.enemies = [];
        const queue = buildInfinityWave(wave);
        for (const item of queue) spawnEnemy(item);
        const actors = DK.enemies.map((e, i) => ({ role: e.bossRole, id: e.artAssetId, code: e.appearanceCode,
          frameId: currentEnemyFrame(e)?.assetId, draw: e.drawHeight, name: e.name,
          physicsMatchesQueue: e.type === queue[i].type && e.hp === e.def.hp * queue[i].hpMult && e.spdMult === queue[i].spdMult && e.gold === Math.round(e.def.gold * queue[i].goldMult) }));
        if (wave === 111 || wave === 212) {
          DK.net = { rivals: { peer: {} }, status: 'alive' }; VIEW.pid = 'peer'; VIEW.enemies = [];
          const e = DK.enemies[1], i = DKCONTENT.bossBases.findIndex(b => b.id === e.type);
          mpViewBuild({ w: wave, sp: 1, o: 'p', ll: LANES[0].len, l: 20, f: 1, tw: [], en: `${1000 + i},400,9,111,64` });
          const v = VIEW.enemies[0]; rows.push({ wave, actors, spectator: { role: v.bossRole, id: v.artAssetId, frameId: currentEnemyFrame(v)?.assetId, name: v.name, draw: v.drawHeight } });
          VIEW.pid = null; VIEW.enemies = []; DK.net = null;
        } else rows.push({ wave, actors });
      }
      DK.phase = 'title'; DK.enemies = []; return rows;
    });
    for (const row of report.cycles) {
      assert.equal(row.actors.length, row.wave === 10 ? 1 : 2);
      assert.ok(row.actors.every(e => e.physicsMatchesQueue && e.id === e.frameId));
      if (row.spectator) {
        assert.equal(row.actors[1].role, 1); assert.equal(row.actors[1].id, 'b010');
        assert.equal(row.spectator.id, 'b010'); assert.equal(row.spectator.frameId, 'b010'); assert.equal(row.spectator.role, 1);
        assert.ok(Math.abs(row.actors[1].draw / row.actors[0].draw - .7) < 1e-12);
        assert.equal(row.spectator.draw, row.actors[1].draw); assert.match(row.actors[1].name, /부관/);
      }
    }
    report.recovery = await page.evaluate(async () => {
      let now = 0, fail = false;
      const cache = DKappearance.create({ manifest: { version: INF_DIRECTIONAL_ART.version, entries: { w001: INF_DIRECTIONAL_ART.entries.w001 } },
        base: new URL('.', location.href).href, now: () => now,
        loadImage: (url, record) => {
          if (record.kind === 'sheet' && fail) return Promise.reject(Error('injected temporary network failure'));
          return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(Error('actual PNG failed to load')); im.src = url; });
        } });
      const settle = async () => { for (let i = 0; i < 1500; i++) { if (!cache.state().running) return; await new Promise(r => setTimeout(r, 10)); } throw Error('cache did not settle'); };
      const sheet = () => cache.state().records.find(r => r.key === 'w001:side:sheet');
      try {
        await cache.init();
        for (let i = 0; i < 3; i++) { cache.demand([{ id: 'w001', view: 'side' }]); await settle(); if (sheet().status !== 'ready') throw Error('real PNG reload failed'); cache.demand([]); }
        fail = true; cache.demand([{ id: 'w001', view: 'side' }]); await settle(); const failed = sheet();
        fail = false; now += 31000; cache.demand([{ id: 'w001', view: 'side' }]); await settle();
        const frame = cache.frame('w001', 'side', .5);
        return { failed, recovered: sheet(), frame: { key: frame.cacheKey, width: frame.cv.width }, state: cache.state() };
      } finally { cache.dispose(); }
    });
    assert.equal(report.recovery.failed.attempts, 4); assert.equal(report.recovery.failed.consecutiveFailures, 1);
    assert.equal(report.recovery.recovered.status, 'ready'); assert.equal(report.recovery.recovered.consecutiveFailures, 0);
    assert.equal(report.recovery.recovered.attempts, 5); assert.match(report.recovery.frame.key, /:sheet$/);
    assert.ok(report.recovery.state.peakTrackedBytes <= 96 * 1024 * 1024); assert.equal(report.recovery.state.maxRunning, 2);
    assert.deepEqual(report.errors, []); report.pass = true;
    console.log('PASS 54 flight/float cadence cases, five boss-cycle rosters, real-PNG cache recovery; pageerrors0');
  } finally {
    fs.writeFileSync(outputPath('directional-review-regressions.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
