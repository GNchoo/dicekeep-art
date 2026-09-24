#!/usr/bin/env node
'use strict';

// Exercise the real throw integrator at each responsive arena size. A manual
// chest die should bounce at the playable floor, not at its starting tray.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, gameUrl } = require('./browser.cjs');

const repro = process.argv.includes('--repro');
const out = path.resolve(__dirname, '../../gen/e2e/die-arena-bounds');
fs.mkdirSync(out, { recursive: true });
const report = { repro, pass: false, samples: [], rotation: [], edgeGrab: null, flyReturn: null };

async function boot(browser) {
  const context = await browser.newContext({ viewport: { width: 1240, height: 860 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1');
    localStorage.setItem('dk_infHelpSeen', '1');
  });
  await page.route('**/game.js*', async route => {
    const response = await route.fetch(), source = await response.text();
    const anchor = 'window.DK = S;';
    assert.equal(source.split(anchor).length, 2, 'single QA hook anchor');
    await route.fulfill({ response, body: source.replace(anchor,
      'const qaDrawPolyDie=drawPolyDie;drawPolyDie=(...a)=>{window.__dieDrawProbe?.push({size:a[3],kind:a[4]});return qaDrawPolyDie(...a)};\n' +
      'const qaFinishSlot=finishSlot;finishSlot=(...a)=>{if(window.__countSlotFinish)window.__slotFinishCount=(window.__slotFinishCount||0)+1;return qaFinishSlot(...a)};\n' +
      'window.__dieBoundsQA={updateDie,advancePresentation,activeTray,manualChestReady,drawDie,dieBounds:()=>typeof dieBounds==="function"?dieBounds():null,dims:()=>[W,H]};\n' + anchor) });
  });
  await page.goto(gameUrl());
  await page.waitForFunction(() => window.DK?.phase === 'title' && window.__dieBoundsQA,
    null, { timeout: 120000 });
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; DKstartInf('clear'); DK.paused = true; });
  return { context, page, errors };
}

async function probe(page, name, viewport, expectedKey) {
  await page.setViewportSize(viewport);
  await page.waitForFunction(key => DK.mapKey === key, expectedKey, { timeout: 12000 });
  const sample = await page.evaluate(name => {
    const QA = __dieBoundsQA;
    DKstartInf('clear'); DK.paused = true; DK.gold = 100000; DK.towers = [];
    // Recreate the genuine pending manual chest roll, including its reveal
    // gate; only the chest grade is selected by this test fixture.
    const ch = DKCONTENT.INFINITY.chest, originalDraw = ch.draw;
    let kind;
    try { ch.draw = () => 'd8'; kind = DKchest(); }
    finally { ch.draw = originalDraw; }
    if (kind !== 'd8') throw Error(`expected d8 purchase, got ${kind}`);
    QA.advancePresentation(2.3);
    if (!DKSLOT.active || DKSLOT.phase !== -1 || DKDIE.state !== 'tray') throw Error('pending manual d8 was lost');
    const [w,h] = QA.dims();
    const canvas = document.querySelector('#game').getBoundingClientRect();
    const zoom = DK.mapKey === 'cInfP' ? Math.max(1,w/Math.max(1,Math.floor(canvas.width))) : 1;
    const pad = 55 * zoom;
    const inset = (DKCONTENT.maps.find(m => m.key === DK.mapKey) || {}).inset || {};
    const expected = { left: pad, right: w - pad, top: Math.min(165, h * .25),
      bottom: Math.min(h - Math.max(125,pad), h - (inset.bottom || 0) - pad) };
    const tray = QA.activeTray(), liveBounds = QA.dieBounds();
    window.__dieDrawProbe=[];QA.drawDie();
    const draw=window.__dieDrawProbe.findLast(p=>p.kind==='d8');
    window.__dieDrawProbe=null;
    const cssDieDiameter = draw ? 2 * draw.size * canvas.width / w : 0;
    const hud = document.querySelector('#hud').getBoundingClientRect();
    const hudTopWorld = (hud.top - canvas.top) * h / canvas.height;

    const launch = (x,y,vx,vy) => {
      Object.assign(DKDIE,{state:'throw',x,y,z:0,vx,vy,vz:0,w:[0,0,0],final:0,face:0,settleT:0});
      DKDIE.R = DKDIE.R.slice();
    };
    // The old portrait code clamps this first step from ~70% of the canvas
    // back to y=526 because it mistakes the tray for the arena floor.
    launch(w / 2, h * .65, 0, 300);
    QA.updateDie(1 / 60);
    const lowerHalf = { startY: h * .65, afterY: DKDIE.y, afterVy: DKDIE.vy };

    const startY = Math.max(expected.top + 24, expected.bottom - 290);
    launch(w / 2, startY, 0, 900);
    let firstBounce = null, maxY = startY, minY = startY, steps = 0;
    for (; steps < 240; steps++) {
      const beforeVy = DKDIE.vy;
      QA.updateDie(1 / 120);
      maxY = Math.max(maxY, DKDIE.y); minY = Math.min(minY, DKDIE.y);
      if (beforeVy > 0 && DKDIE.vy < 0) {
        firstBounce = { y: DKDIE.y, vy: DKDIE.vy, step: steps + 1 };
        break;
      }
      if (DKDIE.state !== 'throw') break;
    }
    return { name, viewport: [innerWidth,innerHeight], mapKey: DK.mapKey,
      canvasSize:[w,h], inset, expected, liveBounds, tray, hudTopWorld, zoom, cssDieDiameter,
      lowerHalf, startY, firstBounce, maxY, minY, steps,
      slotFinal:DKSLOT.final, held:DK.heldDie };
  }, name);
  report.samples.push(sample);
  console.log(name, JSON.stringify(sample));
  return sample;
}

