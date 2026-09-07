import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import sharp from'sharp';
const dir=path.dirname(fileURLToPath(import.meta.url)),[id,source]=process.argv.slice(2);
const jobs=JSON.parse(fs.readFileSync(path.join(dir,'parts-jobs.json'))),job=jobs.find(j=>j.id===id);if(!job)throw new Error('Unknown job');
const dest=path.join(dir,'sources',id+'.png');if(fs.existsSync(dest))throw new Error('Already registered');
fs.copyFileSync(source,dest);const bytes=fs.readFileSync(dest),meta=await sharp(bytes).metadata();
const file=path.join(dir,'generation-ledger.json'),ledger=JSON.parse(fs.readFileSync(file));
const record={call:ledger.requests.length+1,id,stage:job.stage,assetIds:job.assetIds,prompt:job.promptFile,promptSha256:createHash('sha256').update(fs.readFileSync(path.join(dir,job.promptFile))).digest('hex'),references:job.references,referencesSha256:job.referencesSha256,originalGeneratedPath:source,source:'sources/'+id+'.png',sha256:createHash('sha256').update(bytes).digest('hex'),width:meta.width,height:meta.height,channels:meta.channels,hasAlpha:meta.hasAlpha,reviewStatus:'awaiting-visual-review',cost:null};
ledger.requests.push(record);fs.writeFileSync(file,JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify(record));
