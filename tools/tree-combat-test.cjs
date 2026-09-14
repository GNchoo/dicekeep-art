const assert=require('node:assert/strict');
const D=require('../deck-rules.js');
const ids=D.catalog.map(c=>c.id), map=value=>Object.fromEntries(ids.map(id=>[id,value]));
const old={classes:Object.fromEntries(D.catalog.map(c=>[c.id,c.baseClass])),critDamage:1.5};
const base={...old,treeVersion:1,mastery:map(0),talents:map(null),awakenings:map(false),supporter:'supply'};
const awake={...base,awakenings:map(true)};
const tower=(face,pips=7,spot=0)=>({face,pips,spot});
const stat=(face,snapshot=awake,board)=>D.stats(tower(face),snapshot,1,board||[tower(face)]);
for(const id of ids) {
  assert.ok(D.awakeningInfo(id)?.name&&D.awakeningInfo(id)?.description,'all20 awakening descriptions');
  assert.equal(D.awakened(tower(id),old),false,'v111 has no awakening');
  assert.equal(D.awakened(tower(id,6),awake),false,'six pips never awake');
  assert.equal(D.awakened(tower(id),base),false,'locked seven pip does not awake');
  assert.equal(D.awakened(tower(id),awake),true,'unlocked seven pip awakes');
  const normal=stat(id,base),oldNormal=stat(id,old);
  for(const field of ['dmg','rate','range','slowPct','chain','critChance','critDamage']) assert.equal(normal[field],oldNormal[field],`untrained tree matches baseline: ${id} ${field}`);
  const mastered=stat(id,{...base,mastery:map(5),classes:map(20)});
  assert.ok(Math.abs(mastered.dmg/normal.dmg-1.15)<1e-12,'mastery capped at15%, legacy classes not added');
  assert.ok(Math.abs(stat(id,{...base,talents:map('force')}).dmg/normal.dmg-1.1)<1e-12,'force is10%');
}
assert.ok(stat(1).rate<stat(1,base).rate);assert.equal(stat(2).splash,105);assert.equal(stat(3).ignoreArmor,true);
assert.equal(stat(4).slowDur,3);assert.ok(stat(4).slowPct>stat(4,base).slowPct);assert.equal(stat(5).chain-stat(5,base).chain,3);
assert.equal(stat(6).incomePeriod,8);assert.equal(stat(6).incomeAmount,64.5);
for(const id of [7,8]) {const target=tower(1,2),support=tower(id,7,1),b=[target,support],normal=D.stats(target,base,1,b),strong=D.stats(target,awake,1,b);assert.ok(id===7?strong.rate<normal.rate:strong.dmg>normal.dmg,'awakened support changes recipient');}
assert.equal(stat(9).poisonScale,1.3);assert.equal(stat(9).poisonDur,5);assert.equal(stat(10).hunterMult,2.5);assert.equal(stat(11).fracturePct,.8);assert.equal(stat(12).shatterMult,2.3);
assert.ok(D.stats({...tower(1),copyHaste:true},base).rate<D.stats(tower(1),base).rate,'perfect copy haste');
assert.equal(D.stats({...tower(1),copyHaste:true},old).rate,D.stats(tower(1),old).rate,'old runs ignore new copy flag');
const recipient=tower(1,2),resonator=tower(17,7,1);assert.ok(D.stats(recipient,awake,1,[recipient,resonator]).dmg>D.stats(recipient,base,1,[recipient,resonator]).dmg,'awakening resonance works across pips');
assert.equal(stat(18).range-stat(18,base).range,50);assert.ok(stat(19,awake,[tower(19),tower(19,1,1)]).rate<stat(19,base,[tower(19),tower(19,1,1)]).rate);assert.equal(stat(20).pulseEvery,3);
assert.equal(stat(14,{...base,talents:map('insight')}).growthPeriod,25.2);
assert.equal(D.supporterInfo('supply').cooldown,45);assert.equal(D.supporterInfo('crusher').cooldown,45);assert.equal(D.supporterInfo('barrage').cooldown,35);assert.equal(D.supporterInfo('bad'),null);
console.log('PASS all20 awakening gates and stats, bounded mastery, talents, frozen-v111 baseline, supporter metadata');
