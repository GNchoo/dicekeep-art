// Run real reward/kill/queue functions with a minimal DOM and canvas recorder.
// This verifies state transitions; it does not substitute for browser visual/audio review.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const path = require('node:path'), SAVE = require('../run-save.js'), FX = require('../presentation-fx.js');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
for (const name of ['net', 'content', 'run-save', 'combat-motion', 'presentation-fx', 'reward-audio', 'game'])
  assert.ok(Number(html.match(new RegExp(`src="${name}\\.js\\?v=(\\d+)"`))?.[1]) >= 157, name + ' includes boss reward runtime');
for (const id of ['boss-reward', 'boss-reward-title', 'boss-reward-open', 'boss-reward-art', 'boss-reward-message'])
  assert.equal(html.split(`id="${id}"`).length, 2, id + ' unique DOM element');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start); return source.slice(a, b);
}
let randomCalls = 0, randomValue = 0, depth = 0;
const math = Object.create(Math); math.random = () => { randomCalls++; return randomValue; };
const sounds = [], dice = [], elements = new Map();
const canvas = new Proxy({ globalAlpha: 1 }, { get(target, key) {
  if (key in target) return target[key];
  return (...args) => {
    for (const n of args) if (typeof n === 'number') assert.ok(Number.isFinite(n), key);
    if (key === 'save') depth++;
    if (key === 'restore') assert.ok(--depth >= 0, 'balanced canvas state');
    if (String(key).includes('Gradient')) return { addColorStop() {} };
  };
}});
const document = { activeElement: null };
function $(id) {
  if (!elements.has(id)) {
    const classes = new Set(['hidden']);
    elements.set(id, { dataset: {}, isConnected: true, attrs: {},
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {},
      focus() { document.activeElement = this; }, getContext: () => canvas });
  }
  return elements.get(id);
}
const S = { mode: 'infinity', phase: 'playing', paused: false, muted: false, gold: 100,
  wave: 10, heldDie: 0, enemies: [], texts: [], fxs: [], inf: { queue: [], kills: 0 } };
const c = { Math: math, window: { DKFX: FX, DKBOSS_AUDIO: { play: (_, __, kind) => sounds.push(kind) } },
  S, SLOT: { active: false }, DIE: { state: 'tray' }, VIEW: {}, COSMETIC: false, document, $, W: 1024, H: 576,
  audio: () => ({}), SFX_BUS: {}, SFX: { coin() {} }, noise() {}, netLog() {}, syncUI() {},
  polyRestR: () => [1, 0, 0, 0, 1, 0, 0, 0, 1], dieShape: k => k,
  dieKindColor: k => ({ d8: '#7fd4ff', d12: '#c78bff', d20: '#ffd452' })[k],
  drawPolyDie: (_, x, y, size, kind) => { assert.ok(size > 0); dice.push(kind); },
  deckRun: () => false, growthRun: () => false, battleRun: () => false,
  canPlaceAnywhere: () => true, rollDie: k => { c.SLOT.active = true; c.SLOT.kind = k; return true; },
  epos: () => ({ x: 100, y: 100 }), spawnDeath() {}, endInfinity: () => { S.phase = 'over'; } };
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8'), c);
c.DKCONTENT = c.window.DKCONTENT; c.chestDef = () => c.DKCONTENT.INFINITY.chest;
vm.runInContext(section('let BOSS_REWARD =', '// Updated after fitting') +
  section('function canStartRoll()', 'function canRoll()') +
  section('function pumpQueue()', 'function finishSlot()') +
  section('function damageEnemy(', '// 그림을 좌우로') +
  section('function checkInfClear()', '// 런의 젬') +
  '\nObject.defineProperty(globalThis,"reward",{get:()=>BOSS_REWARD});', c);
const chest = c.chestDef(), counts = { d8: 0, d12: 0, d20: 0 };
for (let i = 0; i < 30000; i++) counts[chest.drawBoss(() => (i + .5) / 30000)]++;
assert.deepEqual(counts, { d8: 10000, d12: 10000, d20: 10000 });
for (const [n, k] of [[0, 'd8'], [1/3-1e-10, 'd8'], [1/3, 'd12'], [2/3-1e-10, 'd12'], [2/3, 'd20'], [1-1e-10, 'd20']])
  assert.equal(chest.drawBoss(() => n), k);
