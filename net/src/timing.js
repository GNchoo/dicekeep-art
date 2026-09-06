// ==================== 상수 · 웨이브 시계 산술 ====================
// 서버가 갖는 시계의 모든 숫자는 여기 한 곳에 둔다(전부 ms). 클라이언트에는 start.timing 으로 네 값만 건네준다.
// spawnEnd(w) 는 content.js:1372-1373·1377 의 count/gap/bosses 공식을 그대로 복제한 '상한값' 이다
// (대형 ×0.85, 빠른 공중 ×0.72 는 더 이르게 끝나므로 실제 스폰 끝 ≤ 이 값). test/timing.test.js 가 content.js 와 패리티를 고정한다.
// content.js 의 웨이브 계수를 바꾸면 반드시 이 파일과 패리티 테스트를 같이 돌려야 한다.

export const ROOM_SIZE = 4;

// 운영 타이밍 (클라 전달분 prep/intermission/bossLimit/clearWave + 서버 전용 endGrace)
export const TIMING_BASE = Object.freeze({ prep: 20000, intermission: 6000, bossLimit: 320000, clearWave: 101, endGrace: 60000 });
// TIMING=fast: 테스트용 짧은 판 (보스 10 홀드 → 12 클리어)
export const TIMING_FAST = Object.freeze({ prep: 2000, intermission: 500, bossLimit: 5000, clearWave: 12, endGrace: 5000 });

export const BOSS_GRACE = 2000;          // 로컬 320초 타이머가 서버 마감보다 항상 먼저 끝나게 하는 여유
export const FRESH_BEAT = 7000;          // 신선도: 마지막 sum 이 7초 이내
export const FRESH_LAG = 30000;          // 신선도: 보고한 lag ≤ 30초
export const HOLD_RECHECK = 5000;        // 보스 홀드 중 신선도 재검사 알람 간격
export const RECONNECT_GRACE = 180000;   // 플레이 중 끊긴 사람을 기다리는 시간 → left
export const LOBBY_GRACE = 45000;        // 대기실에서 끊긴 사람(새로고침·백그라운드)의 좌석을 지키는 시간 → 제거
export const LOBBY_TTL = 15 * 60000;     // 대기실 유휴 만료 (마지막 전이 기준)
export const END_TTL = 10 * 60000;       // 종료 뒤 방 보존
export const GAME_CAP = 100 * 60000;     // 판 최대 길이 (t0 기준)
export const EMPTY_END = 3 * 60000;      // 플레이 중 전원 끊김 → end(empty)
export const CLAIM_TTL = 60000;          // /claim 뒤 hello 없이 방치 → destroy
export const SUM_RELAY_MIN = 1500;       // sum 중계 최소 간격(멤버당)
export const HELLO_TIMEOUT = 5000;       // 소켓 열고 첫 프레임(hello) 대기
export const MAX_FRAME = 2048;           // 수신 프레임 최대 바이트 (초과 1009)
export const SOCKET_RATE = 20, SOCKET_BURST = 40;   // 소켓당 메시지 토큰 버킷
export const CHAT_RATE = 1, CHAT_BURST = 5;
export const LOG_RATE = 2, LOG_BURST = 4;
export const IP_NEW_PER_MIN = 10, IP_ROOM_PER_MIN = 60;

// 보스 웨이브: 10의 배수 (도전은 101에서 끝나 2주기와 무관) — content.js:1362 isBossWave 와 패리티 테스트로 묶는다
export function isBoss(w) { return Number.isInteger(w) && w >= 1 && w <= 101 && w % 10 === 0; }
export function bossOrdinal(w) { return Math.round(w / 10); }

// 웨이브 w 의 마지막 스폰 시각(ms, 웨이브 시작 기준 상한). 웨이브 시작 + spawnEnd + INTERMISSION = 다음 웨이브
export function spawnEnd(w) {
  if (isBoss(w)) return Math.round((1.05 + (bossOrdinal(w) >= 2 ? 1.5 : 0)) * 1000);
  const count = Math.min(36, 12 + Math.floor(w * 0.6));
  const gap = Math.max(0.3, 0.8 - w * 0.01);
  return Math.round((0.45 + (count - 1) * gap) * 1000);
}

// clearWave 이하의 보스 웨이브 목록 (클리어 조건 · sum.dw 로 bossDone 도출에 쓴다)
export function bossWaves(clearWave) {
  const out = [];
  for (let b = 10; b <= clearWave; b += 10) if (isBoss(b)) out.push(b);
  return out;
}

// env.TIMING 문자열 → 타이밍 표 (복사본)
export function timingFor(mode) {
  const src = String(mode || '').toLowerCase() === 'fast' ? TIMING_FAST : TIMING_BASE;
  return { ...src };
}

// 클라이언트에 건네는 네 값만
export function wireTiming(t) {
  return { prep: t.prep, intermission: t.intermission, bossLimit: t.bossLimit, clearWave: t.clearWave };
}
