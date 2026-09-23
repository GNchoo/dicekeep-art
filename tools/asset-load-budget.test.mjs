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
  assert.equal(report.loadAssets.loadEntries, 776);
  assert.equal(report.loadAssets.uniqueRequests, 776);
  assert.equal(report.loadAssets.uniqueFiles, 776);
  // Plant-free stars and the simplified arena share the same eager request count.
  assert.equal(report.loadAssets.transferBytes, 75_772_794);
  assert.equal(report.loadAssets.decodeBytes, 449_199_252);
  assert.equal(report.startupScenarios.portrait.uniqueRequests, 777);
  assert.equal(report.startupScenarios.portrait.transferBytes, 75_942_545);
  assert.equal(report.startupScenarios.portrait.decodeBytes, 455_490_708);
  assert.equal(report.startupScenarios.landscape.uniqueRequests, 778);
  assert.equal(report.startupScenarios.landscape.transferBytes, 75_943_726);
  assert.equal(report.startupScenarios.landscape.decodeBytes, 455_477_652);
  assert.equal(report.integrity.manifestLinkedFiles, 762);
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
  const result = run(['--check', '--max-requests', '775']);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(`${result.stdout}\n${result.stderr}`, /uniqueRequests 776 exceeds budget 775/);
});
