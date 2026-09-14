const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../progression.js'),D=require('../deck-rules.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const run=(id,activeSeconds=300,patch={})=>({id,mode:'coop',wave:21,kills:0,teamKills:500,won:false,date:'2026-09-14T12:00:00Z',elapsed:Math.max(300,activeSeconds),rewardVersion:1,activeSeconds,matchId:'ROOM01:1000:2000',reason:'lives',...patch});
const reject=(p,r,reason='invalid-run')=>{const before=JSON.stringify(p),result=P.settle(p,r);assert.equal(result.ok,false);assert.equal(result.reason,reason);assert.equal(JSON.stringify(p),before);};

test('short defeats earn exact time-based currency; under60-second wins never claim victory or first-win extras',()=>{
 const p=P.defaultProfile(),gold=p.collection.gold;
 let r=P.settle(p,run('short',30,{won:true}));assert.equal(r.shards,4);assert.equal(r.collectionRewards.gold,150);assert.equal(p.collection.gold,gold+150);
 assert.deepEqual(r.battleReward.base,{gold:150,shards:4});assert.deepEqual(r.battleReward.victory,{gold:0,shards:0});assert.deepEqual(r.battleReward.firstWin,{gold:0,shards:0});
 assert.equal(p.battleRewards.firstWins.coop,false);assert.equal(p.battleRewards.activeSeconds,30);
 r=P.settle(p,run('fifty-nine',59,{won:true}));assert.equal(r.shards,7);assert.equal(r.collectionRewards.gold,295);assert.equal(p.battleRewards.firstWins.coop,false);
 r=P.settle(p,run('minute',60,{won:true}));assert.equal(r.shards,33);assert.equal(r.collectionRewards.gold,700);assert.equal(p.battleRewards.firstWins.coop,true);
 r=P.settle(p,run('again',60,{won:true}));assert.equal(r.shards,13);assert.equal(r.collectionRewards.gold,400);assert.deepEqual(r.battleReward.firstWin,{gold:0,shards:0});
 r=P.settle(p,run('duel-first',60,{mode:'duel',won:true}));assert.equal(r.shards,33);assert.equal(p.battleRewards.firstWins.duel,true);
});
test('permanent activity milestones span matches, dates, losses and modes without duplicate claims or calendar resets',()=>{
 const p=P.defaultProfile();let r=P.settle(p,run('before',599));assert.equal(r.shards,79);assert.deepEqual(p.battleRewards.activityClaimed,[]);
 r=P.settle(p,run('boundary',1,{mode:'duel',date:'2027-01-01'}));assert.equal(r.collectionRewards.gold,305);assert.equal(r.shards,20);assert.deepEqual(r.battleReward.activity.milestones,[10]);
 assert.deepEqual(p.battleRewards.activityClaimed,[10]);assert.equal(p.battleRewards.activeSeconds,600);
 const saved=copy(p);assert.deepEqual(P.sanitize(saved),saved);const before=copy(p);assert.equal(P.settle(p,run('boundary',100,{mode:'duel'})).duplicate,true);assert.deepEqual(p,before);
 r=P.settle(p,run('many',6000));assert.deepEqual(r.battleReward.activity.milestones,[30,60]);assert.equal(p.battleRewards.activeSeconds,6600);
 assert.deepEqual(P.rewardView(p).nextMilestone,{minutes:120,seconds:7200,gold:600,shards:40,claimed:false,remainingSeconds:600});
 for(let i=0;i<4;i++)P.settle(p,run('long-'+i,6000));assert.deepEqual(p.battleRewards.activityClaimed,[10,30,60,120,240,480]);assert.equal(P.rewardView(p).nextMilestone,null);
 const more=P.settle(p,run('beyond',6000));assert.deepEqual(more.battleReward.activity.milestones,[]);
});
test('same valid participation and team result pay attacking and zero-kill supporting roles identically',()=>{
 const a=P.defaultProfile(),b=P.defaultProfile();const attack=P.settle(a,run('a',600,{kills:500,won:true})),support=P.settle(b,run('b',600,{kills:0,won:true}));
 assert.equal(attack.shards,support.shards);assert.deepEqual(attack.collectionRewards,support.collectionRewards);assert.deepEqual(attack.battleReward,support.battleReward);
 assert.deepEqual(a.battleRewards,b.battleRewards);assert.notEqual(a.records.coop.runs[0].kills,b.records.coop.runs[0].kills);
});
test('versionless battle observations and all existing solo awards stay unchanged and cannot add activity',()=>{
 for(const mode of['duel','coop']){const p=P.defaultProfile(),r=run('old',600,{mode});delete r.rewardVersion;delete r.activeSeconds;const award=P.settle(p,r);assert.equal(award.shards,0);assert.deepEqual(award.collectionRewards,{gold:0,packs:0});assert.equal(P.rewardView(p).activeSeconds,0);}
 const p=P.defaultProfile();const r={id:'old-build',mode:'build',wave:101,kills:500,won:true,date:'2026-09-14',elapsed:12*60};
 let award=P.settle(p,r);assert.equal(award.shards,170);assert.deepEqual(award.collectionRewards,{gold:5308,packs:0});
 award=P.settle(p,{...r,id:'old-build-again'});assert.equal(award.shards,120);assert.deepEqual(award.collectionRewards,{gold:5108,packs:0});assert.deepEqual(P.rewardView(p).firstWins,{duel:false,coop:false});assert.equal(P.rewardView(p).activeSeconds,0);
});
test('malformed or uncertified reward inputs reject atomically before changing wallets, records or permanent claims',()=>{
 for(const patch of[{rewardVersion:2},{activeSeconds:-1},{activeSeconds:1.5},{activeSeconds:NaN},{activeSeconds:Infinity},{activeSeconds:301,elapsed:300},{activeSeconds:6001,elapsed:6001},{mode:'build'},{won:1},{teamKills:-1},{matchId:''},{reason:'\n'},{date:'invalid'}])reject(P.defaultProfile(),run('bad',300,patch));
 const partial=run('partial');delete partial.rewardVersion;reject(P.defaultProfile(),partial);
 const missing=run('missing');delete missing.activeSeconds;reject(P.defaultProfile(),missing);
 const invalid=P.defaultProfile();invalid.battleRewards.activeSeconds=-1;reject(invalid,run('bad-profile'),'invalid-profile');
 const legacy=P.defaultProfile();delete legacy.collection;delete legacy.tree;reject(legacy,run('needs-migration'),'collection-required');assert.equal(P.settle(P.sanitize(legacy),run('migrated')).ok,true);
});
test('old account migration starts activity at zero and retains investments plus previously saved snapshots',()=>{
 const p=P.defaultProfile();p.collection.gold=1234;p.shards=200;p.tree.mastery[1]=3;p.tree.talents[1]='force';p.tree.awakenings[1]=true;
 const oldSnap=copy(P.snapshot(p,'coop'));delete p.battleRewards;
 p.records.coop.best=500;p.records.coop.clears=99;const migrated=P.sanitize(p);assert.deepEqual(migrated.battleRewards,{version:1,activeSeconds:0,activityClaimed:[],firstWins:{duel:false,coop:false}});
 for(const k of['shards','collection','tree','deck','levels','records'])assert.deepEqual(migrated[k],p[k]);assert.deepEqual(copy(P.snapshot(migrated,'coop')),oldSnap);
 const award=P.settle(p,run('first-new',60,{won:true}));assert.equal(award.shards,33);assert.equal(p.battleRewards.firstWins.coop,true);
 const stored=copy(p),last=stored.records.coop.runs[0];assert.equal(last.rewardVersion,1);assert.equal(last.activeSeconds,60);assert.equal(last.teamKills,500);assert.equal(last.matchId,'ROOM01:1000:2000');assert.equal(last.reason,'lives');assert.deepEqual(P.sanitize(stored),stored);
 const view=P.rewardView(p);view.firstWins.duel=true;view.milestones[0].claimed=true;assert.equal(p.battleRewards.firstWins.duel,false);assert.deepEqual(p.battleRewards.activityClaimed,[]);
});
test('wallet and activity saturation stay finite, expose capped credits and never repay duplicate receipts',()=>{
 const p=P.defaultProfile();p.shards=P.MAX_SHARDS-2;p.collection.gold=P.MAX_GOLD-3;const r=P.settle(p,run('cap',600,{won:true}));
 assert.equal(p.shards,P.MAX_SHARDS);assert.equal(p.collection.gold,P.MAX_GOLD);assert.equal(r.shards,2);assert.equal(r.collectionRewards.gold,3);assert.equal(r.capped,true);assert.ok(r.earnedShards>2&&r.earnedGold>3);assert.deepEqual(r.battleReward.credited,{gold:3,shards:2});
 const before=copy(p);assert.equal(P.settle(p,run('cap',600,{won:true})).duplicate,true);assert.deepEqual(p,before);
 p.battleRewards.activeSeconds=P.MAX_COUNTER;p.battleRewards.activityClaimed=P.BATTLE_REWARDS.activity.map(m=>m.minutes);P.settle(p,run('time-cap',6000));assert.equal(p.battleRewards.activeSeconds,P.MAX_COUNTER);assert.equal(Number.isSafeInteger(p.battleRewards.activeSeconds),true);
 const bad=copy(p);bad.battleRewards={version:1,activeSeconds:599,activityClaimed:[10,10,30],firstWins:{duel:1,coop:true}};const fixed=P.sanitize(bad);assert.deepEqual(fixed.battleRewards,{version:1,activeSeconds:599,activityClaimed:[],firstWins:{duel:false,coop:true}});assert.deepEqual(P.sanitize(fixed),fixed);
});
test('new duel snapshots normalize every account statistic while retaining owned choices and accepting previous snapshots',()=>{
 const low=P.defaultProfile(),high=P.defaultProfile();for(const face of[1,2,3,4,5,6]){high.levels[face]=200;high.collection.cards[face].class=20;high.tree.mastery[face]=5;high.tree.talents[face]='force';high.tree.awakenings[face]=true;}
 assert.deepEqual(P.snapshot(low,'duel'),P.snapshot(high,'duel'));const duel=P.snapshot(high,'duel');assert.equal(duel.duelRules,1);assert.equal(P.damageMultiplier(duel,1),1);assert.equal(P.snapshotValid(duel),true);
 for(let face=1;face<=20;face++){assert.equal(duel.mastery[face],0);assert.equal(duel.talents[face],null);assert.equal(duel.awakenings[face],false);assert.equal(duel.levels[face],face<=6?1:0);assert.equal(duel.classes[face],face<=6?D.get(face).baseClass:0);}
 for(const key of['deck','levels','classes','mastery','talents','awakenings'])assert.equal(Object.isFrozen(duel[key]),true);
 const prior={...copy(P.snapshot(high,'coop')),mode:'duel'};assert.equal(P.snapshotValid(prior),true);assert.equal(P.damageMultiplier(prior,1),1.15*1.1);
 const malformed=copy(duel);malformed.mastery[1]=1;assert.equal(P.snapshotValid(malformed),false);assert.equal(P.snapshotValid({...duel,duelRules:2}),false);assert.equal(P.snapshotValid({...duel,mode:'coop'}),false);
 high.collection.gold=10000;high.shards=100;assert.equal(P.treeUnlock(high,7).ok,true);P.setDeck(high,[7,1,2,3,4]);const chosen=P.snapshot(high,'duel');assert.deepEqual(chosen.deck,[7,1,2,3,4]);assert.equal(chosen.levels[7],1);assert.equal(chosen.classes[7],D.get(7).baseClass);
});
