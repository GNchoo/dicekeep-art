// Actual home/rewards entry integration in isolated browsers. Linked-account
// responses below are local HTTP fixtures; no real account or payment is used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchBrowser}=require('./browser.cjs');
const P=require('../../progression.js'),L=require('../../liveops-rules.js');
const base=new URL(process.env.E2E_BASE_URL||'http://127.0.0.1:8137/');
assert.ok(['localhost','127.0.0.1'].includes(base.hostname),'Home QA must use a local server');
const out=path.resolve(process.env.E2E_OUTPUT_DIR||'gen/e2e/home-rewards');fs.mkdirSync(out,{recursive:true});
const report={pass:false,scope:'Real guest home/attendance and real rewards client with isolated linked-account HTTP fixtures. No external writes or payments.',cases:[]};
const clone=value=>JSON.parse(JSON.stringify(value));
const gameUrl=(start)=>{const u=new URL('index.html',base);u.searchParams.set('net','off');u.searchParams.set('v',Date.now());if(start)u.searchParams.set('start',start);return u.href;};
const dot=(page,kind)=>page.locator(`[data-reward-dot="${kind}"]`).first();
const tabDot=(page,kind)=>page.locator(`#rewards-tab-${kind} .rewards-notification-dot`);
async function setup(browser,name,viewport,fixture) {
 const context=await browser.newContext({viewport}),page=await context.newPage();
 const row={name,checks:[],errors:[],blocked:[],pass:false};report.cases.push(row);
 page.on('pageerror',e=>row.errors.push(e.message));
 const check=(label,actual,expected=true)=>{assert.deepEqual(actual,expected,name+': '+label);row.checks.push(label);};
 await page.addInitScript(linked=>{
  localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');
  window.__homeOpened=[];addEventListener('rewards:opened',event=>__homeOpened.push({...event.detail}));
  if(linked&&!sessionStorage.getItem('__homeSignedOut'))localStorage.setItem('dk_commerce_session_v1',JSON.stringify({token:'fixture-only-not-a-real-token',accountId:'home-fixture-account',expiresAt:4102444800000}));
 },!!fixture);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==base.origin){row.blocked.push({reason:'external',url:req.url(),method:req.method()});return route.abort();}
  const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(fixture&&url.pathname==='/commerce-config.js')return route.fulfill({contentType:'text/javascript',body:`window.DKCOMMERCE_CONFIG={url:${JSON.stringify(new URL('__home-commerce',base).href)}};`});
  if(fixture&&url.pathname.startsWith('/__home-commerce/')) {
   const endpoint=url.pathname.slice('/__home-commerce'.length),payload=req.postData()?JSON.parse(req.postData()):null;
   fixture.requests.push({endpoint,method:req.method(),payload});
   const data=()=>({profile:clone(fixture.profile),wallet:{shards:fixture.profile.shards},liveops:L.view(fixture.liveops,{now:fixture.now,premium:fixture.premium}),inbox:clone(fixture.mail),serverNow:fixture.now,canAdmin:false});
   if(endpoint==='/config')return send({purchasesEnabled:false,providers:{web:false},products:[]});
   if(endpoint==='/cosmetics')return send({owned:['base'],equipped:'base'});
   if(endpoint==='/profile')return send({profile:clone(fixture.profile)});
   if(endpoint==='/wallet')return send({shards:fixture.profile.shards});
   if(endpoint==='/liveops'){if(fixture.hold)await new Promise(resolve=>fixture.releases.push(resolve));if(fixture.fail)return send({code:'temporary',message:'Fixture reward list unavailable'},503);return send(data());}
   if(endpoint==='/auth/logout')return send({ok:true});
   if(endpoint==='/mail/claim') {
    const mail=fixture.mail.find(m=>m.id===payload.id);if(!mail||mail.claimed||mail.expiresAt!==null&&mail.expiresAt<=fixture.now)return send({code:'mail-unavailable'},409);
    mail.claimed=true;fixture.profile.collection.gold+=mail.reward.gold||0;fixture.profile.shards+=mail.reward.shards||0;return send(data());
   }
   if(endpoint==='/pass/claim'||endpoint==='/attendance/claim') {
    const result=endpoint==='/pass/claim'?L.claimPass(fixture.liveops,{...payload,premium:fixture.premium}):L.claimAttendance(fixture.liveops,fixture.now,payload.day);
    if(!result.ok)return send({code:result.reason},409);fixture.liveops=result.nextState;fixture.profile.collection.gold+=result.reward.gold||0;fixture.profile.shards+=result.reward.shards||0;return send(data());
   }
   row.blocked.push({reason:'unexpected fixture mutation',endpoint,method:req.method()});return send({code:'unexpected-fixture-endpoint'},400);
  }
  if(!['GET','HEAD','OPTIONS'].includes(req.method())){row.blocked.push({reason:'non-fixture mutation',url:req.url(),method:req.method()});return route.abort();}
  return route.continue();
 });
 async function ready(start) {await page.goto(gameUrl(start));await page.waitForFunction(()=>window.DK?.phase==='title'&&window.DKHOME&&window.DKREWARDSUI,null,{timeout:120000});}
 async function automatic() {await page.waitForFunction(()=>document.getElementById('rewards-dialog')?.open&&window.__homeOpened.some(e=>e.automatic));await page.waitForFunction(()=>!document.getElementById('rewards-attendance-claim')?.disabled);}
 async function home() {await page.click('#ov-btn');await page.waitForFunction(()=>DK.phase==='lobby');}
 async function noOverflow(label,selector) {
  const box=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return{w:el.clientWidth,sw:el.scrollWidth,l:r.left,r:r.right,vw:innerWidth};});check(label,box.sw<=box.w+1&&box.l>=-.5&&box.r<=box.vw+.5);
 }
 return{page,context,row,check,ready,automatic,home,noOverflow};
}
async function guestCase(browser,name,viewport) {
 const t=await setup(browser,name,viewport),{page,check,row}=t;
 try {
  await t.ready();await page.waitForFunction(()=>!!DKREWARDS.current());
  check('Unclaimed attendance waits while the title Start is visible',await page.evaluate(()=>DK.phase==='title'&&!document.getElementById('rewards-dialog')?.open&&!__homeOpened.some(e=>e.automatic)));
  await t.home();await t.automatic();
  check('Unclaimed attendance automatically opens over the home after Start',await page.evaluate(()=>DK.phase==='lobby'&&document.getElementById('rewards-tab-attendance').getAttribute('aria-selected')==='true'));
  check('Opening does not automatically grant attendance or XP',await page.evaluate(()=>[DKSAVE.liveops.attendance.total,DKSAVE.liveops.pass.xp]),[0,0]);
  check('Only one automatic open event is emitted',await page.evaluate(()=>__homeOpened.filter(e=>e.automatic).length),1);
  await t.noOverflow('Automatic attendance fits viewport','#rewards-dialog');await page.screenshot({path:path.join(out,name+'-attendance.png')});
  await page.click('#rewards-close');await page.evaluate(async()=>{await DKHOME.enter();await DKHOME.refresh();await DKHOME.enter();});
  check('Closing and revisiting home do not reopen in the same visit',await page.evaluate(()=>!document.getElementById('rewards-dialog').open&&__homeOpened.filter(e=>e.automatic).length===1));
  check('Home exposes mailbox, pass, deck and battle entries',await page.locator('#home-mail').isVisible()&&await page.locator('#home-pass').isVisible()&&await page.locator('[data-home-action="deck"]').first().isVisible()&&await page.locator('[data-home-action="battle"]').first().isVisible());
  check('Home wallet uses the current guest balances',await page.evaluate(()=>[Number(document.getElementById('home-gold').textContent.replace(/[^0-9]/g,'')),Number(document.getElementById('home-shards').textContent.replace(/[^0-9]/g,''))]),await page.evaluate(()=>[DKSAVE.progression.collection.gold,DKSAVE.progression.shards]));
  check('Unclaimed attendance has a dot; guest mail and unearned pass do not',await dot(page,'attendance').isVisible()&&!await dot(page,'mail').isVisible()&&!await dot(page,'pass').isVisible());
  await t.noOverflow('Home fits viewport','#lobby .screen-box');await page.screenshot({path:path.join(out,name+'-home.png')});
  await page.reload();await page.waitForFunction(()=>window.DK?.phase==='title'&&!!DKREWARDS.current(),null,{timeout:120000});
  check('A new visit also preserves the title before showing attendance',await page.evaluate(()=>!document.getElementById('rewards-dialog')?.open&&!__homeOpened.some(e=>e.automatic)));
  await t.home();await t.automatic();
  check('A new visit reminds again while attendance remains unclaimed',await page.evaluate(()=>__homeOpened.filter(e=>e.automatic).length),1);
  await page.click('#rewards-attendance-claim');await page.waitForFunction(()=>document.getElementById('rewards-attendance-claim')?.disabled&&DKSAVE.liveops.attendance.total===1);
  check('Claim grants one attendance and twenty XP',await page.evaluate(()=>[DKSAVE.liveops.attendance.total,DKSAVE.liveops.pass.xp]),[1,20]);
  await page.click('#rewards-close');await page.evaluate(()=>DKHOME.refresh());check('Attendance dot clears after claim',await dot(page,'attendance').isVisible(),false);
  await page.reload();await page.waitForFunction(()=>window.DK?.phase==='title'&&!!DKREWARDS.current(),null,{timeout:120000});await t.home();await page.evaluate(()=>DKHOME.refresh());
  check('Claimed attendance does not open on reload',await page.evaluate(()=>!document.getElementById('rewards-dialog')?.open&&!__homeOpened.some(e=>e.automatic)));
  check('No uncaught script errors',row.errors,[]);check('No external or account mutations',row.blocked,[]);row.pass=true;
 }catch(error){row.failure=error.stack;await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});throw error;}finally{await t.context.close();}
}
function linkedFixture() {
 const now=Date.parse('2001-06-01T00:00:00Z'),liveops=L.defaultState();liveops.attendance={total:1,lastDay:L.dayKey(now)};liveops.pass.xp=200;liveops.pass.freeClaimed=[1];
 return{now,liveops,profile:P.defaultProfile(),premium:false,fail:false,hold:false,releases:[],requests:[],mail:[
  {id:'available',title:'서버 시간 기준 선물',body:'기기 날짜보다 서버 판정을 따르는 우편',reward:{gold:50,shards:1},publishedAt:now-1000,expiresAt:now+86400000,claimed:false},
  {id:'expired',title:'만료 선물',body:'수령 불가',reward:{gold:50},publishedAt:now-2000,expiresAt:now-1000,claimed:false},
  {id:'claimed',title:'받은 선물',body:'수령 완료',reward:{gold:50},publishedAt:now-2000,expiresAt:null,claimed:true},
 ]};
}
async function linkedCase(browser) {
 const fixture=linkedFixture(),t=await setup(browser,'linked-badges',{width:390,height:844},fixture),{page,check,row}=t;
 try {
  await t.ready();await page.evaluate(()=>DKHOME.refresh());await t.home();await page.evaluate(()=>DKHOME.refresh());
  check('Claimed server attendance does not auto-open',await page.evaluate(()=>!__homeOpened.some(e=>e.automatic)));
  check('Actual linked client feeds home mailbox and free-pass dots',await page.evaluate(()=>DKCOMMERCE.linked())&&await dot(page,'mail').isVisible()&&await dot(page,'pass').isVisible());
  await page.click('#home-mail');await page.waitForSelector('[data-claim-mail="available"]');
  check('Server-expired flag takes priority over newer device date',await page.locator('[data-claim-mail="available"]').isEnabled());
  check('Expired and claimed mail do not offer a claim',await page.locator('[data-claim-mail="expired"]').isDisabled()&&await page.locator('[data-claim-mail="claimed"]').isDisabled());
  check('Mailbox and pass tabs have the same claimable indicators',await tabDot(page,'mail').isVisible()&&await tabDot(page,'pass').isVisible());
  await page.click('[data-claim-mail="available"]');await page.waitForFunction(()=>document.querySelector('[data-claim-mail="available"]')?.disabled);await page.evaluate(()=>DKHOME.refresh());
  check('Last available mail clears both mailbox indicators',!await dot(page,'mail').isVisible()&&!await tabDot(page,'mail').isVisible());
  await page.click('#rewards-tab-pass');await page.click('[data-claim-pass="2:free"]');await page.waitForFunction(()=>document.querySelector('[data-claim-pass="2:free"]')?.disabled);await page.evaluate(()=>DKHOME.refresh());
  check('Premium rewards requiring purchase do not create a false dot',!await dot(page,'pass').isVisible()&&!await tabDot(page,'pass').isVisible());
  fixture.premium=true;await page.evaluate(async()=>{DKREWARDS.changed();await DKHOME.refresh();await DKREWARDSUI.open('pass');});
  check('Owned premium with earned unclaimed rewards creates a dot',await dot(page,'pass').isVisible()&&await tabDot(page,'pass').isVisible());
  for(const tier of [1,2]){await page.click(`[data-claim-pass="${tier}:premium"]`);await page.waitForFunction(tier=>document.querySelector(`[data-claim-pass="${tier}:premium"]`)?.disabled,tier);}
  await page.evaluate(()=>DKHOME.refresh());check('All earned rewards claimed clears pass dot despite unreached tiers',!await dot(page,'pass').isVisible()&&!await tabDot(page,'pass').isVisible());
  await page.click('#rewards-close');await page.screenshot({path:path.join(out,'linked-home.png')});
  check('Only the selected local mail was claimed',fixture.requests.filter(r=>r.endpoint==='/mail/claim').map(r=>r.payload.id),['available']);
  check('Signed list/adopt events do not create a repeated-refresh loop',fixture.requests.filter(r=>r.endpoint==='/liveops').length<60);
  check('No payment endpoints or non-fixture requests',row.blocked,[]);check('No uncaught script errors',row.errors,[]);row.pass=true;
 }catch(error){row.failure=error.stack;await page.screenshot({path:path.join(out,'linked-failure.png')}).catch(()=>{});throw error;}finally{await t.context.close();}
}
async function autostartCase(browser) {
 const t=await setup(browser,'autostart-deferral',{width:1240,height:860}),{page,check,row}=t;
 try {
  await t.ready('clear');await page.evaluate(()=>DKHOME.refresh());
  check('Explicit autostart keeps title action free of attendance',await page.evaluate(()=>!document.getElementById('rewards-dialog')?.open&&!__homeOpened.some(e=>e.automatic)));
  await page.click('#ov-btn');await page.waitForFunction(()=>DK.phase==='playing');await page.evaluate(()=>DKHOME.refresh());
  check('Automatic attendance does not interrupt active combat',await page.evaluate(()=>!document.getElementById('rewards-dialog')?.open&&DK.inf.recordKey==='clear'));
  await page.evaluate(()=>{DK.paused=true;DKlobby();});await t.automatic();
  check('Deferred attendance opens once when returning safely to home',await page.evaluate(()=>DK.phase==='lobby'&&__homeOpened.filter(e=>e.automatic).length===1));
  check('No external writes',row.blocked,[]);check('No uncaught script errors',row.errors,[]);row.pass=true;
 }catch(error){row.failure=error.stack;throw error;}finally{await t.context.close();}
}
async function delayedRoomCase(browser) {
 const fixture=linkedFixture();fixture.liveops.attendance={total:0,lastDay:''};fixture.hold=true;
 const t=await setup(browser,'delayed-room-and-account',{width:1240,height:860},fixture),{page,check,row}=t;
 const pending=async()=>{const end=Date.now()+10000;while(!fixture.releases.length){if(Date.now()>end)throw Error('Expected a held liveops request');await new Promise(resolve=>setTimeout(resolve,20));}};
 const release=()=>{fixture.hold=false;for(const resolve of fixture.releases.splice(0))resolve();};
 try {
  await t.ready();await pending();
  await page.evaluate(()=>{window.__raceUpdated=false;addEventListener('rewards:updated',()=>__raceUpdated=true,{once:true});DK.phase='mpRoom';DK.net={fixture:true};});
  release();await page.waitForFunction(()=>window.__raceUpdated);
  check('A response arriving after room transition cannot open attendance',await page.evaluate(()=>!document.getElementById('rewards-dialog')?.open&&!__homeOpened.some(e=>e.automatic)));
  await page.evaluate(()=>{DK.net=null;DKlobby();});await t.automatic();
  check('Deferred room-transition response prompts on safe home return',await page.evaluate(()=>__homeOpened.filter(e=>e.automatic).length),1);
  await page.click('#rewards-close');fixture.fail=true;await page.evaluate(()=>DKHOME.refresh());
  check('Failed list does not invent claimable indicators',!await dot(page,'attendance').isVisible()&&!await dot(page,'mail').isVisible()&&!await dot(page,'pass').isVisible());
  check('Home explains a failed refresh',/재확인/.test(await page.locator('#home-pass-progress').innerText()));
  fixture.fail=false;await page.evaluate(()=>DKHOME.refresh());check('Successful retry restores claimable mailbox state',await dot(page,'mail').isVisible());
  fixture.hold=true;await page.evaluate(()=>{window.__oldOwnerRefresh=DKHOME.refresh();});await pending();
  await page.evaluate(async()=>{sessionStorage.setItem('__homeSignedOut','1');await DKCOMMERCE.signOut();});release();
  await page.evaluate(()=>window.__oldOwnerRefresh);await t.automatic();
  check('Sign-out discards the previous account response and shows guest attendance once',await page.evaluate(()=>!DKCOMMERCE.linked()&&/게스트/.test(document.getElementById('home-account').textContent)&&__homeOpened.filter(e=>e.automatic).length===2));
  check('No uncaught race errors',row.errors,[]);check('Only intercepted local account operations occurred',row.blocked,[]);row.pass=true;
 }catch(error){row.failure=error.stack;throw error;}finally{release();await t.context.close();}
}
(async()=>{const browser=await launchBrowser({startupRewards:true});try{await guestCase(browser,'phone',{width:390,height:844});await guestCase(browser,'desktop',{width:1280,height:900});await linkedCase(browser);await delayedRoomCase(browser);await autostartCase(browser);report.pass=true;console.log('PASS home rewards',report.cases.reduce((n,r)=>n+r.checks.length,0),'checks');}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
