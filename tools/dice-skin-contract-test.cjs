#!/usr/bin/env node
'use strict';

// Run: node tools/dice-skin-contract-test.cjs
// Executes the actual material builder with a Canvas command recorder. This
// verifies marking geometry, image provenance and caching; browser pixel/style QA
// and the existing dice-rotation-test.cjs cover the rendered animation separately.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'game.js'), 'utf8');
const content = fs.readFileSync(path.join(repo, 'content.js'), 'utf8');
const approvedPath = 'dice/skins/ivory-worn/cube-surface-v98.png';
const approvedSha = 'a22dfecfeb6feb7362420bc4568f9684e6c0705e5332fdf503504bd656badff9';
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, approvedPath))).digest('hex'), approvedSha, 'approved raster bytes remain unchanged');
function fragment(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `production section exists: ${start}`);
  return source.slice(a, b);
}
const skinLiteral = content.match(/const DICE_SKINS\s*=\s*(\{[\s\S]*?\r?\n  \});/);
assert.ok(skinLiteral, 'production skin registry exists');
const registry = vm.runInNewContext('(' + skinLiteral[1] + ')');

class Gradient {
  constructor(kind, args) { this.kind = kind; this.args = args; this.stops = []; }
  addColorStop(offset, color) { this.stops.push([offset, color]); }
}
class Canvas {
  constructor() { this.width = 0; this.height = 0; this.ops = []; this.gradients = []; this.context = new Context(this); }
  getContext(kind) { assert.equal(kind, '2d'); return this.context; }
}
class Context {
  constructor(canvas) { this.canvas = canvas; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.stack = []; this.path = []; }
  record(type, args = []) { this.canvas.ops.push({type, args, paint: this.fillStyle, stroke: this.strokeStyle, alpha: this.globalAlpha, composite: this.globalCompositeOperation, path: this.path.slice()}); }
  save() { this.stack.push(Object.fromEntries(['globalAlpha','globalCompositeOperation','fillStyle','strokeStyle','lineWidth'].map(k => [k,this[k]]))); }
  restore() { assert.ok(this.stack.length, 'balanced Canvas restore'); Object.assign(this, this.stack.pop()); }
  beginPath() { this.path = []; }
  moveTo(...a) { this.path.push(['moveTo',...a]); }
  lineTo(...a) { this.path.push(['lineTo',...a]); }
  arc(...a) { this.path.push(['arc',...a]); }
  closePath() { this.path.push(['closePath']); }
  clip() { this.record('clip'); }
  fill() { this.record('fill'); }
  stroke() { this.record('stroke'); }
  fillRect(...a) { this.record('fillRect',a); }
  strokeRect(...a) { this.record('strokeRect',a); }
  fillText(...a) { this.record('fillText',a); }
  strokeText(...a) { this.record('strokeText',a); }
  drawImage(...a) { this.record('drawImage',a); }
  createLinearGradient(...a) { const g = new Gradient('linear',a); this.canvas.gradients.push(g); return g; }
  createRadialGradient(...a) { const g = new Gradient('radial',a); this.canvas.gradients.push(g); return g; }
}
const canvases = [], assets = {}, sources = {};
let randomCalls = 0;
const math = Object.create(Math); math.random = () => { randomCalls++; return .5; };
const context = vm.createContext({
  window: {DKCONTENT: {DICE_SKINS: registry}}, SRCS: sources, BASE: '/', A: assets, Math: math,
  uiFont: px => `${px}px sans-serif`,
  document: {createElement(kind) { assert.equal(kind,'canvas'); const cv = new Canvas(); canvases.push(cv); return cv; }},
});
vm.runInContext(fragment('const DICE_SKINS = window.DKCONTENT.DICE_SKINS;', '// 인피니티 아레나 조각'), context);
assert.equal(Object.keys(sources).length,1,'all shapes request only one material image');
for (const [key,url] of Object.entries(sources)) {
  assert.equal(new URL(url,'https://dice.test/').pathname,'/' + approvedPath,'only approved material is requested');
  assets[key] = {kind:'image',key,url,width:512,height:512};
}
const program = fragment('function m3id()', '// 큐브 면 정의') + '\n' +
  fragment('const POLY =', '// Face-local textures:') + '\n' +
  fragment('const DICE_MAT_TEX =', 'function buildDiceSprites()') + '\n' +
  '({get:diceMaterial,cache:diceMaterialCache,poly:POLY,align:alignR,apply:m3apply,T:DICE_MAT_TEX,pips:CUBE_PIPS});';
