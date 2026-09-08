// ==================== Lobby(빠른 매칭) 순수 상태 머신 ====================
// 타이머·난수·I/O 없음. 시간은 now 인자로만.
//   createLobby(now) → state = { queue: [{ pid, key, name, ver, since, sid }], pending: { sid: { openedAt } }, quota: [ts…] }
//   reduce(state, ev, now) → { effects }   (state 는 제자리에서 고친다)
//   group(queue, now) → [[entry…]…]   묶을 수 있는 무리 (같은 ver·mode 끼리, 4명이면 즉시, 2명 이상이고 가장 오래 기다린 사람이 QUICK_WAIT 이상)
//   takeQuota(state, now, limit) → bool   시간당 방 생성 상한(슬라이딩 창)
// 이벤트: { k:'open', sid } · { k:'hello', sid, m } · { k:'close', sid } · { k:'alarm' }
// effects: { send:{ sid, m } } · { close:{ sid, code, reason } } · { match:{ ver, players:[{ pid, key, name, sid }] } }
//          · { log:{ ev, … } } · { alarm: ts|null } (항상 마지막에 하나)
// 대기 중인 모두에게 변화·QUICK_BEAT 알람마다 queued{ n, eta } (n = 같은 ver·mode 대기 인원, eta = 시작까지 남은 ms 또는 null).
// 같은 pid 재접속은 좌석 교체(옛 소켓 4001, since 는 유지). 소켓 닫힘 = 대기 취소. 대기열 QUICK_QUEUE_MAX 초과 → err rate + 4429.
import * as T from './timing.js';
import { CLOSE, PROTOCOL } from './proto.js';
import { matchMode } from './modes.js';

export function createLobby() {
  return { queue: [], pending: {}, quota: [] };
}

// 하이버네이션 복귀: attachment [{ sid, pid?, key?, name?, ver?, since? }] 로 대기열 재구성
export function lobbyFromSockets(atts, now, quota) {
  const st = createLobby();
  if (Array.isArray(quota)) st.quota = quota.slice();
  for (const a of atts || []) {
    if (!a || !a.sid) continue;
    if (a.pid && a.key && a.ver != null && matchMode(a.mode)) st.queue.push({ pid: a.pid, key: a.key, name: a.name || a.pid, ver: a.ver, mode: matchMode(a.mode), since: a.since != null ? a.since : now, sid: a.sid });
    else st.pending[a.sid] = { openedAt: now };
  }
  return st;
}

export function takeQuota(state, now, limit = T.ROOMS_PER_HOUR) {
  state.quota = state.quota.filter((t) => t > now - 3600000);
  if (state.quota.length >= limit) return false;
  state.quota.push(now);
  return true;
}

const groupKey = e => JSON.stringify([e.ver, matchMode(e.mode)]);
const byVer = (queue) => {
  const m = new Map();
  for (const e of queue) { const key = groupKey(e); if (!m.has(key)) m.set(key, []); m.get(key).push(e); }
  for (const list of m.values()) list.sort((a, b) => a.since - b.since || (a.pid < b.pid ? -1 : 1));
  return m;
};

export function group(queue, now) {
  const out = [];
  for (const list of byVer(queue).values()) {
    let rest = list;
    while (rest.length >= T.ROOM_SIZE) { out.push(rest.slice(0, T.ROOM_SIZE)); rest = rest.slice(T.ROOM_SIZE); }
    if (rest.length >= 2 && now - rest[0].since >= T.QUICK_WAIT) out.push(rest);
  }
  return out;
}

// 같은 ver·mode 대기열의 queued 내용
function queuedOf(list, now) {
  const n = list.length;
  const eta = n >= T.ROOM_SIZE ? 0 : n >= 2 ? Math.max(0, list[0].since + T.QUICK_WAIT - now) : null;
  return { t: 'queued', n, eta, mode: matchMode(list[0]?.mode) };
}

export function nextAlarm(state, now) {
  let t = Infinity;
  for (const p of Object.values(state.pending)) t = Math.min(t, p.openedAt + T.HELLO_TIMEOUT);
  for (const list of byVer(state.queue).values()) if (list.length >= 2) t = Math.min(t, list[0].since + T.QUICK_WAIT);
  if (state.queue.length) t = Math.min(t, now + T.QUICK_BEAT);
  return Number.isFinite(t) ? t : null;
}

