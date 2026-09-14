import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, jwt } from './helpers.mjs';
import LR from '../src/liveops-rules.mjs';
import PG from '../src/progression.mjs';

const account = (f,a) => f.storage.get('account:'+a.accountId);
const ok = r => { assert.equal(r.status,200,JSON.stringify(r)); return r.body; };
const draft = (f,a,requestId='draft-mail-0001',extra={}) => f.call('/admin/mail/draft',{title:'점검 보상',body:'함께 즐겨 주셔서 감사합니다.\n다음 모험도 즐겨 주세요.',reward:{gold:500,shards:10},requestId,...extra},a.token);
async function publish(f,a,extra={}) {
  const mail=ok(await draft(f,a,'draft-mail-'+Math.random().toString(16).slice(2),extra)).mail;
  const preview=ok(await f.call('/admin/mail/preview',{id:mail.id},a.token));
  const body={id:mail.id,previewToken:preview.previewToken,requestId:'publish-'+mail.id};
  return {mail:ok(await f.call('/admin/mail/publish',body,a.token)).mail,preview,body};
}

test('payment-disabled accounts can claim KST attendance once, safely retry and retain cumulative visits across missed days',async()=>{
  const f=await fixture({PAYMENT_MODE:'disabled'}),a=await f.login();
  const before=await account(f,a),v=ok(await f.call('/liveops',undefined,a.token));
  assert.equal(v.canAdmin,false);assert.equal(v.liveops.pass.owned,false);assert.equal(v.liveops.pass.tiers.length,20);
  assert.deepEqual(v.inbox,[]);assert.equal(v.liveops.attendance.dayKey,'2026-09-08');
  const b={day:v.liveops.attendance.dayKey,requestId:'attendance-0001'};
  const results=await Promise.all([f.call('/attendance/claim',b,a.token),f.call('/attendance/claim',b,a.token)]);
  assert.ok(results.every(r=>r.status===200));assert.equal(results.filter(r=>!r.body.duplicate).length,1);
  const after=await account(f,a);assert.equal(after.wallet.free-before.wallet.free,3);assert.equal(after.profile.collection.gold-before.profile.collection.gold,100);
  assert.equal(after.liveops.pass.xp,20);assert.equal(after.liveops.attendance.total,1);
  assert.equal((await f.call('/attendance/claim',{...b,requestId:'attendance-0002'},a.token)).body.error,'already-claimed');
  assert.equal((await f.call('/attendance/claim',{...b,day:'2026-09-09'},a.token)).body.error,'request-id-conflict');
  f.state.now=Date.parse('2026-09-08T15:00:00Z');
  assert.equal((await f.call('/attendance/claim',{day:'2026-09-08',requestId:'attendance-0003'},a.token)).body.error,'day-mismatch');
  assert.equal(ok(await f.call('/attendance/claim',{day:'2026-09-09',requestId:'attendance-0004'},a.token)).liveops.attendance.total,2);
  f.state.now+=5*86400000;const now=f.state.now/1000;
  const relog=ok(await f.call('/auth/google',{idToken:await jwt({iat:now,exp:now+3600})}));
  const third=ok(await f.call('/attendance/claim',{day:LR.dayKey(f.state.now),requestId:'attendance-0005'},relog.token));
  assert.equal(third.liveops.attendance.total,3);assert.equal(third.earnedReward.gold,140);assert.equal(third.earnedReward.shards,4);
});

test('free claims repay refund debt and overflowing gold is retained; failed ledger writes roll back claims and all rewards',async()=>{
  const f=await fixture(),a=await f.login(),stored=await account(f,a);
  stored.wallet.debt=2;stored.profile.collection.gold=PG.MAX_GOLD;await f.storage.put('account:'+a.accountId,stored);
  const b={day:LR.dayKey(f.state.now),requestId:'atomic-attendance-001'},transaction=f.storage.transaction.bind(f.storage);let fail=true;
  f.storage.transaction=fn=>transaction(async tx=>{const result=await fn(tx);if(fail&&(await tx.get('account:'+a.accountId)).liveops.attendance.total){fail=false;throw Error('fixture storage failure');}return result;});
  assert.equal((await f.call('/attendance/claim',b,a.token)).status,500);assert.deepEqual(await account(f,a),stored);
  const r=ok(await f.call('/attendance/claim',b,a.token));assert.equal(r.debtPaid,2);assert.equal(r.reward.shards,1);
  assert.equal(r.profile.tree.reserveGold,stored.profile.tree.reserveGold+100);assert.equal(r.profile.collection.gold,PG.MAX_GOLD);
  assert.equal((await f.call('/attendance/claim',b,a.token)).body.duplicate,true);
});

