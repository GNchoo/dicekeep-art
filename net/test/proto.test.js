// U2 — 메시지 스키마 · 범위 · 정규화 · 퍼즈
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, sanitizeName, cleanText, byteLength, PROTOCOL, CLOSE, TYPES, HELLO_OPS } from '../src/proto.js';
import { MAX_FRAME, EN_MAX } from '../src/timing.js';

const KEY = '0123456789abcdef0123456789abcdef';
const SUM = { t: 'sum', w: 3, dw: 2, l: 20, g: 400, k: 12, f: 30, sp: 1, hid: 0, b: null, o: 'l', tw: [[0, 6, 2], [14, 20, 3]] };
const ok = (m) => { const r = parse(JSON.stringify(m)); assert.equal(r.ok, true, JSON.stringify(m) + ' → ' + JSON.stringify(r)); return r.m; };
const bad = (m) => { const r = parse(typeof m === 'string' ? m : JSON.stringify(m)); assert.equal(r.ok, false, JSON.stringify(m)); };

test('상수', () => {
  assert.equal(PROTOCOL, 4);
  assert.deepEqual(CLOSE, { LEAVE: 4000, REPLACED: 4001, BAD_REQUEST: 4400, FORBIDDEN: 4403, NO_ROOM: 4404, CONFLICT: 4409, EXPIRED: 4410, VERSION: 4426, RATE: 4429, TOO_BIG: 1009 });
  assert.deepEqual(TYPES.sort(), ['battle', 'battleAck', 'chat', 'clear', 'dead', 'done', 'hello', 'leave', 'log', 'report', 'start', 'sum', 'time', 'watch'].sort());
  assert.deepEqual(HELLO_OPS, ['create', 'join', 'quick']);
  // 서버→클라 전용 종류는 클라가 보내도 거절
  for (const t of ['welcome', 'room', 'player', 'matched', 'queued', 'watched', 'end', 'err']) bad({ t });
});

test('신고(report): pid·사유 검증, 긴 메모 절단', () => {
  const PID = 'wxyz5678';
  // 정상
  assert.deepEqual(ok({ t: 'report', pid: PID, reason: 'abuse' }), { t: 'report', pid: PID, reason: 'abuse', text: '' });
  assert.deepEqual(ok({ t: 'report', pid: PID, reason: 'spam', text: ' 도배합니다 ' }), { t: 'report', pid: PID, reason: 'spam', text: '도배합니다' });
  for (const reason of ['abuse', 'sexual', 'spam', 'cheat', 'other']) assert.equal(ok({ t: 'report', pid: PID, reason }).reason, reason);
  // pid 형식
  for (const pid of ['', 'short', 'UPPERCASE', '너무길어서안됨', 'x'.repeat(17), 1234, null]) bad({ t: 'report', pid, reason: 'abuse' });
  // 사유는 목록 안이어야 한다 (임의 문자열 금지)
  for (const reason of ['', 'harassment', 'ABUSE', 1, null, undefined]) bad({ t: 'report', pid: PID, reason });
  // 메모는 TEXT_MAX 로 절단, 제어문자 제거
  assert.equal(ok({ t: 'report', pid: PID, reason: 'other', text: 'a'.repeat(500) }).text.length, 120);
  assert.equal(ok({ t: 'report', pid: PID, reason: 'other', text: 'a\u0000b' }).text, 'ab');
  bad({ t: 'report', pid: PID, reason: 'other', text: 'a'.repeat(4000) });
});

