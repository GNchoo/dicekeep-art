// 기본 검사: 1~9 걷기, 10 보스 정지컷, 11 기존 로스터 폴백. 실패 시 종료 1.
// 각 걷기 프레임을 실제 애니메이션으로 기다린 뒤 잠시 정지해 확대 캡처한다.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl, outputPath, watchArtErrors } = require('./browser.cjs');
const { inspectWalkSheets, rowFailures } = require('./walk-jitter.js');

async function main() {
  const args = process.argv.slice(2), phone = args.includes('--phone');
  const waveArgs = args.filter(arg => arg !== '--phone');
  assert.ok(waveArgs.length <= 1, 'Usage: node inf-art-check.js [maxWave=11] [--phone]');
  const maxWave = Number(waveArgs[0] || 11);
  assert.ok(Number.isInteger(maxWave) && maxWave >= 11 && maxWave <= 101, 'maxWave must be 11..101 so W10 static boss and W11 fallback are always checked');
  const viewport = phone ? { width: 440, height: 956 } : { width: 1240, height: 860 };
  const browser = await launchBrowser();
  const report = { maxWave, viewport, loaded: [], waves: [], errors: [], failures: [] };
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    report.errors = watchArtErrors(page);
    await page.addInitScript(() => {
      localStorage.setItem('dk_coachDone', '1');
      localStorage.setItem('dk_infHelpSeen', '1');
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
    report.loaded = await page.evaluate(inspectWalkSheets);
    for (const row of report.loaded) {
      for (const failure of rowFailures(row)) report.failures.push(row.key + ': ' + failure);
    }
    await page.click('#ov-btn');
    await page.evaluate(() => { DK.muted = true; DKstartInf('clear'); DK.gold = 90000; DK.speed = 1; });
    await page.waitForFunction(() => DK.phase === 'playing');
    await page.evaluate(() => {
      const coach = document.getElementById('coach-skip'); if (coach) coach.click();
      const help = document.getElementById('help-close'); if (help) help.click();
    });

    for (let wave = 1; wave <= maxWave; wave++) {
      await page.evaluate(wave => {
        DK.paused = false; DK.enemies = []; DK.spawnQ = []; DK.waveActive = false; DK.wave = wave - 1; DK.autoT = 0;
        DKsync();
        document.getElementById('wave-btn').disabled = false;
      }, wave);
      await page.click('#wave-btn');
      await page.waitForFunction(() => DK.enemies.length > 0, null, { timeout: 15000 });
      await page.waitForFunction(() => DK.enemies[0] && DK.enemies[0].dist >= 220, null, { timeout: 20000 });
      const info = await page.evaluate(wave => {
        const inf = DKCONTENT.INFINITY, mon = inf.monsters[wave], enemy = DK.enemies[0];
        const boss = !!mon.boss, art = inf.art(wave, 0);
        const roster = inf.monsterFor(wave);
        const base = boss ? DKCONTENT.bossBases.find(base => base.id === inf.bossFor(inf.bossOrdinal(wave), 0).base) : roster.base;
        const scale = inf.sizeScale[roster.cls] || 1;
        const size = art ? (boss ? inf.artSizeBoss : inf.artSize)[mon.cls] : (scale === 1 ? base.size : Math.round(base.size * scale));
        const sprite = enemy.artWalk ? DKA[enemy.artWalk]?.[0] : DKA[enemy.art || enemy.sprite];
        let pixels = 0;
        if (sprite && sprite.cv && Number.isInteger(sprite.w) && Number.isInteger(sprite.h) && sprite.w > 0 && sprite.h > 0) {
          const data = sprite.cv.getContext('2d').getImageData(0, 0, sprite.w, sprite.h).data;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 28) pixels++;
        }
        return {
          wave: DK.wave, name: enemy.name, art: enemy.art, artWalk: enemy.artWalk, sprite: enemy.sprite,
          size: enemy.def.size, cls: enemy.sizeClass, move: enemy.move, boss: enemy.isBoss, elite: enemy.isElite,
          frames: enemy.artWalk ? DKA[enemy.artWalk]?.length : 0, fr: sprite ? [sprite.w, sprite.h] : null, pixels,
          face: enemy.face, animT: enemy.animT, dist: enemy.dist,
          ready: inf.artReady.has(wave) || inf.artReady.has(String(wave)),
          expected: {
            name: (enemy.isElite ? '정예 ' : '') + (art ? mon.name : base.name),
            art: wave <= 10 ? (boss ? 'infB' : 'infW') + wave : (art?.key || null),
            artWalk: wave <= 9 ? 'infW' + wave + 'Walk' : (art?.walkKey || null),
            cls: mon.cls, size: enemy.isElite ? Math.round(size * 1.2) : size,
            move: art && !boss ? mon.move : base.move, boss, sprite: base.sprite,
          },
        };
      }, wave);
      const failures = [];
      for (const key of ['wave', 'name', 'art', 'artWalk', 'size', 'cls', 'move', 'boss']) {
        const expected = key === 'wave' ? wave : info.expected[key];
        if (info[key] !== expected) failures.push(key + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(info[key]));
      }
      if (wave <= 10 && !info.ready) failures.push('required artReady wave is missing');
      if (wave === 11 && (info.ready || info.art !== null || info.artWalk !== null || info.sprite !== info.expected.sprite)) failures.push('W11 must use the original roster sprite with no infinity art');
      if (wave <= 9 && info.frames !== 4) failures.push('expected exactly 4 walking frames');
      if (!info.fr || !info.fr.every(n => Number.isFinite(n) && n > 0) || info.pixels <= 0) failures.push('rendered art is missing, empty or has invalid dimensions');
      if (![info.size, info.animT, info.dist].every(Number.isFinite)) failures.push('non-finite enemy state');
      console.log('w' + wave, JSON.stringify(info));

      // 입력한 animT로 그림을 강제하지 않고 정상 업데이트가 모든 프레임을 선택하는지 확인한다.
      const walking = info.artWalk && info.frames > 0;
      const shots = [], frameCount = walking ? info.frames : 1;
      const initial = await page.evaluate(() => ({ animT: DK.enemies[0].animT, dist: DK.enemies[0].dist }));
      for (let index = 0; index < frameCount; index++) {
        await page.evaluate(() => { DK.paused = false; });
        await page.waitForFunction(({ index, walking }) => {
          const enemy = DK.enemies[0];
          if (!enemy || !Number.isFinite(enemy.animT)) return false;
          if (enemy.hidden) return false; // 땅굴 몬스터는 지상에 나온 프레임으로 아트를 비교한다.
          if (walking && Math.floor(enemy.animT * 5) % DKA[enemy.artWalk].length !== index) return false;
          DK.paused = true;
          return true;
        }, { index, walking: !!walking }, { timeout: 10000 });
        // 정지 상태가 적어도 한 번 그려진 후 캡처한다.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const shot = await page.evaluate(() => {
          const enemy = DK.enemies[0], lane = DKLANES()[enemy.lane || 0];
          let pos = null;
          for (const segment of lane.segs) {
            if (enemy.dist > segment.acc + segment.len) continue;
            const t = Math.max(0, (enemy.dist - segment.acc) / segment.len);
            pos = { x: segment.ax + (segment.bx - segment.ax) * t, y: segment.ay + (segment.by - segment.ay) * t }; break;
          }
          if (!pos) { const segment = lane.segs[lane.segs.length - 1]; pos = { x: segment.bx, y: segment.by }; }
          const canvas = document.getElementById('game'), rect = canvas.getBoundingClientRect();
          return {
            x: rect.left + pos.x * rect.width / canvas.width, y: rect.top + pos.y * rect.height / canvas.height,
            face: enemy.face, hidden: enemy.hidden, animT: enemy.animT, dist: enemy.dist,
            frame: enemy.artWalk ? Math.floor(enemy.animT * 5) % DKA[enemy.artWalk].length : null,
          };
        });
        const filename = 'inf-w' + String(wave).padStart(2, '0') + '-' + (walking ? 'frame' + index : 'static') + '.png';
        const clipWidth = Math.min(340, viewport.width), clipHeight = Math.min(240, viewport.height);
        await page.screenshot({ path: outputPath(filename), clip: {
          x: Math.min(viewport.width - clipWidth, Math.max(0, shot.x - 200)),
          y: Math.min(viewport.height - clipHeight, Math.max(0, shot.y - 170)), width: clipWidth, height: clipHeight,
        } });
        shots.push({ ...shot, filename });
      }
      await page.screenshot({ path: outputPath('inf-w' + String(wave).padStart(2, '0') + '-wide.png') });
      await page.evaluate(() => { DK.paused = false; });
      await page.waitForFunction(initial => {
        const enemy = DK.enemies[0];
        return enemy && Number.isFinite(enemy.animT) && Number.isFinite(enemy.dist) && enemy.animT > initial.animT && enemy.dist > initial.dist;
      }, initial, { timeout: 5000 });
      if (walking && new Set(shots.map(shot => shot.frame)).size !== frameCount) failures.push('not all walking frames advanced naturally');
      report.waves.push({ ...info, shots, failures });
      report.failures.push(...failures.map(failure => 'W' + wave + ': ' + failure));
      console.log((failures.length ? 'FAIL' : 'PASS') + ' W' + wave + (wave === 10 ? ' static boss (no walking sheet)' : wave === 11 ? ' original-roster fallback' : '') + (failures.length ? ': ' + failures.join('; ') : ''));
    }
    if (report.errors.length || report.failures.length) throw new Error([...report.errors, ...report.failures].join('\n'));
    console.log('PASS W1–9 walking, W10 static boss, W11 fallback; no infinity-art load errors or pageerrors');
  } catch (error) {
    report.failures.push(error.message);
    throw error;
  } finally {
    fs.writeFileSync(outputPath('inf-art-check.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
}

main().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
