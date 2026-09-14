(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = n => Number(n || 0).toLocaleString();
  const PG = () => window.DKPROGRESSION, rules = () => window.DKDECKRULES, treeRules = () => window.DKTREERULES;
  let api, draft = [], preset = 0, slot = 0, selected = 1, family = 'all', busy = false, dirty = false, notice = '';
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
    selected = id; render();
    $('deck-detail').scrollIntoView({block:'nearest', behavior:'smooth'});
  }
  function putCard(id) {
    if (blocked() || !owned(id)) return;
    const old = draft.indexOf(id);
    if (old >= 0 && old !== slot) [draft[old], draft[slot]] = [draft[slot], draft[old]];
    else draft[slot] = id;
    dirty = true; notice = `${slot+1}번 자리를 바꿨습니다. 덱을 저장하면 적용됩니다.`; render();
  }
  function selectionSummary() {
    const picked = draft.map(card), pairs = new Set(picked.flatMap(c => c.partners.filter(id => draft.includes(id)).map(id => [Math.min(c.id,id),Math.max(c.id,id)].join(':'))));
    const names = [...pairs].slice(0,3).map(p => p.split(':').map(id => shortName(+id)).join(' + '));
    const tips = [];
    if (!picked.some(c => c.tags.includes('공격'))) tips.push('주력 공격이 없습니다.');
    if (!picked.some(c => c.role === '광역')) tips.push('광역 공격이 없어 적이 몰리는 웨이브에 주의하세요.');
    if (!picked.some(c => c.tags.includes('제어'))) tips.push('둔화 없이 화력으로 버티는 구성입니다.');
    const awakened = draft.filter(id => tree().awakenings[id]).length;
    return `<b>조합 살펴보기</b><span>${esc(names.join(' · ') || '카드별 연계 상대와 서포터를 비교해 보세요.')}</span><small>${esc(tips.join(' ') || '공격과 제어를 함께 편성했습니다. 배치와 합성 순서도 중요합니다.')} 각성 연구 완료 ${awakened}/5종.</small>`;
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
    const migrated = t.migration && !['new-profile','new'].includes(t.migration.source);
    $('deck-migration').hidden = !migrated;
    $('deck-migration').textContent = '기존 주사위와 덱을 이어받았습니다. 강화 투자와 남은 카드·보급은 숙련과 연구 골드로 환산됐습니다.';
    $('deck-presets').innerHTML = c.presets.map((p,i)=>`<button type="button" data-preset="${i}" class="${preset===i?'active':''}" aria-pressed="${preset===i}" ${busy?'disabled':''}>덱 ${i+1}${c.activePreset===i?' · 사용 중':''}</button>`).join('');
    $('deck-presets').querySelectorAll('button').forEach(b=>b.onclick=()=>{const i=+b.dataset.preset;if(i===preset)return;if(dirty){notice='현재 덱을 저장하거나 변경 취소한 뒤 다른 덱으로 이동하세요.';render();return;}preset=i;draft=c.presets[i].faces.slice();slot=0;notice=`덱 ${i+1}을 살펴보고 있습니다.`;render();});
    $('deck-selected').innerHTML = draft.map((id,i)=>`<button type="button" class="deck-slot rarity-${card(id).rarity} ${slot===i?'active':''}" data-slot="${i}" data-face="${id}" aria-pressed="${slot===i}"><small>${i+1}번 자리</small>${img(id)}<b>${esc(shortName(id))}</b><span>숙련 ${t.mastery[id]}${t.awakenings[id]?' · 각성':''}</span></button>`).join('');
    $('deck-selected').querySelectorAll('button').forEach(b=>b.onclick=()=>{slot=+b.dataset.slot;selected=draft[slot];render();});
    $('deck-synergy').innerHTML = selectionSummary();
    $('deck-save').disabled = blocked() || !dirty;
    $('deck-save').onclick = async()=>{if(await act('setPreset',{index:preset,deck:draft.slice()},'덱을 저장했습니다.')){dirty=false;render();}};
    $('deck-use').disabled = blocked() || dirty || c.activePreset===preset;
    $('deck-use').onclick = ()=>act('activatePreset',{index:preset},`덱 ${preset+1}을 다음 전투에 사용합니다.`,true);
    $('deck-reset').disabled = busy || !dirty;
    $('deck-reset').onclick = ()=>{draft=c.presets[preset].faces.slice();dirty=false;notice='편성 변경을 취소했습니다.';render();};
    $('tree-supporters').innerHTML = treeRules().supporters.map(s=>{const info=rules().supporterInfo?.(s.id)||s;return `<button type="button" data-supporter="${s.id}" aria-pressed="${t.supporter===s.id}" class="${t.supporter===s.id?'chosen':''}" ${blocked()?'disabled':''}><b>${esc(info.name)}${t.supporter===s.id?' · 선택':''}</b><small>${esc(info.description)}</small><span>재사용 ${info.cooldown}초 · 무료 선택</span></button>`;}).join('');
    $('tree-supporters').querySelectorAll('button').forEach(b=>b.onclick=()=>act('setSupporter',{id:b.dataset.supporter},'서포터를 선택했습니다. 다음 전투부터 적용됩니다.'));
    $('tree-families').innerHTML = [{id:'all',name:'전체 계열'},...treeRules().families].map(f=>`<button type="button" data-family="${f.id}" aria-pressed="${family===f.id}" class="${family===f.id?'chosen':''}">${esc(f.name)}</button>`).join('');
    $('tree-families').querySelectorAll('button').forEach(b=>b.onclick=()=>{family=b.dataset.family;render();});
    $('deck-grid').innerHTML = treeRules().families.filter(f=>family==='all'||family===f.id).map(f=>`<section class="tree-branch" style="--branch:${f.color}"><h4>${esc(f.name)}<small>${f.faces.filter(owned).length}/4종 해금</small></h4><div class="tree-chain">${f.faces.map(id=>{const node=treeRules().get(id),ready=!node.previous||owned(node.previous);return `<button type="button" class="tree-node ${owned(id)?'unlocked':ready?'available':'locked'} ${id===selected?'viewing':''}" data-card="${id}" aria-pressed="${id===selected}">${img(id)}<b>${esc(shortName(id))}</b><span>${esc(card(id).role)}</span><small>${owned(id)?`숙련 ${t.mastery[id]}/5${t.awakenings[id]?' · 각성':''}`:ready?'해금 가능':'선행 연구 필요'}</small></button>`;}).join('')}</div></section>`).join('');
    $('deck-grid').querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>selectCard(+b.dataset.card));
    $('deck-status').textContent = notice || (dirty?'저장하지 않은 덱 편성입니다.':'덱 자리를 선택한 뒤, 트리에서 원하는 주사위를 눌러 편성하세요.');
    renderDetail();
  }
  window.DKDECKUI = Object.freeze({render});
})();
