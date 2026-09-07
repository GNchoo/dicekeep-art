// 인피니티 몬스터 잡 파일 생성기 — content.js(이름·등급·이동·단계·팔레트) + tools/inf-roster.json(영문 묘사·보행 방식) → img-gen 잡 JSON.
//   node tools/inf-jobs.mjs --waves=6-10 [--mode=single|multi] [--frames=4|6] [--quality=medium] [--n=1] [--refs] [--out=tools/jobs/inf-w06-10.json]
// single (기본): 몬스터마다 걷기 시트 1장 — 2x2(4프레임, 1024²) 또는 3x2(6프레임, 1536×1024). 정지컷은 시트 1칸(접지 자세)에서 자른다
//         (`sheet-check --still-out`) → 몬스터당 이미지 1장. --refs: casual/enemies/inf/wNNN.png 이 있으면 참조로 붙여 같은 캐릭터로 시트만 다시 뽑는다.
// multi:  몬스터 5마리까지를 세로 1024×1536 한 장에 (행 = 몬스터, 열 = 프레임, 칸 256×307). 이미지 1장 ≈ 5마리 → 비용 약 1/5.
//         한 행이 나쁘면 그 장을 다시 뽑아야 하고 칸이 작아 세부가 뭉개질 수 있다 — S·M 등급이 많은 단계에 알맞다. 결과는 tools/sheet-split.mjs 로 나눈다.
// 보스(10·20·…)는 정지컷 1장짜리 잡으로 따로 낸다 (걷기 시트 없음, 부관은 bNNN-2).
// 걷기 주기 프롬프트: 접지 → 통과 → 접지(반대 발) → 통과 를 프레임마다 명시하고, 머리·몸통·장비·크기는 모든 칸에서 동일, 발은 같은 바닥선, 칸의 65% 이하·여백 15% 를 요구한다.
import fs from 'node:fs';
import vm from 'node:vm';

const args = process.argv.slice(2);
const opt = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = (k) => args.includes(`--${k}`);
const range = opt('waves');
if (!range) { console.error('usage: node tools/inf-jobs.mjs --waves=6-10 [--mode=single|multi] [--frames=4|6] [--quality=medium] [--n=1] [--refs] [--out=…]'); process.exit(2); }
const [w0, w1] = range.split('-').map(Number);
const waves = []; for (let w = w0; w <= (w1 || w0); w++) waves.push(w);
const mode = opt('mode', 'single'), frames = +opt('frames', 4), quality = opt('quality', 'medium'), n = +opt('n', 1);

const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8'), ctx, { filename: 'content.js' });
const INF = ctx.window.DKCONTENT.INFINITY;
const roster = JSON.parse(fs.readFileSync(new URL('./inf-roster.json', import.meta.url), 'utf8'));
const pad3 = (w) => String(w).padStart(3, '0');

// 이 공통 제한은 이전 로스터 묘사·팔레트 문구·참조 이미지보다 우선한다. 11~101도 재생성할 때 적용한다.
const STYLE = 'Stylized hand-painted fantasy game character with chunky proportions, simplified shapes, clean readable contours, soft painted shading and lightly weathered equipment. Moderately dark adventure mood, expressive and characterful, readable at small tower-defense game scale. ART DIRECTION OVERRIDE: these rules take precedence over any conflicting creature description, palette wording or reference detail. No gore, blood stains, open wounds, sores, exposed organs, rotting flesh, mutilation, grotesque fused anatomy or photorealistic body horror. Interpret disease, decay and corpse-themed names as costume motifs, muted colors and playful fantasy character design, never literal injury. Skeletons use clean simplified bones; skull motifs are small carved ornaments. Preserve complete bodies, friendly-readable faces and distinct equipment silhouettes.';
const palette = (w) => { const p = INF.paletteOf(w); return `Palette of this tier: ${p.en}. Treat palette terms as color cues only: blood means muted wine-red cloth or rust, and skin cracks mean decorative armor or magical markings, never wounds. Use controlled midtone colors and clear light-dark separation so the character remains readable against the arena; avoid muddy all-black shading, pastel washes and neon saturation; any glow is small and restrained.`; };
const GAIT = {
  biped: {
    4: 'frame 1 CONTACT: right leg forward and left leg back, both feet on the ground, stride at its widest; frame 2 PASSING: the back leg swings forward under the body, body at its highest; frame 3 CONTACT mirrored: left leg forward and right leg back; frame 4 PASSING mirrored: the other leg swings under the body',
    6: 'frame 1 CONTACT: right leg forward, stride widest; frame 2 RECOIL: weight drops onto the front foot, knees bent, body lowest; frame 3 PASSING: back leg swings under the body, body highest; frames 4-6 repeat with the legs mirrored (left leg forward)',
  },
  quad: {
    4: 'diagonal trot: frame 1 front-right and back-left legs reach forward while the other pair pushes back; frame 2 all four legs gather under the body; frame 3 front-left and back-right legs reach forward; frame 4 legs gather again',
    6: 'trot: frame 1 front-right and back-left legs reach forward; frame 2 they land, the other pair lifts; frame 3 all legs gather under the body; frames 4-6 repeat with the pairs swapped',
  },
  fly: {
    4: 'wing beat while gliding: frame 1 wings raised high; frame 2 wings level; frame 3 wings swept down; frame 4 wings level; the body, head and legs stay at the same height and size',
    6: 'wing beat: wings high, half-down, level, down, half-up, level; the body, head and legs stay at the same height and size',
  },
  slither: { 4: 'undulating crawl: the S-curve of the body shifts a quarter wavelength forward each frame; head height and size unchanged', 6: 'undulating crawl: the S-curve of the body shifts one sixth of a wavelength forward each frame; head height and size unchanged' },
  float: { 4: 'hovering drift: only the trailing cloth, chains or energy swirl through one loop across the frames; body height and size unchanged', 6: 'hovering drift: trailing cloth or energy swirls through one loop across the six frames; body height and size unchanged' },
};
const gridOf = (f) => (f === 6 ? { cols: 3, rows: 2, size: '1536x1024' } : { cols: 2, rows: 2, size: '1024x1024' });
const RULES = (cols, rows, f) => `${cols}x${rows} sprite sheet: ${f} frames of ONE looping walk cycle of the same creature moving toward the RIGHT, 3/4 side view, read left-to-right then top-to-bottom. The head, torso, gear and overall size are IDENTICAL in every frame — only the limbs or wings change. The feet (or lowest point) rest on the same invisible ground line at the same height in every cell, the body is horizontally centered in its cell, and the creature fills about 65% of its cell leaving at least 15% empty margin on every side; nothing touches or crosses the cell borders. Transparent background, no ground shadow, no grid lines, no text, no watermark.`;
const STILL = 'Full body, 3/4 side view FACING RIGHT, centered, feet at the bottom center, filling about 80% of the frame. Transparent background, no ground shadow, no text, no watermark.';

