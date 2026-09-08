import { ApiError, requireThat, textId, unb64, b64, b64url, list, fetchJson } from './common.mjs';
export class GoogleAuth {
  constructor(fetcher = fetch, now = Date.now) { this.fetch = fetcher; this.now = now; this.keys = null; this.until = 0; this.oauth = null; }
  async verify(token, audiences, email) {
    requireThat(typeof token === 'string' && token.length <= 16384, 'invalid-id-token', 401);
    let h, p, parts; try { parts = token.split('.'); h = JSON.parse(new TextDecoder().decode(unb64(parts[0]))); p = JSON.parse(new TextDecoder().decode(unb64(parts[1]))); } catch { throw new ApiError('invalid-id-token', 401); }
    const now = Math.floor(this.now() / 1000);
    requireThat(parts.length === 3 && h.alg === 'RS256' && textId(h.kid) && audiences.length &&
      typeof p.aud === 'string' && audiences.includes(p.aud) && (!p.azp || audiences.includes(p.azp)) &&
      ['accounts.google.com', 'https://accounts.google.com'].includes(p.iss) &&
      Number.isFinite(p.exp) && p.exp > now && Number.isFinite(p.iat) && p.iat <= now + 60 &&
      (p.nbf === undefined || (Number.isFinite(p.nbf) && p.nbf <= now + 60)) && textId(p.sub, 255), 'invalid-id-token', 401);
    if (email) requireThat(p.email === email && p.email_verified === true, 'invalid-webhook-identity', 401);
    if (!this.keys || this.until <= this.now() || !this.keys.some(k => k.kid === h.kid)) {
      const r = await fetchJson(this.fetch, 'https://www.googleapis.com/oauth2/v3/certs');
      requireThat(r.ok && Array.isArray(r.data?.keys), 'identity-unavailable', 503);
      this.keys = r.data.keys; const ttl = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') || '')?.[1] || 300);
      this.until = this.now() + Math.min(ttl, 86400) * 1000;
    }
    const jwk = this.keys.find(k => k.kid === h.kid && k.kty === 'RSA'); requireThat(jwk, 'invalid-id-token', 401);
    let valid = false; try {
      const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    } catch { /* uniformly reject malformed signatures */ }
    requireThat(valid, 'invalid-id-token', 401); return p;
  }
  login(token, env) { return this.verify(token, list(env.GOOGLE_CLIENT_IDS)); }
  async accessToken(env) {
    const now = Math.floor(this.now() / 1000);
    if (this.oauth && this.oauth.until > now + 60) return this.oauth.token;
    const enc = v => b64url(new TextEncoder().encode(JSON.stringify(v)));
    const payload = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    let key; try { key = await crypto.subtle.importKey('pkcs8', unb64(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/-----[^-]+-----|\s/g, '')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']); } catch { throw new ApiError('provider-configuration', 503); }
    const signature = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(payload)));
    const r = await fetchJson(this.fetch, 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${payload}.${signature}` }).toString() });
    requireThat(r.ok && textId(r.data?.access_token, 8192) && Number.isFinite(r.data.expires_in), 'provider-authorization', 503);
    this.oauth = { token: r.data.access_token, until: now + Math.min(r.data.expires_in, 3600) }; return this.oauth.token;
  }
}
export async function cryptToken(value, secret, decrypt = false) {
  let key; try { key = await crypto.subtle.importKey('raw', unb64(secret), 'AES-GCM', false, [decrypt ? 'decrypt' : 'encrypt']); } catch { throw new ApiError('provider-configuration', 503); }
  if (decrypt) { const bytes = unb64(value); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))); }
  const iv = crypto.getRandomValues(new Uint8Array(12)); const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)));
  const out = new Uint8Array(iv.length + ciphertext.length); out.set(iv); out.set(ciphertext, iv.length); return b64(out);
}
