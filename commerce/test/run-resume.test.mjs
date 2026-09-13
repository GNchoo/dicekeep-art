import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';

test('resume retains the original frozen snapshot, ticket and start time; denies another owner and superseded runs', async () => {
  const f = await fixture(), a = await f.login(), b = await f.login('another');
  const started = (await f.call('/runs/start', { mode: 'extreme' }, a.token)).body;
  assert.equal((await f.call('/runs/resume', { ticket: started.ticket }, b.token)).status, 404);
  const saved = await f.storage.get('account:' + a.accountId);
  saved.profile.levels[1] = 20; await f.storage.put('account:' + a.accountId, saved);
  const results = await Promise.all([1, 2].map(() => f.call('/runs/resume', { ticket: started.ticket }, a.token)));
  for (const r of results) {
    assert.equal(r.status, 200); assert.equal(r.body.ticket, started.ticket);
    assert.equal(r.body.startedAt, started.startedAt); assert.deepEqual(r.body.snapshot, started.snapshot);
    assert.equal(r.body.profile.levels[1], 20); assert.equal(r.body.snapshot.levels[1], 1);
  }
  await f.call('/runs/start', { mode: 'build' }, a.token);
  assert.equal((await f.call('/runs/resume', { ticket: started.ticket }, a.token)).status, 409);
});

test('settled ticket cannot resume or issue the reward twice', async () => {
  const f = await fixture(), a = await f.login();
  const r = (await f.call('/runs/start', { mode: 'extreme' }, a.token)).body;
  const end = { ticket: r.ticket, wave: 0, kills: 0, won: false };
  assert.equal((await f.call('/runs/settle', end, a.token)).status, 200);
  assert.equal((await f.call('/runs/resume', { ticket: r.ticket }, a.token)).status, 409);
  assert.equal((await f.call('/runs/settle', end, a.token)).body.duplicate, true);
});
