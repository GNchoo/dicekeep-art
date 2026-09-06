// U10(일부) — 토큰 버킷 경계
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { take, BucketMap } from '../src/ratelimit.js';

test('빈 버킷은 가득 찬 상태로 시작하고 burst 만큼 연속 허용', () => {
  let b = null, ok;
  for (let i = 0; i < 5; i++) { ({ ok, bucket: b } = take(b, 1000, 1, 5)); assert.ok(ok, `i=${i}`); }
  ({ ok, bucket: b } = take(b, 1000, 1, 5));
  assert.equal(ok, false);
  assert.ok(b.tokens < 1);
});

test('시간이 지나면 rate 만큼 보충되고 burst 를 넘지 않는다', () => {
  let b = { tokens: 0, at: 0 };
  let r = take(b, 999, 1, 5);
  assert.equal(r.ok, false);
  r = take(b, 1000, 1, 5);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.bucket.tokens) < 1e-9);
  r = take({ tokens: 0, at: 0 }, 60_000, 1, 5);
  assert.equal(r.ok, true);
  assert.equal(r.bucket.tokens, 4);
});

test('입력 버킷을 바꾸지 않는다', () => {
  const b = { tokens: 3, at: 0 };
  take(b, 100, 1, 5);
  assert.deepEqual(b, { tokens: 3, at: 0 });
});

test('20/s 버스트 40: 40개 즉시 통과, 41번째 거절, 50ms 뒤 1개', () => {
  let b = null, ok;
  for (let i = 0; i < 40; i++) { ({ ok, bucket: b } = take(b, 0, 20, 40)); assert.ok(ok); }
  ({ ok, bucket: b } = take(b, 0, 20, 40));
  assert.equal(ok, false);
  ({ ok, bucket: b } = take(b, 50, 20, 40));
  assert.equal(ok, true);
});

test('BucketMap: 키별 · 상한 초과 시 오래된 키 제거', () => {
  const m = new BucketMap(2);
  assert.ok(m.take('a', 0, 1, 1));
  assert.equal(m.take('a', 0, 1, 1), false);
  assert.ok(m.take('b', 0, 1, 1));
  assert.ok(m.take('c', 0, 1, 1));       // a 가 밀려난다
  assert.equal(m.map.has('a'), false);
  assert.ok(m.take('a', 0, 1, 1));       // 다시 새 버킷
});
