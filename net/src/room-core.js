// ==================== Room 순수 상태 머신 ====================
// 타이머·난수·I/O 를 쓰지 않는다. 시간은 now(서버 ms) 인자로만 들어온다.
//   createRoom(opts) → state
//   reduce({ state, live }, ev, now) → { state, live, effects, persist }
//   snapshot(state, live, now) → 'room' 메시지 · ranking(state) · nextAlarm(state, live, now)
// 이벤트: { k:'open', sid, op } 소켓 수락 · { k:'hello', sid, op, m } 첫 프레임 · { k:'close', sid } 닫힘
//         { k:'msg', pid, sid, m } proto.parse 통과 메시지 · { k:'alarm' } · { k:'seed', value } start 전 난수
// effects: { send:{ to: pid|pid[]|'*', except?: pid|pid[], m } } · { send:{ sid, m } } (hello 전 소켓) · { close:{ sid, code, reason } }
//          · { alarm: ts|null } (항상 마지막에 하나) · { log:{ ev, … } } · { destroy:true }
// state 는 storage 에 통째로 저장되는 문서, live 는 메모리 전용(소켓·신선도·버킷·관전 대상). 둘 다 이 함수가 제자리에서 고친다.
//   state.players[pid].status: 'idle'(대기실) | 'alive' | 'dead' | 'cleared' | 'lost' | 'left'
//
// 진행 규칙: 서버는 웨이브 시계를 갖지 않는다. start 로 seed·t0·timing 만 나눠 주면 각 클라가 싱글처럼 자기 웨이브를 돌리고
// 서버는 sum(진행 요약)·done·dead·clear 보고를 받아 중계·순위·종료만 맡는다.
//   순위: cleared 는 clearAt 오름차순(먼저 완주 = 1위, 공동 없음) → 그다음 lost/dead/left 는 deathWave 내림차순 → kills 내림차순 → joinedAt
//   종료: alive 0 → cleared(완주자 있음) / all-dead(dead·lost 있음) / empty(전원 left)
//         t0 + GAME_CAP → 남은 alive 를 lost(deathWave = wave) 로 → timeout · 전원 끊김 EMPTY_END → empty
// 빠른 매칭 방(kind 'quick'): Lobby 가 예약 좌석(pid·key·name)을 넣어 만든다. 방장 없음, 예약 전원 접속 즉시 또는 reserveUntil 에
//   접속 2명 이상이면 서버가 시작, 1명 이하면 err expired + 4410 후 폐기.
import * as T from './timing.js';
import { CLOSE, PROTOCOL, PID_RE, KEY_RE, sanitizeName } from './proto.js';
import { take } from './ratelimit.js';

const ALIVE = 'alive';

// ---- 생성 · live 골격 ----
// reserve = { players: [{ pid, key, name }], until } (빠른 매칭). 있으면 바로 lobby, hostId 없음
export function createRoom({ code, kind = 'code', now, ver = null, timing, reserve = null }) {
  const tm = timing ? { ...timing } : T.timingFor('');
  const st = {
    sv: 2, code, kind, createdAt: now, ver,
    phase: 'claimed', hostId: null, seed: null,
    timing: tm,
    players: {},
    game: null,
    reserveUntil: null,
    alarmAt: null, expireAt: now + T.CLAIM_TTL,
  };
  const seats = reserve && Array.isArray(reserve.players)
    ? reserve.players.filter((p) => p && typeof p.pid === 'string' && PID_RE.test(p.pid) && typeof p.key === 'string' && KEY_RE.test(p.key)).slice(0, T.ROOM_SIZE)
    : [];
  if (seats.length) {
    st.phase = 'lobby';
    st.reserveUntil = Number.isFinite(reserve.until) ? reserve.until : now + T.RESERVE_TTL;
    st.expireAt = st.reserveUntil + T.LOBBY_TTL;
    seats.forEach((p, i) => {
      if (st.players[p.pid]) return;
      st.players[p.pid] = { ...newPlayer(p.pid, dedupeName(st, sanitizeName(p.name, p.pid), p.pid), p.key, now + i), reserved: true };
    });
  }
  return st;
}

