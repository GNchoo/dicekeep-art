import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, jwt, googlePurchase, paidToss, NOW } from './helpers.mjs';
import { sha, b64 } from '../src/common.mjs';
import worker from '../src/index.mjs';
import PG from '../src/progression.mjs';

test('disabled by default; live requires explicit flag, complete configuration and live key prefix', async () => {
  for (const override of [{ PAYMENT_MODE: undefined }, { PAYMENT_MODE: 'live' }, { PAYMENT_MODE: 'live', ENABLE_LIVE_PURCHASES: 'true' }, { TOKEN_ENCRYPTION_KEY: '' }]) {
    const f = await fixture(override), a = await f.login(); const config = (await f.call('/config')).body;
    assert.equal(config.providers.web, false);
    assert.equal((await f.call('/orders', { sku: 'shards60', platform: 'web' }, a.token)).status, 503);
    assert.equal(f.state.confirmCalls, 0);
  }
});
test('Google JWT signature, audience, issuer, expiration, subject and algorithm validated', async () => {
  const f = await fixture(); const valid = await jwt();
  assert.equal((await f.call('/auth/google', { idToken: valid })).status, 200);
  for (const c of [{ aud: 'other-app' }, { iss: 'https://attacker' }, { exp: NOW / 1000 - 1 }, { sub: '' }, { iat: NOW / 1000 + 9999 }, { azp: 'other-app' }]) assert.equal((await f.call('/auth/google', { idToken: await jwt(c) })).status, 401);
  assert.equal((await f.call('/auth/google', { idToken: await jwt({}, { alg: 'HS256' }) })).status, 401);
  const tampered = valid.split('.'); tampered[1] = b64(new TextEncoder().encode(JSON.stringify({ sub: 'attacker' })));
  assert.equal((await f.call('/auth/google', { idToken: tampered.join('.') })).status, 401);
});
test('profile server-created; raw bearer never stored; rotate/logout/expiry reject old sessions', async () => {
  const f = await fixture(), a = await f.login(); assert.deepEqual(a.profile, PG.defaultProfile());
  assert.equal(JSON.stringify([...f.storage.data]).includes(a.token), false);
  assert.equal((await f.call('/auth/google', { idToken: await jwt(), profile: { shards: 9999 } })).status, 400);
  assert.equal((await f.call('/profile', undefined, a.token)).status, 200);
  const b = await f.login(); assert.equal(b.accountId, a.accountId);
  assert.equal((await f.call('/profile', undefined, a.token)).status, 401);
  await f.call('/auth/logout', {}, b.token); assert.equal((await f.call('/profile', undefined, b.token)).status, 401);
  const c = await f.login(); f.state.now += 86400001; assert.equal((await f.call('/profile', undefined, c.token)).status, 401);
});
test('origin allowlist and bearer/JSON-only boundary; no profile upload route', async () => {
  const f = await fixture(), a = await f.login();
  const env = { ...f.env, COMMERCE: { idFromName: x => { assert.equal(x, 'global:test'); return x; }, get: () => f.ledger } };
  assert.equal((await worker.fetch(new Request('https://commerce.example/config', { headers: { Origin: 'https://evil.example' } }), env)).status, 403);
  const good = await worker.fetch(new Request('https://commerce.example/config', { headers: { Origin: 'https://game.example' } }), env); assert.equal(good.headers.get('access-control-allow-origin'), 'https://game.example');
  assert.equal((await f.call('/profile', { shards: 1e6 }, a.token)).status, 404);
  assert.equal((await f.ledger.fetch(new Request('https://commerce.example/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'idToken=x' }))).status, 415);
});
test('server prices, amount tamper rejection, own-order linkage, MID/currency/amount/key validation', async () => {
  const f = await fixture(), a = await f.login(), b = await f.login('user2');
  assert.equal((await f.call('/orders', { sku: 'shards60', platform: 'web', amount: 1 }, a.token)).status, 400);
  const order = (await f.call('/orders', { sku: 'shards60', platform: 'web' }, a.token)).body; assert.equal(order.amount, 1100);
  assert.equal((await f.call('/payments/toss/confirm', { orderId: order.orderId, paymentKey: 'pk' }, b.token)).status, 404);
  for (const bad of [{ totalAmount: 1 }, { currency: 'USD' }, { mId: 'other' }, { orderId: 'another-order' }, { paymentKey: 'another-key' }, { customerKey: b.accountId }]) {
    f.state.toss.set(order.orderId, { orderId: order.orderId, paymentKey: 'pk', currency: 'KRW', mId: f.env.TOSS_MID, totalAmount: 1100, balanceAmount: 1100, status: 'DONE', ...bad });
    assert.equal((await f.call('/payments/toss/confirm', { orderId: order.orderId, paymentKey: 'pk' }, a.token)).status, 409);
  }
  assert.equal((await f.call('/profile', undefined, a.token)).body.shards, 0);
});
test('Toss lost approval response recovers with GET; concurrent retries grant once', async () => {
  const f = await fixture(), a = await f.login(); f.state.confirmLost = true;
  const o = (await f.call('/orders', { sku: 'shards600', platform: 'web' }, a.token)).body;
  const rows = await Promise.all(Array.from({ length: 3 }, () => f.call('/payments/toss/confirm', { orderId: o.orderId, paymentKey: 'retry-key' }, a.token)));
  assert.ok(rows.every(x => x.status === 200)); assert.equal(rows.reduce((n, x) => n + x.body.shards, 0), 600);
  assert.equal((await f.call('/profile', undefined, a.token)).body.shards, 600);
  assert.ok(f.state.calls.filter(c => c.url.endsWith('/confirm')).every(c => JSON.parse(c.body).amount === 9900));
});
test('lost return URL restores own order without paymentKey and never approves a missing payment', async () => {
  const f = await fixture(), a = await f.login(); const o = (await f.call('/orders', { sku: 'shards60', platform: 'web' }, a.token)).body;
  assert.equal((await f.call('/payments/toss/confirm', { orderId: o.orderId }, a.token)).status, 409); assert.equal(f.state.confirmCalls, 0);
  f.state.toss.set(o.orderId, { orderId: o.orderId, paymentKey: 'recover-key', currency: 'KRW', mId: f.env.TOSS_MID, totalAmount: 1100, balanceAmount: 1100, status: 'DONE' });
  assert.equal((await f.call('/payments/toss/confirm', { orderId: o.orderId }, a.token)).body.shards, 60);
  assert.equal((await f.call('/payments/toss/confirm', { orderId: o.orderId }, a.token)).body.duplicate, true); assert.equal(f.state.confirmCalls, 0);
});
test('Toss pending and uncertain GET cannot grant or trigger blind approval', async () => {
  const f = await fixture(), a = await f.login(); const o = (await f.call('/orders', { sku: 'shards60', platform: 'web' }, a.token)).body;
  f.state.toss.set(o.orderId, { orderId: o.orderId, paymentKey: 'pending-key', currency: 'KRW', mId: f.env.TOSS_MID, totalAmount: 1100, balanceAmount: 1100, status: 'WAITING_FOR_DEPOSIT' });
  assert.equal((await f.call('/payments/toss/confirm', { orderId: o.orderId, paymentKey: 'pending-key' }, a.token)).body.error, 'payment-pending');
  f.state.handler = url => url.includes('/payments/orders/') ? Response.json({}, { status: 503 }) : null;
  assert.equal((await f.call('/payments/toss/confirm', { orderId: o.orderId, paymentKey: 'pending-key' }, a.token)).status, 503); assert.equal(f.state.confirmCalls, 0);
});
test('profile actions charge once, detect id reuse and block impossible deck/locked upgrade', async () => {
  const f = await fixture(), a = await f.login(); await paidToss(f, a, 'shards600');
  const request = { type: 'unlock', face: 7, requestId: 'unlock-0001' };
  const r = await Promise.all([f.call('/profile/action', request, a.token), f.call('/profile/action', request, a.token)]);
  assert.ok(r.every(x => x.status === 200)); assert.equal((await f.call('/profile', undefined, a.token)).body.shards, 520);
  assert.equal((await f.call('/profile/action', { ...request, face: 8 }, a.token)).body.error, 'request-id-conflict');
  assert.equal((await f.call('/profile/action', { type: 'deck', deck: [1, 2, 3, 4, 20], requestId: 'deck-0001' }, a.token)).status, 409);
  assert.equal((await f.call('/profile/action', { type: 'upgrade', face: 20, requestId: 'upgrade-0001' }, a.token)).status, 409);
  const upgraded = await f.call('/profile/action', { type: 'upgrade', face: 7, requestId: 'upgrade-0002' }, a.token); assert.equal(upgraded.body.profile.levels[7], 2); assert.equal(upgraded.body.profile.shards, 510);
});
test('server run tickets: active replacement, time/identity/mode checks, 500 base plus50 first milestones, durable duplicate protection', async () => {
  const f = await fixture(), a = await f.login(), other = await f.login('user2');
  const one = (await f.call('/runs/start', { mode: 'build' }, a.token)).body;
  const two = (await f.call('/runs/start', { mode: 'extreme' }, a.token)).body;
  const report = { ticket: two.ticket, wave: 500, kills: 1000, won: false, elapsed: 99999, date: '2099-01-01' };
  assert.equal((await f.call('/runs/settle', { ...report, ticket: one.ticket }, a.token)).body.error, 'run-inactive');
  assert.equal((await f.call('/runs/settle', report, other.token)).status, 404);
  assert.equal((await f.call('/runs/settle', report, a.token)).body.error, 'run-time-invalid');
  f.state.now += 2500000;
  assert.equal((await f.call('/runs/settle', { ...report, won: true }, a.token)).body.error, 'run-result-invalid');
  const result = await f.call('/runs/settle', report, a.token); assert.equal(result.body.shards, 550); assert.equal(result.body.profile.records.extreme.runs[0].elapsed, 2500);
  assert.ok(result.body.profile.records.extreme.runs[0].date.startsWith('2026-'));
  const again = await f.call('/runs/settle', report, a.token); assert.equal(again.body.shards, 0); assert.equal(again.body.duplicate, true);
  assert.equal((await f.call('/runs/settle', { ...report, wave: 501 }, a.token)).body.error, 'run-conflict');
  assert.equal((await f.call('/runs/settle', { ...report, wave: 1.1 }, a.token)).status, 400);
});
test('pure/build/multi results cap at101; extreme keeps going; snapshot freezes purchased levels', async () => {
  const f = await fixture(), a = await f.login(); await paidToss(f, a);
  const t = (await f.call('/runs/start', { mode: 'build' }, a.token)).body; assert.equal(t.snapshot.levels[1], 1);
  await f.call('/profile/action', { type: 'upgrade', face: 1, requestId: 'upgrade-0001' }, a.token);
  assert.equal((await f.storage.get('run:' + t.ticket)).snapshot.levels[1], 1);
  f.state.now += 1000000;
  assert.equal((await f.call('/runs/settle', { ticket: t.ticket, wave: 102, kills: 10, won: true }, a.token)).body.error, 'run-result-invalid');
  const won = await f.call('/runs/settle', { ticket: t.ticket, wave: 101, kills: 10, won: true }, a.token); assert.equal(won.body.shards, 170);
});
test('Google PURCHASED matching product, quantity1 and account required; pending never consumed', async () => {
  const f = await fixture(), a = await f.login();
  for (const [i, alter] of [p => { p.obfuscatedExternalAccountId = 'other'; }, p => { p.productLineItem[0].productId = 'wrong'; }, p => { p.productLineItem[0].productOfferDetails.quantity = 2; }, p => { p.purchaseStateContext.purchaseState = 'PENDING'; }, p => { delete p.testPurchaseContext; }].entries()) {
    const p = googlePurchase(a); alter(p); f.state.google.set('bad-' + i, p);
    assert.equal((await f.call('/payments/google/verify', { productId: 'dicekeep.shards60', purchaseToken: 'bad-' + i }, a.token)).status, 409);
  }
  assert.equal(f.state.consumeCalls, 0); assert.equal((await f.call('/profile', undefined, a.token)).body.shards, 0);
});
test('Google concurrent/restore duplicate token grants once; cross-account and order alias rejected', async () => {
  const f = await fixture(), a = await f.login(), other = await f.login('user2'); f.state.google.set('purchase-one', googlePurchase(a));
  const payload = { productId: 'dicekeep.shards60', purchaseToken: 'purchase-one' };
  const r = await Promise.all([f.call('/payments/google/verify', payload, a.token), f.call('/payments/google/verify', payload, a.token)]);
  assert.ok(r.every(x => x.status === 200)); assert.equal(r.reduce((n, x) => n + x.body.shards, 0), 60);
  assert.equal((await f.call('/payments/google/verify', payload, other.token)).body.error, 'purchase-already-used');
  f.state.google.set('purchase-alias', googlePurchase(a));
  assert.equal((await f.call('/payments/google/verify', { ...payload, purchaseToken: 'purchase-alias' }, a.token)).body.error, 'purchase-already-used');
  assert.equal(JSON.stringify([...f.storage.data]).includes('purchase-one'), false);
});
test('Google consume failure leaves durable retry outbox; alarm/restart retries without extra credit', async () => {
  const f = await fixture(), a = await f.login(); f.state.google.set('consume-retry', googlePurchase(a)); f.state.consumeFail = true;
  const result = await f.call('/payments/google/verify', { productId: 'dicekeep.shards60', purchaseToken: 'consume-retry' }, a.token);
  assert.equal(result.body.shards, 60); assert.equal(result.body.consumePending, true); assert.ok(f.storage.alarmAt);
  f.state.consumeFail = false; await f.ledger.alarm();
  assert.equal((await f.storage.list({ prefix: 'consume:' })).size, 0); assert.equal((await f.call('/profile', undefined, a.token)).body.shards, 60);
});
test('Google lost consume response resolves on retry from provider consumed state', async () => {
  const f = await fixture(), a = await f.login(); f.state.google.set('consume-lost', googlePurchase(a)); f.state.consumeLost = true;
  const b = { productId: 'dicekeep.shards60', purchaseToken: 'consume-lost' };
  assert.equal((await f.call('/payments/google/verify', b, a.token)).body.consumePending, true);
  const retry = await f.call('/payments/google/verify', b, a.token); assert.equal(retry.body.duplicate, true); assert.equal(retry.body.consumePending, false);
  assert.equal((await f.storage.list({ prefix: 'consume:' })).size, 0);
});
test('Toss forged webhook status has no effect; provider partial/full refunds idempotently debit paid then debt', async () => {
  const f = await fixture(), a = await f.login(); const { order } = await paidToss(f, a);
  await f.call('/profile/action', { type: 'upgrade', face: 1, requestId: 'upgrade-0001' }, a.token);
  assert.equal((await f.call('/webhooks/toss', { data: { orderId: order.orderId, status: 'CANCELED' } })).body.refunded, false);
  let p = f.state.toss.get(order.orderId); p.status = 'PARTIAL_CANCELED'; p.balanceAmount = 550;
  assert.equal((await f.call('/webhooks/toss', { data: { orderId: order.orderId } })).body.revokedShards, 30);
  p.status = 'CANCELED'; p.balanceAmount = 0;
  assert.equal((await f.call('/webhooks/toss', { data: { orderId: order.orderId } })).body.revokedShards, 30);
  assert.equal((await f.call('/webhooks/toss', { data: { orderId: order.orderId } })).body.revokedShards, 0);
  assert.deepEqual((await f.call('/wallet', undefined, a.token)).body, { free: 0, paid: 0, debt: 10 });
  assert.equal((await f.call('/profile', undefined, a.token)).body.levels[1], 2);
  assert.equal((await f.call('/profile/action', { type: 'upgrade', face: 1, requestId: 'upgrade-0002' }, a.token)).body.error, 'refund-debt');
  assert.equal((await f.call('/runs/start', { mode: 'build' }, a.token)).body.error, 'refund-debt');
  assert.equal((await f.call('/runs/start', { mode: 'clear' }, a.token)).status, 200);
});
test('refund keeps free rewards; pure-play rewards can repay debt without removing prior growth', async () => {
  const f = await fixture(), a = await f.login(); const { order } = await paidToss(f, a);
  const ticket = (await f.call('/runs/start', { mode: 'clear' }, a.token)).body.ticket; f.state.now += 60000;
  await f.call('/runs/settle', { ticket, wave: 10, kills: 20, won: false }, a.token);
  const p = f.state.toss.get(order.orderId); p.status = 'CANCELED'; p.balanceAmount = 0;
  await f.call('/webhooks/toss', { data: { orderId: order.orderId } }); assert.deepEqual((await f.call('/wallet', undefined, a.token)).body, { free: 20, paid: 0, debt: 0 });
});
test('Google RTDN requires signed expected PubSub identity; cancellation is re-queried, never trusted', async () => {
  const f = await fixture(), a = await f.login(); const token = 'refund-google'; f.state.google.set(token, googlePurchase(a));
  await f.call('/payments/google/verify', { purchaseToken: token, productId: 'dicekeep.shards60' }, a.token);
  const notification = { message: { data: b64(new TextEncoder().encode(JSON.stringify({ packageName: f.env.GOOGLE_PLAY_PACKAGE, oneTimeProductNotification: { purchaseToken: token, notificationType: 2 } }))) } };
  assert.equal((await f.call('/webhooks/google', notification)).status, 401);
  const bearer = await jwt({ aud: f.env.GOOGLE_RTDN_AUDIENCE, email: f.env.GOOGLE_RTDN_EMAIL, email_verified: true });
  assert.equal((await f.call('/webhooks/google', notification, bearer)).body.refunded, false);
  const p = f.state.google.get(token); p.purchaseStateContext.purchaseState = 'CANCELLED'; p.productLineItem[0].productOfferDetails.refundableQuantity = 0;
  assert.equal((await f.call('/webhooks/google', notification, bearer)).body.revokedShards, 60);
  assert.equal((await f.call('/webhooks/google', notification, bearer)).body.revokedShards, 0);
  assert.equal((await f.call('/profile', undefined, a.token)).body.shards, 0);
});
test('provider errors do not leak credentials, JWT, or purchase token', async () => {
  const f = await fixture(), a = await f.login(); f.state.handler = url => url.includes('androidpublisher') ? Response.json({ message: 'sensitive-fixture-token' }, { status: 500 }) : null;
  const r = await f.call('/payments/google/verify', { purchaseToken: 'sensitive-fixture-token', productId: 'dicekeep.shards60' }, a.token);
  assert.equal(r.status, 503); assert.deepEqual(r.body, { error: 'purchase-unverified' });
});
