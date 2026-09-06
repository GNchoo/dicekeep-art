// U11 — 빠른 매칭 대기열 순수 상태 머신. 시간은 now 주입, 소켓·타이머 없음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, lobbyFromSockets, reduce, group, takeQuota, nextAlarm } from '../src/lobby-core.js';
import * as T from '../src/timing.js';

const T0 = 1_700_000_000_000;
const KEY = (pid) => (pid + pid + pid + pid).replace(/[^0-9a-f]/g, 'a').slice(0, 32).padEnd(32, '0');
const P = (i) => 'p' + String(i).padStart(7, '0');   // p0000001 …

function harness(now = T0) {
  const h = {
    now, state: createLobby(), trace: [],
    step(ev, at) {
      if (at != null) h.now = at;
      const r = reduce(h.state, ev, h.now);
      h.trace.push({ ev: ev.k, now: h.now, effects: r.effects });
      JSON.stringify(h.state);
      return r;
    },
    hello(sid, pid, o = {}, at) {
      if (!o.noOpen) h.step({ k: 'open', sid }, at);
      const m = { t: 'hello', v: o.v == null ? 3 : o.v, ver: o.ver || '78', op: o.op || 'quick', pid, key: KEY(pid), name: o.name || pid };
      return h.step({ k: 'hello', sid, m }, at);
    },
    close(sid, at) { return h.step({ k: 'close', sid }, at); },
    alarm(at) { return h.step({ k: 'alarm' }, at); },
    get alarmAt() { return nextAlarm(h.state, h.now); },
  };
  return h;
}
const sends = (r, t) => r.effects.filter((e) => e.send && e.send.m.t === t).map((e) => e.send);
const closes = (r) => r.effects.filter((e) => e.close).map((e) => e.close);
const matches = (r) => r.effects.filter((e) => e.match).map((e) => e.match);
const alarmOf = (r) => r.effects.find((e) => 'alarm' in e).alarm;
const errOf = (r) => { const s = sends(r, 'err'); return s.length ? s[0].m.code : null; };

test('U11 hello → queued{n:1, eta:null} · 2명째 → 둘에게 queued{n:2, eta:10초} · 알람은 오래 기다린 사람 + 10s', () => {
  const h = harness();
  let r = h.hello('s1', P(1));
  assert.deepEqual(sends(r, 'queued').map((s) => [s.sid, s.m.n, s.m.eta]), [['s1', 1, null]]);
  assert.equal(alarmOf(r), T0 + T.QUICK_BEAT);
  assert.equal(matches(r).length, 0);
  r = h.hello('s2', P(2), {}, T0 + 3000);
  assert.deepEqual(sends(r, 'queued').map((s) => [s.sid, s.m.n, s.m.eta]), [['s1', 2, 7000], ['s2', 2, 7000]]);
  assert.equal(alarmOf(r), T0 + 3000 + T.QUICK_BEAT);          // 5초 재방송이 10초 마감보다 먼저
  assert.equal(nextAlarm(h.state, T0 + 9000), T0 + T.QUICK_WAIT);
  // 5초 알람: 재방송, 아직 안 묶임
  r = h.alarm(T0 + 5000);
  assert.deepEqual(sends(r, 'queued').map((s) => [s.sid, s.m.n, s.m.eta]), [['s1', 2, 5000], ['s2', 2, 5000]]);
  assert.equal(matches(r).length, 0);
  // 10초 → 묶임 (알람이 1초 늦어도)
  r = h.alarm(T0 + T.QUICK_WAIT + 1000);
  const m = matches(r);
  assert.equal(m.length, 1);
  assert.equal(m[0].ver, '78');
  assert.deepEqual(m[0].players.map((p) => [p.pid, p.sid, p.name]), [[P(1), 's1', P(1)], [P(2), 's2', P(2)]]);
  assert.equal(m[0].players[0].key, KEY(P(1)));
  assert.equal(h.state.queue.length, 0);
  assert.equal(sends(r, 'queued').length, 0);
  assert.equal(alarmOf(r), null);
  // 묶인 뒤 소켓 닫힘은 조용히 무시
  r = h.close('s1');
  assert.equal(r.effects.length, 1);
});

