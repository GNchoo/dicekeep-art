// ==================== Room 순수 상태 머신 ====================
// 타이머·난수·I/O 를 쓰지 않는다. 시간은 now(서버 ms) 인자로만 들어온다.
//   createRoom(opts) → state
//   reduce({ state, live }, ev, now) → { state, live, effects, persist }
//   snapshot(state, live, now) → 'room' 메시지 · ranking(state) · nextAlarm(state, live, now) · waveAt(state, now)
// 이벤트: { k:'open', sid, op } 소켓 수락 · { k:'hello', sid, op, m } 첫 프레임 · { k:'close', sid } 닫힘
//         { k:'msg', pid, sid, m } proto.parse 통과 메시지 · { k:'alarm' } · { k:'seed', value } start 직전 난수
// effects: { send:{ to: pid|pid[]|'*', except?, m } } · { send:{ sid, m } } (hello 전 소켓) · { close:{ sid, code, reason } }
//          · { alarm: ts|null } (항상 마지막에 하나) · { log:{ ev, … } } · { destroy:true }
// state 는 storage 에 통째로 저장되는 문서(§3.3), live 는 메모리 전용(소켓·신선도·버킷). 둘 다 이 함수가 제자리에서 고친다.
//   state.players[pid].status: 'idle'(대기실) | 'alive' | 'dead' | 'cleared' | 'lost' | 'left'
// 시계 규칙 W0~W9 는 timing.js 상수와 함께 tick() 에 모여 있다.
import * as T from './timing.js';
import { CLOSE, PROTOCOL } from './proto.js';
import { take } from './ratelimit.js';

const ALIVE = 'alive';

// ---- 생성 · live 골격 ----
export function createRoom({ code, kind = 'code', now, ver = null, timing }) {
  const tm = timing ? { ...timing } : T.timingFor('');
  return {
    sv: 1, code, kind, createdAt: now, ver,
    phase: 'claimed', hostId: null, seed: null,
    timing: tm,                         // 서버 타이밍 표 전체 (endGrace 포함)
    players: {},
    game: null,
    alarmAt: null, expireAt: now + T.CLAIM_TTL,
  };
}

export function emptyLive(now) {
  return { players: {}, pending: {}, seed: null, holdCheckAt: null, holdSent: null, emptySince: null, rebuiltAt: now };
}

function liveEntry(sid, now) {
  return { sid, connected: true, lastBeat: now, lag: 0, hidden: false, sum: null, bossHp: null, disconnectedAt: null, relayAt: null, chatB: null, logB: null };
}

function offlineEntry(now) {
  const e = liveEntry(null, now);
  e.connected = false; e.disconnectedAt = now; e.lastBeat = 0;
  return e;
}

// 하이버네이션 복귀: 소켓 attachment [{ sid, pid?, op? }] 로 live 재구성 (lastBeat=now, lag=0 → 전원 stale 오판 방지)
export function liveFromSockets(state, atts, now) {
  const live = emptyLive(now);
  for (const a of atts || []) {
    if (!a || !a.sid) continue;
    if (a.pid && state && state.players[a.pid]) live.players[a.pid] = liveEntry(a.sid, now);
    else live.pending[a.sid] = { openedAt: now, op: a.op || null };
  }
  if (state) {
    for (const pid of Object.keys(state.players)) if (!live.players[pid]) live.players[pid] = offlineEntry(now);
    if (state.phase === 'playing') {
      const anyOn = Object.values(live.players).some((l) => l.connected);
      live.emptySince = anyOn ? null : now;
      const h = state.game && state.game.hold;
      live.holdCheckAt = h && !h.released ? now + T.HOLD_RECHECK : null;
    }
  }
  return live;
}

// ---- 시계 산술 ----
export function waveAt(state, now) {
  const g = state && state.game;
  if (!g) return 0;
  const a = g.waveAts;
  for (let n = a.length - 1; n >= 1; n--) if (a[n] != null && a[n] <= now) return n;
  return 0;
}

