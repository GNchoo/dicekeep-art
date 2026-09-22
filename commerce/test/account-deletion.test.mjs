// 계정 삭제 — Google Play 가 요구하는 삭제 경로.
//
// 핵심 성질은 "레코드가 사라진다" 가 아니라 "Google 신원과 계정 사이의 고리가 끊긴다" 이다.
// 같은 Google sub 로 다시 로그인했을 때 새 계정이 나와야 역추적 불가가 증명된다.
// 거래 기록은 전자상거래법상 남기되, 계정 연결과 구매 토큰을 지워 익명화한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, googlePurchase, paidToss } from './helpers.mjs';

const keysWith = (storage, prefix) => [...storage.data.keys()].filter(k => k.startsWith(prefix));

test('deletion unlinks the Google identity: same sub logs back in as a brand new account', async () => {
  const f = await fixture(), a = await f.login('user1');
  await f.call('/profile/action', { type: 'deck', deck: [2, 3, 4, 5, 6], requestId: 'r'.repeat(32) }, a.token);
  const before = (await f.call('/profile', undefined, a.token)).body;

  const del = await f.call('/account/delete', { confirm: 'DELETE' }, a.token);
  assert.equal(del.status, 200);
  assert.equal(del.body.ok, true);

  // 같은 Google sub — 새 계정이어야 한다
  const again = await f.login('user1');
  assert.notEqual(again.accountId, a.accountId, '삭제 뒤 같은 sub 이 같은 계정으로 돌아오면 역추적이 가능하다');
  const fresh = (await f.call('/profile', undefined, again.token)).body;
  assert.notDeepEqual(fresh, before, '새 계정이 이전 진행을 물려받으면 안 된다');
});

test('deletion removes account, session, subject mapping, runs and idempotency keys', async () => {
  const f = await fixture(), a = await f.login();
  await f.call('/runs/start', { mode: 'clear' }, a.token);
  await f.call('/profile/action', { type: 'deck', deck: [2, 3, 4, 5, 6], requestId: 'q'.repeat(32) }, a.token);

  assert.ok(keysWith(f.storage, 'account:').length, '사전 조건: 계정이 있다');
  assert.ok(keysWith(f.storage, 'run:').length, '사전 조건: 런이 있다');
  assert.ok(keysWith(f.storage, 'action:').length, '사전 조건: 멱등키가 있다');

  await f.call('/account/delete', { confirm: 'DELETE' }, a.token);

  for (const prefix of ['account:', 'session:', 'subject:', 'run:', 'run-of:', 'action:']) {
    assert.deepEqual(keysWith(f.storage, prefix), [], prefix + ' 가 남았다');
  }
  assert.equal(keysWith(f.storage, 'deleted:').length, 1, '계정 일련번호 재사용을 막는 묘비는 남는다');
});

test('the old bearer stops working immediately', async () => {
  const f = await fixture(), a = await f.login();
  await f.call('/account/delete', { confirm: 'DELETE' }, a.token);
  const after = await f.call('/profile', undefined, a.token);
  assert.equal(after.status, 401);
  assert.equal(after.body.error, 'session-expired');
});

test('confirmation is required; a wrong or missing one deletes nothing', async () => {
  const f = await fixture(), a = await f.login();
  for (const body of [{}, { confirm: '' }, { confirm: 'delete' }, { confirm: 'DELETE ME' }]) {
    const r = await f.call('/account/delete', body, a.token);
    assert.equal(r.status, 400, JSON.stringify(body) + ' 가 통과했다');
    assert.equal(r.body.error, 'invalid-confirmation');
  }
  assert.equal(keysWith(f.storage, 'account:').length, 1, '거부된 요청이 무언가를 지웠다');
  assert.equal((await f.call('/profile', undefined, a.token)).status, 200);
});

