// 클라이언트 net.js(DKNET v3) 단위 테스트 — node:test, 의존성 없음.
// net.js 는 window 에 붙는 클래식 스크립트라 vm 으로 가짜 브라우저(window/document/저장소/타이머/WebSocket) 안에 로드한다.
// 타이머·performance 는 가짜 시계라 advance(ms) 로 결정적으로 돌린다.
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NET_JS = path.resolve(__dirname, '..', '..', 'net.js');
const SRC = fs.readFileSync(NET_JS, 'utf8');
const flush = () => new Promise((r) => setImmediate(r));
// vm 안 객체는 프로토타입이 다른 realm 이라 strict deepEqual 이 실패한다 → JSON 왕복으로 구조만 비교
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}

// 가짜 브라우저 환경 하나 = DKNET 인스턴스 하나
function makeEnv(opts = {}) {
  const clock = { now: 0, q: [], seq: 0 };
  const push = (fn, ms, every, args) => { const id = ++clock.seq; clock.q.push({ id, at: clock.now + Math.max(0, +ms || 0), fn, every, args }); return id; };
  const remove = (id) => { const i = clock.q.findIndex((t) => t.id === id); if (i >= 0) clock.q.splice(i, 1); };
  const timers = {
    setTimeout: (fn, ms, ...args) => push(fn, ms, null, args),
    setInterval: (fn, ms, ...args) => push(fn, ms, Math.max(1, +ms || 1), args),
    clearTimeout: remove, clearInterval: remove,
  };
  function advance(ms) {
    const end = clock.now + ms;
    for (;;) {
      let next = null;
      for (const t of clock.q) if (t.at <= end && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t;
      if (!next) break;
      remove(next.id);
      clock.now = Math.max(clock.now, next.at);
      if (next.every != null) { next.at = clock.now + next.every; clock.q.push(next); }
      next.fn(...next.args);
    }
    clock.now = end;
  }
  const sockets = [];
  class FakeWebSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.closed = null; this.onopen = this.onmessage = this.onclose = this.onerror = null; sockets.push(this); }
    send(d) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(d); }
    close(code, reason) { this.readyState = 3; this.closed = { code, reason }; }
    _open() { this.readyState = 1; if (this.onopen) this.onopen({}); }
    _recv(m) { if (this.onmessage) this.onmessage({ data: typeof m === 'string' ? m : JSON.stringify(m) }); }
    _close(code, reason) { this.readyState = 3; if (this.onclose) this.onclose({ code, reason: reason || '', wasClean: false }); }
    json() { return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s)); }
    last(t) { const a = this.json().filter((m) => m.t === t); return a[a.length - 1]; }
  }
  FakeWebSocket.CONNECTING = 0; FakeWebSocket.OPEN = 1; FakeWebSocket.CLOSING = 2; FakeWebSocket.CLOSED = 3;
  const listeners = {};
  const addL = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  const document = { currentScript: { src: opts.src || 'net.js?v=78' }, hidden: false, visibilityState: 'visible', addEventListener: addL };
  const window = { addEventListener: addL };
  if (opts.location) window.location = opts.location;
  if (opts.DK_NET_URL) window.DK_NET_URL = opts.DK_NET_URL;
  const sandbox = Object.assign({
    window, document, localStorage: makeStorage(), sessionStorage: makeStorage(),
    performance: { now: () => clock.now }, crypto: globalThis.crypto, WebSocket: FakeWebSocket, console,
  }, timers);
  if (opts.localStorage) for (const [k, v] of Object.entries(opts.localStorage)) sandbox.localStorage.setItem(k, v);
  vm.runInNewContext(SRC, sandbox, { filename: 'net.js' });
  const N = sandbox.window.DKNET;
  const events = [];
  for (const t of ['welcome', 'room', 'player', 'start', 'sum', 'watched', 'queued', 'matched', 'chat', 'log', 'time', 'end', 'err', 'net:state', 'net:reconnecting', 'net:offset', 'net:closed']) N.on(t, (d) => events.push({ t, d }));
  const fire = (type, ev) => { for (const fn of listeners[type] || []) fn(ev || {}); };
  return { N, sandbox, sockets, clock, advance, fire, events, document, lastSock: () => sockets[sockets.length - 1] };
}

const CODE = 'ABC234';
const OTHER = 'zz9other';
function welcomeMsg(pid, extra = {}) {
  const room = Object.assign({
    code: CODE, phase: 'lobby', hostId: pid, ver: '78', now: 5000000,
    players: [
      { pid, name: '민수', host: true, connected: true, status: 'alive', wave: 0, deathWave: 0, kills: 0, sp: 1, dw: 0, hidden: false, rank: 0 },
      { pid: OTHER, name: '영희', host: false, connected: true, status: 'alive', wave: 0, deathWave: 0, kills: 0, sp: 1, dw: 0, hidden: false, rank: 0 },
    ],
    game: null,
  }, extra.room || {});
  return Object.assign({ t: 'welcome', at: 5000000, pid, code: CODE, kind: 'code', resumed: false, now: 5000000 }, extra, { room });
}
// create → open → welcome 까지 한 번에
async function connected(env, opts = {}) {
  const { N } = env;
  N.CFG.url = 'ws://test';
  const p = N.create(opts.name || '민수');
  const ws = env.lastSock();
  ws._open();
  const hello = ws.json()[0];
  ws._recv(welcomeMsg(hello.pid, opts.welcome || {}));
  const room = await p;
  return { ws, hello, room };
}

test('node --check net.js', () => {
  execFileSync(process.execPath, ['--check', NET_JS], { stdio: 'pipe' });
});