// waveAts[from] 이 정해진 상태에서 다음 보스(또는 clearWave)까지 체인을 확정한다. 확정된 T 는 다시 쓰지 않는다.
function extendChain(g, from) {
  const cw = g.timing.clearWave;
  for (let w = from; w < cw && !T.isBoss(w); w++) {
    if (g.waveAts[w + 1] == null) g.waveAts[w + 1] = g.waveAts[w] + T.spawnEnd(w) + g.timing.intermission;
  }
  if (g.endAt == null && g.waveAts[cw] != null) g.endAt = g.waveAts[cw] + T.spawnEnd(cw);
}

function fresh(live, pid, now) {
  const L = live.players[pid];
  return !!(L && L.connected && now - L.lastBeat <= T.FRESH_BEAT && !L.hidden && L.lag * 1000 <= T.FRESH_LAG);
}

function holdView(state, live, now) {
  const h = state.game && state.game.hold;
  if (!h) return null;
  const ps = Object.values(state.players);
  const waiting = ps.filter((p) => p.status === ALIVE && fresh(live, p.pid, now) && !p.bossDone.includes(h.w)).map((p) => p.pid);
  const done = ps.filter((p) => p.bossDone.includes(h.w)).map((p) => p.pid);
  return { w: h.w, deadline: h.deadline, waiting, done, released: !!h.released };
}

// ---- 스냅샷 · 순위 ----
export function snapshot(state, live, now) {
  const players = Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt || (a.pid < b.pid ? -1 : 1)).map((p) => {
    const L = live.players[p.pid];
    return { pid: p.pid, name: p.name, host: p.pid === state.hostId, connected: !!(L && L.connected), status: p.status,
             wave: p.wave, deathWave: p.deathWave, kills: p.kills, lag: L ? L.lag : 0, hidden: !!(L && L.hidden), rank: p.rank };
  });
  const g = state.game;
  const game = g ? { t0: g.t0, timing: g.timing, seed: state.seed, wave: waveAt(state, now), waveAts: g.waveAts.slice(), hold: holdView(state, live, now), endAt: g.endAt } : null;
  return { t: 'room', code: state.code, phase: state.phase, hostId: state.hostId, ver: state.ver, now, players, game };
}

