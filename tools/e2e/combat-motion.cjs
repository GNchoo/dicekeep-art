const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { launchBrowser, gameUrl } = require('./browser.cjs');
const { motionPreview } = require('./motion-preview.cjs');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'gen/e2e/combat-motion'); fs.mkdirSync(out, { recursive: true });
const hooks = 'Object.assign(window,{A,towerFire,updateVisuals,projHit,draw,buildInfinityWave,spawnEnemy,currentEnemyFrame,epos,enemyMotionPose,enemyFramePlacement,towerSpr,towerVisualEmitter,enemyVisualTarget,refreshDirectionalDemand,VIEW}); Object.defineProperty(window,"LANES",{get:()=>LANES}); window.DK = S;';
async function open(browser, baseline = false, viewport = { width: 1240, height: 860 }) {
  const page = await browser.newPage({ viewport }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const source = baseline ? execFileSync('git', ['show', '2fb8489:game.js'], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  const hook = baseline ? hooks.replace('enemyMotionPose,', '').replace('enemyVisualTarget,', '') : hooks;
  await page.route('**/game.js*', r => r.fulfill({ contentType: 'application/javascript', body: source.replace('window.DK = S;', hook) }));
  await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
  await page.goto(gameUrl()); await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
  return { page, errors };
}
async function combatTrace(page) {
  return page.evaluate(() => {
    DKstartInf('clear'); DK.paused = true; DK.muted = true;
    const rows = [], originalRandom = Math.random;
    try {
      for (const wave of [1, 64, 100]) for (let face = 1; face <= 20; face++) {
        let random = 123456; Math.random = () => ((random = (Math.imul(random, 1664525) + 1013904223) >>> 0) / 4294967296);
        DK.wave = wave; DK.enemies = []; DK.towers = []; DK.projs = []; DK.beams = []; DK.fxs = []; DK.spawnQ = []; DK.texts = [];
        spawnEnemy(buildInfinityWave(wave)[0]); const e = DK.enemies[0]; e.dist = (LANES[0].loopAt || 0) + 220; e.hp = e.max = 1e12; e.entranceT = -1;
        const p = epos(e), t = { face, def: DKTD[face], lvl: 2, spot: 0, x: p.x + 35, y: p.y + 25, cd: 0, skin: 0 };
        DK.towers = [t]; let firstHit = null; const checkpoints = [];
        for (let step = 0; step < 360; step++) {
          towerFire(t, 1 / 60); updateVisuals(1 / 60);
          if (firstHit === null && e.hp < e.max) firstHit = step;
          if (step % 60 === 59) checkpoints.push({ hp: e.hp, cd: t.cd, slow: e.slowT, stun: e.stunT,
            projectiles: DK.projs.map(p => [p.x, p.y, p.dmg, p.spd]), rng: random });
        }
        rows.push({ wave, face, firstHit, checkpoints });
      }
    } finally { Math.random = originalRandom; DK.enemies = []; DK.towers = []; DK.phase = 'title'; }
    return rows;
  });
}
(async () => {
  const browser = await launchBrowser(), report = { passed: false, baseline: '2fb8489', checks: [] };
  try {
    const old = await open(browser, true), expected = await combatTrace(old.page); assert.deepEqual(old.errors, []); await old.page.close();
    const current = await open(browser), actual = await combatTrace(current.page);
    assert.deepEqual(actual, expected); assert.ok(actual.every(r => r.firstHit !== null));
    report.combatCases = actual.length; report.checks.push('60 actual attack cases match previous damage, first-hit tick, cooldown, slow/stun, projectile coordinates and RNG');
    const page = current.page;
    report.pixels = await page.evaluate(async () => {
      const art = INF_DIRECTIONAL_ART.entries.b100, v = art.views.side;
      const image = new Image(); image.src = v.still; await image.decode();
      const source = document.createElement('canvas'); source.width = source.height = v.cell; source.getContext('2d').drawImage(image, 0, 0);
      const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d');
      const h = 210, scale = h / art.referenceHeight, place = { x: -v.pivot[0] * scale, y: -v.pivot[1] * scale, w: v.cell * scale, h: v.cell * scale };
      const hash = data => { let n = 2166136261; for (const b of data) n = Math.imul(n ^ b, 16777619); return n >>> 0; };
      const feet = [], chest = [], heads = [];
      for (let i = 0; i < 8; i++) {
        g.clearRect(0, 0, 300, 300); g.save(); g.translate(150, 270);
        DKMOTION.paintEnemy(g, source, place, { height: h, phase: i / 8, gait: 'legged', view: 'side' }); g.restore();
        feet.push(hash(g.getImageData(0, 252, 300, 22).data)); chest.push(hash(g.getImageData(0, 115, 300, 50).data)); heads.push(hash(g.getImageData(0, 42, 300, 45).data));
      }
      let allocations = 0; const create = document.createElement;
      document.createElement = function (...args) { allocations++; return create.apply(this, args); };
      try { for (let i = 0; i < 20; i++) DKMOTION.paintEnemy(g, source, place, { height: h, phase: i / 20, gait: 'legged', view: 'side' }); }
      finally { document.createElement = create; }
      // Exercise every actual authored profile, with exact loop and foot anchors.
      const identities = [...Object.values(INF_DIRECTIONAL_ART.entries), ...Object.values(INF_EXTREME_ART.entries)];
      let maxOffset = 0;
      for (const e of identities) for (const view of ['side', 'front', 'back']) for (let i = 0; i < 32; i++) for (const y of [0, -20, -60, -100, -140]) {
        const pose = { height: 140, phase: i / 32, gait: e.locomotion, view }, xy = DKMOTION.enemyOffset(y, pose);
        if (!xy.every(Number.isFinite)) throw Error('invalid pose ' + e.assetId);
        if (e.locomotion === 'legged' && y === 0 && xy.some(x => x !== 0)) throw Error('foot drift');
        maxOffset = Math.max(maxOffset, ...xy.map(Math.abs));
      }
      return { feet, chest, heads, allocations, identities: identities.length, maxOffset };
    });
    assert.equal(new Set(report.pixels.feet).size, 1); assert.ok(new Set(report.pixels.chest).size >= 6); assert.ok(new Set(report.pixels.heads).size >= 6);
    assert.equal(report.pixels.allocations, 0); assert.equal(report.pixels.identities, 221); assert.ok(report.pixels.maxOffset < 6);
    report.checks.push('Same source pose: chest and head change while foot pixels stay fixed; all221 profiles finite; no canvas allocation in skin rendering');
    report.towers = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = c.height = 180; const g = c.getContext('2d'), rows = [];
      const hash = data => { let n = 2166136261; for (const b of data) n = Math.imul(n ^ b, 16777619); return n >>> 0; };
      for (let face = 1; face <= 20; face++) {
        const sp = towerSpr(face, 0), t = { face, def: DKTD[face], x: 90, y: 150, shotSerial: 1, attackAim: -2, cd: .5 }, base = [], mechanism = [], baseDiff = []; let basePixels;
        for (const age of [1, .035, .09, .18, .29]) {
          t.attackAge = age; g.clearRect(0, 0, 180, 180); g.save(); g.translate(90, 156); DKMOTION.paintTower(g, t, sp, DKCONTENT.STAR_TOWER_EMITTERS[face]); g.restore();
          const pixels = g.getImageData(0, 148, 180, 30).data; base.push(hash(pixels)); if (!basePixels) basePixels = pixels; else { let changed = 0, max = 0; for(let i=0;i<pixels.length;i++) if(pixels[i] !== basePixels[i]) { changed++; max=Math.max(max,Math.abs(pixels[i]-basePixels[i])); } baseDiff.push({changed,max}); } mechanism.push(hash(g.getImageData(0, 0, 180, 145).data));
        }
        rows.push({ face, base, baseDiff, mechanism, emitter: towerVisualEmitter(t), family: DKMOTION.family(face) });
      }
      return rows;
    });
    for (const t of report.towers) { assert.ok(t.baseDiff.every(d => d.max <= 1 && d.changed <= 4), 'stationary base (one-channel GPU rounding) ' + t.face); assert.ok(new Set(t.mechanism).size >= 3, 'attack mechanism ' + t.face); }
    report.checks.push('All20 towers have changing attack mechanisms and stationary foundations (at most one pixel/channel rounding)');
    // Review assets are exported separately, not retained by the game renderer.
    const gallery = await page.evaluate(async () => {
      const actors = [];
      for (const [wave, role] of [[1, 0], [4, 0], [35, 0], [80, 0], [100, 0], [100, 1], [171, 0], [201, 0]]) {
        const a = DKCONTENT.INFINITY.directionalArt(wave, role), e = a.entry, views = {};
        for (const [view, v] of Object.entries(e.views)) {
          const image = new Image(); image.src = v.sheet; await image.decode(); const frames = []; const bounds=[v.cell,v.cell,0,0];
          const c = document.createElement('canvas'); c.width = c.height = v.cell; const g = c.getContext('2d');
          for (let i = 0; i < v.frames; i++) { g.clearRect(0, 0, v.cell, v.cell); g.drawImage(image, i % v.cols * v.cell, Math.floor(i / v.cols) * v.cell, v.cell, v.cell, 0, 0, v.cell, v.cell); const px=g.getImageData(0,0,v.cell,v.cell).data; for(let y=0;y<v.cell;y++)for(let x=0;x<v.cell;x++)if(px[(y*v.cell+x)*4+3]>28){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x+1);bounds[3]=Math.max(bounds[3],y+1);} frames.push(c.toDataURL('image/webp', .87)); }
          views[view] = { frames, bounds, cell: v.cell, pivot: v.pivot, referenceHeight: e.referenceHeight * (v.scale || 1) };
        }
        actors.push({ id: a.assetId, name: a.name, gait: e.locomotion, views });
      }
      const towers = [];
      for (let face = 1; face <= 20; face++) { const sp = towerSpr(face, 0); towers.push({ face, name: DKTD[face].name, w: sp.w, h: sp.h, cx: sp.cx, baseY: sp.baseY, image: sp.cv.toDataURL(), port: DKCONTENT.STAR_TOWER_EMITTERS[face] }); }
      const legacy={};for(const key of ['shell','bolt','frostShard','dieBomb','laserBeam','lightningArc','cannonBlast','arcaneBurst','frostBurst','dieExplode']){const pack=Array.isArray(A[key])?A[key]:[A[key]];legacy[key]=pack.filter(x=>x?.cv).map(x=>x.cv.toDataURL('image/webp',.9));} return { actors, towers, legacy };
    });
    fs.writeFileSync(path.join(out, 'preview.html'), motionPreview(gallery, fs.readFileSync(path.join(root, 'combat-motion.js'), 'utf8')));
    assert.deepEqual(current.errors, []); await page.close();
    report.checks.push('Exported interactive before/after preview from actual checked-in frames and20 current tower sprites');
    // Actual game draw workload, with resident art, 200 actors and 15 firing towers.
    report.performance = [];
    for (const [tag, viewport] of [['phone', { width: 440, height: 956 }], ['desktop', { width: 1240, height: 860 }]]) {
      const p = await open(browser, false, viewport);
      await p.page.evaluate(() => {
        DKstartInf('clear'); DK.paused = true; DK.muted = true; DK.spawnQ = []; DK.waveActive = false; DK.wave = 100; DK.autoT = 999;
        const waves = [1, 4, 35, 64, 80, 100];
        for (let i = 0; i < 200; i++) { const wave = waves[i % waves.length]; spawnEnemy(buildInfinityWave(wave)[0]); const e = DK.enemies.at(-1); e.dist = (LANES[0].loopAt || 0) + (LANES[0].len - (LANES[0].loopAt || 0)) * (i / 200); e.entranceT = -1; e.hp = e.max = 1e12; }
        DK.towers = Array.from({ length: 15 }, (_, i) => { const e = DK.enemies[i * 12], p = epos(e), face = i % 20 + 1; return { face, def: DKTD[face], lvl: 1, spot: i, x: p.x + 28, y: p.y + 18, skin: 0, cd: 0 }; });
        DK.fxs = []; DK.texts = []; DK.corpses = []; DK.shakeT = 0; DK.bannerT = 0; refreshDirectionalDemand(true);
      });
      await p.page.waitForFunction(() => !DKART.state().running, null, { timeout: 60000 });
      const perf = await p.page.evaluate(() => {
        const times = [];
        for (let i = 0; i < 150; i++) { const a = performance.now(); for (const e of DK.enemies) { e.animT += 1 / 60; e.artWalkDistance += .4; } for (const t of DK.towers) towerFire(t, 1 / 60); updateVisuals(1 / 60); draw(); if (i >= 30) times.push(performance.now() - a); }
        times.sort((a, b) => a - b); return { actors: DK.enemies.length, towers: DK.towers.length, p50: times[Math.floor(times.length * .5)], p95: times[Math.floor(times.length * .95)], cache: DKART.state().peakTrackedBytes, errors: DKART.state().failures, projectiles: DK.projs.length, effects: DK.fxs.length };
      });
      assert.equal(perf.actors, 200); assert.equal(perf.towers, 15); assert.equal(perf.errors, 0); assert.ok(perf.cache <= 96 * 1024 * 1024); assert.deepEqual(p.errors, []);
      report.performance.push({ tag, ...perf }); await p.page.screenshot({ path: path.join(out, `battle-${tag}.png`) }); await p.page.close();
    }
    report.checks.push('200 actors +15 towers render on both viewports with no page/art errors and96MiB tracked cache');
    report.passed = true;
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log('PASS combat motion:', report.combatCases, 'combat cases;', report.performance);
})().catch(e => { console.error(e); process.exitCode = 1; });
