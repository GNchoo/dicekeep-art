// Deterministic client races. Every account, response and clock is a local VM
// fixture; this suite cannot log in, contact an API, or make a payment.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const P = require('../progression.js');
const L = require('../liveops-rules.js');
const N = require('../reward-notifications.js');
const root = path.resolve(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
const now = Date.parse('2030-01-02T03:00:00Z');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function runtime(extra = {}) {
  const memory = new Map(), listeners = new Map();
  const sandbox = {
    console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    structuredClone, performance, navigator: {}, crypto: { randomUUID },
    DK: { phase: 'lobby' }, DKPROGRESSION: P, DKLIVEOPS: L,
    localStorage: {
      getItem: key => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: key => memory.delete(key),
    },
    document: { getElementById: () => null },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
    fetch() { throw Error('Unmocked network request'); },
    ...extra,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return {
    sandbox,
    load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file }); },
  };
}

function serverState(kind = 'mail') {
  const profile = P.defaultProfile(); profile.collection.gold = 1000; profile.shards = 20;
  const liveops = L.defaultState(); liveops.attendance = { total: 1, lastDay: L.dayKey(now) };
  liveops.pass.xp = kind === 'pass' ? 100 : 0;
  const inbox = kind === 'mail' ? [{ id: 'fixture-mail', title: 'Fixture', claimed: false,
    expiresAt: null, publishedAt: now - 1000, reward: { gold: 100, shards: 2 } }] : [];
  return { profile, liveops, inbox };
}
function payload(server) {
  return copy({ profile: server.profile, wallet: { free: server.profile.shards, paid: 0, debt: 0 },
    liveops: L.view(server.liveops, { now }), inbox: server.inbox, serverNow: now, canAdmin: false });
}
function balance(profile) { return { gold: profile.collection.gold, shards: profile.shards, mastery: profile.tree.mastery[1] }; }

test('commerce liveops reads crossing a tree upgrade return and adopt the latest profile', { timeout: 5000 }, async t => {
  for (const order of ['read-before-write', 'read-during-pending-write']) {
    await t.test(order, async () => {
      const server = serverState(), oldGet = deferred(), getStarted = deferred(), postStarted = deferred(), allowPost = deferred();
      const calls = [], observed = []; let gets = 0, committed = false;
      const f = runtime({
        DKCOMMERCE_CONFIG: { url: 'https://fixture.invalid' },
        async fetch(url, options) {
          assert.equal(new URL(url).origin, 'https://fixture.invalid');
          const endpoint = new URL(url).pathname;
          calls.push({ endpoint, method: options.method });
          let body;
          if (endpoint === '/config') body = { purchasesEnabled: false, providers: { web: false }, products: [] };
          else if (endpoint === '/cosmetics') body = { owned: ['base'], equipped: 'base' };
          else if (endpoint === '/profile') body = { profile: server.profile };
          else if (endpoint === '/wallet') body = { free: server.profile.shards, paid: 0, debt: 0 };
          else if (endpoint === '/liveops') {
            body = payload(server); // Capture at request time, not response time.
            if (++gets === 1) { getStarted.resolve(); await oldGet.promise; }
          } else if (endpoint === '/profile/action') {
            const data = JSON.parse(options.body);
            assert.equal(data.type, 'treeUpgrade'); assert.equal(data.face, 1);
            postStarted.resolve();
            if (order === 'read-during-pending-write') await allowPost.promise;
            const upgraded = P.treeUpgrade(server.profile, data.face); assert.equal(upgraded.ok, true);
            committed = true; body = payload(server);
          } else throw Error('Unmocked fixture endpoint: ' + endpoint);
          return { ok: true, status: 200, json: async () => copy(body) };
        },
      });
      f.sandbox.localStorage.setItem('dk_commerce_session_v1', JSON.stringify({ token: 'fixture-token', accountId: 'fixture-account' }));
      f.load('commerce-client.js'); const C = f.sandbox.DKCOMMERCE;
      await C.init(); const before = balance(C.profile());
      f.sandbox.addEventListener('commerce:change', () => { if (committed) observed.push(balance(C.profile())); });
      let reading, upgrading;
      if (order === 'read-before-write') {
        reading = C.loadLiveops(); await getStarted.promise;
        upgrading = C.action('treeUpgrade', { face: 1 }); await upgrading;
      } else {
        upgrading = C.action('treeUpgrade', { face: 1 }); await postStarted.promise;
        reading = C.loadLiveops(); await tick(); // A stable reader may wait before sending GET.
        allowPost.resolve(); await upgrading; await getStarted.promise;
      }
      const expected = balance(server.profile);
      assert.equal(expected.mastery, before.mastery + 1); assert.ok(expected.gold < before.gold);
      assert.deepEqual(balance(C.profile()), expected, 'write response is adopted before old GET returns');
      oldGet.resolve(); const response = await reading;
      assert.deepEqual(balance(response.profile), expected, 'old GET caller receives the stable re-read');
      assert.deepEqual(balance(C.profile()), expected, 'late GET cannot roll back the account profile');
      assert.ok(observed.length > 0);
      for (const value of observed) assert.deepEqual(value, expected, 'no commerce event publishes a reverted profile');
      if (order === 'read-before-write') assert.ok(gets >= 2, 'the GET crossing the write is discarded and re-read');
      assert.ok(gets <= 3, 'refresh converges without a request loop');
      assert.equal(calls.filter(c => c.method === 'POST').length, 1, 'research is submitted exactly once');
    });
  }
});

