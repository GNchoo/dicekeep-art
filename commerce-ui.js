(function () {
  'use strict';
  const C = window.DKCOMMERCE, $ = id => document.getElementById(id);
  let playProducts = null, querying = false, previewBusy = false, previewRevision = 0;
  const report = error => { if ($('commerce-status')) $('commerce-status').textContent = C.errorText(error); };
  const draft = [
    { sku: 'shards60', kind: 'currency', shards: 60, amount: 1100, currency: 'KRW', playProductId: 'dicekeep.shards60' },
    { sku: 'shards600', kind: 'currency', shards: 600, amount: 9900, currency: 'KRW', playProductId: 'dicekeep.shards600' },
    { sku: 'shards2000', kind: 'currency', shards: 2000, amount: 33000, currency: 'KRW', playProductId: 'dicekeep.shards2000' },
    ...['royal', 'frost', 'ember'].map(id => ({ sku: 'skin' + id[0].toUpperCase() + id.slice(1), kind: 'cosmetic', skinId: id, shards: 0, amount: 4900, playProductId: 'dicekeep.skin_' + id })),
  ];
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
    finally { previewBusy = false; render(); }
  }
  function renderCosmetics(list, state, enabled, profile) {
    const container = $('cosmetic-products'), P = window.DKCOSMETICS; if (!container || !P) return;
    const art = P.state(), authority = state.cosmetics || { owned: ['base'], equipped: 'base' }; container.replaceChildren();
    for (const product of [{ kind: 'cosmetic', skinId: 'base', amount: 0 }, ...list.filter(p => p.kind === 'cosmetic')]) {
      const id = product.skinId, base = id === 'base', owned = authority.owned.includes(id), equipped = authority.equipped === id;
      const card = document.createElement('article'); card.className = 'cosmetic-product cosmetic-' + id; card.dataset.theme = id;
      const title = document.createElement('h4'); title.textContent = base ? '낡은 상아 성채' : P.themes[id].name;
      const detail = document.createElement('p'); detail.textContent = base ? '기본 주사위와 성채 외형' : '주사위 재질 6종 + 고유 타워 1~20성';
      const status = document.createElement('p'); status.className = 'cosmetic-status'; status.textContent = art.loading.includes(id) ? '그림을 불러오는 중…' : art.failures[id] ? '그림 준비 중 · 기본 스킨 유지' : equipped ? (art.active === id ? '장착 중' : '장착 그림 준비 중') : owned ? '소유 중' : '외형 묶음 · 전투 효과 없음';
      card.append(title, detail, status);
      if (!base) { const show = document.createElement('button'); show.type = 'button'; show.dataset.preview = id; show.textContent = '6종 주사위 · 20종 타워 보기'; show.disabled = previewBusy; show.addEventListener('click', () => preview(id)); card.append(show); }
      const button = document.createElement('button'); button.type = 'button';
      if (owned) {
        button.dataset.equip = id; button.textContent = equipped ? '장착 중' : '장착'; button.disabled = equipped || !profile || state.busy || previewBusy || !P.canEquip();
        button.addEventListener('click', async () => { button.disabled = true; try { await C.action('skinEquip', { skinId: id }); } catch (e) { report(e); } finally { render(); } });
      } else {
        const nativeProduct = playProducts && playProducts.find(p => p.productId === product.playProductId), price = state.native ? nativeProduct && nativeProduct.formattedPrice : product.amount.toLocaleString() + '원';
        button.dataset.sku = product.sku; button.textContent = !enabled ? product.amount.toLocaleString() + '원 · 준비 중' : !price ? '스토어 가격 확인 중' : price + ' · 구매';
        button.disabled = !enabled || !profile || state.busy || (state.native && !nativeProduct); button.addEventListener('click', () => C.buy(product.sku).catch(report));
      }
      card.append(button); container.append(card);
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
    $('commerce-restore').disabled = !profile || state.busy;
    $('commerce-signin').disabled = !state.configured || !cfg || !cfg.googleClientId;
    $('commerce-availability').textContent = !enabled ? '상점 준비 중 · 현재 실제 결제는 청구되지 않습니다.' : cfg.paymentMode === 'test' ? '테스트 결제 · 실제 판매 전 검증 환경' : '확정 수량 구매 · 결제 전 최종 금액을 확인해 주세요.';
    const container = $('commerce-products'); container.replaceChildren();
    for (const product of list.filter(p => p.kind !== 'cosmetic')) {
      const nativeProduct = playProducts && playProducts.find(p => p.productId === product.playProductId);
      const card = document.createElement('article'); card.className = 'commerce-product';
      const name = document.createElement('h4'); name.textContent = `성장 조각 ${product.shards.toLocaleString()}개`;
      const detail = document.createElement('p'); detail.textContent = '해금·강화에 사용 · 무료 플레이로도 획득';
      const button = document.createElement('button'); button.type = 'button'; button.dataset.sku = product.sku;
      const price = state.native ? nativeProduct && nativeProduct.formattedPrice : `${product.amount.toLocaleString()}원`;
      button.textContent = !enabled ? `${product.amount.toLocaleString()}원 · 준비 중` : state.native && !nativeProduct ? '스토어 가격 확인 중' : `${price} · 구매`;
      button.disabled = !enabled || !profile || state.busy || (state.native && !nativeProduct);
      button.addEventListener('click', () => C.buy(product.sku).catch(report));
      card.append(name, detail, button); container.appendChild(card);
    }
    renderCosmetics(list, state, enabled, profile);
    if (state.native && enabled && !playProducts && !querying) {
      querying = true;
      C.products(list.map(p => p.playProductId)).then(value => { playProducts = value.products || []; }).catch(error => { playProducts = []; report(error); }).finally(() => { querying = false; render(); });
    }
  }
  if ($('commerce-signin')) $('commerce-signin').addEventListener('click', () => C.signIn().catch(report));
  if ($('commerce-signout')) $('commerce-signout').addEventListener('click', () => { try { C.signOut(); } catch (e) { report(e); } });
  if ($('commerce-restore')) $('commerce-restore').addEventListener('click', () => C.restore().catch(report));
  if ($('cosmetic-preview-close')) $('cosmetic-preview-close').addEventListener('click', () => { previewRevision++; $('cosmetic-preview').hidden = true; });
  window.addEventListener('commerce:change', render);
  if (window.DKCOSMETICS) DKCOSMETICS.subscribe(render);
  window.DKrenderCommerce = render;
  render();
  if (document.body.dataset.paymentReturn === 'true') C.init().then(() => C.completeWebPayment()).catch(report);
})();
