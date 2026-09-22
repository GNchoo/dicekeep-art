// OpenAI 이미지 API로 게임 아트를 생성한다.
//
//   OPENAI_API_KEY=... node tools/img-gen.mjs tools/jobs/keyart.json [--only=id,id]
//     [--dry] [--model=gpt-image-2-2026-04-21] [--out=gen] [--overwrite]
//     [--manifest=gen/manifests/my-run.json] [--style-file=tools/art-style.json]
//
// 잡 파일은 기존 { style, jobs } 형식과 중앙 스타일 프로필 형식을 모두 지원한다.
//   { "styleProfile": "keyart", "jobs": [...] }
// 중앙 프로필 기본 경로: tools/art-style.json
// 키는 환경변수로만 받으며 파일이나 로그에 기록하지 않는다.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'gen');
// 모델 목록이나 별칭의 현재 대상을 추측하지 않는다. 프로필에서 모델을 지정하지 않은
// 구형 잡도 재현 가능한 snapshot으로 실행되도록 이 값을 명시적으로 고정한다.
const PINNED_DEFAULT_MODEL = 'gpt-image-2-2026-04-21';
const DEFAULT_STYLE_FILE = path.join(SCRIPT_DIR, 'art-style.json');
const ARGS = process.argv.slice(2);
const jobFileArg = ARGS.find((arg) => !arg.startsWith('--'));
const valueOption = (name) => {
  const prefix = `--${name}=`;
  const arg = ARGS.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
};
const flag = (name) => ARGS.includes(`--${name}`);
const DRY = flag('dry');
const OVERWRITE = flag('overwrite');
const ONLY_VALUES = valueOption('only')
  ? valueOption('only').split(',').map((item) => item.trim()).filter(Boolean)
  : null;
