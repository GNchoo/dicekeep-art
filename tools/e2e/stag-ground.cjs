// Focused stag movement regression. All art/logic comes from the selected HTTP server.
// The sole game-source addition exports existing closure functions for fixtures.
// E2E_BASE_URL=https://dicekeep.cgn3731.workers.dev/ node tools/e2e/stag-ground.cjs baseline --legacy
// E2E_BASE_URL=http://localhost:8138/ node tools/e2e/stag-ground.cjs after --compare=baseline
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launchBrowser}=require('./browser.cjs');
const repo=path.resolve(__dirname,'../..'),label=process.argv[2]||'after',legacy=process.argv.includes('--legacy');
const smoke=process.argv.includes('--smoke'); // W20 actual down/spectator; W121/222 spawn; W4 flight.
const compare=process.argv.find(x=>x.startsWith('--compare='))?.slice(10);
assert.match(label,/^[a-z0-9_-]+$/i);assert.ok(process.env.E2E_BASE_URL,'Explicit E2E_BASE_URL required');
const base=new URL(process.env.E2E_BASE_URL);if(!base.pathname.endsWith('/'))base.pathname+='/';
const root=path.join(repo,'gen/e2e/stag-ground'),out=path.join(root,label);assert.ok(!fs.existsSync(path.join(out,'report.json')),'Preserve existing report; choose a new label');fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={version:1,label,legacy,smoke,baseUrl:base.href,startedAt:new Date().toISOString(),checkerSha256:sha(fs.readFileSync(__filename)),
  scope:'HTTP game source plus closure exports only; no logic/art response replacement. Actual buildInfinityWave/spawnEnemy select combat/identity. Isolated public test state positions actors on real lane straights. Draw observation subtracts actual road camera transform. Spectator uses actual serialized enemy rows and mpViewBuild, without a remote room.',
  pixelLimit:'A rendered pivot at the authored floor is a runtime grounding check, not independent proof of anatomical foot contact in every textured pose.',
  anchorToleranceWorldPx:.001,anchorToleranceReason:'Canvas getTransform translations are float32-quantized while path coordinates are JS doubles. Baseline measured horizontal residual 0.000007397px; tolerance remains one-thousandth of a game pixel.',
  source:{},artResponses:[],cases:[],spectator:[],errors:[],optionalAudio404:[],pass:false};
