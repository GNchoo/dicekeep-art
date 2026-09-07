// Synthetic regressions for destructive keying and accidental publication of invalid walk sheets.
// Run: node --test tools/sheet-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import sharp from 'sharp';
import { analyzeCell, foregroundMask, gridCells, loadRaw, readBackgroundSeeds, parseGrid, validateFrames } from './lib/sheet.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const keying = vm.createContext({});
vm.runInContext(game.slice(game.indexOf('function isKeyPixel'), game.indexOf('function bbox')), keying);
const pixel = (raw, x, y, rgba) => raw.data.set(rgba, (y * raw.W + x) * 4);
const rawImage = (W, H, background = 'runtime') => ({ W, H, background, data: Buffer.alloc(W * H * 4) });
function rectangle(raw, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) pixel(raw, x, y, [120, 40, 20, 255]);
}
async function fixture(t, frames, { multi = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dicekeep-sheet-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const raw = rawImage(multi ? 128 : 64, multi ? 32 : 64);
  for (let i = 0; i < frames.length; i++) {
    if (!frames[i]) continue;
    const [w, h] = frames[i], cx = (multi ? i : i % 2) * 32, cy = multi ? 0 : Math.floor(i / 2) * 32;
    rectangle(raw, cx + 6, cy + 25 - h, w, h);
  }
  const input = path.join(dir, 'input.png');
  await sharp(raw.data, { raw: { width: raw.W, height: raw.H, channels: 4 } }).png().toFile(input);
  return { dir, input };
}
function run(tool, ...args) {
  return spawnSync(process.execPath, [path.join(root, 'tools', tool), ...args], { cwd: root, encoding: 'utf8' });
}

test('default mask matches runtime flood fill and preserves enclosed gray/white/partial alpha', () => {
  const raw = rawImage(10, 10);
  rectangle(raw, 1, 1, 8, 8);
  pixel(raw, 3, 3, [215, 215, 215, 255]);
  pixel(raw, 4, 3, [255, 255, 255, 255]);
  pixel(raw, 5, 3, [80, 70, 60, 90]);
  pixel(raw, 6, 3, [80, 70, 60, 0]);
  const id = { data: new Uint8Array(raw.data) };
  keying.keyImageData(id, raw.W, raw.H);
  const expected = Array.from({ length: raw.W * raw.H }, (_, i) => id.data[i * 4 + 3] > 28 ? 1 : 0);
  assert.deepEqual([...foregroundMask(raw)], expected);
  assert.equal(analyzeCell(raw, 0, 0, 10, 10).n, 63);
  assert.equal(foregroundMask(raw)[3 * 10 + 3], 1);
  assert.equal(foregroundMask(raw)[3 * 10 + 5], 1);
  assert.equal(foregroundMask(raw)[3 * 10 + 6], 0);
});

test('explicit checkerboard extraction removes white and gray background but keeps interior highlights', () => {
  const raw = rawImage(12, 12, 'checkerboard');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const c = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 224 : 255;
    pixel(raw, x, y, [c, c, c, 255]);
  }
  rectangle(raw, 3, 3, 6, 6);
  pixel(raw, 5, 5, [215, 215, 215, 255]);
  pixel(raw, 6, 5, [255, 255, 255, 255]);
  assert.equal(foregroundMask(raw)[0], 0);
  assert.equal(foregroundMask(raw)[2], 0);
  assert.equal(analyzeCell(raw, 0, 0, 12, 12).n, 36);
  // White is intentionally not added to the runtime keying rule.
  assert.equal(foregroundMask({ ...raw, background: 'runtime' })[0], 1);
});

test('reject invalid grids and missing frames; retain fractional cell boundaries for 5-row sources', () => {
  for (const grid of ['0x2', '2x0', 'NaNx2', '2.5x2', '-2x2']) assert.throws(() => parseGrid(grid, null));
  assert.throws(() => gridCells(8, 8, { cols: 9, rows: 2 }));
  assert.throws(() => gridCells(8, 8, { cols: 2.5, rows: 2 }));
  assert.equal(gridCells(1024, 1536, { cols: 4, rows: 5 }).cells.length, 20);
  assert.throws(() => validateFrames([{ n: 36, fill: 0.1 }, { n: 0, fill: 0 }]), /frames: 2/);
});

