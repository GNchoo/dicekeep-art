import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]||'gen/late-directional');
const catalog=JSON.parse(fs.readFileSync(path.join(dir,'../production-catalog.json'))).entries;
const manifest=JSON.parse(fs.readFileSync(path.join(out,'directional-art.json'))),entries=Object.values(manifest.entries);
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const index=[];
for(let page=0;page<Math.ceil(entries.length/15);page++){
 const layers=[],width=1200,height=420;
 for(const [i,e]of entries.slice(page*15,page*15+15).entries()){
  const c=catalog.find(c=>c.assetId===e.assetId),x=i%5*240,y=Math.floor(i/5)*140;
  const label=`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="28"><text x="8" y="20" fill="white" font-family="Malgun Gothic, sans-serif" font-size="13">${e.assetId} ${escape(c.name)}</text></svg>`;
  layers.push({input:Buffer.from(label),left:x,top:y});
  for(const [vi,name]of ['side','front','back'].entries()){
   const v=e.views[name],reviewHeight=e.role==='normal'?48:64,ratio=reviewHeight/e.referenceHeight/v.scale,n=Math.round(v.cell*ratio);
   const png=await sharp(path.join(out,v.still)).resize(n,n).png().toBuffer();
   layers.push({input:png,left:x+vi*80+Math.round((80-n)/2),top:y+125-Math.round(v.pivot[1]*ratio)});
  }
  index.push({assetId:e.assetId,wave:e.wave,role:e.role,name:c.name,description:c.description,locomotion:e.locomotion,framesPerView:e.views.side.frames,views:['side','front','back'],reviewApproved:e.ready,reviewBoard:`review/roster-${page+1}.png`,individualBoard:`review/${e.assetId}-all-views.png`,moving:`review/${e.assetId}-moving.gif`});
 }
 await sharp({create:{width,height,channels:4,background:'#253438'}}).composite(layers).png().toFile(path.join(out,'review',`roster-${page+1}.png`));
}
fs.writeFileSync(path.join(dir,'asset-index.json'),JSON.stringify({scope:'Review renders from actual neutral output. Reference height 48px ordinary / 64px boss; this is a comparison board, not a live-game screenshot.',entries:index},null,2)+'\n');
console.log('Wrote '+Math.ceil(entries.length/15)+' roster boards and '+index.length+' exact catalog identities.');
