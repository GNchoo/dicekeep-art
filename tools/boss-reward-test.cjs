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
let modal = null, roomAvailable = true, growth = false;
const document = { activeElement: null,
  querySelector: selector => selector === 'dialog[open]' ? modal : null,
  querySelectorAll: selector => selector === 'dialog[open]' && modal ? [modal] : [] };
function $(id) {
  if (!elements.has(id)) {
    const classes = new Set(['hidden']);
    elements.set(id, { dataset: {}, isConnected: true, attrs: {}, inert: false,
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
        toggle(c, force) { const show = force === undefined ? !classes.has(c) : !!force; if (show) classes.add(c); else classes.delete(c); return show; } },
      setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {},
      focus() { document.activeElement = this; }, getContext: () => canvas });
  }
  return elements.get(id);
}
const S = { mode: 'infinity', phase: 'playing', paused: false, muted: false, gold: 100,
  wave: 10, heldDie: 0, selTower: null, towers: [], enemies: [], texts: [], fxs: [], inf: { queue: [], kills: 0 } };
const rolls = [], saves = [];
const c = { Math: math, window: { DKFX: FX, DKBOSS_AUDIO: { play: (_, __, kind) => sounds.push(kind) } },
  S, SLOT: { active: false }, DIE: { state: 'tray' }, VIEW: {}, MOVE: {}, DRAG: { active: false },
  COSMETIC: false, document, $, W: 1024, H: 576, SPOTS: Array.from({ length: 15 }, (_, i) => [100 + i * 10, 100]),
  audio: () => ({}), SFX_BUS: {}, SFX: { coin() {} }, noise() {}, netLog() {}, syncUI() {}, hudTopPx() {},
  polyRestR: () => [1, 0, 0, 0, 1, 0, 0, 0, 1], dieShape: k => k,
  dieKindColor: k => ({ d8: '#7fd4ff', d12: '#c78bff', d20: '#ffd452' })[k],
  drawPolyDie: (_, x, y, size, kind) => { assert.ok(size > 0); dice.push(kind); },
  deckRun: () => false, growthRun: () => growth, battleRun: () => false, towerSynergy:()=>({slowDamage:1}),
  menuOpen: () => !$('menu').classList.contains('hidden'), settingsOpen: () => !$('settings').classList.contains('hidden'),
  canPlaceAnywhere: () => roomAvailable,
  persistRun: () => saves.push(S.inf.queue.slice()),
  rollDie: k => { if (!c.canStartRoll()) return false; rolls.push(k); c.SLOT.active = true; c.SLOT.kind = k; return true; },
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
function reset(queue = ['boss']) {
  S.phase = 'over'; c.updateBossReward(0);
  S.phase = 'playing'; S.paused = false; S.heldDie = 0; S.selTower = null; S.net = null;
  S.wave = 10; S.gold = 100; S.towers = []; S.enemies = []; S.texts = []; S.fxs = [];
  S.inf = { mode: 'clear', queue: queue.slice(), kills: 0, doneW: 10, clearWave: 101 };
  c.SLOT.active = false; c.SLOT.phase = 0; c.DIE.state = 'tray'; c.VIEW.pid = null;
  for (const key of ['armed', 'tower', 'picking']) c.MOVE[key] = null;
  c.DRAG.active = false; modal = null; roomAvailable = true; growth = false;
  for (const id of ['menu', 'settings', 'inf-help']) $(id).classList.add('hidden');
}
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
  reset(); S.heldDie = 18;
  $('old-button').focus(); randomValue = value; const before = randomCalls;
  c.updateBossReward(.01); c.pumpQueue();
  assert.equal(c.reward, null, 'held tower defers the chest instead of covering the board');
  assert.equal($('boss-reward').classList.contains('hidden'), true);
  assert.equal(c.openBossReward(), false, 'a deferred reward cannot be tapped through a stale button');
  assert.equal(randomCalls, before, 'appearance never chooses the reward');
  assert.equal(S.inf.queue[0], 'boss'); assert.equal($('wrap').inert, false);
  S.heldDie = 0; c.updateBossReward(.01);
  assert.ok(c.reward && !c.reward.kind, 'clearing the hand makes the first chest available');
  assert.equal(c.openBossReward(), true); assert.equal(c.openBossReward(), false);
  assert.equal(randomCalls, before + 1, 'one random choice per chest, even on rapid taps');
  assert.deepEqual(S.inf.queue, [kind]); assert.equal(S.heldDie, 0); assert.equal(S.gold, 100);
  assert.equal(c.canStartRoll(), false); assert.equal($('boss-reward-open').attrs['aria-disabled'], 'true');
  S.heldDie = 18; c.updateBossReward(.01);
  assert.equal($('boss-reward').classList.contains('hidden'), true, 'an already chosen reward yields to a newly busy hand');
  assert.deepEqual(S.inf.queue, [kind], 'hiding the reveal does not remove or reroll its chosen die');
  for (let i = 0; i < 65; i++) c.updateBossReward(.05);
  assert.equal(c.reward, null); assert.equal($('wrap').inert, false); assert.equal(document.activeElement, $('old-button'));
  assert.ok(dice.includes(kind)); assert.equal(sounds.filter(s => s === kind).length, 1);
  assert.equal(depth, 0); c.pumpQueue(); assert.deepEqual(S.inf.queue, [kind], 'held die is never overwritten');
  S.heldDie = 0; c.pumpQueue(); assert.equal(c.SLOT.kind, kind); assert.equal(S.inf.queue.length, 0);
}
// Every board interaction and utility modal owns the screen before an unopened chest.
const blockers = [
  ['held tower', on => { S.heldDie = on ? 14 : 0; }],
  ['slot roll', on => { c.SLOT.active = on; }],
  ...['grab', 'throw', 'settle', 'fly'].map(state => ['physical ' + state, on => { c.DIE.state = on ? state : 'tray'; }]),
  ['selected tower', on => { S.selTower = on ? {} : null; }],
  ...['armed', 'tower', 'picking'].map(key => ['tower move ' + key, on => { c.MOVE[key] = on ? {} : null; }]),
  ['placement drag', on => { c.DRAG.active = on; }],
  ...['menu', 'settings', 'inf-help'].map(id => [id, on => { $(id).classList[on ? 'remove' : 'add']('hidden'); }]),
  ['enhancement confirmation', on => { modal = on ? {} : null; }],
];
for (const [name, set] of blockers) {
  reset(); set(true); const before = randomCalls;
  c.updateBossReward(.01); c.pumpQueue();
  assert.equal(c.reward, null, name + ': initial chest stays deferred');
  assert.equal(c.openBossReward(), false, name + ': no claim while busy');
  assert.deepEqual(S.inf.queue, ['boss']); assert.equal(randomCalls, before);
  set(false); c.updateBossReward(.01);
  assert.ok(c.reward && !c.reward.kind, name + ': release resumes unopened reward');
  set(true);
  assert.equal(c.openBossReward(), false, name + ': stale visible button also checks current busy state');
  c.updateBossReward(.01);
  assert.equal(c.reward, null, name + ': a new interaction removes the unopened overlay');
  assert.equal($('boss-reward').classList.contains('hidden'), true);
  assert.deepEqual(S.inf.queue, ['boss']); assert.equal(randomCalls, before);
  set(false); c.updateBossReward(.01);
  assert.ok(c.reward && !c.reward.kind, name + ': reward can reappear without another draw');

  reset(['d8', 'boss']); set(true); const rollCount = rolls.length;
  c.pumpQueue();
  assert.deepEqual(S.inf.queue, ['d8', 'boss'], name + ': ordinary pending die waits for the same interaction');
  assert.equal(rolls.length, rollCount);
  set(false); c.pumpQueue();
  assert.equal(c.SLOT.kind, 'd8'); assert.deepEqual(S.inf.queue, ['boss']);
}
reset(); roomAvailable = false;
const fullBefore = randomCalls; c.updateBossReward(.01); c.pumpQueue();
assert.equal(c.reward, null, 'a full board keeps its unopened reward saved');
assert.deepEqual(S.inf.queue, ['boss']); assert.equal(randomCalls, fullBefore);
roomAvailable = true; c.updateBossReward(.01); roomAvailable = false;
assert.equal(c.openBossReward(), false, 'a board filled after appearance cannot claim a new die');
assert.deepEqual(S.inf.queue, ['boss']); assert.equal(randomCalls, fullBefore);

