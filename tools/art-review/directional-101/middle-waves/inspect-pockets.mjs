// Read-only candidate inventory. Never auto-erase: source coordinates require visual review.
import{loadRaw,foregroundMask}from'../../../lib/sheet.mjs';
const raw=await loadRaw(process.argv[2],{background:'checkerboard'}),mask=foregroundMask(raw),seen=new Uint8Array(mask.length),minimum=+(process.argv[3]||100),found=[];
const candidate=p=>{if(!mask[p])return false;const rgb=raw.data.subarray(p*4,p*4+3);return Math.min(...rgb)>225&&Math.max(...rgb)-Math.min(...rgb)<15;};
for(let p=0;p<mask.length;p++){
 if(seen[p]||!candidate(p))continue;
 const q=[p];seen[p]=1;let x0=raw.W,y0=raw.H,x1=0,y1=0;
 for(let j=0;j<q.length;j++){const n=q[j],x=n%raw.W,y=Math.floor(n/raw.W);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(const n2 of[n-1,n+1,n-raw.W,n+raw.W])if(n2>=0&&n2<mask.length&&!seen[n2]&&candidate(n2)){seen[n2]=1;q.push(n2);}}
 if(q.length>=minimum)found.push({seed:[p%raw.W,Math.floor(p/raw.W)],bbox:[x0,y0,x1,y1],area:q.length});
}
console.log(JSON.stringify(found));
