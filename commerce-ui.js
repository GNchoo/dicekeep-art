(function () {
  'use strict';
  const C = window.DKCOMMERCE, $ = id => document.getElementById(id);
  let playProducts = null, querying = false, previewBusy = false, previewRevision = 0, previewPager;
  const report = error => { if ($('commerce-status')) $('commerce-status').textContent = C.errorText(error); };
  const productArt = (src) => { const img=document.createElement('img'); img.loading='lazy'; img.width=img.height=128; img.alt=''; img.className='shop-product-art'; img.src=src; return img; };
  const productLabel = text => { const label=document.createElement('small'); label.className='shop-product-label'; label.textContent=text; return label; };
  function appendPurchase(parent, product, state, enabled, profile) {
    const nativeProduct = playProducts && playProducts.find(p => p.productId === product.playProductId);
    const price = state.native ? nativeProduct && nativeProduct.formattedPrice : product.amount.toLocaleString() + '원';
    const button = document.createElement('button'); button.type = 'button'; button.dataset.sku = product.sku;
    button.textContent = price ? price + (enabled && profile ? ' · 구매' : '') : '가격 확인 대기';
    button.setAttribute('aria-label', (product.kind === 'cosmetic' ? window.DKCOSMETICS.themes[product.skinId].name : '성장 조각 ' + product.shards.toLocaleString() + '개') + ' · ' + button.textContent);
    button.disabled = !enabled || !profile || state.busy || (state.native && !nativeProduct);
    const note = document.createElement('small'); note.className = 'shop-purchase-state'; note.id = product.sku + '-purchase-state';
    note.textContent = !enabled ? '판매 준비 중' : !profile ? '계정 연결 후 구매' : !price ? '스토어 가격 확인 중' : state.busy ? '처리 중…' : '확정 지급 · 1회 결제';
    button.setAttribute('aria-describedby', note.id); button.addEventListener('click', () => reviewPurchase(product, price));
    parent.append(button, note);
  }
  const draft = [
    { sku: 'shards200', kind: 'currency', shards: 200, amount: 1100, currency: 'KRW', playProductId: 'dicekeep.shards200' },
    { sku: 'shards600', kind: 'currency', shards: 600, amount: 3300, currency: 'KRW', playProductId: 'dicekeep.shards600' },
    ...['royal', 'frost', 'ember'].map(id => ({ sku: 'skin' + id[0].toUpperCase() + id.slice(1), kind: 'cosmetic', skinId: id, shards: 0, amount: 2900, playProductId: 'dicekeep.skin_' + id })),
  ];
  function reviewPurchase(product, price) {
    if (!price || C.state().busy) return;
    let dialog = $('purchase-review');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'purchase-review';
      dialog.setAttribute('aria-labelledby', 'purchase-review-title');
      dialog.innerHTML = '<h2 id="purchase-review-title">구매 전 확인</h2><p id="purchase-review-item"></p><p id="purchase-review-price"></p><p>한 번만 결제합니다. 자동 갱신이나 정기 결제가 없습니다.</p><p id="purchase-review-note"></p><div class="purchase-review-actions"><button type="button" id="purchase-review-cancel">돌아가기</button><button type="button" id="purchase-review-confirm">결제창으로</button></div>';
      document.body.append(dialog);
      $('purchase-review-cancel').onclick = () => dialog.close();
    }
    $('purchase-review-item').textContent = product.kind === 'cosmetic' ? window.DKCOSMETICS.themes[product.skinId].name + ' · 6종 주사위와 20종 타워 외형' : `성장 조각 ${product.shards.toLocaleString()}개 · 확정 지급`;
    $('purchase-review-price').textContent = `표시 가격 ${price} · 결제창에서 최종 금액 확인`;
    $('purchase-review-note').textContent = product.kind === 'cosmetic' ? '외형만 바뀝니다. 공격력과 뽑기 확률에는 영향이 없습니다.' : '무료 조각과 동일하게 다이스 트리의 해금·숙련·각성 연구에 사용합니다. 연구에는 플레이로 얻는 골드도 필요합니다. 모든 종류와 각성을 무료로 연구할 수 있고, 특성 변경과 서포터 선택은 무료입니다. 순수운빨과 1대1 대전에서는 구매한 성장 수치가 적용되지 않습니다.';
    $('purchase-review-confirm').onclick = () => { dialog.close(); C.buy(product.sku).catch(report); };
    dialog.showModal(); $('purchase-review-cancel').focus();
  }
  async function preview(id) {
    if (previewBusy) return; const P = window.DKCOSMETICS;
    if (!P || !$('cosmetic-preview')) return;
    const revision = ++previewRevision; previewBusy = true;
    $('cosmetic-preview').hidden = false; $('cosmetic-preview-title').textContent = P.themes[id].name + ' · 무료 미리보기';
    $('cosmetic-preview-status').textContent = '주사위 재질과 20종 타워를 준비하고 있습니다…'; $('cosmetic-tower-preview').replaceChildren();
    const canvas = $('cosmetic-dice-preview'); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); render();
    try {
      const result = await P.preview(id, canvas); if (revision !== previewRevision) return;
      for (const tower of result.towers) { const figure = document.createElement('figure'), image = document.createElement('img'), caption = document.createElement('figcaption'); image.src = tower.url; image.alt = `${P.themes[id].name} ${tower.face}성 타워`; image.width = image.height = 96; caption.textContent = '★' + tower.face; figure.append(image, caption); $('cosmetic-tower-preview').append(figure); }
      $('cosmetic-preview-status').textContent = 'D1·D4·D6은 눈, D8·D12·D20은 숫자를 유지합니다. 미리보기는 소유권이나 게임 외형을 바꾸지 않습니다.';
    } catch (error) { if (revision === previewRevision) $('cosmetic-preview-status').textContent = error.message + ' 기본 스킨으로 계속 플레이할 수 있습니다.'; }
    finally {
      previewBusy = false; render();
      if(revision===previewRevision&&!$('shop').classList.contains('hidden')&&window.DKMENUPAGES){
        let gallery=$('shop-theme-preview');if(!gallery){gallery=document.createElement('section');gallery.id='shop-theme-preview';gallery.className='shop-preview-page';$('cosmetic-preview').append(gallery);}
        const dice=document.createElement('figure');dice.className='shop-preview-dice';const caption=document.createElement('figcaption');caption.textContent='6종 주사위 · 실제 재질';dice.append(canvas,caption);
        gallery.replaceChildren(dice,$('cosmetic-tower-preview'),$('cosmetic-preview-status'));
        previewPager?.();previewPager=window.DKMENUPAGES.listPages($('cosmetic-tower-preview'),'figure',5);
        window.DKMENUPAGES.open(P.themes[id].name+' 미리보기',[gallery]);
      }
    }
  }
  function renderCosmetics(list, state, enabled, profile) {
    const container = $('cosmetic-products'), P = window.DKCOSMETICS; if (!container || !P) return;
    const art = P.state(), authority = state.cosmetics || { owned: ['base'], equipped: 'base' }; container.replaceChildren();
    for (const product of [{ kind: 'cosmetic', skinId: 'base', amount: 0 }, ...list.filter(p => p.kind === 'cosmetic')]) {
      const id = product.skinId, base = id === 'base', owned = authority.owned.includes(id), equipped = authority.equipped === id;
      const card = document.createElement('article'); card.className = 'cosmetic-product cosmetic-' + id; card.dataset.theme = id; card.dataset.owned = String(owned); card.dataset.equipped = String(equipped);
      const visual=document.createElement('div');visual.className='shop-theme-art';
      for(const face of ['01','12','20'])visual.append(productArt(base ? (face==='01'?'casual/towers/t1-a.png?v=casual3':`casual/towers/star-${face}-casual.png`) : `casual/towers/skins/${id}/t${face}.png`));
      const copy = document.createElement('div'); copy.className = 'shop-theme-copy';
      copy.append(productLabel(base?'기본 테마':'성채 테마'));
      const title = document.createElement('h4'); title.textContent = base ? '나의 상아 성채' : P.themes[id].name;
      const detail = document.createElement('p'); detail.textContent = '6종 주사위 · 20종 타워 외형';
      const status = document.createElement('p'); status.className = 'cosmetic-status'; status.textContent = art.loading.includes(id) ? '그림을 불러오는 중…' : art.failures[id] ? '그림 준비 중 · 기본 스킨 유지' : equipped ? (art.active === id ? '장착 중' : '장착 그림 준비 중') : owned ? '소유 중' : '외형 묶음 · 전투 효과 없음';
      if (!owned && !art.loading.includes(id) && !art.failures[id]) status.textContent = '외형만 변경 · 전투 효과 없음';
      copy.append(title, detail, status);
      const actions = document.createElement('div'); actions.className = 'shop-theme-actions';
      if (!base) { const show = document.createElement('button'); show.type = 'button'; show.dataset.preview = id; show.textContent = '무료 미리보기'; show.setAttribute('aria-label',P.themes[id].name+' 6종 주사위와 20종 타워 무료 미리보기'); show.disabled = previewBusy; show.addEventListener('click', () => preview(id)); actions.append(show); }
      if (owned) {
        const button = document.createElement('button'); button.type = 'button';
        button.dataset.equip = id; button.textContent = equipped ? '장착 중' : '장착'; button.disabled = equipped || !profile || state.busy || previewBusy || !P.canEquip();
        button.addEventListener('click', async () => { button.disabled = true; try { await C.action('skinEquip', { skinId: id }); } catch (e) { report(e); } finally { render(); } });
        actions.append(button);
      } else {
        appendPurchase(actions, product, state, enabled, profile);
      }
      card.append(visual, copy, actions); container.append(card);
    }
  }
  function render() {
    if (!$('commerce-products')) return;
    const state = C.state(), cfg = state.config, profile = C.profile();
    const enabled = cfg && cfg.purchasesEnabled && (state.platform === 'web' || state.native) && (!cfg.providers || cfg.providers[state.native ? 'android' : 'web']), list = cfg && cfg.products || draft;
    $('commerce-account').textContent = profile ? `계정 성장 조각 ${profile.shards.toLocaleString()}개` : '게스트 · 이 기기에 무료 진행 저장';
    $('commerce-signin').hidden = !!profile;
    $('commerce-signout').hidden = !C.linked();
    $('commerce-signout').disabled = state.busy;
    if ($('commerce-delete')) { $('commerce-delete').hidden = !C.linked(); $('commerce-delete').disabled = state.busy; }
    $('commerce-restore').disabled = !profile || state.busy;
    $('commerce-signin').disabled = !state.configured || !cfg || !cfg.googleClientId;
    $('commerce-availability').textContent = !enabled ? '상점 준비 중 · 현재 실제 결제는 청구되지 않습니다.' : cfg.paymentMode === 'test' ? '테스트 결제 · 실제 판매 전 검증 환경' : '확정 수량 구매 · 결제 전 최종 금액을 확인해 주세요.';
    if($('shop-sale-state'))$('shop-sale-state').textContent=!enabled?'실제 판매 준비 중':cfg.paymentMode==='test'?'테스트 결제 환경':'확정 상품 구매';
    const container = $('commerce-products'); container.replaceChildren();
    for (const product of list.filter(p => p.kind === 'currency')) {
      const card = document.createElement('article'); card.className = 'commerce-product shop-currency-pack';
      const visual=document.createElement('div');visual.className='shop-pack-art';
      for(let i=0;i<(product.shards>=600?3:1);i++)visual.append(productArt('ui/rewards/growth-shards.webp'));
      const copy=document.createElement('div');copy.className='shop-product-copy';
      const name = document.createElement('h4'); name.textContent = '성장 조각';
      const quantity=document.createElement('strong');quantity.className='shop-pack-quantity';quantity.textContent=product.shards.toLocaleString()+'개';
      const detail = document.createElement('p'); detail.textContent = '해금 · 숙련 · 각성 연구';
      const note=document.createElement('small');note.className='shop-product-note';note.textContent='전투에서 얻는 무료 조각과 같은 재료';
      copy.append(name,quantity,detail,note); card.append(visual,copy); appendPurchase(card,product,state,enabled,profile); container.appendChild(card);
    }
    if (window.DKREWARDSUI) {
      const card = document.createElement('article'); card.className = 'commerce-product shop-pass-pack';
      const name = document.createElement('h4'); name.textContent = '기한 없는 성장 패스';
      card.append(productArt('ui/rewards/growth-pass.webp'));
      const copy=document.createElement('div');copy.className='shop-product-copy';copy.append(productLabel('전투로 채우는 무료 보상'));
      const detail = document.createElement('p'); detail.textContent = '무료 20단계 · 플레이로 달성하고 보상 수령';
      const note=document.createElement('small');note.className='shop-product-note';note.textContent='프리미엄 구성과 구매 정보는 패스에서 확인';
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '무료 보상 · 패스 보기'; button.onclick = () => window.DKREWARDSUI.open('pass');
      copy.append(name,detail,note);card.append(copy,button); container.append(card);
    }
    const accountInfo = $('commerce-account-id');
    if (accountInfo) accountInfo.textContent = state.accountId ? '계정 ID: ' + state.accountId : '';
    renderCosmetics(list, state, enabled, profile);
    if (state.native && enabled && !playProducts && !querying) {
      querying = true;
      C.products(list.map(p => p.playProductId)).then(value => { playProducts = value.products || []; }).catch(error => { playProducts = []; report(error); }).finally(() => { querying = false; render(); });
    }
  }
  if ($('commerce-signin')) $('commerce-signin').addEventListener('click', () => C.signIn().catch(report));
  if ($('commerce-signout')) $('commerce-signout').addEventListener('click', () => { try { C.signOut(); } catch (e) { report(e); } });
  // 계정 삭제 — 되돌릴 수 없으므로 두 단계로 막는다: 안내를 보여 준 뒤 DELETE 를 직접 입력하게 한다.
  if ($('commerce-delete')) $('commerce-delete').addEventListener('click', async () => {
    try {
      const p = await C.deletionPreview();
      const summary = `삭제: 진행·수집·덱·기록 · 런 ${p.runs}건 · 세션` + (p.purchaseRecords ? `\n익명화 후 보존: 거래 기록 ${p.purchaseRecords}건` : '');
      const typed = window.prompt(`계정을 영구 삭제합니다. 되돌릴 수 없습니다.\n\n${summary}\n\n계속하려면 DELETE 를 입력하세요.`);
      if (typed !== 'DELETE') return;
      await C.deleteAccount('DELETE');
      window.alert('계정을 삭제했습니다. 같은 Google 계정으로 다시 로그인하면 새 계정으로 시작합니다.');
    } catch (e) { report(e); }
  });
  if ($('commerce-restore')) $('commerce-restore').addEventListener('click', () => C.restore().catch(report));
  if ($('cosmetic-preview-close')) $('cosmetic-preview-close').addEventListener('click', () => { previewRevision++; $('cosmetic-preview').hidden = true; });
  window.addEventListener('commerce:change', render);
  if (window.DKCOSMETICS) DKCOSMETICS.subscribe(render);
  window.DKrenderCommerce = render;
  render();
  if (document.body.dataset.paymentReturn === 'true') C.init().then(() => C.completeWebPayment()).catch(report);
})();