test('CFG: 버전은 스크립트 ?v=, 주소는 location 없으면 null', () => {
  const { N } = makeEnv();
  assert.equal(N.CFG.protocol, 4);
  assert.equal(N.CFG.ver, '78');
  assert.equal(N.CFG.url, null);
  assert.equal(N.CFG.sumInterval, 2000);
  assert.equal(N.CFG.watchInterval, 1000);
  assert.equal(N.CFG.pingEvery, 25000);
  assert.equal(N.CFG.timeEvery, 30000);
  assert.equal(N.state, 'offline');
  assert.equal(N.me, null);
  assert.equal(N.room, null);
  assert.equal(N.inRoom(), false);
  same(N.members(), []);
  assert.equal(makeEnv({ src: 'net.js' }).N.CFG.ver, '0');
});

test('_resolveUrl: 호스트·쿼리·저장값 규칙', () => {
  const { N } = makeEnv();
  const r = N._resolveUrl;
  assert.equal(r('dicekeep.cgn3731.workers.dev', '?net=off', 'ws://stored'), null, 'off 는 전부 이긴다');
  assert.equal(r('example.com', '?x=1&net=wss%3A%2F%2Fx.example%2Fws%2F', null), 'wss://x.example/ws', 'ws 지정 (끝 슬래시 제거)');
  assert.equal(r('localhost', '?net=clear', 'ws://stored'), 'ws://localhost:8787', 'clear 는 저장값을 무시하고 기본');
  assert.equal(r('localhost', '', null), 'ws://localhost:8787');
  assert.equal(r('127.0.0.1', '', null), 'ws://localhost:8787');
  assert.equal(r('[::1]', '', null), 'ws://localhost:8787');
  assert.equal(r('dicekeep.cgn3731.workers.dev', '', null), 'wss://dicekeep-net.cgn3731.workers.dev', '운영');
  assert.equal(r('abc-dicekeep.cgn3731.workers.dev', '', null), 'wss://dicekeep-net.cgn3731.workers.dev', '브랜치 프리뷰');
  assert.equal(r('DiceKeep.Acct.Workers.Dev', '', null), 'wss://dicekeep-net.acct.workers.dev', '대소문자 무시');
  assert.equal(r('dicekeep-net.cgn3731.workers.dev', '', null), null, '서버 호스트 자체는 매치 안 함');
  assert.equal(r('example.com', '', null), null, '기타');
  assert.equal(r('example.com', '', 'ws://stored:1'), 'ws://stored:1', '저장값');
  assert.equal(r('example.com', '', null, 'wss://fallback'), 'wss://fallback', 'window.DK_NET_URL');
  assert.equal(r('example.com', '?net=http://nope', null), null, 'ws(s) 아닌 지정은 무시');
  assert.equal(r('localhost', '', null, 'wss://fallback/', true), 'wss://fallback', '앱(native)은 hostname 이 localhost 라도 폴백(운영 서버) 우선');
  assert.equal(r('localhost', '', null, null, true), 'ws://localhost:8787', '앱이라도 폴백이 없으면 기존 규칙');
  assert.equal(r('localhost', '?net=off', null, 'wss://fallback', true), null, '앱에서도 ?net=off 가 이긴다');
  assert.equal(r('localhost', '', 'ws://stored:1', 'wss://fallback', true), 'ws://stored:1', '앱에서도 저장값이 폴백보다 먼저');
});

test('resolveUrl 부작용: ?net=ws… 저장 · ?net=clear 삭제', () => {
  const a = makeEnv({ location: { hostname: 'example.com', search: '?net=ws://a.b:1' } });
  assert.equal(a.N.CFG.url, 'ws://a.b:1');
  assert.equal(a.sandbox.localStorage.getItem('dk_net'), 'ws://a.b:1');
  const b = makeEnv({ location: { hostname: 'example.com', search: '' }, localStorage: { dk_net: 'ws://a.b:1' } });
  assert.equal(b.N.CFG.url, 'ws://a.b:1');
  const c = makeEnv({ location: { hostname: 'example.com', search: '?net=clear' }, localStorage: { dk_net: 'ws://a.b:1' } });
  assert.equal(c.N.CFG.url, null);
  assert.equal(c.sandbox.localStorage.getItem('dk_net'), null);
  const d = makeEnv({ location: { hostname: 'example.com', search: '' }, DK_NET_URL: 'wss://custom.example' });
  assert.equal(d.N.CFG.url, 'wss://custom.example');
});

test('sanitizeName: 제어문자·<> 제거, 공백 압축, 12자 절단, 빈 이름', () => {
  const { N } = makeEnv();
  const s = N.sanitizeName;
  assert.equal(s('  민수  ', 'abcd1234'), '민수');
  assert.equal(s('a bcd', 'abcd1234'), 'abcd');
  assert.equal(s('<script>x</script>', 'abcd1234'), 'scriptx/scri', '<> 제거 뒤 12자 절단');
  assert.equal(s('a   b \t c', 'abcd1234'), 'a b c');
  assert.equal(s('1234567890123456', 'abcd1234'), '123456789012');
  assert.equal(s('', 'abcd1234'), '플레이어-abcd');
  assert.equal(s('<>', 'abcd1234'), '플레이어-abcd');
  assert.equal(s(null, 'wxyz9999'), '플레이어-wxyz');
  assert.equal(s(12, 'abcd1234'), '12');
  assert.equal(N.normCode(' ab c-234 '), 'ABC234');
});

