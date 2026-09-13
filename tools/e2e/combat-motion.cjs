const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { launchBrowser, gameUrl } = require('./browser.cjs');
const { motionPreview } = require('./motion-preview.cjs');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'gen/e2e/combat-motion'); fs.mkdirSync(out, { recursive: true });
const hooks = 'Object.assign(window,{A,paintTowerBody,TS_CX,TS_BASE_Y,towerFire,updateVisuals,projHit,draw,buildInfinityWave,spawnEnemy,currentEnemyFrame,epos,enemyFramePlacement,towerSpr,towerVisualEmitter,refreshDirectionalDemand,VIEW}); Object.defineProperty(window,"LANES",{get:()=>LANES}); window.DK = S;';
async function open(browser, baseline = false, viewport = { width: 1240, height: 860 }) {
  const page = await browser.newPage({ viewport }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const source = baseline ? execFileSync('git', ['show', '2fb8489:game.js'], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  const hook = hooks;
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
      const rows = [], hash = data => { let n = 2166136261; for (const b of data) n = Math.imul(n ^ b, 16777619); return n >>> 0; };
      // Ground boss, flight boss and ordinary walker: every original frame in
      // all three directions must survive rendering without any geometric filter.
      for (const id of ['b100', 'b100-2', 'w001']) for (const view of ['side', 'front', 'back']) {
        const art = INF_DIRECTIONAL_ART.entries[id], v = art.views[view];
        const image = new Image(); image.src = v.sheet; await image.decode();
        const source = document.createElement('canvas'); source.width = source.height = v.cell; const sg = source.getContext('2d');
        // Readback must use the same CPU rasterizer on the first and later draws.
        const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d', { willReadFrequently: true });
        const scale = 180 / (art.referenceHeight * (v.scale || 1)), place = { x: -v.pivot[0] * scale, y: -v.pivot[1] * scale, w: v.cell * scale, h: v.cell * scale };
        const frames = [];
        for (let i = 0; i < v.frames; i++) {
          sg.clearRect(0, 0, v.cell, v.cell); sg.drawImage(image, i % v.cols * v.cell, Math.floor(i / v.cols) * v.cell, v.cell, v.cell, 0, 0, v.cell, v.cell);
          const render = wrapped => {
            g.clearRect(0, 0, 300, 300); g.save(); g.translate(150, 270);
            if (wrapped) DKMOTION.paintEnemy(g, source, place);
            else g.drawImage(source, place.x, place.y, place.w, place.h);
            g.restore(); return hash(g.getImageData(0, 0, 300, 300).data);
          };
          frames.push({ original: render(false), current: render(true) });
        }
        rows.push({ id, view, frames });
      }
      return rows;
    });
    for (const row of report.pixels) {
      assert.ok(new Set(row.frames.map(f => f.original)).size > 1, 'authored animation still varies: ' + row.id + ':' + row.view);
      for (const f of row.frames) assert.equal(f.current, f.original, 'unwarped original pixels: ' + row.id + ':' + row.view);
    }
    report.checks.push('Ground/flight W100 bosses and W1 walker: original frame pixels unchanged in all3 directions; authored animation still advances');
    const originalTowerSource = execFileSync('git', ['show', '2fb8489:game.js'], { cwd: root, encoding: 'utf8' });
    const originalTower = originalTowerSource.slice(originalTowerSource.indexOf('function paintTowerBody('), originalTowerSource.indexOf('function towerVisualEmitter(')).trim();
    report.towers = await page.evaluate(original => {
      const c = document.createElement('canvas'); c.width = c.height = 180; const g = c.getContext('2d', { willReadFrequently: true }), rows = [];
      const before = new Function('ctx', 'TS_CX', 'TS_BASE_Y', 'return (' + original + ');')(g, TS_CX, TS_BASE_Y);
      const after = new Function('ctx', 'TS_CX', 'TS_BASE_Y', 'MOTION', 'DKCONTENT', 'return (' + paintTowerBody.toString() + ');')(g, TS_CX, TS_BASE_Y, DKMOTION, DKCONTENT);
      const hash = data => { let n = 2166136261; for (const b of data) n = Math.imul(n ^ b, 16777619); return n >>> 0; };
      for (let face = 1; face <= 20; face++) for (let skin = 0; skin < 3; skin++) {
        const sp = towerSpr(face, skin), t = { face, def: DKTD[face], skin, x: 90, y: 150, shotSerial: 1 }, poses = [];
        const render = painter => { g.clearRect(0, 0, 180, 180); g.save(); g.translate(90, 156); painter(t, sp); g.restore(); return hash(g.getImageData(0, 0, 180, 180).data); };
        for (const kick of [0, .25, .6, 1]) { t.kick = kick; t.muzzleAge = 1; poses.push({ kick, original: render(before), current: render(after) }); }
        t.kick = .8; t.muzzleAge = .03; const lit = render(after); t.muzzleAge = .3; const expired = render(after), baseline = render(before);
        rows.push({ face, skin, poses, lit, expired, baseline });
      }
      return rows;
    }, originalTower);
    for (const t of report.towers) {
      for (const p of t.poses) assert.equal(p.current, p.original, 'original tower/recoil ' + t.face + ':' + t.skin);
      assert.notEqual(t.lit, t.baseline, 'muzzle light appears ' + t.face + ':' + t.skin);
      assert.equal(t.expired, t.baseline, 'no lingering overlay ' + t.face + ':' + t.skin);
    }
    report.checks.push('20 towers ×3 skins match original body/recoil at4 kick values; muzzle-only light appears and expires');
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
      for (let face = 1; face <= 20; face++) { const sp = towerSpr(face, 0); towers.push({ face, name: DKTD[face].name, color: DKTD[face].color, w: sp.w, h: sp.h, cx: sp.cx, baseY: sp.baseY, image: sp.cv.toDataURL(), port: DKCONTENT.STAR_TOWER_EMITTERS[face] }); }
      const legacy={};for(const key of ['shell','bolt','frostShard','dieBomb','laserBeam','lightningArc','cannonBlast','arcaneBurst','frostBurst','dieExplode']){const pack=Array.isArray(A[key])?A[key]:[A[key]];legacy[key]=pack.filter(x=>x?.cv).map(x=>x.cv.toDataURL('image/webp',.9));} return { actors, towers, legacy };
    });
    fs.writeFileSync(path.join(out, 'preview.html'), motionPreview(gallery, fs.readFileSync(path.join(root, 'combat-motion.js'), 'utf8'), originalTower));
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
