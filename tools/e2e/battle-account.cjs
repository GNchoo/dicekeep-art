// Execute the current game's actual async account/start/restore/result functions
// in a small VM. Only API promises, rendering and board construction are doubles;
// no network, login, payment or alternative copy of the control flow is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const repo = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(repo, 'game.js'), 'utf8');
const copy = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const names = ['isBattleMode', 'battleRun', 'battleRules', 'battleOnState', 'battleFinish', 'mpRunInfo', 'mpSameMatch', 'mpOnStart', 'restoreRunSave', 'mpResumeAfterTitle', 'mpOnEnd'];
function extract(name) {
  const match = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(source);
  assert.ok(match, 'actual game function exists: ' + name);
  const end = source.indexOf('\n}', match.index);
  assert.ok(end > match.index, 'top-level function boundary: ' + name);
  return source.slice(match.index, end + 2);
}
const program = names.map(extract).join('\n');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const cases = [];
const PID = 'aaaa1111', OTHER = 'bbbb2222', CODE = 'ABC234', TICKET = 'c'.repeat(64), KEY = 'a'.repeat(32);

function fixture(mode) {
  const start = deferred(), resume = deferred(), calls = {start:[],resume:[],queue:[],finish:[],open:[],remove:[],order:[],overlay:[],toast:[],persist:0,transport:0};
  const battle = {version:1,rewardVersion:1,ruleVersion:2,matchId:CODE+':100000:123',mode,revision:1,t0:100000,goal:mode==='coop'?700:0,kills:0,teamLives:20,
    rules:{...require('../../battle-rules.js')},events:[],result:null,seats:{[PID]:{lives:20,kills:0,activeSeconds:0},[OTHER]:{lives:20,kills:0,activeSeconds:0}}};
  const room = {code:CODE,mode,phase:'playing',game:{mode,t0:100000,seed:123,timing:{prep:20000,clearWave:0},battle},players:[{pid:PID,status:'alive'},{pid:OTHER,status:'alive'}]};
  const net = {code:CODE,me:{pid:PID},state:'playing',room,inRoom(){return ['playing','ended'].includes(this.state);},
    battleProof(){return this.room ? {code:this.code,matchId:this.room.game.battle.matchId,pid:PID,key:KEY}:null;},
    battleRestore(){calls.transport++;return true;},leave(){this.code=null;this.room=null;this.state='offline';}};
  const snapshot={growth:true,deckSystem:1,mode,deck:[1,2,3,4,16],levels:{1:0},classes:{1:1}};
  const inf={mode,runId:'saved-run',accountTicket:TICKET,growthSnapshot:copy(snapshot),doneW:2,kills:4,battleApplied:[],battleBossRound:0,battleModeVersion:1};
  const saved={owner:'account:test',inf:copy(inf),match:{code:CODE,pid:PID,t0:100000,seed:123,matchId:battle.matchId,transport:{matchId:battle.matchId,seq:0,outbox:[]}},elapsed:40,size:[390,844],mapKey:'phone',lanes:[100],speed:1};
  const nodes=new Map(),element=()=>({classList:{add(){},remove(){},toggle(){}},onclick:null});
  const noop=()=>{};
  const context={console,structuredClone,Set,Map,performance:{now:()=>10000},W:390,H:844,SPOTS:[],LANES:[{len:100}],SLOT:{},DIE:{},VIEW:{pid:null},DRAG:{active:false},MP:{statsDone:false,resumeRoom:null},runResumeBusy:false,
    S:{mode:'stage',phase:'mpRoom',net:null,inf:null,towers:[],projs:[],enemies:[]},DKNET:net,BATTLE:require('../../battle-rules.js'),DECK:{catalog:[]},TOWER_DEFS:{},
    $:id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},escapeHtml:String,mpDur:ms=>String(ms/1000),mpNameOf:pid=>pid,
    runOwner:()=>saved.owner,mpMePid:()=>net.me.pid,readRunSave:()=>copy(saved),deckDef:noop,remapSpot:(_a,_b,n)=>n,refreshDirectionalDemand:noop,
    mpViewExit:noop,mpStartSum:noop,mpStopSum:noop,mpRenderRivals:noop,mpLayoutCards:noop,syncUI:noop,syncBattleUI:noop,stopPlaceDrag:noop,renderRunResume:noop,openMenu:noop,
    setSpeed:speed=>{context.S.speed=speed;},gotoMpRoom:noop,mpShowResult:noop,startAccountRun:()=>{throw Error('unexpected legacy branch');},
    toast:value=>calls.toast.push(value),showOverlay:(title,body)=>calls.overlay.push({title,body}),SFX:{win:noop,lose:noop},
    persistRun:()=>{calls.persist++;return true;},removeRunSave:id=>{calls.remove.push(id);calls.order.push('remove');},
    mpLeave:()=>net.leave(),gotoLobby:()=>{context.S.phase='lobby';},mpStatus:value=>calls.toast.push(value),
    endInfinity:()=>{throw Error('ended server battle must settle directly, never report a new personal death');},
    COMMERCE:{
      startRun:(kind,options)=>{calls.start.push(copy({kind,options}));return start.promise;},
      resumeRun:ticket=>{calls.resume.push(ticket);return resume.promise;},
      queueRun:(ticket,payload)=>{calls.queue.push(copy({ticket,payload}));calls.order.push('queue');},
      finishRun:async(ticket,payload)=>{calls.finish.push(copy({ticket,payload}));calls.order.push('finish');return {profile:{},wallet:{free:33,paid:0,debt:0},shards:33,earnedShards:33,collectionRewards:{gold:710,packs:0},debtPaid:0,duplicate:false,battle:{activeSeconds:65}};},
      errorText:e=>e.message
    },
    RUNSAVE:{hydrate:p=>({slot:{},mode:'infinity',phase:'playing',inf:copy(p.inf),towers:[],projs:[],enemies:[],mapKey:'phone',lives:20,wave:3})},
    startInfinity:(kind,info,account)=>{calls.open.push(copy({kind,ticket:account?.ticket}));Object.assign(context.S,{mode:'infinity',phase:'playing',net:info,inf:{...copy(inf),runId:'new-run',accountTicket:account?.ticket},towers:[],projs:[],enemies:[],lives:20});}
  };
  context.window=context;vm.createContext(context);vm.runInContext(program,context,{filename:'actual-game-account-functions.js'});
  const message={mode,t0:room.game.t0,seed:room.game.seed,timing:room.game.timing,battle};
  function end() {
    const latest=copy(net.room.game.battle);latest.revision++;latest.kills=mode==='coop'?700:20;latest.seats[PID].activeSeconds=65;latest.seats[PID].kills=2;
    latest.result={at:170000,reason:mode==='coop'?'goal':'lives',winners:mode==='coop'?[PID,OTHER]:[PID],losers:mode==='coop'?[]:[OTHER]};
    net.room.game.battle=latest;net.room.phase='ended';net.state='ended';for(const p of net.room.players)p.status=latest.result.winners.includes(p.pid)?'cleared':'dead';
    context.mpOnEnd({battle:latest});return latest;
  }
  function leave(){net.leave();context.S.phase='lobby';context.S.net=null;}
  return {context,calls,start,resume,saved,snapshot,message,end,leave};
}
function assertSettled(f,mode,runId) {
  assert.equal(f.calls.open.length,1);assert.equal(f.calls.queue.length,1);assert.equal(f.calls.finish.length,1);
  assert.deepEqual(f.calls.finish[0],{ticket:TICKET,payload:{battle:{code:CODE,matchId:CODE+':100000:123',pid:PID,key:KEY}}});
  assert.deepEqual(f.calls.order,['queue','finish','remove']);assert.deepEqual(f.calls.remove,[runId]);
  assert.equal(f.context.S.phase,'over');assert.equal(f.context.S.inf.accountTicket,TICKET);assert.equal(f.context.S.inf.settledResult.shards,33);
  assert.equal(f.context.S.inf.settledResult.pending,false);assert.equal(f.context.S.inf.settledResult.activeSeconds,65);
  assert.equal(f.context.S.net.battle.result.reason,mode==='coop'?'goal':'lives');assert.equal(f.calls.persist,0,'a finished match never saves a new playing checkpoint');
}
for(const mode of ['duel','coop']) {
  test(mode+': peer ends during delayed start; latest result settles once with original ticket',async()=>{
    const f=fixture(mode),pending=f.context.mpOnStart(f.message);assert.equal(f.calls.start.length,1);assert.equal(f.calls.open.length,0);
    f.end();f.start.resolve({ticket:TICKET,snapshot:copy(f.snapshot)});assert.equal(await pending,true);await flush();assertSettled(f,mode,'new-run');
    assert.deepEqual(f.calls.start[0],{kind:mode,options:{battle:{code:CODE,matchId:CODE+':100000:123',pid:PID,key:KEY}}});cases.push({mode,case:'start/end',pass:true});
  });
  test(mode+': leave during delayed start; late response cannot reopen the board',async()=>{
    const f=fixture(mode),pending=f.context.mpOnStart(f.message);f.leave();f.start.resolve({ticket:TICKET,snapshot:copy(f.snapshot)});
    assert.equal(await pending,false);await flush();assert.equal(f.context.S.phase,'lobby');assert.equal(f.context.S.net,null);assert.deepEqual(f.calls.open,[]);assert.deepEqual(f.calls.queue,[]);assert.deepEqual(f.calls.finish,[]);cases.push({mode,case:'start/leave',pass:true});
  });
  test(mode+': peer ends during delayed restore; saved ticket and latest result settle once',async()=>{
    const f=fixture(mode);f.context.MP.resumeRoom=f.context.DKNET.room;assert.equal(f.context.mpResumeAfterTitle(),true);assert.deepEqual(f.calls.resume,[TICKET]);
    f.end();f.resume.resolve({ticket:TICKET,snapshot:copy(f.snapshot)});await flush();await flush();assertSettled(f,mode,'saved-run');
    assert.equal(f.calls.transport,1);assert.equal(f.context.runResumeBusy,false);cases.push({mode,case:'restore/end',pass:true});
  });
  test(mode+': leave during delayed restore; wrapper ignores false and preserves checkpoint',async()=>{
    const f=fixture(mode);f.context.MP.resumeRoom=f.context.DKNET.room;assert.equal(f.context.mpResumeAfterTitle(),true);f.leave();
    f.resume.resolve({ticket:TICKET,snapshot:copy(f.snapshot)});await flush();await flush();assert.equal(f.context.S.phase,'lobby');assert.equal(f.context.S.net,null);
    assert.deepEqual(f.calls.open,[]);assert.deepEqual(f.calls.remove,[]);assert.deepEqual(f.calls.finish,[]);assert.equal(f.context.runResumeBusy,false);cases.push({mode,case:'restore/leave',pass:true});
  });
  test(mode+': versionless practice result records once without adding current rewards',async()=>{
    const f=fixture(mode),P=require('../../progression.js');
    delete f.context.DKNET.room.game.battle.rewardVersion;delete f.context.DKNET.room.game.battle.ruleVersion;delete f.context.DKNET.room.game.battle.rules;
    const info=f.context.mpRunInfo(f.message);f.context.startInfinity(mode,info,null);f.context.S.inf.accountTicket=null;
    f.context.PROGRESSION=P;f.context.SAVE={progression:P.defaultProfile()};f.context.SAVE_KEY='test-guest-save';
    const before=copy(f.context.SAVE.progression),stored=[];f.context.localStorage={setItem:(key,value)=>stored.push({key,value:JSON.parse(value)})};
    const latest=f.end();await flush();
    assert.equal(f.context.S.phase,'over');assert.equal(stored.length,1);assert.equal(f.calls.queue.length,0);assert.equal(f.calls.finish.length,0);
    assert.equal(f.context.S.inf.settledResult.shards,0);assert.equal(f.context.S.inf.settledResult.collectionRewards.gold,0);
    assert.equal(f.context.SAVE.progression.shards,before.shards);assert.deepEqual(f.context.SAVE.progression.collection,before.collection);
    assert.equal(f.context.SAVE.progression.records[mode].runs.length,1);assert.equal(f.context.SAVE.progression.records[mode].clears,1);
    assert.ok(f.calls.overlay.at(-1).body.includes('이전 시범전'));f.context.battleFinish({battle:latest});assert.equal(stored.length,1);
    cases.push({mode,case:'legacy/no-rewards',pass:true});
  });
}
test.after(()=>{
  const report={pass:cases.length===10,scope:'Actual game functions in VM; deferred COMMERCE API, rendering and board construction doubles. Legacy practice uses real progression settlement. Server trust and payments are covered separately by workerd.',gameSha256:createHash('sha256').update(source).digest('hex'),functions:names,cases,externalRequests:0};
  const dir=path.join(repo,'gen/e2e/battle-account');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
});
