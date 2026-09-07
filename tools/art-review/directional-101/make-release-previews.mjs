// Present the exact runtime PNG poses, without rerigging or per-frame fitting.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const bytes=fs.readFileSync(path.join(repo,'directional-art.js')),ctx={window:{}};vm.runInNewContext(bytes.toString(),ctx);
const manifest=ctx.window.INF_DIRECTIONAL_ART,entries=Object.values(manifest.entries),partial=process.argv.includes('--partial');
if(!partial&&entries.length!==110)throw Error('Preview release requires 110 approved identities');
const out=path.join(repo,'tools/art-review/directional-101/evidence/previews');fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),cell=256,height=280,width=cell*3,report={complete:entries.length===110,partial,manifestSha256:hash(bytes),presentation:'Fixed 256px cells; right/front/back; 1.2-second review cycle, not game speed.',entries:[]};
for(const e of entries){
 if(!e.ready)throw Error('Unreviewed '+e.assetId);
 const count=e.views.side.frames,sources=[],sheets=[];
 for(const name of ['side','front','back']){const v=e.views[name],b=fs.readFileSync(path.join(repo,v.sheet));sources.push({view:name,file:v.sheet,sha256:hash(b)});sheets.push(b);}
 const frames=[];
 for(let i=0;i<count;i++){
  const composite=[];
  for(const [j,name]of ['side','front','back'].entries()){
   const v=e.views[name],f=Math.floor(i/count*v.frames),png=await sharp(sheets[j]).extract({left:f%v.cols*v.cell,top:Math.floor(f/v.cols)*v.cell,width:v.cell,height:v.cell}).resize(cell,cell).png().toBuffer();
   composite.push({input:png,left:j*cell,top:24});
   const title=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="24"><text x="8" y="17" fill="#edf0df" font-family="sans-serif" font-size="14">${e.assetId} ${name} ${i+1}/${count}</text></svg>`;
   composite.push({input:Buffer.from(title),left:j*cell,top:0});
  }
  frames.push(await sharp({create:{width,height,channels:4,background:'#253438'}}).composite(composite).raw().toBuffer());
 }
 const gif=await sharp(Buffer.concat(frames),{raw:{width,height:height*count,channels:4,pageHeight:height}}).gif({delay:Array(count).fill(Math.round(1200/count)),loop:0,effort:7}).toBuffer();
 const file=e.assetId+'-three-views.gif';fs.writeFileSync(path.join(out,file),gif);report.entries.push({assetId:e.assetId,file,sha256:hash(gif),bytes:gif.length,frames:count,sources});
 console.log('preview',e.assetId);
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({entries:entries.length,bytes:report.entries.reduce((n,e)=>n+e.bytes,0),complete:report.complete}));
