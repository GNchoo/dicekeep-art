import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const dir=path.resolve(process.argv[2]),manifest=JSON.parse(fs.readFileSync(path.join(dir,'directional-art.json')));
for(const [id,e] of Object.entries(manifest.entries)){
 const cell=256,frames=e.views.side.frames,layers=[];
 for(const [vi,name] of ['side','front','back'].entries()){
  const v=e.views[name],raw=fs.readFileSync(path.join(dir,v.sheet));
  for(let f=0;f<frames;f++){
   const input=await sharp(raw).extract({left:(f%v.cols)*v.cell,top:Math.floor(f/v.cols)*v.cell,width:v.cell,height:v.cell}).resize(cell,cell).png().toBuffer();
   layers.push({input,left:f*cell,top:vi*(cell+24)+24});
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="24"><text x="6" y="18" fill="white" font-size="15">${id} ${name} ${f+1}/${frames}</text></svg>`;
   layers.push({input:Buffer.from(svg),left:f*cell,top:vi*(cell+24)});
  }
 }
 await sharp({create:{width:frames*cell,height:3*(cell+24),channels:4,background:'#253438'}}).composite(layers).png().toFile(path.join(dir,'review',id+'-all-views.png'));
}
console.log('Created actual baked-frame audit boards for '+Object.keys(manifest.entries).length+' entries');
