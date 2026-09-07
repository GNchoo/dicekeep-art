// Promote already reviewed production outputs; reject partial/failed builds.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const args=process.argv.slice(2),complete=args.includes('--require-complete'),dirs=args.filter(x=>!x.startsWith('--'));
if(args.some(x=>x.startsWith('--')&&x!=='--require-complete'))throw new Error('Unknown option');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(repo,'directional-art.js'),'utf8'),ctx);
const target={version:93,entries:{...ctx.window.INF_DIRECTIONAL_ART.entries}};
const pending=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const safe=(base,rel)=>{
 if(typeof rel!=='string'||path.isAbsolute(rel)||rel.includes('..')||!/^casual\/(?:enemies|bosses)\/inf\/directional\/[\w-]+\.png$/.test(rel))throw new Error('Unsafe runtime path '+rel);
 const p=path.resolve(base,rel);if(!p.startsWith(base+path.sep))throw new Error('Outside output');return p;
};
for(const dir of dirs){
 const from=path.resolve(repo,dir);
 if(!from.startsWith(repo+path.sep))throw new Error('Source must be a repo build subdirectory');
 const data=JSON.parse(fs.readFileSync(path.join(from,'directional-art.json'),'utf8'));
 const qa=JSON.parse(fs.readFileSync(path.join(from,'directional-qa.json'),'utf8'));
 const validation=JSON.parse(fs.readFileSync(path.join(from,'directional-validation.json'),'utf8'));
 if(data.version!==93||qa.errors?.length||!validation.passed||validation.errors?.length)throw new Error('Build QA failed: '+dir);
 if(!qa.config||!qa.configSha256||hash(fs.readFileSync(path.resolve(repo,qa.config)))!==qa.configSha256)throw new Error('Build config changed: '+dir);
 if(validation.manifestSha256!==hash(fs.readFileSync(path.join(from,'directional-art.json')))||validation.qaSha256!==hash(fs.readFileSync(path.join(from,'directional-qa.json'))))throw new Error('Validation is stale: '+dir);
 for(const [id,e]of Object.entries(data.entries)){
  const q=qa.entries.find(x=>x.assetId===id);
  if(!e.ready||!q?.ready||!q.reviewApproved)throw new Error('Unreviewed entry '+id);
  for(const v of ['side','front','back']){
   const view=e.views[v];if(!view||!view.fallback?.startsWith('data:image/webp;base64,'))throw new Error('Incomplete view '+id+' '+v);
   for(const f of [view.still,view.sheet]){
    const src=safe(from,f),bytes=fs.readFileSync(src),record=qa.files.find(x=>x.file===f);
    if(!record||record.sha256!==hash(bytes))throw new Error('Changed artifact '+f);
    pending.push({dest:safe(repo,f),bytes});
   }
  }
  target.entries[id]=e;
 }
}
const catalog=JSON.parse(fs.readFileSync(path.join(repo,'tools/art-review/directional-101/production-catalog.json'),'utf8'));
if(complete){
 const missing=catalog.entries.filter(x=>!target.entries[x.assetId]?.ready).map(x=>x.assetId);
 const unknown=Object.keys(target.entries).filter(id=>!catalog.entries.some(x=>x.assetId===id));
 if(missing.length||unknown.length||Object.keys(target.entries).length!==110)throw new Error('Incomplete roster: missing '+missing.join(',')+'; unknown '+unknown.join(','));
}
for(const {dest,bytes}of pending){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}
target.entries=Object.fromEntries(Object.entries(target.entries).sort((a,b)=>a[1].wave-b[1].wave||a[0].localeCompare(b[0])));
fs.writeFileSync(path.join(repo,'directional-art.js'),'// Generated from reviewed directional sprite builds; see tools/art-review/directional-101.\nwindow.INF_DIRECTIONAL_ART = '+JSON.stringify(target)+';\n');
console.log(JSON.stringify({promotedFiles:pending.length,readyEntries:Object.keys(target.entries).length,expectedEntries:110,complete:Object.keys(target.entries).length===110}));
