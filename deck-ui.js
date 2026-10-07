(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = n => Number(n || 0).toLocaleString();
  const decimal = n => Number(n || 0).toLocaleString('ko-KR',{maximumFractionDigits:1});
  const PG = () => window.DKPROGRESSION, rules = () => window.DKDECKRULES, treeRules = () => window.DKTREERULES;
  let api, selected = 1, gradePage = 0, family = 'engineering', busy = false, notice = '';
  let page = 'overview', detailTab = 'research', comboIndex = 0, earnIndex = 0, partnerIndex = 0;
  let analysisFaces = [1,2], analysisBack = 'combos', analysisTab = 'placement';
  const profile = () => api.profile(), tree = () => profile().tree, collection = () => profile().collection;
  const card = id => rules().gradeGet(id), owned = id => !!collection().cards[id]?.owned;
  const shortName = id => card(id).shortName;
  const img = id => `<img src="${esc(api.icon(id))}" alt="${id}강 ${esc(shortName(id))} 타워" loading="lazy">`;
  const costText = cost => cost ? `${number(cost.gold)}골드${cost.shards ? ' + '+number(cost.shards)+'조각' : ''}` : '';
  const affordable = cost => !!cost && collection().gold >= cost.gold && profile().shards >= cost.shards;
  const blocked = () => busy || !api.editable();
  const snapshot = () => ({gradeSystem:1,treeVersion:1,mastery:tree().mastery,talents:tree().talents,awakenings:tree().awakenings,critDamage:1.5});
  const preview = faces => rules().gradePreview(faces,snapshot());
  const towerStats = id => preview([id]).board[0];
  const slowPower = result => result.board.reduce((sum,t)=>sum+t.dps*(t.slowDamage||1),0);
  function failure(reason) {
    return ({'insufficient-gold':'연구 골드가 부족합니다. 전투 보상으로 얻을 수 있습니다.', 'insufficient-shards':'성장 조각이 부족합니다. 전투 보상으로 얻을 수 있습니다.', 'prerequisite':'먼저 연결된 이전 타워를 연구하세요.', 'prerequisite-locked':'먼저 연결된 이전 타워를 연구하세요.', 'mastery-required':'숙련 조건을 먼저 달성하세요.', 'locked':'먼저 이 타워의 연구를 해금하세요.', 'max-mastery':'최대 숙련입니다.', 'already-awakened':'각성 연구를 마쳤습니다.'})[reason] || '변경하지 못했습니다. 선행 연구와 보유 자원을 확인하세요.';
  }
  async function act(type,data,success) {
    if(blocked()) return;
    busy=true;notice='저장 중…';render();
    try { const result=await api.action(type,data);notice=result?.ok===false?failure(result.reason):success; }
    catch(error) { notice=api.error(error); }
    finally { busy=false;render(); }
  }
  function selectCard(id) { selected=id;partnerIndex=0;detailTab='research';page='detail';render(); }
  function go(next) { if(next==='lineup')gradePage=Math.floor((selected-1)/5);page=next;notice='';render(); }
  const pageButton = (target,title,detail,icon) => `<button type="button" data-open-dice="${target}" class="dice-route"><img src="${icon}" alt=""><span><b>${title}</b><small>${detail}</small></span><span aria-hidden="true">›</span></button>`;
  function metrics(faces) {
    const value=preview(faces),slow=slowPower(value),conditional=slow>value.direct+.01,gain=((conditional?slow:value.direct)/value.solo-1)*100;
    return `<div class="deck-metrics"><div><small>배치 후 직접 화력</small><b>${decimal(value.direct)}<em>피해/초</em></b><span>연계 없는 ${decimal(value.solo)}에서 비교</span></div><div><small>${conditional?'둔화된 적 화력':'인접 시너지 증가'}</small><b>${conditional?decimal(slow):'+'+decimal(gain)}<em>${conditional?'피해/초':'%'}</em></b><span>${conditional?`둔화 시 전체 화력 +${decimal(gain)}%`:'전체 직접 피해 기준'}</span></div></div>`;
  }
  function formation(faces) {
    const value=preview(faces);
    return `<div class="formation-panel"><h3>석단 배치 예시</h3><div class="formation-grid">${Array.from({length:15},(_,spot)=>{const t=value.board.find(t=>t.spot===spot);return t?`<div class="formation-tower">${img(t.face)}<b>${t.face}강</b><small>${shortName(t.face)}</small></div>`:'<div class="formation-empty">빈 칸</div>';}).join('')}</div><small>상하좌우 인접하면 발동 · 실제 뽑힌 타워로 배치</small></div>`;
  }
  const synergyFaces = synergy => [synergy.groups[0][0],synergy.groups[1].find(id=>id!==synergy.groups[0][0])];
  function synergyEffect(s) { return [s.damage?`피해 +${decimal((s.damage-1)*100)}%`:'',s.rate?`공격속도 +${decimal((s.rate-1)*100)}%`:'',s.slowDamage?`둔화 적 피해 +${decimal((s.slowDamage-1)*100)}%`:''].filter(Boolean).join(' · '); }
  function synergyCard(s) {
    const faces=synergyFaces(s);
    return `<section class="deck-tactics grade-tactics"><header><b>${esc(s.name)}</b></header><div class="tactics-body"><div class="tactic-chain"><div class="tactic-pair">${faces.map((id,i)=>(i?'<span>＋</span>':'')+`<div>${img(id)}<b>${id}강</b></div>`).join('')}</div><strong>${synergyEffect(s)}</strong><p>${esc(s.description)}</p></div></div></section>`;
  }
  function renderLineup() {
    const faces=Array.from({length:5},(_,i)=>gradePage*5+i+1),c=card(selected),st=towerStats(selected),next=selected<20?rules().gradePreview([{face:selected+1,spot:0,lvl:1,growthCarry:st.damage/c.stats.dmg}],snapshot()).board[0]:null;
    $('deck-presets').innerHTML=Array.from({length:4},(_,i)=>`<button type="button" data-grade-page="${i}" aria-pressed="${gradePage===i}" class="${gradePage===i?'active':''}">${i*5+1}~${i*5+5}강</button>`).join('');
    $('deck-presets').querySelectorAll('button').forEach(b=>b.onclick=()=>{gradePage=+b.dataset.gradePage;selected=gradePage*5+1;render();});
    $('deck-selected').innerHTML=faces.map(id=>`<button type="button" class="deck-slot ${selected===id?'active':''}" data-grade="${id}" aria-pressed="${selected===id}"><small>${id}강</small>${img(id)}<b>${esc(shortName(id))}</b><span>${esc(card(id).role)}</span></button>`).join('');
    $('deck-selected').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=+b.dataset.grade;render();});
    const partners=rules().gradeSynergyCatalog.filter(s=>s.groups.some(g=>g.includes(selected)));
    const s=partners[0],partner=s?s.groups[s.groups[0].includes(selected)?1:0].find(id=>id!==selected):null;
    $('deck-synergy').innerHTML=`<section class="grade-tower-preview"><div class="grade-tower-art">${img(selected)}<strong>${selected}강 ${esc(shortName(selected))}</strong><small>${esc(c.role)}</small></div><div class="grade-tower-copy"><p>${esc(c.description)}</p><div class="research-numbers"><span>직접 화력<b>${decimal(st.dps)}<em> /초</em></b></span><span>기본 사거리<b>${decimal(st.range)}</b></span></div><div class="grade-next"><small>${next?'다음 강화 목표':'최고 강화 도달'}</small><b>${next?`${selected+1}강 · ${decimal(next.dps)} 피해/초`:'20강 · 최종 타워'}</b><span>${next?`현재보다 화력 +${decimal((next.dps/st.dps-1)*100)}%`:'강화 후에도 배치 연계로 더 강해져요'}</span></div></div></section>${s?`<button type="button" data-grade-synergy="${rules().gradeSynergyCatalog.indexOf(s)}" class="grade-partner">${img(partner)}<span><b>${esc(s.name)} · ${synergyEffect(s)}</b><small>${partner}강과 상하좌우 배치 · 연계 보기</small></span></button>`:''}<button type="button" data-research-grade="${selected}" class="analysis-link">${selected}강 숙련 · 특성 · 각성 연구</button>`;
    $('deck-synergy').querySelector('[data-grade-synergy]')?.addEventListener('click',e=>{comboIndex=+e.currentTarget.dataset.gradeSynergy;go('combos');});
    $('deck-synergy').querySelector('[data-research-grade]').onclick=()=>selectCard(selected);
  }
  function renderDetail() {
    const id=selected,c=card(id),node=treeRules().get(id),have=owned(id),rank=tree().mastery[id];
    const unlock=treeRules().unlockCost(id),upgrade=treeRules().masteryCost(rank),awaken=treeRules().awakeningCost(id);
    const ready=!node.previous||owned(node.previous),awakened=tree().awakenings[id],disabled=blocked(),choice=tree().talents[id];
    const ability=rules().gradeAwakeningInfo(id);
    const st=towerStats(id),next=rules().gradePreview([id],{...snapshot(),mastery:{...tree().mastery,[id]:Math.min(5,rank+1)}}).board[0];
    $('deck-detail').dataset.tab=detailTab;
    $('deck-detail').innerHTML=`<nav class="dice-detail-tabs">${[['research','숙련·해금'],['talents','특성'],['awakening','각성'],['performance','성능·연계']].map(([key,label])=>`<button type="button" data-detail-tab="${key}" aria-pressed="${detailTab===key}">${label}</button>`).join('')}</nav><div class="deck-detail-head">${img(id)}<div><small>${id}강 · ${esc(c.role)}</small><h3>${esc(shortName(id))} 타워</h3><b>${have?`숙련 ${rank}/5`:'연구 미해금 · 전투 등장 가능'}</b></div></div><p>${esc(c.description)}</p><p class="tree-prerequisite">${have?'숙련 2에서 특성 · 숙련 3에서 각성 연구':node.previous?`선행 연구: ${node.previous}강 ${shortName(node.previous)}${ready?' · 완료':''}`:'이 계열의 첫 연구입니다.'}</p><div class="tree-research-actions"><button id="tree-unlock" type="button" ${have?'hidden':''} ${disabled||!ready||!affordable(unlock)?'disabled':''}>연구 해금 · ${costText(unlock)}</button><button id="tree-upgrade" type="button" ${!have?'hidden':''} ${disabled||!upgrade||!affordable(upgrade)?'disabled':''}>${upgrade?`숙련 ${rank+1} 연구 · ${costText(upgrade)}`:'최대 숙련 5'}</button></div><p class="deck-stat-note">연구는 전투 중 강화와 별개입니다. 미연구 타워도 뽑기·강화로 얻을 수 있어요.</p><div class="tree-talents">${['force','insight'].map(key=>{const info=rules().gradeTalentInfo(id,key);return `<button type="button" data-talent="${key}" aria-pressed="${choice===key}" class="${choice===key?'chosen':''}" ${disabled||!have||rank<2?'disabled':''}><b>${esc(info.name)}${choice===key?' · 선택 중':''}</b><small>${esc(info.description)}</small><span>${rank<2?'숙련 2 연구 필요':'무료 선택·변경'}</span></button>`;}).join('')}</div><div class="tree-awakening ${awakened?'researched':''}"><div><small>${awakened?'연구 완료':'숙련 3부터 연구 가능'}</small><h4>${esc(ability.name)}</h4><p>${esc(ability.description)}</p></div><button id="tree-awaken" type="button" ${disabled||!have||rank<3||awakened||!affordable(awaken)?'disabled':''}>${awakened?'해당 강 타워에 자동 적용':`각성 연구 · ${costText(awaken)}`}</button></div><div class="research-preview"><h4>${detailTab==='performance'?`${id}강 타워의 실제 성능`:'현재 → 다음 숙련'}</h4><div class="research-numbers"><span>직접 화력 /초<b>${decimal(st.dps)}${detailTab==='research'?' → '+decimal(next.dps):''}</b></span><span>기본 사거리<b>${decimal(st.range)}</b></span></div><small>전투 강화 Lv.1 · 방어 0 · 직접 공격 기준</small><h4>함께 배치하면 발동</h4><div class="research-partners">${rules().gradeSynergyCatalog.filter(s=>s.groups.some(g=>g.includes(id))).map(s=>{const partner=s.groups[s.groups[0].includes(id)?1:0].find(face=>face!==id);return `<button type="button" data-partner="${partner}">${img(partner)}<span><b>${esc(s.name)} · ${synergyEffect(s)}</b><small>${esc(s.description)}</small></span></button>`;}).join('')}</div></div>`;
    const partners=$('deck-detail').querySelector('.research-partners'),rows=[...partners.children];
    partnerIndex=Math.min(partnerIndex,rows.length-1);rows.forEach((row,i)=>row.hidden=i!==partnerIndex);
    if(rows.length>1) {
      partners.insertAdjacentHTML('beforeend',`<div class="page-controls"><button type="button" id="partner-prev" ${partnerIndex===0?'disabled':''}>이전</button><span>${partnerIndex+1} / ${rows.length}</span><button type="button" id="partner-next" ${partnerIndex===rows.length-1?'disabled':''}>다음 연계</button></div>`);
      $('partner-prev').onclick=()=>{partnerIndex--;render();};$('partner-next').onclick=()=>{partnerIndex++;render();};
    }
    $('deck-detail').querySelectorAll('[data-detail-tab]').forEach(b=>b.onclick=()=>{detailTab=b.dataset.detailTab;render();});
    $('tree-unlock').onclick=()=>act('treeUnlock',{face:id},`${id}강 타워 연구를 해금했습니다. 전투 등장 확률은 그대로입니다.`);
    $('tree-upgrade').onclick=()=>act('treeUpgrade',{face:id},`${id}강 숙련을 올렸습니다.`);
    $('tree-awaken').onclick=()=>act('treeAwaken',{face:id},`${id}강 각성 연구를 마쳤습니다. 해당 타워에 자동 적용됩니다.`);
    $('deck-detail').querySelectorAll('[data-talent]').forEach(b=>b.onclick=()=>act('treeTalent',{face:id,choice:b.dataset.talent},`${id}강 특성을 무료로 변경했습니다.`));
    $('deck-detail').querySelectorAll('[data-partner]').forEach(b=>b.onclick=()=>selectCard(+b.dataset.partner));
  }
  function renderSupporters() {
    const t=tree();
    $('tree-supporters').innerHTML=treeRules().supporters.map(s=>{
      const info=rules().gradeSupporterInfo(s.id),chosen=t.supporter===s.id,total=15,grade=3;
      const example={supply:{art:'ui/rewards/attendance-bag.webp',alt:'골드 보급',result:`+${80+Math.min(40,total)} G`,basis:`필드 총 ${total}강 예시 · 80 + ${total}`,use:'추가 뽑기와 전투 강화에 쓸 골드'},crusher:{art:'ui/icon-gear.png',alt:'타워 해체',result:`+${grade*40} G · 타워 해체`,basis:`${grade}강 타워 예시 · ${grade} × 40`,use:'선택 타워가 사라집니다. 자동 재소환되지 않습니다.'},barrage:{art:api.icon(2),alt:'지원 포격',result:`적마다 ${80+total*18} 피해`,basis:`총 ${total}강 예시 · 80 + ${total} × 18 · 보스 ${(80+total*18)*.25}`,use:'선두 최대 8명에게 지원 사격'}}[s.id];
      return `<button type="button" data-supporter="${s.id}" aria-pressed="${chosen}" class="supporter-card ${chosen?'chosen':''}" ${blocked()?'disabled':''}><img class="supporter-art" src="${esc(example.art)}" alt="${example.alt}"><span class="supporter-heading"><b>${esc(info.name)}</b><small>재사용 ${info.cooldown}초</small></span><small class="supporter-ability">${esc(info.description)}</small><span class="supporter-example"><strong>${example.result}</strong><small>${example.basis}</small></span><span class="supporter-purpose">${example.use}</span><span class="supporter-choice">${chosen?'선택 중 · 다음 전투에 적용':'이 서포터 선택 · 무료'}</span></button>`;
    }).join('')+'<p class="supporter-page-note">전투 전 1명 선택 · 전투 중 능력 버튼으로 사용</p>';
    $('tree-supporters').querySelectorAll('button').forEach(b=>b.onclick=()=>act('setSupporter',{id:b.dataset.supporter},'서포터를 선택했습니다. 다음 전투부터 적용됩니다.'));
  }
  function render(nextApi) {
    if(nextApi) api=nextApi;
    if(!api||!$('deck-grid')||!rules()?.gradeGet||!treeRules()) return;
    if(!tree()) { $('deck-status').textContent='연구 정보를 불러오지 못했습니다. 새로고침 후 다시 확인하세요.';return; }
    const c=collection(),t=tree();
    $('deck-gold').textContent=number(c.gold);$('deck-shards').textContent=number(profile().shards);$('deck-count').textContent='20강 전체 등장';$('tree-progress').textContent=`${Object.values(t.awakenings).filter(Boolean).length} / 20`;
    $('tree-families').innerHTML=treeRules().families.map(f=>`<button type="button" data-family="${f.id}" aria-pressed="${family===f.id}" class="${family===f.id?'chosen':''}">${esc(f.name)}</button>`).join('');
    $('tree-families').querySelectorAll('button').forEach(b=>b.onclick=()=>{family=b.dataset.family;render();});
    $('deck-grid').innerHTML=treeRules().families.filter(f=>family===f.id).map(f=>`<section class="tree-branch" style="--branch:${f.color}"><h4>${esc(f.name)}<small>${f.faces.filter(owned).length}/4 연구 해금</small></h4><div class="tree-chain">${f.faces.map(id=>{const node=treeRules().get(id),ready=!node.previous||owned(node.previous),st=towerStats(id);return `<button type="button" class="tree-node ${owned(id)?'unlocked':ready?'available':'locked'} ${id===selected?'viewing':''}" data-card="${id}" aria-pressed="${id===selected}">${img(id)}<div class="node-name"><b>${id}강 ${esc(shortName(id))}</b><span>${esc(card(id).role)}</span></div><strong class="node-power">${decimal(st.dps)} <small>피해/초</small></strong><small>${owned(id)?`숙련 ${t.mastery[id]}/5${t.awakenings[id]?' · 각성':''}`:ready?'연구 해금 가능':'선행 연구 필요'} · 전투 등장 가능</small></button>`;}).join('')}</div></section>`).join('');
    $('deck-grid').querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>selectCard(+b.dataset.card));
    renderLineup();renderDetail();renderSupporters();renderPages();
  }
  function renderPages() {
    const titles={overview:'운으로 얻고, 배치로 더 강하게',lineup:'1~20강 전체 타워 · 5종 선택 제한 없음',catalog:'연구 해금과 전투 등장은 별개예요',detail:`${selected}강 ${shortName(selected)} 연구`,combos:'뽑힌 타워를 붙여 시너지를 만드세요',support:'전투에서 쓸 지원 능력',earn:'플레이하고 연구 재료 받기',analysis:'이 배치에서 실제로 얻는 효과'};
    if(!$('dice-analysis')) {const section=document.createElement('section');section.dataset.diceView='analysis';section.id='dice-analysis';$('deck-status').before(section);}
    $('deck-panel').dataset.page=page;$('dice-page-title').textContent=titles[page];
    document.querySelectorAll('[data-dice-view]').forEach(el=>el.hidden=el.dataset.diceView!==page);
    document.querySelectorAll('[data-dice-page]').forEach(b=>{b.setAttribute('aria-current',b.dataset.dicePage===page?'page':'false');b.onclick=()=>go(b.dataset.dicePage);});
    $('dice-growth').innerHTML=`<div class="grade-overview"><div class="grade-overview-art">${[1,10,20].map((id,i)=>(i?'<span>→</span>':'')+`<div>${img(id)}<b>${id}강</b></div>`).join('')}</div><div class="grade-overview-steps"><span><b>뽑기</b><small>기존 확률로 타워 획득</small></span><span><b>강화</b><small>1강부터 20강까지 성장</small></span><span><b>배치</b><small>이웃 타워와 연계 발동</small></span></div><p>높은 강을 얻는 운과, 뽑힌 타워를 연결하는 판단이 함께 필요해요.</p></div><div class="growth-routes">${pageButton('lineup','20강 성장·조합','모든 강의 성능과 다음 목표','ui/icon-dice.png')}${pageButton('combos','배치 시너지','붙이면 얼마나 강해질까요?','ui/icon-trophy.png')}${pageButton('earn','재료 모으기','전투 보상 · 골드와 조각','ui/rewards/attendance-bag.webp')}${pageButton('support','서포터 선택','무료 전투 지원 능력','ui/icon-users.png')}</div>`;
    const combos=rules().gradeSynergyCatalog,combo=combos[comboIndex],faces=synergyFaces(combo);
    $('dice-combos').innerHTML=`<h3>${esc(combo.name)}</h3><div class="combo-deck grade-combo-pair">${faces.map(id=>`<button type="button" data-combo-card="${id}">${img(id)}<b>${id}강 ${shortName(id)}</b><small>${card(id).role}</small></button>`).join('')}</div>${metrics(faces)}${synergyCard(combo)}<small class="metric-condition">배치 계획 예시입니다. 뽑기 결과나 소환 종류를 보장하지 않아요.</small><button type="button" data-analysis-back="combos" data-analyze="${faces.join(',')}" class="analysis-link">석단 배치 · 적용 조건 보기</button><div class="page-controls"><button id="combo-prev" ${comboIndex===0?'disabled':''}>이전</button><span>${comboIndex+1} / ${combos.length}</span><button id="combo-next" ${comboIndex===combos.length-1?'disabled':''}>다음 연계</button></div>`;
    $('combo-prev').onclick=()=>{comboIndex--;render();};$('combo-next').onclick=()=>{comboIndex++;render();};
    $('dice-combos').querySelectorAll('[data-combo-card]').forEach(b=>b.onclick=()=>{selected=+b.dataset.comboCard;gradePage=Math.floor((selected-1)/5);go('lineup');});
    const value=preview(analysisFaces),active=combos.filter(s=>value.active.includes(s.id));
    $('dice-analysis').innerHTML=`<nav class="analysis-tabs"><button type="button" data-open-dice="${analysisBack}">← 뒤로</button>${[['placement','배치'],['effects','발동 효과'],['basis','계산 기준']].map(([key,label])=>`<button type="button" data-analysis-tab="${key}" aria-pressed="${analysisTab===key}">${label}</button>`).join('')}</nav><div class="analysis-placement" ${analysisTab!=='placement'?'hidden':''}>${formation(analysisFaces)}${metrics(analysisFaces)}</div><div class="grade-analysis-effects" ${analysisTab!=='effects'?'hidden':''}>${active.map(synergyCard).join('')}<p class="metric-condition">피해·공격속도·둔화 추가 피해는 각각 가장 강한 효과만 적용됩니다.</p></div><div class="analysis-basis" ${analysisTab!=='basis'?'hidden':''}><h3>실제 공격 수치로 비교해요</h3><p>표시된 강마다 1기 · 전투 강화 Lv.1 · 방어 0</p><p>현재 숙련·특성·각성 연구와 상하좌우 배치 효과를 반영합니다.</p><p>실제 투기장 사거리는 표시된 기본 사거리 +160입니다. 광역 추가 대상·치명타·방어·공격 공백은 제외하며 둔화 추가 피해는 별도 표시합니다.</p><p>뽑기 확률은 그대로입니다. 조합 안내는 소환 제한이나 승리 확률이 아닙니다.</p></div>`;

    const rewards=PG().rewardView(profile());
    const rewardPair=(gold,shards)=>`<div class="earn-reward-pair"><span><small>연구 골드</small><b>+${number(gold)}</b></span><span><small>성장 조각</small><b>+${number(shards)}</b></span></div>`;
    const duration=seconds=>`${Math.floor(seconds/60)}분 ${seconds%60}초`;
    const progress=(seconds,goal)=>`<progress class="earn-progress" value="${Math.min(seconds,goal)}" max="${goal}" aria-label="누적 참여 진행도"></progress>`;
    const nextMilestone=rewards.nextMilestone;
    const earnPages=[
      `<div class="earn-hero"><h3>참여하면 연구 재료가 쌓여요</h3><img class="earn-art" src="ui/rewards/attendance-bag.webp" alt="골드와 성장 조각 보상"><small>대전·협동 유효 참여 1분마다</small>${rewardPair(rewards.perMinute.gold,rewards.perMinute.shards)}</div><div class="earn-detail"><p>패배해도 지급 · 타워 3개 이상 배치</p><small>자리 비움 제외 · 유효 참여 시간에 비례해 전투 종료 시 지급</small><div class="earn-current"><span>현재 연구 골드 <b>${number(collection().gold)}</b></span><span>현재 성장 조각 <b>${number(profile().shards)}</b></span></div><div class="earn-progress-info"><b>누적 참여 ${duration(rewards.activeSeconds)}</b>${nextMilestone?`${progress(rewards.activeSeconds,nextMilestone.seconds)}<small>다음 ${nextMilestone.minutes}분 보상 · ${number(nextMilestone.gold)} 골드 + ${nextMilestone.shards} 조각</small>`:'<small>누적 참여 보상 모두 수령 완료</small>'}</div></div>`,
      `<div class="earn-hero"><h3>승리 보너스</h3><img class="earn-art" src="ui/rewards/attendance-chest.webp" alt="승리 보상 상자"><small>유효 참여 ${rewards.win.minSeconds/60}분 이상 · 승리할 때마다</small>${rewardPair(rewards.win.gold,rewards.win.shards)}</div><div class="earn-detail"><div class="earn-first-win"><b>대전·협동 각각 첫 승리 추가 보상</b>${rewardPair(rewards.firstWin.gold,rewards.firstWin.shards)}<div class="earn-win-states"><span class="${rewards.firstWins.duel?'done':''}">대전 · ${rewards.firstWins.duel?'수령 완료':'첫 승리 대기'}</span><span class="${rewards.firstWins.coop?'done':''}">협동 · ${rewards.firstWins.coop?'수령 완료':'첫 승리 대기'}</span></div></div><small>참여 보상에 추가됩니다. 첫 승리 보너스는 모드별 1회입니다.</small></div>`,
      ...rewards.milestones.map(m=>`<div class="earn-hero"><h3>누적 참여 ${m.minutes}분 보상</h3><img class="earn-art" src="ui/rewards/attendance-chest.webp" alt="누적 참여 보상 상자"><small>연속 참여·구매 조건 없이 누적</small>${rewardPair(m.gold,m.shards)}</div><div class="earn-detail"><div class="earn-progress-info"><b>${m.claimed?'수령 완료':`${duration(rewards.activeSeconds)} / ${m.minutes}분`}</b>${progress(rewards.activeSeconds,m.seconds)}<small>${m.claimed?'연구 골드와 성장 조각이 지급되었습니다.':`남은 유효 참여 ${duration(Math.max(0,m.seconds-rewards.activeSeconds))}`}</small></div><p>대전·협동의 유효 참여를 합산합니다.</p><small>전투 종료 시 조건을 달성한 누적 보상이 자동 지급됩니다.</small></div>`)
    ];
    earnIndex=Math.min(earnIndex,earnPages.length-1);
    $('free-progress').innerHTML=earnPages[earnIndex]+`<div class="page-controls"><button id="earn-prev" ${earnIndex===0?'disabled':''}>이전</button><span>${earnIndex+1} / ${earnPages.length}</span><button id="earn-next" ${earnIndex===earnPages.length-1?'disabled':''}>다음</button></div>`;
    $('earn-prev').onclick=()=>{earnIndex--;render();};$('earn-next').onclick=()=>{earnIndex++;render();};
    $('deck-panel').querySelectorAll('[data-open-dice]').forEach(b=>b.onclick=()=>go(b.dataset.openDice));
    $('deck-panel').querySelectorAll('[data-analyze]').forEach(b=>b.onclick=()=>{analysisFaces=b.dataset.analyze.split(',').map(Number);analysisBack=b.dataset.analysisBack;analysisTab='placement';go('analysis');});
    $('deck-panel').querySelectorAll('[data-analysis-tab]').forEach(b=>b.onclick=()=>{analysisTab=b.dataset.analysisTab;render();});
    $('deck-status').textContent=notice;
  }
  window.DKDECKUI=Object.freeze({render,open:(target='overview')=>go(target)});
})();
