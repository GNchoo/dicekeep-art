import fs from 'node:fs';import path from 'node:path';import sharp from 'sharp';
const out=process.argv[2],m=JSON.parse(fs.readFileSync(out+'/directional-art.json')),es=Object.values(m.entries);
const cw=128,ch=150;
for(let start=0;start<es.length;start+=8){const part=es.slice(start,start+8),tiles=[],neutral=[];
 for(const [row,e]of part.entries()){
  const label=Buffer.from(`<svg width="1536" height="22"><text x="6" y="17" font-size="14" fill="white" font-family="Arial">${e.assetId} ${e.name} : SIDE / FRONT / BACK — phases 0, 2, 4, 6 (or all four flight phases)</text></svg>`);
  tiles.push({input:label,left:0,top:row*ch});
  for(const[vi,vn]of ['side','front','back'].entries()){
   const v=e.views[vn];for(let phase=0;phase<4;phase++){const f=v.frames===8?phase*2:phase;const buf=await sharp(path.join(out,v.sheet)).extract({left:f%v.cols*v.cell,top:Math.floor(f/v.cols)*v.cell,width:v.cell,height:v.cell}).resize(cw,cw).flatten({background:'#253438'}).png().toBuffer();tiles.push({input:buf,left:(vi*4+phase)*cw,top:row*ch+22});}
   const buf=await sharp(path.join(out,v.still)).resize(160,160).flatten({background:'#253438'}).png().toBuffer();neutral.push({input:buf,left:vi*160,top:row*184+24});
  }
  neutral.push({input:Buffer.from(`<svg width="480" height="24"><text x="6" y="18" font-size="15" fill="white">${e.assetId} ${e.name}</text></svg>`),left:0,top:row*184});
 }
 await sharp({create:{width:cw*12,height:part.length*ch,channels:4,background:'#253438'}}).composite(tiles).png().toFile(out+`/review/all-poses-${start/8+1}.png`);
 await sharp({create:{width:480,height:part.length*184,channels:4,background:'#253438'}}).composite(neutral).png().toFile(out+`/review/neutral-${start/8+1}.png`);
}
console.log(out+' review boards '+es.length);
