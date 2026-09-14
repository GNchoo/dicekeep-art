'use strict';
(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.DKBATTLE = rules;
})(typeof window === 'object' ? window : globalThis, function () {
  // One ruleset for the browser and room server. Legacy solo modes never use it.
  return Object.freeze({
    version: 2, lives: 20, normalLeak: 1, bossLeak: 5,
    transferEvery: 5, goal: 700, supply: 60, assistMs: 45000,
    bossMs: 90000, bossLimitSeconds: 45, pendingMax: 128,
    waveSeconds: 15, spawnCount: 12, normalHp: .75, bossHp: .6,
    waveGold: 20, waveGoldStep: 3,
  });
});
