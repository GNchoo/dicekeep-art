// Actual arena comparison for the four reviewed directional walkers.
// Run after promoting their art: node tools/e2e/enemy-casual-pilot.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { launchBrowser, gameUrl, watchArtErrors } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.join(repo, 'gen/e2e/enemy-casual-pilot');
fs.mkdirSync(out, { recursive: true });
const game = fs.readFileSync(path.join(repo, 'game.js'), 'utf8');
const hook = 'Object.assign(window,{buildInfinityWave,spawnEnemy,epos,currentEnemyFrame,enemyFramePlacement,refreshDirectionalDemand,draw}); Object.defineProperty(window,"LANES",{get:()=>LANES}); window.DK = S;';

(async () => {
  const browser = await launchBrowser();
  const report = { arena: 'cInf/cInfP', actors: ['w001', 'w002', 'w003', 'w005'], boot: {}, views: [], flight: [], passed: false };
  try {
    for (const [device, viewport] of [['desktop', { width: 1240, height: 860 }], ['phone', { width: 440, height: 956 }]]) {
      const page = await browser.newPage({ viewport });
      const errors = watchArtErrors(page);
      await page.route('**/game.js*', route => route.fulfill({ contentType: 'application/javascript', body: game.replace('window.DK = S;', hook) }));
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      try {
        await page.goto(gameUrl());
        await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
        const boot = await page.evaluate(() => {
          DKstartInf('endless'); DK.paused = true; DK.muted = true;
          DK.enemies = []; DK.towers = []; DK.projs = []; DK.fxs = [];
          DK.spawnQ = []; DK.waveActive = false; DK.autoT = 999; DK.bannerT = 0;
          for (const wave of [1, 2, 3, 5]) {
            DK.wave = wave;
            const item = buildInfinityWave(wave).find(candidate => !candidate.isBoss && !candidate.isElite);
            if (!item) throw Error('No regular enemy in W' + wave);
            spawnEnemy(item);
          }
          DK.wave = 5;
          for (const e of DK.enemies) { e.entranceT = -1; e.stunT = 0; e.slowT = 0; e.hp = e.max = 1e12; }
          return { mapKey: DK.mapKey, ids: DK.enemies.map(e => e.artAssetId), manifest: DK.enemies.map(e => {
            const entry = DKART.entry(e.artAssetId);
            return { id: e.artAssetId, locomotion: entry?.locomotion, versions: Object.fromEntries(['side', 'front', 'back'].map(view => [view, entry?.views[view]?.assetVersion ?? entry?.assetVersion])) };
          }) };
        });
        assert.deepEqual(boot.ids, ['w001', 'w002', 'w003', 'w005']);
        assert.ok(['cInf', 'cInfP'].includes(boot.mapKey), 'landscape/portrait Infinity arena');
        assert.ok(boot.manifest.every(e => e.locomotion === 'legged'));
        assert.ok(boot.manifest.every(e => Object.values(e.versions).every(version => version >= 127)), 'all reviewed walking views are promoted');
        report.boot[device] = boot;
        for (const [direction, expectedView] of [['right', 'side'], ['down', 'front'], ['up', 'back']]) {
          const setup = await page.evaluate(({ direction }) => {
            const lane = LANES[0], canvas = document.getElementById('game');
            const along = s => direction === 'right' ? s.bx - s.ax > 65 && Math.abs(s.by - s.ay) < 1
              : direction === 'down' ? s.by - s.ay > 65 && Math.abs(s.bx - s.ax) < 1
                : s.by - s.ay < -65 && Math.abs(s.bx - s.ax) < 1;
            const choices = lane.segs.filter(s => s.acc >= (lane.loopAt || 0) && along(s)).map(s => {
              const x = (s.ax + s.bx) / 2, y = (s.ay + s.by) / 2;
              return { s, score: Math.min(x, canvas.width - x, y, canvas.height - y) + Math.min(250, s.len) * .1 };
            }).sort((a, b) => b.score - a.score);
            if (!choices.length) throw Error('No straight ' + direction + ' lane');
            const seg = choices[0].s;
            DK.enemies.forEach((e, i) => {
              e.dist = seg.acc + seg.len * (.24 + i * .17);
              const entry = DKART.entry(e.artAssetId);
              const stride = entry.cycleStride * e.drawHeight / entry.referenceHeight;
              e.artWalkDistance = stride * .25; // visible mid-step, same phase for both actors
            });
            refreshDirectionalDemand(true);
            return { segment: { ax: seg.ax, ay: seg.ay, bx: seg.bx, by: seg.by, length: seg.len }, ids: DK.enemies.map(e => e.artAssetId) };
          }, { direction });
          await page.waitForFunction(view => DK.enemies.every(e => {
            const frame = currentEnemyFrame(e);
            return frame?.view === view && frame.cacheKey.endsWith(':sheet');
          }), expectedView, { timeout: 60000 });
          const scene = await page.evaluate(() => {
            const original = CanvasRenderingContext2D.prototype.ellipse, shadows = [];
            CanvasRenderingContext2D.prototype.ellipse = function (...args) {
              if (this.canvas.id === 'game' && this.fillStyle === 'rgba(18, 19, 30, 0.18)') shadows.push(args.slice(0, 4));
              return original.apply(this, args);
            };
            try { draw(); } finally { CanvasRenderingContext2D.prototype.ellipse = original; }
            const actors = DK.enemies.map(e => {
              const fr = currentEnemyFrame(e), p = epos(e), placement = enemyFramePlacement(fr, e.drawHeight);
              const image = fr.cv.getContext('2d').getImageData(0, 0, fr.cv.width, fr.cv.height).data;
              let x0 = fr.cv.width, y0 = fr.cv.height, x1 = 0, y1 = 0;
              for (let y = 0; y < fr.cv.height; y++) for (let x = 0; x < fr.cv.width; x++) if (image[(y * fr.cv.width + x) * 4 + 3] >= 16) {
                x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
              }
              const scale = placement.w / fr.cv.width;
              return {
                id: e.artAssetId, move: e.move, view: fr.view, cacheKey: fr.cacheKey,
                drawHeight: e.drawHeight, combatSize: e.def.size, worldStride: DKART.entry(e.artAssetId).cycleStride * e.drawHeight / fr.referenceHeight,
                pivot: [p.x, p.y + 4], shadowRadius: Math.max(7, Math.min(42, (e.drawHeight || e.def.size) * .35)),
                rasterBounds: [x0, y0, x1, y1],
                worldBounds: [p.x + placement.x + x0 * scale, p.y + 4 + placement.y + y0 * scale,
                  p.x + placement.x + x1 * scale, p.y + 4 + placement.y + y1 * scale],
                alphaHeight: (y1 - y0) * scale,
                footGap: -(placement.y + y1 * scale),
              };
            });
            return { actors, shadows, canvas: { w: document.getElementById('game').width, h: document.getElementById('game').height } };
          });
          const { actors } = scene;
          assert.deepEqual(actors.map(a => a.view), [expectedView, expectedView, expectedView, expectedView]);
          assert.ok(actors.every(a => a.move === 'ground' && a.cacheKey.endsWith(':sheet') && a.worldBounds.every(Number.isFinite)));
          assert.equal(scene.shadows.length, 4, 'all four walking enemies have a contact shadow');
          assert.deepEqual(actors.map(a => a.combatSize), [42, 42, 58, 50], 'combat sizes remain unchanged');
          assert.ok(actors.every((a, i) => Math.abs(a.drawHeight - [33.6, 42, 58, 50][i]) < .01), 'walking presentation scales match the game');
          for (const actor of actors) {
            assert.ok(actor.alphaHeight > (actor.id === 'w001' ? 12 : 22) && actor.alphaHeight < 85, `${actor.id} readable sprite height`);
            assert.ok(actor.worldBounds[0] >= 0 && actor.worldBounds[1] >= 0
              && actor.worldBounds[2] <= scene.canvas.w && actor.worldBounds[3] <= scene.canvas.h, `${actor.id} remains on the game canvas`);
            const shadow = scene.shadows.find(s => Math.abs(s[0] - actor.pivot[0]) < .01 && Math.abs(s[1] - actor.pivot[1] - 1) < .01);
            assert.ok(shadow, `${actor.id} shadow stays at its ground pivot`);
            assert.ok(Math.abs(shadow[2] - actor.shadowRadius) < .01);
            assert.ok(shadow[3] + 1 >= Math.abs(-actor.footGap - 1), `${actor.id} fore/aft step stays near its ground shadow`);
          }
          const full = path.join(out, `${device}-${expectedView}.png`);
          await page.screenshot({ path: full });
          const box = await page.locator('#game').boundingBox();
          const dims = await page.locator('#game').evaluate(c => ({ w: c.width, h: c.height }));
          const sx = box.width / dims.w, sy = box.height / dims.h;
          const bounds = actors.map(a => a.worldBounds);
          const x0 = Math.max(0, Math.floor(box.x + (Math.min(...bounds.map(b => b[0])) - 30) * sx));
          const y0 = Math.max(0, Math.floor(box.y + (Math.min(...bounds.map(b => b[1])) - 35) * sy));
          const x1 = Math.min(viewport.width, Math.ceil(box.x + (Math.max(...bounds.map(b => b[2])) + 30) * sx));
          const y1 = Math.min(viewport.height, Math.ceil(box.y + (Math.max(...bounds.map(b => b[3])) + 30) * sy));
          const close = path.join(out, `${device}-${expectedView}-close.png`);
          const crop = await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
          await sharp(crop).resize({ width: (x1 - x0) * 3, kernel: 'nearest' }).png().toFile(close);
          report.views.push({ device, direction, view: expectedView, setup, actors, shadows: scene.shadows,
            screenshot: path.relative(repo, full), closeup: path.relative(repo, close), errors: errors.slice() });
          assert.deepEqual(errors, []);
        }
        for (const [wave, id, visualHeight, minVersion] of [[4, 'w004', 42, 128], [8, 'w008', 54.6, 127]]) {
          const flightBoot = await page.evaluate(wave => {
            DK.enemies = []; DK.wave = wave;
            const item = buildInfinityWave(wave).find(candidate => !candidate.isBoss && !candidate.isElite);
            if (!item) throw Error('No regular W' + wave + ' enemy');
            spawnEnemy(item);
            const e = DK.enemies[0]; e.entranceT = -1; e.hp = e.max = 1e12;
            const entry = DKART.entry(e.artAssetId);
            return { id: e.artAssetId, move: e.move, locomotion: entry?.locomotion, drawHeight: e.drawHeight, combatSize: e.def.size, lane: e.lane,
              versions: Object.fromEntries(['side', 'front', 'back'].map(view => [view, entry?.views[view]?.assetVersion ?? entry?.assetVersion])) };
          }, wave);
          assert.equal(flightBoot.id, id);
          assert.equal(flightBoot.move, 'air');
          assert.equal(flightBoot.locomotion, 'flight');
          assert.ok(Math.abs(flightBoot.drawHeight - visualHeight) < .01, `${id} visual height`);
          assert.equal(flightBoot.combatSize, 42, `${id} combat size`);
          assert.ok(Object.values(flightBoot.versions).every(version => version >= minVersion), `${id} flight views are promoted`);
          for (const [direction, expectedView] of [['right', 'side'], ['down', 'front'], ['up', 'back']]) {
            const setup = await page.evaluate(({ direction }) => {
              const e = DK.enemies[0], lane = LANES[e.lane || 0];
              const along = s => direction === 'right' ? s.bx - s.ax > 35 && Math.abs(s.by - s.ay) < 1
                : direction === 'down' ? s.by - s.ay > 35 && Math.abs(s.bx - s.ax) < 1
                  : s.by - s.ay < -35 && Math.abs(s.bx - s.ax) < 1;
              const seg = lane.segs.find(s => s.acc >= (lane.loopAt || 0) && along(s));
              if (!seg) throw Error('No ' + e.artAssetId + ' ' + direction + ' air-lane segment');
              e.dist = seg.acc + seg.len * .5;
              e.artWalkDistance = DKART.entry(e.artAssetId).cycleStride * e.drawHeight / DKART.entry(e.artAssetId).referenceHeight * .25;
              refreshDirectionalDemand(true);
              return { lane: e.lane, kind: lane.kind, segment: { ax: seg.ax, ay: seg.ay, bx: seg.bx, by: seg.by } };
            }, { direction });
            await page.waitForFunction(view => { const fr = currentEnemyFrame(DK.enemies[0]); return fr?.view === view && fr.cacheKey.endsWith(':sheet'); }, expectedView, { timeout: 60000 });
            const frame = await page.evaluate(() => { const e = DK.enemies[0], fr = currentEnemyFrame(e);
              return { id: e.artAssetId, move: e.move, view: fr.view, cacheKey: fr.cacheKey, width: fr.cv.width, height: fr.cv.height }; });
            assert.equal(frame.view, expectedView);
            assert.equal(frame.width, 256);
            assert.equal(frame.height, 256);
            report.flight.push({ device, direction, setup, frame, errors: errors.slice() });
            assert.deepEqual(errors, []);
          }
        }
      } finally { await page.close(); }
    }
    report.passed = true;
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
  console.log('PASS casual enemy pilot: W001/W002/W003/W005 walking + W004/W008 flight, three directions, desktop + phone');
})().catch(error => { console.error(error); process.exitCode = 1; });
