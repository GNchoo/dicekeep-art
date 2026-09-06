// HTTP 도우미 — Origin 허용 규칙 (브라우저 · 브랜치 프리뷰 · Capacitor 앱 웹뷰)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originAllowed, routeOf } from '../src/http.js';

const HOST = 'dicekeep-net.acct.workers.dev';

test('originAllowed: 허용 원점', () => {
  assert.ok(originAllowed('http://localhost:8137', HOST), 'localhost 개발 서버');
  assert.ok(originAllowed('http://127.0.0.1:8137', HOST), '127.0.0.1');
  assert.ok(originAllowed('https://dicekeep.acct.workers.dev', HOST), '운영 사이트');
  assert.ok(originAllowed('https://feat-dicekeep.acct.workers.dev', HOST), '브랜치 프리뷰');
  assert.ok(originAllowed('capacitor://localhost', HOST), 'iOS 앱 웹뷰');
  assert.ok(originAllowed('https://localhost', HOST), 'Android 앱 웹뷰 (androidScheme https)');
  assert.ok(originAllowed('ionic://localhost', HOST), '구형 앱 웹뷰');
  assert.ok(originAllowed('https://game.example', HOST, 'https://game.example, https://x.example'), 'ALLOWED_ORIGINS');
});

test('originAllowed: 거절 원점', () => {
  assert.ok(!originAllowed('file://', HOST), 'file:');
  assert.ok(!originAllowed('file:///index.html', HOST), 'file: 경로');
  assert.ok(!originAllowed('capacitor://evil.com', HOST), 'capacitor: 는 localhost 만');
  assert.ok(!originAllowed('https://other.com', HOST), '다른 사이트');
  assert.ok(!originAllowed('chrome-extension://abc', HOST), '확장 프로그램');
  assert.ok(!originAllowed('https://dicekeep.other.workers.dev', HOST), '다른 계정의 dicekeep');
  assert.ok(!originAllowed('http://dicekeep.acct.workers.dev', HOST), '운영 사이트는 https 만');
  assert.ok(!originAllowed('not a url', HOST), 'URL 아님');
  assert.ok(!originAllowed('', HOST), '빈 문자열');
});

test('routeOf', () => {
  const norm = (s) => (/^[A-Z0-9]{6}$/.test(s.toUpperCase()) ? s.toUpperCase() : null);
  assert.deepEqual(routeOf('/health', norm), { kind: 'health' });
  assert.deepEqual(routeOf('/ws/new', norm), { kind: 'new' });
  assert.deepEqual(routeOf('/ws/quick', norm), { kind: 'quick' });
  assert.deepEqual(routeOf('/ws/room/abc234', norm), { kind: 'room', code: 'ABC234' });
  assert.deepEqual(routeOf('/ws/room/%41BC234', norm), { kind: 'room', code: 'ABC234' });
  assert.deepEqual(routeOf('/ws/room/!!', norm), { kind: 'bad-code' });
  assert.deepEqual(routeOf('/nope', norm), { kind: 'none' });
});