test('create: hello 형식 → welcome → 미러·세션·이벤트', async () => {
  const env = makeEnv();
  const { N, events, sandbox } = env;
  await assert.rejects(N.create('x'), (e) => e.code === 'offline', 'url 없으면 offline 거절');
  const { ws, hello, room } = await connected(env);
  assert.equal(ws.url, 'ws://test/ws/new');
  assert.equal(hello.t, 'hello');
  assert.equal(hello.v, 4);
  assert.equal(hello.ver, '78');
  assert.equal(hello.op, 'create');
  assert.match(hello.pid, /^[a-z0-9]{8}$/);
  assert.match(hello.key, /^[0-9a-f]{32}$/);
  assert.equal(hello.name, '민수');
  assert.equal(JSON.parse(sandbox.sessionStorage.getItem('dk_mp_id')).pid, hello.pid, '좌석은 sessionStorage');
  assert.equal(N.state, 'lobby');
  assert.equal(N.code, CODE);
  assert.equal(room.code, CODE);
  assert.equal(N.room, room, 'resolve 값 = 미러');
  assert.equal(room.t, undefined, '미러에는 t/at 없음');
  same(N.me, { pid: hello.pid, name: '민수' });
  assert.equal(N.isHost(), true);
  assert.equal(N.inRoom(), true);
  assert.equal(N.inGame(), false);
  assert.equal(N.members().length, 2);
  same(JSON.parse(sandbox.sessionStorage.getItem('dk_mp')), { code: CODE, pid: hello.pid, key: hello.key, name: '민수', mode: 'clear' });
  const kinds = events.map((e) => e.t);
  same(kinds.filter((k) => k !== 'net:offset'), ['net:state', 'net:state', 'welcome', 'room'], '순서: connecting → lobby → welcome → room');
  const roomEv = events.find((e) => e.t === 'room').d;
  assert.equal(roomEv.t, 'room');
  assert.equal(roomEv.code, CODE);
  // 접속 직후 time 5회(200ms 간격)
  assert.equal(ws.json().filter((m) => m.t === 'time').length, 1);
  env.advance(1000);
  assert.equal(ws.json().filter((m) => m.t === 'time').length, 5);
  assert.ok(N._debug().length > 0);
});

test('서버 이름 확정(중복 접미)이 me.name 에 반영된다', async () => {
  const env = makeEnv();
  const { N } = env;
  N.CFG.url = 'ws://test';
  const p = N.join('abc234', '영희');
  const ws = env.lastSock();
  assert.equal(ws.url, 'ws://test/ws/room/ABC234', '코드 정규화');
  ws._open();
  const hello = ws.json()[0];
  assert.equal(hello.op, 'join');
  const w = welcomeMsg(hello.pid);
  w.room.players[0].name = '영희 (2)';
  ws._recv(w);
  await p;
  assert.equal(N.me.name, '영희 (2)');
  await assert.rejects(N.join('abc', 'x'), (e) => e.code === 'bad-code');
});

test('거절: err 후 닫힘 → promise reject(code) → offline (세션은 지움)', async () => {
  const env = makeEnv();
  const { N, events, sandbox } = env;
  N.CFG.url = 'ws://test';
  sandbox.sessionStorage.setItem('dk_mp', JSON.stringify({ code: CODE, pid: 'abcdefgh', key: 'a'.repeat(32), name: 'x' }));
  const p = N.join(CODE, 'x');
  const ws = env.lastSock();
  ws._open();
  ws._recv({ t: 'err', at: 1, code: 'bad-code', msg: '없는 방' });
  await assert.rejects(p, (e) => e.code === 'bad-code' && e.message === '없는 방');
  assert.equal(events.filter((e) => e.t === 'err').length, 0, 'welcome 전 err 는 이벤트가 아니라 reject');
  ws._close(4404);
  await flush();
  assert.equal(N.state, 'offline');
  assert.equal(sandbox.sessionStorage.getItem('dk_mp'), null);
  assert.equal(events.filter((e) => e.t === 'net:closed').length, 0, '첫 접속 실패는 net:closed 없음');
  // err 없이 바로 닫히면 닫기 코드로 code 를 만든다
  const p2 = N.join(CODE, 'x');
  const ws2 = env.lastSock();
  ws2._open();
  ws2._close(4409, 'full');
  await assert.rejects(p2, (e) => e.code === 'started');
  assert.equal(N.state, 'offline');
});

test('welcome 5초 타임아웃 → timeout 거절', async () => {
  const env = makeEnv();
  const { N } = env;
  N.CFG.url = 'ws://test';
  const p = N.create('x');
  const ws = env.lastSock();
  ws._open();
  env.advance(5001);
  await assert.rejects(p, (e) => e.code === 'timeout');
  assert.equal(ws.closed.code, 1000);
  assert.equal(N.state, 'offline');
});