for (const [wave, gold] of [[10,800],[20,800],[30,800],[40,1120],[50,1600],[60,2400],[70,1600]]) {
  const reward = c.DKCONTENT.INFINITY.bossReward(wave);
  assert.equal(reward.gold, gold); assert.equal(reward.chests, 1);
}
for (const [value, kind] of [[.1,'d8'],[.5,'d12'],[.9,'d20']]) {
  S.inf.queue = ['boss']; S.heldDie = 18; c.SLOT.active = false; S.phase = 'playing';
  $('old-button').focus(); randomValue = value; const before = randomCalls;
  c.updateBossReward(.01); c.pumpQueue();
  assert.equal(randomCalls, before, 'appearance never chooses the reward');
  assert.equal(S.inf.queue[0], 'boss'); assert.equal($('wrap').inert, true);
  assert.equal(c.openBossReward(), true); assert.equal(c.openBossReward(), false);
  assert.equal(randomCalls, before + 1, 'one random choice per chest, even on rapid taps');
  assert.deepEqual(S.inf.queue, [kind]); assert.equal(S.heldDie, 18); assert.equal(S.gold, 100);
  assert.equal(c.canStartRoll(), false); assert.equal($('boss-reward-open').attrs['aria-disabled'], 'true');
  for (let i = 0; i < 65; i++) c.updateBossReward(.05);
  assert.equal(c.reward, null); assert.equal($('wrap').inert, false); assert.equal(document.activeElement, $('old-button'));
  assert.ok(dice.includes(kind)); assert.equal(sounds.filter(s => s === kind).length, 1);
  assert.equal(depth, 0); c.pumpQueue(); assert.deepEqual(S.inf.queue, [kind], 'held die is never overwritten');
  S.heldDie = 0; c.pumpQueue(); assert.equal(c.SLOT.kind, kind); assert.equal(S.inf.queue.length, 0);
}
// Two boss deaths retain both chests, split the existing gold, and ignore repeat damage.
c.SLOT.active = false; S.inf.queue = []; S.gold = 100;
const bosses = [1,2].map(i => ({ hp: 10, gold: 0, isBoss: true, wave: 10, bossCount: 2,
  name: 'boss' + i, armor: 0, def: { size: 40 } }));
S.enemies = bosses;
for (const e of bosses) { c.damageEnemy(e, 20); c.damageEnemy(e, 20); }
assert.deepEqual(S.inf.queue, ['boss','boss']); assert.equal(S.gold, 900); assert.equal(S.inf.kills, 2);
randomValue = .1; c.updateBossReward(.01); c.openBossReward();
for (let i = 0; i < 51; i++) c.updateBossReward(.05);
randomValue = .9; c.updateBossReward(.01); c.openBossReward();
assert.deepEqual(S.inf.queue, ['d8','d20']);
for (let i = 0; i < 61; i++) c.updateBossReward(.05);
// Last boss: show its chest before the victory screen.
S.inf.queue = ['boss']; S.wave = S.inf.doneW = S.inf.clearWave = 101;
assert.equal(c.checkInfClear(), false); assert.equal(S.phase, 'playing');
c.updateBossReward(.01); c.openBossReward();
for (let i = 0; i < 61; i++) c.updateBossReward(.05);
assert.equal(S.phase, 'over'); assert.equal(S.inf.cleared, 1);
// Saved legacy non-deck runs retain unopened and opened rewards without drawing again.
const state = { gold: 400, lives: 20, wave: 10, waveActive: false, autoT: 0, waveT: 0, heldDie: 0, time: 0,
  towers: [], enemies: [], projs: [], spawnQ: [], speed: 1,
  inf: { mode: 'build', growthSnapshot: { growth: true }, runId: 'reward-test', recordKey: 'build', clearWave: 101,
    doneW: 10, kills: 2, power: {1:0,2:0,3:0,4:0,5:0,6:0}, bossT: 0, accountTicket: null, queue: ['boss','d20'] } };
const saved = SAVE.capture(state, { kind: 'd6', active: false }, { owner:'local', savedAt:1, elapsed:0, size:[430,932], lanes:[1000] });
assert.deepEqual(SAVE.hydrate(SAVE.decode(SAVE.encode(saved), 'local'), {}).inf.queue, ['boss','d20']);
saved.inf.queue.push('unknown'); assert.equal(SAVE.valid(saved), false);
// Exercise the real frame gate: presentation is real-time; only solo combat pauses.
let ticks = 0;
Object.assign(c, { uiInFrame: false, uiDirty: false, lastTs: 0, runSaveAt: 0,
  update: () => ticks++, updateDie() {}, updateSlot() {}, advancePresentation() {}, mpTick() {},
  refreshDirectionalDemand() {}, draw() {}, drawSlot() {}, requestAnimationFrame() {}, toast() {} });
vm.runInContext(section('function frame(ts)', '// ==================== 부팅') +
  section('function openMenu()', 'function closeMenu()') +
  section('window.DKAPP =', '// ---- 설정 모달'), c);
S.phase = 'playing'; S.speed = 4; S.inf.queue = ['boss']; S.inf.clearWave = 0; S.inf.cleared = 0;
c.frame(16); assert.equal(ticks, 0, 'solo clock stops while waiting for a tap');
assert.equal(c.window.DKAPP.back(), true); c.openMenu();
assert.equal($('menu').classList.contains('hidden'), true, 'native back/background cannot open an inaccessible menu');
S.net = {}; c.frame(32); assert.equal(ticks, 4, 'multiplayer simulation keeps running');
S.net = null; S.phase = 'over'; c.updateBossReward(.01);
assert.equal(c.reward, null); assert.equal($('wrap').inert, false, 'leaving the run releases background input');
console.log('PASS equal thirds, touch-only draw, double-tap guard, held-die queue, multi-boss gold, final reward, save round trip, frame clocks and native back');
