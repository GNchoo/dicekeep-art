(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DKDECKRULES = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  // Card identity, account class, battle power and pips are independent axes.
  const rarities = Object.freeze({ common: { name: '일반', baseClass: 1, color: '#c3d2d9' }, rare: { name: '희귀', baseClass: 3, color: '#78c6ee' }, unique: { name: '영웅', baseClass: 5, color: '#ba98ef' }, legendary: { name: '전설', baseClass: 7, color: '#ebc977' } });
  const rows = [
    [1,'속사','common','주력','짧은 간격으로 선두의 적을 집중 공격합니다.', ['공격','속사'],[7,11], { dmg:18, rate:0.55, range:155, laser:true }],
    [2,'포격','common','광역','착탄 지점 주변의 적을 함께 공격합니다.', ['공격','광역'],[4,8], { dmg:36, rate:1.5, range:150, proj:'shell', splash:66 }],
    [3,'비전','common','주력','안정적인 사거리와 높은 단발 피해를 가집니다.', ['공격','마법'],[7,8], { dmg:34, rate:1, range:180, proj:'bolt' }],
    [4,'서리','common','제어','공격한 적을 느리게 합니다. 빙쇄와 잘 어울립니다.', ['제어','둔화'],[2,12], { dmg:12, rate:0.9, range:165, proj:'frostShard', slow:true }],
    [5,'뇌전','rare','광역','가까운 적에게 세 번 연쇄합니다.', ['공격','연쇄'],[4,7], { dmg:22, rate:1.1, range:160, chain:true }],
    [6,'축재','rare','경제','전투 중 12초마다 눈금에 비례한 SP를 생산합니다.', ['지원','경제'],[14,16], { dmg:10, rate:1.2, range:155, proj:'dieBomb', ability:'income' }],
    [7,'박동','rare','지원','상하좌우의 타워 공격속도를 높입니다. 같은 효과는 가장 강한 하나만 적용됩니다.', ['지원','인접'],[1,3], { dmg:10, rate:1.1, range:155, proj:'bolt', ability:'haste' }],
    [8,'증폭','rare','지원','상하좌우의 타워 피해를 높입니다. 같은 효과는 가장 강한 하나만 적용됩니다.', ['지원','인접'],[2,10], { dmg:12, rate:1.2, range:155, proj:'bolt', ability:'amplify' }],
    [9,'맹독','rare','지속','중독을 3초간 남깁니다. 재공격하면 지속시간을 갱신합니다.', ['공격','지속'],[4,11], { dmg:14, rate:1.1, range:175, proj:'bolt', ability:'poison' }],
    [10,'추적','unique','보스','보스를 우선 조준하고 보스에게 80% 추가 피해를 줍니다.', ['공격','보스'],[7,8], { dmg:39, rate:1.35, range:220, proj:'bolt', ability:'hunter' }],
    [11,'균열','unique','지원','명중한 적의 방어를 3초간 절반으로 낮춥니다.', ['지원','약화'],[1,9], { dmg:22, rate:1, range:175, proj:'bolt', ability:'fracture' }],
    [12,'빙쇄','unique','주력','둔화 상태의 적에게 65% 추가 피해를 줍니다.', ['공격','둔화 연계'],[4,7], { dmg:28, rate:0.95, range:175, proj:'frostShard', ability:'shatter' }],
    [13,'모사','unique','변환','같은 눈금의 다른 종류 위로 옮기면 그 종류로 변합니다. 대상은 남습니다.', ['운영','복제'],[14,19], { dmg:8, rate:1.1, range:150, proj:'bolt', ability:'copy' }],
    [14,'새싹','legendary','성장','전투 중 28초 후 눈금이 하나 오르고 덱의 무작위 종류로 변합니다.', ['운영','성장'],[13,15], { dmg:6, rate:1.2, range:150, proj:'bolt', ability:'growth' }],
    [15,'소집','legendary','운영','같은 종류·눈금으로 합성하면 빈 석단에 덱의 1눈금 타워를 추가 소환합니다.', ['운영','소환'],[13,16], { dmg:14, rate:1.1, range:160, proj:'bolt', ability:'summoner' }],
    [16,'환원','common','경제','같은 종류·눈금으로 합성하면 재료 눈금당 45 SP를 돌려줍니다.', ['지원','경제'],[6,15], { dmg:20, rate:1, range:160, proj:'bolt', ability:'sacrifice' }],
    [17,'공명','legendary','지원','이웃한 타워와 눈금이 같으면 그 타워 피해를 35% 높입니다.', ['지원','같은 눈금'],[1,18], { dmg:13, rate:1.1, range:165, proj:'bolt', ability:'resonance' }],
    [18,'고독','unique','배치','상하좌우에 타워가 없으면 피해가 70% 증가합니다.', ['공격','독립 배치'],[6,13], { dmg:28, rate:1.05, range:195, proj:'bolt', ability:'isolate' }],
    [19,'군집','legendary','주력','필드의 같은 종류가 3·5·7기 이상이면 공격속도가 단계적으로 상승합니다.', ['공격','개수 조합'],[13,14], { dmg:25, rate:1, range:170, proj:'bolt', ability:'swarm' }],
    [20,'맥동','legendary','광역','네 번째 공격마다 넓은 범위에 2배 피해를 줍니다.', ['공격','주기 폭발'],[7,4], { dmg:25, rate:1.25, range:180, proj:'dieBomb', ability:'pulse' }],
  ];
  const catalog = Object.freeze(rows.map(([id,name,rarity,role,description,tags,partners,stats]) => Object.freeze({ id, name: name+' 주사위', rarity, role, description, baseClass:rarities[rarity].baseClass, tags:Object.freeze(tags), partners:Object.freeze(partners), stats:Object.freeze({ pspd:430, canAir:true, atk:'norm', ...stats }) })));
  const get = id => catalog.find(c => c.id === Number(id)) || null;
  const clamp = (n,a,b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
  const pips = t => Math.floor(clamp(t && t.pips,1,7));
  const validDeck = deck => Array.isArray(deck) && deck.length === 5 && new Set(deck).size === 5 && deck.every(id => !!get(id));
  const draw = (deck,rng=Math.random) => { if (!validDeck(deck)) throw Error('다섯 종류의 유효한 덱이 필요합니다.'); return deck[Math.floor(clamp(rng(),0,0.999999999)*5)]; };
  const summon = (deck,rng) => ({ face:draw(deck,rng), pips:1, lvl:1 });
  const canMerge = (a,b) => !!a && !!b && a !== b && a.face === b.face && pips(a) === pips(b) && pips(a) < 7;
  const canCopy = (a,b) => !!a && !!b && a !== b && get(a.face)?.stats.ability === 'copy' && a.face !== b.face && pips(a) === pips(b);
  function merge(a,b,deck,rng) { if (!canMerge(a,b)) return null; return { face:draw(deck,rng), pips:pips(a)+1, lvl:1, bonusSP:get(a.face).stats.ability === 'sacrifice' ? 45*pips(a) : 0, summon:get(a.face).stats.ability === 'summoner' }; }
  const powerCost = level => [0,100,200,400,700][Math.floor(clamp(level,1,5))] || Infinity;
  const summonCost = count => 30 + 5*Math.min(100,Math.max(0,Math.floor(count||0)));
  const adjacent = (a,b,cols=5) => a !== b && Number.isInteger(a.spot) && Number.isInteger(b.spot) && (Math.abs(a.spot-b.spot)===cols || (Math.floor(a.spot/cols)===Math.floor(b.spot/cols) && Math.abs(a.spot-b.spot)===1));
  const treeSnapshot = s => s?.treeVersion===1;
  const awakened = (t,s) => treeSnapshot(s) && pips(t)===7 && s.awakenings?.[t.face]===true;
  const awakeningRows = [
    ['과속','공격속도가 추가로 35% 증가합니다.'],['거포','폭발 범위가 66에서 105로 넓어집니다.'],
    ['관통광','공격이 방어를 무시합니다.'],['영구빙','둔화가 15%p 강해지고 3초간 지속됩니다.'],
    ['뇌우','연쇄 대상이 3명 늘어납니다.'],['황금샘','SP 생산 주기가 8초가 되고 생산량이 50% 증가합니다.'],
    ['심장박동','인접 공격속도 지원 효과가 50% 강해집니다.'],['과충전','인접 피해 지원 효과가 50% 강해집니다.'],
    ['맹독안개','중독 피해가 2배가 되고 5초간 지속됩니다.'],['거인사냥','보스 추가 피해가 80%에서 150%가 됩니다.'],
    ['붕괴','적의 방어를 5초간 80% 낮춥니다.'],['빙하분쇄','둔화 대상 추가 피해가 65%에서 130%가 됩니다.'],
    ['완전모사','7눈금 대상을 복제하면 복제한 타워의 공격속도가 영구히 25% 증가합니다.'],
    ['세계수','7눈금을 유지하며 전투 중 12초마다 70 SP를 생산합니다.'],
    ['집결지','전투 중 20초마다 빈 석단에 덱의 1눈금 타워를 소환합니다. 빈 칸이 없으면 기다립니다.'],
    ['순환로','전투 중 15초마다 90 SP를 돌려줍니다.'],
    ['대공명','인접 타워는 눈금과 관계없이 피해가 50% 증가합니다.'],
    ['독무대','주변이 비어 있을 때 추가 피해가 70%에서 120%가 되고 사거리가 50 늘어납니다.'],
    ['대군집','공격속도 상승에 필요한 같은 종류 수가 3·5·7에서 2·4·6으로 줄어듭니다.'],
    ['진동파','강화 폭발이 네 번째 대신 세 번째 공격마다 발동합니다.'],
  ];
  const awakeningInfo = id => get(id) ? {name:awakeningRows[id-1][0],description:awakeningRows[id-1][1]} : null;
  function talentInfo(id,choice) {
    if (!get(id) || !['force','insight'].includes(choice)) return null;
    const a=get(id).stats.ability;
    return choice==='force' ? {name:'집중',description:'직접 공격과 중독 피해 +10%'} : {name:'통찰',description:['income','growth'].includes(a) ? '능력 발동 주기 10% 단축' : ['haste','amplify','resonance'].includes(a) ? '인접 지원 효과 +10%' : '공격속도 +10%'};
  }
  const supporterRows = Object.freeze({
    supply:Object.freeze({id:'supply',name:'보급관',cooldown:45,description:'80 + 필드 총 눈금(최대 40) SP를 얻습니다.'}),
    crusher:Object.freeze({id:'crusher',name:'분쇄관',cooldown:45,description:'선택한 타워를 덱의 무작위 1눈금으로 교체하고, 기존 눈금당 40 SP를 얻습니다.'}),
    barrage:Object.freeze({id:'barrage',name:'포격관',cooldown:35,description:'선두의 적 최대 8명에게 80 + 필드 총 눈금 × 18 피해를 줍니다. 보스에게는 피해의 25%가 적용됩니다.'}),
  });
  const supporterInfo = id => supporterRows[id] || null;
  function stats(t,snapshot,power=1,board=[],cols=5) {
    const c=get(t.face); if (!c) return null;
    const neighbors=board.filter(n=>!n.moving && adjacent(t,n,cols));
    const boost = ability => Math.max(0,...neighbors.filter(n=>get(n.face)?.stats.ability===ability).map(n=>pips(n)));
    const cls = clamp(snapshot?.classes?.[t.face],c.baseClass,20), level=clamp(power,1,5), eyes=pips(t);
    const tree=treeSnapshot(snapshot), awake=awakened(t,snapshot), talent=tree?snapshot.talents?.[t.face]:null;
    let dmg=c.stats.dmg*(1+0.03*(tree?clamp(snapshot.mastery?.[t.face],0,5):cls-c.baseClass))*(1+0.3*(level-1));
    const support = (ability,base) => Math.max(0,...neighbors.filter(n=>get(n.face)?.stats.ability===ability).map(n=>(base+pips(n)*0.025)*(awakened(n,snapshot)?1.5:1)*(tree&&snapshot.talents?.[n.face]==='insight'?1.1:1)));
    dmg *= 1 + (tree ? support('amplify',0.18) : boost('amplify') ? 0.18+boost('amplify')*0.025 : 0);
    const resonance=Math.max(0,...neighbors.filter(n=>get(n.face)?.stats.ability==='resonance'&&(pips(n)===eyes||awakened(n,snapshot))).map(n=>(awakened(n,snapshot)?0.5:0.35)*(tree&&snapshot.talents?.[n.face]==='insight'?1.1:1)));
    dmg*=1+resonance;
    if (c.stats.ability==='isolate' && !neighbors.length) dmg*=awake?2.2:1.7;
    if (talent==='force') dmg*=1.1;
    let speed=eyes*(1+(tree ? support('haste',0.14) : boost('haste') ? 0.14+boost('haste')*0.025 : 0));
    if (talent==='insight'&&!['income','growth','haste','amplify','resonance'].includes(c.stats.ability)) speed*=1.1;
    if (tree && t.copyHaste) speed*=1.25;
    if (awake && t.face===1) speed*=1.35;
    if (c.stats.ability==='swarm') { const n=board.filter(n=>n.face===t.face).length+(awake?1:0); speed*=n>=7?1.9:n>=5?1.55:n>=3?1.25:1; }
    const insightClock=talent==='insight'&&['income','growth'].includes(c.stats.ability)?0.9:1;
    return { ...c.stats,dmg,rate:c.stats.rate/speed,range:c.stats.range+4*(level-1)+(awake&&t.face===18&&!neighbors.length?50:0),
      slowPct:Math.min(0.7,Math.min(0.55,0.2+0.04*level+0.012*eyes)+(awake&&t.face===4?0.15:0)),slowDur:awake&&t.face===4?3:1.8,
      splash:awake&&t.face===2?105:c.stats.splash,chain:3+Math.floor((eyes-1)/3)+(awake&&t.face===5?3:0),
      ignoreArmor:awake&&t.face===3,hunterMult:awake&&t.face===10?2.5:1.8,shatterMult:awake&&t.face===12?2.3:1.65,
      fracturePct:awake&&t.face===11?0.8:0.5,fractureDur:awake&&t.face===11?5:3,poisonScale:awake&&t.face===9?1.3:0.65,poisonDur:awake&&t.face===9?5:3,
      incomePeriod:(awake?8:12)*insightClock,incomeAmount:(8+eyes*5)*(awake?1.5:1),growthPeriod:28*insightClock,
      pulseEvery:awake&&t.face===20?3:4,awakened:awake,critChance:0.1,critDamage:clamp(snapshot?.critDamage,1.2,3) };
  }
  // Comparison only: one of each, 3 pips, power 1, no armor/crit/procs or travel time.
  // ponytail: this is a fixed formation, not an optimizer or a predicted win rate.
  function preview(faces,snapshot) {
    if (!validDeck(faces)) throw Error('유효한 다섯 종류가 필요합니다.');
    const ordered=faces.slice().sort((a,b)=>get(b).stats.dmg/get(b).stats.rate-get(a).stats.dmg/get(a).stats.rate || a-b);
    const board=ordered.map((face,i)=>({face,pips:3,spot:[6,1,5,7,11][i]}));
    let direct=0,boss=0,solo=0;
    const rows=board.map(t=>{
      const st=stats(t,snapshot,1,board),alone=stats(t,snapshot,1,[]),dps=st.dmg/st.rate;
      direct+=dps;solo+=alone.dmg/alone.rate;boss+=dps*(st.ability==='hunter'?st.hunterMult:1);
      return {...t,dps,damage:st.dmg,rate:st.rate,range:st.range};
    });
    return {board:rows,direct,boss,solo,adjacency:direct/solo-1};
  }
  function enemyStats(wave,isBoss,elite=false,count=1,extreme=false) {
    const w=Math.max(1,wave||1), cycle=Math.floor((w-1)/101), step=(w-1)%101+1;
    const scale=Math.min(1e90, Math.pow(extreme?1.8:1.5,cycle));
    const hp=(isBoss ? 900+85*Math.pow(step,1.5) : 48+4.4*Math.pow(step,1.45))*scale*(elite?1.7:1)/(isBoss?Math.max(1,count):1);
    return { hp:Math.round(hp),armor:Math.min(50,Math.floor(step/12)+cycle*2),gold:isBoss?120:5+Math.floor(step/20) };
  }
  // Original grade combat is shared by the game and its growth/combination guide.
  const gradeBases = [
    ['궁수','속사','붉은 렌즈 속사',{dmg:8,rate:.5,range:150,laser:true,color:'#9fd463',topper:'laserMuzzle'}],
    ['대포','광역','집중 포격 · 주변 2마리 25% 피해',{dmg:32,rate:1.6,range:150,proj:'shell',pspd:300,splash:60,splashTargets:3,splashFalloff:.25,color:'#e0862c',topper:'muzzleFlash'}],
    ['마법','마법','자수정 마력탄',{dmg:32,rate:.95,range:165,proj:'bolt',pspd:430,color:'#b78bff',topper:'bolt'}],
    ['서리','제어','사방 냉기 둔화',{dmg:40,rate:.8,range:165,proj:'frostShard',pspd:400,slow:true,color:'#7fd4ff',topper:'frostShard'}],
    ['전격','연쇄','연쇄 번개',{dmg:60,rate:1.1,range:170,chain:true,color:'#ffe86b',topper:'spark'}],
    ['폭군','광역','폭발 주사위 투척',{dmg:72,rate:1.25,range:175,proj:'dieBomb',pspd:340,splash:55,color:'#ff5555',topper:'dieBomb'}],
  ];
  const gradeCatalog = Object.freeze(Array.from({length:20},(_,i)=>{
    const grade=i+1;
    let shortName,role,description,base;
    if(grade<=6) [shortName,role,description,base]=gradeBases[i];
    else {
      const k=grade-6,perk=grade>=20?'primal':grade>=18?'myth':grade>=14?'epic':null;
      shortName=grade<=10?'별빛 첨탑':grade<=14?'성운 요새':grade<=18?'천공 옥좌':'차원 군주';
      role=perk==='primal'?'전체 광역':perk==='myth'?'고속 광역':perk==='epic'?'방어 무시':'광역';
      description=perk==='primal'?'트랙 전체 광역 · 공격속도 ×1.25':perk==='myth'?'광역 공격 · 공격속도 ×1.5':perk==='epic'?'방어 무시 · 확률 기절':'고유 마력 광역 공격';
      base={star:grade,dmg:Math.round(72*Math.pow(1.28,k)),rate:+(1.25*Math.pow(.97,k)).toFixed(3),range:175+5*k,proj:'dieBomb',pspd:340+6*k,splash:55+4*k,color:grade<=10?'#7fd4ff':grade<=14?'#c78bff':grade<=18?'#ffd452':'#ff7ad9',rainbow:grade>=19,topper:'dieBomb',perk};
    }
    const name=grade<=6?shortName+' 주사위':shortName+' ★'+grade;
    return Object.freeze({id:grade,grade,name,shortName,role,description,stats:Object.freeze({...base,canAir:true,name,desc:description})});
  }));
  const gradeGet = face => gradeCatalog[Number(face)-1] || null;
  const gradeRange=(start,end)=>Array.from({length:end-start+1},(_,i)=>start+i);
  const gradeSynergyCatalog=Object.freeze([
    {id:'swift',name:'속사 지원',groups:[[1],gradeRange(2,20)],rate:1.1,description:'궁수 옆의 다른 타워 공격속도 +10%'},
    {id:'frost',name:'빙결 포격',groups:[[4],[2,5,...gradeRange(6,20)]],slowDamage:1.2,description:'서리 옆 광역 타워가 둔화된 적에게 피해 +20%'},
    {id:'arcane',name:'마력 공명',groups:[[3],gradeRange(7,20)],damage:1.12,description:'마법 옆 7강 이상 타워 피해 +12%'},
    {id:'stars',name:'별빛 진형',groups:[gradeRange(7,10),gradeRange(11,13)],damage:1.1,both:true,description:'7~10강과 11~13강을 나란히 두면 양쪽 피해 +10%'},
    {id:'ascension',name:'초월 연계',groups:[gradeRange(14,17),gradeRange(18,20)],damage:1.1,both:true,description:'14~17강과 18~20강을 나란히 두면 양쪽 피해 +10%'},
  ].map(s=>Object.freeze({...s,groups:Object.freeze(s.groups.map(g=>Object.freeze(g)))})));
  function gradeSynergies(t,board=[],columns=5) {
    const result={damage:1,rate:1,slowDamage:1,active:[]};
    if(!gradeGet(t?.face)||t.moving)return result;
    const neighbors=board.filter(n=>!n.moving&&adjacent(t,n,columns));
    for(const s of gradeSynergyCatalog){
      const applies=s.groups[1].includes(t.face)&&neighbors.some(n=>s.groups[0].includes(n.face))
        ||s.both&&s.groups[0].includes(t.face)&&neighbors.some(n=>s.groups[1].includes(n.face));
      if(!applies)continue;
      result.active.push(s.id);
      for(const key of ['damage','rate','slowDamage'])result[key]=Math.max(result[key],s[key]||1);
    }
    return result;
  }
  const gradeTalentInfo=(face,choice)=>gradeGet(face)&&['force','insight'].includes(choice)?{name:choice==='force'?'집중':'통찰',description:choice==='force'?'해당 강 타워 피해 +10%':'해당 강 타워 공격속도 +10%'}:null;
  const gradeAwakeningInfo=face=>gradeGet(face)?{name:'성채 각성',description:'해당 강 타워 피해 +15% · 연구 완료 후 전투 시작부터 적용'}:null;
  const gradeSupporterInfo=id=>({supply:{...supporterRows.supply,description:'80 + 필드 총 강(최대 40) 골드를 얻습니다.'},crusher:{...supporterRows.crusher,description:'선택한 타워를 해체하고 강당 40골드를 얻습니다. 타워는 사라집니다.'},barrage:{...supporterRows.barrage,description:'선두 최대 8명에게 80 + 필드 총 강 × 18 피해를 줍니다. 보스 피해는 25%입니다.'}}[id]||null);
  function gradeGrowth(face,snapshot={}) {
    if(snapshot.growth===false||!gradeGet(face))return 1;
    if(snapshot.treeVersion===1)return (1+.03*(snapshot.mastery?.[face]||0))*(snapshot.talents?.[face]==='force'?1.1:1)*(snapshot.awakenings?.[face]?1.15:1);
    if(!snapshot.levels?.[face])return 1;
    if(snapshot.classes)return 1+.03*(snapshot.classes[face]-get(face).baseClass);
    const level=Math.min(snapshot.levels[face],snapshot.levelCap),base=1+.08*(Math.min(level,20)-1);
    const result=snapshot.levelCap>20&&level>20?base*Math.pow(1.08,level-20):base;
    return Number.isFinite(result)&&result>=1?result:1;
  }
  // Lv1 / power0 / armor0. Slow-target bonus is conditional and shown separately.
  function gradePreview(faces,snapshot={},columns=5) {
    const input=faces.map((t,i)=>typeof t==='number'?{face:t,spot:i,lvl:1}:t);
    let direct=0,solo=0;
    const active=new Set(),board=input.map(t=>{
      const c=gradeGet(t.face);if(!c)throw Error('1~20강 타워가 필요합니다.');
      const synergy=gradeSynergies(t,input,columns),lvl=Math.floor(clamp(t.lvl,1,3));
      const research=gradeGrowth(t.face,snapshot);
      const growth=snapshot.growth===false?1:Math.max(research,Number.isFinite(t.growthCarry)?t.growthCarry:1);
      const talentSpeed=snapshot.growth!==false&&snapshot.treeVersion===1&&snapshot.talents?.[t.face]==='insight'?1.1:1;
      const damage=c.stats.dmg*[1,1.6,2.4][lvl-1]*growth,rate=c.stats.rate*[1,.92,.85][lvl-1]/(c.stats.perk==='myth'?1.5:c.stats.perk==='primal'?1.25:1)/talentSpeed;
      const dps=damage*synergy.damage/rate*synergy.rate;direct+=dps;solo+=damage/rate;synergy.active.forEach(id=>active.add(id));
      return {...t,lvl,damage:damage*synergy.damage,rate:rate/synergy.rate,range:c.stats.range+[0,12,24][lvl-1],dps,active:synergy.active,slowDamage:synergy.slowDamage};
    });
    return {board,direct,boss:direct,solo,active:[...active]};
  }
  return Object.freeze({ VERSION:1,catalog,get,rarities,validDeck,draw,summon,canMerge,canCopy,merge,pips,powerCost,summonCost,adjacent,stats,preview,enemyStats,treeSnapshot,awakened,awakeningInfo,talentInfo,supporterInfo,gradeCatalog,gradeGet,gradeSynergyCatalog,gradeSynergies,gradeGrowth,gradePreview,gradeTalentInfo,gradeAwakeningInfo,gradeSupporterInfo });
});