function validate(sample) {
  const { name, expected, liveBounds, tray, lowerHalf, firstBounce, maxY, hudTopWorld, canvasSize, cssDieDiameter } = sample;
  assert.ok(firstBounce, `${name}: die must contact a lower boundary`);
  assert.ok(Math.abs(firstBounce.y - expected.bottom) < 1.1,
    `${name}: first reflection y=${firstBounce.y}, expected playable floor ${expected.bottom}`);
  assert.ok(maxY <= expected.bottom + 1.1, `${name}: die must stay above HUD-safe floor`);
  assert.ok(Math.abs(tray.y - expected.bottom) < 1.1, `${name}: idle tray must share the reachable arena floor`);
  assert.ok(Math.abs(tray.x - Math.max(86,expected.left+12)) < 1.1,
    `${name}: enlarged die is inset from the canvas edge`);
  if (liveBounds) assert.ok(Math.abs(liveBounds.bottom - expected.bottom) < 1.1,
    `${name}: exposed physics boundary and expected safe floor disagree`);
  if (canvasSize[1] > 800) {
    assert.ok(cssDieDiameter >= 80 && cssDieDiameter <= 100,
      `${name}: pending manual d8 must remain visibly about 87 CSS pixels, got ${cssDieDiameter}`);
    assert.ok(lowerHalf.afterY > lowerHalf.startY,
      `${name}: descending die must enter lower half, not jump back to the old tray line`);
    assert.ok(firstBounce.y > canvasSize[1] * .7,
      `${name}: portrait reflection must occur in the lower part of the playfield`);
  }
  if (hudTopWorld < canvasSize[1]) assert.ok(firstBounce.y < hudTopWorld - 30,
    `${name}: die must reflect above the overlapping HUD`);
  assert.equal(sample.slotFinal,0,`${name}: boundary does not assign a reward face`);
  assert.equal(sample.held,0,`${name}: boundary does not grant a tower`);
}

