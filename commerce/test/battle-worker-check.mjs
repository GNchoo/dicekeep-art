// Real local workerd + two Workers + SQLite DO binding. No external login,
// payment, deployed service, secret or client-provided result is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {fixture,jwt} from './helpers.mjs';
const f=await fixture(),root=new URL('../../',import.meta.url);
const modules=(folder,ext)=>['index'+ext,...fs.readdirSync(new URL(folder,root)).filter(x=>x.endsWith(ext)&&x!=='index'+ext)].map(name=>({type:'ESModule',path:fileURLToPath(new URL(folder+name,root))}));
const bundledNet=await build({entryPoints:[fileURLToPath(new URL('net/src/index.js',root))],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:'dicekeep-commerce',modules:modules('commerce/src/','.mjs'),compatibilityDate:'2026-09-08',bindings:f.env,
    durableObjects:{COMMERCE:{className:'CommerceLedger',useSQLite:true},GAME_ROOMS:{className:'Room',scriptName:'dicekeep-net',useSQLite:true}},
    outboundService:async req=>f.fetcher(req.url,{method:req.method,headers:req.headers,body:req.method==='POST'?await req.text():undefined})},
  {name:'dicekeep-net',modules:[{type:'ESModule',path:'battle-net-test-entry.js',contents:bundledNet.outputFiles[0].text}],compatibilityDate:'2026-09-08',bindings:{TIMING:'fast'},
    durableObjects:{ROOM:{className:'Room',useSQLite:true},LOBBY:{className:'Lobby',useSQLite:true}}}
]}));
const call=async(path,b,token)=>{
  const response=await mf.dispatchFetch('https://commerce.example'+path,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(b?{body:JSON.stringify(b)}:{})});
  return{status:response.status,body:await response.json()};
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const A='aaaa1111',B='bbbb2222',CODE='ABC234',peers=[];
async function peer(room,pid,op){
  const response=await room.fetch('https://room.internal/ws',{headers:{Upgrade:'websocket','X-DK-Op':op}});assert.equal(response.status,101);
  const ws=response.webSocket,messages=[];ws.accept();ws.addEventListener('message',e=>{if(e.data!=='pong')messages.push(JSON.parse(e.data));});
  const p={ws,messages,pid,key:(pid===A?'a':'b').repeat(32),send:m=>ws.send(JSON.stringify(m)),async wait(type){for(let i=0;i<100;i++){const found=messages.find(m=>m.t===type);if(found)return found;await delay(25);}throw Error('missing '+type);}};
  p.send({t:'hello',v:4,ver:'116',op,mode:'coop',pid,key:p.key,name:pid});await p.wait('welcome');peers.push(p);return p;
}
try{
  const net=await mf.getWorker('dicekeep-net');assert.equal((await net.fetch('https://net.example/reward-claim',{method:'POST',body:'{}'})).status,404,'internal claim never exposed publicly');
  const rooms=await mf.getDurableObjectNamespace('ROOM','dicekeep-net'),room=rooms.get(rooms.idFromName(CODE));
  assert.equal((await room.fetch('https://room.internal/claim',{method:'POST',headers:{'Content-Type':'application/json','X-DK-Code':CODE},body:JSON.stringify({mode:'coop'})})).status,201);
  const a=await peer(room,A,'create'),b=await peer(room,B,'join');a.send({t:'start'});
  const started=await a.wait('start');assert.equal(started.battle.rewardVersion,1);assert.equal(started.battle.ruleVersion,2);
  const now=Math.floor(Date.now()/1000),login=await call('/auth/google',{idToken:await jwt({iat:now,exp:now+3600})});assert.equal(login.status,200,JSON.stringify(login));
  const proof={code:CODE,matchId:started.battle.matchId,pid:A,key:a.key};
  const run=await call('/runs/start',{mode:'coop',battle:proof},login.body.token);assert.equal(run.status,200,JSON.stringify(run));
  await delay(Math.max(0,started.t0-Date.now()+25));
  const sum={t:'sum',w:1,dw:0,l:20,g:0,k:0,f:0,sp:1,hid:0,b:null,o:'p',ds:1,tw:[[0,3,1,1],[1,6,1,1],[2,16,1,1]]};
  for(let second=0;second<=62;second++){a.send(sum);b.send(sum);if(second<62)await delay(1000);}
  for(let seq=1;seq<=Math.ceil(started.battle.goal/100);seq++)a.send({t:'battle',matchId:proof.matchId,seq,kind:'kill',count:Math.min(100,started.battle.goal-(seq-1)*100),transferred:false});
  const end=await a.wait('end');assert.ok(end.battle.seats[A].activeSeconds>=60);assert.equal(end.battle.result.reason,'goal');
  const claimed=await Promise.all([call('/runs/settle',{ticket:run.body.ticket,battle:proof},login.body.token),call('/runs/settle',{ticket:run.body.ticket,battle:proof},login.body.token)]);
  assert.ok(claimed.every(x=>x.status===200),JSON.stringify(claimed));assert.equal(claimed.filter(x=>!x.body.duplicate).length,1);
  const award=claimed.find(x=>!x.body.duplicate).body;assert.ok(award.earnedShards>0);assert.equal(award.battle.activeSeconds,end.battle.seats[A].activeSeconds);
  await mf.unsafeEvictDurableObject('dicekeep-net','Room',{name:CODE,webSockets:'close'});
  const archived=await room.fetch('https://room.internal/reward-claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...proof,mode:'coop',accountId:login.body.accountId,ticket:run.body.ticket,environment:'test'})});
  assert.equal(archived.status,200);assert.deepEqual((await archived.json()).result,award.battle,'Room archive survives a fresh DO instance');
  const repeated=await call('/runs/settle',{ticket:run.body.ticket,battle:proof},login.body.token);assert.equal(repeated.body.duplicate,true);
  const report={pass:true,runtime:'two local workerd Workers + SQLite external DO binding',rewardVersion:1,ruleVersion:2,goal:started.battle.goal,activeSeconds:award.battle.activeSeconds,earnedShards:award.earnedShards,collectionRewards:award.collectionRewards,checks:['public claim route absent','seat-bound account start','62 real seconds with visible support towers','server-owned goal result','concurrent settlement once','Room archive and commerce replay after DO eviction'],externalPayments:0};
  const dir=new URL('gen/e2e/battle-worker/',root);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(new URL('report.json',dir),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{for(const p of peers)try{p.ws.close(1000,'done');}catch(_){}await mf.dispose();}
