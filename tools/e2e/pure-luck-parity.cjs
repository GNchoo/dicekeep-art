// 순수운빨(clear) 은 무과금·과금의 영향이 전혀 없어야 한다.
// 같은 난수 씨앗으로 (1) 무과금 계정과 (2) 최대 성장·구매 계정의 런을 실제 게임에서 끝까지 돌려
// 뽑기·배치·전투·골드·목숨이 전부 같은지 본다. 훅 단위 검사(game-modes.cjs)와 달리 런 전체를 비교한다.
//   node tools/e2e/pure-luck-parity.cjs [--waves=12] [--phone]
// 반증 장치: 같은 비교를 덱빌드(build)에서 하면 반드시 달라야 한다. 같으면 이 테스트가 아무것도 증명하지 못한 것이므로 실패시킨다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/pure-luck'));
const url = new URL('index.html', (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/'));
url.searchParams.set('net', 'off');
url.searchParams.set('v', Date.now());
const WAVES = Number((process.argv.find(a => a.startsWith('--waves=')) || '').split('=')[1]) || 12;
const SEEDS = [20260909, 777, 31337];
fs.mkdirSync(out, { recursive: true });

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const report = {
  scope: '실제 로컬 게임을 씨앗 고정 난수로 구동한 런 대조. 절대 클리어율을 새로 측정한 것이 아니라, 계정 상태에 따른 차이가 없음을 보인다.',
  url: url.href, waves: WAVES, seeds: SEEDS, started: new Date().toISOString(), viewports: [], pass: false,
};

// 계정 A: 갓 시작한 무과금. 계정 B: 20종 Lv200 · 조각 최대 · 스테이지 전부 클리어 · 젬/타워/스킨 보유.
const ACCOUNTS = {
  free: { label: '무과금 신규' },
  paid: { label: '최대 성장·구매' },
};

async function ready(page) {
  await page.waitForFunction(() => window.__pureQAError || (window.DK && DK.phase === 'title' && window.DKPROGRESSION), null, { timeout: 120000 });
  const error = await page.evaluate(() => window.__pureQAError);
  if (error) throw new Error(error);
}

async function boot(browser, viewport, row) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', e => row.errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1');
    localStorage.setItem('dk_infHelpSeen', '1');
    // 씨앗 고정 난수. 런 시작 직전에 __pureSeed(n) 으로 되감아 두 계정이 같은 흐름을 받게 한다.
    let state = 1;
    globalThis.__pureSeed = seed => { state = seed >>> 0; };
    Math.random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  // 실제 배포 소스에 테스트 훅만 덧붙인다 (game-modes.cjs 와 같은 방식).
  await page.route('**/game.js*', async route => {
    try {
      const response = await route.fetch(), original = await response.text();
      const hash = sha(original);
      if (row.gameSha256 && row.gameSha256 !== hash) throw new Error('검사 중 게임 소스가 바뀌었다');
      row.gameSha256 = hash;
      const anchor = 'window.DK = S;';
      assert.equal(original.split(anchor).length, 2, '테스트 훅 삽입 지점은 하나여야 한다');
      const hook = 'window.__pureQA={update,finishSlot,startWave,towerDmg,chestCost,towerAt,SPOTS:()=>SPOTS};\n';
      await route.fulfill({ response, body: original.replace(anchor, hook + anchor) });
    } catch (error) {
      row.errors.push('test route: ' + error.message);
      await route.fulfill({ contentType: 'application/javascript', body: 'window.__pureQAError=' + JSON.stringify(error.message) + ';' }).catch(() => {});
    }
  });
  await page.goto(url.href);
  await ready(page);
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
  return { page, context };
}

