import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(dir,'../../../..');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(path.join(dir,p)));
const resolve=p=>p.replaceAll('\\','/').startsWith('tools/')?path.join(repo,p):path.join(dir,p);
const errors=[],ledger=read('generation-ledger.json'),catalog=JSON.parse(fs.readFileSync(path.join(dir,'../production-catalog.json'))).entries.filter(e=>e.wave>=61),rigs=read('all-rigs.json');
let sources=0,prompts=0,references=0,derived=0;
const check=(p,sha,label)=>{if(!fs.existsSync(p)||hash(p)!==sha)errors.push(label+': missing / changed '+p);};
for(const r of ledger.requests){
 check(path.join(dir,r.source),r.sha256,'raw source');sources++;
 check(path.join(dir,r.prompt),r.promptSha256,'prompt');prompts++;
 const m=await sharp(path.join(dir,r.source)).metadata();
 if(m.width!==r.width||m.height!==r.height||m.channels!==r.channels||m.hasAlpha!==r.hasAlpha)errors.push(r.id+': source metadata changed');
 const refs=r.portableReferences??(r.reference?[r.reference]:r.references??[]),hashes=r.referenceSha256?[r.referenceSha256]:r.referencesSha256??[];
 refs.forEach((p,i)=>{check(p.startsWith('tools/')?path.join(repo,p):p,hashes[i],'reference');references++;});
}
for(const file of ['eye-extraction.json','fairy-alpha-extraction.json','biped-normalization.json','slither-extraction.json']){
 const j=read(file);for(const r of Array.isArray(j)?j:j.records){check(resolve(r.source),r.sourceSha256,'derived original');for(const p of r.pieces??[])if(p.source)check(resolve(p.source),p.sourceSha256,'derived component original');check(resolve(r.output),r.outputSha256,'derived pixels');derived++;}
}
if(ledger.requests.length!==50||new Set(ledger.requests.map(r=>r.id)).size!==50)errors.push('Expected exactly 50 unique builtin generation requests');
if(rigs.entries.length!==45||new Set(rigs.entries.map(r=>r.assetId)).size!==45)errors.push('Expected 45 unique rigs');
for(const c of catalog){const e=rigs.entries.find(e=>e.assetId===c.assetId);if(!e||e.wave!==c.wave||e.role!==c.role||e.locomotion!==c.locomotion||e.reviewApproved!==true||Object.keys(e.views).sort().join(',')!=='back,front,side')errors.push(c.assetId+': incomplete or catalog mismatch');}
const reviewFiles=['float','flight','biped','quad','slither'].map(g=>g+'-visual-review.json'),reviews=reviewFiles.flatMap(f=>read(f).reviewedAssets);
if(reviews.length!==45||reviews.some(r=>!r.reviewApproved)||new Set(reviews.map(r=>r.assetId)).size!==45)errors.push('Expected 45 distinct visual approvals');
const result={scope:'Late-wave 61–101 original and derived provenance, exact catalog coverage and visual review declarations. Shared output/check/moving QA remains separate.',sources,prompts,references,derived,entries:rigs.entries.length,views:rigs.entries.reduce((n,e)=>n+Object.keys(e.views).length,0),rigConfigSha256:hash(path.join(dir,'all-rigs.json')),errors,passed:errors.length===0};
fs.writeFileSync(path.join(dir,'package-validation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
