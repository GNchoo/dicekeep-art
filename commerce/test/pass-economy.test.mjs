import test from 'node:test';
import assert from 'node:assert/strict';
import { ensurePassState, premiumOwned, grantPass, revokePass, grantPremiumReward } from '../src/pass-economy.mjs';

function fixture() {
  const a = { profile: { shards: 7, collection: { gold: 600 } }, wallet: { free: 7, paid: 0, debt: 0 },
    liveops: { pass: { xp: 1000, freeClaimed: [1, 2], premiumClaimed: [1, 10] } } };
  const calls = { credit: [], revoke: [] };
  const sync = a => { a.profile.shards = a.wallet.free + a.wallet.paid; };
  const hooks = {
    credit(a, amount, kind) {
      calls.credit.push({ amount, kind });
      const debtPaid = Math.min(a.wallet.debt, amount);
      a.wallet.debt -= debtPaid; a.wallet[kind] += amount - debtPaid; sync(a);
      return { credited: amount - debtPaid, debtPaid };
    },
    revoke(a, amount) {
      calls.revoke.push(amount);
      const taken = Math.min(a.wallet.paid, amount);
      a.wallet.paid -= taken; a.wallet.debt += amount - taken; sync(a);
    },
    cosmetics(a) {
      a.skinGrants ??= {};
      a.cosmetics ??= { owned: ['base'], equipped: 'base' };
      a.cosmetics.owned = ['base', ...['royal', 'frost', 'ember'].filter(id => Object.keys(a.skinGrants[id] || {}).length)];
      if (!a.cosmetics.owned.includes(a.cosmetics.equipped)) a.cosmetics.equipped = 'base';
      return a.cosmetics;
    }
  };
  return { a, hooks, calls };
}

test('migration adds only pass accounting and preserves permanent claim history', () => {
  const { a } = fixture(), before = structuredClone(a);
  assert.equal(ensurePassState(a), a);
  assert.equal(premiumOwned(a), false);
  assert.deepEqual(a.passGrants, { founders: {} });
  assert.deepEqual(a.passBenefits.founders, { awardedShards: 0, reversedShards: 0, royalClaimed: false });
  assert.deepEqual(a.liveops, before.liveops);
  assert.deepEqual(a.profile, before.profile);
  ensurePassState(a);
  assert.deepEqual(a.wallet, before.wallet);
});

test('purchase and duplicate receipt unlock without immediately awarding tier currency or royal', () => {
  const { a, hooks, calls } = fixture();
  assert.deepEqual(grantPass(a, 'founders', 'order:first', hooks), { credited: 0, debtPaid: 0 });
  assert.deepEqual(grantPass(a, 'founders', 'order:first', hooks), { credited: 0, debtPaid: 0 });
  assert.equal(premiumOwned(a), true);
  assert.deepEqual(a.cosmetics.owned, ['base']);
  assert.deepEqual(calls.credit, []);
  assert.deepEqual(a.wallet, { free: 7, paid: 0, debt: 0 });
});

test('two paid receipt sources combine with OR; only the last refund reverses benefits once', () => {
  const { a, hooks, calls } = fixture();
  grantPass(a, 'founders', 'order:toss', hooks);
  grantPremiumReward(a, 'founders', { gold: 0, shards: 10, skinId: 'royal' }, hooks);
  grantPass(a, 'founders', 'purchase:google', hooks);
  a.cosmetics.equipped = 'royal';
  assert.deepEqual(revokePass(a, 'founders', 'order:toss', hooks), { revokedShards: 0 });
  assert.equal(premiumOwned(a), true);
  assert.equal(a.cosmetics.equipped, 'royal');
  assert.equal(a.wallet.paid, 10);
  assert.deepEqual(revokePass(a, 'founders', 'purchase:google', hooks), { revokedShards: 10 });
  assert.equal(premiumOwned(a), false);
  assert.deepEqual(a.cosmetics, { owned: ['base'], equipped: 'base' });
  assert.deepEqual(revokePass(a, 'founders', 'purchase:google', hooks), { revokedShards: 0 });
  assert.deepEqual(calls.credit, [{ amount: 10, kind: 'paid' }]);
  assert.deepEqual(calls.revoke, [10]);
});

