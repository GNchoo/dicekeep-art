// ==================== 방 코드 ====================
// 헷갈리는 글자(0 O 1 I L)를 뺀 31자 · 6자리 ≈ 8.9억. 생성은 거부 샘플링(모듈로 편향 없음).
export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 6;
export const CODE_RE = new RegExp('^[' + ALPHABET + ']{' + CODE_LEN + '}$');

// bytes(n) → Uint8Array 를 주입할 수 있다(테스트). 기본은 crypto.getRandomValues.
export function gen(bytes) {
  const src = bytes || ((n) => crypto.getRandomValues(new Uint8Array(n)));
  const limit = 256 - (256 % ALPHABET.length); // 248 미만만 사용
  let out = '';
  while (out.length < CODE_LEN) {
    const buf = src(CODE_LEN * 2);
    for (let i = 0; i < buf.length && out.length < CODE_LEN; i++) {
      if (buf[i] < limit) out += ALPHABET[buf[i] % ALPHABET.length];
    }
  }
  return out;
}

// 사용자 입력 → 대문자 코드 또는 null (공백·하이픈 등은 거절)
export function normalize(code) {
  if (typeof code !== 'string') return null;
  const up = code.toUpperCase();
  return CODE_RE.test(up) ? up : null;
}
