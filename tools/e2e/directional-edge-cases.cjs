// Real game entities and decoded art; only starting positions/status effects are fixtures.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {launchBrowser,gameUrl,outputPath,watchArtErrors}=require('./browser.cjs');
process.env.E2E_OUTPUT_DIR ||= 'gen/e2e/directional-edges';
(async()=>{
 const browser=await launchBrowser(),phone=process.argv.includes('--phone'),pilot=process.argv.includes('--pilot'),report={phone,pilot,actors:[],failures:[]};
 try{
  const viewport=phone?{width:440,height:956}:{width:1240,height:860},context=await browser.newContext({viewport}),p=await context.newPage();report.errors=watchArtErrors(p);
  await p.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
  await p.goto(gameUrl());await p.waitForFunction(()=>window.DK&&DK.phase==='title',null,{timeout:120000});
  if(!pilot)assert.equal(await p.evaluate(()=>Object.keys(INF_DIRECTIONAL_ART.entries).length),110);
  await p.click('#ov-btn');await p.evaluate(()=>{DK.muted=true;DKstartInf('endless');DK.speed=1;DK.lives=99999;});await p.waitForFunction(()=>DK.phase==='playing');
  await p.evaluate(()=>{document.getElementById('help-close')?.click();document.getElementById('coach-skip')?.click();
   window.__edgeTrace=[];window.__edgeActive=false;
   function capture(){const e=DK.enemies[0];if(e&&window.__edgeActive){window.__edgeTrace.push({d:e.dist,walk:e.artWalkDistance,anim:e.animT,view:e.artDirection,lap:e.laps||0});}requestAnimationFrame(capture);}requestAnimationFrame(capture);
  });
  const ids=await p.evaluate(()=>['w002','w013','w024','w025','w029','w061','b020','b020-2','b100','w101'].filter(id=>INF_DIRECTIONAL_ART.entries[id]?.ready));
  for(const id of ids){
   const wave=Number(id.slice(1,4)),row={id,corners:[]};
   await p.evaluate(w=>{DK.paused=false;DK.enemies=[];DK.spawnQ=[];DK.towers=[];DK.waveActive=false;DK.wave=w-1;DK.autoT=0;DKsync();document.getElementById('wave-btn').disabled=false;},wave);await p.click('#wave-btn');
   await p.evaluate(()=>{DK.spawnQ=DK.spawnQ.map(x=>({...x,t:0}));});
   await p.waitForFunction(id=>DK.enemies.some(e=>e.artAssetId===id),id,{timeout:15000});
   await p.evaluate(id=>{const e=DK.enemies.find(e=>e.artAssetId===id);DK.enemies=[e];DK.spawnQ=[];e.hp=e.max=1e12;e.entranceT=-1;e.stunT=0;e.slowT=0;DK.inf.bossT=1e8;},id);
   const corners=await p.evaluate(()=>{const e=DK.enemies[0],lane=DKLANES()[e.lane||0],straight=lane.segs.filter(s=>s.len>50&&(Math.abs(s.bx-s.ax)<1||Math.abs(s.by-s.ay)<1)&&s.acc>=(lane.loopAt||0));return straight.slice(0,-1).map((s,i)=>({start:s.acc+s.len-5,end:straight[i+1].acc+5}));});
   for(const corner of corners){
    await p.evaluate(c=>{DK.enemies[0].dist=c.start;window.__edgeEnd=c.end;window.__edgeTrace=[];window.__edgeActive=true;},corner);
    await p.waitForFunction(()=>DK.enemies[0].dist>=window.__edgeEnd,null,{timeout:18000,polling:'raf'});
    const trace=await p.evaluate(()=>{window.__edgeActive=false;return window.__edgeTrace;});
    assert.ok(trace.length>2,id+' real corner samples');
    for(let i=1;i<trace.length;i++)assert.ok(trace[i].walk>=trace[i-1].walk,id+' corner reset');
    const views=trace.map(x=>x.view).filter(Boolean).filter((x,i,a)=>!i||x!==a[i-1]);
    assert.equal(views.length,2,id+' exactly one stable view transition per corner');
    const first=trace[0],last=trace.at(-1);assert.ok(Math.abs((last.walk-first.walk)-(last.d-first.d))<1e-6,id+' corner preserves accumulated distance');
    row.corners.push({start:corner.start,end:corner.end,samples:trace.length,views,travel:last.d-first.d});
   }
   const lapBefore=await p.evaluate(()=>{const e=DK.enemies[0],lane=DKLANES()[e.lane||0];e.dist=lane.len-3;e.laps=0;return{walk:e.artWalkDistance,anim:e.animT};});
   await p.waitForFunction(()=>DK.enemies[0].laps===1,null,{timeout:5000,polling:'raf'});
   row.lap=await p.evaluate(()=>{const e=DK.enemies[0];return{walk:e.artWalkDistance,anim:e.animT,lap:e.laps,dead:e.dead};});
   assert.ok(row.lap.walk>lapBefore.walk&&row.lap.walk-lapBefore.walk<20);assert.equal(row.lap.dead,false);
   const before=await p.evaluate(()=>{DK.paused=true;const e=DK.enemies[0];return{walk:e.artWalkDistance,anim:e.animT,size:e.def.size,draw:e.drawHeight};});
   await p.setViewportSize(phone?{width:956,height:440}:{width:440,height:956});await p.waitForTimeout(150);
   const resized=await p.evaluate(()=>{const e=DK.enemies[0];return{walk:e.artWalkDistance,anim:e.animT,size:e.def.size,draw:e.drawHeight};});assert.deepEqual(resized,before,id+' resize must preserve phase and combat size');
   await p.setViewportSize(viewport);await p.waitForTimeout(100);await p.evaluate(()=>{DK.paused=false;});row.resize=resized;
   const rates=[];
   for(const slow of [false,true]){
    const start=await p.evaluate(slow=>{const e=DK.enemies[0];e.slowT=slow?30:0;e.slowPct=.5;return{walk:e.artWalkDistance,t:performance.now()};},slow);await p.waitForTimeout(900);
    const end=await p.evaluate(()=>({walk:DK.enemies[0].artWalkDistance,t:performance.now()}));rates.push((end.walk-start.walk)/(end.t-start.t));
   }
   row.slowRatio=rates[1]/rates[0];assert.ok(row.slowRatio>.30&&row.slowRatio<.70,id+' half-speed slow movement');
   const stunBefore=await p.evaluate(()=>{const e=DK.enemies[0];e.stunT=4;e.slowT=0;return{walk:e.artWalkDistance,anim:e.animT};});await p.waitForTimeout(250);
   const stunAfter=await p.evaluate(()=>{const e=DK.enemies[0];e.stunT=0;return{walk:e.artWalkDistance,anim:e.animT};});assert.deepEqual(stunAfter,stunBefore);row.stun=stunAfter;
   report.actors.push(row);console.log('edge-case',id,'corners',row.corners.length,'slow',row.slowRatio.toFixed(3));
  }
  report.cache=await p.evaluate(()=>DKART.state());assert.ok(report.cache.peakTrackedBytes<=96*1024*1024);assert.ok(report.cache.maxRunning<=2);assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(e){report.passed=false;report.failures.push(e.stack||String(e));process.exitCode=1;console.error(e);}
 finally{fs.writeFileSync(outputPath('directional-edge-cases-'+(phone?'phone':'desktop')+'.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})();
