// U4~U10 — Room 순수 상태 머신. 시간은 전부 now 주입, 소켓·타이머 없음.
// 개별 진행 규칙: 서버는 웨이브 시계가 없다. start 뒤 각자 sum/done/dead/clear 를 보고하고 서버는 중계·순위·종료만 맡는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, emptyLive, reduce, snapshot, ranking, nextAlarm, liveFromSockets } from '../src/room-core.js';
import * as T from '../src/timing.js';

const KEY = (pid) => (pid + pid + pid + pid).replace(/[^0-9a-f]/g, 'a').slice(0, 32).padEnd(32, '0');
const SID = (pid) => 's' + pid[0].toUpperCase();   // aaaa1111 → 'sA'
const A = 'aaaa1111', B = 'bbbb2222', C = 'cccc3333', D = 'dddd4444', E = 'eeee5555';
const T0 = 1_700_000_000_000;

// ---- 작은 하네스: 상태를 들고 이벤트를 넣고 effects 를 분류한다 ----
function harness(now = T0, timing = T.timingFor(''), opts = {}) {
  const h = {
    now,
    state: createRoom({ code: 'ABC234', now, timing, ...opts }),
    live: emptyLive(now),
    trace: [],                       // 매 단계 { ev, now, persist, alarm } (U9 불변식용)
    step(ev, at) {
      if (at != null) h.now = at;
      const r = reduce({ state: h.state, live: h.live }, ev, h.now);
      h.state = r.state; h.live = r.live;
      const alarm = r.effects.find((e) => 'alarm' in e);
      h.trace.push({ ev: ev.k + (ev.m ? ':' + ev.m.t : ''), now: h.now, persist: r.persist, alarm: alarm ? alarm.alarm : undefined, effects: r.effects });
      JSON.stringify(h.state);       // 직렬화 가능해야 한다
      return r;
    },
    open(sid, op, at) { return h.step({ k: 'open', sid, op }, at); },
    hello(sid, pid, opts = {}, at) {
      const op = opts.op || 'join';
      if (!opts.noOpen) h.open(sid, op, at);
      const m = { t: 'hello', v: opts.v == null ? 3 : opts.v, ver: opts.ver || '78', op, pid, key: opts.key || KEY(pid), name: opts.name || pid.slice(0, 4).toUpperCase() };
      return h.step({ k: 'hello', sid, op, m }, at);
    },
    msg(pid, m, at) { const sid = h.live.players[pid] && h.live.players[pid].sid; return h.step({ k: 'msg', pid, sid, m }, at); },
    close(sid, at) { return h.step({ k: 'close', sid }, at); },
    alarm(at) { return h.step({ k: 'alarm' }, at); },
    sum(pid, o = {}, at) { return h.msg(pid, { t: 'sum', w: 0, dw: 0, l: 20, g: 0, k: 0, f: 0, sp: 1, hid: 0, b: null, o: 'l', tw: [], ...o }, at); },
    get alarmAt() { return nextAlarm(h.state, h.live, h.now); },
  };
  return h;
}
const sends = (r, t) => r.effects.filter((e) => e.send && e.send.m.t === t).map((e) => e.send);
const closes = (r) => r.effects.filter((e) => e.close).map((e) => e.close);
const logs = (r, ev) => r.effects.filter((e) => e.log && e.log.ev === ev).map((e) => e.log);
const errOf = (r) => { const s = sends(r, 'err'); return s.length ? s[0].m.code : null; };

// 방 하나를 대기실까지: A 생성, 나머지 참가
function lobby(pids = [A, B], now = T0, timing) {
  const h = harness(now, timing);
  h.hello(SID(pids[0]), pids[0], { op: 'create' });
  for (const p of pids.slice(1)) h.hello(SID(p), p);
  return h;
}
function playing(pids = [A, B], now = T0, timing) {
  const h = lobby(pids, now, timing);
  h.step({ k: 'seed', value: 424242 });
  h.msg(pids[0], { t: 'start' });
  return h;
}
const g = (h) => h.state.game;
const t0 = (h) => g(h).t0;

// ==================== U4 참가 ====================
test('U4 create → claimed → hello create → lobby (방장)', () => {
  const h = harness();
  assert.equal(h.state.phase, 'claimed');
  assert.equal(h.state.expireAt, T0 + T.CLAIM_TTL);
  const r = h.hello('s1', A, { op: 'create' });
  assert.equal(h.state.phase, 'lobby');
  assert.equal(h.state.hostId, A);
  assert.equal(h.state.ver, '78');
  assert.equal(r.persist, true);
  const w = sends(r, 'welcome')[0];
  assert.equal(w.sid, 's1');
  assert.equal(w.m.pid, A);
  assert.equal(w.m.code, 'ABC234');
  assert.equal(w.m.kind, 'code');
  assert.equal(w.m.resumed, false);
  assert.equal(w.m.at, T0);
  assert.equal(w.m.room.t, 'room');
  assert.equal(w.m.room.phase, 'lobby');
  assert.equal(w.m.room.reserveUntil, null);
  assert.deepEqual(w.m.room.players.map((p) => [p.pid, p.host, p.connected, p.status]), [[A, true, true, 'idle']]);
  assert.equal(w.m.room.game, null);
  assert.equal(h.state.expireAt, T0 + T.LOBBY_TTL);
  assert.equal(h.alarmAt, T0 + T.LOBBY_TTL);
  assert.ok(!('key' in w.m.room.players[0]));
});

test('U4 claimed 에 join 은 bad-code, 없는 방(state null)도 bad-code + persist false', () => {
  const h = harness();
  let r = h.hello('s1', B);
  assert.equal(errOf(r), 'bad-code');
  assert.deepEqual(closes(r), [{ sid: 's1', code: 4404, reason: 'bad-code' }]);
  assert.equal(r.persist, false);
  assert.equal(h.state.phase, 'claimed');
  // 없는 방
  const r2 = reduce({ state: null, live: emptyLive(T0) }, { k: 'hello', sid: 'x', op: 'join', m: { t: 'hello', v: 3, ver: '78', op: 'join', pid: A, key: KEY(A), name: 'A' } }, T0);
  assert.equal(r2.state, null);
  assert.equal(r2.persist, false);
  assert.equal(errOf(r2), 'bad-code');
  assert.equal(closes(r2)[0].code, 4404);
});

