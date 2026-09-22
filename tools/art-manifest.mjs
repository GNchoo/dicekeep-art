#!/usr/bin/env node
/**
 * Build a deterministic, machine-readable inventory of the game's raster art.
 *
 * Usage:
 *   node tools/art-manifest.mjs
 *   node tools/art-manifest.mjs --check
 *   node tools/art-manifest.mjs --output path/to/manifest.json
 *
 * The mobile inclusion rules intentionally mirror tools/build-www.mjs. Keep the
 * two files in sync when build-www's asset rules change.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'art-manifest.json');
const SCAN_ROOTS = [
  'casual/maps',
  'casual/towers',
  'casual/enemies',
  'casual/bosses',
  'casual/tiles',
  'ui',
  'vfx',
];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// These expressions are copied from tools/build-www.mjs. They are kept here
// instead of importing that file because build-www executes a destructive build
// at module load time.
const MOBILE_EXCLUDE = [
  {
    pattern: /^casual\/maps\/map-[0-9][0-9]-[^/]*\.jpg$/i,
    reason: 'legacy-map-background',
  },
  {
    pattern: /^casual\/towers\/[^/]*-attack-2x2\.png$/i,
    reason: 'unused-tower-attack-sheet',
  },
  {
    pattern: /^ui\/icons-sheet\.png$/i,
    reason: 'ui-source-sheet',
  },
];

const args = process.argv.slice(2);
let outputPath = DEFAULT_OUTPUT;
let checkOnly = false;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--check') {
    checkOnly = true;
  } else if (arg === '--output') {
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error('--output requires a path');
    outputPath = path.resolve(ROOT, value);
    i += 1;
  } else if (arg === '--help' || arg === '-h') {
    console.log('Usage: node tools/art-manifest.mjs [--check] [--output <path>]');
    process.exit(0);
  } else {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

const normalizePath = (value) => value.split(path.sep).join('/');
const relativeToRoot = (value) => normalizePath(path.relative(ROOT, value));
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => compareText(a.name, b.name));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

function loadRuntimeReferences() {
  const references = new Set();
  const source = ['game.js', 'content.js']
    .map((filename) => fs.readFileSync(path.join(ROOT, filename), 'utf8'))
    .join('\n');

  for (const match of source.matchAll(/['"`](casual\/[^'"`\s]+)/g)) {
    const value = match[1];
    if (!/[${]/.test(value)) references.add(value);
  }

  // Match build-www's evaluated DKCONTENT references as well as its literals.
  const context = { window: {}, console };
  context.window.window = context.window;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8'),
    context,
    { filename: 'content.js' },
  );
  const content = context.window.DKCONTENT || {};
  const add = (value) => {
    if (typeof value === 'string' && value.startsWith('casual/')) references.add(value);
  };
  for (const base of content.bases || []) {
    add(base.src);
    add(base.walkSrc);
  }
  for (const base of content.bossBases || []) {
    add(base.src);
    add(base.walkSrc);
  }
  for (const key of Object.keys(content.towerSkins || {})) {
    for (const skin of content.towerSkins[key] || []) add(skin && skin.src);
  }
  for (const mapEntry of content.maps || []) add(mapEntry.src);

  return references;
}

const runtimeReferences = loadRuntimeReferences();

function explicitMobileExclusion(assetPath) {
  return MOBILE_EXCLUDE.find(({ pattern }) => pattern.test(assetPath)) || null;
}

function mobileDisposition(assetPath) {
  const exclusion = explicitMobileExclusion(assetPath);
  if (exclusion) return { status: 'excluded', reason: exclusion.reason };

  if (/^(?:ui|vfx)\//.test(assetPath)) {
    return { status: 'included', reason: 'fixed-directory' };
  }
  if (/^casual\/tiles\//.test(assetPath)) {
    return { status: 'included', reason: 'casual-tiles-directory' };
  }
  if (/^casual\/(?:enemies|bosses)\/(?:inf|extreme)\//.test(assetPath)) {
    return { status: 'included', reason: 'mode-art-directory' };
  }
  if (/^casual\/towers\/skins\//.test(assetPath)) {
    return { status: 'included', reason: 'tower-skins-directory' };
  }
  if (/^casual\/towers\/star-[^/]*\.png$/i.test(assetPath)) {
    return { status: 'included', reason: 'star-tower-rule' };
  }
  if (runtimeReferences.has(assetPath)) {
    return { status: 'included', reason: 'runtime-reference' };
  }
  return { status: 'excluded', reason: 'not-referenced-by-mobile-build' };
}

function categoryFor(assetPath) {
  if (assetPath.startsWith('casual/maps/')) return 'map';
  if (assetPath.startsWith('casual/towers/')) return 'tower';
  if (assetPath.startsWith('casual/enemies/')) return 'enemy';
  if (assetPath.startsWith('casual/bosses/')) return 'boss';
  if (assetPath.startsWith('casual/tiles/')) return 'tile';
  if (assetPath.startsWith('ui/')) return 'ui';
  if (assetPath.startsWith('vfx/')) return 'vfx';
  throw new Error(`Unclassified asset: ${assetPath}`);
}

function roleFor(assetPath) {
  if (assetPath.startsWith('casual/maps/')) return 'legacy-background';
  if (/^casual\/towers\/skins\//.test(assetPath)) return 'skin';
  if (/^casual\/towers\/star-/.test(assetPath)) return 'star-progression';
  if (/^casual\/towers\/[^/]*-attack-2x2\.png$/i.test(assetPath)) return 'attack-sheet';
  if (assetPath.startsWith('casual/towers/')) return 'base-skin';
  if (/^casual\/(?:enemies|bosses)\/extreme\//.test(assetPath)) return 'extreme-directional';
  if (/^casual\/(?:enemies|bosses)\/inf\/directional\//.test(assetPath)) return 'infinity-directional';
  if (/^casual\/(?:enemies|bosses)\/inf\//.test(assetPath)) return 'infinity';
  if (/^casual\/(?:enemies|bosses)\/[^/]*-walk-(?:2x2|4x2)\./i.test(assetPath)) return 'walk-sheet';
  if (assetPath.startsWith('casual/enemies/')) return 'base';
  if (assetPath.startsWith('casual/bosses/')) return 'base';
  if (assetPath.startsWith('casual/tiles/')) return path.basename(assetPath, path.extname(assetPath));
  if (assetPath === 'ui/icons-sheet.png') return 'source-sheet';
  if (assetPath.startsWith('ui/')) return 'interface';
  if (/^vfx\/.*-(?:2x2|4x2)\./i.test(assetPath)) return 'sprite-sheet';
  if (assetPath.startsWith('vfx/')) return 'effect';
  return 'unknown';
}

function isDerived(assetPath) {
  return (
    /^casual\/(?:enemies|bosses)\/(?:extreme\/|inf\/directional\/)/.test(assetPath)
    || /-walk-(?:2x2|4x2)\.(?:png|webp)$/i.test(assetPath)
    || /^vfx\/.*-(?:2x2|4x2)\.(?:png|webp)$/i.test(assetPath)
  );
}

function lifecycleFor(assetPath, mobile) {
  if (mobile.reason === 'legacy-map-background' || mobile.reason === 'unused-tower-attack-sheet') {
    return 'legacy';
  }
  if (mobile.status === 'included' && isDerived(assetPath)) return 'derived';
  if (mobile.status === 'included') return 'runtime';
  return 'source';
}

function aggregate(assets, keyFor) {
  const groups = new Map();
  for (const asset of assets) {
    const key = keyFor(asset);
    const value = groups.get(key) || { name: key, files: 0, bytes: 0 };
    value.files += 1;
    value.bytes += asset.bytes;
    groups.set(key, value);
  }
  return [...groups.values()].sort((a, b) => compareText(a.name, b.name));
}

async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await fn(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

async function inspectAsset(absolutePath) {
  const assetPath = relativeToRoot(absolutePath);
  const buffer = await fsp.readFile(absolutePath);
  const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  if (!metadata.format || !metadata.width || !metadata.height) {
    throw new Error(`Incomplete image metadata: ${assetPath}`);
  }
  const mobileBuild = mobileDisposition(assetPath);
  return {
    path: assetPath,
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    lifecycle: lifecycleFor(assetPath, mobileBuild),
    category: categoryFor(assetPath),
    role: roleFor(assetPath),
    mobileBuild,
  };
}

const scannedFiles = SCAN_ROOTS.flatMap((scanRoot) => walk(path.join(ROOT, scanRoot)));
const unsupportedFiles = scannedFiles
  .filter((filename) => !IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase()))
  .map(relativeToRoot)
  .sort(compareText);
if (unsupportedFiles.length) {
  throw new Error(`Unsupported files in art roots:\n${unsupportedFiles.join('\n')}`);
}
const absoluteFiles = scannedFiles
  .sort((a, b) => compareText(relativeToRoot(a), relativeToRoot(b)));

const assets = await mapLimit(absoluteFiles, 12, inspectAsset);
assets.sort((a, b) => compareText(a.path, b.path));

const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
const manifest = {
  $schema: './tools/art-manifest.schema.json',
  schemaVersion: 1,
  generator: 'tools/art-manifest.mjs',
  buildRuleSource: 'tools/build-www.mjs',
  scanRoots: SCAN_ROOTS,
  summary: {
    files: assets.length,
    bytes: totalBytes,
    byCategory: aggregate(assets, (asset) => asset.category),
    byLifecycle: aggregate(assets, (asset) => asset.lifecycle),
    byFormat: aggregate(assets, (asset) => asset.format),
    byMobileBuild: aggregate(assets, (asset) => asset.mobileBuild.status),
    byMobileReason: aggregate(assets, (asset) => asset.mobileBuild.reason),
  },
  assets,
};

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (checkOnly) {
  let existing;
  try {
    existing = await fsp.readFile(outputPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      console.error(`Missing art manifest: ${relativeToRoot(outputPath)}`);
      process.exit(1);
    }
    throw error;
  }
  if (existing !== serialized) {
    console.error(`Art manifest is stale: ${relativeToRoot(outputPath)}`);
    console.error('Run: node tools/art-manifest.mjs');
    process.exit(1);
  }
  console.log(`Art manifest is current: ${relativeToRoot(outputPath)} (${assets.length} files)`);
} else {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, serialized, 'utf8');
  console.log(`Wrote ${relativeToRoot(outputPath)} (${assets.length} files, ${totalBytes} bytes)`);
}
