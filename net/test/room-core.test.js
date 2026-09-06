// U4~U9 — Room 순수 상태 머신. 시간은 전부 now 주입, 소켓·타이머 없음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, emptyLive, reduce, snapshot, ranking, nextAlarm, waveAt, liveFromSockets } from '../src/room-core.js';
import * as T from '../src/timing.js';

const KEY = (pid) => (pid + pid + pid + pid).replace(/[^0-9a-f]/g, 'a').slice(0, 32).padEnd(32, '0');
const SID = (pid) => 's' + pid[0].toUpperCase();   // aaaa1111 → 'sA'
const A = 'aaaa1111', B = 'bbbb2222', C = 'cccc3333', D = 'dddd4444', E = 'eeee5555';
const T0 = 1_700_000_000_000;

// ---- 작은 하네스: 상태를 들고 이벤트를 넣고 effects 를 분류한다 ----
function harness(now = T0, timing = T.timingFor('')) {
  const h = {
    now,
    state: createRoom({ code: 'ABC234', now, timing }),
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
      const m = { t: 'hello', v: opts.v == null ? 2 : opts.v, ver: opts.ver || '78', op, pid, key: opts.key || KEY(pid), name: opts.name || pid.slice(0, 4).toUpperCase() };
      return h.step({ k: 'hello', sid, op, m }, at);
    },
    msg(pid, m, at) { const sid = h.live.players[pid] && h.live.players[pid].sid; return h.step({ k: 'msg', pid, sid, m }, at); },
    close(sid, at) { return h.step({ k: 'close', sid }, at); },
    alarm(at) { return h.step({ k: 'alarm' }, at); },
    sum(pid, o = {}, at) { const now = at != null ? at : h.now; return h.msg(pid, { t: 'sum', w: waveAt(h.state, now), dw: 0, l: 20, g: 0, k: 0, f: 0, lag: 0, hid: 0, b: null, o: 'l', tw: [], ...o }, at); },
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
  assert.equal(w.m.resumed, false);
  assert.equal(w.m.at, T0);
  assert.equal(w.m.room.t, 'room');
  assert.equal(w.m.room.phase, 'lobby');
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
  const r2 = reduce({ state: null, live: emptyLive(T0) }, { k: 'hello', sid: 'x', op: 'join', m: { t: 'hello', v: 2, ver: '78', op: 'join', pid: A, key: KEY(A), name: 'A' } }, T0);
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

test('U4 ver 불일치 4426 · 프로토콜 v 불일치 4426 · key 불일치 4403 · playing 에 모르는 pid started 4409', () => {
  const h = lobby([A]);
  let r = h.hello('sB', B, { ver: '77' });
  assert.equal(errOf(r), 'version'); assert.equal(closes(r)[0].code, 4426);
  r = h.hello('sB2', B, { v: 1 });
  assert.equal(errOf(r), 'version'); assert.equal(closes(r)[0].code, 4426);
  r = h.hello('sA2', A, { key: 'f'.repeat(32) });
  assert.equal(errOf(r), 'bad-key'); assert.equal(closes(r)[0].code, 4403);
  // 경로 op 와 hello op 불일치
  h.open('sX', 'join');
  r = h.step({ k: 'hello', sid: 'sX', op: 'join', m: { t: 'hello', v: 2, ver: '78', op: 'create', pid: C, key: KEY(C), name: 'C' } });
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

// ==================== U5 시작 · 체인 ====================
test('U5 start: 접속 1명 not-ready · 방장 아님 not-host · 2명 OK → waveAts[1]=t0, sched 1..10', () => {
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
  const st = sends(r, 'start')[0].m;
  assert.equal(st.t0, at + 20000);
  assert.equal(st.seed, 0xdeadbeef);
  assert.deepEqual(st.timing, { prep: 20000, intermission: 6000, bossLimit: 320000, clearWave: 101 });
  assert.equal(st.now, at);
  const sc = sends(r, 'sched')[0].m;
  assert.equal(sc.from, 1);
  assert.equal(sc.ats.length, 10);
  assert.equal(sc.ats[0], at + 20000);
  const wa = g(h).waveAts;
  assert.equal(wa[0], null);
  assert.equal(wa.length, 11);
  for (let w = 1; w < 10; w++) assert.equal(wa[w + 1], wa[w] + T.spawnEnd(w) + 6000, `T_${w + 1}`);
  assert.deepEqual(sc.ats, wa.slice(1));
  assert.equal(g(h).endAt, null);
  const room = sends(r, 'room')[0].m;
  assert.equal(room.phase, 'playing');
  assert.deepEqual(room.players.map((p) => p.status), ['alive', 'alive']);
  assert.equal(room.game.wave, 0);
  assert.equal(room.game.seed, 0xdeadbeef);
  assert.deepEqual(room.game.waveAts, wa);
  assert.equal(h.alarmAt, wa[10]);
  assert.equal(waveAt(h.state, at + 20000 - 1), 0);
  assert.equal(waveAt(h.state, at + 20000), 1);
  assert.equal(waveAt(h.state, wa[3] + 5), 3);
});

test('U5 알람 2초 지연에도 waveAts 불변 · 같은 n 재방송 없음 · 시작 뒤 start 거절', () => {
  const h = playing();
  const wa = g(h).waveAts.slice();
  h.alarm(wa[5] + 2000);
  h.alarm(wa[10] + 2000);
  assert.deepEqual(g(h).waveAts.slice(0, 11), wa);
  const allSched = h.trace.flatMap((t) => t.effects).filter((e) => e.send && e.send.m.t === 'sched');
  assert.equal(allSched.length, 1);
  assert.equal(g(h).hold.w, 10);
  assert.equal(g(h).hold.deadline, wa[10] + T.spawnEnd(10) + 320000 + 2000);
  const r = h.msg(A, { t: 'start' });
  assert.equal(errOf(r), 'not-ready');
});

// ==================== U6 보스 홀드 ====================
test('U6 T10 → hold{waiting:[A,B]} · A done → [B] · B done → T11=now+6000, sched 11..20', () => {
  const h = playing();
  const wa = g(h).waveAts;
  h.sum(A, {}, wa[10] - 1000); h.sum(B, {}, wa[10] - 1000);
  let r = h.alarm(wa[10]);
  assert.equal(r.persist, true);
  let hold = sends(r, 'hold')[0].m;
  assert.deepEqual([hold.w, hold.waiting, hold.done, hold.released], [10, [A, B], [], false]);
  assert.equal(hold.deadline, wa[10] + 1050 + 320000 + 2000);
  assert.equal(h.alarmAt, wa[10] + T.HOLD_RECHECK);
  // 재검사 알람: 변화 없으면 hold 재방송 없음
  r = h.alarm(wa[10] + T.HOLD_RECHECK);
  assert.equal(sends(r, 'hold').length, 0);
  assert.equal(h.alarmAt, wa[10] + 2 * T.HOLD_RECHECK);
  // A 보스 처치 (신선도 유지)
  h.sum(A, {}, wa[10] + 30000); h.sum(B, {}, wa[10] + 30000);
  r = h.msg(A, { t: 'done', w: 10 }, wa[10] + 31000);
  assert.equal(r.persist, true);
  hold = sends(r, 'hold')[0].m;
  assert.deepEqual([hold.waiting, hold.done, hold.released], [[B], [A], false]);
  assert.deepEqual(h.state.players[A].bossDone, [10]);
  // 멱등: 같은 done 다시 → persist false, hold 재방송 없음
  r = h.msg(A, { t: 'done', w: 10 }, wa[10] + 32000);
  assert.equal(r.persist, false);
  assert.equal(sends(r, 'hold').length, 0);
  // B 처치 → 해제
  const rel = wa[10] + 60000;
  h.sum(B, {}, rel - 500); h.sum(A, {}, rel - 500);   // B 가 먼저 신선해져야 한다 — B 가 stale 이면 A 의 bossDone 만으로 풀린다(W2)
  r = h.msg(B, { t: 'done', w: 10 }, rel);
  assert.equal(r.persist, true);
  hold = sends(r, 'hold')[0].m;
  assert.deepEqual([hold.waiting, hold.done, hold.released], [[], [A, B], true]);
  const sc = sends(r, 'sched')[0].m;
  assert.equal(sc.from, 11);
  assert.equal(sc.ats.length, 10);
  assert.equal(sc.ats[0], rel + 6000);
  assert.equal(g(h).waveAts[11], rel + 6000);
  assert.equal(g(h).waveAts[20], g(h).waveAts[19] + T.spawnEnd(19) + 6000);
  assert.equal(g(h).waveAts.length, 21);
  assert.equal(h.alarmAt, g(h).waveAts[20]);
  assert.equal(logs(r, 'hold.release')[0].by, 'done');
});

test('U6 이른 done 수락+anomaly · 미래 웨이브 done 폐기 · 늦은 done 기록', () => {
  const h = playing();
  const wa = g(h).waveAts;
  // 웨이브 10 시작 직후 (보스 스폰 1.05초 전)
  h.sum(A, {}, wa[10] - 100); h.sum(B, {}, wa[10] - 100);
  let r = h.msg(A, { t: 'done', w: 10 }, wa[10] + 20);
  assert.deepEqual(h.state.players[A].bossDone, [10]);
  assert.equal(logs(r, 'anomaly')[0].kind, 'done-early');
  // 아직 시작 안 한 웨이브
  r = h.msg(B, { t: 'done', w: 11 }, wa[10] + 30);
  assert.equal(logs(r, 'anomaly')[0].kind, 'done-future');
  assert.equal(h.state.players[B].wave, 9);          // 마지막 sum 이 9 였고, 미래 done 은 wave 도 올리지 않는다
  // 늦은 done (w < waveAt): 기록만
  r = h.msg(B, { t: 'done', w: 3 }, wa[10] + 40);
  assert.equal(logs(r, 'anomaly').length, 0);
  assert.equal(h.state.players[B].wave, 9);
});

test('U6 B hidden 8초 → waiting [A] · 둘 다 hidden ∧ done 없음 → deadline 까지 해제 안 됨 · deadline → 해제, 아무도 dead 아님', () => {
  const h = playing();
  const wa = g(h).waveAts;
  h.sum(A, {}, wa[10] - 100); h.sum(B, { hid: 1 }, wa[10] - 100);
  let r = h.alarm(wa[10]);
  let hold = sends(r, 'hold')[0].m;
  assert.deepEqual(hold.waiting, [A]);
  // A 도 조용해진다(8초 무응답) → 재검사 알람에 waiting [] 인데 done 없음 → 해제 안 됨
  r = h.alarm(wa[10] + 8000);
  hold = sends(r, 'hold')[0].m;
  assert.deepEqual([hold.waiting, hold.released], [[], false]);
  assert.equal(g(h).hold.released, false);
  // lag 31초도 stale
  h.sum(A, { lag: 31 }, wa[10] + 9000);
  assert.deepEqual(snapshot(h.state, h.live, h.now).game.hold.waiting, []);
  h.sum(A, { lag: 29 }, wa[10] + 9500);
  assert.deepEqual(snapshot(h.state, h.live, h.now).game.hold.waiting, [A]);
  // 마감까지 아무 보고 없음 → 해제, 아무도 죽지 않는다
  const dl = g(h).hold.deadline;
  assert.equal(h.alarmAt <= dl, true);
  r = h.alarm(dl);
  hold = sends(r, 'hold')[0].m;
  assert.equal(hold.released, true);
  assert.equal(logs(r, 'hold.release')[0].by, 'deadline');
  assert.deepEqual(Object.values(h.state.players).map((p) => p.status), ['alive', 'alive']);
  assert.equal(g(h).waveAts[11], dl + 6000);
  // 보스 산술: 강제 다음 웨이브는 로컬 사망(321.05s)보다 항상 뒤
  assert.ok(g(h).waveAts[11] - wa[10] >= 321050 + 6000);
  assert.equal(g(h).waveAts[11] - wa[10], T.spawnEnd(10) + 320000 + 2000 + 6000);
});

test('U6 sum.dw=10 만으로 bossDone 도출 → 해제', () => {
  const h = playing();
  const wa = g(h).waveAts;
  h.sum(A, {}, wa[10] - 100); h.sum(B, {}, wa[10] - 100);
  h.alarm(wa[10]);
  h.sum(B, {}, wa[10] + 39000);       // B 신선
  let r = h.sum(A, { dw: 10 }, wa[10] + 40000);
  assert.equal(r.persist, true);
  assert.deepEqual(h.state.players[A].bossDone, [10]);
  assert.deepEqual(sends(r, 'hold')[0].m.waiting, [B]);
  r = h.sum(B, { dw: 10 }, wa[10] + 45000);
  assert.equal(g(h).hold.released, true);
  assert.equal(sends(r, 'sched')[0].m.from, 11);
  // dw 는 waveAt(now+1s) 로 클램프: 미래 보스는 도출되지 않는다
  r = h.sum(A, { dw: 20, w: 20 }, wa[10] + 46000);      // T11 = 45000+6000 이라 아직 10
  assert.deepEqual(h.state.players[A].bossDone, [10]);
  assert.equal(h.state.players[A].wave, 10);
  r = h.sum(A, { dw: 20, w: 20 }, wa[10] + 52000);
  assert.equal(h.state.players[A].wave, 11);
  assert.deepEqual(h.state.players[A].bossDone, [10]);
});

test('U6 죽은 사람은 waiting 에서 빠지고, 죽은 사람의 bossDone 만으로는 해제되지 않는다', () => {
  const h = playing([A, B, C]);
  const wa = g(h).waveAts;
  for (const p of [A, B, C]) h.sum(p, {}, wa[10] - 100);
  h.alarm(wa[10]);
  h.msg(A, { t: 'done', w: 10 }, wa[10] + 1000);
  let r = h.msg(A, { t: 'dead', w: 10, k: 50, r: 'lives' }, wa[10] + 2000);
  assert.equal(h.state.players[A].status, 'dead');
  assert.equal(h.state.players[A].deathWave, 9);
  // B·C 가 hidden → waiting 비었지만 살아있는 bossDone 없음 → 홀드 유지
  h.sum(B, { hid: 1 }, wa[10] + 3000); h.sum(C, { hid: 1 }, wa[10] + 3000);
  assert.equal(g(h).hold.released, false);
  assert.deepEqual(snapshot(h.state, h.live, h.now).game.hold.waiting, []);
  h.sum(B, { hid: 0, dw: 10 }, wa[10] + 4000);
  assert.equal(g(h).hold.released, true);
});

// ==================== U7 종료 · 순위 ====================
test('U7 ranking: cleared(공동 1위) > lost > dead > left, deathWave desc → deathAt desc → kills desc', () => {
  const st = createRoom({ code: 'ABC234', now: T0, timing: T.timingFor('') });
  const mk = (pid, o) => ({ pid, name: pid, key: 'k', joinedAt: T0, status: 'alive', wave: 0, deathWave: null, deathAt: null, kills: 0, bossDone: [], clearAt: null, rank: null, ...o });
  st.players = {
    p1: mk('p1', { status: 'dead', deathWave: 40, deathAt: T0 + 5, kills: 100 }),
    p2: mk('p2', { status: 'cleared', wave: 101, deathWave: 101, deathAt: T0 + 9, kills: 10 }),
    p3: mk('p3', { status: 'left', deathWave: 60, deathAt: T0 + 3, kills: 900 }),
    p4: mk('p4', { status: 'cleared', wave: 101, deathWave: 101, deathAt: T0 + 8, kills: 999 }),
    p5: mk('p5', { status: 'dead', deathWave: 40, deathAt: T0 + 7, kills: 50 }),
    p6: mk('p6', { status: 'lost', wave: 101, deathWave: 101, deathAt: T0 + 1, kills: 1 }),
    p7: mk('p7', { status: 'dead', deathWave: 40, deathAt: T0 + 7, kills: 60 }),
  };
  const rk = ranking(st);
  assert.deepEqual(rk.map((r) => [r.pid, r.rank, r.wave]), [['p2', 1, 101], ['p4', 1, 101], ['p6', 3, 101], ['p7', 4, 40], ['p5', 5, 40], ['p1', 6, 40], ['p3', 7, 60]]);
  assert.deepEqual(Object.keys(rk[0]).sort(), ['kills', 'name', 'pid', 'rank', 'status', 'wave']);
});

test('U7 clear 는 bossDone 10개 없으면 폐기 · 조건 충족 시 cleared · 전원 결과 → end cleared', () => {
  const h = playing();
  // 101 까지 시각을 강제로 확정한다 (홀드 전부 즉시 해제 흉내: 보스마다 done)
  let now = h.now;
  for (let b = 10; b <= 100; b += 10) {
    const wa = g(h).waveAts;
    now = wa[b];
    h.sum(A, {}, now - 100); h.sum(B, {}, now - 100);
    h.alarm(now);
    h.msg(A, { t: 'done', w: b }, now + 2000);
    if (b < 100) h.msg(B, { t: 'done', w: b }, now + 2000);   // 100 은 B 가 못 잡는다
    else h.msg(B, { t: 'dead', w: 100, k: 7, r: 'bossTimeout' }, now + 2000);
  }
  assert.equal(g(h).waveAts.length, 102);
  assert.ok(g(h).endAt > g(h).waveAts[101]);
  assert.equal(g(h).endAt, g(h).waveAts[101] + T.spawnEnd(101));
  // 이른 clear (101 전) → 폐기
  let r = h.msg(A, { t: 'clear', w: 101, k: 3 }, g(h).waveAts[101] - 5000);
  assert.equal(h.state.players[A].status, 'alive');
  assert.equal(logs(r, 'anomaly')[0].kind, 'clear-early');
  // bossDone 부족 → 폐기
  const saved = h.state.players[A].bossDone.slice();
  h.state.players[A].bossDone = saved.slice(0, 9);
  r = h.msg(A, { t: 'clear', w: 101, k: 3 }, g(h).endAt);
  assert.equal(h.state.players[A].status, 'alive');
  assert.equal(logs(r, 'anomaly')[0].kind, 'clear-boss');
  h.state.players[A].bossDone = saved;
  r = h.msg(A, { t: 'clear', w: 101, k: 3 }, g(h).endAt + 10);
  assert.equal(h.state.players[A].status, 'cleared');
  assert.equal(sends(r, 'player')[0].m.status, 'cleared');
  const end = sends(r, 'end')[0].m;
  assert.equal(end.reason, 'cleared');
  assert.equal(end.seed, 424242);
  assert.deepEqual(end.ranking.map((x) => [x.pid, x.rank, x.status, x.wave]), [[A, 1, 'cleared', 101], [B, 2, 'dead', 99]]);
  assert.equal(h.state.phase, 'ended');
  assert.equal(h.state.expireAt, h.now + T.END_TTL);
  assert.equal(h.alarmAt, h.now + T.END_TTL);
  assert.equal(r.persist, true);
  // 끝난 뒤 sum/done 무시, 재접속은 welcome + end 재전송, 모르는 pid 는 expired
  r = h.msg(A, { t: 'done', w: 101 });
  assert.equal(r.persist, false);
  r = h.hello('sA-again', A);
  assert.equal(sends(r, 'welcome')[0].m.room.phase, 'ended');
  assert.equal(sends(r, 'end')[0].m.reason, 'cleared');
  r = h.hello('sC', C);
  assert.equal(errOf(r), 'expired'); assert.equal(closes(r)[0].code, 4410);
  // END_TTL → 전원 4410 + destroy
  r = h.alarm(h.state.expireAt);
  assert.ok(closes(r).every((c) => c.code === 4410));
  assert.ok(r.effects.some((e) => e.destroy));
});

test('U7 endAt+END_GRACE 미보고 → lost → end timeout', () => {
  const h = playing([A, B], T0, T.timingFor('fast'));
  const wa = g(h).waveAts;
  h.sum(A, {}, wa[10] - 100); h.sum(B, {}, wa[10] - 100);
  h.alarm(wa[10]);
  h.msg(A, { t: 'done', w: 10 }, wa[10] + 1500);
  h.msg(B, { t: 'done', w: 10 }, wa[10] + 1500);
  assert.equal(g(h).waveAts.length, 13);
  assert.equal(g(h).endAt, g(h).waveAts[12] + T.spawnEnd(12));
  h.msg(A, { t: 'clear', w: 12, k: 1 }, g(h).endAt + 100);
  assert.equal(h.state.phase, 'playing');
  assert.equal(h.alarmAt, g(h).endAt + 5000);
  const r = h.alarm(g(h).endAt + 5000);
  assert.equal(h.state.players[B].status, 'lost');
  assert.equal(sends(r, 'player')[0].m.status, 'lost');
  const end = sends(r, 'end')[0].m;
  assert.equal(end.reason, 'timeout');
  assert.deepEqual(end.ranking.map((x) => [x.pid, x.rank, x.status]), [[A, 1, 'cleared'], [B, 2, 'lost']]);
});

test('U7 alive 0 → all-dead · dead 는 deathWave = w-1 · 죽은 뒤 done/clear/sum 무시', () => {
  const h = playing();
  const wa = g(h).waveAts;
  let r = h.msg(A, { t: 'dead', w: 5, k: 30, r: 'lives' }, wa[5] + 100);
  assert.deepEqual(sends(r, 'player')[0].m, { t: 'player', pid: A, status: 'dead', wave: 5, deathWave: 4, kills: 30, at: h.now });
  assert.equal(r.persist, true);
  assert.equal(h.state.phase, 'playing');
  r = h.msg(A, { t: 'done', w: 5 });
  assert.equal(r.persist, false);
  r = h.sum(A, { k: 999 });
  assert.equal(h.state.players[A].kills, 30);
  assert.equal(sends(r, 'sum').length, 0);
  r = h.msg(B, { t: 'dead', w: 7, k: 10, r: 'quit' }, wa[7] + 100);
  assert.equal(sends(r, 'end')[0].m.reason, 'all-dead');
  assert.deepEqual(sends(r, 'end')[0].m.ranking.map((x) => [x.pid, x.rank]), [[B, 1], [A, 2]]);
  // dead.w 는 waveAt(now+1s) 로 클램프
  const h2 = playing();
  h2.msg(A, { t: 'dead', w: 101, k: 0, r: 'afk' }, g(h2).waveAts[3] + 10);
  assert.equal(h2.state.players[A].deathWave, 2);
});

test('U7 전원 끊김 3분 → empty · GAME_CAP → timeout', () => {
  const h = playing();
  const wa = g(h).waveAts;
  let r = h.close('sA', wa[2]);
  assert.deepEqual(sends(r, 'player')[0].m, { t: 'player', pid: A, connected: false, at: wa[2] });
  assert.equal(r.persist, false);
  assert.equal(h.live.emptySince, null);
  h.close('sB', wa[2] + 1000);
  assert.equal(h.live.emptySince, wa[2] + 1000);
  assert.equal(h.alarmAt, Math.min(wa[10], wa[2] + T.RECONNECT_GRACE, wa[2] + 1000 + T.EMPTY_END));
  h.alarm(wa[10]);                             // 보스 홀드는 서고
  assert.equal(h.state.phase, 'playing');
  r = h.alarm(wa[2] + 1000 + T.EMPTY_END);     // 3분 → empty
  assert.equal(sends(r, 'end')[0].m.reason, 'empty');
  assert.deepEqual(Object.values(h.state.players).map((p) => p.status), ['left', 'left']);
  // GAME_CAP
  const h2 = playing();
  const cap = g(h2).t0 + T.GAME_CAP;
  h2.sum(A, {}, cap - 1000); h2.sum(B, {}, cap - 1000);
  r = h2.alarm(cap);
  assert.equal(sends(r, 'end')[0].m.reason, 'timeout');
  assert.deepEqual(Object.values(h2.state.players).map((p) => p.status), ['lost', 'lost']);
});

// ==================== U8 재접속 · 유예 ====================
test('U8 playing 중 close → 180s → left(alive 만) · 유예 안 hello → 상태 불변 · status 확정 후 done/clear 무시', () => {
  const h = playing([A, B, C]);
  const wa = g(h).waveAts;
  h.msg(C, { t: 'dead', w: 3, k: 1, r: 'lives' }, wa[3] + 10);
  h.close('sC', wa[3] + 20);                    // 죽은 사람 끊김 → 유예 대상 아님
  h.close('sB', wa[3] + 100);
  assert.equal(h.alarmAt, Math.min(wa[10], wa[3] + 100 + T.RECONNECT_GRACE));
  // 유예 안 재접속
  let r = h.hello('sB2', B, {}, wa[3] + 50000);
  assert.equal(sends(r, 'welcome')[0].m.resumed, true);
  assert.deepEqual(sends(r, 'welcome')[0].m.room.game.waveAts, g(h).waveAts);
  assert.equal(sends(r, 'player')[0].m.connected, true);
  assert.equal(h.state.players[B].status, 'alive');
  assert.equal(r.persist, false);
  assert.equal(h.alarmAt, wa[10]);
  // 다시 끊기고 유예 만료
  h.close('sB2', wa[4]);
  r = h.alarm(wa[4] + T.RECONNECT_GRACE);
  assert.equal(h.state.players[B].status, 'left');
  assert.equal(h.state.players[B].deathWave, h.state.players[B].wave);
  assert.deepEqual(sends(r, 'player')[0].m, { t: 'player', pid: B, status: 'left', wave: h.state.players[B].wave, deathWave: h.state.players[B].deathWave, at: h.now });
  assert.equal(r.persist, true);
  assert.equal(h.state.players[C].status, 'dead');
  // left 뒤 재접속: 관전은 되지만 done/clear/dead 는 무시
  r = h.hello('sB3', B, {}, wa[4] + T.RECONNECT_GRACE + 1000);
  assert.equal(sends(r, 'welcome')[0].m.resumed, true);
  r = h.msg(B, { t: 'done', w: 4 });
  assert.equal(r.persist, false);
  assert.equal(h.state.players[B].status, 'left');
  r = h.msg(B, { t: 'dead', w: 4, k: 0, r: 'lives' });
  assert.equal(h.state.players[B].status, 'left');
  // 방장 A 가 playing 중 leave → left, 방장 위임 → room 방송
  r = h.msg(A, { t: 'leave' }, h.now + 1000);
  assert.equal(h.state.players[A].status, 'left');
  assert.deepEqual(closes(r), [{ sid: 'sA', code: 4000, reason: 'leave' }]);
  assert.equal(h.state.hostId, C);                    // B 는 left 라 제외, 죽었어도 C 가 방장
  assert.equal(sends(r, 'end')[0].m.reason, 'all-dead');   // alive 0 (C dead)
});

test('U8 하이버네이션 복귀: attachment 로 live 재구성 (lastBeat=now, lag=0)', () => {
  const h = playing([A, B]);
  const wa = g(h).waveAts;
  h.sum(A, { lag: 20, hid: 1 }, wa[2]);
  const st = JSON.parse(JSON.stringify(h.state));
  const live = liveFromSockets(st, [{ sid: 'nA', pid: A, op: 'join' }, { sid: 'pending1', op: 'join' }], wa[3]);
  assert.equal(live.players[A].connected, true);
  assert.equal(live.players[A].lastBeat, wa[3]);
  assert.equal(live.players[A].lag, 0);
  assert.equal(live.players[A].hidden, false);
  assert.equal(live.players[B].connected, false);
  assert.equal(live.players[B].disconnectedAt, wa[3]);
  assert.deepEqual(live.pending.pending1, { openedAt: wa[3], op: 'join' });
  assert.equal(live.emptySince, null);
  assert.equal(nextAlarm(st, live, wa[3]), wa[3] + T.HELLO_TIMEOUT);
  const r = reduce({ state: st, live }, { k: 'alarm' }, wa[10]);
  assert.equal(r.state.game.hold.w, 10);
  assert.equal(r.live.holdCheckAt, wa[10] + T.HOLD_RECHECK);
});

// ==================== U9 불변식 · 중계 · 잡다 ====================
test('U9 persist 집합: sum/chat/log/time/close 는 false, 전이는 true · alarm ≥ now', () => {
  const h = playing([A, B]);
  const wa = g(h).waveAts;
  const r1 = h.sum(A, {}, wa[1] + 10);
  const r2 = h.msg(A, { t: 'chat', text: 'hi' });
  const r3 = h.msg(A, { t: 'log', text: 'x', kind: 'up' });
  const r4 = h.msg(A, { t: 'time', c: 5 });
  assert.deepEqual([r1.persist, r2.persist, r3.persist, r4.persist], [false, false, false, false]);
  assert.deepEqual(sends(r2, 'chat').map((s) => [s.to, s.except, s.m.name, s.m.text]), [['*', undefined, 'AAAA', 'hi']]);
  assert.deepEqual(sends(r3, 'log').map((s) => [s.to, s.except, s.m.kind]), [['*', A, 'up']]);
  assert.deepEqual(sends(r4, 'time')[0].m, { t: 'time', c: 5, s: h.now, at: h.now });
  const persisted = h.trace.filter((t) => t.persist).map((t) => t.ev);
  assert.deepEqual(persisted, ['hello:hello', 'hello:hello', 'msg:start']);
  for (const t of h.trace) assert.ok(t.alarm == null || t.alarm >= t.now, `${t.ev}: alarm ${t.alarm} < now ${t.now}`);
});

test('U9 sum 중계: 1.5초 간격 · w 클램프 · 본인 제외 · 원문 그대로', () => {
  const h = playing([A, B, C]);
  const wa = g(h).waveAts;
  let r = h.sum(A, { w: 50, dw: 50, tw: [[0, 6, 2]], b: 0.5 }, wa[2] + 10);
  const s = sends(r, 'sum');
  assert.equal(s.length, 1);
  assert.equal(s[0].to, '*'); assert.equal(s[0].except, A);
  assert.deepEqual(s[0].m, { t: 'sum', pid: A, w: 2, dw: 2, l: 20, g: 0, k: 0, f: 0, lag: 0, hid: 0, b: 0.5, o: 'l', tw: [[0, 6, 2]], at: wa[2] + 10 });
  r = h.sum(A, {}, wa[2] + 1000);
  assert.equal(sends(r, 'sum').length, 0);
  r = h.sum(A, {}, wa[2] + 1510);
  assert.equal(sends(r, 'sum').length, 1);
  assert.equal(h.state.players[A].wave, 2);
  // 시각 오차 1초 여유: T3 − 500 에 w=3 은 허용
  r = h.sum(A, { w: 3 }, wa[3] - 500);
  assert.equal(h.state.players[A].wave, 3);
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
  const wa = g(h).waveAts;
  h.sum(A, { lag: 3, hid: 1 }, wa[2]);
  const s = snapshot(h.state, h.live, wa[2] + 1);
  assert.deepEqual(Object.keys(s).sort(), ['code', 'game', 'hostId', 'now', 'phase', 'players', 't', 'ver'].sort());
  assert.deepEqual(Object.keys(s.players[0]).sort(), ['connected', 'deathWave', 'host', 'hidden', 'kills', 'lag', 'name', 'pid', 'rank', 'status', 'wave'].sort());
  assert.deepEqual(Object.keys(s.game).sort(), ['endAt', 'hold', 'seed', 't0', 'timing', 'wave', 'waveAts'].sort());
  assert.equal(s.players[0].lag, 3); assert.equal(s.players[0].hidden, true);
  assert.equal(s.game.wave, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(h.state)), h.state);
});
