// Real checked-in directional PNGs through game spawn, loader and canvas rendering.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {launchBrowser,gameUrl,outputPath,watchArtErrors}=require('./browser.cjs');
process.env.E2E_OUTPUT_DIR ||= 'gen/e2e/directional-real';
(async()=>{
 const pilot=process.argv.includes('--pilot'),phone=process.argv.includes('--phone');
 const maxArg=process.argv.find(x=>x.startsWith('--max-wave=')),maxWave=maxArg?Number(maxArg.split('=')[1]):101;
 const minArg=process.argv.find(x=>x.startsWith('--min-wave=')),minWave=minArg?Number(minArg.split('=')[1]):1;
 assert.ok(Number.isInteger(maxWave)&&maxWave>=1&&maxWave<=101);
 assert.ok(Number.isInteger(minWave)&&minWave>=1&&minWave<=maxWave);
 const browser=await launchBrowser(), report={pilot,phone,waves:[],errors:[],failures:[]};
 try{
  const context=await browser.newContext({viewport:phone?{width:440,height:956}:{width:1240,height:860}});
  const p=await context.newPage();report.errors=watchArtErrors(p);
  await p.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
  await p.goto(gameUrl());await p.waitForFunction(()=>window.DK&&DK.phase==='title',null,{timeout:120000});
  const manifest=await p.evaluate(()=>({ids:Object.keys(INF_DIRECTIONAL_ART.entries),state:DKART.state()}));
  assert.equal(manifest.state.initialized,true);assert.equal(manifest.state.approvedEntries,manifest.ids.length);
  if(!pilot)assert.equal(manifest.ids.length,110,'Release requires all110 approved identities');
  report.boot=manifest.state;
  await p.click('#ov-btn');
  // Endless keeps W101 alive after the test reduces its spawn queue to one actor.
  // Challenge mode correctly ends as soon as the W101 queue has completed.
  await p.evaluate(()=>{DK.muted=true;DKstartInf('endless');DK.speed=1;DK.gold=90000;DK.lives=99999;});
  report.mode='endless';
  await p.waitForFunction(()=>DK.phase==='playing');
  await p.evaluate(()=>{
   const h=document.getElementById('help-close');if(h)h.click();const c=document.getElementById('coach-skip');if(c)c.click();
   const frame=DKART.frame,lookup=new WeakMap(),serials=new WeakMap(),bounds=new WeakMap();let serial=0;
   DKART.frame=function(...args){const f=frame.apply(this,args);if(f){if(!serials.has(f.cv))serials.set(f.cv,++serial);lookup.set(f.cv,{id:f.assetId,view:f.view,key:f.cacheKey,serial:serials.get(f.cv),phase:args[2]});}return f;};
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(source,...args){const result=draw.call(this,source,...args),f=lookup.get(source);
    if(this.canvas.id==='game'&&f&&window.__capture){const e=DK.enemies.find(e=>e.artAssetId===f.id);if(e){
     if(!bounds.has(source)){const pixels=source.getContext('2d').getImageData(0,0,source.width,source.height).data;let x0=source.width,y0=source.height,x1=0,y1=0;for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(pixels[(y*source.width+x)*4+3]>=16){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}bounds.set(source,{x0,y0,x1,y1});}
     const b=bounds.get(source),m=this.getTransform(),[dx,dy,dw,dh]=args.length===4?args:[args[0],args[1],source.width,source.height];
     const points=[[b.x0,b.y0],[b.x1,b.y0],[b.x0,b.y1],[b.x1,b.y1]].map(([sx,sy])=>{const x=dx+sx*dw/source.width,y=dy+sy*dh/source.height;return{x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};});
     const box={x0:Math.min(...points.map(p=>p.x)),x1:Math.max(...points.map(p=>p.x)),y0:Math.min(...points.map(p=>p.y)),y1:Math.max(...points.map(p=>p.y))};
     const area=Math.max(0,box.x1-box.x0)*Math.max(0,box.y1-box.y0),visibleArea=Math.max(0,Math.min(this.canvas.width,box.x1)-Math.max(0,box.x0))*Math.max(0,Math.min(this.canvas.height,box.y1)-Math.max(0,box.y0));
     const r={...f,d:e.dist,walk:e.artWalkDistance,animT:e.animT,face:e.face,drawHeight:e.drawHeight,logicalSize:e.def.size,matrix:m.toJSON(),args,bounds:box,visibleFraction:area?visibleArea/area:0};window.__lastArtById[f.id]=r;window.__artSamples.push(r);if(window.__artSamples.length>2400)window.__artSamples.shift();}}
    return result;
   };window.__capture=false;window.__artSamples=[];window.__lastArtById={};
  });
  const waves=[...new Set(manifest.ids.map(id=>Number(id.slice(1,4))))].filter(w=>w>=minWave&&w<=maxWave).sort((a,b)=>a-b);
  for(const wave of waves){
   await p.evaluate(w=>{DK.paused=false;DK.enemies=[];DK.spawnQ=[];DK.waveActive=false;DK.wave=w-1;DK.autoT=0;DK.towers=[];DKsync();document.getElementById('wave-btn').disabled=false;window.__capture=false;},wave);
   await p.click('#wave-btn');
   await p.evaluate(()=>{const roles=new Set(DK.enemies.map(e=>e.bossRole||0));DK.spawnQ=DK.spawnQ.filter(item=>{const r=item.bossRole||0;if(roles.has(r))return false;roles.add(r);return true;}).map(item=>({...item,t:0}));});
   await p.waitForFunction(w=>DK.enemies.length>=(w%10===0&&w>=20?2:1),wave,{timeout:15000});
   const ids=manifest.ids.filter(id=>Number(id.slice(1,4))===wave),row={wave,actors:[]};
   for(const id of ids){
    await p.evaluate(id=>{const e=DK.enemies.find(e=>e.artAssetId===id);if(!e)throw new Error('Expected spawn '+id);DK.enemies=[e,...DK.enemies.filter(x=>x!==e)];e.entranceT=-1;e.stunT=0;e.slowT=0;e.hp=e.max=1e12;DK.spawnQ=[];},id);
    const actor={id,directions:[]};
    for(const dir of ['right','down','left','up']){
     report.current={wave,id,direction:dir};
     await p.evaluate(({id,dir})=>{
      const e=DK.enemies.find(e=>e.artAssetId===id),lane=DKLANES()[e.lane||0];
      const seg=lane.segs.find(s=>s.acc>=(lane.loopAt||0)&&(dir==='right'?s.bx-s.ax>50&&Math.abs(s.by-s.ay)<1:dir==='left'?s.bx-s.ax< -50&&Math.abs(s.by-s.ay)<1:dir==='down'?s.by-s.ay>50&&Math.abs(s.bx-s.ax)<1:s.by-s.ay< -50&&Math.abs(s.bx-s.ax)<1));
      if(!seg)throw new Error('No straight lane for '+dir);
      e.dist=seg.acc+seg.len*.18;DK.paused=false;window.__lastArtById={};window.__capture=true;window.__artSamples=[];
     },{id,dir});
     const expected=dir==='down'?'front':dir==='up'?'back':'side';
     try{await p.waitForFunction(({id,view})=>{const f=window.__lastArtById[id];return f?.id===id&&f.view===view&&f.key.endsWith(':sheet');},{id,view:expected},{timeout:15000,polling:'raf'});}catch(error){report.poseFailure=await p.evaluate(id=>({phase:DK.phase,paused:DK.paused,enemy:DK.enemies.find(e=>e.artAssetId===id),samples:window.__artSamples.slice(-120),state:DKART.state()}),id);throw error;}
     // Observe every decoded pose selected by real updates on every straight.
     try{await p.waitForFunction(({id,view})=>new Set(window.__artSamples.filter(x=>x.id===id&&x.view===view&&x.key.endsWith(':sheet')&&x.visibleFraction>=.98).map(x=>x.serial)).size>=INF_DIRECTIONAL_ART.entries[id].views[view].frames,{id,view:expected},{timeout:12000,polling:'raf'});}catch(error){report.poseFailure=await p.evaluate(id=>({phase:DK.phase,paused:DK.paused,enemy:DK.enemies.find(e=>e.artAssetId===id),samples:window.__artSamples.slice(-120),state:DKART.state()}),id);throw error;}
     const observed=await p.evaluate(({id,view,dir})=>{const rows=window.__artSamples.filter(x=>x.id===id&&x.view===view&&x.key.endsWith(':sheet')&&x.visibleFraction>=.98),last=rows.at(-1);return{direction:dir,view,framesSeen:new Set(rows.map(r=>r.serial)).size,minVisibleFraction:Math.min(...rows.map(r=>r.visibleFraction)),first:rows[0],last,cache:DKART.state().trackedBytes};},{id,view:expected,dir});
     assert.ok(observed.last.walk>observed.first.walk||observed.last.animT>observed.first.animT,id+' motion progresses');
     assert.equal(observed.last.face,dir==='left'?-1:dir==='right'?1:observed.last.face);
     actor.directions.push(observed);
     if((pilot||wave===1||wave===100||wave===101)&&dir==='down')await p.screenshot({path:outputPath((phone?'phone':'desktop')+'-'+id+'-down.png')});
    }
    // Stun preserves accumulated phase and render; resume must continue from it.
    const before=await p.evaluate(id=>{const e=DK.enemies.find(e=>e.artAssetId===id);e.stunT=5;return{walk:e.artWalkDistance,animT:e.animT};},id);
    await p.waitForTimeout(180);
    const after=await p.evaluate(id=>{const e=DK.enemies.find(e=>e.artAssetId===id),r={walk:e.artWalkDistance,animT:e.animT};e.stunT=0;return r;},id);
    assert.deepEqual(after,before,id+' stun must preserve phase');actor.stun=after;
    row.actors.push(actor);
   }
   report.waves.push(row);console.log('art-wave',wave,ids.join(','));
  }
  report.final=await p.evaluate(()=>DKART.state());assert.ok(report.final.maxRunning<=2);assert.ok(report.final.peakTrackedBytes<=96*1024*1024);assert.deepEqual(report.errors,[]);
  report.passed=true;
 }catch(e){report.failures.push(e.stack||String(e));report.passed=false;process.exitCode=1;console.error(e);}
 finally{fs.writeFileSync(outputPath('directional-real-art-'+(phone?'phone':'desktop')+(pilot?'-pilot':'')+'.json'),JSON.stringify(report,null,2));await browser.close();}
})();
