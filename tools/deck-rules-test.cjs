const assert=require('node:assert/strict');
const D=require('../deck-rules.js');
const deck=[1,4,7,13,14], snap={classes:Object.fromEntries(D.catalog.map(c=>[c.id,c.baseClass])),critDamage:1.5};
assert.equal(D.catalog.length,20); assert.equal(new Set(D.catalog.map(c=>c.name)).size,20);
const counts=Object.fromEntries(deck.map(id=>[id,0]));
for(let i=0;i<10000;i++) { const t=D.summon(deck,()=>i/10000); counts[t.face]++; assert.equal(t.pips,1); }
assert.deepEqual(Object.values(counts),[2000,2000,2000,2000,2000]);
for(let pips=1;pips<7;pips++) for(const id of deck) { const a={face:id,pips},b={face:id,pips}; const m=D.merge(a,b,deck,()=>.65); assert.equal(m.face,13); assert.equal(m.pips,pips+1); }
assert.equal(D.merge({face:1,pips:7},{face:1,pips:7},deck),null);
assert.equal(D.merge({face:1,pips:2},{face:1,pips:1},deck),null);
assert.equal(D.merge({face:1,pips:2},{face:4,pips:2},deck),null);
assert.equal(D.canCopy({face:13,pips:7},{face:1,pips:7}),true);
assert.equal(D.canCopy({face:1,pips:2},{face:13,pips:2}),false);
const t={face:1,pips:2,spot:6}, support={face:7,pips:3,spot:7};
const bare=D.stats(t,snap,1,[t]); const buff=D.stats(t,snap,1,[t,support]); assert.ok(buff.rate<bare.rate);
assert.equal(D.stats(t,snap,1,[t,support,{...support,spot:1}]).rate,buff.rate,'identical aura does not stack');
assert.ok(D.stats({...t,pips:4},snap,1,[t]).rate<bare.rate);
assert.ok(D.stats(t,snap,5,[t]).dmg>bare.dmg);
assert.ok(Math.abs(D.stats(t,{...snap,classes:{1:20}},1,[t]).dmg/D.stats(t,{...snap,classes:{1:1}},1,[t]).dmg-1.57)<1e-12,'class20 follows account maximum at 3% per earned class');
assert.equal(D.adjacent({spot:4},{spot:5}),false,'row wrap not adjacent');
assert.equal(D.adjacent({spot:1},{spot:4},3),true,'portrait adjacency');
assert.equal(D.powerCost(5),Infinity); assert.equal(D.summonCost(0),30);
assert.ok(D.stats({face:1,pips:1},snap).dmg/D.stats({face:1,pips:1},snap).rate>D.stats({face:20,pips:1},snap).dmg/D.stats({face:20,pips:1},snap).rate,'higher identity is not an automatic damage upgrade');
for(const w of [1,10,50,100,101,202,505,1000000]) for(const boss of [false,true]) { const e=D.enemyStats(w,boss,false,1,true); assert.ok(Number.isFinite(e.hp)&&e.hp>0); }
console.log('PASS deck identities, equal summon odds, pips, merge legality, copy, adjacency, class/power separation and finite enemy curve');
const viewSnap={treeVersion:1,mastery:{},talents:{},awakenings:{},critDamage:1.5};
const basePreview=D.preview([1,2,3,4,5],viewSnap);
assert.ok(Math.abs(basePreview.direct-(18/.55+36/1.5+34+12/.9+22/1.1)*3)<1e-8,'preview uses actual base direct DPS');
assert.equal(basePreview.boss,basePreview.direct,'no invented boss bonus');
assert.equal(basePreview.adjacency,0);
const supported=D.preview([2,4,7,8,10],viewSnap),hunter=supported.board.find(t=>t.face===10);
assert.ok(Math.abs(supported.boss-supported.direct-hunter.dps*.8)<1e-8,'hunter bonus only applies to hunter');
assert.ok(supported.adjacency>0,'actual adjacent supports improve the formation');
assert.deepEqual(D.preview([10,8,7,4,2],viewSnap),supported,'deck selection order does not alter example placement');
assert.ok(D.preview([1,2,3,4,5],{...viewSnap,mastery:{1:1}}).direct>basePreview.direct,'research reflects in comparison');
assert.deepEqual(D.preview([1,2,3,4,5],{...viewSnap,awakenings:{1:true}}),basePreview,'7-pip awakening must not inflate 3-pip comparison');
assert.throws(()=>D.preview([1,1,2,3,4],viewSnap));
console.log('PASS honest deck comparison and conditional support/boss benefits');
assert.equal(D.gradeCatalog.length,20);
let previous=0;
for(let face=1;face<=20;face++){
 const row=D.gradePreview([face]).board[0];
 assert.ok(row.dps>previous,'each higher grade improves standalone Lv1 DPS: '+face);previous=row.dps;
 assert.equal(D.gradeGet(face).grade,face);
}
for(const s of D.gradeSynergyCatalog){
 const target={face:s.groups[1][0],spot:1,lvl:1},source={face:s.groups[0][0],spot:0,lvl:1};
 const active=D.gradeSynergies(target,[source,target]);
 assert.ok(active.active.includes(s.id),s.name+' activates beside its partner');
 assert.deepEqual(D.gradeSynergies(target,[source,target,{...source,spot:6}]),active,'same support never stacks');
 assert.ok(!D.gradeSynergies({...target,spot:4},[source,{...target,spot:4}]).active.includes(s.id),'distant partner does not activate');
}
const swiftBoard=[{face:1,spot:0},{face:20,spot:1}],swift=D.gradePreview(swiftBoard);
assert.ok(Math.abs(swift.direct/swift.solo-1)>0,'combination preview uses its actual adjacent bonus');
assert.equal(swift.boss,swift.direct,'no invented unconditional boss score');
assert.equal(D.gradePreview([1],{treeVersion:1,mastery:{1:5},talents:{1:'force'},awakenings:{1:true}}).direct,16*1.15*1.1*1.15);
assert.equal(D.gradePreview([1],{growth:false,treeVersion:1,mastery:{1:5},talents:{1:'force'},awakenings:{1:true}}).direct,16,'pure preview ignores account investment');
assert.equal(D.gradeSupporterInfo('crusher').description.includes('타워는 사라집니다'),true);
const classOnly={growth:true,levels:{1:1},classes:{1:10}};
assert.equal(D.gradeGrowth(1,classOnly),1.27);
assert.equal(D.gradePreview([1],classOnly).direct,16*1.27);
assert.equal(D.gradePreview([1],{growth:true,levels:{1:20},levelCap:20}).direct,16*2.52);
const strongest=D.gradeSynergies({face:7,spot:1},[{face:3,spot:0},{face:11,spot:2}]);
assert.deepEqual(strongest.active,['arcane','stars']);assert.equal(strongest.damage,1.12,'different damage effects use the strongest one');
console.log('PASS 20-grade progression, adjacent combinations, non-stacking effects and honest conditional preview');