test('room 미러: room/player/start/end 병합, 상태 전이, welcome 후 err 는 이벤트', async () => {
  const env = makeEnv();
  const { N, events } = env;
  const { ws, hello } = await connected(env);
  ws._recv({ t: 'player', at: 2, pid: OTHER, connected: false, wave: 3 });
  assert.equal(N.members()[1].connected, false);
  assert.equal(N.members()[1].wave, 3);
  assert.equal(N.members()[1].name, '영희', '안 바뀐 필드 유지');
  ws._recv({ t: 'player', at: 2, pid: 'newguy01', name: '철수', connected: true });
  assert.equal(N.members().length, 3, '모르는 pid 는 추가');
  ws._recv({ t: 'err', at: 2, code: 'not-ready', msg: '2명 이상' });
  assert.equal(events.filter((e) => e.t === 'err').length, 1);
  assert.equal(N.start(), true);
  assert.equal(ws.last('start').t, 'start');
  const timing = { prep: 20000, bossLimit: 320000, clearWave: 101 };
  ws._recv({ t: 'start', at: 3, seed: 42, t0: 5020000, timing, now: 5000000 });
  assert.equal(N.state, 'playing');
  assert.equal(N.inGame(), true);
  assert.equal(N.room.phase, 'playing');
  assert.equal(N.room.game.t0, 5020000);
  assert.equal(N.room.game.seed, 42);
  same(N.room.game.timing, timing);
  ws._recv({ t: 'sched', at: 3, from: 1, ats: [5020000] });
  ws._recv({ t: 'hold', at: 4, w: 10 });
  assert.equal(events.filter((e) => e.t === 'sched' || e.t === 'hold').length, 0, 'v2 시계 메시지는 버린다');
  ws._recv({ t: 'sum', at: 5, pid: OTHER, w: 3, dw: 2, l: 20, g: 100, k: 5, f: 3, sp: 2, hid: 0, b: null, o: 'p', tw: [[0, 3, 1]], ll: 1800, en: '3,120,9;1000,40,5' });
  assert.equal(events.filter((e) => e.t === 'sum').length, 1);
  assert.equal(events.find((e) => e.t === 'sum').d.pid, OTHER);
  assert.equal(events.find((e) => e.t === 'sum').d.en, '3,120,9;1000,40,5', 'en 은 그대로 전달');
  ws._recv({ t: 'watched', at: 5, n: 2 });
  assert.equal(events[events.length - 1].t, 'watched');
  assert.equal(events[events.length - 1].d.n, 2);
  ws._recv({ t: 'chat', at: 5, pid: OTHER, name: '영희', text: '안녕' });
  ws._recv({ t: 'log', at: 5, pid: OTHER, name: '영희', text: '강화 성공', kind: 'up' });
  ws._recv({ t: 'bogus', at: 5 });
  ws._recv('not json');
  ws._recv('pong');
  same(events.slice(-2).map((e) => e.t), ['chat', 'log'], '허용목록 밖은 발화 안 함');
  ws._recv({ t: 'room', at: 6, code: CODE, kind: 'code', phase: 'playing', hostId: OTHER, ver: '78', now: 5, players: [{ pid: hello.pid, name: '민수', host: false }], game: { t0: 1, timing, seed: 42 } });
  assert.equal(N.isHost(), false, 'room 스냅샷으로 통째로 교체');
  assert.equal(N.members().length, 1);
  ws._recv({ t: 'end', at: 7, reason: 'cleared', seed: 42, ranking: [{ pid: OTHER, name: '영희', rank: 1, status: 'cleared', wave: 101, kills: 900, clearAt: 7000000 }, { pid: hello.pid, name: '민수', rank: 2, status: 'dead', wave: 40, deathWave: 40, kills: 300 }] });
  assert.equal(N.state, 'ended');
  assert.equal(N.inRoom(), true);
  assert.equal(N.inGame(), false);
  assert.equal(N.room.game.reason, 'cleared');
  assert.equal(N.members().find((p) => p.pid === hello.pid).rank, 2);
  assert.equal(N.members().find((p) => p.pid === OTHER).status, 'cleared', '순위표의 모르는 pid 는 추가');
  assert.equal(N.members().find((p) => p.pid === OTHER).clearAt, 7000000, 'clearAt 미러');
});

test('송신: sum 범위 클램프·tw 15개·sp/ll/en, watch, done/dead/clear/chat/log, OPEN 아니면 false, 6000B 초과 폐기', async () => {
  const env = makeEnv();
  const { N } = env;
  assert.equal(N.sum({}), false, '접속 전');
  assert.equal(N.send('start', {}), false);
  const { ws } = await connected(env);
  const tw = []; for (let i = 0; i < 20; i++) tw.push([i, 25, 9]);
  assert.equal(N.sum({ w: 999, dw: -1, l: 99, g: 1e9, k: 'x', f: 300, sp: 7, hid: true, b: 1.5, o: 'p', tw, ll: 1234.6, en: '1,2,3;x4,5,6' }), true);
  const s = ws.last('sum');
  assert.equal(s.tw.length, 15);
  same(s.tw[0], [0, 20, 3]);
  same(s.tw[14], [14, 20, 3]);
  assert.equal(s.w, 101); assert.equal(s.dw, 0); assert.equal(s.l, 20); assert.equal(s.g, 1e7); assert.equal(s.k, 0); assert.equal(s.f, 200);
  assert.equal(s.sp, 3); assert.equal(s.hid, 1); assert.equal(s.b, 1); assert.equal(s.o, 'p');
  assert.equal(s.lag, undefined, 'lag 는 v3 에 없다');
  assert.equal(s.ll, 1235); assert.equal(s.en, '1,2,3;4,5,6', 'en 은 숫자·;·, 만');
  assert.equal(N.sum({ w: 1, b: 0.4567, o: 'x' }).valueOf(), true);
  const s2 = ws.last('sum');
  assert.equal(s2.b, 0.457); assert.equal(s2.o, 'l'); assert.equal(s2.hid, 0); same(s2.tw, []);
  assert.equal(s2.sp, 1, 'sp 기본 1'); assert.equal(s2.ll, undefined); assert.equal(s2.en, undefined, 'll/en 은 줬을 때만');
  N.sum({ en: 'x'.repeat(10) + '1;'.repeat(3000) });
  assert.equal(ws.last('sum').en.length, 5120, 'en 5120자 절단');
  const worstEnemies = Array(200).fill('10000,100000,9,2938,255').join(';');
  assert.equal(N.sum({ en: worstEnemies, tw: Array.from({ length: 15 }, (_, i) => [i, 20, 3]), ll: 100000 }), true);
  assert.equal(ws.last('sum').en, worstEnemies, '200개 외형·위상 전원 송신');
  assert.equal(N.watch(OTHER), true); same(ws.last('watch'), { t: 'watch', pid: OTHER });
  assert.equal(N.watch('BAD PID'), true); same(ws.last('watch'), { t: 'watch', pid: null }, '형식이 틀리면 null');
  N.watch(null); same(ws.last('watch'), { t: 'watch', pid: null });
  env.document.hidden = true;
  N.sum({});
  assert.equal(ws.last('sum').hid, 1, 'hid 생략 시 document.hidden');
  N.done(7); same(ws.last('done'), { t: 'done', w: 7 });
  N.dead(12, 300, 'bossLeak'); same(ws.last('dead'), { t: 'dead', w: 12, k: 300, r: 'bossLeak' });
  N.dead(12, 300, 'weird'); assert.equal(ws.last('dead').r, 'lives');
  N.clear(101, 999); same(ws.last('clear'), { t: 'clear', w: 101, k: 999 });
  assert.equal(N.chat('   '), false);
  N.chat(' 안녕 ' + 'x'.repeat(200)); assert.equal(ws.last('chat').text.length, 120);
  N.log('강화', 'up'); same(ws.last('log'), { t: 'log', text: '강화', kind: 'up' });
  N.log('뭔가', 'nope'); assert.equal(ws.last('log').kind, 'sys');
  assert.equal(N.send('chat', { text: 'x'.repeat(2100) }).valueOf(), true, '2,100B 는 송신 프레임 한도 안');
  assert.equal(N.send('chat', { text: 'x'.repeat(6100) }), false, '6000B 초과');
  assert.equal(N.send('', {}), false);
  assert.equal(N.send('custom', { t: 'evil', a: 1 }).valueOf(), true);
  same(ws.last('custom'), { t: 'custom', a: 1 }, 't 는 인자가 이긴다');
  // keepalive
  env.advance(25000);
  assert.ok(ws.sent.includes('ping'));
});

