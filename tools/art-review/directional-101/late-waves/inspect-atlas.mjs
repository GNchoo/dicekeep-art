import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import sharp from 'sharp';
import {loadRaw,foregroundMask} from '../../../lib/sheet.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)), file=path.resolve(process.argv[2]);
const raw=await loadRaw(file,{background:'checkerboard'}), mask=foregroundMask(raw),seen=new Uint8Array(mask.length),all=[];
for(let p=0;p<mask.length;p++){if(!mask[p]||seen[p])continue;const q=[p];seen[p]=1;let n=0,x0=raw.W,y0=raw.H,x1=0,y1=0;while(q.length){const v=q.pop(),x=v%raw.W,y=Math.floor(v/raw.W);n++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);for(const next of[x? v-1:-1,x<raw.W-1?v+1:-1,y?v-raw.W:-1,y<raw.H-1?v+raw.W:-1])if(next>=0&&mask[next]&&!seen[next]){seen[next]=1;q.push(next);}}if(n>30)all.push({n,bounds:[x0,y0,x1-x0+1,y1-y0+1]});}
all.sort((a,b)=>a.bounds[1]-b.bounds[1]||a.bounds[0]-b.bounds[0]);all.forEach((x,i)=>x.id=i);
const base=path.basename(file,'.png'),out=path.join(dir,'inspection');fs.mkdirSync(out,{recursive:true});
const rgba=Buffer.from(raw.data);for(let i=0;i<mask.length;i++)if(!mask[i])rgba[i*4+3]=0;
const overlay='<svg width="'+raw.W+'" height="'+raw.H+'" xmlns="http://www.w3.org/2000/svg">'+all.filter(x=>x.n>=100).map(({id,bounds:[x,y,w,h]})=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#f44" stroke-width="2"/><text x="${x}" y="${Math.max(15,y-3)}" font-size="18" fill="#fff" stroke="#111" stroke-width=".6">${id}</text>`).join('')+'</svg>';
const annotated=await sharp(rgba,{raw:{width:raw.W,height:raw.H,channels:4}}).flatten({background:'#253438'}).composite([{input:Buffer.from(overlay)}]).png().toBuffer();
await sharp(annotated).resize({width:1400,withoutEnlargement:true}).png().toFile(path.join(out,base+'-components.png'));
fs.writeFileSync(path.join(out,base+'-components.json'),JSON.stringify({width:raw.W,height:raw.H,source:file,components:all},null,2));
console.log(JSON.stringify({width:raw.W,height:raw.H,components:all.filter(x=>x.n>=500)},null,2));