test('rewards reads crossing successful mail/pass claims return current views, cache and dots', { timeout: 5000 }, async t => {
  for (const kind of ['mail', 'pass']) {
    await t.test(kind, async () => {
      const server = serverState(kind), oldGet = deferred(), getStarted = deferred(), claimCommitted = deferred();
      const observed = []; let gets = 0, claims = 0, committed = false;
      const f = runtime();
      // Deliberately keep the transport's first outstanding read stale. This
      // exercises rewards-client's own generation guard independently of the
      // commerce-client revision guard tested above.
      f.sandbox.DKCOMMERCE = {
        linked: () => true,
        state: () => ({ accountId: 'fixture-account', platform: 'web', ready: true, busy: false,
          native: false, config: { purchasesEnabled: false, providers: { web: false }, products: [] } }),
        async loadLiveops() {
          const result = payload(server);
          if (++gets === 2) { getStarted.resolve(); await oldGet.promise; }
          return result;
        },
        async claimReward(requested, details) {
          assert.equal(requested, kind); claims++;
          if (kind === 'mail') {
            assert.equal(details.id, 'fixture-mail'); assert.equal(server.inbox[0].claimed, false);
            server.inbox[0].claimed = true;
            server.profile.collection.gold += 100; server.profile.shards += 2;
          } else {
            const claimed = L.claimPass(server.liveops, { ...details, premium: false });
            assert.equal(claimed.ok, true); server.liveops = claimed.nextState;
            server.profile.collection.gold += claimed.reward.gold; server.profile.shards += claimed.reward.shards;
          }
          committed = true; claimCommitted.resolve();
          f.sandbox.dispatchEvent(new f.sandbox.CustomEvent('commerce:change'));
          return payload(server);
        },
        errorText: error => error.message,
      };
      f.load('rewards-client.js'); const R = f.sandbox.DKREWARDS;
      R.configure({ canClaim: () => true, readGuest() { throw Error('Account race touched guest storage'); },
        commitGuest() { throw Error('Account race wrote guest storage'); } });
      const initial = await R.list(); assert.equal(N.counts(initial, now)[kind], 1);
      f.sandbox.addEventListener('rewards:updated', () => {
        if (committed && R.current()) observed.push(N.counts(R.current(), now)[kind]);
      });
      const reading = R.list(); await getStarted.promise;
      const claiming = kind === 'mail' ? R.claimMail('fixture-mail') : R.claimPass(1, 'free');
      await claimCommitted.promise; await tick(); oldGet.resolve();
      const [readView, claimView] = await Promise.all([reading, claiming]);
      for (const [label, view] of [['old list caller', readView], ['claim caller', claimView], ['current cache', R.current()]]) {
        assert.ok(view, label + ' has a view');
        assert.equal(N.counts(view, now)[kind], 0, label + ' cannot restore a claimed reward dot');
        assert.equal(kind === 'mail' ? view.mail[0].claimed : view.pass.tiers[0].free.claimed, true, label + ' has the claim marker');
      }
      assert.equal(claims, 1, 'discarding a stale read never repeats the claim');
      assert.ok(gets >= 3 && gets <= 5, 'stale view is replaced by a bounded fresh list');
      assert.ok(observed.length > 0);
      assert.ok(observed.every(count => count === 0), 'no updated event publishes the stale notification');
    });
  }
});
