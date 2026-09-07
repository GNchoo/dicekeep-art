import{loadRaw,foregroundMask}from'../../../lib/sheet.mjs';
const r=await loadRaw(process.argv[2],{background:'checkerboard'}),fg=foregroundMask(r),seen=new Uint8Array(fg.length),out=[];
const ok=p=>fg[p]&&Math.min(...r.data.subarray(p*4,p*4+3))>235&&Math.max(...r.data.subarray(p*4,p*4+3))-Math.min(...r.data.subarray(p*4,p*4+3))<15;
for(let p=0;p<fg.length;p++){if(seen[p]||!ok(p))continue;const q=[p],pts=[];seen[p]=1;while(q.length){const i=q.pop();pts.push(i);const x=i%r.W,y=Math.floor(i/r.W);for(const j of[x?i-1:-1,x<r.W-1?i+1:-1,y?i-r.W:-1,y<r.H-1?i+r.W:-1])if(j>=0&&!seen[j]&&ok(j)){seen[j]=1;q.push(j);}}if(pts.length>10){const xs=pts.map(i=>i%r.W),ys=pts.map(i=>Math.floor(i/r.W)),mid=pts[Math.floor(pts.length/2)];out.push({n:pts.length,bounds:[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs)+1,Math.max(...ys)-Math.min(...ys)+1],seed:[mid%r.W,Math.floor(mid/r.W)]});}}
console.log(JSON.stringify(out,null,2));
