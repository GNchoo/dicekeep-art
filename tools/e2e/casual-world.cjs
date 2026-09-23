// Isolated browser proof of the promoted art, alpha, sprite sizes and map layouts.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {launchBrowser,gameUrl}=require('./browser.cjs');
const out='gen/e2e/casual-world';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await launchBrowser();try{
 const reports=[];
 for(const viewport of [{width:1100,height:800},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('window.DK = S;','Object.assign(window,{A,SRCS,CASUAL_WORLD_KEYS,towerSpr,draw,processSprite,processSheet});window.DK = S;')});});
  await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
  await page.goto(gameUrl());await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});
  const art=await page.evaluate(()=>{
   const sizes=Array.from({length:6},(_,i)=>{const s=towerSpr(i+1,0);return {face:i+1,w:s.w,h:s.h};});
   const loaded=[...CASUAL_WORLD_KEYS].map(k=>{const a=A[k];return {key:k,url:SRCS[k],loaded:Array.isArray(a)?a.length===4&&a.every(f=>f.w>1&&f.h>1):!!a&&!a.missing&&(a.w||a.width)>1};});
   // Solid pale pixels at the outside edge used to be removed as gray key color.
   const cv=document.createElement('canvas');cv.width=cv.height=8;const g=cv.getContext('2d');g.fillStyle='#eeeeee';g.fillRect(1,1,6,6);
   const s=processSprite(cv,true),pixel=s.cv.getContext('2d').getImageData(1,1,1,1).data;
   return {sizes,loaded,paleAlpha:pixel[3]};
  });
  assert.ok(art.loaded.every(a=>a.loaded),'Every promoted asset loads');assert.equal(art.paleAlpha,255);
  assert.ok(art.sizes.every(s=>s.w<=70&&s.h<=96&&s.w>30&&s.h>65),'Original gameplay size envelope');
  const tag=viewport.width<500?'phone':'desktop';
  await page.evaluate(()=>{DKstartInf('clear');DK.paused=true;DK.muted=true;DK.gold=99999;for(let i=0;i<6;i++){DK.heldDie=i+1;DK.dieFocus=true;DKplace(i);}DK.fxs=[];DK.texts=[];for(const t of DK.towers)t.kick=0;DKsync();draw();});
  await page.screenshot({path:`${out}/${tag}-arena.png`});
  for(const [stage,theme] of [[1,'plains'],[9,'forest'],[17,'lake'],[26,'darkforest'],[34,'castle'],[43,'hell']]){
   await page.evaluate(n=>{DKstart(n);DK.paused=true;DK.muted=true;DKsync();draw();},stage);
   await page.screenshot({path:`${out}/${tag}-${theme}.png`});
  }
  const sprites=await page.evaluate(()=>{const cv=document.createElement('canvas');cv.width=900;cv.height=420;const g=cv.getContext('2d');g.fillStyle='#526066';g.fillRect(0,0,900,420);for(let i=1;i<=6;i++){const s=A['cT'+i+'a'];g.drawImage(s.cv,(i-1)*150+25,25,100,s.h/s.w*100);}for(const [i,key]of ['shell','bolt','frostShard','lightningArc','dieBomb','tl_arena_pad'].entries()){const s=A[key];g.drawImage(s.cv,i*150+15,285,120,s.h/s.w*120);}return cv.toDataURL();});
  if(tag==='desktop')fs.writeFileSync(`${out}/runtime-sprites.png`,Buffer.from(sprites.split(',')[1],'base64'));
  assert.deepEqual(errors,[]);reports.push({tag,art,errors});await page.close();
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));console.log('PASS casual world: 43 runtime paths, authored alpha, six tower sizes, arena/plains on phone and desktop');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