test('U4 join ×3 → room 방송, 5번째 full 4409', () => {
  const h = lobby([A]);
  let r = h.hello('sB', B);
  assert.equal(r.persist, true);
  const rooms = sends(r, 'room');
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].to, '*');
  assert.equal(rooms[0].except, B);
  assert.equal(sends(r, 'welcome')[0].m.room.players.length, 2);
  h.hello('sC', C); h.hello('sD', D);
  assert.equal(Object.keys(h.state.players).length, 4);
  r = h.hello('sE', E);
  assert.equal(errOf(r), 'full');
  assert.equal(closes(r)[0].code, 4409);
  assert.equal(r.persist, false);
  assert.equal(Object.keys(h.state.players).length, 4);
});

test('U4 ver 불일치 4426 · 프로토콜 v2 4426 · key 불일치 4403 · op quick 4400 · playing 에 모르는 pid started 4409', () => {
  const h = lobby([A]);
  let r = h.hello('sB', B, { ver: '77' });
  assert.equal(errOf(r), 'version'); assert.equal(closes(r)[0].code, 4426);
  r = h.hello('sB2', B, { v: 2 });
  assert.equal(errOf(r), 'version'); assert.equal(closes(r)[0].code, 4426);
  r = h.hello('sA2', A, { key: 'f'.repeat(32) });
  assert.equal(errOf(r), 'bad-key'); assert.equal(closes(r)[0].code, 4403);
  // 경로 op 와 hello op 불일치
  h.open('sX', 'join');
  r = h.step({ k: 'hello', sid: 'sX', op: 'join', m: { t: 'hello', v: 3, ver: '78', op: 'create', pid: C, key: KEY(C), name: 'C' } });
  assert.equal(errOf(r), 'bad-request'); assert.equal(closes(r)[0].code, 4400);
  // 빠른 매칭 op 는 Room 에서 거절
  r = h.hello('sQ', C, { op: 'quick' });
  assert.equal(errOf(r), 'bad-request'); assert.equal(closes(r)[0].code, 4400);
  h.hello('sB3', B);
  h.step({ k: 'seed', value: 1 });
  h.msg(A, { t: 'start' });
  r = h.hello('sC', C);
  assert.equal(errOf(r), 'started'); assert.equal(closes(r)[0].code, 4409);
});

test('U4 재접속: 같은 pid 새 소켓 → 옛 sid 4001, welcome resumed', () => {
  const h = lobby([A, B]);
  const r = h.hello('sB-new', B);
  assert.deepEqual(closes(r), [{ sid: 'sB', code: 4001, reason: 'replaced' }]);
  const w = sends(r, 'welcome')[0];
  assert.equal(w.sid, 'sB-new');
  assert.equal(w.m.resumed, true);
  assert.equal(r.persist, false);
  assert.equal(h.live.players[B].sid, 'sB-new');
  // 옛 소켓의 close 는 무시된다
  const r2 = h.close('sB');
  assert.equal(h.live.players[B].connected, true);
  assert.equal(Object.keys(h.state.players).length, 2);
  assert.equal(r2.persist, false);
});

test('U4 이름 중복 접미 · 빈 이름 대체', () => {
  const h = lobby([A]);
  h.hello('sB', B, { name: 'AAAA' });
  h.hello('sC', C, { name: 'AAAA' });
  const names = Object.values(h.state.players).map((p) => p.name);
  assert.deepEqual(names, ['AAAA', 'AAAA (2)', 'AAAA (3)']);
  h.hello('sD', D, { name: '' });
  assert.equal(h.state.players[D].name, 'DDDD');   // 하네스 기본 이름
});

test('U4 대기실 이탈: leave → 즉시 제거·4000, 방장 이탈 → 가장 먼저 들어온 사람에게 위임', () => {
  const h = lobby([A, B, C]);
  let r = h.msg(C, { t: 'leave' });
  assert.deepEqual(closes(r), [{ sid: 'sC', code: 4000, reason: 'leave' }]);
  assert.ok(!h.state.players[C]);
  assert.equal(r.persist, true);
  assert.equal(sends(r, 'room').length, 1);
  // 방장 끊김(새로고침·백그라운드): LOBBY_GRACE 동안 좌석과 방장을 지킨다
  r = h.close('sA');
  assert.ok(h.state.players[A]);
  assert.equal(h.state.hostId, A);
  assert.equal(sends(r, 'room')[0].m.players.find((p) => p.pid === A).connected, false);
  assert.equal(h.alarmAt, h.now + T.LOBBY_GRACE);
  // 유예 안에 같은 pid+key 로 돌아오면 같은 좌석·방장 (resumed welcome + 남에게 room 방송)
  r = h.hello('sA2', A, {}, h.now + 5000);
  assert.equal(sends(r, 'welcome')[0].m.resumed, true);
  assert.ok(sends(r, 'room').some((x) => x.m.hostId === A));
  assert.equal(h.state.hostId, A);
  // 다시 끊기고 유예가 지나면 제거 → 방장 위임
  h.close('sA2');
  r = h.alarm(h.now + T.LOBBY_GRACE);
  assert.ok(!h.state.players[A]);
  assert.equal(h.state.hostId, B);
  assert.equal(sends(r, 'room')[0].m.hostId, B);
  assert.equal(sends(r, 'room')[0].m.players[0].host, true);
  h.close('sB');
  r = h.alarm(h.now + T.LOBBY_GRACE);
  assert.equal(Object.keys(h.state.players).length, 0);
  assert.equal(h.state.hostId, null);
  assert.equal(h.state.phase, 'lobby');
  assert.equal(h.alarmAt, h.now + T.LOBBY_TTL);
  // 만료 → destroy
  r = h.alarm(h.now + T.LOBBY_TTL);
  assert.ok(r.effects.some((e) => e.destroy));
  assert.equal(r.state, null);
});

