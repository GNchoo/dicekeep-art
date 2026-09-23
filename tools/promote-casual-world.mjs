// Reproducible promotion of reviewed built-in image_gen outputs. No API calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root='tools/art-review/casual-world-2026-09-23';
const jobs=JSON.parse(await fs.readFile('tools/casual-world-jobs.json','utf8'));
const partial=process.argv.includes('--partial');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const records=[];
for(const job of jobs){
  const source=`${root}/${job.id}.png`;
  let input;
  try { input=await fs.readFile(source); } catch(error) { if(partial&&error.code==='ENOENT')continue;throw error; }
  const original=`${root}/originals/${job.id}${path.extname(job.target)}`;
  const originalBytes=await fs.readFile(original),meta=await sharp(originalBytes).metadata();
  let image=sharp(input);
  if(job.kind==='tower') image=image.trim({threshold:8}).resize({width:meta.width,height:meta.height,fit:'inside'});
  else if(job.kind==='vfx') image=image.trim({threshold:8}).resize({width:320,height:320,fit:'inside'});
  else image=image.resize(meta.width,meta.height,{fit:job.kind==='floor'?'cover':job.kind==='prop'?'contain':'fill',background:'#00000000'});
  if(['floor','texture'].includes(job.kind))image=image.flatten({background:'#ffffff'});
  const output=await (job.target.endsWith('.jpg')?image.jpeg({quality:90,mozjpeg:true}):image.png({palette:true,quality:95,effort:10})).toBuffer();
  const targets=[job.target,...(job.extraTargets||[])];
  for(const target of targets)await fs.writeFile(target,output);
  const {width,height,hasAlpha}=await sharp(output).metadata();
  records.push({id:job.id,source,sourceSha256:hash(input),original,originalSha256:hash(originalBytes),targets,width,height,hasAlpha,bytes:output.length,sha256:hash(output)});
}
await fs.writeFile(`${root}/promotion.json`,JSON.stringify({generatedWith:'Codex built-in image_gen',apiKeyUsed:false,baseCommit:'9a69b7a',jobs:'tools/casual-world-jobs.json',records},null,2)+'\n');
console.log(`Promoted ${records.length}/${jobs.length} reviewed source images.`);
