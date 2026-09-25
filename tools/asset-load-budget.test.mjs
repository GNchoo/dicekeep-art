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
  assert.equal(report.loadAssets.loadEntries, 777);
  assert.equal(report.loadAssets.uniqueRequests, 777);
  assert.equal(report.loadAssets.uniqueFiles, 777);
  // v156 adds one 512x512 transparent front portal: 101,790 bytes, 1 MiB decoded.
  assert.equal(report.loadAssets.transferBytes, 75_656_412);
  assert.equal(report.loadAssets.decodeBytes, 450_247_828);
  assert.equal(report.startupScenarios.portrait.uniqueRequests, 778);
  assert.equal(report.startupScenarios.portrait.transferBytes, 75_823_190);
  assert.equal(report.startupScenarios.portrait.decodeBytes, 456_539_284);
  assert.equal(report.startupScenarios.landscape.uniqueRequests, 779);
  assert.equal(report.startupScenarios.landscape.transferBytes, 75_826_517);
  assert.equal(report.startupScenarios.landscape.decodeBytes, 456_526_228);
  assert.equal(report.integrity.manifestLinkedFiles, 763);
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
  const result = run(['--check', '--max-requests', '776']);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(`${result.stdout}\n${result.stderr}`, /uniqueRequests 777 exceeds budget 776/);
});
