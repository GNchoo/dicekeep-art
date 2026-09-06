// ==================== 토큰 버킷 (순수 함수) ====================
// bucket = { tokens, at } | null(처음 = 가득). rate 는 초당 보충량, burst 는 최대 보유량.
// take() 는 새 버킷을 돌려주며 입력을 바꾸지 않는다.
export function take(bucket, now, rate, burst, cost = 1) {
  let tokens = burst, at = now;
  if (bucket) {
    const dt = Math.max(0, now - bucket.at) / 1000;
    tokens = Math.min(burst, bucket.tokens + dt * rate);
    at = now;
  }
  if (tokens >= cost) return { ok: true, bucket: { tokens: tokens - cost, at } };
  return { ok: false, bucket: { tokens, at } };
}

// Map 기반 키별 버킷 (Worker 아이솔레이트 메모리용). 크기 상한을 넘으면 가장 오래된 것부터 버린다.
export class BucketMap {
  constructor(max = 5000) { this.map = new Map(); this.max = max; }
  take(key, now, rate, burst) {
    const r = take(this.map.get(key) || null, now, rate, burst);
    this.map.delete(key);
    this.map.set(key, r.bucket);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return r.ok;
  }
}
