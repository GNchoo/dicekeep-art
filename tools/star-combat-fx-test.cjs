// Small Node check for visual identity and unchanged combat; browser gallery is
// tools/e2e/star-combat-fx.cjs when Chromium is available.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const motion = require('../combat-motion.js');
const current = fs.readFileSync(require('node:path').join(__dirname, '../game.js'), 'utf8');
const baseline = process.env.COMBAT_FX_BASELINE ? fs.readFileSync(process.env.COMBAT_FX_BASELINE, 'utf8')
  : execFileSync('git', ['show', '6eaa73c:game.js'], { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8' });
function section(source, start, end) { const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b); }
function trace(source, face) {
  const enemies = [0, 35, 350].map((x, i) => ({ x, y: 0, dist: 100-i, hp: 1e9, dead: false, def: { size: 42 } }));
  const S={mode:'infinity',towers:[],enemies,projs:[],beams:[],fxs:[],texts:[]};
  const ctx={S,Math,Number,window:{DKDECKRULES:require('../deck-rules.js')},LANES:[{loopAt:0}],COSMETIC:false,
    epos:e=>({x:e.x,y:e.y}),deckRun:()=>false,arenaWorldScale:()=>1,fxRandom:()=>.5,
    towerRange:()=>250,towerRate:t=>t.def.rate,towerDmg:t=>t.def.dmg,towerSplash:t=>t.def.splash||0,
    towerSlowPct:()=>.3,towerChain:()=>3,starColor:d=>d.color,
    towerVisualEmitter:t=>({x:t.x+4,y:t.y-50}),damageEnemy:(e,d)=>{e.hp-=d;},
    sheetHit:(kind,x,y,size,dur)=>S.fxs.push({kind,x,y,size,dur,t:0}),
    SFX:new Proxy({}, {get:()=>()=>{}})};
  vm.createContext(ctx);
  // Compare visual implementations with the same current balance table.
  const definitions=section(current,'const TOWER_DEFS =','const LVL_DMG');
  vm.runInContext(definitions+'\nglobalThis.defs=TOWER_DEFS;\n'+
    section(source,'function projectileDrawPosition(','// ==================== 사운드')+
    section(source,'function towerFire(','// 투사체·이펙트')+
    section(source,'function updateVisuals(','function advancePresentation(')+
    section(source,'function starImpact(','// ==================== 업데이트'),ctx);
  const t={face,def:ctx.defs[face],x:20,y:25,cd:0,lvl:1,skin:0};S.towers=[t];
  if(source===current&&face>=7) {
    ctx.towerFire(t,0);const p=S.projs[0];assert.equal(p.fxFace,face);
    t.face=1;ctx.projHit(p);t.face=face;
    assert.equal(S.fxs.length,1);assert.equal(S.fxs[0].kind,'starImpact');assert.equal(S.fxs[0].face,face);
    S.projs=[];S.fxs=[];S.texts=[];t.cd=0;t.shotSerial=0;for(const e of enemies)e.hp=1e9;
  }
  const results=[];
  for(let i=0;i<360;i++) {
    ctx.towerFire(t,1/60);ctx.updateVisuals(1/60);
    if(i%30===29)results.push({hp:enemies.map(e=>e.hp),cd:t.cd,
      projs:S.projs.map(p=>[p.kind,p.x,p.y,p.spd,p.dmg,p.splash,p.travelled])});
  }
  return JSON.parse(JSON.stringify(results));
}
// Rank 2 intentionally changed hit targeting in v169; tower-damage-test covers it.
for(let face=1;face<=20;face++) if(face!==2) assert.deepEqual(trace(current,face),trace(baseline,face),'combat identity '+face);
function commands(paint) {
  const calls=[];let depth=0;
  const g=new Proxy({globalAlpha:1},{get:(obj,key)=>key in obj?obj[key]:(...args)=>{
    if(key==='save')depth++;if(key==='restore')depth--;
    for(const x of args)if(typeof x==='number')assert.ok(Number.isFinite(x),key+' finite');
    calls.push([key,...args]);
    if(String(key).includes('Gradient'))return{addColorStop(){}};
  },set:(obj,key,value)=>{obj[key]=value;return true;}});
  paint(g);assert.equal(depth,0,'balanced canvas stack');return JSON.stringify(calls);
}
const shots=[],hits=[];
for(let face=7;face<=20;face++) {
  shots.push(commands(g=>assert.equal(motion.paintProjectile(g,{fxFace:face,rot:.2,visualAge:.1}),true)));
  hits.push(commands(g=>motion.paintStarImpact(g,{face,x:0,y:0,t:.15,dur:.4,size:100,angle:.2})));
  for(const t of [0,.001,.2,.399,.4]) commands(g=>motion.paintStarImpact(g,{face,x:0,y:0,t,dur:.4,size:100,angle:0}));
}
assert.equal(new Set(shots).size,14,'distinct projectile geometry, ignoring color');
assert.equal(new Set(hits).size,14,'distinct impact geometry, ignoring color');
assert.equal(motion.paintProjectile({}, {fxFace:0}),false,'deck projectile stays on existing path');
console.log('PASS: 19 visual combat traces unchanged with current stats; rank 2 covered by damage tests; 14 unique projectile/hit geometries, finite animation endpoints, no canvas state leak');
