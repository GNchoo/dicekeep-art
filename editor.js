'use strict';
/* 주사위 성채 맵 좌표 에디터
   - 기본 흙길(PATH)·석단(SPOTS): content.js MAP_LAYOUTS
   - 하드 티어용 두 번째 흙길(PATH2)·추가 석단(SPOTS2): content.js MAP_LAYOUTS_HARD
   - 티어 미리보기: 코드가 생성하는 하늘길/땅굴/추가 석단을 실제 게임과 같은 계산으로 겹쳐 보여준다. */
(() => {
  const W = 1024, H = 576;
  const SPOT_R = 28;           // game.js 와 동일
  const HIT = 12;              // 점 선택 반경
  const LS_KEY = 'DK_EDITOR_LAYOUTS_v2';

  const C = window.DKCONTENT;
  if (!C || !C.maps) { alert('content.js(DKCONTENT)를 불러오지 못했습니다.'); return; }
  const maps = C.maps;
  const KEYS = ['path', 'path2', 'spots', 'spots2'];
  const LABEL = { path: '흙길', path2: '흙길2', spots: '석단', spots2: '추가석단' };

  const canvas = document.getElementById('edit');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  // ---- 상태 ----
  let layouts = loadLayouts();     // { [mapKey]: { path, path2, spots, spots2 } }
  let mapIdx = 0;
  let mode = 'path';               // KEYS 중 하나
  let previewTier = 0;             // 0 = 끔, 1~5 = 해당 티어 미리보기
  let img = null, imgKey = null;
  let dragIdx = -1;
  const undoStack = [];
  const show = { path: true, spots: true, preview: true };

  // ---- localStorage ----
  function loadLayouts() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
      // v1 데이터 이관
      const old = localStorage.getItem('DK_EDITOR_LAYOUTS_v1');
      if (old) return JSON.parse(old);
    } catch (e) { /* ignore */ }
    return {};
  }
  function saveLayouts() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(layouts)); } catch (e) { /* ignore */ }
  }

  function curKey() { return maps[mapIdx].key; }
  function curLayout() {
    const k = curKey();
    if (!layouts[k]) layouts[k] = {};
    for (const key of KEYS) if (!Array.isArray(layouts[k][key])) layouts[k][key] = [];
    return layouts[k];
  }
  function curPoints() { return curLayout()[mode]; }
  function seedFromContent(m) {
    return {
      path: (m.path || []).map(p => p.slice()),
      path2: (m.path2 || []).map(p => p.slice()),
      spots: (m.spots || []).map(p => p.slice()),
      spots2: (m.spots2 || []).map(p => p.slice()),
    };
  }

  function pushUndo() {
    undoStack.push(JSON.stringify({ k: curKey(), l: curLayout() }));
    if (undoStack.length > 100) undoStack.shift();
  }
  function undo() {
    const snap = undoStack.pop();
    if (!snap) return;
    const s = JSON.parse(snap);
    layouts[s.k] = s.l;
    saveLayouts(); render(); syncPanels();
  }

  // ---- 맵 로딩 ----
  function loadMap() {
    const m = maps[mapIdx];
    imgKey = m.key;
    img = new Image();
    img.onload = () => { if (imgKey === m.key) render(); };
    img.onerror = () => { setStatus('맵 이미지를 불러오지 못했습니다: ' + m.src, true); };
    img.src = m.src;
    if (!layouts[m.key]) { layouts[m.key] = seedFromContent(m); saveLayouts(); }
    // 스테이지 티어를 기본 미리보기로
    const st = C.stages && C.stages[mapIdx];
    if (st && $('tier-preview').value === 'auto') previewTierAuto = st.tier;
    render(); syncPanels();
  }
  let previewTierAuto = 1;
  let avoidFn = null, avoidKey = null;
  function effectiveTier() {
    const v = $('tier-preview').value;
    if (v === 'off') return 0;
    if (v === 'auto') return previewTierAuto;
    return parseInt(v, 10) || 0;
  }

  // ---- 좌표 변환 ----
  function evtToCanvas(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.round((ev.clientX - r.left) / r.width * W),
      y: Math.round((ev.clientY - r.top) / r.height * H),
    };
  }
  function nearestIdx(pts, x, y, lim) {
    let best = -1, bd = lim == null ? HIT : lim;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - x, pts[i][1] - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ---- 겹침 검사 ----
  function distToSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - a[0], py - a[1]);
    let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }
  function distToPath(x, y, path) {
    let md = Infinity;
    for (let i = 0; i < path.length - 1; i++) md = Math.min(md, distToSeg(x, y, path[i], path[i + 1]));
    return md;
  }
  function onRoad(p, l) {
    return (l.path.length > 1 && distToPath(p[0], p[1], l.path) < SPOT_R)
      || (l.path2.length > 1 && distToPath(p[0], p[1], l.path2) < SPOT_R);
  }

  // 미리보기용: 현재 편집값으로 임시 맵 객체를 만들어 게임과 같은 생성기를 돌린다
  function previewLayout() {
    const tier = effectiveTier();
    if (!tier || !C.buildLayout) return null;
    const l = curLayout();
    if (l.path.length < 2) return null;
    const fake = { path: l.path, spots: l.spots, path2: l.path2.length > 1 ? l.path2 : null, spots2: l.spots2.length ? l.spots2 : null };
    // 게임과 같은 물 판정 (배경 픽셀). file:// 이면 null.
    if (avoidKey !== imgKey && img && img.complete && img.naturalWidth && C.makeAvoidFromImage) { avoidFn = C.makeAvoidFromImage(img); avoidKey = imgKey; }
    try { return C.buildLayout(fake, tier, { avoid: avoidFn }); } catch (e) { return null; }
  }

  // ---- 렌더 ----
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, W, H);
    else { ctx.fillStyle = '#0d0b09'; ctx.fillRect(0, 0, W, H); }

    const l = curLayout();
    const pv = show.preview ? previewLayout() : null;

    // 코드 생성 레인 미리보기 (하늘길·땅굴·흙길2 폴백)
    if (pv) {
      for (const lane of pv.lanes) {
        if (lane.kind === 'ground' || lane.kind === 'ground2') continue;
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (lane.kind === 'air') { ctx.translate(0, -42); ctx.setLineDash([5, 12]); ctx.strokeStyle = 'rgba(200,235,255,0.85)'; ctx.lineWidth = 3; }
        else { ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(210,150,80,0.9)'; ctx.lineWidth = 4; }
        strokePath(lane.pts);
        ctx.restore();
        const mid = lane.pts[Math.floor(lane.pts.length / 2)];
        drawLabel([mid[0], Math.max(70, mid[1] - (lane.kind === 'air' ? 42 : 0))], (lane.kind === 'air' ? '☁ ' : '⛏ ') + lane.label + (lane.fallback ? ' (흙길2 없음→대체)' : ''), false);
      }
      // 코드 생성 추가 석단 (spots2 로 직접 찍은 것 이후의 나머지)
      const authored = l.spots.length + l.spots2.length;
      pv.spots.forEach((p, i) => {
        if (i < authored) return;
        drawPad(p, 'rgba(255,200,90,0.9)', 'rgba(255,200,90,0.14)', false, 'auto' + (i - l.spots.length));
      });
    }

    // 흙길 / 흙길2
    for (const key of ['path', 'path2']) {
      if (!show.path || l[key].length < 1) continue;
      const active = mode === key;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = key === 'path' ? 'rgba(232,182,74,0.20)' : 'rgba(255,120,60,0.20)';
      ctx.lineWidth = 46;
      if (l[key].length > 1) strokePath(l[key]);
      ctx.strokeStyle = key === 'path' ? 'rgba(232,182,74,0.9)' : 'rgba(255,120,60,0.9)';
      ctx.lineWidth = 3;
      if (l[key].length > 1) strokePath(l[key]);
      ctx.restore();
      l[key].forEach((p, i) => {
        const isPortal = i === 0, isEnd = i === l[key].length - 1;
        drawDot(p, isPortal ? '#7CFC66' : isEnd ? '#ff6b6b' : (key === 'path' ? '#e8b64a' : '#ff8c50'), active);
        drawLabel(p, (key === 'path2' ? "'" : '') + (isPortal ? 'P' : isEnd ? 'C' : String(i)), active);
      });
    }

    // 석단 / 추가 석단
    if (show.spots) {
      l.spots.forEach((p, i) => drawPad(p, onRoad(p, l) ? 'rgba(255,80,80,0.95)' : 'rgba(95,208,255,0.95)', onRoad(p, l) ? 'rgba(255,80,80,0.22)' : 'rgba(95,208,255,0.16)', mode === 'spots', String(i)));
      l.spots2.forEach((p, i) => drawPad(p, onRoad(p, l) ? 'rgba(255,80,80,0.95)' : 'rgba(180,120,255,0.95)', onRoad(p, l) ? 'rgba(255,80,80,0.22)' : 'rgba(180,120,255,0.16)', mode === 'spots2', '+' + i));
    }
  }
  function drawPad(p, stroke, fill, active, label) {
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.scale(1, 0.5);
    ctx.beginPath(); ctx.arc(0, 0, SPOT_R, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = active ? 3 : 2; ctx.stroke();
    ctx.restore();
    drawLabel([p[0], p[1] - 2], label, active);
  }
  function strokePath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  function drawDot(p, color, active) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], active ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.stroke();
  }
  function drawLabel(p, text, active) {
    ctx.save();
    ctx.font = (active ? 'bold 13px' : '12px') + ' ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, p[0], p[1] - 14);
    ctx.fillStyle = active ? '#fff' : '#d8cfae';
    ctx.fillText(text, p[0], p[1] - 14);
    ctx.restore();
  }

  // ---- 패널 동기화 ----
  function syncPanels() {
    const l = curLayout();
    $('count-path').textContent = '흙길 ' + l.path.length + (l.path2.length ? ' / 흙길2 ' + l.path2.length : '');
    $('count-spots').textContent = '석단 ' + l.spots.length + (l.spots2.length ? ' / 추가 ' + l.spots2.length : '');
    const bad = l.spots.concat(l.spots2).filter(p => onRoad(p, l)).length;
    $('warn-overlap').textContent = bad ? ('⚠ 길 위 석단 ' + bad) : '';
    $('warn-overlap').style.color = bad ? '#ff9f9f' : '';
    const st = C.stages && C.stages[mapIdx];
    const T = effectiveTier();
    $('tier-info').textContent = st ? `스테이지 ${st.n} · ${st.tierName} 티어(T${st.tier}) · 동선 ${st.lanes}` + (T ? ` · 미리보기 T${T}` : '') : '';
    $('json-current').value = JSON.stringify({ key: curKey(), path: l.path, spots: l.spots, path2: l.path2, spots2: l.spots2 });
    $('map-select').value = String(mapIdx);
  }

  function setStatus(msg, err) {
    const el = $('status');
    el.textContent = msg;
    el.className = 'status' + (err ? ' err' : '');
    if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2600);
  }

  // ---- 이벤트: 캔버스 ----
  canvas.addEventListener('mousedown', ev => {
    if (ev.button !== 0) return;
    const { x, y } = evtToCanvas(ev);
    const pts = curPoints();
    const hit = nearestIdx(pts, x, y);
    if (hit >= 0) { dragIdx = hit; return; }
    pushUndo();
    pts.push([x, y]);
    saveLayouts(); render(); syncPanels();
  });
  window.addEventListener('mousemove', ev => {
    if (dragIdx < 0) return;
    const { x, y } = evtToCanvas(ev);
    curPoints()[dragIdx] = [x, y];
    render(); syncPanels();
  });
  window.addEventListener('mouseup', () => {
    if (dragIdx >= 0) { dragIdx = -1; saveLayouts(); }
  });
  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    const { x, y } = evtToCanvas(ev);
    const pts = curPoints();
    const hit = nearestIdx(pts, x, y, SPOT_R);
    if (hit >= 0) { pushUndo(); pts.splice(hit, 1); saveLayouts(); render(); syncPanels(); }
  });

  // ---- 이벤트: 키보드 ----
  window.addEventListener('keydown', ev => {
    if (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'SELECT') return;
    const k = ev.key.toLowerCase();
    if (k === 'z') undo();
    else if (k === 'p') setMode('path');
    else if (k === 'o') setMode('path2');
    else if (k === 's') setMode('spots');
    else if (k === 'a') setMode('spots2');
    else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      const pts = curPoints();
      if (pts.length) { pushUndo(); pts.pop(); saveLayouts(); render(); syncPanels(); }
    } else if (ev.key === 'ArrowRight') gotoMap(mapIdx + 1);
    else if (ev.key === 'ArrowLeft') gotoMap(mapIdx - 1);
  });

  // ---- 컨트롤 ----
  function setMode(m) {
    mode = m;
    for (const key of KEYS) $('mode-' + key).classList.toggle('active', m === key);
    render(); syncPanels();
  }
  function gotoMap(i) {
    mapIdx = (i + maps.length) % maps.length;
    undoStack.length = 0;
    loadMap();
  }

  for (const key of KEYS) $('mode-' + key).onclick = () => setMode(key);
  $('undo').onclick = undo;
  $('prev-map').onclick = () => gotoMap(mapIdx - 1);
  $('next-map').onclick = () => gotoMap(mapIdx + 1);
  $('clear').onclick = () => {
    if (!confirm('현재 맵의 ' + LABEL[mode] + '을(를) 모두 지울까요?')) return;
    pushUndo(); curLayout()[mode] = []; saveLayouts(); render(); syncPanels();
  };
  $('seed').onclick = () => {
    pushUndo();
    layouts[curKey()] = seedFromContent(maps[mapIdx]);
    saveLayouts(); render(); syncPanels();
    setStatus('DKCONTENT 기본 좌표를 불러왔습니다.');
  };
  $('bake-auto').onclick = () => {
    // 코드가 생성한 추가 석단을 spots2 로 굳혀서 직접 손볼 수 있게 한다
    const pv = previewLayout();
    if (!pv) { setStatus('미리보기 티어를 켜야 합니다.', true); return; }
    const l = curLayout();
    const authored = l.spots.length + l.spots2.length;
    const auto = pv.spots.slice(authored);
    if (!auto.length) { setStatus('굳힐 자동 석단이 없습니다.'); return; }
    pushUndo();
    l.spots2 = l.spots2.concat(auto.map(p => p.slice()));
    saveLayouts(); render(); syncPanels();
    setStatus('자동 석단 ' + auto.length + '개를 추가석단(spots2)으로 굳혔습니다. 드래그로 다듬으세요.');
    setMode('spots2');
  };
  $('toggle-path').onchange = e => { show.path = e.target.checked; render(); };
  $('toggle-spots').onchange = e => { show.spots = e.target.checked; render(); };
  $('toggle-preview').onchange = e => { show.preview = e.target.checked; render(); };
  $('tier-preview').onchange = () => { render(); syncPanels(); };

  $('copy-current').onclick = () => copy($('json-current').value, '현재 맵 JSON 복사됨');
  $('apply-current').onclick = () => {
    try {
      const o = JSON.parse($('json-current').value);
      pushUndo();
      layouts[curKey()] = { path: o.path || [], path2: o.path2 || [], spots: o.spots || [], spots2: o.spots2 || [] };
      saveLayouts(); render(); syncPanels();
      setStatus('현재 맵에 적용됨');
    } catch (e) { setStatus('JSON 파싱 실패: ' + e.message, true); }
  };

  const fmt = pts => pts.map(p => `[${p[0]},${p[1]}]`).join(', ');
  function buildAllSnippet() {
    const lines = ['const MAP_LAYOUTS = {'];
    for (const m of maps) {
      const l = layouts[m.key];
      if (!l || (!l.path.length && !l.spots.length)) continue;
      lines.push(`  ${m.key}: { path: [${fmt(l.path)}], spots: [${fmt(l.spots)}] },`);
    }
    lines.push('};');
    lines.push('');
    lines.push('const MAP_LAYOUTS_HARD = {');
    for (const m of maps) {
      const l = layouts[m.key];
      if (!l || ((!l.path2 || !l.path2.length) && (!l.spots2 || !l.spots2.length))) continue;
      const parts = [];
      if (l.path2 && l.path2.length > 1) parts.push(`path2: [${fmt(l.path2)}]`);
      if (l.spots2 && l.spots2.length) parts.push(`spots2: [${fmt(l.spots2)}]`);
      lines.push(`  ${m.key}: { ${parts.join(', ')} },`);
    }
    lines.push('};');
    return lines.join('\n');
  }
  $('export-all').onclick = () => { $('json-all').value = buildAllSnippet(); setStatus('전체 스니펫 생성됨'); };
  $('copy-all').onclick = () => { if (!$('json-all').value) $('json-all').value = buildAllSnippet(); copy($('json-all').value, '전체 스니펫 복사됨'); };
  $('download-all').onclick = () => {
    const text = $('json-all').value || buildAllSnippet();
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'map-layouts.js'; a.click();
    URL.revokeObjectURL(a.href);
  };
  $('import-all').onclick = () => {
    const text = $('json-all').value.trim();
    if (!text) { setStatus('가져올 텍스트가 없습니다.', true); return; }
    try {
      // "const MAP_LAYOUTS = {...}; const MAP_LAYOUTS_HARD = {...};" 또는 순수 객체 모두 허용
      const objs = [];
      const re = /\{[\s\S]*?\n\};/g;
      let m;
      while ((m = re.exec(text))) objs.push((new Function('return (' + m[0].replace(/;$/, '') + ')'))());
      if (!objs.length) { const mm = text.match(/\{[\s\S]*\}/); objs.push((new Function('return (' + (mm ? mm[0] : text) + ')'))()); }
      let n = 0;
      for (const obj of objs) {
        for (const k of Object.keys(obj)) {
          if (!layouts[k]) layouts[k] = { path: [], path2: [], spots: [], spots2: [] };
          for (const key of KEYS) if (Array.isArray(obj[k][key])) layouts[k][key] = obj[k][key];
          n++;
        }
      }
      saveLayouts(); render(); syncPanels();
      setStatus(n + '개 항목 가져옴');
    } catch (e) { setStatus('가져오기 실패: ' + e.message, true); }
  };

  function copy(text, ok) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => setStatus(ok)).catch(() => fallbackCopy(text, ok));
    else fallbackCopy(text, ok);
  }
  function fallbackCopy(text, ok) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); setStatus(ok); } catch (e) { setStatus('복사 실패', true); }
    document.body.removeChild(ta);
  }

  // ---- 맵 셀렉트 채우기 ----
  const sel = $('map-select');
  maps.forEach((m, i) => {
    const o = document.createElement('option');
    const st = C.stages && C.stages[i];
    o.value = String(i);
    o.textContent = `${i + 1}. ${m.name || m.key}` + (st ? ` (T${st.tier})` : '');
    sel.appendChild(o);
  });
  sel.onchange = () => gotoMap(parseInt(sel.value, 10));

  // ---- 시작 ----
  loadMap();
  setMode('path');
})();