const unit = (value, lo, hi) => (value - lo) / (hi - lo);
function expectedTransition(before, after, rotated) {
  const a = before.bounds, b = after.bounds;
  const u = unit(before.x,a.left,a.right), v = unit(before.y,a.top,a.bottom);
  const du = before.vx / (a.right-a.left), dv = before.vy / (a.bottom-a.top);
  const toPortrait = before.mapKey === 'cInf' && after.mapKey === 'cInfP';
  const uv = !rotated ? [u,v,du,dv]
    : toPortrait ? [1-v,u,-dv,du] : [v,1-u,dv,-du];
  return { x:b.left+uv[0]*(b.right-b.left), y:b.top+uv[1]*(b.bottom-b.top),
    vx:uv[2]*(b.right-b.left), vy:uv[3]*(b.bottom-b.top) };
}

async function readThrow(page) {
  return page.evaluate(() => {
    const d=DKDIE,b=__dieBoundsQA.dieBounds();
    return {mapKey:DK.mapKey,bounds:b,tray:__dieBoundsQA.activeTray(),ready:__dieBoundsQA.manualChestReady(),
      x:d.x,y:d.y,vx:d.vx,vy:d.vy,z:d.z,vz:d.vz,flyT:d.flyT,fromX:d.fromX,fromY:d.fromY,
      historyLength:d.history.length,
      state:d.state,phase:DKSLOT.phase,final:d.final,slotFinal:DKSLOT.final,
      R:d.R.slice(),gold:DK.gold,chests:DK.inf.chests};
  });
}

async function prepareActiveThrow(page) {
  await page.setViewportSize({width:440,height:956});
  await page.waitForFunction(() => DK.mapKey === 'cInfP');
  return page.evaluate(() => {
    DKstartInf('clear');DK.paused=true;DK.gold=100000;
    const ch=DKCONTENT.INFINITY.chest,old=ch.draw;
    try {ch.draw=()=> 'd8';if(DKchest()!=='d8')throw Error('d8 chest purchase');}
    finally {ch.draw=old;}
    __dieBoundsQA.advancePresentation(2.3);
    DKthrow(220,430);
    const b=__dieBoundsQA.dieBounds();
    DKDIE.x=b.left+.27*(b.right-b.left);
    DKDIE.y=b.top+.72*(b.bottom-b.top);
    DKDIE.vx=220;DKDIE.vy=430;DKDIE.z=25;DKDIE.vz=30;
    return {state:DKDIE.state,phase:DKSLOT.phase};
  });
}

async function edgeGrab(page) {
  await page.setViewportSize({width:440,height:956});
  await page.waitForFunction(() => DK.mapKey === 'cInfP');
  const target=await page.evaluate(() => {
    DKstartInf('clear');DK.paused=true;DK.gold=100000;
    const ch=DKCONTENT.INFINITY.chest,old=ch.draw;
    try {ch.draw=()=> 'd8';if(DKchest()!=='d8')throw Error('d8 chest purchase');}
    finally {ch.draw=old;}
    __dieBoundsQA.advancePresentation(2.3);
    window.__dieDrawProbe=[];__dieBoundsQA.drawDie();
    const draw=window.__dieDrawProbe.findLast(p=>p.kind==='d8');
    window.__dieDrawProbe=null;
    const canvas=document.querySelector('#game'),rect=canvas.getBoundingClientRect();
    return {ready:DKSLOT.phase===-1&&DKDIE.state==='tray',
      x:rect.left+(DKDIE.x+draw.size*.9)*rect.width/canvas.width,
      y:rect.top+DKDIE.y*rect.height/canvas.height,
      screenRadius:draw.size*rect.width/canvas.width,
      hitWorldOffset:draw.size*.9};
  });
  assert.ok(target.ready,'portrait d8 must be available at the tray before grab');
  await page.mouse.move(target.x,target.y);
  await page.mouse.down();
  const before=await readThrow(page);
  await page.setViewportSize({width:1240,height:860});
  await page.waitForFunction(() => DK.mapKey === 'cInf');
  const after=await readThrow(page);
  report.edgeGrab={target,before,after};
  console.log('portrait-edge-grab',JSON.stringify(report.edgeGrab));
  if (!repro) {
    assert.equal(before.state,'grab','pointer near enlarged visible d8 edge grabs the actual die');
    assert.ok(before.historyLength>0,'physical grab records the pointer history');
    assert.deepEqual([after.state,after.phase,after.final,after.slotFinal,after.ready,after.historyLength],
      ['tray',-1,0,0,true,0],'rotation cancels an in-progress grab back to the ready tray');
    assert.deepEqual(after.R,before.R,'cancelled grab preserves the printed die orientation');
    assert.deepEqual([after.gold,after.chests],[before.gold,before.chests],
      'cancelling the grab neither spends gold nor buys another chest');
    assert.ok(Math.hypot(after.x-after.tray.x,after.y-after.tray.y)<1,
      'cancelled die is placed on the new landscape tray');
  }
  await page.mouse.up();
}

