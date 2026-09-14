const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchBrowser,gameUrl}=require('./browser.cjs');
const out=path.resolve('gen/e2e/tree-combat');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await launchBrowser(),report={pass:false,cases:[]};
 try {
  for(const [name,viewport] of [['desktop',{width:1240,height:860}],['phone',{width:440,height:956}]]) {
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
   await page.route('**/game.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('window.DK = S;','window.__treeQA={persistRun,readRunSave,restoreRunSave,buildInfinityWave,relayoutArena,towerFire,openInfHelp,syncSupporter}; window.DK = S;')});});
   try {
    await page.goto(gameUrl(false));await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});await page.click('#ov-btn');
    const result=await page.evaluate(async()=>{
     const checks=[],check=(ok,msg)=>{if(!ok)throw Error(msg);checks.push(msg);};
     const setRun=(deck,supporter='supply',awake=true)=>{
      const p=DKPROGRESSION.defaultProfile();for(const id of deck){p.levels[id]=1;Object.assign(p.collection.cards[id],{owned:true,class:DKDECKRULES.get(id).baseClass});p.tree.mastery[id]=3;p.tree.awakenings[id]=awake;}
      p.tree.supporter=supporter;p.deck=deck;DKSAVE.progression=p;DKstartInf('build');DK.paused=true;DK.muted=true;DKSLOT.active=false;DK.heldDie=0;
      DK.wave=1;DK.waveActive=true;DK.waveT=1;DK.spawnQ=[];
     };
     const put=(face,pips,spot)=>{DK.heldDie=face;if(!DKplace(spot))throw Error('placement '+face);const t=DK.towers.find(t=>t.spot===spot);t.pips=pips;return t;};
     const enemy=(boss=false)=>{DKspawnEnemy({type:'mite',wave:1});const e=DK.enemies.at(-1);e.hp=e.max=100000;e.armor=0;e.isBoss=boss;return e;};
     setRun([1,4,7,13,14]);check(DK.inf.growthSnapshot.treeVersion===1,'new run freezes tree snapshot');
     let t=put(1,7,0),base=DKtowerDamage(t);DKSAVE.progression.tree.mastery[1]=5;check(DKtowerDamage(t)===base,'live account upgrades cannot alter current battle');
     check(DKsupporter.state().reason==='일시정지 중'&&!DKsupporter.use(),'paused supporter rejected');
     DK.paused=false;let gold=DK.gold;check(DKsupporter.use()&&DK.gold-gold===87,'supply grants base plus field pips');check(!DKsupporter.use(),'supply cannot repeat before cooldown');
     DKsupporter.tick(10);check(DK.inf.supporterCooldown===35,'cooldown counts combat seconds');DK.paused=true;DKsupporter.tick(10);check(DK.inf.supporterCooldown===35,'paused cooldown frozen');DK.paused=false;DK.waveActive=false;DKsupporter.tick(10);check(DK.inf.supporterCooldown===35,'between-wave cooldown frozen');DK.waveActive=true;
     DK.paused=true;DK.towers=[];let copy=put(13,7,0),target=put(1,7,1),rate=DKtowerRate(target);check(DKdeckMerge(copy,target)&&copy.copyHaste&&DKtowerRate(copy)<rate,'awakened7pip copy permanently hastens copied tower');
     DK.inf.supporterCooldown=12.5;DK.inf.supporterUses=2;copy.abilityT=3.2;
     __treeQA.persistRun();let saved=__treeQA.readRunSave(false);check(!!saved,'tree checkpoint saved');await __treeQA.restoreRunSave(saved,null);DK.paused=true;
     check(DK.inf.supporterCooldown===12.5&&DK.inf.supporterUses===2&&DK.towers.some(t=>t.copyHaste),'restore preserves supporter cooldown and perfect-copy buff');
     check(Object.isFrozen(DK.inf.growthSnapshot.mastery)&&Object.isFrozen(DK.inf.growthSnapshot.awakenings),'restored tree snapshot frozen');
     for(const [field,value] of [['supporterCooldown',-1],['supporterCooldown',46],['supporterUses',-1]]){const bad=structuredClone(saved);bad.inf[field]=value;check(!DKRUNSAVE.valid(bad),'invalid saved '+field+' '+value+' rejected');}
     const bad=structuredClone(saved);bad.towers[0].copyHaste='yes';check(!DKRUNSAVE.valid(bad),'invalid saved copy buff rejected');
     setRun([1,6,14,15,16]);t=put(6,7,0);gold=DK.gold;DKdeckTick(8);check(DK.gold-gold===65,'awakened income produces65SP every8sec');
     DK.towers=[];t=put(14,7,0);gold=DK.gold;DKdeckTick(12);check(t.face===14&&t.pips===7&&DK.gold-gold===70,'worldtree produces70SP and never grows eighth pip');
     DK.towers=[];t=put(16,7,0);gold=DK.gold;DKdeckTick(15);check(DK.gold-gold===90,'awakened sacrifice produces90SP every15sec');
     DK.towers=[];t=put(15,7,0);DKdeckTick(20);check(DK.towers.length===2&&DK.towers[1].pips===1,'awakened summoner creates onepip unit');
     while(DK.towers.length<15)put(1,1,DK.towers.length);DKdeckTick(200);check(DK.towers.length===15&&t.abilityT===20,'full summoner waits without queue flood');DK.towers.pop();DKdeckTick(.1);check(DK.towers.length===15,'waiting summoner fills released slot');
     setRun([3,9,10,11,12]);const towers=[3,9,10,11,12].map((id,i)=>put(id,7,i));let e=enemy();e.armor=100;let hp=e.hp;DKdamage(e,100,towers[0]);check(hp-e.hp===100,'awakened arcane ignores armor');
     DKdamage(e,100,towers[1]);check(e.poisonT===5&&e.poisonDps>0,'awakened poison extends to5sec');e.armor=0;e.isBoss=true;hp=e.hp;DKdamage(e,100,towers[2]);check(hp-e.hp===250,'awakened hunter has150% bonus boss damage');
     e.isBoss=false;DKdamage(e,100,towers[3]);check(e.fractureT===5&&e.fracturePct===.8,'awakened fracture lowers armor80% for5sec');e.slowT=1;hp=e.hp;DKdamage(e,100,towers[4]);check(Math.abs(hp-e.hp-230)<1e-6,'awakened shatter has130% slow bonus');
     const strongPoison=e.poisonDps;e.poisonT=e.fractureT=.001;DKcombatStep(.002);towers[1].pips=towers[3].pips=1;
     DKdamage(e,100,towers[1]);DKdamage(e,100,towers[3]);check(Math.abs(e.poisonDps*2-strongPoison)<1e-6,'expired awakened poison does not boost later ordinary poison');check(e.fracturePct===.5&&e.fractureT===3,'expired awakened fracture does not boost later ordinary fracture');
     setRun([1,2,4,5,20]);t=put(20,7,0);e=enemy();const entry=DKLANES()[0].pts[0];t.x=entry[0];t.y=entry[1]+30;for(let n=0;n<3;n++){t.cd=0;__treeQA.towerFire(t,0);}check(DK.projs.length===3&&!DK.projs[0].splash&&!DK.projs[1].splash&&DK.projs[2].splash===100,'awakened pulse fires third shot explosion');
     setRun([1,2,4,5,20],'crusher');DK.paused=false;check(!DKsupporter.use()&&DK.inf.supporterCooldown===0,'crusher requires selection without consuming cooldown');t=put(20,7,0);DK.selTower=t;DKsync();
     const button=document.getElementById('supporter-use'),r=button.getBoundingClientRect();check(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===button,'selected tower info leaves crusher button visible and clickable');
     gold=DK.gold;check(DKsupporter.use()&&t.pips===1&&DK.inf.growthSnapshot.deck.includes(t.face)&&DK.gold-gold===280,'crusher replaces selected7pip with random1pip and280SP');
     setRun([1,2,4,5,20],'barrage');DK.paused=false;check(!DKsupporter.use()&&DK.inf.supporterCooldown===0,'empty barrage does not consume cooldown');put(1,7,0);e=enemy();let boss=enemy(true);hp=e.hp;let bossHP=boss.hp;check(DKsupporter.use(),'barrage activated');check(hp-e.hp===206&&bossHP-boss.hp===51.5,'barrage scales with totalpips and quarter boss damage');
     DKstartInf('clear');DK.paused=true;check(DKsupporter.state()===null&&!DKsupporter.use(),'pure mode has no supporter or tree');DKsync();check(document.querySelector('#supporter-panel').classList.contains('hidden'),'pure mode hides supporter HUD');
     setRun([1,4,7,13,14]);const current=DK.inf.growthSnapshot,{treeVersion,mastery,talents,awakenings,supporter,...legacy}=current;DK.inf.growthSnapshot=Object.freeze(legacy);t=put(1,7,0);check(!DKsupporter.state()&&!DKDECKRULES.awakened(t,legacy),'v111 frozen snapshot has no new powers');
     setRun([1,4,7,13,14],'crusher');[1,4,7,13,14].forEach((f,i)=>put(f,7,i));DK.selTower=DK.towers[3];DK.spawnQ=[{t:1000,type:'mite',wave:1}];DK.paused=false;DKsync();check(!document.querySelector('#supporter-panel').classList.contains('hidden'),'tree battle displays supporter HUD');
     return {checks};
    });
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,name+'.png')});report.cases.push({name,...result});console.log('PASS',name,result.checks.length,'tree combat checks');
   }finally{await context.close();}
  }report.pass=true;
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
