const assert=require('node:assert/strict'),fs=require('node:fs');
const {launchBrowser,gameUrl}=require('./browser.cjs');
assert.ok(['localhost','127.0.0.1'].includes(new URL(gameUrl()).hostname));
(async()=>{
 const browser=await launchBrowser();
 try{for(const [width,height] of [[1240,860],[440,956]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
  await page.route('**/game.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('window.DK = S;','window.__gradeQA={persistRun,readRunSave,restoreRunSave,relayoutArena,chestCost,upgradeFace,syncInfo,mpSummary};window.DK = S;')});});
  await page.goto(gameUrl(false));await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});await page.click('#ov-btn');
  const checks=await page.evaluate(async()=>{
   const checks=[],check=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
   const fresh=(mode='build',supporter='supply')=>{const p=DKPROGRESSION.defaultProfile();p.tree.supporter=supporter;DKSAVE.progression=p;DKstartInf(mode);DK.paused=true;DK.muted=true;DKSLOT.active=false;DK.heldDie=0;DK.gold=100000;return p;};
   const put=(face,spot)=>{DK.heldDie=face;check(DKplace(spot),'place '+face);return DK.towers.find(t=>t.spot===spot);};
   const columns=()=>DK.mapKey==='cInfP'?3:5;
   fresh('clear');
   check(DK.inf.growthSnapshot.gradeSystem===1&&!DK.inf.growthSnapshot.deckSystem,'new pure run uses all grades');
   let last=0;
   for(let face=1;face<=20;face++){
    DK.towers=[];const t=put(face,0),dps=DKtowerDamage(t)/DKtowerRate(t),expected=DKDECKRULES.gradePreview([face],DK.inf.growthSnapshot).direct;
    check(Math.abs(dps-expected)<1e-8,'grade '+face+' actual DPS matches guide');
    check(dps>last,'grade '+face+' improves standalone damage');last=dps;
    check(!t.pips&&!t.deckSystem&&t.def===DKTD[face],'grade '+face+' keeps actual tower identity');
   }
   check(__gradeQA.chestCost()===160,'original chest cost retained');
   let rngCalls=0;check(DKPROGRESSION.draw(DK.inf.growthSnapshot,()=>{rngCalls++;return .99;})===null&&rngCalls===0,'grade snapshot never replaces original chest RNG');
   fresh();
   for(const type of ['class','level']){
    const p=DKPROGRESSION.defaultProfile();delete p.tree;
    if(type==='class')p.collection.cards[1].class=10;else{delete p.collection;p.levels[1]=20;}
    DKSAVE.progression=p;DKstartInf('build');DK.paused=true;DKSLOT.active=false;DK.gold=100000;
    const t=put(1,0),guide=DKDECKRULES.gradePreview([1],DK.inf.growthSnapshot).direct;
    check(Math.abs(DKtowerDamage(t)/DKtowerRate(t)-guide)<1e-8,type+' account bonus matches the grade guide');
   }
   fresh();
   for(const synergy of DKDECKRULES.gradeSynergyCatalog){
    DK.towers=[];const source=put(synergy.groups[0][0],0),target=put(synergy.groups[1][0],1);
    const guide=DKDECKRULES.gradePreview(DK.towers,DK.inf.growthSnapshot,columns()).board.find(t=>t.face===target.face);
    check(Math.abs(DKtowerDamage(target)/DKtowerRate(target)-guide.dps)<1e-8,synergy.name+' actual damage matches guide');
    const applied=DKDECKRULES.gradeSynergies(target,DK.towers,columns());check(applied.active.includes(synergy.id),synergy.name+' active');
    source.spot=14;const separate=DKtowerDamage(target)/DKtowerRate(target);check(!DKDECKRULES.gradeSynergies(target,DK.towers,columns()).active.includes(synergy.id),synergy.name+' stops when separated');
    source.spot=0;check(DKtowerDamage(target)/DKtowerRate(target)>=separate,synergy.name+' resumes after placement');
   }
   DK.towers=[];put(4,0);const cannon=put(2,1);
   DKspawnEnemy({type:'mite',wave:1});const e=DK.enemies.at(-1);e.hp=e.max=100000;e.armor=0;e.slowT=0;
   let hp=e.hp;DKdamage(e,100,cannon);check(hp-e.hp===100,'frost combo does not invent damage on an unslowed enemy');
   e.slowT=1;hp=e.hp;DKdamage(e,100,cannon);check(hp-e.hp===120,'frost combo adds actual damage after slow');
   DK.towers[0].spot=14;hp=e.hp;DKdamage(e,100,cannon);check(hp-e.hp===100,'slow bonus stops without adjacent frost');
   const p=DKPROGRESSION.defaultProfile();p.tree.mastery[5]=5;p.tree.talents[5]='force';p.tree.awakenings[5]=true;DKSAVE.progression=p;DKstartInf('build');DK.paused=true;DK.muted=true;DK.gold=100000;DKSLOT.active=false;
   const upgraded=put(5,0),before=DKtowerDamage(upgraded)/DKtowerRate(upgraded),carry=DKtowerDamage(upgraded)/DKTD[5].dmg;
   const random=Math.random;Math.random=()=>0;DK.selTower=upgraded;check(DKenhance()==='up','original probability enhancement remains available');Math.random=random;
   const expected=DKDECKRULES.gradePreview([{face:6,spot:0,lvl:1,growthCarry:carry}],DK.inf.growthSnapshot).direct;
   check(upgraded.face===6&&DKtowerDamage(upgraded)/DKtowerRate(upgraded)>before,'enhancement keeps investment and improves damage');
   check(Math.abs(DKtowerDamage(upgraded)/DKtowerRate(upgraded)-expected)<1e-8,'next-grade guide includes retained investment');
   fresh('build','crusher');const removed=put(20,0);DK.selTower=removed;DK.wave=1;DK.waveActive=true;DK.paused=false;const gold=DK.gold;
   check(DKsupporter.use()&&!DK.towers.includes(removed)&&DK.gold-gold===800,'grade crusher removes the selected tower and grants the stated refund');
   fresh('build','barrage');put(4,0);put(6,1);DK.wave=1;DK.waveActive=true;DK.inf.supporterCooldown=12.5;DK.inf.supporterUses=2;
   __gradeQA.persistRun();const saved=__gradeQA.readRunSave(false);check(saved?.inf.growthSnapshot.gradeSystem===1&&DKRUNSAVE.valid(saved),'new grade checkpoint is valid');
   const state=DK.towers.map(t=>[t.face,t.spot,t.lvl,DKtowerDamage(t)/DKtowerRate(t)]);
   await __gradeQA.restoreRunSave(saved,null);DK.paused=true;
   check(JSON.stringify(DK.towers.map(t=>[t.face,t.spot,t.lvl,DKtowerDamage(t)/DKtowerRate(t)]))===JSON.stringify(state),'grade checkpoint restores actual synergy damage');
   check(DK.inf.supporterCooldown===12.5&&DK.inf.supporterUses===2,'grade checkpoint retains supporter state');
   const otherMap=DK.mapKey==='cInfP'?'cInf':'cInfP';__gradeQA.relayoutArena(otherMap);
   const target=DK.towers.find(t=>t.face===6);check(DKDECKRULES.gradeSynergies(target,DK.towers,columns()).active.includes('frost'),'rotation retains adjacent synergy');
   DK.selTower=target;__gradeQA.syncInfo();check(document.querySelector('#info-body').textContent.includes('둔화된 적에게 피해 +20%'),'selected tower explains its actual active synergy');
   DK.selTower=null;__gradeQA.syncInfo();check(document.querySelector('#hud-hint').textContent.includes('배치 시너지 1종 활성'),'battle HUD confirms the active combination');
   DKhelp();check(!document.querySelector('#inf-help').textContent.includes('1눈금 소환'),'new grade help never claims five-card summon rules');
   return checks;
  });
  assert.deepEqual(errors,[]);fs.mkdirSync('gen/e2e/grade-synergy',{recursive:true});await page.screenshot({path:`gen/e2e/grade-synergy/${width}.png`});
  console.log('PASS grade combat',width,height,checks.length,'checks');await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