async function flyReturn(page) {
  await page.setViewportSize({width:440,height:956});
  await page.waitForFunction(() => DK.mapKey === 'cInfP');
  const started=await page.evaluate(() => {
    DKstartInf('clear');DK.paused=true;DK.gold=100000;
    const ch=DKCONTENT.INFINITY.chest,old=ch.draw;
    try {ch.draw=()=> 'd8';if(DKchest()!=='d8')throw Error('d8 chest purchase');}
    finally {ch.draw=old;}
    __dieBoundsQA.advancePresentation(2.3);
    DKthrow(900,-300);
    let frames=0;
    for(;frames<900&&DKDIE.state!=='fly';frames++) __dieBoundsQA.updateDie(1/60);
    if(DKDIE.state!=='fly')throw Error(`physical d8 did not reach return flight in ${frames} frames`);
    for(let i=0;i<9;i++) __dieBoundsQA.updateDie(1/60);
    return {frames,state:DKDIE.state,face:DKDIE.final,slotFace:DKSLOT.final,
      pose:DKDIE.R.slice(),held:DK.heldDie};
  });
  const before=await readThrow(page);
  await page.setViewportSize({width:1240,height:860});
  await page.waitForFunction(() => DK.mapKey === 'cInf');
  const after=await readThrow(page), expected=expectedTransition(before,after,true);
  const progression=await page.evaluate(() => {
    const at=[DKDIE.x,DKDIE.y];
    __dieBoundsQA.updateDie(0);
    const zero=[DKDIE.x,DKDIE.y];
    window.__countSlotFinish=true;window.__slotFinishCount=0;
    __dieBoundsQA.updateDie(.4);
    const awarded={state:DKDIE.state,held:DK.heldDie,slotActive:DKSLOT.active,
      face:DKDIE.final,slotFace:DKSLOT.final,finishCount:window.__slotFinishCount,
      gold:DK.gold,chests:DK.inf.chests};
    __dieBoundsQA.updateDie(.4);
    awarded.finishCountAfterExtraTick=window.__slotFinishCount;
    window.__countSlotFinish=false;
    return {at,zero,awarded};
  });
  report.flyReturn={started,before,after,expected,progression};
  console.log('fly-return',JSON.stringify({started,
    before:{x:before.x,y:before.y,flyT:before.flyT,final:before.final},
    after:{x:after.x,y:after.y,flyT:after.flyT,final:after.final},expected,progression}));
  if (!repro) {
    assert.equal(started.state,'fly','a real physical d8 reaches its return flight');
    assert.ok(started.face>=1&&started.face<=8&&started.face===started.slotFace,
      'return flight carries the physically selected d8 result');
    assert.equal(started.held,0,'face is still pending during return flight');
    assert.deepEqual([after.state,after.final,after.slotFinal,after.R],
      ['fly',before.final,before.slotFinal,before.R],
      'rotation keeps state, face and printed orientation during return');
    for(const axis of ['x','y']) assert.ok(Math.abs(after[axis]-expected[axis])<1.2,
      `fly-return: ${axis} follows the transformed arena`);
    assert.deepEqual(progression.zero,progression.at,
      'first zero-time physics tick after resize does not jump from the visible position');
    const win=progression.awarded;
    assert.deepEqual([win.state,win.held,win.slotActive,win.face,win.slotFace],
      ['tray',started.face,false,started.face,started.face],
      'return flight grants its existing physical result when it reaches the new tray');
    assert.deepEqual([win.gold,win.chests],[before.gold,before.chests],
      'rotated return charges and draws nothing extra');
    assert.equal(win.finishCount,1,'existing result is granted exactly once');
    assert.equal(win.finishCountAfterExtraTick,1,'later physics ticks do not award a second time');
  }
}

