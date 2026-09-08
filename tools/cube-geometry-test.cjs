// Verify the actual production rounded cube and pip UV contract, without a browser.
// Run: node tools/cube-geometry-test.cjs
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..'), game = fs.readFileSync(path.join(repo, 'game.js'), 'utf8');
const literal = game.match(/const FACES = (\[[\s\S]*?\n\]);/);
assert.ok(literal, 'logical FACES declaration exists');
const FACES = vm.runInNewContext(literal[1]);
const declaration = game.match(/function makeCubeRenderMesh\(subdivisions\)\s*\{[\s\S]*?\r?\n\}\r?\nconst CUBE_RENDER_MESH\s*=\s*makeCubeRenderMesh\((\d+)\);\r?\nconst CUBE_SLOT_MESH\s*=\s*makeCubeRenderMesh\((\d+)\);/);
assert.ok(declaration, 'production factory and both mesh declarations exist');
assert.equal(Number(declaration[1]),6,'center/icon mesh subdivision');
assert.equal(Number(declaration[2]),3,'fixed slot mesh subdivision');
const meshes = vm.runInNewContext(declaration[0] + '\n({full:CUBE_RENDER_MESH,slot:CUBE_SLOT_MESH});', { FACES });
const pipLiteral = game.match(/const CUBE_PIPS\s*=\s*(\[[\s\S]*?\r?\n\]);/);
assert.ok(pipLiteral, 'production CUBE_PIPS declaration exists');
const CUBE_PIPS = JSON.parse(JSON.stringify(vm.runInNewContext(pipLiteral[1])));
const patterns=[[[0,0]],[[-1,-1],[1,1]],[[-1,-1],[0,0],[1,1]],[[-1,-1],[1,-1],[-1,1],[1,1]],[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]];
assert.deepEqual(CUBE_PIPS,patterns,'standard 1..6 orthographic pip layouts');
const pipMetrics = game.match(/const x\s*=\s*T\s*\*\s*\(\.5\s*\+\s*u\s*\*\s*([\d.]+)\),\s*y\s*=\s*T\s*\*\s*\(\.5\s*\+\s*v\s*\*\s*([\d.]+)\),\s*r\s*=\s*T\s*\*\s*([\d.]+);/);
assert.ok(pipMetrics,'production pip center and radius constants exist');
const [,pipOffsetX,pipOffsetY,pipRadius] = pipMetrics.map(Number);
assert.equal(pipOffsetX,.245);assert.equal(pipOffsetY,.245);assert.equal(pipRadius,.096);
const texLiteral=game.match(/const DICE_MAT_TEX\s*=\s*(\d+)/);assert.ok(texLiteral);const textureSize=Number(texLiteral[1]);
// Include the visible stone lip (radius+1.35px and center+1.1px) in a conservative
// circular envelope, as well as the recessed .096T bowl itself.
const pipOuterRadius = pipRadius + (1.35+1.1)/textureSize;
const eps = 1e-10, radius = .18, inner = 1 - radius;
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), sub = (a, b) => a.map((x, i) => x - b[i]);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => a.map(x => x / Math.hypot(...a));
const near = (a, b, label) => assert.ok(Math.abs(a-b) < eps, `${label}: ${a} != ${b}`);
const same = (a, b, label) => a.forEach((x, i) => near(x, b[i], label));
function checkMesh(mesh, subdivisions) {
const counts = Object.fromEntries(['face','edge','corner'].map(kind => [kind, mesh.filter(p => p.kind === kind).length]));
assert.deepEqual(counts, { face:6, edge:12*subdivisions, corner:8*subdivisions*subdivisions });
const ids = new Map(), coordinateRefs = new Map(), polygonEdges = new Map(), triangleEdges = new Map();
let triangles = 0, volume = 0, checkedPipSamples = 0;
const id = point => { if (!ids.has(point)) ids.set(point, ids.size); return ids.get(point); };
const edge = (map, a, b) => { const ia=id(a),ib=id(b),key=[Math.min(ia,ib),Math.max(ia,ib)].join(','); const entry=map.get(key)||[]; entry.push([ia,ib]);map.set(key,entry); };
for (const patch of mesh) {
 assert.ok(['val','points','normals','uv','n','planeNormal','center','kind'].every(k=>Object.hasOwn(patch,k)));
 assert.equal(patch.points.length, patch.kind==='corner'?3:4);assert.equal(patch.normals.length,patch.points.length);assert.equal(patch.uv.length,patch.points.length);
 assert.equal(patch.val===0,patch.kind!=='face');
 const mean = values => [0,1,2].map(i=>values.reduce((s,v)=>s+v[i],0)/values.length);
 same(patch.center,mean(patch.points),'patch center');same(patch.n,unit(mean(patch.normals)),'mean normal');
 same(patch.planeNormal,unit(cross(sub(patch.points[1],patch.points[0]),sub(patch.points[2],patch.points[0]))),'exact culling plane normal');
 near(Math.hypot(...patch.planeNormal),1,'unit plane normal');assert.ok(dot(patch.planeNormal,patch.n)>0,'culling plane faces outward');
 for(let i=0;i<patch.points.length;i++){
  const p=patch.points[i],n=patch.normals[i];assert.ok(p.every(Number.isFinite));assert.ok(p.every(x=>Math.abs(x)<=1+eps));near(Math.hypot(...n),1,'unit vertex normal');
  near(dot(sub(p,patch.points[0]),patch.planeNormal),0,'all patch vertices lie in culling plane');
  const delta=p.map(x=>x-Math.max(-inner,Math.min(inner,x)));near(Math.hypot(...delta),radius,'rounded box radius');same(n,unit(delta),'geometric smooth normal');
  assert.ok(patch.uv[i].every(x=>Number.isFinite(x)&&x>=0&&x<=1),'finite bounded UV');
  const key=p.map(x=>Math.round(x*1e12)).join(',');if(coordinateRefs.has(key))assert.equal(p,coordinateRefs.get(key),'shared coordinates share point reference');else coordinateRefs.set(key,p);
  edge(polygonEdges,p,patch.points[(i+1)%patch.points.length]);
 }
 for(let i=1;i<patch.points.length-1;i++){
  const [a,b,c]=[patch.points[0],patch.points[i],patch.points[i+1]],normal=cross(sub(b,a),sub(c,a));
  assert.ok(Math.hypot(...normal)>eps,'nondegenerate triangle');assert.ok(dot(normal,patch.n)>0,'outward winding');
  const [ua,ub,uc]=[patch.uv[0],patch.uv[i],patch.uv[i+1]];
  assert.ok(Math.abs((ub[0]-ua[0])*(uc[1]-ua[1])-(ub[1]-ua[1])*(uc[0]-ua[0]))>eps,'nondegenerate UV triangle');
  for(const [p,q] of [[a,b],[b,c],[c,a]])edge(triangleEdges,p,q);
  volume+=dot(a,cross(b,c))/6;triangles++;
 }
 if(patch.kind==='face'){
  const face=FACES.find(f=>f.val===patch.val);assert.ok(face);same(patch.n,face.n,'logical face normal');
  patch.points.forEach((p,i)=>{near(dot(p,face.n),1,'face plane');near(patch.uv[i][0],.5+.5*dot(p,face.u),'main UV x');near(patch.uv[i][1],.5+.5*dot(p,face.v),'main UV y');});
  const lo=radius/2,hi=1-lo;
  // Current pip layout occupies source UV .255..745 with radius .096. Main UV
  // cropping keeps centers and radius in exactly the original unit-cube position.
  const pipSamples=[[0,0],...[pipRadius,pipOuterRadius].flatMap(r=>[[r,0],[-r,0],[0,r],[0,-r]])];
  for(const [x,y] of CUBE_PIPS[patch.val-1])for(const [dx,dy] of pipSamples){
   const u=.5+pipOffsetX*x+dx,v=.5+pipOffsetY*y+dy;assert.ok(u>lo&&u<hi&&v>lo&&v<hi,'whole pip and stone lip lie inside face crop');
   near(-inner+2*inner*(u-lo)/(hi-lo),2*u-1,'pip world x preserved');near(-inner+2*inner*(v-lo)/(hi-lo),2*v-1,'pip world y preserved');checkedPipSamples++;
  }
 }
}
for(const [label,map] of [['polygon',polygonEdges],['triangle',triangleEdges]])for(const [key,uses] of map){assert.equal(uses.length,2,`${label} watertight edge ${key}`);assert.equal(uses[0][0],uses[1][1],`${label} opposite winding`);assert.equal(uses[0][1],uses[1][0],`${label} opposite winding`);}
assert.equal(ids.size,8+12*subdivisions+4*subdivisions*subdivisions);assert.equal(triangles,12+24*subdivisions+8*subdivisions*subdivisions);assert.equal(ids.size-triangleEdges.size+triangles,2,'closed sphere Euler characteristic');assert.equal(ids.size-polygonEdges.size+mesh.length,2);
assert.ok(volume>0&&volume<8,'positive volume within original cube');
for(let axis=0;axis<3;axis++){near(Math.max(...[...ids.keys()].map(p=>p[axis])),1,'positive extent');near(Math.min(...[...ids.keys()].map(p=>p[axis])),-1,'negative extent');}
for(const f of FACES){const opposite=FACES.find(g=>g.n.every((x,i)=>x===-f.n[i]));assert.ok(opposite);assert.equal(f.val+opposite.val,7);}
return {radius,subdivisions,patches:mesh.length,counts,triangles,vertices:ids.size,polygonEdges:polygonEdges.size,triangleEdges:triangleEdges.size,watertight:true,outward:true,exactCullingNormals:true,unitBounds:true,pips:CUBE_PIPS.reduce((n,p)=>n+p.length,0),pipRadius,pipOffset:[pipOffsetX,pipOffsetY],pipOuterRadius,pipSamples:checkedPipSamples,mainUvRange:[radius/2,1-radius/2],minimumOuterPipClearanceUV:(1-radius/2)-(.5+pipOffsetX)-pipOuterRadius,volume};
}
const results = {full:checkMesh(meshes.full,6),slot:checkMesh(meshes.slot,3)};
const mainFaces = mesh => JSON.parse(JSON.stringify(mesh.filter(p=>p.kind==='face').map(({val,points,normals,uv,n,planeNormal})=>({val,points,normals,uv,n,planeNormal})).sort((a,b)=>a.val-b.val)));
assert.deepEqual(mainFaces(meshes.full),mainFaces(meshes.slot),'LOD preserves every main face, pip UV and result normal');
console.log(JSON.stringify({passed:true,source:'game.js',identicalMainFacesAcrossLod:true,meshes:results},null,2));
