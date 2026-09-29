(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = n => Number(n || 0).toLocaleString();
  const PG = () => window.DKPROGRESSION, rules = () => window.DKDECKRULES, treeRules = () => window.DKTREERULES;
  let api, draft = [], preset = 0, slot = 0, selected = 1, family = 'engineering', busy = false, dirty = false, notice = '';
  let page = 'overview', detailTab = 'research', comboIndex = 0, earnIndex = 0;
  const profile = () => api.profile(), tree = () => profile().tree, collection = () => profile().collection;
  const card = id => rules().get(id), owned = id => !!collection().cards[id]?.owned;
  const shortName = id => card(id).name.replace(' 주사위', '');
  const img = id => `<img src="${esc(api.icon(id))}" alt="${esc(shortName(id))} 타워" loading="lazy">`;
  const costText = cost => cost ? `${number(cost.gold)}골드${cost.shards ? ' + '+number(cost.shards)+'조각' : ''}` : '';
  const affordable = cost => !!cost && collection().gold >= cost.gold && profile().shards >= cost.shards;
  const blocked = () => busy || !api.editable();
  function failure(reason) {
    return ({'insufficient-gold':'연구 골드가 부족합니다. 전투 보상으로 얻을 수 있습니다.', 'insufficient-shards':'성장 조각이 부족합니다. 모든 투기장 모드의 전투 보상으로 얻을 수 있습니다.', 'prerequisite':'먼저 연결된 이전 주사위를 해금하세요.', 'prerequisite-locked':'먼저 연결된 이전 주사위를 해금하세요.', 'mastery-required':'숙련 조건을 먼저 달성하세요.', 'locked':'먼저 이 주사위를 해금하세요.', 'max-mastery':'최대 숙련입니다.', 'already-awakened':'각성 연구를 마쳤습니다.', 'invalid-deck':'보유한 서로 다른 다섯 종류를 편성하세요.', 'tree-system':'계정 정보를 새로 불러온 뒤 다시 시도하세요.'})[reason] || '변경하지 못했습니다. 선행 연구와 보유 자원을 확인하세요.';
  }
  function resetFromProfile() {
    preset = collection().activePreset || 0;
    draft = collection().presets[preset].faces.slice(); slot = Math.min(slot, 4); dirty = false;
  }
  async function act(type, data, success, reset = false) {
    if (blocked()) return;
    busy = true; notice = '저장 중…'; render();
    try {
      const result = await api.action(type, data);
      if (!result || result.ok === false) { notice = failure(result?.reason); return false; }
      notice = success;
      if (reset) resetFromProfile();
      return true;
    } catch (error) { notice = api.error(error); return false; }
    finally { busy = false; render(); }
  }
  function selectCard(id) {
    selected = id; detailTab = 'research'; page = 'detail'; render();
  }
  function putCard(id) {
    if (blocked() || !owned(id)) return;
    const old = draft.indexOf(id);
    if (old >= 0 && old !== slot) [draft[old], draft[slot]] = [draft[slot], draft[old]];
    else draft[slot] = id;
    page = 'lineup'; dirty = true; notice = `${slot+1}번 자리를 바꿨습니다. 덱을 저장하면 적용됩니다.`; render();
  }
  const snapshot = () => ({treeVersion:1,mastery:tree().mastery,talents:tree().talents,awakenings:tree().awakenings,critDamage:1.5});
  const decimal = n => Number(n).toLocaleString('ko-KR',{maximumFractionDigits:1});
  let analysisFaces = null, analysisBack = 'lineup';
  function metrics(faces,compare) {
    const value=rules().preview(faces,snapshot()),base=rules().preview(compare||collection().presets[preset].faces,snapshot());
    const delta=n=>`${n>=0?'+':''}${decimal(n)}%`;
    return `<div class="deck-metrics"><div><small>일반 · 직접 피해/초</small><b>${decimal(value.direct)}</b><span>저장 덱 대비 ${delta((value.direct/base.direct-1)*100)}</span></div><div><small>보스 · 직접 피해/초</small><b>${decimal(value.boss)}</b><span>저장 덱 대비 ${delta((value.boss/base.boss-1)*100)}</span></div><div><small>예시 배치의 인접 효과</small><b>${delta(value.adjacency*100)}</b><span>각 타워 단독 배치 대비</span></div></div>`;
  }
  function analyzeButton(faces,back) {
    return `<button type="button" data-analyze="${faces.join(',')}" data-analysis-back="${back}" class="analysis-link">배치 · 시너지 자세히 보기 →</button>`;
  }
  function selectionSummary() {
    return metrics(draft)+`<small class="metric-condition">종류별 3눈금 1기 · 덱빌드용 / 순수운빨 미적용</small>`+analyzeButton(draft,'lineup');
  }
  function formation(faces) {
    const result=rules().preview(faces,snapshot());
    const grid=Array.from({length:9},(_,i)=>{
      const spot=Math.floor(i/3)*5+i%3,t=result.board.find(t=>t.spot===spot);
      return t?`<div class="formation-tower">${img(t.face)}<b>${shortName(t.face)}</b><small>${card(t.face).role}</small></div>`:'<div class="formation-empty">빈 칸</div>';
    }).join('');
    return `<div class="formation-panel"><h3>배치 예시</h3><div class="formation-grid">${grid}</div><small>상하좌우만 인접 · 편성 순서와 실제 위치는 별개</small></div>`;
  }
  function renderAnalysis(faces) {
    const conditions=faces.map(id=>{
      const st=rules().stats({face:id,pips:3},snapshot()),a=st.ability;
      const text=id===4?`명중한 적 이동속도 −${decimal(st.slowPct*100)}% · ${st.slowDur}초`:a==='shatter'?`둔화된 적 피해 +${decimal((st.shatterMult-1)*100)}%${faces.includes(4)?' · 서리와 같은 길 조준':' · 서리 편성 권장'}`:a==='hunter'?`보스 피해 +${decimal((st.hunterMult-1)*100)}%`:a==='income'?`${st.incomePeriod}초마다 ${st.incomeAmount} SP`:card(id).description;
      return `<div class="synergy-row"><b>${shortName(id)} · ${card(id).role}</b><span>${esc(text)}</span></div>`;
    }).join('');
    return `<button type="button" data-open-dice="${analysisBack}" class="analysis-back">← 돌아가기</button><div class="analysis-layout">${formation(faces)}<div class="synergy-list">${conditions}</div></div>${metrics(faces)}<p class="metric-condition">3눈금·종류별 1기·파워업 1단계. 직접 피해만 비교하며 광역·독·둔화 연계·주기 폭발·치명타·방어력·공격 공백은 제외합니다. 경제·성장 덱은 이 수치만으로 비교하지 마세요.<br>덱빌드·극한·협동용 연구 수치입니다. 순수운빨에는 미적용, 대전은 연구 수치가 통일됩니다.</p>`;
  }
  function renderDetail() {
    const id = selected, c = card(id), node = treeRules().get(id), have = owned(id), rank = tree().mastery[id];
    const unlock = treeRules().unlockCost(id), upgrade = treeRules().masteryCost(rank), awaken = treeRules().awakeningCost(id);
    const ready = !node.previous || owned(node.previous), awakened = tree().awakenings[id];
    const ability = rules().awakeningInfo?.(id) || node.awakening;
    const disabled = blocked(), choice = tree().talents[id];
    $('deck-detail').innerHTML = `<div class="deck-detail-head rarity-${c.rarity}">${img(id)}<div><small>${esc(node.familyName)} · ${esc(c.role)}</small><h3>${esc(c.name)}</h3><b>${have ? `숙련 ${rank}/5` : '미해금'}</b></div><button id="deck-equip" type="button" ${!have || disabled ? 'disabled' : ''}>${slot+1}번에 편성</button></div><p>${esc(c.description)}</p>`+
      `<div class="tree-research-path"><span class="done">종류 선택</span><span class="${have?'done':''}">해금</span><span class="${rank>=2?'done':''}">숙련 2 · 특성</span><span class="${awakened?'done':''}">숙련 3 · 각성</span></div>`+
      `<p class="tree-prerequisite">${have ? '덱빌드·극한 전투에서 1~7눈금으로 성장합니다. 숙련은 영구 연구이며 눈금과 별개입니다.' : node.previous ? `선행 해금: ${shortName(node.previous)}${ready?' · 완료':' · 먼저 연구하세요'}` : '이 계열의 시작 주사위입니다.'}</p>`+
      `<div class="tree-research-actions"><button id="tree-unlock" type="button" ${have?'hidden':''} ${disabled||!ready||!affordable(unlock)?'disabled':''}>확정 해금 · ${costText(unlock)}</button><button id="tree-upgrade" type="button" ${!have?'hidden':''} ${disabled||!upgrade||!have||!affordable(upgrade)?'disabled':''}>${upgrade ? `숙련 ${rank+1} 연구 · ${costText(upgrade)}` : '최대 숙련 5'}</button></div>`+
      `<p class="deck-stat-note">숙련당 기본 피해 +3%. 두 특성 중 하나를 선택하며, 숙련 2부터 비용 없이 바꿀 수 있습니다.</p>`+
      `<div class="tree-talents">${['force','insight'].map(key => {const info=rules().talentInfo?.(id,key) || treeRules().talents.find(t=>t.id===key);return `<button type="button" data-talent="${key}" aria-pressed="${choice===key}" class="${choice===key?'chosen':''}" ${disabled||!have||rank<2?'disabled':''}><b>${esc(info?.name)}${choice===key?' · 선택 중':''}</b><small>${esc(info?.description)}</small></button>`;}).join('')}</div>`+
      `<div class="tree-awakening ${awakened?'researched':''}"><div><small>7눈금 각성 · ${awakened?'연구 완료':'숙련 3부터 연구 가능'}</small><h4>${esc(ability?.name)}</h4><p>${esc(ability?.description)}</p></div><button id="tree-awaken" type="button" ${disabled||!have||rank<3||awakened||!affordable(awaken)?'disabled':''}>${awakened?'7눈금 도달 시 자동 발동':`각성 연구 · ${costText(awaken)}`}</button></div>`+
      `<div class="deck-partners"><b>함께 살펴볼 주사위</b>${c.partners.map(partner=>`<button type="button" class="deck-partner" data-partner="${partner}">${esc(shortName(partner))}</button>`).join('')}</div>`;
    $('deck-equip').onclick = () => putCard(id);
    $('tree-unlock').onclick = () => act('treeUnlock',{face:id},`${c.name}를 확정 해금했습니다. 원하는 덱 자리에 편성하세요.`);
    $('tree-upgrade').onclick = () => act('treeUpgrade',{face:id},`${c.name} 숙련을 올렸습니다.`);
    $('tree-awaken').onclick = () => act('treeAwaken',{face:id},`${c.name} 각성을 연구했습니다. 다음 전투에서 7눈금에 도달하면 발동합니다.`);
    $('deck-detail').querySelectorAll('[data-talent]').forEach(b=>b.onclick=()=>act('treeTalent',{face:id,choice:b.dataset.talent},`${c.name} 특성을 무료로 변경했습니다.`));
    $('deck-detail').querySelectorAll('[data-partner]').forEach(b=>b.onclick=()=>selectCard(+b.dataset.partner));
  }
  function render(nextApi, reset) {
    if (nextApi) api = nextApi;
    if (!api || !$('deck-grid') || !rules() || !treeRules()) return;
    if (!tree()) { $('deck-status').textContent = '다이스 트리 계정 정보를 불러오지 못했습니다. 새로고침 후 다시 확인하세요.'; return; }
    if (!draft.length || reset && !busy) resetFromProfile();
    const c = collection(), t = tree(), unlocked = rules().catalog.filter(v=>owned(v.id)).length;
    $('deck-gold').textContent = number(c.gold); $('deck-shards').textContent = number(profile().shards);
    $('deck-count').textContent = `${unlocked} / 20종`; $('tree-progress').textContent = `${Object.values(t.awakenings).filter(Boolean).length} / 20`;
    $('deck-presets').innerHTML = c.presets.map((p,i)=>`<button type="button" data-preset="${i}" class="${preset===i?'active':''}" aria-pressed="${preset===i}" ${busy?'disabled':''}>덱 ${i+1}${c.activePreset===i?' · 사용 중':''}</button>`).join('');
    $('deck-presets').querySelectorAll('button').forEach(b=>b.onclick=()=>{const i=+b.dataset.preset;if(i===preset)return;if(dirty){notice='현재 덱을 저장하거나 변경 취소한 뒤 다른 덱으로 이동하세요.';render();return;}preset=i;draft=c.presets[i].faces.slice();slot=0;notice=`덱 ${i+1}을 살펴보고 있습니다.`;render();});
    $('deck-selected').innerHTML = draft.map((id,i)=>`<button type="button" class="deck-slot rarity-${card(id).rarity} ${slot===i?'active':''}" data-slot="${i}" data-face="${id}" aria-pressed="${slot===i}"><small>${i+1}번 자리</small>${img(id)}<b>${esc(shortName(id))}</b><span>숙련 ${t.mastery[id]}${t.awakenings[id]?' · 각성':''}</span></button>`).join('');
    $('deck-selected').querySelectorAll('button').forEach(b=>b.onclick=()=>{slot=+b.dataset.slot;selected=draft[slot];page='catalog';render();});
    $('deck-synergy').innerHTML = selectionSummary();
    $('deck-save').disabled = blocked() || !dirty;
    $('deck-save').onclick = async()=>{if(await act('setPreset',{index:preset,deck:draft.slice()},'덱을 저장했습니다.')){dirty=false;render();}};
    $('deck-use').disabled = blocked() || dirty || c.activePreset===preset;
    $('deck-use').onclick = ()=>act('activatePreset',{index:preset},`덱 ${preset+1}을 다음 전투에 사용합니다.`,true);
    $('deck-reset').disabled = busy || !dirty;
    $('deck-reset').onclick = ()=>{draft=c.presets[preset].faces.slice();dirty=false;notice='편성 변경을 취소했습니다.';render();};
    $('tree-supporters').innerHTML = treeRules().supporters.map(s=>{const info=rules().supporterInfo?.(s.id)||s;return `<button type="button" data-supporter="${s.id}" aria-pressed="${t.supporter===s.id}" class="${t.supporter===s.id?'chosen':''}" ${blocked()?'disabled':''}><b>${esc(info.name)}${t.supporter===s.id?' · 선택':''}</b><small>${esc(info.description)}</small><span>재사용 ${info.cooldown}초 · 무료 선택</span></button>`;}).join('');
    $('tree-supporters').querySelectorAll('button').forEach(b=>b.onclick=()=>act('setSupporter',{id:b.dataset.supporter},'서포터를 선택했습니다. 다음 전투부터 적용됩니다.'));
    $('tree-families').innerHTML = treeRules().families.map(f=>`<button type="button" data-family="${f.id}" aria-pressed="${family===f.id}" class="${family===f.id?'chosen':''}">${esc(f.name)}</button>`).join('');
    $('tree-families').querySelectorAll('button').forEach(b=>b.onclick=()=>{family=b.dataset.family;render();});
    $('deck-grid').innerHTML = treeRules().families.filter(f=>family==='all'||family===f.id).map(f=>`<section class="tree-branch" style="--branch:${f.color}"><h4>${esc(f.name)}<small>${f.faces.filter(owned).length}/4종 해금</small></h4><div class="tree-chain">${f.faces.map(id=>{const node=treeRules().get(id),ready=!node.previous||owned(node.previous);return `<button type="button" class="tree-node ${owned(id)?'unlocked':ready?'available':'locked'} ${id===selected?'viewing':''}" data-card="${id}" aria-pressed="${id===selected}">${img(id)}<b>${esc(shortName(id))}</b><span>${esc(card(id).role)}</span><em class="node-benefit">${esc(card(id).description)}</em><small>${owned(id)?`숙련 ${t.mastery[id]}/5${t.awakenings[id]?' · 각성':''}`:ready?'해금 가능':'선행 연구 필요'}</small></button>`;}).join('')}</div></section>`).join('');
    $('deck-grid').querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>selectCard(+b.dataset.card));
    $('deck-status').textContent = notice || (dirty?'저장하지 않은 덱 편성입니다.':'덱 자리를 선택한 뒤, 트리에서 원하는 주사위를 눌러 편성하세요.');
    renderDetail();
    renderPages();
  }
  function go(next) { page=next; notice=''; render(); }
  const pageButton = (target, title, detail, icon) => `<button type="button" data-open-dice="${target}" class="dice-route"><img src="${icon}" alt=""><span><b>${title}</b><small>${detail}</small></span><span aria-hidden="true">›</span></button>`;
  function renderPages() {
    const titles={overview:'어떻게 강해지나요?',lineup:'다섯 종류로 만드는 나의 덱',catalog:'연구할 주사위를 고르세요',detail:shortName(selected)+' 연구',combos:'역할을 연결하면 더 강해져요',support:'전투에서 쓸 지원 능력',earn:'플레이하고 연구 재료 받기',analysis:'내 배치가 만드는 시너지'};
    if (!$('dice-analysis')) { const section=document.createElement('section');section.dataset.diceView='analysis';section.id='dice-analysis';$('deck-status').before(section); }
    $('dice-analysis').innerHTML=renderAnalysis(analysisFaces||draft);
    $('deck-panel').dataset.page=page;
    $('dice-page-title').textContent=titles[page]+(page==='detail'?` · ${number(collection().gold)} G / ${number(profile().shards)} 조각`:'');
    document.querySelectorAll('[data-dice-view]').forEach(el=>el.hidden=el.dataset.diceView!==page);
    document.querySelectorAll('[data-dice-page]').forEach(b=>{b.setAttribute('aria-current',b.dataset.dicePage===page?'page':'false');b.onclick=()=>go(b.dataset.dicePage);});
    $('dice-growth').innerHTML=
      pageButton('earn','1. 전투로 재료 모으기','연구 골드 + 성장 조각','ui/rewards/attendance-bag.webp')+
      pageButton('catalog','2. 주사위 연구하기','숙련 → 특성 → 7눈금 각성','ui/icon-dice.png')+
      pageButton('combos','3. 역할을 조합하기','주력 + 광역 + 제어 + 지원','ui/icon-trophy.png')+
      pageButton('support','서포터 선택','전투 중 사용하는 무료 지원 능력','ui/icon-users.png');
    const combos=[
      {name:'처음에는 균형 있게',faces:[1,2,3,4,5],pair:[4,2],tip:'서리가 적을 늦추는 동안 포격·뇌전이 몰린 적을 정리합니다.',place:'서리와 포격이 같은 길을 공격하도록 배치하세요.'},
      {name:'둔화 + 추가 피해',faces:[1,2,4,7,12],pair:[4,12],tip:'빙쇄는 둔화된 적에게 추가 피해 65%. 서리가 먼저 맞히면 효과적입니다.',place:'박동은 주력 타워의 상하좌우에 붙여 배치하세요.'},
      {name:'보스 집중 공격',faces:[2,4,7,8,10],pair:[8,10],tip:'추적은 보스를 우선 공격하고 보스 피해 +80%. 증폭은 이웃의 피해를 높입니다.',place:'추적 옆에 증폭·박동을 놓고, 포격으로 일반 적도 정리하세요.'}
    ];
    const combo=combos[comboIndex],missing=combo.faces.filter(id=>!owned(id));
    $('dice-combos').innerHTML=`<h3>${combo.name}</h3><div class="combo-comparison">${metrics(combo.faces)}</div><p>${combo.tip}</p><p class="metric-condition">3눈금·종류별 1기 · 덱빌드용 / 순수운빨 미적용</p>${analyzeButton(combo.faces,'combos')}<div class="combo-deck">${combo.faces.map(id=>`<button data-combo-card="${id}" type="button">${img(id)}<b>${shortName(id)}</b><small>${owned(id)?card(id).role:'해금 필요'}</small></button>`).join('')}</div><div class="combo-formation">${formation(combo.faces)}<div class="combo-goal"><b>${shortName(combo.pair[0])} ＋ ${shortName(combo.pair[1])}</b><p>${combo.place}</p></div></div><button id="dice-apply-combo" type="button" ${missing.length||blocked()?'disabled':''}>${missing.length?'먼저 해금: '+missing.map(shortName).join(' · '):'이 조합으로 편성'}</button><div class="page-controls"><button id="combo-prev" ${comboIndex===0?'disabled':''}>이전</button><span>${comboIndex+1} / ${combos.length}</span><button id="combo-next" ${comboIndex===combos.length-1?'disabled':''}>다음 조합</button></div>`;
    $('combo-prev').onclick=()=>{comboIndex--;render();};$('combo-next').onclick=()=>{comboIndex++;render();};
    $('dice-apply-combo').onclick=()=>{if(blocked()||missing.length)return;draft=combo.faces.slice();dirty=true;go('lineup');};
    $('dice-combos').querySelectorAll('[data-combo-card]').forEach(b=>b.onclick=()=>selectCard(+b.dataset.comboCard));
    const detail=$('deck-detail');detail.dataset.tab=detailTab;
    const nav=document.createElement('nav');nav.className='dice-detail-tabs';
    for(const [id,label] of [['research','숙련·해금'],['talents','특성'],['awakening','각성'],['performance','성능·연계']]) {
      const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(detailTab===id));b.onclick=()=>{detailTab=id;render();};nav.append(b);
    }
    detail.prepend(nav);
    detail.querySelector('.tree-prerequisite').textContent=owned(selected)?`숙련 0 → 1 → 2(특성) → 3(각성) → 5`:`선행 해금: ${treeRules().get(selected).previous?shortName(treeRules().get(selected).previous):'없음'}`;
    const rank=tree().mastery[selected];
    detail.querySelector('.deck-stat-note').textContent=`현재 기본 피해 +${rank*3}% → 다음 숙련 +${Math.min(5,rank+1)*3}% · 특성은 숙련 2부터 무료 선택`;
    const st=rules().stats({face:selected,pips:3},snapshot()),next=rules().stats({face:selected,pips:3},{...snapshot(),mastery:{...tree().mastery,[selected]:Math.min(5,rank+1)}});
    const stats=document.createElement('div');stats.className='research-preview';
    stats.innerHTML=`<h4>연구 전 → 다음 숙련</h4><div class="research-numbers"><span>직접 피해/초<b>${decimal(st.dmg/st.rate)} → ${decimal(next.dmg/next.rate)}</b></span><span>사거리<b>${decimal(st.range)}</b></span></div><small>3눈금 · 단독 배치 · 파워업 1단계${rank===5?' · 최대 숙련':''}</small><h4>이 주사위와 함께</h4><div class="research-partners">${card(selected).partners.map(id=>`<button type="button" data-research-partner="${id}">${img(id)}<span><b>${shortName(id)} · ${card(id).role}</b><small>${esc(card(id).description)}</small></span></button>`).join('')}</div>`;
    detail.append(stats);stats.querySelectorAll('[data-research-partner]').forEach(b=>b.onclick=()=>selectCard(+b.dataset.researchPartner));
    const rewards=PG().rewardView(profile());
    const earnPages=[
      `<h3>전투 → 재료 → 연구</h3><img class="earn-art" src="ui/rewards/attendance-bag.webp" alt="연구 재료"><p>대전·협동 유효 참여 1분</p><strong>${rewards.perMinute.gold} 골드 + ${rewards.perMinute.shards} 조각</strong><p>패배해도 지급 · 타워 3개 이상 배치 필요</p><p class="dice-caption">자리 비움은 제외됩니다. 순수운빨에서는 연구 효과가 적용되지 않습니다.</p>`,
      `<h3>승리 보너스</h3><p>1분 이상 참여한 승리<br><b>100 골드 + 5 조각</b></p><p>대전·협동 각각 첫 승리<br><b>추가 300 골드 + 20 조각</b></p><p>대전 ${rewards.firstWins.duel?'달성':'미달성'} · 협동 ${rewards.firstWins.coop?'달성':'미달성'}</p>`,
      ...rewards.milestones.map(m=>`<h3>누적 참여 ${m.minutes}분</h3><img class="earn-art" src="ui/rewards/growth-shards.webp" alt="성장 조각"><p><b>${number(m.gold)} 골드 + ${m.shards} 조각</b></p><p>${m.claimed?'수령 완료':Math.floor(rewards.activeSeconds/60)+'분 참여 중'}</p><p class="dice-caption">연속 참여·구매 조건 없이 누적됩니다.</p>`)
    ];
    earnIndex=Math.min(earnIndex,earnPages.length-1);
    $('free-progress').innerHTML=earnPages[earnIndex]+`<div class="page-controls"><button id="earn-prev" ${earnIndex===0?'disabled':''}>이전</button><span>${earnIndex+1} / ${earnPages.length}</span><button id="earn-next" ${earnIndex===earnPages.length-1?'disabled':''}>다음</button></div>`;
    $('earn-prev').onclick=()=>{earnIndex--;render();};$('earn-next').onclick=()=>{earnIndex++;render();};
    $('deck-panel').querySelectorAll('[data-open-dice]').forEach(b=>b.onclick=()=>go(b.dataset.openDice));
    $('deck-panel').querySelectorAll('[data-analyze]').forEach(b=>b.onclick=()=>{analysisFaces=b.dataset.analyze.split(',').map(Number);analysisBack=b.dataset.analysisBack;go('analysis');});
    $('deck-status').textContent=notice||(dirty?'편성 변경 후 덱 저장을 눌러주세요.':'');
  }
  window.DKDECKUI = Object.freeze({render, open:()=>go('overview')});
})();