test('시각 동기: rtt 최소 표본 채택, 500ms 튀면 초기화·재측정, playing 30초 주기', async () => {
  const env = makeEnv();
  const { N, events } = env;
  env.clock.now = 1000;
  const { ws } = await connected(env);
  assert.equal(N.offset(), 5000000 - 1000, 'welcome.at 로 대략 맞춤');
  assert.equal(N.rtt(), null);
  const t1 = ws.last('time');
  assert.equal(t1.c, 1000);
  env.advance(100);                                            // 1100: rtt 100
  ws._recv({ t: 'time', at: 6000100, c: t1.c, s: 6000100 });
  assert.equal(N.rtt(), 100);
  assert.equal(N.offset(), 6000100 - 1050);
  assert.equal(N.serverNow(), 1100 + 6000100 - 1050);
  const off1 = N.offset();
  env.advance(100);                                            // 1200: 두 번째 time 이 나갔다(200ms 간격)
  const t2 = ws.last('time');
  assert.equal(t2.c, 1200);
  env.advance(400);                                            // 1600: rtt 400, 편차 200 (500 미만) → 여전히 rtt 100 표본
  ws._recv({ t: 'time', at: 6000100, c: t2.c, s: 6000100 + 400 + 200 });
  assert.equal(N.rtt(), 100);
  assert.equal(N.offset(), off1);
  // 큰 점프(2초) → 표본 초기화, 새 표본 채택, 5회 재측정 시작
  const before = ws.json().filter((m) => m.t === 'time').length;
  const t3 = ws.last('time');
  const now = env.clock.now;
  ws._recv({ t: 'time', at: 1, c: t3.c, s: t3.c + (now - t3.c) / 2 + off1 + 2000 });
  assert.equal(N.offset(), off1 + 2000);
  env.advance(2000);
  assert.ok(ws.json().filter((m) => m.t === 'time').length > before + 1, '재측정');
  assert.ok(events.filter((e) => e.t === 'net:offset').length >= 3);
  // playing 중 30초마다, lobby 에서는 안 보냄
  const n0 = ws.json().filter((m) => m.t === 'time').length;
  env.advance(30000);
  assert.equal(ws.json().filter((m) => m.t === 'time').length, n0, 'lobby: 주기 측정 없음');
  ws._recv({ t: 'start', at: 1, seed: 1, t0: 1, timing: {}, now: 1 });
  env.advance(30000);
  assert.equal(ws.json().filter((m) => m.t === 'time').length, n0 + 1, 'playing: 30초 주기');
  // 화면 복귀 → 5회
  env.fire('visibilitychange');
  env.advance(1000);
  assert.equal(ws.json().filter((m) => m.t === 'time').length, n0 + 1 + 5);
});

