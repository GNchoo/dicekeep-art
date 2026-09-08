import { CommerceLedger } from '../src/ledger.mjs';
import { b64, b64url } from '../src/common.mjs';
export class MemoryStorage {
  constructor() { this.data = new Map(); this.lock = Promise.resolve(); this.alarmAt = null; }
  async get(k) { return structuredClone(this.data.get(k)); }
  async put(k, v) { this.data.set(k, structuredClone(v)); }
  async delete(k) { return this.data.delete(k); }
  async list({ prefix = '', startAfter, limit = Infinity } = {}) { return new Map([...this.data].filter(([k]) => k.startsWith(prefix) && (!startAfter || k > startAfter)).sort(([a], [b]) => a.localeCompare(b, 'en')).slice(0, limit).map(([k, v]) => [k, structuredClone(v)])); }
  async setAlarm(at) { this.alarmAt = at; }
  async transaction(fn) {
    let release; const done = new Promise(r => { release = r; }), old = this.lock; this.lock = done; await old;
    const local = new MemoryStorage(); local.data = structuredClone(this.data);
    try { const result = await fn(local); this.data = local.data; return result; } finally { release(); }
  }
}
export const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicKey = { ...await crypto.subtle.exportKey('jwk', keyPair.publicKey), kid: 'unit-test-key', alg: 'RS256', use: 'sig' };
const privatePem = '-----BEGIN PRIVATE KEY-----\n' + b64(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)) + '\n-----END PRIVATE KEY-----';
export const NOW = Date.parse('2026-09-08T12:00:00Z');
export async function jwt(claims = {}, header = {}) {
  const encode = v => b64url(new TextEncoder().encode(JSON.stringify(v)));
  const payload = `${encode({ alg: 'RS256', kid: 'unit-test-key', ...header })}.${encode({ iss: 'https://accounts.google.com', aud: 'web-client', sub: 'user1', iat: NOW / 1000, exp: NOW / 1000 + 3600, ...claims })}`;
  return payload + '.' + b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(payload)));
}
export const testEnv = () => ({ PAYMENT_MODE: 'test', ENABLE_LIVE_PURCHASES: 'false', GOOGLE_CLIENT_IDS: 'web-client,android-client', GOOGLE_WEB_CLIENT_ID: 'web-client',
  PUBLIC_ORIGINS: 'https://game.example,https://localhost', TOKEN_ENCRYPTION_KEY: b64(new Uint8Array(32).fill(5)),
  TOSS_CLIENT_KEY: 'test_ck_fixture', TOSS_SECRET_KEY: 'test_sk_fixture', TOSS_MID: 'test-mid', GOOGLE_PLAY_PACKAGE: 'com.example.dicekeep',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'unit@project.iam.gserviceaccount.com', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privatePem,
  GOOGLE_RTDN_AUDIENCE: 'https://commerce.example/webhooks/google', GOOGLE_RTDN_EMAIL: 'pubsub@project.iam.gserviceaccount.com' });
export async function fixture(overrides = {}) {
  const state = { now: NOW, calls: [], toss: new Map(), google: new Map(), confirmCalls: 0, consumeCalls: 0, ackCalls: 0, confirmLost: false, consumeFail: false, consumeLost: false, ackFail: false, handler: null };
  const env = { ...testEnv(), ...overrides }, storage = new MemoryStorage();
  const fetcher = async (url, opts = {}) => {
    url = String(url); state.calls.push({ url, method: opts.method || 'GET', body: opts.body });
    if (state.handler) { const response = await state.handler(url, opts); if (response) return response; }
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [publicKey] }, { headers: { 'Cache-Control': 'max-age=3600' } });
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'unit-oauth', expires_in: 3600 });
    if (url.includes('/v1/payments/orders/')) return state.toss.has(url.split('/').at(-1)) ? Response.json(state.toss.get(url.split('/').at(-1))) : Response.json({ code: 'NOT_FOUND_PAYMENT' }, { status: 404 });
    if (url.endsWith('/v1/payments/confirm')) {
      state.confirmCalls++; const b = JSON.parse(opts.body);
      const p = { orderId: b.orderId, paymentKey: b.paymentKey, mId: env.TOSS_MID, currency: 'KRW', totalAmount: b.amount, balanceAmount: b.amount, status: 'DONE' };
      state.toss.set(b.orderId, p); if (state.confirmLost) throw Error('simulated lost response'); return Response.json(p);
    }
    if (url.includes('/purchases/productsv2/tokens/')) { const token = decodeURIComponent(url.split('/').at(-1)); return state.google.has(token) ? Response.json(state.google.get(token)) : Response.json({}, { status: 404 }); }
    if (url.endsWith(':consume')) {
      state.consumeCalls++; if (state.consumeFail) return Response.json({}, { status: 503 });
      const token = decodeURIComponent(url.split('/').at(-1).slice(0, -8)); const p = state.google.get(token);
      if (p) p.productLineItem[0].productOfferDetails.consumptionState = 'CONSUMPTION_STATE_CONSUMED';
      if (state.consumeLost) throw Error('simulated lost consume response'); return new Response(null, { status: 204 });
    }
    if (url.endsWith(':acknowledge')) {
      state.ackCalls++; if (state.ackFail) return Response.json({}, { status: 503 });
      const token = decodeURIComponent(url.split('/').at(-1).slice(0, -12)), p = state.google.get(token);
      if (p) p.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'; return new Response(null, { status: 204 });
    }
    throw Error('Unexpected provider URL: ' + url);
  };
  const ledger = new CommerceLedger({ storage }, env, { fetch: fetcher, now: () => state.now });
  const call = async (path, data, token, method = data === undefined ? 'GET' : 'POST') => {
    const r = await ledger.fetch(new Request('https://commerce.example' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }));
    return { status: r.status, body: await r.json() };
  };
  const login = async (sub = 'user1') => (await call('/auth/google', { idToken: await jwt({ sub }) })).body;
  return { state, env, storage, ledger, call, login, fetcher };
}
export function googlePurchase(account, overrides = {}) {
  return { orderId: 'GPA.unit-1', obfuscatedExternalAccountId: account.obfuscatedAccountId, purchaseStateContext: { purchaseState: 'PURCHASED' }, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', testPurchaseContext: { fopType: 'TEST' },
    productLineItem: [{ productId: 'dicekeep.shards60', productOfferDetails: { quantity: 1, refundableQuantity: 1, consumptionState: 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED' } }], ...overrides };
}
export async function paidToss(f, account, sku = 'shards60') {
  const o = (await f.call('/orders', { sku, platform: 'web' }, account.token)).body;
  const result = await f.call('/payments/toss/confirm', { orderId: o.orderId, paymentKey: 'key-' + o.orderId }, account.token);
  return { order: o, result };
}
