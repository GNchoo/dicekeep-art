#!/usr/bin/env node
/**
 * Measure the eager image payload requested by game.js loadAssets().
 *
 * The source of truth is the SRCS construction code itself: content.js is
 * evaluated, then the bounded `const SRCS = { ... }` block from game.js is
 * evaluated with the same DKCONTENT value. This avoids maintaining a second
 * hand-written asset list that can silently drift from the game.
 *
 * Usage:
 *   node tools/asset-load-budget.mjs
 *   node tools/asset-load-budget.mjs --json
 *   node tools/asset-load-budget.mjs --check
 *   node tools/asset-load-budget.mjs --check --max-transfer-bytes 90000000
 *
 * Transfer bytes count each canonical request URL once. Different query
 * strings for the same file are separate transfers. Decode bytes use the
 * deterministic RGBA8 footprint (width * height * 4) for each request URL.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME_FILE = path.join(ROOT, 'game.js');
const CONTENT_FILE = path.join(ROOT, 'content.js');
const MANIFEST_FILE = path.join(ROOT, 'art-manifest.json');
const BUILD_FILE = path.join(ROOT, 'tools', 'build-www.mjs');
const VIRTUAL_ORIGIN = 'https://dicekeep.invalid';
const VIRTUAL_BASE = `${VIRTUAL_ORIGIN}/dicekeep/`;

// These are regression ceilings, not desired targets. Lower numbers pass.
// Update a ceiling only when an intentional asset change genuinely requires it.
const CHECK_BUDGET = Object.freeze({
  loadEntries: 770,
  uniqueRequests: 770,
  transferBytes: 93_765_659,   // 무손실 WebP 변환 후 실측 (이전 120_497_599)
  decodeBytes: 456_974_188,
});

const numericFlags = new Map([
  ['--max-load-entries', 'loadEntries'],
  ['--max-requests', 'uniqueRequests'],
  ['--max-transfer-bytes', 'transferBytes'],
  ['--max-decode-bytes', 'decodeBytes'],
]);

function usage() {
  console.log(`Usage: node tools/asset-load-budget.mjs [options]

Options:
  --check                     Fail on integrity errors or budget regressions
  --json                      Print the complete report as JSON
  --max-load-entries <n>      Override the loadAssets key ceiling
  --max-requests <n>          Override the unique request ceiling
  --max-transfer-bytes <n>    Override the compressed transfer ceiling
  --max-decode-bytes <n>      Override the RGBA8 decode ceiling
  -h, --help                  Show this help`);
}

function parseArgs(argv) {
  const options = { check: false, json: false, limits: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (numericFlags.has(arg)) {
      const raw = argv[i + 1];
      if (!raw || raw.startsWith('--')) throw new Error(`${arg} requires a non-negative integer`);
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${arg} requires a non-negative integer`);
      options.limits[numericFlags.get(arg)] = value;
      i += 1;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const rel = (absolute) => path.relative(ROOT, absolute).split(path.sep).join('/');
const sum = (values, field) => values.reduce((total, value) => total + value[field], 0);
const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

function silentConsole() {
  return Object.freeze({ log() {}, info() {}, warn() {}, error() {} });
}

function evaluateContent(source) {
  const window = {};
  window.window = window;
  const context = vm.createContext({ window, console: silentConsole() });
  vm.runInContext(source, context, { filename: 'content.js', timeout: 5_000 });
  if (!window.DKCONTENT || typeof window.DKCONTENT !== 'object') {
    throw new Error('content.js did not expose window.DKCONTENT');
  }
  return window.DKCONTENT;
}

function evaluateSrcs(gameSource, content) {
  const start = gameSource.indexOf('const SRCS = {');
  const end = gameSource.indexOf('const A = {};', start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Could not locate the bounded SRCS construction block in game.js');
  }

  // Refuse to report a stale interpretation if loadAssets stops eagerly walking SRCS.
  const loadAssetsStart = gameSource.indexOf('async function loadAssets(');
  const loadAssetsEnd = gameSource.indexOf('\n}', loadAssetsStart);
  const loadHead = gameSource.slice(loadAssetsStart, loadAssetsEnd + 2);
  if (
    loadAssetsStart < 0
    || !/Object\.keys\(SRCS\)/.test(loadHead)
    || !/loadImage\(SRCS\[k\]\)/.test(loadHead)
  ) {
    throw new Error('loadAssets no longer eagerly loads Object.keys(SRCS); update this analyzer with the loader');
  }

  const window = { DKCONTENT: content };
  window.window = window;
  const context = vm.createContext({
    window,
    DKCONTENT: content,
    BASE: '/dicekeep/',
    console: silentConsole(),
  });
  const code = `${gameSource.slice(start, end)}\nglobalThis.__DICEKEEP_SRCS__ = SRCS;`;
  vm.runInContext(code, context, { filename: 'game.js#SRCS', timeout: 5_000 });
  const sources = context.__DICEKEEP_SRCS__;
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
    throw new Error('SRCS construction did not produce an object');
  }
  return Object.entries(sources).map(([key, url]) => ({ key, rawUrl: String(url) }));
}

function evaluateBuildRules(buildSource) {
  const start = buildSource.indexOf('const FIXED_DIRS =');
  const end = buildSource.indexOf('const excluded =', start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Could not locate FIXED_DIRS/EXCLUDE in tools/build-www.mjs');
  }
  const code = `${buildSource.slice(start, end)}
globalThis.__FIXED_DIRS__ = FIXED_DIRS;
globalThis.__EXCLUDE__ = EXCLUDE;`;
  const context = vm.createContext({});
  vm.runInContext(code, context, { filename: 'tools/build-www.mjs#rules', timeout: 1_000 });
  if (!Array.isArray(context.__FIXED_DIRS__) || !Array.isArray(context.__EXCLUDE__)) {
    throw new Error('Mobile build rules did not evaluate to arrays');
  }
  return {
    fixedDirectories: new Set([...context.__FIXED_DIRS__].map(String)),
    excluded: [...context.__EXCLUDE__],
  };
}

function extractKeyart(gameSource) {
  const match = /const KEYART\s*=\s*\{\s*l:\s*BASE\s*\+\s*(['"])(.*?)\1\s*,\s*p:\s*BASE\s*\+\s*(['"])(.*?)\3\s*,\s*blur:\s*BASE\s*\+\s*(['"])(.*?)\5\s*\}/s.exec(gameSource);
  if (!match) throw new Error('Could not extract the KEYART URLs from game.js');
  return {
    landscape: [`/dicekeep/${match[2]}`, `/dicekeep/${match[6]}`],
    portrait: [`/dicekeep/${match[4]}`],
  };
}

function normalizeRequest(rawUrl) {
  const url = new URL(rawUrl, VIRTUAL_BASE);
  if (url.origin !== VIRTUAL_ORIGIN || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`External or unsupported asset URL: ${rawUrl}`);
  }
  url.hash = '';
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname).replaceAll('\\', '/');
  } catch {
    throw new Error(`Malformed encoded asset path: ${rawUrl}`);
  }
  if (pathname.startsWith('/dicekeep/')) pathname = pathname.slice('/dicekeep/'.length);
  else pathname = pathname.replace(/^\/+/, '');
  const assetPath = path.posix.normalize(pathname);
  if (!assetPath || assetPath === '.' || assetPath === '..' || assetPath.startsWith('../') || path.posix.isAbsolute(assetPath)) {
    throw new Error(`Asset URL escapes the repository root: ${rawUrl}`);
  }
  const query = url.searchParams.toString();
  return {
    assetPath,
    normalizedUrl: query ? `${assetPath}?${query}` : assetPath,
  };
}

function categoryFor(assetPath, manifestAsset) {
  if (manifestAsset && manifestAsset.category) return manifestAsset.category;
  const top = assetPath.split('/')[0];
  return ({ map: 'map', towers: 'tower', enemies: 'enemy', dice: 'dice', props: 'prop', ui: 'ui', vfx: 'vfx' })[top] || top;
}

function buildDisposition(assetPath, manifestAsset, buildRules) {
  if (manifestAsset && manifestAsset.mobileBuild) return manifestAsset.mobileBuild;
  const top = assetPath.split('/')[0];
  const exclusion = buildRules.excluded.find((pattern) => pattern.test(assetPath));
  if (exclusion) return { status: 'excluded', reason: 'build-www-exclude-rule' };
  if (buildRules.fixedDirectories.has(top)) return { status: 'included', reason: 'fixed-directory' };
  return { status: 'unknown', reason: 'not-covered-by-build-rule' };
}

async function mapLimit(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

async function inspectPaths(assetPaths, manifestByPath, buildRules) {
  const records = await mapLimit(assetPaths, 16, async (assetPath) => {
    const absolute = path.resolve(ROOT, ...assetPath.split('/'));
    const relative = path.relative(ROOT, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Resolved asset path escapes repository: ${assetPath}`);
    }
    const manifestAsset = manifestByPath.get(assetPath) || null;
    let stat;
    try {
      stat = await fsp.stat(absolute);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return { assetPath, missing: true, manifestAsset };
      }
      throw error;
    }
    if (!stat.isFile()) return { assetPath, missing: true, manifestAsset };

    const metadata = await sharp(absolute, { failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error(`Incomplete image metadata: ${assetPath}`);
    }
    const rgbaBytes = metadata.width * metadata.height * 4;
    const manifestMismatch = manifestAsset && (
      manifestAsset.bytes !== stat.size
      || manifestAsset.width !== metadata.width
      || manifestAsset.height !== metadata.height
    );
    return {
      assetPath,
      missing: false,
      bytes: stat.size,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      rgbaBytes,
      category: categoryFor(assetPath, manifestAsset),
      manifestLinked: Boolean(manifestAsset),
      manifestMismatch: Boolean(manifestMismatch),
      mobileBuild: buildDisposition(assetPath, manifestAsset, buildRules),
    };
  });
  return new Map(records.map((record) => [record.assetPath, record]));
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function summarizeRequests(entries, pathInfo) {
  const byRequest = groupBy(entries, (entry) => entry.normalizedUrl);
  const requests = [...byRequest.entries()].map(([url, matches]) => {
    const info = pathInfo.get(matches[0].assetPath);
    return {
      url,
      path: matches[0].assetPath,
      keys: matches.map((entry) => entry.key).sort(compareText),
      bytes: info && !info.missing ? info.bytes : 0,
      rgbaBytes: info && !info.missing ? info.rgbaBytes : 0,
      category: info && !info.missing ? info.category : 'missing',
      manifestLinked: Boolean(info && info.manifestLinked),
      mobileBuild: info && info.mobileBuild ? info.mobileBuild : { status: 'missing', reason: 'missing-on-disk' },
    };
  }).sort((a, b) => compareText(a.url, b.url));

  const categories = [...groupBy(requests, (request) => request.category).entries()]
    .map(([category, items]) => ({
      category,
      requests: items.length,
      files: new Set(items.map((item) => item.path)).size,
      transferBytes: sum(items, 'bytes'),
      decodeBytes: sum(items, 'rgbaBytes'),
    }))
    .sort((a, b) => compareText(a.category, b.category));

  return {
    loadEntries: entries.length,
    uniqueRequests: requests.length,
    uniqueFiles: new Set(requests.map((request) => request.path)).size,
    transferBytes: sum(requests, 'bytes'),
    decodeBytes: sum(requests, 'rgbaBytes'),
    categories,
    requests,
  };
}

function scenarioWith(loadEntries, extraUrls, label, pathInfo) {
  const extras = extraUrls.map((rawUrl, index) => {
    const normalized = normalizeRequest(rawUrl);
    return { key: `@keyart:${label}:${index}`, rawUrl, ...normalized };
  });
  const combinedByUrl = new Map();
  for (const entry of [...loadEntries, ...extras]) {
    if (!combinedByUrl.has(entry.normalizedUrl)) combinedByUrl.set(entry.normalizedUrl, entry);
  }
  const combined = [...combinedByUrl.values()];
  const report = summarizeRequests(combined, pathInfo);
  return {
    uniqueRequests: report.uniqueRequests,
    uniqueFiles: report.uniqueFiles,
    transferBytes: report.transferBytes,
    decodeBytes: report.decodeBytes,
  };
}

function printHuman(report) {
  const load = report.loadAssets;
  console.log('Eager SRCS image baseline (game.js loadAssets)');
  console.log(`  load entries       ${load.loadEntries}`);
  console.log(`  unique requests    ${load.uniqueRequests}`);
  console.log(`  unique files       ${load.uniqueFiles}`);
  console.log(`  transfer bytes     ${load.transferBytes} (${mib(load.transferBytes)})`);
  console.log(`  RGBA8 decode bytes ${load.decodeBytes} (${mib(load.decodeBytes)})`);
  console.log(`  manifest coverage  ${report.integrity.manifestLinkedFiles}/${load.uniqueFiles} files`);
  console.log('');
  console.log('Category'.padEnd(14) + 'requests'.padStart(10) + 'transfer'.padStart(16) + 'decode'.padStart(16));
  for (const row of load.categories) {
    console.log(row.category.padEnd(14) + String(row.requests).padStart(10) + mib(row.transferBytes).padStart(16) + mib(row.decodeBytes).padStart(16));
  }
  console.log('');
  console.log(`Portrait SRCS + keyart:  ${report.startupScenarios.portrait.uniqueRequests} requests, ${mib(report.startupScenarios.portrait.transferBytes)} transfer, ${mib(report.startupScenarios.portrait.decodeBytes)} decode`);
  console.log(`Landscape SRCS + keyart: ${report.startupScenarios.landscape.uniqueRequests} requests, ${mib(report.startupScenarios.landscape.transferBytes)} transfer, ${mib(report.startupScenarios.landscape.decodeBytes)} decode`);
  console.log('');
  console.log(`Duplicate request URLs: ${report.integrity.duplicateRequests.length}`);
  console.log(`Query variants:         ${report.integrity.queryVariants.length}`);
  console.log(`Missing on disk:        ${report.integrity.missingOnDisk.length}`);
  console.log(`Manifest mismatches:    ${report.integrity.manifestMismatches.length}`);
  console.log(`Excluded from build:    ${report.integrity.excludedFromMobileBuild.length}`);
  console.log(`Unknown to build rules: ${report.integrity.unknownToMobileBuild.length}`);
  if (report.integrity.notInArtManifest.length) {
    console.log(`Outside art-manifest:   ${report.integrity.notInArtManifest.length} fixed-dir files`);
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  usage();
  process.exit(0);
}

const [gameSource, contentSource, manifestSource, buildSource] = await Promise.all([
  fsp.readFile(GAME_FILE, 'utf8'),
  fsp.readFile(CONTENT_FILE, 'utf8'),
  fsp.readFile(MANIFEST_FILE, 'utf8'),
  fsp.readFile(BUILD_FILE, 'utf8'),
]);
const manifest = JSON.parse(manifestSource);
if (!Array.isArray(manifest.assets)) throw new Error('art-manifest.json has no assets array');
const manifestByPath = new Map(manifest.assets.map((asset) => [asset.path, asset]));
const buildRules = evaluateBuildRules(buildSource);

const content = evaluateContent(contentSource);
const loadEntries = evaluateSrcs(gameSource, content).map((entry) => ({
  ...entry,
  ...normalizeRequest(entry.rawUrl),
}));
const keyart = extractKeyart(gameSource);
const allPaths = [...new Set([
  ...loadEntries.map((entry) => entry.assetPath),
  ...Object.values(keyart).flat().map((url) => normalizeRequest(url).assetPath),
])].sort(compareText);
const pathInfo = await inspectPaths(allPaths, manifestByPath, buildRules);
const loadAssets = summarizeRequests(loadEntries, pathInfo);

const requestsByPath = groupBy(loadAssets.requests, (request) => request.path);
const duplicateRequests = loadAssets.requests
  .filter((request) => request.keys.length > 1)
  .map((request) => ({ url: request.url, keys: request.keys }));
const queryVariants = [...requestsByPath.entries()]
  .filter(([, requests]) => requests.length > 1)
  .map(([assetPath, requests]) => ({ path: assetPath, urls: requests.map((request) => request.url).sort(compareText) }))
  .sort((a, b) => compareText(a.path, b.path));
const referencedPaths = [...new Set(loadEntries.map((entry) => entry.assetPath))].sort(compareText);
const missingOnDisk = referencedPaths.filter((assetPath) => pathInfo.get(assetPath).missing);
const manifestMismatches = referencedPaths.filter((assetPath) => pathInfo.get(assetPath).manifestMismatch);
const notInArtManifest = referencedPaths.filter((assetPath) => !pathInfo.get(assetPath).manifestLinked);
const excludedFromMobileBuild = referencedPaths.filter((assetPath) => pathInfo.get(assetPath).mobileBuild.status === 'excluded');
const unknownToMobileBuild = referencedPaths.filter((assetPath) => pathInfo.get(assetPath).mobileBuild.status === 'unknown');

const report = {
  schemaVersion: 1,
  sources: {
    game: rel(GAME_FILE),
    content: rel(CONTENT_FILE),
    artManifest: rel(MANIFEST_FILE),
    mobileBuildRules: rel(BUILD_FILE),
  },
  accounting: {
    transfer: 'one compressed file payload per exact normalized URL; query parameter order is retained',
    decode: 'width * height * 4 RGBA8 bytes per canonical URL',
    scope: 'game.js loadAssets(SRCS), plus separate title-keyart portrait/landscape boot unions',
  },
  loadAssets,
  startupScenarios: {
    portrait: scenarioWith(loadEntries, keyart.portrait, 'portrait', pathInfo),
    landscape: scenarioWith(loadEntries, keyart.landscape, 'landscape', pathInfo),
  },
  integrity: {
    manifestLinkedFiles: referencedPaths.length - notInArtManifest.length,
    notInArtManifest,
    duplicateRequests,
    queryVariants,
    missingOnDisk,
    manifestMismatches,
    excludedFromMobileBuild,
    unknownToMobileBuild,
  },
};

if (options.json) console.log(JSON.stringify(report, null, 2));
else printHuman(report);

if (options.check) {
  const errors = [];
  for (const [label, items] of [
    ['missing on disk', missingOnDisk],
    ['different from art-manifest metadata', manifestMismatches],
    ['excluded from the mobile build', excludedFromMobileBuild],
    ['unknown to the mobile build rules', unknownToMobileBuild],
  ]) {
    if (items.length) errors.push(`${items.length} eager assets are ${label}: ${items.join(', ')}`);
  }

  const limits = { ...CHECK_BUDGET, ...options.limits };
  for (const [metric, limit] of Object.entries(limits)) {
    if (Number.isFinite(limit) && loadAssets[metric] > limit) {
      errors.push(`${metric} ${loadAssets[metric]} exceeds budget ${limit}`);
    }
  }
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else if (!options.json) {
    console.log(`Asset load budget OK: ${loadAssets.uniqueRequests} requests, ${loadAssets.transferBytes} transfer bytes, ${loadAssets.decodeBytes} RGBA8 bytes`);
  }
}
