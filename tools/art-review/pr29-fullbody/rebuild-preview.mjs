// Review-only atlas splitting. No centroid, per-frame height or area correction.
// node tools/art-review/pr29-fullbody/rebuild-preview.mjs [output-directory]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRaw, foregroundMask, cellStats } from '../../lib/sheet.mjs';
// Match the shared sheet module's sharp/libvips instance on Windows.
const sharp = createRequire(new URL('../../../package.json', import.meta.url))('sharp');

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(packageDir, '../../..');
const configPath = path.join(packageDir, 'initial/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const out = path.resolve(repo, process.argv[2] || 'gen/pr29-fullbody-preview');
if (out === packageDir || out.startsWith(packageDir + path.sep)) throw new Error('Choose output outside the archived package');
fs.mkdirSync(out, { recursive: true });
const { cell, scale, outputRootX, outputFloorY, frameDelayMs } = config;
if (cell !== 512 || !(scale > 0) || !Number.isFinite(scale)) throw new Error('Expected 512px review cells and one positive global scale');
if (!Number.isInteger(frameDelayMs) || frameDelayMs < 20 || frameDelayMs % 10) throw new Error('GIF frame delay must be a multiple of 10ms');
const transparent = () => sharp({ create: { width: cell, height: cell, channels: 4, background: '#00000000' } });
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const label = (name, index) => Buffer.from(`<svg width="${cell}" height="${cell}" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#203034"/><path d="M16 ${outputFloorY}H496" stroke="#7faaa0" stroke-width="1"/><path d="M${outputRootX} 38V${outputFloorY+8}" stroke="#688478" stroke-width="1" stroke-dasharray="4 6" opacity=".5"/><text x="16" y="25" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#f3eee0">${xml(name)} — ${index+1}/8</text><text x="16" y="496" font-family="Arial,sans-serif" font-size="14" fill="#c5d5cb">Same scale ${scale}x · fixed floor · review only</text></svg>`);
const report = { purpose: config.purpose, config: path.relative(repo, configPath).replaceAll('\\', '/'), globalScale: scale, fixedOutputRootX: outputRootX, fixedOutputFloorY: outputFloorY, frameDelayMs, waves: [] };
for (const wave of config.waves) {
  if (wave.frames.length !== 8) throw new Error(`W${wave.wave}: expected eight reviewed ROIs`);
  const sourceFile = path.resolve(path.dirname(configPath), wave.source);
  const raw = await loadRaw(sourceFile, { background: wave.background, backgroundSeeds: wave.backgroundSeeds });
  const keep = foregroundMask(raw), frames = [], reviews = [], rows = [];
  const sourceSha256 = createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
  if (wave.sourceSha256 && wave.sourceSha256 !== sourceSha256) throw new Error(`W${wave.wave}: source changed; review ROIs and anchors again`);
  const prefix = `w${String(wave.wave).padStart(2, '0')}`;
  for (const [index, frame] of wave.frames.entries()) {
    const [x, y, w, h] = frame.roi;
    if (![x,y,w,h].every(Number.isInteger) || x<0 || y<0 || w<1 || h<1 || x+w>raw.W || y+h>raw.H) throw new Error(`${prefix}/${index}: invalid ROI`);
    const stats = cellStats(raw, x, y, w, h);
    if (!stats.n) throw new Error(`${prefix}/${index}: empty ROI`);
    // A reviewed ROI must not cut any opaque artwork. Never delete a boundary
    // fragment to make a bad equal-column split appear clean.
    if (stats.x0 === x || stats.x1 === x+w || stats.y0 === y || stats.y1 === y+h) throw new Error(`${prefix}/${index+1}: ROI boundary touches artwork; choose a gutter`);
    const left = Math.round(outputRootX + (stats.x0 - frame.rootX) * scale);
    const top = Math.round(outputFloorY + (stats.y0 - frame.floorY) * scale);
    const width = Math.round(stats.w * scale), height = Math.round(stats.h * scale);
    if (left<1 || top<1 || left+width>=cell || top+height>=cell) throw new Error(`${prefix}/${index+1}: fixed transform clips frame`);
    const rgba = Buffer.alloc(stats.w * stats.h * 4);
    for (let yy=0; yy<stats.h; yy++) for (let xx=0; xx<stats.w; xx++) {
      const p=(stats.y0+yy)*raw.W+stats.x0+xx;
      if (keep[p]) raw.data.copy(rgba,(yy*stats.w+xx)*4,p*4,p*4+4);
    }
    const piece = await sharp(rgba,{raw:{width:stats.w,height:stats.h,channels:4}}).resize(width,height).png().toBuffer();
    const png = await transparent().composite([{input:piece,left,top}]).png().toBuffer();
    fs.writeFileSync(path.join(out,`${prefix}-frame${index+1}.png`),png);
    frames.push(png);
    const review = await sharp(label(wave.name,index)).composite([{input:png,left:0,top:0}]).png().toBuffer();
    reviews.push(review);
    rows.push({ index, roi:frame.roi, rootX:frame.rootX, sourceFloorY:frame.floorY, sourceBounds:[stats.x0,stats.y0,stats.w,stats.h], outputBounds:[left,top,width,height], scale, foregroundPixels:stats.n, removedBoundaryPixels:0 });
  }
  for (const [suffix, buffers] of [['sheet',frames],['review-sheet',reviews]]) {
    await sharp({create:{width:cell*4,height:cell*2,channels:4,background:'#00000000'}}).composite(buffers.map((input,i)=>({input,left:i%4*cell,top:Math.floor(i/4)*cell}))).png().toFile(path.join(out,`${prefix}-${suffix}.png`));
  }
  const pages = await Promise.all(reviews.map(png=>sharp(png).ensureAlpha().raw().toBuffer()));
  const gifFile=path.join(out,`${prefix}-preview.gif`);
  await sharp(Buffer.concat(pages),{raw:{width:cell,height:cell*8,channels:4,pageHeight:cell}}).gif({delay:Array(8).fill(frameDelayMs),loop:0,effort:7}).toFile(gifFile);
  const gif=await sharp(gifFile,{animated:true}).metadata();
  report.waves.push({ wave:wave.wave, source:wave.source, sourceSha256, sourceSize:[raw.W,raw.H], backgroundSeeds:wave.backgroundSeeds, notes:wave.notes, frames:rows, outputSheet:`${prefix}-sheet.png`, outputReviewSheet:`${prefix}-review-sheet.png`, outputGif:`${prefix}-preview.gif`, encodedGif:{pages:gif.pages,width:gif.width,height:gif.pageHeight,delay:gif.delay,loop:gif.loop} });
  console.log(`${prefix}: eight drawings, one scale ${scale}, no ROI/output clipping; ${prefix}-preview.gif`);
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');

// Only deterministic splitting/compositing is replayed; image generation is not.
const comparisons = [];
for (const id of ['02','06']) {
  const names = [...Array.from({length:8},(_,i)=>'w'+id+'-frame'+(i+1)+'.png'), 'w'+id+'-sheet.png', 'w'+id+'-review-sheet.png', 'w'+id+'-preview.gif'];
  for (const name of names) {
    const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    comparisons.push({file:name,sha256:digest(path.join(out,name)),matchesArchived:digest(path.join(out,name))===digest(path.join(packageDir,'initial',name))});
  }
}
fs.writeFileSync(path.join(out,'rebuild-verification.json'),JSON.stringify({compared:comparisons.length,mismatches:comparisons.filter(r=>!r.matchesArchived).length,files:comparisons},null,2)+'\n');
const mismatches=comparisons.filter(r=>!r.matchesArchived);
console.log(comparisons.length+' rebuilt PNG/GIF files; '+mismatches.length+' SHA256 mismatches');
if(mismatches.length)process.exitCode=1;
