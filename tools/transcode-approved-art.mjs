// casual/ 아래 승인 아트를 무손실 WebP 로 바꾸고, 런타임이 참조하는 경로를 같이 고친다.
//
//   node tools/transcode-approved-art.mjs --dry-run        # 측정만 (파일 안 건드림)
//   node tools/transcode-approved-art.mjs --dry-run --limit=200
//   node tools/transcode-approved-art.mjs                  # 실제 변환 + 경로 재작성
//
// 왜 무손실인가: STORE.md 가 "손실 변환은 승인 아트를 재검수하지 않고 쓰지 않는다" 를 규칙으로
// 못 박았다. tools/lib/lossless-webp.mjs 가 보이는 RGBA 를 픽셀 단위로 전수 대조하므로,
// 재검수가 필요 없는 이유를 리포트에 증거로 남긴다 (visibleRGBADifferences: 0).
//
// 왜 저장소에서 바꾸나 (빌드 시점이 아니라):
//   - 웹 배포는 build-www.mjs 를 거치지 않는다. .assetsignore 로 걸러 Cloudflare 가 저장소
//     루트를 그대로 올리므로, 빌드에서만 바꾸면 웹은 한 바이트도 안 줄어든다.
//   - directional-production.cjs 가 소스 SHA256 == 서버가 보낸 바이트를 단언한다. 빌드가
//     directional-art.js 를 고쳐 쓰면 그 핀이 구조적으로 깨진다.
//
// 선례: casual/{enemies,bosses}/extreme/ 666장은 이미 무손실 WebP(VP8L)이고 정상 동작한다.
// 런타임 로더는 확장자를 모른다 (new Image() 에 경로만 준다) — 경로만 맞으면 된다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeLossless, sha256 } from './lib/lossless-webp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const DRY = process.argv.includes('--dry-run');
const LIMIT = Number(arg('limit') || 0);
const ONLY = arg('only') || '';

// 런타임이 casual 경로를 들고 있는 파일들. 생성 파일(directional-art.js)도 포함한다.
const REWRITE = ['content.js', 'game.js', 'directional-art.js'];

const walk = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name);
      return d.isDirectory() ? walk(p) : [p];
    })
  : [];

const MiB = (n) => (n / 1048576).toFixed(2);

async function main() {
  let targets = walk(path.join(ROOT, 'casual'))
    .filter((p) => /\.png$/i.test(p))
    .map((p) => path.relative(ROOT, p).split(path.sep).join('/'))
    .sort();
  if (ONLY) targets = targets.filter((p) => p.startsWith(ONLY));
  if (LIMIT) targets = targets.slice(0, LIMIT);

  const report = {
    startedAt: new Date().toISOString(), dryRun: DRY, root: 'casual/',
    encoder: 'lossless webp effort 6; visible RGBA compared byte-for-byte',
    files: [], totals: {}, rewrites: [], errors: [],
  };
  const converted = new Map();   // 'casual/a/b.png' -> 'casual/a/b.webp'
  let pngBytes = 0, outBytes = 0, keptPng = 0, done = 0;

  for (const rel of targets) {
    const abs = path.join(ROOT, rel);
    const png = fs.readFileSync(abs);
    let r;
    try { r = await encodeLossless(png, rel); }
    catch (e) { report.errors.push({ file: rel, error: e.message }); continue; }

    pngBytes += r.record.pngBytes; outBytes += r.record.encodedBytes;
    report.files.push({ file: rel, ...r.record });

    if (r.extension === '.webp') {
      const webpRel = rel.replace(/\.png$/i, '.webp');
      converted.set(rel, webpRel);
      if (!DRY) {
        fs.writeFileSync(path.join(ROOT, webpRel), r.bytes);
        fs.unlinkSync(abs);
      }
    } else keptPng++;

    if (++done % 100 === 0) process.stderr.write(`  ${done}/${targets.length}\r`);
  }

  report.totals = {
    files: targets.length, converted: converted.size, keptAsPng: keptPng,
    pngBytes, encodedBytes: outBytes, savedBytes: pngBytes - outBytes,
    ratio: pngBytes ? +(outBytes / pngBytes).toFixed(4) : 0,
  };

  // ── 경로 재작성 — 실제로 변환에 성공한 것만 ────────────────────────────────
  if (!DRY && converted.size) {
    for (const file of REWRITE) {
      const abs = path.join(ROOT, file);
      if (!fs.existsSync(abs)) continue;
      const before = fs.readFileSync(abs, 'utf8');
      let after = before, hits = 0;
      // 리터럴 경로: 변환된 것만 정확히 치환한다 (추측하지 않는다)
      for (const [from, to] of converted) {
        if (!after.includes(from)) continue;
        after = after.split(from).join(to); hits++;
      }
      if (after !== before) {
        fs.writeFileSync(abs, after);
        report.rewrites.push({ file, literalPaths: hits, sha256: sha256(Buffer.from(after)) });
      }
    }

    // game.js 의 템플릿 둘은 리터럴이 아니라 따로 손본다.
    const gPath = path.join(ROOT, 'game.js');
    let g = fs.readFileSync(gPath, 'utf8');
    const gBefore = g;
    // 1) `casual/towers/star-${..}.png?v=` — star-NN 이 전부 변환됐을 때만
    const stars = [...converted.keys()].filter((p) => /^casual\/towers\/star-\d\d\.png$/.test(p));
    const starTotal = targets.filter((p) => /^casual\/towers\/star-\d\d\.png$/.test(p)).length;
    if (starTotal && stars.length === starTotal) {
      g = g.replace('casual/towers/star-${String(g).padStart(2, \'0\')}.png?v=',
                    'casual/towers/star-${String(g).padStart(2, \'0\')}.webp?v=');
    }
    // 2) TILE_ASSET_FILES 항목 + 확장자를 떼는 정규식
    for (const [from, to] of converted) {
      const m = /^casual\/tiles\/(.+)$/.exec(from);
      if (m) g = g.split(`'${m[1]}'`).join(`'${to.replace('casual/tiles/', '')}'`);
    }
    g = g.replace("name.replace(/\\.(png|jpg)$/, '')", "name.replace(/\\.(png|jpg|webp)$/, '')");
    if (g !== gBefore) {
      fs.writeFileSync(gPath, g);
      report.rewrites.push({ file: 'game.js (templates)', sha256: sha256(Buffer.from(g)) });
    }
  }

  const outDir = path.join(ROOT, 'tools/art-review/lossless-webp');
  fs.mkdirSync(outDir, { recursive: true });
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

  const t = report.totals;
  console.log(`${DRY ? '[측정만] ' : ''}${t.files}장 · PNG ${MiB(t.pngBytes)} MiB → ${MiB(t.encodedBytes)} MiB ` +
              `(${(t.ratio * 100).toFixed(1)}%, -${MiB(t.savedBytes)} MiB)`);
  console.log(`  webp 채택 ${t.converted} · PNG 유지 ${t.keptAsPng} (webp 가 더 큰 것) · 오류 ${report.errors.length}`);
  if (report.rewrites.length) console.log('  경로 재작성:', report.rewrites.map((r) => r.file + (r.literalPaths ? ` (${r.literalPaths})` : '')).join(' · '));
  console.log('  리포트:', path.relative(ROOT, path.join(outDir, 'report.json')));
  if (report.errors.length) { console.error('오류:', report.errors.slice(0, 5)); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
