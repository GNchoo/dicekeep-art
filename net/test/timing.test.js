// U3 — timing.js 가 content.js 의 실제 웨이브 구성과 어긋나지 않는지 (패리티). content.js 의 웨이브 계수를 바꾸면 여기가 먼저 깨진다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnEnd, isBoss, bossOrdinal, bossWaves, timingFor, wireTiming, TIMING_BASE, TIMING_FAST } from '../src/timing.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', '..', 'content.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const INF = sandbox.window.DKCONTENT.INFINITY;

// game.js:2029 FAST_AIR 복제 (빠른 공중 적은 간격 ×0.72)
const FAST_AIR = new Set(['bat', 'bee', 'wasp', 'paperplane', 'dandelion', 'hornet', 'hummingbird', 'swift', 'sparrow']);

// game.js:2033-2063 buildInfinityWave 의 마지막 스폰 시각(초)을 그대로 재현
function actualEnd(w) {
  const P = INF.wave(w, true);
  const M = INF.monsterFor(w);
  if (M.boss) return 0.45 + 0.6 + (P.bosses - 1) * 1.5;
  const mult = FAST_AIR.has(M.base.id) ? 0.72 : 1;
  return 0.45 + (M.count - 1) * P.gap * mult;
}

test('spawnEnd(w) ≥ 실제 마지막 스폰 시각, 차이 ≤ 3.5초 (w=1..101)', () => {
  let worst = 0, worstW = 0;
  for (let w = 1; w <= 101; w++) {
    const se = spawnEnd(w) / 1000, real = actualEnd(w);
    assert.ok(se >= real - 1e-6, `w=${w}: spawnEnd ${se} < 실제 ${real}`);
    assert.ok(se - real <= 3.5, `w=${w}: 차이 ${(se - real).toFixed(3)}s > 3.5s`);
    if (se - real > worst) { worst = se - real; worstW = w; }
  }
  console.log(`  최대 차이 ${worst.toFixed(3)}s (w=${worstW})`);
});

test('isBoss · bossOrdinal 이 content.js 와 같다', () => {
  for (let w = 1; w <= 101; w++) {
    assert.equal(isBoss(w), INF.isBossWave(w), `w=${w}`);
    if (isBoss(w)) assert.equal(bossOrdinal(w), INF.bossOrdinal(w), `w=${w}`);
  }
  assert.equal(isBoss(0), false);
  assert.equal(isBoss(110), false);
});

test('보스 spawnEnd 1.05s / 2.55s · 일반 공식', () => {
  assert.equal(spawnEnd(10), 1050);
  assert.equal(spawnEnd(20), 2550);
  assert.equal(spawnEnd(100), 2550);
  assert.equal(spawnEnd(1), Math.round((0.45 + 11 * 0.79) * 1000));
  assert.equal(spawnEnd(101), Math.round((0.45 + 35 * 0.3) * 1000));
});

test('bossWaves', () => {
  assert.deepEqual(bossWaves(101), [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.deepEqual(bossWaves(12), [10]);
  assert.deepEqual(bossWaves(9), []);
});

test('TIMING 표', () => {
  assert.deepEqual(timingFor(''), { ...TIMING_BASE });
  assert.deepEqual(timingFor(undefined), { ...TIMING_BASE });
  assert.deepEqual(timingFor('fast'), { prep: 2000, intermission: 500, bossLimit: 5000, clearWave: 12, endGrace: 5000 });
  assert.deepEqual(timingFor('FAST'), { ...TIMING_FAST });
  assert.deepEqual(TIMING_BASE, { prep: 20000, intermission: 6000, bossLimit: 320000, clearWave: 101, endGrace: 60000 });
  assert.deepEqual(wireTiming(TIMING_BASE), { prep: 20000, intermission: 6000, bossLimit: 320000, clearWave: 101 });
  assert.equal(INF.intermission * 1000, TIMING_BASE.intermission);
  assert.equal(INF.bossTimeLimit * 1000, TIMING_BASE.bossLimit);
  assert.equal(INF.clearWave, TIMING_BASE.clearWave);
});
