import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, googlePurchase, paidToss } from './helpers.mjs';
import { enabled } from '../src/catalog.mjs';
import worker from '../src/index.mjs';

test('authenticated IN_PROGRESS Toss payment is approved after matching checks; READY/failed/canceled are never approved', async () => {
  const f = await fixture(), a = await f.login();
  for (const status of ['READY', 'ABORTED', 'EXPIRED', 'WAITING_FOR_DEPOSIT', 'CANCELED']) {
    const o = (await f.call('/orders', { sku: 'shards60', platform: 'web' }, a.token)).body;
    f.state.toss.set(o.orderId, { orderId: o.orderId, paymentKey: 'pk-' + o.orderId, currency: 'KRW', mId: f.env.TOSS_MID, totalAmount: o.amount, balanceAmount: status === 'CANCELED' ? 0 : o.amount, status });
    const result = await f.call('/payments/toss/confirm', { orderId: o.orderId, paymentKey: 'pk-' + o.orderId }, a.token);
    assert.equal(f.state.confirmCalls, 0); assert.equal(result.body.shards || 0, 0);
  }
  const o = (await f.call('/orders', { sku: 'shards60', platform: 'web' }, a.token)).body;
  f.state.toss.set(o.orderId, { orderId: o.orderId, paymentKey: 'pk-progress', currency: 'KRW', mId: f.env.TOSS_MID, totalAmount: o.amount, balanceAmount: o.amount, status: 'IN_PROGRESS' });
  const result = await f.call('/payments/toss/confirm', { orderId: o.orderId, paymentKey: 'pk-progress' }, a.token);
  assert.equal(result.status, 200); assert.equal(result.body.shards, 60); assert.equal(f.state.confirmCalls, 1);
});
test('IN_PROGRESS with wrong server amount is rejected before confirm', async () => {
  const f = await fixture(), a = await f.login(), o = (await f.call('/orders', { sku: 'shards60', platform: 'web' }, a.token)).body;
  f.state.toss.set(o.orderId, { orderId: o.orderId, paymentKey: 'wrong-amount', currency: 'KRW', mId: f.env.TOSS_MID, totalAmount: 1, balanceAmount: 1, status: 'IN_PROGRESS' });
  assert.equal((await f.call('/payments/toss/confirm', { orderId: o.orderId, paymentKey: 'wrong-amount' }, a.token)).status, 409); assert.equal(f.state.confirmCalls, 0);
});
test('missed refund webhook recovered by authenticated purchase restore for both providers', async () => {
  const f = await fixture(), a = await f.login(); const { order } = await paidToss(f, a);
  const p = f.state.toss.get(order.orderId); p.status = 'CANCELED'; p.balanceAmount = 0;
  const restored = await f.call('/payments/toss/confirm', { orderId: order.orderId }, a.token); assert.equal(restored.body.refunded, true); assert.equal(restored.body.profile.shards, 0);
  f.state.google.set('restore-refund', googlePurchase(a)); const req = { purchaseToken: 'restore-refund', productId: 'dicekeep.shards60' };
  await f.call('/payments/google/verify', req, a.token); const google = f.state.google.get(req.purchaseToken); google.purchaseStateContext.purchaseState = 'CANCELLED'; google.productLineItem[0].productOfferDetails.refundableQuantity = 0;
  const restoreGoogle = await f.call('/payments/google/verify', req, a.token); assert.equal(restoreGoogle.body.refunded, true); assert.equal(restoreGoogle.body.profile.shards, 0);
});
test('zero-wave quit settles immediately; high deck 2-second-per-completed-wave floor accepted', async () => {
  const f = await fixture(), a = await f.login();
  const zero = (await f.call('/runs/start', { mode: 'clear' }, a.token)).body.ticket;
  const quit = await f.call('/runs/settle', { ticket: zero, wave: 0, kills: 0, won: false }, a.token); assert.equal(quit.status, 200); assert.equal(quit.body.shards, 0);
  const quick = (await f.call('/runs/start', { mode: 'extreme' }, a.token)).body.ticket; f.state.now += 198000;
  const result = await f.call('/runs/settle', { ticket: quick, wave: 100, kills: 2500, won: false }, a.token); assert.equal(result.status, 200); assert.equal(result.body.shards, 150);
});
test('live gate needs actual operator fields and policies; disabled and live use production account ledger, test is isolated', async () => {
  const f = await fixture(); const env = { ...f.env, PAYMENT_MODE: 'live', ENABLE_LIVE_PURCHASES: 'true', TOSS_SECRET_KEY: 'live_sk_fixture', TOSS_CLIENT_KEY: 'live_ck_fixture' };
  assert.equal(enabled(env, 'toss'), false);
  Object.assign(env, { PROVIDER_CONTRACTS_CONFIRMED: 'true', PRODUCTS_REGISTERED: 'true', MERCHANT_BUSINESS_NAME: 'Operator fixture', MERCHANT_REGISTRATION_NUMBER: 'fixture', MERCHANT_CONTACT: 'support@example.test', TERMS_URL: 'https://game.example/terms', PRIVACY_URL: 'https://game.example/privacy', REFUND_POLICY_URL: 'https://game.example/refunds', ACCOUNT_DELETION_URL: 'https://game.example/delete-account' });
  assert.equal(enabled(env, 'toss'), true); assert.equal(enabled({ ...env, TERMS_URL: 'http://game.example/terms' }, 'toss'), false);
  const names = []; env.COMMERCE = { idFromName: n => { names.push(n); return n; }, get: () => f.ledger };
  for (const mode of ['disabled', 'live', 'test']) { env.PAYMENT_MODE = mode; await worker.fetch(new Request('https://commerce.example/config'), env); }
  assert.deepEqual(names, ['global:production', 'global:production', 'global:test']);
});
test('existing paid growth is retained but free pure-play rewards settle refund debt before creating spendable shards', async () => {
  const f = await fixture(), a = await f.login(); const { order } = await paidToss(f, a);
  await f.call('/profile/action', { type: 'upgrade', face: 1, requestId: 'debt-upgrade1' }, a.token);
  const p = f.state.toss.get(order.orderId); p.status = 'CANCELED'; p.balanceAmount = 0;
  await f.call('/webhooks/toss', { data: { paymentKey: p.paymentKey } });
  const ticket = (await f.call('/runs/start', { mode: 'clear' }, a.token)).body.ticket; f.state.now += 30000;
  const settled = await f.call('/runs/settle', { ticket, wave: 10, kills: 20, won: false }, a.token);
  assert.equal(settled.body.debtPaid, 10); assert.equal(settled.body.shards, 10); assert.equal(settled.body.profile.levels[1], 2);
  assert.deepEqual(settled.body.wallet, { paid: 0, free: 10, debt: 0 });
});
