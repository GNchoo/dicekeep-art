// ==================== HTTP 쪽 순수 도우미 (Worker · dev-server 공용) ====================
// Origin 검사: 헤더가 '있는데' 허용 목록과 다르면 거절. 없으면(비브라우저 클라이언트) 통과 —
// 이 검사는 타 사이트 브라우저의 소켓 남용만 막는 장치다.
//   허용: http(s)://localhost:* · 127.0.0.1:* · [::1]:*
//         요청 Host 가 dicekeep-net.<acct>.workers.dev 이면 https://dicekeep.<acct>.workers.dev · https://*-dicekeep.<acct>.workers.dev
//         extra(vars.ALLOWED_ORIGINS, 쉼표 구분) 의 원점 그대로
export function originAllowed(origin, host, extra) {
  let u;
  try { u = new URL(origin); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
  const acct = /^dicekeep-net\.([a-z0-9-]+)\.workers\.dev$/i.exec(String(host || '').split(':')[0]);
  if (acct && u.protocol === 'https:') {
    const a = acct[1].toLowerCase();
    if (h === `dicekeep.${a}.workers.dev` || h.endsWith(`-dicekeep.${a}.workers.dev`)) return true;
  }
  for (const o of String(extra || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (o === origin.toLowerCase() || o === u.origin.toLowerCase()) return true;
  }
  return false;
}

// 경로 → { kind:'health' } | { kind:'new' } | { kind:'quick' } | { kind:'room', code } | { kind:'bad-code' } | { kind:'none' }
export function routeOf(pathname, normalize) {
  if (pathname === '/health') return { kind: 'health' };
  if (pathname === '/ws/new') return { kind: 'new' };
  if (pathname === '/ws/quick') return { kind: 'quick' };
  const m = /^\/ws\/room\/([^/]+)$/.exec(pathname);
  if (m) {
    let raw = m[1];
    try { raw = decodeURIComponent(raw); } catch (e) { /* 그대로 */ }
    const code = normalize(raw);
    return code ? { kind: 'room', code } : { kind: 'bad-code' };
  }
  return { kind: 'none' };
}

export function isUpgrade(headers) {
  return String(headers.get ? headers.get('Upgrade') : headers.upgrade || '').toLowerCase() === 'websocket';
}

export const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
