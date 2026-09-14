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
