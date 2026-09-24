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
      const qaDrawEffects = drawEffects, qaBody = paintTowerBody;
      drawEffects = layer => { window.__paintOrder?.push(layer); return qaDrawEffects(layer); };
      paintTowerBody = (...args) => { window.__paintOrder?.push('tower'); return qaBody(...args); };
      window.__presentationQA={update,advancePresentation,draw,drawEffects,relayoutArena,spawnBurst,acquireFxArt,rollShow:ROLL_SHOW};
      ` + anchor) });
  });
  await page.goto(gameUrl());
  await page.waitForFunction(() => window.DK?.phase === 'title' && window.DKFX, null, { timeout: 120000 });
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted=true; DKstartInf('clear'); DK.paused=true; DK.gold=1000000; });
  await page.waitForTimeout(300);
  return {context,page,errors};
}
async function capture(page,name,time=.35) {
  await page.evaluate(time => {
    DK.paused=true; DK.waveActive=true;
    for (const f of DK.fxs) { f.realtime=false; f.t=time; }
    __presentationQA.draw();
  },time);
  await page.screenshot({path:path.join(out,name+'.png')});
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
      unique:new Set(pictures).size,maxStep:Math.max(...angles.slice(1).map((a,i)=>Math.abs(a-angles[i]))),
      frontOpaque:frontPixels[0].filter((_,i)=>i%4===3).every(a=>a===255),
      frontUnaffected:JSON.stringify(frontPixels[0])===JSON.stringify(frontPixels[1]),
      notice:document.getElementById('chest-reveal').textContent};
  },kind);
  assert.equal(state.got,kind);assert.deepEqual(state.kinds,['chestOpen'],'chest contains its own occluded light without a foreground column');
  check(state.realtime&&state.size<=270&&state.dur<=1.6,'bounded real-time chest');
  check(state.unique===24&&state.maxStep<.1,'every 60Hz opening sample moves with bounded hinge angle');
  check(state.frontOpaque&&state.frontUnaffected,'colored interior light cannot tint or ghost through the opaque chest front');
  check(state.notice.includes('상자 개봉'),'visible grade notice');
  await capture(page,`chest-${kind}-${row.name}`,.72);
  row.checks.push(kind+'-continuous-chest');
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
    DKstartInf('clear');DK.paused=true;DK.fxs=[];DK.texts=[];DKacquire(20);
    const f=DK.fxs[0];
    const random=Math.random;let calls=0;
    try{Math.random=()=>{calls++;return .5};__presentationQA.draw();}finally{Math.random=random;}
    return{kinds:DK.fxs.map(f=>f.kind),size:f.size,tier:f.tier,calls};
  });
  assert.deepEqual(state.kinds,['dieReward'],'one coherent high-result composition');check(state.size<=330&&state.tier===4,'bounded highest-tier celebration');assert.equal(state.calls,0,'rendering never consumes gameplay RNG');
  await capture(page,`high-die-${row.name}`,.42);
  row.checks.push('high-die-and-rng-isolation');
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
