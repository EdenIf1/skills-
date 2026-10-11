import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const T=(k,v)=>console.log(k,JSON.stringify(v));let fails=0;const CK=(ok,m)=>{if(!ok){fails++;console.log('  FAIL',m);}};
const API='http://127.0.0.1:54321',H={headers:{apikey:'anon-key'}};const server=async()=>(await fetch(API+'/__log',H)).json();
async function dev(){const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('blockfire.norender','1');localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'http://127.0.0.1:54321',key:'anon-key'}));});
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});await p.waitForTimeout(2200);return p;}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);
const until=async(p,c,ms=15000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return Date.now()-t;}catch(e){}await p.waitForTimeout(200);}return -1;};
const A=await dev();await until(A,'CS&&cloudReady');
// 1 legal links + version in settings, help form sends
T('1_legal',await A.evaluate(()=>document.getElementById('legal').textContent));CK(/Privacy policy.*Terms of use.*Version 1\.0\.0/.test(await A.evaluate(()=>document.getElementById('legal').textContent)),'legal links missing');
await A.evaluate(()=>{document.getElementById('openSet').click();document.getElementById('openHelp').click();});await A.fill('#hpMsg','The shop picture of the MK-4 looks dark');await A.fill('#hpContact','me@example.com');await A.click('#hpSend');await A.waitForTimeout(800);
let S=await server();T('1_help',{out:await A.evaluate(()=>document.getElementById('hpMsgOut').textContent),stored:S.support.length&&S.support[0].topic});CK(S.support.length===1,'support message not stored');
await A.screenshot({path:'../vid/help.png'});await A.evaluate(()=>{document.getElementById('helpClose').click();document.getElementById('setClose').click();});
// 2 delete account
const uid=await ev(A,'CS.uid'),name0=await ev(A,'CS.name');await ev(A,'profile.xp=500;saveProfile();1');await A.waitForTimeout(3600);
await A.evaluate(()=>{document.getElementById('openAcct').click();document.querySelector('[data-ac=cloud]').click();});await A.click('#clDel');await A.fill('#clDelTxt','nope');await A.click('#clDelGo');await A.waitForTimeout(300);
T('2_wrongConfirm',await ev(A,'acMsg'));CK(/Type DELETE/.test(await ev(A,'acMsg')),'deleted without confirm');
await A.fill('#clDelTxt','delete');await A.click('#clDelGo');await A.waitForTimeout(1200);S=await server();
T('2_deleted',{msg:await ev(A,'acMsg'),serverHasUser:!!S.users[uid],serverRow:!!S.rows[uid],localCS:await ev(A,'CS&&CS.name'),xp:await ev(A,'profile.xp')});
CK(!S.users[uid]&&!S.rows[uid]&&await ev(A,'profile.xp')===0,'account not fully deleted');
await until(A,'CS&&CS.guest&&CS.name!=="'+name0+'"',70000).then(ms=>T('2_newGuestAfterDelete',ms));
// 3 update required + motd + feature switches from the server
await fetch(API+'/__config',{method:'POST',headers:{apikey:'anon-key','Content-Type':'application/json'},body:JSON.stringify([{key:'min_version',value:'9.0.0'},{key:'motd',value:'Double XP weekend!'},{key:'store_url',value:'https://apps.apple.com/app/id0'},{key:'features',value:{building:false,crates:false,multiplayer:true}}])});
const B2=await dev();await B2.waitForTimeout(1500);
T('3_config',{upd:await B2.evaluate(()=>!document.getElementById('updReq').hidden),motd:await B2.evaluate(()=>document.getElementById('hMotd').textContent),crateBtn:await B2.evaluate(()=>document.getElementById('openCrate').hidden),build:await ev(B2,"feat('building')")});
CK(await B2.evaluate(()=>!document.getElementById('updReq').hidden),'update screen not shown');await B2.screenshot({path:'../vid/update.png'});
await B2.click('#updLater');await B2.evaluate(()=>window.__bf.start('junk'));await B2.waitForTimeout(800);T('3_buildOff',{buildOn:await ev(B2,'buildOn()')});CK(!(await ev(B2,'buildOn()')),'building not switched off');
await fetch(API+'/__config',{method:'POST',headers:{apikey:'anon-key','Content-Type':'application/json'},body:JSON.stringify([{key:'min_version',value:'1.0.0'},{key:'features',value:{building:true,crates:true,multiplayer:true}}])});
// 4 crash guard: a broken frame is reported, repeated breakage sends you to the menu, the loop keeps running
await ev(B2,"window.__boom=0;const old=updatePlayer;window.__old=old;updatePlayer=function(dt){window.__boom++;throw new Error('test crash');};1");
await B2.waitForTimeout(1500);T('4_guard',{state:await ev(B2,'state'),reported:(await server()).errors.map(e=>e.where_+':'+e.message),frames:await ev(B2,'frameN')});
CK(await ev(B2,'state')==='menu','not sent back to menu');CK((await server()).errors.some(e=>/test crash/.test(e.message)),'crash not reported');
const f0=await ev(B2,'frameN');await B2.waitForTimeout(500);CK(await ev(B2,'frameN')>f0,'loop stopped');
// 5 save versions: an old save without the new fields is upgraded
T('5_migrate',await ev(B2,"JSON.stringify(fillProfile({xp:5,gp:9,owned:['ak47','m4a1']},'Old')).match(/\"v\":2|\"blocks\":\\[\"dirt\"\\]|\"titles\"/g)"));
T('errs',{A:A.errs,B:B2.errs.filter(e=>!/test crash/.test(e))});CK(!A.errs.length&&!B2.errs.filter(e=>!/test crash/.test(e)).length,'page errors');
console.log(fails?`RESULT ${fails} FAILED`:'RESULT ALL PASSED');await b.close();
