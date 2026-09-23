// Runtime/art delivery regression for the reviewed corrected biped rigs. Only the test
// response exposes game internals; production code and game art are not replaced.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { launchBrowser, gameUrl, watchArtErrors } = require('./browser.cjs');
const sharp = require('sharp');
const repo = path.resolve(__dirname, '../..'), baseline = '5630cdd';
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/biped-knees-runtime'));
const read = file => fs.readFileSync(path.join(repo, file));
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const gitBytes = args => execFileSync('git', args, { cwd: repo, maxBuffer: 96 * 1024 * 1024 });
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = text => { const context = { window: {} }; vm.runInNewContext(text, context, { timeout: 1000 }); return JSON.parse(JSON.stringify(Object.values(context.window)[0])); };
const fullRigEntries = JSON.parse(read('tools/art-review/biped-knees-110/rigs.json')).entries;
const legacyEntries = JSON.parse(read('tools/art-review/biped-knees-110/legacy-front-back-rigs.json')).entries;
const changed = [...fullRigEntries, ...legacyEntries];
const changedIds = new Set(changed.map(e => e.assetId));
const changedViews = new Map([...fullRigEntries.map(e => [e.assetId, ['side', 'front', 'back']]), ...legacyEntries.map(e => [e.assetId, ['front', 'back']])]);
// These reviewed repaints changed actual sprites and inline fallbacks after
// the v110 knee-only baseline. Keep this list explicit: any other art change
// must still fail the strict historical comparison below.
const reviewedCasualVersions = new Map([
  ['w001', 127], ['w002', 128], ['w003', 128], ['w004', 128], ['w005', 128], ['w008', 127],
]);
for (const id of reviewedCasualVersions.keys()) if (changedIds.has(id)) changedViews.set(id, ['side', 'front', 'back']);
const preservedAvianIds = ['w075', 'w176'];
const expectedViews = [...changedViews.values()].reduce((n, views) => n + views.length, 0)
  + [...reviewedCasualVersions.keys()].filter(id => !changedIds.has(id)).length * 3;
assert.ok(changed.length > 0); assert.equal(changedIds.size, changed.length, 'duplicate correction identity');
for (const id of preservedAvianIds) assert.equal(changedIds.has(id), false, id + ': authored bird hock must remain unchanged');
const report = { baseline, scope: 'Real game spawn/direction/placement and served image integrity in desktop Chrome viewports; not native device performance or visual anatomy approval.', passed: false };
fs.mkdirSync(out, { recursive: true });

// still/sheet 의 끝 확장자만 지운다. geometry() 가 :47 에서 이미 쓰는 관용구와 같은 것으로,
// 무손실 WebP 변환이 파일명을 바꿔도 "해부학·메타데이터가 그대로인가" 라는 이 단언의
// 본래 취지는 유지된다 — stem 과 assetVersion 은 그대로 대조된다.
const formatAgnostic = (entry) => {
  const copy = structuredClone(entry);
  for (const view of Object.values(copy.views)) for (const key of ['still', 'sheet']) view[key] = view[key].replace(/\.(png|webp)$/, '.image');
  return copy;
};