test('유효 표본', () => {
  const h = ok({ t: 'hello', v: 4, ver: '78', op: 'create', pid: 'abcd1234', key: KEY, name: ' 민수 ' });
  assert.deepEqual(h, { t: 'hello', v: 4, ver: '78', op: 'create', pid: 'abcd1234', key: KEY, name: '민수', mode: 'clear' });
  assert.equal(ok({ t: 'hello', v: 4, ver: '78', op: 'quick', pid: 'abcd1234', key: KEY, name: 'x' }).op, 'quick');
  assert.equal(ok({ t: 'hello', v: 2, ver: '78', op: 'join', pid: 'abcd1234', key: KEY, name: 'x' }).v, 2);   // v 는 room-core 가 거절한다
  assert.deepEqual(ok({ t: 'start', junk: 1 }), { t: 'start' });
  const s = ok({ ...SUM, extra: 'x' });
  assert.deepEqual(s, SUM);
  assert.deepEqual(ok({ ...SUM, b: 0.5, hid: 1, o: 'p', tw: [], sp: 3 }), { ...SUM, b: 0.5, hid: 1, o: 'p', tw: [], sp: 3 });
  assert.deepEqual(ok({ ...SUM, ll: 0, en: '' }), { ...SUM, ll: 0, en: '' });
  assert.deepEqual(ok({ ...SUM, ll: 100000, en: '12,3,4;5,6,7;' }), { ...SUM, ll: 100000, en: '12,3,4;5,6,7;' });
  assert.deepEqual(ok({ t: 'watch', pid: 'abcd1234' }), { t: 'watch', pid: 'abcd1234' });
  assert.deepEqual(ok({ t: 'watch', pid: null }), { t: 'watch', pid: null });
  assert.deepEqual(ok({ t: 'done', w: 10 }), { t: 'done', w: 10 });
  assert.deepEqual(ok({ t: 'dead', w: 34, k: 100, r: 'lives' }), { t: 'dead', w: 34, k: 100, r: 'lives' });
  assert.deepEqual(ok({ t: 'clear', w: 101, k: 5000 }), { t: 'clear', w: 101, k: 5000 });
  assert.deepEqual(ok({ t: 'chat', text: ' 안녕 ' }), { t: 'chat', text: '안녕' });
  assert.deepEqual(ok({ t: 'log', text: '확률강화 성공', kind: 'up' }), { t: 'log', text: '확률강화 성공', kind: 'up' });
  assert.deepEqual(ok({ t: 'time', c: 12345.678 }), { t: 'time', c: 12345.678 });
  assert.deepEqual(ok({ t: 'leave' }), { t: 'leave' });
});

test('무효 표본', () => {
  bad('not json');
  bad('[1,2]');
  bad('null');
  bad('"str"');
  bad({ t: 'nope' });
  bad({});
  bad({ t: 'hello', v: 4, ver: '78', op: 'join', pid: 'ABCD1234', key: KEY, name: 'x' });   // pid 대문자
  bad({ t: 'hello', v: 4, ver: '78', op: 'join', pid: 'abc', key: KEY, name: 'x' });        // pid 짧음
  bad({ t: 'hello', v: 4, ver: '78', op: 'join', pid: 'abcd1234', key: KEY.slice(1), name: 'x' });
  bad({ t: 'hello', v: 4, ver: '78', op: 'fast', pid: 'abcd1234', key: KEY, name: 'x' });
  bad({ t: 'hello', v: '3', ver: '78', op: 'join', pid: 'abcd1234', key: KEY, name: 'x' });
  bad({ t: 'hello', v: 4, ver: 78, op: 'join', pid: 'abcd1234', key: KEY, name: 'x' });
  bad({ t: 'watch' });
  bad({ t: 'watch', pid: undefined });
  bad({ t: 'watch', pid: 'ABCD1234' });
  bad({ t: 'watch', pid: 5 });
  bad({ t: 'done' });
  bad({ t: 'done', w: '10' });
  bad({ t: 'done', w: 10.5 });
  bad({ t: 'dead', w: 3, k: 1, r: 'boredom' });
  bad({ t: 'clear', w: 101 });
  bad({ t: 'chat', text: '' });
  bad({ t: 'chat', text: '   ' });
  bad({ t: 'chat', text: 5 });
  bad({ t: 'chat', text: 'x'.repeat(3000) });
  bad({ t: 'log', text: 'x', kind: 'evil' });
  bad({ t: 'time', c: 'now' });
  bad({ t: 'time', c: Infinity });
  bad({ t: 'time', c: NaN });
});

