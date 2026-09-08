// ==================== 상수 ====================
// 서버가 갖는 시간·한도의 모든 숫자는 여기 한 곳에 둔다(전부 ms). 클라이언트에는 start.timing 으로 세 값만 건네준다.
// 서버는 웨이브 시계를 갖지 않는다 — 각 클라이언트가 자기 속도로 웨이브를 돌리고 서버는 보고만 받는다.

export const ROOM_SIZE = 4;

// 운영 타이밍 (클라 전달분 prep/bossLimit/clearWave). intermission 은 클라가 content.js 값을 쓴다
export const TIMING_BASE = Object.freeze({ prep: 20000, bossLimit: 320000, clearWave: 101 });
// TIMING=fast: 테스트용 짧은 판 (12웨이브 클리어)
export const TIMING_FAST = Object.freeze({ prep: 2000, bossLimit: 5000, clearWave: 12 });

export const RECONNECT_GRACE = 180000;   // 플레이 중 끊긴 사람을 기다리는 시간 → left
export const LOBBY_GRACE = 45000;        // 대기실에서 끊긴 사람(새로고침·백그라운드)의 좌석을 지키는 시간 → 제거
export const LOBBY_TTL = 15 * 60000;     // 대기실 유휴 만료 (마지막 전이 기준)
export const END_TTL = 10 * 60000;       // 종료 뒤 방 보존
export const GAME_CAP = 100 * 60000;     // 판 최대 길이 (t0 기준) → 남은 alive 는 lost
export const EMPTY_END = 3 * 60000;      // 플레이 중 전원 끊김 → end(empty)
export const CLAIM_TTL = 60000;          // /claim 뒤 hello 없이 방치 → destroy
export const RESERVE_TTL = 30000;        // 빠른 매칭 예약 좌석의 접속 마감 (matched 뒤)
export const SUM_RELAY_MIN = 1500;       // sum 중계 최소 간격(멤버당, 보는 사람이 아닌 멤버에게)
export const SUM_WATCH_MIN = 1000;       // sum 중계 최소 간격(이 pid 를 보고 있는 멤버에게 · en/ll 포함)
export const HELLO_TIMEOUT = 5000;       // 소켓 열고 첫 프레임(hello) 대기
export const MAX_FRAME = 6144;           // 수신 프레임 최대 바이트 (초과 1009); 200개 외형·위상과 JSON 여유
export const EN_MAX = 5120;              // sum.en 적 스트림 문자열 최대 길이
export const LANE_MAX = 100000;          // sum.ll 레인 길이 최대값
export const SOCKET_RATE = 20, SOCKET_BURST = 40;   // 소켓당 메시지 토큰 버킷
export const CHAT_RATE = 1, CHAT_BURST = 5;
export const LOG_RATE = 2, LOG_BURST = 4;
export const IP_NEW_PER_MIN = 10, IP_ROOM_PER_MIN = 60, IP_QUICK_PER_MIN = 30;
export const ROOMS_PER_HOUR = 120;       // 방 생성 상한(전역, Lobby DO 카운터) → 429

// 빠른 매칭 (Lobby DO)
export const QUICK_WAIT = 10000;         // 2명 이상이고 가장 오래 기다린 사람이 이만큼 기다리면 묶는다 (4명이면 즉시)
export const QUICK_QUEUE_MAX = 200;      // 대기열 상한 (초과 err rate)
export const QUICK_BEAT = 5000;          // queued{n,eta} 재방송 알람 간격

// env.TIMING 문자열 → 타이밍 표 (복사본)
export function timingFor(mode) {
  const src = String(mode || '').toLowerCase() === 'fast' ? TIMING_FAST : TIMING_BASE;
  return { ...src };
}

// 클라이언트에 건네는 세 값만
export function wireTiming(t) {
  return { prep: t.prep, bossLimit: t.bossLimit, clearWave: t.clearWave };
}
