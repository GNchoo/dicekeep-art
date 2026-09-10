/* 캐주얼 킹덤러쉬/랜덤다이스 톤 — 아트팩 + 100스테이지 데이터 */
window.DKCONTENT = (function () {
  // ===== 테마 + 그리드 타일 맵 =====
  // 배경 그림에 좌표를 맞추던 방식은 폐기했다. 맵은 16×9 칸(64px) ASCII 템플릿으로 코드가 설계하고,
  // 테마별 타일(바닥·도로 질감·물 질감·석단·시작·도착·소품)을 그 위에 입힌다. 타일이 없으면 game.js 가 코드로 그린다.
  const TILE = 64, GW = 16, GH = 9;
  // 타일 에셋 파일명 (casual/tiles/<theme>/<name>.png, floor 만 .jpg). 키는 tl_<theme>_<name>.
  // 도로·물은 이음새 없는 '질감' 1장씩만 받는다 — 길 모양·폭·코너·합류는 코드가 그린다 (생성 모델이 기하를 못 지키므로).
  const TILE_ASSETS = ['floor', 'road', 'water', 'pad', 'start', 'end', 'prop-1', 'prop-2', 'prop-3', 'prop-4', 'prop-5', 'prop-6'];
  const THEMES = [
    { id: 'plains',     name: '평원',     stages: [1, 8],   floor: ['#93c85e', '#6fa843'], road: [186, 146, 92],  water: '#4f9fd8', propA: '#3f8a36', propB: '#2c6528', rock: '#928c80', glow: '#ffe28a' },
    { id: 'forest',     name: '숲',       stages: [9, 16],  floor: ['#5f9a3e', '#3f7229'], road: [160, 124, 80],  water: '#3f8fc4', propA: '#2f6f2a', propB: '#1f4d1c', rock: '#7d7a70', glow: '#c8ff9a' },
    { id: 'lake',       name: '호수',     stages: [17, 25], floor: ['#8fbf62', '#6a9d47'], road: [196, 168, 118], water: '#3b9ad9', propA: '#5a9a48', propB: '#3b6f30', rock: '#9aa0a8', glow: '#a8e4ff' },
    { id: 'darkforest', name: '어두운 숲', stages: [26, 33], floor: ['#3e5a3a', '#243824'], road: [120, 96, 70],   water: '#2c5a6e', propA: '#1f3a22', propB: '#122415', rock: '#5c5a58', glow: '#b48cff' },
    { id: 'castle',     name: '성',       stages: [34, 42], floor: ['#a8a39a', '#7f7a72'], road: [150, 140, 128], water: '#4a86b8', propA: '#5e6a5a', propB: '#3e4a3c', rock: '#6f6a64', glow: '#ffd452' },
    { id: 'hell',       name: '지옥',     stages: [43, 50], floor: ['#5a2f28', '#2e1612'], road: [92, 60, 52],    water: '#ff6a1a', propA: '#4a2a26', propB: '#2a1412', rock: '#3c2c28', glow: '#ff7a3a' },
  ];
  const themeForStage = (n) => THEMES.find((t) => n >= t.stages[0] && n <= t.stages[1]) || THEMES[0];
  // 스테이지 이름 (테마별)
  const STAGE_NAMES = {
    plains: ['꽃초원', '바람언덕', '양떼목장', '해바라기밭', '풍차마을', '밀밭길', '개울가', '노을평원'],
    forest: ['숲어귀', '도토리숲', '이끼바위숲', '버섯골', '반딧불숲', '고목의 숲', '안개숲', '숲지기의 길'],
    lake: ['호숫가', '갈대습지', '징검다리', '낚시터', '연꽃호수', '물안개섬', '폭포호', '수달의 강', '잔잔한 만'],
    darkforest: ['어스름숲', '가시덤불', '늑대굴', '거미숲', '죽은나무골', '마녀의 오두막길', '검은늪', '달없는 숲'],
    castle: ['성문 앞', '외성벽', '해자길', '병영터', '대성당길', '왕의 정원', '망루의 길', '내성', '왕좌의 뜰'],
    hell: ['잿빛 황무지', '유황길', '용암강', '해골평원', '불의 협곡', '악마의 문', '심연의 다리', '지옥의 왕좌'],
  };

  // ----- 맵 템플릿 (16열 × 9행) -----
  // . 평지  # 흙길  S 시작(포탈)  E 도착(성/크리스탈)  2 두 번째 길 시작  = 두 번째 길(티어 4·5 에서만 열림)
  // ~ 물(석단·소품 금지)  T 큰 소품 고정  x 석단·소품 금지  o 석단 강제(선택; 보통은 아래 규칙으로 자동 배치)
  // 길 규칙: 흙길은 4방향으로 이어진 한 줄(옆 줄과 붙지 않게 한 칸 띄움), E 위 칸은 비워 둔다(성 그림 자리), 두 번째 길은 흙길 한 칸에만 닿는다.
  // 설계 지침 (2026-09-02, 사용자 피드백 반영):
  //  1. 석단은 "길을 얼마나 많이 덮느냐"로 고른다 — 꺾이는 안쪽, 길이 두세 면으로 감싸는 칸이 최우선. 길에서 떨어진 칸에는 석단을 두지 않는다.
  //  2. 길은 자주 꺾어 안쪽 칸이 많이 생기게 짠다 (S자·U자·지그재그). 긴 직선은 석단 가치가 낮다.
  //  3. 석단끼리는 붙이지 않는다(대각선 포함 한 칸 이상 띄움) → 사거리가 겹치지 않고 골고루 퍼진다.
  //  4. 소품(나무·바위)은 길과 석단을 절대 가리지 않는다 — 길·석단 옆 칸 금지, 키 큰 소품은 위쪽 두 칸에 길·석단이 있으면 금지 (game.js buildTileLayer).
  //  5. 화면 맨 윗줄과 왼쪽 위(HUD 칩 자리)에는 석단을 두지 않는다. 포탈·성 주변 한 칸도 비운다.
  // editor.html 에서 칠해서 만들고 문자열을 여기에 붙여넣는다.
  const TEMPLATES_SINGLE = [
  [ // A 완만한 S (짧음)
    '................',
    '................',
    'S###....###.....',
    '...#....#.#.....',
    '...####.#.#.....',
    '......#.#.####E.',
    '......###.......',
    '................',
    '................'],
  [ // B 위로 돌아 내려오기
    '................',
    '................',
    '...########.....',
    '...#......#.....',
    'S###......#.....',
    '..........###...',
    '............#...',
    '............###E',
    '................'],
  [ // C 지그재그 (가운데 호수)
    '................',
    'S#..............',
    '.#..............',
    '.####..~~...###E',
    '....#.~~~~..#...',
    '....#..~~...#...',
    '....######..#...',
    '.........####...',
    '................'],
  [ // D 왼쪽 위에서 내려와 오른쪽 위로
    '..S.............',
    '..#.............',
    '..#.............',
    '..####..........',
    '.....#..#####...',
    '.....#..#...#...',
    '.....####...#...',
    '............#E..',
    '................'],
  [ // E 위아래 두 번 꺾는 긴 길
    '................',
    'S####...........',
    '....#..#####....',
    '....#..#...#....',
    '....####...#....',
    '...........#....',
    '...........####E',
    '................',
    '................'],
  [ // F 아래에서 시작해 오른쪽 위 성으로
    '................',
    '................',
    '........####....',
    '........#..#....',
    '....#####..###E.',
    '....#...........',
    'S####...........',
    '................',
    '................'],
  ];
  const TEMPLATES_DUAL = [
  [ // G 두 갈래가 가운데서 합류
    '................',
    'S###............',
    '...#............',
    '...####...####E.',
    '......#...#.....',
    '......#...#.....',
    '......#####.....',
    '......=.........',
    '2======.........'],
  [ // H 위·아래에서 들어와 오른쪽 성 앞 합류
    'S###............',
    '...#............',
    '...####.........',
    '......#......#E.',
    '......#......#..',
    '......####...#..',
    '.........#####..',
    '.........=......',
    '2=========......'],
  [ // I 큰 U자 + 지름길
    '................',
    'S####...........',
    '....#...........',
    '....#..######...',
    '....#..#....#...',
    '....####....#...',
    '..........==#...',
    '..........=.###E',
    '......2====.....'],
  [ // J 지그재그 두 번 + 아래에서 올라오는 지름길
    'S###............',
    '...#..#####.....',
    '...#..#...#.....',
    '...####...####E.',
    '............=...',
    '.~~......====...',
    '.~~......=......',
    '.....=====......',
    '..2===..........'],
  [ // K 계단식 꺾임 + 아래 긴 지름길 (호수)
    '................',
    'S##.............',
    '..#...####..~~..',
    '..###.#..#..~~..',
    '....#.#..#......',
    '....###..####...',
    '............#...',
    '............###E',
    '..2==========...'],
  [ // L 위에서 내려오는 두 길, 고리 두 번
    '....S...2.......',
    '....#...=.......',
    '..###.#####.....',
    '..#...#...#.....',
    '..#####...#..~~.',
    '........###..~~.',
    '........#.......',
    '........#####E..',
    '................'],
  ];
  // 그리드 → 레이아웃. 픽셀 좌표는 칸 중심.
  const cellCenter = (r, c) => [c * TILE + TILE / 2, r * TILE + TILE / 2];
  function buildGridLayout(rows, mirror) {
    const grid = rows.map((row) => (mirror ? row.split('').reverse() : row.split('')));
    const find = (ch) => { for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (grid[r][c] === ch) return [r, c]; return null; };
    const nb = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < GH && b >= 0 && b < GW);
    const isMain = (ch) => ch === '#' || ch === 'S' || ch === 'E';
    const isSec = (ch) => ch === '2' || ch === '=';
    const bfs = (from, to, ok) => {
      if (!from || !to) return null;
      const key = (p) => p[0] * GW + p[1];
      const prev = new Map([[key(from), null]]);
      const q = [from];
      while (q.length) {
        const p = q.shift();
        if (p[0] === to[0] && p[1] === to[1]) break;
        for (const n of nb(p[0], p[1])) {
          if (!ok(grid[n[0]][n[1]]) || prev.has(key(n))) continue;
          prev.set(key(n), p); q.push(n);
        }
      }
      if (!prev.has(key(to))) return null;
      const out = []; let p = to;
      while (p) { out.unshift(p); p = prev.get(key(p)); }
      return out;
    };
    // 칸 중심을 잇되 꺾이는 칸은 모서리를 깎아 곡선처럼 돈다 (도로 타일의 둥근 모서리와 맞춤)
    const toPoly = (cells) => {
      if (!cells) return null;
      const pts = [];
      for (let i = 0; i < cells.length; i++) {
        const cur = cellCenter(cells[i][0], cells[i][1]);
        const prev = i > 0 ? cellCenter(cells[i - 1][0], cells[i - 1][1]) : null;
        const next = i < cells.length - 1 ? cellCenter(cells[i + 1][0], cells[i + 1][1]) : null;
        if (prev && next && prev[0] !== next[0] && prev[1] !== next[1]) {
          pts.push([Math.round(cur[0] + (prev[0] - cur[0]) * 0.36), Math.round(cur[1] + (prev[1] - cur[1]) * 0.36)]);
          pts.push([Math.round(cur[0] + (next[0] - cur[0]) * 0.36), Math.round(cur[1] + (next[1] - cur[1]) * 0.36)]);
        } else pts.push([Math.round(cur[0]), Math.round(cur[1])]);
      }
      return pts;
    };
    const S = find('S'), E = find('E'), S2 = find('2');
    const mainCells = bfs(S, E, isMain);
    const secCells = S2 ? bfs(S2, E, (ch) => isMain(ch) || isSec(ch)) : null;
    const water = [], props = [], forced = [];
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      const ch = grid[r][c];
      if (ch === '~') water.push([r, c]);
      else if (ch === 'T') props.push([r, c]);
      else if (ch === 'o') forced.push([r, c]);
    }
    // ----- 석단 자동 배치: 길 커버리지 점수 -----
    const road = new Set();
    for (const cell of (mainCells || [])) road.add(cell[0] * GW + cell[1]);
    for (const cell of (secCells || [])) road.add(cell[0] * GW + cell[1]);
    const isRoad = (r, c) => r >= 0 && r < GH && c >= 0 && c < GW && road.has(r * GW + c);
    const gates = [S, E, S2].filter(Boolean);
    const nearGate = (r, c) => gates.some(([gr, gc]) => Math.abs(gr - r) <= 1 && Math.abs(gc - c) <= 1) || (E && r === E[0] - 2 && c === E[1]);
    const RANGE = 2.4; // 타워 사거리 ≈ 135~175px ≈ 2.1~2.7 칸
    const scoreOf = (r, c) => {
      let orth = 0, diag = 0, cover = 0;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (isRoad(r + dr, c + dc)) orth++;
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) if (isRoad(r + dr, c + dc)) diag++;
      if (orth + diag === 0) return -1; // 길에 붙지 않은 칸은 석단 후보가 아니다
      for (let rr = r - 3; rr <= r + 3; rr++) for (let cc = c - 3; cc <= c + 3; cc++) if (isRoad(rr, cc) && Math.hypot(rr - r, cc - c) <= RANGE) cover++;
      return cover + orth * 1.5 + diag * 0.5;
    };
    const cands = [];
    for (let r = 1; r < GH; r++) for (let c = 0; c < GW; c++) {
      const ch = grid[r][c];
      if (ch !== '.' && ch !== 'o') continue;
      if (r === 1 && c <= 6) continue;      // HUD 칩(골드·목숨·웨이브) 자리
      if (nearGate(r, c)) continue;         // 포탈·성 그림 자리
      const sc = scoreOf(r, c);
      if (sc < 0) continue;
      cands.push({ r, c, sc });
    }
    cands.sort((a, b) => b.sc - a.sc || a.r - b.r || a.c - b.c);
    const picked = [];
    const farEnough = (r, c) => picked.every((p) => Math.max(Math.abs(p.r - r), Math.abs(p.c - c)) >= 2);
    for (const f of forced) picked.push({ r: f[0], c: f[1] });
    for (const cd of cands) if (farEnough(cd.r, cd.c) && !picked.some((p) => p.r === cd.r && p.c === cd.c)) picked.push(cd);
    // 2차: 후보가 티어 5 기준(7+8)에 못 미치면 대각선 이웃까지 허용해 점수 순으로 보충 (상하좌우로 붙는 것만 금지)
    const NEED = 15;
    if (picked.length < NEED) {
      const notOrth = (r, c) => picked.every((p) => Math.abs(p.r - r) + Math.abs(p.c - c) >= 2);
      for (const cd of cands) { if (picked.length >= NEED) break; if (notOrth(cd.r, cd.c) && !picked.some((p) => p.r === cd.r && p.c === cd.c)) picked.push(cd); }
    }
    const BASE_PADS = 7;
    const spots = picked.slice(0, BASE_PADS).map((p) => cellCenter(p.r, p.c));
    const ordered = picked.slice(BASE_PADS).map((p) => cellCenter(p.r, p.c));
    const padCells = picked.map((p) => [p.r, p.c]);
    return {
      grid, mainCells, secCells,
      path: toPoly(mainCells), path2: toPoly(secCells),
      spots, spots2: ordered, padCells, water, props,
      start: S ? cellCenter(S[0], S[1]) : null, end: E ? cellCenter(E[0], E[1]) : null, start2: S2 ? cellCenter(S2[0], S2[1]) : null,
      startCell: S, endCell: E, start2Cell: S2,
    };
  }
  // 스테이지 n 에 쓸 템플릿: 1~30 은 한 갈래, 31~50 은 두 갈래. 6개씩 돌려 쓰고 두 바퀴째는 좌우 반전.
  function templateForStage(n) {
    const dual = n > 30;
    const list = dual ? TEMPLATES_DUAL : TEMPLATES_SINGLE;
    const i = dual ? n - 31 : n - 1;
    return { rows: list[i % list.length], mirror: Math.floor(i / list.length) % 2 === 1, index: i % list.length, dual };
  }

  const maps = [];
  for (let n = 1; n <= 50; n++) {
    const th = themeForStage(n);
    const t = templateForStage(n);
    const L = buildGridLayout(t.rows, t.mirror);
    const names = STAGE_NAMES[th.id];
    maps.push({
      key: 'g' + n, name: names[(n - th.stages[0]) % names.length], theme: th, themeId: th.id,
      tiled: true, renderRoads: true, template: t, layout: L,
      path: L.path, path2: L.path2, spots: L.spots, spots2: L.spots2,
      center: L.end, portals: [L.start].concat(L.start2 ? [L.start2] : []),
    });
  }
  // 인피니티 전용 아레나: 배경은 '바닥 그림'만 쓰고 순환 도로·석단·포탈은 코드가 만든다 (buildArenaLayout, game.js buildRoadLayer)
  maps.push({ key: 'cInf', name: '무한 투기장', infinity: true, arena: true, renderRoads: true, canvas: [1024, 576], rangeBonus: 160 });
  // 세로 화면용 아레나 (랜덤다이스식): 같은 15칸을 3열×5행으로 세우고 트랙을 세로로 길게 두른다
  maps.push({ key: 'cInfP', name: '무한 투기장 (세로)', infinity: true, arena: true, arenaPortrait: true, renderRoads: true, canvas: [720, 1080], rangeBonus: 280 });

  // ===== 무한 투기장: 나선 순환 도로 생성기 =====
  // 왼쪽 가장자리 포탈에서 출발해 중심 크리스탈을 1.5바퀴 돌아 들어간다. 오른쪽 포탈은 두 번째 바퀴로 곧장 합류하는 지름길.
  // ===== 무한 투기장: 랜덤다이스식 보드 + 둘레 트랙 =====
  // 가운데 3×5 석단 보드(15개, 처음부터 전부 개방), 둘레를 도는 둥근 사각형 트랙 하나. 왼쪽 변 가운데가 열려 있어
  // 아래쪽 포탈에서 출발한 적이 (종류와 상관없이 전부) 시계 반대 방향으로 한 바퀴 돌아 위쪽 크리스탈에 닿는다.
  // 인피니티 아레나: 시작·도착 지점이 없다. 적은 왼쪽 화면 밖에서 입구 길로 들어와 가운데 트랙을 영원히 돈다.
  // 목숨은 '도착'이 아니라 필드 한계선(INFINITY.fieldCap)으로 깎인다 — game.js spawnEnemy.
  // W×H 는 화면 비율에 맞춰 game.js 가 정한다(arenaCanvasForScreen). 트랙·보드 치수는 고정이고 중심만 옮긴다.
  // inset: 화면 위(자원 칩)·아래(겹침 HUD)가 가리는 만큼 트랙을 그 사이 가운데에 세운다.
  function buildArenaLayout(W, H, inset) {
    W = W || 1024; H = H || 576; inset = inset || {};
    const cx = Math.round(W / 2), cy = Math.round((inset.top || 0) + (H - (inset.top || 0) - (inset.bottom || 0)) / 2);
    const L = cx - 262, R = cx + 262, T = cy - 150, B = cy + 150, rad = 52, MID = cy; // 보드에 밀착: 가운데 줄에서 위·아래 트랙까지 150px
    const arc = (ax, ay, a0, a1, n) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([Math.round(ax + rad * Math.cos(a)), Math.round(ay + rad * Math.sin(a))]); } return out; };
    const dedupe = (pts) => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    // 시계 반대 방향 (화면 좌표계에서 y 아래가 +): 왼쪽 가운데 → 왼쪽 변 아래로 → 바닥 → 오른쪽 변 위로 → 위 변 왼쪽으로 → 왼쪽 가운데
    const ring = dedupe([[L, MID],
      ...arc(L + rad, B - rad, Math.PI, Math.PI / 2, 6), ...arc(R - rad, B - rad, Math.PI / 2, 0, 6),
      ...arc(R - rad, T + rad, 0, -Math.PI / 2, 6), ...arc(L + rad, T + rad, -Math.PI / 2, -Math.PI, 6), [L, MID]]);
    const entry = [[-40, MID], [L, MID]];   // 캔버스 왼쪽 끝 밖에서 들어온다 — 캔버스가 넓어지면 입구 길도 같이 길어진다
    const path = dedupe([...entry, ...ring]);
    const loopAt = L - entry[0][0]; // 입구 길이. 경로 끝에 닿으면 여기로 되돌아가 계속 돈다
    // 석단 보드 3×5
    const spots = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) spots.push([cx + (c - 2) * 88, cy + (r - 1) * 72]);
    return { path, path2: null, airPts: null, spots, spots2: [], portals: [], center: null, noGoal: true, loopAt,
             roads: [entry, ring], board: { x: cx - 222, y: cy - 122, w: 444, h: 244, cols: 5, rows: 3, gapX: 88, gapY: 72 }, track: { L, R, T, B, rad, mid: MID } };
  }

  // ===== 난이도 티어 =====
  // 스테이지 10개마다 티어가 오른다. 티어가 오를수록 적 동선(레인)과 타워 석단이 늘어난다.
  //  - ground : 배경 아트의 흙길 (path). 땅 적.
  //  - air    : 포탈→크리스탈 하늘길 (코드 생성). 공중 적. 배경 필요 없음.
  //  - tunnel : 흙길 옆 땅굴 (코드 생성). 땅굴 적. 배경 필요 없음.
  //  - ground2: 두 번째 흙길 (path2). 아트에 길이 그려진 맵만 사용. 없으면 tunnel 로 대체된다.
  const TIERS = [
    { tier: 1, name: '초원',   color: '#7fd463', lanes: ['ground'],                               extraSpots: 0, hpScale: 1.00, countBonus: 0, startGold: 130 },
    { tier: 2, name: '언덕',   color: '#7fd4ff', lanes: ['ground', 'air'],                        extraSpots: 2, hpScale: 1.30, countBonus: 2, startGold: 170 },
    { tier: 3, name: '협곡',   color: '#ffe86b', lanes: ['ground', 'air', 'tunnel'],              extraSpots: 4, hpScale: 1.65, countBonus: 4, startGold: 220 },
    { tier: 4, name: '요새',   color: '#e0862c', lanes: ['ground', 'ground2', 'air'],             extraSpots: 6, hpScale: 1.85, countBonus: 6, startGold: 280 },
    { tier: 5, name: '악몽',   color: '#ff5555', lanes: ['ground', 'ground2', 'air', 'tunnel'],   extraSpots: 8, hpScale: 2.10, countBonus: 8, startGold: 350 },
  ];
  const tierOf = (stageN) => TIERS[Math.min(TIERS.length - 1, Math.max(0, Math.floor((stageN - 1) / 10)))];

  // ===== 레이아웃 생성기 =====
  // 맵의 기본 path/spots 에 티어에 맞는 레인·석단을 더해 { lanes, spots } 를 만든다. 게임·에디터가 공용으로 쓴다.
  const W = 1024, H = 576, SPOT_R = 28;
  const clampPt = (p) => [Math.round(Math.max(36, Math.min(W - 36, p[0]))), Math.round(Math.max(64, Math.min(H - 34, p[1])))];
  const segDist = (px, py, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - a[0], py - a[1]);
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  };
  const pathDist = (x, y, path) => {
    let md = Infinity;
    for (let i = 0; i < path.length - 1; i++) md = Math.min(md, segDist(x, y, path[i], path[i + 1]));
    return md;
  };
  const pathLength = (path) => {
    let l = 0;
    for (let i = 0; i < path.length - 1; i++) l += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    return l;
  };
  // 경로 위 거리 d 지점의 좌표와 진행 방향
  const pathAt = (path, d) => {
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 1) continue;
      if (d <= acc + l) {
        const t = (d - acc) / l;
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / l, dy: (b[1] - a[1]) / l };
      }
      acc += l;
    }
    const a = path[path.length - 2], b = path[path.length - 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: b[0], y: b[1], dx: (b[0] - a[0]) / l, dy: (b[1] - a[1]) / l };
  };

  // 하늘길: 포탈→크리스탈을 잇는 완만한 호. 흙길에서 먼 쪽(대개 위쪽)으로 휜다.
  function buildAirLane(path) {
    const a = path[0], b = path[path.length - 1];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    // 두 법선 방향 중 흙길 중간 지점에서 더 먼 쪽을 고른다
    const mid = pathAt(path, pathLength(path) / 2);
    const side = ((mx + nx * 100 - mid.x) ** 2 + (my + ny * 100 - mid.y) ** 2) >= ((mx - nx * 100 - mid.x) ** 2 + (my - ny * 100 - mid.y) ** 2) ? 1 : -1;
    const bend = Math.min(120, 60 + L * 0.1);
    const cx = mx + nx * side * bend, cy = my + ny * side * bend;
    // 공중 적은 y−42 에 그려지므로 하늘길은 화면 위쪽 여백을 더 남긴다
    const clampAir = (p) => [Math.round(Math.max(36, Math.min(W - 36, p[0]))), Math.round(Math.max(118, Math.min(H - 34, p[1])))];
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      pts.push(clampAir([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]));
    }
    pts[0] = a.slice(); pts[pts.length - 1] = b.slice();
    return pts;
  }
  // 땅굴: 흙길과 같은 포탈에서 출발해 길 옆으로 비껴 파고들다가 크리스탈 앞에서 합류한다.
  function buildTunnelLane(path, airPts) {
    const len = pathLength(path);
    const n = Math.max(6, Math.round(len / 70));
    const airMid = airPts ? airPts[Math.floor(airPts.length / 2)] : null;
    const pts = [path[0].slice()];
    for (let i = 1; i < n; i++) {
      const d = len * i / n;
      const p = pathAt(path, d);
      const fade = Math.sin(Math.PI * i / n); // 양 끝에서 0, 중간에서 1
      let side = 1;
      if (airMid) {
        // 하늘길 반대편으로
        const sx = p.x - p.dy * 60, sy = p.y + p.dx * 60;
        side = (Math.hypot(sx - airMid[0], sy - airMid[1]) > Math.hypot(p.x + p.dy * 60 - airMid[0], p.y - p.dx * 60 - airMid[1])) ? 1 : -1;
      }
      const off = 58 * fade * side;
      pts.push(clampPt([p.x - p.dy * off, p.y + p.dx * off]));
    }
    pts.push(path[path.length - 1].slice());
    return pts;
  }
  // 추가 석단: 흙길 양옆 평지에 일정 간격으로 후보를 만들고 기존 석단·길·포탈·크리스탈과 겹치지 않는 것을 고른다.
  function buildExtraSpots(groundPaths, baseSpots, count, avoid) {
    if (count <= 0) return [];
    const ends = [];
    for (const gp of groundPaths) { ends.push(gp[0]); ends.push(gp[gp.length - 1]); }
    const taken = baseSpots.map((s) => s.slice());
    const cands = [];
    // 모든 흙길(흙길2 포함)을 따라 후보를 만들되, 길마다 번갈아 넣어 고르게 섞는다
    const perPath = groundPaths.map((gp) => {
      const len = pathLength(gp);
      const list = [];
      const steps = Math.max(8, Math.round(len / 55));
      for (let i = 1; i < steps; i++) {
        const p = pathAt(gp, len * i / steps);
        for (const side of [1, -1]) {
          for (const off of [76, 118, 152]) {
            const c = [p.x - p.dy * off * side, p.y + p.dx * off * side];
            if (c[0] < 40 || c[0] > W - 40 || c[1] < 70 || c[1] > H - 36) continue;
            list.push({ pt: [Math.round(c[0]), Math.round(c[1])], order: i + (off > 100 ? 0.5 : 0) });
          }
        }
      }
      return list;
    });
    const maxLen = Math.max(...perPath.map((l) => l.length));
    for (let i = 0; i < maxLen; i++) for (const list of perPath) if (list[i]) cands.push(list[i]);
    const ok = (c, useAvoid) => {
      for (const gp of groundPaths) if (pathDist(c[0], c[1], gp) < 46) return false;
      for (const e of ends) if (Math.hypot(c[0] - e[0], c[1] - e[1]) < 96) return false;
      for (const s of taken) if (Math.hypot(c[0] - s[0], c[1] - s[1]) < 60) return false;
      if (useAvoid && avoid && avoid(c[0], c[1])) return false; // 물·용암 등 배경 픽셀 판정 (game.js/editor.js 가 넘김)
      return true;
    };
    // 길을 따라 고르게 퍼지도록 stride 로 훑는다. 1차: 물 회피 포함, 2차: 부족하면 회피 없이 채움 (얼음호수처럼 온통 파란 맵)
    const out = [];
    for (const useAvoid of [true, false]) {
      if (out.length >= count) break;
      const valid = cands.filter((c) => ok(c.pt, useAvoid));
      if (!valid.length) continue;
      const stride = Math.max(1, Math.floor(valid.length / (count - out.length)));
      let k = 0;
      while (out.length < count && k < valid.length * 2) {
        const c = valid[(k * stride) % valid.length];
        k++;
        if (ok(c.pt, useAvoid)) { out.push(c.pt); taken.push(c.pt); }
      }
    }
    return out;
  }

  // 배경 이미지로 "석단을 두면 안 되는 곳" 판정기를 만든다. 반경 안 샘플의 절반 이상이 물빛(파랑 우세)이면 true.
  function makeAvoidFromImage(img) {
    try {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, W, H);
      const data = g.getImageData(0, 0, W, H).data;
      const isWater = (x, y) => {
        const i = ((y | 0) * W + (x | 0)) * 4;
        const r = data[i], gg = data[i + 1], b = data[i + 2];
        return b > 80 && b > r + 22 && b > gg + 4; // 파랑 우세 = 물·바다·하늘빛 호수
      };
      return (x, y) => {
        let hit = 0, n = 0;
        for (let dy = -18; dy <= 18; dy += 9) for (let dx = -26; dx <= 26; dx += 13) {
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          n++;
          if (isWater(sx, sy)) hit++;
        }
        return n > 0 && hit / n >= 0.4;
      };
    } catch (e) { return null; } // file:// 등으로 픽셀을 읽을 수 없으면 판정 없음
  }

  // 티어(또는 스테이지 번호)에 맞춘 최종 레이아웃
  // opts.avoid(x, y) → true 면 그 자리에 석단을 두지 않는다 (배경 이미지의 물 판정 등)
  function buildLayout(map, tierOrStage, opts) {
    const T = typeof tierOrStage === 'object' ? tierOrStage : (tierOrStage > 5 ? tierOf(tierOrStage) : TIERS[Math.max(0, (tierOrStage | 0) - 1)]);
    const avoid = opts && opts.avoid;
    const base = map.path.map((p) => p.slice());
    const lanes = [];
    const groundPaths = [base];
    let airPts = null;
    const kinds = T.lanes.slice();
    for (const kind of kinds) {
      if (kind === 'ground') lanes.push({ kind: 'ground', pts: base, label: '흙길' });
      else if (kind === 'ground2') {
        if (map.path2) { lanes.push({ kind: 'ground2', pts: map.path2.map((p) => p.slice()), label: '두 번째 흙길' }); groundPaths.push(map.path2); }
        else if (!kinds.includes('tunnel')) lanes.push({ kind: 'tunnel', pts: null, label: '땅굴', fallback: true });
      } else if (kind === 'air') { airPts = map.airPts ? map.airPts.map((p) => p.slice()) : buildAirLane(base); lanes.push({ kind: 'air', pts: airPts, label: '하늘길' }); }
      else if (kind === 'tunnel') lanes.push({ kind: 'tunnel', pts: null, label: '땅굴' });
    }
    // 아레나는 땅굴이 지름길(path2)을 따라가게 해 나선 전체를 파고들지 않도록 한다
    for (const l of lanes) if (l.kind === 'tunnel' && !l.pts) l.pts = buildTunnelLane(map.arena && map.path2 ? map.path2 : base, airPts);
    const spots = map.spots.map((p) => p.slice());
    let extra = [];
    if (T.extraSpots > 0) {
      if (map.spots2 && map.spots2.length) extra = map.spots2.slice(0, T.extraSpots).map((p) => p.slice());
      if (extra.length < T.extraSpots) extra = extra.concat(buildExtraSpots(groundPaths, spots.concat(extra), T.extraSpots - extra.length, avoid));
    }
    return { tier: T, lanes, spots: spots.concat(extra), baseSpotCount: spots.length };
  }
  const skin = (f, letter) => ({ key: `cT${f}${letter}`, src: `casual/towers/t${f}-${letter}.png`, letter });
  const SKIN_LETTERS = ['a', 'b', 'c', 'd', 'e'];
  const towerSkins = {};
  for (let f = 1; f <= 6; f++) towerSkins[f] = SKIN_LETTERS.map((l) => skin(f, l));
  const bases = [
    { id: 'slime', name: '슬라임', hp: 28, speed: 50, gold: 5, dmg: 1, size: 40, move: 'ground', sprite: 'cSlime', src: 'casual/enemies/slime.png', walk: 'cSlimeWalk', walkSrc: 'casual/enemies/slime-walk-2x2.png' },
    { id: 'shroom', name: '버섯돌이', hp: 36, speed: 42, gold: 6, dmg: 1, size: 44, move: 'ground', sprite: 'cShroom', src: 'casual/enemies/shroom.png', walk: 'cShroomWalk', walkSrc: 'casual/enemies/shroom-walk-2x2.png' },
    { id: 'pig', name: '돼지산적', hp: 48, speed: 46, gold: 7, dmg: 1, size: 48, move: 'ground', sprite: 'cPig', src: 'casual/enemies/pig.png', walk: 'cPigWalk', walkSrc: 'casual/enemies/pig-walk-2x2.png' },
    { id: 'chicken', name: '닭기사', hp: 40, speed: 62, gold: 7, dmg: 1, size: 46, move: 'ground', sprite: 'cChicken', src: 'casual/enemies/chicken.png', walk: 'cChickenWalk', walkSrc: 'casual/enemies/chicken-walk-2x2.png' },
    { id: 'goblin', name: '고블린', hp: 34, speed: 70, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cGoblin', src: 'casual/enemies/goblin.png', walk: 'cGoblinWalk', walkSrc: 'casual/enemies/goblin-walk-2x2.png' },
    { id: 'sheep', name: '양기사', hp: 52, speed: 44, gold: 8, dmg: 1, size: 48, move: 'ground', sprite: 'cSheep', src: 'casual/enemies/sheep.png', walk: 'cSheepWalk', walkSrc: 'casual/enemies/sheep-walk-2x2.png' },
    { id: 'cactus', name: '선인장카우보이', hp: 46, speed: 48, gold: 8, dmg: 1, size: 46, move: 'ground', sprite: 'cCactus', src: 'casual/enemies/cactus.png', walk: 'cCactusWalk', walkSrc: 'casual/enemies/cactus-walk-2x2.png' },
    { id: 'fox', name: '여우도둑', hp: 32, speed: 78, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cFox', src: 'casual/enemies/fox.png', walk: 'cFoxWalk', walkSrc: 'casual/enemies/fox-walk-2x2.png' },
    { id: 'penguin', name: '펭귄눈뭉치', hp: 38, speed: 50, gold: 7, dmg: 1, size: 44, move: 'ground', sprite: 'cPenguin', src: 'casual/enemies/penguin.png', walk: 'cPenguinWalk', walkSrc: 'casual/enemies/penguin-walk-2x2.png' },
    { id: 'raccoon', name: '너구리닌자', hp: 36, speed: 80, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cRaccoon', src: 'casual/enemies/raccoon.png', walk: 'cRaccoonWalk', walkSrc: 'casual/enemies/raccoon-walk-2x2.png' },
    { id: 'frog', name: '개구리음유시인', hp: 42, speed: 48, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cFrog', src: 'casual/enemies/frog.png', walk: 'cFrogWalk', walkSrc: 'casual/enemies/frog-walk-2x2.png' },
    { id: 'turtle', name: '거북전차', hp: 85, speed: 32, gold: 12, dmg: 2, size: 50, move: 'ground', sprite: 'cTurtle', src: 'casual/enemies/turtle.png', walk: 'cTurtleWalk', walkSrc: 'casual/enemies/turtle-walk-2x2.png', faceLeft: true, look: 3 },
    { id: 'squirrel', name: '도토리다람쥐', hp: 30, speed: 76, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cSquirrel', src: 'casual/enemies/squirrel.png', walk: 'cSquirrelWalk', walkSrc: 'casual/enemies/squirrel-walk-2x2.png' },
    { id: 'hedgehog', name: '고슴도치창병', hp: 40, speed: 46, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cHedgehog', src: 'casual/enemies/hedgehog.png', walk: 'cHedgehogWalk', walkSrc: 'casual/enemies/hedgehog-walk-2x2.png' },
    { id: 'duck', name: '오리기사', hp: 44, speed: 58, gold: 8, dmg: 1, size: 46, move: 'ground', sprite: 'cDuck', src: 'casual/enemies/duck.png', walk: 'cDuckWalk', walkSrc: 'casual/enemies/duck-walk-2x2.png' },
    { id: 'panda', name: '팬더수도승', hp: 72, speed: 36, gold: 11, dmg: 2, size: 50, move: 'ground', sprite: 'cPanda', src: 'casual/enemies/panda.png', walk: 'cPandaWalk', walkSrc: 'casual/enemies/panda-walk-2x2.png', look: 3 },
    { id: 'koala', name: '코알라우산', hp: 38, speed: 42, gold: 7, dmg: 1, size: 44, move: 'ground', sprite: 'cKoala', src: 'casual/enemies/koala.png', walk: 'cKoalaWalk', walkSrc: 'casual/enemies/koala-walk-2x2.png' },
    { id: 'catsamurai', name: '고양이무사', hp: 48, speed: 68, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cCatsamurai', src: 'casual/enemies/catsamurai.png', walk: 'cCatsamuraiWalk', walkSrc: 'casual/enemies/catsamurai-walk-2x2.png' },
    { id: 'goat', name: '염소등반가', hp: 55, speed: 50, gold: 9, dmg: 1, size: 48, move: 'ground', sprite: 'cGoat', src: 'casual/enemies/goat.png', walk: 'cGoatWalk', walkSrc: 'casual/enemies/goat-walk-2x2.png' },
    { id: 'otter', name: '수달창병', hp: 36, speed: 64, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cOtter', src: 'casual/enemies/otter.png', walk: 'cOtterWalk', walkSrc: 'casual/enemies/otter-walk-2x2.png', look: 2 },
    { id: 'tanuki', name: '너구리요술사', hp: 42, speed: 52, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cTanuki', src: 'casual/enemies/tanuki.png', walk: 'cTanukiWalk', walkSrc: 'casual/enemies/tanuki-walk-2x2.png' },
    { id: 'wolf', name: '늑대정찰', hp: 44, speed: 72, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cWolf', src: 'casual/enemies/wolf.png', walk: 'cWolfWalk', walkSrc: 'casual/enemies/wolf-walk-2x2.png' },
    { id: 'boar', name: '멧돼지기사', hp: 78, speed: 40, gold: 12, dmg: 2, size: 50, move: 'ground', sprite: 'cBoar', src: 'casual/enemies/boar.png', walk: 'cBoarWalk', walkSrc: 'casual/enemies/boar-walk-2x2.png', look: 3 },
    { id: 'mouse', name: '생쥐마법사', hp: 28, speed: 66, gold: 8, dmg: 1, size: 40, move: 'ground', sprite: 'cMouse', src: 'casual/enemies/mouse.png', walk: 'cMouseWalk', walkSrc: 'casual/enemies/mouse-walk-2x2.png' },
    { id: 'chameleon', name: '카멜레온화가', hp: 40, speed: 54, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cChameleon', src: 'casual/enemies/chameleon.png', walk: 'cChameleonWalk', walkSrc: 'casual/enemies/chameleon-walk-2x2.png' },
    { id: 'seahorse', name: '해마기사', hp: 36, speed: 58, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cSeahorse', src: 'casual/enemies/seahorse.png', walk: 'cSeahorseWalk', walkSrc: 'casual/enemies/seahorse-walk-2x2.png' },
    { id: 'alpaca', name: '알파카짐꾼', hp: 50, speed: 46, gold: 9, dmg: 1, size: 48, move: 'ground', sprite: 'cAlpaca', src: 'casual/enemies/alpaca.png', walk: 'cAlpacaWalk', walkSrc: 'casual/enemies/alpaca-walk-2x2.png' },
    { id: 'beaver', name: '비버목수', hp: 52, speed: 44, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cBeaver', src: 'casual/enemies/beaver.png', walk: 'cBeaverWalk', walkSrc: 'casual/enemies/beaver-walk-2x2.png' },
    { id: 'snake', name: '뱀닌자', hp: 34, speed: 82, gold: 10, dmg: 1, size: 42, move: 'ground', sprite: 'cSnake', src: 'casual/enemies/snake.png', walk: 'cSnakeWalk', walkSrc: 'casual/enemies/snake-walk-2x2.png', look: 3 },
    { id: 'porcupine', name: '호저방패', hp: 70, speed: 38, gold: 11, dmg: 2, size: 48, move: 'ground', sprite: 'cPorcupine', src: 'casual/enemies/porcupine.png', walk: 'cPorcupineWalk', walkSrc: 'casual/enemies/porcupine-walk-2x2.png', faceLeft: true, look: 3 },
    { id: 'kiwi', name: '키위기사', hp: 40, speed: 50, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cKiwi', src: 'casual/enemies/kiwi.png', walk: 'cKiwiWalk', walkSrc: 'casual/enemies/kiwi-walk-2x2.png' },
    { id: 'rhino', name: '아기코뿔소', hp: 88, speed: 34, gold: 13, dmg: 2, size: 52, move: 'ground', sprite: 'cRhino', src: 'casual/enemies/rhino.png', walk: 'cRhinoWalk', walkSrc: 'casual/enemies/rhino-walk-2x2.png', faceLeft: true, look: 5 },
    { id: 'hippo', name: '하마선원', hp: 80, speed: 36, gold: 12, dmg: 2, size: 52, move: 'ground', sprite: 'cHippo', src: 'casual/enemies/hippo.png', walk: 'cHippoWalk', walkSrc: 'casual/enemies/hippo-walk-2x2.png', look: 3 },
    { id: 'capybara', name: '카피바라온천', hp: 60, speed: 40, gold: 10, dmg: 1, size: 50, move: 'ground', sprite: 'cCapybara', src: 'casual/enemies/capybara.png', walk: 'cCapybaraWalk', walkSrc: 'casual/enemies/capybara-walk-2x2.png', look: 2 },
    { id: 'axolotl', name: '아홀로틀마법', hp: 34, speed: 52, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cAxolotl', src: 'casual/enemies/axolotl.png', walk: 'cAxolotlWalk', walkSrc: 'casual/enemies/axolotl-walk-2x2.png' },
    { id: 'meerkat', name: '미어캣파수', hp: 32, speed: 70, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cMeerkat', src: 'casual/enemies/meerkat.png', walk: 'cMeerkatWalk', walkSrc: 'casual/enemies/meerkat-walk-2x2.png' },
    { id: 'lemur', name: '여우원숭이', hp: 38, speed: 68, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cLemur', src: 'casual/enemies/lemur.png' },
    { id: 'sloth', name: '나무늘보', hp: 55, speed: 28, gold: 8, dmg: 1, size: 48, move: 'ground', sprite: 'cSloth', src: 'casual/enemies/sloth.png' },
    { id: 'quokka', name: '쿼카꽃관', hp: 36, speed: 56, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cQuokka', src: 'casual/enemies/quokka.png' },
    { id: 'bison', name: '들소전사', hp: 90, speed: 36, gold: 13, dmg: 2, size: 54, move: 'ground', sprite: 'cBison', src: 'casual/enemies/bison.png', faceLeft: true, look: 4 },
    { id: 'walrus', name: '바다코끼리', hp: 84, speed: 32, gold: 12, dmg: 2, size: 52, move: 'ground', sprite: 'cWalrus', src: 'casual/enemies/walrus.png', look: 3 },
    { id: 'platypus', name: '오리너구리탐정', hp: 42, speed: 50, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cPlatypus', src: 'casual/enemies/platypus.png' },
    { id: 'hamster', name: '햄스터짐꾼', hp: 30, speed: 62, gold: 7, dmg: 1, size: 40, move: 'ground', sprite: 'cHamster', src: 'casual/enemies/hamster.png' },
    { id: 'skunk', name: '스컹크연금', hp: 38, speed: 54, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cSkunk', src: 'casual/enemies/skunk.png' },
    { id: 'weasel', name: '족제비도둑', hp: 32, speed: 80, gold: 9, dmg: 1, size: 40, move: 'ground', sprite: 'cWeasel', src: 'casual/enemies/weasel.png' },
    { id: 'camel', name: '낙타짐꾼', hp: 70, speed: 42, gold: 11, dmg: 2, size: 52, move: 'ground', sprite: 'cCamel', src: 'casual/enemies/camel.png', faceLeft: true, look: 2 },
    { id: 'zebra', name: '얼룩말기사', hp: 48, speed: 68, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cZebra', src: 'casual/enemies/zebra.png' },
    { id: 'giraffe', name: '기린파수', hp: 60, speed: 46, gold: 11, dmg: 1, size: 54, move: 'ground', sprite: 'cGiraffe', src: 'casual/enemies/giraffe.png' },
    { id: 'crocodile', name: '악어선원', hp: 82, speed: 36, gold: 12, dmg: 2, size: 52, move: 'ground', sprite: 'cCrocodile', src: 'casual/enemies/crocodile.png', look: 4 },
    { id: 'lynx', name: '스라소니궁수', hp: 44, speed: 72, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cLynx', src: 'casual/enemies/lynx.png' },
    { id: 'tapir', name: '맥우산', hp: 58, speed: 40, gold: 10, dmg: 1, size: 50, move: 'ground', sprite: 'cTapir', src: 'casual/enemies/tapir.png' },
    { id: 'elephant', name: '아기코끼리', hp: 95, speed: 32, gold: 14, dmg: 2, size: 56, move: 'ground', sprite: 'cElephant', src: 'casual/enemies/elephant.png', look: 4 },
    { id: 'tiger', name: '호랑이새끼', hp: 52, speed: 74, gold: 12, dmg: 2, size: 48, move: 'ground', sprite: 'cTiger', src: 'casual/enemies/tiger.png' },
    { id: 'deer', name: '사슴정찰', hp: 40, speed: 70, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cDeer', src: 'casual/enemies/deer.png' },
    { id: 'llama', name: '라마짐꾼', hp: 54, speed: 48, gold: 10, dmg: 1, size: 50, move: 'ground', sprite: 'cLlama', src: 'casual/enemies/llama.png', faceLeft: true, look: 2 },
    { id: 'monkey', name: '원숭이창병', hp: 36, speed: 76, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cMonkey', src: 'casual/enemies/monkey.png', look: 2 },
    { id: 'yak', name: '야크전사', hp: 88, speed: 34, gold: 13, dmg: 2, size: 54, move: 'ground', sprite: 'cYak', src: 'casual/enemies/yak.png', look: 4 },
    { id: 'bee', name: '꿀벌창병', hp: 22, speed: 88, gold: 8, dmg: 1, size: 42, move: 'air', sprite: 'cBee', src: 'casual/enemies/bee.png' },
    { id: 'balloon', name: '풍선임프', hp: 30, speed: 64, gold: 9, dmg: 1, size: 50, move: 'air', sprite: 'cBalloon', src: 'casual/enemies/balloon.png' },
    { id: 'bat', name: '가방박쥐', hp: 26, speed: 96, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cBat', src: 'casual/enemies/bat.png' },
    { id: 'owl', name: '부엉이법사', hp: 34, speed: 72, gold: 10, dmg: 1, size: 48, move: 'air', sprite: 'cOwl', src: 'casual/enemies/owl.png' },
    { id: 'parrot', name: '연연앵무', hp: 28, speed: 84, gold: 9, dmg: 1, size: 46, move: 'air', sprite: 'cParrot', src: 'casual/enemies/parrot.png' },
    { id: 'dragonfly', name: '잠자리기사', hp: 24, speed: 100, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cDragonfly', src: 'casual/enemies/dragonfly.png' },
    { id: 'cloudsheep', name: '구름양', hp: 40, speed: 60, gold: 11, dmg: 1, size: 50, move: 'air', sprite: 'cCloudsheep', src: 'casual/enemies/cloudsheep.png', look: 1 },
    { id: 'humming', name: '벌새창기', hp: 20, speed: 110, gold: 10, dmg: 1, size: 38, move: 'air', sprite: 'cHumming', src: 'casual/enemies/humming.png' },
    { id: 'ladybug', name: '무당벌레방패', hp: 36, speed: 68, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cLadybug', src: 'casual/enemies/ladybug.png' },
    { id: 'fairy', name: '민들레요정', hp: 22, speed: 90, gold: 11, dmg: 1, size: 42, move: 'air', sprite: 'cFairy', src: 'casual/enemies/fairy.png', look: 1 },
    { id: 'crane', name: '종이학닌자', hp: 26, speed: 98, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cCrane', src: 'casual/enemies/crane.png' },
    { id: 'pigeon', name: '비둘기우편', hp: 24, speed: 92, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cPigeon', src: 'casual/enemies/pigeon.png' },
    { id: 'moth', name: '나방정찰', hp: 22, speed: 86, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cMoth', src: 'casual/enemies/moth.png' },
    { id: 'firefly', name: '반딧불이', hp: 18, speed: 80, gold: 8, dmg: 1, size: 40, move: 'air', sprite: 'cFirefly', src: 'casual/enemies/firefly.png' },
    { id: 'pelican', name: '펠리컨우편', hp: 32, speed: 78, gold: 10, dmg: 1, size: 48, move: 'air', sprite: 'cPelican', src: 'casual/enemies/pelican.png' },
    { id: 'butterfly', name: '나비창기', hp: 16, speed: 96, gold: 8, dmg: 1, size: 40, move: 'air', sprite: 'cButterfly', src: 'casual/enemies/butterfly.png' },
    { id: 'jellyfish', name: '해파리종', hp: 28, speed: 62, gold: 9, dmg: 1, size: 44, move: 'air', sprite: 'cJellyfish', src: 'casual/enemies/jellyfish.png' },
    { id: 'toucan', name: '투칸해적', hp: 30, speed: 88, gold: 10, dmg: 1, size: 46, move: 'air', sprite: 'cToucan', src: 'casual/enemies/toucan.png' },
    { id: 'flamingo', name: '플라밍고무용', hp: 28, speed: 74, gold: 10, dmg: 1, size: 48, move: 'air', sprite: 'cFlamingo', src: 'casual/enemies/flamingo.png' },
    { id: 'eagle', name: '독수정찰', hp: 36, speed: 100, gold: 12, dmg: 1, size: 48, move: 'air', sprite: 'cEagle', src: 'casual/enemies/eagle.png' },
    { id: 'dragoncub', name: '아기용', hp: 48, speed: 70, gold: 14, dmg: 2, size: 50, move: 'air', sprite: 'cDragoncub', src: 'casual/enemies/dragoncub.png' },
    { id: 'squid', name: '오징어선원', hp: 34, speed: 66, gold: 10, dmg: 1, size: 46, move: 'air', sprite: 'cSquid', src: 'casual/enemies/squid.png' },
    { id: 'swan', name: '백조기사', hp: 40, speed: 72, gold: 11, dmg: 1, size: 50, move: 'air', sprite: 'cSwan', src: 'casual/enemies/swan.png', look: 2 },
    { id: 'pegasus', name: '아기페가수스', hp: 44, speed: 88, gold: 13, dmg: 2, size: 50, move: 'air', sprite: 'cPegasus', src: 'casual/enemies/pegasus.png' },
    { id: 'puffin', name: '퍼핀해적', hp: 28, speed: 84, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cPuffin', src: 'casual/enemies/puffin.png' },
    { id: 'kite', name: '연새', hp: 20, speed: 104, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cKite', src: 'casual/enemies/kite.png', faceLeft: true, look: 2 },
    { id: 'phoenix', name: '아기불사조', hp: 46, speed: 78, gold: 14, dmg: 2, size: 48, move: 'air', sprite: 'cPhoenix', src: 'casual/enemies/phoenix.png' },
    { id: 'griffin', name: '아기그리핀', hp: 50, speed: 82, gold: 14, dmg: 2, size: 50, move: 'air', sprite: 'cGriffin', src: 'casual/enemies/griffin.png' },
    { id: 'hornet', name: '말벌정찰', hp: 22, speed: 108, gold: 10, dmg: 1, size: 40, move: 'air', sprite: 'cHornet', src: 'casual/enemies/hornet.png' },
    { id: 'firebird', name: '불새리본', hp: 34, speed: 90, gold: 12, dmg: 1, size: 46, move: 'air', sprite: 'cFirebird', src: 'casual/enemies/firebird.png' },
    { id: 'seagull', name: '갈매기해적', hp: 26, speed: 88, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cSeagull', src: 'casual/enemies/seagull.png' },
    { id: 'wyvern', name: '아기와이번', hp: 52, speed: 76, gold: 14, dmg: 2, size: 50, move: 'air', sprite: 'cWyvern', src: 'casual/enemies/wyvern.png' },
    { id: 'sparrow', name: '참새우편', hp: 18, speed: 106, gold: 8, dmg: 1, size: 38, move: 'air', sprite: 'cSparrow', src: 'casual/enemies/sparrow.png' },
    { id: 'unicorn', name: '아기유니콘', hp: 48, speed: 84, gold: 14, dmg: 2, size: 50, move: 'air', sprite: 'cUnicorn', src: 'casual/enemies/unicorn.png' },
    { id: 'mole', name: '두더지광부', hp: 44, speed: 54, gold: 8, dmg: 1, size: 44, move: 'burrow', sprite: 'cMole', src: 'casual/enemies/mole.png' },
    { id: 'worm', name: '모래벌레', hp: 55, speed: 40, gold: 10, dmg: 2, size: 50, move: 'burrow', sprite: 'cWorm', src: 'casual/enemies/worm.png', look: 1 },
    { id: 'arma', name: '아르마딜로', hp: 70, speed: 38, gold: 11, dmg: 2, size: 48, move: 'burrow', sprite: 'cArma', src: 'casual/enemies/arma.png' },
    { id: 'beetle', name: '장수풍뎅이', hp: 60, speed: 42, gold: 10, dmg: 2, size: 46, move: 'burrow', sprite: 'cBeetle', src: 'casual/enemies/beetle.png' },
    { id: 'crab', name: '소라게', hp: 50, speed: 46, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cCrab', src: 'casual/enemies/crab.png' },
    { id: 'prairie', name: '프레리독', hp: 48, speed: 50, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cPrairie', src: 'casual/enemies/prairie.png' },
    { id: 'rabbit', name: '구멍토끼', hp: 34, speed: 70, gold: 9, dmg: 1, size: 42, move: 'burrow', sprite: 'cRabbit', src: 'casual/enemies/rabbit.png' },
    { id: 'badger', name: '오소리광부', hp: 58, speed: 44, gold: 10, dmg: 2, size: 46, move: 'burrow', sprite: 'cBadger', src: 'casual/enemies/badger.png' },
    { id: 'chipmunk', name: '칩멍크', hp: 32, speed: 74, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cChipmunk', src: 'casual/enemies/chipmunk.png' },
    { id: 'wormknight', name: '지렁이기사', hp: 50, speed: 40, gold: 9, dmg: 2, size: 44, move: 'burrow', sprite: 'cWormknight', src: 'casual/enemies/wormknight.png' },
    { id: 'vole', name: '들쥐등불', hp: 34, speed: 58, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cVole', src: 'casual/enemies/vole.png' },
    { id: 'pangolin', name: '천산갑', hp: 80, speed: 34, gold: 12, dmg: 2, size: 50, move: 'burrow', sprite: 'cPangolin', src: 'casual/enemies/pangolin.png', look: 2 },
    { id: 'ant', name: '개미병정', hp: 30, speed: 62, gold: 7, dmg: 1, size: 38, move: 'burrow', sprite: 'cAnt', src: 'casual/enemies/ant.png' },
    { id: 'gecko', name: '도마뱀헬멧', hp: 36, speed: 60, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cGecko', src: 'casual/enemies/gecko.png', look: 1 },
    { id: 'wombat', name: '웜뱃광부', hp: 64, speed: 40, gold: 11, dmg: 2, size: 48, move: 'burrow', sprite: 'cWombat', src: 'casual/enemies/wombat.png', look: 1 },
    { id: 'ferret', name: '페럿도둑', hp: 32, speed: 78, gold: 9, dmg: 1, size: 40, move: 'burrow', sprite: 'cFerret', src: 'casual/enemies/ferret.png', look: 2 },
    { id: 'centipede', name: '지네기사', hp: 58, speed: 48, gold: 11, dmg: 2, size: 46, move: 'burrow', sprite: 'cCentipede', src: 'casual/enemies/centipede.png' },
    { id: 'shrew', name: '땃쥐등불', hp: 28, speed: 76, gold: 8, dmg: 1, size: 38, move: 'burrow', sprite: 'cShrew', src: 'casual/enemies/shrew.png' },
    { id: 'termite', name: '흰개미병정', hp: 26, speed: 64, gold: 7, dmg: 1, size: 36, move: 'burrow', sprite: 'cTermite', src: 'casual/enemies/termite.png', look: 1 },
    { id: 'molecricket', name: '땅강아지', hp: 40, speed: 52, gold: 9, dmg: 1, size: 42, move: 'burrow', sprite: 'cMolecricket', src: 'casual/enemies/molecricket.png' },
    { id: 'gopher', name: '고퍼광부', hp: 46, speed: 54, gold: 9, dmg: 1, size: 42, move: 'burrow', sprite: 'cGopher', src: 'casual/enemies/gopher.png' },
    { id: 'cicada', name: '매미약충', hp: 34, speed: 50, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cCicada', src: 'casual/enemies/cicada.png' },
    { id: 'sandfish', name: '모래고기', hp: 38, speed: 58, gold: 9, dmg: 1, size: 42, move: 'burrow', sprite: 'cSandfish', src: 'casual/enemies/sandfish.png', faceLeft: true, look: 1 },
    { id: 'spider', name: '함정거미', hp: 44, speed: 48, gold: 10, dmg: 1, size: 44, move: 'burrow', sprite: 'cSpider', src: 'casual/enemies/spider.png', look: 2 },
    { id: 'lioncub', name: '아기사자', hp: 48, speed: 72, gold: 11, dmg: 1, size: 46, move: 'ground', sprite: 'cLioncub', src: 'casual/enemies/lioncub.png' },
    { id: 'kangaroo', name: '아기캥거루', hp: 52, speed: 64, gold: 11, dmg: 1, size: 48, move: 'ground', sprite: 'cKangaroo', src: 'casual/enemies/kangaroo.png' },
    { id: 'ostrich', name: '타조병정', hp: 46, speed: 78, gold: 10, dmg: 1, size: 50, move: 'ground', sprite: 'cOstrich', src: 'casual/enemies/ostrich.png' },
    { id: 'dodo', name: '도도탐험가', hp: 70, speed: 34, gold: 12, dmg: 2, size: 50, move: 'ground', sprite: 'cDodo', src: 'casual/enemies/dodo.png', look: 1 },
    { id: 'peacock', name: '공작기사', hp: 44, speed: 56, gold: 11, dmg: 1, size: 50, move: 'ground', sprite: 'cPeacock', src: 'casual/enemies/peacock.png' },
    { id: 'cheetah', name: '치타정찰', hp: 38, speed: 92, gold: 12, dmg: 1, size: 46, move: 'ground', sprite: 'cCheetah', src: 'casual/enemies/cheetah.png' },
    { id: 'raven', name: '까마귀정찰', hp: 24, speed: 100, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cRaven', src: 'casual/enemies/raven.png' },
    { id: 'hawk', name: '매정찰', hp: 32, speed: 104, gold: 11, dmg: 1, size: 46, move: 'air', sprite: 'cHawk', src: 'casual/enemies/hawk.png' },
    { id: 'macaw', name: '마카우전령', hp: 28, speed: 90, gold: 10, dmg: 1, size: 46, move: 'air', sprite: 'cMacaw', src: 'casual/enemies/macaw.png' },
    { id: 'locust', name: '메뚜기정찰', hp: 22, speed: 108, gold: 10, dmg: 1, size: 40, move: 'air', sprite: 'cLocust', src: 'casual/enemies/locust.png' },
    { id: 'scorpion', name: '전갈무사', hp: 58, speed: 44, gold: 11, dmg: 2, size: 46, move: 'burrow', sprite: 'cScorpion', src: 'casual/enemies/scorpion.png' },
    { id: 'pillbug', name: '공벌레방패', hp: 72, speed: 32, gold: 12, dmg: 2, size: 48, move: 'burrow', sprite: 'cPillbug', src: 'casual/enemies/pillbug.png' },
    { id: 'cow', name: '소기사', hp: 70, speed: 42, gold: 11, dmg: 2, size: 50, move: 'ground', sprite: 'cCow', src: 'casual/enemies/cow.png', look: 3 },
    { id: 'corgi', name: '코기기사', hp: 36, speed: 68, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cCorgi', src: 'casual/enemies/corgi.png' },
    { id: 'redpanda', name: '레서팬더승', hp: 42, speed: 56, gold: 10, dmg: 1, size: 44, move: 'ground', sprite: 'cRedpanda', src: 'casual/enemies/redpanda.png' },
    { id: 'snail', name: '달팽이전차', hp: 80, speed: 28, gold: 12, dmg: 2, size: 48, move: 'ground', sprite: 'cSnail', src: 'casual/enemies/snail.png' },
    { id: 'snowman', name: '눈사람정찰', hp: 40, speed: 48, gold: 8, dmg: 1, size: 46, move: 'ground', sprite: 'cSnowman', src: 'casual/enemies/snowman.png', look: 1 },
    { id: 'scarecrow', name: '허수아비병', hp: 52, speed: 40, gold: 9, dmg: 1, size: 48, move: 'ground', sprite: 'cScarecrow', src: 'casual/enemies/scarecrow.png' },
    { id: 'gingerbread', name: '진저브레드', hp: 38, speed: 54, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cGingerbread', src: 'casual/enemies/gingerbread.png' },
    { id: 'lobster', name: '바닷가재기사', hp: 64, speed: 40, gold: 11, dmg: 2, size: 48, move: 'ground', sprite: 'cLobster', src: 'casual/enemies/lobster.png' },
    { id: 'puffer', name: '복어전사', hp: 46, speed: 50, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cPuffer', src: 'casual/enemies/puffer.png' },
    { id: 'polar', name: '북극곰아기', hp: 72, speed: 38, gold: 12, dmg: 2, size: 50, move: 'ground', sprite: 'cPolar', src: 'casual/enemies/polar.png', look: 4 },
    { id: 'manatee', name: '매너티선원', hp: 78, speed: 32, gold: 12, dmg: 2, size: 52, move: 'ground', sprite: 'cManatee', src: 'casual/enemies/manatee.png', look: 2 },
    { id: 'sugarglider', name: '하늘다람쥐', hp: 26, speed: 96, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cSugarglider', src: 'casual/enemies/sugarglider.png' },
    { id: 'flyingsquirrel', name: '날다람쥐', hp: 28, speed: 92, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cFlyingsquirrel', src: 'casual/enemies/flyingsquirrel.png' },
    { id: 'manta', name: '아기가오리', hp: 34, speed: 80, gold: 11, dmg: 1, size: 48, move: 'air', sprite: 'cManta', src: 'casual/enemies/manta.png' },
    { id: 'dandelion', name: '민들레홀씨', hp: 16, speed: 100, gold: 8, dmg: 1, size: 40, move: 'air', sprite: 'cDandelion', src: 'casual/enemies/dandelion.png', look: 1 },
    { id: 'teapot', name: '주전자임프', hp: 32, speed: 70, gold: 10, dmg: 1, size: 46, move: 'air', sprite: 'cTeapot', src: 'casual/enemies/teapot.png' },
    { id: 'wasp', name: '독말벌', hp: 20, speed: 110, gold: 10, dmg: 1, size: 40, move: 'air', sprite: 'cWasp', src: 'casual/enemies/wasp.png' },
    { id: 'paperplane', name: '종이비행기', hp: 18, speed: 112, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cPaperplane', src: 'casual/enemies/paperplane.png' },
    { id: 'aardvark', name: '땅돼지광부', hp: 58, speed: 44, gold: 10, dmg: 2, size: 48, move: 'burrow', sprite: 'cAardvark', src: 'casual/enemies/aardvark.png' },
    { id: 'echidna', name: '가시두더지', hp: 62, speed: 38, gold: 11, dmg: 2, size: 46, move: 'burrow', sprite: 'cEchidna', src: 'casual/enemies/echidna.png' },
    { id: 'groundhog', name: '마멋광부', hp: 50, speed: 48, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cGroundhog', src: 'casual/enemies/groundhog.png' },
    { id: 'jerboa', name: '뛰는쥐', hp: 28, speed: 84, gold: 9, dmg: 1, size: 38, move: 'burrow', sprite: 'cJerboa', src: 'casual/enemies/jerboa.png' },
    { id: 'millipede', name: '노래기기사', hp: 60, speed: 42, gold: 11, dmg: 2, size: 46, move: 'burrow', sprite: 'cMillipede', src: 'casual/enemies/millipede.png' },
    { id: 'grub', name: '애벌레기사', hp: 48, speed: 36, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cGrub', src: 'casual/enemies/grub.png' },
    { id: 'molerat', name: '두더지쥐', hp: 40, speed: 52, gold: 8, dmg: 1, size: 42, move: 'burrow', sprite: 'cMolerat', src: 'casual/enemies/molerat.png' },
    { id: 'sandcat', name: '모래고양이', hp: 34, speed: 76, gold: 9, dmg: 1, size: 42, move: 'burrow', sprite: 'cSandcat', src: 'casual/enemies/sandcat.png' },
    { id: 'donkey', name: '당나귀제분', hp: 56, speed: 44, gold: 10, dmg: 1, size: 50, move: 'ground', sprite: 'cDonkey', src: 'casual/enemies/donkey.png' },
    { id: 'turkey', name: '칠면조기사', hp: 52, speed: 50, gold: 10, dmg: 1, size: 50, move: 'ground', sprite: 'cTurkey', src: 'casual/enemies/turkey.png' },
    { id: 'seal', name: '물개광대', hp: 48, speed: 46, gold: 9, dmg: 1, size: 48, move: 'ground', sprite: 'cSeal', src: 'casual/enemies/seal.png' },
    { id: 'moose', name: '무스레인저', hp: 74, speed: 40, gold: 12, dmg: 2, size: 54, move: 'ground', sprite: 'cMoose', src: 'casual/enemies/moose.png', look: 3 },
    { id: 'pug', name: '퍼그기사', hp: 38, speed: 52, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cPug', src: 'casual/enemies/pug.png' },
    { id: 'chinchilla', name: '친칠라제빵', hp: 32, speed: 60, gold: 8, dmg: 1, size: 40, move: 'ground', sprite: 'cChinchilla', src: 'casual/enemies/chinchilla.png' },
    { id: 'hyena', name: '하이에나정찰', hp: 44, speed: 72, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cHyena', src: 'casual/enemies/hyena.png', look: 3 },
    { id: 'ram', name: '숫양돌격', hp: 78, speed: 38, gold: 12, dmg: 2, size: 50, move: 'ground', sprite: 'cRam', src: 'casual/enemies/ram.png', look: 3 },
    { id: 'narwhal', name: '일각경기사', hp: 58, speed: 48, gold: 11, dmg: 1, size: 50, move: 'ground', sprite: 'cNarwhal', src: 'casual/enemies/narwhal.png', look: 3 },
    { id: 'starfish', name: '불가사리기사', hp: 40, speed: 42, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cStarfish', src: 'casual/enemies/starfish.png' },
    { id: 'iguana', name: '이구아나기사', hp: 42, speed: 50, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cIguana', src: 'casual/enemies/iguana.png' },
    { id: 'toyrobot', name: '태엽로봇', hp: 50, speed: 44, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cToyrobot', src: 'casual/enemies/toyrobot.png' },
    { id: 'carrot', name: '당근기사', hp: 36, speed: 58, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cCarrot', src: 'casual/enemies/carrot.png' },
    { id: 'onion', name: '양파닌자', hp: 34, speed: 80, gold: 10, dmg: 1, size: 42, move: 'ground', sprite: 'cOnion', src: 'casual/enemies/onion.png' },
    { id: 'broccoli', name: '브로콜리법사', hp: 38, speed: 48, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cBroccoli', src: 'casual/enemies/broccoli.png' },
    { id: 'reindeer', name: '순록우편', hp: 46, speed: 64, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cReindeer', src: 'casual/enemies/reindeer.png' },
    { id: 'clownfish', name: '흰동가리선원', hp: 36, speed: 56, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cClownfish', src: 'casual/enemies/clownfish.png', faceLeft: true, look: 1 },
    { id: 'garlic', name: '마늘성기사', hp: 54, speed: 44, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cGarlic', src: 'casual/enemies/garlic.png' },
    { id: 'livingdice', name: '꼬마주사위', hp: 30, speed: 62, gold: 9, dmg: 1, size: 40, move: 'ground', sprite: 'cLivingdice', src: 'casual/enemies/livingdice.png' },
    { id: 'marshmallow', name: '마시멜로정찰', hp: 28, speed: 50, gold: 7, dmg: 1, size: 42, move: 'ground', sprite: 'cMarshmallow', src: 'casual/enemies/marshmallow.png', look: 1 },
    { id: 'albatross', name: '알바트로스', hp: 36, speed: 82, gold: 11, dmg: 1, size: 50, move: 'air', sprite: 'cAlbatross', src: 'casual/enemies/albatross.png' },
    { id: 'stingray', name: '가오리정찰', hp: 32, speed: 86, gold: 10, dmg: 1, size: 48, move: 'air', sprite: 'cStingray', src: 'casual/enemies/stingray.png' },
    { id: 'mapleseed', name: '단풍씨앗', hp: 16, speed: 104, gold: 8, dmg: 1, size: 38, move: 'air', sprite: 'cMapleseed', src: 'casual/enemies/mapleseed.png' },
    { id: 'cloudbunny', name: '구름토끼', hp: 34, speed: 70, gold: 10, dmg: 1, size: 46, move: 'air', sprite: 'cCloudbunny', src: 'casual/enemies/cloudbunny.png' },
    { id: 'flyingfish', name: '날치', hp: 24, speed: 98, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cFlyingfish', src: 'casual/enemies/flyingfish.png' },
    { id: 'condor', name: '콘도르정찰', hp: 40, speed: 88, gold: 12, dmg: 1, size: 50, move: 'air', sprite: 'cCondor', src: 'casual/enemies/condor.png', faceLeft: true, look: 2 },
    { id: 'balloonanimal', name: '풍선강아지', hp: 22, speed: 76, gold: 9, dmg: 1, size: 46, move: 'air', sprite: 'cBalloonanimal', src: 'casual/enemies/balloonanimal.png' },
    { id: 'dicecherub', name: '주사위천사', hp: 28, speed: 90, gold: 12, dmg: 1, size: 44, move: 'air', sprite: 'cDicecherub', src: 'casual/enemies/dicecherub.png' },
    { id: 'dungbeetle', name: '쇠똥구리', hp: 46, speed: 44, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cDungbeetle', src: 'casual/enemies/dungbeetle.png' },
    { id: 'earwig', name: '집게벌레기사', hp: 50, speed: 46, gold: 10, dmg: 1, size: 44, move: 'burrow', sprite: 'cEarwig', src: 'casual/enemies/earwig.png' },
    { id: 'cavecricket', name: '동굴귀뚜라미', hp: 36, speed: 58, gold: 8, dmg: 1, size: 42, move: 'burrow', sprite: 'cCavecricket', src: 'casual/enemies/cavecricket.png' },
    { id: 'burrowowl', name: '땅굴올빼미', hp: 40, speed: 52, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cBurrowowl', src: 'casual/enemies/burrowowl.png' },
    { id: 'turnip', name: '순무광부', hp: 52, speed: 40, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cTurnip', src: 'casual/enemies/turnip.png' },
    { id: 'fennec', name: '사막여우', hp: 32, speed: 78, gold: 9, dmg: 1, size: 42, move: 'burrow', sprite: 'cFennec', src: 'casual/enemies/fennec.png' },
    { id: 'shiba', name: '시바무사', hp: 44, speed: 64, gold: 10, dmg: 1, size: 44, move: 'ground', sprite: 'cShiba', src: 'casual/enemies/shiba.png' },
    { id: 'husky', name: '허스키썰매', hp: 50, speed: 58, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cHusky', src: 'casual/enemies/husky.png', look: 3 },
    { id: 'dalmatian', name: '달마시안소방', hp: 46, speed: 62, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cDalmatian', src: 'casual/enemies/dalmatian.png' },
    { id: 'sunbear', name: '태양곰아기', hp: 60, speed: 42, gold: 11, dmg: 1, size: 48, move: 'ground', sprite: 'cSunbear', src: 'casual/enemies/sunbear.png' },
    { id: 'jackal', name: '자칼정찰', hp: 40, speed: 76, gold: 10, dmg: 1, size: 44, move: 'ground', sprite: 'cJackal', src: 'casual/enemies/jackal.png' },
    { id: 'ibex', name: '아이벡스등반', hp: 58, speed: 52, gold: 11, dmg: 1, size: 50, move: 'ground', sprite: 'cIbex', src: 'casual/enemies/ibex.png' },
    { id: 'dolphin', name: '돌고래기사', hp: 48, speed: 60, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cDolphin', src: 'casual/enemies/dolphin.png' },
    { id: 'octopus', name: '문어요리사', hp: 54, speed: 44, gold: 11, dmg: 1, size: 50, move: 'ground', sprite: 'cOctopus', src: 'casual/enemies/octopus.png' },
    { id: 'shrimp', name: '새우닌자', hp: 28, speed: 86, gold: 9, dmg: 1, size: 40, move: 'ground', sprite: 'cShrimp', src: 'casual/enemies/shrimp.png', faceLeft: true, look: 1 },
    { id: 'tomato', name: '토마토포병', hp: 42, speed: 48, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cTomato', src: 'casual/enemies/tomato.png', look: 1 },
    { id: 'corn', name: '옥수수기사', hp: 50, speed: 44, gold: 9, dmg: 1, size: 48, move: 'ground', sprite: 'cCorn', src: 'casual/enemies/corn.png' },
    { id: 'eggplant', name: '가지법사', hp: 38, speed: 50, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cEggplant', src: 'casual/enemies/eggplant.png' },
    { id: 'cupcake', name: '컵케이크', hp: 32, speed: 52, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cCupcake', src: 'casual/enemies/cupcake.png' },
    { id: 'pumpkinling', name: '아기호박', hp: 46, speed: 42, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cPumpkinling', src: 'casual/enemies/pumpkinling.png' },
    { id: 'chili', name: '고추돌격', hp: 34, speed: 74, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cChili', src: 'casual/enemies/chili.png' },
    { id: 'acorn', name: '도토리기사', hp: 36, speed: 56, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cAcorn', src: 'casual/enemies/acorn.png' },
    { id: 'tinsoldier', name: '양철병정', hp: 48, speed: 46, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cTinsoldier', src: 'casual/enemies/tinsoldier.png' },
    { id: 'daruma', name: '다루마', hp: 70, speed: 30, gold: 11, dmg: 2, size: 46, move: 'ground', sprite: 'cDaruma', src: 'casual/enemies/daruma.png' },
    { id: 'komainu', name: '코마이누', hp: 62, speed: 48, gold: 12, dmg: 2, size: 48, move: 'ground', sprite: 'cKomainu', src: 'casual/enemies/komainu.png' },
    { id: 'leopardcub', name: '표범아기', hp: 42, speed: 78, gold: 11, dmg: 1, size: 46, move: 'ground', sprite: 'cLeopardcub', src: 'casual/enemies/leopardcub.png' },
    { id: 'magpie', name: '까치도둑', hp: 26, speed: 96, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cMagpie', src: 'casual/enemies/magpie.png' },
    { id: 'kingfisher', name: '물총새', hp: 24, speed: 100, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cKingfisher', src: 'casual/enemies/kingfisher.png' },
    { id: 'woodpecker', name: '딱따구리', hp: 28, speed: 88, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cWoodpecker', src: 'casual/enemies/woodpecker.png' },
    { id: 'swallow', name: '제비전령', hp: 20, speed: 108, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cSwallow', src: 'casual/enemies/swallow.png' },
    { id: 'lanternspirit', name: '등불정령', hp: 30, speed: 72, gold: 11, dmg: 1, size: 46, move: 'air', sprite: 'cLanternspirit', src: 'casual/enemies/lanternspirit.png' },
    { id: 'soapbubble', name: '비눗방울', hp: 16, speed: 84, gold: 8, dmg: 1, size: 42, move: 'air', sprite: 'cSoapbubble', src: 'casual/enemies/soapbubble.png' },
    { id: 'sparkfairy', name: '불꽃요정', hp: 18, speed: 102, gold: 10, dmg: 1, size: 40, move: 'air', sprite: 'cSparkfairy', src: 'casual/enemies/sparkfairy.png', look: 1 },
    { id: 'cardinal', name: '홍관조', hp: 22, speed: 94, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cCardinal', src: 'casual/enemies/cardinal.png' },
    { id: 'potato', name: '감자광부', hp: 58, speed: 36, gold: 10, dmg: 1, size: 46, move: 'burrow', sprite: 'cPotato', src: 'casual/enemies/potato.png' },
    { id: 'radish', name: '무광부', hp: 44, speed: 48, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cRadish', src: 'casual/enemies/radish.png' },
    { id: 'cavesalamander', name: '동굴도롱뇽', hp: 40, speed: 52, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cCavesalamander', src: 'casual/enemies/cavesalamander.png' },
    { id: 'spadefoot', name: '삽발개구리', hp: 42, speed: 50, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cSpadefoot', src: 'casual/enemies/spadefoot.png' },
    { id: 'silverfish', name: '좀벌레기사', hp: 34, speed: 66, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cSilverfish', src: 'casual/enemies/silverfish.png' },
    { id: 'kangaroorat', name: '캥거루쥐', hp: 30, speed: 82, gold: 9, dmg: 1, size: 40, move: 'burrow', sprite: 'cKangaroorat', src: 'casual/enemies/kangaroorat.png' },
    { id: 'akita', name: '아키타수호', hp: 52, speed: 50, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cAkita', src: 'casual/enemies/akita.png', look: 3 },
    { id: 'poodle', name: '푸들요리사', hp: 36, speed: 56, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cPoodle', src: 'casual/enemies/poodle.png', look: 2 },
    { id: 'beagle', name: '비글탐정', hp: 38, speed: 62, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cBeagle', src: 'casual/enemies/beagle.png' },
    { id: 'wolverine', name: '울버린', hp: 58, speed: 54, gold: 12, dmg: 2, size: 46, move: 'ground', sprite: 'cWolverine', src: 'casual/enemies/wolverine.png', look: 5 },
    { id: 'oryx', name: '오릭스기사', hp: 64, speed: 52, gold: 11, dmg: 1, size: 50, move: 'ground', sprite: 'cOryx', src: 'casual/enemies/oryx.png', look: 3 },
    { id: 'emu', name: '에뮤질주', hp: 46, speed: 80, gold: 10, dmg: 1, size: 50, move: 'ground', sprite: 'cEmu', src: 'casual/enemies/emu.png', look: 2 },
    { id: 'cassowary', name: '화식조', hp: 62, speed: 58, gold: 12, dmg: 2, size: 52, move: 'ground', sprite: 'cCassowary', src: 'casual/enemies/cassowary.png' },
    { id: 'newt', name: '뉴트연금', hp: 34, speed: 54, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cNewt', src: 'casual/enemies/newt.png' },
    { id: 'banana', name: '바나나기사', hp: 36, speed: 60, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cBanana', src: 'casual/enemies/banana.png' },
    { id: 'lemon', name: '레몬닌자', hp: 32, speed: 82, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cLemon', src: 'casual/enemies/lemon.png', look: 1 },
    { id: 'watermelon', name: '수박전차', hp: 78, speed: 32, gold: 12, dmg: 2, size: 52, move: 'ground', sprite: 'cWatermelon', src: 'casual/enemies/watermelon.png', look: 1 },
    { id: 'pineapple', name: '파인애플기사', hp: 54, speed: 44, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cPineapple', src: 'casual/enemies/pineapple.png' },
    { id: 'waffle', name: '와플정찰', hp: 34, speed: 52, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cWaffle', src: 'casual/enemies/waffle.png' },
    { id: 'donut', name: '도넛정찰', hp: 30, speed: 54, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cDonut', src: 'casual/enemies/donut.png' },
    { id: 'chesspawn', name: '체스폰', hp: 44, speed: 42, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cChesspawn', src: 'casual/enemies/chesspawn.png' },
    { id: 'playingcard', name: '트럼프병정', hp: 28, speed: 70, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cPlayingcard', src: 'casual/enemies/playingcard.png' },
    { id: 'beluga', name: '벨루가기사', hp: 66, speed: 40, gold: 12, dmg: 1, size: 52, move: 'ground', sprite: 'cBeluga', src: 'casual/enemies/beluga.png' },
    { id: 'orca', name: '범고래아기', hp: 70, speed: 48, gold: 13, dmg: 2, size: 52, move: 'ground', sprite: 'cOrca', src: 'casual/enemies/orca.png', look: 3 },
    { id: 'bluejay', name: '어치정찰', hp: 24, speed: 96, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cBluejay', src: 'casual/enemies/bluejay.png' },
    { id: 'robin', name: '울새우편', hp: 22, speed: 92, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cRobin', src: 'casual/enemies/robin.png' },
    { id: 'stork', name: '황새우편', hp: 36, speed: 78, gold: 11, dmg: 1, size: 50, move: 'air', sprite: 'cStork', src: 'casual/enemies/stork.png' },
    { id: 'heron', name: '왜가리정찰', hp: 32, speed: 84, gold: 10, dmg: 1, size: 48, move: 'air', sprite: 'cHeron', src: 'casual/enemies/heron.png' },
    { id: 'goose', name: '거위기사', hp: 38, speed: 76, gold: 10, dmg: 1, size: 48, move: 'air', sprite: 'cGoose', src: 'casual/enemies/goose.png' },
    { id: 'fruitbat', name: '과일박쥐', hp: 26, speed: 100, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cFruitbat', src: 'casual/enemies/fruitbat.png' },
    { id: 'goldfinch', name: '금화조', hp: 18, speed: 104, gold: 9, dmg: 1, size: 38, move: 'air', sprite: 'cGoldfinch', src: 'casual/enemies/goldfinch.png' },
    { id: 'cockatiel', name: '왕관앵무', hp: 24, speed: 90, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cCockatiel', src: 'casual/enemies/cockatiel.png' },
    { id: 'ginger', name: '생강광부', hp: 48, speed: 42, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cGinger', src: 'casual/enemies/ginger.png' },
    { id: 'peanut', name: '땅콩광부', hp: 36, speed: 50, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cPeanut', src: 'casual/enemies/peanut.png' },
    { id: 'beet', name: '비트광부', hp: 50, speed: 40, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cBeet', src: 'casual/enemies/beet.png' },
    { id: 'truffle', name: '송로버섯', hp: 42, speed: 36, gold: 11, dmg: 1, size: 44, move: 'burrow', sprite: 'cTruffle', src: 'casual/enemies/truffle.png' },
    { id: 'pebblegolem', name: '조약돌골렘', hp: 80, speed: 28, gold: 13, dmg: 2, size: 50, move: 'burrow', sprite: 'cPebblegolem', src: 'casual/enemies/pebblegolem.png', look: 3 },
    { id: 'crystalmite', name: '수정진드기', hp: 34, speed: 56, gold: 10, dmg: 1, size: 40, move: 'burrow', sprite: 'cCrystalmite', src: 'casual/enemies/crystalmite.png' },
    { id: 'cavefish', name: '동굴물고기', hp: 38, speed: 52, gold: 9, dmg: 1, size: 42, move: 'burrow', sprite: 'cCavefish', src: 'casual/enemies/cavefish.png' },
    { id: 'olm', name: '올름', hp: 40, speed: 46, gold: 10, dmg: 1, size: 44, move: 'burrow', sprite: 'cOlm', src: 'casual/enemies/olm.png' },
    { id: 'dachshund', name: '닥스훈트기사', hp: 40, speed: 58, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cDachshund', src: 'casual/enemies/dachshund.png' },
    { id: 'saintbernard', name: '세인트버나드', hp: 72, speed: 36, gold: 12, dmg: 1, size: 54, move: 'ground', sprite: 'cSaintbernard', src: 'casual/enemies/saintbernard.png', look: 3 },
    { id: 'greyhound', name: '그레이하운드', hp: 36, speed: 96, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cGreyhound', src: 'casual/enemies/greyhound.png' },
    { id: 'snowleopard', name: '눈표범아기', hp: 48, speed: 72, gold: 12, dmg: 1, size: 46, move: 'ground', sprite: 'cSnowleopard', src: 'casual/enemies/snowleopard.png' },
    { id: 'jaguar', name: '재규어아기', hp: 50, speed: 76, gold: 12, dmg: 1, size: 46, move: 'ground', sprite: 'cJaguar', src: 'casual/enemies/jaguar.png' },
    { id: 'arcticfox', name: '북극여우', hp: 38, speed: 70, gold: 10, dmg: 1, size: 44, move: 'ground', sprite: 'cArcticfox', src: 'casual/enemies/arcticfox.png' },
    { id: 'guineapig', name: '기니피그기사', hp: 34, speed: 48, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cGuineapig', src: 'casual/enemies/guineapig.png' },
    { id: 'hare', name: '산토끼정찰', hp: 28, speed: 92, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cHare', src: 'casual/enemies/hare.png', look: 2 },
    { id: 'anglerfish', name: '아귀기사', hp: 56, speed: 40, gold: 11, dmg: 1, size: 48, move: 'ground', sprite: 'cAnglerfish', src: 'casual/enemies/anglerfish.png' },
    { id: 'nautilus', name: '앵무조개기사', hp: 54, speed: 38, gold: 11, dmg: 1, size: 48, move: 'ground', sprite: 'cNautilus', src: 'casual/enemies/nautilus.png' },
    { id: 'hermitcrab', name: '소라게병정', hp: 44, speed: 42, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cHermitcrab', src: 'casual/enemies/hermitcrab.png' },
    { id: 'avocado', name: '아보카도기사', hp: 48, speed: 44, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cAvocado', src: 'casual/enemies/avocado.png' },
    { id: 'strawberry', name: '딸기정찰', hp: 30, speed: 62, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cStrawberry', src: 'casual/enemies/strawberry.png' },
    { id: 'grape', name: '포도병정', hp: 32, speed: 56, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cGrape', src: 'casual/enemies/grape.png' },
    { id: 'coconut', name: '코코넛기사', hp: 62, speed: 36, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cCoconut', src: 'casual/enemies/coconut.png' },
    { id: 'pretzel', name: '프레첼정찰', hp: 34, speed: 50, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cPretzel', src: 'casual/enemies/pretzel.png', look: 1 },
    { id: 'popsicle', name: '아이스바', hp: 26, speed: 58, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cPopsicle', src: 'casual/enemies/popsicle.png' },
    { id: 'kokeshi', name: '코케시', hp: 46, speed: 34, gold: 10, dmg: 1, size: 44, move: 'ground', sprite: 'cKokeshi', src: 'casual/enemies/kokeshi.png', look: 1 },
    { id: 'oriole', name: '꾀꼬리우편', hp: 22, speed: 94, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cOriole', src: 'casual/enemies/oriole.png' },
    { id: 'canary', name: '카나리아', hp: 18, speed: 100, gold: 9, dmg: 1, size: 38, move: 'air', sprite: 'cCanary', src: 'casual/enemies/canary.png' },
    { id: 'budgie', name: '사랑앵무', hp: 22, speed: 92, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cBudgie', src: 'casual/enemies/budgie.png' },
    { id: 'lorikeet', name: '무지개앵무', hp: 24, speed: 90, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cLorikeet', src: 'casual/enemies/lorikeet.png' },
    { id: 'snowyowl', name: '흰올빼미', hp: 36, speed: 78, gold: 11, dmg: 1, size: 48, move: 'air', sprite: 'cSnowyowl', src: 'casual/enemies/snowyowl.png' },
    { id: 'nighthawk', name: '밤매정찰', hp: 28, speed: 96, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cNighthawk', src: 'casual/enemies/nighthawk.png' },
    { id: 'swift', name: '칼새전령', hp: 16, speed: 114, gold: 9, dmg: 1, size: 38, move: 'air', sprite: 'cSwift', src: 'casual/enemies/swift.png', look: 1 },
    { id: 'egret', name: '백로정찰', hp: 30, speed: 82, gold: 10, dmg: 1, size: 48, move: 'air', sprite: 'cEgret', src: 'casual/enemies/egret.png' },
    { id: 'cauliflower', name: '콜리플라워', hp: 52, speed: 36, gold: 9, dmg: 1, size: 48, move: 'burrow', sprite: 'cCauliflower', src: 'casual/enemies/cauliflower.png' },
    { id: 'cabbage', name: '양배추광부', hp: 56, speed: 34, gold: 9, dmg: 1, size: 48, move: 'burrow', sprite: 'cCabbage', src: 'casual/enemies/cabbage.png' },
    { id: 'cucumber', name: '오이닌자', hp: 32, speed: 74, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cCucumber', src: 'casual/enemies/cucumber.png' },
    { id: 'morel', name: '곰보버섯', hp: 40, speed: 42, gold: 10, dmg: 1, size: 44, move: 'burrow', sprite: 'cMorel', src: 'casual/enemies/morel.png' },
    { id: 'trapdoorspider', name: '함정거미', hp: 46, speed: 50, gold: 11, dmg: 1, size: 44, move: 'burrow', sprite: 'cTrapdoorspider', src: 'casual/enemies/trapdoorspider.png' },
    { id: 'caecilian', name: '무족영원', hp: 38, speed: 48, gold: 9, dmg: 1, size: 42, move: 'burrow', sprite: 'cCaecilian', src: 'casual/enemies/caecilian.png' },
    { id: 'springtail', name: '톡토기', hp: 22, speed: 86, gold: 8, dmg: 1, size: 36, move: 'burrow', sprite: 'cSpringtail', src: 'casual/enemies/springtail.png' },
    { id: 'caveshrimp', name: '동굴새우', hp: 30, speed: 60, gold: 9, dmg: 1, size: 40, move: 'burrow', sprite: 'cCaveshrimp', src: 'casual/enemies/caveshrimp.png' },
    { id: 'maltese', name: '말티즈', hp: 32, speed: 54, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cMaltese', src: 'casual/enemies/maltese.png' },
    { id: 'chihuahua', name: '치와와기사', hp: 26, speed: 88, gold: 9, dmg: 1, size: 38, move: 'ground', sprite: 'cChihuahua', src: 'casual/enemies/chihuahua.png', look: 2 },
    { id: 'bulldog', name: '불독기사', hp: 64, speed: 38, gold: 11, dmg: 1, size: 48, move: 'ground', sprite: 'cBulldog', src: 'casual/enemies/bulldog.png' },
    { id: 'panther', name: '흑표범아기', hp: 52, speed: 80, gold: 12, dmg: 1, size: 46, move: 'ground', sprite: 'cPanther', src: 'casual/enemies/panther.png' },
    { id: 'mink', name: '밍크도둑', hp: 34, speed: 82, gold: 10, dmg: 1, size: 42, move: 'ground', sprite: 'cMink', src: 'casual/enemies/mink.png', look: 2 },
    { id: 'dugong', name: '듀공기사', hp: 70, speed: 32, gold: 12, dmg: 1, size: 52, move: 'ground', sprite: 'cDugong', src: 'casual/enemies/dugong.png', look: 2 },
    { id: 'seaurchin', name: '성게기사', hp: 58, speed: 30, gold: 10, dmg: 1, size: 44, move: 'ground', sprite: 'cSeaurchin', src: 'casual/enemies/seaurchin.png' },
    { id: 'crayfish', name: '가재병정', hp: 44, speed: 46, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cCrayfish', src: 'casual/enemies/crayfish.png' },
    { id: 'peach', name: '복숭아정찰', hp: 34, speed: 56, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cPeach', src: 'casual/enemies/peach.png' },
    { id: 'apple', name: '사과기사', hp: 42, speed: 48, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cApple', src: 'casual/enemies/apple.png' },
    { id: 'cherry', name: '체리정찰', hp: 24, speed: 74, gold: 8, dmg: 1, size: 40, move: 'ground', sprite: 'cCherry', src: 'casual/enemies/cherry.png' },
    { id: 'mango', name: '망고기사', hp: 46, speed: 50, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cMango', src: 'casual/enemies/mango.png' },
    { id: 'croissant', name: '크루아상', hp: 32, speed: 52, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cCroissant', src: 'casual/enemies/croissant.png' },
    { id: 'pizza', name: '피자병정', hp: 40, speed: 44, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cPizza', src: 'casual/enemies/pizza.png' },
    { id: 'sushi', name: '초밥무사', hp: 36, speed: 60, gold: 10, dmg: 1, size: 42, move: 'ground', sprite: 'cSushi', src: 'casual/enemies/sushi.png' },
    { id: 'onigiri', name: '주먹밥기사', hp: 44, speed: 46, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cOnigiri', src: 'casual/enemies/onigiri.png' },
    { id: 'gummybear', name: '젤리곰', hp: 28, speed: 54, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cGummybear', src: 'casual/enemies/gummybear.png' },
    { id: 'lollipop', name: '막대사탕', hp: 26, speed: 58, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cLollipop', src: 'casual/enemies/lollipop.png' },
    { id: 'ibis', name: '따오기정찰', hp: 28, speed: 84, gold: 10, dmg: 1, size: 46, move: 'air', sprite: 'cIbis', src: 'casual/enemies/ibis.png' },
    { id: 'spoonbill', name: '저어새', hp: 30, speed: 80, gold: 10, dmg: 1, size: 48, move: 'air', sprite: 'cSpoonbill', src: 'casual/enemies/spoonbill.png', look: 2 },
    { id: 'crow', name: '까마귀도둑', hp: 26, speed: 94, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cCrow', src: 'casual/enemies/crow.png' },
    { id: 'barnowl', name: '부엉이정찰', hp: 34, speed: 76, gold: 11, dmg: 1, size: 48, move: 'air', sprite: 'cBarnowl', src: 'casual/enemies/barnowl.png' },
    { id: 'lunamoth', name: '달나방', hp: 20, speed: 88, gold: 9, dmg: 1, size: 44, move: 'air', sprite: 'cLunamoth', src: 'casual/enemies/lunamoth.png' },
    { id: 'bumblebee', name: '호박벌', hp: 24, speed: 92, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cBumblebee', src: 'casual/enemies/bumblebee.png' },
    { id: 'hoopoe', name: '후투티', hp: 26, speed: 86, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cHoopoe', src: 'casual/enemies/hoopoe.png' },
    { id: 'quetzal', name: '케찰', hp: 32, speed: 82, gold: 12, dmg: 1, size: 50, move: 'air', sprite: 'cQuetzal', src: 'casual/enemies/quetzal.png', look: 2 },
    { id: 'celery', name: '셀러리광부', hp: 40, speed: 46, gold: 8, dmg: 1, size: 46, move: 'burrow', sprite: 'cCelery', src: 'casual/enemies/celery.png' },
    { id: 'pea', name: '완두콩', hp: 22, speed: 70, gold: 7, dmg: 1, size: 36, move: 'burrow', sprite: 'cPea', src: 'casual/enemies/pea.png' },
    { id: 'spinach', name: '시금치광부', hp: 38, speed: 48, gold: 8, dmg: 1, size: 44, move: 'burrow', sprite: 'cSpinach', src: 'casual/enemies/spinach.png' },
    { id: 'leek', name: '대파닌자', hp: 34, speed: 72, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cLeek', src: 'casual/enemies/leek.png' },
    { id: 'wasabi', name: '와사비광부', hp: 36, speed: 52, gold: 10, dmg: 1, size: 42, move: 'burrow', sprite: 'cWasabi', src: 'casual/enemies/wasabi.png' },
    { id: 'ginseng', name: '산삼광부', hp: 50, speed: 34, gold: 12, dmg: 1, size: 46, move: 'burrow', sprite: 'cGinseng', src: 'casual/enemies/ginseng.png' },
    { id: 'chanterelle', name: '꾀꼬리버섯', hp: 38, speed: 42, gold: 10, dmg: 1, size: 44, move: 'burrow', sprite: 'cChanterelle', src: 'casual/enemies/chanterelle.png' },
    { id: 'puffball', name: '말불버섯', hp: 44, speed: 36, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cPuffball', src: 'casual/enemies/puffball.png' },
    { id: 'pomeranian', name: '포메라니안', hp: 30, speed: 56, gold: 8, dmg: 1, size: 40, move: 'ground', sprite: 'cPomeranian', src: 'casual/enemies/pomeranian.png' },
    { id: 'newfoundland', name: '뉴펀들랜드', hp: 78, speed: 32, gold: 13, dmg: 1, size: 56, move: 'ground', sprite: 'cNewfoundland', src: 'casual/enemies/newfoundland.png', look: 3 },
    { id: 'cougar', name: '퓨마아기', hp: 50, speed: 78, gold: 12, dmg: 1, size: 46, move: 'ground', sprite: 'cCougar', src: 'casual/enemies/cougar.png' },
    { id: 'stoat', name: '에르민', hp: 32, speed: 84, gold: 10, dmg: 1, size: 40, move: 'ground', sprite: 'cStoat', src: 'casual/enemies/stoat.png', look: 2 },
    { id: 'clam', name: '조개기사', hp: 52, speed: 28, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cClam', src: 'casual/enemies/clam.png' },
    { id: 'pear', name: '배기사', hp: 40, speed: 48, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cPear', src: 'casual/enemies/pear.png' },
    { id: 'blueberry', name: '블루베리', hp: 22, speed: 68, gold: 7, dmg: 1, size: 36, move: 'ground', sprite: 'cBlueberry', src: 'casual/enemies/blueberry.png' },
    { id: 'kiwifruit', name: '키위과일', hp: 38, speed: 50, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cKiwifruit', src: 'casual/enemies/kiwifruit.png' },
    { id: 'orange', name: '오렌지기사', hp: 42, speed: 48, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cOrange', src: 'casual/enemies/orange.png' },
    { id: 'pancake', name: '팬케이크', hp: 36, speed: 46, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cPancake', src: 'casual/enemies/pancake.png' },
    { id: 'taco', name: '타코병정', hp: 38, speed: 52, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cTaco', src: 'casual/enemies/taco.png' },
    { id: 'dumpling', name: '만두무사', hp: 44, speed: 44, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cDumpling', src: 'casual/enemies/dumpling.png' },
    { id: 'cheese', name: '치즈기사', hp: 40, speed: 42, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cCheese', src: 'casual/enemies/cheese.png' },
    { id: 'icecream', name: '아이스크림', hp: 28, speed: 54, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cIcecream', src: 'casual/enemies/icecream.png' },
    { id: 'matryoshka', name: '마트료시카', hp: 50, speed: 34, gold: 11, dmg: 1, size: 46, move: 'ground', sprite: 'cMatryoshka', src: 'casual/enemies/matryoshka.png' },
    { id: 'chessknight', name: '체스나이트', hp: 48, speed: 56, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cChessknight', src: 'casual/enemies/chessknight.png' },
    { id: 'takoyaki', name: '타코야키', hp: 34, speed: 52, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cTakoyaki', src: 'casual/enemies/takoyaki.png' },
    { id: 'chocolate', name: '초콜릿기사', hp: 36, speed: 48, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cChocolate', src: 'casual/enemies/chocolate.png' },
    { id: 'cockatoo', name: '코카투', hp: 28, speed: 88, gold: 10, dmg: 1, size: 46, move: 'air', sprite: 'cCockatoo', src: 'casual/enemies/cockatoo.png' },
    { id: 'lovebird', name: '사랑새', hp: 20, speed: 96, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cLovebird', src: 'casual/enemies/lovebird.png' },
    { id: 'nightingale', name: '나이팅게일', hp: 22, speed: 90, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cNightingale', src: 'casual/enemies/nightingale.png' },
    { id: 'cuckoo', name: '뻐꾸기', hp: 24, speed: 86, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cCuckoo', src: 'casual/enemies/cuckoo.png' },
    { id: 'hornbill', name: '코뿔새', hp: 36, speed: 76, gold: 11, dmg: 1, size: 50, move: 'air', sprite: 'cHornbill', src: 'casual/enemies/hornbill.png' },
    { id: 'waxwing', name: '밀화부리', hp: 24, speed: 88, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cWaxwing', src: 'casual/enemies/waxwing.png', look: 1 },
    { id: 'beeeater', name: '벌잡이새', hp: 22, speed: 94, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cBeeeater', src: 'casual/enemies/beeeater.png' },
    { id: 'lark', name: '종달새', hp: 20, speed: 98, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cLark', src: 'casual/enemies/lark.png' },
    { id: 'kale', name: '케일광부', hp: 42, speed: 40, gold: 8, dmg: 1, size: 44, move: 'burrow', sprite: 'cKale', src: 'casual/enemies/kale.png' },
    { id: 'asparagus', name: '아스파라거스', hp: 36, speed: 52, gold: 8, dmg: 1, size: 46, move: 'burrow', sprite: 'cAsparagus', src: 'casual/enemies/asparagus.png' },
    { id: 'yam', name: '마광부', hp: 54, speed: 36, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cYam', src: 'casual/enemies/yam.png' },
    { id: 'taro', name: '토란광부', hp: 50, speed: 38, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cTaro', src: 'casual/enemies/taro.png' },
    { id: 'turmeric', name: '강황광부', hp: 40, speed: 44, gold: 9, dmg: 1, size: 42, move: 'burrow', sprite: 'cTurmeric', src: 'casual/enemies/turmeric.png' },
    { id: 'basil', name: '바질광부', hp: 28, speed: 56, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cBasil', src: 'casual/enemies/basil.png' },
    { id: 'mint', name: '민트광부', hp: 26, speed: 60, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cMint', src: 'casual/enemies/mint.png' },
    { id: 'porcini', name: '포르치니', hp: 48, speed: 34, gold: 11, dmg: 1, size: 46, move: 'burrow', sprite: 'cPorcini', src: 'casual/enemies/porcini.png' },
    { id: 'shihtzu', name: '시츄', hp: 30, speed: 52, gold: 8, dmg: 1, size: 40, move: 'ground', sprite: 'cShihtzu', src: 'casual/enemies/shihtzu.png', look: 2 },
    { id: 'bostonterrier', name: '보스턴테리어', hp: 38, speed: 64, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cBostonterrier', src: 'casual/enemies/bostonterrier.png' },
    { id: 'bobcat', name: '밥캣아기', hp: 46, speed: 74, gold: 11, dmg: 1, size: 44, move: 'ground', sprite: 'cBobcat', src: 'casual/enemies/bobcat.png' },
    { id: 'oyster', name: '굴기사', hp: 56, speed: 26, gold: 10, dmg: 1, size: 44, move: 'ground', sprite: 'cOyster', src: 'casual/enemies/oyster.png' },
    { id: 'fig', name: '무화과기사', hp: 38, speed: 48, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cFig', src: 'casual/enemies/fig.png' },
    { id: 'plum', name: '자두정찰', hp: 32, speed: 56, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cPlum', src: 'casual/enemies/plum.png' },
    { id: 'raspberry', name: '라즈베리', hp: 24, speed: 70, gold: 7, dmg: 1, size: 38, move: 'ground', sprite: 'cRaspberry', src: 'casual/enemies/raspberry.png', look: 1 },
    { id: 'persimmon', name: '감기사', hp: 42, speed: 46, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cPersimmon', src: 'casual/enemies/persimmon.png' },
    { id: 'bagel', name: '베이글', hp: 36, speed: 48, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cBagel', src: 'casual/enemies/bagel.png' },
    { id: 'popcorn', name: '팝콘정찰', hp: 22, speed: 64, gold: 7, dmg: 1, size: 40, move: 'ground', sprite: 'cPopcorn', src: 'casual/enemies/popcorn.png' },
    { id: 'toast', name: '토스트기사', hp: 34, speed: 50, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cToast', src: 'casual/enemies/toast.png' },
    { id: 'egg', name: '달걀병정', hp: 28, speed: 52, gold: 7, dmg: 1, size: 40, move: 'ground', sprite: 'cEgg', src: 'casual/enemies/egg.png', look: 1 },
    { id: 'candycane', name: '캔디케인', hp: 30, speed: 56, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cCandycane', src: 'casual/enemies/candycane.png' },
    { id: 'gumdrop', name: '검드롭', hp: 26, speed: 54, gold: 7, dmg: 1, size: 40, move: 'ground', sprite: 'cGumdrop', src: 'casual/enemies/gumdrop.png' },
    { id: 'spinningtop', name: '팽이정찰', hp: 32, speed: 72, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cSpinningtop', src: 'casual/enemies/spinningtop.png' },
    { id: 'jackinbox', name: '잭인더박스', hp: 48, speed: 40, gold: 11, dmg: 1, size: 46, move: 'ground', sprite: 'cJackinbox', src: 'casual/enemies/jackinbox.png' },
    { id: 'chessrook', name: '체스룩', hp: 62, speed: 32, gold: 11, dmg: 1, size: 48, move: 'ground', sprite: 'cChessrook', src: 'casual/enemies/chessrook.png' },
    { id: 'guitar', name: '기타병정', hp: 40, speed: 46, gold: 9, dmg: 1, size: 48, move: 'ground', sprite: 'cGuitar', src: 'casual/enemies/guitar.png' },
    { id: 'wren', name: '굴뚝새', hp: 16, speed: 102, gold: 8, dmg: 1, size: 36, move: 'air', sprite: 'cWren', src: 'casual/enemies/wren.png' },
    { id: 'chickadee', name: '박새', hp: 18, speed: 98, gold: 8, dmg: 1, size: 38, move: 'air', sprite: 'cChickadee', src: 'casual/enemies/chickadee.png' },
    { id: 'starling', name: '찌르레기', hp: 22, speed: 92, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cStarling', src: 'casual/enemies/starling.png', look: 2 },
    { id: 'tanager', name: '풍조', hp: 22, speed: 90, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cTanager', src: 'casual/enemies/tanager.png' },
    { id: 'roller', name: '롤러새', hp: 26, speed: 86, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cRoller', src: 'casual/enemies/roller.png' },
    { id: 'mockingbird', name: '흉내지빠귀', hp: 24, speed: 88, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cMockingbird', src: 'casual/enemies/mockingbird.png' },
    { id: 'nutcrackerbird', name: '잣까마귀', hp: 28, speed: 82, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cNutcrackerbird', src: 'casual/enemies/nutcrackerbird.png' },
    { id: 'blackbird', name: '검은새', hp: 24, speed: 90, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cBlackbird', src: 'casual/enemies/blackbird.png', look: 2 },
    { id: 'rosemary', name: '로즈마리', hp: 32, speed: 50, gold: 8, dmg: 1, size: 42, move: 'burrow', sprite: 'cRosemary', src: 'casual/enemies/rosemary.png' },
    { id: 'thyme', name: '타임광부', hp: 28, speed: 54, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cThyme', src: 'casual/enemies/thyme.png' },
    { id: 'parsley', name: '파슬리광부', hp: 30, speed: 52, gold: 8, dmg: 1, size: 42, move: 'burrow', sprite: 'cParsley', src: 'casual/enemies/parsley.png' },
    { id: 'shallot', name: '샬롯광부', hp: 36, speed: 48, gold: 8, dmg: 1, size: 42, move: 'burrow', sprite: 'cShallot', src: 'casual/enemies/shallot.png' },
    { id: 'bean', name: '강낭콩', hp: 26, speed: 58, gold: 7, dmg: 1, size: 38, move: 'burrow', sprite: 'cBean', src: 'casual/enemies/bean.png' },
    { id: 'sweetpotato', name: '고구마광부', hp: 54, speed: 36, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cSweetpotato', src: 'casual/enemies/sweetpotato.png' },
    { id: 'enoki', name: '팽이버섯', hp: 24, speed: 62, gold: 8, dmg: 1, size: 42, move: 'burrow', sprite: 'cEnoki', src: 'casual/enemies/enoki.png' },
    { id: 'shiitake', name: '표고버섯', hp: 42, speed: 38, gold: 10, dmg: 1, size: 44, move: 'burrow', sprite: 'cShiitake', src: 'casual/enemies/shiitake.png' },
    { id: 'greatdane', name: '그레이트데인', hp: 72, speed: 44, gold: 12, dmg: 1, size: 56, move: 'ground', sprite: 'cGreatdane', src: 'casual/enemies/greatdane.png', look: 3 },
    { id: 'scottishterrier', name: '스코티시테리어', hp: 40, speed: 52, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cScottishterrier', src: 'casual/enemies/scottishterrier.png' },
    { id: 'seaotter', name: '해달기사', hp: 48, speed: 50, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cSeaotter', src: 'casual/enemies/seaotter.png' },
    { id: 'papaya', name: '파파야기사', hp: 44, speed: 46, gold: 8, dmg: 1, size: 46, move: 'ground', sprite: 'cPapaya', src: 'casual/enemies/papaya.png' },
    { id: 'lychee', name: '리치정찰', hp: 28, speed: 62, gold: 8, dmg: 1, size: 40, move: 'ground', sprite: 'cLychee', src: 'casual/enemies/lychee.png' },
    { id: 'pomegranate', name: '석류기사', hp: 46, speed: 44, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cPomegranate', src: 'casual/enemies/pomegranate.png' },
    { id: 'muffin', name: '머핀정찰', hp: 34, speed: 48, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cMuffin', src: 'casual/enemies/muffin.png' },
    { id: 'noodle', name: '국수무사', hp: 38, speed: 54, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cNoodle', src: 'casual/enemies/noodle.png' },
    { id: 'honey', name: '꿀단지', hp: 42, speed: 36, gold: 10, dmg: 1, size: 44, move: 'ground', sprite: 'cHoney', src: 'casual/enemies/honey.png' },
    { id: 'cookie', name: '쿠키병정', hp: 30, speed: 52, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cCookie', src: 'casual/enemies/cookie.png' },
    { id: 'yoyo', name: '요요정찰', hp: 28, speed: 78, gold: 9, dmg: 1, size: 40, move: 'ground', sprite: 'cYoyo', src: 'casual/enemies/yoyo.png' },
    { id: 'chessbishop', name: '체스비숍', hp: 44, speed: 50, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cChessbishop', src: 'casual/enemies/chessbishop.png' },
    { id: 'mahjong', name: '마작패', hp: 40, speed: 42, gold: 10, dmg: 1, size: 42, move: 'ground', sprite: 'cMahjong', src: 'casual/enemies/mahjong.png' },
    { id: 'pencil', name: '연필병정', hp: 32, speed: 56, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cPencil', src: 'casual/enemies/pencil.png' },
    { id: 'book', name: '책기사', hp: 46, speed: 38, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cBook', src: 'casual/enemies/book.png' },
    { id: 'candle', name: '촛불정찰', hp: 26, speed: 58, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cCandle', src: 'casual/enemies/candle.png' },
    { id: 'drum', name: '북병정', hp: 48, speed: 40, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cDrum', src: 'casual/enemies/drum.png' },
    { id: 'violin', name: '바이올린', hp: 34, speed: 54, gold: 9, dmg: 1, size: 48, move: 'ground', sprite: 'cViolin', src: 'casual/enemies/violin.png' },
    { id: 'martin', name: '집제비', hp: 18, speed: 106, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cMartin', src: 'casual/enemies/martin.png' },
    { id: 'petrel', name: '슴새정찰', hp: 24, speed: 92, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cPetrel', src: 'casual/enemies/petrel.png' },
    { id: 'crossbill', name: '솔잣새', hp: 22, speed: 88, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cCrossbill', src: 'casual/enemies/crossbill.png' },
    { id: 'nuthatch', name: '동고비', hp: 20, speed: 86, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cNuthatch', src: 'casual/enemies/nuthatch.png' },
    { id: 'thrush', name: '지빠귀', hp: 24, speed: 84, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cThrush', src: 'casual/enemies/thrush.png' },
    { id: 'warbler', name: '솔새', hp: 16, speed: 100, gold: 8, dmg: 1, size: 36, move: 'air', sprite: 'cWarbler', src: 'casual/enemies/warbler.png' },
    { id: 'flycatcher', name: '딱새정찰', hp: 20, speed: 94, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cFlycatcher', src: 'casual/enemies/flycatcher.png' },
    { id: 'kingbird', name: '왕새', hp: 26, speed: 90, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cKingbird', src: 'casual/enemies/kingbird.png', look: 2 },
    { id: 'fennel', name: '회향광부', hp: 38, speed: 46, gold: 8, dmg: 1, size: 44, move: 'burrow', sprite: 'cFennel', src: 'casual/enemies/fennel.png' },
    { id: 'dill', name: '딜광부', hp: 30, speed: 52, gold: 8, dmg: 1, size: 42, move: 'burrow', sprite: 'cDill', src: 'casual/enemies/dill.png' },
    { id: 'lemongrass', name: '레몬그라스', hp: 34, speed: 50, gold: 8, dmg: 1, size: 46, move: 'burrow', sprite: 'cLemongrass', src: 'casual/enemies/lemongrass.png' },
    { id: 'lotusroot', name: '연근광부', hp: 50, speed: 36, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cLotusroot', src: 'casual/enemies/lotusroot.png' },
    { id: 'bokchoy', name: '청경채', hp: 36, speed: 48, gold: 8, dmg: 1, size: 44, move: 'burrow', sprite: 'cBokchoy', src: 'casual/enemies/bokchoy.png' },
    { id: 'parsnip', name: '파스닙광부', hp: 46, speed: 40, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cParsnip', src: 'casual/enemies/parsnip.png' },
    { id: 'artichoke', name: '아티초크', hp: 54, speed: 32, gold: 10, dmg: 1, size: 48, move: 'burrow', sprite: 'cArtichoke', src: 'casual/enemies/artichoke.png' },
    { id: 'kingoyster', name: '새송이버섯', hp: 44, speed: 38, gold: 10, dmg: 1, size: 46, move: 'burrow', sprite: 'cKingoyster', src: 'casual/enemies/kingoyster.png' },
    { id: 'irishsetter', name: '아이리시세터', hp: 46, speed: 70, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cIrishsetter', src: 'casual/enemies/irishsetter.png' },
    { id: 'boxer', name: '복서기사', hp: 56, speed: 54, gold: 11, dmg: 1, size: 48, move: 'ground', sprite: 'cBoxer', src: 'casual/enemies/boxer.png' },
    { id: 'basset', name: '바셋하운드', hp: 42, speed: 40, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cBasset', src: 'casual/enemies/basset.png', look: 2 },
    { id: 'dragonfruit', name: '용과기사', hp: 48, speed: 46, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cDragonfruit', src: 'casual/enemies/dragonfruit.png' },
    { id: 'starfruit', name: '스타프루트', hp: 34, speed: 58, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cStarfruit', src: 'casual/enemies/starfruit.png' },
    { id: 'datefruit', name: '대추야자', hp: 30, speed: 54, gold: 8, dmg: 1, size: 40, move: 'ground', sprite: 'cDatefruit', src: 'casual/enemies/datefruit.png', look: 1 },
    { id: 'jam', name: '잼단지', hp: 38, speed: 42, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cJam', src: 'casual/enemies/jam.png' },
    { id: 'milkcarton', name: '우유팩', hp: 36, speed: 44, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cMilkcarton', src: 'casual/enemies/milkcarton.png' },
    { id: 'eraser', name: '지우개병정', hp: 28, speed: 56, gold: 7, dmg: 1, size: 40, move: 'ground', sprite: 'cEraser', src: 'casual/enemies/eraser.png' },
    { id: 'matchstick', name: '성냥개비', hp: 18, speed: 80, gold: 7, dmg: 1, size: 40, move: 'ground', sprite: 'cMatchstick', src: 'casual/enemies/matchstick.png', look: 3 },
    { id: 'lamp', name: '램프정찰', hp: 32, speed: 48, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cLamp', src: 'casual/enemies/lamp.png' },
    { id: 'clock', name: '시계병정', hp: 44, speed: 38, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cClock', src: 'casual/enemies/clock.png' },
    { id: 'harmonica', name: '하모니카', hp: 30, speed: 52, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cHarmonica', src: 'casual/enemies/harmonica.png' },
    { id: 'trumpet', name: '트럼펫병정', hp: 36, speed: 50, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cTrumpet', src: 'casual/enemies/trumpet.png' },
    { id: 'accordion', name: '아코디언', hp: 48, speed: 36, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cAccordion', src: 'casual/enemies/accordion.png' },
    { id: 'snowflake', name: '눈송이', hp: 20, speed: 66, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cSnowflake', src: 'casual/enemies/snowflake.png' },
    { id: 'sun', name: '햇님정찰', hp: 34, speed: 52, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cSun', src: 'casual/enemies/sun.png' },
    { id: 'moon', name: '달님정찰', hp: 32, speed: 50, gold: 10, dmg: 1, size: 44, move: 'ground', sprite: 'cMoon', src: 'casual/enemies/moon.png', look: 1 },
    { id: 'grosbeak', name: '콩새', hp: 24, speed: 86, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cGrosbeak', src: 'casual/enemies/grosbeak.png' },
    { id: 'bunting', name: '멧새', hp: 18, speed: 96, gold: 8, dmg: 1, size: 38, move: 'air', sprite: 'cBunting', src: 'casual/enemies/bunting.png' },
    { id: 'shrike', name: '때까치', hp: 26, speed: 90, gold: 10, dmg: 1, size: 42, move: 'air', sprite: 'cShrike', src: 'casual/enemies/shrike.png' },
    { id: 'dipper', name: '물까마귀', hp: 24, speed: 84, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cDipper', src: 'casual/enemies/dipper.png', look: 1 },
    { id: 'sandpiper', name: '도요정찰', hp: 22, speed: 92, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cSandpiper', src: 'casual/enemies/sandpiper.png' },
    { id: 'avocet', name: '장다리새', hp: 28, speed: 82, gold: 10, dmg: 1, size: 46, move: 'air', sprite: 'cAvocet', src: 'casual/enemies/avocet.png' },
    { id: 'tern', name: '제비갈매기', hp: 20, speed: 104, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cTern', src: 'casual/enemies/tern.png' },
    { id: 'cormorant', name: '가마우지', hp: 34, speed: 76, gold: 11, dmg: 1, size: 48, move: 'air', sprite: 'cCormorant', src: 'casual/enemies/cormorant.png' },
    { id: 'sage', name: '세이지광부', hp: 32, speed: 48, gold: 8, dmg: 1, size: 42, move: 'burrow', sprite: 'cSage', src: 'casual/enemies/sage.png' },
    { id: 'oregano', name: '오레가노', hp: 28, speed: 52, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cOregano', src: 'casual/enemies/oregano.png' },
    { id: 'chive', name: '차이브광부', hp: 24, speed: 64, gold: 7, dmg: 1, size: 40, move: 'burrow', sprite: 'cChive', src: 'casual/enemies/chive.png' },
    { id: 'kohlrabi', name: '콜라비광부', hp: 46, speed: 38, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cKohlrabi', src: 'casual/enemies/kohlrabi.png' },
    { id: 'okra', name: '오크라광부', hp: 34, speed: 50, gold: 8, dmg: 1, size: 42, move: 'burrow', sprite: 'cOkra', src: 'casual/enemies/okra.png', look: 1 },
    { id: 'zucchini', name: '주키니', hp: 40, speed: 46, gold: 8, dmg: 1, size: 46, move: 'burrow', sprite: 'cZucchini', src: 'casual/enemies/zucchini.png' },
    { id: 'burdock', name: '우엉광부', hp: 48, speed: 36, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cBurdock', src: 'casual/enemies/burdock.png' },
    { id: 'daikon', name: '왜무광부', hp: 50, speed: 40, gold: 9, dmg: 1, size: 48, move: 'burrow', sprite: 'cDaikon', src: 'casual/enemies/daikon.png' },
    { id: 'samoyed', name: '사모예드', hp: 42, speed: 54, gold: 10, dmg: 1, size: 46, move: 'ground', sprite: 'cSamoyed', src: 'casual/enemies/samoyed.png' },
    { id: 'collie', name: '콜리기사', hp: 46, speed: 62, gold: 10, dmg: 1, size: 48, move: 'ground', sprite: 'cCollie', src: 'casual/enemies/collie.png', look: 2 },
    { id: 'borzoi', name: '보르조이', hp: 40, speed: 80, gold: 11, dmg: 1, size: 50, move: 'ground', sprite: 'cBorzoi', src: 'casual/enemies/borzoi.png', faceLeft: true, look: 2 },
    { id: 'guava', name: '구아바기사', hp: 38, speed: 48, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cGuava', src: 'casual/enemies/guava.png', look: 1 },
    { id: 'passionfruit', name: '패션프루트', hp: 32, speed: 56, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cPassionfruit', src: 'casual/enemies/passionfruit.png', look: 1 },
    { id: 'rambutan', name: '람부탄', hp: 28, speed: 60, gold: 8, dmg: 1, size: 40, move: 'ground', sprite: 'cRambutan', src: 'casual/enemies/rambutan.png' },
    { id: 'durian', name: '두리안기사', hp: 64, speed: 32, gold: 12, dmg: 1, size: 50, move: 'ground', sprite: 'cDurian', src: 'casual/enemies/durian.png', look: 3 },
    { id: 'salt', name: '소금병정', hp: 26, speed: 52, gold: 7, dmg: 1, size: 40, move: 'ground', sprite: 'cSalt', src: 'casual/enemies/salt.png' },
    { id: 'peppercorn', name: '후추병정', hp: 24, speed: 64, gold: 7, dmg: 1, size: 36, move: 'ground', sprite: 'cPeppercorn', src: 'casual/enemies/peppercorn.png' },
    { id: 'butter', name: '버터병정', hp: 30, speed: 46, gold: 8, dmg: 1, size: 42, move: 'ground', sprite: 'cButter', src: 'casual/enemies/butter.png' },
    { id: 'xylophone', name: '실로폰', hp: 40, speed: 42, gold: 9, dmg: 1, size: 48, move: 'ground', sprite: 'cXylophone', src: 'casual/enemies/xylophone.png' },
    { id: 'kazoo', name: '카주병정', hp: 22, speed: 70, gold: 7, dmg: 1, size: 40, move: 'ground', sprite: 'cKazoo', src: 'casual/enemies/kazoo.png' },
    { id: 'starscout', name: '별정찰', hp: 28, speed: 72, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cStarscout', src: 'casual/enemies/starscout.png', look: 1 },
    { id: 'umbrella', name: '우산병정', hp: 34, speed: 48, gold: 8, dmg: 1, size: 46, move: 'ground', sprite: 'cUmbrella', src: 'casual/enemies/umbrella.png' },
    { id: 'scissors', name: '가위병정', hp: 32, speed: 62, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cScissors', src: 'casual/enemies/scissors.png' },
    { id: 'glue', name: '풀병정', hp: 28, speed: 50, gold: 7, dmg: 1, size: 42, move: 'ground', sprite: 'cGlue', src: 'casual/enemies/glue.png' },
    { id: 'crayon', name: '크레용', hp: 24, speed: 58, gold: 7, dmg: 1, size: 42, move: 'ground', sprite: 'cCrayon', src: 'casual/enemies/crayon.png' },
    { id: 'paintbrush', name: '붓정찰', hp: 26, speed: 56, gold: 8, dmg: 1, size: 46, move: 'ground', sprite: 'cPaintbrush', src: 'casual/enemies/paintbrush.png' },
    { id: 'backpack', name: '가방병정', hp: 44, speed: 40, gold: 9, dmg: 1, size: 46, move: 'ground', sprite: 'cBackpack', src: 'casual/enemies/backpack.png' },
    { id: 'paperclip', name: '클립정찰', hp: 18, speed: 78, gold: 7, dmg: 1, size: 38, move: 'ground', sprite: 'cPaperclip', src: 'casual/enemies/paperclip.png', look: 1 },
    { id: 'compass', name: '나침반', hp: 36, speed: 48, gold: 9, dmg: 1, size: 42, move: 'ground', sprite: 'cCompass', src: 'casual/enemies/compass.png', look: 3 },
    { id: 'phoebe', name: '포비새', hp: 18, speed: 94, gold: 8, dmg: 1, size: 38, move: 'air', sprite: 'cPhoebe', src: 'casual/enemies/phoebe.png' },
    { id: 'vireo', name: '비레오', hp: 18, speed: 92, gold: 8, dmg: 1, size: 38, move: 'air', sprite: 'cVireo', src: 'casual/enemies/vireo.png' },
    { id: 'pipit', name: '밭종다리', hp: 16, speed: 98, gold: 8, dmg: 1, size: 36, move: 'air', sprite: 'cPipit', src: 'casual/enemies/pipit.png' },
    { id: 'treecreeper', name: '나무발발이', hp: 20, speed: 80, gold: 9, dmg: 1, size: 38, move: 'air', sprite: 'cTreecreeper', src: 'casual/enemies/treecreeper.png' },
    { id: 'plover', name: '물떼새', hp: 22, speed: 90, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cPlover', src: 'casual/enemies/plover.png' },
    { id: 'snipe', name: '도요새', hp: 24, speed: 86, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cSnipe', src: 'casual/enemies/snipe.png', faceLeft: true, look: 2 },
    { id: 'gannet', name: '흰가넷', hp: 32, speed: 84, gold: 11, dmg: 1, size: 48, move: 'air', sprite: 'cGannet', src: 'casual/enemies/gannet.png' },
    { id: 'frigatebird', name: '군함조', hp: 30, speed: 100, gold: 12, dmg: 1, size: 50, move: 'air', sprite: 'cFrigatebird', src: 'casual/enemies/frigatebird.png', faceLeft: true, look: 2 },
    { id: 'kittiwake', name: '세가락갈매기', hp: 22, speed: 96, gold: 9, dmg: 1, size: 42, move: 'air', sprite: 'cKittiwake', src: 'casual/enemies/kittiwake.png' },
    { id: 'oystercatcher', name: '굴물떼새', hp: 28, speed: 82, gold: 10, dmg: 1, size: 44, move: 'air', sprite: 'cOystercatcher', src: 'casual/enemies/oystercatcher.png' },
    { id: 'horseradish', name: '겨자무', hp: 42, speed: 44, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cHorseradish', src: 'casual/enemies/horseradish.png' },
    { id: 'rutabaga', name: '루타바가', hp: 50, speed: 36, gold: 9, dmg: 1, size: 46, move: 'burrow', sprite: 'cRutabaga', src: 'casual/enemies/rutabaga.png' },
    { id: 'arugula', name: '루콜라광부', hp: 26, speed: 58, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cArugula', src: 'casual/enemies/arugula.png' },
    { id: 'napa', name: '배추광부', hp: 44, speed: 40, gold: 8, dmg: 1, size: 46, move: 'burrow', sprite: 'cNapa', src: 'casual/enemies/napa.png' },
    { id: 'bamboo', name: '죽순광부', hp: 48, speed: 46, gold: 9, dmg: 1, size: 48, move: 'burrow', sprite: 'cBamboo', src: 'casual/enemies/bamboo.png' },
    { id: 'cinnamon', name: '계피광부', hp: 36, speed: 44, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cCinnamon', src: 'casual/enemies/cinnamon.png' },
    { id: 'nutmeg', name: '육두구', hp: 32, speed: 48, gold: 9, dmg: 1, size: 40, move: 'burrow', sprite: 'cNutmeg', src: 'casual/enemies/nutmeg.png' },
    { id: 'squash', name: '스쿼시광부', hp: 52, speed: 34, gold: 9, dmg: 1, size: 48, move: 'burrow', sprite: 'cSquash', src: 'casual/enemies/squash.png' },
    { id: 'cilantro', name: '고수광부', hp: 24, speed: 60, gold: 8, dmg: 1, size: 40, move: 'burrow', sprite: 'cCilantro', src: 'casual/enemies/cilantro.png' },
    { id: 'vanilla', name: '바닐라광부', hp: 34, speed: 50, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cVanilla', src: 'casual/enemies/vanilla.png' },
  ];
  const bossBases = [
    { id: 'kingSlime', name: '슬라임왕', hp: 720, speed: 28, gold: 90, dmg: 4, size: 86, move: 'ground', sprite: 'cKingSlime', src: 'casual/bosses/king-slime.png', walk: 'cKingSlimeWalk', walkSrc: 'casual/bosses/king-slime-walk-2x2.png', look: 1 },
    { id: 'diceDragon', name: '주사위용', hp: 980, speed: 30, gold: 120, dmg: 5, size: 92, move: 'air', sprite: 'cDiceDragon', src: 'casual/bosses/dice-dragon.png', walk: 'cDiceDragonWalk', walkSrc: 'casual/bosses/dice-dragon-walk-2x2.png', look: 3 },
    { id: 'ogreChef', name: '주사위요리사', hp: 1100, speed: 24, gold: 130, dmg: 5, size: 90, move: 'ground', sprite: 'cOgreChef', src: 'casual/bosses/ogre-chef.png', walk: 'cOgreChefWalk', walkSrc: 'casual/bosses/ogre-chef-walk-2x2.png', look: 3 },
    { id: 'pumpkinKing', name: '호박왕', hp: 880, speed: 26, gold: 110, dmg: 4, size: 88, move: 'ground', sprite: 'cPumpkinKing', src: 'casual/bosses/pumpkin-king.png', walk: 'cPumpkinKingWalk', walkSrc: 'casual/bosses/pumpkin-king-walk-2x2.png', look: 3 },
    { id: 'yeti', name: '주사위예티', hp: 1050, speed: 22, gold: 125, dmg: 5, size: 92, move: 'ground', sprite: 'cYeti', src: 'casual/bosses/yeti.png', walk: 'cYetiWalk', walkSrc: 'casual/bosses/yeti-walk-2x2.png', look: 3 },
    { id: 'candyGolem', name: '사탕골렘', hp: 1200, speed: 20, gold: 140, dmg: 5, size: 94, move: 'ground', sprite: 'cCandyGolem', src: 'casual/bosses/candy-golem.png', walk: 'cCandyGolemWalk', walkSrc: 'casual/bosses/candy-golem-walk-2x2.png', look: 3 },
    { id: 'kraken', name: '해적크라켄', hp: 960, speed: 32, gold: 130, dmg: 5, size: 90, move: 'air', sprite: 'cKraken', src: 'casual/bosses/kraken.png', walk: 'cKrakenWalk', walkSrc: 'casual/bosses/kraken-walk-2x2.png', look: 4 },
    { id: 'clockOwl', name: '태엽올빼미', hp: 1080, speed: 26, gold: 135, dmg: 5, size: 90, move: 'air', sprite: 'cClockOwl', src: 'casual/bosses/clock-owl.png', walk: 'cClockOwlWalk', walkSrc: 'casual/bosses/clock-owl-walk-2x2.png', look: 3 },
    { id: 'coralQueen', name: '산호여왕', hp: 1020, speed: 28, gold: 128, dmg: 5, size: 88, move: 'ground', sprite: 'cCoralQueen', src: 'casual/bosses/coral-queen.png', walk: 'cCoralQueenWalk', walkSrc: 'casual/bosses/coral-queen-walk-2x2.png', look: 3 },
    { id: 'ghostKing', name: '유령왕', hp: 940, speed: 34, gold: 122, dmg: 5, size: 88, move: 'air', sprite: 'cGhostKing', src: 'casual/bosses/ghost-king.png', walk: 'cGhostKingWalk', walkSrc: 'casual/bosses/ghost-king-walk-2x2.png', look: 4 },
    { id: 'honeyBear', name: '꿀곰대왕', hp: 1250, speed: 22, gold: 145, dmg: 5, size: 94, move: 'ground', sprite: 'cHoneyBear', src: 'casual/bosses/honey-bear.png' },
    { id: 'lionMaster', name: '서커스사자', hp: 1120, speed: 30, gold: 138, dmg: 5, size: 90, move: 'ground', sprite: 'cLionMaster', src: 'casual/bosses/lion-master.png' },
    { id: 'mapleTreant', name: '단풍정령', hp: 1180, speed: 24, gold: 140, dmg: 5, size: 94, move: 'ground', sprite: 'cMapleTreant', src: 'casual/bosses/maple-treant.png' },
    { id: 'auroraMoose', name: '오로라무스', hp: 1080, speed: 28, gold: 136, dmg: 5, size: 92, move: 'ground', sprite: 'cAuroraMoose', src: 'casual/bosses/aurora-moose.png' },
    { id: 'gorillaKing', name: '정글고릴라왕', hp: 1300, speed: 22, gold: 150, dmg: 6, size: 96, move: 'ground', sprite: 'cGorillaKing', src: 'casual/bosses/gorilla-king.png' },
    { id: 'peacockKing', name: '공작왕', hp: 1150, speed: 28, gold: 142, dmg: 5, size: 90, move: 'ground', sprite: 'cPeacockKing', src: 'casual/bosses/peacock-king.png' },
    { id: 'skiYeti', name: '스키예티셰프', hp: 1220, speed: 24, gold: 144, dmg: 5, size: 92, move: 'ground', sprite: 'cSkiYeti', src: 'casual/bosses/ski-yeti.png' },
    { id: 'astroSlime', name: '우주슬라임', hp: 1000, speed: 34, gold: 138, dmg: 5, size: 88, move: 'air', sprite: 'cAstroSlime', src: 'casual/bosses/astro-slime.png' },
    { id: 'harborOcto', name: '등대문어', hp: 1180, speed: 26, gold: 140, dmg: 5, size: 92, move: 'air', sprite: 'cHarborOcto', src: 'casual/bosses/harbor-octo.png' },
    { id: 'wolfKing', name: '늑대왕', hp: 1160, speed: 30, gold: 142, dmg: 5, size: 90, move: 'ground', sprite: 'cWolfKing', src: 'casual/bosses/wolf-king.png' },
    { id: 'boarWarlord', name: '멧돼지장군', hp: 1340, speed: 22, gold: 152, dmg: 6, size: 96, move: 'ground', sprite: 'cBoarWarlord', src: 'casual/bosses/boar-warlord.png' },
    { id: 'mothQueen', name: '나방여왕', hp: 980, speed: 32, gold: 136, dmg: 5, size: 88, move: 'air', sprite: 'cMothQueen', src: 'casual/bosses/moth-queen.png' },
    { id: 'pangolinTank', name: '천산갑전차', hp: 1400, speed: 20, gold: 155, dmg: 6, size: 94, move: 'burrow', sprite: 'cPangolinTank', src: 'casual/bosses/pangolin-tank.png' },
    { id: 'alpacaKing', name: '알파카왕', hp: 1100, speed: 26, gold: 140, dmg: 5, size: 92, move: 'ground', sprite: 'cAlpacaKing', src: 'casual/bosses/alpaca-king.png' },
    { id: 'mouseKing', name: '생쥐마왕', hp: 920, speed: 34, gold: 134, dmg: 5, size: 86, move: 'ground', sprite: 'cMouseKing', src: 'casual/bosses/mouse-king.png' },
    { id: 'antQueen', name: '개미여왕', hp: 1080, speed: 24, gold: 138, dmg: 5, size: 90, move: 'burrow', sprite: 'cAntQueen', src: 'casual/bosses/ant-queen.png' },
    { id: 'chameleonHydra', name: '카멜레온히드라', hp: 1260, speed: 26, gold: 148, dmg: 6, size: 94, move: 'ground', sprite: 'cChameleonHydra', src: 'casual/bosses/chameleon-hydra.png' },
    { id: 'beaverLord', name: '비버영주', hp: 1140, speed: 24, gold: 140, dmg: 5, size: 90, move: 'ground', sprite: 'cBeaverLord', src: 'casual/bosses/beaver-lord.png' },
    { id: 'jellyQueen', name: '해파리여왕', hp: 960, speed: 30, gold: 134, dmg: 5, size: 88, move: 'air', sprite: 'cJellyQueen', src: 'casual/bosses/jelly-queen.png' },
    { id: 'toucanCaptain', name: '투칸선장', hp: 1020, speed: 32, gold: 138, dmg: 5, size: 90, move: 'air', sprite: 'cToucanCaptain', src: 'casual/bosses/toucan-captain.png' },
    { id: 'nagaKing', name: '나가왕', hp: 1180, speed: 28, gold: 144, dmg: 5, size: 92, move: 'ground', sprite: 'cNagaKing', src: 'casual/bosses/naga-king.png' },
    { id: 'hippoAdmiral', name: '하마제독', hp: 1280, speed: 22, gold: 148, dmg: 6, size: 96, move: 'ground', sprite: 'cHippoAdmiral', src: 'casual/bosses/hippo-admiral.png' },
    { id: 'porcupineTank', name: '호저전차', hp: 1360, speed: 20, gold: 152, dmg: 6, size: 94, move: 'ground', sprite: 'cPorcupineTank', src: 'casual/bosses/porcupine-tank.png' },
    { id: 'kiwiPaladin', name: '키위성기사', hp: 1080, speed: 26, gold: 140, dmg: 5, size: 90, move: 'ground', sprite: 'cKiwiPaladin', src: 'casual/bosses/kiwi-paladin.png' },
    { id: 'rhinoChief', name: '코뿔소족장', hp: 1420, speed: 20, gold: 158, dmg: 6, size: 98, move: 'ground', sprite: 'cRhinoChief', src: 'casual/bosses/rhino-chief.png' },
    { id: 'capybaraKing', name: '카피바라왕', hp: 1200, speed: 24, gold: 144, dmg: 5, size: 92, move: 'ground', sprite: 'cCapybaraKing', src: 'casual/bosses/capybara-king.png' },
    { id: 'axolotlSage', name: '아홀로틀현자', hp: 980, speed: 28, gold: 136, dmg: 5, size: 88, move: 'ground', sprite: 'cAxolotlSage', src: 'casual/bosses/axolotl-sage.png' },
    { id: 'flamingoQueen', name: '플라밍고여왕', hp: 1040, speed: 30, gold: 138, dmg: 5, size: 90, move: 'air', sprite: 'cFlamingoQueen', src: 'casual/bosses/flamingo-queen.png' },
    { id: 'eagleEmperor', name: '독수정제', hp: 1120, speed: 32, gold: 146, dmg: 5, size: 92, move: 'air', sprite: 'cEagleEmperor', src: 'casual/bosses/eagle-emperor.png', look: 3 },
    { id: 'slothMonk', name: '나무늘보승', hp: 1300, speed: 18, gold: 148, dmg: 5, size: 94, move: 'ground', sprite: 'cSlothMonk', src: 'casual/bosses/sloth-monk.png', look: 2 },
    { id: 'dragonKing', name: '아기용왕', hp: 1380, speed: 26, gold: 160, dmg: 6, size: 96, move: 'air', sprite: 'cDragonKing', src: 'casual/bosses/dragon-king.png', faceLeft: true, look: 4 },
    { id: 'lemurKing', name: '여우원숭이왕', hp: 1080, speed: 28, gold: 140, dmg: 5, size: 90, move: 'ground', sprite: 'cLemurKing', src: 'casual/bosses/lemur-king.png', look: 2 },
    { id: 'squidAdmiral', name: '오징어제독', hp: 1160, speed: 26, gold: 142, dmg: 5, size: 92, move: 'air', sprite: 'cSquidAdmiral', src: 'casual/bosses/squid-admiral.png', look: 3 },
    { id: 'bisonChief', name: '들소족장', hp: 1440, speed: 20, gold: 158, dmg: 6, size: 98, move: 'ground', sprite: 'cBisonChief', src: 'casual/bosses/bison-chief.png', look: 4 },
    { id: 'walrusAdmiral', name: '바다코끼리제독', hp: 1320, speed: 22, gold: 150, dmg: 6, size: 96, move: 'ground', sprite: 'cWalrusAdmiral', src: 'casual/bosses/walrus-admiral.png', look: 3 },
    { id: 'platypusChief', name: '오리너구리반장', hp: 1060, speed: 28, gold: 138, dmg: 5, size: 88, move: 'ground', sprite: 'cPlatypusChief', src: 'casual/bosses/platypus-chief.png', look: 2 },
    { id: 'hamsterKing', name: '햄스터왕', hp: 940, speed: 30, gold: 132, dmg: 5, size: 86, move: 'ground', sprite: 'cHamsterKing', src: 'casual/bosses/hamster-king.png', look: 1 },
    { id: 'swanQueen', name: '백조여왕', hp: 1100, speed: 28, gold: 142, dmg: 5, size: 92, move: 'air', sprite: 'cSwanQueen', src: 'casual/bosses/swan-queen.png' },
    { id: 'pegasusKing', name: '페가수스왕', hp: 1240, speed: 32, gold: 152, dmg: 6, size: 94, move: 'air', sprite: 'cPegasusKing', src: 'casual/bosses/pegasus-king.png' },
    { id: 'skunkMaster', name: '스컹크대현자', hp: 1080, speed: 26, gold: 140, dmg: 5, size: 90, move: 'ground', sprite: 'cSkunkMaster', src: 'casual/bosses/skunk-master.png' },
    { id: 'puffinCaptain', name: '퍼핀선장', hp: 1020, speed: 30, gold: 138, dmg: 5, size: 90, move: 'air', sprite: 'cPuffinCaptain', src: 'casual/bosses/puffin-captain.png' },
    { id: 'camelSultan', name: '낙타술탄', hp: 1260, speed: 24, gold: 146, dmg: 5, size: 94, move: 'ground', sprite: 'cCamelSultan', src: 'casual/bosses/camel-sultan.png' },
    { id: 'zebraKing', name: '얼룩말왕', hp: 1140, speed: 28, gold: 142, dmg: 5, size: 90, move: 'ground', sprite: 'cZebraKing', src: 'casual/bosses/zebra-king.png' },
    { id: 'giraffeKing', name: '기린왕', hp: 1180, speed: 26, gold: 144, dmg: 5, size: 96, move: 'ground', sprite: 'cGiraffeKing', src: 'casual/bosses/giraffe-king.png' },
    { id: 'crocAdmiral', name: '악어제독', hp: 1340, speed: 22, gold: 150, dmg: 6, size: 96, move: 'ground', sprite: 'cCrocAdmiral', src: 'casual/bosses/croc-admiral.png' },
    { id: 'lynxCaptain', name: '스라소니대장', hp: 1080, speed: 30, gold: 140, dmg: 5, size: 88, move: 'ground', sprite: 'cLynxCaptain', src: 'casual/bosses/lynx-captain.png' },
    { id: 'phoenixKing', name: '불사조왕', hp: 1280, speed: 30, gold: 156, dmg: 6, size: 94, move: 'air', sprite: 'cPhoenixKing', src: 'casual/bosses/phoenix-king.png' },
    { id: 'griffinEmperor', name: '그리핀황제', hp: 1360, speed: 28, gold: 158, dmg: 6, size: 96, move: 'air', sprite: 'cGriffinEmperor', src: 'casual/bosses/griffin-emperor.png' },
    { id: 'hornetQueen', name: '말벌여왕', hp: 980, speed: 34, gold: 138, dmg: 5, size: 88, move: 'air', sprite: 'cHornetQueen', src: 'casual/bosses/hornet-queen.png' },
    { id: 'elephantRaja', name: '코끼리라자', hp: 1500, speed: 18, gold: 162, dmg: 6, size: 100, move: 'ground', sprite: 'cElephantRaja', src: 'casual/bosses/elephant-raja.png' },
    { id: 'tigerRaja', name: '호랑이라자', hp: 1220, speed: 30, gold: 150, dmg: 6, size: 92, move: 'ground', sprite: 'cTigerRaja', src: 'casual/bosses/tiger-raja.png' },
    { id: 'stagKing', name: '사슴왕', hp: 1120, speed: 28, gold: 142, dmg: 5, size: 90, move: 'ground', sprite: 'cStagKing', src: 'casual/bosses/stag-king.png' },
    { id: 'llamaKing', name: '라마왕', hp: 1160, speed: 26, gold: 144, dmg: 5, size: 92, move: 'ground', sprite: 'cLlamaKing', src: 'casual/bosses/llama-king.png' },
    { id: 'monkeyKing', name: '원숭이왕', hp: 1080, speed: 32, gold: 146, dmg: 5, size: 88, move: 'ground', sprite: 'cMonkeyKing', src: 'casual/bosses/monkey-king.png' },
    { id: 'yakChief', name: '야크족장', hp: 1380, speed: 20, gold: 154, dmg: 6, size: 96, move: 'ground', sprite: 'cYakChief', src: 'casual/bosses/yak-chief.png' },
    { id: 'wyvernKing', name: '와이번왕', hp: 1320, speed: 28, gold: 158, dmg: 6, size: 94, move: 'air', sprite: 'cWyvernKing', src: 'casual/bosses/wyvern-king.png' },
    { id: 'unicornQueen', name: '유니콘여왕', hp: 1200, speed: 30, gold: 152, dmg: 5, size: 92, move: 'air', sprite: 'cUnicornQueen', src: 'casual/bosses/unicorn-queen.png' },
    { id: 'kangarooKing', name: '캥거루왕', hp: 1240, speed: 28, gold: 150, dmg: 6, size: 94, move: 'ground', sprite: 'cKangarooKing', src: 'casual/bosses/kangaroo-king.png' },
    { id: 'ostrichKing', name: '타조왕', hp: 1180, speed: 30, gold: 146, dmg: 5, size: 94, move: 'ground', sprite: 'cOstrichKing', src: 'casual/bosses/ostrich-king.png' },
    { id: 'dodoKing', name: '도도왕', hp: 1320, speed: 20, gold: 148, dmg: 5, size: 96, move: 'ground', sprite: 'cDodoKing', src: 'casual/bosses/dodo-king.png' },
    { id: 'ravenKing', name: '까마귀왕', hp: 1080, speed: 32, gold: 142, dmg: 5, size: 90, move: 'air', sprite: 'cRavenKing', src: 'casual/bosses/raven-king.png' },
    { id: 'hawkEmperor', name: '매황제', hp: 1220, speed: 32, gold: 154, dmg: 6, size: 92, move: 'air', sprite: 'cHawkEmperor', src: 'casual/bosses/hawk-emperor.png' },
    { id: 'macawCaptain', name: '마카우선장', hp: 1100, speed: 30, gold: 144, dmg: 5, size: 90, move: 'air', sprite: 'cMacawCaptain', src: 'casual/bosses/macaw-captain.png' },
    { id: 'locustQueen', name: '메뚜기여왕', hp: 1020, speed: 34, gold: 140, dmg: 5, size: 88, move: 'air', sprite: 'cLocustQueen', src: 'casual/bosses/locust-queen.png' },
    { id: 'scorpionKing', name: '전갈왕', hp: 1400, speed: 22, gold: 156, dmg: 6, size: 96, move: 'burrow', sprite: 'cScorpionKing', src: 'casual/bosses/scorpion-king.png' },
    { id: 'foxDaimyo', name: '여우다이묘', hp: 1180, speed: 28, gold: 146, dmg: 5, size: 90, move: 'ground', sprite: 'cFoxDaimyo', src: 'casual/bosses/fox-daimyo.png' },
    { id: 'pandaAbbot', name: '팬더대사', hp: 1320, speed: 22, gold: 150, dmg: 6, size: 94, move: 'ground', sprite: 'cPandaAbbot', src: 'casual/bosses/panda-abbot.png' },
    { id: 'turtleFortress', name: '거북요새', hp: 1480, speed: 18, gold: 160, dmg: 6, size: 100, move: 'ground', sprite: 'cTurtleFortress', src: 'casual/bosses/turtle-fortress.png' },
    { id: 'frogBardKing', name: '개구리음유왕', hp: 1080, speed: 26, gold: 140, dmg: 5, size: 88, move: 'ground', sprite: 'cFrogBardKing', src: 'casual/bosses/frog-bard-king.png' },
    { id: 'raccoonShogun', name: '너구리쇼군', hp: 1160, speed: 30, gold: 144, dmg: 5, size: 90, move: 'ground', sprite: 'cRaccoonShogun', src: 'casual/bosses/raccoon-shogun.png' },
    { id: 'moleOverlord', name: '두더지대공', hp: 1240, speed: 24, gold: 148, dmg: 5, size: 92, move: 'burrow', sprite: 'cMoleOverlord', src: 'casual/bosses/mole-overlord.png' },
    { id: 'beetleEmperor', name: '장수풍뎅이제', hp: 1360, speed: 22, gold: 152, dmg: 6, size: 94, move: 'burrow', sprite: 'cBeetleEmperor', src: 'casual/bosses/beetle-emperor.png' },
    { id: 'cloudSheepKing', name: '구름양왕', hp: 1120, speed: 28, gold: 144, dmg: 5, size: 92, move: 'air', sprite: 'cCloudSheepKing', src: 'casual/bosses/cloud-sheep-king.png' },
    { id: 'fairyEmpress', name: '요정여제', hp: 980, speed: 32, gold: 142, dmg: 5, size: 88, move: 'air', sprite: 'cFairyEmpress', src: 'casual/bosses/fairy-empress.png' },
    { id: 'penguinAdmiral', name: '펭귄제독', hp: 1200, speed: 24, gold: 146, dmg: 5, size: 92, move: 'ground', sprite: 'cPenguinAdmiral', src: 'casual/bosses/penguin-admiral.png' },
    { id: 'tanukiSage', name: '너구리대현자', hp: 1100, speed: 26, gold: 140, dmg: 5, size: 90, move: 'ground', sprite: 'cTanukiSage', src: 'casual/bosses/tanuki-sage.png' },
    { id: 'catShogun', name: '고양이쇼군', hp: 1180, speed: 30, gold: 148, dmg: 5, size: 90, move: 'ground', sprite: 'cCatShogun', src: 'casual/bosses/cat-shogun.png' },
    { id: 'hedgehogDuke', name: '고슴도치공', hp: 1140, speed: 24, gold: 142, dmg: 5, size: 88, move: 'ground', sprite: 'cHedgehogDuke', src: 'casual/bosses/hedgehog-duke.png' },
    { id: 'goatKing', name: '염소왕', hp: 1220, speed: 26, gold: 146, dmg: 5, size: 92, move: 'ground', sprite: 'cGoatKing', src: 'casual/bosses/goat-king.png' },
    { id: 'otterCaptain', name: '수달선장', hp: 1080, speed: 28, gold: 140, dmg: 5, size: 88, move: 'ground', sprite: 'cOtterCaptain', src: 'casual/bosses/otter-captain.png' },
    { id: 'chickenPaladin', name: '닭성기사', hp: 1160, speed: 28, gold: 144, dmg: 5, size: 90, move: 'ground', sprite: 'cChickenPaladin', src: 'casual/bosses/chicken-paladin.png' },
    { id: 'pigBaron', name: '돼지남작', hp: 1280, speed: 22, gold: 148, dmg: 6, size: 94, move: 'ground', sprite: 'cPigBaron', src: 'casual/bosses/pig-baron.png' },
    { id: 'sheepTemplar', name: '양성기사', hp: 1200, speed: 24, gold: 146, dmg: 5, size: 92, move: 'ground', sprite: 'cSheepTemplar', src: 'casual/bosses/sheep-templar.png' },
    { id: 'cactusSheriff', name: '선인장보안관', hp: 1120, speed: 26, gold: 142, dmg: 5, size: 90, move: 'ground', sprite: 'cCactusSheriff', src: 'casual/bosses/cactus-sheriff.png' },
    { id: 'mushroomLord', name: '버섯군주', hp: 1300, speed: 20, gold: 150, dmg: 6, size: 94, move: 'ground', sprite: 'cMushroomLord', src: 'casual/bosses/mushroom-lord.png' },
    { id: 'diceGolem', name: '주사위골렘', hp: 1500, speed: 18, gold: 165, dmg: 6, size: 100, move: 'ground', sprite: 'cDiceGolem', src: 'casual/bosses/dice-golem.png' },
    { id: 'lavaSalamander', name: '용암도롱뇽', hp: 1260, speed: 26, gold: 152, dmg: 6, size: 92, move: 'ground', sprite: 'cLavaSalamander', src: 'casual/bosses/lava-salamander.png' },
    { id: 'moonRabbit', name: '달토끼왕', hp: 1140, speed: 28, gold: 148, dmg: 5, size: 90, move: 'ground', sprite: 'cMoonRabbit', src: 'casual/bosses/moon-rabbit.png' },
    { id: 'toyKing', name: '장난감왕', hp: 1220, speed: 24, gold: 150, dmg: 5, size: 92, move: 'ground', sprite: 'cToyKing', src: 'casual/bosses/toy-king.png' },
    { id: 'lanternKoi', name: '등불잉어', hp: 1080, speed: 30, gold: 146, dmg: 5, size: 92, move: 'air', sprite: 'cLanternKoi', src: 'casual/bosses/lantern-koi.png' },
  ];
  // 세로 화면용 아레나: 캔버스 720×1080, 보드 3열×5행, 트랙은 세로로 긴 링. 가로 아레나를 시계 방향 90° 회전한 배치(입구 위쪽)
  function buildArenaLayoutPortrait(W, H, inset) {
    W = W || 720; H = H || 1080; inset = inset || {};
    const cx = Math.round(W / 2), cy = Math.round((inset.top || 0) + (H - (inset.top || 0) - (inset.bottom || 0)) / 2);
    const L = cx - 270, R = cx + 270, T = cy - 360, B = cy + 360, rad = 60, MID = cy;
    const arc = (ax, ay, a0, a1, n) => {
      const out = [];
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([ax + Math.cos(a) * rad, ay + Math.sin(a) * rad]); }
      return out;
    };
    const dedupe = (pts) => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
    // 가로 아레나를 시계 방향으로 90° 돌린 것과 같게: 입구가 위(12시) 가운데, 트랙은 위 변 왼쪽으로 → 왼쪽 변 아래로 → 바닥 → 오른쪽 변 위로 → 위 변 가운데
    const ring = dedupe([[cx, T],
      ...arc(L + rad, T + rad, -Math.PI / 2, -Math.PI, 6), ...arc(L + rad, B - rad, Math.PI, Math.PI / 2, 6),
      ...arc(R - rad, B - rad, Math.PI / 2, 0, 6), ...arc(R - rad, T + rad, 0, -Math.PI / 2, 6), [cx, T]]);
    const entry = [[cx, -40], [cx, T]];   // 캔버스 위쪽 끝 밖에서 들어온다 (가로의 왼쪽 입구에 해당)
    const path = dedupe([...entry, ...ring]);
    const loopAt = T - entry[0][1];
    const gapX = 150, gapY = 118;
    const spots = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) spots.push([cx + (c - 1) * gapX, MID + (r - 2) * gapY]);
    return { path, path2: null, airPts: null, spots, spots2: [], portals: [], center: null, noGoal: true, loopAt,
             roads: [entry, ring], board: { x: cx - 210, y: MID - 310, w: 420, h: 620, cols: 3, rows: 5, gapX, gapY }, track: { L, R, T, B, rad, mid: MID } };
  }

  // 아레나 맵에 레이아웃을 (다시) 굽는다. 캔버스 크기가 화면 비율을 따르므로 game.js 가 판 시작·회전·리사이즈 때마다 부른다.
  function layoutArena(inf, W, H, inset) {
    const L = inf.arenaPortrait ? buildArenaLayoutPortrait(W, H, inset) : buildArenaLayout(W, H, inset);
    inf.path = L.path; inf.path2 = L.path2; inf.airPts = L.airPts; inf.spots = L.spots; inf.spots2 = L.spots2;
    inf.portals = L.portals; inf.center = L.center; inf.board = L.board; inf.track = L.track;
    inf.noGoal = L.noGoal; inf.roads = L.roads; inf.loopAt = L.loopAt;
    if (W && H) inf.canvas = [W, H];
    inf.inset = { top: (inset && inset.top) || 0, bottom: (inset && inset.bottom) || 0 };
    return inf;
  }

  // 아레나 레이아웃 기본 적용 (기본 캔버스 크기. 실제 판에서는 game.js 가 화면 비율로 다시 굽는다)
  for (const inf of maps.filter((m) => m.arena)) layoutArena(inf, inf.canvas[0], inf.canvas[1]);

  // ===== 걷기 시트 순차 연결 =====
  // 13~24번째 적과 보스 1~10 은 시트 파일이 아직 없어도 미리 연결해 둔다.
  // 파일이 없으면 game.js 가 정지컷으로 폴백하므로 안전하다. (프롬프트: ART-PROMPTS.md)
  const NEXT_WALK = [
    'squirrel', 'hedgehog', 'duck', 'panda', 'koala', 'catsamurai', 'goat', 'otter', 'tanuki', 'wolf', 'boar', 'mouse',           // 13~24
    'chameleon', 'seahorse', 'alpaca', 'beaver', 'snake', 'porcupine', 'kiwi', 'rhino', 'hippo', 'capybara', 'axolotl', 'meerkat', // 25~36
  ];
  const camel = (id) => id.charAt(0).toUpperCase() + id.slice(1);
  for (const b of bases) {
    if (b.walk || !NEXT_WALK.includes(b.id)) continue;
    b.walk = 'c' + camel(b.id) + 'Walk';
    b.walkSrc = b.src.replace(/\.png$/, '-walk-2x2.png');
  }
  const BOSS_WALK_COUNT = 10;
  bossBases.slice(0, BOSS_WALK_COUNT).forEach((b) => {
    if (b.walk) return;
    b.walk = b.sprite + 'Walk';
    b.walkSrc = b.src.replace(/\.png$/, '-walk-2x2.png');
  });

  const ADJ = ['꼬마','숲','사탕','해변','눈꽃','달빛','황금','그림자','불꽃','이슬','돌','바람','꿀','구름','별','호박','산호','이끼','진주','장난','민트','코코아','벚꽃','밤하늘','햇살'];
  const RANK = ['신병','정찰','순찰','특공','정예','대장','파수','약탈','유랑','친위'];
  const species = [];
  for (let i = 0; i < 500; i++) {
    const b = bases[i % bases.length];
    const name = ADJ[i % ADJ.length] + ' ' + b.name + ' ' + RANK[Math.floor(i / bases.length) % RANK.length];
    species.push({ id: i, name, base: b.id, hue: (i * 47) % 360, hpM: 1 + (i % 7) * 0.06, spM: 1 + (i % 5) * 0.04 });
  }
  const BOSS_TITLE = ['왕','대공','폭군','제왕','군주','대장','수호신','악당','전설','우두머리'];
  const bosses = [];
  for (let i = 0; i < 100; i++) {
    const b = bossBases[i % bossBases.length];
    bosses.push({
      id: i,
      name: ADJ[i % ADJ.length] + ' ' + b.name + ' ' + BOSS_TITLE[i % BOSS_TITLE.length],
      base: b.id,
      hue: (i * 33) % 360,
      hpM: 1 + i * 0.08,
    });
  }
  // ===== 50 스테이지 (맵당 1개) =====
  // 각 스테이지: 고정 맵 1개, 웨이브 수(마지막 웨이브=보스), 테마 몬스터풀(땅/공중/땅굴 혼합), 보스, 젬 보상.
  const groundIds = bases.filter((b) => b.move === 'ground').map((b) => b.id);
  const airIds = bases.filter((b) => b.move === 'air').map((b) => b.id);
  const burrowIds = bases.filter((b) => b.move === 'burrow').map((b) => b.id);
  const pickN = (arr, off, cnt, step) => {
    const r = [];
    for (let k = 0; k < cnt; k++) r.push(arr[(off + k * step) % arr.length]);
    return r;
  };
  const stages = maps.filter((m) => !m.infinity).map((m, i) => {
    const n = i + 1;
    const T = tierOf(n);
    // 티어가 오를수록 공중·땅굴 비중이 커진다 (전용 레인이 생기므로)
    const gN = T.tier >= 4 ? 4 : 5;
    const aN = T.tier >= 2 ? 3 : 2;
    const bN = T.tier >= 3 ? 3 : 2;
    const pool = [
      ...pickN(groundIds, i * 4, gN, 3),
      ...pickN(airIds, i * 3, aN, 2),
      ...pickN(burrowIds, i * 2, bN, 2),
    ];
    return {
      n,
      tier: T.tier,
      tierName: T.name,
      tierColor: T.color,
      mapKey: m.key,
      name: m.name,
      waves: 8 + Math.floor(i / 5),      // 8 ~ 17
      bases: pool,
      bossIndex: i % bossBases.length,
      gem: 8 + Math.floor(i / 2) + (T.tier - 1) * 2, // 최초 클리어 보상 젬
      // ---- 밸런스 (game.js 가 그대로 읽는다) ----
      hpScale: +(T.hpScale * Math.pow(1.02, i)).toFixed(3),  // 스테이지 기본 HP 배율 (S1 1.0 → S50 약 5.5)
      waveGrowth: 1.07,                                      // 웨이브마다 HP ×1.07
      countBase: 8 + T.countBonus,                           // 웨이브당 기본 마릿수
      goldMult: +(1 + i * 0.02).toFixed(3),                  // 적 처치 골드 배율 (석단이 늘어난 만큼 수입도)
      startGold: T.startGold + i * 4,                        // 시작 골드 (S1 130 → S50 546)
      lanes: T.lanes.length,
    };
  });

  // ===== 인피니티 모드 =====
  // 50 스테이지를 모두 클리어하면 해금. 웨이브 상한 없음, 목숨 0 이면 런 종료. game.js 가 이 값을 그대로 읽는다.
  // ===== 인피니티 로스터: 웨이브 하나 = 몬스터 한 종류 (메운디 라운드표 방식) =====
  // 101웨이브 한 사이클. 크기 클래스(sizeSeq)로 후보를 거르고, 이동형은 주기(4의 배수 공중, 7의 배수 땅굴, 나머지 땅),
  // hp 오름차순 풀에서 진행도(w/101) 위치의 아직 안 쓴 종을 뽑는다 → 초반 약한 종, 후반 튼튼한 종, 사이클 안 중복 없음.
  const TANK_IDS = new Set(['turtle', 'snail', 'pebblegolem', 'pillbug', 'porcupine', 'arma', 'pangolin', 'walrus', 'rhino', 'elephant', 'bison', 'yak', 'watermelon', 'chessrook', 'daruma', 'clam', 'oyster', 'seaurchin', 'saintbernard', 'newfoundland', 'greatdane', 'durian', 'hippo', 'crocodile', 'manatee', 'dugong']);
  const ROSTER_OVERRIDES = {}; // { [웨이브]: baseId } — 손으로 바꾸고 싶을 때
  const sizeClassOf = (b) => (b.size <= 42 ? 'S' : b.size <= 48 ? 'M' : 'L');
  // 겉보기 강함 1(귀여움·소품)~5(맹수·괴물). 그림을 보고 적은 look 이 있으면 그것, 없으면 hp 로 추정
  const lookOf = (b) => b.look || (b.hp < 30 ? 1 : b.hp < 45 ? 2 : b.hp < 60 ? 3 : b.hp < 80 ? 4 : 5);
  // 보스도 겉보기 순: 순번 n(1..10) 의 k 번째 보스 = look·hp 오름차순 목록의 (n-1) + k*10 번째
  let bossPoolCache = null;
  function bossFor(ordinal, k) {
    if (!bossPoolCache) bossPoolCache = bosses.slice().sort((x, y) => { const a = bossBases.find((b) => b.id === x.base), b2 = bossBases.find((b) => b.id === y.base); return lookOf(a) - lookOf(b2) || a.hp - b2.hp || (x.base < y.base ? -1 : 1); });
    const n = Math.max(1, ordinal | 0);
    return bossPoolCache[((n - 1) + (k | 0) * 10) % bossPoolCache.length];
  }
  function buildInfinityRoster(sizeSeq) {
    const used = new Set(), roster = [];
    // 마지막 웨이브부터 거꾸로 배정: 가장 강해 보이는 종이 101 근처에 오고, 남는 것은 약한 쪽이 떨어져 나간다
    const slots = [];
    for (let w = 101; w >= 1; w--) {
      const c = sizeSeq[w - 1];
      if (w % 10 === 0) { slots.push({ w, cls: c, boss: true }); continue; }
      let move = w % 7 === 0 ? 'burrow' : w % 4 === 0 ? 'air' : 'ground';
      // 그림을 검토해 look·faceLeft 를 적어 둔 종을 우선 쓴다 (방향·강함 순서가 보장된 그림). 모자라면 전체에서
      // 겉보기 강함(look) 순서가 우선이고, 크기 등급(S/M/L)은 같은 look 안에서의 선호일 뿐이다 — 크기 등급은 sizeScale·개수로 따로 표현된다
      const filt = (mv, reviewed) => bases.filter((b) => (!mv || b.move === mv) && !used.has(b.id) && (!reviewed || b.look));
      let pool = filt(move, true);
      if (!pool.length) pool = filt(move, false);
      if (!pool.length) { move = 'ground'; pool = filt('ground', true); }
      if (!pool.length) pool = filt('ground', false);
      if (!pool.length) pool = filt(null, false);
      pool.sort((a, b) => lookOf(b) - lookOf(a) || (sizeClassOf(a) === c ? 0 : 1) - (sizeClassOf(b) === c ? 0 : 1) || b.hp - a.hp || (a.id < b.id ? -1 : 1));
      // 남은 것 중 가장 강해 보이는 것부터 (거꾸로 배정) — 웨이브가 오를수록 강해 보이는 순서가 이동형별로 단조롭게 유지된다
      const ov = ROSTER_OVERRIDES[w] && bases.find((b) => b.id === ROSTER_OVERRIDES[w]);
      const pick = ov || pool[0];
      used.add(pick.id);
      slots.push({ w, id: pick.id, cls: c, move: pick.move, tank: TANK_IDS.has(pick.id) });
    }
    slots.sort((a, b) => a.w - b.w);
    roster.push(...slots);
    return roster;
  }

  // ---- 101웨이브 몬스터 설계 (ART-PROMPTS.md §6): 10단계 테마 × 10웨이브 + 보스 ----
  // 그림이 들어온 웨이브만 INF_ART_READY 에 적는다 (보스 부관은 '20-2' 처럼). 적힌 웨이브는 새 그림·새 이름을 쓰고, 나머지는 기존 로스터 그림으로 돈다.
  const INF_TIERS = ['', '폐허의 잡졸', '숲의 야수', '늪과 동굴', '산적과 고블린', '왕국의 병사와 기사', '언데드', '마법 생물과 정령', '용족과 거대 야수', '악마', '심연과 파멸'];
  // 단계 팔레트 (10웨이브마다 색이 조금씩 바뀐다). tools/inf-jobs.mjs 는 피·살갗 등 기존 명칭을 의상·장비 색으로 해석하고 고어 금지·명암 가독성 규칙을 우선한다.
  const INF_PALETTE = ['',
    { ko: '핏빛 녹 · 마른 피 · 잿빛 살갗', en: 'rust red, dried blood, ash-grey skin, small ember accents' },
    { ko: '검은 털 · 먹빛 초록 · 탁한 호박색 눈', en: 'black fur and feathers, ink-dark green, dull amber eyes, dried mud' },
    { ko: '탁한 청록 · 검보라 · 독의 점광', en: 'murky teal, black-purple, faint toxic glints on wet chitin' },
    { ko: '와인빛 자주 · 검은 가죽 · 녹슨 쇠', en: 'wine-purple cloth, black leather, rusted iron' },
    { ko: '검푸른 강철 · 검붉은 휘장 · 바랜 금', en: 'blued black steel, dark red banners, tarnished gold' },
    { ko: '창백한 뼈 · 검보라 그림자 · 차가운 회청 빛', en: 'pale bone, black-violet shadow, cold grey-blue glow' },
    { ko: '짙은 보라 · 자수정 · 검은 마력 연기', en: 'deep violet, amethyst, black arcane smoke' },
    { ko: '검붉은 비늘 · 흑요석 · 꺼져가는 불씨', en: 'dark crimson scales, obsidian, smoldering embers' },
    { ko: '지옥의 진홍 · 검은 뿔 · 살 틈의 주홍빛', en: 'hellish crimson, black horns, dim orange glow in skin cracks' },
    { ko: '심연의 검정 · 보라 공허 광채 · 별빛 눈', en: 'abyssal black, violet void glow, star-like eyes' },
  ];
  const INF_MONSTERS = {
    // 1~10: 덩어리감 있는 페인터리 판타지 게임 캐릭터, 고어·신체 훼손·실사 공포 제외 (tools/inf-roster.json · ART-PROMPTS §6). 그림이 INF_ART_READY 에 적힌 뒤에만 이 이름·그림이 쓰인다
    // 리깅 시트의 walkStride는 원본 PNG 픽셀 단위 한 주기의 전진 거리. 런타임이 실제 표시 높이로 환산한다.
    1: { name: '역병쥐', cls: 'S', move: 'ground', tier: 1, walk: '4x2', stabilize: false, walkStride: 86.15384615384615 },
    2: { name: '해골 잡졸', cls: 'S', move: 'ground', tier: 1, walk: '4x2', stabilize: false, walkStride: 158.544 },
    3: { name: '묘지 오우거', cls: 'L', move: 'ground', tier: 1, walk: '4x2', stabilize: false, walkStride: 160.848 },
    4: { name: '까마귀 정찰병', cls: 'S', move: 'air', tier: 1 },
    5: { name: '고블린 창병', cls: 'M', move: 'ground', tier: 1, walk: '4x2', stabilize: false, walkStride: 161.1 },
    // 6~10 도 폐허의 잡졸로 재설계 (구 얼룩젖소·왕두더지·꿀벌·골목거위·황금 숫양). 프롬프트는 tools/inf-roster.json
    6: { name: '썩은 멧돼지', cls: 'L', move: 'ground', tier: 1, walk: '4x2', stabilize: false, walkStride: 104.61538461538461 },
    7: { name: '무덤 파는 구울', cls: 'L', move: 'burrow', tier: 1, walk: '4x2', stabilize: false, walkStride: 159.248 },
    8: { name: '시체파리 떼', cls: 'S', move: 'air', tier: 1 },
    9: { name: '녹슨 철갑 오크', cls: 'L', move: 'ground', tier: 1, walk: '4x2', stabilize: false, walkStride: 146.104 },
    10: { boss: true, name: '역병 쥐왕', second: null, cls: 'L', tier: 1 },
    11: { name: '도토리다람쥐', cls: 'S', move: 'ground', tier: 2 },
    12: { name: '수리부엉이', cls: 'L', move: 'air', tier: 2 },
    13: { name: '아기여우', cls: 'S', move: 'ground', tier: 2 },
    14: { name: '오소리', cls: 'L', move: 'burrow', tier: 2 },
    15: { name: '도적너구리', cls: 'M', move: 'ground', tier: 2 },
    16: { name: '검독수리', cls: 'L', move: 'air', tier: 2 },
    17: { name: '회색늑대', cls: 'M', move: 'ground', tier: 2 },
    18: { name: '가시고슴도치', cls: 'S', move: 'ground', tier: 2 },
    19: { name: '불곰', cls: 'L', move: 'ground', tier: 2 },
    20: { boss: true, name: '고목 정령', second: '거대 수사슴', cls: 'L', tier: 2 },
    21: { name: '늪지렁이', cls: 'S', move: 'burrow', tier: 3 },
    22: { name: '왕두꺼비', cls: 'L', move: 'ground', tier: 3 },
    23: { name: '도롱뇽', cls: 'S', move: 'ground', tier: 3 },
    24: { name: '왕모기', cls: 'S', move: 'air', tier: 3 },
    25: { name: '동굴거미', cls: 'M', move: 'ground', tier: 3 },
    26: { name: '독전갈', cls: 'S', move: 'ground', tier: 3 },
    27: { name: '늪악어', cls: 'L', move: 'ground', tier: 3 },
    28: { name: '개미귀신', cls: 'L', move: 'burrow', tier: 3 },
    29: { name: '아나콘다', cls: 'L', move: 'ground', tier: 3 },
    30: { boss: true, name: '두꺼비 마녀', second: '박쥐 군주', cls: 'S', tier: 3 },
    31: { name: '고블린 정찰병', cls: 'S', move: 'ground', tier: 4 },
    32: { name: '고블린 글라이더', cls: 'S', move: 'air', tier: 4 },
    33: { name: '방패 고블린', cls: 'S', move: 'ground', tier: 4 },
    34: { name: '오크 전사', cls: 'L', move: 'ground', tier: 4 },
    35: { name: '트롤 굴착병', cls: 'L', move: 'burrow', tier: 4 },
    36: { name: '와이번 기수', cls: 'L', move: 'air', tier: 4 },
    37: { name: '홉고블린 궁수', cls: 'M', move: 'ground', tier: 4 },
    38: { name: '코볼트', cls: 'S', move: 'ground', tier: 4 },
    39: { name: '산적 두목', cls: 'M', move: 'ground', tier: 4 },
    40: { boss: true, name: '고블린 왕', second: '오우거 장사', cls: 'S', tier: 4 },
    41: { name: '방패병', cls: 'L', move: 'ground', tier: 5 },
    42: { name: '공병', cls: 'M', move: 'burrow', tier: 5 },
    43: { name: '창기병', cls: 'L', move: 'ground', tier: 5 },
    44: { name: '그리폰 기사', cls: 'L', move: 'air', tier: 5 },
    45: { name: '중장기사', cls: 'L', move: 'ground', tier: 5 },
    46: { name: '종자', cls: 'S', move: 'ground', tier: 5 },
    47: { name: '석궁병', cls: 'M', move: 'ground', tier: 5 },
    48: { name: '페가수스 기사', cls: 'L', move: 'air', tier: 5 },
    49: { name: '굴착 노움', cls: 'S', move: 'burrow', tier: 5 },
    50: { boss: true, name: '강철 성주', second: '공성 골렘', cls: 'L', tier: 5 },
    51: { name: '좀비', cls: 'L', move: 'ground', tier: 6 },
    52: { name: '도깨비불', cls: 'S', move: 'air', tier: 6 },
    53: { name: '해골 병사', cls: 'M', move: 'ground', tier: 6 },
    54: { name: '뼈다귀 강아지', cls: 'S', move: 'ground', tier: 6 },
    55: { name: '구울', cls: 'L', move: 'ground', tier: 6 },
    56: { name: '무덤손', cls: 'L', move: 'burrow', tier: 6 },
    57: { name: '해골 기사', cls: 'L', move: 'ground', tier: 6 },
    58: { name: '저주 인형', cls: 'S', move: 'ground', tier: 6 },
    59: { name: '밴시', cls: 'M', move: 'ground', tier: 6 },
    60: { boss: true, name: '리치', second: '뼈 용', cls: 'L', tier: 6 },
    61: { name: '불 정령', cls: 'M', move: 'ground', tier: 7 },
    62: { name: '서리 요정', cls: 'S', move: 'ground', tier: 7 },
    63: { name: '흙 정령', cls: 'S', move: 'burrow', tier: 7 },
    64: { name: '천둥새', cls: 'M', move: 'air', tier: 7 },
    65: { name: '바위 골렘', cls: 'L', move: 'ground', tier: 7 },
    66: { name: '수정 정령', cls: 'L', move: 'ground', tier: 7 },
    67: { name: '마법 고양이', cls: 'S', move: 'ground', tier: 7 },
    68: { name: '살아있는 마도서', cls: 'S', move: 'air', tier: 7 },
    69: { name: '수정 골렘', cls: 'L', move: 'ground', tier: 7 },
    70: { boss: true, name: '대마법사', second: '폭풍 정령', cls: 'S', tier: 7 },
    71: { name: '드레이크', cls: 'L', move: 'ground', tier: 8 },
    72: { name: '새끼용', cls: 'S', move: 'air', tier: 8 },
    73: { name: '매머드', cls: 'L', move: 'ground', tier: 8 },
    74: { name: '도마뱀 인간', cls: 'S', move: 'ground', tier: 8 },
    75: { name: '코카트리스', cls: 'S', move: 'ground', tier: 8 },
    76: { name: '와이번', cls: 'S', move: 'air', tier: 8 },
    77: { name: '모래 벌레', cls: 'S', move: 'burrow', tier: 8 },
    78: { name: '베히모스', cls: 'L', move: 'ground', tier: 8 },
    79: { name: '용 전사', cls: 'M', move: 'ground', tier: 8 },
    80: { boss: true, name: '화룡', second: '히드라', cls: 'M', tier: 8 },
    81: { name: '임프', cls: 'S', move: 'ground', tier: 9 },
    82: { name: '헬하운드', cls: 'M', move: 'ground', tier: 9 },
    83: { name: '지옥 오우거', cls: 'L', move: 'ground', tier: 9 },
    84: { name: '지옥 벌레', cls: 'L', move: 'burrow', tier: 9 },
    85: { name: '그림자 악귀', cls: 'S', move: 'ground', tier: 9 },
    86: { name: '임프 주술사', cls: 'S', move: 'ground', tier: 9 },
    87: { name: '화염 악마', cls: 'L', move: 'ground', tier: 9 },
    88: { name: '가고일', cls: 'S', move: 'air', tier: 9 },
    89: { name: '지옥 기사', cls: 'L', move: 'ground', tier: 9 },
    90: { boss: true, name: '마왕', second: '구덩이 악마', cls: 'L', tier: 9 },
    91: { name: '심연 촉수', cls: 'S', move: 'burrow', tier: 10 },
    92: { name: '공허의 눈', cls: 'S', move: 'air', tier: 10 },
    93: { name: '심연 거인', cls: 'L', move: 'ground', tier: 10 },
    94: { name: '파멸 기사', cls: 'L', move: 'ground', tier: 10 },
    95: { name: '그림자 암살자', cls: 'M', move: 'ground', tier: 10 },
    96: { name: '파멸 까마귀', cls: 'S', move: 'air', tier: 10 },
    97: { name: '공허 골렘', cls: 'L', move: 'ground', tier: 10 },
    98: { name: '공허 벌레', cls: 'M', move: 'burrow', tier: 10 },
    99: { name: '흑요석 거상', cls: 'L', move: 'ground', tier: 10 },
    100: { boss: true, name: '파멸의 군주', second: '공허 용', cls: 'S', tier: 10 },
    101: { name: '종말의 사자', cls: 'M', move: 'ground', tier: 10 },
  };
  const INF_ART_READY = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);   // 예: [1, 2, 3, '10', '20-2'] — casual/enemies/inf/w001.png … casual/bosses/inf/b020-2.png
  const pad3 = (n) => String(n).padStart(3, '0');
  // Directional art has its own reviewed manifest. The legacy artReady set remains the fallback/size contract.
  function infDirectionalArt(w, k) {
    const n = (Math.max(1, w) - 1) % 101 + 1, m = INF_MONSTERS[n];
    if (!m || (k && (!m.boss || (!m.second && w <= 101)))) return null;
    const extremeId = `${m.boss ? 'b' : 'w'}${pad3(n + 101)}${k ? '-2' : ''}`;
    const legacyId = `${m.boss ? 'b' : 'w'}${pad3(n)}${k && n !== 10 ? '-2' : ''}`;
    const ids = w > 101 ? [extremeId, legacyId] : [legacyId];
    for (const assetId of ids) {
      const manifest = assetId === extremeId ? window.INF_EXTREME_ART : window.INF_DIRECTIONAL_ART;
      const entry = manifest && manifest.entries && manifest.entries[assetId];
      if (entry && entry.ready === true) return { assetId, name: entry.name || (k ? m.second || m.name + ' 부관' : m.name), entry };
    }
    return null;
  }
  // 웨이브 w 의 새 그림 (준비된 것만): 일반 { key, src, walkKey, walkSrc } · 보스 k(0 군주·1 부관) { key, src, name }
  function infArt(w, k) {
    const m = INF_MONSTERS[w];
    if (!m) return null;
    const revision = w >= 1 && w <= 10 ? '?v=92' : ''; // 이번 납품 아트만 새 URL로 로드한다.
    if (m.boss) {
      const tag = k ? `${w}-2` : String(w);
      if (!INF_ART_READY.has(tag) && !INF_ART_READY.has(k ? tag : w)) return null;
      const name = k ? m.second : m.name;
      return name ? { key: `infB${tag}`, src: `casual/bosses/inf/b${pad3(w)}${k ? '-2' : ''}.png${revision}`, name } : null;
    }
    if (!INF_ART_READY.has(w) && !INF_ART_READY.has(String(w))) return null;
    // 격자는 m.walk ('2x2' 기본 · '3x2' 6프레임 · '4x2' 8프레임)를 파일명에서 읽는다.
    // 리깅 시트는 stabilize:false로 원본 좌표·크기를 보존하고 walkStride로 이동 거리에 맞춰 재생한다. 기존 hop도 안정화하지 않는다.
    return { key: `infW${w}`, src: `casual/enemies/inf/w${pad3(w)}.png${revision}`, walkKey: `infW${w}Walk`, walkSrc: `casual/enemies/inf/w${pad3(w)}-walk-${m.walk || '2x2'}.png${revision}`, name: m.name, stabilize: m.stabilize !== false && !m.hop, anchor: m.move === 'air' ? 'center' : 'foot', walkStride: m.walkStride || 0 };
  }
  // 로더용: 준비된 새 그림 전부 [{ key, src }, { key(walk), src, sheet: true }]
  function infArtList() {
    const out = [];
    for (let w = 1; w <= 101; w++) {
      const m = INF_MONSTERS[w]; if (!m) continue;
      if (m.boss) { for (let k = 0; k < 2; k++) { const a = infArt(w, k); if (a) out.push({ key: a.key, src: a.src }); } continue; }
      const a = infArt(w, 0); if (!a) continue;
      out.push({ key: a.key, src: a.src });
      out.push({ key: a.walkKey, src: a.walkSrc, sheet: true, optional: true, stabilize: a.stabilize, anchor: a.anchor, walkStride: a.walkStride });
    }
    return out;
  }

  const INFINITY = {
    mapKey: 'cInf',
    tier: { tier: 6, name: '무한', color: '#ff7ad9', lanes: ['ground'], extraSpots: 0, hpScale: 1, countBonus: 0, startGold: 400 }, // 랜덤다이스식: 트랙 하나(공중·땅굴 적도 같은 트랙), 석단 15개 처음부터 전부
    startGold: 400, lives: 20, intermission: 6,
    rangeBonus: 160, // 인피니티는 사거리를 크게: 가운데 칸(512,300)에서 트랙 가장 먼 지점(모서리 호 바깥, 284px)까지 가장 짧은 타워(135)도 닿는다
    fieldCap: 200,   // 필드 한계선: 살아있는 적이 이 수를 넘는 순간 가장 먼저 스폰된 적이 사라지며 목숨 차감 (보스면 즉시 런 종료)
    capDmg: 1,       // 한계선으로 사라지는 적 1마리당 목숨
    // 보물상자 갓챠 — 스타크래프트 유즈맵 '메이플 운빨 디펜스(메운디)'의 등급·확률·경제를 그대로 옮겼다.
    //  등급 9개: 일반 50% · 레어 33.1% · 고대 10.2% · 유물 5.1% · 서사 0.8% · 전설 0.5% · 에픽 0.2% · 신화 0.08% · 태초 0.019% (합 100.099%, 원작 그대로)
    //  등급 → 주사위: 일반 d1(1★ 확정) · 레어 d4 · 고대 d6 · 유물 d8 · 서사 d12 · 전설 d20 · 에픽 d20(14★↑) · 신화 d20(18★↑) · 태초 20★ 확정
    //  경제: 원작 시작 25미네랄·뽑기 10(2.5회) → 시작 400G·상자 160G 고정(회차 상승 없음)
    //  보스 처치 보상은 bossReward(w) 스케줄(원작 24/37/58/79/90/95/96~100R)
    chest: {
      cost: () => 160,
      table: [['d1', 0.50], ['d4', 0.331], ['d6', 0.102], ['d8', 0.051], ['d12', 0.008], ['d20', 0.005], ['epic', 0.002], ['myth', 0.0008], ['primal', 0.00019]],
      kinds: ['d1', 'd4', 'd6', 'd8', 'd12', 'd20', 'epic', 'myth', 'primal'],
      sides: { d1: 1, d4: 4, d6: 6, d8: 8, d12: 12, d20: 20, epic: 20, myth: 20, primal: 20 },
      min:   { d1: 1, d4: 1, d6: 1, d8: 1, d12: 1, d20: 1, epic: 14, myth: 18, primal: 20 },
      grade: { d1: '일반', d4: '레어', d6: '고대', d8: '유물', d12: '서사', d20: '전설', epic: '에픽', myth: '신화', primal: '태초' },
      label: { d1: '외눈 주사위', d4: '4면체', d6: '6면체', d8: '8면체', d12: '12면체', d20: '20면체', epic: '에픽 20면체', myth: '신화 20면체', primal: '태초 주사위' },
      shape: { d1: 'd1', d4: 'd4', d6: 'd6', d8: 'd8', d12: 'd12', d20: 'd20', epic: 'd20', myth: 'd20', primal: 'd20' },
      bossPick: ['d8', 'd12', 'd20'], // (구) 무작위 보스 보상 — 이제 INFINITY.bossReward 스케줄을 쓴다
      rank(k) { return this.kinds.indexOf(k); },
      roll(kind) { const lo = this.min[kind] || 1, hi = this.sides[kind] || 6; return lo + Math.floor(Math.random() * (hi - lo + 1)); },
      draw(wave) {
        let v = Math.random(), k = 'd4';
        for (const [kk, p] of this.table) { if (v < p) { k = kk; break; } v -= p; }
        return k; // 라운드 락(5웨이브 전 전설 금지)은 원작에서 몰래 넣었다가 조작으로 밝혀진 요소라 넣지 않는다
      },
    },
    // ---- 메운디 상성: 타워 공격형(진동 vib / 폭발 exp / 일반 norm) × 몬스터 크기(소 S / 중 M / 대 L) ----
    sizeMult: { vib: { S: 1, M: 0.5, L: 0.25 }, exp: { S: 0.5, M: 0.75, L: 1 }, norm: { S: 1, M: 1, L: 1 } },
    sizeName: { S: '소형', M: '중형', L: '대형' },
    sizeScale: { S: 0.9, M: 1, L: 1.15 },
    // 새 그림(INF_ART_READY)은 base 의 크기와 무관하게 등급별 고정 높이(캔버스 px) — 1~10은 덩어리감 있는 게임 캐릭터 실루엣으로 가독성을 확보한다
    artSize: { S: 42, M: 50, L: 58 },
    artSizeBoss: { S: 96, M: 108, L: 120 },   // 새 보스 정지컷(casual/bosses/inf/bNNN.png), 받침 없이 캐릭터 전신만 — 구 보스 86~92px 보다 크게
    // 원작 1~101R 몬스터 크기 표 그대로 (보스 라운드 포함). 웨이브 w 의 크기 = sizeSeq[(w-1)%101]
    sizeSeq: ('SSLSMLLSLL' + 'SLSLMLMSLL' + 'SLSSMSLLLS' + 'SSSLLLMSMS' + 'LMLLLSMLSL' + 'LSMSLLLSML' + 'MSSMLLSSLS' + 'LSLSSSSLMM' + 'SMLLSSLSLL' + 'SSLLMSLMLSM').split(''),
    sizeOf(w) { return this.sizeSeq[(Math.max(1, w) - 1) % this.sizeSeq.length]; },
    // ---- 로스터: 웨이브 w 에 나오는 단일 몬스터 ----
    roster: null,
    getRoster() { if (!this.roster) this.roster = buildInfinityRoster(this.sizeSeq); return this.roster; },
    countOf(w, cls) { return Math.round(Math.min(36, 12 + Math.floor(w * 0.6)) * ({ S: 1.0, M: 1, L: 0.85 })[cls || 'M']); }, // 소형 ×1.2 는 31~33 소형 연속 구간에서 벽이 너무 높아 1.0 으로
    monsterFor(w) {
      const R = this.getRoster(), cycle = Math.floor((w - 1) / 101), r = R[(w - 1) % 101];
      const hue = cycle ? (cycle * 97) % 360 : 0;
      const evolutionTier = Math.min(3, Math.max(0, cycle - 1));
      const prefix = evolutionTier ? `진화 ${evolutionTier} · ` : cycle ? '극한 · ' : '';
      if (r.boss) return { boss: true, cls: r.cls, hue, prefix, armor: this.armor(w), count: 0, name: '보스' };
      const base = bases.find((b) => b.id === r.id);
      const art = infArt((w - 1) % 101 + 1, 0);   // 새 그림이 준비된 웨이브는 설계된 이름으로 (그림은 game.js 가 spawnEnemy 에서 붙인다)
      const directional = infDirectionalArt(w, 0);
      return { boss: false, base, name: prefix + (directional ? directional.name : art ? art.name : base.name), hue: directional ? 0 : hue, cls: r.cls, move: base.move, tank: r.tank, art,
               count: this.countOf(w, r.cls), armor: this.armor(w) + (r.tank ? 2 + cycle : 0), hpMult: r.tank ? 1.25 : 1 };
    },
    // ---- 방어력: 후반으로 갈수록 타격당 고정 감소, 33의 배수 웨이브는 고방어(버블피시 255) ----
    armor(w) { const base = Math.floor(Math.max(0, w - 30) / 6); return w % 33 === 0 ? Math.max(6, base * 4) : base; }, // w60 5 · w90 10 · 고방어 w33 6 · w66 24 · w99 40 (봇 보정: 33웨이브 벽이 너무 높았다)
    highArmor(w) { return w % 33 === 0; },
    // ---- 보스 보상 스케줄 (1미네랄 = 16G): 24R 50+유물 · 37/58R 50+서사 · 79R 70+전설 · 90R 100+전설 · 95R 150+전설 · 96~100R 유물·서사 추가 ----
    bossReward(w) {
      const n = Math.max(1, this.bossOrdinal(w));
      if (n === 1) return { gold: 800, dice: ['d8'] };
      if (n <= 3) return { gold: 800, dice: ['d12'] };
      if (n === 4) return { gold: 1120, dice: ['d20'] };
      if (n === 5) return { gold: 1600, dice: ['d20'] };
      if (n === 6) return { gold: 2400, dice: ['d20'] };
      return { gold: 1600, dice: ['d20', n % 2 ? 'd8' : 'd12'] };
    },
    bossTimeLimit: 320, // 보스 라운드 5분 20초 안에 못 잡으면 패배
    // 타워 확률강화(도박): 성공하면 한 단계 위 타워, 유지, 소멸 셋 중 하나. 등급이 높을수록 비싸고 위험하다.
    enhance: {
      maxFace: 20,
      cost: (f) => Math.round((160 + 90 * f) / 10) * 10,            // 1눈 250G · 6눈 700G · 12★ 1,240G · 19★ 1,870G
      odds: (f) => {                                                // 6눈 강화 51/유지 33/소멸 16 · 12★ 30/41/29 · 19★ 10/45/45
        const up = Math.max(0.10, 0.72 - 0.035 * f), boom = Math.min(0.45, 0.03 + 0.022 * f);
        return { up, boom, keep: Math.max(0, 1 - up - boom) };
      },
    },
    perks: { epic: [14, 17], myth: [18, 19], primal: [20, 20] }, // 에픽: 방어 무시+락다운 · 신화: 공속 ×1.5 · 태초: 트랙 전체 스플래시
    stun: { p: 0.12, dur: 1.0, bossDur: 0.4 },
    mythRate: 1.5,
    bossEvery: 10,   // 10 웨이브마다 보스 (20 부터 2마리)
    eliteEvery: 5,   // 5 웨이브마다 정예 (HP×3, 크기×1.2, 골드×3)
    unlockAir: 1, unlockBurrow: 1,
    // 순수운빨은 기존 확률/전투 곡선 그대로. 계정 성장은 build/extreme에만 적용한다.
    modes: {
      clear: { key: 'clear', name: '순수운빨', sub: '101웨이브 · 계정 성장 미적용 · 기존 뽑기 확률', gauntlet: true, clearWave: 101, growth: false },
      build: { key: 'build', name: '덱빌드', sub: '101웨이브 · 편성한 5종을 뽑기 · 성장 Lv20까지 적용', gauntlet: true, clearWave: 101, growth: true },
      extreme: { key: 'extreme', name: '극한', sub: '끝없는 웨이브 · 편성 덱과 성장 Lv200까지 적용', gauntlet: false, clearWave: 0, growth: true },
    },
    modeOf(key) { return this.modes[key === 'endless' ? 'extreme' : key] || this.modes.clear; },
    clearWave: 101,   // 도전 모드 클리어 선 (로스터 한 사이클 = 메운디 1~101R)
    clearGems: 80,
    // 최종 관문(도전 모드): 61웨이브부터 체력 배율에 lateExp^(w-lateFrom) 이 한 번 더 곱해진다.
    // lateExp 가 1 미만이면 감산이다 — 초반 60웨이브는 한 톨도 바뀌지 않고 후반만 완만해진다.
    // 예전 값(lateFrom 90 · lateExp 1.08)은 클리어를 소수점대로 묶으려던 장치였는데, 실측은 0 이었다.
    // 지금은 보스가 상성 없이 1배로 받으므로(game.js damageEnemy) 감산이 거의 필요 없다.
    // 봇 클리어율: lateExp 1.00 → 0.4%(256런) · 0.995 → 4.7%(64런) · 0.99 → 14.1%(64런).
    // 채택한 0.9975 는 겹치지 않는 씨앗 1,024런에서 1.37% (14회, 95% 신뢰구간 0.82~2.28%).
    // 목표 1~3% 안이다 (101웨이브 체력이 약 10% 가벼워지는 정도).
    lateFrom: 60, lateExp: 0.9975,
    // ---- 보스 주기는 로스터 기준 (2주기부터 w % 10 과 어긋난다) ----
    isBossWave(w) { const r = this.getRoster()[(Math.max(1, w) - 1) % 101]; return !!(r && r.boss); },
    bossFor,   // (순번, k) → 겉보기 순 보스 (bosses 항목)
    // The slot20 stag keeps its legacy stats, but walks on the ground in every
    // 101-wave cycle. Gameplay movement must not depend on the art cache.
    bossMoveFor(w, k, baseMove) { return k === 1 && (Math.max(1, w) - 1) % 101 + 1 === 20 ? 'ground' : baseMove; },
    monsters: INF_MONSTERS, tiers: INF_TIERS, palette: INF_PALETTE, artReady: INF_ART_READY, art: infArt, artList: infArtList, directionalArt: infDirectionalArt,
    tierIndex(w) { return Math.min(10, Math.floor(((Math.max(1, w) - 1) % 101) / 10) + 1); },
    tierOf(w) { return INF_TIERS[this.tierIndex(w)]; },
    paletteOf(w) { return INF_PALETTE[this.tierIndex(w)]; },
    bossOrdinal(w) { const c = Math.floor((Math.max(1, w) - 1) / 101), i = (Math.max(1, w) - 1) % 101 + 1; return c * 10 + Math.round(i / this.bossEvery); },
    wave(w, gauntlet) {
      const late = gauntlet && w > this.lateFrom ? Math.pow(this.lateExp, w - this.lateFrom) : 1; // lateExp<1 이면 후반 감산
      return {
        hpMult: +Math.min(1e120, 1.8 * Math.pow(1.08, w - 1) * late).toFixed(3), // 기존 곡선 유지. 장기 극한 런도 Infinity/NaN 체력을 만들지 않는다.
        count: Math.min(36, 12 + Math.floor(w * 0.6)),
        gap: Math.max(0.3, 0.8 - w * 0.01),
        goldMult: +(1 + w * 0.025).toFixed(3),
        speedMult: Math.min(1.5, 1 + Math.max(0, w - 40) * 0.01),
        bossHp: +(0.7 + w * 0.012).toFixed(2),                 // 보스 개별 보정(hpM)은 인피니티에서 쓰지 않는다
        bosses: this.isBossWave(w) && this.bossOrdinal(w) >= 2 ? 2 : 1,
        elites: w >= 20 ? 3 : 2,
      };
    },
    milestones: [10, 25, 50, 75, 100, 150, 200],
    // 런 종료 젬: 5웨이브당 2 + 최고 기록 갱신 10 + 최초 달성 마일스톤당 15.
    // 인피니티만 해도 상점(스킨 20 · 6눈 90)이 돌아가야 해서 예전 곡선(10웨이브당 2)에서 올렸다.
    gems(wave, claimed, best) {
      let g = Math.floor(wave / 5) * 2;                       // w20 → 8 · w50 → 20 · w101 → 40
      if (best != null && wave > best) g += 10;               // 신기록 보너스
      const newly = [];
      for (const m of this.milestones) if (wave >= m && !(claimed || []).includes(m)) { g += 15; newly.push(m); }
      return { gems: g, newly };
    },
  };
  // 눈별 강화 (SP). 랜덤다이스의 '주사위 파워'.
  const DICE_POWER = {
    maxLv: 10,
    unit: 'G',
    cost: (lv) => 150 + 150 * lv,                 // 랜덤다이스식 골드 파워업: Lv1 150G … Lv10 1,500G (눈당 총 8,250G), 강화할수록 비싸진다
    dmgMult: (lv) => 1 + 0.15 * lv,               // 최대 2.5×
    rangeAdd: (lv) => 3 * lv,
    tier: (lv) => Math.floor(lv / 3),             // 3레벨마다 특수 보너스 1단계 (최대 3)
    special: {
      1: { label: '연사 −6%/3Lv', rate: 0.94 },
      2: { label: '광역 +8/3Lv', splash: 8 },
      3: { label: '피해 +10%/3Lv', dmg: 0.10 },
      4: { label: '둔화 +4%/3Lv', slow: 0.04 },
      5: { label: '연쇄 +1/3Lv', chain: 1 },
      6: { label: '광역 +6·피해 +8%/3Lv', splash: 6, dmg: 0.08 },
    },
  };

  // Visual emitter centers measured in each star PNG's foreground bounding box.
  // They affect muzzle/travel drawing only; targeting and projectile physics retain their origin.
  const STAR_TOWER_EMITTERS = {
    7: [.476015, .367673], 8: [.486486, .284946], 9: [.831461, .323024], 10: [.501253, .196491],
    11: [.493506, .253311], 12: [.490706, .269841], 13: [.498452, .227740], 14: [.493865, .346218],
    15: [.503571, .340604], 16: [.438776, .391231], 17: [.504373, .263699], 18: [.491358, .226131],
    19: [.488950, .263094], 20: [.497706, .243990],
  };
  // Appearance only: kind/shape, odds and rewards remain in INFINITY.chest.
  // Every shape shares the approved worn ivory surface; markings follow its die type.
  // Premium bundles only replace images. Their ownership is held by commerce.
  const DICE_SKINS = {
    defaultId: 'ivory-worn',
    skins: {
      'ivory-worn': {
        materialKey: 'diceMaterialIvoryWorn', material: 'dice/skins/ivory-worn/cube-surface-v98.png', version: 98,
        mark: '#542b30',
        cubeMaterialKey: 'diceMaterialIvoryWorn', cubeMaterial: 'dice/skins/ivory-worn/cube-surface-v98.png', cubeMaterialVersion: 98,
        cubeMark: '#912321',
      },
      royal: { lazy: true, materialKey: 'diceMaterialRoyal', material: 'dice/skins/royal/material-v101.png', version: 101, mark: '#542b30', cubeMark: '#912321' },
      frost: { lazy: true, materialKey: 'diceMaterialFrost', material: 'dice/skins/frost/material-v101.png', version: 101, mark: '#542b30', cubeMark: '#912321' },
      ember: { lazy: true, materialKey: 'diceMaterialEmber', material: 'dice/skins/ember/material-v101.png', version: 101, mark: '#e4a879', cubeMark: '#cc4a38' },
    },
  };
  return {
    maps, towerSkins, STAR_TOWER_EMITTERS, DICE_SKINS, skinLetters: SKIN_LETTERS, bases, bossBases, species, bosses, stages,
    INFINITY, DICE_POWER,
    tiers: TIERS, tierOf, buildLayout, buildArenaLayout, buildArenaLayoutPortrait, layoutArena, makeAvoidFromImage, pathLength, pathAt, pathDist,
    TILE, GW, GH, THEMES, TILE_ASSETS, themeForStage, TEMPLATES_SINGLE, TEMPLATES_DUAL, buildGridLayout, templateForStage,
    mapCount: 50, stageCount: 50,
  };
})();
