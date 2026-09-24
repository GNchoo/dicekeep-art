#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = JSON.parse(execFileSync(process.execPath, ['tools/golden-slice-jobs.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
}));
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/jobs/golden-slice.json'), 'utf8'));
assert.deepEqual(committed, generated, 'golden-slice.json is stale; regenerate it with tools/golden-slice-jobs.mjs --out=tools/jobs/golden-slice.json');

const style = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/art-style.json'), 'utf8'));
const expectedCounts = { environment: 9, tower: 9, character: 6, ui: 5, vfx: 4 };
const expectedProfiles = { environment: 'environment', tower: 'tower', character: 'character', ui: 'icon', vfx: 'vfx' };
const counts = {};
const ids = new Set();
const targets = new Set();
const outputs = new Set();
for (const job of committed.jobs) {
  assert.ok(job.id && !ids.has(job.id), `duplicate job id: ${job.id}`);
  ids.add(job.id);
  counts[job.category] = (counts[job.category] || 0) + 1;
  assert.ok(Object.hasOwn(style.profiles, job.styleProfile || committed.styleProfile), `${job.id}: unknown styleProfile`);
  assert.equal(job.styleProfile, expectedProfiles[job.category], `${job.id}: wrong styleProfile for ${job.category}`);
  assert.match(job.out, /^gen\/golden-slice\/[a-z-]+\/[a-z0-9-]+$/, `${job.id}: output must stay under gen/golden-slice`);
  assert.equal(job.out.includes('..'), false, `${job.id}: output traversal`);
  assert.equal(outputs.has(job.out), false, `${job.id}: duplicate staging output ${job.out}`);
  outputs.add(job.out);
  assert.ok(job.runtimeTarget && !job.runtimeTarget.startsWith('gen/'), `${job.id}: missing runtime target metadata`);
  const targetExtension = path.extname(job.runtimeTarget).slice(1).toLowerCase().replace('jpeg', 'jpg');
  const outputExtension = String(job.outputFormat || committed.outputFormat || style.generation.outputFormat).toLowerCase().replace('jpeg', 'jpg');
  assert.equal(outputExtension, targetExtension, `${job.id}: candidate format must match runtime target extension`);
  assert.ok(job.runtimeSpec && ['fixed', 'cover', 'trim-contain'].includes(job.runtimeSpec.mode), `${job.id}: missing runtime resize contract`);
  assert.ok(['preserve', 'opaque'].includes(job.runtimeSpec.alpha), `${job.id}: invalid runtime alpha contract`);
  assert.ok(['center', 'bottom-center'].includes(job.runtimeSpec.anchor), `${job.id}: invalid runtime anchor contract`);
  if (job.runtimeSpec.mode === 'trim-contain') {
    assert.ok(Number.isInteger(job.runtimeSpec.maxWidth) && job.runtimeSpec.maxWidth > 0, `${job.id}: invalid maxWidth`);
    assert.ok(Number.isInteger(job.runtimeSpec.maxHeight) && job.runtimeSpec.maxHeight > 0, `${job.id}: invalid maxHeight`);
    assert.ok(Number.isInteger(job.runtimeSpec.trimAlphaThreshold) && job.runtimeSpec.trimAlphaThreshold >= 0 && job.runtimeSpec.trimAlphaThreshold <= 255, `${job.id}: invalid alpha trim threshold`);
  } else {
    assert.ok(Number.isInteger(job.runtimeSpec.width) && job.runtimeSpec.width > 0, `${job.id}: invalid width`);
    assert.ok(Number.isInteger(job.runtimeSpec.height) && job.runtimeSpec.height > 0, `${job.id}: invalid height`);
  }
  assert.equal(targets.has(job.runtimeTarget), false, `${job.id}: duplicate runtime target ${job.runtimeTarget}`);
  targets.add(job.runtimeTarget);
  const targetExists = fs.existsSync(path.join(ROOT, job.runtimeTarget));
  assert.ok(targetExists || job.id === 'golden-boss-w100-doom-lord', `${job.id}: unknown runtime target ${job.runtimeTarget}`);
  if (targetExists) {
    const metadata = await sharp(path.join(ROOT, job.runtimeTarget)).metadata();
    if (job.runtimeSpec.mode === 'trim-contain') {
      assert.ok(metadata.width <= job.runtimeSpec.maxWidth && metadata.height <= job.runtimeSpec.maxHeight, `${job.id}: current target exceeds trim-contain bounds`);
    } else {
      assert.equal(metadata.width, job.runtimeSpec.width, `${job.id}: runtime width contract differs from current target`);
      assert.equal(metadata.height, job.runtimeSpec.height, `${job.id}: runtime height contract differs from current target`);
    }
    assert.equal(Boolean(metadata.hasAlpha), job.runtimeSpec.alpha === 'preserve', `${job.id}: runtime alpha contract differs from current target`);
  }
  assert.equal(job.n, 1, `${job.id}: committed golden slice must default to one candidate`);
  for (const ref of job.refs || []) {
    assert.equal(ref.startsWith('tools/art-review/'), false, `${job.id}: browser CI omits the historical art-review archive`);
    assert.equal(fs.existsSync(path.join(ROOT, ref)), true, `${job.id}: missing reference ${ref}`);
  }
}
assert.deepEqual(counts, expectedCounts);
assert.equal(committed.jobs.length, 33);
assert.deepEqual(committed.candidatePolicy, { default: 1, maximum: 2, promotion: 'manual-only' });

const comparison = JSON.parse(execFileSync(process.execPath, [
  'tools/golden-slice-jobs.mjs', '--candidates=2', '--quality=low',
], { cwd: ROOT, encoding: 'utf8' }));
assert.ok(comparison.jobs.every((job) => job.n === 2 && job.quality === 'low'), 'candidate/quality CLI override is incomplete');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dicekeep-golden-slice-'));
try {
  const manifest = path.join(tempRoot, 'dry-manifest.json');
  const stage = path.join(tempRoot, 'stage');
  const dry = spawnSync(process.execPath, [
    'tools/img-gen.mjs',
    'tools/jobs/golden-slice.json',
    '--dry',
    `--out=${stage}`,
    `--manifest=${manifest}`,
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr || dry.stdout);
  const record = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert.equal(record.status, 'dry-run');
  assert.equal(record.jobs.length, 33);
  assert.ok(record.jobs.every((job) => job.status === 'dry-run'));
  assert.deepEqual(
    record.jobs.map(({ id, category, runtimeTarget, runtimeSpec }) => ({ id, category, runtimeTarget, runtimeSpec })),
    committed.jobs.map(({ id, category, runtimeTarget, runtimeSpec }) => ({ id, category, runtimeTarget, runtimeSpec })),
    'dry-run manifest must preserve review and promotion metadata',
  );
  assert.ok(record.jobs.every((job) => path.resolve(ROOT, job.outputs[0].path).startsWith(path.resolve(tempRoot))));
  assert.equal(fs.existsSync(stage), false, 'dry run must not create image outputs');
} finally {
  const tempBase = `${path.resolve(os.tmpdir())}${path.sep}`;
  assert.ok(path.resolve(tempRoot).startsWith(tempBase), 'refusing to clean outside temp');
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(`Golden-slice jobs OK: ${committed.jobs.length} jobs (${Object.entries(counts).map(([name, count]) => `${name} ${count}`).join(', ')})`);
