(function () {
  'use strict';
  const tabs = [['attendance', '출석'], ['mail', '우편함'], ['pass', '성장 패스']];
  const daily = [[100, 3], [120, 3], [140, 4], [160, 4], [180, 5], [200, 5], [300, 10]];
  const state = { api: null, view: null, tab: 'attendance', loading: false, busy: false, error: '', notice: '', generation: 0, context: 0, helpOpen: new Set() };
  let dialog, body, status, account, tabBar, review, opener;
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
  const button = (text, fn, className) => { const node = el('button', className || 'rw-button', text); node.type = 'button'; node.addEventListener('click', fn); return node; };
  const api = () => state.api || window.DKREWARDS;
  const number = value => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');
  const artwork = { attendance: 'attendance-bag', mail: 'mail', pass: 'growth-pass' };
  function art(name, className = '') {
    const image = el('img', 'rw-art ' + className); image.src = 'ui/rewards/' + name + '.webp' + (name === 'mail' ? '?v=casual1' : ''); image.alt = ''; image.width = 512; image.height = 512; image.draggable = false; return image;
  }
  function help(title, detail) {
    const key = state.tab + ':' + title, box = el('details', 'rw-help'); box.open = state.helpOpen.has(key);
    box.addEventListener('toggle', () => { if (box.isConnected) { if (box.open) state.helpOpen.add(key); else state.helpOpen.delete(key); } });
    box.append(el('summary', '', title), el('p', 'rw-detail', detail)); return box;
  }
  function date(value) {
    if (!value) return '기한 없음';
    const d = new Date(value); return Number.isFinite(+d) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : '확인 중';
  }
  function rewards(value) {
    const box = el('div', 'rw-rewards');
    if (value.gold) box.append(el('span', 'rw-reward rw-gold', '골드 ' + number(value.gold)));
    if (value.shards) box.append(el('span', 'rw-reward rw-shards', '조각 ' + number(value.shards)));
    if (value.skinId) box.append(el('span', 'rw-reward rw-skin', value.skinId === 'royal' ? '왕실 외형' : '외형 보상'));
    return box;
  }
  function create() {
    if (dialog) return;
    dialog = el('dialog', 'rw-dialog'); dialog.id = 'rewards-dialog'; dialog.setAttribute('aria-labelledby', 'rewards-title');
    const header = el('header', 'rw-header'), titles = el('div', 'rw-titles');
    titles.append(el('p', 'rw-eyebrow', 'DICEKEEP · REWARDS'), el('h2', '', '성채의 선물')); titles.lastChild.id = 'rewards-title';
    const closeButton = button('닫기', close, 'rw-close'); closeButton.id = 'rewards-close';
    header.append(titles, closeButton); account = el('p', 'rw-account'); account.id = 'rewards-account';
    tabBar = el('div', 'rw-tabs'); tabBar.setAttribute('role', 'tablist'); tabBar.setAttribute('aria-label', '보상 종류');
    tabs.forEach(([id, label], index) => {
      const tab = button('', () => select(id), 'rw-tab'); tab.id = 'rewards-tab-' + id; tab.dataset.tab = id;
      tab.append(art(artwork[id], 'rw-tab-art'), el('span', '', label));
      const dot=el('span','rewards-notification-dot');dot.hidden=true;dot.setAttribute('aria-hidden','true');tab.append(dot);
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'rewards-panel-' + id);
      tab.addEventListener('keydown', event => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault(); select(tabs[next][0]); tabBar.children[next].focus();
      }); tabBar.append(tab);
    });
    status = el('div', 'rw-status'); status.id = 'rewards-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    body = el('div', 'rw-body'); review = el('dialog', 'rw-dialog rw-review'); review.id = 'rewards-purchase-review';
    dialog.append(header, account, tabBar, status, body);
    dialog.addEventListener('close', () => { if (review.open) review.close(); if (opener?.isConnected) opener.focus(); });
    document.body.append(dialog, review);
  }
  function select(id) { const next = tabs.some(tab => tab[0] === id) ? id : 'attendance'; if (next !== state.tab) state.notice = ''; state.tab = next; if (body) body.scrollTop = 0; render(); }
  function heading(title, detail) { const box = el('div', 'rw-intro'); box.append(el('h3', '', title), el('p', 'rw-detail', detail)); return box; }
  function claimButton(text, action, disabled, id) {
    const node = button(text, action, 'rw-button rw-primary'); node.disabled = disabled || state.busy || state.loading; if (id) node.id = id; return node;
  }
  function renderAttendance(panel, view) {
    const attendance = view.attendance || {}, next = Math.max(1, Math.min(7, attendance.nextDay || 1));
    const intro = heading('오늘도 성채에 오신 걸 환영해요', '한국 시간 자정에 새 출석 · 놓친 날에도 순서는 유지돼요.');
    const tally = el('span', 'rw-attendance-tally', (attendance.claimedToday ? next : next - 1) + ' / 7'); tally.setAttribute('aria-label', '이번 보상 주기 ' + (attendance.claimedToday ? next : next - 1) + '회 수령'); intro.append(tally); panel.append(intro);
    const grid = el('div', 'rw-attendance');
    (attendance.rewards || daily.map(([gold, shards]) => ({ gold, shards }))).forEach((reward, index) => {
      const day = index + 1, received = day < next || (day === next && attendance.claimedToday), current = day === next;
      const card = el('article', 'rw-day' + (day === 7 ? ' rw-day-final' : '') + (current ? ' rw-day-current' : '') + (received ? ' rw-day-done' : ''));
      const picture = el('div', 'rw-day-art'); picture.append(art(day === 7 ? 'attendance-chest' : 'attendance-bag'));
      const content = el('div', 'rw-day-content'); content.append(el('h4', '', day + '회차'), rewards(reward));
      if (day === 7) content.prepend(el('span', 'rw-final-label', '일곱 번째 선물'));
      card.dataset.day = day; card.append(picture, content, el('p', 'rw-day-state', received ? '수령 완료' : current ? '이번 출석' : '다음 출석'));
      grid.append(card);
    }); panel.append(grid);
    const action = el('div', 'rw-attendance-action');
    action.append(claimButton(attendance.claimedToday ? '오늘 출석 완료' : '출석 보상 받기', () => perform('claimAttendance', [], '출석 보상을 받았습니다.'), !!attendance.claimedToday, 'rewards-attendance-claim'));
    action.append(el('p', 'rw-detail', '출석마다 +' + number(attendance.xp ?? 20) + ' XP · 7회 출석 뒤 다시 1회차'));
    panel.append(action);
  }
  function renderMail(panel, view) {
    panel.append(heading('성채에 도착한 소식', '운영 선물과 모험에 필요한 보상을 모아 두었어요.'));
    if (view.canAdmin) { const admin = button('운영 우편 관리', () => window.DKMAILADMIN?.open()); admin.id = 'rewards-mail-admin'; panel.append(admin); }
    if (!view.account?.linked) { const empty = el('div', 'rw-empty'); empty.append(art('mail', 'rw-empty-art'), el('span', 'rw-empty-kicker', '성채 우편함'), el('h4', '', '운영 우편은 로그인 후 확인해요'), el('p', 'rw-detail', '선물은 로그인한 계정으로 도착합니다.\n게스트도 출석과 무료 성장 패스를 이용할 수 있어요.')); panel.append(empty); return; }
    const items = view.mail || [];
    if (!items.length) { const empty = el('div', 'rw-empty'); empty.append(art('mail', 'rw-empty-art'), el('span', 'rw-empty-kicker', '성채 우편함'), el('h4', '', '새 우편이 없습니다'), el('p', 'rw-detail', '선물이 도착하면 우편함에 붉은 점으로 알려드려요.')); panel.append(empty); return; }
    const list = el('div', 'rw-mail-list');
    items.forEach(mail => {
      const expired = typeof mail.expired === 'boolean' ? mail.expired : (!!mail.expiresAt && +new Date(mail.expiresAt) <= Date.now()), card = el('article', 'rw-mail' + (mail.claimed || expired ? ' rw-mail-done' : '')); card.dataset.mailId = mail.id;
      const top = el('div', 'rw-mail-heading'); top.append(el('h4', '', mail.title || '성채 우편'), el('span', 'rw-mail-label', mail.claimed ? '보관함' : expired ? '기간 만료' : '도착한 선물'));
      card.append(top, el('p', 'rw-mail-body', mail.body || ''));
      const attachments = el('div', 'rw-mail-attachments'); attachments.append(rewards(mail.reward || mail));
      const receive = claimButton(mail.claimed ? '수령 완료' : expired ? '기간 만료' : '보상 받기', () => perform('claimMail', [mail.id], '우편 보상을 받았습니다.'), mail.claimed || expired); receive.dataset.claimMail = mail.id;
      attachments.append(receive); card.append(attachments, el('p', 'rw-mail-dates', '발행 ' + date(mail.createdAt) + ' · 만료 ' + date(mail.expiresAt) + ' (한국 시간)')); list.append(card);
    }); panel.append(list, el('p', 'rw-mail-note rw-detail', '보상은 수령 즉시 계정에 반영됩니다. 만료일이 있는 선물은 기간 안에 받아 주세요.'));
  }
  function renderPass(panel, view) {
    const pass = view.pass || {}, xp = Math.max(0, Number(pass.xp) || 0), tiers = pass.tiers || Array.from({ length: 20 }, (_, i) => ({ tier: i + 1, requiredXp: (i + 1) * 100, free: { gold: 100, shards: 2 }, premium: { shards: 10, skinId: i === 9 ? 'royal' : undefined } }));
    const maxXp = Math.max(1, ...tiers.map(tier => tier.requiredXp)), reached = tiers.filter(tier => xp >= tier.requiredXp).length;
    const hero = el('div', 'rw-pass-hero'), heroText = el('div', 'rw-pass-hero-text');
    heroText.append(el('span', 'rw-eyebrow', '기한 없는 성장'), el('h3', '', '모험을 쌓고, 선물을 열어요'), el('p', 'rw-detail', '출석과 플레이로 경험치를 모으세요.')); hero.append(heroText, art('growth-pass', 'rw-pass-hero-art')); panel.append(hero);
    const progress = el('div', 'rw-progress'), caption = el('div', 'rw-progress-label'); caption.append(el('strong', '', reached + ' / ' + tiers.length + '단계'), el('span', '', number(xp) + ' / ' + number(maxXp) + ' XP'));
    const bar = el('progress'); bar.max = maxXp; bar.value = Math.min(xp, maxXp); bar.setAttribute('aria-label', '성장 패스 경험치'); progress.append(caption, bar);
    const nextTier = tiers.find(tier => xp < tier.requiredXp);
    progress.append(el('p', 'rw-next-tier', nextTier ? nextTier.tier + '단계까지 ' + number(nextTier.requiredXp - xp) + ' XP 남았어요' : '모든 단계를 달성했어요. 남은 선물을 받아 주세요.')); panel.append(progress);
    panel.append(help('경험치는 어떻게 모으나요?', '총 20단계 · 단계마다 100 XP. 출석 20 XP · 투기장 완료 웨이브마다 2 XP · 대전·협동 유효 참여 1분당 15 XP. 전투 XP는 종료 정산 때 반영하며 캠페인은 제외됩니다. 달성한 보상은 아래에서 직접 받아요.'));
    const offer = el('div', 'rw-pass-offer'), offerHeading = el('div', 'rw-offer-heading'); offerHeading.append(el('strong', '', pass.premiumOwned ? '프리미엄 패스 보유 중' : '프리미엄 · 선택 구매'), el('span', 'rw-offer-tag', '영구 이용')); offer.append(offerHeading, el('p', 'rw-detail', '성장 조각과 왕실 외형을 추가로 받아요. 무료 보상은 구매 없이 이용할 수 있습니다.'));
    if (!pass.premiumOwned) {
      const buy = claimButton(!view.account?.linked ? '로그인 후 구매 가능' : !pass.purchaseEnabled ? '2,900원 · 판매 준비 중' : (pass.priceLabel || '2,900원') + ' · 구매 내용 보기', showPurchase, !view.account?.linked || !pass.purchaseEnabled, 'rewards-buy-pass');
      offer.append(buy);
    } offer.append(help('구매 및 보상 안내', '기한 없음 · 한 번 구매 · 자동 갱신 없음. 구매 전에 달성한 단계도 소급 수령합니다. 다이스 해금은 무료 플레이로 가능합니다. 단계마다 성장 조각 10개, 10단계에는 왕실 외형을 드립니다. 이미 왕실 외형을 보유했다면 중복 보상은 없습니다.')); panel.append(offer);
    const columns = el('div', 'rw-pass-columns'); columns.append(el('span', '', '단계'), el('strong', '', '무료'), el('strong', 'rw-premium-label', '프리미엄')); panel.append(columns);
    const list = el('div', 'rw-pass-list');
    tiers.forEach(tier => {
      const row = el('article', 'rw-pass-tier' + (xp >= tier.requiredXp ? ' rw-tier-reached' : '') + (nextTier === tier ? ' rw-tier-next' : '')); row.dataset.tier = tier.tier;
      const level = el('div', 'rw-tier-number'); level.append(el('strong', '', tier.tier), el('span', '', number(tier.requiredXp) + ' XP')); row.append(level);
      ['free', 'premium'].forEach(track => {
        const reward = tier[track] || {}, locked = track === 'premium' && !pass.premiumOwned, earned = xp >= tier.requiredXp;
        const cell = el('div', 'rw-pass-reward' + (track === 'premium' ? ' rw-premium' : '') + (reward.claimed ? ' rw-reward-claimed' : earned && !locked ? ' rw-reward-ready' : ''));
        const label = reward.claimed ? '수령 완료' : !earned ? '미달성' : locked ? '구매 필요' : '보상 받기';
        const claim = claimButton(label, () => perform('claimPass', [tier.tier, track], tier.tier + '단계 ' + (track === 'free' ? '무료' : '프리미엄') + ' 보상을 받았습니다.'), reward.claimed || !earned || locked);
        claim.dataset.claimPass = tier.tier + ':' + track; claim.setAttribute('aria-label', tier.tier + '단계 ' + (track === 'free' ? '무료' : '프리미엄') + ' · ' + label);
        const loot = el('div', 'rw-pass-loot'); loot.append(art(reward.skinId ? 'attendance-chest' : track === 'free' ? 'attendance-bag' : 'growth-shards', 'rw-reward-art'), rewards(reward));
        cell.append(loot, claim); row.append(cell);
      }); list.append(row);
    }); panel.append(list);
  }
  function render(view) {
    if (view) state.view = view; create();
    const data = state.view;
    account.textContent = !data ? '계정 정보를 확인하는 중…' : data.account?.linked ? (data.account.label || '로그인 계정') + ' · 계정에 보관' : '게스트 · 이 기기에 무료 진행 저장';
    const counts=state.error?{}:window.DKREWARDNOTIFICATIONS?.counts(data)||{};
    for (const tab of tabBar.children) {
      const selected = tab.dataset.tab === state.tab; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      const available=counts[tab.dataset.tab]||0;tab.querySelector('.rewards-notification-dot').hidden=!available;
      const label=tabs.find(([id])=>id===tab.dataset.tab)[1];tab.setAttribute('aria-label',label+(available?' · 받을 보상 '+available+'개':''));
    }
    status.replaceChildren(); status.classList.toggle('rw-error', !!state.error);
    if (state.error) { status.append(el('span', '', state.error), button('다시 불러오기', refresh, 'rw-retry')); }
    else status.textContent = state.busy ? '보상을 처리하고 있습니다…' : state.loading ? '보상을 불러오고 있습니다…' : state.notice;
    status.hidden = !status.textContent; body.setAttribute('aria-busy', String(state.loading || state.busy));
    body.replaceChildren();
    const panel = el('section', 'rw-panel'); panel.id = 'rewards-panel-' + state.tab; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', 'rewards-tab-' + state.tab); panel.tabIndex = 0;
    if (data) ({ attendance: renderAttendance, mail: renderMail, pass: renderPass })[state.tab](panel, data);
    else panel.append(el('p', 'rw-empty rw-detail', state.error ? '연결을 확인한 뒤 다시 불러와 주세요.' : '출석과 성장 보상을 준비하고 있어요.'));
    body.append(panel);
  }
  async function refresh() {
    const service = api(), generation = ++state.generation;
    if (service?.current) state.view = service.current();
    state.loading = true; state.error = ''; render();
    try {
      if (!service) throw Error('보상 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.');
      const view = await (service.list ? service.list() : service.current());
      if (generation === state.generation) state.view = view;
    } catch (error) { if (generation === state.generation) state.error = error?.message || '보상을 불러오지 못했습니다.'; }
    finally { if (generation === state.generation) { state.loading = false; render(); } }
  }
  async function perform(method, args, notice) {
    if (state.busy || state.loading) return;
    const context = state.context;
    state.busy = true; state.error = ''; state.notice = ''; render();
    try {
      const service = api(); if (typeof service?.[method] !== 'function') throw Error('아직 준비 중인 기능입니다.');
      await service[method](...args); if (context !== state.context) return; state.notice = notice; await refresh();
    } catch (error) { if (context === state.context) state.error = error?.message || '처리하지 못했습니다. 다시 시도해 주세요.'; }
    finally { if (context === state.context) { state.busy = false; render(); } }
  }
  function showPurchase() {
    const data = state.view; if (state.busy || !data?.account?.linked || !data.pass?.purchaseEnabled) return;
    review.replaceChildren(); review.setAttribute('aria-labelledby', 'rewards-review-title');
    const title = el('h3', '', '영구 성장 패스 구매 확인'); title.id = 'rewards-review-title';
    const cancel = button('돌아가기', () => review.close());
    const confirm = button('결제창으로', () => { review.close(); perform('buyPass', [], '결제 상태를 새로 확인했습니다.'); }, 'rw-button rw-primary'); confirm.id = 'rewards-buy-confirm';
    const actions = el('div', 'rw-review-actions'); actions.append(cancel, confirm);
    review.append(title, el('p', 'rw-review-price', data.pass.priceLabel || '2,900원'), el('p', '', '한 번 결제하며 기한과 자동 갱신이 없습니다. 20단계의 프리미엄 보상은 단계당 성장 조각 10개와 10단계 왕실 외형입니다.'), el('p', '', '이미 왕실 외형을 보유했다면 별도 중복 보상은 없습니다. 구매 이전에 달성한 단계도 받을 수 있습니다. 무료 보상은 구매 없이 이용할 수 있으며, 결제창에서 최종 금액을 확인합니다.'), actions); review.showModal(); cancel.focus();
  }
  async function open(tab, options={}) {
    create();if(!dialog.open)opener=document.activeElement;
    if(options.view){state.view=options.view;state.error='';state.notice='';state.loading=false;}
    select(tab||state.tab);if(!dialog.open)dialog.showModal();document.getElementById('rewards-tab-'+state.tab).focus();
    window.dispatchEvent(new CustomEvent('rewards:opened',{detail:{tab:state.tab,automatic:options.automatic===true}}));
    if(!options.view)await refresh();
  }
  function close() { if (dialog?.open) dialog.close(); }
  function configure(options) { state.generation++; state.context++; state.api = options?.api || null; state.view = options?.view || null; state.error = ''; state.notice = ''; state.loading = false; state.busy = false; if (dialog) render(); return window.DKREWARDSUI; }
  window.DKREWARDSUI = { open, close, render, configure };
  const connect = () => {
    document.getElementById('btn-rewards-open')?.addEventListener('click', () => open('attendance'));
    for(const node of document.querySelectorAll('[data-reward-tab]'))if(node.id!=='btn-rewards-open')node.addEventListener('click',()=>open(node.dataset.rewardTab));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect, { once: true }); else connect();
  window.addEventListener('rewards:change', () => {
    if (!dialog?.open) return;
    if (state.busy) { if (api()?.current) state.view = api().current(); render(); }
    else refresh();
  });
  window.addEventListener('rewards:updated',()=>{if(dialog?.open&&!state.loading&&!state.busy){const view=api()?.current?.();if(view)render(view);}});
})();
