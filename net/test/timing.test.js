// U3 — timing.js 표가 content.js 의 값과 어긋나지 않는지 (bossLimit·clearWave). 서버에는 웨이브 시계가 없으므로 spawnEnd 패리티는 없다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from '../src/timing.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', '..', 'content.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const INF = sandbox.window.DKCONTENT.INFINITY;

test('TIMING 표 · wireTiming 세 값', () => {
  assert.deepEqual(T.timingFor(''), { ...T.TIMING_BASE });
  assert.deepEqual(T.timingFor(undefined), { ...T.TIMING_BASE });
  assert.deepEqual(T.timingFor('fast'), { prep: 2000, bossLimit: 5000, clearWave: 12 });
  assert.deepEqual(T.timingFor('FAST'), { ...T.TIMING_FAST });
  assert.deepEqual(T.TIMING_BASE, { prep: 20000, bossLimit: 320000, clearWave: 101 });
  assert.deepEqual(T.wireTiming({ ...T.TIMING_BASE, extra: 1 }), { prep: 20000, bossLimit: 320000, clearWave: 101 });
  assert.notEqual(T.timingFor(''), T.TIMING_BASE);   // 복사본
});

test('content.js 패리티: bossTimeLimit · clearWave', () => {
  assert.equal(INF.bossTimeLimit * 1000, T.TIMING_BASE.bossLimit);
  assert.equal(INF.clearWave, T.TIMING_BASE.clearWave);
});

test('상수 값', () => {
  assert.equal(T.MAX_FRAME, 6144);
  assert.equal(T.SUM_RELAY_MIN, 1500);
  assert.equal(T.SUM_WATCH_MIN, 1000);
  assert.equal(T.QUICK_WAIT, 10000);
  assert.equal(T.QUICK_QUEUE_MAX, 200);
  assert.equal(T.RESERVE_TTL, 30000);
  assert.equal(T.ROOMS_PER_HOUR, 120);
  assert.equal(T.IP_QUICK_PER_MIN, 30);
  assert.equal(T.ROOM_SIZE, 4);
  assert.ok(T.RECONNECT_GRACE === 180000 && T.GAME_CAP === 100 * 60000 && T.EMPTY_END === 3 * 60000);
  assert.ok(!('spawnEnd' in T) && !('isBoss' in T) && !('bossWaves' in T) && !('END_GRACE' in T));
});