class Ctx {
  constructor(state, now) { this.state = state; this.now = now; this.effects = []; this.dirty = new Set(); }
  send(sid, m) { this.effects.push({ send: { sid, m: { ...m, at: this.now } } }); }
  close(sid, code, reason) { if (sid) this.effects.push({ close: { sid, code, reason } }); }
  log(ev, extra) { this.effects.push({ log: { ev, ...(extra || {}) } }); }
  reject(sid, code, closeCode, msg) { this.send(sid, { t: 'err', code, msg }); this.close(sid, closeCode, code); this.log('reject.' + code); }
}

export function reduce(state, ev, now) {
  const c = new Ctx(state, now);
  sweepPending(c);
  switch (ev.k) {
    case 'open': state.pending[ev.sid] = { openedAt: now }; break;
    case 'hello': onHello(c, ev); break;
    case 'close': onClose(c, ev); break;
    case 'alarm': for (const e of state.queue) c.dirty.add(groupKey(e)); break;
    default: break;
  }
  // 묶기
  for (const g of group(state.queue, now)) {
    const ids = new Set(g.map((e) => e.sid));
    state.queue = state.queue.filter((e) => !ids.has(e.sid));
    c.dirty.add(groupKey(g[0]));
    c.effects.push({ match: { ver: g[0].ver, mode: matchMode(g[0].mode), players: g.map((e) => ({ pid: e.pid, key: e.key, name: e.name, sid: e.sid })) } });
    c.log('match', { ver: g[0].ver, n: g.length, waited: now - g[0].since });
  }
  // 바뀐 ver 의 대기자에게 queued
  const vers = byVer(state.queue);
  for (const ver of c.dirty) {
    const list = vers.get(ver) || [];
    const m = queuedOf(list, now);
    for (const e of list) c.send(e.sid, m);
  }
  c.effects.push({ alarm: nextAlarm(state, now) });
  return { effects: c.effects };
}

function sweepPending(c) {
  for (const [sid, p] of Object.entries(c.state.pending)) {
    if (c.now - p.openedAt >= T.HELLO_TIMEOUT) {
      delete c.state.pending[sid];
      c.reject(sid, 'bad-request', CLOSE.BAD_REQUEST, 'hello 가 없습니다');
    }
  }
}

function onHello(c, ev) {
  const { sid, m } = ev, st = c.state;
  delete st.pending[sid];
  if (m.v !== PROTOCOL) return c.reject(sid, 'version', CLOSE.VERSION, '서버와 프로토콜 버전이 다릅니다. 새로고침하세요');
  const mode = matchMode(m.mode);
  if (!mode) return c.reject(sid, 'mode', CLOSE.CONFLICT, '지원하지 않는 경쟁 모드입니다');
  if (m.op !== 'quick') return c.reject(sid, 'bad-request', CLOSE.BAD_REQUEST, '빠른 매칭 경로에는 op quick 만 올 수 있습니다');
  const old = st.queue.find((e) => e.pid === m.pid);
  if (old) {
    if (old.key !== m.key) return c.reject(sid, 'bad-key', CLOSE.FORBIDDEN, '좌석 키가 맞지 않습니다');
    if (old.sid !== sid) c.close(old.sid, CLOSE.REPLACED, 'replaced');
    st.queue = st.queue.filter((e) => e !== old);
    c.dirty.add(groupKey(old));
  } else if (st.queue.length >= T.QUICK_QUEUE_MAX) {
    return c.reject(sid, 'rate', CLOSE.RATE, '대기열이 가득 찼습니다. 잠시 뒤 다시 시도하세요');
  }
  st.queue.push({ pid: m.pid, key: m.key, name: m.name, ver: m.ver, mode, since: old && old.ver === m.ver && matchMode(old.mode) === mode ? old.since : c.now, sid });
  c.dirty.add(groupKey({ ver: m.ver, mode }));
  c.log(old ? 'requeue' : 'queue', { pid: m.pid, ver: m.ver });
}

function onClose(c, ev) {
  const st = c.state;
  if (st.pending[ev.sid]) { delete st.pending[ev.sid]; return; }
  const e = st.queue.find((x) => x.sid === ev.sid);
  if (!e) return;
  st.queue = st.queue.filter((x) => x !== e);
  c.dirty.add(groupKey(e));
  c.log('dequeue', { pid: e.pid, ver: e.ver, waited: c.now - e.since });
}