test('sheet-check rejects one missing frame before overwriting either deliverable', async (t) => {
  const { dir, input } = await fixture(t, [[14, 12], [14, 12], [14, 12], null]);
  const sheet = path.join(dir, 'sheet.png'), still = path.join(dir, 'still.png');
  fs.writeFileSync(sheet, 'existing-sheet'); fs.writeFileSync(still, 'existing-still');
  const result = run('sheet-check.mjs', input, `--sheet-out=${sheet}`, `--still-out=${still}`);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /empty or underfilled frames: 4/);
  assert.equal(fs.readFileSync(sheet, 'utf8'), 'existing-sheet');
  assert.equal(fs.readFileSync(still, 'utf8'), 'existing-still');
});

test('sheet-check rejects explicit invalid grid before creating outputs', async (t) => {
  const { dir, input } = await fixture(t, [[14, 12], [8, 20], [18, 9], [10, 17]]);
  for (const grid of ['0x2', 'bad', '2.5x2']) {
    const output = path.join(dir, `${grid}-out.png`);
    const result = run('sheet-check.mjs', input, `--grid=${grid}`, `--sheet-out=${output}`);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(fs.existsSync(output), false);
  }
});

test('static walk is rejected by check and split without overwriting old assets', async (t) => {
  const checked = await fixture(t, Array(4).fill([14, 12]));
  const output = path.join(checked.dir, 'out.png');
  const check = run('sheet-check.mjs', checked.input, `--sheet-out=${output}`);
  assert.equal(check.status, 1, check.stderr); assert.equal(fs.existsSync(output), false);
  const split = await fixture(t, Array(4).fill([14, 12]), { multi: true });
  const oldSheet = path.join(split.dir, 'w001-walk-2x2.png'), oldStill = path.join(split.dir, 'w001.png');
  fs.writeFileSync(oldSheet, 'old-sheet'); fs.writeFileSync(oldStill, 'old-still');
  const result = run('sheet-split.mjs', split.input, '--rows=w001', `--out-dir=${split.dir}`);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(fs.readFileSync(oldSheet, 'utf8'), 'old-sheet');
  assert.equal(fs.readFileSync(oldStill, 'utf8'), 'old-still');
});

test('valid animated row splits into four nonempty transparent frames and a still', async (t) => {
  const { dir, input } = await fixture(t, [[14, 12], [8, 20], [18, 9], [10, 17]], { multi: true });
  const result = run('sheet-split.mjs', input, '--rows=w001', '--cell=32', `--out-dir=${dir}`);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const raw = await loadRaw(path.join(dir, 'w001-walk-2x2.png'));
  assert.equal(raw.W, 64); assert.equal(raw.H, 64); assert.equal(raw.data[3], 0);
  const { cells, fw, fh } = gridCells(raw.W, raw.H, { cols: 2, rows: 2 });
  validateFrames(cells.map(([cx, cy]) => analyzeCell(raw, cx, cy, fw, fh)));
  assert.equal(fs.existsSync(path.join(dir, 'w001.png')), true);
});

async function layoutFixture(t) {
  const { dir, input } = await fixture(t, []);
  const raw = rawImage(64, 96);
  for (const x of [8, 40]) {
    rectangle(raw, x, 6, 14, 16);
    for (let y = 70; y < 86; y++) for (let px = x; px < x + 14; px++) pixel(raw, px, y, [20, 80, 150, 255]);
  }
  // The middle source row has a weapon/body spanning every candidate column cut.
  rectangle(raw, 20, 40, 24, 16);
  await sharp(raw.data, { raw: { width: raw.W, height: raw.H, channels: 4 } }).png().toFile(input);
  return { dir, input };
}

test('sheet-layout refuses a row boundary through artwork before overwriting outputs', async (t) => {
  const { dir, input } = await layoutFixture(t);
  const output = path.join(dir, 'layout.png');
  fs.writeFileSync(output, 'existing-layout'); fs.writeFileSync(output + '.json', 'existing-metadata');
  const result = run('sheet-layout.mjs', input, '--cols=2', '--row-cuts=0,16,96', `--out=${output}`);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /row boundary 16 cuts artwork/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing-layout');
  assert.equal(fs.readFileSync(output + '.json', 'utf8'), 'existing-metadata');
});

test('sheet-layout refuses a missing column gutter before publishing any partially processed rows', async (t) => {
  const { dir, input } = await layoutFixture(t);
  const output = path.join(dir, 'layout.png');
  const result = run('sheet-layout.mjs', input, '--cols=2', '--row-cuts=0,32,64,96', `--out=${output}`);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /row 2 column 1 has no empty gutter/);
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(output + '.json'), false);
});

