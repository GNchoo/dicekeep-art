// Game-economy calculation, not a payment integration. Baseline code is pinned;
// adopted battle rewards are computed with the current production progression API.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'gen/economy-model');
const baselineRef='74165f4d6754fdbc325c492128b30a9c477a8a62';
const source=path.join(out,'source',baselineRef);fs.mkdirSync(source,{recursive:true});
const hashes={};
for(const file of ['deck-rules.js','tree-rules.js','progression.js']){const text=cp.execFileSync('git',['show',`${baselineRef}:${file}`],{cwd:root,maxBuffer:8*1024*1024});fs.writeFileSync(path.join(source,file),text);hashes[file]=crypto.createHash('sha256').update(text).digest('hex');}
const PG=require(path.join(source,'progression.js')),TREE=require(path.join(source,'tree-rules.js')),DECK=require(path.join(source,'deck-rules.js'));
const CURRENT=require('../progression.js'),productionHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'progression.js'))).digest('hex');
const fresh=PG.defaultProfile(),initial={gold:fresh.collection.gold,shards:fresh.shards,owned:Object.keys(fresh.collection.cards).filter(id=>fresh.collection.cards[id].owned).map(Number)};
const proposal=Object.freeze({goldPerMinute:300,shardsPerMinute:8,win:{gold:100,shards:5},firstWin:{gold:300,shards:20},minVictorySeconds:60,
 activity:[{minutes:10,gold:300,shards:20},{minutes:30,gold:400,shards:30},{minutes:60,gold:500,shards:40},{minutes:120,gold:600,shards:40},{minutes:240,gold:800,shards:50},{minutes:480,gold:1000,shards:60}]});