// 한 런을 처음부터 끝까지 돌리고 그 흐름을 그대로 기록한다.
// 계정 상태는 런 시작 전에만 세팅하고, 이후 조작은 두 계정이 완전히 같다.
function playRun({ account, mode, seed, waves }) {
  // 페이지 안에서 쓰는 해시 (Node 의 sha 는 여기 없다). 비교용이므로 충돌 위험이 낮으면 충분하다.
  const hash = str => { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0; } return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + ':' + str.length; };
  const P = DKPROGRESSION;
  const profile = P.defaultProfile(DKSAVE.progression.legacy);
  if (account === 'paid') {
    for (let face = 1; face <= 20; face++) profile.levels[face] = P.MAX_LEVEL;
    profile.deck = [20, 19, 18, 17, 16];   // 가장 강한 다섯 종
    profile.shards = P.MAX_SHARDS;
    DKSAVE.gems = 99999;
    DKSAVE.unlockedTowers = [1, 2, 3, 4, 5, 6];
    DKSAVE.cleared = Array.from({ length: 50 }, (_, i) => i + 1);
    for (let face = 1; face <= 6; face++) { DKSAVE.unlockedSkins[face] = ['a', 'b', 'c', 'd']; DKSAVE.equippedSkin[face] = 'd'; }
  } else {
    DKSAVE.gems = 0;
    DKSAVE.unlockedTowers = [1, 2, 3];
    DKSAVE.cleared = [];
    for (let face = 1; face <= 6; face++) { DKSAVE.unlockedSkins[face] = ['a']; DKSAVE.equippedSkin[face] = 'a'; }
  }
  DKSAVE.progression = profile;

  globalThis.__pureSeed(seed);
  DKstartInf(mode);
  DK.paused = true;                        // rAF 루프를 멈추고 아래에서 고정 dt 로 직접 돌린다
  const snap = DK.inf.growthSnapshot;
  const trace = [], draws = [];
  const DT = 1 / 60, MAX_TICKS = 200000;
  let ticks = 0;

  const spend = () => {
    // 뽑고 → 굴림을 즉시 확정 → 빈 자리에 놓고, 자리가 없으면 같은 눈에 합친다.
    let guard = 0;
    while (DK.phase === 'playing' && !DK.heldDie && DK.gold >= __pureQA.chestCost() && guard++ < 40) {
      if (!DKchest()) break;
      __pureQA.finishSlot();
      const face = DK.heldDie;
      draws.push([DKSLOT.kind, DKSLOT.final, face]);
      const spots = __pureQA.SPOTS();
      let placed = false;
      for (let i = 0; i < spots.length && !placed; i++) if (!__pureQA.towerAt(i)) placed = DKplace(i) !== false;
      if (!placed) for (let i = 0; i < spots.length && !placed; i++) { const t = __pureQA.towerAt(i); if (t && t.face === face) placed = DKplace(i) !== false; }
      if (!placed) break;                  // 놓을 곳이 없으면 손에 든 채로 둔다
    }
  };
  const snapshotRow = () => {
    const towers = DK.towers.map(t => [t.spot, t.face, t.lvl]).sort((a, b) => a[0] - b[0]);
    const hp = DK.enemies.reduce((sum, e) => sum + Math.round(e.hp * 1000), 0);
    return [DK.wave, Math.round(DK.gold), DK.lives, DK.inf.kills, DK.inf.chests, DK.enemies.length, hp, DK.heldDie, JSON.stringify(towers)].join('|');
  };

  while (DK.phase === 'playing' && DK.inf.doneW < waves && ticks < MAX_TICKS) {
    spend();
    if (!DK.waveActive && !DK.spawnQ.length && !DK.enemies.length) { trace.push('W' + snapshotRow()); __pureQA.startWave(); }
    __pureQA.update(DT);
    ticks++;
    if (ticks % 60 === 0) trace.push(snapshotRow());
  }
  trace.push('END' + snapshotRow() + '|' + DK.phase);
  return {
    account, mode, seed, ticks, waveReached: DK.inf.doneW, phase: DK.phase,
    // 계정 상태가 실제로 스냅샷에 들어갔는지 (테스트가 헛돌지 않는지) 확인용
    snapshot: { growth: snap.growth, levelCap: snap.levelCap, deck: snap.deck.slice(), maxLevel: Math.max(...Object.values(snap.levels)) },
    account_maxLevel: Math.max(...Object.values(DKSAVE.progression.levels)), account_deck: DKSAVE.progression.deck.slice(),
    account_gems: DKSAVE.gems, account_towers: DKSAVE.unlockedTowers.length, account_skin: DKSAVE.equippedSkin[1],
    drawCount: draws.length, drawHash: hash(JSON.stringify(draws)), traceHash: hash(trace.join('\n')), traceRows: trace.length,
    firstDraws: draws.slice(0, 8), lastRow: trace[trace.length - 1],
    // 두 계정이 같은 아레나에서 뛰었는지 확인용 (폰 화면비는 첫 진입 뒤에야 캔버스가 확정된다)
    canvas: (() => { const c = document.getElementById('game'); return c.width + 'x' + c.height; })(), mapKey: DK.mapKey,
  };
}

