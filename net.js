// ==================== 멀티 연결 계층 (DKNET v2 · WebSocket 전용) ====================
// 설계: 서버(별도 Worker `dicekeep-net` + 방마다 Durable Object 하나)는 방·시계·시드·중계만 맡고,
// 시뮬레이션은 각 클라이언트가 자기 보드만 돌린다. 이 파일은 '연결 계층' 만 담는다 —
// 게임 규칙·웨이브 시계·상대 위젯은 game.js 가 이벤트로 붙인다.
//   1) 접속      — 방 만들기 {url}/ws/new · 참가·재접속 {url}/ws/room/{CODE}. URL 에는 방 코드만 싣고
//                  인증(pid+key)은 소켓을 연 직후 첫 프레임 hello 로 보낸다. 거절은 err 메시지 + 44xx 닫기
//   2) 좌석      — pid(8자)·key(32 hex)는 탭 단위 sessionStorage(dk_mp_id): 새로고침 = 같은 좌석, 다른 탭 = 다른 플레이어.
//                  마지막 방(dk_mp {code,pid,key,name})은 welcome 마다 저장하고 leave() 가 지운다 → 부팅 시 resume()
//   3) 재접속    — 의도하지 않은 닫힘이면 1·2·4·8·16·30초 백오프로 같은 pid/key 로 다시 hello(op:'join').
//                  화면 복귀(visibilitychange)·online 이면 즉시. 다시 붙어도 같은 답인 코드(4001·4403·4404·4409·4410·4426)는 포기
//   4) 시각 동기 — time 왕복 표본(최근 8개) 중 RTT 가 가장 작은 표본의 오프셋. serverNow() = performance.now() + offset
//   5) 이벤트    — 서버 메시지는 허용목록만 같은 이름으로 발화(페이로드 = 메시지 객체 그대로), 내부 이벤트는 'net:' 접두
//                  (서버가 보낼 수 없는 이름이라 충돌이 없다)
// 서버 주소가 없으면(CFG.url null) 상태는 'offline' 그대로이고 게임은 완전한 싱글로 돌아간다.
window.DKNET = (function () {
  'use strict';

  const PROTOCOL = 2;
  const WS_OPEN = 1;
  const CONNECT_TIMEOUT = 10000;   // 소켓 생성 → open 대기
  const HELLO_TIMEOUT = 5000;      // open → welcome 대기
  const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];
  const MAX_BYTES = 2000;          // 서버 프레임 한도 2,048 B 아래
  const TIME_SAMPLES = 8, TIME_BURST = 5, TIME_GAP = 200, TIME_JUMP = 500;
  const DEBUG_LINES = 200, DEBUG_TEXT = 60;
  const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;                     // 알파벳 ABCDEFGHJKMNPQRSTUVWXYZ23456789
  const PID_RE = /^[a-z0-9]{8,16}$/, KEY_RE = /^[0-9a-f]{32}$/;
  // 다시 붙어도 같은 답이 나오는 닫기 코드 → 재접속 포기 (4000 leave · 4001 replaced · 4403 bad-key · 4404 no-room · 4409 full/started · 4410 expired · 4426 version)
  const NO_RETRY = { 4000: 1, 4001: 1, 4403: 1, 4404: 1, 4409: 1, 4410: 1, 4426: 1 };
  // 방이 없어졌거나 좌석이 무효한 코드 → 저장한 세션(dk_mp)도 버린다 (부팅 때 헛된 resume 방지)
  const FORGET_CLOSE = { 4403: 1, 4404: 1, 4409: 1, 4410: 1, 4426: 1 };
  const FORGET_ERR = { 'bad-code': 1, 'bad-key': 1, expired: 1, version: 1, started: 1, full: 1 };
  const CLOSE_NAME = { 4000: 'leave', 4001: 'replaced', 4400: 'bad-request', 4403: 'bad-key', 4404: 'bad-code', 4409: 'started', 4410: 'expired', 4426: 'version', 4429: 'rate' };
  const DEAD_REASONS = ['lives', 'bossLeak', 'bossTimeout', 'quit', 'reload', 'afk'];
  const LOG_KINDS = ['sys', 'gacha', 'up', 'boom', 'boss', 'life'];

  const W = window;
  const DOC = (typeof document !== 'undefined') ? document : null;
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // ---- 저장소 (막혀 있어도 죽지 않게 전부 try/catch) ----
  const SS = () => { try { return (typeof sessionStorage !== 'undefined') ? sessionStorage : null; } catch (_) { return null; } };
  const LS = () => { try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (_) { return null; } };
  function sGet(st, k) { try { return st ? st.getItem(k) : null; } catch (_) { return null; } }
  function sSet(st, k, v) { try { if (st) st.setItem(k, v); } catch (_) {} }
  function sDel(st, k) { try { if (st) st.removeItem(k); } catch (_) {} }

  // ---- 디버그 링 버퍼 (송수신 종류·상태 전이·오프셋, 텍스트는 60자 절단) ----
  const DBG = [];
  function dbg(line) {
    let s = String(line);
    if (s.length > DEBUG_TEXT) s = s.slice(0, DEBUG_TEXT) + '…';
    DBG.push((now() / 1000).toFixed(1) + ' ' + s);
    if (DBG.length > DEBUG_LINES) DBG.splice(0, DBG.length - DEBUG_LINES);
  }

  // ---- 작은 이벤트 버스 ----
  const HANDLERS = {};
  function on(type, fn) { (HANDLERS[type] || (HANDLERS[type] = [])).push(fn); return () => off(type, fn); }
  function off(type, fn) { const a = HANDLERS[type]; if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  function emit(type, data) { for (const fn of (HANDLERS[type] || []).slice()) { try { fn(data); } catch (e) { console.warn('[net]', type, e); } } }

  // ---- 서버 주소 ----
  // 쿼리 ?net= 가 최우선(off · ws(s)://… · clear), 그다음 저장값(localStorage dk_net), 호스트 규칙, window.DK_NET_URL
  function parseSearch(search) {
    const out = {}, s = String(search || '').replace(/^\?/, '');
    if (!s) return out;
    for (const part of s.split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      const k = i < 0 ? part : part.slice(0, i), v = i < 0 ? '' : part.slice(i + 1);
      try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (_) { out[k] = v; }
    }
    return out;
  }
  const isWsUrl = (u) => /^wss?:\/\/\S+$/i.test(String(u || ''));
  const trimUrl = (u) => String(u).trim().replace(/\/+$/, '');
  // 순수 함수(테스트용): hostname · location.search · 저장값 · 마지막 폴백(window.DK_NET_URL)
  function _resolveUrl(hostname, search, stored, fallback) {
    const q = parseSearch(search), net = q.net != null ? String(q.net).trim() : null;
    if (net === 'off') return null;
    if (net && isWsUrl(net)) return trimUrl(net);
    if (net !== 'clear' && stored && isWsUrl(stored)) return trimUrl(stored);
    const h = String(hostname || '').toLowerCase();
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(h)) return 'ws://localhost:8787';
    const m = /^(?:[a-z0-9-]+-)?dicekeep\.([^.]+)\.workers\.dev$/.exec(h);   // 운영 dicekeep.<acct> · 브랜치 프리뷰 <br>-dicekeep.<acct>
    if (m) return 'wss://dicekeep-net.' + m[1] + '.workers.dev';
    return (fallback && isWsUrl(fallback)) ? trimUrl(fallback) : null;
  }
  function resolveUrl() {
    let hostname = '', search = '';
    try { if (W.location) { hostname = W.location.hostname || ''; search = W.location.search || ''; } } catch (_) {}
    const q = parseSearch(search), net = q.net != null ? String(q.net).trim() : null;
    if (net && isWsUrl(net)) sSet(LS(), 'dk_net', trimUrl(net));        // ?net=ws://… 는 기억한다
    else if (net === 'clear') sDel(LS(), 'dk_net');                     // ?net=clear 로 잊는다
    return _resolveUrl(hostname, search, sGet(LS(), 'dk_net'), W.DK_NET_URL);
  }
  // 게임 버전 = index.html 의 <script src="net.js?v=NN"> 값 (서버가 방 안 버전 일치를 검사한다)
  function scriptVer() {
    try {
      const src = (DOC && DOC.currentScript && DOC.currentScript.src) || '';
      const m = /[?&]v=([^&#]+)/.exec(src);
      return m ? decodeURIComponent(m[1]).slice(0, 8) : '0';
    } catch (_) { return '0'; }
  }

  const CFG = {
    protocol: PROTOCOL,
    ver: scriptVer(),
    url: resolveUrl(),        // null 이면 멀티 비활성 (game.js 가 접속 전에 바꿔도 된다)
    sumInterval: 2000,        // game.js 의 sum 송신 주기 (벽시계 setInterval)
    renderDelay: 100,         // 시뮬 클록 렌더 지연 (frameNet 의 target 계산)
    pingEvery: 25000,         // keepalive 'ping' 문자열
    timeEvery: 30000,         // playing 중 시각 재측정 주기
  };

  // ---- 이름·코드 정규화 (서버 proto.js 와 같은 규칙) ----
  // trim → 제어문자·<> 제거 → 연속 공백 1개 → 1~12자(초과 절단) → 비면 '플레이어-' + pid 앞 4자
  function sanitizeName(name, pid) {
    let s = String(name == null ? '' : name).trim();
    s = s.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').replace(/\s+/g, ' ').trim();
    s = s.slice(0, 12).trim();
    return s || ('플레이어-' + String(pid || '').slice(0, 4));
  }
  const normCode = (code) => String(code == null ? '' : code).toUpperCase().replace(/[^A-Z0-9]/g, '');

  // ---- 오류 ----
  function netError(code, msg) { const e = new Error(msg || code); e.code = code; return e; }
  function closeError(code, reason) { return netError(CLOSE_NAME[code] || 'closed', reason || ('연결이 닫혔습니다 (' + code + ')')); }

  // ---- 좌석 (탭 단위) ----
  function randBytes(n) {
    const a = new Uint8Array(n);
    try { if (typeof crypto !== 'undefined' && crypto.getRandomValues) { crypto.getRandomValues(a); return a; } } catch (_) {}
    for (let i = 0; i < n; i++) a[i] = (Math.random() * 256) | 0;
    return a;
  }
  function randId(n) { const A = 'abcdefghijklmnopqrstuvwxyz0123456789', b = randBytes(n); let s = ''; for (let i = 0; i < n; i++) s += A[b[i] % A.length]; return s; }
  function randHex(n) { const b = randBytes(n / 2); let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  function identity() {
    if (R.id) return R.id;
    let id = null;
    try { id = JSON.parse(sGet(SS(), 'dk_mp_id') || 'null'); } catch (_) { id = null; }
    if (!id || !PID_RE.test(String(id.pid)) || !KEY_RE.test(String(id.key))) {
      id = { pid: randId(8), key: randHex(32) };
      sSet(SS(), 'dk_mp_id', JSON.stringify(id));
    }
    R.id = { pid: String(id.pid), key: String(id.key) };
    return R.id;
  }
  // 마지막 방 (새로고침 뒤 resume 용)
  function saveSession() { if (R.code && R.id) sSet(SS(), 'dk_mp', JSON.stringify({ code: R.code, pid: R.id.pid, key: R.id.key, name: R.name })); }
  function loadSession() {
    try {
      const o = JSON.parse(sGet(SS(), 'dk_mp') || 'null');
      if (o && CODE_RE.test(String(o.code)) && PID_RE.test(String(o.pid)) && KEY_RE.test(String(o.key))) return { code: String(o.code), pid: String(o.pid), key: String(o.key), name: String(o.name || '') };
    } catch (_) {}
    return null;
  }
  const forgetSession = () => sDel(SS(), 'dk_mp');

  // ---- 상태 ----
  const R = {
    state: 'offline',    // offline | connecting | lobby | playing | ended | reconnecting
    id: null,            // { pid, key }
    name: '',            // 내가 요청한 이름(정규화 뒤) — hello 에 실린다
    me: null,            // { pid, name } — name 은 서버가 확정한 것(중복 접미 포함)
    room: null,          // 마지막 room 스냅샷 미러 { code, phase, hostId, ver, now, players[], game|null }
    code: null,
    sock: null,          // { ws, op, retry, welcomed, timer }
    pending: null,       // { resolve, reject } — welcome 을 기다리는 create/join/resume
    attempt: 0,          // 재접속 시도 횟수 (welcome 에서 0)
    retryTimer: null,
    pingTimer: null, timeTimer: null,
  };
  function setState(s) { if (R.state === s) return; dbg('state ' + R.state + ' → ' + s); R.state = s; emit('net:state', s); }
  function syncState() {
    const ph = R.room && R.room.phase;
    setState(ph === 'playing' ? 'playing' : ph === 'ended' ? 'ended' : 'lobby');
  }
  function goOffline(code, reason) { setState('offline'); emit('net:closed', { code, reason: reason || '' }); }

  // ---- 시각 동기 ----
  // offset = s − (c + now)/2 · rtt = now − c. 최근 8개 중 rtt 최소 표본 채택. 500ms 이상 튀면(지연 편차로 설명되지 않을 때) 초기화 후 재측정
  const T = { samples: [], offset: 0, rtt: null, burst: 0, burstTimer: null };
  function timeSend() { return sendRaw({ t: 'time', c: now() }); }
  function timeTick() {
    if (T.burst <= 0 || T.burstTimer) return;
    T.burst--;
    timeSend();
    T.burstTimer = setTimeout(() => { T.burstTimer = null; timeTick(); }, TIME_GAP);
  }
  function timeBurst(n) { T.burst = Math.max(T.burst, n); timeTick(); }
  function seedOffset(at) {                       // 표본이 없을 때 서버 at 로 대충 맞춘다 (오차 ≤ 편도 지연)
    if (T.rtt != null || !isFinite(at)) return;
    T.offset = at - now();
    emit('net:offset', { offset: T.offset, rtt: null });
  }
  function onTime(m) {
    const t = now(), c = +m.c, s = +(m.s != null ? m.s : m.at);
    if (!isFinite(c) || !isFinite(s) || t < c) return;
    const rtt = t - c, off = s - (c + t) / 2;
    if (T.rtt != null && Math.abs(off - T.offset) >= TIME_JUMP && Math.abs(off - T.offset) > (rtt + T.rtt) / 2) {
      dbg('offset jump ' + Math.round(off - T.offset));
      T.samples = [];
      timeBurst(TIME_BURST);
    }
    T.samples.push({ rtt, off });
    if (T.samples.length > TIME_SAMPLES) T.samples.shift();
    let best = T.samples[0];
    for (const x of T.samples) if (x.rtt < best.rtt) best = x;
    const changed = T.rtt == null || best.off !== T.offset || best.rtt !== T.rtt;
    T.offset = best.off; T.rtt = best.rtt;
    if (changed) { dbg('offset ' + Math.round(T.offset) + ' rtt ' + Math.round(T.rtt)); emit('net:offset', { offset: T.offset, rtt: T.rtt }); }
  }
  const serverNow = () => now() + T.offset;

  // ---- 송신 ----
  function utf8Len(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function sendRaw(m) {
    const s = R.sock;
    if (!s || !s.ws || s.ws.readyState !== WS_OPEN) return false;
    const text = typeof m === 'string' ? m : JSON.stringify(m);
    if (utf8Len(text) > MAX_BYTES) { dbg('drop oversize ' + (m && m.t)); return false; }
    try { s.ws.send(text); } catch (_) { return false; }
    if (typeof m !== 'string') dbg('> ' + m.t + (m.t === 'chat' || m.t === 'log' ? ' ' + m.text : ''));
    return true;
  }
  function send(t, fields) {
    if (typeof t !== 'string' || !t) return false;
    return sendRaw(Object.assign({ t }, fields || {}, { t }));
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const int = (v, lo, hi) => { const n = Math.round(+v); return isFinite(n) ? clamp(n, lo, hi) : lo; };
  const num = (v, lo, hi, dp) => { const n = +v; if (!isFinite(n)) return lo; const p = Math.pow(10, dp || 0); return clamp(Math.round(n * p) / p, lo, hi); };

  // ---- 타이머 ----
  function armTimers() {
    disarmTimers();
    R.pingTimer = setInterval(() => sendRaw('ping'), CFG.pingEvery);
    R.timeTimer = setInterval(() => { if (R.state === 'playing') timeSend(); }, CFG.timeEvery);
  }
  function disarmTimers() {
    if (R.pingTimer) { clearInterval(R.pingTimer); R.pingTimer = null; }
    if (R.timeTimer) { clearInterval(R.timeTimer); R.timeTimer = null; }
    if (T.burstTimer) { clearTimeout(T.burstTimer); T.burstTimer = null; }
    T.burst = 0;
  }
  function clearRetry() { if (R.retryTimer) { clearTimeout(R.retryTimer); R.retryTimer = null; } }

  // ---- 소켓 ----
  // 소켓을 조용히 버린다: 핸들러를 떼어 onClose 가 돌지 않게 한 뒤 닫는다
  function dropSocket(code, reason) {
    const s = R.sock;
    if (!s) return;
    R.sock = null;
    clearTimeout(s.timer);
    disarmTimers();
    try { s.ws.onopen = s.ws.onmessage = s.ws.onerror = s.ws.onclose = null; } catch (_) {}
    try { if (s.ws.readyState === 0 || s.ws.readyState === WS_OPEN) s.ws.close(code, reason); } catch (_) {}
    dbg('drop ' + code + ' ' + (reason || ''));
  }
  // 새 접속 (create/join/resume). 이전 소켓·재접속은 버린다
  function open(path, op, name) {
    if (!CFG.url) return Promise.reject(netError('offline', '멀티 서버 주소가 없습니다'));
    dropSocket(1000, 'reopen');
    clearRetry();
    if (R.pending) { const p = R.pending; R.pending = null; p.reject(netError('replaced', '다른 접속으로 바뀌었습니다')); }
    R.attempt = 0; R.room = null; R.code = null;
    const id = identity();
    R.name = sanitizeName(name != null ? name : R.name, id.pid);
    R.me = { pid: id.pid, name: R.name };
    setState('connecting');
    return connect(path, op, false);
  }
  function connect(path, op, retry) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(trimUrl(CFG.url) + path); }
      catch (e) { reject(netError('closed', '소켓을 열 수 없습니다')); if (!retry) setState('offline'); else scheduleReconnect(); return; }
      const sock = { ws, op, retry, welcomed: false, timer: null };
      R.sock = sock;
      R.pending = { resolve, reject };
      dbg('open ' + path + (retry ? ' 재접속 ' + R.attempt : ''));
      sock.timer = setTimeout(() => fail(sock, 'timeout', '서버가 응답하지 않습니다'), CONNECT_TIMEOUT);
      ws.onopen = () => {
        if (R.sock !== sock) return;
        clearTimeout(sock.timer);
        sock.timer = setTimeout(() => fail(sock, 'timeout', '서버가 응답하지 않습니다'), HELLO_TIMEOUT);
        sendRaw({ t: 'hello', v: CFG.protocol, ver: CFG.ver, op, pid: R.id.pid, key: R.id.key, name: R.name });
      };
      ws.onmessage = (ev) => { if (R.sock === sock) onMessage(sock, ev && ev.data); };
      ws.onerror = () => { if (R.sock === sock) dbg('ws error'); };
      ws.onclose = (ev) => onClose(sock, ev ? ev.code : 1006, ev ? ev.reason : '');
    });
  }
  // welcome 전 실패(타임아웃 등): 호출자에게 알리고 소켓을 버린다. 재접속 시도 중이었다면 백오프를 잇는다
  function fail(sock, code, msg) {
    if (R.sock !== sock) return;
    dbg('fail ' + code);
    const pending = R.pending; R.pending = null;
    if (pending) pending.reject(netError(code, msg));
    dropSocket(1000, code);
    if (sock.retry) scheduleReconnect();
    else setState('offline');
  }
  function onClose(sock, code, reason) {
    if (R.sock !== sock) return;                     // 이미 버린 소켓
    clearTimeout(sock.timer);
    R.sock = null;
    disarmTimers();
    dbg('closed ' + code + ' ' + (reason || ''));
    const pending = R.pending; R.pending = null;
    if (pending) pending.reject(closeError(code, reason));
    const wasIn = R.state === 'lobby' || R.state === 'playing' || R.state === 'reconnecting';
    if (wasIn && R.code && !NO_RETRY[code]) { scheduleReconnect(); return; }
    if (FORGET_CLOSE[code]) forgetSession();
    if (R.state === 'connecting') { setState('offline'); return; }   // 첫 접속 실패 — promise 로 이미 알렸다
    goOffline(code, reason);
  }
  function scheduleReconnect() {
    clearRetry();
    const delay = BACKOFF[Math.min(R.attempt, BACKOFF.length - 1)];
    R.attempt++;
    setState('reconnecting');
    dbg('reconnect ' + R.attempt + ' in ' + delay);
    emit('net:reconnecting', { attempt: R.attempt, delay });
    R.retryTimer = setTimeout(reconnectNow, delay);
  }
  function reconnectNow() {
    clearRetry();
    if (R.state !== 'reconnecting' || !R.code || R.sock) return;
    connect('/ws/room/' + R.code, 'join', true).then(null, () => {});   // 결과는 onClose/onWelcome 이 처리
  }
  // 화면 복귀·online: 재접속 대기 중이면 즉시, 붙어 있으면 시각 재측정
  function onWake() {
    if (R.state === 'reconnecting') { if (!R.sock) reconnectNow(); return; }
    if (R.sock && R.sock.welcomed) timeBurst(TIME_BURST);
  }
  try {
    if (DOC && typeof DOC.addEventListener === 'function') DOC.addEventListener('visibilitychange', () => { if (DOC.visibilityState !== 'hidden') onWake(); });
    if (typeof W.addEventListener === 'function') W.addEventListener('online', onWake);
  } catch (_) {}

  // ---- 수신 ----
  function onMessage(sock, data) {
    if (data === 'pong' || typeof data !== 'string') return;
    let m;
    try { m = JSON.parse(data); } catch (_) { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (!sock.welcomed && m.t !== 'welcome' && m.t !== 'err') return;
    dbg('< ' + m.t + (m.t === 'err' ? ' ' + m.code : m.t === 'chat' || m.t === 'log' ? ' ' + m.text : ''));
    switch (m.t) {                                   // 허용목록 — 모르는 종류는 버린다
      case 'welcome': onWelcome(sock, m); break;
      case 'err': onErr(sock, m); break;
      case 'room': mirrorRoom(m); syncState(); emit('room', m); break;
      case 'player': mirrorPlayer(m); emit('player', m); break;
      case 'start': mirrorStart(m); setState('playing'); emit('start', m); break;
      case 'sched': mirrorSched(m); emit('sched', m); break;
      case 'hold': mirrorHold(m); emit('hold', m); break;
      case 'end': mirrorEnd(m); setState('ended'); emit('end', m); break;
      case 'time': onTime(m); emit('time', m); break;
      case 'sum': case 'chat': case 'log': emit(m.t, m); break;
      default: break;
    }
  }
  function onWelcome(sock, m) {
    sock.welcomed = true;
    clearTimeout(sock.timer);
    if (m.code) R.code = String(m.code);
    R.room = mirrorFrom(m.room);
    R.attempt = 0;
    seedOffset(+m.at);
    saveSession();
    syncState();
    armTimers();
    const pending = R.pending; R.pending = null;
    emit('welcome', m);
    emit('room', Object.assign({ t: 'room', at: m.at }, R.room));   // 재접속도 평소처럼 room 한 번
    if (pending) pending.resolve(R.room);
    timeBurst(TIME_BURST);
  }
  // welcome 전 err = 거절(promise reject, 서버가 곧 닫는다). 그 뒤의 err 는 경고(not-host·not-ready·rate·name…) → 'err' 이벤트
  function onErr(sock, m) {
    const code = String(m.code || 'bad-request');
    if (!sock.welcomed && R.pending && !sock.retry) {
      const p = R.pending; R.pending = null;
      p.reject(netError(code, m.msg));
      if (FORGET_ERR[code]) forgetSession();
      return;
    }
    emit('err', m);
  }

  // ---- room 미러 ----
  function mirrorFrom(src) {
    const r = Object.assign({}, src || {});
    delete r.t; delete r.at;
    if (!r.code) r.code = R.code;
    if (!Array.isArray(r.players)) r.players = [];
    if (r.game && typeof r.game === 'object') { if (!Array.isArray(r.game.waveAts)) r.game.waveAts = [null]; fillNull(r.game.waveAts); }
    else r.game = null;
    updateMe(r);
    return r;
  }
  function fillNull(a) { for (let i = 0; i < a.length; i++) if (a[i] === undefined) a[i] = null; }
  function updateMe(r) {
    if (!R.me) return;
    const p = r.players.find((x) => x && x.pid === R.me.pid);
    if (p && p.name) R.me.name = String(p.name);
  }
  function mirrorRoom(m) { if (m.code) R.code = String(m.code); R.room = mirrorFrom(m); }
  function mirrorPlayer(m) {
    if (!R.room || !m.pid) return;
    let p = R.room.players.find((x) => x && x.pid === m.pid);
    if (!p) { p = { pid: m.pid }; R.room.players.push(p); }
    for (const k in m) if (k !== 't' && k !== 'at' && k !== 'pid') p[k] = m[k];
    if (R.me && m.pid === R.me.pid && m.name) R.me.name = String(m.name);
  }
  function mirrorStart(m) {
    if (!R.room) R.room = mirrorFrom({ code: R.code });
    R.room.phase = 'playing';
    R.room.game = Object.assign({}, R.room.game || {}, { t0: m.t0, timing: m.timing, seed: m.seed, wave: 0, waveAts: [null], hold: null, endAt: null });
    for (const p of R.room.players) if (p) p.status = 'alive';
  }
  // sched 는 웨이브 번호로 멱등 — 한 번 받은 T 는 바꾸지 않는다
  function mirrorSched(m) {
    const g = R.room && R.room.game;
    if (!g || !Array.isArray(m.ats)) return;
    const from = m.from | 0;
    if (!Array.isArray(g.waveAts)) g.waveAts = [null];
    for (let i = 0; i < m.ats.length; i++) { const n = from + i; if (n >= 1 && g.waveAts[n] == null) g.waveAts[n] = m.ats[i]; }
    fillNull(g.waveAts);
  }
  function mirrorHold(m) {
    const g = R.room && R.room.game;
    if (!g) return;
    g.hold = { w: m.w, deadline: m.deadline, waiting: Array.isArray(m.waiting) ? m.waiting : [], done: Array.isArray(m.done) ? m.done : [], released: !!m.released };
  }
  function mirrorEnd(m) {
    if (!R.room) return;
    R.room.phase = 'ended';
    const g = R.room.game || (R.room.game = { waveAts: [null] });
    g.reason = m.reason; g.ranking = Array.isArray(m.ranking) ? m.ranking : []; g.endedAt = m.at;
    if (m.seed != null) g.seed = m.seed;
    for (const e of g.ranking) {
      if (!e || !e.pid) continue;
      let p = R.room.players.find((x) => x && x.pid === e.pid);
      if (!p) { p = { pid: e.pid, name: e.name }; R.room.players.push(p); }
      if (e.rank != null) p.rank = e.rank;
      if (e.status) p.status = e.status;
      if (e.wave != null) p.wave = e.wave;
      if (e.kills != null) p.kills = e.kills;
    }
  }

  // ---- 공개 API ----
  function create(name) { return open('/ws/new', 'create', name); }
  function join(code, name) {
    const c = normCode(code);
    if (!CODE_RE.test(c)) return Promise.reject(netError('bad-code', '방 코드는 6자리입니다'));
    return open('/ws/room/' + c, 'join', name);
  }
  // sessionStorage dk_mp 가 있으면 같은 좌석으로 재접속, 없으면 null. 방이 사라졌으면 세션을 지우고 reject
  function resume() {
    const s = loadSession();
    if (!s) return Promise.resolve(null);
    if (!CFG.url) return Promise.reject(netError('offline', '멀티 서버 주소가 없습니다'));
    R.id = { pid: s.pid, key: s.key };
    sSet(SS(), 'dk_mp_id', JSON.stringify(R.id));
    return open('/ws/room/' + s.code, 'join', s.name);
  }
  // 나가기: leave 전송 → 4000 으로 닫음(서버도 4000 을 '의도한 이탈' 로 본다) → offline, 세션 삭제, 재접속 없음
  function leave() {
    const had = R.state !== 'offline' || !!R.sock;
    clearRetry();
    forgetSession();
    if (R.pending) { const p = R.pending; R.pending = null; p.reject(netError('left', '나갔습니다')); }
    if (R.sock) { sendRaw({ t: 'leave' }); dropSocket(4000, 'leave'); }
    R.room = null; R.code = null; R.attempt = 0;
    if (had) goOffline(4000, 'leave'); else setState('offline');
  }
  const start = () => send('start', {});
  // 요약 — 서버 스키마 범위로 자르고(위반은 서버가 폐기한다) 타워는 최대 15개
  function sum(o) {
    o = o || {};
    const tw = (Array.isArray(o.tw) ? o.tw : []).slice(0, 15)
      .filter((t) => Array.isArray(t) && t.length >= 3)
      .map((t) => [int(t[0], 0, 14), int(t[1], 1, 20), int(t[2], 1, 3)]);
    const m = {
      w: int(o.w, 0, 101), dw: int(o.dw, 0, 101), l: int(o.l, 0, 20), g: int(o.g, 0, 1e7), k: int(o.k, 0, 1e6), f: int(o.f, 0, 200),
      lag: num(o.lag, 0, 3600, 1),
      hid: o.hid == null ? ((DOC && DOC.hidden) ? 1 : 0) : (o.hid ? 1 : 0),
      b: o.b == null ? null : num(o.b, 0, 1, 3),
      o: o.o === 'p' ? 'p' : 'l',
      tw,
    };
    return send('sum', m);
  }
  const done = (w) => send('done', { w: int(w, 0, 101) });
  const dead = (w, k, r) => send('dead', { w: int(w, 0, 101), k: int(k, 0, 1e6), r: DEAD_REASONS.indexOf(r) >= 0 ? r : 'lives' });
  const clear = (w, k) => send('clear', { w: int(w, 0, 101), k: int(k, 0, 1e6) });
  function chat(text) {
    const s = String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 120);
    return s ? send('chat', { text: s }) : false;
  }
  function log(text, kind) {
    const s = String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 120);
    return s ? send('log', { text: s, kind: LOG_KINDS.indexOf(kind) >= 0 ? kind : 'sys' }) : false;
  }
  const isHost = () => !!(R.room && R.me && R.room.hostId === R.me.pid);
  const inRoom = () => R.state === 'lobby' || R.state === 'playing' || R.state === 'ended';
  const inGame = () => R.state === 'playing';
  const members = () => (R.room && Array.isArray(R.room.players)) ? R.room.players : [];

  return {
    CFG, on, off, emit,
    create, join, resume, start, leave,
    sum, done, dead, clear, chat, log, send,
    serverNow, offset: () => T.offset, rtt: () => T.rtt,
    get state() { return R.state; },
    get me() { return R.me; },
    get room() { return R.room; },
    get code() { return R.code; },
    isHost, inRoom, inGame, members,
    normCode, sanitizeName,
    _resolveUrl, _debug: () => DBG.slice(),
  };
})();
