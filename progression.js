(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.DKPROGRESSION = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Persistent progression is separate from in-run gold/power and cosmetic gems.
  // This module does not charge money, verify payments or certify combat results.
  const VERSION = 1, MAX_SHARDS = 1000000000, MAX_LEVEL = 200;
  const MAX_COUNTER = Number.MAX_SAFE_INTEGER, DECK_SIZE = 5;
  const MODES = Object.freeze(['clear', 'build', 'extreme', 'multi', 'extremeMulti']);
  const MILESTONES = Object.freeze([10, 25, 50, 75, 100]);
  const GEM_MILESTONES = Object.freeze([10, 25, 50, 75, 100, 150, 200]);
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const faceValid = face => integer(face, 1, 20);
  const count = (value, max = MAX_COUNTER, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : fallback;
  const idValid = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
  const dateValid = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value.slice(0, 10);
  };
  const growthMode = mode => mode === 'build' || mode === 'extreme' || mode === 'extremeMulti';
  const levelCap = mode => mode === 'build' ? 20 : growthMode(mode) ? MAX_LEVEL : 0;
  const listValid = (list, allowed) => Array.isArray(list) && list.every(value => allowed.includes(value)) && new Set(list).size === list.length;
  const milestonesFrom = (value, allowed) => allowed.filter(item => Array.isArray(value) && value.includes(item));
  const emptyRecord = () => ({ best: 0, clears: 0, runs: [], milestones: [], gemMilestones: [] });

  function legacyFrom(value) {
    const source = isObject(value) ? value : {};
    return { best: count(source.best == null ? source.infBest : source.best), clears: count(source.clears == null ? source.infClears : source.clears) };
  }

  function defaultProfile(legacySave) {
    const levels = {}, records = {};
    for (let face = 1; face <= 20; face++) levels[face] = face <= 6 ? 1 : 0;
    for (const mode of MODES) records[mode] = emptyRecord();
    return { version: VERSION, shards: 0, levels, deck: [1, 2, 3, 4, 5], records, legacy: legacyFrom(legacySave), settled: [] };
  }

  function runValid(run, mode) {
    return isObject(run) && idValid(run.id) && MODES.includes(run.mode) && (mode == null || run.mode === mode)
      && integer(run.wave, 0, MAX_COUNTER) && integer(run.kills, 0, MAX_COUNTER)
      && typeof run.won === 'boolean' && dateValid(run.date)
      && typeof run.elapsed === 'number' && Number.isFinite(run.elapsed) && run.elapsed >= 0 && run.elapsed <= MAX_COUNTER;
  }

  function copyRun(run) {
    return { id: run.id, mode: run.mode, wave: run.wave, kills: run.kills, won: run.won, date: run.date, elapsed: run.elapsed };
  }

  function normalizeRecord(raw, mode) {
    const source = isObject(raw) ? raw : {}, out = emptyRecord();
    out.best = count(source.best); out.clears = count(source.clears);
    out.milestones = milestonesFrom(source.milestones, MILESTONES);
    out.gemMilestones = milestonesFrom(source.gemMilestones, GEM_MILESTONES);
    const seen = new Set();
    if (Array.isArray(source.runs)) for (const run of source.runs) {
      if (runValid(run, mode) && !seen.has(run.id)) { seen.add(run.id); out.runs.push(copyRun(run)); }
      if (out.runs.length === 5) break;
    }
    return out;
  }

  // Import only explicit, finite fields. Old mixed records stay in legacy.
  // No input arrays/objects are retained by reference.
  function sanitize(raw, legacySave) {
    const source = isObject(raw) && raw.version === VERSION ? raw : {};
    const out = defaultProfile(isObject(source.legacy) ? source.legacy : legacySave);
    out.shards = count(source.shards, MAX_SHARDS);
    if (isObject(source.levels)) for (let face = 1; face <= 20; face++) {
      const fallback = face <= 6 ? 1 : 0;
      out.levels[face] = Math.max(fallback, count(source.levels[face], MAX_LEVEL, fallback));
    }
    const picked = [];
    if (Array.isArray(source.deck)) for (const face of source.deck) {
      if (faceValid(face) && out.levels[face] > 0 && !picked.includes(face)) picked.push(face);
      if (picked.length === DECK_SIZE) break;
    }
    for (let face = 1; picked.length < DECK_SIZE && face <= 20; face++) {
      if (out.levels[face] > 0 && !picked.includes(face)) picked.push(face);
    }
    out.deck = picked;
    for (const mode of MODES) out.records[mode] = normalizeRecord(source.records && source.records[mode], mode);
    if (Array.isArray(source.settled)) out.settled = [...new Set(source.settled.filter(idValid))].slice(0, 64);
    return out;
  }

  function recordValid(record, mode) {
    return isObject(record) && integer(record.best, 0, MAX_COUNTER) && integer(record.clears, 0, MAX_COUNTER)
      && listValid(record.milestones, MILESTONES) && listValid(record.gemMilestones, GEM_MILESTONES)
      && Array.isArray(record.runs) && record.runs.length <= 5 && record.runs.every(run => runValid(run, mode))
      && new Set(record.runs.map(run => run.id)).size === record.runs.length;
  }

  function profileValid(profile) {
    return isObject(profile) && profile.version === VERSION && integer(profile.shards, 0, MAX_SHARDS)
      && isObject(profile.levels) && Array.from({ length: 20 }, (_, i) => i + 1).every(face => integer(profile.levels[face], face <= 6 ? 1 : 0, MAX_LEVEL))
      && Array.isArray(profile.deck) && profile.deck.length === DECK_SIZE && new Set(profile.deck).size === DECK_SIZE
      && profile.deck.every(face => faceValid(face) && profile.levels[face] > 0)
      && isObject(profile.records) && MODES.every(mode => recordValid(profile.records[mode], mode))
      && isObject(profile.legacy) && integer(profile.legacy.best, 0, MAX_COUNTER) && integer(profile.legacy.clears, 0, MAX_COUNTER)
      && Array.isArray(profile.settled) && profile.settled.length <= 64 && profile.settled.every(idValid) && new Set(profile.settled).size === profile.settled.length;
  }

  function cardUnlockCost(face) {
    return faceValid(face) ? face <= 6 ? 0 : 80 + 40 * (face - 7) : null;
  }

  // Cost is for advancing the current level by one. Level 200 is the shared cap.
  // 1->20 costs 10..100; 20->21 starts at 120, then +15 per level
  // with a quadratic surcharge every ten levels. Costs remain finite integers.
  function upgradeCost(level) {
    if (!integer(level, 1, MAX_LEVEL - 1)) return null;
    if (level < 20) return 10 + 5 * (level - 1);
    const extra = level - 20;
    return 120 + 15 * extra + 5 * Math.pow(Math.floor(extra / 10), 2);
  }

  function unlock(profile, face) {
    if (!profileValid(profile)) return { ok: false, reason: 'invalid-profile' };
    if (!faceValid(face)) return { ok: false, reason: 'invalid-face' };
    if (profile.levels[face] > 0) return { ok: false, reason: 'already-unlocked' };
    const cost = cardUnlockCost(face);
    if (profile.shards < cost) return { ok: false, reason: 'insufficient-shards', cost };
    profile.shards -= cost; profile.levels[face] = 1;
    return { ok: true, face, level: 1, cost };
  }

  function upgrade(profile, face) {
    if (!profileValid(profile)) return { ok: false, reason: 'invalid-profile' };
    if (!faceValid(face)) return { ok: false, reason: 'invalid-face' };
    const level = profile.levels[face];
    if (!level) return { ok: false, reason: 'locked' };
    if (level >= MAX_LEVEL) return { ok: false, reason: 'max-level' };
    const cost = upgradeCost(level);
    if (profile.shards < cost) return { ok: false, reason: 'insufficient-shards', cost };
    profile.shards -= cost; profile.levels[face] = level + 1;
    return { ok: true, face, level: level + 1, cost };
  }

  function setDeck(profile, faces) {
    if (!profileValid(profile)) return { ok: false, reason: 'invalid-profile' };
    if (!Array.isArray(faces) || faces.length !== DECK_SIZE || new Set(faces).size !== DECK_SIZE || !faces.every(faceValid)) return { ok: false, reason: 'invalid-deck' };
    if (faces.some(face => profile.levels[face] === 0)) return { ok: false, reason: 'locked' };
    profile.deck = faces.slice();
    return { ok: true, deck: profile.deck.slice() };
  }

  // Pure modes (clear, multi) must be untouched by free or paid account state.
  // Their snapshot is a constant: it never carries the account's deck or levels,
  // so a future reader that forgets the `growth` guard still cannot leak progression.
  const PURE_DECK = Object.freeze([1, 2, 3, 4, 5]);
  function snapshot(profile, mode) {
    if (!profileValid(profile) || !MODES.includes(mode)) return null;
    const growth = growthMode(mode), levels = {};
    for (let face = 1; face <= 20; face++) levels[face] = growth ? profile.levels[face] : face <= 6 ? 1 : 0;
    return Object.freeze({ mode, growth, levelCap: levelCap(mode), deck: Object.freeze(growth ? profile.deck.slice() : PURE_DECK.slice()), levels: Object.freeze(levels) });
  }

  // Caller-side fail-safe. If the mode table and this module ever disagree about
  // which modes grow, the caller can fall back to this constant and keep the run pure.
  const PURE_SNAPSHOT = Object.freeze({
    mode: 'clear', growth: false, levelCap: 0, deck: Object.freeze(PURE_DECK.slice()),
    levels: Object.freeze(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, i < 6 ? 1 : 0]))),
  });
  const pureSnapshot = () => PURE_SNAPSHOT;

  function snapshotValid(value) {
    return isObject(value) && MODES.includes(value.mode) && value.growth === growthMode(value.mode) && value.levelCap === levelCap(value.mode)
      && isObject(value.levels) && Array.isArray(value.deck) && value.deck.length === DECK_SIZE && new Set(value.deck).size === DECK_SIZE
      && value.deck.every(face => faceValid(face) && integer(value.levels[face], 1, MAX_LEVEL));
  }

  function damageMultiplier(value, face) {
    if (!snapshotValid(value) || !value.growth || !faceValid(face) || !value.deck.includes(face)) return 1;
    const level = Math.min(value.levels[face], value.levelCap);
    const base = 1 + 0.08 * (Math.min(level, 20) - 1);
    const result = value.levelCap > 20 && level > 20 ? base * Math.pow(1.08, level - 20) : base;
    return Number.isFinite(result) && result >= 1 ? result : 1;
  }

  function kindOf(face) {
    if (!faceValid(face)) return null;
    if (face === 1) return 'd1';
    if (face <= 4) return 'd4';
    if (face <= 6) return 'd6';
    if (face <= 8) return 'd8';
    if (face <= 12) return 'd12';
    if (face === 13) return 'd20';
    if (face <= 17) return 'epic';
    if (face <= 19) return 'myth';
    return 'primal';
  }

  // Exactly one random draw, uniform over the five selected faces.
  // Pure modes return null without consuming RNG; callers retain chest.draw/roll.
  function draw(value, rng = Math.random) {
    if (!snapshotValid(value) || !value.growth || typeof rng !== 'function') return null;
    const sample = rng();
    if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0 || sample >= 1) return null;
    const face = value.deck[Math.floor(sample * DECK_SIZE)];
    return { face, kind: kindOf(face) };
  }

  // Synchronous transaction: validation and next-state calculation precede writes.
  // Duplicate protection covers the most recent 64 settled run IDs, as persisted.
  // `shards` is the actual wallet credit; `earnedShards` reports any capped credit.
  function settle(profile, run) {
    const rejected = reason => ({ ok: false, reason, shards: 0, record: null, newly: [], duplicate: false });
    if (!profileValid(profile)) return rejected('invalid-profile');
    if (!runValid(run)) return rejected('invalid-run');
    const record = profile.records[run.mode];
    if (profile.settled.includes(run.id)) return { ok: true, shards: 0, earnedShards: 0, capped: false, record, newly: [], duplicate: true };
    const newly = MILESTONES.filter(wave => run.wave >= wave && !record.milestones.includes(wave));
    const clearBonus = run.won && run.wave >= 101 && ['clear', 'build', 'multi'].includes(run.mode) ? 20 : 0;
    const earnedShards = Math.floor(Math.min(run.wave, 500) / 5) * 5 + newly.length * 10 + clearBonus;
    const shards = Math.min(earnedShards, MAX_SHARDS - profile.shards);
    const next = {
      best: Math.max(record.best, run.wave),
      clears: Math.min(MAX_COUNTER, record.clears + (run.won ? 1 : 0)),
      runs: [copyRun(run), ...record.runs].slice(0, 5),
      milestones: [...record.milestones, ...newly],
      settled: [run.id, ...profile.settled].slice(0, 64),
    };
    profile.shards += shards;
    record.best = next.best; record.clears = next.clears; record.runs = next.runs; record.milestones = next.milestones;
    profile.settled = next.settled;
    return { ok: true, shards, earnedShards, capped: shards < earnedShards, record, newly, duplicate: false };
  }

  return Object.freeze({ VERSION, MAX_SHARDS, MAX_LEVEL, MAX_COUNTER, DECK_SIZE, MODES, MILESTONES, GEM_MILESTONES,
    defaultProfile, sanitize, normalizeRecord, cardUnlockCost, upgradeCost, unlock, upgrade, setDeck, snapshot, pureSnapshot, growsIn: growthMode, damageMultiplier, draw, settle });
});
