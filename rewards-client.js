(function () {
  'use strict';
  const L = window.DKLIVEOPS, C = window.DKCOMMERCE, P = window.DKPROGRESSION;
  let hooks = null, cache = null, raw = null, generation = 0, acting = false, productPrices = new Map(), inflight = null;
  const owner = () => C?.linked() ? C.state().accountId : 'guest';
  let account = owner();
  const emit = () => window.dispatchEvent(new CustomEvent('rewards:change'));
  const fail = code => { const e = new Error(code); e.code = code; throw e; };
  function checkReady() { if (!hooks) throw Error('게임을 불러온 뒤 이용해 주세요.'); }
  function checkLobby() { checkReady(); if (!hooks.canClaim()) throw Error('로비 또는 상점에서 보상을 받아 주세요.'); }
  function normalize(data, linked, price) {
    const r = data.liveops, state = C?.state(), passProduct = state?.config?.products?.find(p => p.kind === 'pass' && p.passId === r.pass.id);
    const cfg = state?.config, supported = state?.platform === 'web' || state?.native;
    return { account: { linked, label: linked ? '로그인 계정' : '게스트' }, serverNow: data.serverNow,
      checkedAt: window.performance?.now() ?? Date.now(), nextDayAt: Date.parse(r.attendance.dayKey+'T00:00:00+09:00')+86400000,
      attendance: { claimedToday: !r.attendance.canClaim, nextDay: r.attendance.canClaim ? r.attendance.cycleDay : (r.attendance.total - 1) % 7 + 1,
        dayKey:r.attendance.dayKey, claimedCount: r.attendance.total, rewards: r.attendance.cycle, xp: L.ATTENDANCE_XP },
      pass: { xp: r.pass.xp, premiumOwned: r.pass.owned, priceLabel: price || '2,900원',
        purchaseEnabled: !!(linked && state.ready && !state.busy && cfg?.purchasesEnabled && supported && (!cfg.providers || cfg.providers[state.native ? 'android' : 'web']) && passProduct && (!state.native || price)),
        tiers: r.pass.tiers.map(t => ({ tier:t.tier, requiredXp:t.requiredXp,
          free:{...t.free.reward,claimed:t.free.claimed}, premium:{...t.premium.reward,claimed:t.premium.claimed} })) },
      mail: (data.inbox || []).map(m => ({...m,...m.reward,createdAt:m.publishedAt,
        expired:m.expiresAt !== null && m.expiresAt <= data.serverNow})), canAdmin: linked && data.canAdmin === true };
  }
  async function fetchList() {
    checkReady(); const who = owner(), version = ++generation;
    const data = who === 'guest' ? {liveops:L.view(L.sanitize(hooks.readGuest().liveops)),inbox:[],serverNow:Date.now()} : await C.loadLiveops();
    let price;
    if (who !== 'guest') {
      const state = C.state(), product = state.config?.products?.find(p => p.kind === 'pass' && p.passId === data.liveops.pass.id);
      if (product && state.native && state.config.purchasesEnabled) {
        if (!productPrices.has(product.playProductId)) {
          const response = await C.products([product.playProductId]).catch(() => ({products:[]}));
          const p = response.products?.find(p => p.productId === product.playProductId);
          if (p?.formattedPrice) productPrices.set(product.playProductId,p.formattedPrice);
        }
        price = productPrices.get(product.playProductId);
      } else if (product) price = product.amount.toLocaleString('ko-KR') + '원';
    }
    if (owner() !== who) throw Error('계정이 바뀌었습니다. 다시 확인해 주세요.');
    // Also protect callers awaiting this list, not just the shared cache.
    if (version !== generation) return list();
    const view = normalize(data,who !== 'guest',price);
    if (version === generation) { raw = data; cache = view; account = who; window.dispatchEvent(new CustomEvent('rewards:updated')); }
    return view;
  }
  function list() {
    if(inflight?.owner===owner()&&inflight.generation===generation)return inflight.promise;
    const promise=fetchList(),entry={owner:owner(),generation,promise};inflight=entry;
    promise.finally(()=>{if(inflight===entry)inflight=null;}).catch(()=>{});return promise;
  }
  async function act(kind, details = {}) {
    if (acting) throw Error('이전 보상을 처리하고 있습니다.');
    checkLobby(); const who = owner(); acting = true;
    try {
      if (!cache || account !== who) await list();
      checkLobby(); if (owner() !== who || !raw) throw Error('계정이나 보상 목록이 변경되었습니다. 다시 확인해 주세요.');
      const day = raw.liveops.attendance.dayKey;
      generation++;
      if (who !== 'guest') await C.claimReward(kind, {...details,...(kind === 'attendance' ? {day} : {})});
      else {
        if (kind === 'mail') throw Error('운영 우편은 로그인 후 받을 수 있습니다.');
        const receive = () => {
          checkLobby(); if (owner() !== who) throw Error('계정이 바뀌었습니다.');
          const saved = structuredClone(hooks.readGuest()), state = L.sanitize(saved.liveops);
          const result = kind === 'attendance' ? L.claimAttendance(state,Date.now(),day) : L.claimPass(state,{...details,premium:false});
          if (!result.ok) fail(result.reason);
          const gold = result.reward.gold || 0, shards = result.reward.shards || 0;
          // Leave a capped wallet's claim available until the player spends some resources.
          if (saved.progression.collection.gold + gold > P.MAX_GOLD || saved.progression.shards + shards > P.MAX_SHARDS) throw Error('보관 한도에 도달했습니다. 연구에 자원을 사용한 뒤 받아 주세요.');
          saved.progression.collection.gold += gold; saved.progression.shards += shards; saved.liveops = result.nextState;
          hooks.commitGuest(saved); // Persist both balances and claim markers before adopting either.
        };
        if (navigator.locks) await navigator.locks.request('dicekeep-guest-rewards',receive); else receive();
      }
      generation++;
      const view = await list(); hooks.changed?.(); emit(); return view;
    } catch (error) { throw Object.assign(new Error(C?.errorText(error) || error.message),{code:error.code}); }
    finally { acting = false; }
  }
  async function buyPass() {
    if (acting) throw Error('이전 보상을 처리하고 있습니다.');
    checkLobby(); const who = owner(); acting = true;
    try {
      await list(); checkLobby();
      if (owner() !== who || !raw || !cache) throw Error('계정이나 보상 목록이 변경되었습니다. 다시 확인해 주세요.');
      if (!cache.pass.purchaseEnabled || cache.pass.premiumOwned) throw Error(cache.pass.premiumOwned ? '이미 보유한 패스입니다.' : '패스 판매를 준비 중입니다.');
      const product = C.state().config.products.find(p => p.kind === 'pass' && p.passId === raw.liveops.pass.id);
      generation++;
      await C.buy(product.sku); generation++; return await list();
    } finally { acting = false; }
  }
  window.DKREWARDS = Object.freeze({ configure(options) { hooks=options; cache=raw=null; }, list, current:() => owner() === account ? cache : null,
    claimAttendance:() => act('attendance'), claimMail:id => act('mail',{id}), claimPass:(tier,track) => act('pass',{tier,track}), buyPass,
    changed() { cache=raw=null; generation++; emit(); } });
  window.addEventListener('commerce:change',() => {
    if (owner() !== account) { account=owner(); cache=raw=null; generation++; emit(); }
  });
  window.addEventListener('storage',e => { if (e.key === 'DKSAVE' && owner() === 'guest') window.DKREWARDS.changed(); });
})();
