// Audit only explicitly named final builds, then archive their immutable evidence.
// node tools/audit-directional-release.mjs [--partial] [--check-only] [--ledger=repo/path.json] gen/final-build ...
// Default requires the exact 110-character production catalog. --partial never grants readiness.
// node tools/audit-directional-release.mjs --self-test
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { expandConfig } from './lib/directional-rig.mjs';
import { inspectAlpha } from './lib/directional-image.mjs';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const recordPath = 'tools/art-review/directional-101/release-builds.json';
const evidenceRoot = 'tools/art-review/directional-101/evidence/builds';
const catalogPath = 'tools/art-review/directional-101/production-catalog.json';
const ledgers = [
  'tools/art-review/directional-101/generation-ledger.json',
  'tools/art-review/directional-101/middle-waves/generation-ledger.json',
  'tools/art-review/directional-101/late-waves/generation-ledger.json',
  'tools/art-review/star-towers-07-20/call-ledger.json',
];
const views = ['side', 'front', 'back'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function requireThat(condition, message) { if (!condition) throw Error(message); }
function cleanRelative(relative) {
  requireThat(typeof relative === 'string' && !!relative && !relative.includes('\\') && !relative.includes(':') && !relative.includes('\0') && !path.posix.isAbsolute(relative), 'not a portable relative path: ' + relative);
  requireThat(relative.split('/').every(p => p && p !== '.' && p !== '..'), 'noncanonical path: ' + relative);
  return relative;
}
function contained(base, relative) {
  cleanRelative(relative);
  const absolute = path.resolve(base, relative), root = fs.realpathSync(base);
  requireThat(absolute.startsWith(path.resolve(base) + path.sep), 'path leaves its root: ' + relative);
  // Reject symlink escapes too; the archive is reproducible from this repository.
  const real = fs.realpathSync(absolute);
  requireThat(real.startsWith(root + path.sep), 'symlink leaves its root: ' + relative);
  return absolute;
}
function permanent(relative) {
  cleanRelative(relative);
  requireThat(!relative.split('/').some(p => /^(?:gen|tmp|temp|node_modules|\.git)$/i.test(p)), 'temporary/generated source dependency: ' + relative);
  return contained(repo, relative);
}
function bytesRecord(relative, bytes) { return { path: relative, sha256: hash(bytes), bytes: bytes.length }; }
function readJson(base, relative) {
  const bytes = fs.readFileSync(contained(base, relative));
  return { ...bytesRecord(relative, bytes), bytesValue: bytes, value: JSON.parse(bytes) };
}
function verifyHash(bytes, expected, label) {
  requireThat(typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected) && hash(bytes) === expected, 'SHA mismatch: ' + label);
}
function approved(configEntry, runtime, evidence, label) {
  requireThat(configEntry?.reviewApproved === true && runtime?.ready === true && evidence?.ready === true && evidence?.reviewApproved === true, 'unapproved/incomplete entry: ' + label);
  requireThat(Array.isArray(evidence.errors) && evidence.errors.length === 0, 'entry QA errors: ' + label);
  requireThat(equal(Object.keys(runtime.views || {}).sort(), views.slice().sort()) && equal(Object.keys(evidence.views || {}).sort(), views.slice().sort()), 'entry lacks exactly three views: ' + label);
}
function coverage(ids, catalogIds, runtimeIds, partial) {
  const missing = catalogIds.filter(id => !ids.includes(id));
  requireThat(new Set(ids).size === ids.length, 'duplicate asset across selected builds');
  requireThat(ids.every(id => catalogIds.includes(id)), 'selected builds contain noncatalog IDs');
  requireThat(runtimeIds.every(id => catalogIds.includes(id)), 'production contains noncatalog IDs');
  if (!partial) requireThat(ids.length === 110 && !missing.length && runtimeIds.length === 110 && runtimeIds.every(id => ids.includes(id)), 'complete audit requires all 110 exact catalog/production IDs; missing: ' + missing.join(','));
  return { complete: !missing.length && runtimeIds.length === 110, missingCatalogIds: missing, productionIdsOutsideSelectedBuilds: runtimeIds.filter(id => !ids.includes(id)) };
}
function verifyEvidence(manifest, qa, validation, moving, label) {
  requireThat(Array.isArray(qa.value.errors) && !qa.value.errors.length, 'builder QA failed: ' + label);
  for (const record of [validation, moving]) {
    requireThat(record.value.passed === true && Array.isArray(record.value.errors) && !record.value.errors.length, 'failed/missing validation: ' + label + '/' + record.path);
    requireThat(record.value.manifestSha256 === manifest.sha256, 'stale manifest evidence: ' + label + '/' + record.path);
  }
  requireThat(validation.value.qaSha256 === qa.sha256, 'stale QA validation: ' + label);
}