test('U4 claimed 60초 · hello 없는 소켓 5초 → 4400', () => {
  const h = harness();
  h.open('s1', 'create');
  assert.equal(h.alarmAt, T0 + T.HELLO_TIMEOUT);
  let r = h.alarm(T0 + T.HELLO_TIMEOUT);
  assert.equal(errOf(r), 'bad-request');
  assert.deepEqual(closes(r), [{ sid: 's1', code: 4400, reason: 'bad-request' }]);
  assert.equal(h.alarmAt, T0 + T.CLAIM_TTL);
  r = h.alarm(T0 + T.CLAIM_TTL);
  assert.ok(r.effects.some((e) => e.destroy));
  assert.equal(r.state, null);
  assert.equal(nextAlarm(null, r.live, h.now), null);
});

// ==================== U5 시작 ====================
test('U5 start: 접속 1명 not-ready · 방장 아님 not-host · 2명 OK → start{seed,t0,timing,now} + room{playing}', () => {
  const h = lobby([A]);
  let r = h.msg(A, { t: 'start' });
  assert.equal(errOf(r), 'not-ready');
  assert.equal(closes(r).length, 0);
  h.hello('sB', B);
  r = h.msg(B, { t: 'start' });
  assert.equal(errOf(r), 'not-host');
  h.step({ k: 'seed', value: 0xdeadbeef });
  const at = h.now + 1234;
  r = h.msg(A, { t: 'start' }, at);
  assert.equal(r.persist, true);
  assert.equal(h.state.phase, 'playing');
  assert.equal(h.state.seed, 0xdeadbeef);
  assert.equal(h.state.expireAt, null);
  const st = sends(r, 'start')[0];
  assert.equal(st.to, '*');
  assert.deepEqual(st.m, { t: 'start', seed: 0xdeadbeef, t0: at + 20000, timing: { prep: 20000, bossLimit: 320000, clearWave: 101 }, now: at, at });
  assert.equal(sends(r, 'sched').length, 0);
  assert.equal(sends(r, 'hold').length, 0);
  assert.deepEqual(g(h), { t0: at + 20000, timing: { prep: 20000, bossLimit: 320000, clearWave: 101 }, endedAt: null, reason: null, ranking: null });
  const room = sends(r, 'room')[0].m;
  assert.equal(room.phase, 'playing');
  assert.deepEqual(room.players.map((p) => [p.status, p.wave, p.dw, p.sp]), [['alive', 0, 0, 1], ['alive', 0, 0, 1]]);
  assert.deepEqual(room.game, { t0: at + 20000, timing: { prep: 20000, bossLimit: 320000, clearWave: 101 }, seed: 0xdeadbeef });
  assert.equal(h.alarmAt, at + 20000 + T.GAME_CAP);
  // 시작 뒤 start 거절 · 알람은 GAME_CAP 뿐 (서버 웨이브 시계 없음)
  r = h.msg(A, { t: 'start' });
  assert.equal(errOf(r), 'not-ready');
  r = h.alarm(at + 60 * 60000);
  assert.equal(h.state.phase, 'playing');
  assert.equal(sends(r, 'sched').length + sends(r, 'hold').length, 0);
  // fast 표
  const hf = playing([A, B], T0, T.timingFor('fast'));
  assert.deepEqual(g(hf).timing, { prep: 2000, bossLimit: 5000, clearWave: 12 });
});

// ==================== U6 개별 진행: sum · done · dead · clear ====================
test('U6 sum: wave/dw/kills 는 max, clearWave 로 클램프 · done 범위 · dead 는 deathWave = w−1', () => {
  const h = playing([A, B], T0, T.timingFor('fast'));
  let r = h.sum(A, { w: 3, dw: 2, k: 10, sp: 3 }, t0(h) + 100);
  assert.equal(r.persist, false);
  assert.deepEqual([h.state.players[A].wave, h.state.players[A].dw, h.state.players[A].kills], [3, 2, 10]);
  assert.equal(h.live.players[A].sum.sp, 3);
  h.sum(A, { w: 1, dw: 1, k: 5 }, t0(h) + 200);            // 뒤로 가지 않는다
  assert.deepEqual([h.state.players[A].wave, h.state.players[A].dw, h.state.players[A].kills], [3, 2, 10]);
  h.sum(A, { w: 99, dw: 101 }, t0(h) + 300);               // clearWave(12) 클램프
  assert.deepEqual([h.state.players[A].wave, h.state.players[A].dw], [12, 12]);
  assert.equal(snapshot(h.state, h.live, h.now).players[0].sp, 1);
  // done: 1..clearWave 만, 통계용
  r = h.msg(B, { t: 'done', w: 0 });
  assert.equal(logs(r, 'anomaly')[0].kind, 'done-range');
  r = h.msg(B, { t: 'done', w: 13 });
  assert.equal(logs(r, 'anomaly')[0].kind, 'done-range');
  r = h.msg(B, { t: 'done', w: 4 });
  assert.equal(r.persist, false);
  assert.deepEqual([h.state.players[B].wave, h.state.players[B].dw], [4, 4]);
  assert.equal(logs(r, 'anomaly').length, 0);
  // dead
  r = h.msg(B, { t: 'dead', w: 5, k: 30, r: 'lives' }, t0(h) + 5000);
  assert.deepEqual(sends(r, 'player')[0].m, { t: 'player', pid: B, status: 'dead', wave: 5, deathWave: 4, kills: 30, at: h.now });
  assert.equal(r.persist, true);
  assert.equal(h.state.players[B].deathAt, t0(h) + 5000);
  assert.equal(h.state.phase, 'playing');
  // 죽은 뒤 sum/done/clear 무시
  r = h.sum(B, { k: 999 });
  assert.equal(h.state.players[B].kills, 30);
  assert.equal(sends(r, 'sum').length, 0);
  r = h.msg(B, { t: 'clear', w: 12, k: 1 });
  assert.equal(h.state.players[B].status, 'dead');
  // dead.w 클램프: 0 → deathWave 0, 100 → 11
  const h2 = playing([A, B], T0, T.timingFor('fast'));
  h2.msg(A, { t: 'dead', w: 0, k: 0, r: 'afk' });
  assert.equal(h2.state.players[A].deathWave, 0);
  h2.msg(B, { t: 'dead', w: 100, k: 0, r: 'reload' });
  assert.equal(h2.state.players[B].deathWave, 11);
});

