import PG from './progression.mjs';
import { ApiError, requireThat, int, textId, random, sha, json, body, fields, list, unb64 } from './common.mjs';
import { PRODUCTS, publicConfig, paymentGate, enabled } from './catalog.mjs';
import { GoogleAuth, cryptToken } from './auth.mjs';
import { Providers } from './providers.mjs';

const SESSION_MS = 24 * 3600 * 1000;
const validRequestId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(id);
function sync(a) { a.profile.shards = a.wallet.free + a.wallet.paid; requireThat(int(a.profile.shards, 0, PG.MAX_SHARDS), 'wallet-limit', 409); }
function credit(a, amount, kind) {
  const debtPaid = Math.min(amount, a.wallet.debt); a.wallet.debt -= debtPaid;
  a.wallet[kind] += amount - debtPaid; sync(a); return { debtPaid, credited: amount - debtPaid };
}
function revoke(a, amount) {
  const taken = Math.min(a.wallet.paid, amount); a.wallet.paid -= taken; a.wallet.debt += amount - taken; sync(a);
}
function cosmetics(a) {
  a.skinGrants ||= {}; a.cosmetics ||= { owned: ['base'], equipped: 'base' };
  a.cosmetics.owned = ['base', ...['royal', 'frost', 'ember'].filter(id => Object.keys(a.skinGrants[id] || {}).length)];
  if (!a.cosmetics.owned.includes(a.cosmetics.equipped)) a.cosmetics.equipped = 'base'; return a.cosmetics;
}
function grantProduct(a, p, key) {
  if (p.kind !== 'cosmetic') return credit(a, p.shards, 'paid');
  cosmetics(a); a.skinGrants[p.skinId] ||= {}; a.skinGrants[p.skinId][key] = true; cosmetics(a); return { credited: 0, debtPaid: 0 };
}
function revokeProduct(a, p, key, amount) {
  if (p.kind !== 'cosmetic') return revoke(a, amount);
  cosmetics(a); delete a.skinGrants[p.skinId]?.[key]; cosmetics(a);
}
const view = a => ({ profile: a.profile, wallet: a.wallet, cosmetics: cosmetics(a) });