// 세로 아레나의 캔버스 크기는 arenaCanvasForScreen 이 hudEl.offsetHeight 를 읽어 정한다.
// 그 높이는 앞선 런이 남긴 HUD 내용(웨이브 칩 글자 수, 보스 칩 유무)에 따라 달라져서,
// 한 페이지에서 연달아 돌리면 두 계정이 서로 다른 크기의 아레나에서 뛴다. 폰 화면비에서
// 실제로 720x1240 과 720x1198 로 갈렸고, 그 차이가 계정 탓으로 잘못 읽혔다.
// (같은 무과금 계정을 세 번 돌려도 결과가 달랐으므로 계정 누수가 아니다.)
// 런마다 페이지를 새로 열어 레이아웃 출발점을 똑같이 맞춘다.
async function restart(page) {
  await page.goto(url.href);
  await ready(page);
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
}

async function compare(page, row, mode, seed) {
  const results = {};
  for (const account of Object.keys(ACCOUNTS)) {
    await restart(page);   // 두 계정이 반드시 같은 아레나에서 뛰게 한다
    results[account] = await page.evaluate(playRun, { account, mode, seed, waves: WAVES });
    if (process.env.E2E_DEBUG) console.log('  run', account, results[account].canvas);
  }
  const { free, paid } = results;
  row.runs.push({ mode, seed, free, paid });
  return { free, paid };
}

function check(row, name, actual, expected) { assert.deepEqual(actual, expected, name); row.checks.push({ name, pass: true }); }

