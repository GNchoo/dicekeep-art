import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { sha } from '../src/common.mjs';
import PG from '../src/progression.mjs';

test('legacy collection/tree migration is transactional, preserves paid/free/debt and keeps the old active snapshot', async () => {
  const f = await fixture(), login = await f.login(), key = 'account:' + login.accountId;
  const a = await f.storage.get(key); delete a.profile.tree; delete a.profile.collection; a.profile.levels[1] = 21;
  a.profile.shards = 90; a.wallet = { free: 30, paid: 60, debt: 9 };
  const oldSnapshot = PG.snapshot(a.profile, 'build'), ticket = 'f'.repeat(64); a.activeRun = ticket;
  await f.storage.put('run:' + ticket, { id: ticket, accountId: login.accountId, mode: 'build', snapshot: oldSnapshot, startedAt: f.state.now });
  await f.storage.put(key, a);
  const calls = await Promise.all([f.call('/profile', undefined, login.token), f.call('/wallet', undefined, login.token)]);
  assert.ok(calls.every(r => r.status === 200)); const migrated = await f.storage.get(key);
  assert.deepEqual(migrated.wallet, a.wallet); assert.deepEqual(migrated.profile.levels, a.profile.levels);
  assert.equal(migrated.profile.collection.cards[1].class, 14); assert.equal(migrated.profile.tree.mastery[1], 5);
  const m = migrated.profile.tree.migration;
  assert.equal(migrated.profile.collection.gold + m.masteryValue, 1700 + m.convertedCopiesGold + m.convertedPacksGold + m.classInvestmentGold);
  assert.deepEqual((await f.storage.get('run:' + ticket)).snapshot, oldSnapshot);
  const second = await f.login(); assert.deepEqual(second.profile.collection, migrated.profile.collection); assert.deepEqual(second.profile.tree, migrated.profile.tree); assert.deepEqual(second.wallet, a.wallet);
});

test('retired random/class/legacy level actions cannot charge or bypass research prerequisites on tree accounts', async () => {
  const f = await fixture(), a = await f.login(), before = await f.storage.get('account:' + a.accountId);
  for (const type of ['craft', 'classUp', 'openPack', 'unlock', 'upgrade']) {
    const result = await f.call('/profile/action', { type, face: 20, requestId: 'retired-action-' + type }, a.token);
    assert.equal(result.status, 409); assert.equal(result.body.error, 'tree-system');
  }
  assert.deepEqual(await f.storage.get('account:' + a.accountId), before);
  for (const extra of [{ seed: 10 }, { rng: 1 }, { rewards: [20] }, { copies: 100 }, { packs: 999 }]) {
    assert.equal((await f.call('/profile/action', { type: 'openPack', requestId: 'injected-rewards', ...extra }, a.token)).status, 400);
  }
  assert.equal((await f.call('/orders', { sku: 'supply-pack', platform: 'web' }, a.token)).body.error, 'unknown-product');
});

test('presets remain independent and a changed active preset cannot alter an already running snapshot', async () => {
  const f = await fixture(), a = await f.login(), started = (await f.call('/runs/start', { mode: 'build' }, a.token)).body;
  const deck = [6, 5, 4, 3, 2];
  assert.equal((await f.call('/profile/action', { type: 'setPreset', index: 1, deck, requestId: 'preset-save-one' }, a.token)).status, 200);
  const active = (await f.call('/profile/action', { type: 'activatePreset', index: 1, requestId: 'preset-activate-one' }, a.token)).body;
  assert.deepEqual(active.profile.deck, deck); assert.equal(active.profile.collection.activePreset, 1);
  assert.deepEqual(active.profile.collection.presets[0].faces, [1, 2, 3, 4, 5]);
  assert.deepEqual((await f.call('/runs/resume', { ticket: started.ticket }, a.token)).body.snapshot, started.snapshot);
  assert.equal((await f.call('/profile/action', { type: 'setPreset', index: 2, deck: [20, 1, 2, 3, 4], requestId: 'preset-locked-one' }, a.token)).body.error, 'invalid-deck');
  assert.deepEqual((await f.login()).profile.deck, deck);
});

test('old recorded action fingerprints replay without charging or applying migration credit a second time', async () => {
  const f = await fixture(), a = await f.login(), fingerprint = await sha(JSON.stringify(['upgrade', 1, null, null]));
  await f.storage.put(`action:${a.accountId}:historic-upgrade-id`, { fingerprint, result: { ok: true, face: 1, level: 2, cost: 10 }, at: f.state.now });
  const before = await f.storage.get('account:' + a.accountId);
  const old = await f.call('/profile/action', { type: 'upgrade', face: 1, requestId: 'historic-upgrade-id' }, a.token);
  assert.equal(old.status, 200); assert.equal(old.body.duplicate, true); assert.equal(old.body.level, 2);
  assert.deepEqual(await f.storage.get('account:' + a.accountId), before);
  const key = 'account:' + a.accountId, stored = await f.storage.get(key); stored.wallet.debt = 10; await f.storage.put(key, stored);
  assert.equal((await f.call('/profile/action', { type: 'treeUnlock', face: 7, requestId: 'debt-unlock-test' }, a.token)).body.error, 'refund-debt');
  assert.equal((await f.call('/runs/start', { mode: 'clear' }, a.token)).status, 200);
});
