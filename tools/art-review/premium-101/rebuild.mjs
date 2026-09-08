import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const dir=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(dir,'../../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const requested=process.argv.slice(2),themes=requested.length?requested:['royal','frost','ember'];
const sourceLock=JSON.parse(fs.readFileSync(path.join(dir,'source-lock.json'),'utf8'));
for(const [file,expected]of Object.entries(sourceLock))if(sha(fs.readFileSync(path.join(dir,file)))!==expected)throw Error('Unreviewed source hash: '+file);
const names=['궁수 망루','쌍포 요새','마력 결정탑','서리 제어탑','번개 봉화','주사위 투석성','천문 관측탑','쌍종 성문','해시계','나침반','삼단 보루','마법 서고','수호자 성채','구체 온실','부유 왕관','사첨탑 궁정','진자 관문','천체 궁전','차원 고리','황제 성채'];
const configs={royal:{file:'royal-towers-keyed.png',cols:[0,225,450,673,899,1122],rows:[0,303,615,945,1402],key:'magenta'},frost:{cols:[0,222,445,669,890,1108],rows:[0,320,640,976,1419],key:'magenta'},ember:{cols:[0,222,445,669,890,1108],rows:[0,322,650,974,1419],key:'magenta'}};
fs.mkdirSync(path.join(dir,'evidence'),{recursive:true});

// Sheet segmentation only: preserve generated color/art, remove reviewed background.
// Neutral pixels are flood-filled from cell borders, never globally erased from ivory buildings.
function key(data,w,h,mode){
  const out=Buffer.from(data),seen=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;
  const candidate=p=>{const i=p*4,r=data[i],g=data[i+1],b=data[i+2];return data[i+3]<8||(mode==='magenta'?Math.min(r,b)>230&&g<35&&Math.abs(r-b)<25:Math.min(r,g,b)>185&&Math.max(r,g,b)-Math.min(r,g,b)<22);};
  const push=p=>{if(!seen[p]){seen[p]=1;if(candidate(p)){q[tail++]=p;out.fill(0,p*4,p*4+4);}}};
  if(mode==='magenta'){for(let p=0;p<w*h;p++)push(p);}else{for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}}
  while(head<tail){const p=q[head++],x=p%w,y=Math.floor(p/w);if(x)push(p-1);if(x<w-1)push(p+1);if(y)push(p-w);if(y<h-1)push(p+w);}
  // Feather chroma-contaminated exterior edges with alpha instead of leaving a pink outline.
  if(mode==='magenta'){
    const removed=Uint8Array.from({length:w*h},(_,p)=>out[p*4+3]===0?1:0);
    for(let p=0;p<w*h;p++){
      const i=p*4;if(!out[i+3])continue;const spill=Math.min(data[i],data[i+2])-data[i+1];
      if(spill<=45||Math.abs(data[i]-data[i+2])>=60)continue;
      let edge=false;const x=p%w,y=Math.floor(p/w);
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&removed[(y+dy)*w+x+dx])edge=true;
      if(!edge)continue;
      // Estimate the foreground color from nearby opaque art, then solve the
      // chroma compositing equation P=aF+(1-a)B. This retains violet crystals
      // instead of globally keying every purple pixel.
      let best=null;
      for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
        const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;const z=(yy*w+xx)*4;
        if(removed[yy*w+xx]||Math.min(data[z],data[z+2])-data[z+1]>45&&Math.abs(data[z]-data[z+2])<60)continue;
        const f=[data[z],data[z+1],data[z+2]],bg=[250,2,252];let num=0,den=0;
        for(let k=0;k<3;k++){num+=(data[i+k]-bg[k])*(f[k]-bg[k]);den+=(f[k]-bg[k])**2;}
        const a=Math.max(0,Math.min(1,num/(den||1)));let error=0;for(let k=0;k<3;k++)error+=(data[i+k]-(a*f[k]+(1-a)*bg[k]))**2;
        const score=error+(dx*dx+dy*dy)*2;if(!best||score<best.score)best={f,a,error,score};
      }
      if(best&&best.error<1800){for(let k=0;k<3;k++)out[i+k]=best.f[k];out[i+3]=Math.round(255*best.a);}
    }
  }
  return out;
}
const material=fs.readFileSync(path.join(dir,'sources/materials.png'));
const mm=await sharp(material).metadata();if(mm.width!==mm.height*3)throw Error('Expected exact three-square material sheet');
const manifest={version:101,generator:'builtin-image_gen',actualGenerationCalls:5,cost:null,costNote:'The builtin generator did not return monetary cost. Includes one background correction to preserve ivory highlights.',materialSource:{path:'sources/materials.png',sha256:sha(material),width:mm.width,height:mm.height},themes:{}};
for(const theme of themes){
  const file=path.join(dir,'sources',configs[theme]?.file||theme+'-towers.png');if(!fs.existsSync(file))throw Error('Missing '+file);
  const source=fs.readFileSync(file),meta=await sharp(source).metadata();
  const cfg=configs[theme];if(!cfg)throw Error('Review actual sheet gutters and add extraction config for '+theme);
  if(meta.width!==cfg.cols.at(-1)||meta.height!==cfg.rows.at(-1))throw Error('Unreviewed source dimensions for '+theme);
  const outputs=path.join(repo,'casual/towers/skins',theme),matdir=path.join(repo,'dice/skins',theme);fs.mkdirSync(outputs,{recursive:true});fs.mkdirSync(matdir,{recursive:true});
  const mat=await sharp(material).extract({left:['royal','frost','ember'].indexOf(theme)*mm.height,top:0,width:mm.height,height:mm.height}).resize(512,512).png({compressionLevel:9}).toBuffer();fs.writeFileSync(path.join(matdir,'material-v101.png'),mat);
  const records=[],layers=[];
  const full=await sharp(source).ensureAlpha().raw().toBuffer();
  const keyed=key(full,meta.width,meta.height,cfg.key);
  const rowColumns=cfg.rows.slice(0,-1).map((top,row)=>{
    const count=new Int32Array(meta.width);for(let y=top;y<cfg.rows[row+1];y++)for(let x=0;x<meta.width;x++)if(keyed[(y*meta.width+x)*4+3]>28)count[x]++;
    return [0,...[1,2,3,4].map(col=>{
      const center=meta.width*col/5,min=Math.max(1,Math.round(center-60)),max=Math.min(meta.width-2,Math.round(center+60));
      const runs=[];let start=-1;for(let x=min;x<=max+1;x++){if(x<=max&&count[x]===0){if(start<0)start=x;}else if(start>=0){runs.push([start,x-1]);start=-1;}}
      if(!runs.length)return cfg.cols[col];
      runs.sort((a,b)=>Math.abs((a[0]+a[1])/2-center)-Math.abs((b[0]+b[1])/2-center));return Math.round((runs[0][0]+runs[0][1])/2);
    }),meta.width];
  });
  // Assign whole connected components to cells. Generated rows have non-uniform
  // gutters: cutting on a nominal row line can truncate a pinnacle or import its
  // tip into the neighboring tower. Component assignment preserves the whole art.
  const groups=Array.from({length:20},()=>[]),seen=new Uint8Array(meta.width*meta.height),queue=new Int32Array(seen.length);
  let droppedNoisePixels=0;
  for(let seed=0;seed<seen.length;seed++){
    if(seen[seed]||keyed[seed*4+3]<=28)continue;
    let head=0,tail=1,x0=meta.width,y0=meta.height,x1=0,y1=0;queue[0]=seed;seen[seed]=1;
    while(head<tail){const p=queue[head++],x=p%meta.width,y=Math.floor(p/meta.width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=meta.width||yy<0||yy>=meta.height)continue;const z=yy*meta.width+xx;if(!seen[z]&&keyed[z*4+3]>28){seen[z]=1;queue[tail++]=z;}}
    }
    if(tail<8){droppedNoisePixels+=tail;continue;}
    const cx=(x0+x1)/2,cy=(y0+y1)/2,row=Math.min(3,cfg.rows.findIndex((v,i)=>i>0&&cy<v)-1),cols=rowColumns[Math.max(0,row)],col=Math.min(4,cols.findIndex((v,i)=>i>0&&cx<v)-1),group=groups[Math.max(0,row)*5+Math.max(0,col)];
    for(let n=0;n<tail;n++)group.push(queue[n]);
  }
  for(let n=0;n<20;n++){
    const col=n%5,row=Math.floor(n/5),cols=rowColumns[row],nominalCell={left:cols[col],top:cfg.rows[row],width:cols[col+1]-cols[col],height:cfg.rows[row+1]-cfg.rows[row]};
    const points=groups[n];if(!points.length)throw Error('Missing component group '+theme+':'+n);
    let gx0=meta.width,gy0=meta.height,gx1=0,gy1=0;for(const p of points){const x=p%meta.width,y=Math.floor(p/meta.width);gx0=Math.min(gx0,x);gy0=Math.min(gy0,y);gx1=Math.max(gx1,x);gy1=Math.max(gy1,y);}
    const roi={left:Math.max(0,gx0-4),top:Math.max(0,gy0-4),width:Math.min(meta.width,gx1+5)-Math.max(0,gx0-4),height:Math.min(meta.height,gy1+5)-Math.max(0,gy0-4)},info={width:roi.width,height:roi.height};
    const clean=Buffer.alloc(info.width*info.height*4);
    for(const p of points){const x=p%meta.width-roi.left,y=Math.floor(p/meta.width)-roi.top;keyed.copy(clean,(y*info.width+x)*4,p*4,p*4+4);}
    let x0=info.width,y0=info.height,x1=-1,y1=-1,opaque=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(clean[(y*info.width+x)*4+3]>28){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);opaque++;}
    if(opaque<100)throw Error('Empty sprite '+theme+':'+(n+1));
    const touches=x0===0||y0===0||x1===info.width-1||y1===info.height-1;
    const crop={left:x0,top:y0,width:x1-x0+1,height:y1-y0+1};
    const k=Math.min(328/crop.width,352/crop.height),width=Math.round(crop.width*k),height=Math.round(crop.height*k);
    const piece=await sharp(clean,{raw:{width:info.width,height:info.height,channels:4}}).extract(crop).resize(width,height).png().toBuffer();
    const png=await sharp({create:{width:384,height:384,channels:4,background:'#00000000'}}).composite([{input:piece,left:Math.round((384-width)/2),top:376-height}]).png({compressionLevel:9}).toBuffer();
    const relative='casual/towers/skins/'+theme+'/t'+String(n+1).padStart(2,'0')+'.png';fs.writeFileSync(path.join(repo,relative),png);
    records.push({star:n+1,name:names[n],path:relative,sha256:sha(png),bytes:png.length,nominalCell,sourceCell:roi,sourceCrop:crop,touchesCell:touches,opaqueSourcePixels:opaque,footY:376,foreground:{left:Math.round((384-width)/2),top:376-height,width,height}});
    const tile=await sharp(png).resize(180,180).png().toBuffer();layers.push({input:tile,left:col*200+10,top:row*218+28});
  }
  const labels=Buffer.from(`<svg width="1000" height="872">${records.map((r,i)=>`<text x="${i%5*200+100}" y="${Math.floor(i/5)*218+22}" text-anchor="middle" fill="#e8dfcd" font-family="sans-serif" font-size="16">${theme.toUpperCase()} ${r.star}</text>`).join('')}</svg>`);
  await sharp({create:{width:1000,height:872,channels:4,background:'#26343f'}}).composite([...layers,{input:labels,left:0,top:0}]).png().toFile(path.join(dir,'evidence',theme+'-towers.png'));
  manifest.themes[theme]={source:{path:'sources/'+path.basename(file),sha256:sha(source),width:meta.width,height:meta.height,realAlpha:meta.hasAlpha,key:cfg.key,droppedNoisePixels},material:{path:'dice/skins/'+theme+'/material-v101.png',sha256:sha(mat),bytes:mat.length,size:[512,512]},towers:records};
  console.log(theme,JSON.stringify({towers:records.length,touches:records.filter(r=>r.touchesCell).map(r=>r.star),bytes:records.reduce((a,r)=>a+r.bytes,mat.length)}));
}
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
