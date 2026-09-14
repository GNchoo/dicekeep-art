const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchBrowser,gameUrl}=require('./browser.cjs');
const out=path.resolve('gen/e2e/deck-combat'); fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await launchBrowser(), report={pass:false,cases:[]};
 try {
  for(const [name,viewport] of [['desktop',{width:1240,height:860}],['phone',{width:440,height:956}]]) {
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
   await page.route('**/game.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('window.DK = S;','window.__deckQA={finishSlot,persistRun,readRunSave,restoreRunSave,buildInfinityWave,mpSummary,relayoutArena,movePickStart,movePickTap,update,towerFire,settleInfRun,infResultHTML}; window.DK = S;')});});
   try {
    await page.goto(gameUrl(false));await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000}); await page.click('#ov-btn');
    const result=await page.evaluate(async()=>{
     const checks=[],check=(ok,msg)=>{if(!ok)throw Error(msg);checks.push(msg);};
     const setRun=(deck,mode='build')=>{
      const P=DKPROGRESSION.defaultProfile(); for(const id of deck){P.levels[id]=1;Object.assign(P.collection.cards[id],{owned:true,class:DKDECKRULES.get(id).baseClass});} P.deck=deck;
      DKSAVE.progression=P; DKstartInf(mode); DK.paused=true; DK.muted=true; DK.gold=20000; DKSLOT.active=false; DK.heldDie=0;
      // Continue testing the frozen v111 contract after new accounts adopt trees.
      const {treeVersion,mastery,talents,awakenings,supporter,...legacy}=DK.inf.growthSnapshot;DK.inf.growthSnapshot=Object.freeze(legacy);
     };
     const put=(face,pips,spot)=>{DK.heldDie=face;check(DKplace(spot),'place '+face);const t=DK.towers.find(t=>t.spot===spot);t.pips=pips;return t;};
     setRun([1,4,7,13,14]); check(DK.inf.growthSnapshot.deckSystem===1,'new snapshot selects deck combat');
     let start=DK.gold;DKchest();check(start-DK.gold===30 && DKSLOT.active,'first summon costs 30');__deckQA.finishSlot();check(DK.inf.growthSnapshot.deck.includes(DK.heldDie),'summon only comes from deck');DKplace(0);check(DK.towers[0].pips===1,'summon is one pip');
     DK.towers=[]; let a=put(1,3,0),b=put(1,3,1);check(DKdeckMerge(a,b),'board merge accepts same identity and pips');check(DK.towers.length===1&&b.pips===4&&DK.inf.growthSnapshot.deck.includes(b.face),'merge consumes two into random deck +1 pip');
     a=put(1,2,2); b=put(1,3,3);check(!DKdeckMerge(a,b),'unequal pips reject');a.pips=b.pips=7;check(!DKdeckMerge(a,b),'seven pip merge rejects');
     DK.towers=[];a=put(13,3,0);b=put(1,3,1);check(DKdeckMerge(a,b)&&a.face===1&&DK.towers.length===2&&b.pips===3,'copy transforms source and preserves target');
     a.pips=2; b.pips=2;__deckQA.movePickStart(a);__deckQA.movePickTap(b.spot);check(DK.towers.length===1&&DK.towers[0].pips===3,'move button performs board merge');
     DK.towers=[];a=put(14,2,0);DKdeckTick(27.9);check(a.pips===2,'growth waits full delay');DKdeckTick(.11);check(a.pips===3,'growth raises pip after delay');
     DK.towers=[];a=put(1,2,0);const dmg=DKtowerDamage(a),rate=DKtowerRate(a);b=put(7,3,1);check(DKtowerRate(a)<rate,'adjacent haste changes attack cadence');b.spot=DK.mapKey==='cInfP'?3:5;check(DKtowerRate(a)<rate,'vertical adjacency uses actual mobile or desktop columns');b.spot=DK.mapKey==='cInfP'?5:9;check(DKtowerRate(a)===rate,'nonadjacent support does not leak buff');b.spot=1;const gold=DK.gold;check(DKupgrade(1)&&DK.inf.deckPower[1]===2&&gold-DK.gold===100,'card-specific power costs 100');check(DK.inf.deckPower[7]===1&&DKtowerDamage(a)>dmg,'power only upgrades chosen identity');
     const locked=DKtowerDamage(a);DKSAVE.progression.collection.cards[1].class=20;check(DKtowerDamage(a)===locked,'account class changes do not alter frozen active run');
     DK.towers=[];for(let i=0;i<15;i++)put(1,1,i);start=DK.gold;check(DKchest()===null&&DK.gold===start,'full board rejects purchase without charging');
     DK.selTower=DK.towers[0];check(DKenhance()===null,'legacy ID strength upgrade unavailable in new mode');
     setRun([9,10,11,12,20]); const special=[9,10,11,12,20].map((f,i)=>put(f,1,i)); DKspawnEnemy({type:'mite',wave:1});let enemy=DK.enemies[0];enemy.hp=enemy.max=100000;enemy.armor=0;
     DKdamage(enemy,100,special[0]);check(enemy.poisonT===3&&enemy.poisonDps>0,'poison hit applies timed damage');
     enemy.isBoss=true;start=enemy.hp;DKdamage(enemy,100,special[1]);check(Math.abs(start-enemy.hp-180)<1e-9,'hunter deals 80 percent additional boss damage');enemy.isBoss=false;
     DKdamage(enemy,100,special[2]);check(enemy.fractureT===3,'fracture hit applies armor reduction');enemy.slowT=1;start=enemy.hp;DKdamage(enemy,100,special[3]);check(Math.abs(start-enemy.hp-165)<1e-9,'shatter only benefits slowed targets');
     const pulse=special[4],entry=DKLANES()[0].pts[0];pulse.x=entry[0];pulse.y=entry[1]+30;
     for(let shot=0;shot<4;shot++){pulse.cd=0;__deckQA.towerFire(pulse,0);}check(DK.projs.length===4&&DK.projs.slice(0,3).every(p=>!p.splash)&&DK.projs[3].splash===100,'pulse fourth shot creates area attack');
     setRun([1,6,15,16,20],'extreme');a=put(6,2,0);start=DK.gold;DKdeckTick(12);check(DK.gold-start===18,'income scales with pips');
     a=put(16,2,1);b=put(16,2,2);start=DK.gold;DKdeckMerge(a,b);check(DK.gold-start===90,'sacrifice merge returns pip-scaled SP');
     a=put(15,2,3);b=put(15,2,4);const n=DK.towers.length;DKdeckMerge(a,b);check(DK.towers.length===n,'summoner merge adds extra one-pip unit');
     DK.wave=100;DK.inf.doneW=99;DK.inf.kills=4;DK.waveActive=true;DK.waveT=10;
     DKspawnEnemy(__deckQA.buildInfinityWave(100)[0]);check(DK.enemies[0].max===DKDECKRULES.enemyStats(100,true,false,DK.enemies[0].bossCount,true).hp,'new boss curve applied at spawn');
     __deckQA.persistRun();const saved=__deckQA.readRunSave(false);check(!!saved,'new combat checkpoint saved');
     await __deckQA.restoreRunSave(saved,null);check(JSON.stringify(DK.towers.map(t=>[t.face,t.pips,t.abilityT]))===JSON.stringify(saved.board.map(i=>{const t=saved.towers[i];return[t.face,t.pips,t.abilityT]})),'pips and ability clocks survive restore');
     check(DK.towers.every(t=>t.def.name===DKDECKRULES.get(t.face).name),'restore resolves new card definitions');
     const bad=structuredClone(saved);bad.towers[0].pips=8;check(!DKRUNSAVE.valid(bad),'checkpoint rejects out of range pips');
     const settled=__deckQA.settleInfRun(false),html=__deckQA.infResultHTML(false,settled);check(settled.collectionRewards.gold>0&&!settled.collectionRewards.packs&&html.includes('연구 골드')&&html.includes('다이스 트리 / 덱'),'legacy run settles into deterministic research gold with tree entry guidance');
     DKstartInf('clear');DK.paused=true;check(!DK.inf.growthSnapshot.deckSystem,'pure mode has no deck rules');DK.heldDie=20;DKplace(0);check(!DK.towers[0].pips&&DK.towers[0].def===DKTD[20],'pure star20 uses unchanged legacy definition');
     // Keep a reviewable five-card battlefield on the final screenshot.
     setRun([1,4,7,13,14]);[1,4,7,13,14].forEach((f,i)=>put(f,i%4+1,i));DKsync();
     return {checks,savedPips:saved.towers.map(t=>t.pips)};
    });
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,name+'.png')});report.cases.push({name,...result});console.log('PASS',name,result.checks.length,'checks');
   }finally{await context.close();}
  }report.pass=true;
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
