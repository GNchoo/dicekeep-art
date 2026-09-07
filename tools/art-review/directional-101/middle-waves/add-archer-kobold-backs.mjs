import fs from 'node:fs';
import {dir,measuredView} from './biped-config-lib.mjs';
const file=dir+'/t4-biped-02a-rigs.json', c=JSON.parse(fs.readFileSync(file));
c.entries[0].views.back=measuredView('w037-back-single-parts',0,{name:'back',sockets:[[.29,.84],[.54,.84]],kneeY:.55,ankleY:.85});
c.entries[1].views.back=measuredView('w038-back-single-parts',0,{name:'back',sockets:[[.39,.70],[.59,.70]],kneeY:.55,ankleY:.8});
fs.writeFileSync(file,JSON.stringify(c,null,2)+'\n');