async function audit(dirs, partial, checkOnly, extraLedgers = []) {
  const catalog = readJson(repo, catalogPath), catalogIds = catalog.value.entries.map(e => e.assetId);
  requireThat(catalogIds.length === 110 && new Set(catalogIds).size === 110, 'catalog itself must contain 110 unique IDs');
  const productionBytes = fs.readFileSync(contained(repo, 'directional-art.js')), context = { window: {} };
  vm.runInNewContext(productionBytes.toString('utf8'), context, { timeout: 1000, filename: 'directional-art.js' });
  const production = context.window.INF_DIRECTIONAL_ART;
  requireThat(production?.version === catalog.value.version && production.entries, 'production manifest version/entries invalid');
  const report = { version: 1, auditedAt: new Date().toISOString(), partial, passed: false,
    scope: 'Explicit final builds; hashes and recorded approvals verified. This audit does not grant human visual approval or replace gameplay QA.',
    command: ['node', 'tools/audit-directional-release.mjs', ...(partial ? ['--partial'] : []), ...extraLedgers.map(p => '--ledger=' + p), ...dirs],
    productionManifest: bytesRecord('directional-art.js', productionBytes), catalog: bytesRecord(catalogPath, catalog.bytesValue),
    builds: [], sources: [], dependencies: [], ledgers: [], errors: [] };
  const sources = new Map(), dependencies = new Map(), artifacts = new Map(), runtimeFiles = new Map(), archives = [], allIds = [];
  let viewCount = 0, fallbackCount = 0, inlineBytes = 0, largestDecode = { path: null, rgbaBytes: 0 };
  const recordArtifact = (absolute, bytes) => artifacts.set(absolute, bytes.length);
  function source(relative, expected, size, label) {
    const absolute = permanent(relative), bytes = fs.readFileSync(absolute);
    verifyHash(bytes, expected, label + ' source ' + relative);
    const prior = sources.get(relative);
    requireThat(!prior || prior.sha256 === expected, 'conflicting source pins: ' + relative);
    if (!prior) sources.set(relative, { ...bytesRecord(relative, bytes), ...(size ? { imageSize: size } : {}) });
    else if (size) {
      requireThat(!prior.imageSize || equal(prior.imageSize, size), 'conflicting source dimensions: ' + relative);
      prior.imageSize = size;
    }
  }
  function configSources(value, label) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.source === 'string') source(value.source, value.sourceSha256, null, label);
    if (value.legacyRig?.config) {
      const relative = value.legacyRig.config, bytes = fs.readFileSync(permanent(relative));
      if (!dependencies.has(relative)) {
        // The original adapter records source SHA, but not its nested rig-config SHA.
        // Pin the dependency now without claiming a build-time pin that did not exist.
        dependencies.set(relative, { ...bytesRecord(relative, bytes), pinScope: 'current release dependency; nested adapter did not record a build-time config SHA' });
        configSources(JSON.parse(bytes), label + ' legacyRig');
      }
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') configSources(child, label);
  }
  for (const dir of dirs) {
    try {
      requireThat(/^gen\/[A-Za-z0-9][A-Za-z0-9_-]*$/.test(dir), 'explicit final build must be gen/<key>: ' + dir);
      const from = contained(repo, dir), key = dir.slice(4);
      const manifest = readJson(from, 'directional-art.json'), qa = readJson(from, 'directional-qa.json');
      const validation = readJson(from, 'directional-validation.json'), moving = readJson(from, 'directional-moving-qa.json');
      verifyEvidence(manifest, qa, validation, moving, dir);
      requireThat(manifest.value.version === production.version, 'build version mismatch: ' + dir);
      const configBytes = fs.readFileSync(permanent(qa.value.config)); verifyHash(configBytes, qa.value.configSha256, dir + ' config');
      const config = expandConfig(JSON.parse(configBytes)), ids = Object.keys(manifest.value.entries || {});
      requireThat(ids.length > 0 && new Set(qa.value.entries.map(e => e.assetId)).size === ids.length && equal(qa.value.entries.map(e => e.assetId).sort(), ids.slice().sort()), 'QA entry set mismatch: ' + dir);
      requireThat(equal(moving.value.entries.map(e => e.assetId).sort(), ids.slice().sort()), 'moving entry set mismatch: ' + dir);
      requireThat(validation.value.entries === ids.length && validation.value.ready === ids.length && validation.value.inlineFallbacks === ids.length * 3 && validation.value.files === qa.value.files.length && validation.value.decodedImages === qa.value.files.length, 'validation counts mismatch: ' + dir);
      configSources(config, dir);
      const files = new Map();
      for (const record of qa.value.files) {
        requireThat(!files.has(record.file), 'duplicate QA file: ' + dir + '/' + record.file);
        const absolute = contained(from, record.file), bytes = fs.readFileSync(absolute);
        verifyHash(bytes, record.sha256, dir + '/' + record.file);
        requireThat(bytes.length === record.bytes, 'artifact length mismatch: ' + record.file);
        files.set(record.file, record); recordArtifact(absolute, bytes);
      }
      const runtime = [], fallbacks = [];
      for (const id of ids) {
        requireThat(!allIds.includes(id), 'duplicate selected build asset: ' + id);
        const entry = manifest.value.entries[id], evidence = qa.value.entries.find(e => e.assetId === id), input = config.entries.find(e => e.assetId === id);
        approved(input, entry, evidence, id);
        const expected = catalog.value.entries.find(e => e.assetId === id);
        requireThat(expected && expected.wave === entry.wave && expected.role === entry.role && expected.locomotion === entry.locomotion, 'catalog identity/profile mismatch: ' + id);
        requireThat(equal(entry, production.entries[id]), 'production entry differs from final build: ' + id);
        const motion = moving.value.entries.find(e => e.assetId === id);
        requireThat(motion.captionAndPanelBoundsChecked === true && motion.checks?.length > 0 && new Set(motion.checks.map(c => c.direction)).size === 4, 'incomplete moving QA: ' + id);
        const motionBytes = fs.readFileSync(contained(from, motion.gif)); verifyHash(motionBytes, motion.gifSha256, id + ' moving GIF'); recordArtifact(path.join(from, motion.gif), motionBytes);
        const movingImage = await sharp(motionBytes, { animated: true }).metadata();
        requireThat(movingImage.format === 'gif' && movingImage.pages === motion.motionFrames + motion.resetFrames, 'moving GIF pages mismatch: ' + id);
        for (const name of views) {
          const view = entry.views[name], detail = evidence.views[name];
          requireThat(detail.geometry?.passed === true && (!detail.geometry.errors || !detail.geometry.errors.length), 'geometry failed: ' + id + '/' + name);
          requireThat(view.frames === (['legged', 'slither'].includes(entry.locomotion) ? 8 : 4) && view.frames === view.cols * view.rows, 'invalid profile/grid: ' + id + '/' + name);
          const provenance = detail.provenance;
          source(provenance.source, provenance.sourceSha256, provenance.sourceSize, id + '/' + name);
          if (provenance.body?.source) source(provenance.body.source, provenance.body.sourceSha256, provenance.body.sourceSize, id + '/' + name + ' body');
          for (const kind of ['still', 'sheet']) {
            const relative = view[kind];
            requireThat(/^casual\/(?:enemies|bosses)\/inf\/directional\/[\w-]+\.png$/.test(relative), 'unsafe/nonproduction PNG: ' + relative);
            requireThat(files.has(relative), 'PNG lacks QA hash: ' + relative);
            const bytes = fs.readFileSync(contained(repo, relative)); verifyHash(bytes, files.get(relative).sha256, 'production ' + relative);
            requireThat(!runtimeFiles.has(relative), 'runtime PNG shared across views/entries: ' + relative);
            const image = sharp(bytes), meta = await image.metadata(); await image.ensureAlpha().raw().toBuffer();
            requireThat(meta.format === 'png' && meta.width === view.cell * (kind === 'sheet' ? view.cols : 1) && meta.height === view.cell * (kind === 'sheet' ? view.rows : 1), 'decoded PNG grid mismatch: ' + relative);
            const rgbaBytes = meta.width * meta.height * 4;
            if (rgbaBytes > largestDecode.rgbaBytes) largestDecode = { path: relative, width: meta.width, height: meta.height, rgbaBytes };
            const file = { ...bytesRecord(relative, bytes), width: meta.width, height: meta.height, rgbaBytes };
            runtimeFiles.set(relative, file); runtime.push(file);
          }
          requireThat(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(view.fallback), 'invalid inline fallback: ' + id + '/' + name);
          const inline = Buffer.from(view.fallback.split(',')[1], 'base64'), image = sharp(inline), meta = await image.metadata(); await image.ensureAlpha().raw().toBuffer();
          requireThat(meta.format === 'webp' && meta.width === 64 && meta.height === 64, 'inline must decode as64px WebP: ' + id + '/' + name);
          await inspectAlpha(inline, id + '/' + name + ' inline'); await inspectAlpha(contained(from, view.still), id + '/' + name + ' still');
          const derived = await sharp(contained(from, view.still)).resize(64, 64).webp({ lossless: true, effort: 6 }).toBuffer();
          requireThat(hash(derived) === hash(inline), 'inline differs from final neutral: ' + id + '/' + name);
          fallbacks.push({ assetId: id, view: name, sha256: hash(inline), bytes: inline.length, width: 64, height: 64, derivedFrom: view.still });
          inlineBytes += inline.length; fallbackCount++; viewCount++;
        }
        allIds.push(id);
      }
      const proof = [];
      for (const item of [manifest, qa, validation, moving]) {
        const relative = `${evidenceRoot}/${key}/${item.path}`;
        archives.push({ relative, bytes: item.bytesValue }); proof.push({ ...bytesRecord(relative, item.bytesValue), generatedPath: dir + '/' + item.path });
        recordArtifact(path.join(from, item.path), item.bytesValue);
      }
      const generatedJs = fs.readFileSync(contained(from, 'directional-art.js')); recordArtifact(path.join(from, 'directional-art.js'), generatedJs);
      report.builds.push({ key, directory: dir, assetIds: ids, config: bytesRecord(qa.value.config, configBytes),
        commands: [ ['node', 'tools/build-directional-art.mjs', '--config=' + qa.value.config, '--out=' + dir, '--only=' + ids.join(',')],
          ['node', 'tools/check-directional-art.mjs', dir, '--require-ready'], ['node', 'tools/preview-directional-motion.mjs', dir] ], evidence: proof, runtimeFiles: runtime, inlineFallbacks: fallbacks });
      console.log('verified', dir, ids.length + ' ready entries');
    } catch (error) { report.errors.push(dir + ': ' + error.message); }
  }
  try { Object.assign(report, coverage(allIds, catalogIds, Object.keys(production.entries), partial)); }
  catch (error) { report.errors.push(error.message); }
  if (!partial && (viewCount !== 330 || runtimeFiles.size !== 660 || fallbackCount !== 330)) report.errors.push(`complete count mismatch: ${viewCount} views/${runtimeFiles.size} PNG/${fallbackCount} inline`);
  const selectedLedgers = [...new Set([...ledgers, ...extraLedgers])];
  for (const relative of selectedLedgers) {
    try {
      const ledger = readJson(repo, relative), rows = ledger.value.requests || ledger.value.calls;
      requireThat(Array.isArray(rows) && rows.length > 0, 'ledger lacks recorded calls');
      requireThat(ledger.value.actualCalls == null || ledger.value.actualCalls === rows.length, 'ledger call count mismatch');
      requireThat(new Set(rows.map(r => r.id || r.key || r.call)).size === rows.length, 'duplicate ledger request ID');
      const base = path.dirname(permanent(relative));
      for (const row of rows) {
        const saved = row.source || row.archivedOriginal, original = contained(base, saved), bytes = fs.readFileSync(original);
        verifyHash(bytes, row.sha256, relative + '/' + saved);
        if (row.prompt) { const prompt = fs.readFileSync(contained(base, row.prompt)); if (row.promptSha256) verifyHash(prompt, row.promptSha256, row.prompt); }
      }
      report.ledgers.push({ ...bytesRecord(relative, ledger.bytesValue), recordedImageGenerationCalls: rows.length, scope: ledger.value.scope || ledger.value.waveRange || (ledger.value.calls ? 'star towers7–20' : 'early directional sources') });
    } catch (error) { report.errors.push(relative + ': ' + error.message); }
  }
  report.sources = [...sources.values()].sort((a, b) => a.path.localeCompare(b.path));
  for (const sourceRecord of report.sources) {
    try {
      const image = await sharp(permanent(sourceRecord.path)).metadata();
      requireThat(!sourceRecord.imageSize || equal(sourceRecord.imageSize, [image.width, image.height]), 'source image size mismatch: ' + sourceRecord.path);
      sourceRecord.imageSize = [image.width, image.height]; sourceRecord.format = image.format;
    } catch (error) { report.errors.push(error.message); }
  }
  report.dependencies = [...dependencies.values()].sort((a, b) => a.path.localeCompare(b.path));
  report.counts = { entries: allIds.length, productionManifestEntries: Object.keys(production.entries).length, views: viewCount, productionPngs: runtimeFiles.size, inlineFallbacks: fallbackCount, uniqueSources: sources.size, auditedBuildArtifacts: artifacts.size,
    recordedImageGenerationCalls: report.ledgers.reduce((n, x) => n + x.recordedImageGenerationCalls, 0) };
  const productionPngBytes = [...runtimeFiles.values()].reduce((n, x) => n + x.bytes, 0);
  report.sizes = { productionPngBytes, initialManifestBytes: productionBytes.length, runtimeArtTransferBytes: productionPngBytes + productionBytes.length,
    inlineWebpPayloadBytes: inlineBytes, initialPinnedFallbackRgbaBytes: fallbackCount * 64 * 64 * 4,
    largestSingleRuntimeImageDecode: largestDecode, largestSingleImagePlusOutputCanvasReservationBytes: largestDecode.rgbaBytes * 2,
    auditedBuildArtifactsBytes: [...artifacts.values()].reduce((a, b) => a + b, 0), uniqueSourceBytes: report.sources.reduce((n, x) => n + x.bytes, 0),
    notes: 'RGBA decode/reservation values are calculated from decoded dimensions, not measured whole-browser memory. Build artifacts include declared review PNG/GIF, moving GIF and five builder JSON/JS files. In partial mode PNG/inline totals cover only selected builds, while initialManifestBytes covers the current whole production manifest. Inline payload is already inside manifest bytes; do not add it twice.' };
  report.callCountNote = 'Counts are the request records in the four standard ledgers plus explicitly requested extra ledgers, including superseded generations. No price, token-use, or monetary estimate is inferred.';
  report.archiveNote = 'Only builds listed in this record belong to this audit; evidence from earlier successful selections may remain as history.';
  report.passed = report.errors.length === 0;
  if (report.passed && !checkOnly) {
    // Preserve original evidence bytes so the archived SHA is exactly the checked build SHA.
    for (const archive of archives) { const target = path.join(repo, archive.relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, archive.bytes); }
    fs.writeFileSync(path.join(repo, recordPath), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ passed: report.passed, complete: report.complete, partial, counts: report.counts, sizes: report.sizes, errors: report.errors, record: report.passed && !checkOnly ? recordPath : null }, null, 2));
  if (!report.passed) process.exitCode = 1;
}

