// 로더 검사: 리깅 지상 8프레임 / 비행 4프레임. 리깅의 발·몸통·미끄러짐은 ground-gait-check.cjs가 별도 검사한다.
const fs = require('node:fs');
const { launchBrowser, gameUrl, outputPath, watchArtErrors } = require('./browser.cjs');

function inspectWalkSheets() {
  const inf = globalThis.DKCONTENT.INFINITY;
  const waves = Array.from({ length: 9 }, (_, i) => i + 1);
  // 향후 준비된 일반 몬스터도 빠뜨리지 않는다.
  for (const tag of inf.artReady) {
    const wave = Number(tag);
    if (Number.isInteger(wave) && inf.monsters[wave] && !inf.monsters[wave].boss && !waves.includes(wave)) waves.push(wave);
  }
  return waves.sort((a, b) => a - b).map(wave => {
    const key = 'infW' + wave + 'Walk', frames = globalThis.DKA[key], mon = inf.monsters[wave];
    const expected = (mon.walk || '2x2').split('x').reduce((a, b) => a * Number(b), 1);
    const rigged = mon.walkStride != null && mon.walkStride !== 0;
    const errors = [];
    if (!Number.isInteger(expected) || expected < 2) errors.push('invalid declared sheet grid');
    if (rigged && (!Number.isFinite(mon.walkStride) || mon.walkStride <= 0)) errors.push('invalid source-pixel walkStride');
    if (rigged && mon.stabilize !== false) errors.push('rigged sheet must preserve authored coordinates with stabilize:false');
    if (!inf.artReady.has(wave) && !inf.artReady.has(String(wave))) errors.push('required wave is not artReady');
    if (!Array.isArray(frames) || frames.length !== expected) errors.push('expected ' + expected + ' frames, got ' + (Array.isArray(frames) ? frames.length : 'missing sheet'));
    const metrics = (Array.isArray(frames) ? frames : []).map((frame, index) => {
      if (!frame || !frame.cv || !Number.isInteger(frame.w) || !Number.isInteger(frame.h) || frame.w <= 0 || frame.h <= 0 || frame.cv.width !== frame.w || frame.cv.height !== frame.h) {
        errors.push('frame ' + index + ': invalid canvas/dimensions'); return null;
      }
      const data = frame.cv.getContext('2d').getImageData(0, 0, frame.w, frame.h).data;
      let top = frame.h, foot = 0, n = 0, sx = 0, sy = 0;
      for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
        if (data[(y * frame.w + x) * 4 + 3] <= 28) continue;
        n++; sx += x; sy += y; top = Math.min(top, y); foot = Math.max(foot, y + 1);
      }
      if (!n) { errors.push('frame ' + index + ': empty silhouette'); return null; }
      return { w: frame.w, h: frame.h, foot, mx: sx / n, my: sy / n, height: foot - top, n };
    });
    const valid = metrics.filter(Boolean);
    if (valid.some(frame => frame.w !== valid[0].w || frame.h !== valid[0].h)) errors.push('inconsistent frame dimensions');
    if (errors.length || !valid.length) return { key, errors, expected, rigged, frames: metrics };
    const span = values => Math.max(...values) - Math.min(...values);
    const air = mon.move === 'air';
    return {
      key, errors, expected, air, rigged, walkStride: mon.walkStride || 0,
      anchorValidation: rigged ? 'excluded: silhouette centroid moves with articulated limbs; ground-gait-check.cjs validates body/sole anchors and world slip' : 'silhouette centroid/anchor threshold (not anatomical gait proof)',
      dims: valid[0].w + '×' + valid[0].h, fh: valid[0].h, frames: metrics,
      foot: span(valid.map(frame => air ? frame.my : frame.foot)), mx: span(valid.map(frame => frame.mx)),
      height: span(valid.map(frame => frame.height)), area: span(valid.map(frame => frame.n)) / Math.max(...valid.map(frame => frame.n)),
    };
  });
}

function rowFailures(row) {
  const failures = [...row.errors];
  if (!row.frames || row.frames.length !== row.expected || row.frames.some(frame => !frame)) failures.push('invalid frame count/data');
  if (failures.length) return failures;
  if (![row.foot, row.mx, row.height, row.area, row.fh].every(Number.isFinite) || row.fh <= 0 || row.frames.some(frame => !Object.values(frame).every(Number.isFinite) || frame.n <= 0)) failures.push('non-finite or empty frame metrics');
  if (!row.rigged && (row.foot / row.fh > 0.02 || row.mx / row.fh > 0.02)) failures.push('anchor jitter exceeds 2% of frame height');
  return failures;
}