test('sum 경계', () => {
  ok({ ...SUM, w: 0 }); ok({ ...SUM, w: 101 }); ok({ ...SUM, w: 102 }); ok({ ...SUM, w: 1e6 }); bad({ ...SUM, w: 1e6 + 1 }); bad({ ...SUM, w: -1 });
  ok({ ...SUM, l: 0 }); bad({ ...SUM, l: 21 });
  ok({ ...SUM, g: 1e7 }); bad({ ...SUM, g: 1e7 + 1 }); bad({ ...SUM, g: 1.5 });
  bad({ ...SUM, k: 1e6 + 1 }); bad({ ...SUM, f: 201 });
  ok({ ...SUM, sp: 3 }); ok({ ...SUM, sp: 4 }); // x3 remains accepted for existing clients.
  bad({ ...SUM, sp: 0 }); bad({ ...SUM, sp: 5 }); bad({ ...SUM, sp: 1.5 }); bad({ ...SUM, sp: undefined }); bad({ ...SUM, sp: '1' });
  assert.ok(!('lag' in ok({ ...SUM, lag: 0.5 })));                       // v2 필드는 버린다
  bad({ ...SUM, ll: -1 }); bad({ ...SUM, ll: 100001 }); bad({ ...SUM, ll: 1.5 }); bad({ ...SUM, ll: '3' }); bad({ ...SUM, ll: null });
  bad({ ...SUM, en: 'a' }); bad({ ...SUM, en: '1 2' }); bad({ ...SUM, en: '1.5' }); bad({ ...SUM, en: 5 }); bad({ ...SUM, en: null });
  ok({ ...SUM, en: '1'.repeat(EN_MAX) }); bad({ ...SUM, en: '1'.repeat(EN_MAX + 1) });
  bad({ ...SUM, hid: 2 }); bad({ ...SUM, hid: true });
  ok({ ...SUM, b: 0 }); ok({ ...SUM, b: 1 }); bad({ ...SUM, b: 1.01 }); bad({ ...SUM, b: -0.01 }); bad({ ...SUM, b: undefined });
  bad({ ...SUM, o: 'x' });
  bad({ ...SUM, tw: [[0, 21, 1]] });     // face 21
  bad({ ...SUM, tw: [[15, 6, 1]] });     // spot 15
  bad({ ...SUM, tw: [[0, 6, 4]] });      // lvl 4
  bad({ ...SUM, tw: [[0, 6]] });
  bad({ ...SUM, tw: [[0, 0, 1]] });
  bad({ ...SUM, tw: Array.from({ length: 16 }, (_, i) => [i % 15, 1, 1]) });   // 16개
  ok({ ...SUM, tw: Array.from({ length: 15 }, (_, i) => [i, 1, 1]) });
  bad({ ...SUM, tw: 'x' });
  bad({ ...SUM, t: 'sum', w: undefined });
});

test('문자열 정규화: 제어문자 제거 · 120자 절단 · NFC', () => {
  const r = ok({ t: 'chat', text: 'a\u0001b\u0000c\u200bd\u007f' });
  assert.equal(r.text, 'abcd');
  const long = ok({ t: 'chat', text: '가'.repeat(200) });
  assert.equal(Array.from(long.text).length, 120);
  const emoji = ok({ t: 'chat', text: '😀'.repeat(130) });
  assert.equal(Array.from(emoji.text).length, 120);
  assert.equal(cleanText('é', 10), 'é');
  assert.equal(cleanText(123, 10), '');
});