test('U6 clear: w < clearWave 는 anomaly 폐기 · 수락 시 player{cleared, clearAt} · 전원 확정 → end', () => {
  const h = playing([A, B, C], T0, T.timingFor('fast'));
  let r = h.msg(A, { t: 'clear', w: 11, k: 3 }, t0(h) + 1000);
  assert.equal(h.state.players[A].status, 'alive');
  assert.equal(logs(r, 'anomaly')[0].kind, 'clear-early');
  assert.equal(r.persist, false);
  // 서버는 보스 처치를 검증하지 않는다 — 12 이면 수락 (클라가 검증)
  r = h.msg(A, { t: 'clear', w: 12, k: 100 }, t0(h) + 60000);
  assert.equal(r.persist, true);
  const pA = sends(r, 'player')[0];
  assert.equal(pA.to, '*');
  assert.deepEqual(pA.m, { t: 'player', pid: A, status: 'cleared', wave: 12, kills: 100, clearAt: t0(h) + 60000, at: t0(h) + 60000 });
  assert.equal(h.state.players[A].deathWave, 12);
  assert.equal(sends(r, 'end').length, 0);
  assert.equal(h.state.phase, 'playing');
  // 완주 뒤 다시 clear/dead 는 무시
  r = h.msg(A, { t: 'dead', w: 3, k: 1, r: 'quit' });
  assert.equal(h.state.players[A].status, 'cleared');
  h.msg(B, { t: 'dead', w: 8, k: 20, r: 'bossTimeout' }, t0(h) + 70000);
  r = h.msg(C, { t: 'clear', w: 12, k: 50 }, t0(h) + 80000);
  const end = sends(r, 'end')[0].m;
  assert.equal(end.reason, 'cleared');
  assert.equal(end.seed, 424242);
  assert.deepEqual(end.ranking.map((x) => [x.pid, x.rank, x.status, x.wave, x.deathWave, x.clearAt]),
    [[A, 1, 'cleared', 12, 12, t0(h) + 60000], [C, 2, 'cleared', 12, 12, t0(h) + 80000], [B, 3, 'dead', 7, 7, null]]);
  assert.deepEqual(Object.keys(end.ranking[0]).sort(), ['clearAt', 'deathWave', 'kills', 'name', 'pid', 'rank', 'status', 'wave']);
  assert.equal(h.state.phase, 'ended');
  assert.equal(h.state.expireAt, h.now + T.END_TTL);
  assert.equal(h.alarmAt, h.now + T.END_TTL);
  assert.equal(r.persist, true);
  assert.equal(h.state.players[A].rank, 1);
  // 끝난 뒤 sum/done 무시, 재접속은 welcome + end 재전송, 모르는 pid 는 expired
  r = h.msg(A, { t: 'done', w: 12 });
  assert.equal(r.persist, false);
  r = h.hello('sA-again', A);
  assert.equal(sends(r, 'welcome')[0].m.room.phase, 'ended');
  assert.equal(sends(r, 'end')[0].m.reason, 'cleared');
  r = h.hello('sD', D);
  assert.equal(errOf(r), 'expired'); assert.equal(closes(r)[0].code, 4410);
  // END_TTL → 전원 4410 + destroy
  r = h.alarm(h.state.expireAt);
  assert.ok(closes(r).every((c) => c.code === 4410));
  assert.ok(r.effects.some((e) => e.destroy));
});

