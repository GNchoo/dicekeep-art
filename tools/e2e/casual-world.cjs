// Isolated browser proof of the promoted art, alpha, sprite sizes and map layouts.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {launchBrowser,gameUrl}=require('./browser.cjs');
const out='gen/e2e/casual-world';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await launchBrowser();try{
 const reports=[];
 for(const viewport of [{width:1100,height:800},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('window.DK = S;','Object.assign(window,{A,SRCS,CASUAL_WORLD_KEYS,towerSpr,towerSprites,towerCleanSprites,draw,processSprite,processSheet});window.DK = S;')});});
  await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
  await page.goto(gameUrl());await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});
  const art=await page.evaluate(()=>{
   const sizes=Array.from({length:6},(_,i)=>{const s=towerSpr(i+1,0);return {face:i+1,w:s.w,h:s.h};});
   const loaded=[...CASUAL_WORLD_KEYS].map(k=>{const a=A[k];return {key:k,url:SRCS[k],loaded:Array.isArray(a)?a.length===4&&a.every(f=>f.w>1&&f.h>1):!!a&&!a.missing&&(a.w||a.width)>1};});
   // Solid pale pixels at the outside edge used to be removed as gray key color.
   const cv=document.createElement('canvas');cv.width=cv.height=8;const g=cv.getContext('2d');g.fillStyle='#eeeeee';g.fillRect(1,1,6,6);
   const s=processSprite(cv,true),pixel=s.cv.getContext('2d').getImageData(1,1,1,1).data;
   const cleanSizes=Array.from({length:6},(_,i)=>{const s=towerCleanSprites[i+1];return {face:i+1,w:s?.w,h:s?.h};});
   // Check the pixels after the game's own image processing and final gameplay scaling.
   // Distinct files can otherwise silently converge on the same fallback/recolored tower.
   const fingerprint=s=>{const data=s.cv.getContext('2d').getImageData(0,0,s.w,s.h).data;let hash=2166136261,transparent=0,solid=0;for(let i=0;i<data.length;i+=4){for(let j=0;j<4;j++)hash=Math.imul(hash^data[i+j],16777619);if(data[i+3]===0)transparent++;if(data[i+3]>=240)solid++;}return {hash:hash>>>0,transparent,solid};};
   const starTowers=Array.from({length:14},(_,i)=>{const face=i+7,key='tStar'+face,source=A[key],sprite=towerSpr(face,0);return {face,url:SRCS[key],sourceSize:source?{w:source.w,h:source.h}:null,size:sprite?{w:sprite.w,h:sprite.h}:null,source:source?.cv?fingerprint(source):null,rendered:sprite?.cv?fingerprint(sprite):null,dedicated:sprite===towerSprites[face]?.[0]};});
   const arenaTiles=['floor','board','road','pad'].map(name=>{const key='tl_arena_'+name,a=A[key],img=a?.cv||a,w=a?.w||a?.width,h=a?.h||a?.height;
    if(!img||a.missing||!(w>8&&h>8))return {name,url:SRCS[key],loaded:false};
    const sample=document.createElement('canvas');sample.width=sample.height=64;sample.getContext('2d').drawImage(img,0,0,64,64);
    return {name,url:SRCS[key],loaded:true,w,h,...fingerprint({cv:sample,w:64,h:64})};
   });
   const road=A.tl_arena_road,edge=document.createElement('canvas');edge.width=road.width;edge.height=road.height;const eg=edge.getContext('2d');eg.drawImage(road,0,0);
   const l=eg.getImageData(0,0,1,road.height).data,r=eg.getImageData(road.width-1,0,1,road.height).data;
   const top=eg.getImageData(0,0,road.width,1).data,bottom=eg.getImageData(0,road.height-1,road.width,1).data;
   const seam=(a,b)=>{let delta=0;for(let i=0;i<a.length;i+=4)for(let j=0;j<3;j++)delta+=Math.abs(a[i+j]-b[i+j]);return delta/(a.length/4*3);};
   return {sizes,cleanSizes,loaded,starTowers,arenaTiles,roadSeam:{horizontal:seam(l,r),vertical:seam(top,bottom)},paleAlpha:pixel[3]};
  });
  assert.ok(art.loaded.every(a=>a.loaded),'Every promoted asset loads');assert.equal(art.paleAlpha,255);
  assert.ok(art.sizes.every(s=>s.w<=70&&s.h<=96&&s.w>30&&s.h>65),'Original gameplay size envelope');
  assert.ok(art.cleanSizes.every(s=>s.w<=70&&s.h<=96&&s.w>30&&s.h>65),'Plant-free gameplay size envelope');
  assert.equal(art.starTowers.length,14,'All 7–20★ towers are present');
  for(const t of art.starTowers){
   assert.match(t.url,new RegExp(`/casual/towers/star-${String(t.face).padStart(2,'0')}-casual\\.png\\?`),`★${t.face} uses the new art`);
   assert.ok(t.dedicated,`★${t.face} renders its loaded sprite, not a fallback`);
   assert.ok(t.size.w<=70&&t.size.h<=96&&t.size.w>30&&t.size.h>65,`★${t.face} gameplay size`);
   assert.ok(t.source.transparent>0&&t.source.solid>0&&t.rendered.transparent>0&&t.rendered.solid>0,`★${t.face} keeps transparent edges and visible pixels`);
  }
  assert.equal(new Set(art.starTowers.map(t=>t.source.hash)).size,14,'All 14 processed images differ');
  assert.equal(new Set(art.starTowers.map(t=>t.rendered.hash)).size,14,'All 14 gameplay sprites differ');
  for(const tile of art.arenaTiles){
   assert.ok(tile.loaded,`${tile.name} arena painting loads`);
   assert.match(tile.url,new RegExp(`/casual/tiles/arena/${tile.name}\\.(?:png|jpg)\\?`),`${tile.name} arena path`);
   const version=new URL(tile.url,gameUrl()).searchParams.get('v');
   assert.ok(version&&version!=='casual-world1',`${tile.name} has the new cache version`);
   assert.ok(tile.w>=256&&tile.h>=256&&tile.solid>0,`${tile.name} contains full-resolution visible art`);
  }
  assert.equal(new Set(art.arenaTiles.map(t=>t.hash)).size,4,'The four arena surfaces have distinct pixels');
  assert.ok(art.arenaTiles.find(t=>t.name==='pad').transparent>0,'Arena pad retains transparent surroundings');
  assert.ok(art.roadSeam.horizontal<3&&art.roadSeam.vertical<3,'The repeated road meets at both tile edges');
  const tag=viewport.width<500?'phone':'desktop';
  const arenaDraws=await page.evaluate(()=>{
   const assets={floor:A.tl_arena_floor,board:A.tl_arena_board,road:A.tl_arena_road,pad:A.tl_arena_pad.cv};
   const counts={floor:0,board:0,road:0,pad:0},original=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(img,...args){for(const [name,asset]of Object.entries(assets))if(img===asset)counts[name]++;return original.call(this,img,...args);};
   try{DKstartInf('clear');}finally{CanvasRenderingContext2D.prototype.drawImage=original;}
   DK.paused=true;DK.muted=true;DK.gold=99999;for(let i=0;i<6;i++){DK.heldDie=i+1;DK.dieFocus=true;DKplace(i);}DK.fxs=[];DK.texts=[];for(const t of DK.towers)t.kick=0;DKsync();draw();
   return counts;
  });
  assert.ok(Object.values(arenaDraws).every(count=>count>0),`${tag} arena renderer uses all four paintings: ${JSON.stringify(arenaDraws)}`);
  assert.deepEqual(await page.evaluate(()=>Array.from({length:6},(_,i)=>towerSpr(i+1,0)===towerCleanSprites[i+1])),[true,true,true,true,true,true],'Arena uses plant-free base towers');
  assert.equal(await page.evaluate(()=>towerSpr(1,1)===towerCleanSprites[1]),false,'Alternate skins remain independent');
  await page.screenshot({path:`${out}/${tag}-arena.png`});
  for(const [stage,theme] of [[1,'plains'],[9,'forest'],[17,'lake'],[26,'darkforest'],[34,'castle'],[43,'hell']]){
   await page.evaluate(n=>{DKstart(n);DK.paused=true;DK.muted=true;DKsync();draw();},stage);
   assert.equal(await page.evaluate(()=>towerSpr(1,0)===towerCleanSprites[1]),theme==='castle'||theme==='hell',`${theme} tower variant`);
   assert.ok(await page.evaluate(()=>Array.from({length:14},(_,i)=>towerSpr(i+7,0)===towerSprites[i+7][0]).every(Boolean)),`${theme} uses all 14 new star towers`);
   await page.screenshot({path:`${out}/${tag}-${theme}.png`});
  }
  const sprites=await page.evaluate(()=>{const cv=document.createElement('canvas');cv.width=900;cv.height=420;const g=cv.getContext('2d');g.fillStyle='#526066';g.fillRect(0,0,900,420);for(let i=1;i<=6;i++){const s=A['cT'+i+'a'];g.drawImage(s.cv,(i-1)*150+25,25,100,s.h/s.w*100);}for(const [i,key]of ['shell','bolt','frostShard','lightningArc','dieBomb','tl_arena_pad'].entries()){const s=A[key];g.drawImage(s.cv,i*150+15,285,120,s.h/s.w*120);}return cv.toDataURL();});
  if(tag==='desktop')fs.writeFileSync(`${out}/runtime-sprites.png`,Buffer.from(sprites.split(',')[1],'base64'));
  assert.deepEqual(errors,[]);reports.push({tag,art,arenaDraws,errors});await page.close();
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));console.log('PASS casual world: 14 unique 7–20★ towers, four new rendered arena paintings, repeating road, six regions on phone and desktop');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
