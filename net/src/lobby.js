// ==================== Lobby Durable Object 어댑터 (빠른 매칭) ====================
// 단일 객체(idFromName('quick')). Hibernation WebSocket API 로 대기 소켓을 받고, 규칙은 전부 lobby-core 에 있다.
//   /quota (POST)   Worker 가 /ws/new 전에 시간당 방 생성 상한을 확인한다 → 200 { ok:true } | 429
//   업그레이드       WebSocketPair → acceptWebSocket → sid 부여(attachment { sid }) → hello 뒤 { sid, pid, key, name, ver, since }
//   묶이면          claimRoom(env.ROOM, { kind:'quick', ver, reserve }) 으로 방을 만들고 matched{code} 뒤 4000
// 저장은 'quota'(타임스탬프 배열) 하나. 대기열은 소켓 attachment 로 복원한다.
import { DurableObject } from 'cloudflare:workers';
import { LobbyHost } from './host.js';
import { claimRoom } from './claim.js';
import { CLOSE } from './proto.js';
import { RESERVE_TTL } from './timing.js';

function attOf(ws) {
  try { return ws.deserializeAttachment() || null; } catch (e) { return null; }
}

function newSid() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.socks = new Map();
    this.host = new LobbyHost({
      now: () => Date.now(),
      send: (sid, text) => { const ws = this.socks.get(sid); if (ws) { try { ws.send(text); } catch (e) { /* 이미 닫힘 */ } } },
      close: (sid, code, reason) => {
        const ws = this.socks.get(sid);
        if (!ws) return;
        this.socks.delete(sid);
        try { ws.close(code, reason); } catch (e) { try { ws.close(CLOSE.BAD_REQUEST, reason); } catch (e2) { /* 무시 */ } }
      },
      setAlarm: (ts) => { if (ts == null) this.ctx.storage.deleteAlarm(); else this.ctx.storage.setAlarm(ts); },
      log: (o) => console.log(JSON.stringify(o)),
      putQuota: (q) => this.ctx.storage.put('quota', q),
      claim: async ({ ver, mode, players }) => {
        const r = await claimRoom(this.env.ROOM, { kind: 'quick', ver, mode, reserve: { players, until: Date.now() + RESERVE_TTL } });
        return r.ok ? { ok: true, code: r.code } : { ok: false, err: r.error };
      },
    });
    ctx.blockConcurrencyWhile(async () => {
      const quota = (await ctx.storage.get('quota')) || [];
      const atts = [];
      for (const ws of ctx.getWebSockets()) {
        const a = attOf(ws);
        if (a && a.sid) { atts.push(a); this.socks.set(a.sid, ws); }
        else { try { ws.close(CLOSE.BAD_REQUEST, 'no-attachment'); } catch (e) { /* 무시 */ } }
      }
      this.host.load(atts, quota);
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/quota') {
      const ok = await this.host.quota();
      return new Response(JSON.stringify(ok ? { ok: true } : { error: 'rate' }), { status: ok ? 200 : 429, headers: { 'content-type': 'application/json' } });
    }
    if (String(req.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const sid = newSid();
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ sid });
      this.socks.set(sid, server);
      await this.host.open(sid);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response(JSON.stringify({ error: 'not-found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }

  async webSocketMessage(ws, data) {
    const att = attOf(ws);
    if (!att || !att.sid) { try { ws.close(CLOSE.BAD_REQUEST, 'no-attachment'); } catch (e) { /* 무시 */ } return; }
    if (!this.socks.has(att.sid)) this.socks.set(att.sid, ws);
    const r = await this.host.message(att.sid, att, data);
    if (r && r.att) ws.serializeAttachment(r.att);
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
