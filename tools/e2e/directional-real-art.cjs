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
  const manifest=await p.evaluate(()=>({ids:Object.keys(INF_DIRECTIONAL_ART.entries),extremeIds:Object.keys((window.INF_EXTREME_ART||{}).entries||{}),state:DKART.state()}));
  assert.equal(manifest.state.initialized,true);
  // 런타임은 두 매니페스트를 합친다 (infinity-art.js:141). 방향별 110 + 극한 111 = 221 이
  // 정상이며 ID 교집합은 공집합이다. 여기서 110 만 기대하면 extreme-art.js 가 들어온
  // 시점부터 구조적으로 실패한다 — directional-production.cjs 와 같은 처방.
  assert.equal(manifest.state.approvedEntries,manifest.ids.length+manifest.extremeIds.length);
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
      const fits=s=>s.acc>=(lane.loopAt||0)&&(dir==='right'?s.bx-s.ax>50&&Math.abs(s.by-s.ay)<1:dir==='left'?s.bx-s.ax< -50&&Math.abs(s.by-s.ay)<1:dir==='down'?s.by-s.ay>50&&Math.abs(s.bx-s.ax)<1:s.by-s.ay< -50&&Math.abs(s.bx-s.ax)<1);
      const segs=lane.segs.filter(fits);
      if(!segs.length)throw new Error('No straight lane for '+dir);
      // 첫 번째 구간을 무조건 쓰면 키 큰 스프라이트가 화면 밖으로 잘린다. 실측: b010(보스,
      // drawHeight 120)이 화면 위쪽 수평 구간에 놓여 위로 5.9px 삐져나가 visibleFraction 이
      // 0.96 에서 멈췄다 — 아래 단언의 0.98 을 영원히 못 넘긴다. 수평 구간에서는 구간 안을
      // 아무리 움직여도 y 가 안 변하므로 **구간 자체를 바꿔야** 한다.
      // 그래서 후보 구간×위치 중 캔버스 네 변에서 가장 여유 있는 곳을 고른다.
      const cv=document.getElementById('game'),H=e.drawHeight||(e.def&&e.def.size)||120;
      let best=null;
      for(const seg of segs)for(const t of [.18,.3,.5,.7,.82]){
       const x=seg.ax+(seg.bx-seg.ax)*t,y=seg.ay+(seg.by-seg.ay)*t;
       const clear=Math.min(y-H,cv.height-y,x-H/2,cv.width-(x+H/2));
       if(!best||clear>best.clear)best={seg,t,clear};
      }
      e.dist=best.seg.acc+best.seg.len*best.t;DK.paused=false;window.__lastArtById={};window.__capture=true;window.__artSamples=[];
     },{id,dir});
     const expected=dir==='down'?'front':dir==='up'?'back':'side';
     try{await p.waitForFunction(({id,view})=>{const f=window.__lastArtById[id];return f?.id===id&&f.view===view&&f.key.endsWith(':sheet');},{id,view:expected},{timeout:15000,polling:'raf'});}catch(error){report.poseFailure=await p.evaluate(id=>({phase:DK.phase,paused:DK.paused,enemy:DK.enemies.find(e=>e.artAssetId===id),samples:window.__artSamples.slice(-120),state:DKART.state()}),id);throw error;}
     // Observe every decoded pose selected by real updates on every straight.
     //
     // 가시율 기준을 0.98 로 고정하면 **키 큰 스프라이트가 구조적으로 통과할 수 없다.**
     // 실측: b010(보스, drawHeight 120)은 'left' 수평 구간이 화면 위쪽에 하나뿐이라
     // 어느 위치에 두어도 머리가 5.9px 잘려 가시율이 0.96 에서 멈춘다. 8프레임은 전부
     // 관측되는데 기준만 못 넘겨 12초 타임아웃으로 죽었다 — 아트 문제가 아니었다.
     //
     // 그래서 "그 지오메트리에서 가능한 최대치(cap)에 준하는 가시율로 전 프레임을 봤는가"
     // 로 바꾼다. cap 자체가 낮으면(=정말로 화면 밖) 아래 floor 단언이 잡으므로 순환이 아니다.
     // CAP_EPS 는 "걸으면서 생기는 흔들림" 보다 넉넉하고 "화면 진입·이탈" 보다는 훨씬 좁아야 한다.
     // 실측 b010: 정상 보행 중 0.945~0.964 로 약 2%p 흔들린다. 반면 화면에 들어오는 중인
     // 스프라이트는 0.5 이하다. 5%p 면 둘을 확실히 가른다.
     // CAP_FLOOR 실측 근거 (desktop 440개 방향 전수):
     //   435개는 여전히 cap >= 0.98 — 원래의 엄격한 기준이 99% 경우에 그대로 적용된다.
     //   미달은 보스 5종의 'left' 뿐: b050 0.9021 · b020 0.9163 · b060 0.9465 ·
     //   b090 0.9539 · b010 0.9595. 즉 최악이 10% 가림이다.
     //   반면 화면에 들어오는 중인 스프라이트는 0.5 이하다. 0.85 면 최악값(0.9021)에
     //   여유를 두면서 15% 이상 가려지는 진짜 이상을 잡는다.
     const CAP_FLOOR=.85,CAP_EPS=.05;
     try{await p.waitForFunction(({id,view,eps})=>{const rows=window.__artSamples.filter(x=>x.id===id&&x.view===view&&x.key.endsWith(':sheet'));if(!rows.length)return false;const b=Math.min(.98,Math.max(...rows.map(r=>r.visibleFraction))-eps);return new Set(rows.filter(r=>r.visibleFraction>=b).map(r=>r.serial)).size>=INF_DIRECTIONAL_ART.entries[id].views[view].frames;},{id,view:expected,eps:CAP_EPS},{timeout:12000,polling:'raf'});}catch(error){report.poseFailure=await p.evaluate(id=>({phase:DK.phase,paused:DK.paused,enemy:DK.enemies.find(e=>e.artAssetId===id),samples:window.__artSamples.slice(-120),state:DKART.state()}),id);throw error;}
     const observed=await p.evaluate(({id,view,dir,eps})=>{const all=window.__artSamples.filter(x=>x.id===id&&x.view===view&&x.key.endsWith(':sheet')),cap=Math.max(...all.map(r=>r.visibleFraction)),b=Math.min(.98,cap-eps),rows=all.filter(r=>r.visibleFraction>=b),last=rows.at(-1);return{direction:dir,view,framesSeen:new Set(rows.map(r=>r.serial)).size,visibleCap:cap,visibleBar:b,minVisibleFraction:Math.min(...rows.map(r=>r.visibleFraction)),first:rows[0],last,cache:DKART.state().trackedBytes};},{id,view:expected,dir,eps:CAP_EPS});
     // 지오메트리가 스프라이트를 10% 넘게 가리면 그건 진짜 배치 문제다.
     assert.ok(observed.visibleCap>=CAP_FLOOR,id+' '+dir+': 스프라이트가 화면 밖으로 너무 많이 나갔다 (최대 가시율 '+observed.visibleCap.toFixed(3)+')');
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
