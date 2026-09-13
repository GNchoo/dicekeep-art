// Runtime/art delivery regression for the reviewed corrected biped rigs. Only the test
// response exposes game internals; production code and game art are not replaced.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { launchBrowser, gameUrl, watchArtErrors } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..'), baseline = '5630cdd';
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/biped-knees-runtime'));
const read = file => fs.readFileSync(path.join(repo, file));
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = text => { const context = { window: {} }; vm.runInNewContext(text, context, { timeout: 1000 }); return JSON.parse(JSON.stringify(Object.values(context.window)[0])); };
const fullRigEntries = JSON.parse(read('tools/art-review/biped-knees-110/rigs.json')).entries;
const legacyEntries = JSON.parse(read('tools/art-review/biped-knees-110/legacy-front-back-rigs.json')).entries;
const changed = [...fullRigEntries, ...legacyEntries];
const changedIds = new Set(changed.map(e => e.assetId));
const changedViews = new Map([...fullRigEntries.map(e => [e.assetId, ['side', 'front', 'back']]), ...legacyEntries.map(e => [e.assetId, ['front', 'back']])]);
const preservedAvianIds = ['w075', 'w176'], expectedViews = [...changedViews.values()].reduce((n, views) => n + views.length, 0);
assert.ok(changed.length > 0); assert.equal(changedIds.size, changed.length, 'duplicate correction identity');
for (const id of preservedAvianIds) assert.equal(changedIds.has(id), false, id + ': authored bird hock must remain unchanged');
const report = { baseline, scope: 'Real game spawn/direction/placement and served image integrity in desktop Chrome viewports; not native device performance or visual anatomy approval.', passed: false };
fs.mkdirSync(out, { recursive: true });

function metadataAndFiles() {
  const previous = {}, current = {}, previousVersions = {};
  for (const file of ['directional-art.js', 'extreme-art.js']) {
    const oldManifest = manifest(git(['show', baseline + ':' + file]));
    Object.assign(previous, oldManifest.entries);
    for (const [id, entry] of Object.entries(oldManifest.entries)) previousVersions[id] = Object.fromEntries(Object.entries(entry.views).map(([name, view]) => [name, view.assetVersion ?? oldManifest.version]));
    Object.assign(current, manifest(read(file).toString('utf8')).entries);
  }
  assert.deepEqual(Object.keys(current).sort(), Object.keys(previous).sort());
  assert.equal(Object.keys(current).length, 221);
  for (const id of preservedAvianIds) {
    assert.ok(previous[id] && current[id], id + ': preserved avian must exist in both rosters');
    assert.deepEqual(current[id], previous[id], id + ': avian hock metadata/fallback changed');
  }
  const tree = new Map(git(['ls-tree', '-r', '-z', baseline]).split('\0').filter(Boolean).map(row => {
    const [head, file] = row.split('\t'); return [file, head.split(' ')[2]];
  }));
  const sameFiles = new Set(), downloads = [];
  const geometry = (entry, views) => {
    const copy = structuredClone(entry);
    for (const name of views) {
      const view = copy.views[name];
      delete view.assetVersion; delete view.fallback;
      for (const key of ['still', 'sheet']) view[key] = view[key].replace(/\.(png|webp)$/, '.image');
    }
    return copy;
  };
  for (const [id, entry] of Object.entries(current)) {
    if (!changedIds.has(id)) {
      assert.deepEqual(entry, previous[id], id + ': unrelated metadata changed');
      for (const view of Object.values(entry.views)) for (const key of ['still', 'sheet']) sameFiles.add(view[key]);
      continue;
    }
    const selectedViews = changedViews.get(id);
    assert.deepEqual(geometry(entry, selectedViews), geometry(previous[id], selectedViews), id + ': identity/scale/pivot/gait metadata changed');
    for (const [name, view] of Object.entries(entry.views)) {
      if (!selectedViews.includes(name)) {
        assert.deepEqual(view, previous[id].views[name], id + ':' + name + ': untouched legacy direction changed');
        for (const key of ['still', 'sheet']) sameFiles.add(view[key]);
        continue;
      }
      assert.equal(view.assetVersion, 110, id + ':' + name + ' must bypass older view overrides');
      downloads.push({ id, view: name, cell: view.cell, cols: view.cols, rows: view.rows,
        fallback: view.fallback, files: ['still', 'sheet'].map(kind => ({ kind, path: view[kind], sha256: sha256(read(view[kind])) })) });
    }
  }
  for (const file of sameFiles) {
    const bytes = read(file), blob = crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(blob, tree.get(file), file + ': unrelated image bytes changed');
  }
  report.integrity = { changedIdentities: changedIds.size, unchangedIdentities: Object.keys(current).length - changedIds.size,
    unchangedImageFiles: sameFiles.size, changedViews: downloads.length,
    preservedLegacySides: legacyEntries.map(e => e.assetId), preservedAvianIds, stableGeometry: true };
  assert.equal(report.integrity.unchangedIdentities, Object.keys(previous).length - changed.length);
  assert.equal(downloads.length, expectedViews);
  for (const id of preservedAvianIds) for (const view of Object.values(current[id].views)) for (const key of ['still', 'sheet']) {
    assert.ok(sameFiles.has(view[key]), id + ': avian image was not covered by baseline Git blob verification');
  }
  for (const entry of legacyEntries) for (const kind of ['still', 'sheet']) assert.ok(sameFiles.has(current[entry.assetId].views.side[kind]), entry.assetId + ': unchanged legacy side must be byte verified');
  const spawns = changed.map(e => ({ assetId: e.assetId, wave: e.wave, role: e.role,
    viewVersions: Object.fromEntries(['side', 'front', 'back'].map(view => [view, changedViews.get(e.assetId).includes(view) ? 110 : previousVersions[e.assetId][view]])) }));
  return { downloads, spawns };
}

