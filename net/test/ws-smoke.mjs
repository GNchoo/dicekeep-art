#!/usr/bin/env node
// ==================== 서버 통합 스모크 (§11.2) — Node 22 내장 WebSocket ====================
// 대상: TIMING=fast 로 띄운 wrangler dev 또는 test/dev-server.mjs.   node test/ws-smoke.mjs [ws://localhost:8787]
// 생성 → 2·3 참가 → start → 같은 sched.ats → 재접속 시 room.game.waveAts 전체 → 없는 코드 4404 → Origin 불일치 403
// → 2KB 초과 1009 → hello 없이 5초 4400 → 소켓 속도 제한 4429 → 보스 웨이브(10) 홀드/해제 → clearWave 12 까지 end 순위.
// 한 판이 실제 시계로 돌아가므로(fast 라도 웨이브 1~12 ≈ 2분) 전체 3분쯤 걸린다.
import http from 'node:http';
import crypto from 'node:crypto';

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
  c.hello = async (op, nm) => {
    c.send({ t: 'hello', v: 2, ver: VER, op, pid: c.pid, key: c.key, name: nm || name });
    const w = await c.next('welcome');
    c.offset = w.now - Date.now();
    return w;
  };
  c.serverNow = () => Date.now() + c.offset;
  return c;
}

