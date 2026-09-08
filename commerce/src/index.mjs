import { json, list } from './common.mjs';
export { CommerceLedger } from './ledger.mjs';
export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin'), allowed = list(env.PUBLIC_ORIGINS), path = new URL(req.url).pathname;
    // Native bearer requests have no Origin. JSON-only POST and an explicit CORS allowlist exclude form login CSRF.
    if (origin && !allowed.includes(origin)) return json({ error: 'origin-not-allowed' }, 403);
    const headers = { Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '600' };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!env.COMMERCE) return json({ error: 'commerce-not-configured' }, 503);
    // A sandbox purchase/profile can never turn into live currency when keys are switched.
    const mode = env.PAYMENT_MODE === 'test' ? 'test' : 'production';
    const response = await env.COMMERCE.get(env.COMMERCE.idFromName('global:' + mode)).fetch(req);
    const out = new Response(response.body, response); for (const [k, v] of Object.entries(headers)) out.headers.set(k, v); return out;
  }
};
