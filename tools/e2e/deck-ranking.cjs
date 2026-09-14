// Reproducible, actual-browser deck search. Production rules are frozen at --ref.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {launchBrowser}=require('./browser.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'gen/e2e/deck-ranking');fs.mkdirSync(out,{recursive:true});
const arg=(k,d)=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const ref=arg('ref','15aa84aa96cc512fb5c8ae17429aa202610e4233'),stage=arg('stage','pilot'),workers=Number(arg('workers','2'));
const frozen=path.join(out,'source',ref);fs.mkdirSync(frozen,{recursive:true});
const files=cp.execFileSync('git',['ls-tree','--name-only',ref],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>/\.(js|html|css)$/.test(f));
const sources={};for(const f of files){const target=path.join(frozen,f);if(!fs.existsSync(target))fs.writeFileSync(target,cp.execFileSync('git',['show',ref+':'+f],{cwd:root,maxBuffer:20*1024*1024}));sources[f]=fs.readFileSync(target,'utf8');}
const hashes=Object.fromEntries(Object.entries(sources).map(([f,s])=>[f,crypto.createHash('sha256').update(s).digest('hex')]));
const D=require(path.join(frozen,'deck-rules.js'));
const name=deck=>deck.map(id=>D.get(id).name.replace(' 주사위','')).join(' · ');
const candidateDecks=[
 [1,2,3,4,5],[1,2,3,4,16],[1,4,7,11,12],[1,6,13,14,19],[2,4,5,7,12],[2,5,13,14,19],
 [1,4,7,10,12],[2,4,8,10,12],[4,5,7,10,12],[4,7,10,12,20],[4,5,10,12,20],
 [1,4,6,7,12],[4,6,7,12,20],[4,6,10,12,20],[2,4,6,8,12],[4,5,6,7,12],
 [1,4,7,13,14],[4,5,7,13,14],[4,7,12,13,14],[4,10,12,13,14],[4,12,13,14,20],
 [4,5,13,14,20],[4,13,14,19,20],[4,10,13,14,19],[4,7,13,14,19],[5,7,13,14,19],
 [2,4,8,12,20],[4,7,8,12,20],[4,8,10,12,20],[4,5,8,12,20],[2,4,5,8,20],
 [4,9,10,11,12],[4,5,9,11,20],[4,7,9,11,12],[4,6,9,11,20],[1,4,7,9,11],
 [4,5,12,15,16],[4,12,13,14,15],[4,6,12,15,16],[4,12,13,15,16],[4,5,13,15,16],
 [1,4,7,12,17],[4,5,12,17,20],[4,12,13,14,17],[4,6,13,14,18],[4,7,12,13,18],
 [3,4,7,8,10],[3,4,7,8,20],[3,4,12,13,14],[2,4,7,8,10],[4,5,7,8,10],
 [5,6,13,14,19],[4,6,13,14,19],[6,10,13,14,19],[10,13,14,19,20],[4,7,10,13,14],
 [2,4,10,13,14],[4,5,10,13,14],[4,8,12,13,14],[4,11,12,13,14],[4,7,13,14,20],
];
const seen=new Set(),candidates=candidateDecks.map(deck=>deck.slice().sort((a,b)=>a-b)).filter(deck=>{const key=deck.join('-');if(seen.has(key))return false;seen.add(key);return true;}).map(deck=>({id:deck.join('-'),deck,name:name(deck)}));
assert.ok(candidates.length>=40&&candidates.every(c=>D.validDeck(c.deck)));
assert.equal(new Set(candidates.flatMap(c=>c.deck)).size,20,'Search candidates cover every card identity.');
function play({deck,seed,layout='desktop',research='free'}) {
 const D=DKDECKRULES,P=DKPROGRESSION.defaultProfile();
 for(const id of deck){P.levels[id]=1;Object.assign(P.collection.cards[id],{owned:true,class:D.get(id).baseClass});if(research==='max'){P.tree.mastery[id]=5;P.tree.talents[id]=['income','growth','haste','amplify','resonance'].includes(D.get(id).stats.ability)?'insight':'force';P.tree.awakenings[id]=true;}}
 P.deck=deck;P.tree.supporter='supply';DKSAVE.progression=P;DKSAVE.gems=0;__pureSeed(seed);DKstartInf('build');DK.paused=true;DK.muted=true;
 const empty=()=>__pureQA.SPOTS().findIndex((_,i)=>!__pureQA.towerAt(i));
 let ticks=0,merges=0,copies=0,powers=0,sold=0,stuck=0,maxField=0,highestPips=0;
 const sell=id=>{const b=document.getElementById(id);b.disabled=false;b.click();};
 const handle=()=>{
  DK.paused=false;DKsupporter.use();DK.paused=true;
  if(DKSLOT.active&&!DK.heldDie)__pureQA.finishSlot();
  if(DK.heldDie){const spot=empty();if(spot>=0)DKplace(spot);else{const t=DK.towers.find(t=>D.canMerge({face:DK.heldDie,pips:1},t));if(t)DKplace(t.spot);else{sell('held-sell');sold++;}}}
  if(DK.towers.length>=10){
   for(const a of DK.towers.slice())if(a.face===13){const b=DK.towers.find(b=>D.canCopy(a,b)&&['주력','광역'].includes(D.get(b.face).role));if(b&&DKdeckMerge(a,b))copies++;}
   const priorities=deck.slice().sort((a,b)=>Number(['지원','제어','경제'].includes(D.get(a).role))-Number(['지원','제어','경제'].includes(D.get(b).role)));
   for(const id of priorities)if(DK.gold>=D.powerCost(DK.inf.deckPower[id])+(__pureQA.chestCost()*1.5)&&DKupgrade(id))powers++;
  }
  if(empty()<0&&!DK.heldDie){const pairs=[];for(const a of DK.towers)for(const b of DK.towers)if(a.spot<b.spot&&D.canMerge(a,b)&&a.face!==14)pairs.push([a,b]);pairs.sort((a,b)=>a[0].pips-b[0].pips);if(pairs.length&&DKdeckMerge(...pairs[0]))merges++;else if(DK.gold>__pureQA.chestCost()*2){const weakest=DK.towers.filter(t=>t.face!==14).sort((a,b)=>a.pips-b.pips)[0];if(weakest){DK.selTower=weakest;sell('sell-btn');sold++;}}}
  let guard=0;while(empty()>=0&&!DK.heldDie&&!DKSLOT.active&&DK.gold>=__pureQA.chestCost()&&guard++<15){if(!DKchest())break;__pureQA.finishSlot();DKplace(empty());}
  if(DK.heldDie)stuck++;
 };
 while(DK.phase==='playing'&&!DK.inf.cleared&&ticks<900000){
  if(ticks%15===0)handle();
  if(!DK.waveActive&&!DK.spawnQ.length&&!DK.enemies.length)__pureQA.startWave();
  DK.paused=false;__pureQA.update(1/30);DK.paused=true;ticks++;
  if(ticks%30===0){maxField=Math.max(maxField,DK.enemies.length);highestPips=Math.max(highestPips,...DK.towers.map(t=>t.pips));}
 }
 return {seed,layout,mapKey:DK.mapKey,research,cleared:!!DK.inf.cleared,doneW:DK.inf.doneW,wave:DK.wave,reason:DK.inf.bossTimeout?'bossTimeout':DK.inf.cleared?'cleared':DK.lives<=0?'fieldCap':'tickCap',seconds:Math.round(ticks/30),ticks,merges,copies,powers,sold,stuck,maxField,highestPips,draws:DK.inf.chests,supporterUses:DK.inf.supporterUses,gold:Math.round(DK.gold),board:DK.towers.map(t=>({face:t.face,pips:t.pips,spot:t.spot})),treeVersion:DK.inf.growthSnapshot.treeVersion};
}
async function open(browser,errors,layout='desktop',optimized=true){
 const context=await browser.newContext({viewport:layout==='phone'?{width:390,height:844}:{width:1240,height:860}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');let state=1;globalThis.__pureSeed=seed=>{state=seed>>>0;};Math.random=()=>{state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};});
 await page.route('**/*',async route=>{const file=new URL(route.request().url()).pathname.split('/').pop();if(!(file in sources))return route.continue();let body=sources[file];if(file==='game.js'){const anchor='window.DK = S;';assert.equal(body.split(anchor).length,2);body=body.replace(anchor,'window.__pureQA={update,finishSlot,startWave,chestCost,towerAt,SPOTS:()=>SPOTS};\n'+anchor);if(optimized){body=body.replace('function syncUI() {','function syncUI() { if (window.__rankingBatch) return;');body=body.replace('function syncSupporter() {','function syncSupporter() { if (window.__rankingBatch) return;');body=body.replace('function syncWaveBtn() {','function syncWaveBtn() { if (window.__rankingBatch) return;');}}
 await route.fulfill({status:200,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body});});
 await page.goto('http://127.0.0.1:8137/index.html?net=off&ranking=114');await page.waitForFunction(()=>window.DK&&DK.phase==='title'&&window.DKPROGRESSION,null,{timeout:120000});await page.click('#ov-btn');await page.evaluate(batch=>{DK.muted=true;window.__rankingBatch=batch;},optimized);return{page,context};
}
function summary(rows){const n=rows.length,k=rows.filter(r=>r.cleared).length,p=k/n,z=1.96,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d,clear=rows.filter(r=>r.cleared);return{runs:n,cleared:k,rate:100*p,ci95:[100*Math.max(0,c-h),100*Math.min(1,c+h)],meanWave:rows.reduce((s,r)=>s+r.doneW,0)/n,meanClearSeconds:clear.length?clear.reduce((s,r)=>s+r.seconds,0)/clear.length:null,meanSeconds:rows.reduce((s,r)=>s+r.seconds,0)/n,failures:rows.filter(r=>!r.cleared).map(r=>({seed:r.seed,wave:r.doneW,reason:r.reason})),meanWallSeconds:rows.reduce((s,r)=>s+r.ms,0)/n/1000};}
function rank(report,phase){return candidates.map(c=>({...c,...summary(report.rows.filter(r=>r.id===c.id&&r.phase===phase))})).filter(r=>r.runs).sort((a,b)=>b.rate-a.rate||b.meanWave-a.meanWave||(a.meanClearSeconds??Infinity)-(b.meanClearSeconds??Infinity)||a.id.localeCompare(b.id));}
async function main(){const errors=[],reportFile=path.join(out,'report.json'),report=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile)): {ref,hashes,policy:'v114 actual combat; fixed dt 1/30; actions every 0.5s; first empty spot; low-pip merge; preserve growth; copy first attacker; supply on cooldown; no injected battle resources.',candidates,rows:[]};assert.equal(report.ref,ref);assert.deepEqual(report.hashes,hashes,'Frozen source hashes must remain unchanged across resumed batches.');
 const browser=await launchBrowser();try{
  let jobs=[];
  if(stage==='pilot')jobs=[{...candidates[0],seed:41073,phase:'pilot',optimized:true}];
  else if(stage==='parity')jobs=[false,true].map(optimized=>({...candidates[0],seed:41073,phase:'parity',optimized}));
  else if(stage==='screen')jobs=candidates.flatMap(c=>[110003,220009,330017].map(seed=>({...c,seed,phase:'screen'})));
  else if(stage==='validate'){const top=rank(report,'screen').slice(0,10);assert.equal(top.length,10);for(const baseline of candidates.slice(0,2))if(!top.some(c=>c.id===baseline.id))top.push({...baseline,baseline:true});jobs=top.flatMap(c=>Array.from({length:20},(_,i)=>({...c,seed:900001+i*7919,phase:'validate'})));}
  else if(stage==='max'){const top=rank(report,'validate').slice(0,5);assert.equal(top.length,5);jobs=top.flatMap(c=>Array.from({length:20},(_,i)=>({...c,seed:1800001+i*7919,phase:'max',research:'max'})));}
  else if(stage==='phone'){const top=rank(report,'validate').slice(0,3);if(!top.some(c=>c.id===candidates[0].id))top.push({...candidates[0],baseline:true});jobs=top.flatMap(c=>Array.from({length:20},(_,i)=>({...c,seed:900001+i*7919,phase:'phone',layout:'phone'})));}
  else throw Error('Unknown stage '+stage);
  const key=j=>[j.phase,j.id,j.seed,j.optimized===false?'raw':'batch'].join('/');jobs=jobs.filter(j=>!report.rows.some(r=>key(r)===key(j)));let next=0,complete=0;
  const save=()=>{report.updated=new Date().toISOString();report.screen=rank(report,'screen');report.validation=rank(report,'validate');report.maximum=rank(report,'max');report.phone=rank(report,'phone');fs.writeFileSync(reportFile,JSON.stringify(report,null,2));};
  await Promise.all(Array.from({length:Math.min(workers,jobs.length)},async(_,wi)=>{let env=null,lastLayout,lastOpt;try{while(next<jobs.length){const j=jobs[next++],layout=j.layout||'desktop',opt=j.optimized!==false;if(!env||lastLayout!==layout||lastOpt!==opt){if(env)await env.context.close();env=await open(browser,errors,layout,opt);lastLayout=layout;lastOpt=opt;}const t=Date.now();const r=await env.page.evaluate(play,j);assert.notEqual(r.reason,'tickCap');assert.equal(r.stuck,0);report.rows.push({...j,...r,ms:Date.now()-t});complete++;save();console.log(`${stage} ${complete}/${jobs.length} worker${wi} ${j.id} seed=${j.seed} ${r.cleared?'CLEAR':r.doneW+'W'} ${r.seconds}s ${(Date.now()-t)/1000}s wall`);}}finally{if(env)await env.context.close();}}));
  assert.deepEqual(errors,[]);if(stage==='parity'){const rr=report.rows.filter(r=>r.phase==='parity');const strip=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['ms','optimized'].includes(k)));assert.deepEqual(strip(rr[0]),strip(rr[1]));console.log('UI batching parity: exact combat outputs match');}save();
 }finally{await browser.close();}}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={summary,play,candidates};
