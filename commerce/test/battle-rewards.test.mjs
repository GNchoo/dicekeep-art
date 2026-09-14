import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,MemoryStorage,jwt} from './helpers.mjs';
import PG from '../src/progression.mjs';
import {RewardStore} from '../../net/src/reward-store.js';
import {createBattle,endBattle} from '../../net/src/battle-core.js';
const A='aaaa1111',B='bbbb2222',CODE='ABC234',KEY='a'.repeat(32);
async function battleFixture(mode='coop') {
  const f=await fixture(),netStorage=new MemoryStorage(),store=new RewardStore(netStorage,()=>f.state.now);
  const matchId=CODE+':'+f.state.now+':123',proof={code:CODE,matchId,pid:A,key:KEY};
  const state={code:CODE,players:{[A]:{key:KEY},[B]:{key:'b'.repeat(32)}},game:{battle:createBattle(mode,[A,B],matchId,f.state.now,true)}};
  await store.putRoom(state);
  f.env.GAME_ROOMS={idFromName:code=>code,get:code=>({async fetch(req){assert.equal(code,CODE);const result=await store.request(new URL(req.url).pathname.endsWith('bind')?'bind':'claim',await req.json());return Response.json(result,{status:result.ok?200:result.status});}})};
  const finish=async(won=true)=>{f.state.now+=180000;state.game.battle.seats[A].activeSeconds=120;state.game.battle.seats[A].kills=180;state.game.battle.kills=1000;endBattle(state.game.battle,won?'goal':'lives',won?[]:[A],f.state.now);await store.putRoom(state);};
  return {...f,proof,netStorage,store,battleState:state,finish};
}
test('battle tickets bind server seats, retry identically, preserve legacy active runs, and reject forged result fields',async()=>{
  const f=await battleFixture(),a=await f.login();
  const legacy=(await f.call('/runs/start',{mode:'build'},a.token)).body;
  const starts=await Promise.all([f.call('/runs/start',{mode:'coop',battle:f.proof},a.token),f.call('/runs/start',{mode:'coop',battle:f.proof},a.token)]);
  assert.ok(starts.every(x=>x.status===200),JSON.stringify(starts));assert.equal(starts[0].body.ticket,starts[1].body.ticket);
  const ticket=starts[0].body.ticket,account=await f.storage.get('account:'+a.accountId);assert.equal(account.activeRun,legacy.ticket);
  assert.equal((await f.call('/runs/resume',{ticket},a.token)).status,200);assert.equal((await f.call('/runs/resume',{ticket:legacy.ticket},a.token)).status,200);
  assert.equal((await f.call('/runs/settle',{ticket,battle:f.proof,won:true,activeSeconds:9999},a.token)).status,400);
  assert.equal((await f.call('/runs/settle',{ticket,wave:101,kills:1000,won:true},a.token)).body.error,'battle-proof-required');
  assert.equal((await f.call('/runs/settle',{ticket,battle:f.proof},a.token)).status,503);
  const another=await f.login('user2');assert.equal((await f.call('/runs/start',{mode:'coop',battle:f.proof},another.token)).body.error,'battle-already-claimed');
  assert.equal((await f.call('/runs/settle',{ticket,battle:f.proof},another.token)).status,404);
});
test('trusted result settles once after room expiry, pays the same F2P formula and preserves paid currency and newer runs',async()=>{
  const f=await battleFixture(),a=await f.login();
  const ticket=(await f.call('/runs/start',{mode:'coop',battle:f.proof},a.token)).body.ticket;
  const account=await f.storage.get('account:'+a.accountId);account.wallet.paid=17;account.profile.shards+=17;await f.storage.put('account:'+a.accountId,account);
  const newer=(await f.call('/runs/start',{mode:'clear'},a.token)).body;
  await f.finish();await f.netStorage.delete('room');f.state.now+=86400000;
  const expected=structuredClone(account.profile),raw=await f.store.request('claim',{...f.proof,mode:'coop',accountId:a.accountId,ticket,environment:'test'});
  const rewards=PG.settle(expected,{id:ticket,...raw.result});assert.equal(rewards.ok,true);assert.ok(rewards.shards>0,'current F2P battle formula is enabled');
  // Sessions expire after one day: rotate authentication without losing the run.
  const now=Math.floor(f.state.now/1000),again=(await f.call('/auth/google',{idToken:await jwt({iat:now,exp:now+3600})})).body;
  const settled=await Promise.all([f.call('/runs/settle',{ticket,battle:f.proof},again.token),f.call('/runs/settle',{ticket,battle:f.proof},again.token)]);
  assert.ok(settled.every(x=>x.status===200),JSON.stringify(settled));assert.equal(settled.filter(x=>!x.body.duplicate).length,1);
  const updated=await f.storage.get('account:'+a.accountId);assert.equal(updated.wallet.paid,17);assert.equal(updated.wallet.free-account.wallet.free,rewards.shards);assert.equal(updated.activeRun,newer.ticket);
  assert.equal(updated.profile.records.coop.runs.length,1);assert.deepEqual(updated.profile.tree,expected.tree);
  assert.deepEqual(updated.profile.collection,expected.collection);
  assert.equal(updated.liveops.pass.xp,30,'120 server active seconds grants 30 pass XP only once');
  f.env.GAME_ROOMS=undefined;assert.equal((await f.call('/runs/settle',{ticket,battle:f.proof},again.token)).body.duplicate,true,'durable commerce receipt no longer needs room service');
});
test('claim followed by a failed commerce write retries without losing rewards or paying twice',async()=>{
  const f=await battleFixture('duel'),a=await f.login(),ticket=(await f.call('/runs/start',{mode:'duel',battle:f.proof},a.token)).body.ticket;
  await f.finish();const transaction=f.storage.transaction.bind(f.storage);let fail=true;
  f.storage.transaction=fn=>transaction(async tx=>{const result=await fn(tx);if(fail&&(await tx.get('run:'+ticket))?.status==='settled'){fail=false;throw Error('simulated ledger write failure');}return result;});
  const first=await f.call('/runs/settle',{ticket,battle:f.proof},a.token);assert.equal(first.status,500);assert.equal((await f.storage.get('run:'+ticket)).status,undefined);
  assert.equal((await f.storage.get('account:'+a.accountId)).liveops.pass.xp,0,'failed durable write cannot retain XP');
  const retried=await f.call('/runs/settle',{ticket,battle:f.proof},a.token);assert.equal(retried.status,200);assert.equal(retried.body.duplicate,false);
  assert.equal((await f.call('/runs/settle',{ticket,battle:f.proof},a.token)).body.duplicate,true);
  assert.equal((await f.storage.get('account:'+a.accountId)).liveops.pass.xp,30);
});
test('missing binding and old practice rooms fail without account or paid-wallet mutation',async()=>{
  const f=await fixture(),a=await f.login(),before=await f.storage.get('account:'+a.accountId);
  const proof={code:CODE,matchId:CODE+':1:1',pid:A,key:KEY};
  assert.equal((await f.call('/runs/start',{mode:'duel',battle:proof},a.token)).status,503);
  assert.deepEqual(await f.storage.get('account:'+a.accountId),before);
});
