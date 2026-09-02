'use strict';
/* 주사위 성채 맵 그리드 에디터
   맵은 16×9 칸(64px) ASCII 템플릿으로 코드가 설계한다 (content.js TEMPLATES_SINGLE / TEMPLATES_DUAL).
   여기서 칸을 칠해 템플릿을 만들고, 아래 스니펫을 content.js 에 붙여넣는다. 테마 타일은 game.js 가 씌운다. */
(() => {
  const C = window.DKCONTENT;
  if (!C || !C.buildGridLayout) { alert('content.js(DKCONTENT)를 불러오지 못했습니다.'); return; }
  const { TILE, GW, GH } = C;
  const LS_KEY = 'DK_GRID_EDITOR_v1';
  const CHARS = [
    ['.', '평지', '#7fb35a'], ['#', '흙길', '#b48e5c'], ['S', '시작 포탈', '#c26cff'], ['E', '도착 (성)', '#5fd8ff'],
    ['2', '두 번째 길 시작', '#ff9a4a'], ['=', '두 번째 길', '#d9b070'],
    ['~', '물', '#3f8fd6'], ['T', '큰 소품', '#2f6a2a'], ['x', '석단·소품 금지', '#6b6b6b'], ['o', '석단 강제(선택)', '#d8ccb0'],
  ];
  const canvas = document.getElementById('edit');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  // ---- 상태 ----
  let store = load();          // { [tplKey]: rows[] } 편집본
  let list = 'single';         // single | dual
  let index = 0;
  let mirror = false;
  let brush = '#';
  let tier = 'auto';
  let painting = false;
  const undo = [];

  function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }
  const tplKey = () => `${list}:${index}`;
  const baseRows = () => (list === 'dual' ? C.TEMPLATES_DUAL : C.TEMPLATES_SINGLE)[index];
  function rows() { if (!store[tplKey()]) store[tplKey()] = baseRows().slice(); return store[tplKey()]; }
  function setCell(r, c, ch) {
    const rs = rows();
    if (rs[r][c] === ch) return;
    rs[r] = rs[r].slice(0, c) + ch + rs[r].slice(c + 1);
  }
  function stagesUsing() {
    const out = [];
    for (let n = 1; n <= 50; n++) { const t = C.templateForStage(n); if (t.dual === (list === 'dual') && t.index === index) out.push(n + (t.mirror ? 'M' : '')); }
    return out;
  }
  function tierFor() {
    if (tier !== 'auto') return C.tiers[+tier - 1];
    const s = stagesUsing()[0];
    return C.tierOf(s ? parseInt(s, 10) : 1);
  }

  // ---- 검증 ----
  function validate(rs) {
    const errs = [];
    const g = rs.map((r) => r.split(''));
    const nb = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < GH && b >= 0 && b < GW);
    const isMain = (ch) => '#SE'.includes(ch), isSec = (ch) => '2='.includes(ch);
    const count = (ch) => rs.join('').split(ch).length - 1;
    if (count('S') !== 1) errs.push('S 는 1개');
    if (count('E') !== 1) errs.push('E 는 1개');
    if (count('2') > 1) errs.push('2 는 최대 1개');
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      const ch = g[r][c];
      if (isMain(ch)) {
        const d = nb(r, c).filter(([a, b]) => isMain(g[a][b])).length;
        const d2 = nb(r, c).filter(([a, b]) => isSec(g[a][b])).length;
        if ((ch === 'S' || ch === 'E') && d !== 1) errs.push(`${ch}(${r},${c}) 이웃 흙길 ${d}개 (1개여야 함)`);
        if (ch === '#' && d !== 2) errs.push(`흙길(${r},${c}) 이웃 ${d}개 (2개여야 함: 갈라지거나 옆 줄과 붙음)`);
        if (d2 > 1) errs.push(`흙길(${r},${c}) 에 두 번째 길이 ${d2}곳 닿음`);
      }
      if (isSec(ch)) {
        const d = nb(r, c).filter(([a, b]) => isSec(g[a][b])).length + nb(r, c).filter(([a, b]) => isMain(g[a][b])).length;
        if (ch === '2' && d !== 1) errs.push(`2(${r},${c}) 이웃 ${d}개`);
        if (ch === '=' && d !== 2) errs.push(`두 번째 길(${r},${c}) 이웃 ${d}개`);
      }
    }
    const L = C.buildGridLayout(rs, false);
    if (!L.path) errs.push('S→E 가 이어지지 않음');
    if (L.start2 && !L.path2) errs.push('2→흙길 이 이어지지 않음');
    if (L.endCell && L.endCell[0] > 0 && !'.'.includes(g[L.endCell[0] - 1][L.endCell[1]])) errs.push('E 위 칸은 비워 둘 것 (성 그림 자리)');
    const need = 7 + (list === 'dual' ? 8 : 4);
    const padN = L.padCells ? L.padCells.length : 0;
    if (padN < need) errs.push(`석단 후보 ${padN}개 — ${need}개 이상 필요 (길을 더 꺾어 안쪽 칸을 만드세요)`);
    return { errs, L, pads: Math.min(7, padN), extras: Math.max(0, padN - 7) };
  }

  // ---- 그리기 ----
  function render() {
    const rs = rows();
    const v = validate(rs);
    const T = tierFor();
    const L = C.buildGridLayout(rs, mirror);
    const grid = L.grid;
    const th = C.themeForStage(parseInt(stagesUsing()[0] || '1', 10));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      const ch = grid[r][c];
      const def = CHARS.find((x) => x[0] === ch) || CHARS[0];
      ctx.fillStyle = ch === '.' ? th.floor[0] : def[2];
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      if (ch !== '.' && ch !== '#' && ch !== '=') {
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ch, c * TILE + TILE / 2, r * TILE + TILE / 2);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let x = 0; x <= GW; x++) { ctx.beginPath(); ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, GH * TILE); ctx.stroke(); }
    for (let y = 0; y <= GH; y++) { ctx.beginPath(); ctx.moveTo(0, y * TILE); ctx.lineTo(GW * TILE, y * TILE); ctx.stroke(); }
    // 레인 (게임과 같은 계산)
    if (L.path) {
      const m = { path: L.path, path2: L.path2, spots: L.spots, spots2: L.spots2 };
      const lay = C.buildLayout(m, T);
      const col = { ground: '#5a3a14', ground2: '#a34a10', air: '#e8f6ff', tunnel: '#7a4a1a' };
      for (const lane of lay.lanes) {
        if (lane.kind === 'ground2' && !T.lanes.includes('ground2')) continue;
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = col[lane.kind]; ctx.lineWidth = lane.kind === 'air' || lane.kind === 'tunnel' ? 3 : 5;
        if (lane.kind === 'air') ctx.setLineDash([6, 8]); if (lane.kind === 'tunnel') ctx.setLineDash([3, 6]);
        ctx.beginPath(); ctx.moveTo(lane.pts[0][0], lane.pts[0][1]);
        for (let i = 1; i < lane.pts.length; i++) ctx.lineTo(lane.pts[i][0], lane.pts[i][1]);
        ctx.stroke(); ctx.restore();
      }
      lay.spots.forEach(([x, y], i) => {
        ctx.beginPath(); ctx.ellipse(x, y, 26, 13, 0, 0, Math.PI * 2);
        ctx.fillStyle = i < lay.baseSpotCount ? 'rgba(255,255,255,0.35)' : 'rgba(255,212,82,0.35)'; ctx.fill();
        ctx.strokeStyle = i < lay.baseSpotCount ? '#fff' : '#ffd452'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#000'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y);
      });
      $('lane-info').textContent = `T${T.tier} ${T.name}: ${lay.lanes.map((l) => l.label).join(' · ')} / 석단 ${lay.spots.length} (기본 ${lay.baseSpotCount}) / 흙길 ${Math.round(C.pathLength(L.path))}px${L.path2 ? ` / 흙길2 ${Math.round(C.pathLength(L.path2))}px` : ''}`;
    } else $('lane-info').textContent = '';
    // 패널
    $('tpl-title').textContent = `${list === 'dual' ? '두 갈래' : '한 갈래'} #${index}${mirror ? ' (좌우 반전)' : ''} · 쓰는 스테이지: ${stagesUsing().join(', ') || '없음'} · 테마 ${th.name}`;
    const st = $('status');
    st.textContent = v.errs.length ? v.errs.join(' / ') : `OK · 석단 자동 ${v.pads} + 추가 후보 ${v.extras}`;
    st.className = 'status' + (v.errs.length ? ' err' : '');
    if (document.activeElement !== $('tpl-text')) $('tpl-text').value = rs.join('\n');
    $('tpl-snippet').value = '  [ // ' + (list === 'dual' ? '두 갈래' : '한 갈래') + '\n' + rs.map((r, i) => `    '${r}'${i === rs.length - 1 ? '],' : ','}`).join('\n');
  }

  // ---- 입력 ----
  function cellAt(ev) {
    const b = canvas.getBoundingClientRect();
    const x = (ev.clientX - b.left) * canvas.width / b.width, y = (ev.clientY - b.top) * canvas.height / b.height;
    let c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    if (c < 0 || c >= GW || r < 0 || r >= GH) return null;
    if (mirror) c = GW - 1 - c;
    return [r, c];
  }
  function paint(ev, ch) {
    const cell = cellAt(ev); if (!cell) return;
    setCell(cell[0], cell[1], ch); save(); render();
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => { undo.push(rows().slice()); painting = true; paint(e, e.button === 2 ? '.' : brush); });
  canvas.addEventListener('pointermove', (e) => { if (painting) paint(e, (e.buttons & 2) ? '.' : brush); });
  window.addEventListener('pointerup', () => { painting = false; });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    const hit = CHARS.find((x) => x[0].toLowerCase() === e.key.toLowerCase());
    if (hit) { brush = hit[0]; syncPalette(); }
    if (e.key === 'z' || e.key === 'Z') { const s = undo.pop(); if (s) { store[tplKey()] = s; save(); render(); } }
  });

  // ---- UI ----
  const pal = $('palette');
  for (const [ch, label, color] of CHARS) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="swatch" style="background:${color}"></span> ${ch} ${label}`;
    b.dataset.ch = ch;
    b.addEventListener('click', () => { brush = ch; syncPalette(); });
    pal.appendChild(b);
  }
  function syncPalette() { for (const b of pal.children) b.classList.toggle('active', b.dataset.ch === brush); }
  syncPalette();
  const sel = $('tpl-select');
  const fill = () => {
    sel.innerHTML = '';
    C.TEMPLATES_SINGLE.forEach((_, i) => sel.appendChild(new Option(`한 갈래 #${i} (S${1 + i}, S${7 + i}, …)`, `single:${i}`)));
    C.TEMPLATES_DUAL.forEach((_, i) => sel.appendChild(new Option(`두 갈래 #${i} (S${31 + i}, S${37 + i}, …)`, `dual:${i}`)));
    sel.value = tplKey();
  };
  fill();
  sel.addEventListener('change', () => { [list, index] = sel.value.split(':'); index = +index; render(); });
  $('stage-go').addEventListener('change', () => {
    const n = Math.max(1, Math.min(50, +$('stage-go').value || 1));
    const t = C.templateForStage(n);
    list = t.dual ? 'dual' : 'single'; index = t.index; mirror = t.mirror; $('mirror').checked = mirror; sel.value = tplKey(); render();
  });
  $('mirror').addEventListener('change', () => { mirror = $('mirror').checked; render(); });
  $('tier-preview').addEventListener('change', () => { tier = $('tier-preview').value; render(); });
  $('reset').addEventListener('click', () => { undo.push(rows().slice()); store[tplKey()] = baseRows().slice(); save(); render(); });
  $('apply-text').addEventListener('click', () => {
    const lines = $('tpl-text').value.split('\n').map((l) => l.trim()).filter((l) => l.length);
    if (lines.length !== GH || lines.some((l) => l.length !== GW)) { alert(`${GH}줄 × ${GW}글자여야 합니다.`); return; }
    undo.push(rows().slice()); store[tplKey()] = lines; save(); render();
  });
  $('copy-snippet').addEventListener('click', () => { navigator.clipboard.writeText($('tpl-snippet').value).catch(() => {}); });
  $('copy-all').addEventListener('click', () => {
    const dump = (name, base, key) => `  const ${name} = [\n` + base.map((b, i) => (store[`${key}:${i}`] || b).map((r, j, a) => `    '${r}'${j === a.length - 1 ? '],' : ','}`).join('\n')).map((s) => '  [\n' + s).join('\n') + '\n  ];';
    const txt = dump('TEMPLATES_SINGLE', C.TEMPLATES_SINGLE, 'single') + '\n' + dump('TEMPLATES_DUAL', C.TEMPLATES_DUAL, 'dual');
    $('tpl-snippet').value = txt;
    navigator.clipboard.writeText(txt).catch(() => {});
  });
  render();
})();
