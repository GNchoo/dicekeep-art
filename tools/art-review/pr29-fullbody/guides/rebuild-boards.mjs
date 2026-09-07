// Pose-reference diagrams only. These are not game artwork or runtime sprites.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../../../package.json', import.meta.url));
const sharp = require('sharp');
const outputRoot = new URL('../../../../gen/pr29-fullbody-guides/', import.meta.url);
fs.mkdirSync(outputRoot, { recursive: true });
const CW=384, CH=512, W=CW*4, H=CH*2;
const colors={near:'#009fbd',far:'#eb8424',nearFore:'#009fbd',farFore:'#eb8424',nearHind:'#75a400',farHind:'#9461d4'};
const f=n=>Number(n.toFixed(2));
const point=p=>p.map(f).join(',');
const text=(x,y,t,size=15,fill='#334155',weight=500)=>`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${t}</text>`;
const path=(d,color,width=11)=>`<path d="${d}" fill="none" stroke="#34404b" stroke-width="${width+4}" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
const dot=(p,color,r=5)=>`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${r}" fill="#f8fafc" stroke="${color}" stroke-width="3"/>`;
function ik(hip,ankle,l1,l2,bend){const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],d=Math.hypot(dx,dy);if(d>=l1+l2||d<=Math.abs(l1-l2))throw Error('unreachable guide pose');const a=(l1*l1-l2*l2+d*d)/(2*d),h=Math.sqrt(l1*l1-a*a);return[hip[0]+a*dx/d-bend*h*dy/d,hip[1]+a*dy/d+bend*h*dx/d];}
function foot(ankle,deg,color,contact){const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);const local=[[-10,-2],[9,0],[28,7],[30,13],[-15,13],[-17,8]];const p=local.map(([x,y])=>[ankle[0]+x*c-y*s,ankle[1]+x*s+y*c]);let out=`<path d="M${p.map(point).join('L')}Z" fill="${color}" stroke="#34404b" stroke-width="2.5"/>`;if(contact){const q=p.reduce((a,b)=>b[1]>a[1]?b:a);out+=`<circle cx="${f(q[0])}" cy="${f(q[1])}" r="4" fill="${color}"/>`;}return out;}
function floor(y){return`<path d="M22 ${y}H362" stroke="#94a3b8" stroke-width="2"/><path d="M22 ${y+7}H362" stroke="#e2e8f0" stroke-width="1"/>`;}
function cell(i,label,sub,art,legend){return`<g transform="translate(${i%4*CW} ${Math.floor(i/4)*CH})"><rect width="384" height="512" fill="#f8fafc" stroke="#cbd5e1"/>${text(18,31,String(i+1),26,'#0f172a',700)}${text(54,30,label,16,'#0f172a',700)}${text(18,57,sub,13)}<path d="M321 49H356l-7-5m7 5-7 5" fill="none" stroke="#64748b" stroke-width="2"/>${art}${legend}</g>`;}
const bipedLegend=`${text(20,490,'● NEAR',13,colors.near,700)}${text(127,490,'● FAR',13,colors.far,700)}${text(224,490,'GRAY = pelvis',12,'#64748b')}`;
const labels=[['NEAR forward','Near heel lands; far toe remains behind'],['NEAR support','Near leg supports; far heel lifts behind'],['NEAR straight support','Far knee passes the straight support leg'],['NEAR back toe','Near toe pushes; far leg extends forward'],['FAR forward','Far heel lands; near toe remains behind'],['FAR support','Far leg supports; near heel lifts behind'],['FAR straight support','Near knee passes the straight support leg'],['FAR back toe','Far toe pushes; near leg extends forward']];
const shapes=[
  {support:[38,0,-10],swing:[-38,0,18]},
  {support:[18,0,0],swing:[-34,34,22]},
  {support:[0,0,0],swing:[-3,23,2]},
  {support:[-34,0,18],swing:[30,8,-10]},
];
function biped(i){const phase=i%4,nearSupports=i<4,pose=shapes[phase],ground=452,l1=79,l2=76,reach=Math.sqrt(l1*l1+l2*l2-2*l1*l2*Math.cos(168*Math.PI/180));
  const ankleFor=(x,entry)=>{const [dx,lift,deg]=entry,a=deg*Math.PI/180;const bottom=Math.max(...[[-10,-2],[9,0],[28,7],[30,13],[-15,13],[-17,8]].map(([x,y])=>x*Math.sin(a)+y*Math.cos(a)));return[x+dx,ground-lift-bottom];};
  const supportAnkle=ankleFor(252,pose.support),hy=supportAnkle[1]-Math.sqrt(reach*reach-pose.support[0]*pose.support[0]);
  const legs=['far','near'].map(id=>{const active=(id==='near')===nearSupports,entry=active?pose.support:pose.swing,hip=[id==='near'?257:247,hy],ankle=ankleFor(hip[0],entry),knee=ik(hip,ankle,l1,l2,-1);return{id,hip,ankle,knee,entry,active};});
  const leg=l=>path(`M${point(l.hip)}L${point(l.knee)}L${point(l.ankle)}`,colors[l.id],11)+dot(l.knee,colors[l.id],5)+dot(l.ankle,colors[l.id],3.5)+foot(l.ankle,l.entry[2],colors[l.id],l.entry[1]===0);
  const armSwing=pose.support[0]*(nearSupports?1:-1)*.65;
  const body=`<path d="M249 ${hy-145}V${hy-7}" stroke="#64748b" stroke-width="8"/><ellipse cx="248" cy="${hy-102}" rx="29" ry="41" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/><path d="M225 ${hy-120}Q248 ${hy-130} 272 ${hy-118}M222 ${hy-106}Q248 ${hy-116} 275 ${hy-104}M224 ${hy-92}Q248 ${hy-102} 273 ${hy-90}" fill="none" stroke="#94a3b8" stroke-width="3"/>${path(`M250 ${hy-135}L${250-armSwing*.7} ${hy-95}L${253-armSwing} ${hy-58}`,'#b7c1cb',7)}<path d="M245 ${hy-151}L245 ${hy-173}" stroke="#64748b" stroke-width="7"/><path d="M225 ${hy-179}Q217 ${hy-222} 247 ${hy-226}Q277 ${hy-228} 281 ${hy-201}L290 ${hy-193}L280 ${hy-189}L277 ${hy-174}L253 ${hy-169}L246 ${hy-179}Z" fill="#e2e8f0" stroke="#64748b" stroke-width="3"/><circle cx="268" cy="${hy-202}" r="5" fill="#64748b"/><path d="M258 ${hy-176}H277" stroke="#64748b" stroke-width="2"/><ellipse cx="252" cy="${hy-4}" rx="21" ry="13" fill="#aebbc8" stroke="#64748b" stroke-width="3"/>`;
  return floor(ground)+`<g transform="translate(-60 0)">${leg(legs[0])}${body}${leg(legs[1])}<ellipse cx="252" cy="${hy-6}" rx="17" ry="8" fill="#aebbc8" stroke="#64748b" stroke-width="2"/></g>`;
}
function svg(cells){return`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${cells.join('')}</svg>`;}
async function save(name,s){fs.writeFileSync(new URL(name+'.svg',outputRoot),s);await sharp(Buffer.from(s)).png().toFile(fileURLToPath(new URL(name+'.png',outputRoot)));console.log(fileURLToPath(new URL(name+'.png',outputRoot)));}
await save('sprite8-guide',svg(labels.map(([label,sub],i)=>cell(i,label,sub,biped(i),bipedLegend))));

