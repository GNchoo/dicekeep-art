#!/usr/bin/env node
// Actual WebSocket integration; run against the Node test server or wrangler dev.
// node net/test/modes-ws-smoke.mjs ws://localhost:8788 [report.json]
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PROTOCOL } from '../src/proto.js';

const base = (process.argv[2] || 'ws://localhost:8788').replace(/\/$/, '');
const clients = [];
const report = { base, protocol: PROTOCOL, scope: 'Actual friend rooms and quick matchmaking; scores are client reports, not an authoritative global leaderboard.', cases: [], errors: [], pass: false };
function socket(route, mode, op, identity) {
  const id = identity || { pid: crypto.randomBytes(4).toString('hex'), key: crypto.randomBytes(16).toString('hex') };
  const ws = new WebSocket(base + route), messages = [], waiters = [];
  ws.addEventListener('message', e => {
    if (e.data === 'pong') return;
    const m = JSON.parse(e.data); messages.push(m);
    for (const w of [...waiters]) if (w.test(m)) { clearTimeout(w.timer); waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const ready = new Promise((resolve,reject) => { ws.addEventListener('open',resolve,{once:true}); ws.addEventListener('error',reject,{once:true}); });
  const c = { ws, id, messages, send: m => ws.send(JSON.stringify(m)), async hello() {
    await ready; c.send({ t:'hello', v:PROTOCOL, ver:'modes-smoke', op, mode, name:id.pid, ...id }); return c;
  }, wait(test, timeout=20000) {
    const old=messages.find(test); if(old)return Promise.resolve(old);
    return new Promise((resolve,reject)=>{ const w={test,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Timed out: '+test.toString()));},timeout)};waiters.push(w); });
  }};
  clients.push(c); return c;
}
const type = t => m => m.t === t;
const sum = (w,k) => ({t:'sum',w,dw:Math.max(0,w-1),l:20,g:100,k,f:0,sp:1,hid:0,b:null,o:'p',tw:[]});
try {
  const health=await fetch(base.replace(/^ws/,'http')+'/health').then(r=>r.json()); assert.equal(health.protocol,4);
  const a=await socket('/ws/new','extreme','create').hello(), welcome=await a.wait(type('welcome'));
  assert.equal(welcome.room.mode,'extreme'); const code=welcome.code;
  const bad=await socket('/ws/room/'+code,'clear','join').hello(); assert.equal((await bad.wait(type('err'))).code,'mode');
  report.cases.push('friend-room mode mismatch rejected');
  const b=await socket('/ws/room/'+code,'extreme','join').hello();await b.wait(type('welcome'));
  a.send({t:'start'});const start=await a.wait(type('start'));await b.wait(type('start'));
  assert.equal(start.mode,'extreme');assert.equal(start.timing.clearWave,0);
  a.send(sum(205,70));a.send({t:'done',w:204});a.send({t:'clear',w:101,k:70});
  assert.equal((await a.wait(type('err'))).code,'mode');
  const update=await b.wait(m=>m.t==='sum'&&m.pid===a.id.pid);assert.equal(update.w,205);
  const replacement=await socket('/ws/room/'+code,'extreme','join',a.id).hello();const back=await replacement.wait(type('welcome'));
  assert.equal(back.resumed,true);assert.equal(back.room.game.mode,'extreme');assert.equal(back.room.game.timing.clearWave,0);
  assert.equal(back.room.players.find(p=>p.pid===a.id.pid).wave,205);
  report.cases.push('extreme start, wave 205, clear rejection, reconnect retain rules and progress');
  replacement.send({t:'dead',w:206,k:70,r:'lives'});b.send({t:'dead',w:103,k:999,r:'lives'});
  const end=await b.wait(type('end'));assert.equal(end.reason,'all-dead');assert.deepEqual(end.ranking.map(p=>p.wave),[205,102]);
  report.cases.push('extreme friend ranking uses completed wave ahead of kills');
  const qClear=await socket('/ws/quick','clear','quick').hello();await qClear.wait(type('queued'));
  const q1=await socket('/ws/quick','extreme','quick').hello();await q1.wait(type('queued'));
  const q2=await socket('/ws/quick','extreme','quick').hello();await q2.wait(type('queued'));
  const [m1,m2]=await Promise.all([q1.wait(type('matched')),q2.wait(type('matched'))]);
  assert.equal(m1.code,m2.code);assert.equal(m1.mode,'extreme');assert.equal(qClear.messages.some(type('matched')),false);
  assert.ok(qClear.messages.filter(type('queued')).every(m=>m.n===1&&m.mode==='clear'));
  const qa=await socket('/ws/room/'+m1.code,'extreme','join',q1.id).hello();await qa.wait(type('welcome'));
  const qb=await socket('/ws/room/'+m2.code,'extreme','join',q2.id).hello();await qb.wait(type('welcome'));
  const qs=await qa.wait(type('start'));assert.equal(qs.mode,'extreme');assert.equal(qs.timing.clearWave,0);
  report.cases.push('quick queues isolated; reserved extreme room auto-starts with no clear line');
  report.pass=true;
} catch(e) { report.errors.push(e.stack);process.exitCode=1; }
finally {
  for(const c of clients){if(c.ws.readyState===WebSocket.OPEN){c.send({t:'leave'});c.ws.close(1000,'test-finished');}}
  if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
