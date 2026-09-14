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
  function stats(t,snapshot,power=1,board=[],cols=5) {
    const c=get(t.face); if (!c) return null;
    const neighbors=board.filter(n=>!n.moving && adjacent(t,n,cols));
    const boost = ability => Math.max(0,...neighbors.filter(n=>get(n.face)?.stats.ability===ability).map(n=>pips(n)));
    const cls = clamp(snapshot?.classes?.[t.face],c.baseClass,20), level=clamp(power,1,5), eyes=pips(t);
    let dmg=c.stats.dmg*(1+0.03*(cls-c.baseClass))*(1+0.3*(level-1));
    dmg *= 1 + (boost('amplify') ? 0.18+boost('amplify')*0.025 : 0);
    if (neighbors.some(n=>get(n.face)?.stats.ability==='resonance' && pips(n)===eyes)) dmg*=1.35;
    if (c.stats.ability==='isolate' && !neighbors.length) dmg*=1.7;
    let speed=eyes*(1+(boost('haste') ? 0.14+boost('haste')*0.025 : 0));
    if (c.stats.ability==='swarm') { const n=board.filter(n=>n.face===t.face).length; speed*=n>=7?1.9:n>=5?1.55:n>=3?1.25:1; }
    return { ...c.stats,dmg,rate:c.stats.rate/speed,range:c.stats.range+4*(level-1),slowPct:Math.min(0.55,0.2+0.04*level+0.012*eyes),chain:3+Math.floor((eyes-1)/3),critChance:0.1,critDamage:clamp(snapshot?.critDamage,1.2,3) };
  }
  function enemyStats(wave,isBoss,elite=false,count=1,extreme=false) {
    const w=Math.max(1,wave||1), cycle=Math.floor((w-1)/101), step=(w-1)%101+1;
    const scale=Math.min(1e90, Math.pow(extreme?1.8:1.5,cycle));
    const hp=(isBoss ? 900+85*Math.pow(step,1.5) : 48+4.4*Math.pow(step,1.45))*scale*(elite?1.7:1)/(isBoss?Math.max(1,count):1);
    return { hp:Math.round(hp),armor:Math.min(50,Math.floor(step/12)+cycle*2),gold:isBoss?120:5+Math.floor(step/20) };
  }
  return Object.freeze({ VERSION:1,catalog,get,rarities,validDeck,draw,summon,canMerge,canCopy,merge,pips,powerCost,summonCost,adjacent,stats,enemyStats });
});
