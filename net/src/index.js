// ==================== dicekeep-net Worker 엔트리 ====================
// 서버는 방·시드·중계·매칭만 맡는다(시뮬레이션과 웨이브 진행은 각 클라이언트). 여기서는 Origin 검사 · IP 속도 제한 · 코드 검사 · 라우팅만.
//   GET /health              → { ok:true, protocol:4 }
//   GET /ws/new   (Upgrade)  → Lobby /quota(시간당 120) → 코드 생성 → Room DO /claim (409 면 새 코드, ≤5회) → 업그레이드를 DO 로 전달 (X-DK-Op: create)
//   GET /ws/room/:code       → 코드 정규식 검사(불일치 404, DO 호출 없음) → DO 로 전달 (X-DK-Op: join)
//   GET /ws/quick (Upgrade)  → Lobby DO(단일 객체 'quick') 로 전달. hello op 'quick' → queued… → matched{code} 뒤 /ws/room/:code 로 join
// 인증(pid/key)은 URL 이 아니라 첫 프레임 hello 에 싣는다 — URL 에는 공개값인 방 코드만.
import { Room } from './room.js';
import { Lobby } from './lobby.js';
import { PROTOCOL } from './proto.js';
import { normalize } from './codes.js';
import { claimRoom } from './claim.js';
import { BucketMap } from './ratelimit.js';
import { originAllowed, routeOf, isUpgrade, JSON_HEADERS } from './http.js';
import { IP_NEW_PER_MIN, IP_ROOM_PER_MIN, IP_QUICK_PER_MIN } from './timing.js';

export { Room, Lobby };

const buckets = new BucketMap(10000);   // 아이솔레이트 메모리(PoP·재시작마다 리셋되는 약한 방어)

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });

function forward(req, extra) {
  const h = new Headers(req.headers);
  for (const k of Object.keys(extra)) h.set(k, extra[k]);
  return new Request(req.url, { method: 'GET', headers: h });
}

const lobbyOf = (env) => env.LOBBY.get(env.LOBBY.idFromName('quick'));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const route = routeOf(url.pathname, normalize);
    if (route.kind === 'health') return json({ ok: true, protocol: PROTOCOL });
    if (route.kind === 'none') return json({ error: 'not-found' }, 404);
    const origin = req.headers.get('Origin');
    if (origin && !originAllowed(origin, url.host, env.ALLOWED_ORIGINS)) return json({ error: 'origin' }, 403);
    if (route.kind === 'bad-code') return json({ error: 'bad-code' }, 404);
    if (!isUpgrade(req.headers)) return json({ error: 'upgrade-required' }, 426);
    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    const now = Date.now();

    if (route.kind === 'new') {
      if (!buckets.take('new:' + ip, now, IP_NEW_PER_MIN / 60, IP_NEW_PER_MIN)) return json({ error: 'rate' }, 429);
      const q = await lobbyOf(env).fetch('https://do/quota', { method: 'POST' });
      if (q.status === 429) return json({ error: 'rate' }, 429);
      const r = await claimRoom(env.ROOM, { kind: 'code' });
      if (!r.ok) return json({ error: r.error }, r.status);
      return r.stub.fetch(forward(req, { 'X-DK-Op': 'create', 'X-DK-Code': r.code }));
    }

    if (route.kind === 'quick') {
      if (!buckets.take('quick:' + ip, now, IP_QUICK_PER_MIN / 60, IP_QUICK_PER_MIN)) return json({ error: 'rate' }, 429);
      return lobbyOf(env).fetch(forward(req, { 'X-DK-Op': 'quick' }));
    }

    // route.kind === 'room'
    if (!buckets.take('room:' + ip, now, IP_ROOM_PER_MIN / 60, IP_ROOM_PER_MIN)) return json({ error: 'rate' }, 429);
    const stub = env.ROOM.get(env.ROOM.idFromName(route.code));
    return stub.fetch(forward(req, { 'X-DK-Op': 'join', 'X-DK-Code': route.code }));
  },
};
