import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, googlePurchase, paidToss } from './helpers.mjs';
import { CommerceLedger } from '../src/ledger.mjs';

const SKU = 'passFounders', PRODUCT = 'dicekeep.pass_founders';
const account = (f, a) => f.storage.get('account:' + a.accountId);
const owned = a => Object.keys(a.passGrants?.founders || {}).length > 0;
const claim = (f, a, tier, track = 'premium', requestId = `pass-${track}-${tier}-claim`) =>
  f.call('/pass/claim', { tier, track, requestId }, a.token);

async function unlocked() {
  const f = await fixture(), a = await f.login();
  const first = await f.call('/liveops', undefined, a.token);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const stored = await account(f, a);
  assert.ok(stored.liveops?.pass, 'the account has authoritative liveops state');
  stored.liveops.pass.xp = 2000;
  await f.storage.put('account:' + a.accountId, stored);
  return { f, a };
}

function passPurchase(a, orderId) {
  const purchase = googlePurchase(a, { orderId });
  purchase.productLineItem[0].productId = PRODUCT;
  return purchase;
}

async function buyGoogle(f, a, token = 'pass-google-token', orderId = 'GPA.pass-1') {
  f.state.google.set(token, passPurchase(a, orderId));
  const payload = { productId: PRODUCT, purchaseToken: token };
  const result = await f.call('/payments/google/verify', payload, a.token);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return { payload, result };
}

function cancelToss(f, order, partial = false) {
  const payment = f.state.toss.get(order.orderId);
  payment.status = partial ? 'PARTIAL_CANCELED' : 'CANCELED';
  payment.balanceAmount = partial ? order.amount - 900 : 0;
}

function cancelGoogle(f, token) {
  const purchase = f.state.google.get(token);
  purchase.purchaseStateContext.purchaseState = 'CANCELLED';
  purchase.productLineItem[0].productOfferDetails.refundableQuantity = 0;
}

test('founders server price is 2900; free tiers work before purchase and premium claims require ownership', async () => {
  const { f, a } = await unlocked(), before = await account(f, a);
  const product = (await f.call('/config')).body.products.find(p => p.sku === SKU);
  assert.deepEqual([product.kind, product.passId, product.amount, product.shards, product.playProductId], ['pass', 'founders', 2900, 0, PRODUCT]);
  assert.equal((await claim(f, a, 1)).body.error, 'premium-required');
  const first = await claim(f, a, 1, 'free');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const repeat = await claim(f, a, 1, 'free');
  assert.equal(repeat.status, 200); assert.equal(repeat.body.duplicate, true);
  assert.equal((await claim(f, a, 1, 'free', 'pass-free-1-another')).body.error, 'already-claimed');
  assert.equal((await claim(f, a, 2, 'free', 'pass-free-1-claim')).body.error, 'request-id-conflict');
  const stored = await account(f, a);
  assert.deepEqual(stored.wallet, { free: before.wallet.free + 2, paid: before.wallet.paid, debt: 0 });
  assert.equal(stored.profile.collection.gold, before.profile.collection.gold + 100);
  assert.deepEqual(stored.liveops.pass.freeClaimed, [1]);
  assert.deepEqual(stored.liveops.pass.premiumClaimed, []);
  assert.equal(owned(stored), false);
});

test('Toss pass reuses a pending order, grants no immediate shards, and supports concurrent retroactive tier claims once', async () => {
  const { f, a } = await unlocked(), before = await account(f, a);
  const request = { sku: SKU, platform: 'web' };
  const orders = await Promise.all([f.call('/orders', request, a.token), f.call('/orders', request, a.token)]);
  assert.ok(orders.every(r => r.status === 200));
  assert.equal(orders[0].body.orderId, orders[1].body.orderId);
  assert.equal(orders[0].body.amount, 2900);
  const payload = { orderId: orders[0].body.orderId, paymentKey: 'founders-toss-payment' };
  const bought = await f.call('/payments/toss/confirm', payload, a.token);
  assert.equal(bought.status, 200, JSON.stringify(bought.body));
  assert.equal(bought.body.shards, 0);
  assert.deepEqual((await account(f, a)).wallet, before.wallet);
  assert.equal((await f.call('/payments/toss/confirm', payload, a.token)).body.duplicate, true);
  for (const platform of ['web', 'android']) assert.equal((await f.call('/orders', { sku: SKU, platform }, a.token)).body.error, 'already-owned');
  const reports = await Promise.all([claim(f, a, 20), claim(f, a, 20)]);
  assert.ok(reports.every(r => r.status === 200));
  assert.equal(reports.filter(r => r.body.duplicate === true).length, 1);
  assert.equal((await account(f, a)).wallet.paid, 10);
  assert.equal((await claim(f, a, 10)).status, 200);
  const stored = await account(f, a);
  assert.equal(stored.wallet.paid, 20);
  assert.equal(stored.profile.collection.gold, before.profile.collection.gold);
  assert.deepEqual(stored.liveops.pass.premiumClaimed, [10, 20]);
  assert.ok(stored.cosmetics.owned.includes('royal'));
  assert.equal(stored.skinGrants.royal['pass:founders'], true);
});