assert.deepEqual({...CURRENT.BATTLE_REWARDS,activity:CURRENT.BATTLE_REWARDS.activity.map(({seconds,...m})=>m)},proposal,'Published pacing must use the actual production reward constants.');
const clone=x=>JSON.parse(JSON.stringify(x)),add=(a,b)=>({gold:a.gold+b.gold,shards:a.shards+b.shards}),sub=(a,b)=>({gold:a.gold-b.gold,shards:a.shards-b.shards});
const funds=p=>({gold:p.collection.gold,shards:p.shards});
function exactCost(id,name,unlockFaces,masterFaces=[]){
 const p=PG.defaultProfile();p.collection.gold=1000000;p.shards=1000000;const before=funds(p),actions=[];
 const action=(kind,face,extra)=>{const r=kind==='unlock'?PG.treeUnlock(p,face):kind==='mastery'?PG.treeUpgrade(p,face):kind==='talent'?PG.treeTalent(p,face,extra):PG.treeAwaken(p,face);assert.equal(r.ok,true,`${kind} ${face}`);actions.push({kind,face,name:DECK.get(face).name,cost:r.cost||{gold:0,shards:0}});};
 const ensure=face=>{if(p.collection.cards[face].owned)return;const prev=TREE.get(face).previous;if(prev)ensure(prev);action('unlock',face);};
 for(const face of unlockFaces)ensure(face);
 for(const face of masterFaces){ensure(face);for(let i=0;i<TREE.MAX_MASTERY;i++)action('mastery',face);action('talent',face,'force');action('awakening',face);}
 const cost=sub(before,funds(p));assert.deepEqual(actions.reduce((sum,a)=>add(sum,a.cost),{gold:0,shards:0}),cost);
 return{id,name,unlockFaces,masterFaces,cost,netEarned:{gold:Math.max(0,cost.gold-initial.gold),shards:Math.max(0,cost.shards-initial.shards)},unlocked:actions.filter(a=>a.kind==='unlock').map(a=>a.face),actions};
}
const all=Array.from({length:20},(_,i)=>i+1),recommended=[2,4,5,8,20];
const goals=[exactCost('unlock_all','20종 모두 해금',all),exactCost('main_deck','추천 5종 선행 해금 + 최대 숙련·특성·각성',recommended,recommended),exactCost('all_plus_main','20종 해금 + 추천 5종 최대 연구',all,recommended),exactCost('max_all','20종 모두 최대 연구',all,all)];
assert.deepEqual(goals.map(g=>g.cost),[{gold:3360,shards:140},{gold:8720,shards:355},{gold:11360,shards:465},{gold:35360,shards:1440}]);
function settlement(mode,wave,won,minutes,freshRun=true){const p=PG.defaultProfile();const run={id:'model-'+mode,mode,wave,kills:500,won,date:'2026-09-14',elapsed:minutes*60};if(!freshRun)PG.settle(p,run);const r=PG.settle(p,{...run,id:run.id+'-again'});assert.equal(r.ok,true);return{gold:r.collectionRewards.gold,shards:r.shards};}
const rewardExamples=['build','duel','coop'].flatMap(mode=>[10,25,50,101].map(wave=>({mode,wave,first:settlement(mode,wave,wave===101,Math.max(3,wave/3)),repeat:settlement(mode,wave,wave===101,Math.max(3,wave/3),false)})));
// Whole-match credit becomes spendable on settlement. Saved solo runs may span
// days; unpausable battle sessions must fit fully into each daily play budget.
const reached=(wallet,goal)=>wallet.gold>=goal.cost.gold&&wallet.shards>=goal.cost.shards;
const result=(goal,minutes,matches,wallet,extra={})=>({goal:goal.id,name:goal.name,minutes:Number.isFinite(minutes)?+minutes.toFixed(1):null,hours:Number.isFinite(minutes)?+(minutes/60).toFixed(2):null,days:Object.fromEntries([10,20,30].map(b=>[b,Number.isFinite(minutes)?Math.ceil(minutes/b):null])),matches,wallet,...extra});
function runScenario(id,name,next,{proposed=false,description='',maxMatches=2000}={}){
 const calculator=proposed?CURRENT:PG;
 let wallet={gold:initial.gold,shards:initial.shards},seconds=0,matches=0;const profile=calculator.defaultProfile(),found=[],sessions=[];
 for(;matches<maxMatches&&found.length<goals.length;matches++){
  const sample=next(matches),s=sample.seconds;assert.ok(Number.isFinite(s)&&s>0);seconds+=s;sessions.push(s);
  const legacy=calculator.settle(profile,{id:`model-${id}-${matches}`,mode:sample.mode,wave:sample.wave,kills:sample.kills||500,won:sample.won,date:'2026-09-14',elapsed:s,
   ...(proposed&&['duel','coop'].includes(sample.mode)?{rewardVersion:1,activeSeconds:Math.floor(s)}:{})});assert.equal(legacy.ok,true);
  let reward={gold:legacy.collectionRewards.gold,shards:legacy.shards};
  wallet=add(wallet,reward);
  for(const goal of goals)if(!found.some(g=>g.goal===goal.id)&&reached(wallet,goal)){
   const days=Object.fromEntries([10,20,30].map(b=>{if(!['duel','coop'].includes(sample.mode))return[b,Math.ceil(seconds/(b*60))];let day=1,used=0;for(const length of sessions){if(length>b*60)return[b,null];if(used+length>b*60+1e-8){day++;used=0;}used+=length;}return[b,day];}));
   found.push(result(goal,seconds/60,matches+1,clone(wallet),{days}));
  }
  if(!proposed&&['duel','coop'].includes(sample.mode)&&matches>=19)break;
 }
 for(const goal of goals)if(!found.some(g=>g.goal===goal.id))found.push(result(goal,Infinity,matches,wallet,{unreachable:!proposed&&['duel','coop'].includes(next(0).mode)}));
 return{id,name,proposed,description,results:goals.map(g=>found.find(r=>r.goal===g.id))};
}
// Frozen measurements from the v114 phone deck experiment are committed here so
// a fresh checkout can reproduce the estimate without its ignored raw report.
const soloObservationRef='15aa84aa96cc512fb5c8ae17429aa202610e4233';
const actualSamples=[[900001,2457,101],[907920,2269,101],[915839,2393,101],[923758,2344,101],[931677,2383,101],[939596,2423,101],[947515,2341,101],[955434,2598,101],[963353,2227,98],[971272,1921,88],[979191,2238,97],[987110,2181,98],[995029,2440,101],[1002948,2294,101],[1010867,2242,101],[1018786,2328,101],[1026705,1489,67],[1034624,1880,88],[1042543,2401,101],[1050462,1489,68]].map(([seed,seconds,doneW])=>({seed,seconds,doneW,cleared:doneW===101}));
const rankingFile=path.join(root,'gen/e2e/deck-ranking/report.json');
if(fs.existsSync(rankingFile)){const ranking=JSON.parse(fs.readFileSync(rankingFile,'utf8'));if(ranking.ref===soloObservationRef)assert.deepEqual(ranking.rows.filter(r=>r.phase==='phone'&&r.id==='1-2-3-4-5').sort((a,b)=>a.seed-b.seed).map(({seed,seconds,doneW,cleared})=>({seed,seconds,doneW,cleared})),actualSamples);}
const actual=speed=>i=>{const r=actualSamples[i%actualSamples.length];return{seconds:r.seconds/speed,mode:'build',wave:r.doneW,won:r.cleared};};
const fixed=(mode,winRate,minutes=5)=>i=>({seconds:minutes*60,mode,wave:Math.floor(minutes*4),won:Math.floor((i+1)*winRate)>Math.floor(i*winRate)});
const scenarios=[];
const modeName=mode=>mode==='duel'?'대전':'협동';
if(actualSamples.length)for(const speed of[1,3]){
 scenarios.push(runScenario('current_solo_'+speed+'x',`현행 싱글 기본 덱 ${speed}배속`,actual(speed),{description:`v114 폰 기본 덱 20개 관측(13승 7패)을 고정 순서로 재생. 전투 초 ÷ ${speed}을 유효 실제 시간으로 환산; 성장에 따른 속도 개선 및 소환 연출 시간 미반영.`}));
}
for(const [mode,rate]of[['duel',.5],['coop',.7]]){
 scenarios.push(runScenario('current_'+mode,'v115 보상 적용 전 '+modeName(mode),fixed(mode,rate),{description:'시범 모드는 계정 재화 0'}));
 scenarios.push(runScenario('proposal_'+mode,'적용 후 '+modeName(mode)+' 5분 경기',fixed(mode,rate),{proposed:true,description:`경기 5분 가정, 승률 ${rate*100}%는 성장 모델용 가정이며 실제 승률 측정치가 아님`}));
 scenarios.push(runScenario('proposal_'+mode+'_loss','적용 후 '+modeName(mode)+' 5분 경기 · 매번 패배',fixed(mode,0),{proposed:true,description:'모든 경기에서 패배해도 누적 참여만으로 전 연구 가능'}));
}
for(const duration of[3,7,8,10])for(const [mode,rate]of[['duel',.5],['coop',.7]])scenarios.push(runScenario(`proposal_${mode}_${duration}min`,`적용 후 ${modeName(mode)} ${duration}분 경기`,fixed(mode,rate,duration),{proposed:true,description:'경기 길이 민감도; 초당 기본 보상은 같고 매 경기 승리 소액 보너스와 정산 간격만 차이'}));
scenarios.push(runScenario('production_coop_457sec','적용 후 협동 7.6분 경기',fixed('coop',.7,457/60),{proposed:true,description:'확정 협동 규칙의 기본 무료 덱 성공 2개 시드 456·458초 평균 457초를 경기 길이 가정으로 사용. 승률 70%는 여전히 가정이며 두 성공 표본으로 승률을 추정하지 않음.'}));
scenarios.push(runScenario('production_coop_457sec_loss','적용 후 협동 7.6분 경기 · 매번 패배',fixed('coop',0,457/60),{proposed:true,description:'동일한 457초 유효 참여 후 모든 경기에서 패배한다고 가정. 패배 시점 분포의 실측치가 아님.'}));
const report={generated:new Date().toISOString(),baselineRef,hashes,productionHash,soloObservations:{sourceRef:soloObservationRef,deck:[1,2,3,4,5],layout:'phone',samples:actualSamples},initial,goals,rewardExamples,proposal,scenarios,assumptions:{dailyBudgetsMinutes:[10,20,30],paidPurchases:0,participationSeconds:'전투가 실제 진행된 유효 참여 시간. 일시정지/대기/종료 이후/오프라인 접속 대기는 제외. 신규 battle은 서버가 유효 보드 3개 이상과 접속/요약 시각으로 관찰하는 시간.',noDailyReset:true,noStreak:true,claimTiming:'완료/패배 정산 시 초에 비례해 각각 내림한 정수 재화를 지급. 검증된 대전·협동 참여 시간만 영구 누적.',supportEquality:'공동 승패·유효 참여 시간이 같으면 공격/지원/보급 역할과 관계없이 같은 보상',legacyRewards:'기존 싱글 보상 고정. 대전·협동 누적 보상에 기존 싱글 시간을 합산하거나 소급 환산하지 않음.',notMeasuredPlayerRetention:true,botTimingCaveat:'기존 싱글 관측 시간은 소환 연출을 즉시 완료하는 자동 전투 시간. 3배속 표는 이를 3으로 나눈 계획값이며 실제 사용자 세션 길이로 단정할 수 없다.'}};
const pretty=n=>n==null?'도달 불가':String(n),money=n=>n.toLocaleString('en-US');
const costTable=['| 목표 | 총 골드 | 총 조각 | 초기 지급 차감 후 골드 |','| --- | ---: | ---: | ---: |',...goals.map(g=>`| ${g.name} | ${money(g.cost.gold)} | ${money(g.cost.shards)} | ${money(g.netEarned.gold)} |`)].join('\n');
const scenarioTable=s=>['| 목표 | 누적 전투 분 | 경기 수 | 하루 10분 | 하루 20분 | 하루 30분 |','| --- | ---: | ---: | ---: | ---: | ---: |',...s.results.map(r=>`| ${r.name} | ${pretty(r.minutes)} | ${r.minutes==null?'—':r.matches} | ${pretty(r.days[10])} | ${pretty(r.days[20])} | ${pretty(r.days[30])} |`)].join('\n');
const summaryScenarios=['proposal_duel','production_coop_457sec','production_coop_457sec_loss','current_solo_3x'].map(id=>scenarios.find(s=>s.id===id)).filter(Boolean);
const summaryTable=['| 플레이 가정 | 성장 목표 | 유효 분 | 10분/일 | 20분/일 | 30분/일 |','| --- | --- | ---: | ---: | ---: | ---: |',...summaryScenarios.flatMap(s=>s.results.filter(r=>r.goal!=='all_plus_main').map(r=>`| ${s.name} | ${r.name} | ${pretty(r.minutes)} | ${pretty(r.days[10])}일 | ${pretty(r.days[20])}일 | ${pretty(r.days[30])}일 |`))].join('\n');
const sensitivityTable=['| 모드·경기 길이 가정 | 전체 20종 최대 유효 분 | 10분/일 | 20분/일 | 30분/일 |','| --- | ---: | ---: | ---: | ---: |',...scenarios.filter(s=>s.proposed).map(s=>{const r=s.results.find(r=>r.goal==='max_all');return `| ${s.name} | ${pretty(r.minutes)} | ${pretty(r.days[10])}일 | ${pretty(r.days[20])}일 | ${pretty(r.days[30])}일 |`;})].join('\n');
const md=`# 무과금 성장 경로와 무료 보상

**모든 20종 해금과 최대 숙련·특성·각성은 무료 플레이만으로 가능하다.** 기존 비용과 싱글 보상은 그대로 두고, 서버가 검증한 대전·협동 참여에 무료 연구 골드와 조각을 지급한다. 이 문서의 비용은 실제 연구 API, 새 보상은 실제 생산 정산 API로 계산했다. 비용 비교 기준은 v115 커밋 ${baselineRef}이며, 현재 정산 코드 SHA-256은 JSON의 productionHash에 기록한다.

전체 20종 최대 연구의 권장 성장 길이는 **약 2.5~3시간의 유효 참여**다. 하루 20분을 온전히 활용하는 5분 경기 모델에서는 승패가 섞여도 약 8일, 모두 패배해도 9일이다. 협동 7.6분 경기에서는 하루 20분에 두 경기만 들어가므로 약 11일이다. 이는 자동 전투와 참여 시간에 근거한 계획값으로, 이용자의 실제 완료 시간을 보장하지 않는다. 대기·준비·쉬는 시간은 별도다.

## 주요 성장 일정

대전은 5분 경기·50% 승리, 협동은 7.6분 경기·70% 승리를 가정한다. 협동 승률은 실측값이 아니다. 각 목표는 처음 계정에서 따로 계산하며, ‘20종 해금 + 주력 5종 최대 연구’의 합산 비용은 다음 비용 표에 구분했다.

${summaryTable}

## 실제 연구 API로 검산한 비용

초기 보유는 1~6번 여섯 종류, 연구 골드 ${money(initial.gold)}, 조각 ${initial.shards}이다. 골드는 전투 중 SP와 다른 계정 재화다. 선행 해금부터 실제 treeUnlock/treeUpgrade/treeTalent/treeAwaken을 호출해 지출을 검산했다. 추천 다섯 종류는 포격·서리·뇌전·증폭·맥동이며, 맥동 선행인 모사 해금도 포함했다.

${costTable}

한 종류 숙련 0→5는 1,300골드·50조각, 각성은 300골드·15조각으로 합계 1,600골드·65조각이다. 특성 변경과 서포터 선택은 계속 무료다. ‘20종 해금’과 ‘5종 최대 연구’는 서로 독립된 목표 비용이며, 둘 다 완료하려면 세 번째 행을 사용한다.

## 적용한 무료 보상

- 유효 참여 1분당 연구 골드 300·조각 8. 승리와 패배 모두 같은 시간 보상을 받는다. 매 경기 정산에서 골드는 floor(유효 초 × 300 / 60), 조각은 floor(유효 초 × 8 / 60)로 각각 내림한다.
- 60초 미만 참여도 기본 보상을 받는다. 승리와 첫 승리 추가 보상은 60초 이상 유효 참여한 경우에만 지급한다.
- 승리 추가 보상은 골드 100·조각 5. 대전·협동 각 모드 첫 승리는 여기에 골드 300·조각 20을 한 번 더 지급한다.
- 대전·협동 누적 유효 참여 10/30/60/120/240/480분에서 각각 골드 300/400/500/600/800/1,000과 조각 20/30/40/40/50/60을 한 번 지급한다. 날짜가 바뀌거나 접속을 쉬어도 진행과 수령 권리는 유지된다.
- 지원 역할을 포함한 협동 참가자는 같은 공동 결과와 같은 유효 참여 시간에 같은 재화를 받는다. 개인 피해량이나 처치 수로 보상을 나누지 않는다.
- 기존 싱글 웨이브·클리어 보상은 그대로 유지한다. 싱글 시간은 대전·협동 누적 보상에 합산하지 않으며, 과거 기록도 소급 환산하지 않는다.
- 입장권·피로도·연속 출석·기한 한정 성장 재화·유료 전용 능력·승리 구매는 추가하지 않는다. 구매 조각은 무료 조각과 같으며 숙련 상한과 연구 조건도 같다.

7~8분 동안 유효하게 참여하면 패배해도 기본 **2,100~2,400골드·56~64조각**, 승리하면 **2,200~2,500골드·61~69조각**을 받는다. 첫 승리와 누적 목표 보너스는 별도다. 패배가 더 빨리 끝나면 해당 참여 초에 비례해 지급한다. 457초 모델에서는 기본 2,285골드·60조각, 일반 승리는 2,385골드·65조각이다.

## 기존 보상과 공정한 대전

v115 대전·협동은 검증되지 않은 전투 결과로 계정 재화를 만들지 않도록 0으로 정산했다. 신규 검증 정산만 위 보상을 받으며, 예전 버전 정산은 계속 0이다. 싱글 101웨이브 최초 보상은 5,308골드·170조각, 반복 보상은 5,108골드·120조각으로 바뀌지 않았다. 정확한 모드·웨이브 API 반환은 JSON의 rewardExamples에 있다.

신규 대전은 선택한 5종과 보유 여부를 유지하면서 숙련 0·미각성·미선택 특성·기본 등급으로 수치를 맞춘다. 따라서 성장 완료가 대전의 수치 우위 조건이 되지 않는다. 협동과 기존 싱글의 성장 적용은 유지한다. 기존 저장 경기의 수치는 그대로 복원한다.

## 성장 시간의 계산 방법

싱글은 중단 저장으로 여러 날 이어갈 수 있어 목표에 필요한 유효 시간을 하루 예산으로 나눈 뒤 올림했다. 대전·협동은 각 날짜의 10/20/30분 예산에 완전한 경기가 들어가도록 순서대로 배정했다. 그래서 경기 길이에 따라 남는 시간이 생긴다. 정산 이전 재화는 먼저 사용할 수 없다. 모든 목표는 무구매·초기 지급 재화부터 계산했다.

싱글은 기존 폰 기본 덱 20개 관측(13승·7패)을 고정 순서로 재생했다. 1배속은 전투 초를 그대로, 3배속은 전투 초를 3으로 나눈다. 자동 운영과 소환 연출 생략이 포함되므로 실제 이용자의 세션 길이와 다를 수 있다. 성장에 따른 추가 전투 속도 개선은 모델에 넣지 않았다.

협동은 확정된 700처치 목표·일반 몬스터 체력 0.75배·보스 체력 0.6배 규칙의 무료 기본 덱 성공 두 시드(456초·458초)에서 457초를 경기 길이 참고값으로 삼았다. 성공 표본 둘로 실제 승률이나 패배 시점 분포를 추정하지 않는다. 70% 승리와 같은 길이의 반복 패배는 계획을 비교하기 위한 가정이다.

${scenarios.filter(s=>['current_solo_1x','current_solo_3x','proposal_duel','proposal_duel_loss','production_coop_457sec','production_coop_457sec_loss'].includes(s.id)).map(s=>`### ${s.name}\n\n${s.description||''}\n\n${scenarioTable(s)}\n`).join('\n')}
## 경기 길이·패배 민감도

