import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '../../..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'extraction.json'), 'utf8'));
const prompts = JSON.parse(fs.readFileSync(path.join(root, 'prompts.json'), 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const outDir = path.join(repo, 'casual/towers');
const evidence = path.join(root, 'evidence');
fs.mkdirSync(evidence, { recursive: true });

// Explicitly neutral checkerboard pixels only. Do not key magenta cosmic art.
// Flood from borders plus reviewed source-hash-guarded enclosed-gap seeds;
// never remove an interior ivory highlight merely because it is white.
function removeBackground(data, width, height, seeds) {
  const seen = new Uint8Array(width * height), background = new Uint8Array(width * height);
  const queue = new Int32Array(width * height); let head = 0, tail = 0;
  const candidate = p => { const i = p * 4; return data[i + 3] <= 28 || (Math.min(data[i], data[i+1], data[i+2]) > 185 && Math.max(data[i],data[i+1],data[i+2]) - Math.min(data[i],data[i+1],data[i+2]) < 22); };
  const push = p => { if (seen[p]) return; seen[p] = 1; if (candidate(p)) { background[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < width; x++) { push(x); push((height-1)*width+x); }
  for (let y = 0; y < height; y++) { push(y*width); push(y*width+width-1); }
  for (const [x,y] of seeds) { if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height || !candidate(y*width+x)) throw new Error('Invalid reviewed background seed '+x+','+y); push(y*width+x); }
  while (head < tail) { const p = queue[head++], x = p % width, y = Math.floor(p/width); if(x)push(p-1);if(x<width-1)push(p+1);if(y)push(p-width);if(y<height-1)push(p+width); }
  const clean = Buffer.from(data);
  for (let p=0;p<background.length;p++) if(background[p]) clean.fill(0,p*4,p*4+4);
  return { clean, removedPixels: tail };
}

const results = [], sourceRecords = [];
for (const spec of config.sources) {
  const input = fs.readFileSync(path.join(root,'sources',spec.file));
  if (sha(input) !== spec.sha256) throw new Error('Source SHA256 mismatch: '+spec.file);
  const meta = await sharp(input).metadata();
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const W=info.width,H=info.height;
  const alphaIsReal = meta.hasAlpha && data.some((v,i)=>i%4===3 && v===0);
  const processed = alphaIsReal ? {clean:data,removedPixels:0} : removeBackground(data,W,H,spec.backgroundSeeds);
  sourceRecords.push({file:'sources/'+spec.file,sha256:spec.sha256,width:W,height:H,sourceChannels:meta.channels,sourceHasRealAlpha:alphaIsReal,removedBackgroundPixels:processed.removedPixels,backgroundSeeds:spec.backgroundSeeds});
  for (let n=0;n<spec.stars.length;n++) {
    const left = (n%2)*Math.floor(W/2), top= n<2?0:spec.splitY;
    const right=n%2?W:Math.floor(W/2), bottom=n<2?(spec.splitY??H):H;
    let x0=W,y0=H,x1=0,y1=0,count=0;
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(processed.clean[(y*W+x)*4+3]>28){ x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);count++; }
    if(!count) throw new Error('Empty tower '+spec.stars[n]);
    if(x0===left||x1===right||y0===top||y1===bottom) throw new Error('Foreground touches extraction cell '+spec.stars[n]);
    const crop={left:x0,top:y0,width:x1-x0,height:y1-y0};
    const k=Math.min(config.runtime.maxWidth/crop.width,config.runtime.maxHeight/crop.height);
    const ow=Math.round(crop.width*k),oh=Math.round(crop.height*k),ox=Math.round((384-ow)/2),oy=config.runtime.footY-oh;
    const piece=await sharp(processed.clean,{raw:{width:W,height:H,channels:4}}).extract(crop).resize(ow,oh,{kernel:'lanczos3'}).png().toBuffer();
    const output=await sharp({create:{width:384,height:384,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:piece,left:ox,top:oy}]).png({compressionLevel:9}).toBuffer();
    const filename='star-'+String(spec.stars[n]).padStart(2,'0')+'.png';
    fs.writeFileSync(path.join(outDir,filename),output);
    const drawK=Math.min(70/crop.width,96/crop.height);
    const muzzle=spec.muzzles[n], actual={x:(muzzle[0]-(x0+x1)/2)*drawK,y:11-(y1-muzzle[1])*drawK};
    const record={star:spec.stars[n],name:spec.names[n],source:'sources/'+spec.file,sourceCell:{left,top,width:right-left,height:bottom-top},sourceCrop:crop,sourceMuzzle:muzzle,runtime:'casual/towers/'+filename,sha256:sha(output),bytes:output.length,runtimeSize:[384,384],runtimeForeground:{left:ox,top:oy,width:ow,height:oh},runtimeFootY:376,renderFit:{width:crop.width*drawK,height:crop.height*drawK},visualMuzzleRelativeToTower:actual,fixedShotOrigin:{x:0,y:-64},muzzleDistanceToFixedOrigin:Math.hypot(actual.x,actual.y+64),pipCount:5,pipLayout:'four corners plus center, single square face',alphaMode:alphaIsReal?'preserved-original-alpha':'neutral-background-border-flood-plus-reviewed-seeds'};
    record.emitterNormalized=[(muzzle[0]-x0)/crop.width,(muzzle[1]-y0)/crop.height];
    results.push(record);
  }
}

const svg = (width,height,body)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
async function board(name, scale, background, markers=false) {
  const columns=7,tileW=124*scale,tileH=150*scale,width=columns*tileW,height=2*tileH;
  let base=`<rect width="100%" height="100%" fill="${background}"/>`;
  const layers=[];
  for(let i=0;i<results.length;i++){
    const r=results[i],cx=(i%columns)*tileW+tileW/2,foot=(Math.floor(i/columns)+1)*tileH-20*scale;
    base+=`<text x="${cx}" y="${foot-111*scale}" fill="#bfcddc" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="${12*scale}">STAR ${r.star}</text><path d="M ${cx-45*scale} ${foot} H ${cx+45*scale}" stroke="#69798a" stroke-width="${scale}"/>`;
    const fw=Math.round(r.renderFit.width*scale),fh=Math.round(r.renderFit.height*scale);
    const input=await sharp(path.join(repo,r.runtime)).extract(r.runtimeForeground).resize(fw,fh).png().toBuffer();
    layers.push({input,left:Math.round(cx-fw/2),top:Math.round(foot-fh)});
    if(markers){const mx=cx+r.visualMuzzleRelativeToTower.x*scale,my=foot+(r.visualMuzzleRelativeToTower.y-11)*scale; base+=`<circle cx="${mx}" cy="${my}" r="${3*scale}" fill="none" stroke="#ffe166" stroke-width="${scale}"/><path d="M ${cx-4*scale} ${foot-75*scale} H ${cx+4*scale} M ${cx} ${foot-79*scale} V ${foot-71*scale}" stroke="#ff7284" stroke-width="${scale}"/>`; }
  }
  const art=await sharp(svg(width,height,`<rect width="100%" height="100%" fill="${background}"/>`)).composite(layers).png().toBuffer();
  const overlay=svg(width,height,base.replace(`<rect width="100%" height="100%" fill="${background}"/>`,''));
  await sharp(art).composite([{input:overlay}]).png().toFile(path.join(evidence,name));
}
await board('towers-actual-size.png',1,'#203443');
await board('towers-4x.png',4,'#203443');
await board('towers-alpha-light.png',2,'#ded4c5');
await board('towers-firepoint-review.png',3,'#203443',true);
const ledger=prompts.requests.map((request,index)=>{
  const name=request.key==='starlight-final'?'starlight':request.key;
  const data=fs.readFileSync(path.join(root,'sources',name+'.png'));
  return {call:index+1,key:request.key,mode:'builtin-image_gen',stars:request.stars,status:request.status,archivedOriginal:'sources/'+name+'.png',sha256:sha(data),originalGeneratedPath:request.output_hint.match(/ as (.*?\.png) by default/)?.[1]??null,promptRecord:'prompts.json#requests/'+index,references:request.references||[]};
});
fs.writeFileSync(path.join(root,'call-ledger.json'),JSON.stringify({actualCalls:ledger.length,selectedAtlases:4,runtimeTowers:14,cost:null,costNote:'Builtin tool did not provide token or monetary cost.',calls:ledger},null,2)+'\n');
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({schemaVersion:1,sourceRecords,renderContract:config.review,towers:results},null,2)+'\n');
fs.writeFileSync(path.join(root,'emitter-metadata.json'),JSON.stringify({coordinateSpace:'foreground bounding box, normalized x/y, authored manual visual center',towers:Object.fromEntries(results.map(r=>[r.star,r.emitterNormalized.map(n=>+n.toFixed(6))]))},null,2)+'\n');
console.log(JSON.stringify({count:results.length,sources:sourceRecords.map(s=>({file:s.file,width:s.width,height:s.height,alpha:s.sourceHasRealAlpha})),firepointErrors:results.map(r=>({star:r.star,errorPx:+r.muzzleDistanceToFixedOrigin.toFixed(2)}))},null,2));
