// Directional art is presentation data. Loading must never delay a spawn or change combat state.
(function (root) {
  'use strict';
  const MiB = 1024 * 1024;
  const VIEWS = ['side', 'front', 'back'];
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const mod = (n, m) => ((n % m) + m) % m;
  const EXTREME_BASE = 1000, EVOLUTION_STEP = 512, MAX_EVOLUTION = 3, EN_MAX = 5120;

  function roster(wave) {
    const w = finite(wave) ? Math.max(1, Math.min(1000000, Math.floor(wave))) : 1;
    const baseWave = mod(w - 1, 101) + 1;
    return { wave: w, baseWave, rosterWave: w <= 101 ? baseWave : baseWave + 101,
      evolutionTier: w <= 202 ? 0 : Math.min(MAX_EVOLUTION, Math.floor((w - 102) / 101)) };
  }

  function appearance(wave, secondary, elite) {
    const r = roster(wave);
    if (r.wave <= 101) return r.baseWave + (secondary ? 101 : 0) + (elite ? 256 : 0);
    return EXTREME_BASE + (r.rosterWave - 102) * 4 + r.evolutionTier * EVOLUTION_STEP + (secondary ? 1 : 0) + (elite ? 2 : 0);
  }
  function decodeAppearance(value) {
    if (Number.isInteger(value) && value >= EXTREME_BASE && value < EXTREME_BASE + (MAX_EVOLUTION + 1) * EVOLUTION_STEP) {
      const offset = value - EXTREME_BASE, evolutionTier = Math.floor(offset / EVOLUTION_STEP), slot = offset % EVOLUTION_STEP;
      const baseWave = Math.floor(slot / 4) + 1, secondary = !!(slot & 1), elite = !!(slot & 2), boss = baseWave % 10 === 0;
      if (baseWave > 101 || (secondary && !boss) || (elite && boss)) return null;
      const wave = baseWave + 101;
      return { code: value, wave, baseWave, evolutionTier, role: secondary ? 'secondary' : boss ? 'boss' : 'normal', elite,
        assetId: (boss ? 'b' : 'w') + String(wave).padStart(3, '0') + (secondary ? '-2' : '') };
    }
    if (!Number.isInteger(value) || value <= 0 || value > 457) return null;
    const elite = value >= 257;
    let n = value - (elite ? 256 : 0);
    const secondary = n > 101;
    if (secondary) n -= 101;
    if (n < 1 || n > 101) return null;
    const boss = n % 10 === 0;
    if ((secondary && !boss) || (elite && boss)) return null;
    // Later 101-wave cycles spawn two bosses at roster slot10 too. Keep that
    // combat role, but reuse the reviewed rat king instead of inventing b010-2.
    const sharedFirstBoss = secondary && n === 10;
    return { code: value, wave: n, role: secondary ? 'secondary' : boss ? 'boss' : 'normal', elite,
      assetId: (boss ? 'b' : 'w') + String(n).padStart(3, '0') + (secondary && !sharedFirstBoss ? '-2' : '') };
  }
  function legacyAssetId(value) {
    const a = typeof value === 'number' ? decodeAppearance(value) : value;
    if (!a) return null;
    const wave = a.baseWave || a.wave, boss = a.role !== 'normal';
    return (boss ? 'b' : 'w') + String(wave).padStart(3, '0') + (a.role === 'secondary' && wave !== 10 ? '-2' : '');
  }
  function direction(dx, dy, previous) {
    if (!finite(dx) || !finite(dy) || Math.hypot(dx, dy) < 0.001) return previous || 'side';
    if (Math.abs(dx) > Math.abs(dy) * 1.2) return 'side';
    if (Math.abs(dy) > Math.abs(dx) * 1.2) return dy > 0 ? 'front' : 'back';
    return previous || (Math.abs(dx) >= Math.abs(dy) ? 'side' : dy > 0 ? 'front' : 'back');
  }
  function phase(distance, stride) { return finite(stride) && stride > 0 ? mod(distance / stride, 1) : 0; }
  function phaseError(target, current) { return mod(target - current + 0.5, 1) - 0.5; }
  // Local animT advances by movement/38. Undo only spectator path rescaling so
  // time-based wings/hover keep that established cadence, including slow/stun.
  function timePhaseAdvance(distance, sourceScale, cycleSeconds) {
    if (!finite(distance) || distance <= 0 || !finite(sourceScale) || sourceScale <= 0 || !finite(cycleSeconds) || cycleSeconds <= 0) return 0;
    return distance / sourceScale / 38 / cycleSeconds;
  }

  // Keep all legacy i,d,h rows whenever they fit. Optional appearance/phase never removes an enemy.
  function enemyStream(rows, limit = EN_MAX) {
    const valid = rows.slice(0, 200).filter(r => Number.isInteger(r.i) && r.i >= 0 && finite(r.d));
    const legacy = valid.map(r => [r.i, Math.max(0, Math.round(r.d)), Math.max(0, Math.min(9, r.h | 0))].join(','));
    const art = legacy.map((s, i) => decodeAppearance(valid[i].a) ? s + ',' + valid[i].a : s);
    const phased = art.map((s, i) => s.split(',').length === 4 && finite(valid[i].p) ? s + ',' + Math.min(255, Math.floor(mod(valid[i].p, 1) * 256)) : s);
    if (phased.join(';').length <= limit) return phased.join(';');
    if (art.join(';').length <= limit) return art.join(';');
    // Very long legal lanes: preserve the legacy population, then add identity where budget allows.
    while (legacy.length && legacy.join(';').length > limit) { legacy.pop(); art.pop(); }
    let size = legacy.join(';').length;
    for (let i = 0; i < legacy.length; i++) {
      const extra = art[i].length - legacy[i].length;
      if (size + extra <= limit) { legacy[i] = art[i]; size += extra; }
    }
    return legacy.join(';');
  }
  function parseEnemyStream(text) {
    if (typeof text !== 'string' || text.length > EN_MAX) return [];
    const out = [];
    for (const row of text.split(';').slice(0, 200)) {
      if (!/^\d+,\d+,\d+(?:,\d+){0,2}$/.test(row)) continue;
      const f = row.split(',').map(Number);
      if (!f.every(Number.isSafeInteger) || f[0] > 10000 || f[1] > 100000 || f[2] > 9) continue;
      const art = f.length >= 4 ? decodeAppearance(f[3]) : null;
      out.push({ i: f[0], d: f[1], h: f[2], a: art ? f[3] : 0, appearance: art,
        p: art && f.length === 5 && f[4] <= 255 ? f[4] / 256 : null });
    }
    return out;
  }

  function validateEntry(id, e) {
    if (!e || e.ready !== true || e.assetId !== id || !finite(e.referenceHeight) || e.referenceHeight <= 0 || !finite(e.cycleStride) || e.cycleStride < 0) return null;
    if (!['ground', 'burrow', 'air', 'legged', 'slither', 'flight', 'float'].includes(e.locomotion)) return null;
    if (!['air', 'flight', 'float'].includes(e.locomotion) && e.cycleStride === 0) return null;
    if (e.cycleSeconds != null && (!finite(e.cycleSeconds) || e.cycleSeconds <= 0)) return null;
    const views = {};
    for (const name of VIEWS) {
      const v = e.views && e.views[name], scale = v && v.scale == null ? 1 : v && v.scale;
      if (!v || typeof v.still !== 'string' || typeof v.sheet !== 'string' || !v.still || !v.sheet) return null;
      if (v.assetVersion != null && (!Number.isSafeInteger(v.assetVersion) || v.assetVersion <= 0)) return null;
      if (typeof v.fallback !== 'string' || !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.fallback)) return null;
      if (![4, 8].includes(v.frames) || !Number.isInteger(v.cols) || v.cols < 1 || v.cols > v.frames || v.frames % v.cols) return null;
      if (!Number.isInteger(v.cell) || v.cell < 32 || v.cell > 1024 || !finite(scale) || scale <= 0) return null;
      if (v.rows != null && v.rows !== v.frames / v.cols) return null;
      if (!Array.isArray(v.pivot) || v.pivot.length !== 2 || !v.pivot.every(n => finite(n) && n >= 0 && n <= v.cell)) return null;
      const referenceHeight = e.referenceHeight * scale;
      if (referenceHeight < v.cell / 4 || referenceHeight > v.cell * 2) return null;
      if (/^(?:javascript|data):/i.test(v.still) || /^(?:javascript|data):/i.test(v.sheet)) return null;
      views[name] = { ...v, scale, referenceHeight, rows: v.frames / v.cols };
    }
    if (new Set(VIEWS.map(v => views[v].scale)).size !== 1 || new Set(VIEWS.map(v => views[v].frames)).size !== 1) return null;
    return { ...e, views };
  }

  // Nine small shared marks, baked once at loading time. The character bitmap,
  // gait, collision size and frame selection never depend on evolution.
  function bakeEvolutionMark(makeCanvas, tier, view) {
    const cv = makeCanvas(); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), colors = ['#85d9e9', '#bd9ff4', '#f4ce7e'];
    g.strokeStyle = colors[tier - 1]; g.fillStyle = colors[tier - 1];
    g.lineWidth = 1.4; g.globalAlpha = .48;
    g.beginPath(); g.ellipse(32, 38, view === 'side' ? 26 : 23, 23, 0, Math.PI * .10, Math.PI * .90); g.stroke();
    g.beginPath(); g.ellipse(32, 38, view === 'side' ? 26 : 23, 23, 0, Math.PI * 1.10, Math.PI * 1.90); g.stroke();
    g.globalAlpha = .92;
    const x = view === 'side' ? 45 : 32, y = view === 'back' ? 18 : 12;
    for (let i = 0; i < tier; i++) {
      const xx = x + (i - (tier - 1) / 2) * 7;
      g.beginPath(); g.moveTo(xx, y - 4); g.lineTo(xx + 2.5, y); g.lineTo(xx, y + 4); g.lineTo(xx - 2.5, y); g.closePath(); g.stroke();
    }
    return cv;
  }

  function create(options = {}) {
    const manifest = options.manifest || root.INF_DIRECTIONAL_ART || { entries: {} };
    const extreme = options.extremeManifest || (!options.manifest && root.INF_EXTREME_ART) || { entries: {} };
    const entries = new Map(), records = new Map(), invalidReady = [];
    for (const source of [manifest, extreme]) for (const [id, e] of Object.entries(source.entries || {})) {
      const checked = validateEntry(id, e);
      if (entries.has(id)) invalidReady.push('duplicate:' + id);
      else if (checked) entries.set(id, { ...checked, assetVersion: source.version || 93 });
      else if (e && e.ready === true) invalidReady.push(id);
    }
    const budget = options.budget || 96 * MiB, concurrency = Math.max(1, Math.min(2, options.concurrency || 2));
    const makeCanvas = options.makeCanvas || (() => root.document.createElement('canvas'));
    const clock = options.now || (() => Date.now());
    const base = options.base || (root.location && root.location.href) || 'http://localhost/';
    let resident = 0, reserved = 0, running = 0, generation = 0, tick = 0, peak = 0, maxRunning = 0, disposed = false;
    let initialization, initWaiter, initialized = false;
    const evolutionMarks = new Map();
    let overlayBytes = 0;
    const stats = { loads: 0, failures: 0, evictions: 0, budgetSkips: 0 };
    // A corrected direction can invalidate its own images while other views keep their cache URLs.
    const urlFor = (src, entry, view) => { const u = new URL(src, base); u.searchParams.set('v', String(view.assetVersion ?? entry.assetVersion)); return u.href; };
    const loader = options.loadImage || (url => new Promise((resolve, reject) => {
      const im = new root.Image();
      let settled = false;
      const finish = (error) => {
        if (settled) return; settled = true; clearTimeout(timer); im.onload = im.onerror = null;
        if (error) { im.src = ''; reject(error); } else resolve(im);
      };
      const timer = setTimeout(() => finish(new Error('art load timeout')), 15000);
      im.onload = () => finish(); im.onerror = () => finish(new Error('art load failed')); im.src = url;
    }));
    function record(id, view, kind) {
      const e = entries.get(id); if (!e || !e.views[view]) return null;
      const key = id + ':' + view + ':' + kind;
      if (!records.has(key)) {
        const original = e.views[view], mandatory = kind === 'fallback', factor = mandatory ? 64 / original.cell : 1;
        const v = mandatory ? { ...original, cell: 64, pivot: original.pivot.map(n => n * factor), referenceHeight: original.referenceHeight * factor } : original;
        const count = kind === 'sheet' ? v.frames : 1;
        records.set(key, { key, id, view, kind, entry: e, descriptor: v, count, bytes: count * v.cell * v.cell * 4,
          mandatory, status: 'idle', frames: null, pin: mandatory, wanted: mandatory, priority: mandatory ? -1 : 9, touched: 0, attempts: 0, consecutiveFailures: 0, retryAt: 0 });
      }
      return records.get(key);
    }
    function evict(r) {
      if (r.status !== 'ready' || r.pin) return false;
      for (const f of r.frames) { f.cv.width = 0; f.cv.height = 0; }
      resident -= r.bytes; r.frames = null; r.status = 'idle'; stats.evictions++; return true;
    }
    function space(required, incoming) {
      if (resident + reserved + required <= budget) return true;
      for (const r of [...records.values()].filter(r => r.status === 'ready' && !r.pin && (!r.wanted || r.priority > incoming.priority)).sort((a, b) => Number(a.wanted) - Number(b.wanted) || a.touched - b.touched)) {
        evict(r); if (resident + reserved + required <= budget) return true;
      }
      return false;
    }
    async function run(r) {
      const stamp = generation, reservation = r.bytes * 2;
      running++; reserved += reservation; maxRunning = Math.max(maxRunning, running); peak = Math.max(peak, resident + reserved);
      r.status = 'loading'; r.attempts++; let img, frames = [];
      try {
        img = await loader(r.mandatory ? r.descriptor.fallback : urlFor(r.descriptor[r.kind], r.entry, r.descriptor), r);
        const v = r.descriptor, cols = r.kind === 'sheet' ? v.cols : 1, rows = r.kind === 'sheet' ? v.rows : 1;
        if (img.width !== cols * v.cell || img.height !== rows * v.cell) throw new Error('unexpected directional art grid: ' + r.key);
        if (disposed || stamp !== generation || !r.wanted) { r.status = 'idle'; return; }
        for (let i = 0; i < r.count; i++) {
          const cv = makeCanvas(); cv.width = cv.height = v.cell;
          cv.getContext('2d').drawImage(img, i % cols * v.cell, Math.floor(i / cols) * v.cell, v.cell, v.cell, 0, 0, v.cell, v.cell);
          frames.push({ cv, w: v.cell, h: v.cell, pivot: v.pivot.slice(), referenceHeight: v.referenceHeight, directional: true,
            assetId: r.id, legacyAssetId: r.entry.legacyAssetId, view: r.view, cacheKey: r.key });
        }
        r.frames = frames; frames = []; r.status = 'ready'; r.consecutiveFailures = 0; r.retryAt = 0; delete r.error;
        resident += r.bytes; r.touched = ++tick; stats.loads++;
      } catch (error) {
        r.status = 'failed'; r.consecutiveFailures++; r.retryAt = clock() + 30000; stats.failures++; r.error = String(error.message || error);
      } finally {
        for (const f of frames) { f.cv.width = 0; f.cv.height = 0; }
        if (img && typeof img.close === 'function') img.close();
        else if (img && typeof img.src === 'string') img.src = '';
        running--; reserved -= reservation; pump(); checkInit();
      }
    }
    function pump() {
      if (disposed) return;
      const queue = [...records.values()].filter(r => r.wanted && (r.status === 'idle' || (r.status === 'failed' && r.consecutiveFailures < 3 && r.retryAt <= clock()))).sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
      for (const r of queue) {
        if (running >= concurrency) break;
        if (!space(r.bytes * 2, r)) { stats.budgetSkips++; continue; }
        void run(r);
      }
    }
    function demand(active = [], future = [], retained = []) {
      for (const r of records.values()) { r.pin = r.mandatory; r.wanted = r.mandatory; r.priority = r.mandatory ? -1 : 9; }
      const want = (id, view, kind, priority, pin) => { const r = record(id, view, kind); if (!r) return; r.wanted = true; r.pin ||= pin; r.priority = Math.min(r.priority, priority); };
      for (const a of active) {
        for (const v of VIEWS) want(a.id, v, 'still', v === a.view ? 0 : 2, true);
        want(a.id, a.view || 'side', 'sheet', 1, true);
      }
      for (const id of future) for (const v of VIEWS) { want(id, v, 'still', 3, false); want(id, v, 'sheet', 4, false); }
      for (const key of retained) { const r = records.get(key); if (r) { r.pin = true; r.wanted = true; } }
      // Old waves may still be alive. Only unreferenced resources are eligible for removal.
      for (const r of records.values()) if (!r.wanted && r.status === 'ready') evict(r);
      pump();
    }
    function frame(id, view, cyclePhase) {
      for (const [v, kind] of [[view, 'sheet'], [view, 'still'], [view, 'fallback'], ['side', 'fallback']]) {
        const r = record(id, v, kind);
        if (r && r.status === 'ready' && r.frames && r.frames.length) {
          r.touched = ++tick;
          return r.frames[Math.floor(mod(cyclePhase || 0, 1) * r.frames.length) % r.frames.length];
        }
      }
      return null;
    }
    function checkInit() {
      if (!initWaiter) return;
      const mandatory = [...records.values()].filter(r => r.mandatory), failure = mandatory.find(r => r.status === 'failed');
      if (failure || disposed) { initWaiter.reject(new Error(failure ? 'inline character fallback failed: ' + failure.key : 'art cache disposed')); initWaiter = null; }
      else if (mandatory.every(r => r.status === 'ready')) { initialized = true; initWaiter.resolve(); initWaiter = null; }
    }
    function init() {
      if (initialization) return initialization;
      initialization = new Promise((resolve, reject) => {
        if (invalidReady.length) { reject(new Error('invalid approved directional entries: ' + invalidReady.join(', '))); return; }
        for (const id of entries.keys()) for (const view of VIEWS) record(id, view, 'fallback');
        const mandatory = [...records.values()].filter(r => r.mandatory);
        const bytes = mandatory.reduce((n, r) => n + r.bytes, 0);
        const markBytes = [...entries.values()].some(e => e.wave >= 102) ? MAX_EVOLUTION * VIEWS.length * 64 * 64 * 4 : 0;
        // Account for both decoded input images and output canvases while the final two decode.
        if (bytes + markBytes + Math.min(concurrency, mandatory.length) * 64 * 64 * 4 > budget) { reject(new Error('inline character fallbacks exceed art cache budget')); return; }
        if (markBytes) {
          for (let tier = 1; tier <= MAX_EVOLUTION; tier++) for (const view of VIEWS) evolutionMarks.set(tier + ':' + view, bakeEvolutionMark(makeCanvas, tier, view));
          overlayBytes = markBytes; resident += markBytes;
        }
        initWaiter = { resolve, reject }; pump(); checkInit();
      });
      return initialization;
    }
    return { entry: id => entries.get(id) || null, frame, demand, init,
      evolutionMark: (tier, view) => evolutionMarks.get(Math.min(MAX_EVOLUTION, Math.max(0, tier | 0)) + ':' + view) || null,
      state: () => ({ version: manifest.version, approvedEntries: entries.size, initialized, invalidReady, budget, residentBytes: resident, reservedBytes: reserved, trackedBytes: resident + reserved,
        overlayBytes, peakTrackedBytes: peak, running, maxRunning, ...stats, records: [...records.values()].map(({ key, status, pin, bytes, attempts, consecutiveFailures, error }) => ({ key, status, pin, bytes, attempts, consecutiveFailures, error })) }),
      clear() { generation++; for (const r of records.values()) { r.pin = !disposed && r.mandatory; r.wanted = r.pin; if (r.status === 'ready' && !r.pin) evict(r); } },
      dispose() { disposed = true; this.clear(); for (const cv of evolutionMarks.values()) { cv.width = cv.height = 0; } evolutionMarks.clear(); resident -= overlayBytes; overlayBytes = 0; checkInit(); } };
  }
  root.DKDirectionalArt = { create, roster, appearance, decodeAppearance, legacyAssetId, direction, phase, phaseError, timePhaseAdvance, enemyStream, parseEnemyStream, validateEntry, EN_MAX };
})(typeof window === 'undefined' ? globalThis : window);
