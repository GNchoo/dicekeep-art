#!/usr/bin/env node
// Real WebSocket practice matches. Requires net/test/dev-server.mjs or Worker.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
const base=(process.argv[2]||'ws://localhost:8788').replace(/\/$/,''),clients=[],report={pass:false,cases:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function client(route,mode,op,id={pid:crypto.randomBytes(4).toString('hex'),key:crypto.randomBytes(16).toString('hex')}) {
  const ws=new WebSocket(base+route),messages=[],waiters=[];
  ws.addEventListener('message',e=>{if(e.data==='pong')return;const m=JSON.parse(e.data);messages.push(m);for(const w of [...waiters])if(w.test(m)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(m);}});
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const c={ws,id,messages,send:m=>ws.send(JSON.stringify(m)),wait(test){const existing=messages.find(test);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const w={test,resolve,timer:setTimeout(()=>reject(Error('WebSocket wait timed out: '+test)),12000)};waiters.push(w);});}};
  clients.push(c);c.send({t:'hello',v:4,ver:'115',mode,op,name:id.pid,...id});return c;
}
try {
  for(const mode of ['duel','coop']) {
    const a=await client('/ws/new',mode,'create'),welcome=await a.wait(m=>m.t==='welcome'),code=welcome.code;
    const b=await client('/ws/room/'+code,mode,'join');await b.wait(m=>m.t==='welcome');
    const third=await client('/ws/room/'+code,mode,'join');assert.equal((await third.wait(m=>m.t==='err')).code,'full');
    a.send({t:'start'});const start=await a.wait(m=>m.t==='start');await b.wait(m=>m.t==='start');
    assert.equal(start.mode,mode);assert.equal(start.timing.clearWave,0);assert.equal(Object.keys(start.battle.seats).length,2);
    await delay(Math.max(0,start.t0-Date.now())+30);
    const kill={t:'battle',matchId:start.battle.matchId,seq:1,kind:'kill',count:5,transferred:false};a.send(kill);a.send(kill);
    const state=(await b.wait(m=>m.t==='battle'&&m.battle.seats[a.id.pid].lastSeq===1)).battle;
    assert.equal(state.kills,5);assert.equal(state.events.length,mode==='duel'?1:0);
    const replacement=await client('/ws/room/'+code,mode,'join',b.id),back=await replacement.wait(m=>m.t==='welcome');
    assert.equal(back.resumed,true);assert.equal(back.room.game.battle.matchId,start.battle.matchId);assert.equal(back.room.game.battle.kills,5);
    if(mode==='duel') {
      const event=back.room.game.battle.events[0];replacement.send({t:'battleAck',matchId:start.battle.matchId,eventId:event.id});
      await replacement.wait(m=>m.t==='battle'&&m.battle.events.length===0);
      a.send({t:'battle',matchId:start.battle.matchId,seq:2,kind:'leak',count:4,boss:true});
      const end=await replacement.wait(m=>m.t==='end');assert.deepEqual(end.battle.result.winners,[b.id.pid]);
    } else {
      a.send({t:'battle',matchId:start.battle.matchId,seq:2,kind:'assist'});
      const supply=(await replacement.wait(m=>m.t==='battle'&&m.battle.events.some(e=>e.kind==='supply'))).battle.events.find(e=>e.kind==='supply');assert.equal(supply.sp,60);
      for(let seq=3;seq<=7;seq++)a.send({t:'battle',matchId:start.battle.matchId,seq,kind:'kill',count:seq===7?95:100,transferred:false});
      const [left,right]=await Promise.all([a.wait(m=>m.t==='end'),replacement.wait(m=>m.t==='end')]);
      assert.equal(left.battle.kills,500);assert.deepEqual(left.battle.result.winners.slice().sort(),[a.id.pid,b.id.pid].sort());assert.deepEqual(left.battle.result,right.battle.result);
    }
    report.cases.push({mode,pass:true,checks:['two seats','duplicate report','same-seat reconnect','pending event recovery','authoritative result']});console.log('PASS',mode);
  }
  const a=await client('/ws/quick','duel','quick'),b=await client('/ws/quick','duel','quick');
  const [am,bm]=await Promise.all([a.wait(m=>m.t==='matched'),b.wait(m=>m.t==='matched')]);assert.equal(am.code,bm.code);assert.equal(am.mode,'duel');
  report.cases.push({mode:'quick-duel',pass:true});report.pass=true;
} finally {
  for(const c of clients)c.ws.close();
  if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));
}
