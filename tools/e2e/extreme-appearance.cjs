// Runtime identity/geometry contracts. Default new identities alias reviewed PNGs;
// this is explicitly a synthetic integration fixture, not approval of new art.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launchBrowser,gameUrl}=require('./browser.cjs');
const repo=path.resolve(__dirname,'../..'),actual=process.argv.includes('--actual');
const out=path.join(repo,'gen/e2e/extreme-appearance',actual?'actual':'synthetic');fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(repo,'game.js'),'utf8');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(repo,'directional-art.js'),'utf8'),sandbox);
const fixture={version:101,entries:{}};
for(let wave=102;wave<=202;wave++){
  const base=wave-101,boss=base%10===0;
  for(const secondary of boss?[false,true]:[false]){
    const legacy=(boss?'b':'w')+String(base).padStart(3,'0')+(secondary&&base!==10?'-2':'');
    const id=(boss?'b':'w')+String(wave).padStart(3,'0')+(secondary?'-2':'');
    fixture.entries[id]={...JSON.parse(JSON.stringify(sandbox.window.INF_DIRECTIONAL_ART.entries[legacy])),assetId:id,wave,role:secondary?'secondary':boss?'boss':'normal',legacyAssetId:legacy,name:'Fixture '+id};
  }
}
async function open(browser,{empty=false,offline=false}={}){
  const page=await browser.newPage({viewport:{width:440,height:956},deviceScaleFactor:2}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game.js*',r=>r.fulfill({contentType:'application/javascript',body:game.replace('window.DK = S;',
    'Object.assign(window,{buildInfinityWave,spawnEnemy,refreshDirectionalDemand,directionalFutureIds,currentEnemyFrame,directionalPhase,enemyFramePlacement,spawnDeath,posAt,epos,mpViewBuild,mpViewAdvance,VIEW});Object.defineProperty(window,"LANES",{get:()=>LANES});\nwindow.DK = S;')}));
  if(empty||!actual)await page.route('**/extreme-art.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.INF_EXTREME_ART='+JSON.stringify(empty?{version:101,entries:{}}:fixture)+';'}));
  await page.route('**/casual/**',r=>{const u=r.request().url();if(/\/(?:inf\/directional|extreme)\//.test(u)){requests.push(u);if(offline)return r.abort('failed');}return r.continue();});
  await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
  await page.goto(gameUrl());await page.waitForFunction(()=>window.DK&&DK.phase==='title',null,{timeout:120000});
  await page.evaluate(()=>{
    const marks=new WeakMap();for(let tier=1;tier<=3;tier++)for(const view of ['side','front','back']){const cv=DKART.evolutionMark(tier,view);if(cv)marks.set(cv,tier+':'+view);}
    const draw=CanvasRenderingContext2D.prototype.drawImage;window.__evolutionDraws={};
    CanvasRenderingContext2D.prototype.drawImage=function(cv,...args){const result=draw.call(this,cv,...args),key=marks.get(cv);if(key&&this.canvas.id==='game')window.__evolutionDraws[key]=(window.__evolutionDraws[key]||0)+1;return result;};
  });
  return{page,errors,requests};
}
async function logical(page){return page.evaluate(()=>{
  DKstartInf('extreme');DK.paused=true;DK.muted=true;const rows=[];window.__appearanceDelivery=[];
  for(const wave of [...Array.from({length:202},(_,i)=>i+1),203,10000,1000000]){
    DK.wave=wave;DK.enemies=[];const q=buildInfinityWave(wave);
    for(const item of [q[0],q.find(x=>x.isElite),q.find(x=>x.bossRole===1)].filter(Boolean)){
      spawnEnemy(item);const e=DK.enemies.at(-1);rows.push({wave,role:e.bossRole,elite:e.isElite,type:e.type,hp:e.hp,max:e.max,size:e.def.size,speed:e.def.speed,spdMult:e.spdMult,gold:e.gold,armor:e.armor});
      if(wave<=202)window.__appearanceDelivery.push({wave,role:e.bossRole,id:e.artAssetId,requested:e.artRequestedId});
    }
  }DK.enemies=[];DK.corpses=[];return rows;
});}
(async()=>{
 const browser=await launchBrowser(),report={scope:actual?'Actual promoted extreme manifest/PNG runtime contracts':'Synthetic 111 extreme IDs using existing approved PNGs; new generated art is NOT validated',gameSha256:crypto.createHash('sha256').update(game).digest('hex'),checks:[]};
 try{
  const baseline=await open(browser,{empty:true});const physics=await logical(baseline.page);assert.deepEqual(baseline.errors,[]);await baseline.page.close();
  const t=await open(browser);report.boot=await t.page.evaluate(()=>DKART.state());
  assert.equal(report.boot.approvedEntries,221);assert.equal(report.boot.initialized,true);assert.equal(t.requests.length,0);assert.equal(report.boot.loads,663);
  assert.equal(report.boot.residentBytes,(663+9)*64*64*4);assert.equal(report.boot.overlayBytes,9*64*64*4);
  assert.deepEqual(await logical(t.page),physics);report.checks.push('1–202/203/10000/1e6 spawn physics unchanged with new manifest');
  report.delivery=await t.page.evaluate(()=>window.__appearanceDelivery);
  assert.ok(report.delivery.every(e=>e.id===e.requested));assert.equal(new Set(report.delivery.map(e=>e.id)).size,221);
  report.checks.push('all110 original and111 extreme identities resolve at their actual roster spawns');
  report.actors=await t.page.evaluate(()=>{
    const rows=[];for(const wave of [1,102,111,201,202,203,212,303,304,405,10000,1000000]){
      DK.wave=wave;DK.enemies=[];const q=buildInfinityWave(wave);
      for(const item of [q[0],q.find(x=>x.isElite),q.find(x=>x.bossRole===1)].filter(Boolean)){
        spawnEnemy(item);const e=DK.enemies.at(-1);e.dist=(LANES[0].loopAt||0)+50;e.artWalkDistance=80;e.entranceT=-1;
        const phase=directionalPhase(e),views=['side','front','back'].map(view=>{e.artDirection=view;const fr=DKART.frame(e.artAssetId,view,phase);return{view,id:fr.assetId,actualView:fr.view,key:fr.cacheKey,place:enemyFramePlacement(fr,e.drawHeight),phase:directionalPhase(e)};});
        rows.push({wave,role:e.bossRole,elite:e.isElite,id:e.artAssetId,code:e.appearanceCode,tier:e.evolutionTier,height:e.drawHeight,logical:e.def.size,phase,views});
      }
    }return rows;
  });
  for(const e of report.actors){assert.ok(Number.isFinite(e.height)&&Number.isFinite(e.phase));assert.ok(e.tier<=3);assert.ok(e.views.every(v=>v.id===e.id&&v.view===v.actualView&&v.phase===e.phase));}
  const rat=report.actors.find(e=>e.wave===1);assert.equal(rat.height,21);assert.equal(rat.views[1].place.w/rat.views[0].place.w,1.6);
  assert.equal(report.actors.find(e=>e.wave===111&&e.role===1).id,'b111-2');
  assert.equal(report.actors.find(e=>e.wave===202).id,'w202');assert.equal(report.actors.find(e=>e.wave===203).id,'w102');
  assert.equal(report.actors.find(e=>e.wave===203).tier,1);assert.equal(report.actors.find(e=>e.wave===10000).tier,3);
  report.checks.push('all three views preserve fixed height and phase; original rat21px/1.6 vertical view; new111 secondary; bounded evolution');
  report.concurrent=await t.page.evaluate(()=>{
    DK.enemies=[];DK.corpses=[];DK.wave=203;DK.spawnQ=[];DK.waveActive=true;
    for(const wave of [101,102,203]){spawnEnemy(buildInfinityWave(wave)[0]);const e=DK.enemies.at(-1);e.dist=(LANES[0].loopAt||0)+60+DK.enemies.length*65;e.entranceT=-1;}
    const e=DK.enemies.at(-1);spawnDeath(e,epos(e));refreshDirectionalDemand(true);
    return{future:directionalFutureIds(203),actors:DK.enemies.map(e=>({id:e.artAssetId,tier:e.evolutionTier})),corpse:{id:DK.corpses[0].fr.assetId,tier:DK.corpses[0].evolutionTier}};
  });
  assert.deepEqual(report.concurrent.future,['w102','w103']);assert.equal(report.concurrent.corpse.id,'w102');assert.equal(report.concurrent.corpse.tier,1);
  await t.page.waitForFunction(()=>!DKART.state().running,null,{timeout:60000});
  report.cache=await t.page.evaluate(()=>DKART.state());assert.ok(report.cache.peakTrackedBytes<=96*1024*1024);assert.equal(report.cache.maxRunning,2);
  assert.ok(report.cache.records.filter(r=>r.status==='ready'&&!r.key.endsWith(':fallback')).every(r=>/^(w101|w102|w103):/.test(r.key)));
  await t.page.waitForFunction(()=>Object.keys(window.__evolutionDraws).some(k=>k.startsWith('1:')),null,{timeout:10000});
  report.evolutionCanvasDraws=await t.page.evaluate(()=>window.__evolutionDraws);
  await t.page.screenshot({path:path.join(out,'evolution-concurrent.png')});
  report.spectator=await t.page.evaluate(()=>{
    DK.net={rivals:{peer:{w:10000}},status:'alive'};VIEW.pid='peer';const rows=[];
    for(const [wave,role,elite]of[[1,0,false],[20,1,false],[202,0,false],[203,0,false],[212,1,false],[10000,0,true]]){
      const q=buildInfinityWave(wave),item=q.find(i=>i.bossRole===role)||q[0];
      const i=item.isBoss?1000+DKCONTENT.bossBases.findIndex(b=>b.id===item.type):DKCONTENT.bases.findIndex(b=>b.id===item.type);
      rows.push({i,d:(LANES[0].loopAt||0)+50+rows.length*50,h:9,a:DKappearance.appearance(wave,!!role,elite),p:.95});
    }
    const en=DKappearance.enemyStream(rows);mpViewBuild({w:10000,sp:1,o:'p',ll:LANES[0].len,l:20,f:rows.length,tw:[[0,7,1],[1,20,3]],en});
    const before=VIEW.enemies.map(e=>({id:e.artAssetId,code:e.appearanceCode,tier:e.evolutionTier,phase:e.viewPhase,height:e.drawHeight}));
    mpViewAdvance(.1);refreshDirectionalDemand(true);return{before,after:VIEW.enemies.map(e=>({id:e.artAssetId,code:e.appearanceCode,tier:e.evolutionTier,phase:e.viewPhase,height:e.drawHeight})),towers:VIEW.towers.map(t=>t.face)};
  });
  assert.deepEqual(report.spectator.after.map(e=>e.id),['w001','b020-2','w202','w102','b111-2','w102']);assert.deepEqual(report.spectator.towers,[7,20]);
  assert.ok(report.spectator.after.every((e,i)=>e.phase!==report.spectator.before[i].phase&&e.height===report.spectator.before[i].height));
  assert.equal(report.spectator.after[3].tier,1);assert.equal(report.spectator.after[5].tier,3);report.checks.push('old and new live waves/elite/secondary/evolution coexist in spectator; tower ranks preserved; walking phase advances');
  assert.deepEqual(t.errors,[]);await t.page.close();
  const offline=await open(browser,{offline:true});await offline.page.evaluate(()=>{DKstartInf('extreme');DK.paused=true;DK.wave=203;DK.enemies=[];spawnEnemy(buildInfinityWave(203)[0]);refreshDirectionalDemand(true);});
  await offline.page.waitForFunction(()=>DKART.state().failures>0&&!DKART.state().running,null,{timeout:60000});
  report.offline=await offline.page.evaluate(()=>({frames:['side','front','back'].map(view=>{const fr=DKART.frame('w102',view,.5);return{id:fr.assetId,view:fr.view,key:fr.cacheKey};}),tier:DK.enemies[0].evolutionTier,state:DKART.state()}));
  assert.ok(report.offline.frames.every(f=>f.id==='w102'&&f.key.endsWith(':fallback')));assert.equal(report.offline.tier,1);assert.deepEqual(offline.errors,[]);await offline.page.close();
  report.checks.push('network failure keeps same new identity in each inline view with its evolution mark');report.pass=true;
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log('PASS',report.checks);
})().catch(e=>{console.error(e);process.exitCode=1;});
