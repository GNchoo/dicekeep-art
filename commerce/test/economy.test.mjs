import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, paidToss } from './helpers.mjs';

test('affordable catalog is explicit; old currency receipts retain their original grant', async () => {
  const f = await fixture(), a = await f.login();
  const { products } = (await f.call('/config')).body;
  assert.deepEqual(products.filter(p => p.kind === 'currency').map(p => [p.sku, p.shards, p.amount]), [
    ['shards200', 200, 1100], ['shards600', 600, 3300],
  ]);
  assert.ok(products.every(p => p.amount <= 3300));
  const old = await paidToss(f, a, 'shards60'); // test-only retired SKU for restoration coverage
  assert.equal(old.result.body.shards, 60);
  const current = await paidToss(f, a, 'shards200');
  assert.equal(current.result.body.shards, 200);
  assert.equal(current.result.body.profile.shards, 260);
  assert.equal(current.result.body.profile.levels[1], 1);
});

test('historic growth credit is atomic, returned as free shards and never reissued after reload/login', async () => {
  const f = await fixture(), a = await f.login(), key = 'account:' + a.accountId;
  const stored = await f.storage.get(key);
  delete stored.profile.economyVersion;
  stored.profile.levels[1] = 21; stored.profile.shards = 60;
  stored.wallet = { free: 0, paid: 60, debt: 0 };
  await f.storage.put(key, stored);
  await Promise.all([f.call('/profile', undefined, a.token), f.call('/wallet', undefined, a.token)]);
  assert.deepEqual((await f.call('/wallet', undefined, a.token)).body, { free: 15, paid: 60, debt: 0 });
  const again = await f.login();
  assert.deepEqual(again.wallet, { free: 15, paid: 60, debt: 0 });
  assert.equal(again.profile.levels[1], 21);
  assert.equal(again.profile.economyVersion, 2);
});
