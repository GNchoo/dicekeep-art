import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {expandConfig,sha256} from '../../lib/directional-rig.mjs';
import {loadRaw} from '../../lib/sheet.mjs';
import {extractPart} from '../../rig-walk.mjs';
const root=process.cwd(), out='tools/art-review/extreme-202';
const old=JSON.parse(fs.readFileSync('tools/art-review/directional-101/production-catalog.json')).entries;
const audit=JSON.parse(fs.readFileSync('tools/art-review/directional-101/release-builds.json'));
const rigs={};
for(const b of audit.builds){const c=expandConfig(JSON.parse(fs.readFileSync(b.config.path)));for(const id of b.assetIds){const e=c.entries.find(e=>e.assetId===id);if(!e)throw Error(id);rigs[id]={entry:e,config:b.config.path};}}
// These nine early assets use old side-only adapters. New appearances use an
// already approved fully articulated equivalent, retaining the original logical
// enemy identity separately from the measured baseRigId.
const substitutes={w001:'w011',w002:'w053',w003:'w035',w004:'w012',w005:'w031',w006:'w017',w007:'w055',w008:'w024',w009:'w034'};
const names=`왕관 운반다람쥐|유적 서기관|보관고 문지기|왕실 전서조|열쇠 창병|청동 송곳니늑대|등불 수집가|유리날개 정찰충|왕관 철갑병|유적 왕자|보석 꼬리다람쥐|성문 수리부엉이|인장 여우|청동갑옷 오소리|왕실 지도사|문장 독수리|유적 석판늑대|별침 고슴도치|문지기 큰곰|왕관나무 섭정|톱니 바늘지렁이|서리 압력두꺼비|냉각수 도롱뇽|기계 침벌|얼음 나침반거미|서리 시계전갈|압력밸브 악어|굴착 톱니개미|청빙 관절뱀|서리 마녀기술자|냉각수 정찰병|서리 글라이더조종사|제설 방패병|빙철 도끼병|압축기 트롤|서리익 용기수|레일 활잡이|눈꽃 코볼트|기관실 작업반장|태엽 총감독|산호 방패병|씨앗 공병|다시마 기마대|연꽃 그리폰기수|조개껍질 기사|해초 종자|진주 석궁병|수련 페가수스기수|정원 굴착노움|심연 정원사왕|이끼 수호인형|해파리 정령등|산호 가면병|조개 강아지|정원 버섯관리인|장갑 씨앗정령|진주 관문기사|해초 봉제수호자|수련 노래정령|수중 도서관장|용광로 불씨정령|황동 불꽃요정|점토 공방지기|불꽃 풍향조|모루 골렘|유리 용접정령|숯검댕 고양이|살아있는 설계서|가마 수정골렘|태양 공방장|황동 비늘도마뱀|숯날개 아기용|주조소 매머드|가마 앞치마장인|증기 닭수호자|구리날개 와이번|슬래그 관절벌레|모루등 짐승|용광로 용기사|불씨 화룡감독|별가루 심부름꾼|천문대 파수견|유성 문지기|혜성 꼬리벌레|별빛 망토정령|천문 관측사|오로라 불꽃병|운석 가고일|별길 관문기사|별빛 순찰대장|천체 나침반촉수|망원 렌즈정령|별판 거인|성좌 중갑기사|월식 길잡이|별밤 전서까마귀|별핵 골렘|은하 관절벌레|운석 방패거상|별왕관 총사령관|새벽 등대사자`.split('|');
const motifs=`small rodent with a bronze crown-shaped backpack and rolled parchment|ivory ceramic face mask and copper scroll shoulder guards|round olive ogre with a rectangular vault-door chest plate|owl-like courier with brass envelope-shaped headcrest and leather harness|small green guard with key-shaped bronze spear and square padded vest|gray wolf with closed bronze tusk-shaped cheek guards and strapped stone tablet|smooth gray-green gardener with hood, lantern and intact leather tunic|rounded brass mosquito body with opaque green glass thorax, no human anatomy|olive orc in complete copper crown-emblem armor|upright rat prince in copper crown and teal tabard|brown squirrel with a ruby clasp and domed bronze helmet|brown owl with a gate-shaped brass brow piece|orange fox with wax-seal collar and simple stone circlet|gray badger with overlapping bronze shoulder scales|brown raccoon cartographer with folded map chest strap and feather cap|brown eagle with a royal pennant collar|gray wolf with inscribed stone shoulder saddle|brown hedgehog wearing a small star compass cap|brown bear with a rounded doorway shield strapped to chest|broad wooden regent with crown-shaped living branch head`.split('|');
const themeNames=['왕관 유적','서리 기계','심연 정원','잿불 공방','별빛 파수대'];
const themeBrief=['aged bronze, mossy stone accents, warm teal cloth','brushed pale steel, icy blue glass, navy quilted cloth','dark teal coral, polished shell, olive cloth and pearly lenses','aged copper, charcoal leather, ochre ceramic and modest ember cores','deep navy cloth, warm silver trim, muted golden star devices'];
const secondaryNames={10:'유적 인장대신',20:'왕관 숲사슴',30:'빙철 박쥐관측관',40:'압력망치 오우거',50:'산호 관문골렘',60:'수중 서고용',70:'태양 송풍정령',80:'구리비늘 히드라',90:'운석 갑옷대장',100:'은하 관측용'};
const extraMotifs={20:'wooden crown branches and round moss insignia',30:'an oversized round snow-gauge hat and blue quilted coat',40:'large gear crown and toolbox chest harness',50:'sweeping coral crest and pearl clasp over closed shell armor',60:'open copper-ring diving helmet and closed book clasp',70:'sun-dial hat with wide copper mantle and glowing furnace lens',80:'broad bronze brow crown and modest chimney shoulder device',90:'five-point commander crest, square navy breastplate and short star cloak',100:'radiant compass crown and silver concentric chest insignia'};
const entries=old.map(o=>{
 const n=o.wave+101,theme=Math.min(4,Math.floor((n-102)/20)),baseRigId=substitutes[o.assetId]||o.assetId;
 return {assetId:(o.role==='normal'?'w':'b')+String(n).padStart(3,'0')+(o.role==='secondary'?'-2':''),wave:n,role:o.role,name:o.role==='secondary'?secondaryNames[o.wave]:names[o.wave-1],theme:themeNames[theme],legacyAssetId:o.assetId,baseRigId,baseConfig:rigs[baseRigId].config,family:o.family,locomotion:rigs[baseRigId].entry.locomotion,design:o.role==='secondary'?`distinct companion ${o.family}; ${extraMotifs[o.wave]}; compact matching themed headgear and connected torso equipment`:(motifs[o.wave-1]||`${names[o.wave-1]}: distinct themed head silhouette and closed torso equipment, recognizable ${o.family} anatomy`),materials:themeBrief[theme],originalName:o.name,originalDesign:o.description};
});
const extra=structuredClone(entries.find(e=>e.assetId==='b111'));extra.assetId='b111-2';extra.role='secondary';extra.name=secondaryNames[10];extra.design='upright gray rat chancellor with tall rectangular seal-press hat, bronze spectacles and olive ceremonial waistcoat; clearly different from crowned rat prince';entries.push(extra);entries.sort((a,b)=>a.wave-b.wave||(['normal','boss','secondary'].indexOf(a.role)-['normal','boss','secondary'].indexOf(b.role)));
if(entries.length!==111||names.length!==101||new Set(entries.map(x=>x.name)).size!==111)throw Error('catalog coverage');
const first=['w015','w031','w033','w034','w035','w037','w038','w039','w041','w042','w045','w046','w047','w049','w051','w053'].map(old=>entries.find(e=>e.legacyAssetId===old));
const rest=entries.filter(e=>e.role==='normal'&&!first.includes(e)).sort((a,b)=>a.family.localeCompare(b.family)||a.wave-b.wave);
const groups=[{id:'normal-01',entries:first.map(e=>e.assetId),cols:6,rows:8}];
while(rest.length){let a=rest.splice(0,16);groups.push({id:`normal-${String(groups.length+1).padStart(2,'0')}`,entries:a.map(e=>e.assetId),cols:6,rows:Math.ceil(a.length/2)});}
// Spare cells in the final normal batch repair three rejected directions from
// earlier atlases. Originals remain archived; this source supersedes their cores.
const finalNormal=groups.find(g=>g.id==='normal-06');
finalNormal.entries.push('w138','w137','w133');finalNormal.rows=7;finalNormal.corrections=['w138','w137','w133'];
const bosses=entries.filter(e=>e.role!=='normal');let bi=1;while(bosses.length){groups.push({id:`boss-${String(bi++).padStart(2,'0')}`,entries:bosses.splice(0,4).map(e=>e.assetId),cols:3,rows:4});}
groups.push({id:'repair-01',entries:['w183','w124','w123','w130'],cols:3,rows:4,corrections:['w183','w124','w123','w130']});
fs.mkdirSync(out+'/guides',{recursive:true});fs.mkdirSync(out+'/sources',{recursive:true});fs.mkdirSync(out+'/prompts',{recursive:true});
fs.writeFileSync(out+'/catalog.json',JSON.stringify({version:101,scope:'111 new appearances for waves102–202; existing articulated limbs retained, new isolated three-view bodies. No ready state implied by this design catalog.',entries,groups},null,2)+'\n');
fs.writeFileSync(out+'/base-rigs.json',JSON.stringify({version:1,canonicalCell:512,assetVersion:101,entries:entries.map(e=>{const r=structuredClone(rigs[e.baseRigId].entry);Object.assign(r,{assetId:e.assetId,wave:e.wave,role:e.role,cell:e.role==='normal'?256:512,reviewApproved:false,name:e.name,legacyAssetId:e.legacyAssetId,baseRigId:e.baseRigId});return r;})},null,2)+'\n');
const selected=process.argv[2]||'normal-01';const group=groups.find(g=>g.id===selected);if(!group)throw Error(selected);
const tiles=[],records=[];const cw=220,ch=210;
for(const [i,id] of group.entries.entries()){
 const e=entries.find(e=>e.assetId===id),r=rigs[e.baseRigId].entry;
 for(const [vi,vn] of ['side','front','back'].entries()){
  const v=r.views[vn];if(v.legacyRig||v.legacySheet)throw Error(id+' adapter');
  const b=v.body,src=b.source||v.source,raw=await loadRaw(src,{background:b.background||v.background||'checkerboard',backgroundSeeds:b.backgroundSeeds||v.backgroundSeeds||[]});
  const p=await extractPart(raw,b.roi,id+vn,{componentCount:b.componentCount||1});
  let image=Buffer.from(p.image.split(',')[1],'base64');if(b.flipX)image=await sharp(image).flop().toBuffer();
  const col=group.cols===6?(i%2)*3+vi:vi,row=group.cols===6?Math.floor(i/2):i;
  const label=Buffer.from(`<svg width="${cw}" height="28"><text x="8" y="20" fill="white" font-size="13" font-family="Arial">${id} ${vn} BASE ${e.baseRigId}</text></svg>`);
  tiles.push({input:await sharp(image).resize(cw-24,ch-42,{fit:'inside'}).extend({top:6,bottom:6,left:6,right:6,background:{r:40,g:52,b:55,alpha:1}}).png().toBuffer(),left:col*cw+6,top:row*ch+30});
  tiles.push({input:label,left:col*cw,top:row*ch});records.push({id,view:vn,baseRigId:e.baseRigId,source:src,sha256:sha256(fs.readFileSync(src)),sourceBounds:[p.x,p.y,p.width,p.height],bodyTarget:b.target});
 }
}
await sharp({create:{width:group.cols*cw,height:group.rows*ch,channels:4,background:'#283437'}}).composite(tiles).png().toFile(out+'/guides/'+selected+'.png');
fs.writeFileSync(out+'/guides/'+selected+'.json',JSON.stringify(records,null,2)+'\n');
console.log(JSON.stringify({entries:entries.length,groups:groups.length,guide:out+'/guides/'+selected+'.png',ids:group.entries}));