async function metadataAndFiles() {
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
    assert.deepEqual(formatAgnostic(current[id]), formatAgnostic(previous[id]), id + ': avian hock metadata/fallback changed');
  }
  const tree = new Map(git(['ls-tree', '-r', '-z', baseline]).split('\0').filter(Boolean).map(row => {
    const [head, file] = row.split('\t'); return [file, head.split(' ')[2]];
  }));
  const sameFiles = new Set(), downloads = [];
  const geometry = (entry, views) => {
    // 확장자는 **모든** view 에서 지운다 — 보정 대상이 아닌 방향(레거시 side 등)도
    // 무손실 변환으로 파일명이 바뀌므로, 선택된 view 만 정규화하면 거기서 어긋난다.
    const copy = formatAgnostic(entry);
    for (const name of views) { const view = copy.views[name]; delete view.assetVersion; delete view.fallback; }
    return copy;
  };
  const collectReviewed = (id, entry) => {
    const expectedVersion = reviewedCasualVersions.get(id);
    const now = structuredClone(entry), before = structuredClone(previous[id]);
    delete now.views; delete before.views;
    assert.deepEqual(now, before, id + ': identity, role, locomotion, or cadence changed during art review');
    assert.deepEqual(Object.keys(entry.views).sort(), ['back', 'front', 'side']);
    for (const [name, view] of Object.entries(entry.views)) {
      assert.equal(view.assetVersion, expectedVersion, id + ':' + name + ': unexpected reviewed art version');
      assert.equal(view.frames, previous[id].views[name].frames, id + ':' + name + ': animation cadence changed');
      assert.equal(view.cols * view.rows, view.frames, id + ':' + name + ': incomplete walk sheet');
      assert.ok(Number.isInteger(view.cell) && view.cell > 0);
      assert.ok(Array.isArray(view.pivot) && view.pivot.length === 2 && view.pivot.every(n => Number.isFinite(n) && n >= 0 && n <= view.cell));
      assert.ok(Number.isFinite(view.scale) && view.scale > 0);
      assert.ok(view.fallback.startsWith('data:image/webp;base64,'), id + ':' + name + ': inline fallback missing');
      for (const kind of ['still', 'sheet']) {
        const suffix = kind === 'sheet' ? `-walk-${view.cols}x${view.rows}` : '';
        assert.equal(view[kind], `casual/enemies/inf/directional/${id}-${name}${suffix}.webp`);
      }
      downloads.push({ id, view: name, cell: view.cell, cols: view.cols, rows: view.rows,
        fallback: view.fallback, version: expectedVersion,
        files: ['still', 'sheet'].map(kind => ({ kind, path: view[kind], sha256: sha256(read(view[kind])) })) });
    }
  };
  for (const [id, entry] of Object.entries(current)) {
    if (reviewedCasualVersions.has(id)) { collectReviewed(id, entry); continue; }
    if (!changedIds.has(id)) {
      assert.deepEqual(formatAgnostic(entry), formatAgnostic(previous[id]), id + ': unrelated metadata changed');
      for (const view of Object.values(entry.views)) for (const key of ['still', 'sheet']) sameFiles.add(view[key]);
      continue;
    }
    const selectedViews = changedViews.get(id);
    assert.deepEqual(geometry(entry, selectedViews), geometry(previous[id], selectedViews), id + ': identity/scale/pivot/gait metadata changed');
    for (const [name, view] of Object.entries(entry.views)) {
      if (!selectedViews.includes(name)) {
        assert.deepEqual(formatAgnostic({ views: { v: view } }), formatAgnostic({ views: { v: previous[id].views[name] } }), id + ':' + name + ': untouched legacy direction changed');
        for (const key of ['still', 'sheet']) sameFiles.add(view[key]);
        continue;
      }
      assert.equal(view.assetVersion, 110, id + ':' + name + ' must bypass older view overrides');
      downloads.push({ id, view: name, cell: view.cell, cols: view.cols, rows: view.rows,
        fallback: view.fallback, files: ['still', 'sheet'].map(kind => ({ kind, path: view[kind], sha256: sha256(read(view[kind])) })) });
    }
  }
  // 이 단언의 취지는 "무릎 보정이 건드리지 않은 아트는 그대로다" 이다. 무손실 WebP 변환은
  // 바이트를 바꾸되 보이는 픽셀은 바꾸지 않으므로, 바이트가 다르면 baseline 의 .png 를 꺼내
  // **디코드한 RGBA 를 직접 대조**한다. 바이트 대조보다 약한 검사가 아니라, 같은 성질을
  // 인코딩 방식과 무관하게 재는 검사다.
  let reencoded = 0;
  for (const file of sameFiles) {
    const bytes = read(file), blob = crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    if (blob === tree.get(file)) continue;                      // 바이트까지 동일 — 대다수
    const from = tree.has(file) ? file : file.replace(/\.webp$/, '.png');
    assert.ok(tree.has(from), file + ': baseline 에 대응하는 파일이 없다');
    assert.notEqual(from, file, file + ': unrelated image bytes changed');   // 같은 이름인데 내용이 다르면 진짜 변경이다
    const before = sharp(gitBytes(['show', baseline + ':' + from])).ensureAlpha().raw();
    const after = sharp(bytes).ensureAlpha().raw();
    const [a, b] = await Promise.all([before.toBuffer({ resolveWithObject: true }), after.toBuffer({ resolveWithObject: true })]);
    assert.equal(`${a.info.width}x${a.info.height}`, `${b.info.width}x${b.info.height}`, file + ': 재인코딩이 크기를 바꿨다');
    // tools/lib/lossless-webp.mjs 와 **같은 규칙**으로 센다: 알파는 한 바이트도 달라지면 안 되고,
    // RGB 는 알파가 0 인 픽셀(= 화면에 안 보임)에서만 달라도 된다. 그냥 buffer.equals() 로 재면
    // 완전 투명 픽셀의 RGB 때문에 무손실인데도 실패한다.
    let visible = 0;
    for (let i = 0; i < a.data.length; i++) {
      if (a.data[i] === b.data[i]) continue;
      if (i % 4 === 3 || a.data[i - (i % 4) + 3] !== 0) visible++;
    }
    assert.equal(visible, 0, file + ': 재인코딩이 보이는 RGBA 를 바꿨다 (' + visible + ' 바이트)');
    reencoded++;
  }
  const reviewedOnly = [...reviewedCasualVersions.keys()].filter(id => !changedIds.has(id));
  report.integrity = { changedIdentities: changedIds.size + reviewedOnly.length, unchangedIdentities: Object.keys(current).length - changedIds.size - reviewedOnly.length,
    unchangedImageFiles: sameFiles.size, losslesslyReencoded: reencoded, changedViews: downloads.length,
    preservedLegacySides: legacyEntries.map(e => e.assetId).filter(id => !reviewedCasualVersions.has(id)), preservedAvianIds, stableGeometry: true };
  assert.equal(report.integrity.unchangedIdentities, Object.keys(previous).length - changed.length - reviewedOnly.length);
  assert.equal(downloads.length, expectedViews);
  for (const id of preservedAvianIds) for (const view of Object.values(current[id].views)) for (const key of ['still', 'sheet']) {
    assert.ok(sameFiles.has(view[key]), id + ': avian image was not covered by baseline Git blob verification');
  }
  for (const entry of legacyEntries.filter(e => !reviewedCasualVersions.has(e.assetId))) for (const kind of ['still', 'sheet']) assert.ok(sameFiles.has(current[entry.assetId].views.side[kind]), entry.assetId + ': unchanged legacy side must be byte verified');
  const spawns = changed.map(e => ({ assetId: e.assetId, wave: e.wave, role: e.role,
    viewVersions: Object.fromEntries(['side', 'front', 'back'].map(view => [view, changedViews.get(e.assetId).includes(view) ? reviewedCasualVersions.get(e.assetId) ?? 110 : previousVersions[e.assetId][view]])) }));
  return { downloads, spawns };
}

(async () => {
  let browser;
  try {
    const { downloads, spawns } = await metadataAndFiles();
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
