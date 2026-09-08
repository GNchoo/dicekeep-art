// ==================== Room Durable Object 어댑터 ====================
// 방 하나 = 객체 하나(idFromName(code)). Hibernation WebSocket API 로 소켓을 받고, 규칙은 전부 room-core 에 있다.
//   /claim (POST)   Worker(/ws/new)·Lobby(빠른 매칭)가 코드를 예약할 때. 이미 있으면 409. body { kind, ver?, reserve? }
//   업그레이드       WebSocketPair → acceptWebSocket → sid 부여(attachment { sid, op }) → hello 뒤 { sid, op, pid }
//   webSocket*      RoomHost 로 위임. alarm 도 마찬가지
// 저장은 'room' 키 하나(전이에서만 put). 로그는 한 줄 JSON — 토큰(key)·URL 은 절대 찍지 않는다.
import { DurableObject } from 'cloudflare:workers';
import { RoomHost } from './host.js';
import { timingFor } from './timing.js';
import { CLOSE } from './proto.js';
import { matchMode } from './modes.js';

function attOf(ws) {
  try { return ws.deserializeAttachment() || null; } catch (e) { return null; }
}

function newSid() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.socks = new Map();     // sid → WebSocket (송신용. 하이버네이션 복귀 시 getWebSockets 로 재구성)
    this.host = new RoomHost({
      now: () => Date.now(),
      random32: () => crypto.getRandomValues(new Uint32Array(1))[0],
      send: (sid, text) => { const ws = this.socks.get(sid); if (ws) { try { ws.send(text); } catch (e) { /* 이미 닫힘 */ } } },
      close: (sid, code, reason) => {
        const ws = this.socks.get(sid);
        if (!ws) return;
        this.socks.delete(sid);
        try { ws.close(code, reason); } catch (e) { try { ws.close(CLOSE.BAD_REQUEST, reason); } catch (e2) { /* 무시 */ } }
      },
      put: (state) => this.ctx.storage.put('room', state),
      destroy: async () => { await this.ctx.storage.deleteAll(); await this.ctx.storage.deleteAlarm(); },
      setAlarm: (ts) => { if (ts == null) this.ctx.storage.deleteAlarm(); else this.ctx.storage.setAlarm(ts); },
      log: (o) => console.log(JSON.stringify(o)),
    });
    ctx.blockConcurrencyWhile(async () => {
      const state = (await ctx.storage.get('room')) || null;
      const atts = [];
      for (const ws of ctx.getWebSockets()) {
        const a = attOf(ws);
        if (a && a.sid) { atts.push(a); this.socks.set(a.sid, ws); }
        else { try { ws.close(CLOSE.BAD_REQUEST, 'no-attachment'); } catch (e) { /* 무시 */ } }
      }
      this.host.load(state, atts);
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/claim') {
      const code = req.headers.get('X-DK-Code') || '';
      let body = {};
      try { body = (await req.json()) || {}; } catch (e) { body = {}; }
      const mode = matchMode(body.mode);
      if (!mode) return new Response(JSON.stringify({ error: 'mode' }), { status: 400 });
      const quick = body.kind === 'quick' && body.reserve && Array.isArray(body.reserve.players);
      const r = await this.host.claim({ code, kind: quick ? 'quick' : 'code', mode, timing: timingFor(this.env.TIMING),
                                        ver: quick ? String(body.ver == null ? '' : body.ver) : null, reserve: quick ? body.reserve : null });
      return new Response(JSON.stringify(r), { status: r.ok ? 201 : 409, headers: { 'content-type': 'application/json' } });
    }
    if (String(req.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
      const op = req.headers.get('X-DK-Op') === 'create' ? 'create' : 'join';
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const sid = newSid();
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ sid, op });
      this.socks.set(sid, server);
      await this.host.open(sid, op);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response(JSON.stringify({ error: 'not-found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }

  async webSocketMessage(ws, data) {
    const att = attOf(ws);
    if (!att || !att.sid) { try { ws.close(CLOSE.BAD_REQUEST, 'no-attachment'); } catch (e) { /* 무시 */ } return; }
    if (!this.socks.has(att.sid)) this.socks.set(att.sid, ws);
    const r = await this.host.message(att.sid, att, data);
    if (r && r.pid) ws.serializeAttachment({ ...att, pid: r.pid });
  }

  async webSocketClose(ws) {
    const att = attOf(ws);
    if (!att || !att.sid) return;
    this.socks.delete(att.sid);
    await this.host.closed(att.sid);
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  async alarm() {
    await this.host.alarm();
  }
}
