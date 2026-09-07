// Failure regressions against the reviewed source atlases; no browser should launch.
// node --test tools/rig-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repo = fileURLToPath(new URL('../', import.meta.url));
const reviewed = JSON.parse(fs.readFileSync(new URL('./art-review/pr29-gait/rig-config.json', import.meta.url), 'utf8'));
const sourceWave = id => {
  const source = reviewed.waves.find(wave => wave.wave === id);
  assert.ok(source, `reviewed W${id} config is required`);
  const wave = structuredClone(source);
  wave.source = path.resolve(repo, wave.source);
  return wave;
};
const oldGoblinCut = () => {
  const wave = sourceWave(5);
  wave.regions.near[3] = .5;
  wave.regions.far[1] = .5;
  wave.regions.far[3] = .5;
  return wave;
};

function runRejected(t, waves, expectedError) {
  const tempRoot = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, 'dicekeep-rig-test-'));
  assert.equal(path.dirname(path.resolve(dir)), tempRoot);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = path.join(dir, 'rig-config.json'), output = path.join(dir, 'output');
  fs.writeFileSync(config, JSON.stringify({ ...reviewed, waves }));
  const result = spawnSync(process.execPath, [path.join(repo, 'tools/rig-walk.mjs'), `--config=${config}`, `--out=${output}`], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, expectedError);
  assert.doesNotMatch(result.stdout, /browser |Rig output:|frames, stride/, 'invalid input must fail before browser/render work');
  assert.equal(fs.existsSync(output), false, 'invalid input must not create any output directory or partial assets');
}

test('old W5 half-height atlas cut rejects the clipped far-leg fragment before writing', t => {
  runRejected(t, [oldGoblinCut()], /W5 near: puppet region boundary cuts artwork.*choose an empty atlas gutter/);
});

test('unreachable W9 stride rejects IK instead of distorting the leg or writing output', t => {
  const wave = sourceWave(9);
  wave.amplitude = 10000;
  runRejected(t, [wave], /W9 frame 0 near: unreachable ankle/);
});

test('changed source hash rejects stale source-region and joint coordinates before writing', t => {
  const wave = sourceWave(9);
  wave.sourceSha256 = '0'.repeat(64);
  runRejected(t, [wave], /W9: source SHA256 mismatch; review puppet regions and joints again/);
});

test('valid W9 followed by invalid W5 produces no partially rendered W9 assets', t => {
  // Reaching the W5-specific error proves W9's source extraction and IK prepared
  // successfully, while the absent output proves batch preparation precedes writing.
  runRejected(t, [sourceWave(9), oldGoblinCut()], /W5 near: puppet region boundary cuts artwork/);
});