async function transition(page,name,viewport,expectedKey,rotated) {
  const before=await readThrow(page);
  await page.setViewportSize(viewport);
  await page.waitForFunction(key => DK.mapKey === key,expectedKey,{timeout:12000});
  if (before.mapKey === expectedKey) {
    await page.waitForFunction(old => {
      const b=__dieBoundsQA.dieBounds();
      return ['left','right','top','bottom'].some(k => Math.abs(b[k]-old[k])>1);
    },before.bounds,{timeout:12000});
  }
  const after=await readThrow(page), expected=expectedTransition(before,after,rotated);
  const row={name,before,after,expected};report.rotation.push(row);
  console.log(name,JSON.stringify({before:{mapKey:before.mapKey,x:before.x,y:before.y,vx:before.vx,vy:before.vy,bounds:before.bounds},
    after:{mapKey:after.mapKey,x:after.x,y:after.y,vx:after.vx,vy:after.vy,bounds:after.bounds},expected}));
  if (!repro) {
    assert.deepEqual([after.state,after.phase,after.final,after.slotFinal],
      ['throw',-2,0,0],`${name}: active throw and unknown result survive layout`);
    assert.deepEqual(after.R,before.R,`${name}: rotation does not replace the die's printed pose`);
    assert.deepEqual([after.gold,after.chests],[before.gold,before.chests],
      `${name}: rotation neither charges nor redraws a chest`);
    for(const axis of ['x','y','vx','vy']) assert.ok(Math.abs(after[axis]-expected[axis])<1.2,
      `${name}: ${axis} ${after[axis]} should follow rotated arena ${expected[axis]}`);
    assert.ok(after.x>=after.bounds.left&&after.x<=after.bounds.right&&
      after.y>=after.bounds.top&&after.y<=after.bounds.bottom,
      `${name}: die is inside new physics bounds before its next tick`);
    const tick=await page.evaluate(() => {
      __dieBoundsQA.updateDie(1/120);
      return {x:DKDIE.x,y:DKDIE.y,vx:DKDIE.vx,vy:DKDIE.vy,state:DKDIE.state};
    });
    assert.equal(tick.state,'throw',`${name}: relayout does not settle die prematurely`);
    assert.ok(tick.x>after.bounds.left&&tick.x<after.bounds.right&&
      tick.y>after.bounds.top&&tick.y<after.bounds.bottom,
      `${name}: next physics tick continues freely inside new arena`);
    row.tick=tick;
  }
  return row;
}

(async () => {
  const browser = await launchBrowser();
  try {
    const { context, page, errors } = await boot(browser);
    try {
      const portrait = await probe(page, 'portrait', { width: 440, height: 956 }, 'cInfP');
      if (!repro) validate(portrait);
      const landscape = await probe(page, 'rotated-landscape', { width: 1240, height: 860 }, 'cInf');
      if (!repro) validate(landscape);
      const returnPortrait = await probe(page, 'rotated-back-portrait', { width: 440, height: 956 }, 'cInfP');
      if (!repro) validate(returnPortrait);
      await edgeGrab(page);
      const active = await prepareActiveThrow(page);
      assert.deepEqual(active,{state:'throw',phase:-2},'manual physical throw starts before rotation');
      await transition(page,'throw-portrait-to-landscape',{width:1240,height:860},'cInf',true);
      await transition(page,'throw-landscape-resize',{width:800,height:500},'cInf',false);
      await transition(page,'throw-landscape-to-portrait',{width:440,height:956},'cInfP',true);
      await flyReturn(page);
      assert.deepEqual(errors,[],'browser errors');
    } finally { await context.close(); }
    report.pass = !repro;
  } finally {
    fs.writeFileSync(path.join(out,repro?'repro.json':'report.json'),JSON.stringify(report,null,2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