아래 표는 전체 20종 최대 연구까지를 비교한다. 대전의 승률 가정은 50%, 협동은 70%이며, 매번 패배 행은 0%다. 준비·매칭 시간을 제외한 유효 참여만 계산한다.

${sensitivityTable}

## 지급과 저장의 조건

서버가 발급한 경기 식별자, 좌석, 공동 최종 결과와 유효 참여 시간을 정산 입력으로 사용한다. 클라이언트가 임의로 제출한 처치·승리·경과 시간만으로 계정 재화를 지급하지 않는다. 동일한 증명을 다시 제출해도 저장된 정산 결과를 반환하고 활동 시간·첫 승리·누적 목표를 다시 지급하지 않는다.

유효 참여 시간은 서버가 연결 상태와 최근 전투 요약 시각, 화면 활성 상태, 유효 타워 세 개 이상의 보드를 확인해 관찰한다. 처치 수 0인 지원 역할도 같은 조건으로 참여한다. 대기실, 일시정지, 종료 이후, 오프라인·장시간 요약 공백은 제외한다.

누적 목표는 영구 저장하고 각 한 번만 지급한다. 무료/유료 조각 원장의 구분과 무료 우선 사용을 유지한다. 잘못된 보상 입력은 재화와 기록을 변경하기 전에 거절하며, 기존 계정은 기존 성장·기록·저장을 보존한 채 신규 대전·협동 누적 참여 0초에서 시작한다. 재화 저장 상한에 도달하면 추가 지급은 상한으로 제한되고 해당 목표 수령은 완료된다. 이미 받은 재화를 회수하거나 과거 기록을 중복 정산하지 않는다.