test('server settlement grants permanent XP once with durable run dedup and preserves the frozen snapshot',async()=>{
  const f=await fixture(),a=await f.login(),run=ok(await f.call('/runs/start',{mode:'extreme'},a.token));
  f.state.now+=500000;const b={ticket:run.ticket,wave:220,kills:20,won:false};
  const results=await Promise.all([f.call('/runs/settle',b,a.token),f.call('/runs/settle',b,a.token)]);
  assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(results.find(r=>!r.body.duplicate).body.xpAdded,400);
  assert.equal((await account(f,a)).liveops.pass.xp,400);assert.deepEqual((await f.storage.get('run:'+run.ticket)).snapshot,run.snapshot);
  const stored=await account(f,a);stored.liveops.xpRuns=[];await f.storage.put('account:'+a.accountId,stored);
  assert.equal((await f.call('/runs/settle',b,a.token)).body.duplicate,true);assert.equal((await account(f,a)).liveops.pass.xp,400);
  const claim=ok(await f.call('/pass/claim',{tier:4,track:'free',requestId:'pass-free-0001'},a.token));assert.equal(claim.earnedReward.gold,100);assert.equal(claim.wallet.paid,0);
});

test('liveops migration preserves wallet, progress, history and the old active snapshot',async()=>{
  const f=await fixture(),a=await f.login(),run=ok(await f.call('/runs/start',{mode:'build'},a.token));
  const stored=await account(f,a);for(const key of ['liveops','passGrants','passBenefits','mailClaims'])delete stored[key];
  stored.wallet.paid=12;stored.wallet.free=3;stored.wallet.debt=2;stored.profile.shards=15;await f.storage.put('account:'+a.accountId,stored);
  const view=ok(await f.call('/liveops',undefined,a.token)),after=await account(f,a);
  assert.deepEqual(view.wallet,stored.wallet);assert.deepEqual(view.profile,stored.profile);assert.equal(after.activeRun,run.ticket);
  assert.deepEqual((await f.storage.get('run:'+run.ticket)).snapshot,run.snapshot);assert.deepEqual(after.liveops,LR.defaultState());
});

test('admin authorization is private, plain-text/capped drafts are idempotent and preview is required',async()=>{
  const f=await fixture(),a=await f.login(),user=await f.login('another');
  assert.equal((await draft(f,a)).status,403);assert.equal((await f.call('/admin/mail/list',undefined,user.token)).status,403);
  f.env.ADMIN_ACCOUNT_IDS='google:user1';assert.equal(ok(await f.call('/liveops',undefined,a.token)).canAdmin,true);
  assert.equal((await draft(f,a,'bad-html-0001',{body:'<img src=x>'})).body.error,'invalid-mail');
  assert.equal((await draft(f,a,'bad-cost-0001',{reward:{gold:10001,shards:1}})).body.error,'invalid-mail-reward');
  assert.equal((await draft(f,a,'bad-cost-0002',{reward:{gold:1,shards:501}})).body.error,'invalid-mail-reward');
  const first=ok(await draft(f,a));assert.equal(first.serverNow,f.state.now);f.state.now+=1;
  const repeat=ok(await draft(f,a));assert.equal(repeat.mail.id,first.mail.id);assert.equal(repeat.duplicate,true);assert.equal(repeat.serverNow,f.state.now);
  assert.equal((await draft(f,a,'draft-mail-0001',{title:'다른 제목'})).body.error,'request-id-conflict');
  assert.equal((await f.call('/admin/mail/publish',{id:first.mail.id,requestId:'no-preview-001',previewToken:'fake'},a.token)).body.error,'preview-required');
  assert.equal(ok(await f.call('/liveops',undefined,user.token)).inbox.length,0);
  const rows=ok(await f.call('/admin/mail/list',undefined,a.token));assert.equal(rows.mails.length,1);
  assert.equal(ok(await f.call('/admin/mail/'+first.mail.id,undefined,a.token)).mail.id,first.mail.id);
});