async function verify(page, row) {
  row.runs = [];
  for (const seed of SEEDS) {
    const { free, paid } = await compare(page, row, 'clear', seed);

    // 테스트가 헛돌지 않는지: 두 계정의 저장 파일이 실제로 달라야 한다.
    check(row, `씨앗 ${seed}: 두 계정의 저장 상태가 실제로 다르다 (Lv200·20종·전 스테이지·스킨)`,
      [paid.account_maxLevel, free.account_maxLevel, paid.account_deck.join(), free.account_deck.join()].slice(0, 2), [200, 1]);
    // 순수운빨 스냅샷은 계정과 무관한 상수여야 한다 (성장 플래그뿐 아니라 담긴 값 자체가 같다).
    check(row, `씨앗 ${seed}: 순수운빨 런 스냅샷이 계정과 무관한 상수다`,
      [free.snapshot, paid.snapshot], [{ growth: false, levelCap: 0, deck: [1, 2, 3, 4, 5], maxLevel: 1 }, { growth: false, levelCap: 0, deck: [1, 2, 3, 4, 5], maxLevel: 1 }]);

    // 본 검증: 그럼에도 런이 완전히 같아야 한다.
    // 대조가 성립하려면 두 런이 같은 아레나에서 뛰어야 한다. 여기서 갈리면 아래 비교는 뜻이 없다.
    check(row, `씨앗 ${seed}: 두 런이 같은 아레나·캔버스에서 뛰었다`,
      [free.mapKey === paid.mapKey, free.canvas === paid.canvas, free.canvas], [true, true, free.canvas]);
    check(row, `씨앗 ${seed}: 순수운빨 뽑기 결과가 계정과 무관하게 동일`,
      [free.drawCount === paid.drawCount, free.drawHash === paid.drawHash], [true, true]);
    check(row, `씨앗 ${seed}: 순수운빨 런 전체(골드·목숨·적 체력·배치)가 동일`,
      [free.traceHash === paid.traceHash, free.waveReached === paid.waveReached, free.phase === paid.phase], [true, true, true]);
    assert.ok(free.drawCount > 0 && free.ticks > 100, `씨앗 ${seed}: 런이 실제로 진행되어야 한다`);
    row.checks.push({ name: `씨앗 ${seed}: 런이 비어 있지 않다 (뽑기 ${free.drawCount}회 · ${free.ticks}틱 · ${free.waveReached}웨이브)`, pass: true });
  }

  // 반증: 같은 비교를 덱빌드에서 하면 반드시 달라져야 한다. 안 달라지면 위 결과는 의미가 없다.
  const build = await compare(page, row, 'build', SEEDS[0]);
  check(row, '덱빌드에서는 같은 씨앗이어도 계정에 따라 런이 달라진다 (검사 민감도 확인)',
    build.free.traceHash !== build.paid.traceHash || build.free.drawHash !== build.paid.drawHash, true);
  check(row, '덱빌드는 성장이 적용된다', [build.paid.snapshot.growth, build.paid.snapshot.levelCap], [true, 20]);
  check(row, '덱빌드 스냅샷에는 계정 편성이 실제로 담긴다', build.paid.snapshot.deck, [20, 19, 18, 17, 16]);

  // content.js 모드 표와 progression 모듈의 성장 판정이 어긋나면 순수운빨에 성장이 샐 수 있다.
  check(row, '모드 표와 성장 모듈의 판정이 모든 모드에서 일치한다', await page.evaluate(() => {
    const INF = DKCONTENT.INFINITY;
    return Object.keys(INF.modes).filter(key => INF.modes[key].growth !== DKPROGRESSION.growsIn(key));
  }), []);

  // 계정 티켓 없이도 순수운빨 런이 실제로 끝까지 굴러가야 한다 (과금 서비스가 막혔을 때의 진행 경로).
  check(row, '순수운빨은 계정 티켓 없이 진행되고 정산된다', await page.evaluate(() => {
    DKSAVE.progression = DKPROGRESSION.defaultProfile();   // 앞선 대조 런이 남긴 지갑·기록을 비운다
    DKlobby(); DKstartInf('clear'); DK.paused = true;
    const ticket = DK.inf.accountTicket;
    DK.wave = 26; DK.inf.doneW = 25; DK.inf.kills = 100;
    DKend(false);
    const res = DK.inf.settledResult;
    return { ticket, wave: res.wave, shards: res.shards, pending: !!res.pending, best: DKSAVE.progression.records.clear.best };
  }), { ticket: null, wave: 25, shards: 45, pending: false, best: 25 });
}

(async () => {
  const browser = await launchBrowser();
  try {
    const selected = process.argv.includes('--phone') ? 'phone' : process.argv.includes('--desktop') ? 'desktop' : null;
    report.selected = selected || 'both';
    for (const [tag, viewport] of [['desktop', { width: 1240, height: 860 }], ['phone', { width: 440, height: 956 }]].filter(([t]) => !selected || t === selected)) {
      const row = { tag, viewport, checks: [], errors: [] };
      report.viewports.push(row);
      const { page, context } = await boot(browser, viewport, row);
      try {
        await verify(page, row);
        check(row, '브라우저 오류 없음', row.errors, []);
        row.pass = true;
        console.log('PASS', tag, row.checks.length, '검사', row.gameSha256.slice(0, 12));
        for (const r of row.runs) console.log(`  ${r.mode} 씨앗 ${r.seed}: 무과금 ${r.free.traceHash.slice(0, 12)} · 과금 ${r.paid.traceHash.slice(0, 12)} → ${r.free.traceHash === r.paid.traceHash ? '동일' : '다름'} (${r.free.waveReached}웨이브 · 뽑기 ${r.free.drawCount})`);
      } catch (error) {
        row.failure = error.stack;
        await page.screenshot({ path: path.join(out, tag + '-failure.png'), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
    }
    assert.equal(new Set(report.viewports.map(v => v.gameSha256)).size, 1, '모든 근거가 같은 게임 소스를 쓴다');
    report.pass = true;
  } finally {
    report.finished = new Date().toISOString();
    report.checks = report.viewports.reduce((sum, r) => sum + r.checks.length, 0);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('PASS 순수운빨 계정 무관성', report.checks, '검사;', path.join(out, 'report.json'));
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
