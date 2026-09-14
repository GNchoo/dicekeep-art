(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let api, draft = [], preset = 0, slot = 0, selected = 1, filter = 'all', rarity = 'all', busy = false, dirty = false, notice = '', reward = null;
  const PG = () => window.DKPROGRESSION, rules = () => window.DKDECKRULES;
  const profile = () => api.profile(), card = id => rules().get(id), owned = id => !!profile().collection.cards[id]?.owned;
  const img = id => `<img src="${esc(api.icon(id))}" alt="" loading="lazy">`;
  const number = n => Number(n || 0).toLocaleString();
  const names = { common: '일반', rare: '희귀', unique: '영웅', legendary: '전설' };
  const failure = reason => ({'insufficient-gold':'수집 골드가 부족합니다. 전투 보상과 무료 보급에서 얻을 수 있습니다.', 'insufficient-copies':'같은 주사위 카드가 더 필요합니다.', 'insufficient-cards':'같은 주사위 카드가 더 필요합니다.', 'insufficient-shards':'성장 조각이 부족합니다. 전투를 완료하면 받을 수 있습니다.', 'no-packs':'보유한 무료 보급이 없습니다.', 'locked':'먼저 이 주사위를 획득하세요.', 'max-class':'최대 클래스입니다.', 'invalid-deck':'서로 다른 보유 주사위 다섯 종류를 편성하세요.'}[reason] || '변경하지 못했습니다. 보유 자원과 덱을 확인하세요.');
  function collection() { return profile().collection; }
  function selectionSummary() {
    const picked = draft.map(card).filter(Boolean), tags = new Set(picked.flatMap(c => c.tags));
    const pairs = picked.flatMap(c => (c.partners || []).filter(id => draft.includes(id)).map(id => [Math.min(c.id,id), Math.max(c.id,id)].join(':')));
    const unique = [...new Set(pairs)].slice(0, 3).map(pair => pair.split(':').map(id => card(Number(id)).name.replace(' 주사위','')).join(' + '));
    const tips = [];
    if (!tags.has('공격')) tips.push('주력 공격이 없습니다. 지원만으로는 적을 막기 어렵습니다.');
    if (!picked.some(c => c.role === '광역')) tips.push('광역 공격이 없습니다. 적이 몰리는 웨이브에 주의하세요.');
    if (!tags.has('제어')) tips.push('둔화 없이 화력으로 버티는 구성입니다.');
    if (!tags.has('지원') && !tags.has('운영')) tips.push('공격 중심 덱입니다. 지원·경제 한 자리를 비교해 보세요.');
    return `<b>조합 살펴보기</b><span>${unique.length ? esc(unique.join(' · ')) : '각 카드의 연계 상대를 확인해 보세요.'}</span><small>${esc(tips.join(' ') || '공격과 운영 역할을 함께 편성했습니다. 배치와 합성 순서도 중요합니다.')}</small>`;
  }
  function resetFromProfile() {
    const c = collection(); preset = c.activePreset || 0;
    draft = (c.presets[preset]?.faces || profile().deck).slice(); slot = Math.min(slot, 4); dirty = false;
  }
  async function act(type, data, success, reset) {
    if (busy || !api.editable()) return;
    busy = true; notice = '처리 중…'; render();
    try {
      const result = await api.action(type, data || {});
      if (!result || result.ok === false) notice = failure(result?.reason);
      else { notice = typeof success === 'function' ? success(result) : success; if (reset) resetFromProfile(); }
    } catch (e) { notice = api.error(e); }
    finally { busy = false; render(); }
  }
  function selectCard(id) {
    selected = id; reward = null; render();
    if (window.matchMedia('(max-width: 600px)').matches) $('deck-detail').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function putCard(id) {
    if (busy || !api.editable() || !owned(id)) return;
    const old = draft.indexOf(id);
    if (old >= 0 && old !== slot) [draft[old], draft[slot]] = [draft[slot], draft[old]];
    else draft[slot] = id;
    dirty = true; notice = `${slot + 1}번 자리를 바꿨습니다. 덱을 저장하면 적용됩니다.`; render();
  }
  function renderDetail() {
    const c = card(selected), info = collection().cards[selected], have = !!info?.owned, cls = have ? info.class : c.baseClass;
    const cost = have ? PG().classUpgradeCost(selected, cls) : null, craft = PG().craftCost(selected);
    const partners = (c.partners || []).map(id => `<button type="button" class="deck-partner" data-partner="${id}">${esc(card(id).name)}</button>`).join('');
    $('deck-detail').innerHTML = `<div class="deck-detail-head rarity-${c.rarity}">${img(c.id)}<div><small>${esc(names[c.rarity])} · ${esc(c.role)}</small><h3>${esc(c.name)}</h3><b>${have ? '클래스 ' + cls : '미보유'}</b></div></div><p>${esc(c.description)}</p>` +
      `<dl class="deck-stat-row"><div><dt>기본 공격력</dt><dd>${c.stats.dmg}</dd></div><div><dt>공격 간격</dt><dd>${c.stats.rate}초</dd></div><div><dt>사거리</dt><dd>${c.stats.range}</dd></div></dl><p class="deck-stat-note">1눈금 · 파워업 1 기준. 클래스와 전투 배치에 따라 달라집니다.</p>` +
      `<div class="deck-copy-meter"><span>중복 카드 ${number(info?.copies)}${cost ? ' / ' + number(cost.copies) : ''}</span><progress max="${cost?.copies || 1}" value="${Math.min(info?.copies || 0, cost?.copies || 1)}"></progress></div>` +
      `<div class="deck-detail-actions"><button type="button" id="deck-equip" ${!have || busy ? 'disabled' : ''}>${slot + 1}번 자리에 편성</button><button type="button" id="deck-class-up" ${!have || !cost || busy || collection().gold < cost.gold || info.copies < cost.copies ? 'disabled' : ''}>${!have ? '획득 후 클래스 성장' : cost ? `클래스 ${cls + 1} · ${number(cost.gold)}골드 + 카드 ${cost.copies}` : '최대 클래스 20'}</button><button type="button" id="deck-craft" ${busy || profile().shards < craft.shards ? 'disabled' : ''}>${have ? `선택 카드 ${craft.copies}장 제작` : '이 주사위 확정 획득'} · ${craft.shards}조각</button></div>` +
      `<small class="deck-stat-note">제작은 선택한 주사위만 지급합니다. 성장 조각은 무료 플레이로도 획득합니다.</small><div class="deck-partners"><b>함께 살펴볼 주사위</b>${partners}</div>`;
    $('deck-equip').onclick = () => putCard(selected);
    $('deck-class-up').onclick = () => act('classUp', {face:selected}, `${c.name} 클래스를 올렸습니다.`);
    $('deck-craft').onclick = () => act('craft', {face:selected}, `${c.name} 카드를 제작했습니다.`);
    $('deck-detail').querySelectorAll('[data-partner]').forEach(b => b.onclick = () => selectCard(Number(b.dataset.partner)));
  }
  function render(nextApi, reset) {
    if (nextApi) api = nextApi;
    if (!api || !$('deck-grid') || !rules() || !profile().collection) return;
    if (!draft.length || reset && !busy) resetFromProfile();
    const c = collection(), sum = PG().collectionSummary(profile());
    $('deck-shards').textContent = number(profile().shards); $('deck-gold').textContent = number(c.gold);
    $('deck-migration').hidden = !(c.migration?.source === 'legacy-levels-v1');
    $('deck-migration').textContent = c.migration?.spentShards ? '기존 해금과 덱을 이어받았습니다. 이전 강화 투자는 새 클래스·중복 카드·수집 골드로 환산됐습니다.' : '기존에 해금한 주사위와 덱을 이어받았습니다.';
    $('deck-count').textContent = `${sum.owned} / 20종`; $('deck-crit').textContent = `${Math.round(sum.critDamage * 100)}%`;
    $('deck-presets').innerHTML = [0,1,2].map(i => `<button type="button" data-preset="${i}" class="${preset === i ? 'active' : ''}" aria-pressed="${preset === i}" ${busy ? 'disabled' : ''}>덱 ${i+1}${c.activePreset === i ? ' · 사용 중' : ''}</button>`).join('');
    $('deck-presets').querySelectorAll('button').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.preset); if (i === preset) return;
      if (dirty) { notice = '현재 덱을 저장하거나 변경 취소한 뒤 다른 덱으로 이동하세요.'; render(); return; }
      preset = i; draft = c.presets[i].faces.slice(); slot = 0; notice = `덱 ${i+1}을 살펴보고 있습니다.`; render();
    });
    $('deck-selected').innerHTML = draft.map((id, i) => `<button type="button" class="deck-slot rarity-${card(id).rarity} ${slot === i ? 'active' : ''}" data-slot="${i}" data-face="${id}" aria-pressed="${slot === i}"><small>${i+1}번</small>${img(id)}<b>${esc(card(id).name.replace(' 주사위',''))}</b><span>클래스 ${c.cards[id]?.class || card(id).baseClass}</span></button>`).join('');
    $('deck-selected').querySelectorAll('button').forEach(b => b.onclick = () => {slot = Number(b.dataset.slot); selected = draft[slot]; render();});
    $('deck-synergy').innerHTML = selectionSummary();
    $('deck-save').disabled = busy || !api.editable() || !dirty;
    $('deck-save').onclick = () => act('setPreset', {index:preset,deck:draft.slice()}, '덱을 저장했습니다.', false).then(() => { if (!busy && notice === '덱을 저장했습니다.') {dirty=false;render();} });
    $('deck-use').disabled = busy || dirty || c.activePreset === preset;
    $('deck-use').onclick = () => act('activatePreset', {index:preset}, `덱 ${preset+1}을 다음 전투에 사용합니다.`, true);
    $('deck-reset').disabled = busy || !dirty;
    $('deck-reset').onclick = () => {draft = c.presets[preset].faces.slice();dirty=false;notice='편성 변경을 취소했습니다.';render();};
    const list = rules().catalog.filter(v => (rarity === 'all' || v.rarity === rarity) && (filter === 'all' || filter === 'owned' ? filter !== 'owned' || owned(v.id) : filter === 'locked' ? !owned(v.id) : v.tags.includes(filter)));
    $('deck-grid').innerHTML = list.map(v => { const info = c.cards[v.id]; return `<button type="button" class="deck-card rarity-${v.rarity} ${selected === v.id ? 'viewing' : ''} ${draft.includes(v.id) ? 'selected' : ''} ${info?.owned ? '' : 'locked'}" data-card="${v.id}" aria-pressed="${selected === v.id}"><small>${names[v.rarity]}${draft.includes(v.id) ? ' · 편성' : ''}</small>${img(v.id)}<b>${esc(v.name.replace(' 주사위',''))}</b><span>${esc(v.role)}</span><small>${info?.owned ? `클래스 ${info.class} · 카드 ${number(info.copies)}` : '미보유 · 확정 제작 가능'}</small></button>`; }).join('') || '<p class="deck-empty">조건에 맞는 주사위가 없습니다.</p>';
    $('deck-grid').querySelectorAll('[data-card]').forEach(b => b.onclick = () => selectCard(Number(b.dataset.card)));
    $('deck-filter').value = filter; $('deck-filter').onchange = e => {filter=e.target.value;render();};
    $('deck-rarity').value = rarity; $('deck-rarity').onchange = e => {rarity=e.target.value;render();};
    $('deck-pack-count').textContent = number(c.packs);
    $('deck-open-pack').disabled = busy || !c.packs;
    $('deck-open-pack').onclick = () => act('openPack', {}, result => {
      reward = result; return '무료 보급을 열었습니다. 카드와 수집 골드가 지급됐습니다.';
    });
    $('deck-pack-pity').textContent = `전설 보장까지 최대 ${sum.nextLegendaryIn}회 · 보유 보급은 만료되지 않습니다.`;
    const odds = PG().PACK_ODDS;
    $('deck-pack-odds').textContent = `무료 보급 1개: 카드 ${PG().PACK_CARDS}장 + ${PG().PACK_GOLD}골드. 카드 희귀도: ${Object.keys(names).map(k=>names[k]+' '+odds[k]+'%').join(' · ')}. 전설 없이 ${PG().PACK_PITY-1}회를 열었다면 ${PG().PACK_PITY}번째 보급에서 전설을 보장합니다. 보급은 현금으로 판매하지 않습니다.`;
    $('deck-pack-result').innerHTML = reward ? `<b>획득 결과 · +${number(reward.gold)}골드</b><div class="deck-rewards">${(reward.cards || reward.rewards || []).map(r => `<div class="rarity-${card(r.face).rarity}" data-reward-face="${r.face}">${img(r.face)}<b>${esc(card(r.face).name.replace(' 주사위',''))}</b><small>${r.isNew || r.newlyOwned ? '새 주사위!' : '중복 카드 +'+r.copies}</small></div>`).join('')}</div>` : '';
    $('deck-status').textContent = notice || (dirty ? '저장하지 않은 덱 편성입니다.' : '덱의 자리를 선택하고 원하는 주사위로 교체하세요.');
    renderDetail();
  }
  window.DKDECKUI = Object.freeze({render});
})();