test('재접속: 비의도 닫힘 → 백오프 → 같은 pid/key 로 join → welcome(resumed)', async () => {
  const env = makeEnv();
  const { N, events, sockets } = env;
  const { ws, hello } = await connected(env);
  ws._recv({ t: 'start', at: 1, seed: 1, t0: 1, timing: {}, now: 1 });
  N.watch(OTHER);
  ws._close(1006);
  await flush();
  assert.equal(N.state, 'reconnecting');
  assert.equal(N.inRoom(), false);
  assert.equal(N.room.phase, 'playing', '미러는 유지');
  same(events[events.length - 1], { t: 'net:reconnecting', d: { attempt: 1, delay: 1000 } });
  assert.equal(sockets.length, 1);
  env.advance(999);
  assert.equal(sockets.length, 1);
  env.advance(1);
  assert.equal(sockets.length, 2);
  const ws2 = env.lastSock();
  assert.equal(ws2.url, 'ws://test/ws/room/' + CODE);
  ws2._open();
  const h2 = ws2.json()[0];
  assert.equal(h2.op, 'join');
  assert.equal(h2.pid, hello.pid);
  assert.equal(h2.key, hello.key);
  assert.equal(h2.name, '민수');
  // 시도가 또 실패하면 백오프가 늘어난다: 2 → 4 → 8 → 16 → 30 → 30
  ws2._close(1006);
  assert.equal(events[events.length - 1].d.delay, 2000);
  env.advance(2000); env.lastSock()._close(1006);
  assert.equal(events[events.length - 1].d.delay, 4000);
  env.advance(4000); env.lastSock()._close(1006);
  assert.equal(events[events.length - 1].d.delay, 8000);
  env.advance(8000); env.lastSock()._close(1006);
  assert.equal(events[events.length - 1].d.delay, 16000);
  env.advance(16000); env.lastSock()._close(1006);
  assert.equal(events[events.length - 1].d.delay, 30000);
  env.advance(30000); env.lastSock()._close(1006);
  same(events[events.length - 1].d, { attempt: 7, delay: 30000 });
  // 화면 복귀 → 대기 없이 즉시
  const n = sockets.length;
  env.fire('visibilitychange');
  assert.equal(sockets.length, n + 1);
  const ws3 = env.lastSock();
  ws3._open();
  env.advance(5001);                                            // welcome 타임아웃도 백오프를 잇는다
  assert.equal(ws3.closed.code, 1000);
  assert.equal(N.state, 'reconnecting');
  env.fire('online');
  const ws4 = env.lastSock();
  ws4._open();
  const evLen = events.length;
  ws4._recv(welcomeMsg(hello.pid, { resumed: true, room: { phase: 'playing', game: { t0: 1, timing: {}, seed: 7 } } }));
  await flush();
  assert.equal(N.state, 'playing');
  same(events.slice(evLen).filter((e) => e.t !== 'net:offset').map((e) => e.t), ['net:state', 'welcome', 'room']);
  assert.equal(events.slice(evLen).find((e) => e.t === 'welcome').d.resumed, true);
  assert.equal(N.room.game.seed, 7);
  same(ws4.last('watch'), { t: 'watch', pid: OTHER }, '재접속 뒤 보던 상대를 다시 등록한다');
  // 다음 끊김은 attempt 1 부터
  ws4._close(1001);
  same(events[events.length - 1].d, { attempt: 1, delay: 1000 });
  N.leave();
  assert.equal(N.state, 'offline');
});

test('재접속 포기: 4001 · 4404 · ended 방 · 대기실 끊김은 재접속', async () => {
  // 4001 replaced (같은 좌석의 새 소켓) → offline, 세션은 유지
  let env = makeEnv();
  let { ws } = await connected(env);
  ws._recv({ t: 'start', at: 1, seed: 1, t0: 1, timing: {}, now: 1 });
  ws._close(4001, 'replaced');
  await flush();
  assert.equal(env.N.state, 'offline');
  same(env.events[env.events.length - 1], { t: 'net:closed', d: { code: 4001, reason: 'replaced' } });
  assert.equal(env.sockets.length, 1);
  env.advance(60000);
  assert.equal(env.sockets.length, 1, '재시도 없음');
  assert.ok(env.sandbox.sessionStorage.getItem('dk_mp'));
  // 재접속 시도 중 4404 → err 이벤트 + offline + 세션 삭제
  env = makeEnv();
  ({ ws } = await connected(env));
  ws._close(1006);
  env.advance(1000);
  const ws2 = env.lastSock();
  ws2._open();
  ws2._recv({ t: 'err', at: 1, code: 'bad-code', msg: '없는 방' });
  assert.equal(env.events[env.events.length - 1].t, 'err', '재접속 중 err 는 이벤트');
  ws2._close(4404);
  await flush();
  assert.equal(env.N.state, 'offline');
  assert.equal(env.sandbox.sessionStorage.getItem('dk_mp'), null);
  assert.equal(env.events[env.events.length - 1].t, 'net:closed');
  // ended 에서 끊기면 재접속하지 않는다
  env = makeEnv();
  ({ ws } = await connected(env));
  ws._recv({ t: 'end', at: 1, reason: 'all-dead', ranking: [], seed: 1 });
  ws._close(1006);
  assert.equal(env.N.state, 'offline');
  // 대기실(lobby) 끊김은 재접속
  env = makeEnv();
  ({ ws } = await connected(env));
  ws._close(1006);
  assert.equal(env.N.state, 'reconnecting');
  env.N.leave();
  assert.equal(env.N.state, 'offline');
  assert.equal(env.sockets.length, 1, 'leave 가 재접속 타이머를 지운다');
  env.advance(60000);
  assert.equal(env.sockets.length, 1);
});

test('leave: leave 전송 → 4000 닫기 → offline · dk_mp 삭제 · 미러 비움', async () => {
  const env = makeEnv();
  const { N, sandbox, events } = env;
  const { ws } = await connected(env);
  N.leave();
  assert.equal(ws.last('leave').t, 'leave');
  same(ws.closed, { code: 4000, reason: 'leave' });
  assert.equal(N.state, 'offline');
  assert.equal(N.room, null);
  assert.equal(N.code, null);
  assert.equal(sandbox.sessionStorage.getItem('dk_mp'), null);
  assert.ok(sandbox.sessionStorage.getItem('dk_mp_id'), '좌석은 남긴다');
  same(events[events.length - 1], { t: 'net:closed', d: { code: 4000, reason: 'leave' } });
  ws._close(4000);                                                        // 서버 쪽 닫힘 이벤트는 무시
  assert.equal(N.state, 'offline');
  env.advance(60000);
  assert.equal(env.sockets.length, 1);
  assert.equal(N.sum({}), false);
});