test('sheet-layout skips a rejected source row and preserves explicit selected-row order', async (t) => {
  const { dir, input } = await layoutFixture(t);
  const output = path.join(dir, 'layout.png');
  const result = run('sheet-layout.mjs', input, '--cols=2', '--cell=32', '--row-cuts=0,32,64,96', '--select-rows=3,1', `--out=${output}`);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const normalized = await loadRaw(output), report = JSON.parse(fs.readFileSync(output + '.json', 'utf8'));
  assert.equal(normalized.W, 64); assert.equal(normalized.H, 64);
  assert.deepEqual(report.selected, [3, 1]);
  assert.deepEqual(report.report.map(row => row.row), [1, 3]);
  assert.deepEqual([...normalized.data.subarray((16 * 64 + 16) * 4, (16 * 64 + 16) * 4 + 4)], [20, 80, 150, 255]);
  assert.deepEqual([...normalized.data.subarray((48 * 64 + 16) * 4, (48 * 64 + 16) * 4 + 4)], [120, 40, 20, 255]);
  const { fw, fh, cells } = gridCells(normalized.W, normalized.H, { cols: 2, rows: 2 });
  validateFrames(cells.map(([cx, cy]) => analyzeCell(normalized, cx, cy, fw, fh)));
});

test('reviewed seeds remove only the selected enclosed background component and preserve separate highlights', () => {
  const raw = rawImage(12, 12, 'checkerboard');
  rectangle(raw, 1, 1, 10, 10);
  pixel(raw, 5, 5, [255, 255, 255, 255]); pixel(raw, 5, 6, [220, 220, 220, 255]);
  pixel(raw, 8, 4, [255, 255, 255, 255]); pixel(raw, 8, 5, [80, 70, 60, 90]);
  const before = foregroundMask(raw), after = foregroundMask({ ...raw, backgroundSeeds: [[5, 5]] });
  assert.equal(before[5 * 12 + 5], 1);
  assert.equal(after[5 * 12 + 5], 0); assert.equal(after[6 * 12 + 5], 0);
  assert.equal(after[4 * 12 + 8], 1); assert.equal(after[5 * 12 + 8], 1);
  assert.equal(before.reduce((n, a, i) => n + (a !== after[i] ? 1 : 0), 0), 2);
});

test('background seeds reject invalid coordinates, artwork colors, wrong mode and stale source metadata', async (t) => {
  const raw = rawImage(12, 12, 'checkerboard'); rectangle(raw, 1, 1, 10, 10);
  for (const backgroundSeeds of [null, [[1]], [[1.5, 2]], [[-1, 0]], [[12, 0]], [[2, 2]]]) assert.throws(() => foregroundMask({ ...raw, backgroundSeeds }));
  assert.throws(() => foregroundMask({ ...raw, background: 'runtime', backgroundSeeds: [[0, 0]] }), /require background=checkerboard/);
  assert.deepEqual(readBackgroundSeeds('[[5,5]]', 'unused.png'), [[5, 5]]);
  const { dir, input } = await fixture(t, [[14, 12]]), metadata = path.join(dir, 'seeds.json');
  fs.writeFileSync(metadata, JSON.stringify({ sources: { 'input.png': { sha256: 'stale', backgroundSeeds: [[5, 5]] } } }));
  assert.throws(() => readBackgroundSeeds(metadata, input), /SHA256 mismatch/);
  assert.throws(() => readBackgroundSeeds(metadata, path.join(dir, 'another.png')), /no source another.png/);
  const out = path.join(dir, 'invalid-seed-output.png');
  const result = run('sheet-check.mjs', input, '--background=checkerboard', '--background-seeds=[[999,999]]', `--sheet-out=${out}`);
  assert.equal(result.status, 1); assert.match(result.stderr, /outside the image/); assert.equal(fs.existsSync(out), false);
});

test('single-frame still extraction does not report a failed static walk cycle', async (t) => {
  const { dir, input } = await fixture(t, [[14, 12]]), out = path.join(dir, 'still.png');
  const result = run('sheet-check.mjs', input, '--grid=1x1', `--still-out=${out}`);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /정지컷 1장/); assert.doesNotMatch(result.stdout, /거의 안 움직임|재생성/);
  assert.equal(fs.existsSync(out), true);
});
