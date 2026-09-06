// U1 — 방 코드 알파벳 · 생성 · 정규화
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALPHABET, CODE_RE, gen, normalize } from '../src/codes.js';

test('알파벳: 31자, 헷갈리는 글자 없음', () => {
  assert.equal(ALPHABET.length, 31);
  assert.equal(new Set(ALPHABET).size, 31);
  for (const ch of '0O1IL') assert.ok(!ALPHABET.includes(ch), ch);
});

test('gen(): 6자리, 전부 알파벳 안', () => {
  for (let i = 0; i < 1000; i++) {
    const c = gen();
    assert.equal(c.length, 6);
    assert.ok(CODE_RE.test(c), c);
  }
});

test('gen(bytes): 주입한 바이트를 순서대로 쓰고 248 이상은 건너뛴다', () => {
  const seq = [255, 250, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  let i = 0;
  const bytes = (n) => Uint8Array.from({ length: n }, () => seq[i++ % seq.length]);
  assert.equal(gen(bytes), 'ABCDEF');
  const c2 = gen((n) => new Uint8Array(n).fill(247));
  assert.equal(c2, ALPHABET[247 % 31].repeat(6));
});

test('normalize', () => {
  assert.equal(normalize('abc234'), 'ABC234');
  assert.equal(normalize('ABC234'), 'ABC234');
  assert.equal(normalize('ab2-3 4'), null);
  assert.equal(normalize('ABCDEFG'), null);
  assert.equal(normalize('ABC23'), null);
  assert.equal(normalize('ABC10I'), null);   // 0 · 1 · I 는 알파벳 밖
  assert.equal(normalize('ABCDEL'), null);   // L 도 알파벳 밖
  assert.equal(normalize(''), null);
  assert.equal(normalize(123456), null);
  assert.equal(normalize(null), null);
});
