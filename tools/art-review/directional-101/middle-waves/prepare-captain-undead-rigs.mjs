import fs from 'node:fs';import{dir,measuredView,newBiped}from'./biped-config-lib.mjs';
const specs=[
 ['t4-biped-02b',[39],[[[.23,.84],[.43,.84]],[[.69,.82],[.49,.82]]],[.5,.5]],
 ['t6-biped-01a',[51,53],[[[.56,.81],[.71,.81]],[[.61,.81],[.37,.81]],[[.29,.82],[.45,.82]],[[.56,.80],[.34,.80]]],[.5,.5,.5,.5]],
 ['t6-biped-01b',[55,57],[[[.38,.82],[.57,.82]],[[.57,.82],[.34,.82]],[[.40,.81],[.57,.81]],[[.56,.70],[.35,.70]]],[.45,.45,.4,.4]]
];
for(const [base,waves,sockets,knees]of specs){const c={version:1,canonicalCell:512,assetVersion:93,entries:[]};for(let i=0;i<waves.length;i++){const e=newBiped(waves[i]);for(const [j,name]of ['side','front'].entries())e.views[name]=measuredView(base+'-side-front-parts',i*2+j,{name,sockets:sockets[i*2+j],kneeY:knees[i*2+j],ankleY:j?.85:.8});c.entries.push(e);}fs.writeFileSync(dir+'/'+base+'-rigs.json',JSON.stringify(c,null,2)+'\n');}