const jobs = [];
const entry = (w) => {
  const m = INF.monsters[w], r = roster[String(w)];
  if (!m) throw new Error(`content.js 에 ${w} 웨이브가 없다`);
  if (!r) throw new Error(`tools/inf-roster.json 에 ${w} 웨이브 묘사(desc)가 없다 — 먼저 적어 주세요`);
  if (r.name !== m.name) console.warn(`경고: ${w} 이름이 다르다 — content.js '${m.name}' vs roster '${r.name}'`);
  return { w, m, r };
};
const bulk = (m) => ({ S: 'small and light', M: 'medium build', L: 'large, heavy and massive' })[m.cls] || '';
const normal = waves.map(entry).filter((e) => !e.m.boss);
const bosses = waves.map(entry).filter((e) => e.m.boss);

if (mode === 'single') {
  const g = gridOf(frames);
  for (const { w, m, r } of normal) {
    const gait = r.gait || (m.move === 'air' ? 'fly' : 'biped');
    const ref = `casual/enemies/inf/w${pad3(w)}.png`;
    const useRef = has('refs') && fs.existsSync(new URL('../' + ref, import.meta.url));
    const prompt = `${useRef ? 'Keep exactly the same creature, colors and gear as the reference image. ' : ''}${r.desc} (${bulk(m)}). Walk cycle — ${GAIT[gait][frames]}. ${RULES(g.cols, g.rows, frames)} ${palette(w)}`;
    const job = { id: `w${pad3(w)}-walk`, n, size: g.size, quality, background: 'transparent', out: `gen/inf/w${pad3(w)}-walk`, prompt };
    if (useRef) { job.refs = [ref]; job.inputFidelity = 'high'; }
    jobs.push(job);
  }
} else {
  for (let i = 0; i < normal.length; i += 5) {
    const chunk = normal.slice(i, i + 5), R = chunk.length;
    const rowsTxt = chunk.map(({ w, m, r }, k) => { const gait = r.gait || (m.move === 'air' ? 'fly' : 'biped'); return `Row ${k + 1} (wave ${w}): ${r.desc} (${bulk(m)}); ${GAIT[gait][frames]}.`; }).join(' ');
    const size = R > 3 ? '1024x1536' : '1536x1024';
    const prompt = `Sprite sheet with ${R} horizontal rows and ${frames} columns on a transparent background. Each row is a DIFFERENT creature and each row is ONE looping walk cycle of that creature moving toward the RIGHT (3/4 side view), frames read left-to-right. In every row the creature's head, torso, gear and size are identical across its frames — only limbs or wings change; feet rest on the same invisible ground line at the same height in every cell; each creature is horizontally centered in its cell and fills about 65% of the cell with at least 15% empty margin; nothing touches or crosses the cell borders; the rows are evenly spaced and do not overlap. No ground shadow, no grid lines, no text, no watermark. ${rowsTxt} ${palette(chunk[0].w)}`;
    const ids = chunk.map(({ w }) => `w${pad3(w)}`);
    jobs.push({ id: `t${INF.tierIndex(chunk[0].w)}-${ids[0].slice(1)}-${ids[ids.length - 1].slice(1)}`, n, size, quality, background: 'transparent', out: `gen/inf/${ids[0]}-${ids[ids.length - 1]}`, rows: ids, cols: frames, prompt,
      split: `node tools/sheet-split.mjs gen/inf/${ids[0]}-${ids[ids.length - 1]}-1.png --rows=${ids.join(',')} --cols=${frames} --pack` });
  }
}
for (const { w, m, r } of bosses) {
  const add = (tag, name, desc) => jobs.push({ id: `b${pad3(w)}${tag}`, n, size: '1024x1024', quality, background: 'transparent', out: `gen/inf/b${pad3(w)}${tag}`, prompt: `BOSS "${name}": ${desc || r.desc} (${bulk(m)}, imposing). ${STILL} ${palette(w)}` });
  add('', m.name, r.bossDesc);
  if (m.second) add('-2', m.second, r.secondDesc);
}
const spec = { style: STYLE, jobs };
const out = opt('out');
const json = JSON.stringify(spec, null, 2) + '\n';
if (out) { fs.writeFileSync(out, json); console.log(`→ ${out} (${jobs.length} jobs, mode ${mode}, ${frames} frames)`); } else process.stdout.write(json);
