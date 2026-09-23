// Chapter presentation must advance in ten-wave blocks without silently
// changing the long-standing combat roster or the pure-luck balance curve.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const content = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), content, { filename: 'content.js' });
const INF = content.window.DKCONTENT.INFINITY;
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/pure-rules-55204fe.json'), 'utf8'));

// The manifest is generated as a single window assignment on line two. Parse
// only that assignment; evaluating the rest would need a browser canvas.
const artContext = { window: {} };
const manifestLine = fs.readFileSync(path.join(root, 'directional-art.js'), 'utf8').split(/\r?\n/)[1];
assert.match(manifestLine, /^window\.INF_DIRECTIONAL_ART = /);
vm.runInNewContext(manifestLine, artContext, { filename: 'directional-art.js:manifest' });
const approved = artContext.window.INF_DIRECTIONAL_ART.entries;
content.window.INF_DIRECTIONAL_ART = artContext.window.INF_DIRECTIONAL_ART;
const extremeContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'extreme-art.js'), 'utf8'), extremeContext, { filename: 'extreme-art.js' });
const extremeApproved = extremeContext.window.INF_EXTREME_ART.entries;
content.window.INF_EXTREME_ART = extremeContext.window.INF_EXTREME_ART;
require(path.join(root, 'infinity-art.js'));
const directions = globalThis.DKDirectionalArt;

assert.equal(INF.themeChapters.length, 10, 'ten distinct authored chapters');
assert.equal(new Set(INF.themeChapters.map(chapter => chapter.key)).size, 10, 'chapter keys are unique');
assert.equal(INF.extremeThemeChapters.length, 10, 'ten distinct extreme chapters');
for (const [kind, chapters] of [['first', INF.themeChapters], ['extreme', INF.extremeThemeChapters]]) {
  assert.equal(new Set(chapters.map(chapter => chapter.key)).size, 10, `${kind} chapter keys are unique`);
  for (const [i, chapter] of chapters.entries()) {
    assert.equal(typeof chapter.key, 'string', `${kind} chapter ${i + 1} key`);
    assert.ok(chapter.key.length > 0, `${kind} chapter ${i + 1} key is not empty`);
    assert.equal(typeof chapter.name, 'string', `${kind} chapter ${i + 1} name`);
    assert.ok(chapter.name.length > 0, `${kind} chapter ${i + 1} name is not empty`);
  }
}

const pad3 = n => String(n).padStart(3, '0');
let checkedWaves = 0;
for (let cycle = 0; cycle < 3; cycle++) {
  const first = cycle * 101 + 1;
  for (let chapterIndex = 0; chapterIndex < 10; chapterIndex++) {
    const chapter = (cycle === 0 ? INF.themeChapters : INF.extremeThemeChapters)[chapterIndex];
    const start = first + chapterIndex * 10, end = start + 9;
    for (let wave = start; wave <= end; wave++) {
      const theme = INF.themeFor(wave);
      assert.ok(theme, `W${wave} has a theme`);
      assert.equal(theme.key, chapter.key, `W${wave} chapter key`);
      assert.equal(theme.name, chapter.name, `W${wave} chapter name`);
      assert.equal(theme.index, chapterIndex + 1, `W${wave} chapter index`);
      assert.equal(theme.start, start, `W${wave} absolute chapter start`);
      assert.equal(theme.end, end, `W${wave} absolute chapter end`);
      assert.equal(theme.finale, false, `W${wave} is a normal chapter wave`);
      assert.equal(theme.bossWave, end, `W${wave} chapter boss boundary`);
      assert.ok(typeof theme.accent === 'string' && theme.accent.length > 0, `W${wave} accent`);
      assert.ok(typeof theme.summary === 'string' && theme.summary.length > 0, `W${wave} summary`);

      const slot = wave - first + 1, boss = slot % 10 === 0;
      assert.equal(INF.isBossWave(wave), boss, `W${wave} boss cadence`);
      // The chapter's actual displayed directional identity follows the
      // authored wave slot, even if its combat-stat donor is from elsewhere.
      const id = `${boss ? 'b' : 'w'}${pad3(slot)}`;
      const appearance = directions.decodeAppearance(directions.appearance(wave, false, false));
      assert.equal(directions.legacyAssetId(appearance), id, `W${wave} art resolves to ${id}`);
      const selected = cycle === 0 ? approved[id] : extremeApproved[appearance.assetId];
      assert.equal(selected?.ready, true, `W${wave} same-character art approved`);
      if (cycle === 0) assert.equal(INF.monsters[slot].tier, chapterIndex + 1, `W${wave} authored character belongs to chapter`);
      if (!boss) {
        const authoredName = cycle === 0 ? INF.monsters[slot].name : selected.name;
        assert.ok(authoredName && INF.monsterFor(wave).name.endsWith(authoredName), `W${wave} displays the authored character name`);
      }
      if (boss && INF.waveForMode(wave, 'extreme').bosses > 1) {
        const secondary = directions.decodeAppearance(directions.appearance(wave, true, false));
        assert.equal((cycle === 0 ? approved : extremeApproved)[secondary.assetId]?.ready, true, `W${wave} secondary boss keeps this chapter's art`);
      }
      checkedWaves++;
    }
  }
  const finaleWave = first + 100, finale = INF.themeFor(finaleWave);
  assert.ok(finale, `W${finaleWave} finale theme exists`);
  assert.equal(finale.index, 0, `W${finaleWave} finale index`);
  assert.equal(finale.finale, true, `W${finaleWave} finale flag`);
  assert.equal(finale.start, finaleWave, `W${finaleWave} finale start`);
  assert.equal(finale.end, finaleWave, `W${finaleWave} finale end`);
  assert.equal(finale.bossWave, null, `W${finaleWave} is not a boss wave`);
  assert.ok(typeof finale.key === 'string' && finale.key.length > 0, `W${finaleWave} finale key`);
  assert.ok(typeof finale.name === 'string' && finale.name.length > 0, `W${finaleWave} finale name`);
  assert.equal(INF.isBossWave(finaleWave), false, `W${finaleWave} existing finale encounter preserved`);
  const appearance = directions.decodeAppearance(directions.appearance(finaleWave, false, false));
  assert.equal(directions.legacyAssetId(appearance), 'w101', `W${finaleWave} finale art identity`);
  assert.equal((cycle === 0 ? approved : extremeApproved)[appearance.assetId]?.ready, true, `W${finaleWave} finale art approved`);
}

// This immutable fixture predates cosmetic/presentation revisions. Compare
// mechanical fields only, without recapturing it from the current code.
const physicalBase = base => base && Object.fromEntries(
  ['id', 'hp', 'speed', 'gold', 'dmg', 'size', 'move'].map(key => [key, base[key] ?? null])
);
const mechanical = monster => ({
  boss: !!monster.boss,
  base: physicalBase(monster.base),
  cls: monster.cls,
  move: monster.move ?? null,
  tank: !!monster.tank,
  count: monster.count,
  armor: monster.armor,
  hpMult: monster.hpMult ?? null,
});
for (let wave = 1; wave <= 101; wave++) {
  const before = fixture.waves[wave - 1];
  assert.deepEqual(JSON.parse(JSON.stringify(INF.waveForMode(wave, 'clear'))), before.values, `W${wave} pure-luck numbers unchanged`);
  assert.deepEqual(mechanical(INF.monsterFor(wave)), mechanical(before.monster), `W${wave} donor/combat contract unchanged`);
}

console.log(`PASS 10-wave chapter themes: ${checkedWaves} chapter waves, 3 finales, 101 immutable combat projections`);
