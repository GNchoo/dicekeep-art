import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,emptyLive,reduce,liveFromSockets,snapshot,nextAlarm} from '../src/room-core.js';
import {group} from '../src/lobby-core.js';
import {parse,PROTOCOL} from '../src/proto.js';
import {RoomHost} from '../src/host.js';
import {RECONNECT_GRACE} from '../src/timing.js';

const A='aaaa1111',B='bbbb2222',C='cccc3333',D='dddd4444';
const key=id=>id.repeat(4),clone=x=>JSON.parse(JSON.stringify(x));
const messages=r=>r.effects.filter(e=>e.send).map(e=>e.send.m);
function harness(mode='duel', ver='115') {
  const h={now:1700000000000,state:null,live:null};
  h.state=createRoom({code:'ABC234',now:h.now,mode});h.live=emptyLive(h.now);
  h.step=ev=>{const r=reduce(h,ev,h.now);h.state=r.state;h.live=r.live;return r;};
  h.join=(id,op='join',sid=id)=>{
    h.step({k:'open',sid,op});return h.step({k:'hello',sid,op,m:{t:'hello',v:PROTOCOL,ver,mode,op,pid:id,key:key(id),name:id}});
  };
  h.msg=(id,m)=>{const p=parse(JSON.stringify(m));assert.equal(p.ok,true);return h.step({k:'msg',pid:id,sid:h.live.players[id].sid,m:p.m});};
  h.start=()=>{h.join(A,'create');h.join(B);h.msg(A,{t:'start'});h.now=h.state.game.t0;return h;};
  h.report=(id,kind,data={},seq)=>h.msg(id,{t:'battle',matchId:h.state.game.battle.matchId,seq:seq??h.state.game.battle.seats[id].lastSeq+1,kind,...(kind==='kill'?{count:1,transferred:false}:kind==='leak'?{count:1,boss:false}:{}),...data});
  return h;
}
test('new rooms are exactly two; quick queues isolate all modes and pair immediately',()=>{
  for(const mode of ['duel','coop']){
    const h=harness(mode);h.join(A,'create');assert.ok(messages(h.msg(A,{t:'start'})).some(m=>m.code==='not-ready'));
    h.join(B);assert.ok(messages(h.join(C)).some(m=>m.code==='full'));h.msg(A,{t:'start'});
    assert.equal(h.state.phase,'playing');assert.equal(h.state.game.timing.clearWave,0);
    assert.equal(Object.keys(h.state.game.battle.seats).length,2);
  }
  const q=[A,B,C,D].map((pid,i)=>({pid,mode:'duel',ver:'115',since:i}));
  q.push({pid:'eeee5555',mode:'coop',ver:'115',since:0},{pid:'ffff6666',mode:'clear',ver:'115',since:0});
  assert.deepEqual(group(q,4).map(g=>g.map(p=>p.pid)),[[A,B],[C,D]]);
});
test('kill batches transfer only every five ordinary kills; replay, gaps, and transfer kills cannot duplicate',()=>{
  const h=harness().start(),b=h.state.game.battle;
  h.report(A,'kill',{count:4});assert.equal(b.events.length,0);
  h.report(A,'kill',{count:8});assert.deepEqual(b.events.map(e=>[e.kind,e.to,e.count]),[['incoming',B,2]]);
  const before=clone(b);h.report(A,'kill',{count:8},2);assert.deepEqual(b,before);
  assert.ok(messages(h.report(A,'kill',{count:1},4)).some(m=>m.code==='battle-sequence'));
  h.report(B,'kill',{count:10,transferred:true});assert.equal(b.events.length,1);assert.equal(b.seats[B].transferKills,0);
  h.report(A,'kill',{count:3});assert.equal(b.events[1].count,1);
  const event=b.events[0];h.msg(A,{t:'battleAck',matchId:b.matchId,eventId:event.id});assert.equal(b.events.length,2,'only recipient can ack');
  h.msg(B,{t:'battleAck',matchId:b.matchId,eventId:event.id});h.msg(B,{t:'battleAck',matchId:b.matchId,eventId:event.id});assert.equal(b.events.length,1);
});
test('duel HP is server owned; first terminal event fixes one outcome and ignores later defeat/clear reports',()=>{
  const h=harness().start(),b=h.state.game.battle;
  h.report(A,'leak',{count:3,boss:true});assert.equal(b.seats[A].lives,5);
  const r=h.report(A,'leak',{count:5});assert.equal(h.state.phase,'ended');assert.deepEqual(b.result.winners,[B]);
  assert.ok(messages(r).some(m=>m.t==='end'&&m.battle.result.winners[0]===B));
  const result=clone(b.result);h.msg(B,{t:'dead',w:0,k:0,r:'lives'});h.report(B,'leak',{count:100});h.msg(A,{t:'clear',w:101,k:999});
  assert.deepEqual(b.result,result);assert.equal(h.state.game.ranking.find(r=>r.pid===B).rank,1);
});
test('coop shares HP, grants 60 SP with server cooldown, and wins together at 500 combined kills',()=>{
  const h=harness('coop').start(),b=h.state.game.battle;
  h.report(A,'leak',{count:1,boss:true});assert.equal(b.teamLives,15);assert.ok(Object.values(b.seats).every(s=>s.lives===15));
  h.report(A,'assist');assert.deepEqual(b.events.map(e=>[e.kind,e.to,e.sp]),[['supply',B,60]]);
  h.report(A,'assist',{},2);assert.equal(b.events.length,1,'same seq replay does not grant SP');
  h.report(A,'assist');assert.equal(b.events.length,1,'early new attempt cannot bypass cooldown');
  assert.equal(b.seats[A].lastAction.reason,'battle-cooldown');
  h.now+=45000;h.report(A,'assist');assert.equal(b.events.length,2);
  for(let i=0;i<5;i++)h.report(i%2?B:A,'kill',{count:100});
  assert.equal(b.kills,500);assert.equal(h.state.phase,'ended');assert.deepEqual(b.result.winners,[A,B]);
  assert.deepEqual(h.state.game.ranking.map(r=>r.rank),[1,1]);
});
test('coop loss and explicit quit end both players; duel quit awards the remaining player',()=>{
  for(const mode of ['duel','coop']){
    const h=harness(mode).start();h.msg(A,{t:'dead',w:0,k:0,r:'quit'});
    assert.deepEqual(h.state.game.battle.result.winners,mode==='duel'?[B]:[]);
    assert.deepEqual(h.state.game.battle.result.losers,mode==='duel'?[A]:[A,B]);
  }
  const h=harness('coop').start();h.report(B,'leak',{count:4,boss:true});assert.equal(h.state.game.battle.teamLives,0);assert.deepEqual(h.state.game.battle.result.winners,[]);
});
test('pending events, seq, and disconnect deadlines survive JSON reload; reconnect sees same match state',()=>{
  const h=harness().start();h.report(A,'kill',{count:5});
  const original=clone(h.state.game.battle);h.step({k:'close',sid:B});const disconnected=h.now;
  h.state=clone(h.state);h.live=liveFromSockets(h.state,[{sid:A,pid:A}],h.now+5000);
  assert.equal(h.live.players[B].disconnectedAt,disconnected);
  h.now+=10000;const welcome=messages(h.join(B,'join','b-new')).find(m=>m.t==='welcome');
  assert.deepEqual(welcome.room.game.battle.events,original.events);assert.equal(welcome.room.game.battle.seats[A].lastSeq,1);
  h.report(A,'kill',{count:5},1);assert.equal(h.state.game.battle.events.length,1);
  h.step({k:'close',sid:'b-new'});h.now+=RECONNECT_GRACE;h.step({k:'alarm'});
  assert.deepEqual(h.state.game.battle.result.winners,[A]);
});
test('boss boundaries use server real time; battle summaries reject x3/x4 and personal clear cannot win',()=>{
  const h=harness().start(),b=h.state.game.battle;
  assert.equal(nextAlarm(h.state,h.live,h.now),b.t0+90000);
  h.now+=90000;h.step({k:'alarm'});assert.equal(b.bossRound,1);assert.equal(b.nextBossAt,b.t0+180000);
  for(const sp of [3,4]) {
    const r=h.msg(A,{t:'sum',w:1,dw:0,l:0,g:0,k:0,f:0,sp,hid:0,b:null,o:'l',ds:1,tw:[]});
    assert.ok(messages(r).some(m=>m.code==='mode'));assert.equal(b.seats[A].lives,20);
  }
  h.msg(A,{t:'clear',w:101,k:0});assert.equal(h.state.phase,'playing');
  const before=clone(b);h.now=b.t0-1;h.report(A,'leak',{count:100});assert.deepEqual(b,before,'no pre-start damage');
});
test('battle schema discards claimed winners/HP/amount and rejects malformed seq/count/flags',()=>{
  const m={t:'battle',matchId:'room:1:2',seq:1,kind:'leak',count:1,boss:false};
  assert.deepEqual(parse(JSON.stringify({...m,hp:0,winner:A,sp:999})).m,m);
  for(const patch of [{seq:0},{seq:1.1},{count:101},{boss:1},{matchId:''},{kind:'winner'}])assert.equal(parse(JSON.stringify({...m,...patch})).ok,false);
});
test('RoomHost persists before battle ack, serializes concurrent reports, and rolls back a failed write',async()=>{
  let now=1700000000000,persisted=null,fail=false;const sent=[];
  const host=new RoomHost({now:()=>now,random32:()=>123,send:(sid,text)=>sent.push({sid,m:JSON.parse(text),persisted:clone(persisted)}),close:()=>{},
    put:async s=>{if(fail)throw Error('storage failed');persisted=clone(s);},destroy:()=>{},setAlarm:()=>{},log:()=>{}});
  await host.claim({code:'ABC234',mode:'duel'});
  const att={};for(const [pid,op] of [[A,'create'],[B,'join']]){att[pid]={sid:pid,op};await host.open(pid,op);await host.message(pid,att[pid],JSON.stringify({t:'hello',v:4,ver:'115',mode:'duel',op,pid,key:key(pid),name:pid}));att[pid].pid=pid;}
  await host.message(A,att[A],JSON.stringify({t:'start'}));now=host.state.game.t0;sent.length=0;
  const report=seq=>({t:'battle',matchId:host.state.game.battle.matchId,seq,kind:'kill',count:5,transferred:false});
  fail=true;await assert.rejects(host.message(A,att[A],JSON.stringify(report(1))),/storage failed/);assert.equal(sent.length,0);assert.equal(host.state.game.battle.seats[A].lastSeq,0);
  fail=false;await Promise.all([host.message(A,att[A],JSON.stringify(report(1))),host.message(A,att[A],JSON.stringify(report(2)))]);
  assert.equal(host.state.game.battle.events.length,2);
  for(const item of sent.filter(x=>x.m.t==='battle'))assert.ok(item.persisted.game.battle.revision>=item.m.battle.revision,'durable state precedes ack');
});

