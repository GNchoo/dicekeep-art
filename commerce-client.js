(function () {
  'use strict';
  const SESSION = 'dk_commerce_session_v1', PENDING = 'dk_commerce_pending_v1', ORDERS = 'dk_commerce_orders_v1';
  const endpoint = String((window.DKCOMMERCE_CONFIG || {}).url || '').replace(/\/$/, '');
  const platform = () => window.Capacitor && Capacitor.getPlatform ? Capacitor.getPlatform() : 'web';
  const native = () => platform() === 'android';
  const billing = () => window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.DicekeepBilling;
  let session = null, current = null, config = null, wallet = null, cosmetics = { owned: ['base'], equipped: 'base' }, busy = false, initialized = null, paymentComplete = false, authGeneration = 0;
  const scripts = new Map();
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { throw new Error('저장 공간을 사용할 수 없습니다. 결제를 진행할 수 없습니다.'); } };
  const emit = () => window.dispatchEvent(new CustomEvent('commerce:change'));
  const message = text => { const el = document.getElementById('commerce-status'); if (el) el.textContent = text; };
  const reasons = {
    auth: '다시 로그인해 주세요.', unauthorized: '다시 로그인해 주세요.', disabled: '결제 서비스가 아직 열리지 않았습니다.',
    funds: '성장 조각이 부족합니다.', debt: '환불된 구매를 정리해야 성장을 사용할 수 있습니다.',
    pending: '결제 승인을 기다리고 있습니다. 승인된 뒤 다시 확인해 주세요.',
    'purchase-pending': '결제 승인을 기다리고 있습니다.', 'account-mismatch': '구매한 Google 계정으로 로그인해 주세요.',
    'run-too-fast': '런 기록을 확인하지 못했습니다. 이번 계정 보상은 지급되지 않았습니다.',
    'payment-not-complete': '결제 승인이 완료되지 않았습니다. 잠시 후 다시 확인해 주세요.',
    'payment-not-confirmed': '아직 승인된 결제가 없습니다. 구매 내역은 다음 확인을 위해 남겨 둡니다.',
    'purchases-disabled': '결제 서비스가 아직 열리지 않았습니다.', 'login-required': '다시 로그인해 주세요.', 'session-expired': '다시 로그인해 주세요.',
    'insufficient-shards': '성장 조각이 부족합니다.', 'refund-debt': '환불된 구매의 잔액을 정리해야 성장과 장착을 사용할 수 있습니다.',
    'skin-not-owned': '먼저 소유한 스킨을 선택해 주세요.', 'already-owned': '이미 소유한 스킨입니다.', 'run-time-invalid': '런 기록의 진행 시간을 확인하지 못했습니다.',
    'payment-pending': '결제 승인을 기다리고 있습니다.', 'purchase-already-used': '이 구매가 연결된 계정으로 다시 로그인해 주세요.',
    USER_CANCELED: '결제를 취소했습니다.', USER_CANCELLED: '결제를 취소했습니다.',
  };
  function errorText(error) { return reasons[error.code] || error.message || '요청을 완료하지 못했습니다. 다시 시도해 주세요.'; }
  async function api(path, data, anonymous) {
    if (!endpoint) throw new Error('결제 서비스 연결을 준비 중입니다. 무료 플레이는 계속 이용할 수 있습니다.');
    const requestToken = session && session.token;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (!anonymous && session && session.token) headers.Authorization = 'Bearer ' + session.token;
      const response = await fetch(endpoint + path, { method: data === undefined ? 'GET' : 'POST', headers, body: data === undefined ? undefined : JSON.stringify(data), signal: controller.signal, credentials: 'omit' });
      const result = await response.json().catch(() => ({}));
      if (!anonymous && requestToken !== (session && session.token)) { const e = new Error('계정이 바뀌었습니다. 현재 계정에서 다시 확인해 주세요.'); e.code = 'session-changed'; e.status = 401; throw e; }
      if (!response.ok) { const e = new Error(result.message || '서버 요청을 완료하지 못했습니다.'); e.code = result.code || result.error; e.status = response.status; throw e; }
      return result;
    } finally { clearTimeout(timer); }
  }
  function adopt(result) {
    if (result.profile) current = window.DKPROGRESSION.sanitize(result.profile);
    if (result.wallet) wallet = result.wallet;
    if (result.cosmetics) { cosmetics = { owned: ['base', ...['royal', 'frost', 'ember'].filter(id => result.cosmetics.owned && result.cosmetics.owned.includes(id))], equipped: result.cosmetics.equipped }; if (!cosmetics.owned.includes(cosmetics.equipped)) cosmetics.equipped = 'base'; }
    if (window.DKCOSMETICS) DKCOSMETICS.setAuthority(cosmetics);
    emit(); return result;
  }
  async function refresh() {
    if (!session) return null;
    // Entitlement reconciliation may revoke a missed refund before its view is adopted.
    const nextCosmetics = await api('/cosmetics');
    const [result, nextWallet] = await Promise.all([api('/profile'), api('/wallet')]);
    current = window.DKPROGRESSION.sanitize(result.profile || result);
    adopt({ wallet: nextWallet, cosmetics: nextCosmetics }); return current;
  }
  function loadScript(url) {
    if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = url; s.async = true;
      s.onload = resolve; s.onerror = () => { scripts.delete(url); s.remove(); reject(new Error('결제·로그인 화면을 불러오지 못했습니다.')); };
      document.head.appendChild(s);
    }));
    return scripts.get(url);
  }
  async function authenticate(idToken, generation = ++authGeneration) {
    if (generation !== authGeneration) throw new Error('새 로그인 요청에서 다시 확인해 주세요.');
    if (window.DK && !['lobby', 'shop', 'title'].includes(DK.phase)) throw new Error('게임을 마친 뒤 로그인해 주세요.');
    const previousToken = session && session.token;
    const result = await api('/auth/google', { idToken }, true);
    if (generation !== authGeneration || previousToken !== (session && session.token) || (window.DK && !['lobby', 'shop', 'title'].includes(DK.phase))) {
      // The reply must not switch a run that began while login was pending.
      if (result.token) fetch(endpoint + '/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + result.token }, body: '{}', credentials: 'omit', signal: AbortSignal.timeout(15000) }).catch(() => {});
      throw new Error('게임 또는 계정이 바뀌었습니다. 게임을 마친 뒤 다시 로그인해 주세요.');
    }
    const next = { token: result.token, accountId: result.accountId, obfuscatedAccountId: result.obfuscatedAccountId, expiresAt: result.expiresAt };
    write(SESSION, next); session = next; adopt({ ...result, cosmetics: { owned: ['base'], equipped: 'base' } });
    await refresh();
    message('계정에 연결했습니다. 계정 성장은 서버에 보관됩니다.');
    await retryPending();
    if (native()) await restore();
  }
  async function signIn() {
    const generation = ++authGeneration;
    await init();
    if (generation !== authGeneration) return;
    if (!config || !config.googleClientId) throw new Error('로그인 서비스 연결을 준비 중입니다.');
    if (native()) {
      const plugin = billing(); if (!plugin) throw new Error('최신 Android 앱으로 업데이트해 주세요.');
      const result = await plugin.signIn({ serverClientId: config.googleClientId });
      await authenticate(result.idToken, generation);
    } else {
      await loadScript('https://accounts.google.com/gsi/client');
      const host = document.getElementById('commerce-google'); host.replaceChildren();
      google.accounts.id.initialize({ client_id: config.googleClientId, auto_select: false, callback: result => authenticate(result.credential, generation).catch(e => message(errorText(e))) });
      google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', text: 'signin_with', width: 240 });
      message('Google 버튼으로 로그인하면 기기 간 계정 성장을 사용할 수 있습니다.');
    }
  }
  function signOut() {
    if (busy) throw new Error('진행 중인 결제를 마친 뒤 로그아웃해 주세요.');
    if (window.DK && !['lobby', 'shop', 'title'].includes(DK.phase)) throw new Error('게임을 마친 뒤 로그아웃해 주세요.');
    authGeneration++;
    if (session) api('/auth/logout', {}).catch(() => {});
    localStorage.removeItem(SESSION); session = null; current = null; wallet = null; cosmetics = { owned: ['base'], equipped: 'base' };
    if (window.DKCOSMETICS) DKCOSMETICS.setAuthority(cosmetics);
    if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
    if (native() && billing() && billing().signOut) billing().signOut().catch(() => {});
    emit(); message('로그아웃했습니다. 이 기기의 무료 진행으로 돌아갑니다.');
  }
  async function action(type, value) {
    if (!session) throw new Error('로그인이 필요합니다.');
    if (type === 'skinEquip' && window.DKCOSMETICS) {
      if (!DKCOSMETICS.canEquip()) throw new Error('굴림과 게임을 마친 뒤 스킨을 바꿀 수 있습니다.');
      if (value.skinId !== 'base') await DKCOSMETICS.load(value.skinId);
    }
    const result = adopt(await api('/profile/action', Object.assign({ type, requestId: crypto.randomUUID() }, value)));
    if (type === 'skinEquip' && window.DKCOSMETICS) await DKCOSMETICS.sync(); return result;
  }
  async function startRun(mode) {
    if (!session) return null;
    if (!current) await refresh();
    await retryPending(true);
    const result = adopt(await api('/runs/start', { mode }));
    if (window.DKCOSMETICS) await DKCOSMETICS.sync().catch(() => false); return result;
  }
  function pendingList() { const list = read(PENDING, []); return Array.isArray(list) ? list.slice(-32) : []; }
  async function finishRun(ticket, run) {
    const owner = session && session.accountId;
    if (!owner) throw new Error('계정 보상을 받으려면 다시 로그인해 주세요.');
    const payload = Object.assign({ ticket }, run), list = pendingList().filter(x => x.ticket !== ticket);
    list.push({ ticket, owner, payload }); write(PENDING, list.slice(-32));
    try {
      const result = adopt(await api('/runs/settle', payload));
      write(PENDING, pendingList().filter(x => x.ticket !== ticket)); return result;
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status)) write(PENDING, pendingList().filter(x => x.ticket !== ticket));
      throw error;
    }
  }
  async function retryPending(strict = false) {
    if (!session) return;
    for (const item of pendingList().filter(x => x.owner === session.accountId)) {
      try { await finishRun(item.ticket, item.payload); } catch (e) { message(errorText(e)); if (strict) throw e; break; }
    }
  }
  async function verifyAndroid(purchase) {
    if (!purchase.purchaseToken || !purchase.productId) return;
    if (purchase.state && !['PURCHASED', 1].includes(purchase.state)) { message('결제 승인을 기다리고 있습니다.'); return; }
    const result = adopt(await api('/payments/google/verify', { purchaseToken: purchase.purchaseToken, productId: purchase.productId }));
    message(result.consumePending || result.acknowledgePending ? '구매 지급 완료 · 스토어 처리 재확인 중' : `구매 확인 완료${result.shards ? ' · 성장 조각 +' + result.shards : ''}`);
  }
  async function restore() {
    if (!session) throw new Error('구매한 계정으로 로그인해 주세요.');
    let awaiting = 0; const errors = [];
    if (native()) {
      const result = await billing().restore();
      for (const p of result.purchases || []) {
        try { await verifyAndroid(p); }
        catch (e) { if (e.status === 401) throw e; if (['payment-pending', 'purchase-not-complete'].includes(e.code)) awaiting++; else errors.push(e); }
      }
    } else {
      const saved = read(ORDERS, []);
      for (const order of Array.isArray(saved) ? saved.filter(x => x.owner === session.accountId) : []) {
        try {
          adopt(await api('/payments/toss/confirm', { orderId: order.orderId }));
          write(ORDERS, read(ORDERS, []).filter(x => x.orderId !== order.orderId));
        } catch (e) {
          if (['payment-not-complete', 'payment-not-confirmed', 'payment-pending'].includes(e.code)) awaiting++;
          else if (e.status === 401) throw e;
          else errors.push(e);
        }
      }
    }
    await refresh(); await retryPending();
    if (errors.length) throw errors[0];
    message('계정 잔액과 구매 내역을 다시 확인했습니다.' + (awaiting ? ` 승인 대기 구매 ${awaiting}건은 다음 확인을 위해 남겨 두었습니다.` : ''));
  }
  async function buy(sku) {
    if (busy) return;
    if (!session || !current) throw new Error('먼저 Google 계정으로 로그인해 주세요.');
    if (!config || !config.purchasesEnabled || (config.providers && !config.providers[native() ? 'android' : 'web'])) throw new Error('실제 결제는 아직 열리지 않았습니다.');
    if (platform() !== 'web' && !native()) throw new Error('이 플랫폼의 결제는 아직 지원하지 않습니다.');
    busy = true; emit();
    try {
      const product = config.products && config.products.find(p => p.sku === sku);
      if (product && product.kind === 'cosmetic' && window.DKCOSMETICS) await DKCOSMETICS.load(product.skinId);
      const order = await api('/orders', { sku, platform: native() ? 'android' : 'web' });
      if (native()) {
        const purchase = await billing().purchase({ productId: order.productId, accountId: order.obfuscatedAccountId });
        await verifyAndroid(purchase);
      } else {
        const previous = read(ORDERS, []);
        write(ORDERS, (Array.isArray(previous) ? previous : []).concat({ owner: session.accountId, orderId: order.orderId }).slice(-64));
        await loadScript('https://js.tosspayments.com/v2/standard');
        const payment = TossPayments(order.clientKey).payment({ customerKey: order.customerKey });
        const success = new URL('payment.html', location.href), fail = new URL('payment.html', location.href); fail.searchParams.set('result', 'fail');
        await payment.requestPayment({ method: 'CARD', amount: { currency: order.currency, value: order.amount }, orderId: order.orderId, orderName: order.orderName, successUrl: success.href, failUrl: fail.href });
      }
    } finally { busy = false; emit(); }
  }
  async function completeWebPayment() {
    if (paymentComplete) { message('이미 확인한 구매입니다. 성장 조각은 한 번만 지급됩니다.'); return; }
    const q = new URLSearchParams(location.search);
    if (q.get('result') === 'fail' || q.has('code')) { message('결제가 취소되었거나 승인되지 않았습니다. 청구·지급 상태는 상점에서 다시 확인할 수 있습니다.'); return; }
    const paymentKey = q.get('paymentKey'), orderId = q.get('orderId');
    // Never derive price or rewards from redirect query parameters.
    if (!paymentKey || !orderId || !session) throw new Error('결제 정보 또는 로그인이 없습니다. 구매한 계정으로 다시 로그인해 주세요.');
    const result = adopt(await api('/payments/toss/confirm', { paymentKey, orderId }));
    const orders = read(ORDERS, []); write(ORDERS, (Array.isArray(orders) ? orders : []).filter(x => x.orderId !== orderId));
    paymentComplete = true;
    history.replaceState(null, '', location.pathname);
    message(`결제 확인 완료 · ${result.duplicate ? '이미 확인한 구매입니다.' : result.shards ? '성장 조각 +' + result.shards : '스킨 소유권을 확인했습니다.'}`);
  }
  function init() {
    if (initialized) return initialized;
    initialized = (async () => {
      if (!endpoint) { emit(); return; }
      config = await api('/config', undefined, true);
      const saved = read(SESSION, null);
      if (saved && typeof saved.token === 'string' && typeof saved.accountId === 'string') {
        session = saved;
        try { await refresh(); await retryPending(); }
        catch (e) { if (e.status === 401) { localStorage.removeItem(SESSION); session = null; } message(errorText(e)); }
      }
      if (native() && billing()) await billing().addListener('purchaseUpdated', value => {
        if (!session) return;
        const purchases = value.purchases || [value];
        for (const purchase of purchases) verifyAndroid(purchase).catch(e => message(errorText(e)));
      });
      emit();
    })().catch(error => { initialized = null; message(errorText(error)); throw error; });
    return initialized;
  }
  window.DKCOMMERCE = Object.freeze({
    init, signIn, signOut, action, startRun, finishRun, refresh, retryPending, restore, buy, completeWebPayment, errorText,
    profile: () => current, linked: () => !!session,
    state: () => ({ configured: !!endpoint, config, accountId: session && session.accountId, wallet, cosmetics: { owned: cosmetics.owned.slice(), equipped: cosmetics.equipped }, busy, native: native(), platform: platform(), ready: !!current }),
    products: async ids => native() && billing() ? billing().products({ productIds: ids }) : { products: [] },
  });
})();