// 현재 웨이브 (waveAts 기준)
const waveAt = (ats, now) => { let n = 0; for (let i = 1; i < ats.length; i++) if (ats[i] != null && ats[i] <= now) n = i; return n; };

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
  ok(health.ok === true && health.protocol === 2, `/health ${JSON.stringify(health)}`);

  // S1 Origin: 불일치 403 · localhost 허용 · 없으면 통과
  ok((await rawUpgrade('/ws/new', { Origin: 'https://evil.example' })) === 403, 'Origin 불일치 → 403');
  ok((await rawUpgrade('/ws/room/ZZZZZZ', { Origin: 'http://localhost:8137' })) === 101, 'Origin localhost → 101');
  ok((await rawUpgrade('/ws/room/abc', {})) === 404, '잘못된 코드 형식 → 404 (DO 호출 없음)');
  ok((await rawUpgrade('/health', {})) !== 101, '/health 는 업그레이드 대상 아님');

  // S2 없는 코드 → hello → err bad-code + 4404
  {
    const c = connect('/ws/room/ZZZZZZ', 'ghost');
    await c.open();
    c.send({ t: 'hello', v: 2, ver: VER, op: 'join', pid: c.pid, key: c.key, name: 'ghost' });
    const err = await c.next('err');
    const cl = await c.closed;
    ok(err.code === 'bad-code' && cl.code === 4404, `없는 코드 → err bad-code + close 4404`);
  }

  // S3 hello 없이 5초 → 4400 (뒤에서 확인)
  const noHello = connect('/ws/room/ZZZZZZ', 'mute');
  await noHello.open();
  const noHelloAt = Date.now();

  // S4 2KB 초과 → 1009 (hello 전이라도 프레임 단계에서)
  {
    const c = connect('/ws/room/ZZZZZZ', 'big');
    await c.open();
    c.send(JSON.stringify({ t: 'chat', text: 'x'.repeat(2100) }));
    const cl = await c.closed;
    ok(cl.code === 1009, `2,048 B 초과 → close 1009 (got ${cl.code})`);
  }

  // S5 방 만들기 · 속도 제한 4429 · ping/pong
  {
    const c = connect('/ws/new', 'rater');
    await c.open();
    const w = await c.hello('create');
    ok(/^[A-HJ-NP-Z2-9]{6}$/.test(w.code) && w.resumed === false && w.room.players[0].host === true, `/ws/new → welcome code=${w.code}`);
    c.send('ping');
    await sleep(200);
    ok(c.pongs === 1, "'ping' → 'pong'");
    for (let i = 0; i < 60; i++) c.send({ t: 'time', c: i });
    const err = await c.next((m) => m.t === 'err' && m.code === 'rate');
    const cl = await c.closed;
    ok(err.code === 'rate' && cl.code === 4429, `소켓 20/s 버스트 40 초과 → err rate + 4429`);
  }

  // S6 한 판: A 생성, B·C 참가, start, 재접속, 보스 홀드, 클리어
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
  // 대기실 재접속은 남에게 room 을 한 번 방송한다 (좌석 연결 표시 갱신) — 큐에서 소비
  const rmA = await A.next('room'); await B.next('room');
  ok(rmA.phase === 'lobby' && rmA.players.find((p) => p.pid === C.pid).connected === true, '대기실 재접속 → 남에게 room{connected:true}');
  // 잘못된 key → 4403
  {
    const X = connect(`/ws/room/${code}`, 'X'); X.pid = B.pid;
    await X.open();
    X.send({ t: 'hello', v: 2, ver: VER, op: 'join', pid: B.pid, key: KEY(), name: 'X' });
    const err = await X.next('err'); const cl = await X.closed;
    ok(err.code === 'bad-key' && cl.code === 4403, 'key 불일치 → 4403');
  }
  // ver 불일치 → 4426
  {
    const X = connect(`/ws/room/${code}`, 'X');
    await X.open();
    X.send({ t: 'hello', v: 2, ver: '1', op: 'join', pid: PID(), key: KEY(), name: 'X' });
    const err = await X.next('err'); const cl = await X.closed;
    ok(err.code === 'version' && cl.code === 4426, 'ver 불일치 → 4426');
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
  ok(sA.timing.clearWave === 12 && sA.timing.prep === 2000, `TIMING=fast (timing ${JSON.stringify(sA.timing)})`);
  const [scA, scB, scC] = await Promise.all([A.next('sched'), B.next('sched'), C2.next('sched')]);
  ok(scA.from === 1 && scA.ats.length === 10 && JSON.stringify(scA.ats) === JSON.stringify(scB.ats) && JSON.stringify(scA.ats) === JSON.stringify(scC.ats), 'sched 1..10 동일');
  const rm = await A.next('room');
  ok(rm.phase === 'playing' && rm.game.waveAts.length === 11 && rm.players.every((p) => p.status === 'alive'), 'start 뒤 room{playing}');
  await B.next('room'); await C2.next('room');
  const ats = scA.ats.slice(); ats.unshift(null);          // waveAts 형태
  // 늦게 온 참가자 → started 4409
  {
    const X = connect(`/ws/room/${code}`, 'X');
    await X.open();
    X.send({ t: 'hello', v: 2, ver: VER, op: 'join', pid: PID(), key: KEY(), name: 'X' });
    const err = await X.next('err'); const cl = await X.closed;
    ok(err.code === 'started' && cl.code === 4409, '시작한 방에 모르는 pid → 4409');
  }
  // B 끊김 → player{connected:false} → 재접속 → welcome{resumed, room.game.waveAts 전체} → player{connected:true}
  B.ws.close(4999, 'net-drop');
  const pB = await A.next((m) => m.t === 'player' && m.pid === B.pid && m.connected === false);
  ok(pB.connected === false, 'B 끊김 → player{connected:false}');
  const B2 = connect(`/ws/room/${code}`, 'B'); B2.pid = B.pid; B2.key = B.key;
  await B2.open();
  const wB2 = await B2.hello('join');
  ok(wB2.resumed === true && wB2.room.phase === 'playing' && JSON.stringify(wB2.room.game.waveAts) === JSON.stringify(ats) && wB2.room.game.timing.clearWave === 12, '재접속 welcome 에 waveAts 전체');
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

  // 클라 흉내: 2초마다 sum, 웨이브 10 에서 홀드
  const players = { [A.pid]: A, [B.pid]: B2, [C2.pid]: C2 };
  let hold = null;
  const sumTimer = setInterval(() => {
    for (const c of Object.values(players)) {
      if (c.dead) continue;
      const w = waveAt(ats, c.serverNow());
      c.send({ t: 'sum', w, dw: Math.max(0, w - 1), l: 20, g: 400, k: w * 3, f: 5, lag: 0, hid: 0, b: hold ? 0.5 : null, o: c === B2 ? 'p' : 'l', tw: [[0, 6, 1]] });
    }
  }, 2000);
  console.log(`  웨이브 10 까지 대기 (≈ ${Math.round((ats[10] - A.serverNow()) / 1000)}초)`);
  const h0 = await A.next((m) => m.t === 'hold' && m.w === 10, ats[10] - A.serverNow() + 15000);
  ok(h0.waiting.length === 3 && h0.done.length === 0 && h0.released === false && h0.deadline === ats[10] + 1050 + 5000 + 2000, `T10 → hold waiting 3명 deadline=T10+8.05s`);
  hold = h0;
  await sleep(300);
  A.send({ t: 'done', w: 10 });
  const h1 = await A.next((m) => m.t === 'hold' && m.done.includes(A.pid));
  ok(h1.waiting.length === 2 && !h1.waiting.includes(A.pid), 'A done → waiting [B,C]');
  C2.send({ t: 'dead', w: 10, k: 30, r: 'lives' }); C2.dead = true;
  const pC = await A.next((m) => m.t === 'player' && m.pid === C2.pid && m.status === 'dead');
  ok(pC.deathWave === 9 && pC.kills === 30, 'C dead → player{status dead, deathWave 9}');
  B2.send({ t: 'sum', w: 10, dw: 10, l: 20, g: 0, k: 40, f: 0, lag: 0, hid: 0, b: null, o: 'p', tw: [] });   // dw=10 만으로 bossDone
  const rel = await A.next((m) => m.t === 'hold' && m.released === true);
  const sc2 = await A.next((m) => m.t === 'sched' && m.from === 11);
  const sc2B = await B2.next((m) => m.t === 'sched' && m.from === 11);
  ok(rel.done.length === 2 && sc2.ats.length === 2 && JSON.stringify(sc2.ats) === JSON.stringify(sc2B.ats) && sc2.ats[0] - rel.at === 500, `홀드 해제 → sched 11..12 (T11 = 해제+0.5s)`);
  ats[11] = sc2.ats[0]; ats[12] = sc2.ats[1];
  const endAt = ats[12] + Math.round((0.45 + 18 * 0.68) * 1000);   // spawnEnd(12)
  // 이른 clear 는 폐기된다 (status 그대로) — 응답이 없으므로 짧게 기다렸다가 다음으로
  A.send({ t: 'clear', w: 12, k: 1 });
  console.log(`  12웨이브 끝까지 대기 (≈ ${Math.round((endAt - A.serverNow()) / 1000)}초)`);
  await sleep(Math.max(0, endAt + 300 - A.serverNow()));
  A.send({ t: 'clear', w: 12, k: 100 });
  const pA = await B2.next((m) => m.t === 'player' && m.pid === A.pid && m.status === 'cleared');
  ok(pA.wave === 12, 'A clear → player{cleared}');
  B2.send({ t: 'clear', w: 12, k: 90 });
  const [eA, eB, eC] = await Promise.all([A.next('end'), B2.next('end'), C2.next('end')]);
  clearInterval(sumTimer);
  ok(eA.reason === 'cleared' && eA.seed === sA.seed && JSON.stringify(eA.ranking) === JSON.stringify(eB.ranking) && JSON.stringify(eA.ranking) === JSON.stringify(eC.ranking), `end cleared, 순위 동일 ${JSON.stringify(eA.ranking.map((r) => [r.name, r.rank, r.status, r.wave]))}`);
  const rk = Object.fromEntries(eA.ranking.map((r) => [r.pid, r]));
  ok(rk[A.pid].rank === 1 && rk[B.pid].rank === 1 && rk[C2.pid].rank === 3 && rk[C2.pid].wave === 9, '완주 둘 공동 1위, 사망 3위');
  ok(!gotOwnLog, '본인 로그는 되돌아오지 않는다');
  // 끝난 방 재접속 → welcome + end 재전송
  const A3 = connect(`/ws/room/${code}`, 'A'); A3.pid = A.pid; A3.key = A.key;
  await A3.open();
  const wA3 = await A3.hello('join');
  const eA3 = await A3.next('end');
  ok(wA3.room.phase === 'ended' && eA3.reason === 'cleared', '끝난 방 재접속 → room{ended} + end 재전송');
  // leave → 4000
  B2.send({ t: 'leave' });
  ok((await B2.closed).code === 4000, 'leave → 4000');
  // S3 확인: hello 없는 소켓은 5초 안팎에 4400
  const clMute = await noHello.closed;
  ok(clMute.code === 4400 && Date.now() - noHelloAt >= 4500, `hello 없이 → 4400 (${((Date.now() - noHelloAt) / 1000).toFixed(1)}s 전 열림)`);
  for (const c of [A, A3, C2]) c.ws.close(1000);
  console.log(`\nPASS ${passed} checks · ${((Date.now() - t0) / 1000).toFixed(1)}s · 수신 ${budget.recv} / 송신 ${budget.sent} 메시지`);
  process.exit(0);
}

main().catch((e) => { console.error('\n' + (e && e.stack || e)); process.exit(1); });
