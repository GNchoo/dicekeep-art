import fs from 'node:fs';
const dir='tools/art-review/directional-101/middle-waves';
const f=dir+'/float-rigs.json',c=JSON.parse(fs.readFileSync(f)),m=JSON.parse(fs.readFileSync(dir+'/measurements/float-parts.json'));
const anchors={w052:[[300,455],[770,455],[1220,455]],w059:[[300,980],[768,980],[1230,980]],b060:[[310,520],[779,520],[1255,520]]};
for(const e of c.entries)for(const[name,v]of Object.entries(e.views)){
 const i=['side','front','back'].indexOf(name),m0=m.find(x=>x.assetId===e.assetId&&x.view===name),[ax,ay]=anchors[e.assetId][i],b=m0.bounds,s=m0.scale;
 v.body.target=[256+(b[0]-ax)*s,460+(b[1]-ay)*s,b[2]*s,b[3]*s];
 v.jointReview='Explicit float locomotion. One common source-pixel scale across all views. Original source body-center anchor '+JSON.stringify([ax,ay])+' aligns to canonical pivot [256,460]; tail or bounding-box center does not recenter the character. No walking or wing claim.';
 v.reviewedSourceAnchor=[ax,ay];
}
fs.writeFileSync(f,JSON.stringify(c,null,2)+'\n');
