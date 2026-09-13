// Promote only the reviewed knee correction, retaining all existing runtime paths.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sha256 } from './lib/directional-rig.mjs';
const root=process.cwd(),dir='tools/art-review/biped-knees-110',read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const legacy=process.argv.includes('--legacy'),configFile=dir+(legacy?'/legacy-front-back-rigs.json':'/rigs.json');
const config=read(configFile),selection=read(dir+(legacy?'/legacy-selection.json':'/selection.json')).selection,review=read(dir+(legacy?'/legacy-review.json':'/review.json'));
assert.equal(review.passed,true);assert.equal(review.configSha256,sha256(fs.readFileSync(configFile)));
assert.deepEqual([...review.ids].sort(),config.entries.map(e=>e.assetId).sort());
const manifests=new Map();
for(const file of ['directional-art.js','extreme-art.js']){const text=fs.readFileSync(file,'utf8'),ctx={window:{}};vm.runInNewContext(text,ctx);manifests.set(file,{text,data:JSON.parse(JSON.stringify(Object.values(ctx.window)[0]))});}
const pending=[],report={version:110,scope:legacy?'Five early bipeds: correct front/back knees only; original correct side views retained.':'98 biped knee directions only; original runtime paths, identity and placement retained. Two avian hocks excluded.',files:[],entries:[],passed:false};
const safe=relative=>{assert.match(relative,/^casual\/(enemies|bosses)\/(inf\/directional|extreme)\/[\w-]+\.(png|webp)$/);const p=path.resolve(root,relative);assert.ok(p.startsWith(root+path.sep));return p;};
for(const kind of legacy?['legacy']:['original','extreme']){
  const out='gen/biped-knees-110/'+kind,manifestBytes=fs.readFileSync(out+'/directional-art.json'),qaBytes=fs.readFileSync(out+'/directional-qa.json');
  const built=JSON.parse(manifestBytes),qa=JSON.parse(qaBytes),valid=read(out+'/directional-validation.json');
  const movingBytes=fs.readFileSync(out+'/directional-moving-qa.json'),moving=JSON.parse(movingBytes),approved=review.builds[kind];
  assert.equal(sha256(manifestBytes),approved.manifestSha256,'unreviewed manifest');
  assert.equal(sha256(qaBytes),approved.qaSha256,'unreviewed geometry/image evidence');
  assert.equal(sha256(movingBytes),approved.movingQaSha256,'unreviewed movement evidence');
  assert.equal(moving.passed,true);assert.equal(moving.errors.length,0);assert.equal(moving.manifestSha256,sha256(manifestBytes));
  assert.equal(valid.passed,true);assert.equal(valid.manifestSha256,sha256(manifestBytes));assert.equal(valid.qaSha256,sha256(qaBytes));
  assert.equal(qa.configSha256,review.configSha256);assert.equal(qa.errors.length,0);
  const ids=selection.filter(x=>x.kind===kind).map(x=>x.id).sort();assert.deepEqual(Object.keys(built.entries).sort(),ids);
  assert.deepEqual(moving.entries.map(e=>e.assetId).sort(),ids);
  const target=manifests.get(kind==='extreme'?'extreme-art.js':'directional-art.js').data;
  for(const id of ids){
    const fresh=built.entries[id],original=target.entries[id],evidence=qa.entries.find(e=>e.assetId===id),input=config.entries.find(e=>e.assetId===id);
    assert.equal(input.anatomy,'biped');
    for(const field of ['assetId','wave','role','locomotion','referenceHeight','cycleStride','cycleSeconds'])assert.deepEqual(fresh[field],original[field],id+':'+field);
    for(const view of legacy?['front','back']:['side','front','back']){
      const v=fresh.views[view],prior=original.views[view],geometry=evidence.views[view].geometry;
      assert.equal(geometry.passed,true);assert.equal(geometry.checks.length,2);
      for(const leg of geometry.checks)assert.ok(leg.minimumForwardKneeOffset>=-1e-6,id+':'+view+' forward knee');
      assert.equal(v.assetVersion,110);
      for(const field of ['frames','cols','rows','cell','pivot','scale'])assert.deepEqual(v[field],prior[field],id+':'+view+':'+field);
      for(const field of ['still','sheet']){
        const from=v[field],destination=prior[field],bytes=fs.readFileSync(path.join(out,from));safe(from);safe(destination);
        assert.equal(sha256(bytes),qa.files.find(f=>f.file===from)?.sha256,'stale candidate '+from);
        let final=bytes;
        if(path.extname(from)!==path.extname(destination))final=await(path.extname(destination)==='.webp'?sharp(bytes).webp({lossless:true,effort:6}):sharp(bytes).png({compressionLevel:9})).toBuffer();
        if(final!==bytes){const a=await sharp(bytes).ensureAlpha().raw().toBuffer(),b=await sharp(final).ensureAlpha().raw().toBuffer();assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)if(i%4===3||a[i-i%4+3])assert.equal(a[i],b[i],'encoding changed visible pixel');}
        const record={id,view,kind:field,path:destination,beforeSha256:sha256(fs.readFileSync(safe(destination))),sha256:sha256(final),bytes:final.length};
        assert.notEqual(record.sha256,record.beforeSha256,'correction missing '+destination);
        pending.push({path:destination,bytes:final});report.files.push(record);
      }
      // Preserve paths and placement; only the corrected fallback and cache key change.
      original.views[view]={...prior,fallback:v.fallback,assetVersion:110};
    }
    report.entries.push(id);
  }
}
assert.equal(report.entries.length,legacy?5:98);assert.equal(pending.length,legacy?20:588);
if(process.argv.includes('--check')){console.log(`PASS ${pending.length} image replacements preflight; no production mutation.`);process.exit(0);}
for(const file of pending)fs.writeFileSync(safe(file.path),file.bytes);
for(const [file,{text,data}]of manifests){const prefix=text.slice(0,text.indexOf('{')),indent=text.includes('\n  "version"')?2:undefined;fs.writeFileSync(file,prefix+JSON.stringify(data,null,indent)+';\n');}
report.passed=true;fs.writeFileSync('gen/biped-knees-110/'+(legacy?'legacy-promotion.json':'promotion.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PASS ${report.entries.length} identities / ${pending.length} images / ${pending.length/2} fallbacks promoted with per-view v110.`);