const ONLY = ONLY_VALUES ? new Set(ONLY_VALUES) : null;
const API_KEY = process.env.OPENAI_API_KEY;
const API_HEADERS = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const runId = `${now().replace(/[:.]/g, '-')}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

function failUsage(message) {
  if (message) console.error(message);
  console.error('usage: OPENAI_API_KEY=... node tools/img-gen.mjs <jobs.json> [--only=a,b] [--dry] [--model=...] [--out=gen] [--overwrite] [--manifest=...] [--style-file=...]');
  process.exit(2);
}

if (!jobFileArg) failUsage();
if (!API_KEY && !DRY) failUsage('OPENAI_API_KEY 환경변수가 필요합니다 (파일에 쓰지 마세요)');

const jobFile = path.resolve(jobFileArg);
let spec;
let jobFileBuffer;
try {
  jobFileBuffer = fs.readFileSync(jobFile);
  spec = JSON.parse(jobFileBuffer.toString('utf8'));
} catch (error) {
  failUsage(`잡 파일을 읽지 못했습니다: ${error.message}`);
}

function readStyleDocument() {
  const configuredPath = valueOption('style-file') || spec.styleFile;
  const styleFile = path.resolve(configuredPath || DEFAULT_STYLE_FILE);
  if (!fs.existsSync(styleFile)) {
    if (spec.style || !(spec.styleProfile || (spec.jobs || []).some((job) => job.styleProfile))) {
      return { file: null, data: null, buffer: null };
    }
    throw new Error(`스타일 프로필 파일이 없습니다: ${styleFile}`);
  }
  let data;
  let buffer;
  try {
    buffer = fs.readFileSync(styleFile);
    data = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new Error(`스타일 프로필 파일을 읽지 못했습니다: ${styleFile} (${error.message})`);
  }
  return { file: styleFile, data, buffer };
}

let styleDocument;
try {
  styleDocument = readStyleDocument();
} catch (error) {
  failUsage(error.message);
}

function profileFor(job) {
  const name = job.styleProfile || spec.styleProfile || null;
  if (!name) return { name: null, value: null };
  const profiles = styleDocument.data?.profiles;
  const value = profiles && Object.hasOwn(profiles, name) ? profiles[name] : null;
  if (!value) throw new Error(`styleProfile '${name}'을 ${styleDocument.file || '스타일 파일'}에서 찾지 못했습니다`);
  return { name, value };
}

function profileStyle(profile) {
  if (!profile) return '';
  if (typeof profile === 'string') return profile;
  // profile.prompt는 초기 프로필 스키마와의 호환을 위해 지원한다.
  return profile.style || profile.prompt || '';
}

function generationValue(job, profile, keys, fallback) {
  const aliases = Array.isArray(keys) ? keys : [keys];
  const scopes = [job, job.generation, spec, spec.generation, profile?.generation, styleDocument.data?.generation];
  for (const scope of scopes) {
    if (!scope || typeof scope !== 'object') continue;
    for (const key of aliases) {
      if (Object.hasOwn(scope, key) && scope[key] != null) return scope[key];
    }
  }
  return fallback;
}

function resolveModel(job, profile) {
  const cliModel = valueOption('model');
  if (cliModel) return { value: cliModel, source: 'cli' };
  if (job.model || job.generation?.model) return { value: job.model || job.generation.model, source: 'job' };
  if (spec.model || spec.generation?.model) return { value: spec.model || spec.generation.model, source: 'job-file' };
  if (profile?.generation?.model) return { value: profile.generation.model, source: 'style-profile' };
  if (styleDocument.data?.generation?.model) return { value: styleDocument.data.generation.model, source: 'style-file' };
  return { value: PINNED_DEFAULT_MODEL, source: 'pinned-default' };
}

function resolveInputPath(input) {
  if (path.isAbsolute(input)) return input;
  // 기존 잡 파일은 저장소 루트 기준 경로를 사용한다. 외부 잡 파일은 잡 파일 기준도 허용한다.
  const fromRepo = path.resolve(REPO_ROOT, input);
  if (fs.existsSync(fromRepo)) return fromRepo;
  return path.resolve(path.dirname(jobFile), input);
}

function relativeForManifest(input) {
  const absolute = path.resolve(input);
  const relative = path.relative(REPO_ROOT, absolute);
  return !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.replaceAll('\\', '/')
    : absolute.replaceAll('\\', '/');
}

function resolveOutputPrefix(job) {
  const configured = job.out || `gen/${job.id}`;
  if (typeof configured !== 'string' || !configured.trim()) throw new Error(`${job.id}: out이 비어 있습니다`);
  const configuredAbsolute = path.resolve(REPO_ROOT, configured);
  const relativeFromDefault = path.relative(DEFAULT_OUTPUT_ROOT, configuredAbsolute);
  if (relativeFromDefault.startsWith('..') || path.isAbsolute(relativeFromDefault)) {
    throw new Error(`${job.id}: out은 gen/ 밖을 가리킬 수 없습니다: ${configured}`);
  }
  const outputRoot = path.resolve(valueOption('out') || DEFAULT_OUTPUT_ROOT);
  const resolved = path.resolve(outputRoot, relativeFromDefault);
  const relativeFromRoot = path.relative(outputRoot, resolved);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    throw new Error(`${job.id}: 출력 경로가 staging root 밖으로 벗어납니다: ${configured}`);
  }
  return resolved;
}

function extensionFor(format) {
  if (format === 'jpeg' || format === 'jpg') return 'jpg';
  if (format === 'webp') return 'webp';
  return 'png';
}

function mimeForFile(file) {
  switch (path.extname(file).toLowerCase()) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    default: return 'image/png';
  }
}

function inspectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) throw new Error('유효한 PNG 서명이 없습니다');
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG IHDR 청크가 없습니다');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > 16384 || height > 16384) throw new Error(`PNG 크기가 비정상입니다: ${width}x${height}`);
  return { format: 'png', width, height };
}

function inspectJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('유효한 JPEG 서명이 없습니다');
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (!width || !height) throw new Error('JPEG 크기가 비정상입니다');
      return { format: 'jpeg', width, height };
    }
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += 2 + length;
  }
  throw new Error('JPEG 크기 정보를 찾지 못했습니다');
}

function inspectWebp(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('유효한 WebP 서명이 없습니다');
  }
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { format: 'webp', width, height };
  }
  if (kind === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8 ') {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    if (width && height) return { format: 'webp', width, height };
  }
  throw new Error('WebP 크기 정보를 찾지 못했습니다');
}

async function inspectImage(buffer, expectedFormat, requestedSize) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 64) throw new Error('이미지 응답이 비어 있거나 너무 작습니다');
  let metadata;
  if (expectedFormat === 'png') metadata = inspectPng(buffer);
  else if (expectedFormat === 'jpeg' || expectedFormat === 'jpg') metadata = inspectJpeg(buffer);
  else if (expectedFormat === 'webp') metadata = inspectWebp(buffer);
  else throw new Error(`지원하지 않는 outputFormat입니다: ${expectedFormat}`);

  try {
    // 헤더만 위조되거나 본문이 잘린 파일도 통과하지 않도록 픽셀 데이터 전체를 해독한다.
    const decoded = sharp(buffer, { failOn: 'warning' });
    const decodedMetadata = await decoded.metadata();
    await decoded.stats();
    const normalizedFormat = decodedMetadata.format === 'jpg' ? 'jpeg' : decodedMetadata.format;
    const normalizedExpected = expectedFormat === 'jpg' ? 'jpeg' : expectedFormat;
    if (normalizedFormat !== normalizedExpected) {
      throw new Error(`요청 형식 ${normalizedExpected}와 실제 형식 ${normalizedFormat || 'unknown'}이 다릅니다`);
    }
  } catch (error) {
    throw new Error(`이미지 전체 디코딩 검증에 실패했습니다: ${error.message}`);
  }

  const match = /^(\d+)x(\d+)$/.exec(requestedSize);
  if (match && (metadata.width !== Number(match[1]) || metadata.height !== Number(match[2]))) {
    throw new Error(`요청 크기 ${requestedSize}와 응답 크기 ${metadata.width}x${metadata.height}가 다릅니다`);
  }
  return metadata;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

const manifestArg = valueOption('manifest');
const manifestFile = path.resolve(manifestArg || path.join(REPO_ROOT, 'gen', 'manifests', `img-gen-${runId}.json`));
const manifest = {
  schemaVersion: 1,
  runId,
  status: 'preparing',
  dryRun: DRY,
  overwrite: OVERWRITE,
  startedAt: now(),
  completedAt: null,
  jobFile: relativeForManifest(jobFile),
  jobFileSha256: sha256(jobFileBuffer),
  styleFile: styleDocument.file ? relativeForManifest(styleDocument.file) : null,
  styleFileSha256: styleDocument.buffer ? sha256(styleDocument.buffer) : null,
  styleVersion: styleDocument.data?.version ?? null,
  selection: ONLY_VALUES,
  outputRoot: valueOption('out') ? relativeForManifest(path.resolve(valueOption('out'))) : null,
  jobs: [],
};

function saveManifest() {
  atomicJson(manifestFile, manifest);
}

function assemblePrompt(job, profile) {
  const base = String(job.prompt || '').trim();
  const style = job.noStyle ? '' : String(profileStyle(profile) || spec.style || '').trim();
  return [base, style].filter(Boolean).join('\n');
}

function prepareJob(job) {
  if (!job || typeof job !== 'object') throw new Error('job 항목은 객체여야 합니다');
  if (!job.id || typeof job.id !== 'string') throw new Error('job.id가 필요합니다');
  const { name: styleProfile, value: profile } = profileFor(job);
  const finalPrompt = assemblePrompt(job, profile);
  if (!finalPrompt) throw new Error(`${job.id}: prompt가 비어 있습니다`);
  const model = resolveModel(job, profile);
  if (!model.value || typeof model.value !== 'string') throw new Error(`${job.id}: model이 비어 있습니다`);
  const n = Number(generationValue(job, profile, 'n', 1));
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error(`${job.id}: n은 1~10 정수여야 합니다`);
  const size = generationValue(job, profile, 'size', '1024x1024');
  if (typeof size !== 'string' || !/^(auto|\d+x\d+)$/.test(size)) throw new Error(`${job.id}: 잘못된 size: ${size}`);
  const quality = generationValue(job, profile, 'quality', 'medium');
  const background = generationValue(job, profile, 'background', 'auto');
  const outputFormat = generationValue(job, profile, ['outputFormat', 'output_format'], 'png');
  if (!['png', 'jpeg', 'jpg', 'webp'].includes(outputFormat)) throw new Error(`${job.id}: 지원하지 않는 outputFormat: ${outputFormat}`);
  const outputCompression = generationValue(job, profile, ['outputCompression', 'output_compression'], null);
  const inputFidelity = generationValue(job, profile, ['inputFidelity', 'input_fidelity'], null);
  const inputFidelitySent = Boolean(job.refs?.length)
    && inputFidelity != null
    && !/^gpt-image-2(?:-|$)/.test(model.value);
  const moderation = generationValue(job, profile, 'moderation', null);
  const outPrefix = resolveOutputPrefix(job);
  const extension = extensionFor(outputFormat);
  const outputs = Array.from({ length: n }, (_, index) => `${outPrefix}-${index + 1}.${extension}`);
  const refs = (job.refs || []).map((configuredPath) => {
    const resolved = resolveInputPath(configuredPath);
    const buffer = fs.readFileSync(resolved);
    if (!buffer.length) throw new Error(`${job.id}: 참조 이미지가 비어 있습니다: ${configuredPath}`);
    return {
      configuredPath,
      absolutePath: resolved,
      path: relativeForManifest(resolved),
      bytes: buffer.length,
      sha256: sha256(buffer),
      mimeType: mimeForFile(resolved),
    };
  });
  const refsSha256 = sha256(JSON.stringify(refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }))));
  return {
    raw: job,
    id: job.id,
    styleProfile,
    finalPrompt,
    promptSha256: sha256(finalPrompt),
    model: model.value,
    modelSource: model.source,
    refs,
    refsSha256,
    outputs,
    options: { n, size, quality, background, outputFormat, outputCompression, inputFidelity, inputFidelitySent, moderation },
  };
}

const allJobs = Array.isArray(spec.jobs) ? spec.jobs : [];
const selectedJobs = allJobs.filter((job) => !ONLY || ONLY.has(job.id));
const preflightErrors = [];
const duplicateIds = allJobs.map((job) => job?.id).filter(Boolean).filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateIds.length) preflightErrors.push(`중복 job id: ${[...new Set(duplicateIds)].join(', ')}`);
if (!selectedJobs.length) preflightErrors.push('선택된 job이 없습니다');
if (ONLY) {
  const known = new Set(allJobs.map((job) => job?.id));
  const missing = ONLY_VALUES.filter((id) => !known.has(id));
  if (missing.length) preflightErrors.push(`존재하지 않는 --only id: ${missing.join(', ')}`);
}

const preparedJobs = [];
for (const job of selectedJobs) {
  try {
    preparedJobs.push(prepareJob(job));
  } catch (error) {
    const id = job?.id || '(unknown)';
    preflightErrors.push(`${id}: ${error.message}`);
    manifest.jobs.push({ id, status: 'failed', error: error.message });
  }
}

const ownerByOutput = new Map();
const reservedOutputPaths = new Map();
const pathKey = (file) => path.resolve(file).toLowerCase();
for (const job of preparedJobs) {
  for (const output of job.outputs) {
    const key = pathKey(output);
    if (ownerByOutput.has(key)) preflightErrors.push(`출력 경로 중복: ${output} (${ownerByOutput.get(key)}, ${job.id})`);
    ownerByOutput.set(key, job.id);
    reservedOutputPaths.set(key, `${job.id} output`);
    reservedOutputPaths.set(pathKey(`${output}.tmp-${runId}`), `${job.id} temporary`);
    reservedOutputPaths.set(pathKey(`${output}.backup-${runId}`), `${job.id} backup`);
    if (!DRY && !OVERWRITE && fs.existsSync(output)) preflightErrors.push(`기존 출력 보호: ${output} (--overwrite 필요)`);
  }
}

let manifestUsable = true;
const manifestArtifacts = [manifestFile, `${manifestFile}.tmp-${process.pid}`];
for (const artifact of manifestArtifacts) {
  const conflict = reservedOutputPaths.get(pathKey(artifact));
  if (conflict) {
    preflightErrors.push(`manifest 경로가 ${conflict} 경로와 충돌합니다: ${artifact}`);
    manifestUsable = false;
  }
}
if (fs.existsSync(manifestFile)) {
  preflightErrors.push(`기존 manifest를 덮어쓸 수 없습니다: ${manifestFile}`);
  manifestUsable = false;
}

if (preflightErrors.length) {
  for (const error of preflightErrors) console.error(`✗ ${error}`);
  const recorded = new Set(manifest.jobs.map((job) => job.id));
  for (const job of preparedJobs) {
    if (!recorded.has(job.id)) manifest.jobs.push({
      id: job.id,
      status: 'blocked',
      model: job.model,
      modelSource: job.modelSource,
      styleProfile: job.styleProfile,
      finalPrompt: job.finalPrompt,
      finalPromptSha256: job.promptSha256,
      refs: job.refs.map(({ path: refPath, bytes, sha256: hash }) => ({ path: refPath, bytes, sha256: hash })),
      refsSha256: job.refsSha256,
      options: job.options,
      outputs: job.outputs.map((output) => ({ path: relativeForManifest(output) })),
    });
  }
  manifest.status = 'failed';
  manifest.completedAt = now();
  manifest.errors = preflightErrors;
  if (manifestUsable) {
    saveManifest();
    console.error('manifest:', manifestFile);
  } else {
    console.error('manifest는 경로 보호를 위해 기록하지 않았습니다');
  }
  process.exit(1);
}

async function callJson(url, init, label) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      throw new Error(`${label}: 네트워크 오류: ${error.message}`);
    }
    if (response.ok) {
      try {
        return await response.json();
      } catch (error) {
        throw new Error(`${label}: JSON 응답을 읽지 못했습니다: ${error.message}`);
      }
    }
    const body = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const wait = 4000 * (2 ** attempt);
      console.warn(`${label}: ${response.status}, ${wait / 1000}s 뒤 재시도`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${label}: ${response.status} ${body.slice(0, 400)}`);
  }
  throw new Error(`${label}: 재시도 횟수를 초과했습니다`);
}

