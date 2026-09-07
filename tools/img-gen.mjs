// OpenAI 이미지 API 로 게임 그림을 뽑는다 (키아트 · 몬스터 정지컷 · 걷기 시트).
//   OPENAI_API_KEY=... node tools/img-gen.mjs tools/jobs/keyart.json [--only=id,id] [--dry] [--model=gpt-image-1] [--out=gen]
// 키는 환경변수로만 받는다 — 파일·로그에 절대 쓰지 않는다.
// 잡 파일: { "jobs": [ { "id", "prompt", "n", "size", "quality", "background", "refs": ["경로", …], "out": "gen/keyart" } ] }
//   refs 가 없으면 POST /v1/images/generations, 있으면 POST /v1/images/edits (참조 그림을 image[] 로 첨부 — 같은 캐릭터의 시트 등)
//   결과는 <out>-<k>.png (b64 → 파일). 429/5xx 는 지수 백오프로 4번까지 재시도.
import fs from 'node:fs';
import path from 'node:path';

const ARGS = process.argv.slice(2);
const jobFile = ARGS.find((a) => !a.startsWith('--'));
const opt = (k) => { const a = ARGS.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DRY = ARGS.includes('--dry');
const ONLY = opt('only') ? new Set(opt('only').split(',')) : null;
const KEY = process.env.OPENAI_API_KEY;
if (!jobFile) { console.error('usage: OPENAI_API_KEY=... node tools/img-gen.mjs <jobs.json> [--only=a,b] [--dry] [--model=...]'); process.exit(2); }
if (!KEY && !DRY) { console.error('OPENAI_API_KEY 환경변수가 필요합니다 (파일에 쓰지 마세요)'); process.exit(2); }

const spec = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
const STYLE = spec.style || '';
const jobs = (spec.jobs || []).filter((j) => !ONLY || ONLY.has(j.id));
const H = { Authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pickModel() {
  if (opt('model')) return opt('model');
  const r = await fetch('https://api.openai.com/v1/models', { headers: H });
  if (!r.ok) throw new Error(`models ${r.status} ${await r.text()}`);
  const ids = (await r.json()).data.map((m) => m.id).filter((id) => /^gpt-image-/.test(id) && !/mini/.test(id));
  if (!ids.length) throw new Error('gpt-image-* 모델을 찾지 못했습니다');
  ids.sort();                                  // 이름이 큰 쪽(최신 버전 표기)을 고른다: gpt-image-1 < gpt-image-1.5 < gpt-image-2
  return ids[ids.length - 1];
}

async function call(url, init, label) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, init);
    if (r.ok) return r.json();
    const body = await r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { const wait = 4000 * 2 ** attempt; console.warn(`${label}: ${r.status}, ${wait / 1000}s 뒤 재시도`); await sleep(wait); continue; }
    throw new Error(`${label}: ${r.status} ${body.slice(0, 400)}`);
  }
}

async function run(job, model) {
  const prompt = (job.prompt || '') + (job.noStyle ? '' : '\n' + STYLE);
  const n = job.n || 1, size = job.size || '1024x1024', quality = job.quality || 'medium', background = job.background || 'auto';
  const out = job.out || `gen/${job.id}`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  console.log(`\n== ${job.id} (${n}× ${size} ${quality} bg=${background}${job.refs ? ' refs=' + job.refs.length : ''})`);
  if (DRY) { console.log(prompt); return; }
  let data;
  if (job.refs && job.refs.length) {
    const fd = new FormData();
    for (const p of job.refs) fd.append('image[]', new Blob([fs.readFileSync(p)], { type: 'image/png' }), path.basename(p));
    fd.append('model', model); fd.append('prompt', prompt); fd.append('n', String(n)); fd.append('size', size); fd.append('quality', quality);
    if (background !== 'auto') fd.append('background', background);
    if (job.inputFidelity && !/^gpt-image-2/.test(model)) fd.append('input_fidelity', job.inputFidelity);   // gpt-image-2 는 이 인자를 거부한다 (400 invalid_input_fidelity_model)
    data = await call('https://api.openai.com/v1/images/edits', { method: 'POST', headers: H, body: fd }, job.id);
  } else {
    const body = { model, prompt, n, size, quality, output_format: 'png' };
    if (background !== 'auto') body.background = background;
    data = await call('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, job.id);
  }
  const files = [];
  (data.data || []).forEach((d, k) => {
    const f = `${out}-${k + 1}.png`;
    if (d.b64_json) fs.writeFileSync(f, Buffer.from(d.b64_json, 'base64'));
    else if (d.url) console.warn('url 응답 — 수동으로 받으세요:', d.url);
    files.push(f);
  });
  if (data.usage) console.log('usage', JSON.stringify(data.usage));
  console.log('→', files.join(', '));
}

const model = DRY ? (opt('model') || '(dry)') : await pickModel();
console.log('model:', model, '| jobs:', jobs.map((j) => j.id).join(', '));
for (const job of jobs) {
  try { await run(job, model); } catch (e) { console.error(`✗ ${job.id}:`, e.message); }
}
