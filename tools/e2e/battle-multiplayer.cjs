const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {launchBrowser} = require('./browser.cjs');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/battle-multiplayer');
fs.mkdirSync(out,{recursive:true});
const base=process.env.E2E_BASE_URL || 'http://127.0.0.1:8137/', net=process.env.NET || 'ws://127.0.0.1:8790';
(async()=>{
  const browser=await launchBrowser(), errors=[], report={checks:[],pass:false};
  async function pair(mode){
    const pages=[];
    for(let i=0;i<2;i++){
      const c=await browser.newContext({viewport:i?{width:390,height:844}:{width:1240,height:860}}),p=await c.newPage();pages.push(p);
      p.on('pageerror',e=>errors.push(e.message));
      p.on('console',m=>{if(m.type()==='warning' && m.text().startsWith('[net]'))errors.push(m.text());});
      await p.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
      await p.route('**/game.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('window.DK = S;','window.__battle={persistRun,readRunSave,update,spawnEnemy,damageEnemy,battleWaveItems,battleOnState,mpOnEnd,saveSave,createDeckTower,lanes:()=>LANES};window.DK = S;')});});
      await p.goto(new URL('index.html?net='+encodeURIComponent(net),base).href);
      await p.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});await p.click('#ov-btn');
      await p.evaluate(()=>DKlobbyView('multi'));await p.selectOption('#mp-mode',mode);await p.fill('#mp-name',mode+i);
    }
    const [a,b]=pages;await a.click('#mp-create');await a.waitForFunction(()=>DK.phase==='mpRoom');const code=await a.evaluate(()=>DKNET.code);
    await b.click('#mp-join');await b.fill('#mp-code',code);await b.click('#mp-join-go');
    await a.waitForFunction(()=>DKNET.members().length===2);assert.equal(await a.locator('#mp-count').textContent(),'2/2');
    await a.click('#mp-start');
    for(const p of pages){await p.waitForFunction(mode=>DK.phase==='playing'&&DK.net?.mode===mode,mode);await p.evaluate(()=>DK.paused=true);}
    await a.waitForFunction(()=>DKNET.serverNow()>=DK.net.t0,null,{timeout:30000});
    return pages;
  }
  try{
    let [a,b]=await pair('coop');
    assert.deepEqual(await a.evaluate(()=>({mode:DK.inf.growthSnapshot.mode,deck:DK.inf.growthSnapshot.deckSystem,ticket:DK.inf.accountTicket,stored:!!__battle.readRunSave(true)})),{mode:'coop',deck:1,ticket:null,stored:true});
    // Board fixtures isolate server participation accounting from combat outcome.
    // No clock warp: the room must observe a full minute via actual summaries.
    for (const p of [a,b]) await p.evaluate(()=>{for(let i=0;i<3;i++)DK.towers.push(__battle.createDeckTower(DK.inf.growthSnapshot.deck[i],1,i));__battle.persistRun();});
    await a.evaluate(()=>DKMP.speed(3));assert.equal(await a.evaluate(()=>DK.speed),1);
    const gold=await b.evaluate(()=>DK.gold);
    await b.evaluate(()=>{window.__lostBattleAck=DKNET.battleAck;DKNET.battleAck=()=>false;});
    await a.click('#battle-assist');await b.waitForFunction(gold=>DK.gold===gold+60,gold);
    assert.equal(await a.evaluate(()=>DK.net.battle.seats[DK.net.pid].assistReadyAt>DKNET.serverNow()),true);
    const applied=await b.evaluate(()=>({gold:DK.gold,wave:DK.wave,id:DK.inf.battleApplied.at(-1),run:DK.inf.runId,pid:DK.net.pid}));
    assert.ok(applied.id);assert.equal(await b.evaluate(()=>__battle.readRunSave(true).state.gold),applied.gold);
    await b.evaluate(()=>__battle.battleOnState(DK.net.battle));
    assert.equal(await b.evaluate(()=>DK.gold),applied.gold);
    report.checks.push('real two-client coop starts a saved deck match; x3 is blocked; free supply is server-approved once and checkpointed before ack');
    await b.reload();await b.waitForFunction(()=>window.DK?.phase==='title'&&DKNET.inRoom(),null,{timeout:120000});await b.click('#ov-btn');
    await b.waitForFunction(id=>DK.phase==='playing'&&DK.inf?.runId===id,applied.run,{timeout:20000});await b.evaluate(()=>DK.paused=true);
    const after=await b.evaluate(()=>({gold:DK.gold,wave:DK.wave}));
    let waveBonus=0;for(let i=Math.max(1,applied.wave);i<after.wave;i++)waveBonus+=20+i*3;
    assert.equal(after.gold,applied.gold+waveBonus,'an unacknowledged supply in the restored checkpoint is not granted twice');
    assert.equal(await b.evaluate(()=>DK.net.pid),applied.pid);
    report.checks.push('phone reload restores the same match/run and acknowledged supply without duplicate SP');
    await b.screenshot({path:path.join(out,'coop-phone.png')});
    const rewardAt=await b.evaluate(()=>DKNET.serverNow()+68000);
    await a.waitForFunction(at=>DKNET.serverNow()>=at,rewardAt,{timeout:85000});
    await b.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='DKSAVE'){Storage.prototype.setItem=original;throw Error('test storage full');}return original.call(this,key,value);};});
    const goal=await a.evaluate(()=>DK.net.battle.goal);
    await a.evaluate(goal=>{let remaining=goal;while(remaining){const count=Math.min(100,remaining);DKNET.battleReport('kill',{count});remaining-=count;}__battle.persistRun();},goal);
    for(const p of [a,b])await p.waitForFunction(()=>DK.phase==='over'&&DK.net.battle?.result,null,{timeout:20000});
    await b.waitForSelector('#battle-reward-retry');
    assert.equal(await b.evaluate(()=>DKSAVE.progression.shards),0);assert.ok(await b.evaluate(()=>__battle.readRunSave(true)));
    await b.click('#battle-reward-retry');
    report.checks.push('failed guest wallet write retains the checkpoint and unchanged balance; visible retry credits once');
    for(const p of [a,b]){
      const before=await p.evaluate(()=>({runs:DKSAVE.progression.records.coop.runs.length,wins:DKSAVE.progression.records.coop.clears,shards:DKSAVE.progression.shards,saved:__battle.readRunSave(true)}));
      assert.equal(before.runs,1);assert.equal(before.wins,1);assert.equal(before.saved,null);assert.ok(before.shards>=33,JSON.stringify(before));
      const expected=await p.evaluate(()=>{const b=DK.net.battle,seat=b.seats[DK.net.pid];return Math.floor(seat.activeSeconds*8/60)+5+20;});assert.equal(before.shards,expected);
      await p.evaluate(()=>__battle.mpOnEnd({battle:DK.net.battle}));assert.equal(await p.evaluate(()=>DKSAVE.progression.records.coop.runs.length),1);assert.equal(await p.evaluate(()=>DKSAVE.progression.shards),before.shards);
      assert.match(await p.locator('#ov-title').textContent(),/협동 성공/);
    }
    await a.screenshot({path:path.join(out,'coop-result.png')});
    assert.equal(await b.evaluate(()=>DK.net.battle.seats[DK.net.pid].kills),0);
    report.checks.push('real server observes over one minute of participation; zero-kill support seat receives the same per-second formula and victory/first-win bonuses; repeated end cannot credit twice');
    await b.click('#ov-btn');await b.evaluate(()=>DKlobbyView('single'));await b.click('#btn-deck-open');
    assert.match(await b.locator('#free-progress').innerText(),/기한·연속 출석·구매 조건이 없습니다/);await b.screenshot({path:path.join(out,'free-progress-phone.png')});
    await a.context().close();await b.context().close();
    [a,b]=await pair('duel');
    await a.evaluate(()=>{for(let i=0;i<5;i++){__battle.spawnEnemy(__battle.battleWaveItems(1)[0]);const e=DK.enemies.at(-1);__battle.damageEnemy(e,e.hp*100);}__battle.persistRun();});
    await b.waitForFunction(()=>DK.enemies.some(e=>e.transferred));
    assert.equal(await b.evaluate(()=>DK.enemies.filter(e=>e.transferred).length),1);
    await b.evaluate(()=>{const e=DK.enemies.find(e=>e.transferred);__battle.damageEnemy(e,e.hp*100);__battle.persistRun();});
    await a.waitForFunction(()=>Object.values(DK.net.battle.seats).some(s=>s.kills===1));
    assert.equal(await a.evaluate(()=>DK.enemies.filter(e=>e.transferred).length),0);
    report.checks.push('five real combat kills send one actual enemy to the opponent; killing a transferred enemy does not chain another transfer');
    await b.evaluate(()=>{__battle.spawnEnemy(__battle.battleWaveItems(1)[0]);const e=DK.enemies.at(-1);e.dist=__battle.lanes()[e.lane].len;__battle.update(.01);__battle.persistRun();});
    await a.waitForFunction(()=>Object.values(DK.net.battle.seats).some(s=>s.lives===19));
    report.checks.push('a normal enemy reaching the actual path end leaks instead of looping forever');
    await b.evaluate(()=>{const original=DKNET.serverNow;DKNET.serverNow=()=>DK.net.t0+90010;try{__battle.update(.01);}finally{DKNET.serverNow=original;}__battle.persistRun();});
    assert.equal(await b.evaluate(()=>DK.inf.battleBossRound),1);assert.equal(await b.evaluate(()=>DK.enemies.filter(e=>e.isBoss&&!e.dead).length),1);
    await b.evaluate(()=>{const e=DK.enemies.find(e=>e.isBoss&&!e.dead);e.battleDeadline=DKNET.serverNow()-1;__battle.update(.01);__battle.persistRun();});
    await a.waitForFunction(()=>Object.values(DK.net.battle.seats).some(s=>s.lives===14));
    report.checks.push('server clock drives the 90-second boss and expired boss deducts five lives without instant defeat');
    await b.evaluate(()=>{DKNET.battleReport('leak',{count:14,boss:false});__battle.persistRun();});
    for(const p of [a,b])await p.waitForFunction(()=>DK.phase==='over',null,{timeout:20000});
    assert.equal(await a.evaluate(()=>DKSAVE.progression.records.duel.clears),1);assert.equal(await b.evaluate(()=>DKSAVE.progression.records.duel.clears),0);
    await a.screenshot({path:path.join(out,'duel-result.png')});
    report.checks.push('opponent HP zero ends duel immediately with opposite authoritative outcomes and no 101-wave requirement');
    await a.context().close();await b.context().close();
    [a,b]=await pair('coop');
    await b.evaluate(()=>{DKNET.battleReport('leak',{count:4,boss:true});__battle.persistRun();});
    for(const p of [a,b])await p.waitForFunction(()=>DK.phase==='over',null,{timeout:20000});
    for(const p of [a,b])assert.equal(await p.evaluate(()=>DKSAVE.progression.records.coop.runs[0].won),false);
    report.checks.push('one player losing the shared twenty HP gives both players a coop loss');
    assert.deepEqual(errors,[]);report.pass=true;console.log('PASS battle multiplayer',report.checks);
  }finally{report.errors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
