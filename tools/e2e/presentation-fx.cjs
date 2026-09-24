#!/usr/bin/env node
'use strict';
// Behavioral and rendered-output contracts for rewards and tower feedback.
// Performance/filmstrips live in fx-performance.cjs; this suite checks occlusion,
// continuous time, stable actions, cosmetic RNG separation and attachment.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');
const out = path.resolve(__dirname, '../../gen/e2e/presentation-fx');
fs.mkdirSync(out, { recursive: true });
const report = { pass: false, cases: [] };
const check = (v, message) => assert.ok(v, message);

async function boot(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('dk_coachDone','1'); localStorage.setItem('dk_infHelpSeen','1'); });
  await page.route('**/game.js*', async route => {
    const response = await route.fetch(), source = await response.text();
    const anchor = 'window.DK = S;';
    check(source.split(anchor).length === 2, 'one QA hook anchor');
    await route.fulfill({ response, body: source.replace(anchor, `
      const qaDrawEffects = drawEffects, qaBody = paintTowerBody, qaAdvancePresentation = advancePresentation;
      drawEffects = layer => { window.__paintOrder?.push(layer); return qaDrawEffects(layer); };
      paintTowerBody = (...args) => { window.__paintOrder?.push('tower'); return qaBody(...args); };
      advancePresentation = dt => { if (!window.__qaFreezePresentation) return qaAdvancePresentation(dt); };
      window.__presentationQA={update,advancePresentation:qaAdvancePresentation,draw,drawEffects,relayoutArena,spawnBurst,
        chestReveal,manualChestReady,activeTray,drawChestReveal,drawCenterRoll,rollShow:ROLL_SHOW};
      ` + anchor) });
  });
  await page.goto(gameUrl());
  try { await page.waitForFunction(() => window.DK?.phase === 'title' && window.DKFX, null, { timeout: 30000 }); }
  catch (error) {
    const state=await page.evaluate(() => ({phase:window.DK?.phase,fx:!!window.DKFX,
      loading:document.getElementById('ov-load-txt')?.textContent}));
    throw new Error(`presentation boot failed: ${JSON.stringify({state,errors})}`,{cause:error});
  }
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted=true; DKstartInf('clear'); DK.paused=true; DK.gold=1000000; });
  await page.waitForTimeout(300);
  return {context,page,errors};
}
async function capture(page,name,time=.35) {
  await page.evaluate(time => {
    DK.paused=true; DK.waveActive=true;
    window.__qaFreezePresentation=true;
    for (const f of DK.fxs) f.t=time;
    __presentationQA.draw();
  },time);
  try { await page.screenshot({path:path.join(out,name+'.png')}); }
  finally { await page.evaluate(() => {window.__qaFreezePresentation=false;}); }
}
async function power(page,row,deck=false) {
  const state = await page.evaluate(deck => {
    if (deck) {
      const profile=DKPROGRESSION.defaultProfile(), cards=[1,4,7,13,14];
      for(const face of cards){profile.levels[face]=1;Object.assign(profile.collection.cards[face],{owned:true,class:DKDECKRULES.get(face).baseClass});}
      profile.deck=cards; DKSAVE.progression=profile; DKstartInf('build');
    } else DKstartInf('clear');
    DK.paused=true;DK.gold=1000000;DK.towers=[];DK.fxs=[];DK.texts=[];
    const faces=deck?[1,1,4,7]:[6,7,14,20,5];
    for(let i=0;i<faces.length;i++){DK.heldDie=faces[i];if(!DKplace(i))throw Error('placement');}
    DK.fxs=[];DK.texts=[];
    const ok=DKupgrade(deck?1:6), halos=DK.fxs.filter(f=>f.kind==='towerHalo');
    const at=t=>({x:t.x,y:t.y-32});
    window.__paintOrder=[];__presentationQA.draw();const order=__paintOrder;delete window.__paintOrder;
    return {ok,halos:halos.map(f=>({x:f.x,y:f.y,realtime:f.realtime,size:f.size})),
      targets:DK.towers.filter(t=>deck?t.face===1:t.face>=6).map(at),
      unrelated:DK.towers.filter(t=>deck?t.face!==1:t.face<6).map(at),
      kinds:DK.fxs.map(f=>f.kind),texts:DK.texts.map(t=>t.str),
      notice:document.getElementById('enhance-toast').textContent,order};
  },deck);
  check(state.ok,'power-up succeeds');
  assert.equal(state.halos.length,deck?2:4,'only matching towers receive feedback');
  for(const t of state.targets)check(state.halos.some(f=>f.x===t.x&&f.y===t.y&&f.realtime&&f.size<=90),'compact attached feedback');
  for(const t of state.unrelated)check(!state.halos.some(f=>f.x===t.x&&f.y===t.y),'unrelated tower stays clear');
  check(state.kinds.every(k=>k==='towerHalo'),'power-up uses one bounded composition per tower');
  check(state.notice.includes('파워업')&&!state.texts.some(t=>t.includes('파워업')),'result stays in notice, not across board');
  check(state.order.indexOf('ground')<state.order.indexOf('tower')&&state.order.lastIndexOf('tower')<state.order.indexOf('world')&&state.order.indexOf('world')<state.order.indexOf('reward'),'ground / opaque tower / combat / reward paint order');
  await capture(page,`power-${deck?'deck':'pure'}-${row.name}`);
  row.checks.push(deck?'deck-targets':'power-targets-and-layer-order');
}
async function clocks(page,row) {
  const state=await page.evaluate(()=>{
    DKstartInf('clear');DK.paused=true;DK.gold=1000000;DK.heldDie=6;DKplace(4);DK.fxs=[];DK.texts=[];DKupgrade(6);
    const f=DK.fxs.find(f=>f.kind==='towerHalo');DK.speed=3;
    __presentationQA.rollShow.t=1.8;
    const before=f.t;for(let i=0;i<3;i++)__presentationQA.update(.1);const afterCombat=f.t;
    const resultAfterCombat=__presentationQA.rollShow.t;
    DK.towers[0].kick=1;__presentationQA.draw();__presentationQA.draw();const kickAfterDraw=DK.towers[0].kick;
    __presentationQA.advancePresentation(.1);
    return {before,afterCombat,after:f.t,kickAfterDraw,kickAfterTime:DK.towers[0].kick,resultAfterCombat,resultAfterTime:__presentationQA.rollShow.t};
  });
  assert.equal(state.before,state.afterCombat,'x3 simulation does not advance reward clock');
  check(Math.abs(state.after-state.before-.1)<1e-6,'reward clock advances once');
  assert.equal(state.kickAfterDraw,1,'drawing never changes recoil');
  check(Math.abs(state.kickAfterTime-.73)<1e-6,'recoil follows elapsed seconds');
  assert.equal(state.resultAfterCombat,1.8,'x3 does not shorten landed result display');
  check(Math.abs(state.resultAfterTime-1.7)<1e-6,'landed die and reward follow the same presentation clock');
  row.checks.push('clock-and-draw-purity');
}
async function chest(page,row,kind) {
  const state=await page.evaluate(kind=>{
    DKstartInf('clear');DK.paused=true;DK.gold=1000000;DK.fxs=[];DK.texts=[];
    const ch=DKCONTENT.INFINITY.chest,original=ch.draw;let got;
    try{ch.draw=()=>kind;got=DKchest();}finally{ch.draw=original;}
    const f=DK.fxs.find(f=>f.kind==='chestOpen');
    const tray=__presentationQA.activeTray(), poseAt=t=>DKFX.chestDiePose({...f,t},tray);
    const poses=[.2,.7,1.08,1.55,1.9,2.2].map(poseAt);
    const rolledPose=DKDIE.R.slice(), awardedFace=DKSLOT.final;
    const pictures=[];
    const c=document.createElement('canvas');c.width=420;c.height=400;const g=c.getContext('2d');
    for(let i=0;i<24;i++){g.clearRect(0,0,420,400);DKFX.drawChest(g,{...f,x:210,y:220,t:.2+i/60});pictures.push(c.toDataURL());}
    const angles=Array.from({length:25},(_,i)=>DKFX.chestPose(.2+i/60,f.dur).lidAngle);
    const frontPixels=[];
    for(const color of ['#00ffff','#ff00ff']){
      g.clearRect(0,0,420,400); DKFX.drawChest(g,{...f,x:210,y:220,t:.72,color});
      frontPixels.push(Array.from(g.getImageData(165,252,85,15).data));
    }
    return {got,kinds:DK.fxs.map(f=>f.kind),realtime:f.realtime,size:f.size,dur:f.dur,
      dieKind:f.dieKind,matchingR:f.dieR.every((v,i)=>v===rolledPose[i]),awardedFace,
      pendingKind:DKSLOT.kind,pendingPhase:DKSLOT.phase,ready:__presentationQA.manualChestReady(),poses,tray,
      unique:new Set(pictures).size,maxStep:Math.max(...angles.slice(1).map((a,i)=>Math.abs(a-angles[i]))),
      frontOpaque:frontPixels[0].filter((_,i)=>i%4===3).every(a=>a===255),
      frontUnaffected:JSON.stringify(frontPixels[0])===JSON.stringify(frontPixels[1]),
      noticeVisible:!document.getElementById('chest-reveal').classList.contains('hidden')};
  },kind);
  assert.equal(state.got,kind);assert.deepEqual(state.kinds,['chestOpen'],'chest contains its own occluded light without a foreground column');
  check(state.realtime&&state.size<=270&&state.dur>=2.1&&state.dur<=2.5,'bounded real-time chest with readable die reveal');
  check(state.dieKind===kind&&state.pendingKind===kind&&state.matchingR,'the actual pending die and its original pose are inside the chest');
  check(state.pendingPhase===-1&&!state.ready&&state.awardedFace===0,'opening neither awards a face nor enables the throw');
  check(state.unique===24&&state.maxStep<.1,'every 60Hz opening sample moves with bounded hinge angle');
  check(state.frontOpaque&&state.frontUnaffected,'colored interior light cannot tint or ghost through the opaque chest front');
  const [closed,emerging,readable,departing,travelling,landed]=state.poses;
  check(!closed.visible&&emerging.visible&&readable.visible,'die rises visibly from inside the opening chest');
  check(readable.y<emerging.y&&departing.y<=readable.y,'die rises smoothly without teleporting');
  check(departing.flight===0&&travelling.flight>0&&landed.flight===1,'one continuous flight begins after readable hold');
  check(Math.hypot(landed.x-state.tray.x,landed.y-state.tray.y)<.01,'same die arrives at actual manual-roll tray');
  check(!state.noticeVisible,'no duplicate DOM popup over the wave banner');
  for (const [label,t] of [['emerge',.72],['read',1.2],['fly',1.85],['land',2.18]])
    await capture(page,`chest-${kind}-${row.name}-${label}`,t);
  row.checks.push(kind+'-physical-die-chest-to-tray');
}
async function enhancement(page,row) {
  const state=await page.evaluate(()=>{
    DKstartInf('clear');DK.paused=true;DK.gold=1000000;DK.heldDie=7;DKplace(5);DK.fxs=[];DK.texts=[];DK.selTower=DK.towers[0];
    const random=Math.random;let result;try{Math.random=()=>0;result=DKenhance();}finally{Math.random=random;}
    const f=DK.fxs.find(f=>f.kind==='towerHalo');
    return{result,face:DK.selTower.face,status:f.status,realtime:f.realtime,kinds:DK.fxs.map(f=>f.kind),notice:document.getElementById('enhance-toast').textContent};
  });
  check(state.result==='up'&&state.face===8&&state.status==='up'&&state.realtime,'success upgrades selected tower with attached feedback');
  assert.deepEqual(state.kinds,['towerHalo'],'success does not stack competing sheet/ring/column effects');
  check(state.notice.includes('★7 → ★8'),'result explains upgrade');
  await capture(page,`enhance-success-${row.name}`,.32);
  row.checks.push('enhancement-success');
}
async function highDie(page,row) {
  const state=await page.evaluate(()=>{
    DKstartInf('clear');DK.paused=true;DK.fxs=[];DK.texts=[];
    const before=[...document.querySelectorAll('#chest-reveal,#enhance-toast')].map(el=>[el.textContent,el.classList.contains('hidden')]);
    DKacquire(20);
    const random=Math.random;let calls=0;
    try{Math.random=()=>{calls++;return .5};__presentationQA.draw();}finally{Math.random=random;}
    return{kinds:DK.fxs.map(f=>f.kind),calls,
      before,after:[...document.querySelectorAll('#chest-reveal,#enhance-toast')].map(el=>[el.textContent,el.classList.contains('hidden')])};
  });
  assert.deepEqual(state.kinds,[],'high-result reward does not spawn a second giant die');
  assert.deepEqual(state.after,state.before,'high-result reward adds no new DOM caption');
  assert.equal(state.calls,0,'rendering never consumes gameplay RNG');
  row.checks.push('no-second-high-die-and-rng-isolation');
}
async function relayout(page,row) {
  const state=await page.evaluate(()=>{
    DKstartInf('clear');DK.paused=true;DK.gold=1000000;DK.heldDie=6;DKplace(4);DK.fxs=[];DKupgrade(6);
    const hud=document.getElementById('hud'),height=hud.style.height;const key=DK.mapKey;let result;
    try{hud.style.height=`${hud.offsetHeight+70}px`;__presentationQA.relayoutArena(key,true);
      const f=DK.fxs.find(f=>f.kind==='towerHalo'),t=DK.towers[0];result=[f.x===t.x,f.y===t.y-32,f.anchorTower===t,f.realtime];
    }finally{hud.style.height=height;__presentationQA.relayoutArena(key,true);}return result;
  });
  check(state.every(Boolean),'feedback follows tower when phone HUD layout changes');row.checks.push('portrait-reanchor');
}
(async()=>{
  const browser=await launchBrowser();
  try{
    for(const [name,viewport] of [['desktop',{width:1240,height:860}],['phone',{width:390,height:844}]]){
      const row={name,checks:[]};report.cases.push(row);const {context,page,errors}=await boot(browser,viewport);
      try{await power(page,row);await clocks(page,row);await chest(page,row,'d8');await chest(page,row,'d20');await enhancement(page,row);await highDie(page,row);await power(page,row,true);if(name==='phone')await relayout(page,row);assert.deepEqual(errors,[]);console.log('PASS',name,row.checks.join(', '));}finally{await context.close();}
    }
    report.pass=true;
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
