// Rebuild final PR29 sprites offline from the reviewed, committed source PNGs.
// node tools/art-review/pr29/rebuild.mjs [output-root=gen/pr29-rebuild]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const source=fileURLToPath(new URL('./sources/',import.meta.url));
const seeds=`--background-seeds=${fileURLToPath(new URL('./background-seeds.json',import.meta.url))}`;
const out=path.resolve(repo,process.argv[2]||'gen/pr29-rebuild');
const tmp=path.join(out,'layout'), enemies=path.join(out,'casual/enemies/inf'),bosses=path.join(out,'casual/bosses/inf');
const run=(tool,args)=>execFileSync(process.execPath,[path.join(repo,'tools',tool),...args],{cwd:repo,stdio:'inherit'});
fs.mkdirSync(tmp,{recursive:true});
run('sheet-layout.mjs',[path.join(source,'w001-w005-source.png'),seeds,'--row-cuts=0,320,605,915,1185,1536','--select-rows=1,2,4,5',`--out=${tmp}/a.png`]);
run('sheet-split.mjs',[`${tmp}/a.png`,'--rows=w001,w002,w004,w005',`--out-dir=${enemies}`,'--pack']);
run('sheet-layout.mjs',[path.join(source,'w006-w009-source.png'),seeds,'--row-cuts=0,400,750,1060,1536','--select-rows=1,2',`--out=${tmp}/b.png`]);
run('sheet-split.mjs',[`${tmp}/b.png`,'--rows=w006,w007',`--out-dir=${enemies}`,'--pack']);
for(const n of ['w003','w008','w009'])run('sheet-check.mjs',[path.join(source,`${n}-source.png`),'--background=checkerboard',...(n==='w009'?[seeds]:[]),`--anchor=${n==='w008'?'center':'foot'}`,`--sheet-out=${enemies}/${n}-walk-2x2.png`,`--still-out=${enemies}/${n}.png`,'--pack']);
run('sheet-check.mjs',[path.join(source,'b010-source.png'),'--background=checkerboard','--grid=1x1',`--still-out=${bosses}/b010.png`,'--pack']);
const assets=[];
for(let w=1;w<=9;w++){const id=`w${String(w).padStart(3,'0')}`;assets.push(`casual/enemies/inf/${id}.png`,`casual/enemies/inf/${id}-walk-2x2.png`);}
assets.push('casual/bosses/inf/b010.png');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const results=assets.map(file=>({file,sha256:hash(path.join(out,file)),matchesCommitted:hash(path.join(out,file))===hash(path.join(repo,file))}));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(results,null,2)+'\n');
const mismatches=results.filter(r=>!r.matchesCommitted);
console.log(`${assets.length} rebuilt assets; ${mismatches.length} SHA256 mismatches`);
if(mismatches.length)process.exitCode=1;
