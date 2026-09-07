import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const catalog=JSON.parse(fs.readFileSync(path.join(dir,'../production-catalog.json'),'utf8'));
const groups=[
 ['t4-biped-01',['w031','w033','w034','w035']],['t4-biped-02',['w037','w038','w039']],
 ['t4-flight-01',['w032','w036']],['t4-boss-01',['b040','b040-2']],
 ['t5-biped-01',['w041','w042','w045','w046']],['t5-biped-02',['w047','w049']],
 ['t5-mounts-01',['w043','w044','w048']],['t5-boss-01',['b050','b050-2']],
 ['t6-biped-01',['w051','w053','w055','w057']],['t6-misc-01',['w054','w056','w058']],
 ['t6-float-01',['w052','w059']],['t6-boss-01',['b060','b060-2']],
];
const style='Hand-painted fantasy tower-defense game illustration: chunky readable character proportions, expressive friendly-determined faces, crisp dark contours, broad color areas, soft painterly shading, clean intact clothing and surfaces. Moderately stylized game characters, not realistic horror. Smooth toy-like ivory skeleton bones. NO gore, blood, wounds, rot, exposed tissue, grotesque anatomy or photorealism.';
const layout='Exactly THREE evenly spaced columns: LEFT pure RIGHT-facing side profile; MIDDLE true FRONT facing viewer, feet toward screen bottom; RIGHT true BACK facing away, back of head/costume, heels visible, no eyes or face. Same individual, equipment, proportions and color across each row. Full intact neutral standing body with softly extended knees, no crouch; flying creatures floating with wings half-open and feet tucked. Each figure entirely inside its own cell with generous empty gutters, no contact between neighbors. Slightly elevated15-degree game camera throughout. No text, labels, gridlines, pedestal, cast shadow, scenery or floor. GENUINE TRANSPARENT ALPHA background; do not paint checkerboard.';
const jobs=groups.map(([id,assetIds])=>{
 const entries=assetIds.map(id=>catalog.entries.find(e=>e.assetId===id));
 if(entries.some(e=>!e||e.wave<31||e.wave>60))throw Error('outside assigned roster');
 const prompt=`Use case: stylized-concept. Asset: full-body character turnaround atlas, not a walking animation or separated parts. Create ONE ${entries.length>=3?'tall portrait':'landscape'} image with exactly ${entries.length} equal-height horizontal rows and three columns. ${layout}\n${style}\n`+entries.map((e,i)=>`ROW ${i+1} ONLY: ${e.description}`).join('\n')+'\nNo additional characters or inset pieces. All twelve/nine/six figures as applicable remain whole and cleanly separated.';
 return {id:id+'-turnaround',kind:'turnaround',assetIds,prompt,entries};
});
fs.mkdirSync(path.join(dir,'prompts'),{recursive:true});
for(const job of jobs)fs.writeFileSync(path.join(dir,'prompts',job.id+'.txt'),job.prompt+'\n');
fs.writeFileSync(path.join(dir,'jobs.json'),JSON.stringify(jobs,null,2)+'\n');
if(process.argv[2])console.log(JSON.stringify(jobs.find(j=>j.id===process.argv[2])));else console.log(JSON.stringify(jobs.map(({id,assetIds})=>({id,assetIds}))));
