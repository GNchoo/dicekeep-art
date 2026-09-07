const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash}=require('node:crypto');
const sharp=require('sharp');
const {launchBrowser,gameUrl}=require('../../e2e/browser.cjs');
const evidence=path.join(__dirname,'evidence');
const emitter=JSON.parse(fs.readFileSync(path.join(__dirname,'emitter-metadata.json'),'utf8')).towers;
async function capture(page,name){const image=await page.screenshot({fullPage:true});await sharp(image).resize({width:1240,withoutEnlargement:true}).jpeg({quality:85}).toFile(path.join(evidence,name+'.jpg'));}

async function main(){
  const browser=await launchBrowser(),results=[];
  try {
    for(const [device,viewport] of [['desktop',{width:1440,height:1080}],['phone',{width:440,height:956}]]){
      const context=await browser.newContext({viewport,deviceScaleFactor:2}),page=await context.newPage();
      const errors=[],responses=[];let gameSha256=null;
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(/\/casual\/towers\/star-\d+\.png/.test(r.url()))responses.push({url:r.url(),status:r.status()});});
      page.on('requestfailed',r=>{if(/\/casual\/towers\/star-\d+\.png/.test(r.url()))errors.push(r.url()+': '+r.failure()?.errorText);});
      await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
      // Test page only: expose existing closure-local functions, without altering their implementation.
      await page.route('**/game.js*',async route=>{const body=fs.readFileSync(path.resolve(__dirname,'../../../game.js'),'utf8');gameSha256=createHash('sha256').update(body).digest('hex');const marker='window.DKtowerSpr = towerSpr;';assert.ok(body.includes(marker),'Known debug hook anchor');await route.fulfill({status:200,contentType:'text/javascript',body:body.replace(marker,marker+' window.__towerQA={laneLen,epos,towerFire,towerVisualEmitter,projectileDrawPosition};')});});
      await page.goto(gameUrl());
      await page.waitForFunction(()=>window.DK&&DK.phase==='title',null,{timeout:120000});
      const loaded=await page.evaluate(emitter=>Object.keys(emitter).map(key=>{
        const face=+key,art=DKA['tStar'+face],sp=DKtowerSpr(face,0),xy=DKCONTENT.STAR_TOWER_EMITTERS[face];
        const pixels=sp.cv.getContext('2d').getImageData(0,0,sp.w,sp.h).data;
        let hash=2166136261;for(const x of pixels)hash=Math.imul(hash^x,16777619)>>>0;
        return {face,sourceLoaded:!!(art&&art.cv),dedicated:!!sp.dedicated,width:sp.w,height:sp.h,hash,emitterMatches:JSON.stringify(xy)===JSON.stringify(emitter[face])};
      }),emitter);
      assert.equal(loaded.length,14);
      for(const row of loaded)assert.ok(row.sourceLoaded&&row.dedicated&&row.emitterMatches&&row.width<=70&&row.height===96,'Loader '+row.face);
      assert.equal(new Set(loaded.map(r=>r.hash)).size,14,'All 14 actual rendered sprite canvases must be unique');
      await page.click('#ov-btn');
      await page.evaluate(()=>{DK.muted=true;DKstartInf('clear');DK.gold=999999;DK.speed=1;});
      await page.waitForFunction(()=>DK.phase==='playing');
      await page.evaluate(()=>{document.getElementById('coach-skip')?.click();document.getElementById('help-close')?.click();});
      await page.click('#wave-btn');
      await page.waitForFunction(()=>DK.enemies.length>0,null,{timeout:20000});
      await page.evaluate(()=>{
        DK.paused=true;DK.spawnQ=[];DK.enemies=[DK.enemies[0]];DK.towers=[];DK.fxs=[];DK.projs=[];DK.texts=[];
        if(DKspots().length<14)throw new Error('Not enough real map tower spots');
        for(let i=0;i<14;i++){DK.heldDie=i+7;DKplace(i);}
        DK.fxs=[];DK.texts=[];DK.heldDie=0;DK.selTower=null;DKsync();
        const lookup=new Map(DK.towers.map(t=>[DKtowerSpr(t.face,t.skin).cv,t.face]));window.__towerDrawn={};
        const original=CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage=function(source,...args){const face=lookup.get(source);if(this.canvas.id==='game'&&face)window.__towerDrawn[face]={args,transform:{a:this.getTransform().a,d:this.getTransform().d,e:this.getTransform().e,f:this.getTransform().f}};return original.call(this,source,...args);};
      });
      await page.waitForFunction(()=>Object.keys(window.__towerDrawn).length===14,null,{timeout:15000});
      await capture(page,'runtime-'+device+'-14');
      const fired=await page.evaluate(()=>{
        const {laneLen,epos,towerFire,towerVisualEmitter,projectileDrawPosition}=window.__towerQA;
        const rows=[],enemy=DK.enemies[0];enemy.hp=enemy.maxHp=1e12;enemy.dead=false;enemy.hidden=false;
        for(const t of DK.towers){
          let bestDist=0,best=Infinity;
          for(let dist=0;dist<laneLen(enemy);dist+=5){enemy.dist=dist;const p=epos(enemy),d=Math.hypot(p.x-t.x,p.y-(t.y-30));if(d<best){best=d;bestDist=dist;}}
          enemy.dist=bestDist;DK.projs=[];DK.fxs=[];t.cd=0;t.kick=0;
          towerFire(t,1/60);
          const p=DK.projs.find(p=>p.src===t);if(!p)throw new Error('No actual projectile from star '+t.face);
          const original={x:p.x,y:p.y},visual=towerVisualEmitter(t),first=projectileDrawPosition(p);
          const flash=DK.fxs.find(f=>f.kind==='muzzleFlash');p.visualAge=.1;const after=projectileDrawPosition(p);
          rows.push({face:t.face,logicalSpawnUnchanged:p.x===t.x&&p.y===t.y-64,visualSpawnError:Math.hypot(first.x-visual.x,first.y-visual.y),flashError:Math.hypot(flash.x-visual.x,flash.y-visual.y),visualOffsetFullyDecayed:Math.hypot(after.x-p.x,after.y-p.y)<1e-10,visualFunctionDidNotMovePhysics:p.x===original.x&&p.y===original.y,visualEmitter:visual});
          t.kick=0;
        }
        DK.projs=[];DK.fxs=[];return rows;
      });
      for(const r of fired)assert.ok(r.logicalSpawnUnchanged&&r.visualSpawnError<1e-8&&r.flashError<1e-8&&r.visualOffsetFullyDecayed&&r.visualFunctionDidNotMovePhysics,'Firing '+r.face);
      // Capture a real recoil + launch frame for the four most distinctive origins.
      for(const face of [7,9,16,20]){
        await page.evaluate(face=>{
          const {laneLen,epos,towerFire}=window.__towerQA;
          DK.towers=DK.towers.filter(t=>t.face===face);if(!DK.towers.length){DK.heldDie=face;DKplace(0);}const t=DK.towers[0];
          const e=DK.enemies[0];let distance=0,best=Infinity;for(let d=0;d<laneLen(e);d+=5){e.dist=d;const p=epos(e),n=Math.hypot(p.x-t.x,p.y-(t.y-30));if(n<best){best=n;distance=d;}}e.dist=distance;
          DK.fxs=[];DK.projs=[];DK.texts=[];t.cd=0;t.kick=0;towerFire(t,1/60);
        },face);
        await page.waitForTimeout(80);
        await capture(page,`runtime-${device}-fire-${face}`);
      }
      assert.equal(errors.length,0,errors.join('\n'));
      assert.ok(responses.length>=14&&responses.every(r=>r.status===200),'14 star PNG requests should succeed');
      results.push({device,viewport,gameSha256,loaded,drawn:await page.evaluate(()=>window.__towerDrawn),fired,requests:responses,errors,pass:true});
      await context.close();
    }
  } finally {await browser.close();}
  const report={pass:results.every(r=>r.pass),devices:results.length,towersPerDevice:14,actualRenderObservations:results.reduce((n,r)=>n+Object.keys(r.drawn).length,0),actualFiringChecks:results.reduce((n,r)=>n+r.fired.length,0),scope:'Real game loading, actual drawImage observation, actual towerFire projectile creation and visual-only 0.1s launch offset. No gameplay code is changed by this harness.',results};
  fs.writeFileSync(path.join(evidence,'browser-validation.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({pass:report.pass,devices:report.devices,actualRenderObservations:report.actualRenderObservations,actualFiringChecks:report.actualFiringChecks},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
