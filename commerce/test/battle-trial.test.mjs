import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';

test('battle modes require a seat proof before issuing tickets and preserve existing legacy runs', async () => {
  const f = await fixture(), a = await f.login();
  const started = await f.call('/runs/start', { mode: 'build' }, a.token);
  assert.equal(started.status, 200);
  const account = await f.storage.get('account:' + a.accountId), run = await f.storage.get('run:' + started.body.ticket);
  for (const mode of ['duel', 'coop']) {
    const denied = await f.call('/runs/start', { mode }, a.token);
    assert.equal(denied.status, 400); assert.equal(denied.body.error, 'invalid-battle-proof');
    assert.equal(denied.body.ticket, undefined); assert.deepEqual(await f.storage.get('account:' + a.accountId), account);
    assert.deepEqual(await f.storage.get('run:' + started.body.ticket), run);
  }
  assert.equal((await f.call('/runs/resume', { ticket: started.body.ticket }, a.token)).status, 200);
});

test('existing authenticated accounts gain only missing trial records and retain active snapshots and wallets', async () => {
  const f = await fixture(), a = await f.login();
  const started = (await f.call('/runs/start', { mode: 'extreme' }, a.token)).body;
  const account = await f.storage.get('account:' + a.accountId);
  delete account.profile.records.duel; delete account.profile.records.coop;
  await f.storage.put('account:' + a.accountId, account);
  const res = await f.call('/profile', undefined, a.token);
  assert.equal(res.status, 200);
  for (const mode of ['duel', 'coop']) assert.deepEqual(res.body.records[mode], { best: 0, clears: 0, runs: [], milestones: [], gemMilestones: [] });
  const migrated = await f.storage.get('account:' + a.accountId), original = structuredClone(migrated);
  delete original.profile.records.duel; delete original.profile.records.coop;
  assert.deepEqual(original, account);
  const resumed = await f.call('/runs/resume', { ticket: started.ticket }, a.token);
  assert.equal(resumed.status, 200); assert.deepEqual(resumed.body.snapshot, started.snapshot);
  assert.equal(resumed.body.startedAt, started.startedAt); assert.deepEqual(resumed.body.wallet, a.wallet);
  const repeated = await f.call('/profile', undefined, a.token); assert.deepEqual(repeated.body, migrated.profile);
});

test('re-login migrates pre-trial accounts without resetting invested tree state', async () => {
  const f = await fixture(), a = await f.login();
  const account = await f.storage.get('account:' + a.accountId);
  account.profile.tree.mastery[1] = 3; account.profile.tree.talents[1] = 'force'; account.profile.tree.awakenings[1] = true;
  delete account.profile.records.duel; delete account.profile.records.coop;
  await f.storage.put('account:' + a.accountId, account);
  const loggedIn = await f.login();
  assert.equal(loggedIn.accountId, a.accountId); assert.deepEqual(loggedIn.profile.tree, account.profile.tree);
  assert.deepEqual(loggedIn.wallet, account.wallet); assert.ok(loggedIn.profile.records.duel && loggedIn.profile.records.coop);
});