reset(['d12', 'boss']);
const fifoBefore = randomCalls; c.updateBossReward(.01);
assert.equal(c.reward, null, 'a boss token behind an ordinary die never jumps the queue');
c.pumpQueue(); assert.equal(c.SLOT.kind, 'd12'); assert.deepEqual(S.inf.queue, ['boss']);
c.updateBossReward(.01); assert.equal(c.reward, null, 'the earlier physical die remains the only presentation');
assert.equal(randomCalls, fifoBefore);
c.SLOT.active = false; S.heldDie = 12; c.updateBossReward(.01); assert.equal(c.reward, null);
S.heldDie = 0; c.updateBossReward(.01); assert.ok(c.reward && !c.reward.kind);

reset(['boss', 'boss']); growth = true;
const saveBefore = saves.length; c.updateBossReward(.01); randomValue = .5;
assert.equal(c.openBossReward(), true);
assert.deepEqual(saves.at(-1), ['d12', 'boss'], 'claim persists the chosen die and every later unopened chest');
const savedDraws = randomCalls;
S.selTower = {}; c.updateBossReward(.01); c.openBossReward(); c.pumpQueue();
assert.deepEqual(S.inf.queue, ['d12', 'boss']); assert.equal(randomCalls, savedDraws);
assert.equal(saves.length, saveBefore + 1, 'blocked updates and taps do not rewrite or claim saved rewards');
growth = false;
// Two boss deaths retain both chests, split the existing gold, and ignore repeat damage.
reset([]);
const bosses = [1,2].map(i => ({ hp: 10, gold: 0, isBoss: true, wave: 10, bossCount: 2,
  name: 'boss' + i, armor: 0, def: { size: 40 } }));
