#!/usr/bin/env node
// ==================== 서버 통합 스모크 — Node 22 내장 WebSocket ====================
// 대상: TIMING=fast 로 띄운 wrangler dev 또는 test/dev-server.mjs.   node test/ws-smoke.mjs [ws://localhost:8787]
// 생성 → 2·3 참가 → start{seed,t0,timing} → 재접속 시 room.game → 없는 코드 4404 → Origin 불일치 403 → MAX_FRAME 초과 1009
// → hello 없이 5초 4400 → 소켓 속도 제한 4429 → 개별 진행(A x3 로 clear, B dead, C clear) → end 순위(A·C·B)
// → watch → 보는 사람에게만 en/ll → 빠른 매칭(/ws/quick 소켓 2개 → 10초 뒤 matched 같은 code → 둘 다 join → 자동 start).
// 서버 웨이브 시계가 없으므로 판을 실제로 기다리지 않는다. 전체 ≈ 20초.
import http from 'node:http';
import crypto from 'node:crypto';
import { MAX_FRAME } from '../src/timing.js';

const BASE = (process.argv[2] || process.env.NET_URL || 'ws://localhost:8787').replace(/\/$/, '');
const HTTP = BASE.replace(/^ws/, 'http');
const KEY = () => crypto.randomBytes(16).toString('hex');
const PID = () => crypto.randomBytes(4).toString('hex');
const VER = '78';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
let passed = 0;
const budget = { recv: 0, sent: 0 };
function ok(cond, what) {
  if (!cond) throw new Error('FAIL: ' + what);
  passed++;
  console.log(`  ok  ${what}  (+${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
const SUM = (o) => ({ t: 'sum', w: 1, dw: 0, l: 20, g: 400, k: 3, f: 5, sp: 1, hid: 0, b: null, o: 'l', tw: [[0, 6, 1]], ...o });

// ---- 소켓 래퍼: 받은 메시지를 상자에 모으고 next(pred) 로 꺼낸다 ----
function connect(path, name) {
  const ws = new WebSocket(BASE + path);
  const c = { ws, name, inbox: [], waiters: [], pid: PID(), key: KEY(), offset: 0, closed: null, pongs: 0 };
  c.closed = new Promise((res) => { ws.addEventListener('close', (e) => res({ code: e.code, reason: e.reason })); });
  ws.addEventListener('error', () => {});
  ws.addEventListener('message', (e) => {
    budget.recv++;
    if (e.data === 'pong') { c.pongs++; return; }
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    c.inbox.push(m);
    for (let i = 0; i < c.waiters.length; i++) {
      const w = c.waiters[i];
      const idx = c.inbox.findIndex(w.pred);
      if (idx >= 0) { c.waiters.splice(i, 1); const [hit] = c.inbox.splice(idx, 1); w.res(hit); break; }
    }
  });
  c.open = () => new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('close', (e) => rej(new Error(`closed before open: ${e.code}`))); });
  c.send = (m) => { budget.sent++; ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
  c.next = (pred, ms = 10000) => {
    const p = typeof pred === 'string' ? (m) => m.t === pred : pred;
    const idx = c.inbox.findIndex(p);
    if (idx >= 0) return Promise.resolve(c.inbox.splice(idx, 1)[0]);
    return new Promise((res, rej) => {
      const w = { pred: p, res };
      c.waiters.push(w);
      setTimeout(() => { const i = c.waiters.indexOf(w); if (i >= 0) { c.waiters.splice(i, 1); rej(new Error(`${name}: timeout waiting ${pred.toString()}`)); } }, ms);
    });
  };
  c.none = async (pred, ms) => { try { await c.next(pred, ms); return false; } catch (e) { return true; } };   // ms 동안 안 오면 true
  c.hello = async (op, nm) => {
    c.send({ t: 'hello', v: 4, ver: VER, op, pid: c.pid, key: c.key, name: nm || name });
    const w = await c.next('welcome');
    c.offset = w.now - Date.now();
    return w;
  };
  c.serverNow = () => Date.now() + c.offset;
  return c;
}

// 원시 HTTP 업그레이드 요청 (Origin 검사용)
function rawUpgrade(path, headers) {
  const u = new URL(HTTP + path);
  return new Promise((res) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'GET',
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), ...headers } });
    req.on('upgrade', (r, socket) => { socket.destroy(); res(101); });
    req.on('response', (r) => { r.resume(); res(r.statusCode); });
    req.on('error', () => res(-1));
    req.end();
  });
}

async function main() {
  console.log(`smoke → ${BASE}`);
  // S0 health
  const health = await (await fetch(HTTP + '/health')).json();
  ok(health.ok === true && health.protocol === 4, `/health ${JSON.stringify(health)}`);

  // S1 Origin: 불일치 403 · localhost 허용 · 없으면 통과
  ok((await rawUpgrade('/ws/new', { Origin: 'https://evil.example' })) === 403, 'Origin 불일치 → 403');
  ok((await rawUpgrade('/ws/quick', { Origin: 'https://evil.example' })) === 403, '/ws/quick Origin 불일치 → 403');
  ok((await rawUpgrade('/ws/room/ZZZZZZ', { Origin: 'http://localhost:8137' })) === 101, 'Origin localhost → 101');
  ok((await rawUpgrade('/ws/room/abc', {})) === 404, '잘못된 코드 형식 → 404 (DO 호출 없음)');
  ok((await rawUpgrade('/health', {})) !== 101, '/health 는 업그레이드 대상 아님');

  // S2 없는 코드 → hello → err bad-code + 4404
  {
    const c = connect('/ws/room/ZZZZZZ', 'ghost');
    await c.open();
    c.send({ t: 'hello', v: 4, ver: VER, op: 'join', pid: c.pid, key: c.key, name: 'ghost' });
    const err = await c.next('err');
    const cl = await c.closed;
    ok(err.code === 'bad-code' && cl.code === 4404, `없는 코드 → err bad-code + close 4404`);
  }

  // S3 hello 없이 5초 → 4400 (뒤에서 확인)
  const noHello = connect('/ws/room/ZZZZZZ', 'mute');
  await noHello.open();
  const noHelloAt = Date.now();

  // S4 MAX_FRAME 초과 → 1009 (hello 전이라도 프레임 단계에서)
  {
    const c = connect('/ws/room/ZZZZZZ', 'big');
    await c.open();
    c.send(JSON.stringify({ t: 'chat', text: 'x'.repeat(MAX_FRAME) }));
    const cl = await c.closed;
    ok(cl.code === 1009, `${MAX_FRAME} B 초과 → close 1009 (got ${cl.code})`);
  }

  // S5 방 만들기 · 속도 제한 4429 · ping/pong · v2 hello 거절
  {
    const c = connect('/ws/new', 'rater');
    await c.open();
    const w = await c.hello('create');
    ok(/^[A-HJ-NP-Z2-9]{6}$/.test(w.code) && w.resumed === false && w.kind === 'code' && w.room.players[0].host === true, `/ws/new → welcome code=${w.code}`);
    c.send('ping');
    await sleep(200);
    ok(c.pongs === 1, "'ping' → 'pong'");
    for (let i = 0; i < 60; i++) c.send({ t: 'time', c: i });
    const err = await c.next((m) => m.t === 'err' && m.code === 'rate');
    const cl = await c.closed;
    ok(err.code === 'rate' && cl.code === 4429, `소켓 20/s 버스트 40 초과 → err rate + 4429`);
    const v2 = connect(`/ws/room/${w.code}`, 'v2');
    await v2.open();
    v2.send({ t: 'hello', v: 2, ver: VER, op: 'join', pid: v2.pid, key: v2.key, name: 'v2' });
    const e2 = await v2.next('err'); const c2 = await v2.closed;
    ok(e2.code === 'version' && c2.code === 4426, 'v2 hello → err version + 4426');
  }

  // S6 한 판: A 생성, B·C 참가, start, 재접속, 개별 진행, 관전, 순위
  const A = connect('/ws/new', 'A');
  await A.open();
  const wA = await A.hello('create');
  const code = wA.code;
  console.log(`  room ${code}`);
  const B = connect(`/ws/room/${code.toLowerCase()}`, 'B');   // 소문자 코드도 정규화된다
  await B.open();
  const wB = await B.hello('join');
  ok(wB.code === code && wB.room.players.length === 2, 'B 참가 (소문자 코드 정규화)');
  const roomAfterB = await A.next('room');
  ok(roomAfterB.players.length === 2 && roomAfterB.players[1].pid === B.pid, 'A 가 room(2명) 수신');
  const C = connect(`/ws/room/${code}`, 'C');
  await C.open();
  await C.hello('join', 'A');                                 // 이름 중복 → 'A (2)'
  const roomAfterC = await A.next('room');
  await B.next('room');
  ok(roomAfterC.players.length === 3 && roomAfterC.players[2].name === 'A (2)', '이름 중복 접미 "A (2)"');
  // 재접속(대기실): 같은 pid 새 소켓 → 옛 소켓 4001
  const C2 = connect(`/ws/room/${code}`, 'C'); C2.pid = C.pid; C2.key = C.key;
  await C2.open();
  const wC2 = await C2.hello('join');
  const clC = await C.closed;
  ok(wC2.resumed === true && clC.code === 4001, '대기실 재접속 → resumed, 옛 소켓 4001');
  const rmA = await A.next('room'); await B.next('room');
  ok(rmA.phase === 'lobby' && rmA.players.find((p) => p.pid === C.pid).connected === true, '대기실 재접속 → 남에게 room{connected:true}');
  // 잘못된 key → 4403
  {
    const X = connect(`/ws/room/${code}`, 'X'); X.pid = B.pid;
    await X.open();
    X.send({ t: 'hello', v: 4, ver: VER, op: 'join', pid: B.pid, key: KEY(), name: 'X' });
    const err = await X.next('err'); const cl = await X.closed;
    ok(err.code === 'bad-key' && cl.code === 4403, 'key 불일치 → 4403');
  }
  // ver 불일치 → 4426 · op quick → 4400
  {
    const X = connect(`/ws/room/${code}`, 'X');
    await X.open();
    X.send({ t: 'hello', v: 4, ver: '1', op: 'join', pid: PID(), key: KEY(), name: 'X' });
    const err = await X.next('err'); const cl = await X.closed;
    ok(err.code === 'version' && cl.code === 4426, 'ver 불일치 → 4426');
    const Q = connect(`/ws/room/${code}`, 'Q');
    await Q.open();
    Q.send({ t: 'hello', v: 4, ver: VER, op: 'quick', pid: PID(), key: KEY(), name: 'Q' });
    const eq = await Q.next('err'); const cq = await Q.closed;
    ok(eq.code === 'bad-request' && cq.code === 4400, '방에 op quick → 4400');
  }
  // 방장 아님 → not-host
  B.send({ t: 'start' });
  ok((await B.next('err')).code === 'not-host', '방장 아닌 start → err not-host');
  // time 왕복
  B.send({ t: 'time', c: 777 });
  const tm = await B.next('time');
  ok(tm.c === 777 && typeof tm.s === 'number' && Math.abs(tm.s - B.serverNow()) < 2000, 'time{c,s} 회신');
  // start
  A.send({ t: 'start' });
  const [sA, sB, sC] = await Promise.all([A.next('start'), B.next('start'), C2.next('start')]);
  ok(sA.seed === sB.seed && sA.seed === sC.seed && sA.t0 === sB.t0 && sA.t0 === sC.t0, `start 동일 seed=${sA.seed} t0=${sA.t0}`);
  ok(JSON.stringify(sA.timing) === JSON.stringify({ prep: 2000, bossLimit: 5000, clearWave: 12 }) && sA.t0 === sA.now + 2000, `TIMING=fast (timing ${JSON.stringify(sA.timing)})`);
  const rm = await A.next('room');
  ok(rm.phase === 'playing' && rm.players.every((p) => p.status === 'alive' && p.sp === 1 && p.dw === 0) && JSON.stringify(rm.game) === JSON.stringify({ t0: sA.t0, timing: sA.timing, seed: sA.seed, mode: 'clear' }), 'start 뒤 room{playing, game{t0,timing,seed}}');
  await B.next('room'); await C2.next('room');
  ok(await A.none('sched', 300), 'sched 는 오지 않는다 (서버 웨이브 시계 없음)');
  // 늦게 온 참가자 → started 4409
  {
    const X = connect(`/ws/room/${code}`, 'X');
    await X.open();
    X.send({ t: 'hello', v: 4, ver: VER, op: 'join', pid: PID(), key: KEY(), name: 'X' });
    const err = await X.next('err'); const cl = await X.closed;
    ok(err.code === 'started' && cl.code === 4409, '시작한 방에 모르는 pid → 4409');
  }
  // B 끊김 → player{connected:false} → 재접속 → welcome{resumed, room.game} → player{connected:true}
  B.ws.close(4999, 'net-drop');
  const pB = await A.next((m) => m.t === 'player' && m.pid === B.pid && m.connected === false);
  ok(pB.connected === false, 'B 끊김 → player{connected:false}');
  const B2 = connect(`/ws/room/${code}`, 'B'); B2.pid = B.pid; B2.key = B.key;
  await B2.open();
  const wB2 = await B2.hello('join');
  ok(wB2.resumed === true && wB2.room.phase === 'playing' && wB2.room.game.seed === sA.seed && wB2.room.game.t0 === sA.t0 && wB2.room.game.timing.clearWave === 12, '재접속 welcome 에 room.game{t0,timing,seed}');
  ok((await A.next((m) => m.t === 'player' && m.pid === B.pid && m.connected === true)).connected === true, 'B 복귀 → player{connected:true}');
  // 채팅·로그 중계
  A.send({ t: 'chat', text: ' 안녕 <b>' });
  const [chA, chB] = await Promise.all([A.next('chat'), B2.next('chat')]);
  ok(chA.pid === A.pid && chA.text === '안녕 <b>' && chB.name === 'A', '채팅: 본인 에코 + 중계');
  A.send({ t: 'log', text: '확률강화 성공', kind: 'up' });
  const lg = await B2.next('log');
  ok(lg.kind === 'up' && lg.pid === A.pid, '로그 중계(본인 제외)');
  let gotOwnLog = false;
  A.next('log', 500).then(() => { gotOwnLog = true; }).catch(() => {});

  // 개별 진행: A 는 3배속으로 달린다. sum 은 en/ll 을 실어 보낸다
  const EN = Array(200).fill('1099,100000,9,2938,255').join(';'); // 4,599자: v4 최악 실제 base index와 외형·위상 전원
  A.send(SUM({ w: 3, dw: 2, k: 30, sp: 3, ll: 900, en: EN }));
  const [sumB, sumC] = await Promise.all([B2.next((m) => m.t === 'sum' && m.pid === A.pid), C2.next((m) => m.t === 'sum' && m.pid === A.pid)]);
  ok(sumB.w === 3 && sumB.sp === 3 && !('en' in sumB) && !('ll' in sumB) && !('en' in sumC), 'sum 중계: 보는 사람이 없으면 en/ll 을 뗀다');
  ok(await A.none((m) => m.t === 'sum', 300), '본인 sum 은 되돌아오지 않는다');
  // B 가 A 를 본다 → A 에게 watched{n:1} → 다음 sum 부터 B 에게는 en/ll 포함
  B2.send({ t: 'watch', pid: A.pid });
  const wt = await A.next('watched');
  ok(wt.n === 1, 'watch → 대상에게 watched{n:1}');
  await sleep(1600);
  A.send(SUM({ w: 4, dw: 3, k: 40, sp: 3, ll: 950, en: EN }));
  const [sumB2, sumC2] = await Promise.all([B2.next((m) => m.t === 'sum' && m.pid === A.pid), C2.next((m) => m.t === 'sum' && m.pid === A.pid)]);
  ok(sumB2.en === EN && sumB2.ll === 950 && sumB2.w === 4, '보는 사람(B)에게는 en/ll 포함');
  ok(!('en' in sumC2) && sumC2.w === 4, '안 보는 사람(C)에게는 en/ll 없음');
  // 1초 간격: 보는 사람에게만 다시 온다
  await sleep(1100);
  A.send(SUM({ w: 4, dw: 3, k: 41, sp: 3, ll: 951, en: EN }));
  const sumB3 = await B2.next((m) => m.t === 'sum' && m.pid === A.pid);
  ok(sumB3.k === 41 && sumB3.en === EN, '1초 뒤 sum: 보는 사람에게 en 포함');
  ok(await C2.none((m) => m.t === 'sum' && m.pid === A.pid, 300), '1초 뒤 sum: 안 보는 사람에게는 아직(1.5초 간격)');
  B2.send({ t: 'watch', pid: null });
  ok((await A.next('watched')).n === 0, 'watch null → watched{n:0}');
  // done 은 조용히 기록
  A.send({ t: 'done', w: 11 });
  // A 완주(12) → player{cleared, clearAt}
  A.send({ t: 'clear', w: 12, k: 120 });
  const pA = await B2.next((m) => m.t === 'player' && m.pid === A.pid && m.status === 'cleared');
  ok(pA.wave === 12 && pA.kills === 120 && typeof pA.clearAt === 'number', 'A clear{12} → player{cleared, clearAt}');
  // B 사망(5) → deathWave 4
  B2.send({ t: 'dead', w: 5, k: 20, r: 'lives' });
  const pB2 = await A.next((m) => m.t === 'player' && m.pid === B.pid && m.status === 'dead');
  ok(pB2.deathWave === 4 && pB2.kills === 20, 'B dead{5} → player{dead, deathWave 4}');
  // C 이른 clear 는 폐기, 12 는 수락 → end
  C2.send({ t: 'clear', w: 11, k: 1 });
  ok(await A.none((m) => m.t === 'player' && m.pid === C2.pid, 300), 'C clear{11} 은 폐기(clearWave 12 미달)');
  await sleep(50);
  C2.send({ t: 'clear', w: 12, k: 90 });
  const [eA, eB, eC] = await Promise.all([A.next('end'), B2.next('end'), C2.next('end')]);
  ok(eA.reason === 'cleared' && eA.seed === sA.seed && JSON.stringify(eA.ranking) === JSON.stringify(eB.ranking) && JSON.stringify(eA.ranking) === JSON.stringify(eC.ranking), `end cleared, 순위 동일 ${JSON.stringify(eA.ranking.map((r) => [r.name, r.rank, r.status, r.wave]))}`);
  const rk = eA.ranking;
  ok(rk[0].pid === A.pid && rk[0].rank === 1 && rk[1].pid === C2.pid && rk[1].rank === 2 && rk[2].pid === B.pid && rk[2].rank === 3, 'A 1위(먼저 완주) · C 2위 · B 3위');
  ok(rk[0].clearAt < rk[1].clearAt && rk[2].deathWave === 4 && rk[2].clearAt === null && rk[0].deathWave === 12, 'ranking 항목에 clearAt · deathWave');
  ok(!gotOwnLog, '본인 로그는 되돌아오지 않는다');
  // 끝난 방 재접속 → welcome + end 재전송
  const A3 = connect(`/ws/room/${code}`, 'A'); A3.pid = A.pid; A3.key = A.key;
  await A3.open();
  const wA3 = await A3.hello('join');
  const eA3 = await A3.next('end');
  ok(wA3.room.phase === 'ended' && eA3.reason === 'cleared' && wA3.room.players.find((p) => p.pid === A.pid).rank === 1, '끝난 방 재접속 → room{ended} + end 재전송');
  // leave → 4000
  B2.send({ t: 'leave' });
  ok((await B2.closed).code === 4000, 'leave → 4000');
  for (const c of [A, A3, C2]) c.ws.close(1000);

  // S7 빠른 매칭: 소켓 2개 → queued → 10초 뒤 matched 같은 code → 둘 다 join → 자동 start
  {
    const bad = connect('/ws/quick', 'badop');
    await bad.open();
    bad.send({ t: 'hello', v: 4, ver: VER, op: 'join', pid: bad.pid, key: bad.key, name: 'x' });
    const eb = await bad.next('err'); const cb = await bad.closed;
    ok(eb.code === 'bad-request' && cb.code === 4400, '/ws/quick 에 op join → 4400');
    const Q1 = connect('/ws/quick', 'Q1');
    await Q1.open();
    Q1.send({ t: 'hello', v: 4, ver: VER, op: 'quick', pid: Q1.pid, key: Q1.key, name: 'Q1' });
    const q1 = await Q1.next('queued');
    ok(q1.n === 1 && q1.eta === null, 'quick hello → queued{n:1, eta:null}');
    const queuedAt = Date.now();
    const Q2 = connect('/ws/quick', 'Q2');
    await Q2.open();
    Q2.send({ t: 'hello', v: 4, ver: VER, op: 'quick', pid: Q2.pid, key: Q2.key, name: 'Q2' });
    const [q1b, q2] = await Promise.all([Q1.next('queued'), Q2.next('queued')]);
    ok(q1b.n === 2 && q2.n === 2 && q2.eta > 8000 && q2.eta <= 10000, `2명 → queued{n:2, eta:${q2.eta}}`);
    // 같은 pid 재접속 → 옛 소켓 4001, 좌석 유지
    const Q2b = connect('/ws/quick', 'Q2'); Q2b.pid = Q2.pid; Q2b.key = Q2.key;
    await Q2b.open();
    Q2b.send({ t: 'hello', v: 4, ver: VER, op: 'quick', pid: Q2.pid, key: Q2.key, name: 'Q2' });
    const [q2b, cq2] = await Promise.all([Q2b.next('queued'), Q2.closed]);
    ok(q2b.n === 2 && cq2.code === 4001, '대기 중 같은 pid 재접속 → 좌석 교체, 옛 소켓 4001');
    console.log('  10초 매칭 대기');
    const [m1, m2] = await Promise.all([Q1.next('matched', 15000), Q2b.next('matched', 15000)]);
    const waited = Date.now() - queuedAt;
    ok(m1.code === m2.code && /^[A-HJ-NP-Z2-9]{6}$/.test(m1.code) && waited >= 9000 && waited < 14000, `matched 같은 code=${m1.code} (${(waited / 1000).toFixed(1)}s)`);
    const [c1, c2] = await Promise.all([Q1.closed, Q2b.closed]);
    ok(c1.code === 4000 && c2.code === 4000, 'matched 뒤 4000');
    // 예약 밖 pid → full
    const X = connect(`/ws/room/${m1.code}`, 'X');
    await X.open();
    X.send({ t: 'hello', v: 4, ver: VER, op: 'join', pid: PID(), key: KEY(), name: 'X' });
    const ex = await X.next('err'); const cx = await X.closed;
    ok(ex.code === 'full' && cx.code === 4409, '예약 밖 pid → full 4409');
    // 둘 다 join → 첫 접속은 resumed false, 방장 없음, 예약 이름 → 전원 접속 즉시 start
    const J1 = connect(`/ws/room/${m1.code}`, 'J1'); J1.pid = Q1.pid; J1.key = Q1.key;
    await J1.open();
    const wj1 = await J1.hello('join', '다른이름');
    ok(wj1.kind === 'quick' && wj1.resumed === false && wj1.room.hostId === null && wj1.room.phase === 'lobby' && typeof wj1.room.reserveUntil === 'number'
       && wj1.room.players.length === 2 && wj1.room.players.find((p) => p.pid === Q1.pid).name === 'Q1', 'quick 방 welcome: 방장 없음 · 예약 이름 · reserveUntil');
    J1.send({ t: 'start' });
    ok((await J1.next('err')).code === 'not-host', 'quick 방 start 메시지 → not-host');
    const J2 = connect(`/ws/room/${m1.code}`, 'J2'); J2.pid = Q2.pid; J2.key = Q2.key;
    await J2.open();
    await J2.hello('join');
    const [st1, st2] = await Promise.all([J1.next('start'), J2.next('start')]);
    ok(st1.seed === st2.seed && st1.t0 === st2.t0 && st1.timing.clearWave === 12, `전원 접속 → 자동 start seed=${st1.seed}`);
    const r1 = await J1.next((m) => m.t === 'room' && m.phase === 'playing');
    ok(r1.players.every((p) => p.status === 'alive' && p.host === false) && r1.reserveUntil === null, 'quick 방 room{playing}, 방장 없음');
    J1.send({ t: 'leave' }); J2.send({ t: 'leave' });
    await Promise.all([J1.closed, J2.closed]);
  }

  // S3 확인: hello 없는 소켓은 5초 안팎에 4400
  const clMute = await noHello.closed;
  ok(clMute.code === 4400 && Date.now() - noHelloAt >= 4500, `hello 없이 → 4400 (${((Date.now() - noHelloAt) / 1000).toFixed(1)}s 전 열림)`);
  console.log(`\nPASS ${passed} checks · ${((Date.now() - t0) / 1000).toFixed(1)}s · 수신 ${budget.recv} / 송신 ${budget.sent} 메시지`);
  process.exit(0);
}

main().catch((e) => { console.error('\n' + (e && e.stack || e)); process.exit(1); });
