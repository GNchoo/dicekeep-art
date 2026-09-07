// Archive only completed release runs; partial and offscreen-fixture runs cannot pass.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const root='tools/art-review/directional-101',out=root+'/evidence/runtime';
const read=file=>JSON.parse(fs.readFileSync(path.join(repo,file),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const record=file=>{const b=fs.readFileSync(path.join(repo,file));return{path:file,bytes:b.length,sha256:hash(b)};};
const files=[],copy=file=>{const dest=out+'/'+path.basename(file);fs.copyFileSync(path.join(repo,file),path.join(repo,dest));files.push({...record(dest),generatedPath:file});};
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(repo,'directional-art.js'),'utf8'),ctx);
const manifest=ctx.window.INF_DIRECTIONAL_ART;
assert.equal(Object.keys(manifest.entries).length,110);
const audit=read(root+'/release-builds.json');assert.equal(audit.passed,true);assert.equal(audit.complete,true);assert.equal(audit.partial,false);
assert.equal(audit.productionManifest.sha256,record('directional-art.js').sha256);
fs.mkdirSync(path.join(repo,out),{recursive:true});
const reports={};
for(const device of ['desktop','phone']){
 const file=`gen/e2e/directional-real/directional-real-art-${device}.json`,r=read(file);
 assert.equal(r.passed,true);assert.equal(r.pilot,false);assert.deepEqual(r.errors,[]);assert.deepEqual(r.failures,[]);
 assert.equal(r.waves.length,101);const actors=r.waves.flatMap(w=>w.actors);assert.equal(actors.length,110);
 assert.equal(new Set(actors.map(a=>a.id)).size,110);
 for(const a of actors){assert.equal(a.directions.length,4);for(const d of a.directions){assert.ok(d.minVisibleFraction>=.98);assert.ok(d.framesSeen>=manifest.entries[a.id].views[d.view].frames);}}
 reports[device]={waves:101,identities:110,directions:actors.reduce((n,a)=>n+a.directions.length,0),observedPoses:actors.reduce((n,a)=>n+a.directions.reduce((s,d)=>s+d.framesSeen,0),0),minVisibleFraction:Math.min(...actors.flatMap(a=>a.directions.map(d=>d.minVisibleFraction))),peakTrackedBytes:r.final.peakTrackedBytes,maxRunning:r.final.maxRunning,errors:r.errors.length};copy(file);
 for(const id of ['w001','b100','b100-2','w101'])copy(`gen/e2e/directional-real/${device}-${id}-down.png`);
 const edgeFile=`gen/e2e/directional-edges/directional-edge-cases-${device}.json`,edge=read(edgeFile);
 assert.equal(edge.passed,true);assert.equal(edge.pilot,false);assert.equal(edge.actors.length,10);assert.deepEqual(edge.errors,[]);assert.deepEqual(edge.failures,[]);
 reports[device].edges={actors:10,corners:edge.actors.reduce((n,a)=>n+a.corners.length,0),minSlowRatio:Math.min(...edge.actors.map(a=>a.slowRatio)),maxSlowRatio:Math.max(...edge.actors.map(a=>a.slowRatio))};copy(edgeFile);
}
for(const [name,file]of Object.entries({contracts:'gen/e2e/directional-runtime/actual-runtime-contracts.json',review:'gen/e2e/directional-review/directional-review-regressions.json',pressure:'gen/e2e/directional-pressure/directional-cache-pressure.json'})){
 const r=read(file);assert.equal(r.pass??r.passed,true);assert.notEqual(r.pilot,true);if(r.errors)assert.deepEqual(r.errors,[]);
 if(name==='pressure'){assert.equal(r.manifestSha256,audit.productionManifest.sha256);assert.equal(r.population.count,200);assert.equal(r.population.uniqueIds,110);reports.pressure={population:r.population,renderTotals:r.renderTotals,visibleDraws:r.observation.visibleDraws,clippedDraws:r.observation.clippedDraws,peakTrackedBytes:r.beforeRemoval.peakTrackedBytes,afterRemovalBytes:r.afterRemoval.trackedBytes,limitations:r.limitations};}
 if(name==='contracts')assert.equal(r.boot.approvedEntries,110);
 if(name==='review')assert.equal(r.flight.length,54);
 copy(file);
}
copy('gen/e2e/directional-runtime/actual-spectator-duo.png');
for(const name of ['200-enemies-round-0.png','200-enemies-round-7.png'])copy('gen/e2e/directional-pressure/'+name);
for(const name of ['gallery-monsters.png','gallery-towers.png'])copy('gen/e2e/'+name);
const towerFile='tools/art-review/star-towers-07-20/evidence/browser-validation.json',tower=read(towerFile);
assert.equal(tower.pass,true);assert.equal(tower.actualRenderObservations,28);assert.equal(tower.actualFiringChecks,28);
for(const r of tower.results)assert.equal(r.gameSha256,record('game.js').sha256);
reports.towers={actualRenderObservations:28,actualFiringChecks:28,evidence:record(towerFile)};
const packageFile=root+'/evidence/www-package/validation.json',pkg=read(packageFile);assert.equal(pkg.pass,true);assert.deepEqual(pkg.errors,[]);assert.equal(pkg.files.filter(f=>f.kind==='directional').length,660);assert.ok(pkg.files.every(f=>f.matchesSource));reports.appPackageEvidence=record(packageFile);
const sourcePaths=['game.js','content.js','index.html','infinity-art.js','directional-art.js','tools/e2e/directional-real-art.cjs','tools/e2e/directional-edge-cases.cjs','tools/e2e/directional-runtime-contracts.cjs','tools/e2e/directional-review-regressions.cjs','tools/e2e/directional-cache-pressure.cjs'];
const result={passed:true,recordedAt:new Date().toISOString(),scope:'Completed actual-browser checks for the final110 roster. Source hashes identify the frozen release; edge tests precede the presentation-only altitude fix. Whole-browser memory and200 simultaneous animated sprites are not claimed.',sources:sourcePaths.map(record),artAudit:record(root+'/release-builds.json'),reports,files};
fs.writeFileSync(path.join(repo,root,'runtime-release.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,files:files.length,desktop:reports.desktop,phone:reports.phone,pressure:reports.pressure.renderTotals},null,2));
