// Paired-seed multiplayer balance pilot. Actual browser combat and WebSocket
// outcomes; progression/ownership are fixture conditions, battle resources are not.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const {launchBrowser}=require('./browser.cjs');
const repo=path.resolve(__dirname,'../..'),arg=(key,fallback)=>process.argv.find(s=>s.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:8137/',testPort=Number(arg('test-port','0')),net=testPort?'ws://127.0.0.1:'+testPort:process.env.NET||'ws://127.0.0.1:8796';
const out=path.resolve(arg('out',process.env.E2E_OUTPUT_DIR||'gen/e2e/battle-matrix-v115'));
const suite=arg('suite','coop'),seeds=arg('seeds',process.env.SEEDS||'110003,220009,330017').split(',').map(Number);
const tiers=arg('tiers','free,mid,max').split(','),chunkSeconds=Number(arg('chunk','2')),cap=Number(arg('cap','900'));
const ref=arg('ref',''),readSource=f=>ref?cp.execFileSync('git',['show',ref+':'+f],{cwd:repo,encoding:'utf8',maxBuffer:20*1024*1024}):fs.readFileSync(path.join(repo,f),'utf8');
const sourceFiles=(ref?cp.execFileSync('git',['ls-tree','--name-only',ref],{cwd:repo,encoding:'utf8'}).trim().split(/\r?\n/):fs.readdirSync(repo)).filter(f=>/\.(js|css|html)$/.test(f));
const sources=Object.fromEntries(sourceFiles.map(f=>[f,readSource(f)]));
// Preserve browser localhost origin metadata by loading HTML normally. Pin the
// handshake version separately so a simultaneous UI rebuild cannot split peers.
const handshakeVersion=arg('version',/net\.js\?v=([^"&]+)/.exec(sources['index.html'])?.[1]||'115');
sources['net.js']=sources['net.js'].replace('ver: scriptVer(),','ver: '+JSON.stringify(handshakeVersion)+',');
const shared=sources['battle-rules.js'],baseRule=(key,fallback)=>shared?Number(new RegExp(key+':\\s*([0-9.]+)').exec(shared)?.[1]??fallback):fallback;
const baseNormalHp=baseRule('normalHp',.75),baseBossHp=baseRule('bossHp',.6);
const candidate={goal:Number(arg('goal',String(baseRule('goal',500)))),normalHp:Number(arg('normal-hp',String(baseNormalHp))),bossHp:Number(arg('boss-hp',String(baseBossHp)))};
if(shared){for(const [key,value]of Object.entries(candidate))sources['battle-rules.js']=sources['battle-rules.js'].replace(new RegExp(key+':\\s*[0-9.]+'),key+': '+value);}
else if(candidate.normalHp!==baseNormalHp||candidate.bossHp!==baseBossHp){const anchor='isBoss ? .6 : .75';assert.equal(sources['game.js'].split(anchor).length,2,'HP overrides require the v115 base');sources['game.js']=sources['game.js'].replace(anchor,'isBoss ? '+candidate.bossHp+' : '+candidate.normalHp);}
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const hashes=Object.fromEntries(sourceFiles.concat(['net/src/battle-core.js','net/src/room-core.js','net/src/timing.js']).map(f=>[f,sha(sources[f]??readSource(f))]));
const cases=[
  {id:'starter',mode:'coop',layout:'phone',decks:[[1,2,3,4,5],[1,2,3,4,5]]},
  {id:'starter-rebate',mode:'coop',layout:'phone',decks:[[1,2,3,4,16],[1,2,3,4,16]]},
  {id:'pc-top',mode:'coop',layout:'desktop',decks:[[2,5,13,14,19],[2,5,13,14,19]]},
  {id:'phone-top',mode:'coop',layout:'phone',decks:[[2,4,5,8,20],[2,4,5,8,20]]},
  {id:'attack-support',mode:'coop',layout:'phone',decks:[[2,4,5,8,20],[4,6,8,13,16]]},
  {id:'attack-economy',mode:'coop',layout:'phone',decks:[[2,4,5,8,20],[2,4,6,13,16]]},
  {id:'duel-top',mode:'duel',layout:'phone',decks:[[2,5,13,14,19],[2,4,5,8,20]]},
  {id:'duel-starter',mode:'duel',layout:'phone',decks:[[1,2,3,4,16],[2,4,5,8,20]]},
];
const picks=arg('cases','').split(',').filter(Boolean),selected=cases.filter(c=>c.mode===suite&&(!picks.length||picks.includes(c.id)));
assert.ok(selected.length&&seeds.every(Number.isSafeInteger)&&tiers.every(t=>['free','mid','max'].includes(t)));
assert.ok(chunkSeconds>0&&chunkSeconds<=5&&Number.isInteger(chunkSeconds*30));
const jobs=arg('plan','')==='final'?[['starter','free',330017],['starter','free',440023],['attack-economy','free',330017],['starter','mid',330017],['phone-top','max',330017]].map(([id,tier,seed])=>({...cases.find(c=>c.id===id),tier,seed})):tiers.flatMap(tier=>selected.flatMap(c=>seeds.map(seed=>({...c,tier,seed}))));
function chunk(seconds){
  const q=__matrixQA,D=DKDECKRULES,bot=__matrixBot,clock=DKNET.serverNow;
  const empty=()=>q.spots().findIndex((_,i)=>!q.towerAt(i));
  const sell=id=>{const b=document.getElementById(id);b.disabled=false;b.click();bot.sold++;};
  const act=()=>{
    DK.paused=false;if(DKsupporter.use())bot.personalSupport++;DK.paused=true;
    if(DKSLOT.active&&!DK.heldDie)q.finishSlot();
    if(DK.heldDie){const spot=empty();if(spot>=0)DKplace(spot);else{const t=DK.towers.find(t=>D.canMerge({face:DK.heldDie,pips:1},t));if(t)DKplace(t.spot);else sell('held-sell');}}
    if(DK.towers.length>=10){
      for(const a of DK.towers.slice())if(a.face===13){const b=DK.towers.find(b=>D.canCopy(a,b)&&['주력','광역'].includes(D.get(b.face).role));if(b&&DKdeckMerge(a,b))bot.copies++;}
      const priorities=bot.deck.slice().sort((a,b)=>Number(['지원','제어','경제'].includes(D.get(a).role))-Number(['지원','제어','경제'].includes(D.get(b).role)));
      for(const id of priorities)if(DK.gold>=D.powerCost(DK.inf.deckPower[id])+q.chestCost()*1.5&&DKupgrade(id))bot.powerUps++;
    }
    if(empty()<0&&!DK.heldDie){const pairs=[];for(const a of DK.towers)for(const b of DK.towers)if(a.spot<b.spot&&D.canMerge(a,b)&&a.face!==14)pairs.push([a,b]);pairs.sort((a,b)=>a[0].pips-b[0].pips);if(pairs.length&&DKdeckMerge(...pairs[0]))bot.merges++;else if(DK.gold>q.chestCost()*2){const t=DK.towers.filter(t=>t.face!==14).sort((a,b)=>a.pips-b.pips)[0];if(t){DK.selTower=t;sell('sell-btn');}}}
    let guard=0;while(empty()>=0&&!DK.heldDie&&!DKSLOT.active&&DK.gold>=q.chestCost()&&guard++<15){if(!DKchest())break;q.finishSlot();DKplace(empty());}
    if(DK.heldDie)bot.stuck++;
  };
  window.__matrixActive=true;DKNET.serverNow=()=>DK.net.t0+bot.ticks/30*1000;
  try{
    for(let i=0;i<seconds*30&&DK.phase==='playing';i++){
      if(bot.ticks%15===0)act();DK.paused=false;q.update(1/30);DK.paused=true;bot.ticks++;
      if(bot.ticks%30===0){bot.maxField=Math.max(bot.maxField,DK.enemies.length);bot.highestPips=Math.max(bot.highestPips,...DK.towers.map(t=>t.pips));
        for(const e of DK.enemies)if(e.isBoss)bot.bossWaves[e.wave]=true;
      }
    }
    if(DK.phase==='playing')q.persistRun();
  }finally{DK.paused=true;DKNET.serverNow=clock;window.__matrixActive=false;}
  return {seconds:bot.ticks/30,phase:DK.phase,kills:DK.inf.kills,field:DK.enemies.length,liveBosses:DK.enemies.filter(e=>e.isBoss).length,bossRound:DK.inf.battleBossRound,
    hp:DK.lives,round:DK.wave,sp:DK.gold,pips:DK.towers.reduce((n,t)=>n+t.pips,0),outbox:DKNET.battleExport().outbox.length};
}
const average=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
function summarize(rows){
  return Object.fromEntries([...new Set(rows.map(r=>r.case+'/'+r.tier))].map(key=>{const rr=rows.filter(r=>r.case+'/'+r.tier===key),wins=rr.filter(r=>r.cleared).length,n=rr.length,p=wins/n,z=1.96,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
    const outcome=rr[0].mode==='duel'?{winsBySeat:[0,1].map(i=>rr.filter(r=>r.winnerSeats.includes(i)).length)}:{clears:wins,clearRate:100*p,ci95:[100*Math.max(0,c-h),100*Math.min(1,c+h)]};
    return[key,{pairedSeeds:n,...outcome,meanSeconds:average(rr.map(r=>r.seconds)),hp:rr.map(r=>r.hp),meanWallSeconds:average(rr.map(r=>r.wallSeconds)),results:rr.map(r=>({seed:r.seed,reason:r.result?.reason||'cap',winnerSeats:r.winnerSeats,seconds:r.seconds,hp:r.hp}))}];}));
}
async function main(){
  fs.mkdirSync(out,{recursive:true});const file=path.join(out,'report.json'),old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
  if(old){for(const f of ['game.js','deck-rules.js','tree-rules.js','progression.js','run-save.js','content.js','net.js'])assert.equal(old.hashes[f],hashes[f],'Use a new output directory after changing browser combat rules: '+f);assert.equal(old.chunkSeconds,chunkSeconds);}
  const sourceOut=path.join(out,'browser-source');fs.mkdirSync(sourceOut,{recursive:true});for(const [f,s]of Object.entries(sources))fs.writeFileSync(path.join(sourceOut,f),s);
  const report=old||{pass:false,started:new Date().toISOString(),hashes,ref,candidate,net,chunkSeconds,cap,rows:[],errors:[],
    policy:'Paired-seed pilot, not player win-rate. Actual two-browser combat and server outcomes. Same seed and seed+7919 across decks; first empty slot, low-pip merges, retain growth, first eligible attacker copy, personal supply each cooldown, no spatial optimization, no injected battle SP/HP/pips. Free=mastery0/no talents/no awakening; mid=mastery2/talent/no awakening; max=mastery5/talent/awakening. Ownership is a fixture. No paid-only resources. Ally network supply is off because the accelerated client clock does not accelerate the server cooldown. Client fixed dt1/30; reports drain every '+chunkSeconds+' simulated seconds; asynchronous pressure is therefore quantized. Duel uses paired independent decks, but no population win-rate inference.'};
  const save=()=>{report.updated=new Date().toISOString();report.summary=summarize(report.rows);fs.writeFileSync(file,JSON.stringify(report,null,2));};
  report.pass=false;report.plannedJobs=jobs.length;report.latestBootstrapHashes=hashes;save();
  let testServer=null,serverLog=null;
  if(testPort){
    assert.ok(Number.isSafeInteger(testPort)&&testPort>=1024&&testPort<=65535);
    const serverRoot=path.join(out,'server');fs.mkdirSync(serverRoot,{recursive:true});
    const files=(ref?cp.execFileSync('git',['ls-tree','-r','--name-only',ref,'net/src'],{cwd:repo,encoding:'utf8'}).trim().split(/\r?\n/):fs.readdirSync(path.join(repo,'net/src')).filter(f=>f.endsWith('.js')).map(f=>'net/src/'+f)).concat(['net/test/dev-server.mjs'],shared?['battle-rules.js']:[]);
    for(const file of files){let body=file==='battle-rules.js'?sources[file]:readSource(file);if(file==='net/src/battle-core.js'&&!shared&&candidate.goal!==500){assert.equal(body.split('goal:500').length,2,'Goal override requires v115 server rules');body=body.replace('goal:500','goal:'+candidate.goal);}const target=path.join(serverRoot,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);}
    report.testServerHashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(serverRoot,f)))]));
    fs.writeFileSync(path.join(serverRoot,'net/package.json'),'{"type":"module"}');serverLog=fs.openSync(path.join(out,'server.log'),'a');
    testServer=cp.spawn(process.execPath,[path.join(serverRoot,'net/test/dev-server.mjs')],{cwd:serverRoot,env:{...process.env,PORT:String(testPort),TIMING:'fast'},stdio:['ignore',serverLog,serverLog],windowsHide:true});
    await new Promise((resolve,reject)=>{let tries=0;const probe=async()=>{if(testServer.exitCode!==null)return reject(Error('Test server exited'));try{const r=await fetch('http://127.0.0.1:'+testPort+'/health');if(r.ok)return resolve();}catch(_){}if(++tries>=50)return reject(Error('Test server did not start'));setTimeout(probe,100);};probe();});
  }
  const browser=await launchBrowser();
  async function open(job,index){
    const viewport=job.layout==='phone'?{width:390,height:844}:{width:1240,height:860};
    const context=await browser.newContext({viewport}),page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');let state=1;const original=Math.random;window.__matrixSeed=seed=>state=seed>>>0;Math.random=()=>{if(!window.__matrixActive)return original();state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};});
    await page.route('**/*',async route=>{const name=new URL(route.request().url()).pathname.split('/').pop();if(!(name in sources)||name==='index.html')return route.continue();let body=sources[name];
      if(name==='game.js'){body=body.replace('window.DK = S;','window.__matrixQA={update,finishSlot,chestCost,towerAt,persistRun,spots:()=>SPOTS};window.DK = S;');for(const fn of ['syncUI','syncSupporter','syncWaveBtn'])body=body.replace('function '+fn+'() {','function '+fn+'() { if(window.__matrixActive)return;');}
      await route.fulfill({status:200,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html',body});});
    await page.goto(new URL('index.html?net='+encodeURIComponent(net),base).href);await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});await page.click('#ov-btn');
    await page.evaluate(({deck,seed,tier})=>{const p=DKPROGRESSION.defaultProfile();for(const id of deck){p.levels[id]=1;Object.assign(p.collection.cards[id],{owned:true,class:DKDECKRULES.get(id).baseClass});p.tree.mastery[id]=tier==='max'?5:tier==='mid'?2:0;p.tree.talents[id]=tier==='free'?null:['income','growth','haste','amplify','resonance'].includes(DKDECKRULES.get(id).stats.ability)?'insight':'force';p.tree.awakenings[id]=tier==='max';}
      if(!DKPROGRESSION.setPreset(p,0,deck).ok)throw Error('invalid deck fixture');p.tree.supporter='supply';DKSAVE.progression=p;DK.muted=true;__matrixSeed(seed);
      window.__matrixBot={deck,ticks:0,merges:0,copies:0,powerUps:0,sold:0,stuck:0,maxField:0,highestPips:0,personalSupport:0,bossWaves:{}};DKlobbyView('multi');
    },{deck:job.decks[index],seed:job.seed+index*7919,tier:job.tier});
    await page.selectOption('#mp-mode',job.mode);await page.fill('#mp-name','검증'+index);return{context,page};
  }
  try{
    for(const job of jobs){if(report.rows.some(r=>r.case===job.id&&r.tier===job.tier&&r.seed===job.seed))continue;
      const started=Date.now(),envs=[];
      try{
        for(let i=0;i<2;i++)envs.push(await open(job,i));const pages=envs.map(x=>x.page),[a,b]=pages;
        await a.click('#mp-create');await a.waitForFunction(()=>DK.phase==='mpRoom');const code=await a.evaluate(()=>DKNET.code);
        await b.click('#mp-join');await b.fill('#mp-code',code);await b.click('#mp-join-go');await a.waitForFunction(()=>DKNET.members().length===2);await a.click('#mp-start');
        await Promise.all(pages.map(p=>p.waitForFunction(mode=>DK.phase==='playing'&&DK.net?.mode===mode,job.mode)));
        await Promise.all(pages.map(p=>p.evaluate(()=>DK.paused=true)));await a.waitForFunction(()=>DKNET.serverNow()>=DK.net.t0,null,{timeout:30000});
        const setups=await Promise.all(pages.map(p=>p.evaluate(()=>({map:DK.mapKey,pid:DK.net.pid,gold:DK.gold,startGold:DKCONTENT.INFINITY.startGold,snapshot:DK.inf.growthSnapshot,ticket:DK.inf.accountTicket,serverRules:{goal:DK.net.battle.goal,lives:DK.net.battle.teamLives,bossEveryMs:DK.net.battle.bossEveryMs}}))));
        for(let i=0;i<2;i++){assert.deepEqual(setups[i].snapshot.deck,job.decks[i]);assert.equal(setups[i].gold,setups[i].startGold);assert.equal(setups[i].ticket,null);assert.equal(setups[i].map,job.layout==='phone'?'cInfP':'cInfL');if(job.mode==='coop')assert.equal(setups[i].serverRules.goal,candidate.goal);}
        const samples=[];
        for(let step=0;step<Math.ceil(cap/chunkSeconds);step++){
          const states=await Promise.all(pages.map(p=>p.evaluate(chunk,chunkSeconds)));
          await Promise.all(pages.map(p=>p.waitForFunction(()=>DK.phase==='over'||DKNET.battleExport().outbox.length===0,null,{timeout:20000})));
          const live=await a.evaluate(()=>({phase:DK.phase,battle:DK.net.battle}));
          if(step%Math.max(1,Math.round(30/chunkSeconds))===0||live.phase==='over')samples.push({seconds:states[0].seconds,teamKills:live.battle.kills,teamHP:live.battle.teamLives,states});
          if(live.phase==='over')break;
        }
        const players=await Promise.all(pages.map(p=>p.evaluate(()=>({phase:DK.phase,...__matrixBot,map:DK.mapKey,pid:DK.net.pid,seconds:__matrixBot.ticks/30,kills:DK.inf.kills,hp:DK.lives,
          bossRound:DK.inf.battleBossRound,result:DK.net.battle.result,teamKills:DK.net.battle.kills,sp:DK.gold,draws:DK.inf.chests,shards:DKSAVE.progression.shards,
          board:DK.towers.map(t=>({face:t.face,pips:t.pips,spot:t.spot})),powers:DK.inf.deckPower}))));
        assert.ok(players.every(p=>Number.isSafeInteger(p.shards)&&p.shards>=0&&p.sp>=0));if(ref)assert.ok(players.every(p=>p.shards===0));const result=players[0].result;
        const row={case:job.id,mode:job.mode,layout:job.layout,tier:job.tier,decks:job.decks,seed:job.seed,playerSeeds:[job.seed,job.seed+7919],setups,cleared:players.every(r=>r.result?.reason==='goal'),
          result,winnerSeats:players.map((p,i)=>result?.winners.includes(p.pid)?i:null).filter(x=>x!==null),seconds:Math.max(...players.map(p=>p.seconds)),hp:players.map(p=>p.hp),teamKills:players[0].teamKills,wallSeconds:(Date.now()-started)/1000,players,samples};
        report.rows.push(row);save();console.log('RESULT',job.id,job.tier,job.seed,result?.reason||'cap',row.seconds+'s','HP'+row.hp.join('/'),row.teamKills+'kills',row.wallSeconds+'s wall');
      }catch(error){const debug=await Promise.all(envs.map(e=>e.page.evaluate(()=>({phase:window.DK?.phase,netState:window.DKNET?.state,netCode:window.DKNET?.code,url:location.href,body:document.body.innerText.slice(-4000)})).catch(()=>null)));report.errors.push({job:job.id,tier:job.tier,seed:job.seed,error:error.stack,debug});save();throw error;}
      finally{await Promise.all(envs.map(e=>e.context.close()));}
    }
    assert.deepEqual(report.errors,[]);report.pass=true;save();
  }finally{save();await browser.close();if(testServer)testServer.kill();if(serverLog!==null)fs.closeSync(serverLog);}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={summarize,cases};
