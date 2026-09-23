#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools', 'asset-load-budget.mjs');

function run(args) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

test('reports the current eager SRCS loader deterministically and passes its ceilings', () => {
  const first = run(['--json', '--check']);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const second = run(['--json', '--check']);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(second.stdout, first.stdout);

  const report = JSON.parse(first.stdout);
  assert.equal(report.loadAssets.loadEntries, 770);
  assert.equal(report.loadAssets.uniqueRequests, 770);
  assert.equal(report.loadAssets.uniqueFiles, 770);
  // Measured baseline after WebP conversion and the first casual art promotion.
  assert.equal(report.loadAssets.transferBytes, 93_518_375);
  assert.equal(report.loadAssets.decodeBytes, 456_946_540);
  assert.equal(report.startupScenarios.portrait.uniqueRequests, 771);
  assert.equal(report.startupScenarios.portrait.transferBytes, 93_688_126);   // 캐주얼 파일럿 적용 후 실측
  assert.equal(report.startupScenarios.portrait.decodeBytes, 463_237_996);
  assert.equal(report.startupScenarios.landscape.uniqueRequests, 772);
  assert.equal(report.startupScenarios.landscape.transferBytes, 93_689_307);  // 캐주얼 파일럿 적용 후 실측
  assert.equal(report.startupScenarios.landscape.decodeBytes, 463_224_940);
  assert.equal(report.integrity.manifestLinkedFiles, 756);
  assert.equal(report.integrity.notInArtManifest.length, 14);

  for (const field of [
    'duplicateRequests',
    'queryVariants',
    'missingOnDisk',
    'manifestMismatches',
    'excludedFromMobileBuild',
    'unknownToMobileBuild',
  ]) assert.deepEqual(report.integrity[field], [], field);
});

test('rejects a caller-supplied budget below the measured request count', () => {
  const result = run(['--check', '--max-requests', '769']);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(`${result.stdout}\n${result.stderr}`, /uniqueRequests 770 exceeds budget 769/);
});
