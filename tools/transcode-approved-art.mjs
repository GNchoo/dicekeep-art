// casual/ 아래 승인 아트를 무손실 WebP 로 바꾸고, 런타임이 참조하는 경로를 같이 고친다.
//
//   node tools/transcode-approved-art.mjs --coverage-only               # 커버리지 증명만 (수초)
//   node tools/transcode-approved-art.mjs --dry-run                     # 커버리지 증명 + 용량 측정
//   node tools/transcode-approved-art.mjs --only=casual/enemies/,casual/bosses/ \\
//        --exclude=casual/enemies/inf/directional/,casual/bosses/inf/directional/
//   node tools/transcode-approved-art.mjs                               # 실제 변환 + 경로 재작성
//
// ── 왜 무손실인가
// STORE.md 가 "손실 변환은 승인 아트를 재검수하지 않고 쓰지 않는다" 를 규칙으로 못 박았다.
// tools/lib/lossless-webp.mjs 가 보이는 RGBA 를 픽셀 단위로 전수 대조하므로, 재검수가 필요 없는
// 이유를 리포트에 증거로 남긴다 (visibleRGBADifferences: 0).
//
// ── 왜 저장소에서 바꾸나 (빌드 시점이 아니라)
//   - 웹 배포는 build-www.mjs 를 거치지 않는다. .assetsignore 로 걸러 Cloudflare 가 저장소 루트를
//     그대로 올리므로, 빌드에서만 바꾸면 웹은 한 바이트도 안 줄어든다.
//   - directional-production.cjs 가 소스 SHA256 == 서버가 보낸 바이트를 단언한다. 빌드가
//     directional-art.js 를 고쳐 쓰면 그 핀이 구조적으로 깨진다.
//
// ── 커버리지 가드가 이 도구의 핵심이다
// 런타임 경로의 상당수가 **템플릿으로 조립**된다 (`casual/towers/t${f}-${letter}.png`). 리터럴
// 치환만 하면 그런 파일은 조용히 고아가 되고, 그중 90장은 어떤 테스트도 못 잡는다 —
// browser.cjs 의 watchArtErrors 가 /casual/(enemies|bosses)/(inf|extreme)/ 만 감시하기 때문이다.
// 그래서 **변환 전에** 모든 대상이 (리터럴 | 알려진 템플릿 | 미참조 허용목록) 중 하나에 속함을
// 증명하고, 하나라도 빠지면 아무것도 건드리지 않고 실패한다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { encodeLossless, sha256 } from './lib/lossless-webp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 인코딩 결과는 저장소 **밖**에 먼저 쌓는다. 안에 쌓으면 수십 분짜리 실행 내내
// 작업트리가 더러워 보이고, 중간 커밋에 반쯤 변환된 자산이 딸려 들어갈 수 있다.
const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-webp-'));
// --coverage-only, 고아 가드 실패, 예외 — 어느 길로 나가든 스테이징은 남기지 않는다.
process.on('exit', () => fs.rmSync(STAGE, { recursive: true, force: true }));
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const DRY = process.argv.includes('--dry-run');
const COVERAGE_ONLY = process.argv.includes('--coverage-only');
const LIMIT = Number(arg('limit') || 0);
const ONLY = (arg('only') || '').split(',').filter(Boolean);
const EXCLUDE = (arg('exclude') || '').split(',').filter(Boolean);

// 리터럴 경로를 들고 있는 파일들. cosmetics.js 는 스킨팩 60장을 템플릿으로 만들지만
// 확장자 자체는 여기서 고쳐야 하므로 함께 연다.
const REWRITE = ['content.js', 'game.js', 'directional-art.js', 'cosmetics.js'];

// ── 변환하면 안 되는 것 ────────────────────────────────────────────────────
// SHA256 으로 네 곳에 핀된 "소스 아트". 런타임 자산이 아니다.
//   tools/directional-rig-test.mjs:66 (npm run test:biped-knees)
//   tools/lib/directional-legacy-sheet.mjs:12-16 (sourceSha256 불일치 시 throw)
//   tools/audit-directional-release.mjs:99,113
//   tools/art-review/directional-101/release-builds.json
const PINNED = new Set([
  'casual/enemies/inf/w004-walk-2x2.png',
  'casual/enemies/inf/w008-walk-2x2.png',
]);

