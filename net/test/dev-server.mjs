#!/usr/bin/env node
// ==================== 테스트 더블: 의존성 없는 최소 WebSocket 서버 ====================
// wrangler dev(workerd) 없이 index.js/room.js 와 같은 라우팅·규칙(room-core · host)을 Node 로 돌린다.
// RFC6455 는 텍스트 프레임·close·ping/pong 만 구현(클라이언트 → 서버 마스킹 필수). 저장은 메모리, 알람은 setTimeout.
//   TIMING=fast PORT=8787 node test/dev-server.mjs
// Origin 규칙·IP 버킷·코드 검사·'ping' 문자열 → 'pong' 자동응답 전부 실서버와 같다.
import http from 'node:http';
import crypto from 'node:crypto';
import { RoomHost } from '../src/host.js';
import { gen, normalize } from '../src/codes.js';
import { originAllowed, routeOf, isUpgrade } from '../src/http.js';
import { BucketMap } from '../src/ratelimit.js';
import { PROTOCOL } from '../src/proto.js';
import { timingFor, IP_NEW_PER_MIN, IP_ROOM_PER_MIN } from '../src/timing.js';

const PORT = +(process.env.PORT || 8787);
const TIMING = timingFor(process.env.TIMING);
const ALLOWED = process.env.ALLOWED_ORIGINS || '';
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_DECLARED = 65536;      // 선언 길이 상한(그 위는 읽지 않고 1009)
const rooms = new Map();         // code → LocalRoom
const buckets = new BucketMap();
const log = (o) => console.log(JSON.stringify(o));

// ---- 프레임 ----
function frame(op, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

// conn.buf 에서 완성된 프레임을 꺼낸다. 선언 길이가 너무 크면 { tooBig:true }
function parseFrames(conn) {
  const out = [];
  for (;;) {
    const b = conn.buf;
    if (b.length < 2) break;
    const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80);
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) break; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) break; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > MAX_DECLARED) { out.push({ tooBig: true }); conn.buf = Buffer.alloc(0); break; }
    if (masked) off += 4;
    if (b.length < off + len) break;
    let payload = b.subarray(off, off + len);
    if (masked) {
      const mask = b.subarray(off - 4, off), p = Buffer.alloc(len);
      for (let i = 0; i < len; i++) p[i] = payload[i] ^ mask[i & 3];
      payload = p;
    }
    conn.buf = b.subarray(off + len);
    out.push({ fin, op, payload, masked });
  }
  return out;
}

class Conn {
  constructor(socket, sid, op) {
    this.socket = socket; this.sid = sid; this.att = { sid, op };
    this.buf = Buffer.alloc(0); this.frag = null; this.closed = false; this.q = Promise.resolve();
  }
  send(text) { if (!this.closed) this.socket.write(frame(1, Buffer.from(text, 'utf8'))); }
  close(code, reason) {
    if (this.closed) return;
    this.closed = true;
    const r = Buffer.from(reason || '', 'utf8'), b = Buffer.alloc(2 + r.length);
    b.writeUInt16BE(code, 0); r.copy(b, 2);
    try { this.socket.write(frame(8, b)); } catch (e) { /* 무시 */ }
    setTimeout(() => this.socket.destroy(), 150);
  }
}

// ---- 방 하나 (Room DO 의 자리) ----
class LocalRoom {
  constructor(code) {
    this.code = code;
    this.conns = new Map();
    this.timer = null;
    this.host = new RoomHost({
      now: () => Date.now(),
      random32: () => crypto.randomBytes(4).readUInt32BE(0),
      send: (sid, text) => { const c = this.conns.get(sid); if (c) c.send(text); },
      close: (sid, code, reason) => { const c = this.conns.get(sid); if (c) c.close(code, reason); },
      put: () => {},
      destroy: () => { clearTimeout(this.timer); this.timer = null; rooms.delete(code); log({ ev: 'room.destroy', code, stats: this.host.stats }); },
      setAlarm: (ts) => {
        clearTimeout(this.timer); this.timer = null;
        if (ts != null) this.timer = setTimeout(() => this.host.alarm().catch((e) => log({ ev: 'alarm.error', code, err: String(e) })), Math.max(0, ts - Date.now()));
      },
      log,
    });
  }
  gc() {   // 존재하지 않는 코드로 들어온 소켓용 임시 방: 소켓이 다 빠지면 버린다
    if (!this.host.state && this.conns.size === 0) { clearTimeout(this.timer); this.timer = null; }
  }
}

