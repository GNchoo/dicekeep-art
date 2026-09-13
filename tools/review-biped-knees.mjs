// Review actual baked knee-correction sheets against a fixed production commit.
// Run after both gen/biped-knees-110 builds have finished. No production writes.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sha256 } from './lib/directional-rig.mjs';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const baseline = '5630cdd', target = path.join(repo, 'gen/biped-knees-110'), out = path.join(target, 'review');
const read = file => fs.readFileSync(path.join(repo, file));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const oldBytes = file => execFileSync('git', ['show', baseline + ':' + file], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
const manifest = bytes => { const scope = { window: {} }; vm.runInNewContext(bytes.toString('utf8'), scope, { timeout: 1000 }); return JSON.parse(JSON.stringify(Object.values(scope.window)[0])); };
const previous = { ...manifest(oldBytes('directional-art.js')).entries, ...manifest(oldBytes('extreme-art.js')).entries };
const builds = Object.fromEntries(['original', 'extreme'].map(kind => [kind, json(path.join(target, kind, 'directional-art.json'))]));
const selected = json(path.join(repo, 'tools/art-review/biped-knees-110/selection.json')).selection;
assert.ok(selected.length > 0, 'correction selection must not be empty');
assert.equal(new Set(selected.map(item => item.id)).size, selected.length, 'unique correction identities');
fs.mkdirSync(out, { recursive: true });
const phases = [2, 6], columns = ['BEFORE frame 2', 'AFTER frame 2', 'BEFORE frame 6', 'AFTER frame 6'];
const tileW = 238, tileH = 224, boardW = tileW * 4, rowsPerBoard = 5;
const records = [], boards = [];
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const label = (width, height, text, size = 15) => Buffer.from(`<svg width="${width}" height="${height}"><text x="10" y="${height - 7}" fill="#e2e9ec" font-family="Arial" font-size="${size}">${xml(text)}</text></svg>`);

async function frame(bytes, view, index) {
  const { cell, cols } = view;
  const raw = await sharp(bytes).extract({ left: index % cols * cell, top: Math.floor(index / cols) * cell, width: cell, height: cell }).ensureAlpha().raw().toBuffer();
  let x0 = cell, y0 = cell, x1 = -1, y1 = -1;
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) if (raw[(y * cell + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  assert.ok(x1 >= x0 && y1 >= y0, 'nonempty actual frame');
  const bounds = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  const crop = await sharp(raw, { raw: { width: cell, height: cell, channels: 4 } }).extract(bounds).png().toBuffer();
  return { bounds, crop, pivot: view.pivot };
}

function fit(frames, referenceHeight, view, width = tileW, height = tileH) {
  const ground = height - 18, center = width / 2;
  // Shared old/new scale; root location comes from the authored pivot. Frame
  // crops remove transparent margins only and never recenter a pose.
  let scale = 176 / (referenceHeight * view.scale);
  for (const f of frames) {
    const b = f.bounds, p = f.pivot;
    scale = Math.min(scale, (center - 10) / Math.max(1, p[0] - b.left), (center - 10) / Math.max(1, b.left + b.width - p[0]), (ground - 8) / Math.max(1, p[1] - b.top), (height - ground - 3) / Math.max(1, b.top + b.height - p[1]));
  }
  return { scale, ground, center };
}

async function tile(f, transform) {
  const { bounds: b, pivot: p } = f, { scale, center, ground } = transform;
  const width = Math.max(1, Math.round(b.width * scale)), height = Math.max(1, Math.round(b.height * scale));
  const left = Math.round(center + (b.left - p[0]) * scale), top = Math.round(ground + (b.top - p[1]) * scale);
  assert.ok(left >= 0 && top >= 0 && left + width <= tileW && top + height <= tileH, 'review tile must not clip alpha');
  const grid = Buffer.from(`<svg width="${tileW}" height="${tileH}"><path d="M8 ${ground} H${tileW - 8}" stroke="#5b6c72"/><path d="M${center} 4 V${tileH - 4}" stroke="#314149" stroke-dasharray="3 5"/></svg>`);
  return sharp({ create: { width: tileW, height: tileH, channels: 4, background: '#192a31' } }).composite([{ input: grid }, { input: await sharp(f.crop).resize(width, height).png().toBuffer(), left, top }]).png().toBuffer();
}

for (let start = 0; start < selected.length; start += rowsPerBoard) {
  const batch = selected.slice(start, start + rowsPerBoard), rowH = tileH + 28, composites = [];
  composites.push({ input: label(boardW, 32, `Biped knee correction · SIDE (+X forward) · ${start + 1}–${start + batch.length} / ${selected.length}`), left: 0, top: 0 });
  for (let c = 0; c < 4; c++) composites.push({ input: label(tileW, 26, columns[c], 13), left: c * tileW, top: 32 });
  for (const [ri, item] of batch.entries()) {
    const before = previous[item.id], after = builds[item.kind].entries[item.id];
    assert.ok(before && after, item.id + ' present in both generations');
    const av = after.views.side, bv = before.views.side;
    for (const key of ['cell', 'cols', 'rows', 'frames', 'pivot', 'scale']) assert.deepEqual(av[key], bv[key], item.id + ' stable ' + key);
    assert.equal(after.referenceHeight, before.referenceHeight);
    const oldSheet = oldBytes(bv.sheet), newSheet = fs.readFileSync(path.join(target, item.kind, av.sheet));
    const frames = [];
    for (const index of phases) frames.push(await frame(oldSheet, bv, index), await frame(newSheet, av, index));
    const transform = fit(frames, after.referenceHeight, av);
    const top = 58 + ri * rowH;
    composites.push({ input: label(boardW, 28, `${item.id} · ${item.kind} · pivot ${av.pivot.join(', ')} · scale ${transform.scale.toFixed(4)}`, 13), left: 0, top });
    for (let c = 0; c < 4; c++) composites.push({ input: await tile(frames[c], transform), left: c * tileW, top: top + 28 });
    records.push({ id: item.id, kind: item.kind, view: 'side', frames: phases, before: { commit: baseline, file: bv.sheet, sha256: sha256(oldSheet) }, after: { directory: path.relative(repo, path.join(target, item.kind)), file: av.sheet, sha256: sha256(newSheet) }, pivot: av.pivot, referenceHeight: after.referenceHeight, scale: av.scale, reviewTransform: transform });
  }
  const file = `side-before-after-${String(boards.length + 1).padStart(2, '0')}.png`;
  await sharp({ create: { width: boardW, height: 58 + batch.length * rowH, channels: 4, background: '#101d23' } }).composite(composites).png().toFile(path.join(out, file));
  boards.push({ file, ids: batch.map(x => x.id), sha256: sha256(fs.readFileSync(path.join(out, file))) });
  console.log(file, batch.map(x => x.id).join(', '));
}

const examples = [];
for (const id of ['w035', 'w049', 'b050', 'b100', 'w103', 'b201']) {
  const item = selected.find(x => x.id === id), oldEntry = previous[id], newEntry = builds[item.kind].entries[id], views = {};
  for (const direction of ['side', 'front', 'back']) {
    const oldView = oldEntry.views[direction], newView = newEntry.views[direction];
    const oldSheet = oldBytes(oldView.sheet), newSheet = fs.readFileSync(path.join(target, item.kind, newView.sheet));
    const frames = [];
    for (let index = 0; index < newView.frames; index++) frames.push(await frame(oldSheet, oldView, index), await frame(newSheet, newView, index));
    const embed = async bytes => 'data:image/webp;base64,' + (await sharp(bytes).webp({ lossless: true, effort: 3 }).toBuffer()).toString('base64');
    const metadata = v => ({ cell: v.cell, cols: v.cols, rows: v.rows, frames: v.frames, pivot: v.pivot, scale: v.scale });
    views[direction] = { before: { ...metadata(oldView), image: await embed(oldSheet) }, after: { ...metadata(newView), image: await embed(newSheet) }, transform: fit(frames, newEntry.referenceHeight, newView, 300, 290) };
  }
  examples.push({ id, referenceHeight: newEntry.referenceHeight, cycleStride: newEntry.cycleStride, views });
}

const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>무릎 방향 수정 · 실제 프레임 비교</title><style>
*{box-sizing:border-box}body{margin:0;background:#101d23;color:#e2e9ec;font:15px/1.6 system-ui,sans-serif}main{max-width:1260px;margin:auto;padding:26px}h1{font-size:27px;margin:0 0 8px}p{max-width:900px;color:#bdccd1}.controls{position:sticky;top:0;background:#101d23ee;padding:12px 0;display:flex;gap:10px;align-items:center;z-index:2;flex-wrap:wrap}button,select{border:1px solid #66838e;border-radius:7px;background:#203740;color:#eef5f5;padding:9px 16px;font:inherit}#grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:20px 0}article{border:1px solid #314c57;border-radius:10px;overflow:hidden;background:#192a31}h2{font-size:16px;margin:10px 16px}.pair{display:grid;grid-template-columns:1fr 1fr}.label{text-align:center;color:#bccbd0;font-size:13px}canvas{width:100%;display:block}small{color:#91abb4}a{color:#a1d6e6}@media(max-width:780px){main{padding:16px}#grid{grid-template-columns:1fr}}
</style><main><h1>무릎 방향 수정</h1><p>기존 버전과 수정 버전의 실제 8프레임 시트를 같은 속도로 재생합니다. 오른쪽 화면은 무릎이 진행 방향으로 굽도록 수정했습니다. 원본 그림·몸통·발의 이동 경로는 유지했습니다.</p><div class="controls"><button id="pause">일시 정지</button><label>방향 <select id="direction"><option value="side">측면 →</option><option value="front">정면 ↓</option><option value="back">후면 ↑</option></select></label><label>속도 <select id="speed"><option value="1">보통</option><option value="0.5">절반</option></select></label><span id="frame"></span></div><div id="grid"></div><p><small>기존: Git ${baseline} · 수정: v110 자체 제작 스프라이트. 게임의 기준 높이·피벗을 유지하며 비교 화면에 맞춰 함께 축소했습니다. 시간 기반의 고정 위치 비교이며, 게임 경로 이동을 재현하는 화면은 아닙니다. 외부 연결 없이 열립니다.</small></p></main><script>
const examples=${JSON.stringify(examples)}, grid=document.querySelector('#grid');let paused=false, phase=0,last=performance.now();
const cards=examples.map(e=>{const a=document.createElement('article');a.innerHTML='<h2>'+e.id+'</h2><div class="pair"><div><div class="label">기존 · 수정 전</div><canvas width="300" height="290"></canvas></div><div><div class="label">현재 · 수정 후</div><canvas width="300" height="290"></canvas></div></div>';grid.appendChild(a);for(const v of Object.values(e.views))for(const version of ['before','after']){v[version].img=new Image();v[version].img.src=v[version].image;}return{e, canvases:[...a.querySelectorAll('canvas')]};});
document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'재생':'일시 정지';};
function draw(now){const dt=Math.min(.1,(now-last)/1000);last=now;if(!paused)phase=(phase+dt*Number(document.querySelector('#speed').value)/1.05)%1;const index=Math.floor(phase*8),direction=document.querySelector('#direction').value;document.querySelector('#frame').textContent='프레임 '+(index+1)+' / 8';for(const card of cards){const view=card.e.views[direction],t=view.transform;for(const [i,key]of ['before','after'].entries()){const cv=card.canvases[i],g=cv.getContext('2d'),v=view[key],s=t.scale;g.clearRect(0,0,cv.width,cv.height);g.fillStyle='#192a31';g.fillRect(0,0,cv.width,cv.height);g.strokeStyle='#60747b';g.beginPath();g.moveTo(10,t.ground);g.lineTo(cv.width-10,t.ground);g.stroke();if(v.img.complete&&v.img.naturalWidth)g.drawImage(v.img,index%v.cols*v.cell,Math.floor(index/v.cols)*v.cell,v.cell,v.cell,t.center-v.pivot[0]*s,t.ground-v.pivot[1]*s,v.cell*s,v.cell*s);}}requestAnimationFrame(draw);}requestAnimationFrame(draw);
</script>`;
fs.writeFileSync(path.join(out, 'preview.html'), html);
fs.writeFileSync(path.join(out, 'review-manifest.json'), JSON.stringify({ baseline, method: `Actual baked side frames 2 and 6, zero-based, for all ${selected.length} changed identities. Shared old/new source scale and authored pivot; transparent crops never recenter poses. This generator records artifacts, not human visual approval.`, identities: records.length, actualSideImages: records.length * phases.length * 2, boards, records, loopExamples: examples.map(e => e.id), loops: 'Six actual 8-frame sheets per view with all three directions, both generations. No interpolation or image warping.' }, null, 2) + '\n');
console.log(`Wrote ${boards.length} boards, ${records.length * phases.length * 2} actual side sample images and standalone six-identity three-view preview.`);
