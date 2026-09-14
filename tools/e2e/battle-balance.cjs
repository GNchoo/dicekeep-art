// Small cooperative playability smoke, separate from deck-ranking statistics.
// Two actual browser engines, identical policies, no injected combat resources.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launchBrowser}=require('./browser.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'gen/e2e/battle-balance');fs.mkdirSync(out,{recursive:true});
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:8137/',net=process.env.NET||'ws://127.0.0.1:8796';
const seeds=(process.env.SEEDS||'110003,220009,330017').split(',').map(Number);
const source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const hashes=Object.fromEntries(['game.js','deck-rules.js','tree-rules.js','progression.js','run-save.js','content.js','net.js','net/src/battle-core.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
function chunk(seconds) {
  const q=window.__balanceQA,D=DKDECKRULES,bot=window.__balanceBot,originalClock=DKNET.serverNow;
  const empty=()=>q.spots().findIndex((_,i)=>!q.towerAt(i));
  const sell=id=>{const b=document.getElementById(id);b.disabled=false;b.click();bot.sold++;};
  const handle=()=>{
    DK.paused=false;DKsupporter.use();DK.paused=true;
    if(DKSLOT.active&&!DK.heldDie)q.finishSlot();
    if(DK.heldDie){const spot=empty();if(spot>=0)DKplace(spot);else{const t=DK.towers.find(t=>D.canMerge({face:DK.heldDie,pips:1},t));if(t)DKplace(t.spot);else sell('held-sell');}}
    if(DK.towers.length>=10){
      for(const a of DK.towers.slice())if(a.face===13){const b=DK.towers.find(b=>D.canCopy(a,b)&&['주력','광역'].includes(D.get(b.face).role));if(b&&DKdeckMerge(a,b))bot.copies++;}
      const priorities=bot.deck.slice().sort((a,b)=>Number(['지원','제어','경제'].includes(D.get(a).role))-Number(['지원','제어','경제'].includes(D.get(b).role)));
      for(const id of priorities)if(DK.gold>=D.powerCost(DK.inf.deckPower[id])+q.chestCost()*1.5&&DKupgrade(id))bot.powers++;
    }
    if(empty()<0&&!DK.heldDie){const pairs=[];for(const a of DK.towers)for(const b of DK.towers)if(a.spot<b.spot&&D.canMerge(a,b)&&a.face!==14)pairs.push([a,b]);pairs.sort((a,b)=>a[0].pips-b[0].pips);if(pairs.length&&DKdeckMerge(...pairs[0]))bot.merges++;else if(DK.gold>q.chestCost()*2){const weak=DK.towers.filter(t=>t.face!==14).sort((a,b)=>a.pips-b.pips)[0];if(weak){DK.selTower=weak;sell('sell-btn');}}}
    let guard=0;while(empty()>=0&&!DK.heldDie&&!DKSLOT.active&&DK.gold>=q.chestCost()&&guard++<15){if(!DKchest())break;q.finishSlot();DKplace(empty());}
    if(DK.heldDie)bot.stuck++;
  };
  window.__balanceActive=true;
  DKNET.serverNow=()=>DK.net.t0+bot.ticks/30*1000;
  try {
    for(let i=0;i<seconds*30&&DK.phase==='playing';i++){
      if(bot.ticks%15===0)handle();
      DK.paused=false;q.update(1/30);DK.paused=true;bot.ticks++;
      if(bot.ticks%30===0){bot.maxField=Math.max(bot.maxField,DK.enemies.length);bot.highestPips=Math.max(bot.highestPips,...DK.towers.map(t=>t.pips));}
    }
    if(DK.phase==='playing')try{q.persistRun();}catch(error){return{error:error.message,seconds:bot.ticks/30,payload:window.__balanceBadSave};}
  }finally{DK.paused=true;DKNET.serverNow=originalClock;window.__balanceActive=false;}
  return {seconds:bot.ticks/30,phase:DK.phase,kills:DK.inf.kills,hp:DK.net.battle.teamLives,field:DK.enemies.length,outbox:DKNET.battleExport().outbox.length};
}
(async()=>{
  const browser=await launchBrowser(),errors=[],report={pass:false,hashes,net,seeds,rows:[],policy:'Playability smoke only; N='+seeds.length+' paired seeds per deck, two 390x844 phone boards, base classes/mastery0, personal supply supporter, no network ally supply, no injected SP/HP/damage. Fixed dt1/30 with identical deck-ranking bot actions every0.5s, real server reports drained after each5 simulated seconds. Independent player RNG seeds seed and seed+7919; clock acceleration is test-only. This is not a clear-rate estimate or deck ranking.'};
  const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  async function open(deck,seed,index){
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.addInitScript(()=>{
      localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');
      let state=1;const original=Math.random;window.__balanceSeed=seed=>state=seed>>>0;
      Math.random=()=>{if(!window.__balanceActive)return original();state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
    });
    await page.route('**/game.js*',async route=>{
      let body=source.replace('window.DK = S;','window.__balanceQA={update,finishSlot,chestCost,towerAt,persistRun,spots:()=>SPOTS};window.DK = S;');
      for(const fn of ['syncUI','syncSupporter','syncWaveBtn'])body=body.replace('function '+fn+'() {','function '+fn+'() { if(window.__balanceActive)return;');
      await route.fulfill({status:200,contentType:'application/javascript',body});
    });
    await page.route('**/run-save.js*',async route=>{const response=await route.fetch();const body=(await response.text()).replace("if (!valid(p)) throw new Error('현재 전투 상태를 저장하지 못했습니다.');","if (!valid(p)) { window.__balanceBadSave=p; throw new Error('현재 전투 상태를 저장하지 못했습니다.'); }");await route.fulfill({response,body});});
    await page.goto(new URL('index.html?net='+encodeURIComponent(net),base).href);await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});await page.click('#ov-btn');
    await page.evaluate(({deck,seed})=>{
      const p=DKPROGRESSION.defaultProfile();for(const id of deck){p.levels[id]=1;Object.assign(p.collection.cards[id],{owned:true,class:DKDECKRULES.get(id).baseClass});}
      if(!DKPROGRESSION.setPreset(p,0,deck).ok)throw Error('fixture deck invalid');
      p.tree.supporter='supply';DKSAVE.progression=p;DK.muted=true;__balanceSeed(seed);
      window.__balanceBot={deck,ticks:0,merges:0,copies:0,powers:0,sold:0,stuck:0,maxField:0,highestPips:0};
      DKlobbyView('multi');
    },{deck,seed:seed+index*7919});
    await page.selectOption('#mp-mode','coop');await page.fill('#mp-name','봇'+(index+1));return{page,context};
  }
  try{
    for(const [name,deck] of [['starter',[1,2,3,4,16]],['strong',[2,5,13,14,19]]])for(const seed of seeds){
      const started=Date.now(),envs=[];
      try{
        envs.push(await open(deck,seed,0));envs.push(await open(deck,seed,1));const pages=envs.map(e=>e.page),[a,b]=pages;
        await a.click('#mp-create');await a.waitForFunction(()=>DK.phase==='mpRoom');const code=await a.evaluate(()=>DKNET.code);
        await b.click('#mp-join');await b.fill('#mp-code',code);await b.click('#mp-join-go');await a.waitForFunction(()=>DKNET.members().length===2);await a.click('#mp-start');
        await Promise.all(pages.map(async p=>{await p.waitForFunction(()=>DK.phase==='playing'&&DK.net?.mode==='coop');await p.evaluate(()=>{DK.paused=true;});}));
        await a.waitForFunction(()=>DKNET.serverNow()>=DK.net.t0,null,{timeout:30000});
        for(const p of pages){const setup=await p.evaluate(()=>({map:DK.mapKey,deck:DK.inf.growthSnapshot.deck,mastery:Object.values(DK.inf.growthSnapshot.mastery),supporter:DK.inf.growthSnapshot.supporter,gold:DK.gold,startGold:DKCONTENT.INFINITY.startGold,ticket:DK.inf.accountTicket}));assert.equal(setup.map,'cInfP');assert.deepEqual(setup.deck,deck);assert.ok(setup.mastery.every(x=>x===0));assert.equal(setup.supporter,'supply');assert.equal(setup.gold,setup.startGold);assert.equal(setup.ticket,null);}
        let samples=[];
        for(let step=0;step<180;step++){
          const states=await Promise.all(pages.map(p=>p.evaluate(chunk,5)));
          for(let i=0;i<states.length;i++)if(states[i].error){fs.writeFileSync(path.join(out,'invalid-checkpoint-'+name+'-'+seed+'-player'+i+'.json'),JSON.stringify(states[i],null,2));throw Error(states[i].error+' at '+states[i].seconds+'s, player'+i);}
          await Promise.all(pages.map(p=>p.waitForFunction(()=>DK.phase==='over'||DKNET.battleExport().outbox.length===0,null,{timeout:15000})));
          const live=await a.evaluate(()=>({phase:DK.phase,battle:DK.net.battle}));
          if(step%6===0||live.phase==='over'){samples.push({seconds:states[0].seconds,kills:live.battle.kills,hp:live.battle.teamLives,fields:states.map(x=>x.field)});console.log(name,seed,states[0].seconds+'s',live.battle.kills+'kills','HP'+live.battle.teamLives);}
          if(live.phase==='over')break;
        }
        const result=await Promise.all(pages.map(p=>p.evaluate(()=>({phase:DK.phase,...__balanceBot,map:DK.mapKey,seconds:__balanceBot.ticks/30,kills:DK.inf.kills,hp:DK.net.battle.teamLives,result:DK.net.battle.result,teamKills:DK.net.battle.kills,
          gold:Math.round(DK.gold),draws:DK.inf.chests,supporterUses:DK.inf.supporterUses,shards:DKSAVE.progression.shards,board:DK.towers.map(t=>({face:t.face,pips:t.pips,spot:t.spot})),powers:DK.inf.deckPower}))));
        assert.ok(result.every(r=>r.shards===0&&r.gold>=0));
        const row={name,deck,seed,playerSeeds:[seed,seed+7919],cleared:result.every(r=>r.result?.reason==='goal'),result:result[0].result,seconds:Math.max(...result.map(r=>r.seconds)),teamKills:result[0].teamKills,hp:result[0].hp,wallSeconds:(Date.now()-started)/1000,players:result,samples};
        report.rows.push(row);save();console.log('RESULT',name,seed,row.cleared?'CLEAR':row.result?.reason||'simulation-cap',row.seconds+'s',row.teamKills+'kills','HP'+row.hp);
      }finally{await Promise.all(envs.map(e=>e.context.close()));}
    }
    assert.deepEqual(errors,[]);report.pass=true;report.summary=Object.fromEntries(['starter','strong'].map(name=>{const rows=report.rows.filter(r=>r.name===name);return[name,{pairedSeeds:rows.length,clears:rows.filter(r=>r.cleared).length,seconds:rows.map(r=>r.seconds),remainingHP:rows.map(r=>r.hp),teamKills:rows.map(r=>r.teamKills)}];}));
  }finally{report.errors=errors;save();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
