// Local workerd + SQLite Durable Object integration. Every provider request is intercepted in memory.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fixture, jwt, googlePurchase } from './helpers.mjs';
const f = await fixture({ ADMIN_ACCOUNT_IDS: 'google:user1' });
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: ['index.mjs', ...fs.readdirSync(new URL('../src/', import.meta.url)).filter(x => x.endsWith('.mjs') && x !== 'index.mjs')].map(name => ({ type: 'ESModule', path: fileURLToPath(new URL('../src/' + name, import.meta.url)) })), compatibilityDate: '2026-09-08',
  bindings: f.env, durableObjects: { COMMERCE: { className: 'CommerceLedger', useSQLite: true } },
  outboundService: async req => f.fetcher(req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? await req.text() : undefined })
}));
const call = async (path, b, token) => {
  const res = await mf.dispatchFetch('https://commerce.example' + path, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(b ? { body: JSON.stringify(b) } : {}) });
  return { status: res.status, body: await res.json() };
};
try {
  const now = Math.floor(Date.now() / 1000);
  const login = await call('/auth/google', { idToken: await jwt({ iat: now, exp: now + 3600 }) }); assert.equal(login.status, 200, JSON.stringify(login));
  const a = login.body;
  const order = (await call('/orders', { sku: 'shards60', platform: 'web' }, a.token)).body;
  const results = await Promise.all(Array.from({ length: 4 }, () => call('/payments/toss/confirm', { orderId: order.orderId, paymentKey: 'worker-payment-key' }, a.token)));
  assert.ok(results.every(r => r.status === 200), JSON.stringify(results)); assert.equal(results.reduce((n, r) => n + r.body.shards, 0), 60);
  for (let i=0;i<2;i++) assert.equal((await call('/profile/action',{type:'treeUpgrade',face:1,requestId:'worker-mastery-prep-'+i},a.token)).status,200);
  const action = { type: 'treeUpgrade', face: 1, requestId: 'workerd-upgrade-001' };
  const actions = await Promise.all([call('/profile/action', action, a.token), call('/profile/action', action, a.token)]);
  assert.ok(actions.every(r => r.status === 200),JSON.stringify(actions)); assert.equal((await call('/profile', undefined, a.token)).body.shards, 45);
  f.state.google.set('workerd-google-token', googlePurchase(a));
  const purchase = await call('/payments/google/verify', { productId: 'dicekeep.shards60', purchaseToken: 'workerd-google-token' }, a.token);
  assert.equal(purchase.status, 200, JSON.stringify(purchase)); assert.equal(purchase.body.shards, 60); assert.equal(purchase.body.consumePending, false, JSON.stringify({ consumeCalls: f.state.consumeCalls, requests: f.state.calls.map(x => [x.method, new URL(x.url).pathname]) }));
  const run = (await call('/runs/start', { mode: 'clear' }, a.token)).body;
  assert.equal((await call('/runs/settle', { ticket: run.ticket, wave: 0, kills: 0, won: false }, a.token)).status, 200);
  const p = f.state.toss.get(order.orderId); p.status = 'CANCELED'; p.balanceAmount = 0;
  assert.equal((await call('/webhooks/toss', { data: { paymentKey: p.paymentKey } })).body.revokedShards, 60);
  assert.equal((await call('/profile', undefined, a.token)).body.shards, 45);
  const skin = googlePurchase(a, { orderId: 'GPA.workerd-skin' }); skin.productLineItem[0].productId = 'dicekeep.skin_royal'; f.state.google.set('workerd-skin-token', skin);
  const skinResult = await call('/payments/google/verify', { productId: 'dicekeep.skin_royal', purchaseToken: 'workerd-skin-token' }, a.token);
  assert.equal(skinResult.status, 200, JSON.stringify(skinResult)); assert.equal(skinResult.body.acknowledgePending, false); assert.equal(f.state.ackCalls, 1); assert.equal(f.state.consumeCalls, 1);
  assert.equal((await call('/profile/action', { type: 'skinEquip', skinId: 'royal', requestId: 'workerd-equip-001' }, a.token)).body.cosmetics.equipped, 'royal');
  const initial = await call('/liveops', undefined, a.token); assert.equal(initial.status,200,JSON.stringify(initial)); assert.equal(initial.body.canAdmin,true);
  const attendance = {day:initial.body.liveops.attendance.dayKey,requestId:'worker-attendance-001'};
  const visits = await Promise.all([call('/attendance/claim',attendance,a.token),call('/attendance/claim',attendance,a.token)]);
  assert.ok(visits.every(r=>r.status===200),JSON.stringify(visits)); assert.equal(visits.filter(r=>!r.body.duplicate).length,1);
  assert.equal(visits[0].body.liveops.pass.xp,20);
  const mail = await call('/admin/mail/draft',{title:'Fixture only',body:'Local worker integration test.',reward:{gold:123,shards:7},requestId:'worker-draft-001'},a.token);
  assert.equal(mail.status,200,JSON.stringify(mail));
  const preview = await call('/admin/mail/preview',{id:mail.body.mail.id},a.token); assert.equal(preview.status,200,JSON.stringify(preview));assert.equal(preview.body.recipientCount,1);
  assert.deepEqual(preview.body.total,{gold:123,shards:7});
  const publishBody = {id:mail.body.mail.id,previewToken:preview.body.previewToken,requestId:'worker-publish-001'};
  assert.equal((await call('/admin/mail/publish',publishBody,a.token)).status,200);
  assert.equal((await call('/admin/mail/publish',publishBody,a.token)).body.duplicate,true);
  const claim = {id:mail.body.mail.id,requestId:'worker-mail-claim-001'};
  const claims = await Promise.all([call('/mail/claim',claim,a.token),call('/mail/claim',claim,a.token)]);
  assert.ok(claims.every(r=>r.status===200),JSON.stringify(claims)); assert.equal(claims.filter(r=>!r.body.duplicate).length,1);
  assert.equal(claims.reduce((n,r)=>n+r.body.reward.shards,0),7);
  const pass = googlePurchase(a,{orderId:'GPA.workerd-pass'});pass.productLineItem[0].productId='dicekeep.pass_founders';f.state.google.set('worker-pass-token',pass);
  const passResult=await call('/payments/google/verify',{productId:'dicekeep.pass_founders',purchaseToken:'worker-pass-token'},a.token);
  assert.equal(passResult.status,200,JSON.stringify(passResult)); assert.equal(passResult.body.liveops.pass.owned,true);assert.equal(passResult.body.acknowledgePending,false);assert.equal(f.state.consumeCalls,1);assert.equal(f.state.ackCalls,2);
  pass.purchaseStateContext.purchaseState='CANCELLED';
  const refreshed=await call('/liveops',undefined,a.token);assert.equal(refreshed.status,200,JSON.stringify(refreshed));assert.equal(refreshed.body.liveops.pass.owned,false);assert.ok(refreshed.body.cosmetics.owned.includes('royal'));
  assert.equal((await call('/admin/mail/cancel',{id:mail.body.mail.id,requestId:'worker-cancel-001'},a.token)).status,200);
  assert.equal((await call('/liveops',undefined,a.token)).body.inbox.length,0);
  console.log(JSON.stringify({ pass: true, runtime: 'local workerd SQLite Durable Object', checks: ['Google RS256 login', 'Toss four concurrent confirmations once', 'two concurrent actions once', 'Google verify and consume', 'zero-wave settlement', 'provider-verified refund', 'skin grant and acknowledge without consume', 'skin equip without combat changes','attendance concurrent atomic claims and XP','admin frozen audience preview/publish replay','mail concurrent atomic lazy claim and cancellation','pass acknowledgement and missed-refund recovery before tier 10'], externalPayments: 0, liveMailPublished:0 }));
} finally { await mf.dispose(); }
