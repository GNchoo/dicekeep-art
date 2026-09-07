import fs from 'node:fs';import{dir,measuredView,newBiped}from'./biped-config-lib.mjs';
const c=JSON.parse(fs.readFileSync(dir+'/t4-biped-01b-rigs.json'));
c.entries[0].views.back=measuredView('t4-biped-01b-back-parts',0,{name:'back',sockets:[[.34,.82],[.56,.82]],kneeY:.45,ankleY:.8});
c.entries[1].views.back=measuredView('t4-biped-01b-back-parts',1,{name:'back',sockets:[[.34,.82],[.56,.82]],kneeY:.45,ankleY:.8});fs.writeFileSync(dir+'/t4-biped-01b-rigs.json',JSON.stringify(c,null,2)+'\n');
const next={version:1,canonicalCell:512,assetVersion:93,entries:[]};
for(let k=0;k<2;k++){const e=newBiped(k?38:37);e.views.side=measuredView('t4-biped-02a-side-front-parts-clean',k*2,{name:'side',sockets:k?[[.51,.78],[.63,.78]]:[[.43,.8],[.58,.8]],kneeY:k?.45:.4,ankleY:.8});e.views.front=measuredView('t4-biped-02a-side-front-parts-clean',k*2+1,{name:'front',sockets:k?[[.53,.77],[.34,.77]]:[[.55,.81],[.29,.81]],kneeY:k?.45:.4,ankleY:.85});next.entries.push(e);}fs.writeFileSync(dir+'/t4-biped-02a-rigs.json',JSON.stringify(next,null,2)+'\n');
