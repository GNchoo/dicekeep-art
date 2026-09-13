// Whole 101-wave rule table frozen from the user's completed main, alongside
// the browser trace fixture. This compares real data/functions, not copied formulas.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), fixture = path.join(__dirname, 'fixtures/pure-rules-55204fe.json');
function read(name, reference) {
  return reference ? execFileSync('git', ['show', '55204fe:' + name], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, name), 'utf8');
}
function inspect(reference) {
  const c = { window: {} }; vm.runInNewContext(read('content.js', reference), c);
  const C = c.window.DKCONTENT, INF = C.INFINITY, s = read('game.js', reference), t = {};
  vm.runInNewContext(s.slice(s.indexOf('const TOWER_DEFS ='), s.indexOf('const ENEMY_DEFS =')) + '\nresult={TOWER_DEFS,LVL_DMG,LVL_RANGE,LVL_RATE};', t);
  const table = { config: { ...INF, modes: { clear: INF.modes.clear } }, power: C.DICE_POWER, towers: t.result,
    waves: Array.from({ length: 101 }, (_, i) => ({ wave: i + 1, values: reference ? INF.wave(i + 1, true) : INF.waveForMode(i + 1, 'clear'), monster: INF.monsterFor(i + 1) })) };
  return JSON.parse(JSON.stringify(table));
}
if (process.argv.includes('--capture-reference')) fs.writeFileSync(fixture, JSON.stringify(inspect(true), null, 2) + '\n');
assert.deepEqual(inspect(false), JSON.parse(fs.readFileSync(fixture, 'utf8')));
console.log('PASS main 55204fe pure-luck: full 101-wave roster/curve, shared economy/odds, 20 towers and power table');
