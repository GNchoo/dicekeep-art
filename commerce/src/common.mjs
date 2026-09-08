export class ApiError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const requireThat = (condition, code, status = 400) => { if (!condition) throw new ApiError(code, status); };
export const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
export const textId = (v, max = 128) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x20]/.test(v);
export const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
export const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
export const random = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
export const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export const b64url = bytes => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export async function body(req) {
  requireThat((req.headers.get('content-type') || '').startsWith('application/json'), 'json-required', 415);
  requireThat(Number(req.headers.get('content-length') || 0) <= 32768, 'body-too-large', 413);
  const reader = req.body?.getReader(); let total = 0, chunks = [];
  if (reader) for (;;) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > 32768) { await reader.cancel(); throw new ApiError('body-too-large', 413); } chunks.push(value); }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data; try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ApiError('invalid-json'); }
  requireThat(data && typeof data === 'object' && !Array.isArray(data), 'invalid-body'); return data;
}
export function fields(value, allowed) { requireThat(Object.keys(value).every(k => allowed.includes(k)), 'unexpected-field'); }
export const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
export async function fetchJson(fetcher, url, options = {}) {
  let r; try { r = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000) }); } catch { throw new ApiError('provider-unavailable', 503); }
  let data; try { data = await r.json(); } catch { data = null; }
  return { ok: r.ok, status: r.status, data, headers: r.headers };
}