const STATUS = { 403: 'Forbidden', 404: 'Not Found', 426: 'Upgrade Required', 429: 'Too Many Requests', 503: 'Service Unavailable' };
function rejectUpgrade(socket, status, body) {
  const text = JSON.stringify(body);
  socket.write(`HTTP/1.1 ${status} ${STATUS[status] || ''}\r\nContent-Type: application/json; charset=utf-8\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);
  socket.destroy();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = routeOf(url.pathname, normalize);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (route.kind === 'health') return res.end(JSON.stringify({ ok: true, protocol: PROTOCOL, timing: process.env.TIMING || '' }));
  if (route.kind === 'none') { res.statusCode = 404; return res.end(JSON.stringify({ error: 'not-found' })); }
  res.statusCode = 426; res.end(JSON.stringify({ error: 'upgrade-required' }));
});

server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const route = routeOf(url.pathname, normalize);
  if (route.kind === 'none' || route.kind === 'health') return rejectUpgrade(socket, 404, { error: 'not-found' });
  const origin = req.headers.origin;
  if (origin && !originAllowed(origin, req.headers.host || '', ALLOWED)) return rejectUpgrade(socket, 403, { error: 'origin' });
  if (route.kind === 'bad-code') return rejectUpgrade(socket, 404, { error: 'bad-code' });
  if (!isUpgrade(req.headers)) return rejectUpgrade(socket, 426, { error: 'upgrade-required' });
  const ip = socket.remoteAddress || 'local', now = Date.now();
  let room, op;
  if (route.kind === 'new') {
    if (!buckets.take('new:' + ip, now, IP_NEW_PER_MIN / 60, IP_NEW_PER_MIN)) return rejectUpgrade(socket, 429, { error: 'rate' });
    for (let i = 0; i < 5 && !room; i++) {
      const code = gen();
      if (rooms.has(code)) continue;
      room = new LocalRoom(code);
      rooms.set(code, room);
      await room.host.claim({ code, kind: 'code', timing: TIMING });
    }
    if (!room) return rejectUpgrade(socket, 503, { error: 'busy' });
    op = 'create';
  } else {
    if (!buckets.take('room:' + ip, now, IP_ROOM_PER_MIN / 60, IP_ROOM_PER_MIN)) return rejectUpgrade(socket, 429, { error: 'rate' });
    room = rooms.get(route.code) || new LocalRoom(route.code);   // 없는 코드: state null 인 임시 방 (hello → bad-code)
    op = 'join';
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) return rejectUpgrade(socket, 426, { error: 'bad-handshake' });
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const sid = crypto.randomBytes(6).toString('hex');
  const conn = new Conn(socket, sid, op);
  room.conns.set(sid, conn);
  socket.on('error', () => {});
  socket.on('end', () => socket.destroy());   // http.Server 소켓은 allowHalfOpen — 상대가 끊어도 우리가 닫아야 'close' 가 온다
  socket.on('close', () => {
    room.conns.delete(sid);
    room.host.closed(sid).catch(() => {});
    room.gc();
  });
  socket.on('data', (chunk) => {
    conn.buf = Buffer.concat([conn.buf, chunk]);
    for (const f of parseFrames(conn)) conn.q = conn.q.then(() => handleFrame(room, conn, f)).catch((e) => log({ ev: 'frame.error', err: String(e) }));
  });
  await room.host.open(sid, op);
  if (head && head.length) socket.emit('data', head);
});

async function handleFrame(room, conn, f) {
  if (conn.closed) return;
  if (f.tooBig) return conn.close(1009, 'too-big');
  if (!f.masked) return conn.close(1002, 'unmasked');
  let op = f.op, payload = f.payload;
  if (op === 0) {
    if (!conn.frag) return conn.close(1002, 'bad-continuation');
    conn.frag.parts.push(payload);
    if (!f.fin) return;
    op = conn.frag.op; payload = Buffer.concat(conn.frag.parts); conn.frag = null;
  } else if (op === 1 || op === 2) {
    if (!f.fin) { conn.frag = { op, parts: [payload] }; return; }
  }
  switch (op) {
    case 1: case 2: {
      const data = op === 1 ? payload.toString('utf8') : payload;
      const r = await room.host.message(conn.sid, conn.att, data);
      if (r && r.pid) conn.att = { ...conn.att, pid: r.pid };
      return;
    }
    case 8: return conn.close(1000, '');
    case 9: return conn.socket.write(frame(10, payload));
    default: return;    // pong 등
  }
}

server.listen(PORT, () => log({ ev: 'listen', port: PORT, timing: process.env.TIMING || 'base', protocol: PROTOCOL }));
process.on('SIGINT', () => { for (const r of rooms.values()) log({ ev: 'stats', code: r.code, stats: r.host.stats }); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
