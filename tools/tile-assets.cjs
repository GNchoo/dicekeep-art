#!/usr/bin/env node
'use strict';

// Check the shipped optional tile list; --write updates only its marked game.js block.
// Existing, unused road-corner/cross/t art is deliberately not preloaded.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), gamePath = path.join(root, 'game.js');
const args = process.argv.slice(2);
assert.ok(args.every(arg => arg === '--write'), 'Usage: node tools/tile-assets.cjs [--write]');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), context, { filename: 'content.js' });
const content = context.window.DKCONTENT;
const names = ['floor', 'road', 'board', 'pad', 'start', 'end', 'prop-1', 'prop-2', 'prop-3'];
const file = (theme, name) => `${theme}/${name}.${name === 'floor' ? 'jpg' : 'png'}`;
const candidates = names.map(name => file('arena', name));
for (const theme of content.THEMES) for (const name of [...content.TILE_ASSETS, 'road-straight']) candidates.push(file(theme.id, name));
assert.equal(new Set(candidates).size, candidates.length, 'Unique tile candidates');
assert.ok(candidates.every(name => /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\.(png|jpg)$/.test(name)), 'Safe relative tile paths');
const existing = candidates.filter(name => fs.existsSync(path.join(root, 'casual/tiles', name))).sort();
const source = fs.readFileSync(gamePath, 'utf8');
const pattern = /\/\/ BEGIN TILE_ASSET_FILES[^\r\n]*\r?\nconst TILE_ASSET_FILES = Object\.freeze\(\[([\s\S]*?)\]\);\r?\n\/\/ END TILE_ASSET_FILES/;
const match = pattern.exec(source);
assert.ok(match, 'game.js tile list markers');
assert.equal(source.match(/\/\/ BEGIN TILE_ASSET_FILES/g).length, 1, 'One generated tile list');
const actual = vm.runInNewContext(`[${match[1]}]`);
assert.ok(Array.isArray(actual) && actual.every(name => typeof name === 'string'), 'Literal tile path list');
const block = '// BEGIN TILE_ASSET_FILES — node tools/tile-assets.cjs --write\nconst TILE_ASSET_FILES = Object.freeze([\n' + existing.map(name => `  '${name}',`).join('\n') + '\n]);\n// END TILE_ASSET_FILES';
if (args.includes('--write')) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(gamePath, source.replace(pattern, block.replace(/\n/g, newline)));
} else assert.deepEqual(Array.from(actual), existing, 'Tile list is stale: node tools/tile-assets.cjs --write');
console.log(JSON.stringify({ pass: true, mode: args.includes('--write') ? 'write' : 'check', candidateFiles: candidates.length, loadedFiles: existing.length, absentFilesNotRequested: candidates.length - existing.length, files: existing }));