function newPlayer(pid, name, key, joinedAt) {
  return { pid, name, key, joinedAt, status: 'idle', wave: 0, dw: 0, deathWave: null, deathAt: null, kills: 0, clearAt: null, rank: null };
}

export function emptyLive(now) {
  return { players: {}, pending: {}, seed: null, emptySince: null, rebuiltAt: now };
}

function liveEntry(sid, now) {
  return { sid, connected: true, lastBeat: now, hidden: false, sum: null, disconnectedAt: null, relayAt: null, watchRelayAt: null, watching: null, chatB: null, logB: null };
}

function offlineEntry(now) {
  const e = liveEntry(null, now);
  e.connected = false; e.disconnectedAt = now; e.lastBeat = 0;
  return e;
}

// 하이버네이션 복귀: 소켓 attachment [{ sid, pid?, op? }] 로 live 재구성 (관전 대상은 잃는다 — 클라가 watch 를 다시 보낸다)
export function liveFromSockets(state, atts, now) {
  const live = emptyLive(now);
  for (const a of atts || []) {
    if (!a || !a.sid) continue;
    if (a.pid && state && state.players[a.pid]) live.players[a.pid] = liveEntry(a.sid, now);
    else live.pending[a.sid] = { openedAt: now, op: a.op || null };
  }
  if (state) {
    for (const pid of Object.keys(state.players)) if (!live.players[pid]) live.players[pid] = offlineEntry(now);
    if (state.phase === 'playing') live.emptySince = Object.values(live.players).some((l) => l.connected) ? null : now;
  }
  return live;
}

// ---- 스냅샷 · 순위 ----
export function snapshot(state, live, now) {
  const players = Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt || (a.pid < b.pid ? -1 : 1)).map((p) => {
    const L = live.players[p.pid];
    return { pid: p.pid, name: p.name, host: p.pid === state.hostId, connected: !!(L && L.connected), status: p.status,
             wave: p.wave, dw: p.dw || 0, deathWave: p.deathWave, kills: p.kills, sp: (L && L.sum && L.sum.sp) || 1, hidden: !!(L && L.hidden), rank: p.rank };
  });
  const g = state.game;
  const game = g ? { t0: g.t0, timing: g.timing, seed: state.seed } : null;
  return { t: 'room', code: state.code, kind: state.kind, phase: state.phase, hostId: state.hostId, ver: state.ver, reserveUntil: state.reserveUntil, now, players, game };
}

