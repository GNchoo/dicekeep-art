import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {loadRaw} from '../../../lib/sheet.mjs';
import {extractPart} from '../../../rig-walk.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const source=path.join(dir,'t4-biped-01a-side-front-parts-clean.png'),raw=await loadRaw(source,{background:'checkerboard'});
const cuts=[0,420,810,1170,1536],regions=[[0,.46],[.48,.22],[.74,.26]],result=[];
fs.mkdirSync(path.join(dir,'measurements'),{recursive:true});
for(let row=0;row<4;row++)for(let col=0;col<3;col++){
 const roi=[regions[col][0],cuts[row]/raw.H,regions[col][1],(cuts[row+1]-cuts[row])/raw.H];
 const part=await extractPart(raw,roi,`row${row+1}-part${col+1}`),bytes=Buffer.from(part.image.split(',')[1],'base64');
 fs.writeFileSync(path.join(dir,'measurements',part.name+'.png'),bytes);
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const bands=[.1,.45,.5,.55,.6,.75,.8,.85,.9,.98].map(y=>{const Y=Math.floor(y*(info.height-1)),xs=[];for(let x=0;x<info.width;x++)if(data[(Y*info.width+x)*4+3]>150)xs.push(x);return{y,actualY:Y,range:xs.length?[xs[0],xs.at(-1)]:null,center:xs.length?(xs[0]+xs.at(-1))/2/info.width:null};});
 result.push({name:part.name,roi,width:part.width,height:part.height,sourceBounds:part.sourceBounds,bands});
}
fs.writeFileSync(path.join(dir,'measurements','first-parts.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