const quadLegend=[['nearFore','NEAR FORE',14],['farFore','FAR FORE',109],['nearHind','NEAR HIND',199],['farHind','FAR HIND',295]].map(([id,t,x])=>text(x,490,t,10.5,colors[id],700)).join('');
const quadDefs=[{id:'farHind',hip:[179,252],phase:.5,bend:-1,l1:89,l2:76},{id:'farFore',hip:[342,266],phase:.25,bend:1,l1:105,l2:66},{id:'nearHind',hip:[167,252],phase:0,bend:-1,l1:89,l2:76},{id:'nearFore',hip:[331,266],phase:.75,bend:1,l1:105,l2:66}];
const quadLabels=[['NEAR HIND lands','Near fore swings forward'],['NEAR FORE prepares','Near fore advances; three feet support'],['NEAR FORE lands','Far hind lifts behind'],['FAR HIND prepares','Far hind swings forward'],['FAR HIND lands','Far fore lifts behind'],['FAR FORE prepares','Far fore swings forward'],['FAR FORE lands','Near hind lifts behind'],['NEAR HIND prepares','Near hind swings forward']];
function quad(i){const phase=i/8,duty=.65,A=40,ground=440;
  const rendered=quadDefs.map(def=>{const p=(phase+def.phase)%1,contact=p<duty,u=(p-duty)/(1-duty),dx=contact?A-2*A*p/duty:-A+A*(1-Math.cos(Math.PI*u)),lift=contact?0:32*Math.sin(Math.PI*u),hind=def.id.endsWith('Hind');const sole=[def.hip[0]+dx,ground-lift],ankle=hind?[sole[0]-18,sole[1]-58]:[sole[0]-5,sole[1]-13],knee=ik(def.hip,ankle,def.l1,def.l2,def.bend);let art=path(`M${point(def.hip)}L${point(knee)}L${point(ankle)}`,colors[def.id],13)+dot(knee,colors[def.id],5)+dot(ankle,colors[def.id],4);if(hind){const wrist=[sole[0]-4,sole[1]-14];art+=path(`M${point(ankle)}L${point(wrist)}`,colors[def.id],10)+foot(wrist,0,colors[def.id],contact);}else art+=foot(ankle,0,colors[def.id],contact);if(!contact)art+=`<path d="M${f(sole[0]-12)} ${f(ground-3)}v-12l-4 5m4-5 4 5" fill="none" stroke="${colors[def.id]}" stroke-width="2"/>`;return{...def,art};});
  const body=`<ellipse cx="240" cy="224" rx="147" ry="76" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/><path d="M103 227Q59 221 66 180" fill="none" stroke="#94a3b8" stroke-width="8" stroke-linecap="round"/><path d="M347 198Q393 166 432 191Q450 203 457 222L479 229L475 257Q451 269 427 255Q382 270 353 238Z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/><path d="M382 191L383 158L409 181" fill="#cbd5e1" stroke="#94a3b8" stroke-width="3"/><circle cx="435" cy="219" r="5" fill="#64748b"/><ellipse cx="468" cy="240" rx="8" ry="12" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/><circle cx="167" cy="252" r="9" fill="#aebbc8"/><circle cx="331" cy="266" r="9" fill="#aebbc8"/>`;
  return floor(440)+`<g transform="translate(6 110) scale(.75)">${rendered.filter(l=>l.id.startsWith('far')).map(l=>l.art).join('')}${body}${rendered.filter(l=>l.id.startsWith('near')).map(l=>l.art).join('')}</g>`;
}
await save('sprite8-quad-guide',svg(quadLabels.map(([label,sub],i)=>cell(i,label,sub,quad(i),quadLegend))));