test('v116 participation counts visible connected three-tower intervals, excluding gaps and reconnect time',()=>{
  const h=harness('coop','116').start(),b=h.state.game.battle;
  const sum=(patch={})=>h.msg(A,{t:'sum',w:1,dw:0,l:20,g:0,k:0,f:0,sp:1,hid:0,b:null,o:'p',ds:1,tw:[[0,3,1,1],[1,6,1,1],[2,16,1,1]],...patch});
  assert.equal(b.rewardVersion,1);sum();
  for(let i=0;i<60;i++){h.now+=1000;sum();}
  assert.equal(b.seats[A].activeSeconds,60,'zero damage/support towers qualify equally');
  h.now+=5000;sum();assert.equal(b.seats[A].activeSeconds,60,'missing intervals are not capped and awarded');
  h.now+=1000;sum({hid:1});h.now+=10000;sum();assert.equal(b.seats[A].activeSeconds,60);
  h.now+=1000;sum({tw:[[0,1,1,1]]});h.now+=1000;sum();assert.equal(b.seats[A].activeSeconds,60);
  h.step({k:'close',sid:A});h.now+=10000;h.join(A,'join','a-new');sum();assert.equal(b.seats[A].activeSeconds,60);
  h.now+=1000;sum();assert.equal(b.seats[A].activeSeconds,61);
  h.state=clone(h.state);h.live=liveFromSockets(h.state,[{sid:'a-new',pid:A},{sid:B,pid:B}],h.now+1000);h.now+=1000;sum();
  assert.equal(h.state.game.battle.seats[A].activeSeconds,61,'hibernation cannot add an unobserved interval');
  h.report(B,'leak',{count:20});const ended=clone(h.state.game.battle);h.now+=1000;sum();assert.deepEqual(h.state.game.battle,ended);
  assert.equal(harness('coop','115').start().state.game.battle.rewardVersion,undefined,'old client rooms never acquire rewards');
});