async function downloadUrl(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label}: 잘못된 이미지 URL 응답`);
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error(`${label}: 허용되지 않는 이미지 URL 프로토콜`);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let response;
    try {
      // 다른 호스트의 서명 URL에 OpenAI API 키를 전달하지 않는다.
      response = await fetch(parsed);
    } catch (error) {
      throw new Error(`${label}: URL 이미지 다운로드 실패: ${error.message}`);
    }
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const wait = 1000 * (2 ** attempt);
      await sleep(wait);
      continue;
    }
    throw new Error(`${label}: URL 이미지 다운로드 ${response.status}`);
  }
  throw new Error(`${label}: URL 이미지 다운로드 재시도 횟수를 초과했습니다`);
}

async function requestImages(job) {
  let data;
  if (job.refs.length) {
    const form = new FormData();
    for (const ref of job.refs) {
      const buffer = fs.readFileSync(ref.absolutePath);
      if (sha256(buffer) !== ref.sha256) throw new Error(`${job.id}: 실행 준비 후 참조 이미지가 변경되었습니다: ${ref.path}`);
      form.append('image[]', new Blob([buffer], { type: ref.mimeType }), path.basename(ref.absolutePath));
    }
    form.append('model', job.model);
    form.append('prompt', job.finalPrompt);
    form.append('n', String(job.options.n));
    form.append('size', job.options.size);
    form.append('quality', job.options.quality);
    form.append('output_format', job.options.outputFormat === 'jpg' ? 'jpeg' : job.options.outputFormat);
    if (job.options.background !== 'auto') form.append('background', job.options.background);
    if (job.options.outputCompression != null) form.append('output_compression', String(job.options.outputCompression));
    if (job.options.inputFidelitySent) form.append('input_fidelity', String(job.options.inputFidelity));
    if (job.options.moderation != null) form.append('moderation', String(job.options.moderation));
    data = await callJson('https://api.openai.com/v1/images/edits', { method: 'POST', headers: API_HEADERS, body: form }, job.id);
  } else {
    const body = {
      model: job.model,
      prompt: job.finalPrompt,
      n: job.options.n,
      size: job.options.size,
      quality: job.options.quality,
      output_format: job.options.outputFormat === 'jpg' ? 'jpeg' : job.options.outputFormat,
    };
    if (job.options.background !== 'auto') body.background = job.options.background;
    if (job.options.outputCompression != null) body.output_compression = job.options.outputCompression;
    if (job.options.moderation != null) body.moderation = job.options.moderation;
    data = await callJson('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, job.id);
  }

  if (!Array.isArray(data.data)) throw new Error(`${job.id}: 응답에 data 배열이 없습니다`);
  if (data.data.length !== job.options.n) {
    throw new Error(`${job.id}: 이미지 ${job.options.n}개를 요청했지만 ${data.data.length}개를 받았습니다`);
  }

  const images = [];
  for (let index = 0; index < data.data.length; index += 1) {
    const item = data.data[index] || {};
    let buffer;
    let source;
    if (typeof item.b64_json === 'string' && item.b64_json.length) {
      buffer = Buffer.from(item.b64_json, 'base64');
      source = 'b64_json';
    } else if (typeof item.url === 'string' && item.url.length) {
      buffer = await downloadUrl(item.url, `${job.id}[${index}]`);
      source = 'url';
    } else {
      throw new Error(`${job.id}[${index}]: b64_json 또는 url 이미지가 없습니다`);
    }
    const metadata = await inspectImage(buffer, job.options.outputFormat, job.options.size);
    images.push({ buffer, source, metadata });
  }
  return { images, usage: data.usage || null };
}

function installOutputs(job, images) {
  const staged = [];
  const backups = [];
  const installed = [];
  try {
    for (let index = 0; index < images.length; index += 1) {
      const output = job.outputs[index];
      fs.mkdirSync(path.dirname(output), { recursive: true });
      const temporary = `${output}.tmp-${runId}`;
      fs.writeFileSync(temporary, images[index].buffer, { flag: 'wx' });
      staged.push({ temporary, output });
    }
    if (OVERWRITE) {
      for (const { output } of staged) {
        if (!fs.existsSync(output)) continue;
        const backup = `${output}.backup-${runId}`;
        fs.renameSync(output, backup);
        backups.push({ output, backup });
      }
    }
    for (const { temporary, output } of staged) {
      if (OVERWRITE) {
        fs.renameSync(temporary, output);
        installed.push(output);
      } else {
        // preflight 뒤에 파일이 생기는 경쟁 조건에서도 기존 파일을 덮어쓰지 않는다.
        fs.copyFileSync(temporary, output, fs.constants.COPYFILE_EXCL);
        installed.push(output);
        fs.rmSync(temporary);
      }
    }
  } catch (error) {
    for (const output of installed) fs.rmSync(output, { force: true });
    for (const { output, backup } of backups.reverse()) {
      if (fs.existsSync(backup)) fs.renameSync(backup, output);
    }
    for (const { temporary } of staged) fs.rmSync(temporary, { force: true });
    throw error;
  }
  // 새 출력 설치가 끝난 뒤의 백업 정리 실패는 성공한 결과와 원본을 되돌리지 않는다.
  // 남은 백업 경로를 알려 수동 정리할 수 있게 한다.
  for (const { backup } of backups) {
    try {
      fs.rmSync(backup, { force: true });
    } catch (error) {
      console.warn(`백업 파일 정리 실패: ${backup} (${error.message})`);
    }
  }
}

manifest.status = DRY ? 'dry-run' : 'running';
saveManifest();
let failures = 0;
for (const job of preparedJobs) {
  const entry = {
    id: job.id,
    status: DRY ? 'dry-run' : 'running',
    startedAt: now(),
    completedAt: null,
    model: job.model,
    modelSource: job.modelSource,
    styleProfile: job.styleProfile,
    finalPrompt: job.finalPrompt,
    finalPromptSha256: job.promptSha256,
    refs: job.refs.map(({ path: refPath, bytes, sha256: hash }) => ({ path: refPath, bytes, sha256: hash })),
    refsSha256: job.refsSha256,
    options: job.options,
    outputs: job.outputs.map((output) => ({ path: relativeForManifest(output) })),
  };
  manifest.jobs.push(entry);
  console.log(`\n== ${job.id}`);
  console.log(`model: ${job.model} (${job.modelSource})`);
  console.log(`options: ${job.options.n}× ${job.options.size} ${job.options.quality} bg=${job.options.background} format=${job.options.outputFormat}${job.refs.length ? ` refs=${job.refs.length}` : ''}`);
  console.log(`prompt sha256: ${job.promptSha256}`);
  if (DRY) {
    console.log('--- final prompt ---');
    console.log(job.finalPrompt);
    console.log('--- outputs ---');
    for (const output of job.outputs) console.log(relativeForManifest(output));
    entry.completedAt = now();
    saveManifest();
    continue;
  }
  try {
    const { images, usage } = await requestImages(job);
    installOutputs(job, images);
    entry.status = 'succeeded';
    entry.responseCount = images.length;
    entry.usage = usage;
    entry.outputs = job.outputs.map((output, index) => ({
      path: relativeForManifest(output),
      bytes: images[index].buffer.length,
      sha256: sha256(images[index].buffer),
      width: images[index].metadata.width,
      height: images[index].metadata.height,
      format: images[index].metadata.format,
      responseSource: images[index].source,
    }));
    console.log('→', entry.outputs.map((output) => output.path).join(', '));
    if (usage) console.log('usage', JSON.stringify(usage));
  } catch (error) {
    failures += 1;
    entry.status = 'failed';
    entry.error = error.message;
    console.error(`✗ ${job.id}: ${error.message}`);
  }
  entry.completedAt = now();
  saveManifest();
}

manifest.completedAt = now();
manifest.status = failures ? 'failed' : (DRY ? 'dry-run' : 'succeeded');
manifest.failureCount = failures;
saveManifest();
console.log('\nmanifest:', relativeForManifest(manifestFile));
if (failures) process.exitCode = 1;
