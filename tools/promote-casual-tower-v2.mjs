import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
const source='tools/art-review/casual-menus-2026-09-23/tower-1.png';
const image=await sharp(source).trim({threshold:8}).resize({width:242,height:384,fit:'inside'}).png({palette:true,quality:95}).toBuffer();
const targets=['casual/towers/t1-a.png','towers/die-1.png'];
for(const target of targets) await fs.writeFile(target,image);
const {width,height,hasAlpha}=await sharp(image).metadata();
await fs.writeFile('tools/art-review/casual-menus-2026-09-23/promotion.json',JSON.stringify({source,generatedWith:'Codex built-in image_gen',apiKeyUsed:false,targets,width,height,hasAlpha,sha256:crypto.createHash('sha256').update(image).digest('hex')},null,2)+'\n');
