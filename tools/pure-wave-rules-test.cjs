// Clear-only normal-wave pressure sits above the frozen legacy wave curve.
// Keep this contract separate from pure-main-rules-test.cjs and its immutable fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../content.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'content.js' });
const INF = context.window.DKCONTENT.INFINITY;
const rules = INF.pureRounds;

assert.equal(rules.seconds, 140);
assert.equal(rules.count, 79);
assert.equal(rules.spawnEnd, 130);
assert.equal(rules.pressureFrom, 10);
assert.equal(rules.pressureExp, 1.06);
assert.equal(rules.pressureMax, 24);

let normal = 0, boss = 0;
for (let wave = 1; wave <= 101; wave++) {
  const base = INF.wave(wave, true);
  const clear = INF.waveForMode(wave, 'clear');
  assert.equal(clear.goldMult, base.goldMult, `W${wave} kill-gold multiplier`);
  assert.equal(clear.count, base.count, `W${wave} legacy count field`);
  assert.equal(clear.speedMult, base.speedMult, `W${wave} speed`);
  assert.equal(clear.bossHp, base.bossHp, `W${wave} boss HP factor`);
  assert.ok(Number.isFinite(clear.hpMult) && clear.hpMult > 0, `W${wave} finite positive HP`);
  for (const mode of ['build', 'extreme', 'duel', 'coop']) {
    const original = INF.wave(wave, INF.modeOf(mode).gauntlet);
    const actual = INF.waveForMode(wave, mode);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(original)),
      `W${wave} ${mode} profile unchanged`);
  }

  if (INF.isBossWave(wave)) {
    boss++;
    assert.deepEqual(JSON.parse(JSON.stringify(clear)), JSON.parse(JSON.stringify(base)), `W${wave} boss profile unchanged`);
    continue;
  }

  normal++;
  const pressure = Math.min(24, Math.pow(1.06, Math.max(0, wave - 10)));
  const expectedHp = base.hpMult * pressure;
  assert.ok(Math.abs(clear.hpMult - expectedHp) <= Math.max(1, expectedHp) * 1e-12,
    `W${wave} HP ${clear.hpMult} vs ${expectedHp}`);
  assert.ok(clear.hpMult >= base.hpMult && clear.hpMult <= base.hpMult * 24 * (1 + 1e-12),
    `W${wave} positive capped pressure`);
  if (wave <= 10) assert.equal(clear.hpMult, base.hpMult, `W${wave} early HP unchanged`);
  assert.equal(clear.roundSeconds, 140, `W${wave} round seconds`);
  assert.equal(clear.normalCount, 79, `W${wave} spawn count`);
  assert.ok(Number.isFinite(clear.gap) && clear.gap > 0, `W${wave} positive spawn interval`);
}

assert.equal(normal, 91);
assert.equal(boss, 10);
assert.equal(INF.waveForMode(11, 'clear').hpMult / INF.wave(11, true).hpMult, 1.06);
assert.equal(INF.waveForMode(101, 'clear').hpMult / INF.wave(101, true).hpMult, 24);
console.log('PASS pure clear wave rules: 91 capped normal HP curves, 10 unchanged bosses, legacy gold and other modes');
