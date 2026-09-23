// Move existing transparent ImageGen parts into separated rectangular ROIs.
// Pixel membership comes from authored alpha, never from black background color.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = path.dirname(fileURLToPath(import.meta.url));
const cutoff = 28; // exactly the foreground threshold in tools/lib/sheet.mjs
for (const view of ['side','front','back']) {
  const input=path.join(dir,`w004-${view}-puppet-casual-source.png`), output=path.join(dir,`w004-${view}-puppet-casual-atlas.png`);
  const { data, info }=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height,channels}=info;
  if(width!==1536||height!==1024||channels!==4) throw new Error(`${view}: unexpected dimensions`);
  for(const [x,y] of [[0,0],[width-1,0],[0,height-1],[width-1,height-1]]) if(data[(y*width+x)*4+3]>cutoff) throw new Error(`${view}: opaque corner`);
  const labels=new Uint8Array(width*height),stack=new Int32Array(width*height),comps=[];
  for(let start=0;start<labels.length;start++) {
    if(labels[start]||data[start*4+3]<=cutoff) continue;
    const label=comps.length+1; if(label>255) throw new Error('too many components');
    let n=0,count=0,x0=width,y0=height,x1=0,y1=0;
    stack[n++]=start;labels[start]=label;
    while(n){const p=stack[--n],x=p%width,y=Math.floor(p/width);count++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      for(const q of [x?p-1:-1,x+1<width?p+1:-1,y?p-width:-1,y+1<height?p+width:-1]) if(q>=0&&!labels[q]&&data[q*4+3]>cutoff){labels[q]=label;stack[n++]=q;}
    }
    if(count>1000) comps.push({label,count,x0,y0,x1,y1});
  }
  const body=comps.find(c=>c.x0<800),wings=comps.filter(c=>c.x0>=800).sort((a,b)=>a.y0-b.y0);
  if(comps.length!==3||!body||wings.length!==2) throw new Error(`${view}: expected one body and two separate wings`);
  const W=2048,H=1200,dst=Buffer.alloc(W*H*4);
  const placed=[{...body,dx:body.x0,dy:body.y0,mirror:false},
    {...wings[0],dx:1050,dy:20,mirror:false},
    {...wings[1],dx:1050,dy:620,mirror:true}];
  for(const c of placed){const cw=c.x1-c.x0+1,ch=c.y1-c.y0+1;if(c.dx+cw>=W||c.dy+ch>=H)throw new Error(`${view}: packed part out of bounds`);
    for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){const p=y*width+x;if(labels[p]!==c.label)continue;
      const ox=c.dx+(c.mirror?c.x1-x:x-c.x0),oy=c.dy+y-c.y0;data.copy(dst,(oy*W+ox)*4,p*4,p*4+4);}
  }
  await sharp(dst,{raw:{width:W,height:H,channels:4}}).png({compressionLevel:9}).toFile(output);
  fs.writeFileSync(output.replace(/\.png$/,'.components.json'),JSON.stringify({source:path.basename(input),alphaCutoff:cutoff,pieces:placed.map(({label,count,x0,y0,x1,y1,dx,dy,mirror})=>({label,count,sourceBounds:[x0,y0,x1-x0+1,y1-y0+1],outputBounds:[dx,dy,x1-x0+1,y1-y0+1],mirror}))},null,2)+'\n');
  console.log(view,output);
}
