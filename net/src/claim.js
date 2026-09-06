// ==================== 방 코드 생성 → Room DO /claim ====================
// Worker(/ws/new)와 Lobby DO(빠른 매칭)가 같이 쓴다. 코드를 만들어 idFromName(code) 객체에 /claim 을 보내고
// 409(이미 있는 코드)면 새 코드로 최대 5회. body = { kind:'code'|'quick', ver?, reserve? } (reserve 는 빠른 매칭 예약 좌석)
import { gen } from './codes.js';

export async function claimRoom(ROOM, body = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const code = gen();
    const stub = ROOM.get(ROOM.idFromName(code));
    const r = await stub.fetch('https://do/claim', {
      method: 'POST',
      headers: { 'X-DK-Code': code, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status === 409) continue;
    if (!r.ok) return { ok: false, error: 'claim-failed', status: 502 };
    return { ok: true, code, stub };
  }
  return { ok: false, error: 'busy', status: 503 };
}
