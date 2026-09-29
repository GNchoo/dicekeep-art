// Real firing/hit functions: equal upgrades, armor and target formation across all 20 ranks.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');
function part(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end);}
const S={mode:'infinity',inf:{power:{}},projs:[],beams:[],fxs:[],texts:[],enemies:[]};
const c={window:{},S,COSMETIC:false,deckRun:()=>false,growthRun:()=>false,epos:e=>({x:e.x,y:e.y}),
 towerVisualEmitter:t=>({x:t.x,y:t.y}),starColor:d=>d.color,SFX:new Proxy({},{get:()=>()=>{}}),sheetHit(){}};
vm.createContext(c);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../content.js'),'utf8'),c);c.DKCONTENT=c.window.DKCONTENT;
vm.runInContext(part('const TOWER_DEFS =','const ENEMY_DEFS =')+part('const powerLv =','// SP 로 눈 강화')+part('function towerFire(','// 투사체·이펙트')+part('function starImpact(','// ==================== 업데이트')+part('function damageEnemy(','// 그림을 좌우로')+'\nglobalThis.defs=TOWER_DEFS;globalThis.stats=t=>({dmg:towerDmg(t),rate:towerRate(t)});',c);
function shot(face,count,lvl,power,armor,spacing=.1){
 S.inf.power=Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,power]));
 S.projs=[];S.fxs=[];S.beams=[];S.texts=[];
 S.enemies=Array.from({length:count},(_,i)=>({x:i*spacing,y:0,dist:100-i,hp:1e8,armor,def:{size:42},slowT:0,slowPct:0}));
 const t={face,def:c.defs[face],lvl,x:0,y:0,cd:0};c.towerFire(t,0);S.enemies.reverse();for(const p of S.projs)c.projHit(p);S.enemies.sort((a,b)=>b.dist-a.dist);
 const damage=S.enemies.map(e=>1e8-e.hp);return {dps:damage.reduce((a,b)=>a+b,0)/c.stats(t).rate,damage,slow:S.enemies[0].slowPct};
}
for(let face=2;face<=20;face++)assert.ok(c.defs[face].range>=c.defs[face-1].range,'higher ranks do not lose base reach');
let checks=0;
for(const lvl of [1,2,3])for(let power=0;power<=10;power++)for(const armor of [0,6,40])for(const count of [1,3,6,20,200]){
 let previous=0;for(let face=1;face<=20;face++){
 const r=shot(face,count,lvl,power,armor);assert.ok(r.dps>previous+1e-7,`rank inversion: face ${face}, targets ${count}, level ${lvl}, power ${power}, armor ${armor}: ${previous} -> ${r.dps}`);previous=r.dps;checks++;
 }
}
assert.deepEqual(shot(2,20,1,0,0).damage.slice(0,4),[32,8,8,0],'cannon hits primary plus two neighbours at 25%');
assert.deepEqual(shot(2,3,1,0,0,40).damage,[32,8,0],'cannon excludes neighbours outside splash radius');
assert.equal(shot(4,1,1,0,0).slow,.32,'frost keeps slow');
assert.deepEqual(shot(5,6,1,0,0).damage.slice(0,4),[60,45,33.75,0],'chain keeps three decaying hits');
console.log('PASS',checks,'actual shot DPS comparisons: ranks 1–20, 1–200 clustered targets, all upgrades, three armor levels; capped cannon, slow and chain');
console.log('Base DPS',Array.from({length:6},(_,i)=>({face:i+1,single:+shot(i+1,1,1,0,0).dps.toFixed(2),three:+shot(i+1,3,1,0,0).dps.toFixed(2)})));