const flush=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
function observer(){
  const q=window.__stagQA={rows:[],id:null,sequence:0},frames=new WeakMap(),serials=new WeakMap();let serial=0,outer=new DOMMatrix();
  const frame=DKART.frame,draw=CanvasRenderingContext2D.prototype.drawImage;
  DKART.frame=function(...args){const f=frame.apply(this,args);if(f){if(!serials.has(f.cv))serials.set(f.cv,++serial);frames.set(f.cv,{id:f.assetId,key:f.cacheKey,view:f.view,phase:args[2],pivot:f.pivot,serial:serials.get(f.cv)});}return f;};
  CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
    const result=draw.call(this,source,...args);if(this.canvas.id!=='game')return result;
    if(args.length===4&&args[0]===-3&&args[1]===-3)outer=this.getTransform();
    const f=frames.get(source);if(!f||f.id!==q.id)return result;
    const e=DK.enemies.find(e=>e.artAssetId===f.id)||__stagFns.VIEW.enemies.find(e=>e.artAssetId===f.id);if(!e)return result;
    const m=outer.inverse().multiply(this.getTransform()),[x,y,w,h]=args.length===4?args:[args[0],args[1],source.width,source.height];
    const pivot=m.transformPoint({x:x+f.pivot[0]*w/source.width,y:y+f.pivot[1]*h/source.height}),p=__stagFns.epos(e);
    q.rows.push({...f,sequence:++q.sequence,move:e.move,type:e.type,dist:e.dist,walk:e.artWalkDistance,animT:e.animT,groundX:p.x,groundY:p.y+4,pivotX:pivot.x,pivotY:pivot.y,gap:p.y+4-pivot.y,xError:pivot.x-p.x,drawHeight:e.drawHeight,flip:m.a*m.d-m.b*m.c<0});
    if(q.rows.length>1500)q.rows.shift();return result;
  };
}
function position({direction,fraction=.18,spectator=false}){
  const e=spectator?__stagFns.VIEW.enemies[0]:DK.enemies[0],l=DKLANES()[e.lane||0];
  const s=l.segs.find(s=>s.acc>=(l.loopAt||0)&&(direction==='down'?s.by-s.ay>70&&Math.abs(s.bx-s.ax)<1:direction==='up'?s.by-s.ay< -70&&Math.abs(s.bx-s.ax)<1:direction==='right'?s.bx-s.ax>70&&Math.abs(s.by-s.ay)<1:s.bx-s.ax< -70&&Math.abs(s.by-s.ay)<1));
  if(!s)throw Error('Missing '+direction+' straight');e.dist=s.acc+s.len*fraction;e.entranceT=-1;e.stunT=e.slowT=e.flashT=0;DK.shakeT=0;DK.bannerT=0;__stagQA.rows=[];
  return{direction,segment:s,lane:e.lane};
}
async function main(){
  const browser=await launchBrowser();
  try{
    const page=await browser.newPage({viewport:{width:440,height:956}}),pending=[];
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('requestfailed',r=>{if(/\.js(?:\?|$)|\/casual\//.test(r.url()))report.errors.push({url:r.url(),failure:r.failure()});});
    page.on('response',r=>{const u=new URL(r.url());
      if(r.status()>=400){const item={url:r.url(),status:r.status()};if(/\/audio\/bgm-(lobby|battle|boss)\.(ogg|mp3)$/.test(u.pathname))report.optionalAudio404.push(item);else report.errors.push(item);}
      if(r.status()===200&&/\/(directional-art|extreme-art)\.js$/.test(u.pathname))pending.push(r.body().then(b=>{report.source[path.basename(u.pathname)]={url:r.url(),sha256:sha(b)};}));
      if(r.status()===200&&/\/casual\/(?:bosses|enemies)\/(?:inf\/directional|extreme)\//.test(u.pathname))pending.push(r.body().then(b=>report.artResponses.push({url:r.url(),sha256:sha(b),bytes:b.length})));
    });
    await page.route('**/game.js*',async route=>{
      const response=await route.fetch(),bytes=await response.body(),code=bytes.toString('utf8');assert.equal(response.status(),200);
      report.source.game={url:route.request().url(),sha256:sha(bytes),status:200};fs.writeFileSync(path.join(out,'game-http.js'),bytes);
      if(process.env.EXPECTED_GAME_SHA256)assert.equal(sha(bytes),process.env.EXPECTED_GAME_SHA256,'Pinned actual HTTP game source');
      const marker='window.DK = S;';assert.equal(code.split(marker).length,2,'Unique export point');
      const hook='window.__stagFns={buildInfinityWave,spawnEnemy,currentEnemyFrame,refreshDirectionalDemand,epos,enemyAirHeight,mpViewBuild,mpViewAdvance,mpEnemyStream,VIEW};\n';
      const hooked=code.replace(marker,hook+marker);report.source.exportedGameSha256=sha(hooked);await route.fulfill({response,body:hooked});
    });
    await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
    const url=new URL('index.html',base);url.searchParams.set('net','off');url.searchParams.set('unlock','all');url.searchParams.set('stagQA',Date.now());
    await page.goto(url.href);await page.waitForFunction(()=>window.DK&&DK.phase==='title'&&DKART.state().initialized,null,{timeout:120000});
    await page.click('#ov-btn');await page.evaluate(()=>{DKstartInf('extreme');DK.muted=true;DK.speed=1;DK.lives=99999;DK.paused=true;});await page.evaluate(observer);
    async function create(wave,role){
      return page.evaluate(({wave,role})=>{
        DK.net=null;__stagFns.VIEW.pid=null;__stagFns.VIEW.enemies=[];DK.enemies=[];DK.towers=[];DK.projs=[];DK.spawnQ=[];DK.wave=wave;DK.waveActive=false;DK.autoT=999;DK.paused=true;
        const queue=__stagFns.buildInfinityWave(wave);for(const item of queue)__stagFns.spawnEnemy(item);
        const summarize=e=>({id:e.artAssetId,type:e.type,move:e.move,lane:e.lane,size:e.def.size,speed:e.def.speed,spdMult:e.spdMult,hp:e.hp,gold:e.gold,armor:e.armor,drawHeight:e.drawHeight,role:e.bossRole});
        const initial=DK.enemies.map(summarize),e=DK.enemies.find(e=>e.bossRole===role);DK.enemies=[e];DK.spawnQ=[];e.hp=e.max=1e12;e.entranceT=-1;DK.shakeT=0;DK.fxs=[];DK.bannerT=0;__stagQA.id=e.artAssetId;
        const f=__stagFns.currentEnemyFrame(e),entry=DKART.entry(e.artAssetId);
        return{wave,role,id:e.artAssetId,initial,cold:{move:e.move,frameKey:f.cacheKey,airHeight:__stagFns.enemyAirHeight(e,__stagFns.epos(e),f)},entry:{id:entry.assetId,locomotion:entry.locomotion,cycleStride:entry.cycleStride,referenceHeight:entry.referenceHeight,views:Object.fromEntries(Object.entries(entry.views).map(([k,v])=>[k,{frames:v.frames,cols:v.cols,rows:v.rows,cell:v.cell,pivot:v.pivot,still:v.still,sheet:v.sheet}]))},directions:[]};
      },{wave,role});
    }
    async function sample(c,direction,expectMove){
      const view=direction==='down'?'front':direction==='up'?'back':'side',frames=c.entry.views[view].frames;
      const lane=await page.evaluate(position,{direction});await page.evaluate(()=>{DK.paused=false;});
      await page.waitForFunction(({view,frames,flip})=>new Set(__stagQA.rows.filter(r=>r.view===view&&r.key.endsWith(':sheet')&&r.flip===flip).map(r=>r.serial)).size>=frames,{view,frames,flip:direction==='left'},{timeout:20000});
      const rows=await page.evaluate(({view,flip})=>{DK.paused=true;return __stagQA.rows.filter(r=>r.view===view&&r.key.endsWith(':sheet')&&r.flip===flip);},{view,flip:direction==='left'});
      assert.equal(new Set(rows.map(r=>r.serial)).size,frames);assert.ok(rows.at(-1).dist>rows[0].dist);assert.ok(rows.at(-1).walk>rows[0].walk);assert.ok(rows.every(r=>r.move===expectMove));
      const maxAbsGap=Math.max(...rows.map(r=>Math.abs(r.gap))),minGap=Math.min(...rows.map(r=>r.gap));
      c.pendingSample={direction,view,maxAbsGap,minGap,maxAbsXError:Math.max(...rows.map(r=>Math.abs(r.xError))),first:rows[0],last:rows.at(-1)};flush();
      if(expectMove==='ground')assert.ok(maxAbsGap<report.anchorToleranceWorldPx,c.id+' ground pivot gap '+maxAbsGap);
      if(expectMove==='air'&&direction==='down')assert.ok(minGap>30,c.id+' actual flight should remain visibly elevated');
      assert.ok(Math.max(...rows.map(r=>Math.abs(r.xError)))<report.anchorToleranceWorldPx);
      const item={direction,view,frames,observed:rows.length,maxAbsGap,minGap,first:rows[0],last:rows.at(-1),lane};
      delete c.pendingSample;
      c.directions.push(item);const file=`w${c.wave}-${c.id}-${direction}.png`;await page.screenshot({path:path.join(out,file)});item.screenshot=file;
    }
    for(const wave of [20,121,222]){
      const c=await create(wave,1);report.cases.push(c);assert.equal(c.id,wave===20?'b020-2':'b121-2');assert.equal(c.entry.locomotion,'legged');
      const expected=legacy&&wave===20?'air':'ground';assert.equal(c.cold.move,expected);
      if(expected==='ground')assert.equal(c.cold.airHeight,0,'Ground before optional texture readiness');
      if(smoke&&wave!==20){flush();console.log('STAG SPAWN PASS',wave,expected);continue;}
      for(const direction of smoke?['down']:['down','right','left','up'])await sample(c,direction,expected);
      // Serialize this exact real spawn and rebuild it via the production spectator path.
      const data=await page.evaluate(()=>{const e=DK.enemies[0];return{en:__stagFns.mpEnemyStream(),w:DK.wave,ll:DKLANES()[e.lane||0].len,sp:1,o:'p',l:20,f:1,tw:[]};});
      await page.evaluate(data=>{DK.net={rivals:{peer:{w:data.w}},status:'alive'};__stagFns.VIEW.pid='peer';__stagFns.mpViewBuild(data);DK.enemies=[];DK.paused=true;},data);
      await page.evaluate(position,{direction:'down',fraction:.45,spectator:true});
      await page.evaluate(()=>{__stagQA.rows=[];__stagFns.refreshDirectionalDemand(true);});
      await page.waitForFunction(()=>__stagQA.rows.some(r=>r.view==='front'&&r.key.endsWith(':sheet')),null,{timeout:15000});
      const spectator=await page.evaluate(()=>{const e=__stagFns.VIEW.enemies[0],row=__stagQA.rows.at(-1);return{wave:DK.wave,id:e.artAssetId,move:e.move,row};});
      assert.equal(spectator.id,c.id);assert.equal(spectator.move,expected);if(expected==='ground')assert.ok(Math.abs(spectator.row.gap)<report.anchorToleranceWorldPx);
      report.spectator.push(spectator);await page.screenshot({path:path.join(out,`w${wave}-spectator.png`)});flush();console.log('STAG PASS',wave,expected,(smoke?'down':'4 directions')+' + spectator');
    }
    const flight=await create(4,0);report.flight=flight;assert.equal(flight.id,'w004');assert.equal(flight.cold.move,'air');await sample(flight,'down','air');
    await Promise.all(pending);
    if(compare){
      const before=JSON.parse(fs.readFileSync(path.join(root,compare,'report.json'),'utf8'));report.comparison={label:compare,unchangedSpawnStats:0,unchangedArtResponses:0};
      for(const file of ['directional-art.js','extreme-art.js'])assert.equal(report.source[file].sha256,before.source[file].sha256,file+' must not change');
      for(const c of [...report.cases,flight]){
        const old=c.wave===4?before.flight:before.cases.find(x=>x.wave===c.wave);assert.deepEqual(c.entry,old.entry,'Authored art metadata unchanged');
        for(let i=0;i<c.initial.length;i++){const strip=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['move','lane'].includes(k)));assert.deepEqual(strip(c.initial[i]),strip(old.initial[i]),'Other spawn fields unchanged');report.comparison.unchangedSpawnStats++;}
      }
      for(const row of report.artResponses){const old=before.artResponses.find(r=>new URL(r.url).pathname===new URL(row.url).pathname);if(old){assert.equal(row.sha256,old.sha256,'Art bytes must be unchanged');report.comparison.unchangedArtResponses++;}}
    }
    assert.deepEqual(report.errors,[]);report.pass=true;
  }catch(e){report.errors.push(e.stack||String(e));process.exitCode=1;}
  finally{report.finishedAt=new Date().toISOString();flush();await browser.close();console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,source:report.source.game,output:out,errors:report.errors}));}
}
main();
