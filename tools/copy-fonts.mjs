// 글꼴을 node_modules/@fontsource 에서 fonts/ 로 복사하고 fonts/fonts.css 를 만든다.
// 웹(Cloudflare)과 앱(www/) 둘 다 이 폴더를 쓴다 — Google Fonts CDN 의존 제거.
//   사용: npm run fonts
// 부분집합: korean + latin 만 (Do Hyeon 400, Noto Sans KR 400/500/700). unicode-range 는 fontsource unicode.json 에서 그대로 가져온다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'fonts');
const NM = path.join(ROOT, 'node_modules', '@fontsource');

const FONTS = [
  { pkg: 'do-hyeon',     family: 'Do Hyeon',     weights: [400] },
  { pkg: 'noto-sans-kr', family: 'Noto Sans KR', weights: [400, 500, 700] },
];
const SUBSETS = ['korean', 'latin'];

// fontsource 의 unicode.json 에서 부분집합의 unicode-range 를 읽는다.
// 'korean' 은 한 덩어리 파일이라 범위가 없다(= 전체) → 생략. 'latin' 은 범위가 있어 라틴 글자만 이 파일을 쓴다.
// 같은 family/weight 의 @font-face 가 여럿 맞으면 뒤에 선언한 것이 우선이므로 korean → latin 순서로 쓴다.
function unicodeRange(pkgDir, subset) {
  const j = path.join(pkgDir, 'unicode.json');
  if (!fs.existsSync(j)) return null;
  const map = JSON.parse(fs.readFileSync(j, 'utf8'));
  return map[subset] ? String(map[subset]).replace(/\s+/g, '') : null;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let css = '/* 생성 파일 — tools/copy-fonts.mjs (npm run fonts). 직접 고치지 말 것. */\n';
let total = 0, n = 0;
for (const f of FONTS) {
  const pkgDir = path.join(NM, f.pkg);
  if (!fs.existsSync(pkgDir)) { console.error(`없음: ${pkgDir} — npm install 먼저`); process.exit(1); }
  for (const w of f.weights) {
    for (const s of SUBSETS) {
      const name = `${f.pkg}-${s}-${w}-normal.woff2`;
      const src = path.join(pkgDir, 'files', name);
      if (!fs.existsSync(src)) { console.warn(`건너뜀(없음): ${name}`); continue; }
      fs.copyFileSync(src, path.join(OUT, name));
      const size = fs.statSync(src).size; total += size; n++;
      const ur = unicodeRange(pkgDir, s);
      css += `@font-face {\n  font-family: '${f.family}';\n  font-style: normal;\n  font-weight: ${w};\n  font-display: swap;\n  src: url('${name}') format('woff2');\n`;
      if (ur) css += `  unicode-range: ${ur};\n`;
      css += '}\n';
    }
  }
}
fs.writeFileSync(path.join(OUT, 'fonts.css'), css);
console.log(`fonts/: ${n} 파일, ${(total / 1024).toFixed(0)} KB + fonts.css`);
