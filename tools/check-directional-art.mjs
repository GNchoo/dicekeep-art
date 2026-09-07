// Integrity and source provenance verification of a completed builder output.
// node tools/check-directional-art.mjs gen/directional-pilot [--require-ready]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sha256 } from './lib/directional-rig.mjs';
import { inspectAlpha } from './lib/directional-image.mjs';
const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const directory = path.resolve(repo, process.argv[2] || 'gen/directional-art');
const manifestBytes = fs.readFileSync(path.join(directory, 'directional-art.json')), qaBytes = fs.readFileSync(path.join(directory, 'directional-qa.json'));
const m = JSON.parse(manifestBytes), qa = JSON.parse(qaBytes);
const report = { manifestSha256: sha256(manifestBytes), qaSha256: sha256(qaBytes), entries: 0, files: 0, decodedImages: 0, inlineFallbacks: 0, sources: 0, ready: 0, errors: [] };
const check = (condition, error) => { if (!condition) report.errors.push(error); };
try { check(sha256(fs.readFileSync(path.resolve(repo, qa.config))) === qa.configSha256, 'config changed after build; reject stale outputs'); }
catch (e) { check(false, 'config provenance: ' + e.message); }
for (const file of qa.files) {
  const absolute = path.resolve(directory, file.file);
  if (!absolute.startsWith(directory + path.sep)) { check(false, 'file leaves output: ' + file.file); continue; }
  try {
    const bytes = fs.readFileSync(absolute); check(sha256(bytes) === file.sha256, 'hash mismatch: ' + file.file); report.files++;
    const image = sharp(bytes, { animated: file.image.format === 'gif' }), d = await image.metadata(); await image.ensureAlpha().raw().toBuffer(); report.decodedImages++;
    check(d.width === file.image.width && (d.pageHeight || d.height) === file.image.height && (d.pages || 1) === file.image.pages, 'dimensions/pages mismatch: ' + file.file);
  } catch (e) { check(false, file.file + ': ' + e.message); }
}
for (const [id, entry] of Object.entries(m.entries)) {
  report.entries++; const evidence = qa.entries.find(e => e.assetId === id);
  check(entry.assetId === id && !!evidence, 'missing entry evidence: ' + id);
  if (entry.ready) { report.ready++; check(['side', 'front', 'back'].every(v => entry.views[v]) && evidence?.reviewApproved === true, 'unreviewed/incomplete ready entry: ' + id); }
  if (process.argv.includes('--require-ready')) check(entry.ready, 'entry is not ready: ' + id);
  const scales = new Set();
  for (const [name, view] of Object.entries(entry.views)) {
    try {
      const image = await sharp(path.join(directory, view.sheet)).metadata();
      check(qa.files.some(f => f.file === view.sheet) && qa.files.some(f => f.file === view.still), id + ': runtime files lack hash records');
      check(image.width === view.cell * view.cols && image.height === view.cell * view.rows && view.frames === view.cols * view.rows, id + ' ' + name + ': grid mismatch');
      check(view.frames === (['legged', 'slither'].includes(entry.locomotion) ? 8 : 4), id + ': wrong profile frame count');
      check(view.pivot?.length === 2 && view.pivot.every(v => Number.isFinite(v) && v >= 0 && v <= view.cell), id + ': invalid pivot');
      scales.add(view.scale);
      check(view.fallback.startsWith('data:image/webp;base64,'), id + ': missing inline fallback');
      const fallback = sharp(Buffer.from(view.fallback.split(',')[1], 'base64')), d = await fallback.metadata(); await fallback.ensureAlpha().raw().toBuffer();
      await inspectAlpha(Buffer.from(view.fallback.split(',')[1], 'base64'), id + ' ' + name + ' fallback');
      await inspectAlpha(path.join(directory, view.still), id + ' ' + name + ' neutral');
      const expectedFallback = await sharp(path.join(directory, view.still)).resize(64, 64).webp({ lossless: true, effort: 6 }).toBuffer();
      check(sha256(expectedFallback) === sha256(Buffer.from(view.fallback.split(',')[1], 'base64')), id + ' ' + name + ': fallback does not derive from final neutral');
      check(d.width === 64 && d.height === 64 && d.format === 'webp', id + ': fallback is not 64px WebP'); report.inlineFallbacks++;
      const details = evidence.views[name]; check(details.geometry.passed, id + ' ' + name + ': failed geometry');
      const source = path.resolve(repo, details.provenance.source), bytes = fs.readFileSync(source);
      check(sha256(bytes) === details.provenance.sourceSha256, id + ' ' + name + ': source changed since reviewed coordinates'); report.sources++;
      const bodySource = details.provenance.body;
      if (bodySource?.componentCount === 3) {
        const areas = bodySource.componentAreas || [], total = areas.reduce((sum, area) => sum + area, 0);
        check(entry.locomotion === 'flight' && areas.length === 3 && areas.every(area => Number.isFinite(area) && area >= total * .05), id + ' ' + name + ': invalid reviewed three-body swarm evidence');
      }
      if (bodySource?.source && bodySource.source !== details.provenance.source) {
        check(sha256(fs.readFileSync(path.resolve(repo, bodySource.source))) === bodySource.sourceSha256, id + ' ' + name + ': separate body source changed since reviewed coordinates'); report.sources++;
      }
    } catch (e) { check(false, id + ' ' + name + ': ' + e.message); }
  }
  check(scales.size === 1, id + ': per-view scale changes');
}
check(!qa.errors.length, 'builder reported errors'); report.passed = report.errors.length === 0;
fs.writeFileSync(path.join(directory, 'directional-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
