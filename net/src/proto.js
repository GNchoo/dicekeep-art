// ==================== 메시지 스키마 · 정규화 · 코드 ====================
// 텍스트 프레임 1개 = JSON 객체 1개, 봉투 없음. t 가 종류, 나머지는 평평한 필드.
// parse() 는 알려진 필드만 골라 범위를 검사한 '깨끗한' 객체를 돌려준다(모르는 필드는 버린다).
// 실패는 { ok:false, err } — 서버는 조용히 폐기하고 연속 3회면 4400 으로 닫는다.
export const PROTOCOL = 2;

export const CLOSE = Object.freeze({
  LEAVE: 4000,        // 클라가 leave
  REPLACED: 4001,     // 같은 pid 의 새 소켓이 옛 소켓을 대체
  BAD_REQUEST: 4400,  // hello 없음 · 잘못된 프레임 연속
  FORBIDDEN: 4403,    // origin · bad-key
  NO_ROOM: 4404,      // 없는 코드
  CONFLICT: 4409,     // full · started
  EXPIRED: 4410,      // 끝난 방 · 만료
  VERSION: 4426,      // 프로토콜·게임 버전 불일치
  RATE: 4429,         // 소켓 속도 제한
  TOO_BIG: 1009,      // 프레임 2,048 B 초과
});

export const ERR = ['bad-code', 'full', 'started', 'bad-key', 'version', 'name', 'rate', 'origin', 'not-host', 'not-ready', 'expired', 'bad-request'];
export const DEAD_REASONS = ['lives', 'bossLeak', 'bossTimeout', 'quit', 'reload', 'afk'];
export const LOG_KINDS = ['sys', 'gacha', 'up', 'boom', 'boss', 'life'];
export const NAME_MAX = 12, TEXT_MAX = 120, VER_MAX = 16, TOWERS_MAX = 15;

const PID_RE = /^[a-z0-9]{8,16}$/;
const KEY_RE = /^[0-9a-f]{32}$/;
// 제어문자 + 폭 없는 공백·방향 제어·BOM
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g;

// 제어문자 제거 → NFC → 앞뒤 공백 제거 → 코드포인트 기준 절단
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  let t = s.replace(CTRL_RE, '');
  try { t = t.normalize('NFC'); } catch (e) { /* 정규화 불가 문자열은 그대로 */ }
  t = t.trim();
  const cps = Array.from(t);
  return cps.length > max ? cps.slice(0, max).join('') : t;
}

// 이름: trim → 제어문자·<> 제거 → 연속 공백 1개 → 1~12자(초과 절단) → 비면 '플레이어-' + pid 앞 4자
// (클라 net.js 의 sanitizeName 과 같은 규칙. 방 안 중복 " (2)" 접미는 room-core 가 붙인다)
export function sanitizeName(name, pid) {
  let t = cleanText(typeof name === 'string' ? name.replace(/[<>]/g, '') : '', 1000);
  t = t.replace(/\s+/g, ' ').trim();
  const cps = Array.from(t);
  if (cps.length > NAME_MAX) t = cps.slice(0, NAME_MAX).join('').trim();
  if (!t) t = '플레이어-' + String(pid || '').slice(0, 4);
  return t;
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const fail = (err) => ({ ok: false, err });

// 종류별 검사기: 통과하면 깨끗한 객체, 아니면 null
const SCHEMA = {
  hello(m) {
    if (!isInt(m.v, 0, 1e6)) return null;
    if (!isStr(m.ver, 64)) return null;
    if (m.op !== 'create' && m.op !== 'join') return null;
    if (typeof m.pid !== 'string' || !PID_RE.test(m.pid)) return null;
    if (typeof m.key !== 'string' || !KEY_RE.test(m.key)) return null;
    if (typeof m.name !== 'string' || m.name.length > 256) return null;
    return { t: 'hello', v: m.v, ver: cleanText(m.ver, VER_MAX), op: m.op, pid: m.pid, key: m.key, name: sanitizeName(m.name, m.pid) };
  },
  start() { return { t: 'start' }; },
  sum(m) {
    if (!isInt(m.w, 0, 101) || !isInt(m.dw, 0, 101) || !isInt(m.l, 0, 20) || !isInt(m.g, 0, 1e7)) return null;
    if (!isInt(m.k, 0, 1e6) || !isInt(m.f, 0, 200) || !isNum(m.lag, 0, 3600)) return null;
    if (m.hid !== 0 && m.hid !== 1) return null;
    if (m.b !== null && !isNum(m.b, 0, 1)) return null;
    if (m.o !== 'l' && m.o !== 'p') return null;
    if (!Array.isArray(m.tw) || m.tw.length > TOWERS_MAX) return null;
    const tw = [];
    for (const it of m.tw) {
      if (!Array.isArray(it) || it.length !== 3) return null;
      if (!isInt(it[0], 0, 14) || !isInt(it[1], 1, 20) || !isInt(it[2], 1, 3)) return null;
      tw.push([it[0], it[1], it[2]]);
    }
    return { t: 'sum', w: m.w, dw: m.dw, l: m.l, g: m.g, k: m.k, f: m.f, lag: m.lag, hid: m.hid, b: m.b, o: m.o, tw };
  },
  done(m) { return isInt(m.w, 0, 101) ? { t: 'done', w: m.w } : null; },
  dead(m) {
    if (!isInt(m.w, 0, 101) || !isInt(m.k, 0, 1e6) || !DEAD_REASONS.includes(m.r)) return null;
    return { t: 'dead', w: m.w, k: m.k, r: m.r };
  },
  clear(m) { return isInt(m.w, 0, 101) && isInt(m.k, 0, 1e6) ? { t: 'clear', w: m.w, k: m.k } : null; },
  chat(m) {
    if (!isStr(m.text, 2048)) return null;
    const text = cleanText(m.text, TEXT_MAX);
    return text ? { t: 'chat', text } : null;
  },
  log(m) {
    if (!isStr(m.text, 2048) || !LOG_KINDS.includes(m.kind)) return null;
    const text = cleanText(m.text, TEXT_MAX);
    return text ? { t: 'log', text, kind: m.kind } : null;
  },
  time(m) { return isNum(m.c, -1e15, 1e15) ? { t: 'time', c: m.c } : null; },
  leave() { return { t: 'leave' }; },
};

export const TYPES = Object.keys(SCHEMA);

// 텍스트 프레임 → { ok, m } . 크기 검사는 어댑터가 프레임 단계에서 한다(1009).
export function parse(text) {
  if (typeof text !== 'string') return fail('not-text');
  let m;
  try { m = JSON.parse(text); } catch (e) { return fail('bad-json'); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return fail('not-object');
  const check = Object.prototype.hasOwnProperty.call(SCHEMA, m.t) ? SCHEMA[m.t] : null;
  if (!check) return fail('bad-type');
  let out = null;
  try { out = check(m); } catch (e) { out = null; }
  return out ? { ok: true, m: out } : fail('range');
}

// UTF-8 바이트 길이 (프레임 크기 검사)
export function byteLength(s) {
  return typeof s === 'string' ? new TextEncoder().encode(s).length : (s && s.byteLength) || 0;
}
