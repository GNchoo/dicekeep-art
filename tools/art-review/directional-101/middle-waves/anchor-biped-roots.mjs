import fs from 'node:fs';
import {loadRaw} from '../../../lib/sheet.mjs';
import {extractPart} from '../../../rig-walk.mjs';
const dir='tools/art-review/directional-101/middle-waves';
for(const name of fs.readdirSync(dir).filter(f=>f.endsWith('-rigs.json')&&!['production-rigs.json','float-rigs.json'].includes(f))){
 const file=dir+'/'+name,c=JSON.parse(fs.readFileSync(file));
 for(const e of c.entries)for(const [viewName,v] of Object.entries(e.views)){
  const parts=v.parts.filter(p=>p.type==='leg');if(parts.length!==2||!v.body.target.height)continue;
  const raw=await loadRaw(v.source,{background:v.background,backgroundSeeds:v.backgroundSeeds??[]}),body=await extractPart(raw,v.body.roi,e.assetId+'-'+viewName);
  const meanX=parts.reduce((s,p)=>s+p.socketNormalized[0],0)/parts.length;
  v.body.target.centerX=v.pivot[0]-(meanX-.5)*body.width/body.height*v.body.target.height;
  v.body.anchorReview='Fixed source translation aligns mean hip X to pivot; weapon bbox does not shift the ground root. No per-frame scaling or translation.';
 }
 fs.writeFileSync(file,JSON.stringify(c,null,2)+'\n');
}