function selfTest() {
  let checks = 0;
  const reject = (fn, pattern) => { assert.throws(fn, pattern); checks++; };
  for (const value of ['../outside.png', 'gen/../source.png', 'C:/temp/source.png', '/tmp/source.png', 'folder\\source.png']) reject(() => cleanRelative(value), /path/);
  reject(() => permanent('gen/source.png'), /temporary/); reject(() => permanent('tools/tmp/source.png'), /temporary/);
  reject(() => verifyHash(Buffer.from('changed'), hash(Buffer.from('reviewed')), 'fixture'), /SHA mismatch/);
  const proof = { ready: true, reviewApproved: true, errors: [], views: { side: {}, front: {}, back: {} } }, config = { reviewApproved: true };
  approved(config, proof, proof, 'fixture'); checks++;
  reject(() => approved({ reviewApproved: false }, proof, proof, 'fixture'), /unapproved/);
  reject(() => approved(config, { ...proof, ready: false }, proof, 'fixture'), /unapproved/);
  reject(() => approved(config, proof, { ...proof, views: { side: {} } }, 'fixture'), /three views/);
  reject(() => coverage(['w001', 'w001'], ['w001'], ['w001'], true), /duplicate/);
  reject(() => coverage(['w001'], ['w001'], ['w001'], false), /110/);
  reject(() => coverage(['w999'], ['w001'], ['w001'], true), /noncatalog/);
  const manifest = { sha256: 'm' }, qa = { sha256: 'q', value: { errors: [] } }, pass = { path: 'proof', value: { passed: true, errors: [], manifestSha256: 'm', qaSha256: 'q' } };
  verifyEvidence(manifest, qa, pass, pass, 'fixture'); checks++;
  reject(() => verifyEvidence(manifest, qa, pass, { ...pass, value: { ...pass.value, manifestSha256: 'old' } }, 'fixture'), /stale/);
  reject(() => verifyEvidence(manifest, qa, { ...pass, value: { ...pass.value, qaSha256: 'old' } }, pass, 'fixture'), /stale/);
  requireThat(equal({ a: 1, b: 2 }, { b: 2, a: 1 }) && !equal({ a: 1 }, { a: 2 }), 'canonical entry equality regression'); checks++;
  console.log('PASS', checks, 'release-audit guard cases');
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--self-test') selfTest();
else {
  const allowed = new Set(['--partial', '--check-only']), unknown = args.filter(a => a.startsWith('--') && !allowed.has(a) && !a.startsWith('--ledger='));
  requireThat(!unknown.length, 'unknown option: ' + unknown.join(','));
  const dirs = args.filter(a => !a.startsWith('--'));
  requireThat(dirs.length > 0 && new Set(dirs).size === dirs.length, 'Supply explicit distinct final gen/<key> directories; no automatic prototype discovery.');
  await audit(dirs, args.includes('--partial'), args.includes('--check-only'), args.filter(a => a.startsWith('--ledger=')).map(a => a.slice('--ledger='.length)));
}
