// ==================== 멀티 준비 계층 (서버 없는 P2P) ====================
// 설계: 서버는 게임 배포와 '매칭 · 리더보드' 만 맡는다. 게임 진행은 방 안의 피어끼리 직접 주고받는다.
//   1) 매칭      — 시그널 서버에 대기열 등록 → 비슷한 시각의 플레이어 N명이 후보 그룹이 된다
//   2) 호스트 선출 — 후보끼리 핑을 재서 '상태가 가장 좋은' 1명이 호스트. 호스트가 방(권위 상태)을 판다
//   3) 진행      — 나머지는 호스트의 데이터 채널에 붙어 입력·채팅·로그를 주고받는다
//   4) 호스트 이탈 — 남은 피어끼리 다시 선출(호스트 마이그레이션)
// 이 파일은 '연결 계층' 만 담는다. 게임 규칙·상태 동기화는 game.js 가 훅으로 붙인다.
// 시그널 서버가 없으면 상태는 'offline' 그대로이고 게임은 완전한 싱글로 돌아간다.
window.DKNET = (function () {
  'use strict';

  const CFG = {
    signalUrl: null,          // 예: 'wss://.../match' — 없으면 오프라인(싱글)
    roomSize: 4,              // 한 방 최대 인원
    pingSamples: 5,           // 호스트 선출용 핑 표본 수
    pingTimeout: 2500,
    hostRetry: 3,             // 호스트 이탈 시 재선출 시도
    protocol: 1,              // 메시지 프로토콜 버전 (다르면 붙지 않는다)
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
  };

  const S = {
    state: 'offline',         // offline | matching | electing | connecting | in-room
    me: null,                 // { id, name, score }
    room: null,               // { id, hostId, members: Map<id, peer> }
    signal: null,
    seq: 0,
  };

  // ---- 작은 이벤트 버스 ----
  const HANDLERS = {};
  function on(type, fn) { (HANDLERS[type] || (HANDLERS[type] = [])).push(fn); return () => off(type, fn); }
  function off(type, fn) { const a = HANDLERS[type]; if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  function emit(type, data) { for (const fn of (HANDLERS[type] || []).slice()) { try { fn(data); } catch (e) { console.warn('[net]', type, e); } } }

  const rid = () => Math.random().toString(36).slice(2, 10);

  // ---- 연결 품질 점수: 낮을수록 호스트에 적합 ----
  // 왕복 지연의 중앙값 + 흔들림(지터) + 표본 손실 페널티. 값이 같으면 id 사전순으로 결정적으로 고른다.
  function qualityScore(samples, lost) {
    if (!samples || !samples.length) return Infinity;
    const s = samples.slice().sort((a, b) => a - b);
    const med = s[Math.floor(s.length / 2)];
    const jit = s[s.length - 1] - s[0];
    return med + jit * 0.5 + (lost || 0) * 400;
  }

  // 후보 중 호스트 1명 선출 (점수 → id 순). 후보는 { id, score } 배열
  function electHost(cands) {
    let best = null;
    for (const c of cands) {
      if (!c || !isFinite(c.score)) continue;
      if (!best || c.score < best.score - 1e-9 || (Math.abs(c.score - best.score) <= 1e-9 && String(c.id) < String(best.id))) best = c;
    }
    return best ? best.id : null;
  }

  // ---- 시그널 어댑터 ----
  // 실제 서버가 붙기 전까지는 같은 브라우저 안에서만 도는 루프백을 쓴다(테스트용).
  // 서버가 생기면 같은 인터페이스로 WebSocket 어댑터만 갈아끼우면 된다.
  function LoopbackSignal() {
    const bus = (window.__DKNET_BUS = window.__DKNET_BUS || { peers: new Map(), queue: [] });
    return {
      kind: 'loopback',
      connect(me) { bus.peers.set(me.id, this); this.me = me; return Promise.resolve(); },
      close() { if (this.me) bus.peers.delete(this.me.id); },
      enqueue(profile) {                                  // 대기열 등록 → 후보 목록을 돌려준다
        bus.queue.push(profile);
        const group = bus.queue.slice(0, CFG.roomSize);
        return Promise.resolve(group);
      },
      send(to, msg) { const p = bus.peers.get(to); if (p && p.onmessage) p.onmessage(msg); },
      onmessage: null,
    };
  }

  function WebSocketSignal(url) {
    let ws = null;
    const self = {
      kind: 'ws',
      connect(me) {
        this.me = me;
        return new Promise((res, rej) => {
          ws = new WebSocket(url);
          ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', id: me.id, name: me.name, v: CFG.protocol })); res(); };
          ws.onerror = (e) => rej(e);
          ws.onmessage = (ev) => { let m = null; try { m = JSON.parse(ev.data); } catch (_) { return; } if (self.onmessage) self.onmessage(m); };
          ws.onclose = () => emit('signal-closed', null);
        });
      },
      close() { if (ws) { try { ws.close(); } catch (_) {} ws = null; } },
      enqueue(profile) {
        return new Promise((res) => {
          const done = (m) => { if (m && m.t === 'candidates') { off('signal-msg', done); res(m.list || []); } };
          on('signal-msg', done);
          ws.send(JSON.stringify({ t: 'queue', profile }));
        });
      },
      send(to, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'relay', to, msg })); },
      onmessage: null,
    };
    return self;
  }

  // ---- 피어 (WebRTC 데이터 채널) ----
  // 시그널 서버는 SDP·ICE 를 중계만 한다. 연결된 뒤로는 서버를 거치지 않는다.
  function Peer(id, initiator) {
    const p = { id, initiator, pc: null, ch: null, open: false, rtt: [], lost: 0, name: id };
    if (typeof RTCPeerConnection !== 'function') return p;  // 지원 안 하는 환경: 껍데기만
    p.pc = new RTCPeerConnection({ iceServers: CFG.iceServers });
    p.pc.onicecandidate = (e) => { if (e.candidate) sig().send(id, { t: 'ice', from: S.me.id, c: e.candidate }); };
    p.pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(p.pc.connectionState)) dropPeer(id);
    };
    const bind = (ch) => {
      p.ch = ch;
      ch.onopen = () => { p.open = true; emit('peer-open', p); };
      ch.onclose = () => { p.open = false; emit('peer-close', p); };
      ch.onmessage = (ev) => { let m = null; try { m = JSON.parse(ev.data); } catch (_) { return; } onPeerMessage(p, m); };
    };
    if (initiator) bind(p.pc.createDataChannel('dk', { ordered: true }));
    else p.pc.ondatachannel = (e) => bind(e.channel);
    return p;
  }

  const sig = () => S.signal || (S.signal = CFG.signalUrl ? WebSocketSignal(CFG.signalUrl) : LoopbackSignal());

  function dropPeer(id) {
    if (!S.room) return;
    const p = S.room.members.get(id);
    if (!p) return;
    S.room.members.delete(id);
    emit('peer-left', p);
    if (id === S.room.hostId) reElectHost();           // 호스트가 나갔다 → 재선출
  }

  // ---- 메시지 ----
  // 봉투: { v: 프로토콜, t: 종류, f: 보낸 id, s: 순번, d: 데이터 }
  function envelope(type, data) { return { v: CFG.protocol, t: type, f: S.me ? S.me.id : null, s: ++S.seq, d: data }; }
  function onPeerMessage(peer, m) {
    if (!m || m.v !== CFG.protocol) return;
    if (m.t === 'ping') { send(peer.id, 'pong', m.d); return; }
    if (m.t === 'pong') { const dt = Date.now() - (m.d && m.d.at || 0); if (dt >= 0) peer.rtt.push(dt); return; }
    emit(m.t, { from: peer, data: m.d, seq: m.s });     // chat · log · state · input …
    emit('message', { from: peer, type: m.t, data: m.d });
  }
  function send(to, type, data) {
    const p = S.room && S.room.members.get(to);
    if (!p || !p.open) return false;
    p.ch.send(JSON.stringify(envelope(type, data)));
    return true;
  }
  function broadcast(type, data) {
    if (!S.room) return 0;
    let n = 0;
    for (const p of S.room.members.values()) if (p.open) { p.ch.send(JSON.stringify(envelope(type, data))); n++; }
    return n;
  }

  // ---- 핑: 호스트 선출용 ----
  // 내 회선 품질: 내가 가진 모든 링크의 점수 평균. 0 을 넣으면 모든 피어가 자기 자신을 뽑아
  // 방장이 여러 명이 된다. (완전히 일치된 표를 만들려면 점수를 서로 브로드캐스트하는 라운드가 더 필요하다 — 로드맵)
  function selfScore() {
    if (!S.room || !S.room.members.size) return 0;
    let sum = 0, n = 0;
    for (const p of S.room.members.values()) { const q = qualityScore(p.rtt, 0); if (isFinite(q)) { sum += q; n++; } }
    return n ? sum / n : Infinity;
  }
  function measure(peer) {
    return new Promise((res) => {
      let sent = 0;
      const tick = () => {
        if (sent >= CFG.pingSamples) return res(qualityScore(peer.rtt, CFG.pingSamples - peer.rtt.length));
        sent++;
        send(peer.id, 'ping', { at: Date.now() });
        setTimeout(tick, 120);
      };
      tick();
      setTimeout(() => res(qualityScore(peer.rtt, CFG.pingSamples - peer.rtt.length)), CFG.pingTimeout);
    });
  }

  async function reElectHost() {
    if (!S.room) return;
    S.state = 'electing';
    const cands = [{ id: S.me.id, score: selfScore() }];
    for (const p of S.room.members.values()) cands.push({ id: p.id, score: qualityScore(p.rtt, 0) });
    S.room.hostId = electHost(cands) || S.me.id;
    S.state = 'in-room';
    emit('host', { hostId: S.room.hostId, isHost: isHost() });
  }

  // ---- 공개 API ----
  const isHost = () => !!(S.room && S.me && S.room.hostId === S.me.id);
  const inRoom = () => S.state === 'in-room' && !!S.room;
  const members = () => (S.room ? [S.me].concat(Array.from(S.room.members.values())) : [S.me]).filter(Boolean);

  async function matchmake(name) {
    if (!CFG.signalUrl && !window.DKNET_ALLOW_LOOPBACK) { emit('error', '매칭 서버가 아직 없습니다'); return null; }
    S.me = { id: rid(), name: name || '플레이어', score: 0 };
    S.state = 'matching';
    emit('state', S.state);
    await sig().connect(S.me);
    const cands = await sig().enqueue({ id: S.me.id, name: S.me.name });
    S.room = { id: rid(), hostId: null, members: new Map() };
    S.state = 'connecting';
    emit('state', S.state);
    for (const c of cands) {
      if (!c || c.id === S.me.id) continue;
      S.room.members.set(c.id, Peer(c.id, String(S.me.id) < String(c.id)));
    }
    await new Promise((r) => setTimeout(r, 300));       // 채널이 열릴 여유
    const scored = [];
    for (const p of S.room.members.values()) scored.push({ id: p.id, score: await measure(p) });
    scored.push({ id: S.me.id, score: selfScore() });   // 자기 점수도 실제 링크로 낸다 (0 이면 늘 자기가 방장이 된다)
    S.room.hostId = electHost(scored) || S.me.id;
    S.state = 'in-room';
    emit('state', S.state);
    emit('host', { hostId: S.room.hostId, isHost: isHost() });
    return S.room;
  }

  function leave() {
    if (S.room) for (const p of S.room.members.values()) { try { p.pc && p.pc.close(); } catch (_) {} }
    S.room = null;
    if (S.signal) { S.signal.close(); S.signal = null; }
    S.state = 'offline';
    emit('state', S.state);
  }

  return {
    CFG, on, off, emit,
    matchmake, leave, send, broadcast,
    isHost, inRoom, members,
    get state() { return S.state; },
    get me() { return S.me; },
    get room() { return S.room; },
    // 테스트·설계 검증용 순수 함수
    _qualityScore: qualityScore, _electHost: electHost,
  };
})();
