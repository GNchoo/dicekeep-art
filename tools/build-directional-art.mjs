// Build reviewed puppet inputs into fixed-cell directional sprite assets.
// node tools/build-directional-art.mjs --config=... [--out=gen/directional-art] [--only=w001,b020-2]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import browserTools from './e2e/browser.cjs';
import { validateEntry, prepareView, rasterizeView, sha256, expandConfig, validatePreparedViews } from './lib/directional-rig.mjs';
import { inspectAlpha } from './lib/directional-image.mjs';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
const opt = (key, fallback) => args.find(a => a.startsWith('--' + key + '='))?.slice(key.length + 3) ?? fallback;
const configFile = opt('config');
if (!configFile) throw new Error('--config is required');
const config = expandConfig(JSON.parse(fs.readFileSync(path.resolve(repo, configFile), 'utf8')));
if (config.version !== 1 || !Array.isArray(config.entries) || !config.entries.length) throw new Error('version1 entries required');
const canonicalCell = config.canonicalCell ?? 512;
const only = opt('only')?.split(',');
const entries = config.entries.filter(e => !only || only.includes(e.assetId));
if (!entries.length || new Set(entries.map(e => e.assetId)).size !== entries.length) throw new Error('empty/duplicate entry selection');
if (only?.some(id => !entries.some(e => e.assetId === id))) throw new Error('--only contains unknown assetId');
const out = path.resolve(repo, opt('out', 'gen/directional-art'));
if (out === repo || !out.startsWith(repo + path.sep)) throw new Error('output must be a subdirectory of the repository');
const prepared = [];
for (const entry of entries) {
  validateEntry(entry, canonicalCell);
  const views = {};
  for (const [name, view] of Object.entries(entry.views)) views[name] = await prepareView(entry, name, view, repo, canonicalCell);
  prepared.push({ entry, views, identities: validatePreparedViews(entry, views) });
  console.log('prepared', entry.assetId, Object.keys(views).join('/'));
}
const output = { version: config.assetVersion ?? 93, entries: {} };
const report = { version: 1, config: path.relative(repo, path.resolve(repo, configFile)).replaceAll('\\', '/'), configSha256: sha256(fs.readFileSync(path.resolve(repo, configFile))), canonicalCell,
  scope: 'Geometry/image integrity checks; human anatomy/art approval remains separate.', entries: [], files: [], errors: [] };