test('resume: dk_mp 없으면 null, 있으면 같은 좌석으로 join, 방이 없으면 세션 삭제', async () => {
  let env = makeEnv();
  assert.equal(await env.N.resume(), null);
  env = makeEnv();
  env.N.CFG.url = 'ws://test';
  env.sandbox.sessionStorage.setItem('dk_mp', JSON.stringify({ code: CODE, pid: 'abcdefgh', key: 'b'.repeat(32), name: '민수' }));
  const p = env.N.resume();
  const ws = env.lastSock();
  assert.equal(ws.url, 'ws://test/ws/room/' + CODE);
  ws._open();
  const h = ws.json()[0];
  assert.equal(h.op, 'join'); assert.equal(h.pid, 'abcdefgh'); assert.equal(h.key, 'b'.repeat(32)); assert.equal(h.name, '민수');
  ws._recv(welcomeMsg('abcdefgh', { resumed: true, room: { phase: 'playing', game: { t0: 1, timing: {}, seed: 1 } } }));
  const room = await p;
  assert.equal(room.phase, 'playing');
  assert.equal(env.N.state, 'playing');
  assert.equal(env.N.me.pid, 'abcdefgh');
  // 만료된 방
  env = makeEnv();
  env.N.CFG.url = 'ws://test';
  env.sandbox.sessionStorage.setItem('dk_mp', JSON.stringify({ code: CODE, pid: 'abcdefgh', key: 'b'.repeat(32), name: '민수' }));
  const p2 = env.N.resume();
  const ws2 = env.lastSock();
  ws2._open();
  ws2._recv({ t: 'err', at: 1, code: 'expired', msg: '끝난 방' });
  await assert.rejects(p2, (e) => e.code === 'expired');
  assert.equal(env.sandbox.sessionStorage.getItem('dk_mp'), null);
  // 깨진 dk_mp 는 무시
  env = makeEnv();
  env.sandbox.sessionStorage.setItem('dk_mp', '{"code":"bad","pid":"x"}');
  assert.equal(await env.N.resume(), null);
});

test('빠른 매칭: /ws/quick → welcome(대기열) → queued → matched → 대기열 소켓 버리고 방으로 join', async () => {
  const env = makeEnv();
  const { N, events, sockets } = env;
  N.CFG.url = 'ws://test';
  const p = N.quick('민수');
  const q = env.lastSock();
  assert.equal(q.url, 'ws://test/ws/quick');
  q._open();
  const hello = q.json()[0];
  assert.equal(hello.op, 'quick'); assert.equal(hello.v, 4);
  q._recv({ t: 'queued', at: 100, n: 1, eta: null });   // 대기열은 welcome 없이 queued 가 첫 프레임
  assert.equal(await p, null, '대기열 진입은 방이 없으니 null');
  same(events.filter((e) => e.t === 'queued').map((e) => e.d.n), [1], '첫 queued 도 이벤트로');
  assert.equal(N.state, 'queue');
  assert.equal(N.inQueue(), true); assert.equal(N.inRoom(), false);
  assert.equal(N.code, null); assert.equal(N.room, null);
  assert.equal(env.sandbox.sessionStorage.getItem('dk_mp'), null, '대기열은 세션에 저장하지 않는다');
  q._recv({ t: 'queued', at: 101, n: 2, eta: 9000 });
  same(events[events.length - 1], { t: 'queued', d: { t: 'queued', at: 101, n: 2, eta: 9000 } });
  q._recv({ t: 'matched', at: 200, code: CODE });
  assert.equal(events.find((e) => e.t === 'matched').d.code, CODE);
  assert.equal(q.closed.code, 1000, '대기열 소켓은 우리가 먼저 버린다');
  assert.equal(sockets.length, 2);
  const ws = env.lastSock();
  assert.equal(ws.url, 'ws://test/ws/room/' + CODE);
  ws._open();
  const h2 = ws.json()[0];
  assert.equal(h2.op, 'join'); assert.equal(h2.pid, hello.pid); assert.equal(h2.key, hello.key);
  ws._recv(welcomeMsg(hello.pid, { kind: 'quick', room: { kind: 'quick', hostId: null } }));
  await flush();
  assert.equal(N.state, 'lobby');
  assert.equal(N.code, CODE);
  assert.equal(N.isHost(), false, '빠른 매칭 방은 방장이 없다');
  assert.equal(N.room.kind, 'quick');
  same(JSON.parse(env.sandbox.sessionStorage.getItem('dk_mp')).code, CODE, '방에 들어가면 세션 저장');
  q._close(4000, 'matched');
  assert.equal(N.state, 'lobby', '버린 대기열 소켓의 닫힘은 무시');
});

