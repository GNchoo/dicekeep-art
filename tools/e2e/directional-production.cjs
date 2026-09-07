// Deployment verification; opt in with an explicit directory URL.
// E2E_BASE_URL=https://example/ node tools/e2e/directional-production.cjs
// Downloads all 674 final PNGs once (about 122 MB). Never replaces HTTP responses.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { launchBrowser } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..');
const codeFiles = ['index.html', 'game.js', 'content.js', 'infinity-art.js', 'directional-art.js'];
const waves = [1, 70, 100, 101];
const expectedIds = ['w001', 'b070', 'b070-2', 'b100', 'b100-2', 'w101'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function baseUrl(input) {
  assert.ok(input, 'E2E_BASE_URL is required; no implicit production target');
  const u = new URL(input);
  assert.ok(['http:', 'https:'].includes(u.protocol), 'HTTP(S) base required');
  assert.ok(!u.username && !u.password && !u.search && !u.hash, 'Use a directory URL without credentials/query/fragment');
  assert.ok(!/\.[a-z0-9]+$/i.test(u.pathname), 'Use the application directory, not index.html');
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u;
}
function compare(bytes, expected, label) { assert.equal(sha(bytes), expected, 'HTTP/source SHA256 mismatch: ' + label); }
if (process.argv.includes('--self-test')) {
  assert.throws(() => baseUrl());
  for (const u of ['file:///tmp/', 'https://user:pass@example.test/', 'https://example.test/index.html', 'https://example.test/?x=1']) assert.throws(() => baseUrl(u));
  assert.equal(baseUrl('http://localhost:8137').href, 'http://localhost:8137/');
  assert.throws(() => compare(Buffer.from('old'), sha(Buffer.from('new')), 'fixture'));
  console.log('PASS 7 production-check guard cases');
  process.exit(0);
}
const base = baseUrl(process.env.E2E_BASE_URL);
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/production'));
fs.mkdirSync(out, { recursive: true });
const sourcePins = Object.fromEntries(codeFiles.map(f => [f, sha(fs.readFileSync(path.join(repo, f)))]));
const report = { version: 1, baseUrl: base.href, startedAt: new Date().toISOString(),
  scope: 'Unmodified server responses and PNG bytes. Public debug state selects waves/positions; wrappers only observe the original frame factory and drawImage calls. This is sampled deployment verification, not the exhaustive source release audit.',
  checkerSha256: sha(fs.readFileSync(__filename)), sourcePins, passed: false, http: { codes: [], images: [], maxConcurrent: 0 }, devices: [], errors: [] };
let running = 0;
async function fetchChecked(url, file) {
  const u = new URL(url); u.searchParams.set('deploymentQA', report.startedAt);
  running++; report.http.maxConcurrent = Math.max(report.http.maxConcurrent, running);
  try {
    const response = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200, 'HTTP status: ' + file);
    const bytes = Buffer.from(await response.arrayBuffer()), expected = sha(fs.readFileSync(path.join(repo, file)));
    compare(bytes, expected, file);
    return { row: { path: file, sha256: expected, bytes: bytes.length, status: response.status }, bytes };
  } finally { running--; }
}
async function screenshot(page, name) {
  await sharp(await page.screenshot({ fullPage: true })).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(path.join(out, name + '.jpg'));
}
function compactCache(c) {
  return { approvedEntries: c.approvedEntries, initialized: c.initialized, invalidReady: c.invalidReady,
    readyFallbacks: c.records.filter(r => r.key.endsWith(':fallback') && r.status === 'ready').length,
    residentBytes: c.residentBytes, peakTrackedBytes: c.peakTrackedBytes, maxRunning: c.maxRunning, budget: c.budget };
}
async function main() {
  const index = await fetchChecked(new URL('index.html', base), 'index.html'); report.http.codes.push(index.row);
  const scriptUrls = [...index.bytes.toString('utf8').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => new URL(m[1], new URL('index.html', base)));
  for (const file of codeFiles.slice(1)) {
    const url = scriptUrls.find(u => u.pathname.split('/').at(-1) === file);
    assert.ok(url, 'Actual index must load ' + file);
    const r = await fetchChecked(url, file); report.http.codes.push(r.row);
  }
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(repo, 'directional-art.js'), 'utf8'), context);
  const entries = context.window.INF_DIRECTIONAL_ART.entries;
  assert.equal(Object.keys(entries).length, 110); assert.ok(Object.values(entries).every(e => e.ready));
  for (const id of expectedIds) assert.ok(entries[id], 'Missing release identity ' + id);
  const directional = [...new Set(Object.values(entries).flatMap(e => Object.values(e.views).flatMap(v => [v.still, v.sheet])))];
  assert.equal(directional.length, 660);
  const images = [...directional, ...Array.from({ length: 14 }, (_, i) => 'casual/towers/star-' + String(i + 7).padStart(2, '0') + '.png')];
  let next = 0, fetchError;
  // Drain in-flight requests before writing failure evidence, and stop assigning
  // work after the first bad deployment asset.
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < images.length && !fetchError) {
      const file = images[next++];
      try { const r = await fetchChecked(new URL(file, base), file); report.http.images.push(r.row); }
      catch (e) { fetchError ||= e; }
    }
  }));
  if (fetchError) throw fetchError;
  report.http.images.sort((a, b) => a.path.localeCompare(b.path));
  assert.equal(report.http.images.length, 674); assert.ok(report.http.maxConcurrent <= 4);
  report.http.pngBytes = report.http.images.reduce((n, r) => n + r.bytes, 0);
  console.log('HTTP PASS 5 code files + 674 PNGs;', report.http.pngBytes, 'PNG bytes; max concurrent', report.http.maxConcurrent);
  const requiredPaths = new Set([...images, ...codeFiles].map(f => new URL(f, base).pathname));
  const browser = await launchBrowser();
  try {
    for (const [device, viewport] of [['desktop', { width: 1240, height: 860 }], ['phone', { width: 440, height: 956 }]]) {
      const ctx = await browser.newContext({ viewport }), page = await ctx.newPage();
      const row = { device, viewport, codes: [], newAssetResponses: 0, errors: [], actors: [] }, pending = [];
      report.devices.push(row);
      page.on('pageerror', e => row.errors.push('PAGE ' + e.message));
      page.on('requestfailed', r => { if (requiredPaths.has(new URL(r.url()).pathname)) row.errors.push('REQUEST ' + r.url() + ': ' + r.failure()?.errorText); });
      page.on('response', response => {
        const u = new URL(response.url());
        // Workers redirects /index.html to the application directory. Hash the
        // final main-document bytes as index.html, while still rejecting bad assets.
        const mainDocument = response.request().isNavigationRequest() && response.frame() === page.mainFrame()
          && u.origin === base.origin && [base.pathname, new URL('index.html', base).pathname].includes(u.pathname);
        if (!requiredPaths.has(u.pathname) && !mainDocument) return;
        if (mainDocument && response.status() >= 300 && response.status() < 400) return;
        if (response.status() !== 200) row.errors.push('HTTP ' + response.status() + ': ' + u.href);
        const name = mainDocument ? 'index.html' : u.pathname.split('/').at(-1);
        if (codeFiles.includes(name)) pending.push(response.body().then(bytes => { compare(bytes, sourcePins[name], name); row.codes.push({ file: name, sha256: sha(bytes), status: response.status() }); }).catch(e => row.errors.push(e.message)));
        else row.newAssetResponses++;
      });
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      const url = new URL('index.html', base); url.searchParams.set('net', 'off'); url.searchParams.set('unlock', 'all'); url.searchParams.set('deploymentQA', report.startedAt);
      await page.goto(url.href); await page.waitForFunction(() => window.DK && DK.phase === 'title' && DKART.state().initialized, null, { timeout: 120000 });
      row.boot = compactCache(await page.evaluate(() => DKART.state()));
      assert.equal(row.boot.approvedEntries, 110); assert.equal(row.boot.readyFallbacks, 330); assert.deepEqual(row.boot.invalidReady, []);
      await screenshot(page, device + '-title'); await page.click('#ov-btn');
      await page.evaluate(() => { DK.muted = true; DKstartInf('endless'); DK.speed = 1; DK.gold = 90000; DK.lives = 99999; });
      await page.waitForFunction(() => DK.phase === 'playing');
      row.towers = await page.evaluate(() => {
        document.getElementById('help-close')?.click(); document.getElementById('coach-skip')?.click();
        const frames = DKART.frame, original = CanvasRenderingContext2D.prototype.drawImage, lookup = new WeakMap(), serials = new WeakMap(), bounds = new WeakMap(), towerLookup = new WeakMap(); let serial = 0;
        const towers = [7, 20].map(face => { const s = DKtowerSpr(face, 0); towerLookup.set(s.cv, face); const pixels = s.cv.getContext('2d').getImageData(0, 0, s.w, s.h).data; let hash = 2166136261; for (const v of pixels) hash = Math.imul(hash ^ v, 16777619) >>> 0; return { face, loaded: !!DKA['tStar' + face]?.cv, dedicated: !!s.dedicated, width: s.w, height: s.h, pixelHash: hash }; });
        window.__productionCapture = null; window.__productionDraws = []; window.__productionTowers = [];
        DKART.frame = function (...args) { const f = frames.apply(this, args); if (f) { if (!serials.has(f.cv)) serials.set(f.cv, ++serial); lookup.set(f.cv, { id: f.assetId, view: f.view, key: f.cacheKey, serial: serials.get(f.cv) }); } return f; };
        CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
          const result = original.call(this, source, ...args); if (this.canvas.id !== 'game') return result;
          const tower = towerLookup.get(source); if (tower && !window.__productionTowers.includes(tower)) window.__productionTowers.push(tower);
          const f = lookup.get(source), capture = window.__productionCapture;
          if (!f || !capture || f.id !== capture.id || f.view !== capture.view || !f.key.endsWith(':sheet')) return result;
          const e = DK.enemies.find(e => e.artAssetId === f.id); if (!e) return result;
          if (!bounds.has(source)) { const px = source.getContext('2d').getImageData(0, 0, source.width, source.height).data; let x0 = source.width, y0 = source.height, x1 = 0, y1 = 0; for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (px[(y * source.width + x) * 4 + 3] >= 16) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); } bounds.set(source, { x0, y0, x1, y1 }); }
          const b = bounds.get(source), m = this.getTransform(), [dx, dy, dw, dh] = args.length === 4 ? args : [args[0], args[1], source.width, source.height];
          const p = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([sx, sy]) => { const x = dx + sx * dw / source.width, y = dy + sy * dh / source.height; return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; });
          const box = { x0: Math.min(...p.map(p => p[0])), x1: Math.max(...p.map(p => p[0])), y0: Math.min(...p.map(p => p[1])), y1: Math.max(...p.map(p => p[1])) };
          const area = (box.x1 - box.x0) * (box.y1 - box.y0), visible = Math.max(0, Math.min(this.canvas.width, box.x1) - Math.max(0, box.x0)) * Math.max(0, Math.min(this.canvas.height, box.y1) - Math.max(0, box.y0));
          window.__productionDraws.push({ ...f, distance: e.dist, walk: e.artWalkDistance, animT: e.animT, face: e.face, flipX: m.a < 0, visibleFraction: area ? visible / area : 0, bounds: box });
          if (window.__productionDraws.length > 300) window.__productionDraws.shift(); return result;
        };
        for (const [i, face] of [7, 20].entries()) { DK.heldDie = face; DKplace(i); }
        DK.towers.forEach(t => { t.cd = 1e6; }); return towers;
      });
      assert.ok(row.towers.every(t => t.loaded && t.dedicated && t.height === 96)); assert.notEqual(row.towers[0].pixelHash, row.towers[1].pixelHash);
      await page.waitForFunction(() => window.__productionTowers.length === 2);
      row.towersDrawn = await page.evaluate(() => window.__productionTowers.slice().sort((a, b) => a - b)); assert.deepEqual(row.towersDrawn, [7, 20]);
      for (const wave of waves) {
        const ids = expectedIds.filter(id => Number(id.slice(1, 4)) === wave);
        await page.evaluate(w => { window.__productionCapture = null; DK.paused = false; DK.enemies = []; DK.spawnQ = []; DK.waveActive = false; DK.wave = w - 1; DK.autoT = 0; DKsync(); }, wave);
        await page.click('#wave-btn');
        await page.evaluate(() => { const roles = new Set(DK.enemies.map(e => e.bossRole || 0)); DK.spawnQ = DK.spawnQ.filter(item => { const r = item.bossRole || 0; if (roles.has(r)) return false; roles.add(r); return true; }).map(item => ({ ...item, t: 0 })); });
        await page.waitForFunction(ids => ids.every(id => DK.enemies.some(e => e.artAssetId === id)), ids, { timeout: 20000 });
        const actualIds = await page.evaluate(() => { DK.spawnQ = []; for (const e of DK.enemies) { e.hp = e.max = 1e12; e.entranceT = -1; } return DK.enemies.map(e => e.artAssetId).sort(); });
        assert.deepEqual(actualIds, ids.slice().sort(), 'actual wave roster ' + wave);
        // Let the original entrance ribbon expire so evidence shows the art.
        await page.waitForFunction(() => DK.bannerT <= 0, null, { timeout: 10000 });
        for (const id of ids) {
          const actor = { wave, id, directions: [] }; row.actors.push(actor);
          for (const direction of ['right', 'down', 'left', 'up']) {
            report.current = { device, wave, id, direction }; const view = direction === 'down' ? 'front' : direction === 'up' ? 'back' : 'side';
            await page.evaluate(({ id, direction, view }) => {
              const e = DK.enemies.find(e => e.artAssetId === id), lane = DKLANES()[e.lane || 0];
              const seg = lane.segs.find(s => s.acc >= (lane.loopAt || 0) && (direction === 'right' ? s.bx - s.ax > 50 && Math.abs(s.by - s.ay) < 1 : direction === 'left' ? s.bx - s.ax < -50 && Math.abs(s.by - s.ay) < 1 : direction === 'down' ? s.by - s.ay > 50 && Math.abs(s.bx - s.ax) < 1 : s.by - s.ay < -50 && Math.abs(s.bx - s.ax) < 1));
              if (!seg) throw Error('No actual straight path ' + direction); e.dist = seg.acc + seg.len * .22; e.stunT = e.slowT = 0;
              window.__productionDraws = []; window.__productionCapture = { id, view }; DK.paused = false;
            }, { id, direction, view });
            await page.waitForFunction(() => new Set(window.__productionDraws.filter(r => r.visibleFraction >= .98).map(r => r.serial)).size >= 2, null, { timeout: 20000, polling: 'raf' });
            const sample = await page.evaluate(() => { const r = window.__productionDraws.filter(r => r.visibleFraction >= .98); return { framesObserved: new Set(r.map(r => r.serial)).size, first: r[0], last: r.at(-1), minVisibleFraction: Math.min(...r.map(r => r.visibleFraction)) }; });
            assert.ok(sample.last.walk > sample.first.walk || sample.last.animT > sample.first.animT, id + ' phase must progress');
            assert.equal(sample.last.id, id); assert.equal(sample.last.view, view); assert.equal(sample.last.flipX, direction === 'left');
            actor.directions.push({ direction, view, ...sample });
            if (direction === 'down') await screenshot(page, device + '-' + id + '-front');
          }
        }
        console.log('browser', device, 'wave', wave, ids.join(','));
      }
      await Promise.all(pending); assert.deepEqual([...new Set(row.codes.map(c => c.file))].sort(), codeFiles.slice().sort(), 'Every browser-loaded code response must match');
      row.cache = compactCache(await page.evaluate(() => DKART.state())); assert.ok(row.cache.maxRunning <= 2 && row.cache.peakTrackedBytes <= row.cache.budget); assert.deepEqual(row.errors, []);
      row.passed = true; await ctx.close();
    }
  } finally { await browser.close(); }
  assert.ok(codeFiles.every(f => sourcePins[f] === sha(fs.readFileSync(path.join(repo, f)))), 'Local expected code changed during validation');
  report.summary = { matchedCodeFiles: 5, matchedDirectionalPngs: 660, matchedTowerPngs: 14, devices: 2, actorChecks: report.devices.reduce((n, r) => n + r.actors.length, 0), directionChecks: report.devices.reduce((n, r) => n + r.actors.reduce((s, a) => s + a.directions.length, 0), 0), actualTowerDraws: report.devices.reduce((n, r) => n + r.towersDrawn.length, 0) };
  report.passed = true; delete report.current;
}
main().catch(e => { report.errors.push(e.stack || String(e)); process.exitCode = 1; }).finally(() => {
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(out, 'directional-production.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, baseUrl: report.baseUrl, summary: report.summary, errors: report.errors, current: report.current, output: out }, null, 2));
});
