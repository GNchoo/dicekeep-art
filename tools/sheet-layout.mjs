// Normalize reviewed, uneven AI atlas gutters before sheet-split.
// Explicit row cuts are reviewed source metadata; column cuts must fall in empty gutters.
// node tools/sheet-layout.mjs <source> --row-cuts=0,320,605,915,1170,1536 --out=<png>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadRaw, analyzeCell, positiveInteger, readBackgroundSeeds } from './lib/sheet.mjs';
const args = process.argv.slice(2);
const opt = (key, fallback) => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const file = args.find(a => !a.startsWith('--'));
if (!file) throw new Error('source PNG required');
const raw = await loadRaw(file, { background: opt('background', 'checkerboard'), backgroundSeeds: readBackgroundSeeds(opt('background-seeds'),file) });
const cols = positiveInteger(+opt('cols', 4), 'cols');
const cell = positiveInteger(+opt('cell', 384), 'cell');
const cuts = opt('row-cuts', `0,${raw.H}`).split(',').map(Number);
if (cuts[0] !== 0 || cuts.at(-1) !== raw.H || cuts.some((n,i) => !Number.isInteger(n) || (i && n <= cuts[i-1]))) throw new Error('row cuts must increase from 0 to source height');
const all = analyzeCell(raw, 0, 0, raw.W, raw.H, { clean: false });
const keep = all.mask.keep;
const horizontal = Array.from({length:raw.H}, (_, y) => {
  let n=0; for(let x=0;x<raw.W;x++) n+=keep[y*raw.W+x]; return n;
});
if(args.includes('--inspect')) {
  const runs=[]; let first=-1;
  for(let y=0;y<=raw.H;y++){if(y<raw.H && !horizontal[y]){if(first<0)first=y;}else if(first>=0){if(y-first>=3)runs.push([first,y]);first=-1;}}
  console.log(JSON.stringify({width:raw.W,height:raw.H,emptyRows:runs}));
  process.exit(0);
}
for (const y of cuts.slice(1,-1)) if(horizontal[y] || horizontal[y-1]) throw new Error(`row boundary ${y} cuts artwork`);
const selected=opt('select-rows',Array.from({length:cuts.length-1},(_,i)=>i+1).join(',')).split(',').map(Number);
if(new Set(selected).size!==selected.length || selected.some(n=>!Number.isInteger(n)||n<1||n>=cuts.length))throw new Error('select-rows must list unique source rows');
const layers=[], report=[];
for(let row=0;row<cuts.length-1;row++) {
  if(!selected.includes(row+1))continue;
  const targetRow=selected.indexOf(row+1);
  const y0=cuts[row], y1=cuts[row+1];
  const vertical=Array.from({length:raw.W},(_,x)=>{let n=0;for(let y=y0;y<y1;y++)n+=keep[y*raw.W+x];return n;});
  const xs=[0];
  for(let c=1;c<cols;c++) {
    const nominal=raw.W*c/cols, radius=raw.W/cols*.18;
    const candidates=[];
    for(let x=Math.ceil(nominal-radius);x<=Math.floor(nominal+radius);x++) if(!vertical[x] && !vertical[x-1]) candidates.push(x);
    if(!candidates.length) throw new Error(`row ${row+1} column ${c} has no empty gutter; regenerate source`);
    candidates.sort((a,b)=>Math.abs(a-nominal)-Math.abs(b-nominal)); xs.push(candidates[0]);
  }
  xs.push(raw.W);
  const frames=[];
  for(let c=0;c<cols;c++) {
    const s=analyzeCell(raw,xs[c],y0,xs[c+1]-xs[c],y1-y0,{clean:false});
    if(!s.n) throw new Error(`empty row ${row+1} frame ${c+1}`);
    const rgba=Buffer.alloc(s.w*s.h*4);
    for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){
      const ox=s.x0+x,oy=s.y0+y,src=(oy*raw.W+ox)*4,dst=(y*s.w+x)*4;
      if(keep[oy*raw.W+ox])raw.data.copy(rgba,dst,src,src+4);
    }
    frames.push({s,rgba});
  }
  // One scale per character preserves the artist's relative poses for stabilization.
  const scale=Math.min(1.5,cell*.72/Math.max(...frames.flatMap(({s})=>[s.w,s.h])));
  for(let c=0;c<cols;c++){
    const {s,rgba}=frames[c],w=Math.max(1,Math.round(s.w*scale)),h=Math.max(1,Math.round(s.h*scale));
    const input=await sharp(rgba,{raw:{width:s.w,height:s.h,channels:4}}).resize(w,h).png().toBuffer();
    layers.push({input,left:c*cell+Math.floor((cell-w)/2),top:targetRow*cell+Math.floor((cell-h)/2)});
  }
  report.push({row:row+1,y:[y0,y1],x:xs,scale,frames:frames.map(({s})=>({width:s.w,height:s.h,area:s.n}))});
}
const out=opt('out'); if(!out)throw new Error('--out required');
fs.mkdirSync(path.dirname(out),{recursive:true});
await sharp({create:{width:cols*cell,height:selected.length*cell,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toFile(out);
fs.writeFileSync(out+'.json',JSON.stringify({source:path.basename(file),cuts,selected,cols,cell,report},null,2)+'\n');
console.log(JSON.stringify({out,report}));
