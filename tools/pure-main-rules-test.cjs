// Whole 101-wave rule table frozen from the user's completed main, alongside
// the browser trace fixture. This compares real data/functions, not copied formulas.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), fixture = path.join(__dirname, 'fixtures/pure-rules-55204fe.json');
function read(name, reference) {
  return reference ? execFileSync('git', ['show', '55204fe:' + name], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, name), 'utf8');
}
function inspect(reference) {
  const c = { window: {} }; vm.runInNewContext(read('content.js', reference), c);
  const C = c.window.DKCONTENT, INF = C.INFINITY, s = read('game.js', reference), t = {};
  vm.runInNewContext(s.slice(s.indexOf('const TOWER_DEFS ='), s.indexOf('const ENEMY_DEFS =')) + '\nresult={TOWER_DEFS,LVL_DMG,LVL_RANGE,LVL_RATE};', t);
  const table = { config: { ...INF, modes: { clear: INF.modes.clear } }, power: C.DICE_POWER, towers: t.result,
    waves: Array.from({ length: 101 }, (_, i) => ({ wave: i + 1, values: INF.wave(i + 1, true), monster: INF.monsterFor(i + 1) })) };
  // 무손실 WebP 변환 이후 src/walkSrc 의 확장자가 .webp 가 된다. 이 픽스처는
  // git show 55204fe: 로 읽는 영구 동결본이라 재캡처가 구조적으로 불가능하므로,
  // 비교 직전에 **끝 확장자만** 되돌린다 (JSON 안에서 경로는 " 나 ?v= 로 끝난다).
  // 파일 stem 과 ?v= 핀은 건드리지 않으므로 자산 재배선·리비전 변경은 여전히 잡힌다.
  const json = JSON.stringify(table);
  return JSON.parse(reference ? json : json.replace(/\.webp(?=["?])/g, '.png'));
}
if (process.argv.includes('--capture-reference')) fs.writeFileSync(fixture, JSON.stringify(inspect(true), null, 2) + '\n');
// The frozen 55204fe file predates character art, ten-wave theme names and
// player-facing tower copy. Keep it immutable, and compare combat mechanics
// instead of treating those presentation fields as balance changes.
function mechanical(table) {
  const config = { ...table.config };
  for (const key of ['themeChapters', 'extremeThemeChapters', 'monsters', 'tiers', 'palette', 'artReady', 'artSize', 'artSizeBoss', 'roster', 'pureRounds']) delete config[key];
  const towers = { ...table.towers, TOWER_DEFS: Object.fromEntries(
    Object.entries(table.towers.TOWER_DEFS).map(([face, original]) => {
      const tower = { ...original };
      for (const key of ['name', 'desc', 'color', 'topper', 'rainbow']) delete tower[key];
      return [face, tower];
    })) };
  const waves = table.waves.map(({ wave, values, monster }) => {
    const base = monster.base && Object.fromEntries(['id', 'hp', 'speed', 'gold', 'dmg', 'size', 'move'].map(key => [key, monster.base[key] ?? null]));
    return { wave, values, monster: { boss: !!monster.boss, base, cls: monster.cls, move: monster.move ?? null,
      tank: !!monster.tank, count: monster.count, armor: monster.armor, hpMult: monster.hpMult ?? null } };
  });
  return { config, power: table.power, towers, waves };
}
const current = mechanical(inspect(false)), reference = mechanical(JSON.parse(fs.readFileSync(fixture, 'utf8')));
assert.deepEqual(current, reference);
console.log('PASS main 55204fe pure-luck combat: 101-wave stats, economy/odds, 20 tower rules and power table');