// ── 변환하지 않는 것 (배포되지 않으므로 이득이 0, 건드리면 위험만 는다) ───────
// build-www.mjs 의 casualPaths() 는 casual/towers 를 통째로 걷지 않는다 — star-*.png 만
// readdir 하고, 나머지는 content.js 를 실제로 실행해 얻은 DKCONTENT 값으로 모은다.
// -attack-2x2 는 그 어느 쪽에도 없어서 애초에 배포되지 않는다. 바꾸면 EXCLUDE 의
// /-attack-2x2\.png$/ 만 헛돌게 되므로 그냥 둔다.
const SKIP = [
  /^casual\/towers\/[^/]*-attack-2x2\.png$/i,
];

// ── 배포되지만 이름으로 참조되지 않는 파일 (고아 가드에서 면제) ───────────────
// casual/tiles 는 폴더 통째로 수집되므로(build-www.mjs:75) 배포는 된다. 다만
// TILE_ASSET_FILES 후보가 아니라서 고쳐 쓸 참조가 없다 — 변환만 하면 된다.
const UNREFERENCED = [
  /^casual\/tiles\/plains\/road-(corner|cross|t)\.png$/i,
];

// ── 템플릿으로 조립되는 경로 ─────────────────────────────────────────────────
// 각 항목: 어떤 파일들을 덮는가(match) + 그 확장자를 어디서 고치는가(edits).
// edits 의 from/to 는 소스에 실제로 있는 문자열이어야 한다 (없으면 실패시킨다).
//
// 템플릿 edit 는 **전부 아니면 전무**다. `t${f}-${letter}.webp` 로 한 번 바꾸면 그 템플릿이
// 만드는 30개 경로가 전부 .webp 가 된다. 그래서 한 장이라도 PNG 로 남으면(webp 가 더 큰 경우)
// 또는 --only 로 일부가 범위 밖이면, 그 그룹은 **통째로 PNG 로 되돌린다**. 섞이면 404 다.
// perFile: true 인 그룹(tiles)은 항목마다 독립된 리터럴이라 이 제약을 받지 않는다.
const TEMPLATES = [
  { id: 'towerSkins', match: /^casual\/towers\/t\d+-[a-z]\.png$/i, edits: [
    { file: 'content.js', from: 'src: `casual/towers/t${f}-${letter}.png`', to: 'src: `casual/towers/t${f}-${letter}.webp`' },
  ] },
  { id: 'skinPacks', match: /^casual\/towers\/skins\/[^/]+\/t\d\d\.png$/i, edits: [
    { file: 'cosmetics.js', from: '`casual/towers/skins/${id}/t${String(i + 1).padStart(2, \'0\')}.png`', to: '`casual/towers/skins/${id}/t${String(i + 1).padStart(2, \'0\')}.webp`' },
  ] },
  { id: 'starTowers', match: /^casual\/towers\/star-\d\d\.png$/i, edits: [
    { file: 'game.js', from: 'casual/towers/star-${String(g).padStart(2, \'0\')}.png?v=', to: 'casual/towers/star-${String(g).padStart(2, \'0\')}.webp?v=' },
  ] },
  { id: 'infBoss', match: /^casual\/bosses\/inf\/b\d{3}(-2)?\.png$/i, edits: [
    { file: 'content.js', from: 'src: `casual/bosses/inf/b${pad3(w)}${k ? \'-2\' : \'\'}.png${revision}`', to: 'src: `casual/bosses/inf/b${pad3(w)}${k ? \'-2\' : \'\'}.webp${revision}`' },
  ] },
  { id: 'infStill', match: /^casual\/enemies\/inf\/w\d{3}\.png$/i, edits: [
    { file: 'content.js', from: 'src: `casual/enemies/inf/w${pad3(w)}.png${revision}`', to: 'src: `casual/enemies/inf/w${pad3(w)}.webp${revision}`' },
  ] },
  { id: 'infWalk', match: /^casual\/enemies\/inf\/w\d{3}-walk-\d+x\d+\.png$/i, edits: [
    { file: 'content.js', from: 'walkSrc: `casual/enemies/inf/w${pad3(w)}-walk-${m.walk || \'2x2\'}.png${revision}`', to: 'walkSrc: `casual/enemies/inf/w${pad3(w)}-walk-${m.walk || \'2x2\'}.webp${revision}`' },
  ] },
  // 타일은 정규식이 아니라 game.js 의 TILE_ASSET_FILES 에 그 항목이 실제로 있는지로 판정한다.
  // 정규식으로 뭉뚱그리면 목록에 없는 타일이 새로 들어와도 '덮였다'고 거짓 보고한다.
  { id: 'tiles', perFile: true, match: (p, src) => p.startsWith('casual/tiles/') && src['game.js'].includes(`'${p.slice('casual/tiles/'.length)}'`), edits: [] },
];

