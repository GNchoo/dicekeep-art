// www/ 빌드 — Capacitor 앱에 들어갈 정적 파일만 골라 담는다. (웹 배포는 이 폴더를 안 쓴다: Cloudflare 는 루트를 그대로 올린다)
//   node tools/build-www.mjs              복사만
//   node tools/build-www.mjs --optimize   PNG 무손실 재압축 (sharp, compressionLevel 9)
//   node tools/build-www.mjs --quantize   + 팔레트 양자화 (손실, quality 80) — 용량이 급할 때만
// 규칙:
//   고정 파일: 게임·성장·결제·아트 매니페스트 JS, index.html(app.js 주입), 결제 복귀·개인정보 페이지
//   고정 폴더: fonts ui vfx dice props map towers enemies audio (있는 것만)
//   casual/: game.js·content.js 안의 'casual/…' 경로 리터럴 + content.js 를 실행해 얻은 DKCONTENT 의 src/walkSrc
//            + casual/tiles/** + casual/towers/star-*.png + casual/towers/skins/**
//            + casual/{enemies,bosses}/{inf,extreme}/** (PNG·무손실 WebP 모두 포함)
//   제외: casual/maps/map-NN-*.jpg · casual/towers/*-attack-2x2.png · editor.* · *.md · net/ · serve.py · start.bat · wrangler.jsonc · tools · resources
//   www/app.js = @capacitor/core UMD + 플러그인 UMD + 루트 app.js (번들러 없이 window.Capacitor.Plugins.* 를 쓰기 위해)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'www');
const ARGS = new Set(process.argv.slice(2));
const OPTIMIZE = ARGS.has('--optimize') || ARGS.has('--quantize');
const QUANTIZE = ARGS.has('--quantize');

