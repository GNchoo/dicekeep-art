#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

const style = readJson('tools/art-style.json');
assert.match(style.version, /^\d+\.\d+\.\d+$/, 'style version must be semantic');
assert.match(
  style.generation?.model || '',
  /^gpt-image-[\w.-]+-\d{4}-\d{2}-\d{2}$/,
  'art model must use a dated snapshot',
);
assert.ok(['png', 'webp', 'jpeg'].includes(style.generation?.outputFormat));

const requiredProfiles = ['character', 'environment', 'keyart', 'tower', 'icon', 'vfx'];
for (const name of requiredProfiles) {
  const profile = style.profiles?.[name];
  assert.ok(profile, `missing style profile: ${name}`);
  assert.ok(typeof profile.description === 'string' && profile.description.length > 20, `${name} description is too short`);
  assert.ok(typeof profile.style === 'string' && profile.style.length > 120, `${name} style is too short`);
  assert.doesNotMatch(profile.style, /Random Dice|Kingdom Rush/i, `${name} must describe Dicekeep traits directly`);
}

const jobFiles = fs.readdirSync(path.join(ROOT, 'tools/jobs'))
  .filter((name) => name.endsWith('.json'))
  .sort();
assert.ok(jobFiles.length > 0, 'no art job files found');

for (const filename of jobFiles) {
  const relative = `tools/jobs/${filename}`;
  const spec = readJson(relative);
  assert.equal('style' in spec, false, `${relative} duplicates the canonical style string`);
  if (spec.styleProfile != null) {
    assert.ok(Object.hasOwn(style.profiles || {}, spec.styleProfile), `${relative} has unknown styleProfile`);
  }
  assert.ok(Array.isArray(spec.jobs) && spec.jobs.length > 0, `${relative} has no jobs`);
  const ids = new Set();
  for (const job of spec.jobs) {
    assert.ok(job.id && !ids.has(job.id), `${relative} has a missing or duplicate job id`);
    ids.add(job.id);
    assert.equal('style' in job, false, `${relative}:${job.id} duplicates the canonical style string`);
    const profileName = job.styleProfile || spec.styleProfile;
    assert.ok(profileName, `${relative}:${job.id} has no styleProfile`);
    assert.ok(Object.hasOwn(style.profiles || {}, profileName), `${relative}:${job.id} has unknown styleProfile`);
    assert.ok(typeof job.prompt === 'string' && job.prompt.trim(), `${relative}:${job.id} has no prompt`);
    assert.ok(Number.isInteger(job.n || 1) && (job.n || 1) >= 1 && (job.n || 1) <= 10, `${relative}:${job.id} has invalid n`);
    assert.match(job.size || '1024x1024', /^(?:auto|\d+x\d+)$/, `${relative}:${job.id} has invalid size`);
    assert.ok(typeof job.out === 'string' && /^gen\//.test(job.out), `${relative}:${job.id} must stage under gen/`);
    assert.equal(job.out.includes('..'), false, `${relative}:${job.id} output escapes staging`);
    if (job.category != null) assert.match(job.category, /^[a-z][a-z0-9-]*$/, `${relative}:${job.id} has invalid category`);
    if (job.runtimeTarget != null) {
      assert.ok(typeof job.runtimeTarget === 'string' && job.runtimeTarget.length > 0, `${relative}:${job.id} has empty runtimeTarget`);
      assert.equal(job.runtimeTarget.includes('\\'), false, `${relative}:${job.id} runtimeTarget must use forward slashes`);
      assert.equal(path.posix.normalize(job.runtimeTarget), job.runtimeTarget, `${relative}:${job.id} runtimeTarget is not normalized`);
      assert.equal(path.isAbsolute(job.runtimeTarget), false, `${relative}:${job.id} runtimeTarget must be relative`);
      assert.equal(job.runtimeTarget.startsWith('gen/'), false, `${relative}:${job.id} runtimeTarget points back into staging`);
    }
    if (job.runtimeSpec != null) {
      assert.ok(job.runtimeTarget, `${relative}:${job.id} runtimeSpec requires runtimeTarget`);
      assert.ok(['fixed', 'cover', 'trim-contain'].includes(job.runtimeSpec.mode), `${relative}:${job.id} has invalid runtimeSpec mode`);
      assert.ok(['preserve', 'opaque'].includes(job.runtimeSpec.alpha), `${relative}:${job.id} has invalid runtimeSpec alpha`);
      assert.ok(['center', 'bottom-center'].includes(job.runtimeSpec.anchor), `${relative}:${job.id} has invalid runtimeSpec anchor`);
    }
  }
}

function generatedInf(args) {
  const output = execFileSync(process.execPath, ['tools/inf-jobs.mjs', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(output);
}

assert.deepEqual(
  generatedInf(['--waves=1-5']),
  readJson('tools/jobs/inf-w01-05.json'),
  'inf-w01-05.json is stale; regenerate it with tools/inf-jobs.mjs',
);
assert.deepEqual(
  generatedInf(['--waves=1-5', '--refs']),
  readJson('tools/jobs/inf-w01-05-walk.json'),
  'inf-w01-05-walk.json is stale; regenerate it with tools/inf-jobs.mjs --refs',
);
assert.deepEqual(
  generatedInf(['--waves=6-10', '--mode=multi']),
  readJson('tools/jobs/inf-w06-10.json'),
  'inf-w06-10.json is stale; regenerate it with tools/inf-jobs.mjs --mode=multi',
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dicekeep-art-pipeline-'));
const styleFile = path.join(ROOT, 'tools/art-style.json');
function runDry(name, spec, { manifest, outputRoot } = {}) {
  const jobFile = path.join(tempRoot, `${name}.json`);
  const stage = outputRoot || path.join(tempRoot, `${name}-stage`);
  const record = manifest || path.join(tempRoot, `${name}-manifest.json`);
  fs.writeFileSync(jobFile, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  return {
    result: spawnSync(process.execPath, [
      'tools/img-gen.mjs',
      jobFile,
      '--dry',
      `--out=${stage}`,
      `--manifest=${record}`,
      `--style-file=${styleFile}`,
    ], { cwd: ROOT, encoding: 'utf8' }),
    manifest: record,
    outputRoot: stage,
  };
}

try {
  const valid = runDry('valid', {
    styleProfile: 'environment',
    jobs: [{ id: 'valid', category: 'environment', runtimeTarget: 'casual/tiles/valid.png', runtimeSpec: { mode: 'fixed', width: 64, height: 64, alpha: 'preserve', anchor: 'center' }, out: 'gen/valid', prompt: 'A simple empty arena floor.' }],
  });
  assert.equal(valid.result.status, 0, valid.result.stderr);
  const dryManifest = JSON.parse(fs.readFileSync(valid.manifest, 'utf8'));
  assert.equal(dryManifest.status, 'dry-run');
  assert.equal(dryManifest.jobs[0].model, style.generation.model);
  assert.equal(dryManifest.jobs[0].category, 'environment');
  assert.equal(dryManifest.jobs[0].runtimeTarget, 'casual/tiles/valid.png');
  assert.deepEqual(dryManifest.jobs[0].runtimeSpec, { mode: 'fixed', width: 64, height: 64, alpha: 'preserve', anchor: 'center' });
  assert.equal(dryManifest.jobs[0].finalPromptSha256.length, 64);

  const polluted = runDry('prototype-profile', {
    styleProfile: '__proto__',
    jobs: [{ id: 'polluted', out: 'gen/polluted', prompt: 'Prompt only.' }],
  });
  assert.notEqual(polluted.result.status, 0, 'prototype-chain styleProfile must fail');

  const escaped = runDry('escaped-output', {
    styleProfile: 'environment',
    jobs: [{ id: 'escaped', out: 'gen/../../escaped/prefix', prompt: 'Prompt.' }],
  });
  assert.notEqual(escaped.result.status, 0, 'output path traversal must fail');

  const escapedTarget = runDry('escaped-runtime-target', {
    styleProfile: 'environment',
    jobs: [{ id: 'escaped-target', runtimeTarget: '../casual/escaped.png', out: 'gen/escaped-target', prompt: 'Prompt.' }],
  });
  assert.notEqual(escapedTarget.result.status, 0, 'runtime target traversal must fail');

  const stagedTarget = runDry('staged-runtime-target', {
    styleProfile: 'environment',
    jobs: [{ id: 'staged-target', runtimeTarget: 'gen/promoted.png', out: 'gen/staged-target', prompt: 'Prompt.' }],
  });
  assert.notEqual(stagedTarget.result.status, 0, 'runtime target must not point into staging');

  const invalidRuntimeSpec = runDry('invalid-runtime-spec', {
    styleProfile: 'environment',
    jobs: [{ id: 'invalid-runtime-spec', runtimeTarget: 'casual/invalid.png', runtimeSpec: { mode: 'fixed', width: 0, height: 64, alpha: 'preserve', anchor: 'center' }, out: 'gen/invalid-runtime-spec', prompt: 'Prompt.' }],
  });
  assert.notEqual(invalidRuntimeSpec.result.status, 0, 'invalid runtime resize contract must fail');

  const collisionStage = path.join(tempRoot, 'collision-stage');
  const collisionManifest = path.join(collisionStage, 'collision-1.png');
  const collided = runDry('manifest-collision', {
    styleProfile: 'environment',
    jobs: [{ id: 'collision', out: 'gen/collision', prompt: 'Prompt.' }],
  }, { manifest: collisionManifest, outputRoot: collisionStage });
  assert.notEqual(collided.result.status, 0, 'manifest/output collision must fail');
  assert.equal(fs.existsSync(collisionManifest), false, 'collision path must remain untouched');
} finally {
  const tempBase = path.resolve(os.tmpdir()) + path.sep;
  assert.ok(path.resolve(tempRoot).startsWith(tempBase), 'refusing to clean outside the temp directory');
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(`Art pipeline contract OK: ${jobFiles.length} job files, ${Object.keys(style.profiles).length} profiles`);
