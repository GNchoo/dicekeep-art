// Seeded actual combat. No injected SP/mastery/pips; ownership is granted only to compare deck strategies.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchBrowser}=require('./browser.cjs');const {openGame}=require('./pure-luck-clearrate.cjs');
const out=path.resolve('gen/e2e/deck-balance');fs.mkdirSync(out,{recursive:true});
const selected=process.argv.find(v=>v.startsWith('--case='))?.slice(7).split(',');
const cases=[{name:'fresh',deck:[1,2,3,4,5]},{name:'starter',deck:[1,2,3,4,16]},{name:'control',deck:[1,4,7,11,12]},{name:'growth',deck:[1,6,13,14,19]},{name:'control-area',deck:[2,4,5,7,12]},{name:'growth-area',deck:[2,5,13,14,19]}].filter(c=>!selected||selected.includes(c.name));
function play({deck,seed}) {
 const D=DKDECKRULES,P=DKPROGRESSION.defaultProfile();
 for(const id of deck){P.levels[id]=1;Object.assign(P.collection.cards[id],{owned:true,class:D.get(id).baseClass});}P.deck=deck;
  DKSAVE.progression=P;__pureSeed(seed);DKstartInf('build');DK.paused=true;DK.muted=true;
 const empty=()=>__pureQA.SPOTS().findIndex((_,i)=>!__pureQA.towerAt(i));
 let ticks=0,merges=0,copies=0,powers=0,sold=0,stuck=0; const checkpoints=[];
 const handle=()=>{
  // This synchronous simulation owns time; briefly unpause to invoke the real supporter guard.
  DK.paused=false;DKsupporter.use();DK.paused=true;
  if(DKSLOT.active&&!DK.heldDie)__pureQA.finishSlot();
  if(DK.heldDie){const spot=empty();if(spot>=0)DKplace(spot);else{const t=DK.towers.find(t=>D.canMerge({face:DK.heldDie,pips:1},t));if(t)DKplace(t.spot);else{document.getElementById('held-sell').click();sold++;}}}
  if(DK.towers.length>=10){
   // Copy attackers; preserve growth while it is counting down.
   for(const a of DK.towers.slice())if(a.face===13){const b=DK.towers.find(b=>D.canCopy(a,b)&&['주력','광역'].includes(D.get(b.face).role));if(b&&DKdeckMerge(a,b))copies++;}
   const priorities=deck.slice().sort((a,b)=>Number(['지원','제어','경제'].includes(D.get(a).role))-Number(['지원','제어','경제'].includes(D.get(b).role)));
   for(const id of priorities)if(DK.gold>=D.powerCost(DK.inf.deckPower[id])+(__pureQA.chestCost()*1.5) && DKupgrade(id))powers++;
  }
  if(empty()<0 && !DK.heldDie){
   const pairs=[];
   for(const a of DK.towers)for(const b of DK.towers)if(a.spot<b.spot&&D.canMerge(a,b)&&a.face!==14)pairs.push([a,b]);
   pairs.sort((a,b)=>a[0].pips-b[0].pips);
   if(pairs.length&&DKdeckMerge(...pairs[0]))merges++;
   else if(DK.gold>__pureQA.chestCost()*2){const weakest=DK.towers.filter(t=>t.face!==14).sort((a,b)=>a.pips-b.pips)[0];if(weakest){DK.selTower=weakest;document.getElementById('sell-btn').click();sold++;}}
  }
  let guard=0;while(empty()>=0&&!DK.heldDie&&!DKSLOT.active&&DK.gold>=__pureQA.chestCost()&&guard++<15){if(!DKchest())break;__pureQA.finishSlot();DKplace(empty());}
  if(DK.heldDie)stuck++;
 };
 while(DK.phase==='playing'&&!DK.inf.cleared&&ticks<900000){
  if(ticks%15===0)handle();
  if(!DK.waveActive&&!DK.spawnQ.length&&!DK.enemies.length)__pureQA.startWave();
  DK.paused=false;__pureQA.update(1/30);DK.paused=true;ticks++;
  if(DK.inf.doneW>=10*(checkpoints.length+1))checkpoints.push({wave:DK.inf.doneW,time:Math.round(ticks/30),gold:Math.round(DK.gold),pips:DK.towers.reduce((s,t)=>s+t.pips,0),field:DK.enemies.length});
 }
 return {seed,treeVersion:DK.inf.growthSnapshot.treeVersion,supporter:DK.inf.growthSnapshot.supporter,supporterUses:DK.inf.supporterUses,mastery:DK.inf.growthSnapshot.mastery,cleared:!!DK.inf.cleared,wave:DK.wave,doneW:DK.inf.doneW,reason:DK.inf.bossTimeout?'bossTimeout':DK.inf.cleared?'cleared':DK.lives<=0?'fieldCap':'tickCap',seconds:Math.round(ticks/30),merges,copies,powers,sold,stuck,draws:DK.inf.chests,gold:Math.round(DK.gold),power:DK.inf.deckPower,board:DK.towers.map(t=>({face:t.face,pips:t.pips})),checkpoints};
}
(async()=>{const browser=await launchBrowser(),errors=[],report={scope:'Seeded actual-browser 101-wave runs, tree mastery0, no talents/awakenings, normal earned SP and supply supporter. Scripted placement is not a player win-rate estimate.',pass:false,rows:[]};try{const{page,context}=await openGame(browser,errors);try{for(const c of cases){const row={...c,...await page.evaluate(play,{deck:c.deck,seed:41073})};report.rows.push(row);fs.writeFileSync(path.join(out,selected?'extra-report.json':'report.json'),JSON.stringify(report,null,2));console.log(c.name,row.doneW,row.reason,'seconds',row.seconds,'draws',row.draws,'pips',row.board.reduce((n,t)=>n+t.pips,0));assert.notEqual(row.reason,'tickCap');assert.equal(row.stuck,0);}}finally{await context.close();}assert.deepEqual(errors,[]);report.pass=true;}finally{fs.writeFileSync(path.join(out,selected?'extra-report.json':'report.json'),JSON.stringify(report,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