test('Toss refund reverses all collected premium shards into paid/debt; fresh purchase restores once without resetting claims', async () => {
  const { f, a } = await unlocked();
  assert.equal((await claim(f, a, 1, 'free')).status, 200);
  const { order, result } = await paidToss(f, a, SKU);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  for (let tier = 1; tier <= 20; tier++) {
    const collected = await claim(f, a, tier);
    assert.equal(collected.status, 200, `tier ${tier}: ${JSON.stringify(collected.body)}`);
  }
  let stored = await account(f, a);
  const claims = structuredClone(stored.liveops.pass), gold = stored.profile.collection.gold;
  assert.equal(stored.wallet.paid, 200);
  // Model previously spent paid currency, without changing any refund or claim records.
  stored.wallet.paid = 37; stored.profile.shards = stored.wallet.free + 37;
  await f.storage.put('account:' + a.accountId, stored);
  assert.equal((await f.call('/profile/action', { type: 'skinEquip', skinId: 'royal', requestId: 'pass-equip-refund' }, a.token)).status, 200);
  cancelToss(f, order);
  assert.equal((await f.call('/webhooks/toss', { data: { orderId: order.orderId } })).status, 200);
  stored = await account(f, a);
  assert.deepEqual(stored.wallet, { free: 2, paid: 0, debt: 163 });
  assert.equal(stored.profile.collection.gold, gold);
  assert.deepEqual(stored.liveops.pass, claims);
  assert.equal(owned(stored), false);
  assert.deepEqual(stored.cosmetics, { owned: ['base'], equipped: 'base' });
  assert.equal(stored.passBenefits.founders.reversedShards, 200);
  await f.call('/webhooks/toss', { data: { orderId: order.orderId } });
  assert.deepEqual((await account(f, a)).wallet, stored.wallet);
  const refundedRestore = await f.call('/payments/toss/confirm', { orderId: order.orderId }, a.token);
  assert.equal(refundedRestore.body.refunded, true);
  assert.equal(owned(await account(f, a)), false);
  const repurchase = await paidToss(f, a, SKU);
  assert.equal(repurchase.result.status, 200, JSON.stringify(repurchase.result.body));
  assert.notEqual(repurchase.order.orderId, order.orderId);
  stored = await account(f, a);
  assert.deepEqual(stored.wallet, { free: 2, paid: 37, debt: 0 });
  assert.equal(stored.passBenefits.founders.reversedShards, 0);
  assert.equal(stored.passBenefits.founders.awardedShards, 200);
  assert.ok(stored.cosmetics.owned.includes('royal'));
  assert.deepEqual(stored.liveops.pass, claims);
  assert.equal((await claim(f, a, 10, 'premium', 'pass-rebuy-tier10')).body.error, 'already-claimed');
  assert.equal((await claim(f, a, 1, 'free', 'pass-rebuy-free1')).body.error, 'already-claimed');
  assert.equal((await f.call('/payments/toss/confirm', { orderId: repurchase.order.orderId }, a.token)).body.duplicate, true);
  assert.deepEqual((await account(f, a)).wallet, stored.wallet);
});

test('partial pass refund removes only the pass royal source and preserves an independently purchased royal skin', async () => {
  const { f, a } = await unlocked();
  assert.equal((await paidToss(f, a, 'skinRoyal')).result.status, 200);
  const { order, result } = await paidToss(f, a, SKU);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((await claim(f, a, 10)).status, 200);
  await f.call('/profile/action', { type: 'skinEquip', skinId: 'royal', requestId: 'pass-direct-royal' }, a.token);
  cancelToss(f, order, true);
  assert.equal((await f.call('/webhooks/toss', { data: { orderId: order.orderId } })).status, 200);
  const stored = await account(f, a);
  assert.equal(owned(stored), false);
  assert.equal(stored.wallet.paid, 0);
  assert.equal(stored.skinGrants.royal['pass:founders'], undefined);
  assert.equal(Object.keys(stored.skinGrants.royal).length, 1);
  assert.equal(stored.cosmetics.equipped, 'royal');
});

