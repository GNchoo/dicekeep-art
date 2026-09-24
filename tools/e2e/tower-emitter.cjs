// Isolated local game: arena shots use ground anchors for collision while
// their painted launch still starts at the tower's actual muzzle.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {launchBrowser,gameUrl}=require('./browser.cjs');
assert.ok(['localhost','127.0.0.1'].includes(new URL(gameUrl()).hostname));
(async()=>{const browser=await launchBrowser();try{
 const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/game.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('window.DK = S;','Object.assign(window,{towerVisualEmitter,towerSpr,towerFire,spawnEnemy,buildInfinityWave,epos});window.DK = S;')});});
 await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
 await page.goto(gameUrl());await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});
 const rows=await page.evaluate(()=>{
  DKstartInf('clear');DK.paused=true;DK.muted=true;DK.enemies=[];DK.towers=[];DK.gold=9999;
  spawnEnemy(buildInfinityWave(1)[0]);const e=DK.enemies[0];e.dist=220;e.hp=e.max=1e6;e.entranceT=-1;
  const p=epos(e),rows=[];
  for(const face of [1,2,3,4,5,6])for(const serial of [0,1]){
   const t={face,def:DKTD[face],lvl:1,spot:0,x:p.x+65,y:p.y+45,skin:0,cd:0,shotSerial:serial};
   DK.beams=[];DK.projs=[];DK.fxs=[];DK.towers=[t];towerFire(t,1/60);
   const sp=towerSpr(face,0),port=DKMOTION.port(t),origin=towerVisualEmitter(t);
   const expected={x:t.x+(port[0]*sp.w-sp.cx)*1.07,y:t.y+6+(port[1]*sp.h-sp.baseY)*.91};
   rows.push({face,serial,origin,expected,beam:DK.beams[0]?.pts[0],style:DK.beams[0]?.style,
    muzzle:DK.fxs.find(f=>f.kind==='muzzleFlash'),projectile:DK.projs[0]?{x:DK.projs[0].x,y:DK.projs[0].y,offset:DK.projs[0].launchOffset,groundFlight:DK.projs[0].groundFlight}:null,
    physical:{x:t.x,y:t.y},roofFlash:DK.fxs.some(f=>f.kind==='laserMuzzle')});
  }
  return rows;
 });
 for(const r of rows){assert.deepEqual(r.origin,r.expected);if(r.face===1||r.face===5){assert.deepEqual(r.beam,r.origin);assert.equal(r.style,r.face===1?'rubyShot':'lightning');assert.equal(r.roofFlash,false);}else{if(r.face===2){assert.equal(r.muzzle.x,r.origin.x);assert.equal(r.muzzle.y,r.origin.y);}assert.equal(r.projectile.groundFlight,true);assert.equal(r.projectile.x,r.physical.x);assert.equal(r.projectile.y,r.physical.y);assert.equal(r.projectile.x+r.projectile.offset[0],r.origin.x);assert.equal(r.projectile.y+r.projectile.offset[1],r.origin.y);}}
 assert.notDeepEqual(rows[2].origin,rows[3].origin,'cannon alternates its two ports');assert.deepEqual(errors,[]);
 fs.mkdirSync('gen/e2e/tower-emitter',{recursive:true});fs.writeFileSync('gen/e2e/tower-emitter/report.json',JSON.stringify(rows,null,2));
 console.log('PASS all six tower emitters, ruby shot, alternating cannon, coil lightning and ground-anchor projectile physics');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
