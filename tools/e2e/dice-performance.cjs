#!/usr/bin/env node
'use strict';

// Chrome command-submission benchmark, not a physical-phone or GPU benchmark.
// E2E_BASE_URL=http://localhost:8138 node tools/e2e/dice-performance.cjs --label=before
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {launchBrowser, gameUrl} = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..');
const label = process.argv.find(x => x.startsWith('--label='))?.split('=')[1] || 'current';
const kinds = process.argv.find(x => x.startsWith('--kinds='))?.split('=')[1].split(',') || ['d1','d20','d6'];
const visualOnly = process.argv.includes('--visual-only');
const strictCubePixels = process.argv.includes('--strict-cube-pixels');
assert.ok(kinds.length && kinds.every(x=>['d1','d20','d6'].includes(x)), 'known benchmark shapes');
if (!/^[\w-]+$/.test(label)) throw new Error('Invalid evidence label');
const out = path.join(repo, 'gen/e2e/dice-performance', label);
const source = fs.readFileSync(path.join(repo, 'game.js'), 'utf8');
const sharedCube = kinds.includes('d6') && (process.argv.includes('--shared-cube') || /drawCube\(ctx, cx, dy, size, R,[^\n]+'center'\)/.test(source));
const baselinePath = process.argv.find(x => x.startsWith('--baseline='))?.slice(11);
const baseline = baselinePath ? fs.readFileSync(path.resolve(repo, baselinePath), 'utf8') : null;
// Isolated baseline closures prevent its cache/helper declarations from shadowing
// the candidate renderer and support both the older mesh orb and cached orb.
const oldOrb = baseline ? 'const drawOrbBefore=(()=>{' + baseline.slice(baseline.indexOf('const ORB_MESH =') >= 0 ? baseline.indexOf('const ORB_MESH =') : baseline.indexOf('let orbRaster ='), baseline.indexOf('function drawPolyDie(')) + ';return drawOrb;})();' : '';
const oldCube = baseline ? 'const drawCubeBefore=(()=>{' + baseline.slice(baseline.indexOf('const cubePoseCache =') >= 0 ? baseline.indexOf('const cubePoseCache =') : baseline.indexOf('function drawCube('), baseline.indexOf('// ==================== 물리 주사위')) + ';drawCube.surface=typeof drawCubeSurface===\'undefined\'?null:drawCubeSurface;return drawCube;})();' : '';
const digest = x => crypto.createHash('sha256').update(x).digest('hex');
const renderer = source.slice(source.indexOf('const DICE_MAT_TEX ='), source.indexOf('// 현재 자세에서 화면'));
const report = {pass:false, label, gameSha256:digest(source), rendererSha256:digest(renderer),
  scope:'Headless Chrome desktop and phone viewport emulation. Canvas main-thread command submission; CPU4 is synthetic throttling, not physical phone hardware or GPU completion.',
  warmup:visualOnly?0:20, samples:visualOnly?0:60, slotSize:21, cubeSlotSize:17, centerSize:76, strictCubePixels, sharedCube, views:[]};
if (baseline) report.baselineSha256 = digest(baseline);
fs.mkdirSync(out, {recursive:true});
fs.writeFileSync(path.join(out, 'game-source.js'), source);

