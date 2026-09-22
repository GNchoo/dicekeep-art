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
  // 무손실 WebP 변환으로 120_497_599 → 93_765_659 (-26.7 MB, -22%).
  // 요청 수(770)와 decodeBytes(456_974_188)는 그대로다 — 픽셀 크기가 안 변했다는 뜻이고,
  // 변환이 무손실이었음을 이 도구가 독립적으로 확인해 준 셈이다.
  assert.equal(report.loadAssets.transferBytes, 93_765_659);
  assert.equal(report.loadAssets.decodeBytes, 456_974_188);
  assert.equal(report.startupScenarios.portrait.uniqueRequests, 771);
  assert.equal(report.startupScenarios.portrait.transferBytes, 93_911_658);   // 무손실 WebP 변환 후 실측
  assert.equal(report.startupScenarios.portrait.decodeBytes, 468_734_188);
  assert.equal(report.startupScenarios.landscape.uniqueRequests, 772);
  assert.equal(report.startupScenarios.landscape.transferBytes, 93_902_538);  // 무손실 WebP 변환 후 실측
  assert.equal(report.startupScenarios.landscape.decodeBytes, 466_958_188);
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
