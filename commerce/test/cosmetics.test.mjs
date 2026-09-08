import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, googlePurchase, paidToss, jwt } from './helpers.mjs';
import { b64 } from '../src/common.mjs';

function skinPurchase(a, skin = 'royal', orderId = 'GPA.skin-royal') {
  const p = googlePurchase(a, { orderId }); p.productLineItem[0].productId = 'dicekeep.skin_' + skin; return p;
}
test('six registered draft products separate currency from cosmetic; PG profile and combat snapshot remain unchanged', async () => {
  const f = await fixture(), a = await f.login(), products = (await f.call('/config')).body.products;
  assert.equal(products.length, 6); const skins = products.filter(p => p.kind === 'cosmetic');
  assert.deepEqual(skins.map(p => [p.sku, p.skinId, p.amount, p.shards]), [['skinRoyal', 'royal', 4900, 0], ['skinFrost', 'frost', 4900, 0], ['skinEmber', 'ember', 4900, 0]]);
  assert.deepEqual(a.cosmetics, { owned: ['base'], equipped: 'base' });
  const before = structuredClone(a.profile), initial = (await f.call('/runs/start', { mode: 'clear' }, a.token)).body.snapshot;
  const { result } = await paidToss(f, a, 'skinRoyal'); assert.deepEqual(result.body.profile, before); assert.equal(result.body.shards, 0);
  await f.call('/profile/action', { type: 'skinEquip', skinId: 'royal', requestId: 'equip-royal-0001' }, a.token);
  const run = (await f.call('/runs/start', { mode: 'clear' }, a.token)).body; assert.deepEqual(run.snapshot, initial); assert.equal(run.cosmetics.equipped, 'royal');
  assert.deepEqual((await f.call('/profile', undefined, a.token)).body, before);
  const settlement = await f.call('/runs/settle', { ticket: run.ticket, wave: 0, kills: 0, won: false }, a.token); assert.equal(settlement.body.cosmetics.equipped, 'royal');
});
test('skin equip requires ownership and request id; repeated action is free/idempotent and base always available', async () => {
  const f = await fixture(), a = await f.login();
  assert.equal((await f.call('/profile/action', { type: 'skinEquip', skinId: 'royal', requestId: 'equip-royal-0001' }, a.token)).body.error, 'skin-not-owned');
  await paidToss(f, a, 'skinRoyal'); const b = { type: 'skinEquip', skinId: 'royal', requestId: 'equip-royal-0002' };
  assert.equal((await f.call('/profile/action', b, a.token)).body.cosmetics.equipped, 'royal');
  assert.equal((await f.call('/profile/action', b, a.token)).body.duplicate, true);
  assert.equal((await f.call('/profile/action', { ...b, skinId: 'base' }, a.token)).body.error, 'request-id-conflict');
  assert.equal((await f.call('/profile/action', { ...b, skinId: 'base', requestId: 'equip-base-00001' }, a.token)).body.cosmetics.equipped, 'base');
  assert.equal((await f.call('/profile', undefined, a.token)).body.shards, 0);
});
test('normal duplicate skin checkout rejected; concurrent pending web orders reuse one order', async () => {
  const f = await fixture(), a = await f.login(), req = { sku: 'skinFrost', platform: 'web' };
  const orders = await Promise.all([f.call('/orders', req, a.token), f.call('/orders', req, a.token)]); assert.equal(orders[0].body.orderId, orders[1].body.orderId);
  await f.call('/payments/toss/confirm', { orderId: orders[0].body.orderId, paymentKey: 'skin-frost-payment' }, a.token);
  assert.equal((await f.call('/orders', req, a.token)).body.error, 'already-owned');
  assert.equal((await f.call('/orders', { ...req, platform: 'android' }, a.token)).body.error, 'already-owned');
});
test('Google cosmetic verify acknowledges once and NEVER consumes; previously acknowledged restore still works', async () => {
  const f = await fixture(), a = await f.login(); f.state.google.set('skin-token', skinPurchase(a));
  const b = { productId: 'dicekeep.skin_royal', purchaseToken: 'skin-token' };
  const first = await f.call('/payments/google/verify', b, a.token); assert.equal(first.status, 200); assert.equal(first.body.acknowledgePending, false); assert.equal(first.body.shards, 0);
  const restore = await f.call('/payments/google/verify', b, a.token); assert.equal(restore.body.duplicate, true); assert.equal(f.state.ackCalls, 1); assert.equal(f.state.consumeCalls, 0);
  const old = skinPurchase(a, 'ember', 'GPA.old-acked'); old.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'; f.state.google.set('old-acked-skin', old);
  const oldRestore = await f.call('/payments/google/verify', { productId: 'dicekeep.skin_ember', purchaseToken: 'old-acked-skin' }, a.token); assert.equal(oldRestore.status, 200); assert.ok(oldRestore.body.cosmetics.owned.includes('ember')); assert.equal(f.state.ackCalls, 1);
});
test('Google ack failure uses durable retry without duplicate entitlement or currency', async () => {
  const f = await fixture(), a = await f.login(); f.state.google.set('skin-retry', skinPurchase(a)); f.state.ackFail = true;
  const b = { productId: 'dicekeep.skin_royal', purchaseToken: 'skin-retry' }, first = await f.call('/payments/google/verify', b, a.token);
  assert.equal(first.body.acknowledgePending, true); assert.deepEqual(first.body.cosmetics.owned, ['base', 'royal']);
  f.state.ackFail = false; await f.ledger.alarm(); assert.equal((await f.storage.list({ prefix: 'consume:' })).size, 0);
  assert.deepEqual((await f.call('/cosmetics', undefined, a.token)).body.owned, ['base', 'royal']); assert.equal(f.state.consumeCalls, 0); assert.equal((await f.call('/profile', undefined, a.token)).body.shards, 0);
});
test('multiple paid entitlement sources combine with OR; only last valid refund falls back to base', async () => {
  const f = await fixture(), a = await f.login(); const { order } = await paidToss(f, a, 'skinRoyal');
  f.state.google.set('second-valid-source', skinPurchase(a)); const req = { productId: 'dicekeep.skin_royal', purchaseToken: 'second-valid-source' };
  assert.equal((await f.call('/payments/google/verify', req, a.token)).status, 200);
  await f.call('/profile/action', { type: 'skinEquip', skinId: 'royal', requestId: 'equip-royal-0001' }, a.token);
  const google = f.state.google.get(req.purchaseToken); google.purchaseStateContext.purchaseState = 'CANCELLED'; google.productLineItem[0].productOfferDetails.refundableQuantity = 0;
  const restored = await f.call('/payments/google/verify', req, a.token); assert.equal(restored.body.cosmetics.equipped, 'royal');
  const toss = f.state.toss.get(order.orderId); toss.status = 'CANCELED'; toss.balanceAmount = 0;
  await f.call('/webhooks/toss', { data: { orderId: order.orderId } }); assert.deepEqual((await f.call('/cosmetics', undefined, a.token)).body, { owned: ['base'], equipped: 'base' });
  assert.deepEqual((await f.call('/wallet', undefined, a.token)).body, { paid: 0, free: 0, debt: 0 });
  assert.equal((await f.call('/orders', { sku: 'skinRoyal', platform: 'web' }, a.token)).status, 200);
});
test('provider-confirmed partial refund revokes indivisible bundle only; Google authenticated RTDN has same base fallback', async () => {
  const f = await fixture(), a = await f.login(); const { order } = await paidToss(f, a, 'skinFrost');
  const toss = f.state.toss.get(order.orderId); toss.status = 'PARTIAL_CANCELED'; toss.balanceAmount = 4000;
  await f.call('/webhooks/toss', { data: { orderId: order.orderId } }); assert.deepEqual((await f.call('/cosmetics', undefined, a.token)).body.owned, ['base']);
  f.state.google.set('rtdn-skin', skinPurchase(a)); await f.call('/payments/google/verify', { productId: 'dicekeep.skin_royal', purchaseToken: 'rtdn-skin' }, a.token);
  await f.call('/profile/action', { type: 'skinEquip', skinId: 'royal', requestId: 'equip-royal-0001' }, a.token);
  const g = f.state.google.get('rtdn-skin'); g.purchaseStateContext.purchaseState = 'CANCELLED'; g.productLineItem[0].productOfferDetails.refundableQuantity = 0;
  const notice = { message: { data: b64(new TextEncoder().encode(JSON.stringify({ packageName: f.env.GOOGLE_PLAY_PACKAGE, voidedPurchaseNotification: { purchaseToken: 'rtdn-skin' } }))) } };
  const token = await jwt({ aud: f.env.GOOGLE_RTDN_AUDIENCE, email: f.env.GOOGLE_RTDN_EMAIL, email_verified: true });
  assert.equal((await f.call('/webhooks/google', notice, token)).body.refunded, true); assert.deepEqual((await f.call('/cosmetics', undefined, a.token)).body, { owned: ['base'], equipped: 'base' });
});
test('cosmetics refresh checks every active receipt and repairs missed refund notifications', async () => {
  const f = await fixture(), a = await f.login(); const { order } = await paidToss(f, a, 'skinRoyal');
  f.state.google.set('royal-restore-active', skinPurchase(a));
  await f.call('/payments/google/verify', { productId: 'dicekeep.skin_royal', purchaseToken: 'royal-restore-active' }, a.token);
  await f.call('/profile/action', { type: 'skinEquip', skinId: 'royal', requestId: 'equip-royal-refresh' }, a.token);
  const toss = f.state.toss.get(order.orderId); toss.status = 'CANCELED'; toss.balanceAmount = 0;
  assert.equal((await f.call('/cosmetics', undefined, a.token)).body.equipped, 'royal');
  const google = f.state.google.get('royal-restore-active'); google.purchaseStateContext.purchaseState = 'CANCELLED'; google.productLineItem[0].productOfferDetails.refundableQuantity = 0;
  assert.deepEqual((await f.call('/cosmetics', undefined, a.token)).body, { owned: ['base'], equipped: 'base' });
});