## 재현과 한계

~~~powershell
node tools/economy-model.cjs
node tools/battle-reward-test.cjs
~~~

결과 JSON·CSV·HTML은 gen/economy-model에 생성된다. 소스 SHA-256, 목표별 모든 연구 API 호출, 3/5/7/7.6/8/10분 경기 길이 민감도, 매번 패배하는 계정도 포함한다. 전체 20종 최대 연구는 게임플레이 성장 완료를 의미하며 별도 판매되는 선택적 외형 구매를 뜻하지 않는다. 실제 플레이 유지율·매칭 대기·이용자의 완료 시간·수익화 지표는 측정하지 않았다.
`;
function reportHtml(markdown){
 const escape=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const inline=s=>escape(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
 const lines=markdown.split('\n'),html=[];let i=0;
 while(i<lines.length){
  const line=lines[i];
  if(!line.trim()){i++;continue;}
  if(line.startsWith('~~~')){const code=[];i++;while(i<lines.length&&!lines[i].startsWith('~~~'))code.push(lines[i++]);i++;html.push('<pre><code>'+escape(code.join('\n'))+'</code></pre>');continue;}
  if(line.startsWith('|')){
   const rows=[];while(i<lines.length&&lines[i].startsWith('|'))rows.push(lines[i++].split('|').slice(1,-1).map(s=>s.trim()));
   html.push('<div class="table"><table><thead><tr>'+rows[0].map(s=>'<th>'+inline(s)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(2).map(row=>'<tr>'+row.map(s=>'<td>'+inline(s)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue;
  }
  if(line.startsWith('- ')){const items=[];while(i<lines.length&&lines[i].startsWith('- '))items.push('<li>'+inline(lines[i++].slice(2))+'</li>');html.push('<ul>'+items.join('')+'</ul>');continue;}
  const heading=line.match(/^(#{1,3}) (.+)$/);
  if(heading){const n=heading[1].length;html.push('<h'+n+'>'+inline(heading[2])+'</h'+n+'>');i++;continue;}
  const paragraph=[];while(i<lines.length&&lines[i].trim())paragraph.push(lines[i++]);html.push('<p>'+inline(paragraph.join(' '))+'</p>');
 }
 return '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DiceKeep v116 · 무과금 성장과 무료 보상</title><style>'+
 'html{background:#f1f3f6;color:#202735;font:16px/1.75 "Malgun Gothic","Apple SD Gothic Neo",sans-serif}body{margin:0;padding:32px 18px}main{max-width:1160px;margin:auto;padding:42px 52px;background:#fff;border:1px solid #dce1e8;border-radius:8px}h1{font-size:32px;letter-spacing:-1.3px;line-height:1.3;margin:0 0 24px}h2{font-size:23px;margin:44px 0 16px;padding-top:12px;border-top:1px solid #e2e7ed}h3{font-size:18px;margin:28px 0 12px}p{margin:13px 0}strong{font-weight:700;color:#173f6e}.table{overflow-x:auto;margin:16px 0 26px}table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums;line-height:1.6}th{background:#eaf0f7;color:#203c5c;font-weight:700;white-space:nowrap}td,th{padding:11px 12px;border-bottom:1px solid #dfe5ec;text-align:left;vertical-align:top}tbody tr:nth-child(even){background:#f8fafc}td:not(:first-child){min-width:55px}li{margin:12px 0}pre{padding:18px;background:#f1f4f8;overflow:auto;border-radius:5px;font-size:14px}.meta{font-size:13px;color:#627184;margin-bottom:20px}@media(max-width:700px){body{padding:0}main{padding:28px 18px;border:0;border-radius:0}h1{font-size:26px}h2{font-size:21px}table{min-width:690px;font-size:13px}}@media print{html{background:white}body{padding:0}main{max-width:none;padding:0;border:0}h2,h3{break-after:avoid}.table{overflow:visible}tr{break-inside:avoid}td,th{padding:6px}h1{font-size:25px}table{font-size:10px}}'+
 '</style><main><div class="meta">DICEKEEP · v116 무료 성장 보고서 · 생산 정산 API 기반 / 시간은 가정 모델</div>'+html.join('\n')+'</main></html>';
}
function write(){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));const rows=[['scenario','goal','gold_cost','shard_cost','combat_minutes','matches','days_10min','days_20min','days_30min'],...scenarios.flatMap(s=>s.results.map(r=>[s.id,r.goal,goals.find(g=>g.id===r.goal).cost.gold,goals.find(g=>g.id===r.goal).cost.shards,r.minutes??'unreachable',r.minutes==null?'':r.matches,r.days[10]??'unreachable',r.days[20]??'unreachable',r.days[30]??'unreachable']))];fs.writeFileSync(path.join(out,'economy-model.csv'),'\uFEFF'+rows.map(r=>r.join(',')).join('\r\n'));fs.writeFileSync(path.join(root,'docs/FREE-PROGRESSION.md'),md);fs.writeFileSync(path.join(out,'report.html'),reportHtml(md));console.log(JSON.stringify({baselineRef,initial,costs:goals.map(g=>({goal:g.id,...g.cost,netGold:g.netEarned.gold})),proposed:scenarios.filter(s=>['proposal_duel','proposal_coop','proposal_duel_loss'].includes(s.id)).map(s=>({id:s.id,results:s.results.map(r=>({goal:r.goal,minutes:r.minutes,days:r.days}))}))},null,2));}
if(require.main===module)write();
module.exports={exactCost,settlement,runScenario,goals,proposal,report};