function selfTest() {
  const assert = require('node:assert/strict');
  const frame = { w: 100, h: 100, foot: 90, mx: 50, my: 50, height: 80, n: 100 };
  const good = { key: 'test', errors: [], expected: 4, frames: Array(4).fill(frame), foot: 1, mx: 1, height: 0, area: 0, fh: 100 };
  assert.deepEqual(rowFailures(good), []);
  assert.deepEqual(rowFailures({ ...good, rigged: true, expected: 8, frames: Array(8).fill(frame), mx: 18, foot: 4 }), [], 'articulated limb motion must not be rejected as centroid jitter');
  for (const bad of [
    { ...good, frames: [] }, { ...good, frames: [frame, frame, frame] },
    { ...good, frames: [null, frame, frame, frame] }, { ...good, mx: NaN },
    { ...good, frames: [{ ...frame, n: 0 }, frame, frame, frame] }, { ...good, foot: Infinity },
    { ...good, foot: 2.1 }, { ...good, mx: 2.1 },
  ]) assert.ok(rowFailures(bad).length, 'malformed/missing/empty/jittering data must fail');
  // 실제 검사 함수도 DKA의 존재하는 키만 순회해 누락 시트를 놓치지 않아야 한다.
  const previousContent = globalThis.DKCONTENT, previousArt = globalThis.DKA;
  try {
    const pixels = new Uint8ClampedArray(10 * 10 * 4);
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) pixels[(y * 10 + x) * 4 + 3] = 255;
    const sprite = { w: 10, h: 10, cv: { width: 10, height: 10, getContext: () => ({ getImageData: () => ({ data: pixels }) }) } };
    const waves = Array.from({ length: 9 }, (_, i) => i + 1);
    globalThis.DKCONTENT = { INFINITY: { artReady: new Set(waves), monsters: Object.fromEntries(waves.map(wave => [wave, [4, 8].includes(wave) ? { move: 'air' } : { move: 'ground', walk: '4x2', walkStride: 220, stabilize: false }])) } };
    globalThis.DKA = Object.fromEntries(waves.map(wave => ['infW' + wave + 'Walk', Array([4, 8].includes(wave) ? 4 : 8).fill(sprite)]));
    assert.ok(inspectWalkSheets().every(row => !rowFailures(row).length));
    globalThis.DKA.infW1Walk = Array(4).fill(sprite);
    assert.ok(rowFailures(inspectWalkSheets().find(row => row.key === 'infW1Walk')).length, 'old 4-frame rig asset must fail');
    globalThis.DKCONTENT.INFINITY.monsters[2].walkStride = NaN;
    assert.ok(rowFailures(inspectWalkSheets().find(row => row.key === 'infW2Walk')).length, 'invalid source stride must fail');
    globalThis.DKCONTENT.INFINITY.monsters[6].stabilize = true;
    assert.ok(rowFailures(inspectWalkSheets().find(row => row.key === 'infW6Walk')).length, 'per-frame normalization destroys rig coordinates');
    delete globalThis.DKA.infW3Walk;
    assert.ok(rowFailures(inspectWalkSheets().find(row => row.key === 'infW3Walk')).length, 'missing expected sheet must be checked');
    globalThis.DKA.infW4Walk[0] = { ...sprite, cv: { ...sprite.cv, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(400) }) }) } };
    assert.ok(rowFailures(inspectWalkSheets().find(row => row.key === 'infW4Walk')).length, 'empty alpha frame must fail');
    globalThis.DKA.infW5Walk[0] = { ...sprite, w: NaN };
    assert.ok(rowFailures(inspectWalkSheets().find(row => row.key === 'infW5Walk')).length, 'NaN dimensions must fail');
  } finally {
    if (previousContent === undefined) delete globalThis.DKCONTENT; else globalThis.DKCONTENT = previousContent;
    if (previousArt === undefined) delete globalThis.DKA; else globalThis.DKA = previousArt;
  }
  console.log('PASS mixed-frame loader assertion self-test (14 failure cases); rig centroid motion is diagnostic only');
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage(), errors = watchArtErrors(page);
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
    const rows = await page.evaluate(inspectWalkSheets);
    if (!rows.length) throw new Error('No expected walking sheets were checked');
    for (const row of rows) {
      row.failures = rowFailures(row);
      const metrics = row.dims ? row.dims + ': ' + (row.air ? '중심 y' : '발 y') + ' ' + row.foot.toFixed(2) + 'px · 중심 x ' + row.mx.toFixed(2) + 'px · 높이 ' + row.height + 'px · 넓이 ' + (row.area * 100).toFixed(1) + '%' : 'invalid sheet';
      console.log((row.failures.length ? 'FAIL ' : 'PASS ') + row.key + ' ' + row.expected + ' frames · ' + metrics + (row.rigged ? ' · LOADER ONLY: centroid threshold excluded; see ground-gait-check.cjson for gait' : ' · silhouette-anchor check') + (row.failures.length ? ' · ' + row.failures.join('; ') : ''));
    }
    fs.writeFileSync(outputPath('walk-jitter.json'), JSON.stringify({ rows, errors }, null, 2) + '\n');
    console.log('W10: infB10 정지컷 — 걷기 시트 검사 대상 아님. 리깅의 보행·접지 검증은 ground-gait-check.cjs 별도 실행.');
    if (errors.length || rows.some(row => row.failures.length)) throw new Error([...errors, 'Walking sheet validation failed; see walk-jitter.json'].join('\n'));
  } finally { await browser.close(); }
}

if (require.main === module) main().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
module.exports = { inspectWalkSheets, rowFailures };
