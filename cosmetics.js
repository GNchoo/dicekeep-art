(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DKCOSMETICS = api.create();
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const THEMES = Object.freeze({ royal: { name: '왕실 상아', sku: 'skinRoyal' }, frost: { name: '서리 수정', sku: 'skinFrost' }, ember: { name: '잿불 흑요석', sku: 'skinEmber' } });
  const valid = id => id === 'base' || Object.hasOwn(THEMES, id);
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  function normalize(value) {
    const owned = ['base', ...Object.keys(THEMES).filter(id => Array.isArray(value && value.owned) && value.owned.includes(id))];
    return { owned, equipped: value && owned.includes(value.equipped) ? value.equipped : 'base' };
  }
  async function decode(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('스킨 그림이 아직 준비되지 않았습니다.');
    const blob = await response.blob();
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    const src = URL.createObjectURL(blob);
    try { const image = new Image(); image.src = src; await image.decode(); return image; } finally { URL.revokeObjectURL(src); }
  }
  function trim(image) {
    if (!image.width || !image.height || image.width > 1024 || image.height > 1024) throw Error('스킨 그림 크기를 확인하지 못했습니다.');
    const cv = document.createElement('canvas'); cv.width = image.width; cv.height = image.height;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(image, 0, 0);
    const pixels = g.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1, transparent = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const alpha = pixels[(y * cv.width + x) * 4 + 3]; if (alpha < 8) transparent++;
      if (alpha > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (x1 < x0 || !transparent) throw Error('스킨 투명 배경을 확인하지 못했습니다.');
    const width = x1 - x0 + 1, height = y1 - y0 + 1, scale = Math.min(1, 256 / Math.max(width, height));
    const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(width * scale)); out.height = Math.max(1, Math.round(height * scale));
    out.getContext('2d').drawImage(cv, x0, y0, width, height, 0, 0, out.width, out.height);
    cv.width = cv.height = 0; if (image.close) image.close(); return { cv: out, w: out.width, h: out.height };
  }
  function create(options = {}) {
    const cache = new Map(), loading = new Map(), failures = new Map(), listeners = new Set(), previews = new Map();
    const loader = options.decode || decode, crop = options.trim || trim, yieldTask = options.yieldTask || pause;
    let authority = normalize(null), active = 'base', runLocked = false, renderer = null, chain = Promise.resolve(), serial = 0, inFlight = 0, peak = 0, debugTheme = null;
    const notify = () => { for (const callback of listeners) callback(); };
    const state = () => ({ ...authority, owned: authority.owned.slice(), active, runLocked, previewOnly: !!debugTheme, packs: [...cache.keys()], loading: [...loading.keys()], failures: Object.fromEntries(failures), inFlight, peak, maxPacks: 2 });
    function dispose(id) {
      const p = cache.get(id); if (!p) return;
      cache.delete(id); if (renderer && renderer.evict) renderer.evict(id, p);
      if (p.material && p.material.close) p.material.close();
      for (const sp of p.towers || []) if (sp.cv) sp.cv.width = sp.cv.height = 0;
    }
    async function load(id) {
      if (!Object.hasOwn(THEMES, id)) { if (id === 'base') return null; throw Error('알 수 없는 스킨입니다.'); }
      if (cache.has(id)) { const p = cache.get(id); cache.delete(id); cache.set(id, p); return p; }
      if (loading.has(id)) return loading.get(id);
      const task = chain.then(async () => {
        if (cache.has(id)) return cache.get(id);
        while (cache.size >= 2) { const victim = [...cache.keys()].find(key => key !== active && !previews.has(key)); if (!victim) throw Error('미리보기가 끝난 뒤 다시 시도해 주세요.'); dispose(victim); }
        const assets = new Array(21); let next = 0, failed = false, pack;
        const paths = [`dice/skins/${id}/material-v101.png`, ...Array.from({ length: 20 }, (_, i) => `casual/towers/skins/${id}/t${String(i + 1).padStart(2, '0')}.png`)];
        try {
          const results = await Promise.allSettled([0, 1].map(async () => {
            for (;;) { const index = next++; if (failed || index >= paths.length) break;
              inFlight++; peak = Math.max(peak, inFlight);
              try { const image = await loader(paths[index] + '?v=101');
                if (index === 0) { if (image.width !== 512 || image.height !== 512) { if (image.close) image.close(); throw Error('주사위 재질이 아직 준비되지 않았습니다.'); } assets[index] = image; }
                else assets[index] = crop(image);
              } catch (error) { failed = true; throw error; } finally { inFlight--; }
              await yieldTask();
            }
          }));
          const failure = results.find(result => result.status === 'rejected'); if (failure) throw failure.reason;
          pack = { id, material: assets[0], towers: assets.slice(1), paths };
          if (renderer && renderer.prepare) await renderer.prepare(pack);
          cache.set(id, pack); failures.delete(id); notify(); return pack;
        } catch (error) {
          if (pack && renderer && renderer.evict) renderer.evict(id, pack);
          for (const asset of assets) { if (asset && asset.close) asset.close(); if (asset && asset.cv) asset.cv.width = asset.cv.height = 0; }
          failures.set(id, error.message || '그림을 준비하지 못했습니다.'); notify(); throw error;
        }
      });
      chain = task.catch(() => {}); loading.set(id, task); notify();
      try { return await task; } finally { loading.delete(id); notify(); }
    }
    function apply(id) {
      if (active === id) return;
      active = id; if (renderer && renderer.activate) renderer.activate(id, cache.get(id)); notify();
    }
    async function sync() {
      const revision = ++serial, desired = debugTheme || authority.equipped;
      const revoked = active !== 'base' && !debugTheme && !authority.owned.includes(active);
      if (renderer && renderer.rolling && renderer.rolling()) return false;
      if (runLocked && !revoked) return false;
      if (revoked) apply('base');
      if (runLocked) return false;
      if (desired !== 'base') await load(desired);
      if (revision !== serial || runLocked || (renderer && renderer.rolling && renderer.rolling())) return false;
      apply(desired); return true;
    }
    function setAuthority(value) { authority = normalize(value); debugTheme = null; notify(); return sync().catch(() => false); }
    function unlockRun() { runLocked = false; debugTheme = null; notify(); return sync().catch(() => false); }
    function lockRun() { runLocked = true; notify(); return active; }
    function tick() { if (active !== 'base' && !debugTheme && !authority.owned.includes(active) && !(renderer && renderer.rolling && renderer.rolling())) apply('base'); }
    async function preview(id, canvas) {
      await load(id); if (!renderer || !renderer.preview) throw Error('게임 그림 준비 중입니다. 잠시 후 다시 시도해 주세요.');
      previews.set(id, (previews.get(id) || 0) + 1);
      try { return await renderer.preview(id, cache.get(id), canvas); }
      finally { const remaining = previews.get(id) - 1; if (remaining) previews.set(id, remaining); else previews.delete(id); }
    }
    async function debugUse(id) {
      const host = typeof location === 'undefined' ? '' : location.hostname;
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host) || (renderer && renderer.rolling && renderer.rolling())) throw Error('로컬 검수에서만 사용할 수 있습니다.');
      if (!valid(id)) throw Error('알 수 없는 스킨입니다.'); if (id !== 'base') await load(id); debugTheme = id; apply(id); return state();
    }
    return Object.freeze({ themes: THEMES, state, load, preview, setAuthority, sync, lockRun, unlockRun, tick, debugUse,
      current: () => active, pack: id => cache.get(id), subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      attach: hooks => { renderer = hooks; }, canEquip: () => !runLocked && !(renderer && renderer.rolling && renderer.rolling()),
    });
  }
  return { create, normalize, themes: THEMES };
});
