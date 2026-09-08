#!/usr/bin/env node
'use strict';

// Run: node tools/dice-rotation-test.cjs [path/to/game.js]
// Uses the actual game's rotation and face geometry, without a browser or a
// second implementation of axis-angle extraction. The independent contract is
// that a known relative rotation reconstructs its target and winning face.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../game.js');
const source = fs.readFileSync(sourcePath, 'utf8');
function fragment(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `game source section missing: ${start}`);
  return source.slice(a, b);
}
const targetStart = source.indexOf('function slotTargetR()');
const targetEnd = source.indexOf('\n}', targetStart) + 2;
assert.ok(targetStart >= 0 && targetEnd > targetStart, 'slotTargetR source missing');
const code = fragment('function m3id()', '// 큐브 면 정의') + '\n' +
  source.slice(source.indexOf('const POLY ='), targetEnd) + `
  const SLOT = {kind: 'd20', final: 1};
  const dieShape = kind => kind;
  ({mul: m3mul, transpose: m3transpose, axis: m3axisAngle,
    toAxis: m3toAxisAngle, apply: m3apply, faces: POLY.d20.faces,
    target(value) { SLOT.final = value; return slotTargetR(); }});
`;
const game = vm.runInNewContext(code, {}, {timeout: 1000});
let checked = 0, maximumError = 0;
function check(value, vector, gap) {
  const axis = vector.map(v => v / Math.hypot(...vector));
  const target = game.target(value);
  // delta * from = target, including angles on either side of pi. This known
  // construction supplies the expectation; no extraction algorithm is copied.
  const delta = game.axis(...axis, Math.PI - gap);
  const from = game.mul(game.transpose(delta), target);
  const rotation = game.toAxis(game.mul(target, game.transpose(from)));
  const actual = game.mul(game.axis(...rotation.axis, rotation.ang), from);
  const error = Math.max(...actual.map((v, i) => Math.abs(v - target[i])));
  const front = game.faces.map((f, i) => ({value: i + 1, z: game.apply(actual, f.n)[2]})).sort((a, b) => b.z - a.z)[0];
  const label = `result=${value}, axis=${vector.join(',')}, piGap=${gap}`;
  assert.ok(actual.every(Number.isFinite), `finite pose: ${label}`);
  assert.equal(front.value, value, `winning face: ${label}`);
  assert.ok(front.z > 1 - 1e-8, `winning face faces viewer: ${label}, z=${front.z}`);
  assert.ok(error < 1e-8, `target reconstruction: ${label}, error=${error}`);
  maximumError = Math.max(maximumError, error); checked++;
}

// Original 21 reproductions. A tiny x component with substantial y/z exposed
// the old sign heuristic: the requested 7 could settle with 16 facing forward.
for (const axis of [[.0001,.6,.8],[1,2,3],[.01,.8,.1],[.3,-.4,.5],[-.3,.4,.5],[.3,.4,-.5],[1,0,0]]) {
  for (const gap of [.019,.01,.001]) check(7, axis, gap);
}
// Principal positive/negative axes and mixed axes, exact pi and both nearby
// branches, against each of the 20 authored winning-face targets.
for (let value = 1; value <= 20; value++) {
  for (const axis of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,2,3],[-1,2,3],[.0001,.6,.8]]) {
    for (const gap of [0,1e-10,-1e-10,1e-6,-1e-6,.01,-.01]) check(value, axis, gap);
  }
}
console.log(JSON.stringify({pass: true, cases: checked, winningFaces: 20, maximumTargetMatrixError: maximumError}));