// 확장자를 보는 정규식들. 템플릿 경로가 안 바뀌어도 이건 반드시 넓혀야 한다.
const REGEX_FIXES = [
  // game.js:1079 — 시트 격자. 안 고치면 4x2 시트가 조용히 2x2 로 잘린다 (404 도 안 난다).
  { file: 'game.js', from: '/-walk-(\\d+)x(\\d+)\\.png/i', to: '/-walk-(\\d+)x(\\d+)\\.(?:png|webp)/i' },
  // game.js:837 — 타일 키에서 확장자 제거
  { file: 'game.js', from: "name.replace(/\\.(png|jpg)$/, '')", to: "name.replace(/\\.(png|jpg|webp)$/, '')" },
  // content.js:1179,1185 — walkSrc 파생. 오늘은 파생 0건이지만 향후 회귀를 막는다.
  { file: 'content.js', from: "b.walkSrc = b.src.replace(/\\.png$/, '-walk-2x2.png');", to: "b.walkSrc = b.src.replace(/\\.(png|webp)$/, (e) => '-walk-2x2' + e);", all: true },
];

const walk = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name);
      return d.isDirectory() ? walk(p) : [p];
    })
  : [];

const MiB = (n) => (n / 1048576).toFixed(2);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// 지금은 저장소 밖(STAGE)에 쌓지만, 이전 버전이 저장소 안에 내려놓고 죽은 잔재가
// 남아 있을 수 있다. 정상 상태에선 한 아트가 .png 이거나 .webp 이지 둘 다일 수
// 없으므로(저장소 전수 확인), 짝이 있는 .webp 는 예외 없이 그 잔재다.
function sweepStaged() {
  const stale = walk(path.join(ROOT, 'casual'))
    .filter((p) => /\.webp$/i.test(p) && fs.existsSync(p.replace(/\.webp$/i, '.png')));
  for (const p of stale) fs.unlinkSync(p);
  if (stale.length) console.log(`중단된 회차가 남긴 스테이징 .webp ${stale.length}장을 지웠다 (.png 는 그대로).`);
  return stale.length;
}

function main() {
  sweepStaged();
  let targets = walk(path.join(ROOT, 'casual'))
    .filter((p) => /\.png$/i.test(p))
    .map(rel)
    .filter((p) => !PINNED.has(p) && !SKIP.some((re) => re.test(p)))
    .sort();
  const scoped = targets
    .filter((p) => !ONLY.length || ONLY.some((o) => p.startsWith(o)))
    .filter((p) => !EXCLUDE.some((o) => p.startsWith(o)));
  const work = LIMIT ? scoped.slice(0, LIMIT) : scoped;

  const sources = Object.fromEntries(REWRITE.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));

  // ── 1. 커버리지 증명 — 변환 전에 한다 ───────────────────────────────────
  const literal = [], templated = new Map(), unreferenced = [], orphans = [];
  for (const p of targets) {
    if (REWRITE.some((f) => sources[f].includes(p))) { literal.push(p); continue; }
    if (UNREFERENCED.some((re) => re.test(p))) { unreferenced.push(p); continue; }
    const t = TEMPLATES.find((t) => typeof t.match === 'function' ? t.match(p, sources) : t.match.test(p));
    if (t) { (templated.get(t.id) || templated.set(t.id, []).get(t.id)).push(p); continue; }
    orphans.push(p);
  }

  console.log(`casual/ PNG ${targets.length}장 (SHA 핀·미배포 제외) — 커버리지는 --only/--limit 와 무관하게 전체를 본다`);
  console.log(`  리터럴로 잡힘      ${literal.length}`);
  for (const [id, list] of templated) console.log(`  템플릿 ${id.padEnd(12)} ${list.length}`);
  console.log(`  미참조(정상)       ${unreferenced.length}`);
  console.log(`  ${orphans.length ? '고아 ' : '고아               '}${orphans.length}`);

  if (orphans.length) {
    console.error('\n어느 리터럴·템플릿에도 잡히지 않는 파일이 있다. 변환하면 조용히 404 가 된다:');
    for (const p of orphans.slice(0, 20)) console.error('  ' + p);
    if (orphans.length > 20) console.error(`  … 외 ${orphans.length - 20}장`);
    console.error('\nTEMPLATES 에 규칙을 추가하거나 UNREFERENCED 에 넣어 의도를 밝혀라. 아무것도 변환하지 않았다.');
    process.exitCode = 1;
    return null;
  }

  // 템플릿 edits·정규식이 소스에 실제로 존재하는지도 미리 확인한다 (오타·소스 변경 방어).
  // 이 도구는 단계별로 여러 번 돈다 (⑤-1 → ⑤-2 → ⑤-3). 앞 회차가 이미 고친 지점은
  // from 이 사라지고 to 가 있으므로 "충족됨" 으로 본다 — 둘 다 없을 때만 실패다.
  const anchorState = (file, from, to) => {
    const src = sources[file];
    if (!src) return 'no-file';
    if (src.includes(from)) return 'pending';
    return src.includes(to) ? 'applied' : 'missing';
  };
  const missing = [];
  for (const [id, list] of templated) {
    if (!list.length) continue;
    for (const e of TEMPLATES.find((t) => t.id === id).edits) {
      if (anchorState(e.file, e.from, e.to) === 'missing') missing.push(`${id}: ${e.file} 에 "${e.from.slice(0, 60)}…" 없음 (to 도 없음)`);
      if (anchorState(e.file, e.from, e.to) === 'no-file') missing.push(`${id}: ${e.file} 를 열지 못했다 — REWRITE 에 넣어라`);
    }
  }
  for (const r of REGEX_FIXES) {
    const st = anchorState(r.file, r.from, r.to);
    if (st === 'missing' || st === 'no-file') missing.push(`정규식: ${r.file} 에 "${r.from}" 도 "${r.to}" 도 없음`);
  }
  if (missing.length) {
    console.error('\n소스에서 찾지 못한 수정 지점이 있다 (소스가 바뀌었거나 오타):');
    for (const m of missing) console.error('  ' + m);
    process.exitCode = 1;
    return null;
  }
  console.log('커버리지 증명 통과 — 모든 대상이 리터럴·템플릿·미참조 중 하나에 속한다.');
  if (COVERAGE_ONLY) return null;
  if (work.length !== targets.length) console.log(`이번 회차 변환 대상 ${work.length}장`);
  console.log('');
  return { work, sources, templated };
}