test('preview freezes recipients and total even for same-millisecond new accounts; mail claims are atomic and private',async()=>{
  const f=await fixture(),a=await f.login(),user=await f.login('existing');f.env.ADMIN_ACCOUNT_IDS=a.accountId;
  const mail=ok(await draft(f,a)).mail,preview=ok(await f.call('/admin/mail/preview',{id:mail.id},a.token));
  assert.equal(preview.recipientCount,2);assert.deepEqual(preview.total,{gold:1000,shards:20});
  const newUser=await f.login('too-late');
  const b={id:mail.id,requestId:'frozen-publish-001',previewToken:preview.previewToken};
  const published=await Promise.all([f.call('/admin/mail/publish',b,a.token),f.call('/admin/mail/publish',b,a.token)]);
  assert.ok(published.every(r=>r.status===200));assert.equal(published.filter(r=>!r.body.duplicate).length,1);
  assert.ok(published.every(r=>r.body.serverNow===f.state.now));f.state.now+=1;
  const replay=ok(await f.call('/admin/mail/publish',b,a.token));assert.equal(replay.duplicate,true);assert.equal(replay.serverNow,f.state.now);
  const inbox=ok(await f.call('/liveops',undefined,user.token)).inbox;assert.equal(inbox.length,1);assert.equal(inbox[0].audienceAt,preview.audienceAt);
  for(const field of ['createdBy','publishedBy','preview','recipientCount','audienceSequence'])assert.equal(inbox[0][field],undefined);
  assert.equal(ok(await f.call('/liveops',undefined,newUser.token)).inbox.length,0);
  assert.equal((await f.call('/mail/claim',{id:mail.id,requestId:'late-claim-001'},newUser.token)).body.error,'mail-unavailable');
  const before=await account(f,user),claim={id:mail.id,requestId:'mail-claim-0001'};
  const claimed=await Promise.all([f.call('/mail/claim',claim,user.token),f.call('/mail/claim',claim,user.token)]);
  assert.ok(claimed.every(r=>r.status===200));assert.equal(claimed.filter(r=>!r.body.duplicate).length,1);
  const after=await account(f,user);assert.equal(after.wallet.free-before.wallet.free,10);assert.equal(after.profile.collection.gold-before.profile.collection.gold,500);
  assert.equal((await f.call('/mail/claim',{...claim,requestId:'mail-claim-0002'},user.token)).body.error,'already-claimed');
  assert.equal(ok(await f.call('/liveops',undefined,user.token)).inbox[0].claimed,true);
  assert.equal((await f.storage.list({prefix:'mail-audit:'})).size,3);
});

test('draft edits and expired previews invalidate publishing; cancellation never revokes claimed rewards',async()=>{
  const f=await fixture(),a=await f.login(),user=await f.login('mail-reader');f.env.ADMIN_ACCOUNT_IDS='account:'+a.accountId;
  const mail=ok(await draft(f,a)).mail,preview=ok(await f.call('/admin/mail/preview',{id:mail.id},a.token));
  ok(await draft(f,a,'edit-mail-0001',{id:mail.id,title:'수정 안내'}));
  assert.equal((await f.call('/admin/mail/publish',{id:mail.id,requestId:'old-preview-0001',previewToken:preview.previewToken},a.token)).body.error,'preview-required');
  const second=ok(await f.call('/admin/mail/preview',{id:mail.id},a.token));f.state.now+=600001;
  assert.equal((await f.call('/admin/mail/publish',{id:mail.id,requestId:'old-preview-0002',previewToken:second.previewToken},a.token)).body.error,'preview-required');
  const {mail:sent}=await publish(f,a);ok(await f.call('/mail/claim',{id:sent.id,requestId:'cancel-claim-0001'},user.token));
  const before=await account(f,user),cancelBody={id:sent.id,requestId:'cancel-mail-0001'};
  const cancelled=ok(await f.call('/admin/mail/cancel',cancelBody,a.token));assert.equal(cancelled.serverNow,f.state.now);f.state.now+=1;
  const repeated=ok(await f.call('/admin/mail/cancel',cancelBody,a.token));assert.equal(repeated.duplicate,true);assert.equal(repeated.serverNow,f.state.now);
  assert.deepEqual(await account(f,user),before);assert.equal(ok(await f.call('/liveops',undefined,user.token)).inbox.length,0);
  assert.equal((await f.call('/mail/claim',{id:sent.id,requestId:'cancel-claim-0002'},a.token)).body.error,'mail-unavailable');
  const short=await publish(f,a,{expiresAt:f.state.now+100});f.state.now+=101;
  assert.equal((await f.call('/mail/claim',{id:short.mail.id,requestId:'expired-claim-001'},user.token)).body.error,'mail-expired');
  assert.equal(ok(await f.call('/liveops',undefined,user.token)).inbox.length,0);
});