(async () => {
  let browser;
  try {
    const { downloads, spawns } = metadataAndFiles();
    browser = await launchBrowser(); report.viewports = [];
    const source = read('game.js').toString('utf8'), marker = 'window.DK = S;';
    assert.equal(source.split(marker).length, 2, 'game closure hook must be unique');
    const hook = 'Object.assign(window,{buildInfinityWave,spawnEnemy,epos,currentEnemyFrame,enemyFramePlacement,enemyAirHeight}); Object.defineProperty(window,"LANES",{get:()=>LANES}); ';
    for (const [tag, viewport] of [['phone', { width: 440, height: 956 }], ['desktop', { width: 1240, height: 860 }]]) {
      const page = await browser.newPage({ viewport }), errors = watchArtErrors(page);
      await page.route('**/game.js*', route => route.fulfill({ contentType: 'application/javascript', body: source.replace(marker, hook + marker) }));
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      await page.goto(gameUrl()); await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
      const rows = await page.evaluate(entries => {
        DKstartInf('extreme'); DK.paused = true; DK.muted = true; DK.spawnQ = []; DK.autoT = 999; DK.waveActive = false; DK.towers = [];
        const locations = {};
        for (let i = 1; i < 2000; i++) {
          const dist = LANES[0].len * i / 2000, p = epos({ dist, lane: 0 });
          const view = DKappearance.direction(p.dx, p.dy);
          if (view === 'side' && p.dx < 0) continue;
          if (!locations[view]) locations[view] = dist;
        }
        if (Object.keys(locations).length !== 3) throw Error('test lane lacks all three authored views');
        const rows = [];
        for (const item of entries) {
          DK.wave = item.wave; DK.enemies = [];
          for (const queued of buildInfinityWave(item.wave)) { spawnEnemy(queued); if (DK.enemies.at(-1).artAssetId === item.assetId) break; }
          const e = DK.enemies.find(e => e.artAssetId === item.assetId);
          if (!e) throw Error('actual queue never spawned ' + item.assetId);
          DK.enemies = [e]; e.entranceT = -1; e.lane = 0; e.artWalkDistance = 32;
          const entry = DKART.entry(e.artAssetId), views = [];
          for (const [view, dist] of Object.entries(locations)) {
            e.dist = dist; const frame = currentEnemyFrame(e), placement = frame && enemyFramePlacement(frame, e.drawHeight);
            if (!frame) throw Error('missing frame ' + item.assetId + ':' + view);
            views.push({ expected: view, actual: frame.view, frameId: frame.assetId, assetVersion: entry.views[view].assetVersion ?? entry.assetVersion,
              expectedVersion: item.viewVersions[view],
              directional: frame.directional, placement, frameWidth: frame.cv.width, altitude: enemyAirHeight(e, epos(e), frame) });
          }
          // Human-shaped normals can retain burrow locomotion (for example
          // w035); a knee-only art correction must not convert their base move.
          rows.push({ id: item.assetId, actualId: e.artAssetId, role: e.bossRole, expectedRole: item.role === 'secondary' ? 1 : 0,
            move: e.move, expectedMove: e.isBoss ? 'ground' : (e.def.move || 'ground'), views });
        }
        DK.wave = 100; DK.enemies = []; for (const queued of buildInfinityWave(100)) spawnEnemy(queued);
        const bosses = DK.enemies.map(e => { e.entranceT = -1; e.dist = locations.front; const fr = currentEnemyFrame(e); return { id: e.artAssetId, move: e.move, altitude: enemyAirHeight(e, epos(e), fr) }; });
        DK.enemies = []; DK.corpses = []; DK.phase = 'title'; DKART.demand([]);
        return { rows, bosses };
      }, spawns);
      for (const row of rows.rows) {
        assert.equal(row.actualId, row.id); assert.equal(row.move, row.expectedMove, row.id); assert.equal(row.role, row.expectedRole);
        for (const view of row.views) {
          assert.equal(view.frameId, row.id); assert.equal(view.actual, view.expected); assert.equal(view.assetVersion, view.expectedVersion);
          assert.equal(view.directional, true); assert.ok(view.frameWidth > 0); assert.equal(view.altitude, 0);
          assert.ok(Object.values(view.placement).every(Number.isFinite)); assert.ok(view.placement.w > 0 && view.placement.h > 0);
        }
      }
      assert.deepEqual(rows.bosses.map(e => [e.id, e.move]), [['b100', 'ground'], ['b100-2', 'air']]);
      assert.equal(rows.bosses[0].altitude, 0);
      // The flying boss can lower its visible altitude on the top road, so only
      // require finite nonnegative display altitude alongside canonical air move.
      assert.ok(Number.isFinite(rows.bosses[1].altitude) && rows.bosses[1].altitude >= 0);
      const result = { tag, spawns: rows.rows.length, directionalPlacements: rows.rows.reduce((n, r) => n + r.views.length, 0), bosses: rows.bosses, errors };
      report.viewports.push(result);
      if (tag === 'desktop') {
        // Decode at most one large bitmap at once and close it immediately.
        // These checks do not add the full sheet roster to the game's resident cache.
        report.delivery = await page.evaluate(async entries => {
          const counts = { views: 0, sheets: 0, stills: 0, inlineFallbacks: 0, servedSha256Matches: 0, bytes: 0 };
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
          const g = canvas.getContext('2d', { willReadFrequently: true });
          async function decode(blob, width, height, label) {
            const bitmap = await createImageBitmap(blob);
            try {
              if (bitmap.width !== width || bitmap.height !== height) throw Error(label + ': wrong decoded dimensions');
              g.clearRect(0, 0, 64, 64); g.drawImage(bitmap, 0, 0, 64, 64);
              const pixels = g.getImageData(0, 0, 64, 64).data;
              if (!pixels.some((n, i) => i % 4 === 3 && n > 0)) throw Error(label + ': fully transparent image');
            } finally { bitmap.close(); }
          }
          for (const entry of entries) {
            for (const file of entry.files) {
              const url = new URL(file.path, location.href); url.searchParams.set('v', '110');
              const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw Error(response.status + ' ' + url);
              const bytes = await response.arrayBuffer();
              const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
              if (hash !== file.sha256) throw Error(file.path + ': served bytes differ from promoted repository file');
              const sheet = file.kind === 'sheet';
              await decode(new Blob([bytes]), entry.cell * (sheet ? entry.cols : 1), entry.cell * (sheet ? entry.rows : 1), file.path);
              counts[sheet ? 'sheets' : 'stills']++; counts.servedSha256Matches++; counts.bytes += bytes.byteLength;
            }
            const fallback = await (await fetch(entry.fallback)).blob();
            await decode(fallback, 64, 64, entry.id + ':' + entry.view + ':fallback'); counts.inlineFallbacks++; counts.views++;
          }
          canvas.width = canvas.height = 0; return counts;
        }, downloads);
        assert.equal(report.delivery.views, expectedViews); assert.equal(report.delivery.sheets, expectedViews);
        assert.equal(report.delivery.stills, expectedViews); assert.equal(report.delivery.inlineFallbacks, expectedViews);
      }
      await page.waitForFunction(() => !DKART.state().running, null, { timeout: 60000 });
      assert.deepEqual(errors, []); await page.close();
    }
    report.passed = true;
    console.log(`PASS ${changed.length} corrected identities × 3 directions × 2 viewports; ${expectedViews * 2} served images + ${expectedViews} fallbacks; ${report.integrity.unchangedIdentities} unrelated identities unchanged (including w075/w176 avian hocks)`);
  } catch (error) { report.error = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); if (browser) await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