S.enemies = bosses;
for (const e of bosses) { c.damageEnemy(e, 20); c.damageEnemy(e, 20); }
assert.deepEqual(S.inf.queue, ['boss','boss']); assert.equal(S.gold, 900); assert.equal(S.inf.kills, 2);
randomValue = .1; c.updateBossReward(.01); assert.equal(c.openBossReward(), true);
for (let i = 0; i < 51; i++) c.updateBossReward(.05);
c.pumpQueue(); assert.equal(c.SLOT.kind, 'd8'); assert.deepEqual(S.inf.queue, ['boss']);
const secondBefore = randomCalls;
for (const phase of ['tray', 'grab', 'throw', 'settle', 'fly']) {
  c.DIE.state = phase; c.updateBossReward(.05);
  assert.equal(c.reward, null, 'second boss chest waits through the first die ' + phase);
  assert.equal(c.openBossReward(), false); assert.deepEqual(S.inf.queue, ['boss']);
}
c.DIE.state = 'tray'; c.SLOT.active = false; S.heldDie = 8; c.updateBossReward(.01);
assert.equal(c.reward, null, 'settlement still waits until the first tower leaves the hand');
assert.equal(randomCalls, secondBefore);
S.heldDie = 0; randomValue = .9; c.updateBossReward(.01); assert.equal(c.openBossReward(), true);
assert.deepEqual(S.inf.queue, ['d20']); assert.equal(randomCalls, secondBefore + 1);
for (let i = 0; i < 61; i++) c.updateBossReward(.05);
c.pumpQueue(); assert.equal(c.SLOT.kind, 'd20'); assert.deepEqual(S.inf.queue, []);
assert.deepEqual(rolls.slice(-2), ['d8', 'd20'], 'both bosses deliver exactly one die in original FIFO order');
// Last boss: show its chest before the victory screen.
reset(); S.wave = S.inf.doneW = S.inf.clearWave = 101;
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
// A completed full board has nowhere to use either boss die. Settle the earned
// win without deleting queue entries or silently drawing their eventual values.
for (const level of [1, 3]) {
reset(['boss', 'boss']); S.heldDie = 18;
S.towers = c.SPOTS.map((_, spot) => ({ spot, face: 7 + spot % 11, lvl: level }));
// The old approximate space helper reports true for Lv1 even though held18
// matches none of these occupied pads. Final completion must use occupancy.
roomAvailable = level < 3;
assert.equal(S.towers.length, 15); assert.ok(S.towers.every(t => t.face !== S.heldDie));
S.wave = S.inf.clearWave = 101; S.inf.doneW = 100;
const fullFinalDraws = randomCalls, fullFinalQueue = S.inf.queue.slice(), ended = [];
const originalEnd = c.endInfinity;
c.endInfinity = won => { ended.push({ won, wave: S.wave, queue: S.inf.queue.slice() }); S.phase = 'over'; };
assert.equal(c.checkInfClear(), false, 'a full board cannot settle before the final wave is actually completed');
S.inf.doneW = 101; c.updateBossReward(.01);
assert.equal(c.reward, null, 'held/full board still cannot start a physical reward presentation');
assert.equal(c.checkInfClear(), true, 'both unused boss rewards cannot block a completed full-board Lv' + level + ' win');
assert.equal(S.phase, 'over'); assert.equal(S.inf.cleared, 1); assert.equal(S.wave, 101, 'completion cannot advance into wave 102');
assert.deepEqual(ended, [{ won: true, wave: 101, queue: ['boss', 'boss'] }]);
assert.deepEqual(S.inf.queue, fullFinalQueue); assert.equal(S.heldDie, 18); assert.equal(randomCalls, fullFinalDraws);
// Pure runs are not resumable. Verify the identical preserved queue also
// serializes unchanged in the supported saved-growth-run format.
const completed = SAVE.capture({ ...state, gold: S.gold, wave: S.wave, heldDie: S.heldDie,
  inf: { ...state.inf, doneW: S.inf.doneW, queue: S.inf.queue.slice() } },
  { kind: 'd6', active: false }, { owner: 'local', savedAt: 1, elapsed: 0, size: [430, 932], lanes: [1000] });
assert.deepEqual(completed.inf.queue, fullFinalQueue, 'capture preserves both unopened tokens after full-board settlement');
assert.equal(completed.state.heldDie, 18); assert.equal(completed.state.wave, 101);
assert.deepEqual(SAVE.hydrate(SAVE.decode(SAVE.encode(completed), 'local'), {}).inf.queue, fullFinalQueue);
c.updateBossReward(.01); c.pumpQueue(); assert.equal(c.checkInfClear(), false);
assert.deepEqual(S.inf.queue, fullFinalQueue); assert.equal(randomCalls, fullFinalDraws);
assert.equal(ended.length, 1, 'a completed run neither claims its unused rewards nor settles twice');
c.endInfinity = originalEnd;
}
// Exercise the real frame gate: presentation is real-time; neither solo nor multiplayer combat pauses.
let ticks = 0;
Object.assign(c, { uiInFrame: false, uiDirty: false, lastTs: 0, runSaveAt: 0,
  update: () => ticks++, updateDie() {}, updateSlot() {}, advancePresentation() {}, mpTick() {},
  refreshDirectionalDemand() {}, draw() {}, drawSlot() {}, requestAnimationFrame() {}, toast() {} });
vm.runInContext(section('function frame(ts)', '// ==================== 부팅') +
  section('function openMenu()', 'function closeMenu()') +
  section('window.DKAPP =', '// ---- 설정 모달'), c);
reset(); S.speed = 4; S.inf.clearWave = 0; S.inf.cleared = 0;
c.frame(16); assert.equal(ticks, 4, 'solo clock continues while waiting for a tap');
assert.equal(c.window.DKAPP.back(), true); c.openMenu();
assert.equal($('menu').classList.contains('hidden'), true, 'native back/background cannot open an inaccessible menu');
S.net = {}; c.frame(32); assert.equal(ticks, 8, 'multiplayer simulation keeps running');
S.net = null; S.phase = 'over'; c.updateBossReward(.01);
assert.equal(c.reward, null); assert.equal($('wrap').inert, false, 'leaving the run releases background input');
console.log('PASS equal thirds, busy/free guards, modal and movement priority, FIFO physical rewards, duplicate taps, multi-boss gold, final/full-board reward settlement, unchanged saved queue, frame clocks and native back');