test('U11 4명이면 즉시 · 5명째는 남아서 기다린다 · 8명이면 두 방', () => {
  const h = harness();
  for (let i = 1; i <= 3; i++) h.hello('s' + i, P(i), {}, T0 + i);
  assert.equal(h.state.queue.length, 3);
  let r = h.hello('s4', P(4), {}, T0 + 4);
  let m = matches(r);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].players.map((p) => p.pid), [P(1), P(2), P(3), P(4)]);
  assert.equal(h.state.queue.length, 0);
  for (let i = 5; i <= 9; i++) r = h.hello('s' + i, P(i), {}, T0 + i);
  assert.equal(h.trace.flatMap((t) => matches({ effects: t.effects })).length, 2);
  assert.deepEqual(h.state.queue.map((e) => e.pid), [P(9)]);
  assert.deepEqual(sends(r, 'queued').map((s) => [s.sid, s.m.n, s.m.eta]), [['s9', 1, null]]);
  // group(): 8명 대기면 4·4
  const q = Array.from({ length: 8 }, (_, i) => ({ pid: P(i), key: 'k', name: 'n', ver: '1', since: T0 + i, sid: 's' + i }));
  assert.deepEqual(group(q, T0).map((g) => g.length), [4, 4]);
  // 6명 · 오래 기다림 → 4 + 2
  assert.deepEqual(group(q.slice(0, 6), T0 + T.QUICK_WAIT + 10).map((g) => g.length), [4, 2]);
  assert.deepEqual(group(q.slice(0, 6), T0 + 100).map((g) => g.length), [4]);
  assert.deepEqual(group(q.slice(0, 1), T0 + T.QUICK_WAIT * 5), []);
});

test('U11 ver 가 다르면 따로: n·eta 도 따로, 묶임도 따로', () => {
  const h = harness();
  h.hello('a1', P(1), { ver: '78' }, T0);
  let r = h.hello('b1', P(2), { ver: '79' }, T0 + 100);
  assert.deepEqual(sends(r, 'queued').map((s) => [s.sid, s.m.n, s.m.eta]), [['b1', 1, null]]);   // 78 쪽은 안 바뀜
  assert.equal(alarmOf(r), T0 + 100 + T.QUICK_BEAT);
  r = h.hello('a2', P(3), { ver: '78' }, T0 + 200);
  assert.deepEqual(sends(r, 'queued').map((s) => [s.sid, s.m.n, s.m.eta]), [['a1', 2, T.QUICK_WAIT - 200], ['a2', 2, T.QUICK_WAIT - 200]]);
  r = h.alarm(T0 + T.QUICK_WAIT);
  const m = matches(r);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].players.map((p) => p.pid), [P(1), P(3)]);
  assert.deepEqual(h.state.queue.map((e) => e.pid), [P(2)]);
  assert.deepEqual(sends(r, 'queued').map((s) => [s.sid, s.m.n, s.m.eta]), [['b1', 1, null]]);
  // 알람: 모든 ver 에 재방송
  r = h.alarm(T0 + T.QUICK_WAIT + 5000);
  assert.deepEqual(sends(r, 'queued').map((s) => s.sid), ['b1']);
});

test('U11 취소: 소켓 닫힘 = 대기열 제거 → 남은 사람 queued 갱신 · 같은 pid 재접속은 좌석 교체(옛 소켓 4001, since 유지)', () => {
  const h = harness();
  h.hello('s1', P(1), {}, T0);
  h.hello('s2', P(2), {}, T0 + 1000);
  let r = h.close('s1', T0 + 2000);
  assert.deepEqual(sends(r, 'queued').map((s) => [s.sid, s.m.n, s.m.eta]), [['s2', 1, null]]);
  assert.deepEqual(h.state.queue.map((e) => e.pid), [P(2)]);
  assert.equal(alarmOf(r), T0 + 2000 + T.QUICK_BEAT);
  // 같은 pid 새 소켓
  r = h.hello('s2b', P(2), {}, T0 + 3000);
  assert.deepEqual(closes(r), [{ sid: 's2', code: 4001, reason: 'replaced' }]);
  assert.deepEqual(h.state.queue.map((e) => [e.pid, e.sid, e.since]), [[P(2), 's2b', T0 + 1000]]);
  assert.deepEqual(sends(r, 'queued').map((s) => s.sid), ['s2b']);
  // 옛 소켓의 close 는 무시
  r = h.close('s2', T0 + 3100);
  assert.equal(h.state.queue.length, 1);
  assert.equal(sends(r, 'queued').length, 0);
  // since 가 유지되므로 P(3) 이 오면 eta 는 P(2) 기준
  r = h.hello('s3', P(3), {}, T0 + 4000);
  assert.deepEqual(sends(r, 'queued').map((s) => [s.sid, s.m.eta]), [['s2b', T.QUICK_WAIT - 3000], ['s3', T.QUICK_WAIT - 3000]]);
  // 전원 취소 → 알람 없음
  h.close('s2b'); r = h.close('s3');
  assert.equal(alarmOf(r), null);
  assert.equal(h.state.queue.length, 0);
});

