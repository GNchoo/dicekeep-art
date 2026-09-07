import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(dir,'../../..');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(repo,'content.js'),'utf8'),ctx);
const monsters=ctx.window.DKCONTENT.INFINITY.monsters;
const roster=JSON.parse(fs.readFileSync(path.join(repo,'tools/inf-roster.json'),'utf8'));
const briefs=JSON.parse(fs.readFileSync(path.join(dir,'design-briefs.json'),'utf8'));
const bossGaits={10:['biped'],20:['biped','quad'],30:['biped','fly'],40:['biped','biped'],50:['biped','biped'],60:['float','fly'],70:['float','float'],80:['fly','quad'],90:['biped','biped'],100:['biped','fly']};
const family=(wave,gait)=>{
 if(wave===8)return 'insect-swarm';
 if([25,26,28].includes(wave))return 'arthropod';
 if(wave===56)return 'glove';
 if(wave===43)return 'mounted-quad';
 if([23,27,71].includes(wave))return 'reptile';
 if(wave===22)return 'toad';
 if([36,44,48].includes(wave))return 'flying-mount';
 if(wave===32)return 'glider';
 if(wave===68)return 'book';
 if([24,62].includes(wave))return 'insect-wings';
 if([4,12,16,64,96].includes(wave))return 'bird';
 if(gait==='fly')return 'bat-wings';
 return gait;
};
const entries=[];
for(let wave=1;wave<=101;wave++){
 const m=monsters[wave],r=roster[wave];
 const roles=m.boss?(m.second?['boss','secondary']:['boss']):['normal'];
 roles.forEach((role,k)=>{
  const assetId=(m.boss?'b':'w')+String(wave).padStart(3,'0')+(k?'-2':'');
  const gait=m.boss?bossGaits[wave][k]:r.gait;
  const kit=m.boss?gait:family(wave,gait);
  entries.push({assetId,wave,role,name:k?m.second:m.name,tier:m.tier,cls:m.cls,gait,locomotion:gait==='fly'?'flight':['slither','float'].includes(gait)?gait:'legged',family:kit,description:m.boss?briefs.bosses[assetId]:(briefs.normal[wave]||r.desc),existingSide:wave<10,frames:['fly','float'].includes(gait)?4:8});
 });
}
if(entries.length!==110||entries.some(x=>!x.description))throw new Error('Expected110completeidentitybriefs');
const groups=[];
const buckets=new Map();
for(const e of entries){
 const key='t'+e.tier+'-'+(e.role==='normal'?e.family:'boss');
 if(!buckets.has(key))buckets.set(key,[]);
 buckets.get(key).push(e);
}
for(const [key,rows]of buckets){
 const max=rows[0].role==='normal'?4:2;
 for(let n=0;n<rows.length;n+=max)groups.push({id:key+'-'+String(n/max+1).padStart(2,'0'),assetIds:rows.slice(n,n+max).map(x=>x.assetId),maxRows:max,status:'pending'});
}
fs.writeFileSync(path.join(dir,'production-catalog.json'),JSON.stringify({version:93,entries,groups},null,2)+'\n');
console.log(JSON.stringify({entries:entries.length,newEntries:entries.filter(x=>x.wave>=11).length,groups:groups.length,byFamily:Object.fromEntries([...new Set(entries.map(e=>e.family))].map(f=>[f,entries.filter(e=>e.family===f).length]))}));