// ==================== U7 종료 · 순위 ====================
test('U7 ranking: cleared 는 clearAt 오름차순(공동 없음) → 나머지 deathWave desc → kills desc → joinedAt', () => {
  const st = createRoom({ code: 'ABC234', now: T0, timing: T.timingFor('') });
  const mk = (pid, o) => ({ pid, name: pid, key: 'k', joinedAt: T0, status: 'alive', wave: 0, dw: 0, deathWave: null, deathAt: null, kills: 0, clearAt: null, rank: null, ...o });
  st.players = {
    p1: mk('p1', { status: 'dead', deathWave: 40, deathAt: T0 + 5, kills: 100 }),
    p2: mk('p2', { status: 'cleared', wave: 101, deathWave: 101, clearAt: T0 + 9, kills: 10 }),
    p3: mk('p3', { status: 'left', deathWave: 60, deathAt: T0 + 3, kills: 900 }),
    p4: mk('p4', { status: 'cleared', wave: 101, deathWave: 101, clearAt: T0 + 8, kills: 999 }),
    p5: mk('p5', { status: 'dead', deathWave: 40, deathAt: T0 + 7, kills: 50, joinedAt: T0 + 1 }),
    p6: mk('p6', { status: 'lost', wave: 101, deathWave: 101, deathAt: T0 + 1, kills: 1 }),
    p7: mk('p7', { status: 'dead', deathWave: 40, deathAt: T0 + 7, kills: 50, joinedAt: T0 + 2 }),
    p8: mk('p8', { status: 'cleared', wave: 101, deathWave: 101, clearAt: T0 + 8, kills: 0, joinedAt: T0 + 1 }),   // p4 와 동시각 → joinedAt
  };
  const rk = ranking(st);
  assert.deepEqual(rk.map((r) => [r.pid, r.rank, r.wave]),
    [['p4', 1, 101], ['p8', 2, 101], ['p2', 3, 101], ['p6', 4, 101], ['p3', 5, 60], ['p1', 6, 40], ['p5', 7, 40], ['p7', 8, 40]]);
  assert.deepEqual(rk.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('U7 alive 0 → all-dead · 탈락 웨이브 순 · 같은 웨이브면 kills', () => {
  const h = playing([A, B, C], T0, T.timingFor('fast'));
  h.msg(A, { t: 'dead', w: 5, k: 30, r: 'lives' }, t0(h) + 100);
  h.msg(B, { t: 'dead', w: 5, k: 40, r: 'lives' }, t0(h) + 200);
  const r = h.msg(C, { t: 'dead', w: 9, k: 1, r: 'quit' }, t0(h) + 300);
  const end = sends(r, 'end')[0].m;
  assert.equal(end.reason, 'all-dead');
  assert.deepEqual(end.ranking.map((x) => [x.pid, x.rank, x.wave, x.kills]), [[C, 1, 8, 1], [B, 2, 4, 40], [A, 3, 4, 30]]);
});

test('U7 전원 끊김 3분 → empty · GAME_CAP → 남은 alive 는 lost → timeout', () => {
  const h = playing();
  let r = h.close('sA', t0(h) + 1000);
  assert.deepEqual(sends(r, 'player')[0].m, { t: 'player', pid: A, connected: false, at: t0(h) + 1000 });
  assert.equal(r.persist, false);
  assert.equal(h.live.emptySince, null);
  h.close('sB', t0(h) + 2000);
  assert.equal(h.live.emptySince, t0(h) + 2000);
  assert.equal(h.alarmAt, Math.min(t0(h) + 1000 + T.RECONNECT_GRACE, t0(h) + 2000 + T.EMPTY_END));
  r = h.alarm(t0(h) + 2000 + T.EMPTY_END);
  assert.equal(sends(r, 'end')[0].m.reason, 'empty');
  assert.deepEqual(Object.values(h.state.players).map((p) => p.status), ['left', 'left']);
  // GAME_CAP: A 는 완주, B 는 미보고 → lost(deathWave = wave)
  const h2 = playing([A, B], T0, T.timingFor('fast'));
  const cap = t0(h2) + T.GAME_CAP;
  h2.msg(A, { t: 'clear', w: 12, k: 5 }, t0(h2) + 5000);
  h2.sum(B, { w: 7, dw: 6 }, cap - 1000);
  assert.equal(h2.alarmAt, cap);
  r = h2.alarm(cap);
  const end = sends(r, 'end')[0].m;
  assert.equal(end.reason, 'timeout');
  assert.deepEqual(sends(r, 'player').map((s) => [s.m.pid, s.m.status, s.m.deathWave]), [[B, 'lost', 7]]);
  assert.deepEqual(end.ranking.map((x) => [x.pid, x.rank, x.status, x.wave]), [[A, 1, 'cleared', 12], [B, 2, 'lost', 7]]);
});

// ==================== U8 재접속 · 유예 ====================
test('U8 playing 중 close → 180s → left(alive 만) · 유예 안 hello → 상태 불변 · status 확정 후 done/clear 무시', () => {
  const h = playing([A, B, C]);
  const at = t0(h) + 10000;
  h.msg(C, { t: 'dead', w: 3, k: 1, r: 'lives' }, at);
  h.close('sC', at + 20);                    // 죽은 사람 끊김 → 유예 대상 아님
  h.close('sB', at + 100);
  assert.equal(h.alarmAt, at + 100 + T.RECONNECT_GRACE);
  // 유예 안 재접속
  let r = h.hello('sB2', B, {}, at + 50000);
  const w = sends(r, 'welcome')[0].m;
  assert.equal(w.resumed, true);
  assert.deepEqual(w.room.game, { t0: t0(h), timing: g(h).timing, seed: 424242 });
  assert.equal(sends(r, 'player')[0].m.connected, true);
  assert.equal(h.state.players[B].status, 'alive');
  assert.equal(r.persist, false);
  assert.equal(h.alarmAt, t0(h) + T.GAME_CAP);
  // 다시 끊기고 유예 만료
  h.close('sB2', at + 60000);
  r = h.alarm(at + 60000 + T.RECONNECT_GRACE);
  assert.equal(h.state.players[B].status, 'left');
  assert.equal(h.state.players[B].deathWave, h.state.players[B].wave);
  assert.deepEqual(sends(r, 'player')[0].m, { t: 'player', pid: B, status: 'left', wave: h.state.players[B].wave, deathWave: h.state.players[B].deathWave, at: h.now });
  assert.equal(r.persist, true);
  assert.equal(h.state.players[C].status, 'dead');
  // left 뒤 재접속: 관전은 되지만 done/clear/dead 는 무시
  r = h.hello('sB3', B, {}, h.now + 1000);
  assert.equal(sends(r, 'welcome')[0].m.resumed, true);
  r = h.msg(B, { t: 'done', w: 4 });
  assert.equal(r.persist, false);
  assert.equal(h.state.players[B].status, 'left');
  r = h.msg(B, { t: 'dead', w: 4, k: 0, r: 'lives' });
  assert.equal(h.state.players[B].status, 'left');
  // 방장 A 가 playing 중 leave → left, 방장 위임 → room 방송, alive 0 → all-dead
  r = h.msg(A, { t: 'leave' }, h.now + 1000);
  assert.equal(h.state.players[A].status, 'left');
  assert.deepEqual(closes(r), [{ sid: 'sA', code: 4000, reason: 'leave' }]);
  assert.equal(h.state.hostId, C);                    // B 는 left 라 제외, 죽었어도 C 가 방장
  assert.equal(sends(r, 'end')[0].m.reason, 'all-dead');
});

test('U8 하이버네이션 복귀: attachment 로 live 재구성', () => {
  const h = playing([A, B]);
  h.sum(A, { hid: 1, sp: 2 }, t0(h) + 100);
  const st = JSON.parse(JSON.stringify(h.state));
  const at = t0(h) + 5000;
  const live = liveFromSockets(st, [{ sid: 'nA', pid: A, op: 'join' }, { sid: 'pending1', op: 'join' }], at);
  assert.equal(live.players[A].connected, true);
  assert.equal(live.players[A].lastBeat, at);
  assert.equal(live.players[A].hidden, false);
  assert.equal(live.players[A].watching, null);
  assert.equal(live.players[B].connected, false);
  assert.equal(live.players[B].disconnectedAt, at);
  assert.deepEqual(live.pending.pending1, { openedAt: at, op: 'join' });
  assert.equal(live.emptySince, null);
  assert.equal(nextAlarm(st, live, at), at + T.HELLO_TIMEOUT);
  const r = reduce({ state: st, live }, { k: 'alarm' }, at + T.RECONNECT_GRACE);
  assert.equal(r.state.players[B].status, 'left');
  // 전원 끊긴 채 복귀 → emptySince = now
  const live2 = liveFromSockets(st, [], at);
  assert.equal(live2.emptySince, at);
});

// ==================== U9 불변식 · 중계 · 관전 · 잡다 ====================
test('U9 persist 집합: sum/done/watch/chat/log/time/close 는 false, 전이는 true · alarm ≥ now', () => {
  const h = playing([A, B]);
  const r1 = h.sum(A, {}, t0(h) + 10);
  const r2 = h.msg(A, { t: 'chat', text: 'hi' });
  const r3 = h.msg(A, { t: 'log', text: 'x', kind: 'up' });
  const r4 = h.msg(A, { t: 'time', c: 5 });
  const r5 = h.msg(A, { t: 'watch', pid: B });
  const r6 = h.msg(A, { t: 'done', w: 1 });
  assert.deepEqual([r1.persist, r2.persist, r3.persist, r4.persist, r5.persist, r6.persist], [false, false, false, false, false, false]);
  assert.deepEqual(sends(r2, 'chat').map((s) => [s.to, s.except, s.m.name, s.m.text]), [['*', undefined, 'AAAA', 'hi']]);
  assert.deepEqual(sends(r3, 'log').map((s) => [s.to, s.except, s.m.kind]), [['*', A, 'up']]);
  assert.deepEqual(sends(r4, 'time')[0].m, { t: 'time', c: 5, s: h.now, at: h.now });
  const persisted = h.trace.filter((t) => t.persist).map((t) => t.ev);
  assert.deepEqual(persisted, ['hello:hello', 'hello:hello', 'msg:start']);
  for (const t of h.trace) assert.ok(t.alarm == null || t.alarm >= t.now, `${t.ev}: alarm ${t.alarm} < now ${t.now}`);
});

test('U9 sum 중계: 1.5초 간격 · 본인 제외 · en/ll 은 뗀다 · 보는 사람에게는 en/ll 포함 1초 간격', () => {
  const h = playing([A, B, C], T0, T.timingFor('fast'));
  const at = t0(h) + 10;
  const full = { w: 5, dw: 4, tw: [[0, 6, 2]], b: 0.5, sp: 2, ll: 1234, en: '1,2,3;4,5,6' };
  let r = h.sum(A, full, at);
  let s = sends(r, 'sum');
  assert.equal(s.length, 1);
  assert.equal(s[0].to, '*'); assert.deepEqual(s[0].except, [A]);
  assert.deepEqual(s[0].m, { t: 'sum', pid: A, w: 5, dw: 4, l: 20, g: 0, k: 0, f: 0, sp: 2, hid: 0, b: 0.5, o: 'l', tw: [[0, 6, 2]], at });
  assert.ok(!('en' in s[0].m) && !('ll' in s[0].m));
  r = h.sum(A, full, at + 1000);
  assert.equal(sends(r, 'sum').length, 0);
  r = h.sum(A, full, at + 1510);
  assert.equal(sends(r, 'sum').length, 1);
  // B 가 A 를 본다 → A 에게 watched{n:1}
  r = h.msg(B, { t: 'watch', pid: A }, at + 2000);
  assert.deepEqual(sends(r, 'watched').map((x) => [x.to, x.m.n]), [[A, 1]]);
  assert.equal(h.live.players[B].watching, A);
  // 같은 watch 다시 → 알림 없음
  r = h.msg(B, { t: 'watch', pid: A }, at + 2100);
  assert.equal(sends(r, 'watched').length, 0);
  // A 의 sum: B 에게는 en/ll 포함(1초 간격), C 에게는 뗀 것(1.5초 간격)
  r = h.sum(A, full, at + 3100);
  s = sends(r, 'sum');
  assert.equal(s.length, 2);
  const light = s.find((x) => x.to === '*'), watch = s.find((x) => Array.isArray(x.to));
  assert.deepEqual(light.except, [A, B]);
  assert.ok(!('en' in light.m));
  assert.deepEqual(watch.to, [B]);
  assert.equal(watch.m.en, '1,2,3;4,5,6'); assert.equal(watch.m.ll, 1234); assert.equal(watch.m.pid, A);
  r = h.sum(A, full, at + 3900);              // 0.8초 뒤: 둘 다 아직
  assert.equal(sends(r, 'sum').length, 0);
  r = h.sum(A, full, at + 4150);              // 1.05초 뒤: 보는 사람만
  s = sends(r, 'sum');
  assert.equal(s.length, 1); assert.deepEqual(s[0].to, [B]); assert.equal(s[0].m.en, full.en);
  r = h.sum(A, full, at + 4700);              // 1.6초 뒤(light 기준): 뗀 것만
  s = sends(r, 'sum');
  assert.equal(s.length, 1); assert.equal(s[0].to, '*'); assert.ok(!('en' in s[0].m));
  // C 도 A 를 본다 → watched{n:2}. B 가 그만(null) → watched{n:1}. B 가 C 로 바꿈 → A 에게 n 그대로 1, C 에게 1
  r = h.msg(C, { t: 'watch', pid: A }, at + 5000);
  assert.deepEqual(sends(r, 'watched').map((x) => [x.to, x.m.n]), [[A, 2]]);
  r = h.msg(B, { t: 'watch', pid: null }, at + 5100);
  assert.deepEqual(sends(r, 'watched').map((x) => [x.to, x.m.n]), [[A, 1]]);
  r = h.msg(B, { t: 'watch', pid: C }, at + 5200);
  assert.deepEqual(sends(r, 'watched').map((x) => [x.to, x.m.n]), [[C, 1]]);
  r = h.msg(B, { t: 'watch', pid: A }, at + 5300);
  assert.deepEqual(sends(r, 'watched').map((x) => [x.to, x.m.n]), [[C, 0], [A, 2]]);
  // 자기 자신·모르는 pid 는 무시
  r = h.msg(B, { t: 'watch', pid: 'zzzz9999' }, at + 5400);
  assert.equal(sends(r, 'watched').length, 0); assert.equal(h.live.players[B].watching, A);
  r = h.msg(A, { t: 'watch', pid: A }, at + 5500);
  assert.equal(h.live.players[A].watching, null);
  // 보는 사람이 끊기면 대상에게 watched 갱신, 돌아오면 다시 (watching 유지)
  r = h.close('sC', at + 6000);
  assert.deepEqual(sends(r, 'watched').map((x) => [x.to, x.m.n]), [[A, 1]]);
  r = h.hello('sC2', C, {}, at + 7000);
  assert.deepEqual(sends(r, 'watched').map((x) => [x.to, x.m.n]), [[A, 2]]);
  // 대상이 죽어도 watching 은 그대로. 죽은 사람의 sum 은 오지 않으니 중계도 없다
  h.msg(A, { t: 'dead', w: 6, k: 3, r: 'lives' }, at + 8000);
  assert.equal(h.live.players[B].watching, A);
  r = h.sum(A, full, at + 9000);
  assert.equal(sends(r, 'sum').length, 0);
  // 보는 사람이 하나도 없을 때는 en 만 뗀 방송 한 갈래뿐
  r = h.sum(C, full, at + 9100);
  s = sends(r, 'sum');
  assert.equal(s.length, 1); assert.deepEqual(s[0].except, [C]);
});

test('U9 채팅·로그 속도 제한 (1/s 버스트 5 · 2/s 버스트 4)', () => {
  const h = playing([A, B]);
  let r;
  for (let i = 0; i < 5; i++) { r = h.msg(A, { t: 'chat', text: 'c' + i }); assert.equal(sends(r, 'chat').length, 1); }
  r = h.msg(A, { t: 'chat', text: 'c6' });
  assert.equal(sends(r, 'chat').length, 0);
  assert.equal(errOf(r), 'rate');
  assert.equal(closes(r).length, 0);
  r = h.msg(A, { t: 'chat', text: 'c7' }, h.now + 1000);
  assert.equal(sends(r, 'chat').length, 1);
  for (let i = 0; i < 4; i++) { r = h.msg(B, { t: 'log', text: 'l' + i, kind: 'sys' }); assert.equal(sends(r, 'log').length, 1); }
  r = h.msg(B, { t: 'log', text: 'l5', kind: 'sys' });
  assert.equal(sends(r, 'log').length, 0);
  assert.equal(sends(r, 'err').length, 0);
});

test('U9 snapshot 필드 · 상태 문서가 JSON 왕복에 안전', () => {
  const h = playing([A, B]);
  h.sum(A, { w: 2, dw: 1, sp: 3, hid: 1 }, t0(h) + 100);
  const s = snapshot(h.state, h.live, h.now + 1);
  assert.deepEqual(Object.keys(s).sort(), ['code', 'game', 'hostId', 'kind', 'now', 'phase', 'players', 'reserveUntil', 't', 'ver'].sort());
  assert.deepEqual(Object.keys(s.players[0]).sort(), ['connected', 'deathWave', 'dw', 'host', 'hidden', 'kills', 'name', 'pid', 'rank', 'sp', 'status', 'wave'].sort());
  assert.deepEqual(Object.keys(s.game).sort(), ['seed', 't0', 'timing'].sort());
  assert.deepEqual([s.players[0].wave, s.players[0].dw, s.players[0].sp, s.players[0].hidden], [2, 1, 3, true]);
  assert.deepEqual([s.players[1].sp, s.players[1].hidden], [1, false]);
  assert.deepEqual(JSON.parse(JSON.stringify(h.state)), h.state);
});

// ==================== U10 빠른 매칭 예약 방 ====================
const reserve = (pids, until) => ({ players: pids.map((p) => ({ pid: p, key: KEY(p), name: p.slice(0, 4).toUpperCase() })), until });
function reserved(pids = [A, B], until = T0 + T.RESERVE_TTL, timing = T.timingFor('fast')) {
  return harness(T0, timing, { kind: 'quick', ver: '78', reserve: reserve(pids, until) });
}

test('U10 예약 방: lobby · 방장 없음 · 예약 좌석 idle/offline · 알람 = reserveUntil · 예약 밖 pid 는 full', () => {
  const h = reserved([A, B, C]);
  assert.equal(h.state.phase, 'lobby');
  assert.equal(h.state.kind, 'quick');
  assert.equal(h.state.hostId, null);
  assert.equal(h.state.ver, '78');
  assert.equal(h.state.reserveUntil, T0 + T.RESERVE_TTL);
  assert.deepEqual(Object.values(h.state.players).map((p) => [p.pid, p.status, p.reserved, p.name]), [[A, 'idle', true, 'AAAA'], [B, 'idle', true, 'BBBB'], [C, 'idle', true, 'CCCC']]);
  assert.equal(h.alarmAt, T0 + T.RESERVE_TTL);
  // 알람이 빨리 와도(아직 마감 전) 아무 일 없음
  let r = h.alarm(T0 + 1000);
  assert.equal(h.state.phase, 'lobby');
  assert.equal(closes(r).length, 0);
  // 예약 밖 → full
  r = h.hello('sD', D);
  assert.equal(errOf(r), 'full'); assert.equal(closes(r)[0].code, 4409);
  // 예약 pid 의 첫 hello: key 검사 · resumed false · 이름은 예약 이름 · 남에게 room
  r = h.hello('sA', A, { key: 'f'.repeat(32) });
  assert.equal(errOf(r), 'bad-key');
  r = h.hello('sA', A, { name: '다른이름' }, T0 + 2000);
  const w = sends(r, 'welcome')[0].m;
  assert.equal(w.resumed, false); assert.equal(w.kind, 'quick');
  assert.equal(w.room.hostId, null); assert.equal(w.room.reserveUntil, T0 + T.RESERVE_TTL);
  assert.deepEqual(w.room.players.map((p) => [p.pid, p.connected, p.host]), [[A, true, false], [B, false, false], [C, false, false]]);
  assert.equal(h.state.players[A].name, 'AAAA');
  assert.equal(h.state.players[A].reserved, undefined);
  assert.equal(r.persist, true);
  assert.equal(h.state.phase, 'lobby');
  // start 메시지는 무시(not-host)
  r = h.msg(A, { t: 'start' });
  assert.equal(errOf(r), 'not-host');
  // 예약 좌석은 LOBBY_GRACE 로 지워지지 않는다
  r = h.alarm(T0 + T.RESERVE_TTL - 1);
  assert.equal(Object.keys(h.state.players).length, 3);
  assert.equal(h.state.phase, 'lobby');
  // 재접속(같은 pid 새 소켓) → 옛 소켓 4001, resumed true
  r = h.hello('sA2', A, {}, T0 + 3000);
  assert.deepEqual(closes(r), [{ sid: 'sA', code: 4001, reason: 'replaced' }]);
  assert.equal(sends(r, 'welcome')[0].m.resumed, true);
});

test('U10 예약 전원 접속 즉시 자동 시작 (방장 없이) · 알람은 GAME_CAP', () => {
  const h = reserved([A, B]);
  h.step({ k: 'seed', value: 777 });
  h.hello('sA', A, {}, T0 + 1000);
  assert.equal(h.state.phase, 'lobby');
  const r = h.hello('sB', B, {}, T0 + 2000);
  assert.equal(h.state.phase, 'playing');
  const st = sends(r, 'start')[0].m;
  assert.deepEqual(st, { t: 'start', seed: 777, t0: T0 + 2000 + 2000, timing: { prep: 2000, bossLimit: 5000, clearWave: 12 }, now: T0 + 2000, at: T0 + 2000 });
  assert.equal(sends(r, 'welcome')[0].m.room.phase, 'lobby');     // welcome 은 시작 전 스냅샷, 이어서 start·room
  const room = sends(r, 'room').find((x) => x.m.phase === 'playing').m;
  assert.equal(room.reserveUntil, null);
  assert.deepEqual(room.players.map((p) => [p.pid, p.status, p.host]), [[A, 'alive', false], [B, 'alive', false]]);
  assert.equal(h.state.reserveUntil, null);
  assert.equal(logs(r, 'start')[0].kind, 'quick');
  assert.equal(h.alarmAt, T0 + 4000 + T.GAME_CAP);
  // 이후 규칙은 일반 방과 같다 (dead → all-dead)
  h.msg(A, { t: 'dead', w: 2, k: 0, r: 'lives' }, T0 + 9000);
  const r2 = h.msg(B, { t: 'dead', w: 3, k: 0, r: 'lives' }, T0 + 9500);
  assert.equal(sends(r2, 'end')[0].m.reason, 'all-dead');
  assert.equal(h.state.hostId, null);
});

test('U10 reserveUntil: 접속 2명 이상이면 미접속 좌석을 빼고 시작 · 1명 이하면 err expired + 4410 + destroy', () => {
  const h = reserved([A, B, C]);
  h.hello('sA', A, {}, T0 + 1000);
  h.hello('sB', B, {}, T0 + 2000);
  assert.equal(h.state.phase, 'lobby');
  // B 가 잠시 끊겼다 돌아와도 좌석 유지
  h.close('sB', T0 + 3000);
  assert.equal(Object.keys(h.state.players).length, 3);
  h.hello('sB2', B, {}, T0 + 4000);
  let r = h.alarm(T0 + T.RESERVE_TTL);
  assert.equal(h.state.phase, 'playing');
  assert.deepEqual(Object.keys(h.state.players).sort(), [A, B]);
  assert.equal(logs(r, 'reserve-drop')[0].pid, C);
  assert.equal(sends(r, 'start').length, 1);
  // 늦게 온 C 는 시작한 방 → started
  r = h.hello('sC', C, {}, T0 + T.RESERVE_TTL + 10);
  assert.equal(errOf(r), 'started');
  // 1명뿐 → 폐기
  const h2 = reserved([A, B]);
  h2.hello('sA', A, {}, T0 + 1000);
  h2.open('sP', 'join', T0 + T.RESERVE_TTL - 100);   // hello 전 소켓도 함께 닫는다
  r = h2.alarm(T0 + T.RESERVE_TTL);
  const err = sends(r, 'err')[0];
  assert.equal(err.sid, 'sA'); assert.equal(err.m.code, 'expired'); assert.equal(err.m.msg, '상대가 오지 않았습니다');
  assert.deepEqual(closes(r).map((c) => [c.sid, c.code]), [['sA', 4410], ['sP', 4410]]);
  assert.ok(r.effects.some((e) => e.destroy));
  assert.equal(r.state, null);
  // 아무도 안 옴 → 폐기
  const h3 = reserved([A, B]);
  r = h3.alarm(T0 + T.RESERVE_TTL);
  assert.ok(r.effects.some((e) => e.destroy));
  // 한 명이 leave 하고 남은 전원(2명)이 접속 중이면 즉시 시작
  const h4 = reserved([A, B, C]);
  h4.hello('sA', A, {}, T0 + 1000);
  h4.hello('sB', B, {}, T0 + 2000);
  h4.hello('sC', C, {}, T0 + 2500);
  assert.equal(h4.state.phase, 'playing');
  const h5 = reserved([A, B, C]);
  h5.hello('sA', A, {}, T0 + 1000);
  h5.hello('sC', C, {}, T0 + 1500);
  r = h5.msg(C, { t: 'leave' }, T0 + 2000);
  assert.equal(h5.state.phase, 'lobby');
  assert.deepEqual(Object.keys(h5.state.players).sort(), [A, B]);
  r = h5.hello('sB', B, {}, T0 + 3000);
  assert.equal(h5.state.phase, 'playing');
  // 잘못된 예약 항목은 버린다
  const st = createRoom({ code: 'ABC234', now: T0, kind: 'quick', ver: '1', timing: T.timingFor('fast'), reserve: { players: [{ pid: 'BAD', key: 'x', name: 'x' }, { pid: A, key: KEY(A), name: '' }], until: T0 + 100 } });
  assert.deepEqual(Object.keys(st.players), [A]);
  assert.equal(st.players[A].name, '플레이어-aaaa');
  assert.equal(createRoom({ code: 'ABC234', now: T0, kind: 'quick', reserve: { players: [] }, timing: T.timingFor('') }).phase, 'claimed');
});