const game = vm.runInContext(program,context,{timeout:2000}), material = game.get();
const T = game.T, eps = 1e-9;
const near = (a,b,label) => assert.ok(Math.abs(a-b)<eps,`${label}: ${a} != ${b}`);
const glyphs = cv => cv.ops.filter(op => op.type === 'fillText' || op.type === 'strokeText').map(op => String(op.args[0]));
function pips(cv) {
  return cv.gradients.filter(g => g.kind === 'radial').map(gradient => {
    assert.ok(cv.ops.some(op => op.type === 'fillRect' && op.paint === gradient),'pip bowl is actually painted');
    assert.equal(gradient.stops[0][1],'#912321','deep red pip pigment');
    assert.equal(gradient.stops.at(-1)[1],'#280909','recessed dark pip edge');
    const [x,y,r] = gradient.args.slice(3);
    assert.ok([x,y,r].every(Number.isFinite) && r>0);
    return {x,y,r};
  });
}
function leaves(cv, visiting = new Set()) {
  assert.ok(!visiting.has(cv),'material image graph has no self-copy cycle');
  if (!(cv instanceof Canvas)) return new Set([cv]);
  const next = new Set(visiting); next.add(cv); const result = new Set();
  for (const op of cv.ops.filter(op => op.type === 'drawImage')) for (const image of leaves(op.args[0],next)) result.add(image);
  return result;
}
const allTextures = [material.cubeSurface,material.orb,...material.cube,...Object.values(material.faces).flat().map(f=>f.cv)];
assert.equal(allTextures.length,52);
for (const cv of allTextures) {
  assert.equal(cv.context.stack.length,0,'Canvas state restored after texture build');
  const images = leaves(cv); assert.equal(images.size,1,'one common image source per texture');
  assert.equal([...images][0],Object.values(assets)[0],'every texture derives from the approved shared image');
  for (const op of cv.ops.filter(op=>op.type==='drawImage'&&op.composite==='soft-light')) {
    assert.equal(op.args[0],material.cubeSurface,'pigment grain uses common surface');
    assert.deepEqual(op.args.slice(1),[0,0,cv.width,cv.height],'grain covers the full target, including the wide orb atlas');
  }
}
const orbPips = pips(material.orb);
assert.equal(orbPips.length,1);assert.equal(glyphs(material.orb).length,0,'d1 has no numeral');
near(orbPips[0].x,T,'orb pip center x');near(orbPips[0].y,T/2,'orb pip center y');near(orbPips[0].r,T*.072,'orb pip radius');
assert.equal(material.orb.width,T*2);assert.equal(material.orb.height,T);

let minimumTetraClearance = Infinity, tetraPips = 0, glyphFaces = 0, uvChecks = 0;
for (const [kind,faces] of Object.entries(material.faces)) for (let index=0;index<faces.length;index++) {
  const {cv,uv} = faces[index], marks=pips(cv);
  if (kind==='d4') {
    assert.equal(marks.length,index+1,'d4 pip count matches authored winning face');assert.equal(glyphs(cv).length,0,'d4 has no numeral');
    const area = uv.reduce((sum,p,i)=>{const q=uv[(i+1)%uv.length];return sum+p[0]*q[1]-p[1]*q[0];},0), winding=Math.sign(area);
    for (let j=0;j<marks.length;j++) {
      const pip=marks[j],[u,v]=game.pips[index][j];
      near(pip.x,T*(.5+u*.1),'d4 pip x');near(pip.y,T*(.5+v*.1),'d4 pip y');near(pip.r,T*.05,'d4 pip radius');
      for (let k=0;k<uv.length;k++) {
        const a=uv[k],b=uv[(k+1)%uv.length],dx=b[0]-a[0],dy=b[1]-a[1];
        const distance=winding*(dx*(pip.y-a[1])-dy*(pip.x-a[0]))/Math.hypot(dx,dy);
        // Conservative complete lip envelope, then the widest face rim's half-width.
        const clearance=distance-(pip.r+1.35+1.1)-3.5;
        assert.ok(clearance>0,`d4 face ${index+1} pip ${j+1} clears triangle/rim by ${clearance}px`);
        minimumTetraClearance=Math.min(minimumTetraClearance,clearance);
      }
      for (let k=0;k<j;k++) assert.ok(Math.hypot(pip.x-marks[k].x,pip.y-marks[k].y)>pip.r+marks[k].r+2*(1.35+1.1),'separate d4 pips never merge');
      tetraPips++;
    }
  } else {
    assert.equal(marks.length,0,'d8+ remains numbered');
    const text=glyphs(cv);assert.equal(text.length,3,'one engraved glyph retains highlight/shadow/fill');
    assert.ok(text.every(s=>s===String(index+1)),'authored face numeral remains correct');glyphFaces++;
  }
  // Face texture coordinates remain aligned to the existing authored final R.
  const f=game.poly[kind].faces[index],points=f.idx.map(i=>game.apply(game.align(f.n),game.poly[kind].verts[i]));
  for(let j=1;j<points.length;j++){
    const a=[points[j][0]-points[0][0],points[j][1]-points[0][1]],b=[uv[j][0]-uv[0][0],uv[j][1]-uv[0][1]];
    near(a[0]*b[1]-a[1]*b[0],0,'UV stays attached to final face axes');assert.ok(a[0]*b[0]+a[1]*b[1]>0);uvChecks++;
  }
}
assert.equal(tetraPips,10);assert.equal(glyphFaces,40);
for(let index=0;index<material.cube.length;index++){
  const marks=pips(material.cube[index]);assert.equal(marks.length,index+1,'d6 pip count remains unchanged');assert.equal(glyphs(material.cube[index]).length,0);
  marks.forEach((p,j)=>{const [x,y]=game.pips[index][j];near(p.x,T*(.5+x*.245),'d6 x');near(p.y,T*(.5+y*.245),'d6 y');near(p.r,T*.096,'d6 radius');});
}
const allocated = canvases.length;
for(let i=0;i<100;i++){assert.equal(game.get(),material);assert.equal(game.get('unknown-skin'),material);}
assert.equal(canvases.length,allocated,'warm and unknown-skin lookups allocate no new textures');assert.equal(game.cache.size,1);assert.equal(randomCalls,0,'material generation never consumes gameplay RNG');
console.log(JSON.stringify({pass:true,scope:'production material builder and recorded Canvas commands; not browser pixel QA',material:approvedPath,materialSha256:approvedSha,materialRequests:Object.keys(sources).length,d1Pips:1,d4Pips:tetraPips,d4MinimumRimClearancePx:minimumTetraClearance,d6Pips:21,numberedFaces: glyphFaces,faceUvChecks:uvChecks,cachedTextures:allocated,cacheBytes:allTextures.reduce((n,cv)=>n+cv.width*cv.height*4,0),unknownSkinUsesDefault:true,randomCalls}));
