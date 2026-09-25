// The portrait arena must be the same battle rotated clockwise, including
// tower cells, enemy ring progress, and the range used by real targeting.
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');

const SCALE = 1.4;
const ENTRY = 96;
const EPS = 1e-6;
const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < EPS, `${label}: ${actual} != ${expected}`);
const center = spots => [
  spots.reduce((sum, p) => sum + p[0], 0) / spots.length,
  spots.reduce((sum, p) => sum + p[1], 0) / spots.length,
];
const rotate = (point, from, to) => [
  to[0] - (point[1] - from[1]) * SCALE,
  to[1] + (point[0] - from[0]) * SCALE,
];
const portraitIndex = landIndex => 3 * (landIndex % 5) + 2 - Math.floor(landIndex / 5);

function checkGeometry(name, land, portrait) {
  const lc = center(land.spots), pc = center(portrait.spots);
  assert.equal(land.spots.length, 15, `${name} landscape cells`);
  assert.equal(portrait.spots.length, 15, `${name} portrait cells`);
  assert.equal(land.ring.length, portrait.ring.length, `${name} ring vertex count`);
  near(land.loopAt, ENTRY, `${name} landscape entry length`);
  near(portrait.loopAt, ENTRY * SCALE, `${name} portrait entry length`);
  assert.deepEqual(land.portals, [land.path[0]], `${name} landscape portal marks actual spawn`);
  assert.deepEqual(portrait.portals, [portrait.path[0]], `${name} portrait portal marks actual spawn`);
  assert.deepEqual(land.path[0], land.entry[0], `${name} landscape road starts at spawn`);
  assert.deepEqual(portrait.path[0], portrait.entry[0], `${name} portrait road starts at spawn`);
  for (let i = 0; i < 2; i++) {
    const expected = rotate(land.entry[i], lc, pc), actual = portrait.entry[i];
    near(actual[0], expected[0], `${name} entry ${i} x`);
    near(actual[1], expected[1], `${name} entry ${i} y`);
  }
  for (let i = 0; i < 15; i++) {
    const expected = rotate(land.spots[i], lc, pc), actual = portrait.spots[portraitIndex(i)];
    near(actual[0], expected[0], `${name} cell ${i} x`);
    near(actual[1], expected[1], `${name} cell ${i} y`);
  }
  for (let i = 0; i < land.ring.length; i++) {
    const expected = rotate(land.ring[i], lc, pc), actual = portrait.ring[i];
    near(actual[0], expected[0], `${name} ring ${i} x`);
    near(actual[1], expected[1], `${name} ring ${i} y`);
  }
  near(portrait.board.w, land.board.h * SCALE, `${name} board width`);
  near(portrait.board.h, land.board.w * SCALE, `${name} board height`);
  near(portrait.track.R - portrait.track.L, (land.track.B - land.track.T) * SCALE, `${name} track width`);
  near(portrait.track.B - portrait.track.T, (land.track.R - land.track.L) * SCALE, `${name} track height`);
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1240, height: 860 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  try {
    await page.route('**/game.js*', async route => {
      const response = await route.fetch(), source = await response.text();
      const anchor = 'window.DK = S;';
      assert.ok(source.includes(anchor), 'game closure hook exists');
      const groundAnchor = 'function drawGroundSprite(g, sp, x, y, h, flip) {';
      assert.equal(source.split(groundAnchor).length, 2, 'one sprite draw hook anchor');
      const drawProbe = groundAnchor + ' if (window.__arenaQA && sp === A.tl_arena_start) window.__arenaQA.portalDraws.push({x,y,h,flip:!!flip});';
      const hook = 'window.__arenaQA={remapSpot,towerRange,arenaWorldScale:typeof arenaWorldScale==="function"?arenaWorldScale:()=>NaN,arenaCanvasForScreen,canvasDims:()=>[W,H],relayoutArena,laneLen,posAt,draw,spawnEnemy,buildInfinityWave,towerFire,update,updateVisuals,mpSummary,mpViewBuild,mpViewAdvance,VIEW,SPOTS:()=>SPOTS,LANES:()=>LANES,startArt:()=>A.tl_arena_start,portalDraws:[]}; window.DK = S;';
      await route.fulfill({ response, body: source.replace(groundAnchor, drawProbe).replace(anchor, hook) });
    });
    await page.addInitScript(() => {
      localStorage.setItem('dk_coachDone', '1');
      localStorage.setItem('dk_infHelpSeen', '1');
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });

    // Different canvas sizes and safe-area shifts must change only the center.
    const pairs = await page.evaluate(() => {
      const C = DKCONTENT;
      const pair = (lw, lh, li, pw, ph, pi) => {
        const a = C.buildArenaLayout(lw, lh, li), b = C.buildArenaLayoutPortrait(pw, ph, pi);
        return [a, b].map(x => ({ spots: x.spots, ring: x.roads[1], entry: x.roads[0], path: x.path,
          portals: x.portals, loopAt: x.loopAt, board: x.board, track: x.track }));
      };
      return [
        pair(1024, 576, {}, 720, 1080, {}),
        pair(1440, 576, { top: 40, bottom: 0 }, 900, 1200, { top: 92, bottom: 24 }),
        pair(680, 576, {}, 720, 880, {}),
      ];
    });
    checkGeometry('default', ...pairs[0]);
    checkGeometry('shifted canvas', ...pairs[1]);
    checkGeometry('compact canvas', ...pairs[2]);
    assert.notDeepEqual(center(pairs[0][0].spots), center(pairs[1][0].spots), 'landscape center actually shifts');
    assert.notDeepEqual(center(pairs[0][1].spots), center(pairs[1][1].spots), 'portrait center actually shifts');

    const remap = await page.evaluate(() => {
      DKstartInf('clear'); DK.paused = true; DK.muted = true;
      const QA = __arenaQA;
      if (DK.mapKey !== 'cInf') throw Error(`expected desktop arena, got ${DK.mapKey}`);
      window.__arenaProbe = () => {
        const QA = __arenaQA;
        const ranges = Array.from({ length: 6 }, (_, i) => QA.towerRange({ face: i + 1, lvl: 1, def: DKTD[i + 1] }));
        // Exercise towerFire itself. Reading a ring point is insufficient if
        // acquisition uses an unscaled sprite offset or a different radius.
        DK.towers = []; DK.enemies = [];
        QA.spawnEnemy(QA.buildInfinityWave(1)[0]);
        const enemy = DK.enemies[0], lane = QA.LANES()[0], spots = QA.SPOTS();
        enemy.move = 'ground'; enemy.hp = enemy.max = 1e12;
        const hits = [];
        for (let cell = 0; cell < 15; cell++) {
          const t = { face: 1, lvl: 1, def: DKTD[1], spot: cell, x: spots[cell][0], y: spots[cell][1], skin: 0, cd: 0 };
          DK.towers = [t];
          const row = [];
          for (let j = 0; j < 96; j++) {
            enemy.dist = lane.loopAt + (j + 0.5) / 96 * (lane.len - lane.loopAt);
            enemy.dead = false; enemy.hidden = false; enemy.hp = 1e12;
            t.cd = 0;
            QA.towerFire(t, 0);
            row.push(t.cd > 0);
            DK.beams = []; DK.projs = []; DK.fxs = []; DK.texts = [];
          }
          hits.push(row);
        }
        return { mapKey: DK.mapKey, ranges, scale: QA.arenaWorldScale(), hits };
      };
      return Array.from({ length: 15 }, (_, i) => [
        QA.remapSpot('cInf', 'cInfP', i), QA.remapSpot('cInfP', 'cInf', 3 * (i % 5) + 2 - Math.floor(i / 5)),
      ]);
    });
    const landscape = await page.evaluate(() => __arenaProbe());
    await page.setViewportSize({ width: 440, height: 956 });
    await page.waitForFunction(() => DK.mapKey === 'cInfP');
    const portrait = await page.evaluate(() => __arenaProbe());

    await page.setViewportSize({ width: 1240, height: 860 });
    await page.waitForFunction(() => DK.mapKey === 'cInf');
    // Keep three distinct occupied cells and one enemy already on the ring
    // through both direction changes. Entry and ring have different lengths.
    const before = await page.evaluate(() => {
      const QA = __arenaQA;
      DK.enemies = []; DK.towers = []; DK.projs = []; DK.gold = 100000;
      for (const cell of [0, 7, 14]) { DK.heldDie = 1; if (!DKplace(cell)) throw Error(`placement ${cell} rejected`); }
      QA.spawnEnemy(QA.buildInfinityWave(1)[0]);
      const e = DK.enemies[0], lane = QA.LANES()[0];
      e.dist = lane.loopAt + 0.371 * (lane.len - lane.loopAt);
      const src = DK.towers.find(t => t.spot === 7);
      DK.projs.push({ kind: 'shell', x: src.x + 13, y: src.y - 17, spd: 240, splash: 85, rot: 0,
        src, tgt: e, trail: [[src.x, src.y]], visualAge: 0 });
      return { phase: (e.dist - lane.loopAt) / (lane.len - lane.loopAt), spots: DK.towers.map(t => t.spot),
        pure: DK.inf.growthSnapshot?.growth === false,
        projectile: { offset: [DK.projs[0].x - src.x, DK.projs[0].y - src.y], spd: DK.projs[0].spd, splash: DK.projs[0].splash } };
    });
    await page.setViewportSize({ width: 440, height: 956 });
    await page.waitForFunction(() => DK.mapKey === 'cInfP');
    const after = await page.evaluate(() => {
      const QA = __arenaQA, e = DK.enemies[0], lane = QA.LANES()[0];
      const p = DK.projs[0], src = DK.towers.find(t => t.spot === 7);
      return { phase: (e.dist - lane.loopAt) / (lane.len - lane.loopAt), spots: DK.towers.map(t => t.spot),
        placed: DK.towers.every(t => { const sp = QA.SPOTS()[t.spot]; return Math.hypot(t.x - sp[0], t.y - sp[1]) < 1e-7; }),
        projectile: p && { count: DK.projs.length, offset: [p.x - src.x, p.y - src.y], spd: p.spd, splash: p.splash,
          source: p.src === src, target: p.tgt === e, trails: p.trail.length } };
    });
    await page.setViewportSize({ width: 1240, height: 860 });
    await page.waitForFunction(() => DK.mapKey === 'cInf');
    const back = await page.evaluate(() => {
      const QA = __arenaQA, e = DK.enemies[0], lane = QA.LANES()[0];
      const p = DK.projs[0], src = DK.towers.find(t => t.spot === 7);
      return { phase: (e.dist - lane.loopAt) / (lane.len - lane.loopAt), spots: DK.towers.map(t => t.spot),
        projectile: p && { count: DK.projs.length, offset: [p.x - src.x, p.y - src.y], spd: p.spd, splash: p.splash,
          source: p.src === src, target: p.tgt === e } };
    });

    for (let i = 0; i < 15; i++) {
      assert.equal(remap[i][0], portraitIndex(i), `clockwise cell ${i}`);
      assert.equal(remap[i][1], i, `inverse cell ${i}`);
    }
    assert.equal(landscape.mapKey, 'cInf');
    assert.equal(portrait.mapKey, 'cInfP');
    near(landscape.scale, 1, 'landscape world scale');
    near(portrait.scale, SCALE, 'portrait world scale');
    assert.deepEqual(portrait.ranges, landscape.ranges, 'tower ranges remain equal in logical units');
    for (let i = 0; i < 15; i++)
      assert.deepEqual(portrait.hits[portraitIndex(i)], landscape.hits[i], `cell ${i} attacks the same ring phases`);
    assert.deepEqual(before.spots, [0, 7, 14]);
    assert.ok(before.pure, 'fixture is a pure-luck run without account growth');
    assert.deepEqual(after.spots, [2, 7, 12], 'three occupied cells rotate clockwise');
    assert.ok(after.placed, 'tower coordinates follow remapped cells');
    near(after.phase, before.phase, 'enemy ring phase after clockwise turn');
    assert.equal(after.projectile?.count, 1, 'pure-luck shot survives portrait turn');
    assert.ok(after.projectile.source && after.projectile.target, 'shot retains live source and target');
    near(after.projectile.offset[0], -before.projectile.offset[1] * SCALE, 'rotated shot x');
    near(after.projectile.offset[1], before.projectile.offset[0] * SCALE, 'rotated shot y');
    near(after.projectile.spd, before.projectile.spd * SCALE, 'rotated shot speed');
    near(after.projectile.splash, before.projectile.splash * SCALE, 'rotated shot splash');
    assert.equal(after.projectile.trails, 0, 'old shot trails are discarded after turn');
    assert.deepEqual(back.spots, before.spots, 'tower positions return after reverse turn');
    near(back.phase, before.phase, 'enemy ring phase after reverse turn');
    assert.equal(back.projectile?.count, 1, 'pure-luck shot survives reverse turn');
    assert.ok(back.projectile.source && back.projectile.target, 'reverse shot retains live source and target');
    near(back.projectile.offset[0], before.projectile.offset[0], 'reverse shot x');
    near(back.projectile.offset[1], before.projectile.offset[1], 'reverse shot y');
    near(back.projectile.spd, before.projectile.spd, 'reverse shot speed');
    near(back.projectile.splash, before.projectile.splash, 'reverse shot splash');

    // The streamed multiplayer summary contains a rounded total lane length.
    // Cross-orientation viewers must preserve the ring phase, then advance at
    // the sender's speed; a whole-lane ratio drifts because entries differ.
    const landSummary = await page.evaluate(() => {
      const QA = __arenaQA;
      DK.enemies = []; DK.towers = []; DK.gold = 100000;
      DK.heldDie = 1; if (!DKplace(7)) throw Error('spectator fixture tower placement rejected');
      QA.spawnEnemy(QA.buildInfinityWave(1)[0]);
      const lane = QA.LANES()[0];
      DK.enemies[0].dist = lane.loopAt + 0.37 * (lane.len - lane.loopAt);
      const prior = DK.net;
      DK.net = { mode: 'extreme', doneW: 0, status: 'alive', rivals: {} };
      try { return QA.mpSummary(true); } finally { DK.net = prior; }
    });
    const watch = await page.evaluate(sum => {
      const QA = __arenaQA, prior = DK.net;
      DK.net = { mode: 'extreme', doneW: 0, status: 'alive', rivals: { remote: sum } };
      QA.VIEW.pid = 'remote'; QA.VIEW.enemies = [];
      try {
        QA.mpViewBuild(sum);
        const e = QA.VIEW.enemies[0], t = QA.VIEW.towers[0], lane = QA.LANES()[0];
        if (!e || !t) throw Error('streamed spectator fixture was not reconstructed');
        const sourceMap = DKCONTENT.maps.find(m => m.key === (sum.o === 'p' ? 'cInfP' : 'cInf'));
        const sourceRing = DKCONTENT.pathLength(sourceMap.roads[1]);
        const sourceLoop = sum.ll - sourceRing;
        const sourcePhase = (e.sourceDist - sourceLoop) / sourceRing;
        const targetPhase = (e.dist - lane.loopAt) / (lane.len - lane.loopAt);
        const expectedSpot = QA.remapSpot(sum.o === 'p' ? 'cInfP' : 'cInf', DK.mapKey, sum.tw[0][0]);
        const spot = QA.SPOTS()[expectedSpot];
        const towerError = Math.hypot(t.x - spot[0], t.y - spot[1]);
        const oldSourceDist = e.viewSourceDist, sourceSpeed = e.def.speed * (e.spdMult || 1) * (sum.sp || 1) * (sum.o === 'p' ? 1.4 : 1);
        QA.mpViewAdvance(0.25);
        const advanced = QA.VIEW.enemies[0], advancedPhase = (advanced.dist - lane.loopAt) / (lane.len - lane.loopAt);
        const expectedAdvance = sourceSpeed * 0.25 / sourceRing;
        return { sourcePhase, targetPhase, advancedPhase, expectedAdvance,
          sourceDelta: advanced.viewSourceDist - oldSourceDist, expectedSourceDelta: sourceSpeed * 0.25,
          expectedSpot, actualSpot: t.spot, towerError };
      } finally { DK.net = prior; }
    }, landSummary);
    assert.equal(landSummary.o, 'l', 'landscape summary reports landscape map');
    near(watch.targetPhase, watch.sourcePhase, 'landscape stream viewed in landscape');
    near(watch.towerError, 0, 'initial spectator tower position');
    // Seed the view in landscape first so the center cell is reused after the
    // watcher turns; stale tower x/y is otherwise easy to miss.
    await page.setViewportSize({ width: 440, height: 956 });
    await page.waitForFunction(() => DK.mapKey === 'cInfP');
    const landInPortrait = await page.evaluate(({ sum }) => {
      const QA = __arenaQA, prior = DK.net;
      DK.net = { mode: 'extreme', doneW: 0, status: 'alive', rivals: { remote: sum } };
      QA.VIEW.pid = 'remote'; QA.VIEW.enemies = [];
      try {
        QA.mpViewBuild(sum);
        const e = QA.VIEW.enemies[0], t = QA.VIEW.towers[0], lane = QA.LANES()[0];
        const sourceRing = DKCONTENT.pathLength(DKCONTENT.maps.find(m => m.key === 'cInf').roads[1]);
        const sourceLoop = sum.ll - sourceRing;
        const sourcePhase = (e.sourceDist - sourceLoop) / sourceRing;
        const targetPhase = (e.dist - lane.loopAt) / (lane.len - lane.loopAt);
        const spot = QA.SPOTS()[QA.remapSpot('cInf', 'cInfP', sum.tw[0][0])];
        const towerError = Math.hypot(t.x - spot[0], t.y - spot[1]);
        const oldSourceDist = e.viewSourceDist;
        const sourceSpeed = e.def.speed * (e.spdMult || 1) * (sum.sp || 1);
        QA.mpViewAdvance(0.25);
        const advanced = QA.VIEW.enemies[0];
        return { sourcePhase, targetPhase, advancedPhase: (advanced.dist - lane.loopAt) / (lane.len - lane.loopAt),
          expectedAdvance: sourceSpeed * 0.25 / sourceRing,
          sourceDelta: advanced.viewSourceDist - oldSourceDist, expectedSourceDelta: sourceSpeed * 0.25,
          towerError };
      } finally { DK.net = prior; }
    }, { sum: landSummary });
    near(landInPortrait.targetPhase, landInPortrait.sourcePhase, 'landscape stream viewed in portrait');
    near(landInPortrait.advancedPhase - landInPortrait.sourcePhase, landInPortrait.expectedAdvance, 'landscape stream portrait advance');
    near(landInPortrait.sourceDelta, landInPortrait.expectedSourceDelta, 'landscape stream sender speed');
    near(landInPortrait.towerError, 0, 'reused spectator tower recenters after portrait turn');

    const portraitSummary = await page.evaluate(() => {
      const QA = __arenaQA, prior = DK.net;
      DK.net = { mode: 'extreme', doneW: 0, status: 'alive', rivals: {} };
      try { return QA.mpSummary(true); } finally { DK.net = prior; }
    });
    assert.equal(portraitSummary.o, 'p', 'portrait summary reports portrait map');
    await page.setViewportSize({ width: 1240, height: 860 });
    await page.waitForFunction(() => DK.mapKey === 'cInf');
    const portraitInLand = await page.evaluate(sum => {
      const QA = __arenaQA, prior = DK.net;
      DK.net = { mode: 'extreme', doneW: 0, status: 'alive', rivals: { remote: sum } };
      QA.VIEW.pid = 'remote'; QA.VIEW.enemies = [];
      try {
        QA.mpViewBuild(sum);
        const e = QA.VIEW.enemies[0], t = QA.VIEW.towers[0], lane = QA.LANES()[0];
        const sourceRing = DKCONTENT.pathLength(DKCONTENT.maps.find(m => m.key === 'cInfP').roads[1]);
        const sourceLoop = sum.ll - sourceRing;
        const sourcePhase = (e.sourceDist - sourceLoop) / sourceRing;
        const targetPhase = (e.dist - lane.loopAt) / (lane.len - lane.loopAt);
        const spot = QA.SPOTS()[QA.remapSpot('cInfP', 'cInf', sum.tw[0][0])];
        const towerError = Math.hypot(t.x - spot[0], t.y - spot[1]);
        const oldSourceDist = e.viewSourceDist;
        const sourceSpeed = e.def.speed * (e.spdMult || 1) * (sum.sp || 1) * 1.4;
        QA.mpViewAdvance(0.25);
        const advanced = QA.VIEW.enemies[0];
        return { sourcePhase, targetPhase, advancedPhase: (advanced.dist - lane.loopAt) / (lane.len - lane.loopAt),
          expectedAdvance: sourceSpeed * 0.25 / sourceRing,
          sourceDelta: advanced.viewSourceDist - oldSourceDist, expectedSourceDelta: sourceSpeed * 0.25,
          towerError };
      } finally { DK.net = prior; }
    }, portraitSummary);
    near(portraitInLand.targetPhase, portraitInLand.sourcePhase, 'portrait stream viewed in landscape');
    near(portraitInLand.advancedPhase - portraitInLand.sourcePhase, portraitInLand.expectedAdvance, 'portrait stream landscape advance');
    near(portraitInLand.sourceDelta, portraitInLand.expectedSourceDelta, 'portrait stream sender speed');
    near(portraitInLand.towerError, 0, 'spectator tower maps back to landscape');

    await page.setViewportSize({ width: 900, height: 1000 });
    await page.waitForFunction(() => DK.mapKey === 'cInfP');
    const nearSquare = await page.evaluate(() => {
      const QA = __arenaQA, prior = DK.net, map = DKCONTENT.maps.find(m => m.key === DK.mapKey);
      DK.net = { mode: 'extreme', doneW: 0, status: 'alive', rivals: {} };
      try { return { key: DK.mapKey, canvas: map.canvas, orientation: QA.mpSummary(false).o }; }
      finally { DK.net = prior; }
    });
    assert.ok(nearSquare.canvas[0] > nearSquare.canvas[1], 'near-square portrait viewport has a wide canvas');
    assert.equal(nearSquare.orientation, 'p', 'summary reports layout orientation, not canvas dimensions');

    // The shorter entry starts at the visible portal. Use the real update loop:
    // every orientation must reach the ring after the same elapsed time.
    const measureEntry = async (width, height) => {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(([w, h]) => {
        const want = w / h < 0.95 ? 'cInfP' : 'cInf';
        const expected = __arenaQA.arenaCanvasForScreen(want), dims = __arenaQA.canvasDims();
        return DK.mapKey === want && dims[0] === expected.w && dims[1] === expected.h;
      }, [width, height]);
      return page.evaluate(() => {
        const QA = __arenaQA;
        QA.VIEW.pid = null;
        DK.enemies = []; DK.towers = []; DK.projs = []; DK.spawnQ = [];
        DK.waveActive = false; DK.autoT = 0; DK.wave = 0; DK.heldDie = 0;
        DK.inf.queue = []; DK.inf.bossT = 0;
        QA.spawnEnemy(QA.buildInfinityWave(1)[0]);
        const e = DK.enemies[0], lane = QA.LANES()[0];
        e.def = { ...e.def, speed: 40 };
        e.move = 'ground'; e.lane = 0; e.spdMult = 1; e.entranceT = -1;
        e.stunT = 0; e.slowT = 0; e.dist = 0; e.max = e.hp = 100000;
        const towerSpot = DK.mapKey === 'cInfP' ? QA.remapSpot('cInf', 'cInfP', 5) : 5;
        const spot = QA.SPOTS()[towerSpot];
        const tower = { face: 1, lvl: 1, def: DKTD[1], spot: towerSpot,
          x: spot[0], y: spot[1], cd: 0, kick: 0, skin: 0 };
        DK.towers = [tower];
        const dt = 1 / 60;
        for (let frame = 1; frame <= 1000; frame++) {
          QA.update(dt);
          if (e.dist >= lane.loopAt) return { seconds: frame * dt, loopAt: lane.loopAt,
            mapKey: DK.mapKey, scale: QA.arenaWorldScale(), shots: tower.shotSerial || 0,
            hp: e.hp };
        }
        throw Error('enemy did not reach ring after 1000 update frames');
      });
    };
    const entryLand = await measureEntry(1240, 860);
    const entryPortrait = await measureEntry(440, 956);
    const entrySquare = await measureEntry(900, 1000);
    assert.equal(entryLand.mapKey, 'cInf');
    assert.equal(entryPortrait.mapKey, 'cInfP');
    assert.equal(entrySquare.mapKey, 'cInfP');
    near(entryLand.loopAt, ENTRY, 'landscape fixed entry length');
    near(entryPortrait.loopAt, ENTRY * SCALE, 'portrait fixed entry length');
    near(entrySquare.loopAt, ENTRY * SCALE, 'near-square fixed entry length');
    for (const [name, measured] of [['landscape', entryLand], ['portrait', entryPortrait], ['near-square', entrySquare]])
      assert.ok(Math.abs(measured.seconds - ENTRY / 40) <= 1 / 60 + EPS,
        `${name} ring arrival ${measured.seconds}s differs from logical ${ENTRY / 40}s`);
    assert.ok(Math.max(entryLand.seconds, entryPortrait.seconds, entrySquare.seconds)
      - Math.min(entryLand.seconds, entryPortrait.seconds, entrySquare.seconds) <= 1 / 60 + EPS,
    'all viewports have equal real ring-entry time');
    assert.ok(entryLand.shots > 0 && entryLand.hp < 100000, 'entry tower damages the enemy before it reaches the ring');
    assert.equal(entryPortrait.shots, entryLand.shots, 'portrait tower fires equally often before ring entry');
    assert.equal(entrySquare.shots, entryLand.shots, 'near-square tower fires equally often before ring entry');
    near(entryPortrait.hp, entryLand.hp, 'portrait pre-ring enemy HP');
    near(entrySquare.hp, entryLand.hp, 'near-square pre-ring enemy HP');

    // A decorative entrance is useful only when it is the actual spawn point
    // and its complete artwork is visible in the player's viewport.
    const measurePortal = async (width, height) => {
      await page.evaluate(() => { __arenaQA.portalDraws = []; });
      await page.setViewportSize({ width, height });
      await page.waitForFunction(([w, h]) => {
        const want = w / h < 0.95 ? 'cInfP' : 'cInf';
        const expected = __arenaQA.arenaCanvasForScreen(want), dims = __arenaQA.canvasDims();
        return DK.mapKey === want && dims[0] === expected.w && dims[1] === expected.h;
      }, [width, height]);
      return page.evaluate(() => {
        const QA = __arenaQA, map = DKCONTENT.maps.find(m => m.key === DK.mapKey);
        const canvas = document.getElementById('game'), cr = canvas.getBoundingClientRect();
        const art = QA.startArt(), portal = map.portals?.[0], spawn = map.path[0];
        const drawCall = QA.portalDraws.findLast(c => portal && Math.abs(c.x - portal[0]) < 1e-6);
        DK.enemies = [];
        QA.spawnEnemy(QA.buildInfinityWave(1)[0]);
        const enemy = DK.enemies[0], position = QA.posAt(enemy.dist, enemy.lane);
        const sx = cr.width / canvas.width, sy = cr.height / canvas.height;
        const artWidth = art?.h && drawCall ? drawCall.h * art.w / art.h : 0;
        const image = drawCall && {
          left: cr.left + (drawCall.x - artWidth / 2) * sx,
          right: cr.left + (drawCall.x + artWidth / 2) * sx,
          top: cr.top + (drawCall.y - drawCall.h) * sy,
          bottom: cr.top + drawCall.y * sy,
        };
        return { mapKey: DK.mapKey, canvas: [canvas.width, canvas.height], portal, spawn,
          enemyDist: enemy.dist, enemyPos: [position.x, position.y], artReady: !!art?.cv,
          drawCall, image, viewport: [innerWidth, innerHeight] };
      });
    };
    for (const [width, height] of [[932, 430], [430, 932], [514, 850], [844, 390]]) {
      const p = await measurePortal(width, height), label = `${width}x${height}`;
      assert.deepEqual(p.portal, p.spawn, `${label} portal is exactly at path[0]`);
      assert.equal(p.enemyDist, 0, `${label} newly spawned enemy starts at distance zero`);
      near(p.enemyPos[0], p.portal[0], `${label} actual enemy spawn x`);
      near(p.enemyPos[1], p.portal[1], `${label} actual enemy spawn y`);
      assert.ok(p.artReady, `${label} authored portal art is loaded`);
      assert.ok(p.drawCall, `${label} portal art is actually drawn in the road layer`);
      const scale = p.mapKey === 'cInfP' ? 1.7 : 1;
      near(p.drawCall.x, p.portal[0], `${label} drawn portal x`);
      near(p.drawCall.y, p.portal[1] + 26 * scale, `${label} drawn portal foot y`);
      near(p.drawCall.h, 84 * scale, `${label} drawn portal height`);
      assert.equal(p.drawCall.flip, p.mapKey === 'cInf', `${label} drawn portal facing`);
      assert.ok(p.image.left >= -1 && p.image.right <= width + 1,
        `${label} portal art fits viewport horizontally: ${JSON.stringify(p.image)}`);
      assert.ok(p.image.top >= 63 && p.image.bottom <= height - 11,
        `${label} portal art clears 64px top and 12px bottom: ${JSON.stringify(p.image)}`);
      console.log(`${label} portal ${p.mapKey} ${JSON.stringify(p.image)}`);
      if (label === '932x430' || label === '430x932') {
        await page.evaluate(() => {
          const QA = __arenaQA, lane = QA.LANES()[0], item = QA.buildInfinityWave(1)[0];
          DK.enemies = [];
          for (let i = 0; i < 3; i++) {
            QA.spawnEnemy(item);
            const e = DK.enemies[i]; e.dist = lane.loopAt * i * 0.38; e.entranceT = -1;
          }
          QA.draw();
        });
        await page.screenshot({ path: outputPath(`arena-portal-${label}.png`) });
      }
    }

    // The cannon projectile follows a stationary target on the same ring
    // phase. Compare actual visual-update frames through impact, not only
    // nominal projectile speed or acquisition radius.
    const measureCannonFlight = async (width, height) => {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(([w, h]) => {
        const want = w / h < 0.95 ? 'cInfP' : 'cInf';
        const expected = __arenaQA.arenaCanvasForScreen(want), dims = __arenaQA.canvasDims();
        return DK.mapKey === want && dims[0] === expected.w && dims[1] === expected.h;
      }, [width, height]);
      return page.evaluate(() => {
        const QA = __arenaQA;
        DK.enemies = []; DK.towers = []; DK.projs = []; DK.beams = []; DK.fxs = [];
        QA.spawnEnemy(QA.buildInfinityWave(1)[0]);
        const e = DK.enemies[0], lane = QA.LANES()[0];
        e.move = 'ground'; e.lane = 0; e.entranceT = -1;
        e.dist = lane.loopAt + 0.02 * (lane.len - lane.loopAt);
        e.max = e.hp = 100000;
        const spotIndex = DK.mapKey === 'cInfP' ? QA.remapSpot('cInf', 'cInfP', 5) : 5;
        const spot = QA.SPOTS()[spotIndex];
        const tower = { face: 2, lvl: 1, def: DKTD[2], spot: spotIndex,
          x: spot[0], y: spot[1], cd: 0, kick: 0, skin: 0 };
        DK.towers = [tower];
        QA.towerFire(tower, 0);
        if (DK.projs.length !== 1) throw Error('cannon fixture did not fire at ring target');
        const projectile = DK.projs[0];
        const groundFlight = projectile.groundFlight;
        const originError = Math.hypot(projectile.x - tower.x, projectile.y - tower.y);
        for (let frame = 1; frame <= 180; frame++) {
          QA.updateVisuals(1 / 60);
          if (projectile.gone) return { frames: frame, hp: e.hp, groundFlight, originError };
        }
        throw Error('cannon projectile did not hit after 180 visual-update frames');
      });
    };
    const cannonLand = await measureCannonFlight(1240, 860);
    const cannonPortrait = await measureCannonFlight(440, 956);
    assert.ok(cannonLand.groundFlight && cannonPortrait.groundFlight, 'Infinity cannon uses ground-anchored flight');
    near(cannonLand.originError, 0, 'landscape cannon begins at tower ground anchor');
    near(cannonPortrait.originError, 0, 'portrait cannon begins at tower ground anchor');
    assert.ok(cannonLand.hp < 100000, 'landscape cannon damaged the target');
    near(cannonPortrait.hp, cannonLand.hp, 'portrait cannon deals the same hit damage');
    assert.ok(Math.abs(cannonPortrait.frames - cannonLand.frames) <= 1,
      `cannon hit timing differs by more than a frame: land ${cannonLand.frames}, portrait ${cannonPortrait.frames}`);
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    console.log('PASS arena orientation: cells, ring, range, 1,440 attack samples per orientation, pure shot turn, spectators, equal entry combat, equal cannon flight');
  } finally {
    await page.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