test('sanitizeName', () => {
  assert.equal(sanitizeName('  민수  ', 'abcd1234'), '민수');
  assert.equal(sanitizeName('<b>x</b> y', 'abcd1234'), 'bx/b y');
  assert.equal(sanitizeName('a    b   c', 'abcd1234'), 'a b c');
  assert.equal(sanitizeName('a    b\t\tc', 'abcd1234'), 'a bc');   // 탭은 제어문자라 먼저 제거된다
  assert.equal(sanitizeName('', 'abcd1234'), '플레이어-abcd');
  assert.equal(sanitizeName('<>', 'abcd1234'), '플레이어-abcd');
  assert.equal(sanitizeName(undefined, 'zzzz9999'), '플레이어-zzzz');
  assert.equal(sanitizeName('가나다라마바사아자차카타파하', 'x'), '가나다라마바사아자차카타');
  assert.equal(Array.from(sanitizeName('😀'.repeat(20), 'x')).length, 12);
  assert.equal(sanitizeName(' x', 'x'), 'x');
});

test('크기 한도 6,144 B', () => {
  assert.equal(MAX_FRAME, 6144);
  assert.equal(byteLength('x'.repeat(MAX_FRAME)), MAX_FRAME);
  assert.equal(byteLength('가'), 3);
  assert.ok(byteLength(JSON.stringify(SUM)) < 300);
  assert.ok(byteLength(JSON.stringify({ ...SUM, ll: 100000, en: '1'.repeat(EN_MAX), tw: Array.from({ length: 15 }, (_, i) => [i, 20, 3]) })) <= MAX_FRAME);   // 꽉 찬 sum 도 한 프레임
  const big = JSON.stringify({ t: 'chat', text: 'x'.repeat(MAX_FRAME) });
  assert.ok(byteLength(big) > MAX_FRAME);
  assert.equal(byteLength(new Uint8Array(10)), 10);
});

test('랜덤 JSON 1,000개 퍼즈: 예외 없음', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const vals = () => pick([null, true, false, 0, -1, 1.5, 1e21, NaN, '', 'x', '가'.repeat(5), [], {}, [1, 2, 3], { a: 1 }, [[1, 2, 3]], undefined]);
  const keys = ['t', 'v', 'ver', 'op', 'pid', 'key', 'name', 'w', 'dw', 'l', 'g', 'k', 'f', 'sp', 'll', 'en', 'hid', 'b', 'o', 'tw', 'r', 'text', 'kind', 'c', 'zz'];
  let okN = 0;
  for (let i = 0; i < 1000; i++) {
    const m = {};
    if (rnd() < 0.9) m.t = pick([...TYPES, 'x', 5, null]);
    const n = Math.floor(rnd() * 8);
    for (let j = 0; j < n; j++) m[pick(keys)] = vals();
    let text;
    try { text = JSON.stringify(m); } catch (e) { text = '{'; }
    if (rnd() < 0.05) text = text.slice(0, Math.floor(text.length * rnd()));
    const r = parse(text);
    assert.ok(r && typeof r.ok === 'boolean');
    if (r.ok) { okN++; assert.ok(TYPES.includes(r.m.t)); }
  }
  assert.ok(okN < 1000);
});


test('v4 mode and extreme wave schema boundaries', () => {
 const hello={t:'hello',v:4,ver:'100',op:'join',pid:'abcd1234',key:KEY,name:'test'};
 assert.equal(ok(hello).mode,'clear');assert.equal(ok({...hello,mode:'extreme'}).mode,'extreme');
 for(const mode of ['endless','extra','',null,1,{},['clear']])bad({...hello,mode});
 for(const w of [102,1000000]){ok({...SUM,w,dw:w});ok({t:'done',w});ok({t:'dead',w,k:1,r:'lives'});}
 for(const w of [1000001,-1,1.5,Infinity,NaN]){bad({...SUM,w});bad({t:'done',w});bad({t:'dead',w,k:1,r:'lives'});}
 bad({t:'clear',w:102,k:1});
});