const browser = await browserTools.launchBrowser();
const recordFile = async (relative, bytes, image = true) => {
  const file = path.join(out, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  const record = { file: relative, bytes: bytes.length, sha256: sha256(bytes) };
  if (image) { const m = await sharp(bytes, { animated: relative.endsWith('.gif') }).metadata(); record.image = { format: m.format, width: m.width, height: m.pageHeight || m.height, pages: m.pages || 1 }; }
  report.files.push(record);
};
try {
  const page = await browser.newPage(); await page.goto('about:blank');
  for (const { entry, views, identities } of prepared) {
    const runtime = { assetId: entry.assetId, wave: entry.wave, role: entry.role, ready: false, locomotion: entry.locomotion,
      referenceHeight: entry.referenceHeight, cycleStride: entry.cycleStride || 0, views: {} };
    if (entry.cycleSeconds != null) runtime.cycleSeconds = entry.cycleSeconds;
    const result = { assetId: entry.assetId, reviewApproved: entry.reviewApproved === true, identities, views: {}, errors: [] };
    for (const [name, rig] of Object.entries(views)) {
      const rendered = await rasterizeView(page, rig);
      const frames = [];
      for (const base64 of rendered.frames) frames.push(await sharp(Buffer.from(base64, 'base64')).resize(entry.cell, entry.cell, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer());
      const cols = rig.count === 8 ? 4 : 2, rows = 2, scale = entry.cell / canonicalCell;
      const stats = [], hashes = [];
      for (const [index, bytes] of frames.entries()) {
        const alpha = await inspectAlpha(bytes, entry.assetId + ' ' + name + ' frame ' + index);
        hashes.push(sha256(bytes)); stats.push({ index, ...alpha });
      }
      if (new Set(hashes).size < (rig.count === 8 ? 6 : 3)) throw new Error(entry.assetId + ' ' + name + ': repeated static poses');
      const prefix = `casual/${entry.role === 'normal' ? 'enemies' : 'bosses'}/inf/directional/${entry.assetId}-${name}`;
      const sheetFile = prefix + `-walk-${cols}x${rows}.png`, stillFile = prefix + '.png';
      const sheet = await sharp({ create: { width: entry.cell * cols, height: entry.cell * rows, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(frames.map((input, i) => ({ input, left: i % cols * entry.cell, top: Math.floor(i / cols) * entry.cell }))).png({ compressionLevel: 9 }).toBuffer();
      const still = await sharp(Buffer.from(rendered.still, 'base64')).resize(entry.cell, entry.cell).png({ compressionLevel: 9 }).toBuffer();
      const stillStats = await inspectAlpha(still, entry.assetId + ' ' + name + ' neutral');
      await recordFile(sheetFile, sheet); await recordFile(stillFile, still);
      const board = await sharp({ create: { width: canonicalCell * cols, height: canonicalCell * rows, channels: 4, background: '#253438' } }).composite(rendered.preview.map((base64, i) => ({ input: Buffer.from(base64, 'base64'), left: i % cols * canonicalCell, top: Math.floor(i / cols) * canonicalCell }))).png().toBuffer();
      await recordFile(`review/${entry.assetId}-${name}.png`, board);
      const gifRaw = await sharp({ create: { width: entry.cell, height: entry.cell * rig.count, channels: 4, background: '#253438' } }).composite(frames.map((input, i) => ({ input, left: 0, top: i * entry.cell }))).raw().toBuffer();
      const gif = await sharp(gifRaw, { raw: { width: entry.cell, height: entry.cell * rig.count, channels: 4, pageHeight: entry.cell } }).gif({ delay: Array(rig.count).fill(entry.frameDelayMs ?? (rig.count === 8 ? 150 : 200)), loop: 0, effort: 7 }).toBuffer();
      await recordFile(`review/${entry.assetId}-${name}.gif`, gif);
      const fallback = await sharp(still).resize(64, 64).webp({ lossless: true, effort: 6 }).toBuffer();
      const fallbackStats = await inspectAlpha(fallback, entry.assetId + ' ' + name + ' inline fallback');
      runtime.views[name] = { still: stillFile, sheet: sheetFile, frames: rig.count, cols, rows, cell: entry.cell, pivot: rig.pivot.map(n => n * scale), scale, fallback: 'data:image/webp;base64,' + fallback.toString('base64') };
      if (entry.views[name].assetVersion != null) runtime.views[name].assetVersion = entry.views[name].assetVersion;
      result.views[name] = { geometry: rig.geometry, provenance: rig.provenance, rasterDiagnostics: rendered.rasterDiagnostics || [], frameStats: stats, stillStats, fallbackStats, uniqueFrames: new Set(hashes).size, frameHashes: hashes, projection: rig.projection || { forward: [1, 0], height: [0, 1] }, frames: rig.frames, motionFrames: rig.motionFrames || null };
      console.log('rendered', entry.assetId, name, rig.count + ' frames');
    }
    runtime.ready = entry.reviewApproved === true && ['side', 'front', 'back'].every(name => runtime.views[name]);
    output.entries[entry.assetId] = runtime; result.ready = runtime.ready; report.entries.push(result);
  }
} catch (error) { report.errors.push(error.message); throw error; }
finally {
  await browser.close(); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'directional-qa.json'), JSON.stringify(report, null, 2) + '\n');
}
fs.writeFileSync(path.join(out, 'directional-art.json'), JSON.stringify(output, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'directional-art.js'), 'window.INF_DIRECTIONAL_ART = ' + JSON.stringify(output, null, 2) + ';\n');
console.log(`PASS ${report.entries.length} entries, ${report.files.length} files; ready ${Object.values(output.entries).filter(e => e.ready).length}. Outputs: ${out}`);
