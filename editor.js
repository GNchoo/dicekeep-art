'use strict';
/* 주사위 성채 맵 좌표 에디터 — 경로(PATH)/석단(SPOTS)을 각 맵 아트에 맞춰 배치하고 내보낸다. */
(() => {
  const W = 1024, H = 576;
  const SPOT_R = 28;           // game.js 와 동일
  const HIT = 12;              // 점 선택 반경
  const LS_KEY = 'DK_EDITOR_LAYOUTS_v1';

  const C = window.DKCONTENT;
  if (!C || !C.maps) { alert('content.js(DKCONTENT)를 불러오지 못했습니다.'); return; }
  const maps = C.maps;

  const canvas = document.getElementById('edit');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  // ---- 상태 ----
  let layouts = loadLayouts();     // { [mapKey]: { path:[[x,y]..], spots:[[x,y]..] } }
  let mapIdx = 0;
  let mode = 'path';               // 'path' | 'spots'
  let img = null, imgKey = null;
  let dragIdx = -1;
  const undoStack = [];
  const show = { path: true, spots: true };

  // ---- localStorage ----
  function loadLayouts() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return {};
  }
  function saveLayouts() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(layouts)); } catch (e) { /* ignore */ }
  }

  function curKey() { return maps[mapIdx].key; }
  function curLayout() {
    const k = curKey();
    if (!layouts[k]) layouts[k] = { path: [], spots: [] };
    if (!layouts[k].path) layouts[k].path = [];
    if (!layouts[k].spots) layouts[k].spots = [];
    return layouts[k];
  }
  function curPoints() { return curLayout()[mode]; }

  function pushUndo() {
    const l = curLayout();
    undoStack.push(JSON.stringify({ k: curKey(), path: l.path, spots: l.spots }));
    if (undoStack.length > 100) undoStack.shift();
  }
  function undo() {
    const snap = undoStack.pop();
    if (!snap) return;
    const s = JSON.parse(snap);
    layouts[s.k] = { path: s.path, spots: s.spots };
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
    // 처음 여는 맵이면 DKCONTENT의 기존 좌표를 시드로 제공
    if (!layouts[m.key]) {
      layouts[m.key] = {
        path: (m.path || []).map(p => p.slice()),
        spots: (m.spots || []).map(p => p.slice()),
      };
      saveLayouts();
    }
    render(); syncPanels();
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

  // ---- 겹침 검사(석단이 경로 위에 있으면 경고) ----
  function distToPath(x, y, path) {
    let md = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      md = Math.min(md, distToSeg(x, y, path[i], path[i + 1]));
    }
    return md;
  }
  function distToSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - a[0], py - a[1]);
    let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }

  // ---- 렌더 ----
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, W, H);
    else { ctx.fillStyle = '#0d0b09'; ctx.fillRect(0, 0, W, H); }

    const l = curLayout();

    // 경로
    if (show.path && l.path.length) {
      // 흙길 폭 근사 밴드
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(232,182,74,0.20)';
      ctx.lineWidth = 46;
      strokePath(l.path);
      ctx.strokeStyle = 'rgba(232,182,74,0.9)';
      ctx.lineWidth = 3;
      strokePath(l.path);
      ctx.restore();
      // 웨이포인트
      l.path.forEach((p, i) => {
        const isPortal = i === 0, isEnd = i === l.path.length - 1;
        drawDot(p, isPortal ? '#7CFC66' : isEnd ? '#ff6b6b' : '#e8b64a', mode === 'path');
        drawLabel(p, isPortal ? 'P' : isEnd ? 'C' : String(i), mode === 'path');
      });
    }

    // 석단
    if (show.spots) {
      l.spots.forEach((p, i) => {
        const overlap = l.path.length > 1 && distToPath(p[0], p[1], l.path) < SPOT_R;
        ctx.save();
        ctx.translate(p[0], p[1]);
        ctx.scale(1, 0.5);
        ctx.beginPath(); ctx.arc(0, 0, SPOT_R, 0, Math.PI * 2);
        ctx.fillStyle = overlap ? 'rgba(255,80,80,0.22)' : 'rgba(95,208,255,0.16)';
        ctx.fill();
        ctx.strokeStyle = overlap ? 'rgba(255,80,80,0.95)' : (mode === 'spots' ? 'rgba(95,208,255,0.95)' : 'rgba(95,208,255,0.6)');
        ctx.lineWidth = mode === 'spots' ? 3 : 2;
        ctx.stroke();
        ctx.restore();
        drawLabel([p[0], p[1] - 2], String(i), mode === 'spots');
      });
    }
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
    $('count-path').textContent = '경로 ' + l.path.length;
    $('count-spots').textContent = '석단 ' + l.spots.length;
    const bad = l.spots.filter(p => l.path.length > 1 && distToPath(p[0], p[1], l.path) < SPOT_R).length;
    $('warn-overlap').textContent = bad ? ('⚠ 길 위 석단 ' + bad) : '';
    $('warn-overlap').style.color = bad ? '#ff9f9f' : '';
    $('json-current').value = JSON.stringify({ key: curKey(), path: l.path, spots: l.spots });
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
    if (ev.key === 'z' || ev.key === 'Z') { undo(); }
    else if (ev.key === 'p' || ev.key === 'P') { setMode('path'); }
    else if (ev.key === 's' || ev.key === 'S') { setMode('spots'); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      const pts = curPoints();
      if (pts.length) { pushUndo(); pts.pop(); saveLayouts(); render(); syncPanels(); }
    } else if (ev.key === 'ArrowRight') { gotoMap(mapIdx + 1); }
    else if (ev.key === 'ArrowLeft') { gotoMap(mapIdx - 1); }
  });

  // ---- 컨트롤 ----
  function setMode(m) {
    mode = m;
    $('mode-path').classList.toggle('active', m === 'path');
    $('mode-spots').classList.toggle('active', m === 'spots');
    render(); syncPanels();
  }
  function gotoMap(i) {
    mapIdx = (i + maps.length) % maps.length;
    undoStack.length = 0;
    loadMap();
  }

  $('mode-path').onclick = () => setMode('path');
  $('mode-spots').onclick = () => setMode('spots');
  $('undo').onclick = undo;
  $('prev-map').onclick = () => gotoMap(mapIdx - 1);
  $('next-map').onclick = () => gotoMap(mapIdx + 1);
  $('clear').onclick = () => {
    if (!confirm('현재 맵의 ' + (mode === 'path' ? '경로' : '석단') + '를 모두 지울까요?')) return;
    pushUndo(); curLayout()[mode] = []; saveLayouts(); render(); syncPanels();
  };
  $('seed').onclick = () => {
    const m = maps[mapIdx];
    pushUndo();
    layouts[m.key] = {
      path: (m.path || []).map(p => p.slice()),
      spots: (m.spots || []).map(p => p.slice()),
    };
    saveLayouts(); render(); syncPanels();
    setStatus('DKCONTENT 기본 좌표를 불러왔습니다.');
  };
  $('toggle-path').onchange = e => { show.path = e.target.checked; render(); };
  $('toggle-spots').onchange = e => { show.spots = e.target.checked; render(); };

  $('copy-current').onclick = () => copy($('json-current').value, '현재 맵 JSON 복사됨');
  $('apply-current').onclick = () => {
    try {
      const o = JSON.parse($('json-current').value);
      pushUndo();
      layouts[curKey()] = { path: o.path || [], spots: o.spots || [] };
      saveLayouts(); render(); syncPanels();
      setStatus('현재 맵에 적용됨');
    } catch (e) { setStatus('JSON 파싱 실패: ' + e.message, true); }
  };

  function buildAllSnippet() {
    const lines = ['const MAP_LAYOUTS = {'];
    for (const m of maps) {
      const l = layouts[m.key];
      if (!l || (!l.path.length && !l.spots.length)) continue;
      const pathStr = l.path.map(p => `[${p[0]},${p[1]}]`).join(', ');
      const spotStr = l.spots.map(p => `[${p[0]},${p[1]}]`).join(', ');
      lines.push(`  ${m.key}: { path: [${pathStr}], spots: [${spotStr}] },`);
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
      // "const MAP_LAYOUTS = { ... };" 또는 순수 객체 모두 허용
      const m = text.match(/\{[\s\S]*\}/);
      const obj = (new Function('return (' + (m ? m[0] : text) + ')'))();
      let n = 0;
      for (const k of Object.keys(obj)) {
        layouts[k] = { path: obj[k].path || [], spots: obj[k].spots || [] };
        n++;
      }
      saveLayouts(); render(); syncPanels();
      setStatus(n + '개 맵 가져옴');
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
    o.value = String(i);
    o.textContent = `${i + 1}. ${m.name || m.key}`;
    sel.appendChild(o);
  });
  sel.onchange = () => gotoMap(parseInt(sel.value, 10));

  // ---- 시작 ----
  // loadMap() 을 먼저 호출해 첫 맵의 시드가 생성되도록 한다(setMode 의 syncPanels 가 빈 레이아웃을 만들기 전에).
  loadMap();
  setMode('path');
})();
