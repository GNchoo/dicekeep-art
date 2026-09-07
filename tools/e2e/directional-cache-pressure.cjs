// Real 200-enemy cache pressure. The response hook is test-only; production stays untouched.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl, watchArtErrors } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.join(repo, 'gen/e2e/directional-pressure');
const pilot = process.argv.includes('--pilot');
const budget = 96 * 1024 * 1024;
const prefix = pilot ? 'pilot-' : '';
fs.mkdirSync(out, { recursive: true });
const compact = ({ records, ...state }) => state;

(async () => {
  const report = {
    scope: '200 actual spawned enemies, checked-in PNGs and actual game Canvas.drawImage calls; four natural travel directions under cache pressure',
    pilot, startedAt: new Date().toISOString(), command: 'node tools/e2e/directional-cache-pressure.cjs' + (pilot ? ' --pilot' : ''),
    manifestSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, 'directional-art.js'))).digest('hex'),
    budget, entityTarget: 200, rounds: [], checks: [], passed: false,
    limitations: [
      '200 entities share up to 110 art identities; this is not 200 unique species.',
      'The decoded sheets for every simultaneous identity/direction cannot all fit in 96MiB. Same-character, same-direction stills or mandatory 64px inline stills are allowed to stop animating under pressure.',
      'Decoded canvas memory plus input/output reservations are checked. This is not a measurement of browser/GPU process memory.',
      'Finite phase, frame selection, natural movement and rendered identity are regression checks, not independent anatomy or foot-contact quality judgments.',
      'Starting positions are arranged on real straight segments after the lane loop entrance. Transformed nontransparent source bounds must intersect the actual game canvas; other enemies or DOM overlays may still obscure individuals in screenshots.'
    ]
  };
  const browser = await launchBrowser();
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1240, height: 860 } });
    report.errors = watchArtErrors(page);
    const pngRequests = new Set();
    page.on('request', request => { if (/\/casual\/(enemies|bosses)\/inf\/directional\//.test(request.url())) pngRequests.add(request.url()); });
    await page.route('**/game.js*', route => {
      const game = fs.readFileSync(path.join(repo, 'game.js'), 'utf8');
      assert.equal(game.split('window.DK = S;').length, 2, 'one diagnostic hook anchor');
      const hook = `const pressureOriginalFrame = currentEnemyFrame;
        currentEnemyFrame = function(e) { const f = pressureOriginalFrame(e); if (window.__pressureFrame) window.__pressureFrame(e, f); return f; };
        Object.assign(window, {buildInfinityWave, spawnEnemy, refreshDirectionalDemand, directionalPhase, posAt, VIEW});\n`;
      return route.fulfill({ contentType: 'application/javascript', body: game.replace('window.DK = S;', hook + 'window.DK = S;') });
    });
    await page.addInitScript(() => {
      localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1');
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
    const manifest = await page.evaluate(() => ({ ids: Object.keys(INF_DIRECTIONAL_ART.entries).sort(), state: DKART.state() }));
    const ids = manifest.ids, count = ids.length;
    report.boot = compact(manifest.state); report.approvedIds = ids;
    assert.ok(count > 0 && count <= 110, 'nonempty approved roster, at most110');
    if (!pilot) assert.equal(count, 110, 'Release pressure test requires all110 approved identities; use --pilot for incomplete rollout');
    assert.equal(manifest.state.approvedEntries, count);
    assert.equal(manifest.state.initialized, true);
    assert.deepEqual(manifest.state.invalidReady, []);
    assert.equal(manifest.state.budget, budget);
    const mandatoryBytes = count * 3 * 64 * 64 * 4;
    assert.equal(manifest.state.residentBytes, mandatoryBytes);
    assert.equal(pngRequests.size, 0, 'boot decodes inline fallbacks only');
    report.checks.push(`${count} identities/${count * 3} mandatory directional fallbacks decoded before play`);

    await page.click('#ov-btn');
    await page.evaluate(() => { DK.muted = true; DKstartInf('endless'); DK.speed = 1; DK.gold = 90000; DK.lives = 99999; });
    await page.waitForFunction(() => DK.phase === 'playing');
    await page.evaluate(() => {
      document.getElementById('help-close')?.click(); document.getElementById('coach-skip')?.click();
      const lookup = new WeakMap(), serials = new WeakMap(), foregroundBounds = new WeakMap(); let serial = 0;
      const state = window.__pressure = { enabled: false, issueSet: new Set(), rows: {}, actors: {}, entities: new Set(), samples: [], round: -1, draws: 0, visibleDraws: 0, clippedDraws: 0 };
      const issue = message => { if (state.issueSet.size < 100) state.issueSet.add(message); };
      const foreground = source => {
        if (foregroundBounds.has(source)) return foregroundBounds.get(source);
        const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
        let left = source.width, top = source.height, right = 0, bottom = 0;
        for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (pixels[(y * source.width + x) * 4 + 3] > 16) {
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
        const box = right > left && bottom > top ? { left, top, right, bottom } : null;
        foregroundBounds.set(source, box); return box;
      };
      window.__pressureFrame = (e, f) => {
        if (!state.enabled || !Number.isInteger(e._pressureIndex)) return;
        if (!f?.cv) { issue('missing frame ' + e.artAssetId); return; }
        const p = posAt(e.dist, e.lane || 0), phase = directionalPhase(e);
        const view = DKappearance.direction(p.dx, p.dy, e.artDirection);
        const direction = view === 'side' ? (p.dx < 0 ? 'left' : 'right') : view === 'front' ? 'down' : 'up';
        if (!serials.has(f.cv)) serials.set(f.cv, ++serial);
        lookup.set(f.cv, { e, f, view, direction, phase, serial: serials.get(f.cv) });
      };
      const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
        const result = originalDraw.call(this, source, ...args), observed = lookup.get(source);
        if (!state.enabled || this.canvas.id !== 'game' || !observed) return result;
        const { e, f, view, direction, phase, serial } = observed;
        const match = /^([^:]+):(side|front|back):(sheet|still|fallback)$/.exec(f.cacheKey || '');
        if (!f.directional || f.assetId !== e.artAssetId || !match || match[1] !== e.artAssetId) issue('wrong or legacy identity ' + e.artAssetId + ' <- ' + f.cacheKey);
        if (f.view !== view || match?.[2] !== view) issue('wrong direction ' + e.artAssetId + ':' + view + ' <- ' + f.cacheKey);
        const matrix = this.getTransform();
        if (![phase, e.artWalkDistance, e.animT, e.drawHeight, f.w, f.h, f.referenceHeight, ...args, matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)
          || phase < 0 || phase >= 1 || e.drawHeight <= 0 || source.width <= 0 || source.height <= 0 || args.length !== 4 || args[2] <= 0 || args[3] <= 0) issue('invalid numeric pose ' + e.artAssetId);
        const entry = DKART.entry(e.artAssetId), expectedCell = match?.[3] === 'fallback' ? 64 : entry.views[view].cell;
        if (source.width !== expectedCell || source.height !== expectedCell || !Array.isArray(f.pivot) || !f.pivot.every(n => Number.isFinite(n) && n >= 0 && n <= expectedCell)) issue('invalid frame grid/pivot ' + f.cacheKey);
        if ((direction === 'right' && e.face !== 1) || (direction === 'left' && e.face !== -1)) issue('wrong lateral face ' + e.artAssetId);
        // Ignore transparent cell padding: test where the actual sprite pixels land.
        const fg = source.width > 0 && source.height > 0 ? foreground(source) : null;
        if (!fg) issue('empty foreground ' + f.cacheKey);
        let bounds = null, visibleFraction = 0, fullyInside = false;
        if (fg) {
          const corners = [[fg.left, fg.top], [fg.right, fg.top], [fg.left, fg.bottom], [fg.right, fg.bottom]].map(([u, v]) => {
            const x = args[0] + u / source.width * args[2], y = args[1] + v / source.height * args[3];
            return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
          });
          bounds = { left: Math.min(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)), right: Math.max(...corners.map(p => p.x)), bottom: Math.max(...corners.map(p => p.y)) };
          const w = Math.max(0, Math.min(this.canvas.width, bounds.right) - Math.max(0, bounds.left));
          const h = Math.max(0, Math.min(this.canvas.height, bounds.bottom) - Math.max(0, bounds.top));
          visibleFraction = w * h / ((bounds.right - bounds.left) * (bounds.bottom - bounds.top));
          fullyInside = bounds.left >= 0 && bounds.top >= 0 && bounds.right <= this.canvas.width && bounds.bottom <= this.canvas.height;
          if (!(visibleFraction > 0) || !(this.globalAlpha > 0)) issue('off-canvas foreground ' + e.artAssetId + ':' + direction);
        }
        const row = state.rows[e.artAssetId] ||= { id: e.artAssetId, draws: 0, entities: new Set(), directions: {}, firstWalk: e.artWalkDistance, lastWalk: e.artWalkDistance, firstAnimT: e.animT, lastAnimT: e.animT };
        const r = row.directions[direction] ||= { view, draws: 0, visibleDraws: 0, fullyInsideDraws: 0, minimumVisibleFraction: 1, exampleBounds: bounds, canvasSize: [this.canvas.width, this.canvas.height], kinds: {}, sheetPoses: new Set(), sheetCanvases: new Set(), phaseBins: new Set(), phaseMin: 1, phaseMax: 0, firstWalk: e.artWalkDistance, lastWalk: e.artWalkDistance };
        const actor = state.actors[e._pressureIndex] ||= { index: e._pressureIndex, id: e.artAssetId, firstWalk: e.artWalkDistance, lastWalk: e.artWalkDistance, firstAnimT: e.animT, lastAnimT: e.animT, draws: 0, visibleDraws: 0 };
        actor.draws++; actor.lastWalk = e.artWalkDistance; actor.lastAnimT = e.animT;
        if (visibleFraction > 0 && this.globalAlpha > 0) { r.visibleDraws++; actor.visibleDraws++; state.visibleDraws++; }
        if (fullyInside) r.fullyInsideDraws++; else state.clippedDraws++;
        r.minimumVisibleFraction = Math.min(r.minimumVisibleFraction, visibleFraction);
        const kind = match?.[3] || 'invalid';
        row.draws++; row.entities.add(e._pressureIndex); row.lastWalk = Math.max(row.lastWalk, e.artWalkDistance); row.lastAnimT = Math.max(row.lastAnimT, e.animT);
        const frameIndex = Math.floor(phase * entry.views[view].frames);
        r.draws++; r.kinds[kind] = (r.kinds[kind] || 0) + 1; r.phaseBins.add(frameIndex);
        // Count actual sheet frame indices, not reloaded canvas objects, as distinct poses.
        if (kind === 'sheet') { r.sheetPoses.add(frameIndex); r.sheetCanvases.add(serial); }
        r.phaseMin = Math.min(r.phaseMin, phase); r.phaseMax = Math.max(r.phaseMax, phase); r.lastWalk = Math.max(r.lastWalk, e.artWalkDistance);
        state.entities.add(e._pressureIndex); state.draws++;
        return result;
      };
      window.__pressureSample = label => {
        const { records, ...s } = DKART.state();
        if (s.trackedBytes !== s.residentBytes + s.reservedBytes || s.trackedBytes > s.budget || s.peakTrackedBytes > s.budget || s.running > 2 || s.maxRunning > 2) issue('cache budget/concurrency exceeded');
        if (s.failures || s.invalidReady.length) issue('art loader failure');
        state.samples.push({ label, ms: Math.round(performance.now()), entities: DK.enemies.length, ...s });
      };
      state.interval = setInterval(() => window.__pressureSample('sample'), 125);
    });
    report.population = await page.evaluate(ids => {
      DK.paused = true; DK.enemies = []; DK.spawnQ = []; DK.towers = []; DK.projs = []; DK.corpses = []; DK.fxs = [];
      DK.waveActive = true; DK.autoT = 0; VIEW.pid = null;
      const counts = {};
      for (let i = 0; i < 200; i++) {
        const id = ids[i % ids.length], wave = Number(id.slice(1, 4)); DK.wave = wave;
        const q = buildInfinityWave(wave), item = id.endsWith('-2') ? q.find(x => x.bossRole === 1) : q.find(x => !x.isElite && x.bossRole !== 1);
        if (!item) throw new Error('Missing original spawn item ' + id);
        spawnEnemy(item); const e = DK.enemies.at(-1);
        if (e.artAssetId !== id) throw new Error('Spawn identity mismatch ' + id + ' <- ' + e.artAssetId);
        e._pressureIndex = i; e.entranceT = -1; e.stunT = 0; e.slowT = 0; e.hp = e.max = 1e12; e.flashT = 0;
        counts[id] = (counts[id] || 0) + 1;
      }
      // A completed active non-boss wave would auto-spawn a 201st enemy after
      // intermission and correctly trigger the game's boss field-cap loss.
      DK.wave = 1; DK.waveActive = false; DK.autoT = 0; DK.inf.bossT = DKCONTENT.INFINITY.bossTimeLimit || 320; DK.spawnQ = []; DK.fxs = []; DK.bannerT = 0; DK.shakeT = 0; DKsync();
      return { count: DK.enemies.length, uniqueIds: Object.keys(counts).length, counts, fieldCap: DKCONTENT.INFINITY.fieldCap || 200, mode: DK.mode, phase: DK.phase };
    }, ids);
    assert.equal(report.population.count, 200); assert.equal(report.population.uniqueIds, count); assert.equal(report.population.fieldCap, 200);
    report.checks.push('200 original-roster spawnEnemy entities, all approved identities, endless mode, no combat damage or entrance holds');

    for (let round = 0; round < 8; round++) {
      report.currentRound = round;
      const start = await page.evaluate(round => {
        window.__pressure.round = round;
        const active = new Map(), allocations = {};
        for (const e of DK.enemies) {
          const dir = ['right', 'down', 'left', 'up'][(e._pressureIndex + round) % 4], lane = DKLANES()[e.lane || 0];
          const seg = lane.segs.find(s => s.acc >= (lane.loopAt || 0) && (dir === 'right' ? s.bx - s.ax > 50 && Math.abs(s.by - s.ay) < 1 : dir === 'left' ? s.bx - s.ax < -50 && Math.abs(s.by - s.ay) < 1 : dir === 'down' ? s.by - s.ay > 50 && Math.abs(s.bx - s.ax) < 1 : s.by - s.ay < -50 && Math.abs(s.bx - s.ax) < 1));
          if (!seg) throw new Error('No straight lane ' + dir + ' for ' + e.artAssetId);
          e.dist = seg.acc + seg.len * (.03 + .20 * (e._pressureIndex % 11) / 10);
          const view = dir === 'down' ? 'front' : dir === 'up' ? 'back' : 'side';
          active.set(e.artAssetId + ':' + view, DKART.entry(e.artAssetId).views[view]);
          allocations[dir] = (allocations[dir] || 0) + 1;
        }
        window.__pressure.enabled = true; DK.paused = false; refreshDirectionalDemand(true); window.__pressureSample('round-' + round + '-start');
        const allStills = Object.values(INF_DIRECTIONAL_ART.entries).reduce((sum, e) => sum + Object.values(e.views).reduce((n, v) => n + v.cell * v.cell * 4, 0), 0);
        return { allocations, activeSheets: active.size, requestedSheetBytes: [...active.values()].reduce((n, v) => n + v.cell * v.cell * v.frames * 4, 0), requestedStillBytes: allStills };
      }, round);
      // Real game ticks select poses. Optional jobs may remain budget-blocked, so never wait for an empty queue.
      await page.waitForTimeout(2600);
      const end = await page.evaluate(() => { window.__pressureSample('round-end'); const { records, ...cache } = DKART.state(); return { count: DK.enemies.length, phase: DK.phase, cache, issues: [...window.__pressure.issueSet], draws: window.__pressure.draws }; });
      report.rounds.push({ round, ...start, ...end });
      assert.equal(end.count, 200, 'all real enemies remain alive'); assert.equal(end.phase, 'playing'); assert.deepEqual(end.issues, []);
      assert.ok(start.requestedSheetBytes + start.requestedStillBytes + mandatoryBytes > budget, 'fixture actually exceeds decoded budget');
      if (round === 0 || round === 7) await page.screenshot({ path: path.join(out, prefix + '200-enemies-round-' + round + '.png') });
      console.log('pressure round', round + 1, 'draws', end.draws, 'MiB', (end.cache.trackedBytes / 1048576).toFixed(2), 'evictions', end.cache.evictions);
    }
    report.observation = await page.evaluate(() => {
      const s = window.__pressure;
      return { draws: s.draws, visibleDraws: s.visibleDraws, clippedDraws: s.clippedDraws, entityIndices: [...s.entities].sort((a, b) => a - b), actors: Object.values(s.actors), issues: [...s.issueSet], samples: s.samples,
        identities: Object.values(s.rows).map(r => ({ ...r, entities: [...r.entities], directions: Object.fromEntries(Object.entries(r.directions).map(([k, v]) => [k, { ...v, sheetPoses: v.sheetPoses.size, sheetFrameIndices: [...v.sheetPoses].sort((a, b) => a - b), sheetCanvases: v.sheetCanvases.size, phaseBins: [...v.phaseBins].sort((a, b) => a - b) }])) })) };
    });
    assert.deepEqual(report.observation.issues, []);
    assert.equal(report.observation.entityIndices.length, 200, 'every physical enemy actually drawn');
    assert.equal(report.observation.visibleDraws, report.observation.draws, 'every observed enemy foreground intersects actual canvas');
    for (const actor of report.observation.actors) {
      assert.equal(actor.visibleDraws, actor.draws, 'physical enemy ' + actor.index + ' actual canvas visibility');
      assert.ok(actor.lastWalk > actor.firstWalk && actor.lastAnimT > actor.firstAnimT, 'physical enemy ' + actor.index + ' naturally advances');
    }
    assert.deepEqual(report.observation.identities.map(r => r.id).sort(), ids, 'every identity actually drawn');
    for (const row of report.observation.identities) {
      assert.deepEqual(Object.keys(row.directions).sort(), ['down', 'left', 'right', 'up'], row.id + ' drawn in all four directions');
      assert.ok(row.lastWalk > row.firstWalk && row.lastAnimT > row.firstAnimT, row.id + ' actual movement advances');
      for (const [dir, r] of Object.entries(row.directions)) {
        assert.equal(r.visibleDraws, r.draws, row.id + ':' + dir + ' foreground drawn on canvas');
        assert.ok(r.phaseBins.length > 1 && r.phaseMax > r.phaseMin, row.id + ':' + dir + ' numeric animation phase advances');
      }
    }
    const directions = report.observation.identities.flatMap(r => Object.values(r.directions));
    report.renderTotals = {
      sheetDraws: directions.reduce((n, r) => n + (r.kinds.sheet || 0), 0),
      stillDraws: directions.reduce((n, r) => n + (r.kinds.still || 0), 0),
      inlineFallbackDraws: directions.reduce((n, r) => n + (r.kinds.fallback || 0), 0),
      animatedIdentityDirections: directions.filter(r => r.sheetPoses > 1).length,
      observedIdentityDirections: directions.length
    };
    assert.ok(report.renderTotals.sheetDraws > 0 && report.renderTotals.animatedIdentityDirections > 0, 'real sheet animation drawn under pressure');
    assert.ok(report.renderTotals.stillDraws + report.renderTotals.inlineFallbackDraws > 0, 'same-character static fallback exercised');
    report.beforeRemoval = compact(await page.evaluate(() => DKART.state()));
    assert.ok(report.beforeRemoval.evictions > 0, 'direction switching evicts old optional assets');
    assert.ok(report.beforeRemoval.budgetSkips > 0, 'optional requests are budget constrained');
    report.checks.push('Every physical actor and approved identity actually drawn in all four directions with nontransparent bounds intersecting the canvas; finite advancing phase; no legacy or wrong-view frame');
    report.checks.push('Sheets animate where resident; same-character directional stills/inline fallbacks observed under real budget pressure');

    await page.evaluate(() => {
      window.__pressure.enabled = false; clearInterval(window.__pressure.interval);
      DK.enemies = []; DK.corpses = []; DK.spawnQ = []; DK.projs = []; DK.fxs = []; DK.phase = 'title'; VIEW.pid = null;
      refreshDirectionalDemand(true);
    });
    await page.waitForFunction(bytes => { const s = DKART.state(); return !s.running && !s.reservedBytes && s.residentBytes === bytes; }, mandatoryBytes, { timeout: 30000 });
    report.afterRemoval = await page.evaluate(() => DKART.state());
    assert.equal(report.afterRemoval.residentBytes, mandatoryBytes); assert.equal(report.afterRemoval.reservedBytes, 0);
    assert.ok(report.afterRemoval.evictions > report.beforeRemoval.evictions);
    assert.ok(report.afterRemoval.records.every(r => !r.key.endsWith(':fallback') ? r.status !== 'ready' && !r.pin : r.status === 'ready' && r.pin));
    assert.ok(report.afterRemoval.peakTrackedBytes <= budget); assert.ok(report.afterRemoval.maxRunning <= 2);
    assert.equal(report.afterRemoval.failures, 0); assert.deepEqual(report.errors, []);
    report.requestedPngCount = pngRequests.size;
    report.checks.push('Resident + decode reservations and peak remain <=96MiB; at most two loads; zero art errors');
    report.checks.push('Removing actors/future demand evicts every optional asset and restores exact mandatory fallback bytes');
    delete report.currentRound; report.passed = true;
  } catch (error) {
    report.error = error.stack || String(error); process.exitCode = 1; console.error(error);
    if (page && !page.isClosed()) report.failureState = await page.evaluate(() => ({ phase: window.DK?.phase, count: window.DK?.enemies?.length, lives: window.DK?.lives, bossLeak: window.DK?.inf?.bossLeak, cache: window.DKART?.state(), issues: window.__pressure ? [...window.__pressure.issueSet] : [] })).catch(e => ({ error: String(e) }));
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(out, prefix + 'directional-cache-pressure.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(report.passed ? 'PASS' : 'FAIL', report.approvedIds?.length, 'identities', report.renderTotals || {}, path.join(out, prefix + 'directional-cache-pressure.json'));
})();
