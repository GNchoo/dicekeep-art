import test from 'node:test';
import assert from 'node:assert/strict';
import {RewardStore,REWARD_TTL} from '../src/reward-store.js';
import {createBattle,endBattle} from '../src/battle-core.js';
class Storage {
  constructor(){this.data=new Map();this.lock=Promise.resolve();}
  async get(k){return structuredClone(this.data.get(k));}
  async put(k,v){this.data.set(k,structuredClone(v));}
  async delete(k){this.data.delete(k);}
  async list({prefix}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));}
  async transaction(fn){let release;const done=new Promise(r=>release=r),prior=this.lock;this.lock=done;await prior;const tx=new Storage();tx.data=structuredClone(this.data);try{const result=await fn(tx);this.data=tx.data;return result;}finally{release();}}
}
export {Storage};
const A='aaaa1111',B='bbbb2222',KEY='a'.repeat(32),CODE='ABC234';
function fixture(rewards=true){
  let now=1700000000000;const storage=new Storage(),store=new RewardStore(storage,()=>now),matchId=CODE+':'+now+':123';
  const state={code:CODE,players:{[A]:{key:KEY},[B]:{key:'b'.repeat(32)}},game:{battle:createBattle('coop',[A,B],matchId,now,rewards)}};
  const proof={code:CODE,matchId,pid:A,key:KEY,mode:'coop',accountId:'c'.repeat(32),ticket:'d'.repeat(64),environment:'test'};
  return{storage,store,state,proof,advance(ms){now+=ms;},end(){state.game.battle.seats[A].activeSeconds=120;state.game.battle.seats[A].kills=200;state.game.battle.kills=500;endBattle(state.game.battle,'goal',[],now);}};
}
test('internal claims bind one seat to one account/ticket and return immutable server facts after room deletion',async()=>{
  const f=fixture();await f.store.putRoom(f.state);
  assert.equal((await f.store.request('bind',f.proof)).ok,true);
  assert.equal((await f.store.request('claim',f.proof)).status,503);
  assert.equal((await f.store.request('bind',{...f.proof,key:'b'.repeat(32)})).status,403);
  assert.equal((await f.store.request('bind',{...f.proof,accountId:'e'.repeat(32)})).error,'battle-already-claimed');
  assert.equal((await f.store.request('bind',{...f.proof,ticket:'e'.repeat(64)})).error,'battle-already-claimed');
  assert.equal((await f.store.request('bind',{...f.proof,pid:B,key:'b'.repeat(32),ticket:'e'.repeat(64)})).error,'battle-account-already-bound');
  f.advance(180000);f.end();await f.store.putRoom(f.state);
  const first=await f.store.request('claim',f.proof);assert.equal(first.result.activeSeconds,120);assert.equal(first.result.elapsed,180);assert.equal(first.result.wave,13);assert.equal(first.result.won,true);assert.equal(first.result.teamKills,500);
  f.state.game.battle.kills=999999;await f.store.putRoom(f.state);await f.storage.delete('room');f.advance(86400000);
  const reloaded=new RewardStore(f.storage,()=>1700000000000+86400000+180000);
  const claims=await Promise.all([reloaded.request('claim',f.proof),reloaded.request('claim',f.proof)]);assert.deepEqual(claims,[first,first]);
  assert.equal((await reloaded.request('bind',f.proof)).ok,true,'lost start response retries same bound ticket even after end');
  const raw=await f.storage.get('reward:'+f.proof.matchId);assert.equal(JSON.stringify(raw).includes(KEY),false,'archive stores a proof hash, never the seat secret');
});
test('unbound late accounts, older rooms, mismatched modes, and expired receipts cannot receive rewards',async()=>{
  const f=fixture();await f.store.putRoom(f.state);f.advance(100000);f.end();await f.store.putRoom(f.state);
  assert.equal((await f.store.request('bind',f.proof)).error,'battle-run-ended');
  assert.equal((await f.store.request('claim',f.proof)).error,'battle-run-unbound');
  assert.equal((await f.store.request('claim',{...f.proof,mode:'duel'})).status,403);
  f.advance(REWARD_TTL+1);assert.equal((await f.store.request('claim',f.proof)).status,410);assert.equal(await f.store.gc(),null);assert.equal(await f.storage.get('reward:'+f.proof.matchId),undefined);
  const old=fixture(false);await old.store.putRoom(old.state);assert.equal((await old.store.request('bind',old.proof)).status,410);
});
test('concurrent attempts reserve a seat for exactly one account and immutable ticket',async()=>{
  const f=fixture();await f.store.putRoom(f.state);
  const results=await Promise.all([f.store.request('bind',f.proof),f.store.request('bind',{...f.proof,accountId:'f'.repeat(32),ticket:'f'.repeat(64)})]);
  assert.equal(results.filter(x=>x.ok).length,1);assert.equal(results.filter(x=>x.error==='battle-already-claimed').length,1);
});