test('Google pass acknowledges without consuming, restores once, and rejects cross-account or order-alias reuse', async () => {
  const { f, a } = await unlocked();
  const { payload, result } = await buyGoogle(f, a);
  assert.equal(result.body.acknowledgePending, false);
  assert.equal(result.body.shards, 0);
  assert.equal(f.state.ackCalls, 1); assert.equal(f.state.consumeCalls, 0);
  assert.equal((await f.call('/payments/google/verify', payload, a.token)).body.duplicate, true);
  assert.equal(f.state.ackCalls, 1); assert.equal(f.state.consumeCalls, 0);
  const other = await f.login('other-pass-user');
  assert.equal((await f.call('/payments/google/verify', payload, other.token)).body.error, 'purchase-already-used');
  f.state.google.set('pass-token-alias', passPurchase(a, 'GPA.pass-1'));
  assert.equal((await f.call('/payments/google/verify', { ...payload, purchaseToken: 'pass-token-alias' }, a.token)).body.error, 'purchase-already-used');
  assert.equal(Object.keys((await account(f, a)).passGrants.founders).length, 1);
  assert.equal((await account(f, a)).wallet.paid, 0);
});

test('Google pending acknowledgement survives ledger recreation without consuming or duplicating pass benefits', async () => {
  const { f, a } = await unlocked(); f.state.ackFail = true;
  const { payload, result } = await buyGoogle(f, a, 'pass-ack-retry', 'GPA.pass-retry');
  assert.equal(result.body.acknowledgePending, true);
  assert.equal((await claim(f, a, 1)).status, 200);
  assert.equal((await f.storage.list({ prefix: 'consume:' })).size, 1);
  const before = await account(f, a);
  f.state.ackFail = false;
  const restarted = new CommerceLedger({ storage: f.storage }, f.env, { fetch: f.fetcher, now: () => f.state.now });
  await restarted.alarm();
  assert.equal((await f.storage.list({ prefix: 'consume:' })).size, 0);
  assert.equal(f.state.consumeCalls, 0);
  const restored = await f.call('/payments/google/verify', payload, a.token);
  assert.equal(restored.body.duplicate, true); assert.equal(restored.body.acknowledgePending, false);
  assert.deepEqual((await account(f, a)).wallet, before.wallet);
  assert.deepEqual((await account(f, a)).liveops.pass, before.liveops.pass);
});

test('Toss and Google pass receipts combine with OR and only the final refund removes collected benefits', async () => {
  const { f, a } = await unlocked();
  const { order, result } = await paidToss(f, a, SKU); assert.equal(result.status, 200);
  const { payload } = await buyGoogle(f, a, 'pass-second-provider', 'GPA.pass-second-provider');
  assert.equal((await claim(f, a, 10)).status, 200);
  assert.equal((await claim(f, a, 1)).status, 200);
  const before = await account(f, a);
  assert.equal(Object.keys(before.passGrants.founders).length, 2);
  cancelToss(f, order);
  await f.call('/webhooks/toss', { data: { orderId: order.orderId } });
  let stored = await account(f, a);
  assert.equal(owned(stored), true);
  assert.deepEqual(stored.wallet, before.wallet);
  assert.ok(stored.cosmetics.owned.includes('royal'));
  cancelGoogle(f, payload.purchaseToken);
  assert.equal((await f.call('/payments/google/verify', payload, a.token)).body.refunded, true);
  stored = await account(f, a);
  assert.equal(owned(stored), false);
  assert.deepEqual(stored.wallet, { free: 0, paid: 0, debt: 0 });
  assert.equal(stored.passBenefits.founders.reversedShards, 20);
  assert.deepEqual(stored.cosmetics.owned, ['base']);
  assert.deepEqual(stored.liveops.pass, before.liveops.pass);
  assert.equal((await f.call('/payments/google/verify', payload, a.token)).body.refunded, true);
  assert.deepEqual((await account(f, a)).wallet, stored.wallet);
});

test('GET liveops repairs missed pass refunds before royal tier 10 for both providers', async t => {
  for (const provider of ['toss', 'google']) await t.test(provider, async () => {
    const { f, a } = await unlocked();
    let receipt;
    if (provider === 'toss') {
      receipt = await paidToss(f, a, SKU); assert.equal(receipt.result.status, 200);
    } else receipt = await buyGoogle(f, a, 'pass-missed-refund', 'GPA.pass-missed-refund');
    assert.equal((await claim(f, a, 1)).status, 200);
    const before = await account(f, a);
    assert.equal(before.passBenefits.founders.royalClaimed, false);
    assert.equal(before.wallet.paid, 10);
    if (provider === 'toss') cancelToss(f, receipt.order);
    else cancelGoogle(f, receipt.payload.purchaseToken);
    const refreshed = await f.call('/liveops', undefined, a.token);
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
    const stored = await account(f, a);
    assert.equal(owned(stored), false);
    assert.equal(stored.wallet.paid, 0);
    assert.equal(stored.passBenefits.founders.reversedShards, 10);
    assert.deepEqual(stored.liveops.pass, before.liveops.pass);
    assert.equal((await claim(f, a, 2)).body.error, 'premium-required');
  });
});