(async () => {
  const browser = await launchBrowser();
  try {
    for (const profile of [
      {name:'desktop', viewport:{width:1240,height:860}, deviceScaleFactor:1, cpu:1},
      {name:'phone-cpu4', viewport:{width:440,height:956}, deviceScaleFactor:2, isMobile:true, hasTouch:true, cpu:4},
    ]) {
      const {name,cpu,...options} = profile;
      const page = await browser.newPage(options), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const patched = source.replace('window.DK = S;', oldOrb + oldCube + `Object.assign(window,{drawPolyDie,drawCube,drawCubeSurface,diceMaterial,diceMaterialCache,m3axisAngle,faceTopR,topFace,draw,drawSlot,updateSlot,SLOT,ROLL_SHOW,slotTargetR,closeInfHelp,
        renderBuffers:()=>({orb:typeof orbRaster==='undefined'?null:orbRaster,cube:typeof cubePoseCache==='undefined'?null:cubePoseCache}),
        ${baseline ? 'drawOrbBefore,drawCubeBefore,' : ''}
      });window.DK = S;`)
        .replaceAll('requestAnimationFrame(frame);', 'if (!window.__DICE_PERF_PAUSED) requestAnimationFrame(frame);');
      assert.notEqual(patched, source, 'existing debug export seam is present');
      await page.route('**/game.js*', r => r.fulfill({contentType:'application/javascript',body:patched}));
      await page.addInitScript(() => {localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
      await page.goto(gameUrl());
      await page.waitForFunction(() => window.DK && DK.phase === 'title', null, {timeout:120000});
      await page.evaluate(() => { window.__DICE_PERF_PAUSED = true; });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const client = await page.context().newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', {rate:cpu});
      const result = await page.evaluate(async ({kinds,compare,sharedCube}) => {
        const initial = diceMaterial(), refs = [initial.orb,initial.cubeSurface,...initial.cube,...Object.values(initial.faces).flat().map(x=>x.cv)];
        const panel = document.createElement('div');
        panel.style.cssText='position:fixed;inset:0;z-index:100000;background:#292621;color:#efe2c4;overflow:auto;font:14px sans-serif;';
        document.body.append(panel);
        const contexts = [], scale = devicePixelRatio;
        for (const [w,h] of [[82,90],[240,240]]) {
          const c = document.createElement('canvas'); c.width=w*scale;c.height=h*scale;
          c.style.cssText=`width:${w}px;height:${h}px;`;panel.append(c);
          const g=c.getContext('2d');g.setTransform(scale,0,0,scale,0,0);contexts.push(g);
        }
        const stats = xs => {const s=xs.slice().sort((a,b)=>a-b),q=p=>s[Math.min(s.length-1,Math.ceil(s.length*p)-1)];return {n:s.length,p50Ms:q(.5),p95Ms:q(.95),maxMs:s.at(-1),meanMs:s.reduce((a,b)=>a+b,0)/s.length};};
        let calls = null;
        const original = {};
        for (const key of ['drawImage','clip','transform','putImageData']) {
          original[key]=CanvasRenderingContext2D.prototype[key];
          CanvasRenderingContext2D.prototype[key]=function(...args){if(calls)calls[key]=(calls[key]||0)+1;return original[key].apply(this,args);};
        }
        const shapes=[];
        for (const kind of kinds) {
          const pair=[],slot=[],center=[],raf=[],counts=[],raw=[];let previous=0;
          // Match production order: center is drawn by draw(), followed by drawSlot().
          for (let frame=0;frame<80;frame++) {
            const stamp=await new Promise(requestAnimationFrame);
            if(frame>=20&&previous)raf.push(stamp-previous);previous=stamp;
            const R=m3axisAngle(.6,.8,0,frame*.083);
            calls={};const times=[],start=performance.now();
            for (const i of [1,0]) {
              const g=contexts[i],w=g.canvas.width/scale,h=g.canvas.height/scale,t=performance.now();
              g.clearRect(0,0,w,h);
              if(kind==='d6')drawCube(g,w/2,h/2,i?76:17,R,null,0,undefined,i?(sharedCube?'center':'full'):'slot');
              else drawPolyDie(g,w/2,h/2,i?76:21,kind,R,undefined,i?'full':'slot');
              times[i]=performance.now()-t;
            }
            const elapsed=performance.now()-start;
            if(frame>=20){pair.push(elapsed);slot.push(times[0]);center.push(times[1]);counts.push(calls);raw.push({frame,pair:elapsed,slot:times[0],center:times[1]});}
            calls=null;
          }
          const idle=[],fixed=faceTopR(1);
          for(let frame=0;frame<40;frame++){
            await new Promise(requestAnimationFrame);const start=performance.now();
            for(const i of [1,0]){const g=contexts[i],w=g.canvas.width/scale,h=g.canvas.height/scale;g.clearRect(0,0,w,h);if(kind==='d6')drawCube(g,w/2,h/2,i?76:17,fixed,null,0,undefined,i?(sharedCube?'center':'full'):'slot');else drawPolyDie(g,w/2,h/2,i?76:21,kind,fixed,undefined,i?'full':'slot');}
            if(frame>=10)idle.push(performance.now()-start);
          }
          shapes.push({kind,pair:stats(pair),slot:stats(slot),center:stats(center),settledPair:stats(idle),raf:stats(raf),calls:counts.reduce((a,c)=>{for(const k of Object.keys(c)){a[k] ||= {min:Infinity,max:0};a[k].min=Math.min(a[k].min,c[k]);a[k].max=Math.max(a[k].max,c[k]);}return a;},{}),raw});
        }
        let pairedCube = null;
        if (compare && kinds.includes('d6')) {
          const before = [], after = [], delta = [], raw = [];
          const drawPair = (fn, R) => { const t = performance.now(); for (const i of [1,0]) { const g=contexts[i],w=g.canvas.width/scale,h=g.canvas.height/scale;g.clearRect(0,0,w,h);fn(g,w/2,h/2,i?76:17,R,null,0,undefined,i?(sharedCube?'center':'full'):'slot'); } return performance.now()-t; };
          for (let frame=0;frame<80;frame++) {
            await new Promise(requestAnimationFrame);const R=m3axisAngle(.6,.8,0,frame*.083+.037),times={};
            for(const old of frame%2?[false,true]:[true,false])times[old?'before':'after']=drawPair(old?drawCubeBefore:drawCube,R);
            if(frame>=20){before.push(times.before);after.push(times.after);delta.push(times.before-times.after);raw.push({frame,first:frame%2?'after':'before',...times});}
          }
          const capture=fn=>{const methods=['save','restore','beginPath','moveTo','lineTo','clip','drawImage'],saved={},counts={};
            for(const key of methods){saved[key]=CanvasRenderingContext2D.prototype[key];CanvasRenderingContext2D.prototype[key]=function(...args){counts[key]=(counts[key]||0)+1;return saved[key].apply(this,args);};}
            try{drawPair(fn,m3axisAngle(.6,.8,0,.713));}finally{for(const key of methods)CanvasRenderingContext2D.prototype[key]=saved[key];}return counts;};
          pairedCube={order:'alternating baseline/candidate, same R/material/size/density; 20 warmup +60 samples each',before:stats(before),after:stats(after),savedMs:stats(delta),commands:{before:capture(drawCubeBefore),after:capture(drawCube)},raw};
        }
        for(const [key,fn] of Object.entries(original))CanvasRenderingContext2D.prototype[key]=fn;
        panel.remove();
        const final=diceMaterial();
        const buffers=renderBuffers(), frames=buffers.cube?Object.values(buffers.cube).flat().filter(c=>c.cv):[];
        return {devicePixelRatio,shapes,pairedCube,cache:{size:diceMaterialCache.size,sameMaterial:initial===final,sameTextures:refs.every(x=>[final.orb,final.cubeSurface,...final.cube,...Object.values(final.faces).flat().map(x=>x.cv)].includes(x)),count:refs.length,bytes:refs.reduce((n,c)=>n+c.width*c.height*4,0),poseCanvases:frames.length+(buffers.orb?1:0),poseCanvasBytes:frames.reduce((n,c)=>n+c.cv.width*c.cv.height*4,0)+(buffers.orb?buffers.orb.cv.width*buffers.orb.cv.height*4:0),sphereLookupBytes:buffers.orb?buffers.orb.samples.byteLength+buffers.orb.pixels.data.byteLength+buffers.orb.data.byteLength:0}};
      }, {kinds:visualOnly?[]:kinds,compare:!!baseline,sharedCube});
      assert.deepEqual(errors,[]);assert.equal(result.cache.size,1);assert.equal(result.cache.sameMaterial,true);assert.equal(result.cache.sameTextures,true);
      report.views.push({name,...options,cpu,...result});
      console.log(JSON.stringify({name,...result,pairedCube:result.pairedCube?{...result.pairedCube,raw:undefined}:null,shapes:result.shapes.map(({raw,...s})=>s)}));
      if (sharedCube) {
        const sharing = await page.evaluate(async () => {
          const themes=['base','royal','frost','ember'];
          const poses=[...Array.from({length:6},(_,i)=>faceTopR(i+1)),...Array.from({length:4},(_,i)=>m3axisAngle(.6,.8,0,.37+i*.62))];
          const board=document.createElement('canvas');board.width=940;board.height=themes.length*222;
          const bg=board.getContext('2d');bg.fillStyle='#292621';bg.fillRect(0,0,board.width,board.height);bg.font='13px sans-serif';
          const rows=[], density=devicePixelRatio;
          const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w*density;c.height=h*density;const g=c.getContext('2d');g.scale(density,density);return [c,g];};
          const capture=(g,fn)=>{const original={drawImage:g.drawImage,clip:g.clip},counts={blits:0,clips:0};g.drawImage=function(...args){counts.blits++;return original.drawImage.apply(this,args);};g.clip=function(...args){counts.clips++;return original.clip.apply(this,args);};try{fn();}finally{Object.assign(g,original);}return counts;};
          for(let t=0;t<themes.length;t++){
            const theme=themes[t];await DKCOSMETICS.debugUse(theme);const material=diceMaterial();
            bg.fillStyle='#efe2c4';bg.fillText(theme+' · above: original slot3 / below: shared center6 raster · final faces 1–6, then four rotations',8,t*222+16);
            for(let i=0;i<poses.length;i++){
              const R=poses[i],saved=JSON.stringify(R),[large,lg]=canvas(240,240),[old,og]=canvas(82,90),[next,ng]=canvas(82,90);
              drawCube(lg,120,120,76,R,null,0,undefined,'center');
              const calls=capture(ng,()=>drawCube(ng,41,45,17,R.slice(),null,0,undefined,'slot'));
              if(calls.blits!==1||calls.clips!==0)throw Error('Shared slot rebuilt mesh '+theme+'/'+i);
              if(JSON.stringify(R)!==saved)throw Error('Shared draw mutates rotation');
              drawCubeSurface(og,41,45,17,R,material,'slot');
              const a=og.getImageData(0,0,old.width,old.height).data,b=ng.getImageData(0,0,next.width,next.height).data;
              let sum=0,n=0,alphaMismatch=0;for(let k=0;k<a.length;k+=4){if((a[k+3]>127)!==(b[k+3]>127))alphaMismatch++;if(a[k+3]>220&&b[k+3]>220)for(let j=0;j<3;j++){sum+=Math.abs(a[k+j]-b[k+j]);n++;}}
              rows.push({theme,pose:i+1,settledFace:i<6?i+1:null,...calls,opaqueRgbMae:sum/n,alphaMismatchPixels:alphaMismatch});
              bg.drawImage(old,8+i*93,t*222+22,82,90);bg.drawImage(next,8+i*93,t*222+112,82,90);
            }
          }
          await DKCOSMETICS.debugUse('base');
          const [independent,ig]=canvas(82,90),R=m3axisAngle(.2,.4,.8944271909999159,.349);
          const fallback=capture(ig,()=>drawCube(ig,41,45,17,R,null,0,undefined,'slot'));
          if(!fallback.clips||fallback.blits<=1)throw Error('Independent slot lost original mesh fallback');
          const changedMaterial=capture(ig,()=>drawCube(ig,41,45,17,poses.at(-1),null,0,undefined,'slot'));
          if(!changedMaterial.clips)throw Error('Stale material was reused');
          return {rows,fallback,changedMaterial,poseCanvases:renderBuffers().cube.full.length+renderBuffers().cube.slot.length,
            interpretation:'Slot output intentionally downsamples the unchanged full6 surface. Pixel deltas are reported, not asserted equal to the original slot3 raster. All settled pips and rotations require visual review.',png:board.toDataURL('image/png')};
        });
        fs.writeFileSync(path.join(out,name+'-shared-slots.png'),Buffer.from(sharing.png.split(',')[1],'base64'));delete sharing.png;
        report.views.at(-1).sharing=sharing;
      }
      if (baseline) {
        const visual=await page.evaluate(strictCubePixels=>{
          const cv=document.createElement('canvas');cv.width=1200;cv.height=680;const g=cv.getContext('2d');
          g.fillStyle='#292621';g.fillRect(0,0,cv.width,cv.height);g.fillStyle='#efe2c4';g.font='16px sans-serif';
          const poses=[faceTopR(1),m3axisAngle(0,1,0,.65),m3axisAngle(0,1,0,-.65),m3axisAngle(1,0,0,.65),m3axisAngle(.6,.8,0,1.2),faceTopR(6)];
          const pipChecks=[],cubeChecks=[];
          const render=(fn,R)=>{const c=document.createElement('canvas');c.width=c.height=240;fn(c.getContext('2d'),120,120,76,R);return c;};
          for(let i=0;i<poses.length;i++){
            const R=poses[i];
            for(const [row,kind,before] of [[0,'d1',true],[1,'d1',false],[2,'d6',true],[3,'d6',false]]){
              const x=100+i*200,y=65+row*165;
              g.fillText(`${kind} ${before?'before':'after'} pose ${i+1}`,x-82,y-40);
              if(kind==='d1'){if(before)drawOrbBefore(g,x,y+30,50,R);else drawPolyDie(g,x,y+30,50,'d1',R);}
              else (before?drawCubeBefore:drawCube)(g,x,y+30,38,R);
            }
            const a=render((g,x,y,s,R)=>drawPolyDie(g,x,y,s,'d1',R),R), d=a.getContext('2d').getImageData(0,0,240,240).data;
            let n=0,sx=0,sy=0;for(let k=0;k<d.length;k+=4)if(d[k+3]>180&&d[k]>d[k+1]*1.8&&d[k+1]<70&&d[k]>40){n++;sx+=(k/4)%240;sy+=Math.floor(k/4/240);}
            const expected=[120+R[2]*76,120+R[5]*76],error=n?Math.hypot(sx/n+.5-expected[0],sy/n+.5-expected[1]):null;
            if(R[8]>.5&&(!(n>20)||error>3))throw Error('D1 pip no longer follows rotation '+i+': '+error);
            if(R[8]<-.5&&n)throw Error('D1 back face shows a pip');
            pipChecks.push({pose:i,frontNormalZ:R[8],redPixels:n,expected,centroid:n?[sx/n+.5,sy/n+.5]:null,errorPx:error});
            // Compare direct surface renders, without a warm-cached vs cold-direct
            // asymmetry. The separate repeatCache test covers cached compositing.
            const old=render((g,x,y,s,R)=>drawCubeBefore.surface?drawCubeBefore.surface(g,x,y,s,R,diceMaterial(),'full'):drawCubeBefore(g,x,y,s,R),R).getContext('2d').getImageData(0,0,240,240).data,newer=render((g,x,y,s,R)=>drawCubeSurface(g,x,y,s,R,diceMaterial(),'full'),R).getContext('2d').getImageData(0,0,240,240).data;
            let errorSum=0,count=0;for(let k=0;k<old.length;k+=4)if(old[k+3]>220&&newer[k+3]>220){for(let j=0;j<3;j++)errorSum+=Math.abs(old[k+j]-newer[k+j]);count+=3;}
            const mae=errorSum/count;if(mae>8)throw Error('D6 texture changed unexpectedly '+mae);
            const difference=(a,b)=>{let pixels=0,maxChannelDelta=0;for(let k=0;k<a.length;k+=4){let changed=false;for(let j=0;j<4;j++){const d=Math.abs(a[k+j]-b[k+j]);maxChannelDelta=Math.max(maxChannelDelta,d);changed ||= d>0;}if(changed)pixels++;}return {differentPixels:pixels,maxChannelDelta};};
            const slotA=document.createElement('canvas'),slotB=document.createElement('canvas');slotA.width=slotB.width=82;slotA.height=slotB.height=90;
            if(drawCubeBefore.surface)drawCubeBefore.surface(slotA.getContext('2d'),41,45,17,R,diceMaterial(),'slot');else drawCubeBefore(slotA.getContext('2d'),41,45,17,R,null,0,undefined,'slot');
            drawCubeSurface(slotB.getContext('2d'),41,45,17,R,diceMaterial(),'slot');
            cubeChecks.push({pose:i,opaqueRgbMae:mae,fullRgba:difference(old,newer),slotRgba:difference(slotA.getContext('2d').getImageData(0,0,82,90).data,slotB.getContext('2d').getImageData(0,0,82,90).data)});
            if(strictCubePixels&&(cubeChecks.at(-1).fullRgba.differentPixels||cubeChecks.at(-1).slotRgba.differentPixels))throw Error('Direct cube pixels differ '+JSON.stringify(cubeChecks.at(-1)));
          }
          // The tray and center must coexist without evicting each other. A
          // repeated equal-valued matrix must reuse buffers and do no mesh work.
          const cacheCanvas=document.createElement('canvas');cacheCanvas.width=cacheCanvas.height=240;
          const cg=cacheCanvas.getContext('2d'), stable=[faceTopR(1),faceTopR(2)];
          for(let warm=0;warm<3;warm++)for(const R of stable)drawCube(cg,120,120,40,R);
          const buffers=renderBuffers(), refs=buffers.cube?Object.values(buffers.cube).flat().map(c=>c.cv):[];
          const originals={drawImage:cg.drawImage,clip:cg.clip};let blits=0,clips=0;
          cg.drawImage=function(...args){blits++;return originals.drawImage.apply(this,args);};cg.clip=function(...args){clips++;return originals.clip.apply(this,args);};
          for(let i=0;i<100;i++)for(const R of stable)drawCube(cg,120,120,40,R.slice());
          cg.drawImage=originals.drawImage;cg.clip=originals.clip;
          const afterRefs=buffers.cube?Object.values(buffers.cube).flat().map(c=>c.cv):[];
          if(buffers.cube&&(clips||blits!==200||refs.length!==afterRefs.length||!refs.every(c=>afterRefs.includes(c))))throw Error('Settled cube cache rebuilds/allocates');
          return {png:cv.toDataURL('image/png'),pipChecks,cubeChecks,repeatCache:{draws:200,blits,clips,stableBuffers:refs.every(c=>afterRefs.includes(c))}};
        },strictCubePixels);
        fs.writeFileSync(path.join(out,name+'-comparison.png'),Buffer.from(visual.png.split(',')[1],'base64'));delete visual.png;
        report.views.at(-1).visual=visual;
        const actualKind=sharedCube?'d6':'d1';
        await page.evaluate(kind=>{
          DKstartInf('clear');closeInfHelp();DK.enemies=[];SLOT.active=true;SLOT.kind=kind;SLOT.phase=0;SLOT.t=.5;SLOT.R=m3axisAngle(0,1,0,.65);SLOT.final=1;
          draw();drawSlot();
        },actualKind);
        await page.waitForFunction(()=>document.getElementById('inf-help').classList.contains('hidden'));
        // startInfinity changes layout; let its resize observer settle before
        // the explicit paused-game draw, otherwise canvas resizing clears it.
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{draw();drawSlot();resolve();}))));
        await page.screenshot({path:path.join(out,name+'-actual-'+actualKind+'-rolling.png')});
        if(sharedCube){
          const sharedInGame=await page.evaluate(()=>{
            draw();const canvas=document.getElementById('slot-canvas'),g=canvas.getContext('2d'),original=g.drawImage;let blits=0,fromCenter=false;
            g.drawImage=function(image,...args){blits++;fromCenter ||= renderBuffers().cube.full.some(f=>f.shareable&&f.valid&&f.cv===image&&SLOT.R.every((v,i)=>v===f.R[i]));return original.call(this,image,...args);};
            try{drawSlot();}finally{g.drawImage=original;}
            return {blits,fromCenter};
          });
          assert.deepEqual(sharedInGame,{blits:1,fromCenter:true});report.views.at(-1).actualSharedSlot=sharedInGame;
        }
        const settlement=await page.evaluate(()=>{
          const before=JSON.stringify(SLOT.R);draw();drawSlot();if(JSON.stringify(SLOT.R)!==before)throw Error('Drawing changes rotation');
          SLOT.phase=1;SLOT.t2=0;SLOT.from=SLOT.R;SLOT.target=slotTargetR();
          // Use the game's real update path after initializing the ordinary roll.
          SLOT.phase=0;SLOT.t=1.4;SLOT.w=[20,18,12];
          for(let i=0;i<180&&SLOT.active;i++)updateSlot(1/60);
          draw();drawSlot();
          return {active:SLOT.active,held:DK.heldDie,final:SLOT.final,normalZ:SLOT.R[8],cubeFace:topFace(SLOT.R)};
        });
        assert.equal(settlement.held,1);assert.equal(settlement.active,false);
        if(sharedCube)assert.equal(settlement.cubeFace,1);else assert.ok(settlement.normalZ>1-1e-8);
        report.views.at(-1)[sharedCube?'actualD6Settlement':'actualD1Settlement']=settlement;
        await page.screenshot({path:path.join(out,name+'-actual-'+actualKind+'-settled.png')});
      }
      await page.close();
    }
    report.pass=true;
  } catch(error) {report.error=error.stack;process.exitCode=1;console.error(error);}
  finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})();