async function run({ work, sources, templated }) {
  const TPL = new Map(TEMPLATES.map((t) => [t.id, t]));
  const inScope = new Set(work);
  const report = {
    startedAt: new Date().toISOString(), dryRun: DRY, only: ONLY,
    encoder: 'lossless webp effort 6; visible RGBA compared byte-for-byte',
    coverage: Object.fromEntries([...templated].map(([k, v]) => [k, v.length])),
    files: [], totals: {}, rewrites: [], groupsHeldBack: [], errors: [],
  };

  // ── 1. 인코딩 — .webp 를 .png 옆에 **내려놓기만** 한다 (아직 아무것도 안 지운다) ──
  // 채택 여부는 그룹 단위로 나중에 정해야 하므로, 여기서 png 를 지우면 되돌릴 수 없다.
  const candidate = new Map();   // png경로 -> webp경로 (webp 가 더 작았던 것)
  let pngBytes = 0, outBytes = 0, keptPng = 0, done = 0;
  for (const p of work) {
    const abs = path.join(ROOT, p);
    let r;
    try { r = await encodeLossless(fs.readFileSync(abs), p); }
    catch (e) { report.errors.push({ file: p, error: e.message }); continue; }
    pngBytes += r.record.pngBytes; outBytes += r.record.encodedBytes;
    report.files.push({ file: p, ...r.record });
    if (r.extension === '.webp') {
      const webp = p.replace(/\.png$/i, '.webp');
      candidate.set(p, webp);
      if (!DRY) {
        const at = path.join(STAGE, webp);
        fs.mkdirSync(path.dirname(at), { recursive: true });
        fs.writeFileSync(at, r.bytes);
      }
    } else keptPng++;
    if (++done % 100 === 0) process.stderr.write(`  ${done}/${work.length}\r`);
  }

  // ── 2. 그룹 판정 — 템플릿 edit 는 전부 아니면 전무다 ───────────────────────
  // `t${f}-${letter}.webp` 로 바꾸는 순간 그 템플릿이 만드는 경로가 전부 .webp 가 된다.
  // 그룹 안에 한 장이라도 PNG 로 남으면(webp 가 더 컸거나 --only 범위 밖) 그 장이 404 다.
  // 그래서 그런 그룹은 통째로 보류한다 — 내려놓은 .webp 를 지우고 .png 를 그대로 둔다.
  const acceptedGroups = new Set(), held = new Set();
  for (const [id, list] of templated) {
    if (TPL.get(id).perFile) continue;          // 항목마다 독립된 리터럴이라 제약 없음
    const out = list.filter((p) => !inScope.has(p) || !candidate.has(p));
    if (!out.length) { acceptedGroups.add(id); continue; }
    for (const p of list) held.add(p);
    report.groupsHeldBack.push({ template: id, size: list.length, blockedBy: out.slice(0, 5),
      reason: out.every((p) => !inScope.has(p)) ? 'out-of-scope' : 'png-smaller-or-out-of-scope' });
  }

  const accepted = [...candidate].filter(([p]) => !held.has(p));

  // ── 3. 디스크 확정 ────────────────────────────────────────────────────────
  // 확정된 것만 저장소로 옮긴다. 보류분은 STAGE 에 남겨둔 채 통째로 버리면 되므로
  // 저장소는 이 순간까지 한 번도 중간 상태를 갖지 않는다.
  if (!DRY) {
    for (const [png, webp] of accepted) {
      fs.renameSync(path.join(STAGE, webp), path.join(ROOT, webp));
      fs.unlinkSync(path.join(ROOT, png));
    }
  }

  report.totals = { files: work.length, converted: accepted.length, keptAsPng: keptPng,
    heldBack: held.size ? [...held].filter((p) => candidate.has(p)).length : 0,
    pngBytes, encodedBytes: outBytes, savedBytes: pngBytes - outBytes,
    ratio: pngBytes ? +(outBytes / pngBytes).toFixed(4) : 0 };

  // ── 4. 경로 재작성 — 확정된 것만 ──────────────────────────────────────────
  if (!DRY && accepted.length) {
    for (const file of REWRITE) {
      let after = sources[file], hits = 0;
      for (const [from, to] of accepted) if (after.includes(from)) { after = after.split(from).join(to); hits++; }
      sources[file] = after;
      if (hits) report.rewrites.push({ file, literalPaths: hits });
    }
    for (const id of acceptedGroups) {
      for (const e of TPL.get(id).edits) {
        if (!sources[e.file].includes(e.from)) continue;   // 앞 회차가 이미 고쳤다
        sources[e.file] = sources[e.file].split(e.from).join(e.to);
        report.rewrites.push({ template: id, file: e.file });
      }
    }
    // TILE_ASSET_FILES — 항목마다 독립된 리터럴이라 한 장씩 고친다
    for (const [from, to] of accepted) {
      const m = /^casual\/tiles\/(.+)$/.exec(from);
      if (!m) continue;
      const key = `'${m[1]}'`;
      if (!sources['game.js'].includes(key)) continue;
      sources['game.js'] = sources['game.js'].split(key).join(`'${to.slice('casual/tiles/'.length)}'`);
      report.rewrites.push({ tile: m[1], file: 'game.js' });
    }
    // 확장자를 보는 정규식들 — 한 장이라도 확정됐으면 넓힌다
    for (const r of REGEX_FIXES) {
      if (!sources[r.file].includes(r.from)) continue;     // 앞 회차가 이미 넓혔다
      sources[r.file] = r.all ? sources[r.file].split(r.from).join(r.to) : sources[r.file].replace(r.from, r.to);
      report.rewrites.push({ regex: r.from, file: r.file });
    }
    for (const file of REWRITE) fs.writeFileSync(path.join(ROOT, file), sources[file]);
  }

  const outDir = path.join(ROOT, 'tools/art-review/lossless-webp');
  fs.mkdirSync(outDir, { recursive: true });
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

  const t = report.totals;
  console.log(`${DRY ? '[측정만] ' : ''}${t.files}장 · PNG ${MiB(t.pngBytes)} MiB → ${MiB(t.encodedBytes)} MiB ` +
              `(${(t.ratio * 100).toFixed(1)}%, -${MiB(t.savedBytes)} MiB)`);
  console.log(`  webp 확정 ${t.converted} · PNG 유지 ${t.keptAsPng} · 그룹 보류 ${t.heldBack} · 오류 ${report.errors.length}`);
  for (const g of report.groupsHeldBack) console.log(`    보류: ${g.template} (${g.size}장) — ${g.reason}`);
  if (report.rewrites.length) console.log(`  경로 재작성 ${report.rewrites.length}건`);
  console.log('  리포트: tools/art-review/lossless-webp/report.json');
  if (report.errors.length) { console.error('오류:', report.errors.slice(0, 5)); process.exitCode = 1; }
}

const prepared = main();
if (prepared) await run(prepared);