// cleared 가 먼저(clearAt 오름차순) → 나머지는 deathWave 내림차순 → kills 내림차순 → joinedAt. 공동 순위 없음
function rankKey(p) {
  if (p.status === 'cleared') return [0, p.clearAt || 0, 0];
  const w = p.deathWave != null ? p.deathWave : (p.wave || 0);
  return [1, -w, -(p.kills || 0)];
}
function cmpKey(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

export function ranking(state) {
  const ps = Object.values(state.players).map((p) => ({ p, k: rankKey(p) }));
  ps.sort((a, b) => cmpKey(a.k, b.k) || (a.p.joinedAt - b.p.joinedAt) || (a.p.pid < b.p.pid ? -1 : 1));
  return ps.map(({ p }, i) => {
    const wave = p.status === 'cleared' ? p.wave : (p.deathWave != null ? p.deathWave : p.wave);
    return { pid: p.pid, name: p.name, rank: i + 1, status: p.status, wave, deathWave: p.deathWave, kills: p.kills, clearAt: p.clearAt };
  });
}

// ---- 알람 하나: 다음에 서버가 스스로 깨어나야 할 시각 ----
export function nextAlarm(state, live, now) {
  let t = Infinity;
  for (const p of Object.values(live.pending)) t = Math.min(t, p.openedAt + T.HELLO_TIMEOUT);
  if (!state) return Number.isFinite(t) ? t : null;
  if (state.phase === 'playing') {
    t = Math.min(t, state.game.t0 + T.GAME_CAP);
    for (const p of Object.values(state.players)) {
      const L = live.players[p.pid];
      if (p.status === ALIVE && L && !L.connected && L.disconnectedAt != null) t = Math.min(t, L.disconnectedAt + T.RECONNECT_GRACE);
    }
    if (live.emptySince != null) t = Math.min(t, live.emptySince + T.EMPTY_END);
  } else if (state.phase === 'lobby' && state.reserveUntil != null) {
    t = Math.min(t, state.reserveUntil);
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
  if (c.state && c.state.phase === 'lobby') {
    if (c.state.reserveUntil != null) reserveTick(c);
    else lobbySweep(c);
  }
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
  if (m.op === 'quick') return c.reject(sid, 'bad-request', CLOSE.BAD_REQUEST, '빠른 매칭은 /ws/quick 으로 접속합니다');
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
      if (st.reserveUntil != null) return c.reject(sid, 'full', CLOSE.CONFLICT, '예약된 방입니다');
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
  c.state.players[m.pid] = newPlayer(m.pid, dedupeName(c.state, m.name, m.pid), m.key, c.now);
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

// 아는 pid: 재접속, 또는 예약 좌석의 첫 접속(resumed=false)
function resume(c, sid, m, P) {
  const st = c.state;
  if (P.key !== m.key) return c.reject(sid, 'bad-key', CLOSE.FORBIDDEN, '좌석 키가 맞지 않습니다');
  if (st.ver !== m.ver) return c.reject(sid, 'version', CLOSE.VERSION, '방과 게임 버전이 다릅니다. 새로고침하세요');
  const old = c.live.players[P.pid];
  if (old && old.connected && old.sid && old.sid !== sid) c.close(old.sid, CLOSE.REPLACED, 'replaced');
  const L = liveEntry(sid, c.now);
  if (old) { L.chatB = old.chatB; L.logB = old.logB; L.watching = old.watching; }
  c.live.players[P.pid] = L;
  c.live.emptySince = null;
  const first = !!P.reserved;
  if (first) { delete P.reserved; c.persist = true; }
  welcome(c, sid, P.pid, !first);
  if (st.phase === 'playing') c.bcast({ t: 'player', pid: P.pid, connected: true }, P.pid);
  if (st.phase === 'lobby') c.bcast(c.room(), P.pid);
  if (st.phase === 'ended' && st.game) c.send(P.pid, { t: 'end', reason: st.game.reason, ranking: st.game.ranking, seed: st.seed });
  if (L.watching) notifyWatched(c, L.watching);
  c.log(first ? 'join' : 'back', { pid: P.pid });
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
function connectedCount(c) { return Object.values(c.live.players).filter((l) => l.connected).length; }

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
  if (L.watching) notifyWatched(c, L.watching);
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

// 방장 이탈 → 가장 먼저 들어온 (접속 중인) 사람에게 위임. 바뀌면 room 방송. 빠른 매칭 방은 방장이 없다
function delegateHost(c) {
  const st = c.state;
  if (st.kind === 'quick') return;
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
    case 'watch': return onWatch(c, P, L, m);
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
  if (st.kind === 'quick' || P.pid !== st.hostId) return c.err(P.pid, 'not-host', '방장만 시작할 수 있습니다');
  if (connectedCount(c) < 2) return c.err(P.pid, 'not-ready', '2명 이상 접속해야 시작할 수 있습니다');
  startGame(c, P.pid);
}

// 시작: seed · t0 · timing 을 나눠 주고 전원 alive. 이후 진행은 각 클라 몫
function startGame(c, byPid) {
  const st = c.state, tm = st.timing;
  const t0 = c.now + tm.prep;
  st.seed = c.live.seed != null ? c.live.seed : fallbackSeed(c.now, st.code);
  c.live.seed = null;
  for (const p of Object.values(st.players)) {
    Object.assign(p, { status: ALIVE, wave: 0, dw: 0, deathWave: null, deathAt: null, kills: 0, clearAt: null, rank: null });
    delete p.reserved;
    const L = c.live.players[p.pid];
    if (L) { L.lastBeat = c.now; L.hidden = false; L.sum = null; L.relayAt = null; L.watchRelayAt = null; }
  }
  st.game = { t0, timing: T.wireTiming(tm), endedAt: null, reason: null, ranking: null };
  st.phase = 'playing'; st.expireAt = null; st.reserveUntil = null;
  c.live.emptySince = anyConnected(c) ? null : c.now;
  c.bcast({ t: 'start', seed: st.seed, t0, timing: st.game.timing, now: c.now });
  c.bcast(c.room());
  c.persist = true;
  c.log('start', { pid: byPid, n: connectedCount(c), kind: st.kind });
}

const clampWave = (w, cw) => Math.max(0, Math.min(cw, w));

// 진행 요약: 기록 갱신 + 중계. 보는 사람(watching === pid)에게는 en·ll 포함 1초 간격, 나머지에게는 en·ll 을 떼고 1.5초 간격
function onSum(c, P, L, m) {
  const st = c.state;
  if (st.phase !== 'playing' || P.status !== ALIVE) return;
  const cw = st.game.timing.clearWave;
  const w = clampWave(m.w, cw), dw = clampWave(m.dw, cw);
  L.lastBeat = c.now; L.hidden = m.hid === 1;
  L.sum = { ...m, w, dw };
  P.wave = Math.max(P.wave, w);
  P.dw = Math.max(P.dw || 0, dw);
  P.kills = Math.max(P.kills, m.k);
  const watchers = watchersOf(c, P.pid);
  if (L.relayAt == null || c.now - L.relayAt >= T.SUM_RELAY_MIN) {
    L.relayAt = c.now;
    const { en, ll, t, ...rest } = L.sum;
    c.bcast({ t: 'sum', pid: P.pid, ...rest }, [P.pid, ...watchers]);
  }
  if (watchers.length && (L.watchRelayAt == null || c.now - L.watchRelayAt >= T.SUM_WATCH_MIN)) {
    L.watchRelayAt = c.now;
    const { t, ...rest } = L.sum;
    c.send(watchers, { t: 'sum', pid: P.pid, ...rest });
  }
}

// pid 를 보고 있는 접속 중인 멤버(본인 제외)
function watchersOf(c, pid) {
  return Object.entries(c.live.players).filter(([q, l]) => q !== pid && l.connected && l.watching === pid).map(([q]) => q);
}

function notifyWatched(c, pid) {
  if (!c.state.players[pid]) return;
  c.send(pid, { t: 'watched', n: watchersOf(c, pid).length });
}

// 내가 보는 상대. 대상이 방에 없으면 무시. 대상(과 이전 대상)에게 watched{n}
function onWatch(c, P, L, m) {
  const target = m.pid === P.pid ? null : m.pid;
  if (target && !c.state.players[target]) return;
  const prev = L.watching;
  if (prev === target) return;
  L.watching = target;
  if (prev) notifyWatched(c, prev);
  if (target) notifyWatched(c, target);
}

// 웨이브 완료 (통계용)
function onDone(c, P, m) {
  const st = c.state;
  if (st.phase !== 'playing' || P.status !== ALIVE) return;
  const cw = st.game.timing.clearWave;
  if (m.w < 1 || m.w > cw) return c.log('anomaly', { pid: P.pid, w: m.w, kind: 'done-range', cw });
  P.wave = Math.max(P.wave, m.w);
  P.dw = Math.max(P.dw || 0, m.w);
}

function onDead(c, P, m) {
  const st = c.state;
  if (st.phase !== 'playing' || P.status !== ALIVE) return;
  const w = clampWave(m.w, st.game.timing.clearWave);
  P.status = 'dead'; P.wave = Math.max(P.wave, w); P.deathWave = Math.max(0, w - 1); P.deathAt = c.now;
  P.kills = Math.max(P.kills, m.k); P.deathReason = m.r;
  c.bcast({ t: 'player', pid: P.pid, status: 'dead', wave: P.wave, deathWave: P.deathWave, kills: P.kills });
  c.persist = true;
  c.log('dead', { pid: P.pid, w: P.deathWave, r: m.r });
}

// 완주: 보스 처치·완주 검증은 클라 몫. w ≥ clearWave 면 수락
function onClear(c, P, m) {
  const st = c.state;
  if (st.phase !== 'playing' || P.status !== ALIVE) return;
  const cw = st.game.timing.clearWave;
  if (m.w < cw) return c.log('anomaly', { pid: P.pid, w: m.w, kind: 'clear-early', cw });
  P.status = 'cleared'; P.wave = cw; P.dw = cw; P.deathWave = cw; P.clearAt = c.now; P.deathAt = c.now; P.kills = Math.max(P.kills, m.k);
  c.bcast({ t: 'player', pid: P.pid, status: 'cleared', wave: P.wave, kills: P.kills, clearAt: P.clearAt });
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
  if (st.phase === 'lobby' && st.reserveUntil != null) return;   // reserveTick 이 처리
  if (st.phase !== 'playing' && st.expireAt != null && c.now >= st.expireAt) expire(c);
}

function expire(c, msg) {
  const st = c.state;
  for (const L of Object.values(c.live.players)) {
    if (L.connected && L.sid) { c.sendSid(L.sid, { t: 'err', code: 'expired', msg: msg || '방이 만료되었습니다' }); c.close(L.sid, CLOSE.EXPIRED, 'expired'); }
  }
  for (const sid of Object.keys(c.live.pending)) c.close(sid, CLOSE.EXPIRED, 'expired');
  c.log('expire', { phase: st.phase, kind: st.kind });
  c.effects.push({ destroy: true });
  c.state = null;
  c.live = emptyLive(c.now);
}

// ---- 예약 방(빠른 매칭) 대기실: 전원 접속 즉시 시작 · 마감에 2명 이상이면 시작 · 아니면 폐기 ----
function reserveTick(c) {
  const st = c.state;
  const ps = Object.values(st.players);
  const on = ps.filter((p) => { const L = c.live.players[p.pid]; return L && L.connected; });
  if (on.length >= 2 && on.length === ps.length) return startGame(c, null);
  if (c.now < st.reserveUntil) return;
  if (on.length < 2) return expire(c, '상대가 오지 않았습니다');
  for (const p of ps) {
    const L = c.live.players[p.pid];
    if (!L || !L.connected) { delete st.players[p.pid]; delete c.live.players[p.pid]; c.log('reserve-drop', { pid: p.pid }); }
  }
  startGame(c, null);
}

// ---- 플레이 중: 어떤 이벤트 뒤에도 한 번 돈다. 멱등 ----
function tick(c) {
  const st = c.state, g = st.game, now = c.now;
  // 재접속 유예 만료 → left (alive 였을 때만)
  for (const p of Object.values(st.players)) {
    const L = c.live.players[p.pid];
    if (p.status === ALIVE && L && !L.connected && L.disconnectedAt != null && now >= L.disconnectedAt + T.RECONNECT_GRACE) {
      markLeft(c, p);
      c.log('left', { pid: p.pid, w: p.wave });
    }
  }
  if (now >= g.t0 + T.GAME_CAP) return forceEnd(c, 'lost', 'timeout');
  if (c.live.emptySince != null && now >= c.live.emptySince + T.EMPTY_END) return forceEnd(c, 'left', 'empty');
  checkEnd(c);
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