const STATUS_ORDER = { cleared: 0, alive: 1, lost: 2, dead: 3, left: 4, idle: 5 };
function rankKey(p) {
  const o = STATUS_ORDER[p.status] == null ? 9 : STATUS_ORDER[p.status];
  if (p.status === 'cleared') return [o, 0, 0, 0];             // 완주는 전원 공동 1위
  const w = p.deathWave != null ? p.deathWave : (p.wave || 0);
  return [o, -w, -(p.deathAt || 0), -(p.kills || 0)];
}
function cmpKey(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

// cleared(공동 1위) > lost > dead > left · 같은 status 는 deathWave desc → deathAt desc → kills desc. 공동이면 같은 숫자
export function ranking(state) {
  const ps = Object.values(state.players).map((p) => ({ p, k: rankKey(p) }));
  ps.sort((a, b) => cmpKey(a.k, b.k) || (a.p.joinedAt - b.p.joinedAt) || (a.p.pid < b.p.pid ? -1 : 1));
  const out = [];
  let rank = 0;
  for (let i = 0; i < ps.length; i++) {
    if (i === 0 || cmpKey(ps[i - 1].k, ps[i].k) !== 0) rank = i + 1;
    const p = ps[i].p;
    const wave = p.status === 'cleared' ? p.wave : (p.deathWave != null ? p.deathWave : p.wave);
    out.push({ pid: p.pid, name: p.name, rank, status: p.status, wave, kills: p.kills });
  }
  return out;
}

// ---- 알람 하나: 다음에 서버가 스스로 깨어나야 할 시각 ----
export function nextAlarm(state, live, now) {
  let t = Infinity;
  for (const p of Object.values(live.pending)) t = Math.min(t, p.openedAt + T.HELLO_TIMEOUT);
  if (!state) return Number.isFinite(t) ? t : null;
  if (state.phase === 'playing') {
    const g = state.game;
    t = Math.min(t, g.t0 + T.GAME_CAP);
    for (const b of T.bossWaves(g.timing.clearWave)) {
      if (g.waveAts[b] != null && (!g.hold || g.hold.w < b)) { t = Math.min(t, g.waveAts[b]); break; }
    }
    if (g.hold && !g.hold.released) t = Math.min(t, g.hold.deadline, live.holdCheckAt != null ? live.holdCheckAt : now + T.HOLD_RECHECK);
    if (g.endAt != null) t = Math.min(t, g.endAt + g.endGrace);
    for (const p of Object.values(state.players)) {
      const L = live.players[p.pid];
      if (p.status === ALIVE && L && !L.connected && L.disconnectedAt != null) t = Math.min(t, L.disconnectedAt + T.RECONNECT_GRACE);
    }
    if (live.emptySince != null) t = Math.min(t, live.emptySince + T.EMPTY_END);
  } else if (state.expireAt != null) {
    t = Math.min(t, state.expireAt);
    if (state.phase === 'lobby') for (const p of Object.values(state.players)) {
      const L = live.players[p.pid];
      if (!L || !L.connected) t = Math.min(t, ((L && L.disconnectedAt != null) ? L.disconnectedAt : now) + T.LOBBY_GRACE);
    }
  }
  return Number.isFinite(t) ? t : null;
}

// 대기실: 유예가 지난 끊긴 좌석을 비운다 (하이버네이션 복귀로 live 가 없는 좌석은 지금부터 유예를 센다)
function lobbySweep(c) {
  for (const p of Object.values(c.state.players)) {
    let L = c.live.players[p.pid];
    if (!L) { L = c.live.players[p.pid] = liveEntry(null, c.now); L.connected = false; L.disconnectedAt = c.now; }
    if (!L.connected && L.disconnectedAt != null && c.now >= L.disconnectedAt + T.LOBBY_GRACE) {
      removePlayer(c, p.pid);
      c.log('lobby-drop', { pid: p.pid });
    }
  }
}

// ---- 리듀서 컨텍스트 ----
class Ctx {
  constructor(state, live, now) { this.state = state; this.live = live; this.now = now; this.effects = []; this.persist = false; }
  send(to, m, except) { this.effects.push({ send: { to, except, m: { ...m, at: this.now } } }); }
  sendSid(sid, m) { this.effects.push({ send: { sid, m: { ...m, at: this.now } } }); }
  bcast(m, except) { this.send('*', m, except); }
  close(sid, code, reason) { if (sid) this.effects.push({ close: { sid, code, reason } }); }
  log(ev, extra) { this.effects.push({ log: { ev, ...(extra || {}) } }); }
  err(pid, code, msg) { this.send(pid, { t: 'err', code, msg }); }
  // hello 거절: 항상 accept 뒤 err + close (브라우저는 HTTP 오류 본문을 못 읽는다)
  reject(sid, code, closeCode, msg) {
    this.sendSid(sid, { t: 'err', code, msg });
    this.close(sid, closeCode, code);
    this.log('reject.' + code);
  }
  room() { return snapshot(this.state, this.live, this.now); }
}

export function reduce({ state, live }, ev, now) {
  const c = new Ctx(state || null, live || emptyLive(now), now);
  sweepPending(c);
  switch (ev.k) {
    case 'open': onOpen(c, ev); break;
    case 'hello': onHello(c, ev); break;
    case 'close': onClose(c, ev); break;
    case 'msg': onMsg(c, ev); break;
    case 'alarm': onAlarm(c); break;
    case 'seed': c.live.seed = (Number(ev.value) >>> 0); break;
    default: break;
  }
  if (c.state && c.state.phase === 'playing') tick(c);
  if (c.state && c.state.phase === 'lobby') lobbySweep(c);
  c.effects.push({ alarm: nextAlarm(c.state, c.live, now) });
  return { state: c.state, live: c.live, effects: c.effects, persist: c.persist };
}

// hello 없이 HELLO_TIMEOUT 지난 소켓 → 4400
function sweepPending(c) {
  for (const [sid, p] of Object.entries(c.live.pending)) {
    if (c.now - p.openedAt >= T.HELLO_TIMEOUT) {
      delete c.live.pending[sid];
      c.reject(sid, 'bad-request', CLOSE.BAD_REQUEST, 'hello 가 없습니다');
    }
  }
}

function onOpen(c, ev) {
  c.live.pending[ev.sid] = { openedAt: c.now, op: ev.op || null };
}

// ---- hello: 생성 · 참가 · 재접속 ----
function onHello(c, ev) {
  const { sid, m } = ev;
  const pend = c.live.pending[sid];
  delete c.live.pending[sid];
  const routeOp = ev.op || (pend && pend.op) || m.op;
  if (m.v !== PROTOCOL) return c.reject(sid, 'version', CLOSE.VERSION, '서버와 프로토콜 버전이 다릅니다. 새로고침하세요');
  if (m.op !== routeOp) return c.reject(sid, 'bad-request', CLOSE.BAD_REQUEST, '요청 경로와 op 가 다릅니다');
  const st = c.state;
  if (!st) return c.reject(sid, 'bad-code', CLOSE.NO_ROOM, '없는 방 코드입니다');
  const known = st.players[m.pid];
  if (known) return resume(c, sid, m, known);
  switch (st.phase) {
    case 'claimed':
      if (m.op !== 'create') return c.reject(sid, 'bad-code', CLOSE.NO_ROOM, '없는 방 코드입니다');
      return createHost(c, sid, m);
    case 'lobby':
      if (m.op !== 'join') return c.reject(sid, 'bad-request', CLOSE.BAD_REQUEST, '이미 만들어진 방입니다');
      if (st.ver !== m.ver) return c.reject(sid, 'version', CLOSE.VERSION, '방장과 게임 버전이 다릅니다. 새로고침하세요');
      if (Object.keys(st.players).length >= T.ROOM_SIZE) return c.reject(sid, 'full', CLOSE.CONFLICT, '방이 가득 찼습니다');
      return join(c, sid, m);
    case 'playing':
      return c.reject(sid, 'started', CLOSE.CONFLICT, '이미 시작한 방입니다');
    default:
      return c.reject(sid, 'expired', CLOSE.EXPIRED, '끝난 방입니다');
  }
}

function dedupeName(st, name, selfPid) {
  const taken = new Set(Object.values(st.players).filter((p) => p.pid !== selfPid).map((p) => p.name));
  let out = name, n = 2;
  while (taken.has(out)) out = `${name} (${n++})`;
  return out;
}

function addPlayer(c, m) {
  c.state.players[m.pid] = { pid: m.pid, name: dedupeName(c.state, m.name, m.pid), key: m.key, joinedAt: c.now, status: 'idle',
                              wave: 0, deathWave: null, deathAt: null, kills: 0, bossDone: [], clearAt: null, rank: null };
}

function welcome(c, sid, pid, resumed) {
  c.sendSid(sid, { t: 'welcome', pid, code: c.state.code, kind: c.state.kind, resumed, now: c.now, room: c.room() });
}

function createHost(c, sid, m) {
  const st = c.state;
  st.phase = 'lobby'; st.ver = m.ver; st.hostId = m.pid; st.expireAt = c.now + T.LOBBY_TTL;
  addPlayer(c, m);
  c.live.players[m.pid] = liveEntry(sid, c.now);
  welcome(c, sid, m.pid, false);
  c.persist = true;
  c.log('room.create', { pid: m.pid });
}

function join(c, sid, m) {
  const st = c.state;
  addPlayer(c, m);
  c.live.players[m.pid] = liveEntry(sid, c.now);
  st.expireAt = c.now + T.LOBBY_TTL;
  welcome(c, sid, m.pid, false);
  c.bcast(c.room(), m.pid);
  c.persist = true;
  c.log('join', { pid: m.pid });
}

function resume(c, sid, m, P) {
  const st = c.state;
  if (P.key !== m.key) return c.reject(sid, 'bad-key', CLOSE.FORBIDDEN, '좌석 키가 맞지 않습니다');
  if (st.ver !== m.ver) return c.reject(sid, 'version', CLOSE.VERSION, '방과 게임 버전이 다릅니다. 새로고침하세요');
  const old = c.live.players[P.pid];
  if (old && old.connected && old.sid && old.sid !== sid) c.close(old.sid, CLOSE.REPLACED, 'replaced');
  const L = liveEntry(sid, c.now);
  if (old) { L.chatB = old.chatB; L.logB = old.logB; }
  c.live.players[P.pid] = L;
  c.live.emptySince = null;
  welcome(c, sid, P.pid, true);
  if (st.phase === 'playing') c.bcast({ t: 'player', pid: P.pid, connected: true }, P.pid);
  if (st.phase === 'lobby') c.bcast(c.room(), P.pid);
  if (st.phase === 'ended' && st.game) c.send(P.pid, { t: 'end', reason: st.game.reason, ranking: st.game.ranking, seed: st.seed });
  c.log('back', { pid: P.pid });
}

// ---- 닫힘 ----
function onClose(c, ev) {
  const { sid } = ev;
  if (c.live.pending[sid]) { delete c.live.pending[sid]; return; }
  const st = c.state;
  if (!st) return;
  const pid = Object.keys(c.live.players).find((k) => c.live.players[k].sid === sid);
  if (!pid) return;                       // 이미 교체된 옛 소켓
  const L = c.live.players[pid];
  if (!L.connected) return;
  disconnect(c, pid, 'drop');
}

function anyConnected(c) { return Object.values(c.live.players).some((l) => l.connected); }

// 소켓이 사라졌다(끊김·leave 공통). reason 'drop' 은 유예 후 left/제거, 'leave' 는 즉시
function disconnect(c, pid, reason) {
  const st = c.state, L = c.live.players[pid], P = st.players[pid];
  L.connected = false; L.sid = null; L.disconnectedAt = c.now;
  if (st.phase === 'lobby' || st.phase === 'claimed') {
    // 대기실: 새로고침·백그라운드 전환은 LOBBY_GRACE 동안 좌석(방장 포함)을 지킨다. 나가기만 즉시 제거
    if (reason === 'leave' || st.phase === 'claimed') removePlayer(c, pid);
    else c.bcast(c.room(), pid);
  } else if (st.phase === 'playing') {
    if (reason === 'leave' && P.status === ALIVE) markLeft(c, P);
    else c.bcast({ t: 'player', pid, connected: false }, pid);
    if (!anyConnected(c)) c.live.emptySince = c.now;
  }
  c.log(reason, { pid, w: P ? P.wave : undefined });
}

function removePlayer(c, pid) {
  const st = c.state;
  delete st.players[pid];
  delete c.live.players[pid];
  st.expireAt = c.now + T.LOBBY_TTL;
  delegateHost(c);
  c.bcast(c.room());
  c.persist = true;
}

function markLeft(c, P) {
  P.status = 'left'; P.deathWave = P.wave; P.deathAt = c.now;
  c.bcast({ t: 'player', pid: P.pid, status: 'left', wave: P.wave, deathWave: P.deathWave });
  delegateHost(c);
  c.persist = true;
}

// 방장 이탈 → 가장 먼저 들어온 (접속 중인) 사람에게 위임. 바뀌면 room 방송
function delegateHost(c) {
  const st = c.state;
  const cur = st.players[st.hostId];
  if (cur && cur.status !== 'left') return;
  const cands = Object.values(st.players).filter((p) => p.status !== 'left')
    .sort((a, b) => (c.live.players[b.pid]?.connected ? 1 : 0) - (c.live.players[a.pid]?.connected ? 1 : 0) || a.joinedAt - b.joinedAt);
  const next = cands[0] ? cands[0].pid : null;
  if (next !== st.hostId) {
    st.hostId = next;
    c.persist = true;
    if (st.phase === 'playing') c.bcast(c.room());
  }
}

// ---- 인증된 소켓의 메시지 ----
function onMsg(c, ev) {
  const st = c.state;
  if (!st) return;
  const P = st.players[ev.pid], L = c.live.players[ev.pid];
  if (!P || !L || L.sid !== ev.sid) return;   // 교체된 옛 소켓
  const m = ev.m;
  switch (m.t) {
    case 'start': return onStart(c, P);
    case 'sum': return onSum(c, P, L, m);
    case 'done': return onDone(c, P, m);
    case 'dead': return onDead(c, P, m);
    case 'clear': return onClear(c, P, m);
    case 'chat': return onChat(c, P, L, m);
    case 'log': return onLog(c, P, L, m);
    case 'time': return c.send(P.pid, { t: 'time', c: m.c, s: c.now });
    case 'leave': return onLeave(c, P, L);
    default: return undefined;                // hello 재전송 등은 무시
  }
}

function fallbackSeed(now, code) {
  let h = 2166136261 >>> 0;
  for (const ch of String(code) + ':' + now) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function onStart(c, P) {
  const st = c.state;
  if (st.phase !== 'lobby') return c.err(P.pid, 'not-ready', '대기실에서만 시작할 수 있습니다');
  if (P.pid !== st.hostId) return c.err(P.pid, 'not-host', '방장만 시작할 수 있습니다');
  const on = Object.values(c.live.players).filter((l) => l.connected).length;
  if (on < 2) return c.err(P.pid, 'not-ready', '2명 이상 접속해야 시작할 수 있습니다');
  const tm = st.timing;
  const t0 = c.now + tm.prep;
  const g = { t0, timing: T.wireTiming(tm), endGrace: tm.endGrace, waveAts: [null, t0], hold: null, endAt: null, endedAt: null, reason: null, ranking: null };
  extendChain(g, 1);
  st.seed = c.live.seed != null ? c.live.seed : fallbackSeed(c.now, st.code);
  c.live.seed = null;
  for (const p of Object.values(st.players)) {
    Object.assign(p, { status: ALIVE, wave: 0, deathWave: null, deathAt: null, kills: 0, bossDone: [], clearAt: null, rank: null });
    const L = c.live.players[p.pid];
    if (L) { L.lastBeat = c.now; L.lag = 0; L.hidden = false; L.sum = null; L.bossHp = null; }
  }
  st.game = g; st.phase = 'playing'; st.expireAt = null;
  c.live.emptySince = anyConnected(c) ? null : c.now;
  c.live.holdSent = null; c.live.holdCheckAt = null;
  c.bcast({ t: 'start', seed: st.seed, t0, timing: g.timing, now: c.now });
  c.bcast({ t: 'sched', from: 1, ats: g.waveAts.slice(1) });
  c.bcast(c.room());
  c.persist = true;
  c.log('start', { pid: P.pid, n: on });
}

function addBossDone(c, P, b) {
  if (P.bossDone.includes(b)) return false;
  P.bossDone.push(b);
  P.bossDone.sort((x, y) => x - y);
  c.persist = true;
  return true;
}

function onSum(c, P, L, m) {
  const st = c.state;
  if (st.phase !== 'playing' || P.status !== ALIVE) return;
  const cap = waveAt(st, c.now + 1000);
  const w = Math.min(m.w, cap), dw = Math.min(m.dw, cap);
  L.lastBeat = c.now; L.lag = m.lag; L.hidden = m.hid === 1; L.bossHp = m.b;
  L.sum = { ...m, w, dw };
  P.wave = Math.max(P.wave, w);
  P.kills = Math.max(P.kills, m.k);
  // dw 로 bossDone 도출: 멀티 클라는 보스가 필드에 있는 동안 어떤 웨이브도 완료하지 않으므로 dw ≥ b ⇒ 보스 b 처치
  for (const b of T.bossWaves(st.game.timing.clearWave)) if (b <= dw && addBossDone(c, P, b)) c.log('bossDone', { pid: P.pid, w: b, via: 'sum' });
  if (L.relayAt == null || c.now - L.relayAt >= T.SUM_RELAY_MIN) {
    L.relayAt = c.now;
    c.bcast({ t: 'sum', pid: P.pid, ...L.sum }, P.pid);
  }
}

function onDone(c, P, m) {
  const st = c.state;
  if (st.phase !== 'playing' || P.status !== ALIVE) return;
  const g = st.game;
  const cap = waveAt(st, c.now + 1000);
  if (m.w < 1 || m.w > cap) return c.log('anomaly', { pid: P.pid, w: m.w, kind: 'done-future', cap });
  P.wave = Math.max(P.wave, m.w);
  if (T.isBoss(m.w) && addBossDone(c, P, m.w)) c.log('bossDone', { pid: P.pid, w: m.w, via: 'done' });
  const earliest = g.waveAts[m.w] + (T.isBoss(m.w) ? 1050 : T.spawnEnd(m.w)) - 1000;   // 1초는 시각 오차 여유
  if (c.now < earliest) c.log('anomaly', { pid: P.pid, w: m.w, kind: 'done-early', ms: earliest - c.now });
}

function onDead(c, P, m) {
  const st = c.state;
  if (st.phase !== 'playing' || P.status !== ALIVE) return;
  const w = Math.min(m.w, waveAt(st, c.now + 1000));
  P.status = 'dead'; P.wave = Math.max(P.wave, w); P.deathWave = Math.max(0, w - 1); P.deathAt = c.now;
  P.kills = Math.max(P.kills, m.k); P.deathReason = m.r;
  c.bcast({ t: 'player', pid: P.pid, status: 'dead', wave: P.wave, deathWave: P.deathWave, kills: P.kills });
  c.persist = true;
  c.log('dead', { pid: P.pid, w: P.deathWave, r: m.r });
}

function onClear(c, P, m) {
  const st = c.state;
  if (st.phase !== 'playing' || P.status !== ALIVE) return;
  const cw = st.game.timing.clearWave;
  if (waveAt(st, c.now + 1000) < cw) return c.log('anomaly', { pid: P.pid, w: m.w, kind: 'clear-early' });
  const need = T.bossWaves(cw);
  if (!need.every((b) => P.bossDone.includes(b))) return c.log('anomaly', { pid: P.pid, w: m.w, kind: 'clear-boss', have: P.bossDone.length, need: need.length });
  P.status = 'cleared'; P.wave = cw; P.deathWave = cw; P.clearAt = c.now; P.deathAt = c.now; P.kills = Math.max(P.kills, m.k);
  c.bcast({ t: 'player', pid: P.pid, status: 'cleared', wave: P.wave, kills: P.kills });
  c.persist = true;
  c.log('clear', { pid: P.pid, w: cw });
}

function onChat(c, P, L, m) {
  const r = take(L.chatB, c.now, T.CHAT_RATE, T.CHAT_BURST);
  L.chatB = r.bucket;
  if (!r.ok) return c.err(P.pid, 'rate', '채팅이 너무 빠릅니다');
  c.bcast({ t: 'chat', pid: P.pid, name: P.name, text: m.text });
}

function onLog(c, P, L, m) {
  const r = take(L.logB, c.now, T.LOG_RATE, T.LOG_BURST);
  L.logB = r.bucket;
  if (!r.ok) return;
  c.bcast({ t: 'log', pid: P.pid, name: P.name, text: m.text, kind: m.kind }, P.pid);
}

function onLeave(c, P, L) {
  const sid = L.sid;
  disconnect(c, P.pid, 'leave');
  c.close(sid, CLOSE.LEAVE, 'leave');
}

// ---- 알람 ----
function onAlarm(c) {
  const st = c.state;
  if (!st) return;
  if (st.phase !== 'playing' && st.expireAt != null && c.now >= st.expireAt) expire(c);
}

function expire(c) {
  const st = c.state;
  for (const L of Object.values(c.live.players)) {
    if (L.connected && L.sid) { c.sendSid(L.sid, { t: 'err', code: 'expired', msg: '방이 만료되었습니다' }); c.close(L.sid, CLOSE.EXPIRED, 'expired'); }
  }
  for (const sid of Object.keys(c.live.pending)) c.close(sid, CLOSE.EXPIRED, 'expired');
  c.log('expire', { phase: st.phase });
  c.effects.push({ destroy: true });
  c.state = null;
  c.live = emptyLive(c.now);
}

// ---- 플레이 중 시계 (W1~W6, W9): 어떤 이벤트 뒤에도 한 번 돈다. 멱등 ----
function tick(c) {
  const st = c.state, g = st.game, now = c.now;
  const ps = Object.values(st.players);
  // 재접속 유예 만료 → left (alive 였을 때만)
  for (const p of ps) {
    const L = c.live.players[p.pid];
    if (p.status === ALIVE && L && !L.connected && L.disconnectedAt != null && now >= L.disconnectedAt + T.RECONNECT_GRACE) {
      markLeft(c, p);
      c.log('left', { pid: p.pid, w: p.wave });
    }
  }
  // 절대 상한 · 전원 끊김 · 101 마감
  if (now >= g.t0 + T.GAME_CAP) return forceEnd(c, 'lost', 'timeout');
  if (c.live.emptySince != null && now >= c.live.emptySince + T.EMPTY_END) return forceEnd(c, 'left', 'empty');
  if (g.endAt != null && now >= g.endAt + g.endGrace) return forceEnd(c, 'lost', 'timeout');
  // 보스 웨이브 시작 → 홀드
  for (const b of T.bossWaves(g.timing.clearWave)) {
    if (g.waveAts[b] != null && g.waveAts[b] <= now && (!g.hold || g.hold.w < b)) {
      g.hold = { w: b, deadline: g.waveAts[b] + T.spawnEnd(b) + g.timing.bossLimit + T.BOSS_GRACE, released: false };
      c.live.holdCheckAt = now + T.HOLD_RECHECK;
      c.live.holdSent = null;
      c.persist = true;
      c.log('hold', { w: b });
      break;
    }
  }
  evaluateHold(c);
  checkEnd(c);
}

function evaluateHold(c) {
  const st = c.state, g = st.game, h = g.hold, now = c.now;
  if (!h || h.released) return;
  const view = holdView(st, c.live, now);
  const aliveDone = Object.values(st.players).some((p) => p.status === ALIVE && p.bossDone.includes(h.w));
  if ((view.waiting.length === 0 && aliveDone) || now >= h.deadline) {
    h.released = true;
    const from = h.w + 1;
    if (from <= g.timing.clearWave) {
      g.waveAts[from] = now + g.timing.intermission;
      extendChain(g, from);
    }
    c.bcast({ t: 'hold', ...holdView(st, c.live, now) });
    if (from <= g.timing.clearWave) c.bcast({ t: 'sched', from, ats: g.waveAts.slice(from) });
    c.live.holdSent = null; c.live.holdCheckAt = null;
    c.persist = true;
    c.log('hold.release', { w: h.w, by: now >= h.deadline ? 'deadline' : 'done', waiting: view.waiting.length });
    return;
  }
  const key = JSON.stringify([h.w, view.waiting, view.done]);
  if (c.live.holdSent !== key) { c.live.holdSent = key; c.bcast({ t: 'hold', ...view }); }
  if (c.live.holdCheckAt == null || now >= c.live.holdCheckAt) c.live.holdCheckAt = now + T.HOLD_RECHECK;
}

// alive 전원 → status 로 바꾸고 종료
function forceEnd(c, status, reason) {
  for (const p of Object.values(c.state.players)) {
    if (p.status !== ALIVE) continue;
    p.status = status; p.deathWave = p.wave; p.deathAt = c.now;
    c.bcast({ t: 'player', pid: p.pid, status, wave: p.wave, deathWave: p.deathWave });
  }
  endGame(c, reason);
}

function checkEnd(c) {
  const ps = Object.values(c.state.players);
  if (ps.some((p) => p.status === ALIVE)) return;
  const reason = ps.some((p) => p.status === 'cleared') ? 'cleared' : ps.some((p) => p.status === 'dead' || p.status === 'lost') ? 'all-dead' : 'empty';
  endGame(c, reason);
}

function endGame(c, reason) {
  const st = c.state, g = st.game;
  if (st.phase !== 'playing') return;
  const rk = ranking(st);
  for (const r of rk) st.players[r.pid].rank = r.rank;
  g.endedAt = c.now; g.reason = reason; g.ranking = rk;
  st.phase = 'ended'; st.expireAt = c.now + T.END_TTL;
  c.bcast({ t: 'end', reason, ranking: rk, seed: st.seed });
  c.persist = true;
  c.log('end', { reason, n: rk.length });
}
