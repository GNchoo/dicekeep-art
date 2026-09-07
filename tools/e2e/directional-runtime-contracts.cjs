// Actual checked-in art exercises spectator rendering, bounded loading and offline identity.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');
const repo=path.resolve(__dirname,'../..'),pilot=process.argv.includes('--pilot');
const out = path.join(repo, 'gen/e2e/directional-runtime');
fs.mkdirSync(out, { recursive: true });
async function open(browser, {empty=false,offline=false}={}) {
  const page=await browser.newPage({viewport:{width:440,height:956}}), errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Test-only access to closure functions; no diagnostic globals ship in game.js.
  await page.route('**/game.js*',r=>{
    const game=fs.readFileSync(path.join(repo,'game.js'),'utf8');
    const names=['buildInfinityWave','spawnEnemy','refreshDirectionalDemand','currentEnemyFrame','directionalPhase','posAt','enemyFlip','mpViewBuild','mpViewAdvance','epos','towerFire','projectileDrawPosition','updateVisuals'];
    const hook='Object.assign(window,{'+names.join(',')+',VIEW,TOWER_DEFS}); Object.defineProperty(window,"LANES",{get:()=>LANES});\n';
    return r.fulfill({contentType:'application/javascript',body:game.replace('window.DK = S;',hook+'window.DK = S;')});
  });
  await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
  if(empty)await page.route('**/directional-art.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.INF_DIRECTIONAL_ART={version:93,entries:{}};'}));
  await page.route('**/casual/**/inf/directional/**',r=>{requests.push(r.request().url());return offline?r.abort('failed'):r.continue();});
  await page.goto(gameUrl());await page.waitForFunction(()=>window.DK&&DK.phase==='title',null,{timeout:120000});
  await page.evaluate(()=>{
    const frame=DKART.frame,lookup=new WeakMap(),draw=CanvasRenderingContext2D.prototype.drawImage;window.__spectatorDraws={};
    DKART.frame=function(...a){const f=frame.apply(this,a);if(f)lookup.set(f.cv,{id:f.assetId,key:f.cacheKey,view:f.view});return f;};
    CanvasRenderingContext2D.prototype.drawImage=function(source,...a){const value=draw.call(this,source,...a),f=lookup.get(source);if(this.canvas.id==='game'&&f&&VIEW.pid){const rows=window.__spectatorDraws[f.id]||=[];if(!rows.some(x=>x.key===f.key&&x.view===f.view))rows.push(f);}return value;};
  });
  return {page,errors,requests};
}
async function collectLogical(page) {
  return page.evaluate(()=>{
    DKstartInf('clear');DK.paused=true;DK.muted=true;const results=[];
    for(let wave=1;wave<=101;wave++){
      DK.wave=wave;DK.enemies=[];const q=buildInfinityWave(wave);
      const choices=[q[0],q.find(x=>x.isElite),q.find(x=>x.bossRole===1)].filter(Boolean);
      for(const item of choices){spawnEnemy(item);const e=DK.enemies.at(-1);results.push({wave,bossRole:e.bossRole,elite:e.isElite,type:e.type,hp:e.hp,size:e.def.size,speed:e.def.speed,spdMult:e.spdMult,gold:e.gold,armor:e.armor});}
    }
    DK.enemies=[];DK.wave=1;return results;
  });
}
(async()=>{
  const browser=await launchBrowser();
  const report={scope:'Actual directional manifest/PNGs; original-roster physics baseline, spectator and offline fallback contracts',pilot,checks:[]};
  try{
    const baseline=await open(browser,{empty:true});
    const logical=await collectLogical(baseline.page);await baseline.page.close();
    const test=await open(browser);
    report.boot=await test.page.evaluate(()=>DKART.state());
    const count=report.boot.approvedEntries;if(!pilot)assert.equal(count,110);assert.equal(report.boot.initialized,true);assert.equal(report.boot.loads,count*3);assert.equal(report.boot.maxRunning,2);assert.equal(test.requests.length,0);
    assert.equal(report.boot.residentBytes,count*3*64*64*4);report.checks.push(count+' real identities/'+count*3+' inline direction stills decoded before boot; no optional art preload');
    assert.deepEqual(await collectLogical(test.page),logical);report.checks.push('101 wave roster physics/hp/size/speed/gold/armor unchanged by approved directional manifest');
    const own=await test.page.evaluate(()=>{
      DK.wave=20;DK.enemies=[];for(const item of buildInfinityWave(20))spawnEnemy(item);
      const r=DK.enemies.map(e=>({id:e.artAssetId,code:e.appearanceCode,size:e.def.size,draw:e.drawHeight}));
      DK.enemies=[];DK.wave=1;spawnEnemy(buildInfinityWave(1)[0]);const e=DK.enemies[0];e.dist=100;refreshDirectionalDemand(true);
      return r;
    });
    assert.equal(own[1].code,121);assert.equal(own[1].id,'b020-2');assert.ok(Math.abs(own[1].draw/own[0].draw-.7)<1e-9);
    own.forEach((e,k)=>assert.equal(e.size,logical.find(r=>r.wave===20&&r.bossRole===k).size));
    await test.page.waitForFunction(()=>!DKART.state().running,null,{timeout:30000});
    report.directions=await test.page.evaluate(()=>{
      const e=DK.enemies[0],result=[];
      for(const view of ['side','front','back']){
        const f=DKART.frame(e.artAssetId,view,.5);result.push({view,frameView:f.view,key:f.cacheKey,pivot:f.pivot,ref:f.referenceHeight});
      }
      const samples=[];for(let d=0;d<LANES[0].len;d+=10){const p=posAt(d,0);const v=DKappearance.direction(p.dx,p.dy);if(!samples.find(s=>s.view===v)){e.dist=d;e.artDirection=v;currentEnemyFrame(e);samples.push({view:v,actual:e.renderView,flip:enemyFlip(e)});}}
      return{frames:result,path:samples};
    });
    assert.ok(report.directions.frames.every(f=>f.view===f.frameView));assert.equal(new Set(report.directions.path.map(r=>r.view)).size,3);
    report.checks.push('boss secondary code/0.7 drawing scale and all three path directions');
    report.spectator=await test.page.evaluate(()=>{
      DK.net={rivals:{peer:{w:20}},status:'alive'};VIEW.pid='peer';
      const i=DKCONTENT.bases.findIndex(b=>b.id===DKCONTENT.INFINITY.monsterFor(1).base.id),boss=DKCONTENT.bossBases.findIndex(b=>b.id===buildInfinityWave(20)[0].type);
      const en=`${i},120,9,1,240;${1000+boss},220,8,20,16;${1000+boss},320,7,121,128`;
      mpViewBuild({w:20,sp:1,o:'p',ll:LANES[0].len,l:20,f:3,tw:[[0,7,1],[1,20,3]],en});
      const before=VIEW.enemies.map(e=>({code:e.appearanceCode,phase:e.viewPhase,dist:e.dist,size:e.def.size,draw:e.drawHeight}));
      mpViewAdvance(.1);const after=VIEW.enemies.map(e=>({code:e.appearanceCode,phase:e.viewPhase,dist:e.dist,art:e.artAssetId}));
      const towers=VIEW.towers.map(t=>t.face);refreshDirectionalDemand(true);
      return{before,after,towers};
    });
    assert.deepEqual(report.spectator.after.map(e=>e.code),[1,20,121]);assert.deepEqual(report.spectator.towers,[7,20]);assert.ok(report.spectator.after.every((e,i)=>e.dist>report.spectator.before[i].dist&&e.phase!==report.spectator.before[i].phase));
    await test.page.waitForFunction(()=>['w001','b020','b020-2'].every(id=>window.__spectatorDraws[id]?.some(f=>f.key.endsWith(':sheet'))),null,{timeout:30000});
    report.spectator.drawn=await test.page.evaluate(()=>window.__spectatorDraws);
    await test.page.screenshot({path:path.join(out,'actual-spectator-duo.png')});
    await test.page.evaluate(()=>{VIEW.pid=null;DK.net=null;});
    report.checks.push('old-wave W1 + main/secondary W20 retain identity concurrently in spectator; rank7/20; advancing phase');
    report.towerPhysics=await test.page.evaluate(()=>{
      DK.enemies=[];DK.towers=[];DK.projs=[];DK.wave=1;spawnEnemy(buildInfinityWave(1)[0]);const e=DK.enemies[0];e.dist=200;e.hp=e.max=1e9;const ep=epos(e);
      const t={face:9,def:TOWER_DEFS[9],lvl:1,skin:0,spot:0,x:ep.x-50,y:ep.y+20,cd:0,kick:0};
      const run=metadata=>{const saved=DKCONTENT.STAR_TOWER_EMITTERS;DKCONTENT.STAR_TOWER_EMITTERS=metadata;DK.projs=[];DK.fxs=[];t.cd=0;t.kick=0;towerFire(t,0);const p=DK.projs[0];if(!p)throw Error('no projectile');const start={logical:[p.x,p.y],draw:projectileDrawPosition(p),muzzle:DK.fxs.find(f=>f.kind==='muzzleFlash')};
        const path=[];for(let i=0;i<5;i++){updateVisuals(.01);path.push([p.x,p.y,p.gone||false]);}const end=projectileDrawPosition({...p,visualAge:.1});DKCONTENT.STAR_TOWER_EMITTERS=saved;return{start,path,end,physical:[p.x,p.y]};};
      const configured=run(DKCONTENT.STAR_TOWER_EMITTERS),legacy=run({});return{configured,legacy};
    });
    assert.deepEqual(report.towerPhysics.configured.path,report.towerPhysics.legacy.path);assert.deepEqual(report.towerPhysics.configured.start.logical,report.towerPhysics.legacy.start.logical);
    assert.equal(report.towerPhysics.configured.start.draw.x,report.towerPhysics.configured.start.muzzle.x);assert.equal(report.towerPhysics.configured.end.x,report.towerPhysics.configured.physical[0]);
    report.checks.push('star emitter changes initial draw/flash only; exact projectile physical trajectory identical');
    report.cacheAfter=await test.page.evaluate(()=>DKART.state());assert.ok(report.cacheAfter.peakTrackedBytes<=96*1024*1024);assert.equal(report.cacheAfter.maxRunning,2);
    assert.deepEqual(test.errors,[]);await test.page.close();
    const offline=await open(browser,{offline:true});await collectLogical(offline.page);
    await offline.page.evaluate(()=>{DK.enemies=[];DK.wave=11;spawnEnemy(buildInfinityWave(11)[0]);refreshDirectionalDemand(true);});
    await offline.page.waitForFunction(()=>DKART.state().failures>0&&!DKART.state().running);
    report.offline=await offline.page.evaluate(()=>{const e=DK.enemies[0],fr=currentEnemyFrame(e);return{identity:e.artAssetId,frame:fr.assetId,key:fr.cacheKey,view:fr.view,legacy:e.art,cache:DKART.state()};});
    assert.equal(report.offline.frame,'w011');assert.match(report.offline.key,/:fallback$/);assert.ok(report.offline.cache.failures>0);assert.deepEqual(offline.errors,[]);
    report.offline.directions=await offline.page.evaluate(()=>['w011','b020','b020-2','b100','w101'].filter(id=>DKART.entry(id)).flatMap(id=>['side','front','back'].map(view=>{const f=DKART.frame(id,view,.5);return{id,view,actualId:f.assetId,actualView:f.view,key:f.cacheKey,width:f.cv.width};})));
    for(const f of report.offline.directions){assert.equal(f.actualId,f.id);assert.equal(f.actualView,f.view);assert.match(f.key,/:fallback$/);assert.equal(f.width,64);}
    report.checks.push('offline approved W11 uses same-character directional inline still; never legacy');await offline.page.close();
    report.pass=true;
  }finally{fs.writeFileSync(path.join(out,'actual-runtime-contracts.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log('PASS',report.checks);
})().catch(e=>{console.error(e);process.exitCode=1;});