export class CommerceLedger {
  constructor(ctx, env, deps = {}) {
    this.ctx = ctx; this.storage = ctx.storage; this.env = env; this.now = deps.now || Date.now;
    this.auth = new GoogleAuth(deps.fetch || fetch, this.now); this.providers = new Providers(env, this.auth, deps.fetch || fetch);
    this.rates = new Map();
  }
  rate(key, max = 120) {
    const now = this.now(); if (this.rates.size > 2000) for (const [k, v] of this.rates) if (v.until < now) this.rates.delete(k);
    requireThat(this.rates.size < 4000 || this.rates.has(key), 'busy', 429);
    let row = this.rates.get(key); if (!row || row.until < now) this.rates.set(key, row = { count: 0, until: now + 60000 });
    requireThat(++row.count <= max, 'rate-limit', 429);
  }
  async account(req) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization') || '');
    requireThat(match, 'login-required', 401); const key = 'session:' + await sha(match[1]); const s = await this.storage.get(key);
    requireThat(s && s.expiresAt > this.now(), 'session-expired', 401); this.rate('account:' + s.accountId);
    return { id: s.accountId, sessionKey: key };
  }
  async fetch(req) {
    try {
      const path = new URL(req.url).pathname;
      if (req.method === 'GET' && path === '/config') return json(publicConfig(this.env));
      this.rate('ip:' + (req.headers.get('CF-Connecting-IP') || 'unknown'), 180);
      if (req.method === 'POST' && path === '/auth/google') { this.rate('login-ip:' + (req.headers.get('CF-Connecting-IP') || 'unknown'), 30); return json(await this.login(await body(req))); }
      if (req.method === 'POST' && path === '/webhooks/toss') return json(await this.tossWebhook(await body(req)));
      if (req.method === 'POST' && path === '/webhooks/google') return json(await this.googleWebhook(req, await body(req)));
      const identity = await this.account(req), id = identity.id;
      if (req.method === 'GET' && path === '/profile') return json((await this.storage.get('account:' + id)).profile);
      if (req.method === 'GET' && path === '/wallet') return json((await this.storage.get('account:' + id)).wallet);
      if (req.method === 'GET' && path === '/cosmetics') return json(await this.refreshCosmetics(id));
      if (req.method === 'POST' && path === '/auth/logout') { await this.storage.delete(identity.sessionKey); return json({ ok: true }); }
      requireThat(req.method === 'POST', 'not-found', 404); const b = await body(req);
      if (path === '/profile/action') return json(await this.action(id, b));
      if (path === '/runs/start') return json(await this.startRun(id, b));
      if (path === '/runs/settle') return json(await this.settleRun(id, b));
      if (path === '/orders') return json(await this.order(id, b));
      if (path === '/payments/toss/confirm') return json(await this.toss(id, b));
      if (path === '/payments/google/verify') return json(await this.google(id, b));
      throw new ApiError('not-found', 404);
    } catch (e) { return json({ error: e instanceof ApiError ? e.code : 'internal-error' }, e instanceof ApiError ? e.status : 500); }
  }
  async login(b) {
    fields(b, ['idToken']); const claims = await this.auth.login(b.idToken, this.env);
    const subjectKey = 'subject:' + await sha('google:' + claims.sub), token = random(), sessionKey = 'session:' + await sha(token);
    const expiresAt = this.now() + SESSION_MS;
    return this.storage.transaction(async tx => {
      let id = await tx.get(subjectKey); if (!id) { id = random(16); await tx.put(subjectKey, id); }
      let a = await tx.get('account:' + id);
      if (!a) { a = { id, createdAt: this.now(), profile: PG.defaultProfile(), wallet: { free: 0, paid: 0, debt: 0 }, activeRun: null, obfuscatedAccountId: await sha('dicekeep-account:' + id) }; await tx.put('account:' + id, a); }
      // One current session per account; re-login rotates and revokes the previous bearer.
      if (a.sessionKey) await tx.delete(a.sessionKey); a.sessionKey = sessionKey;
      await tx.put('account:' + id, a); await tx.put(sessionKey, { accountId: id, expiresAt });
      return { token, accountId: id, expiresAt, obfuscatedAccountId: a.obfuscatedAccountId, ...view(a) };
    });
  }
  async action(id, b) {
    fields(b, ['type', 'face', 'deck', 'skinId', 'requestId']); requireThat(validRequestId(b.requestId) && ['unlock', 'upgrade', 'deck', 'skinEquip'].includes(b.type), 'invalid-action');
    const fingerprint = await sha(JSON.stringify([b.type, b.face ?? null, b.deck ?? null, b.skinId ?? null]));
    return this.storage.transaction(async tx => {
      const a = await tx.get('account:' + id), key = `action:${id}:${b.requestId}`, old = await tx.get(key);
      if (old) { requireThat(old.fingerprint === fingerprint, 'request-id-conflict', 409); return { ...view(a), ...old.result, duplicate: true }; }
      requireThat(a.wallet.debt === 0 || (b.type === 'skinEquip' && b.skinId === 'base'), 'refund-debt', 409);
      const before = a.profile.shards; let result;
      if (b.type === 'skinEquip') { requireThat(cosmetics(a).owned.includes(b.skinId), 'skin-not-owned', 409); a.cosmetics.equipped = b.skinId; result = { ok: true, skinId: b.skinId }; }
      else result = b.type === 'deck' ? PG.setDeck(a.profile, b.deck) : PG[b.type](a.profile, b.face);
      requireThat(result.ok, result.reason, 409);
      const cost = before - a.profile.shards, freeSpent = Math.min(a.wallet.free, cost); a.wallet.free -= freeSpent; a.wallet.paid -= cost - freeSpent; sync(a);
      await tx.put('account:' + id, a); await tx.put(key, { fingerprint, result, at: this.now() }); return { ...view(a), ...result, duplicate: false };
    });
  }
  async startRun(id, b) {
    fields(b, ['mode']); requireThat(PG.MODES.includes(b.mode), 'invalid-mode'); const ticket = random();
    return this.storage.transaction(async tx => {
      const a = await tx.get('account:' + id); requireThat(a.wallet.debt === 0 || ['clear', 'multi'].includes(b.mode), 'refund-debt', 409);
      if (a.activeRun) { const previous = await tx.get('run:' + a.activeRun); if (previous && !previous.status) { previous.status = 'abandoned'; await tx.put('run:' + a.activeRun, previous); } }
      const snapshot = PG.snapshot(a.profile, b.mode);
      await tx.put('run:' + ticket, { id: ticket, accountId: id, mode: b.mode, startedAt: this.now(), snapshot });
      a.activeRun = ticket; await tx.put('account:' + id, a); return { ticket, ...view(a), snapshot, startedAt: this.now() };
    });
  }
  async settleRun(id, b) {
    fields(b, ['ticket', 'wave', 'kills', 'won', 'elapsed', 'date']);
    requireThat(typeof b.ticket === 'string' && /^[a-f0-9]{64}$/.test(b.ticket) && int(b.wave, 0, 1e6) && int(b.kills, 0, 1e9) && typeof b.won === 'boolean' &&
      (b.elapsed === undefined || (Number.isFinite(b.elapsed) && b.elapsed >= 0)) && (b.date === undefined || (typeof b.date === 'string' && Number.isFinite(Date.parse(b.date)))), 'invalid-run');
    const fingerprint = await sha(JSON.stringify([b.wave, b.kills, b.won]));
    return this.storage.transaction(async tx => {
      const run = await tx.get('run:' + b.ticket); requireThat(run && run.accountId === id, 'run-not-found', 404);
      const a = await tx.get('account:' + id);
      if (run.status === 'settled') { requireThat(run.fingerprint === fingerprint, 'run-conflict', 409); return { ...view(a), shards: 0, duplicate: true }; }
      requireThat(!run.status && a.activeRun === b.ticket, 'run-inactive', 409);
      const elapsed = Math.floor((this.now() - run.startedAt) / 1000), minimum = Math.max(0, b.wave - 1) * 2;
      requireThat(int(elapsed, minimum, Number.MAX_SAFE_INTEGER) && b.kills <= elapsed * 100, 'run-time-invalid', 409);
      const endless = ['extreme', 'extremeMulti'].includes(run.mode);
      requireThat(endless ? !b.won : b.wave <= 101 && (!b.won || b.wave === 101), 'run-result-invalid', 409);
      const before = a.profile.shards;
      const result = PG.settle(a.profile, { id: b.ticket, mode: run.mode, wave: b.wave, kills: b.kills, won: b.won, elapsed, date: new Date(this.now()).toISOString() });
      requireThat(result.ok && !result.duplicate, 'run-result-invalid', 409);
      const award = result.shards; a.profile.shards = before; const paid = credit(a, award, 'free');
      run.status = 'settled'; run.fingerprint = fingerprint; run.award = award; run.elapsed = elapsed; a.activeRun = null;
      await tx.put('account:' + id, a); await tx.put('run:' + b.ticket, run);
      return { ...view(a), shards: paid.credited, earnedShards: award, debtPaid: paid.debtPaid, duplicate: false };
    });
  }
  async order(id, b) {
    fields(b, ['sku', 'platform']); requireThat(['web', 'android'].includes(b.platform), 'invalid-platform');
    paymentGate(this.env, b.platform === 'web' ? 'toss' : 'google'); const product = PRODUCTS.find(p => p.sku === b.sku); requireThat(product, 'unknown-product');
    const a = await this.storage.get('account:' + id);
    requireThat(a.profile.shards + product.shards <= PG.MAX_SHARDS, 'wallet-limit', 409);
    if (product.kind === 'cosmetic') requireThat(!cosmetics(a).owned.includes(product.skinId), 'already-owned', 409);
    if (b.platform === 'android') return { productId: product.playProductId, obfuscatedAccountId: a.obfuscatedAccountId };
    const newOrder = { id: 'dk_' + random(20), accountId: id, customerKey: id, sku: product.sku, kind: product.kind, ...(product.skinId ? { skinId: product.skinId } : {}), shards: product.shards, amount: product.amount, createdAt: this.now(), environment: this.env.PAYMENT_MODE };
    const order = await this.storage.transaction(async tx => {
      if (product.kind === 'cosmetic') {
        const account = await tx.get('account:' + id); requireThat(!cosmetics(account).owned.includes(product.skinId), 'already-owned', 409);
        const lockKey = `skin-order:${id}:${product.skinId}`, pendingId = await tx.get(lockKey), pending = pendingId && await tx.get('order:' + pendingId);
        if (pending && !pending.granted && !pending.revoked && this.now() - pending.createdAt < 30 * 60000) return pending;
        await tx.put(lockKey, newOrder.id);
      }
      await tx.put('order:' + newOrder.id, newOrder); return newOrder;
    });
    return { orderId: order.id, amount: order.amount, currency: 'KRW', orderName: product.kind === 'cosmetic' ? `Dicekeep ${product.skinId} cosmetic bundle` : `Dicekeep ${product.shards} shards`, customerKey: id, clientKey: this.env.TOSS_CLIENT_KEY };
  }
  async toss(id, b) {
    fields(b, ['orderId', 'paymentKey']); requireThat(textId(b.orderId, 64) && (b.paymentKey === undefined || textId(b.paymentKey, 200)), 'invalid-payment'); paymentGate(this.env, 'toss');
    const order = await this.storage.transaction(async tx => {
      const o = await tx.get('order:' + b.orderId); requireThat(o && o.accountId === id, 'order-not-found', 404);
      requireThat(o.environment === this.env.PAYMENT_MODE && (!o.paymentKey || !b.paymentKey || o.paymentKey === b.paymentKey), 'payment-mismatch', 409);
      if (b.paymentKey) {
        const tokenKey = 'toss-key:' + await sha(b.paymentKey), used = await tx.get(tokenKey); requireThat(!used || used === o.id, 'payment-already-used', 409);
        o.paymentKey = b.paymentKey; await tx.put('order:' + o.id, o); await tx.put(tokenKey, o.id);
      } return o;
    });
    const payment = await this.providers.tossConfirm(order, b.paymentKey || order.paymentKey);
    if (payment.status !== 'DONE') {
      await this.applyTossRefund(order.id, payment);
      const a = await this.storage.get('account:' + id); return { ...view(a), shards: 0, duplicate: true, refunded: true };
    }
    return this.storage.transaction(async tx => {
      const o = await tx.get('order:' + order.id), a = await tx.get('account:' + id);
      const tokenKey = 'toss-key:' + await sha(payment.paymentKey), used = await tx.get(tokenKey);
      requireThat((!used || used === o.id) && (!o.paymentKey || o.paymentKey === payment.paymentKey), 'payment-already-used', 409);
      o.paymentKey = payment.paymentKey; await tx.put(tokenKey, o.id);
      if (o.granted) return { ...view(a), shards: 0, duplicate: true };
      requireThat(!o.revoked, 'purchase-refunded', 409);
      const paid = grantProduct(a, o, 'order:' + o.id); o.granted = true; o.grantedAt = this.now(); o.revoked = 0;
      await tx.put('account:' + id, a); await tx.put('order:' + o.id, o); return { ...view(a), shards: paid.credited, debtPaid: paid.debtPaid, duplicate: false };
    });
  }
  async google(id, b) {
    fields(b, ['purchaseToken', 'productId']); requireThat(textId(b.purchaseToken, 4096), 'invalid-purchase-token'); paymentGate(this.env, 'google');
    const product = PRODUCTS.find(p => p.playProductId === b.productId); requireThat(product, 'unknown-product');
    const a = await this.storage.get('account:' + id), key = 'purchase:' + await sha(b.purchaseToken), old = await this.storage.get(key);
    requireThat(!old || old.accountId === id, 'purchase-already-used', 409);
    const p = await this.providers.googleGet(b.purchaseToken), state = this.providers.validateGoogle(p, product.playProductId, a.obfuscatedAccountId, !!old);
    if (old) requireThat(old.orderId === p.orderId, 'purchase-mismatch', 409);
    if (state.refunded) { await this.refundGoogle(key); return { ...view(await this.storage.get('account:' + id)), shards: 0, duplicate: true, refunded: true }; }
    const encryptedToken = await cryptToken(b.purchaseToken, this.env.TOKEN_ENCRYPTION_KEY);
    // Persist wake-up BEFORE the credit transaction. A crash immediately after committing the outbox cannot strand it.
    await this.storage.setAlarm(this.now() + 60000);
    const result = await this.storage.transaction(async tx => {
      const previous = await tx.get(key), account = await tx.get('account:' + id);
      if (previous) { requireThat(previous.accountId === id && previous.productId === b.productId && previous.environment === this.env.PAYMENT_MODE, 'purchase-already-used', 409); requireThat(!previous.revoked, 'purchase-refunded', 409); return { ...view(account), shards: 0, duplicate: true }; }
      // Tokens already consumed outside this authoritative ledger cannot be restored into a second ledger.
      requireThat(!state.consumed, 'purchase-already-consumed', 409);
      const orderKey = 'google-order:' + await sha(p.orderId), used = await tx.get(orderKey); requireThat(!used, 'purchase-already-used', 409);
      // Purchase initiation rejects already-owned skins. A second actually charged, valid restore is retained as another entitlement source, not discarded.
      const paid = grantProduct(account, product, key);
      await tx.put(key, { accountId: id, productId: b.productId, kind: product.kind, ...(product.skinId ? { skinId: product.skinId } : {}), shards: product.shards, orderId: p.orderId, encryptedToken, environment: this.env.PAYMENT_MODE, revoked: 0, completed: false, grantedAt: this.now() });
      await tx.put(orderKey, key); await tx.put('account:' + id, account); await tx.put('consume:' + key.slice(9), { key, nextAttempt: this.now() });
      return { ...view(account), shards: paid.credited, debtPaid: paid.debtPaid, duplicate: false };
    });
    const completed = (product.kind === 'cosmetic' ? state.acknowledged : state.consumed) || await this.tryComplete(key, b.purchaseToken);
    if (completed) await this.markCompleted(key); else await this.storage.setAlarm(this.now() + 60000);
    if (product.kind === 'cosmetic') result.cosmetics = await this.refreshCosmetics(id);
    return { ...result, ...(product.kind === 'cosmetic' ? { acknowledgePending: !completed } : { consumePending: !completed }) };
  }
  async refreshCosmetics(id) {
    const a = await this.storage.get('account:' + id); cosmetics(a);
    for (const grants of Object.values(a.skinGrants)) for (const key of Object.keys(grants)) {
      const p = await this.storage.get(key); if (!p || p.revoked) continue;
      if (key.startsWith('order:') && enabled(this.env, 'toss')) {
        const payment = await this.providers.tossGet(p.id); requireThat(payment, 'provider-unavailable', 503);
        this.providers.validateToss(payment, p);
        if (['CANCELED', 'PARTIAL_CANCELED'].includes(payment.status)) await this.applyTossRefund(p.id, payment);
      } else if (key.startsWith('purchase:') && enabled(this.env, 'google')) {
        const token = await cryptToken(p.encryptedToken, this.env.TOKEN_ENCRYPTION_KEY, true), purchase = await this.providers.googleGet(token);
        requireThat(purchase.orderId === p.orderId, 'purchase-mismatch', 409);
        const state = this.providers.validateGoogle(purchase, p.productId, a.obfuscatedAccountId, true);
        if (state.refunded) await this.refundGoogle(key);
      }
    }
    return cosmetics(await this.storage.get('account:' + id));
  }
  async tryComplete(key, token) {
    const record = await this.storage.get(key); if (!record || record.revoked) return false;
    try { return record.kind === 'cosmetic' ? await this.providers.acknowledge(token, record.productId) : await this.providers.consume(token, record.productId); } catch { return false; }
  }
  async markCompleted(key) {
    await this.storage.transaction(async tx => { const p = await tx.get(key); if (p) { p.completed = true; await tx.put(key, p); } await tx.delete('consume:' + key.slice(9)); });
  }
  async alarm() {
    const cursor = await this.storage.get('consume-cursor');
    let rows = await this.storage.list({ prefix: 'consume:', ...(cursor ? { startAfter: cursor } : {}), limit: 20 });
    if (!rows.size && cursor) rows = await this.storage.list({ prefix: 'consume:', limit: 20 });
    for (const [jobKey, job] of rows) {
      await this.storage.put('consume-cursor', jobKey);
      const p = await this.storage.get(job.key); if (!p || p.revoked) { await this.storage.delete(jobKey); continue; }
      try {
        paymentGate(this.env, 'google');
        const token = await cryptToken(p.encryptedToken, this.env.TOKEN_ENCRYPTION_KEY, true);
        const state = this.providers.validateGoogle(await this.providers.googleGet(token), p.productId, (await this.storage.get('account:' + p.accountId)).obfuscatedAccountId, true);
        if (state.refunded) await this.refundGoogle(job.key);
        else if ((p.kind === 'cosmetic' ? state.acknowledged : state.consumed) || await this.tryComplete(job.key, token)) await this.markCompleted(job.key);
      } catch { /* keep the durable outbox for a later retry */ }
    }
    if ((await this.storage.list({ prefix: 'consume:', limit: 1 })).size) await this.storage.setAlarm(this.now() + 300000);
  }
  async tossWebhook(b) {
    paymentGate(this.env, 'toss'); let id = b.data?.orderId || b.orderId;
    const paymentKey = b.data?.paymentKey || b.paymentKey;
    if (!id && textId(paymentKey, 200)) id = await this.storage.get('toss-key:' + await sha(paymentKey));
    if (!id) return { received: true, known: false }; requireThat(textId(id, 64), 'invalid-notification');
    const o = await this.storage.get('order:' + id); if (!o?.paymentKey) return { received: true, known: false };
    this.rate('webhook:' + id, 12);
    const p = await this.providers.tossGet(id); requireThat(p, 'provider-unavailable', 503); this.providers.validateToss(p, o);
    if (!['CANCELED', 'PARTIAL_CANCELED'].includes(p.status)) return { received: true, refunded: false };
    return this.applyTossRefund(id, p);
  }
  async applyTossRefund(id, p) {
    return this.storage.transaction(async tx => {
      const order = await tx.get('order:' + id), a = await tx.get('account:' + order.accountId);
      const target = order.kind === 'cosmetic' ? 1 : Math.ceil(order.shards * (order.amount - p.balanceAmount) / order.amount);
      const delta = Math.max(0, target - (order.revoked || 0)); if (order.granted && delta > 0) revokeProduct(a, order, 'order:' + id, delta);
      order.revoked = Math.max(target, order.revoked || 0); await tx.put('order:' + id, order); await tx.put('account:' + a.id, a);
      return { received: true, refunded: true, revokedShards: delta };
    });
  }
  async refundGoogle(key) {
    return this.storage.transaction(async tx => {
      const p = await tx.get(key); if (!p) return { received: true, known: false };
      const a = await tx.get('account:' + p.accountId), target = p.kind === 'cosmetic' ? 1 : p.shards, delta = target - p.revoked;
      if (delta > 0) { revokeProduct(a, p, key, delta); p.revoked = target; await tx.put(key, p); await tx.put('account:' + a.id, a); }
      await tx.delete('consume:' + key.slice(9)); return { received: true, refunded: true, revokedShards: delta };
    });
  }
  async googleWebhook(req, b) {
    paymentGate(this.env, 'google'); const bearer = /^Bearer (.+)$/.exec(req.headers.get('authorization') || ''); requireThat(bearer, 'webhook-auth-required', 401);
    await this.auth.verify(bearer[1], [this.env.GOOGLE_RTDN_AUDIENCE], this.env.GOOGLE_RTDN_EMAIL);
    let notice; try { notice = JSON.parse(new TextDecoder().decode(unb64(b.message.data))); } catch { throw new ApiError('invalid-notification'); }
    requireThat(notice.packageName === this.env.GOOGLE_PLAY_PACKAGE, 'notification-package-mismatch', 409);
    if (notice.testNotification) return { received: true, test: true };
    const token = notice.oneTimeProductNotification?.purchaseToken || notice.voidedPurchaseNotification?.purchaseToken;
    requireThat(textId(token, 4096), 'invalid-notification'); const key = 'purchase:' + await sha(token), p = await this.storage.get(key);
    if (!p) return { received: true, known: false }; // Never grant solely from notification payload.
    const a = await this.storage.get('account:' + p.accountId);
    const state = this.providers.validateGoogle(await this.providers.googleGet(token), p.productId, a.obfuscatedAccountId, true);
    if (state.refunded) return this.refundGoogle(key);
    return { received: true, refunded: false };
  }
}