const FIXED_FILES = ['index.html', 'game.js', 'content.js', 'progression.js', 'commerce-config.js', 'commerce-client.js', 'commerce-ui.js', 'cosmetics.js', 'payment.html', 'payment-return.js', 'directional-art.js', 'extreme-art.js', 'infinity-art.js', 'net.js', 'music.js', 'style.css', 'privacy.html'];
const FIXED_DIRS = ['fonts', 'ui', 'vfx', 'dice', 'props', 'map', 'towers', 'enemies', 'audio'];
const CAP_UMD = [
  '@capacitor/core/dist/capacitor.js',
  '@capacitor/app/dist/plugin.js',
  '@capacitor/splash-screen/dist/plugin.js',
  '@capacitor/status-bar/dist/plugin.js',
  '@capacitor-community/safe-area/dist/plugin.js',
];
const EXCLUDE = [
  /^casual\/maps\/map-[0-9][0-9]-[^/]*\.jpg$/i,
  /^casual\/towers\/[^/]*-attack-2x2\.png$/i,
  /^editor\./i, /\.md$/i, /^net\//, /^serve\.py$/, /^start\.bat$/, /^wrangler\.jsonc$/, /^tools\//, /^resources\//, /^store\//, /^ui\/icons-sheet\.png$/,
];
const excluded = (rel) => EXCLUDE.some((re) => re.test(rel));

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// ---- casual/ 목록 ----
function casualPaths() {
  const set = new Set();
  const src = ['game.js', 'content.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  for (const m of src.matchAll(/['"`](casual\/[^'"`\s]+)/g)) {
    const p = m[1];
    if (/[${]/.test(p)) continue;                     // 템플릿 조각(`casual/tiles/${…}`)은 아래 폴더 규칙이 담당
    set.add(p);
  }
  // content.js 실행 → DKCONTENT
  try {
    const ctx = { window: {}, console };
    ctx.window.window = ctx.window;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8'), ctx, { filename: 'content.js' });
    const C = ctx.window.DKCONTENT || {};
    const add = (v) => { if (typeof v === 'string' && v.startsWith('casual/')) set.add(v); };
    for (const b of C.bases || []) { add(b.src); add(b.walkSrc); }
    for (const b of C.bossBases || []) { add(b.src); add(b.walkSrc); }
    for (const k of Object.keys(C.towerSkins || {})) for (const s of C.towerSkins[k] || []) add(s && s.src);
    for (const m of C.maps || []) add(m.src);
  } catch (e) { console.warn('content.js 실행 실패 — 리터럴 경로만 사용:', e.message); }
  // 폴더 통째
  for (const p of walk(path.join(ROOT, 'casual', 'tiles'))) set.add(rel(p));
  for (const p of walk(path.join(ROOT, 'casual', 'enemies', 'inf'))) set.add(rel(p));
  for (const p of walk(path.join(ROOT, 'casual', 'bosses', 'inf'))) set.add(rel(p));
  for (const p of walk(path.join(ROOT, 'casual', 'enemies', 'extreme'))) set.add(rel(p));
  for (const p of walk(path.join(ROOT, 'casual', 'bosses', 'extreme'))) set.add(rel(p));
  for (const p of walk(path.join(ROOT, 'casual', 'towers', 'skins'))) set.add(rel(p));
  const towers = path.join(ROOT, 'casual', 'towers');
  if (fs.existsSync(towers)) for (const f of fs.readdirSync(towers)) if (/^star-.*\.png$/i.test(f)) set.add('casual/towers/' + f);
  const list = [...set].filter((p) => !excluded(p));
  const missing = list.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  if (missing.length) console.warn('참조하지만 없는 파일:', missing.join(', '));
  return list.filter((p) => fs.existsSync(path.join(ROOT, p))).sort();
}

// ---- 파일 모으기 ----
const files = [];   // { rel, src }
for (const f of FIXED_FILES) if (fs.existsSync(path.join(ROOT, f))) files.push({ rel: f, src: path.join(ROOT, f) });
for (const d of FIXED_DIRS) for (const p of walk(path.join(ROOT, d))) { const r = rel(p); if (!excluded(r)) files.push({ rel: r, src: p }); }
for (const r of casualPaths()) files.push({ rel: r, src: path.join(ROOT, r) });

// ---- 쓰기 ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let sharp = null;
if (OPTIMIZE) {
  try { sharp = (await import('sharp')).default; } catch (e) { console.warn('sharp 없음 — 최적화 건너뜀 (npm install)'); }
}

const stats = {};  // top-level folder → { before, after, n }
const bump = (r, before, after) => {
  const top = r.includes('/') ? r.split('/')[0] + '/' : '(root)';
  const s = (stats[top] ||= { before: 0, after: 0, n: 0 });
  s.before += before; s.after += after; s.n++;
};
const manifest = [];
const written = new Set();
async function put(r, buf, before) {
  const dst = path.join(OUT, r);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, buf);
  written.add(r);
  bump(r, before, buf.length);
  manifest.push({ path: r, size: buf.length });
}

for (const f of files) {
  if (written.has(f.rel)) continue;
  let buf = fs.readFileSync(f.src);
  const before = buf.length;
  if (f.rel === 'index.html') buf = Buffer.from(injectApp(buf.toString('utf8')), 'utf8');
  else if (sharp && /\.png$/i.test(f.rel)) {
    try {
      const out = await sharp(buf).png(QUANTIZE ? { compressionLevel: 9, palette: true, quality: 80 } : { compressionLevel: 9, palette: false }).toBuffer();
      if (out.length < buf.length) buf = out;   // 더 커지면 원본 유지
    } catch (e) { console.warn('png 재압축 실패:', f.rel, e.message); }
  }
  await put(f.rel, buf, before);
}

// www/app.js = Capacitor UMD 들 + app.js
{
  const parts = [];
  for (const m of CAP_UMD) {
    const p = path.join(ROOT, 'node_modules', m);
    if (!fs.existsSync(p)) { console.warn('없음(npm install):', m); continue; }
    parts.push(`/* ---- ${m} ---- */\n` + fs.readFileSync(p, 'utf8').replace(/\/\/# sourceMappingURL=\S+\s*$/m, ''));
  }
  parts.push('/* ---- app.js ---- */\n' + fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'));
  const buf = Buffer.from(parts.join('\n'), 'utf8');
  await put('app.js', buf, buf.length);
}

function injectApp(html) {
  const tag = '<script src="app.js"></script>';
  if (html.includes(tag)) return html;
  if (/<!--\s*APP\s*-->/.test(html)) return html.replace(/<!--\s*APP\s*-->/, tag);
  const i = html.search(/<script src="net\.js/);
  if (i < 0) { console.warn('index.html: net.js 스크립트를 못 찾음 — app.js 를 </head> 앞에 넣는다'); return html.replace('</head>', tag + '\n</head>'); }
  return html.slice(0, i) + tag + '\n' + html.slice(i);
}

manifest.sort((a, b) => a.path.localeCompare(b.path));
const total = manifest.reduce((s, m) => s + m.size, 0);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ built: new Date().toISOString(), optimize: OPTIMIZE, quantize: QUANTIZE, files: manifest.length, bytes: total, list: manifest }, null, 1));

// ---- 표 ----
const kb = (n) => (n / 1024).toFixed(0).padStart(7) + ' KB';
const rows = Object.entries(stats).sort((a, b) => b[1].after - a[1].after);
console.log(`www/ 빌드 (${OPTIMIZE ? (QUANTIZE ? 'quantize' : 'optimize') : 'copy'})`);
console.log('폴더'.padEnd(14) + '파일'.padStart(6) + '   전'.padStart(10) + '   후'.padStart(10));
for (const [k, s] of rows) console.log(k.padEnd(14) + String(s.n).padStart(6) + kb(s.before) + kb(s.after));
const tb = rows.reduce((s, [, v]) => s + v.before, 0), ta = rows.reduce((s, [, v]) => s + v.after, 0);
console.log('합계'.padEnd(14) + String(manifest.length).padStart(6) + kb(tb) + kb(ta));