test('빠른 매칭: 서버가 matched 뒤 바로 닫아도 방으로 간다 · 매칭 전 닫힘은 offline · 취소 = leave', async () => {
  let env = makeEnv();
  let { N, events } = env;
  N.CFG.url = 'ws://test';
  let p = N.quick('민수');
  let q = env.lastSock(); q._open();
  q._recv({ t: 'queued', at: 100, n: 1, eta: null });
  await p;
  // matched 와 닫힘이 같은 틱에
  q._recv({ t: 'matched', at: 200, code: CODE });
  q._close(4000, 'matched');
  assert.equal(env.lastSock().url, 'ws://test/ws/room/' + CODE);
  assert.notEqual(N.state, 'offline');
  // 매칭 전 서버 닫힘(대기열 만료 등)
  env = makeEnv(); ({ N, events } = env);
  N.CFG.url = 'ws://test';
  p = N.quick('민수');
  q = env.lastSock(); q._open();
  q._recv({ t: 'queued', at: 100, n: 1, eta: null });
  await p;
  q._close(4429, 'rate');
  await flush();
  assert.equal(N.state, 'offline');
  same(events[events.length - 1], { t: 'net:closed', d: { code: 4429, reason: 'rate' } }, '재접속 없이 닫힘 통보');
  // 취소
  env = makeEnv(); ({ N } = env);
  N.CFG.url = 'ws://test';
  p = N.quick('민수');
  q = env.lastSock(); q._open();
  q._recv({ t: 'queued', at: 100, n: 1, eta: null });
  await p;
  N.leave();
  assert.equal(q.last('leave').t, 'leave');
  assert.equal(q.closed.code, 4000);
  assert.equal(N.state, 'offline');
  assert.equal(N.inQueue(), false);
});

test('on/off/emit: 해제 함수, 핸들러 예외 격리', () => {
  const { N } = makeEnv();
  const seen = [];
  const un = N.on('custom', (d) => seen.push(d));
  N.on('custom', () => { throw new Error('boom'); });
  const warn = console.warn; console.warn = () => {};
  try { N.emit('custom', 1); } finally { console.warn = warn; }
  same(seen, [1]);
  un();
  N.emit('custom', 2);
  same(seen, [1]);
});


async function connectedExtreme(env) {
 const {N}=env;N.CFG.url='ws://test';const pending=N.create('extreme player','extreme');
 const ws=env.lastSock();ws._open();const hello=ws.last('hello');
 ws._recv(welcomeMsg(hello.pid,{room:{mode:'extreme'}}));await pending;
 return {ws,hello};
}

test('v4 client: explicit mode; high wave reports; endless clear is never sent',async()=>{
 const e=makeEnv(),{ws,hello}=await connectedExtreme(e),N=e.N;
 assert.equal(hello.v,4);assert.equal(hello.mode,'extreme');assert.equal(N.room.mode,'extreme');
 ws._recv({t:'start',mode:'extreme',seed:7,t0:1,timing:{prep:2000,bossLimit:5000,clearWave:0},at:2});
 assert.equal(N.room.game.mode,'extreme');assert.equal(N.room.game.timing.clearWave,0);
 N.sum({w:500,dw:499});assert.equal(ws.last('sum').w,500);assert.equal(ws.last('sum').dw,499);
 N.done(1000001);assert.equal(ws.last('done').w,1000000);
 N.dead(765432,99,'lives');assert.equal(ws.last('dead').w,765432);
 const before=ws.json().length;assert.equal(N.clear(101,99),false);assert.equal(ws.json().length,before);
 const session=JSON.parse(e.sandbox.sessionStorage.getItem('dk_mp'));assert.equal(session.mode,'extreme');
 N.leave();
});

test('v4 client: reload and transport reconnect preserve extreme mode',async()=>{
 const e=makeEnv(),{ws}=await connectedExtreme(e);
 const saved=e.sandbox.sessionStorage.getItem('dk_mp');
 ws._close(1006);e.advance(1000);const retry=e.lastSock();retry._open();
 assert.equal(retry.last('hello').mode,'extreme');
 retry._recv(welcomeMsg(retry.last('hello').pid,{resumed:true,room:{mode:'extreme'}}));await flush();
 const other=makeEnv();other.N.CFG.url='ws://test';other.sandbox.sessionStorage.setItem('dk_mp',saved);
 const pending=other.N.resume(),resumed=other.lastSock();resumed._open();
 assert.equal(resumed.last('hello').mode,'extreme');
 resumed._recv(welcomeMsg(resumed.last('hello').pid,{resumed:true,room:{mode:'extreme'}}));await pending;
 assert.equal(other.N.room.mode,'extreme');e.N.leave();other.N.leave();
});

test('v4 client: quick matching forwards mode to reserved room',async()=>{
 const e=makeEnv(),N=e.N;N.CFG.url='ws://test';const pending=N.quick('x','extreme');
 const q=e.lastSock();q._open();assert.equal(q.last('hello').mode,'extreme');
 q._recv({t:'queued',mode:'extreme',n:1,eta:null,at:1});await pending;
 q._recv({t:'matched',mode:'extreme',code:CODE,at:2});
 const room=e.lastSock();room._open();assert.equal(room.last('hello').op,'join');assert.equal(room.last('hello').mode,'extreme');
 room._recv(welcomeMsg(room.last('hello').pid,{room:{mode:'extreme',kind:'quick'}}));await flush();
 assert.equal(N.room.mode,'extreme');N.leave();
});

test('v4 client: invalid requested mode and mismatching server mode fail closed',async()=>{
 const e=makeEnv(),N=e.N;N.CFG.url='ws://test';
 for(const mode of ['endless','extra',null,1])await assert.rejects(N.create('x',mode),x=>x.code==='mode');
 assert.equal(e.sockets.length,0);
 const pending=N.join(CODE,'x','extreme'),rejected=assert.rejects(pending,x=>x.code==='mode');
 const ws=e.lastSock();ws._open();ws._recv(welcomeMsg(ws.last('hello').pid));await rejected;
 assert.equal(N.state,'offline');assert.equal(e.sandbox.sessionStorage.getItem('dk_mp'),null);
 const {ws:active}=await connectedExtreme(e);
 active._recv({t:'start',mode:'clear',seed:1,t0:0,timing:{clearWave:101},at:3});
 assert.equal(N.state,'offline');assert.equal(e.events.filter(x=>x.t==='start').length,0);
});
