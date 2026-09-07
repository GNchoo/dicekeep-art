// Integrity/decoding checks only. Never claims an accepted animation cycle.
// node tools/art-review/pr29-fullbody/validate.mjs [report-output.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const base = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(base, '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
const report = { scope:'Archive integrity and image decoding only; accepted complete eight-frame cycles:0.', filesVerified:0, imagesDecoded:0, originalPngs:0, uniqueOriginalPngs:0, gifPages:[], referencesChecked:0, errors:[] };
const check = (condition,message) => { if(!condition) report.errors.push(message); };
const inside = relative => {
  if(typeof relative!=='string' || path.isAbsolute(relative) || relative.includes('\\')) throw new Error('Expected portable relative path: '+relative);
  const result=path.resolve(base,relative);
  if(result!==base && !result.startsWith(base+path.sep)) throw new Error('Path leaves package: '+relative);
  return result;
};
const digest = (bytes,mode) => createHash('sha256').update(mode==='utf8-lf'?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes).digest('hex');
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(path.join(dir,item.name)):[path.relative(base,path.join(dir,item.name)).replaceAll('\\','/')]);
try {
  check(manifest.version===1 && Array.isArray(manifest.files),'unsupported archive manifest');
  const listed=new Set(manifest.files.map(entry=>entry.file));
  check(listed.size===manifest.files.length,'duplicate manifest path');
  for(const file of walk(base)) if(!manifest.excluded.includes(file)) check(listed.has(file),'unregistered package file: '+file);
  const originals=[];
  for(const entry of manifest.files) {
    try {
      const file=inside(entry.file);
      check(!entry.file.includes('helper-smoke'),'synthetic helper-smoke duplicate is archived');
      if(!fs.existsSync(file)){check(false,'missing file: '+entry.file);continue;}
      const bytes=fs.readFileSync(file),sha256=digest(bytes,entry.hashMode);
      check(sha256===entry.sha256,'SHA256 mismatch: '+entry.file);report.filesVerified++;
      if(entry.role==='generated-original') originals.push({file:entry.file,sha256});
      if(entry.image) {
        const decoder=sharp(file,{animated:entry.image.format==='gif'}),m=await decoder.metadata();
        await decoder.ensureAlpha().raw().toBuffer();report.imagesDecoded++;
        check(m.format===entry.image.format && m.width===entry.image.width && (m.pageHeight||m.height)===entry.image.height,'image format/dimensions mismatch: '+entry.file);
        if(entry.image.format==='gif') {
          report.gifPages.push({file:entry.file,pages:m.pages,delay:m.delay});
          check(m.pages===8 && entry.image.pages===8,'expected eight GIF pages: '+entry.file);
          check(JSON.stringify(m.delay)===JSON.stringify(entry.image.delay),'GIF timing mismatch: '+entry.file);
        }
      }
      if(path.extname(file)==='.json') JSON.parse(bytes.toString('utf8'));
    }catch(error){check(false,entry.file+': '+error.message);}
  }
  report.originalPngs=originals.length;report.uniqueOriginalPngs=new Set(originals.map(item=>item.sha256)).size;
  check(report.originalPngs===10 && report.uniqueOriginalPngs===10,'expected exactly10unique generated originals');
  const index=JSON.parse(fs.readFileSync(path.join(base,'records/source-index.json'),'utf8'));
  for(const source of index.generatedOriginals)check(originals.some(item=>item.file===source.file&&item.sha256===source.sha256),'source inventory mismatch: '+source.file);
  const records=[];
  for(const [file,count]of [['records/generations-initial.json',2],['records/generations-latest.json',10]]) {
    const catalog=JSON.parse(fs.readFileSync(path.join(base,file),'utf8'));
    check(catalog.generations.length===count,'catalog count mismatch: '+file);
    for(const item of catalog.generations) {
      check(typeof item.prompt==='string'&&item.prompt.length>0&&typeof item.review==='string','missing original prompt/review: '+item.result);
      for(const ref of [item.result,item.reference,...(item.references||[])].filter(Boolean)){check(fs.existsSync(inside(ref)),'broken catalog reference: '+ref);report.referencesChecked++;}
      records.push(item.result);
    }
  }
  check(new Set(records).size===10,'the12records do not resolve to10source files');
  const config=JSON.parse(fs.readFileSync(path.join(base,'initial/config.json'),'utf8'));
  for(const wave of config.waves) {
    const relative=path.posix.normalize('initial/'+wave.source),file=inside(relative);
    check(fs.existsSync(file)&&digest(fs.readFileSync(file),'bytes')===wave.sourceSha256,'split source hash mismatch: '+relative);
    check(wave.frames.length===8,'split config requires eight supplied drawings');
  }
}catch(error){check(false,error.message);}
report.passed=report.errors.length===0;
const output=path.resolve(repo,process.argv[2]||'gen/pr29-fullbody-validation.json');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`${report.passed?'PASS':'FAIL'} archive: ${report.filesVerified} files, ${report.imagesDecoded} decoded images, ${report.uniqueOriginalPngs} unique original PNGs, ${report.gifPages.length} eight-page GIFs, ${report.referencesChecked} record references`);
if(!report.passed){console.error(report.errors.join('\n'));process.exitCode=1;}