test('refund preserves free rewards and prior growth, and records spent premium shards as debt', () => {
  const { a, hooks, calls } = fixture(), collection = structuredClone(a.profile.collection);
  grantPass(a, 'founders', 'order:paid', hooks);
  grantPremiumReward(a, 'founders', { shards: 20 }, hooks);
  a.wallet.paid -= 13; a.profile.shards -= 13;
  assert.deepEqual(revokePass(a, 'founders', 'order:paid', hooks), { revokedShards: 20 });
  assert.deepEqual(a.wallet, { free: 7, paid: 0, debt: 13 });
  assert.deepEqual(a.profile.collection, collection);
  assert.deepEqual(calls.revoke, [20]);
  assert.equal(a.passBenefits.founders.reversedShards, 20);
});

test('nominal premium awards include debt repayment so their refund restores the earlier debt', () => {
  const { a, hooks } = fixture(); a.wallet.debt = 14;
  grantPass(a, 'founders', 'order:paid', hooks);
  assert.deepEqual(grantPremiumReward(a, 'founders', { shards: 10 }, hooks), { credited: 0, debtPaid: 10 });
  assert.equal(a.passBenefits.founders.awardedShards, 10);
  revokePass(a, 'founders', 'order:paid', hooks);
  assert.deepEqual(a.wallet, { free: 7, paid: 0, debt: 14 });
});

test('pass royal source revocation preserves an independent direct royal purchase', () => {
  const { a, hooks } = fixture();
  a.skinGrants = { royal: { 'purchase:direct-royal': true } };
  grantPass(a, 'founders', 'order:pass', hooks);
  grantPremiumReward(a, 'founders', { shards: 10, skinId: 'royal' }, hooks);
  a.cosmetics.equipped = 'royal';
  assert.deepEqual(a.skinGrants.royal, { 'purchase:direct-royal': true, 'pass:founders': true });
  revokePass(a, 'founders', 'order:pass', hooks);
  assert.deepEqual(a.skinGrants.royal, { 'purchase:direct-royal': true });
  assert.equal(a.cosmetics.equipped, 'royal');
});

test('fresh repurchase restores reversed shards and royal once without resetting tier claims', () => {
  const { a, hooks, calls } = fixture(), claims = structuredClone(a.liveops);
  grantPass(a, 'founders', 'order:old', hooks);
  grantPremiumReward(a, 'founders', { shards: 20, skinId: 'royal' }, hooks);
  a.wallet.paid -= 13; a.profile.shards -= 13;
  revokePass(a, 'founders', 'order:old', hooks);
  assert.deepEqual(grantPass(a, 'founders', 'order:new', hooks), { credited: 7, debtPaid: 13 });
  assert.deepEqual(grantPass(a, 'founders', 'order:new', hooks), { credited: 0, debtPaid: 0 });
  assert.deepEqual(a.passBenefits.founders, { awardedShards: 20, reversedShards: 0, royalClaimed: true });
  assert.deepEqual(a.wallet, { free: 7, paid: 7, debt: 0 });
  assert.ok(a.cosmetics.owned.includes('royal'));
  assert.deepEqual(a.liveops, claims);
  grantPremiumReward(a, 'founders', { shards: 10 }, hooks);
  assert.equal(a.passBenefits.founders.awardedShards, 30);
  assert.deepEqual(revokePass(a, 'founders', 'order:new', hooks), { revokedShards: 30 });
  assert.deepEqual(calls.credit, [{ amount: 20, kind: 'paid' }, { amount: 20, kind: 'paid' }, { amount: 10, kind: 'paid' }]);
  assert.deepEqual(calls.revoke, [20, 30]);
  assert.deepEqual(a.liveops, claims);
});

test('reward rejects missing ownership or invalid paid reward without awarding currency', () => {
  const { a, hooks, calls } = fixture();
  assert.throws(() => grantPremiumReward(a, 'founders', { shards: 10 }, hooks), { code: 'premium-required' });
  grantPass(a, 'founders', 'order:valid', hooks);
  for (const reward of [{ shards: -1 }, { shards: 0.5 }, { shards: 10, gold: 100 }, { shards: 10, skinId: 'ember' }]) {
    assert.throws(() => grantPremiumReward(a, 'founders', reward, hooks), { code: 'invalid-pass-reward' });
  }
  assert.deepEqual(calls.credit, []);
  assert.equal(a.passBenefits.founders.awardedShards, 0);
});
