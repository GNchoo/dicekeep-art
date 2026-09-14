(function (root, factory) {
  'use strict';
  const deck = typeof module === 'object' && module.exports && typeof require === 'function' ? require('./deck-rules.js') : root && root.DKDECKRULES;
  const api = factory(deck);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.DKTREERULES = api;
})(typeof window !== 'undefined' ? window : null, function (DECK) {
  'use strict';
  const VERSION = 1, MAX_MASTERY = 5;
  const families = Object.freeze([
    { id: 'nature', name: '자연', color: '#81be87', cards: [4, 9, 12, 14] },
    { id: 'magic', name: '마법', color: '#b995eb', cards: [3, 8, 13, 20] },
    { id: 'engineering', name: '공학', color: '#dca569', cards: [1, 2, 5, 11] },
    { id: 'order', name: '질서', color: '#81b7e6', cards: [6, 7, 10, 17] },
    { id: 'chaos', name: '혼돈', color: '#dc8b9b', cards: [16, 15, 18, 19] }
  ].map(f => Object.freeze({ ...f, cards: Object.freeze(f.cards), faces: Object.freeze(f.cards.slice()) })));
  // Combat metadata is the source of truth for every visible ability description.
  // An independently loaded rules file still exposes topology/costs; the game
  // loads deck-rules first to supply the complete combat metadata.
  const supporters = Object.freeze(['supply', 'crusher', 'barrage'].map(id => DECK?.supporterInfo?.(id)).filter(Boolean));
  const talents = Object.freeze(['force', 'insight'].map(id => Object.freeze({ id, ...(DECK?.talentInfo?.(1, id) || {}) })));
  const cards = Object.freeze(Object.fromEntries(families.flatMap(f => f.cards.map((face, index) => [face, Object.freeze({
    face, id: face, family: f.id, familyName: f.name, tier: index, prerequisite: index ? f.cards[index - 1] : null, previous: index ? f.cards[index - 1] : null,
    awakening: DECK?.awakeningInfo ? Object.freeze(DECK.awakeningInfo(face)) : null
  })]))));
  const get = face => Number.isInteger(face) ? cards[face] || null : null;
  function unlockCost(face) { const c = get(face); return c ? { gold: Math.max(1, c.tier) * 120, shards: Math.max(0, c.tier - 1) * 10 } : null; }
  function masteryCost(level) { return Number.isInteger(level) && level >= 0 && level < MAX_MASTERY ? { gold: [100, 160, 240, 340, 460][level], shards: level * 5 } : null; }
  function awakeningCost(face) { return get(face) ? { gold: 300, shards: 15 } : null; }
  return Object.freeze({ VERSION, MAX_MASTERY, families, supporters, talents, cards, get, unlockCost, masteryCost, awakeningCost });
});