test('U11 거절: v2 → version 4426 · op join → bad-request 4400 · hello 없이 5초 → 4400 · 대기열 200 초과 → rate 4429', () => {
  const h = harness();
  let r = h.hello('x1', P(1), { v: 2 });
  assert.equal(errOf(r), 'version'); assert.equal(closes(r)[0].code, 4426);
  r = h.hello('x2', P(2), { op: 'join' });
  assert.equal(errOf(r), 'bad-request'); assert.equal(closes(r)[0].code, 4400);
  assert.equal(h.state.queue.length, 0);
  h.step({ k: 'open', sid: 'mute' }, T0 + 100);
  assert.equal(h.alarmAt, T0 + 100 + T.HELLO_TIMEOUT);
  r = h.alarm(T0 + 100 + T.HELLO_TIMEOUT);
  assert.deepEqual(closes(r), [{ sid: 'mute', code: 4400, reason: 'bad-request' }]);
  assert.equal(alarmOf(r), null);
  // 200명: 서로 다른 ver 로 채워 묶이지 않게 한다
  for (let i = 0; i < T.QUICK_QUEUE_MAX; i++) h.hello('q' + i, P(i + 10), { ver: 'v' + i }, T0 + 200 + i);
  assert.equal(h.state.queue.length, T.QUICK_QUEUE_MAX);
  r = h.hello('over', P(999), { ver: 'vX' }, T0 + 1000);
  assert.equal(errOf(r), 'rate'); assert.equal(closes(r)[0].code, 4429);
  assert.equal(h.state.queue.length, T.QUICK_QUEUE_MAX);
  // 이미 대기 중인 pid 의 재접속은 상한과 무관
  r = h.hello('q0b', P(10), { ver: 'v0' }, T0 + 1100);
  assert.equal(errOf(r), null);
  assert.equal(h.state.queue.length, T.QUICK_QUEUE_MAX);
});

test('U11 quota: 시간당 120 슬라이딩 창 · 복원', () => {
  const st = createLobby();
  for (let i = 0; i < T.ROOMS_PER_HOUR; i++) assert.ok(takeQuota(st, T0 + i * 1000));
  assert.equal(takeQuota(st, T0 + 200000), false);
  assert.equal(st.quota.length, T.ROOMS_PER_HOUR);
  assert.ok(takeQuota(st, T0 + 3600000 + 1));          // 첫 기록이 창 밖으로
  assert.equal(takeQuota(st, T0 + 3600000 + 2), false);
  assert.ok(takeQuota(st, T0 + 3600000 + 1001));
  // 복원: attachment → 대기열, quota 배열 그대로
  const atts = [{ sid: 'a', pid: P(1), key: KEY(P(1)), name: 'x', ver: '78', since: T0 - 5000 }, { sid: 'b' }, { sid: 'c', pid: P(2), key: KEY(P(2)), ver: '78' }];
  const l = lobbyFromSockets(atts, T0, [T0 - 10]);
  assert.deepEqual(l.queue.map((e) => [e.pid, e.sid, e.since, e.name]), [[P(1), 'a', T0 - 5000, 'x'], [P(2), 'c', T0, P(2)]]);
  assert.deepEqual(Object.keys(l.pending), ['b']);
  assert.deepEqual(l.quota, [T0 - 10]);
  const r = reduce(l, { k: 'alarm' }, T0 + T.QUICK_WAIT - 5000);   // P(1) 이 10초 기다림 → 묶임
  assert.equal(matches(r).length, 1);
});