test('paid orders survive as anonymous transaction records', async () => {
  const f = await fixture(), a = await f.login();
  await paidToss(f, a, 'shards60');
  const orderKeys = keysWith(f.storage, 'order:');
  assert.equal(orderKeys.length, 1, '사전 조건: 주문 원장이 있다');
  const before = await f.storage.get(orderKeys[0]);
  assert.equal(before.accountId, a.accountId);

  const del = await f.call('/account/delete', { confirm: 'DELETE' }, a.token);
  assert.equal(del.body.anonymisedPurchases, 1);

  const after = await f.storage.get(orderKeys[0]);
  assert.ok(after, '거래 기록이 통째로 사라지면 법정 보관 의무를 못 지킨다');
  assert.equal(after.accountId, null, '계정 연결이 남았다');
  assert.ok(after.accountDeletedAt, '익명화 시각이 없다');
  assert.equal(after.amount, before.amount, '금액은 보존되어야 한다');
  assert.equal(after.id, before.id, 'orderId 는 보존되어야 한다');
  assert.deepEqual(keysWith(f.storage, 'skin-order:'), [], '주문 잠금 키는 계정과 함께 사라져야 한다');
});

test('Play purchase rows keep the receipt but lose the purchase token', async () => {
  const f = await fixture(), a = await f.login();
  f.state.google.set('tok-del', googlePurchase(a));
  const v = await f.call('/payments/google/verify', { purchaseToken: 'tok-del', productId: 'dicekeep.shards60' }, a.token);
  assert.equal(v.status, 200);
  const purchaseKeys = keysWith(f.storage, 'purchase:');
  assert.equal(purchaseKeys.length, 1, '사전 조건: 구매 행이 있다');
  assert.ok((await f.storage.get(purchaseKeys[0])).encryptedToken, '사전 조건: 토큰이 저장돼 있다');

  await f.call('/account/delete', { confirm: 'DELETE' }, a.token);

  const after = await f.storage.get(purchaseKeys[0]);
  assert.ok(after, '구매 기록 자체는 남아야 한다');
  assert.equal(after.accountId, null);
  assert.equal(after.encryptedToken, undefined, 'Play 구매 토큰은 이용자 Play 계정과의 고리다 — 반드시 지워져야 한다');
  assert.equal(after.orderId, 'GPA.unit-1', '영수증 식별자는 보존');
});

test('deleting one account leaves another untouched', async () => {
  const f = await fixture(), a = await f.login('user1'), b = await f.login('user2');
  await f.call('/runs/start', { mode: 'clear' }, b.token);
  await f.call('/account/delete', { confirm: 'DELETE' }, a.token);

  assert.equal((await f.call('/profile', undefined, b.token)).status, 200, '남은 계정의 세션이 죽었다');
  assert.equal(keysWith(f.storage, 'account:').length, 1);
  assert.equal(keysWith(f.storage, 'run:').length, 1, '남의 런이 지워졌다');
});

test('preview reports what goes and what stays, and needs a session', async () => {
  const f = await fixture(), a = await f.login();
  await f.call('/runs/start', { mode: 'clear' }, a.token);
  await paidToss(f, a, 'shards60');

  assert.equal((await f.call('/account/deletion-preview')).status, 401, '로그인 없이 미리보기가 열렸다');

  const p = (await f.call('/account/deletion-preview', undefined, a.token)).body;
  assert.equal(p.accountId, a.accountId);
  assert.equal(p.runs, 1);
  assert.equal(p.purchaseRecords, 1);
  assert.equal(p.irreversible, true);
  assert.ok(p.willDelete.includes('profile') && p.willDelete.includes('google-link'));
  assert.equal(p.willRetain.length, 1, '구매가 있으면 보존 항목을 알려야 한다');

  // 구매가 없는 계정은 보존할 것도 없다
  const c = await f.login('user3');
  const q = (await f.call('/account/deletion-preview', undefined, c.token)).body;
  assert.deepEqual(q.willRetain, []);
});
