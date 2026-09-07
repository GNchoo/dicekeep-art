import fs from 'node:fs';
const d='tools/art-review/directional-101/middle-waves/',f=d+'parts-jobs.json',jobs=JSON.parse(fs.readFileSync(f)),entries=JSON.parse(fs.readFileSync(d+'jobs.json')).flatMap(j=>j.entries),template=jobs.find(j=>j.id==='t6-doll-side-front-parts').prompt;
for(const [base,ids,reference]of [['t4-boss-01',['b040','b040-2'],'t4-boss-01-turnaround-clean.png'],['t5-boss-01',['b050','b050-2'],'t5-boss-01-turnaround.png']])for(const view of ['side','front','back']){
 const id=base+'-'+view+'-parts';if(jobs.some(j=>j.id===id))continue;
 const orientation=view==='side'?'Pure RIGHT-FACING profile: face, torso and BOTH boot toes point RIGHT.':view==='front'?'True FRONT, looking at viewer. Both boots have short front toes toward page bottom.':'True REAR: back of head, backplate/rear cloak, no eyes or face, both boots show heels with vertical back seams. Shield/weapon hands stay physically consistent with reference.';
 const rows=ids.map(assetId=>({assetId,view}));
 const prompt=template.split('ROW1 only:')[0]+rows.map((r,i)=>'ROW '+(i+1)+' ONLY: '+entries.find(e=>e.assetId===r.assetId).description+' '+orientation).join('\n')+'\n'+template.slice(template.indexOf('Very wide empty gutters'))+' Boss-quality source detail at landscape1536x1024 with exactly TWO rows. Keep capes ending at upper thigh; long cloak lower panels must NOT hide animated knees. Golem components each have one stone upper thigh, one centered hinge knee, one ankle and one massive whole foot, never paired legs.';
 jobs.push({id,kind:'parts',assetIds:ids,rows,reference,prompt});fs.writeFileSync(d+'prompts/'+id+'.txt',prompt+'\n');
}
fs.writeFileSync(f,JSON.stringify(jobs,null,2)+'\n');console.log(jobs.length);
