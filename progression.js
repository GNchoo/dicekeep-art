(function (root, factory) {
  'use strict';
  const rules = typeof module === 'object' && module.exports && typeof require === 'function'
    ? require('./deck-rules.js') : root && root.DKDECKRULES;
  const treeRules = typeof module === 'object' && module.exports && typeof require === 'function'
    ? require('./tree-rules.js') : root && root.DKTREERULES;
  const api = factory(rules, treeRules);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.DKPROGRESSION = api;
})(typeof window !== 'undefined' ? window : null, function (RULES, TREE) {
  'use strict';

  // Persistent progression is separate from in-run gold/power and cosmetic gems.
  // This module does not charge money, verify payments or certify combat results.
  const VERSION = 1, MAX_SHARDS = 1000000000, MAX_LEVEL = 200, ECONOMY_VERSION = 2;
  const MAX_COUNTER = Number.MAX_SAFE_INTEGER, DECK_SIZE = 5;
  const TREE_VERSION = 1, TREE_PACK_GOLD = 420;
  const COLLECTION_VERSION = 1, MAX_CLASS = 20, MAX_GOLD = 1000000000, MAX_COPIES = 1000000000, MAX_PACKS = 1000000;
  const PACK_ODDS = Object.freeze({ common: 55, rare: 30, unique: 12, legendary: 3 }), PACK_PITY = 20, PACK_CARDS = 5, PACK_GOLD = 120;
  const CRAFT_COPIES = Object.freeze({ common: 8, rare: 4, unique: 2, legendary: 1 });
  const BASE_CLASSES = Object.freeze({ common: 1, rare: 3, unique: 5, legendary: 7 });
  function collectionSeed() {
    const words = new Uint32Array(1);
    if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(words);
    return words[0] || 0x6d2b79f5;
  }
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
    const profile = { version: VERSION, economyVersion: ECONOMY_VERSION, shards: 0, levels, deck: [1, 2, 3, 4, 5], records, legacy: legacyFrom(legacySave), settled: [] };
    profile.collection = makeCollection(profile, false);
    if (TREE) profile.tree = makeTree(profile, 'new-profile');
    return profile;
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
    out.economyVersion = source.economyVersion === ECONOMY_VERSION ? ECONOMY_VERSION : 1;
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
    out.collection = isObject(source.collection) ? sanitizeCollection(source.collection, out) : makeCollection(out, true);
    out.deck = out.collection.presets[out.collection.activePreset].faces.slice();
    if (TREE) out.tree = isObject(source.tree) ? sanitizeTree(source.tree, out)
      : makeTree(out, isObject(source.collection) || isObject(source.levels) ? 'collection-v111' : 'new-profile');
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
      && Array.isArray(profile.settled) && profile.settled.length <= 64 && profile.settled.every(idValid) && new Set(profile.settled).size === profile.settled.length
      && (profile.collection === undefined || collectionValid(profile.collection))
      && (profile.tree === undefined || treeValid(profile.tree, profile.collection));
  }

  function cardInfo(face) { return faceValid(face) && RULES && typeof RULES.get === 'function' ? RULES.get(face) : null; }
  function baseClass(face) { const info = cardInfo(face); return info && (info.baseClass || BASE_CLASSES[info.rarity]) || 1; }
  function craftCost(face) { const info = cardInfo(face); return info ? { shards: 20, copies: CRAFT_COPIES[info.rarity] || 1 } : null; }
  function classUpgradeCost(face, level) {
    if (!cardInfo(face) || !integer(level, baseClass(face), MAX_CLASS - 1)) return null;
    const progress = level - baseClass(face);
    return { copies: 2 + 2 * progress, gold: 60 + 40 * progress + 10 * progress * progress };
  }
  const collectionDeckValid = (faces, cards) => Array.isArray(faces) && faces.length === DECK_SIZE && new Set(faces).size === DECK_SIZE
    && faces.every(face => faceValid(face) && cards[face] && cards[face].owned);
  function collectionValid(value) {
    return isObject(value) && value.version === COLLECTION_VERSION && integer(value.gold, 0, MAX_GOLD)
      && integer(value.packs, 0, MAX_PACKS) && integer(value.opened, 0, MAX_COUNTER) && integer(value.pity, 0, PACK_PITY - 1)
      && integer(value.rng, 1, 0xffffffff) && integer(value.activePreset, 0, 2) && isObject(value.cards) && Object.keys(value.cards).length === 20
      && Array.from({ length: 20 }, (_, i) => i + 1).every(face => {
        const card = value.cards[face];
        return isObject(card) && typeof card.owned === 'boolean' && (face > 6 || card.owned)
          && integer(card.copies, 0, MAX_COPIES) && (card.owned ? integer(card.class, baseClass(face), MAX_CLASS) : card.class === 0);
      }) && Array.isArray(value.presets) && value.presets.length === 3
      && value.presets.every((p, i) => isObject(p) && p.name === '덱 ' + (i + 1) && collectionDeckValid(p.faces, value.cards));
  }
  function validCollectionDeck(faces, cards) {
    const picked = [];
    for (const face of Array.isArray(faces) ? faces : []) if (faceValid(face) && cards[face].owned && !picked.includes(face) && picked.length < DECK_SIZE) picked.push(face);
    for (let face = 1; picked.length < DECK_SIZE && face <= 20; face++) if (cards[face].owned && !picked.includes(face)) picked.push(face);
    return picked;
  }
  // Existing upgrade investment becomes collection resources at explicit rates.
  // It is spent once on that card's class, with every remainder retained. Legacy
  // levels, shard wallet, receipts, records and active run snapshots are untouched.
  function makeCollection(profile, migrated) {
    const cards = {}, migration = { version: COLLECTION_VERSION, source: migrated ? 'legacy-levels-v1' : 'new-profile', spentShards: 0, convertedGold: 0, convertedCopies: 0 };
    let gold = 600;
    for (let face = 1; face <= 20; face++) {
      const level = profile.levels[face] || 0, card = cards[face] = { owned: level > 0, copies: 0, class: level > 0 ? baseClass(face) : 0 };
      if (!migrated || level < 2) continue;
      let spent = 0; for (let prior = 1; prior < level; prior++) spent += upgradeCost(prior);
      let cardGold = spent * 10;
      card.copies = Math.floor(spent / 20) * (craftCost(face)?.copies || 1);
      migration.spentShards += spent; migration.convertedGold += cardGold; migration.convertedCopies += card.copies;
      while (card.class < MAX_CLASS) {
        const cost = classUpgradeCost(face, card.class);
        if (!cost || card.copies < cost.copies || cardGold < cost.gold) break;
        card.copies -= cost.copies; cardGold -= cost.gold; card.class++;
      }
      gold += cardGold;
    }
    const faces = validCollectionDeck(profile.deck, cards);
    return { version: COLLECTION_VERSION, gold: Math.min(gold, MAX_GOLD), cards,
      presets: Array.from({ length: 3 }, (_, i) => ({ name: '덱 ' + (i + 1), faces: faces.slice() })), activePreset: 0,
      packs: 3, opened: 0, pity: 0, rng: collectionSeed(), migration };
  }
  function sanitizeCollection(raw, profile) {
    const cards = {};
    for (let face = 1; face <= 20; face++) {
      const source = isObject(raw.cards) && isObject(raw.cards[face]) ? raw.cards[face] : {};
      const owned = face <= 6 || source.owned === true || profile.levels[face] > 0;
      cards[face] = { owned, copies: count(source.copies, MAX_COPIES), class: owned ? Math.max(baseClass(face), count(source.class, MAX_CLASS, baseClass(face))) : 0 };
      if (owned && !profile.levels[face]) profile.levels[face] = 1;
    }
    const activePreset = integer(raw.activePreset, 0, 2) ? raw.activePreset : 0;
    const presets = Array.from({ length: 3 }, (_, i) => ({ name: '덱 ' + (i + 1), faces: validCollectionDeck(raw.presets?.[i]?.faces || profile.deck, cards) }));
    // Numeric deck is the compatibility alias for old saves/actions. Repair a
    // mismatching old writer by adopting its valid current deck into the preset.
    if (collectionDeckValid(profile.deck, cards) && Array.isArray(raw.presets?.[activePreset]?.faces)
      && profile.deck.some((face, i) => face !== presets[activePreset].faces[i])) presets[activePreset].faces = profile.deck.slice();
    const m = isObject(raw.migration) ? raw.migration : {};
    return { version: COLLECTION_VERSION, gold: count(raw.gold, MAX_GOLD), cards, presets, activePreset,
      packs: count(raw.packs, MAX_PACKS), opened: count(raw.opened), pity: count(raw.pity, PACK_PITY - 1),
      rng: integer(raw.rng, 1, 0xffffffff) ? raw.rng : 0x6d2b79f5,
      migration: { version: COLLECTION_VERSION, source: m.source === 'legacy-levels-v1' ? m.source : 'new-profile',
        spentShards: count(m.spentShards), convertedGold: count(m.convertedGold), convertedCopies: count(m.convertedCopies) } };
  }
  function migrateCollection(profile) {
    if (!profileValid(profile)) return { ok: false, reason: 'invalid-profile' };
    if (profile.collection !== undefined) return { ok: true, migrated: false, migration: profile.collection.migration };
    profile.collection = makeCollection(profile, true);
    profile.deck = profile.collection.presets[0].faces.slice();
    return { ok: true, migrated: true, migration: { ...profile.collection.migration } };
  }
  function collectionSummary(profile) {
    if (!profileValid(profile) || !collectionValid(profile.collection)) return null;
    const c = profile.collection, values = Object.entries(c.cards), classProgress = values.reduce((sum, [face, card]) => sum + (card.owned ? card.class - baseClass(+face) : 0), 0);
    return { owned: values.filter(([, card]) => card.owned).length, total: 20, gold: c.gold, packs: c.packs, opened: c.opened,
      pity: c.pity, nextLegendaryIn: PACK_PITY - c.pity, activePreset: c.activePreset, classProgress,
      critChance: .1, critDamage: 1.5 + Math.min(1, classProgress * .005) };
  }
  function classUp(profile, face) {
    if (profile?.tree?.version === TREE_VERSION) return { ok: false, reason: 'tree-system' };
    if (!profileValid(profile) || !collectionValid(profile.collection)) return { ok: false, reason: 'invalid-profile' };
    if (!faceValid(face)) return { ok: false, reason: 'invalid-face' };
    const c = profile.collection, card = c.cards[face];
    if (!card.owned) return { ok: false, reason: 'locked' };
    const cost = classUpgradeCost(face, card.class);
    if (!cost) return { ok: false, reason: 'max-class' };
    if (card.copies < cost.copies) return { ok: false, reason: 'insufficient-copies', cost };
    if (c.gold < cost.gold) return { ok: false, reason: 'insufficient-gold', cost };
    card.copies -= cost.copies; c.gold -= cost.gold; card.class++;
    return { ok: true, face, class: card.class, cost };
  }
  function grantCards(profile, face, quantity) {
    const card = profile.collection.cards[face], newlyOwned = !card.owned;
    if (newlyOwned) { card.owned = true; card.class = baseClass(face); profile.levels[face] = Math.max(1, profile.levels[face]); quantity--; }
    const copies = Math.min(quantity, MAX_COPIES - card.copies); card.copies += copies;
    return { face, owned: true, newlyOwned, copies, class: card.class };
  }
  function craft(profile, face) {
    if (profile?.tree?.version === TREE_VERSION) return { ok: false, reason: 'tree-system' };
    if (!profileValid(profile) || !collectionValid(profile.collection)) return { ok: false, reason: 'invalid-profile' };
    const cost = craftCost(face); if (!cost) return { ok: false, reason: 'invalid-face' };
    if (profile.shards < cost.shards) return { ok: false, reason: 'insufficient-shards', cost };
    if (profile.collection.cards[face].copies > MAX_COPIES - cost.copies) return { ok: false, reason: 'copy-limit' };
    profile.shards -= cost.shards; const reward = grantCards(profile, face, cost.copies);
    return { ok: true, face, cost, reward };
  }
  function setPreset(profile, index, faces) {
    if (!profileValid(profile) || !collectionValid(profile.collection)) return { ok: false, reason: 'invalid-profile' };
    if (!integer(index, 0, 2)) return { ok: false, reason: 'invalid-preset' };
    if (!collectionDeckValid(faces, profile.collection.cards)) return { ok: false, reason: 'invalid-deck' };
    profile.collection.presets[index].faces = faces.slice();
    if (index === profile.collection.activePreset) profile.deck = faces.slice();
    return { ok: true, index, deck: faces.slice() };
  }
  function activatePreset(profile, index) {
    if (!profileValid(profile) || !collectionValid(profile.collection)) return { ok: false, reason: 'invalid-profile' };
    if (!integer(index, 0, 2)) return { ok: false, reason: 'invalid-preset' };
    profile.collection.activePreset = index; profile.deck = profile.collection.presets[index].faces.slice();
    return { ok: true, index, deck: profile.deck.slice() };
  }
  // Free-only supply packs: xorshift32 state advances inside the profile. The
  // caller cannot supply a roll, seed or reward. Server actions are serialized.
  function openPack(profile) {
    if (profile?.tree?.version === TREE_VERSION) return { ok: false, reason: 'tree-system' };
    if (!profileValid(profile) || !collectionValid(profile.collection)) return { ok: false, reason: 'invalid-profile' };
    const c = profile.collection;
    if (!c.packs) return { ok: false, reason: 'no-packs' };
    if (c.opened >= MAX_COUNTER) return { ok: false, reason: 'pack-limit' };
    const random = () => { let x = c.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; c.rng = x >>> 0; return c.rng / 0x100000000; };
    const rewards = []; let legendary = false;
    for (let i = 0; i < PACK_CARDS; i++) {
      const sample = random() * 100; let ceiling = 0, rarity = 'legendary';
      for (const [key, chance] of Object.entries(PACK_ODDS)) { ceiling += chance; if (sample < ceiling) { rarity = key; break; } }
      if (i === PACK_CARDS - 1 && c.pity >= PACK_PITY - 1 && !legendary) rarity = 'legendary';
      const pool = Array.from({ length: 20 }, (_, n) => n + 1).filter(face => cardInfo(face)?.rarity === rarity);
      if (!pool.length) throw new Error('Missing collection rarity ' + rarity);
      const face = pool[Math.floor(random() * pool.length)]; rewards.push({ ...grantCards(profile, face, 1), rarity });
      if (rarity === 'legendary') legendary = true;
    }
    const gold = Math.min(PACK_GOLD, MAX_GOLD - c.gold); c.gold += gold; c.packs--; c.opened++; c.pity = legendary ? 0 : c.pity + 1;
    return { ok: true, rewards, cards: rewards.map(r => ({ face: r.face, copies: r.copies, isNew: r.newlyOwned, rarity: r.rarity })), gold, legendary, pity: c.pity, packs: c.packs };
  }

  function treeSnapshotMapsValid(value) {
    return !!TREE && isObject(value.mastery) && isObject(value.talents) && isObject(value.awakenings)
      && [value.mastery, value.talents, value.awakenings].every(m => Object.keys(m).length === 20)
      && Array.from({ length: 20 }, (_, i) => i + 1).every(face => integer(value.mastery[face], 0, TREE.MAX_MASTERY)
        && (value.talents[face] === null || ['force', 'insight'].includes(value.talents[face]) && value.mastery[face] >= 2)
        && typeof value.awakenings[face] === 'boolean' && (!value.awakenings[face] || value.mastery[face] >= 3));
  }
  function treeValid(tree, collection) {
    return isObject(tree) && tree.version === TREE_VERSION && collectionValid(collection) && treeSnapshotMapsValid(tree)
      && TREE.supporters.some(s => s.id === tree.supporter) && integer(tree.reserveGold, 0, MAX_COUNTER)
      && Array.from({ length: 20 }, (_, i) => i + 1).every(face => collection.cards[face].owned || tree.mastery[face] === 0)
      && isObject(tree.migration);
  }
  const copyGold = face => 200 / (craftCost(face)?.copies || 1);
  function makeTree(profile, source) {
    const c = profile.collection, mastery = {}, talents = {}, awakenings = {};
    const migration = { version: TREE_VERSION, source, oldPacks: c.packs, oldCopies: {}, oldClasses: {}, convertedCopiesGold: 0,
      convertedPacksGold: c.packs * TREE_PACK_GOLD, classInvestmentGold: 0, masteryValue: 0, masteryGained: 0, creditedGold: 0 };
    let credit = migration.convertedPacksGold;
    for (let face = 1; face <= 20; face++) {
      const card = c.cards[face]; mastery[face] = 0; talents[face] = null; awakenings[face] = false;
      migration.oldCopies[face] = card.copies; migration.oldClasses[face] = card.class;
      const duplicateValue = card.copies * copyGold(face); migration.convertedCopiesGold += duplicateValue; credit += duplicateValue;
      let investment = 0;
      if (card.owned) for (let level = baseClass(face); level < card.class; level++) {
        const cost = classUpgradeCost(face, level); investment += cost.gold + cost.copies * copyGold(face);
      }
      migration.classInvestmentGold += investment;
      while (mastery[face] < TREE.MAX_MASTERY) {
        const cost = TREE.masteryCost(mastery[face]), value = cost.gold + cost.shards * 10;
        if (investment < value) break;
        investment -= value; migration.masteryValue += value; mastery[face]++; migration.masteryGained++;
      }
      credit += investment; card.copies = 0;
    }
    migration.creditedGold = credit;
    const deposited = Math.min(credit, MAX_GOLD - c.gold); c.gold += deposited; c.packs = 0;
    return { version: TREE_VERSION, mastery, talents, awakenings, supporter: 'supply', reserveGold: credit - deposited, migration };
  }
  function sanitizeTree(raw, profile) {
    const mastery = {}, talents = {}, awakenings = {};
    for (let face = 1; face <= 20; face++) {
      mastery[face] = profile.collection.cards[face].owned ? count(raw.mastery?.[face], TREE.MAX_MASTERY) : 0;
      talents[face] = mastery[face] >= 2 && ['force', 'insight'].includes(raw.talents?.[face]) ? raw.talents[face] : null;
      awakenings[face] = mastery[face] >= 3 && raw.awakenings?.[face] === true;
    }
    const m = isObject(raw.migration) ? raw.migration : {}, migration = { version: TREE_VERSION,
      source: ['new-profile', 'collection-v111'].includes(m.source) ? m.source : 'collection-v111',
      oldPacks: count(m.oldPacks, MAX_PACKS), oldCopies: {}, oldClasses: {} };
    for (let face = 1; face <= 20; face++) {
      migration.oldCopies[face] = count(m.oldCopies?.[face], MAX_COPIES);
      migration.oldClasses[face] = count(m.oldClasses?.[face], MAX_CLASS);
    }
    for (const field of ['convertedCopiesGold', 'convertedPacksGold', 'classInvestmentGold', 'masteryValue', 'masteryGained', 'creditedGold']) migration[field] = count(m[field]);
    return { version: TREE_VERSION, mastery, talents, awakenings,
      supporter: TREE.supporters.some(s => s.id === raw.supporter) ? raw.supporter : 'supply', reserveGold: count(raw.reserveGold), migration };
  }
  function migrateTree(profile) {
    if (!TREE || !profileValid(profile)) return { ok: false, reason: 'invalid-profile' };
    if (profile.tree !== undefined) return { ok: true, migrated: false, migration: structuredMigration(profile.tree.migration) };
    const collection = migrateCollection(profile); if (!collection.ok) return collection;
    profile.tree = makeTree(profile, 'collection-v111');
    return { ok: true, migrated: true, migration: structuredMigration(profile.tree.migration) };
  }
  function structuredMigration(m) { return { ...m, oldCopies: { ...m.oldCopies }, oldClasses: { ...m.oldClasses } }; }
  function treeSummary(profile) {
    if (!profileValid(profile) || !treeValid(profile.tree, profile.collection)) return null;
    const t = profile.tree;
    return { owned: Object.values(profile.collection.cards).filter(c => c.owned).length, total: 20, gold: profile.collection.gold,
      shards: profile.shards, reserveGold: t.reserveGold, mastery: Object.values(t.mastery).reduce((sum, n) => sum + n, 0),
      awakened: Object.values(t.awakenings).filter(Boolean).length, supporter: t.supporter, critChance: .1, critDamage: 1.5,
      activePreset: profile.collection.activePreset, migration: structuredMigration(t.migration) };
  }
  function treeReady(profile, face) {
    if (!profileValid(profile) || !treeValid(profile.tree, profile.collection)) return { ok: false, reason: 'invalid-profile' };
    if (face !== undefined && !faceValid(face)) return { ok: false, reason: 'invalid-face' };
    return null;
  }
  function treePay(profile, cost) {
    if (profile.collection.gold < cost.gold) return { ok: false, reason: 'insufficient-gold', cost };
    if (profile.shards < cost.shards) return { ok: false, reason: 'insufficient-shards', cost };
    profile.collection.gold -= cost.gold; profile.shards -= cost.shards;
    const refill = Math.min(profile.tree.reserveGold, MAX_GOLD - profile.collection.gold);
    profile.tree.reserveGold -= refill; profile.collection.gold += refill;
    return null;
  }
  function treeUnlock(profile, face) {
    const bad = treeReady(profile, face); if (bad) return bad;
    if (profile.collection.cards[face].owned) return { ok: false, reason: 'already-unlocked' };
    const node = TREE.get(face);
    if (node.previous && !profile.collection.cards[node.previous].owned) return { ok: false, reason: 'prerequisite', previous: node.previous };
    const cost = TREE.unlockCost(face), payment = treePay(profile, cost); if (payment) return payment;
    profile.collection.cards[face].owned = true; profile.collection.cards[face].class = baseClass(face); profile.levels[face] = Math.max(1, profile.levels[face]);
    return { ok: true, face, cost, owned: true };
  }
  function treeUpgrade(profile, face) {
    const bad = treeReady(profile, face); if (bad) return bad;
    if (!profile.collection.cards[face].owned) return { ok: false, reason: 'locked' };
    const cost = TREE.masteryCost(profile.tree.mastery[face]); if (!cost) return { ok: false, reason: 'max-mastery' };
    const payment = treePay(profile, cost); if (payment) return payment;
    profile.tree.mastery[face]++;
    return { ok: true, face, mastery: profile.tree.mastery[face], cost };
  }
  function treeTalent(profile, face, choice) {
    const bad = treeReady(profile, face); if (bad) return bad;
    if (!['force', 'insight'].includes(choice)) return { ok: false, reason: 'invalid-talent' };
    if (!profile.collection.cards[face].owned) return { ok: false, reason: 'locked' };
    if (profile.tree.mastery[face] < 2) return { ok: false, reason: 'mastery-required', required: 2 };
    const changed = profile.tree.talents[face] !== choice; profile.tree.talents[face] = choice;
    return { ok: true, face, choice, changed };
  }
  function treeAwaken(profile, face) {
    const bad = treeReady(profile, face); if (bad) return bad;
    if (!profile.collection.cards[face].owned) return { ok: false, reason: 'locked' };
    if (profile.tree.mastery[face] < 3) return { ok: false, reason: 'mastery-required', required: 3 };
    if (profile.tree.awakenings[face]) return { ok: false, reason: 'already-awakened' };
    const cost = TREE.awakeningCost(face), payment = treePay(profile, cost); if (payment) return payment;
    profile.tree.awakenings[face] = true; return { ok: true, face, awakened: true, cost };
  }
  function setSupporter(profile, id) {
    const bad = treeReady(profile); if (bad) return bad;
    if (!TREE.supporters.some(s => s.id === id)) return { ok: false, reason: 'invalid-supporter' };
    const changed = profile.tree.supporter !== id; profile.tree.supporter = id;
    return { ok: true, supporter: id, changed };
  }

  function cardUnlockCost(face) {
    return faceValid(face) ? face <= 6 ? 0 : 80 + 40 * (face - 7) : null;
  }

  // Cost is for advancing the current level by one. Level 200 is the shared cap.
  // Keep early collection pacing; later levels cost 105..194 instead of a
  // quadratic grind. Existing investment is returned once by migrateEconomy.
  function upgradeCost(level) {
    if (!integer(level, 1, MAX_LEVEL - 1)) return null;
    if (level < 20) return 10 + 5 * (level - 1);
    return 105 + Math.floor((level - 20) / 2);
  }

  function migrateEconomy(profile) {
    if (!profileValid(profile)) return { ok: false, shards: 0 };
    if (profile.economyVersion === ECONOMY_VERSION) return { ok: true, shards: 0 };
    let refund = 0;
    for (let face = 1; face <= 20; face++) for (let level = 20; level < profile.levels[face]; level++) {
      const extra = level - 20;
      refund += 120 + 15 * extra + 5 * Math.pow(Math.floor(extra / 10), 2) - upgradeCost(level);
    }
    const shards = Math.min(refund, MAX_SHARDS - profile.shards);
    profile.shards += shards;
    profile.economyVersion = ECONOMY_VERSION;
    return { ok: true, shards, refund, capped: shards < refund };
  }

  function unlock(profile, face) {
    if (profile?.tree?.version === TREE_VERSION) return { ok: false, reason: 'tree-system' };
    if (!profileValid(profile)) return { ok: false, reason: 'invalid-profile' };
    if (!faceValid(face)) return { ok: false, reason: 'invalid-face' };
    if (profile.levels[face] > 0) return { ok: false, reason: 'already-unlocked' };
    const cost = cardUnlockCost(face);
    if (profile.shards < cost) return { ok: false, reason: 'insufficient-shards', cost };
    profile.shards -= cost; profile.levels[face] = 1;
    if (profile.collection) { profile.collection.cards[face].owned = true; profile.collection.cards[face].class = Math.max(baseClass(face), profile.collection.cards[face].class); }
    return { ok: true, face, level: 1, cost };
  }

  function upgrade(profile, face) {
    if (profile?.tree?.version === TREE_VERSION) return { ok: false, reason: 'tree-system' };
    if (!profileValid(profile)) return { ok: false, reason: 'invalid-profile' };
    if (!faceValid(face)) return { ok: false, reason: 'invalid-face' };
    const level = profile.levels[face];
    if (!level) return { ok: false, reason: 'locked' };
    if (level >= MAX_LEVEL) return { ok: false, reason: 'max-level' };
    const cost = upgradeCost(level);
    if (profile.shards < cost) return { ok: false, reason: 'insufficient-shards', cost };
    profile.shards -= cost; profile.levels[face] = level + 1;
    const collectionRewards = { gold: 0, copies: 0 };
    if (profile.collection) {
      // Older clients may still buy a legacy level after account migration.
      // Preserve that level and credit its equivalent collection resources too,
      // so switching clients never strands a subsequent old-style investment.
      let spent = 0; for (let prior = 1; prior < level; prior++) spent += upgradeCost(prior);
      const c = profile.collection, card = c.cards[face];
      card.owned = true; card.class = Math.max(baseClass(face), card.class);
      collectionRewards.gold = Math.min(cost * 10, MAX_GOLD - c.gold);
      collectionRewards.copies = Math.min((Math.floor((spent + cost) / 20) - Math.floor(spent / 20)) * (craftCost(face)?.copies || 1), MAX_COPIES - card.copies);
      c.gold += collectionRewards.gold; card.copies += collectionRewards.copies;
    }
    return { ok: true, face, level: level + 1, cost, collectionRewards };
  }

  function setDeck(profile, faces) {
    if (!profileValid(profile)) return { ok: false, reason: 'invalid-profile' };
    if (!Array.isArray(faces) || faces.length !== DECK_SIZE || new Set(faces).size !== DECK_SIZE || !faces.every(faceValid)) return { ok: false, reason: 'invalid-deck' };
    if (faces.some(face => profile.levels[face] === 0)) return { ok: false, reason: 'locked' };
    profile.deck = faces.slice();
    if (profile.collection) {
      for (const face of faces) if (!profile.collection.cards[face].owned) { profile.collection.cards[face].owned = true; profile.collection.cards[face].class = baseClass(face); }
      profile.collection.presets[profile.collection.activePreset].faces = faces.slice();
    }
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
    const result = { mode, growth, levelCap: levelCap(mode), deck: Object.freeze(growth ? profile.deck.slice() : PURE_DECK.slice()), levels: Object.freeze(levels) };
    if (growth && collectionValid(profile.collection)) {
      const summary = collectionSummary(profile), classes = {};
      for (let face = 1; face <= 20; face++) classes[face] = profile.collection.cards[face].owned ? profile.collection.cards[face].class : profile.levels[face] > 0 ? baseClass(face) : 0;
      Object.assign(result, { deckSystem: 1, classes: Object.freeze(classes), critChance: summary.critChance, critDamage: summary.critDamage });
    }
    if (growth && treeValid(profile.tree, profile.collection)) {
      const t = profile.tree;
      Object.assign(result, { treeVersion: TREE_VERSION, mastery: Object.freeze({ ...t.mastery }), talents: Object.freeze({ ...t.talents }),
        awakenings: Object.freeze({ ...t.awakenings }), supporter: t.supporter, critChance: .1, critDamage: 1.5 });
    }
    return Object.freeze(result);
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
      && value.deck.every(face => faceValid(face) && integer(value.levels[face], 1, MAX_LEVEL))
      && (value.deckSystem === undefined || value.deckSystem === 1 && value.growth && isObject(value.classes)
        && value.deck.every(face => integer(value.classes[face], baseClass(face), MAX_CLASS))
        && value.critChance === .1 && Number.isFinite(value.critDamage) && value.critDamage >= 1.5 && value.critDamage <= 2.5)
      && (value.treeVersion === undefined || value.treeVersion === TREE_VERSION && value.deckSystem === 1 && value.growth
        && treeSnapshotMapsValid(value) && TREE.supporters.some(s => s.id === value.supporter) && value.critDamage === 1.5);
  }

  function damageMultiplier(value, face) {
    if (!snapshotValid(value) || !value.growth || !faceValid(face) || !value.deck.includes(face)) return 1;
    if (value.treeVersion === TREE_VERSION) return (1 + .03 * value.mastery[face]) * (value.talents[face] === 'force' ? 1.1 : 1);
    if (value.deckSystem === 1) return 1 + .03 * (value.classes[face] - baseClass(face));
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
    if (profile.settled.includes(run.id)) return { ok: true, shards: 0, earnedShards: 0, capped: false, record, newly: [], collectionRewards: { gold: 0, packs: 0 }, duplicate: true };
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
    const collectionRewards = { gold: 0, packs: 0 };
    if (collectionValid(profile.collection)) {
      const c = profile.collection;
      collectionRewards.gold = Math.min(Math.min(run.wave, 500) * 8 + newly.length * 40 + clearBonus * 5, MAX_GOLD - c.gold);
      collectionRewards.packs = profile.tree?.version === TREE_VERSION ? 0 : Math.min(Math.floor(Math.min(run.wave, 200) / 10), MAX_PACKS - c.packs);
      if (profile.tree?.version === TREE_VERSION) collectionRewards.gold = Math.min(collectionRewards.gold + Math.floor(Math.min(run.wave, 200) / 10) * TREE_PACK_GOLD, MAX_GOLD - c.gold);
      c.gold += collectionRewards.gold; c.packs += collectionRewards.packs;
    }
    return { ok: true, shards, earnedShards, capped: shards < earnedShards, record, newly, collectionRewards, duplicate: false };
  }

  return Object.freeze({ VERSION, ECONOMY_VERSION, MAX_SHARDS, MAX_LEVEL, MAX_COUNTER, DECK_SIZE, MODES, MILESTONES, GEM_MILESTONES, migrateEconomy,
    defaultProfile, sanitize, normalizeRecord, cardUnlockCost, upgradeCost, unlock, upgrade, setDeck, snapshot, snapshotValid, pureSnapshot, growsIn: growthMode, damageMultiplier, draw, settle,
    TREE_VERSION, TREE_PACK_GOLD, treeUnlock, treeUpgrade, treeTalent, treeAwaken, setSupporter, migrateTree, treeSummary,
    treeUnlockCost: face => TREE?.unlockCost(face) || null, treeMasteryCost: level => TREE?.masteryCost(level) || null, treeAwakeningCost: face => TREE?.awakeningCost(face) || null,
    COLLECTION_VERSION, MAX_CLASS, MAX_GOLD, MAX_COPIES, MAX_PACKS, PACK_ODDS, PACK_PITY, PACK_CARDS, PACK_GOLD,
    cardInfo, craftCost, classUpgradeCost, migrateCollection, collectionSummary, classUp, craft, openPack, setPreset, activatePreset });
});
