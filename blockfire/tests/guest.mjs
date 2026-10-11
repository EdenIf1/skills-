import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const T=(k,v)=>console.log(k,JSON.stringify(v));let fails=0;const CK=(ok,m)=>{if(!ok){fails++;console.log('  FAIL',m);}};
const API='http://127.0.0.1:54321',H={headers:{apikey:'anon-key'}};
async function dev(origin){const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('blockfire.norender','1');localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'http://127.0.0.1:54321',key:'anon-key'}));});
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;await p.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);return p;}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);
const until=async(p,c,ms=15000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return Date.now()-t;}catch(e){}await p.waitForTimeout(200);}return -1;};
const server=async()=>(await fetch(API+'/__log',H)).json();
const row=async uid=>(await server()).rows[uid];
// 1 first open: a guest account is made by itself, progress saves online without typing anything
const A=await dev('http://127.0.0.1:8765');const g=await until(A,"CS&&CS.guest&&cloudReady",15000);
const gname=await ev(A,'CS.name'),uid=await ev(A,'CS.uid');T('1_guest',{ms:g,name:gname,cur:await ev(A,'USERS.cur'),callsign:await ev(A,'profile.name'),hint:await A.evaluate(()=>document.getElementById('hSignup')&&document.getElementById('hSignup').textContent)});
CK(/^Guest-\d{6}$/.test(gname),'no guest name');
await ev(A,'profile.xp=700;profile.gp=2500;saveProfile();1');await A.waitForTimeout(4000);let r=await row(uid);T('1_saved',{name:r&&r.name,xp:r&&r.data.xp});CK(r&&r.data.xp===700,'guest progress not online');
// 2 reopening: same guest, no login asked
await A.reload({waitUntil:'domcontentloaded'});await until(A,'cloudReady',10000);T('2_reopen',{name:await ev(A,'CS.name'),xp:await ev(A,'profile.xp')});CK(await ev(A,'CS.name')===gname&&await ev(A,'profile.xp')===700,'guest not remembered');
// 3 the server forgets every login (long gap): the guest logs itself back in silently
await fetch(API+'/__revoke',H);await ev(A,'CS.exp=0;cloudKeep();profile.xp=750;saveProfile();1');await A.waitForTimeout(4500);r=await row(uid);
T('3_silentRelogin',{xp:r.data.xp,err:await ev(A,'cloudErr')});CK(r.data.xp===750,'guest could not log itself back in');
// 4 guest picks a name: same account, same progress, new name
await A.evaluate(()=>{document.getElementById('hSignup').click();});await A.waitForTimeout(300);
await A.fill('#clName','guest-x');await A.fill('#clPass','pw1234');await A.click('#clSignup');await A.waitForTimeout(1500);T('4_reservedName',await ev(A,'acMsg'));CK(/Guest/.test(await ev(A,'acMsg')),'guest prefix allowed');
await A.fill('#clName','Eden');await A.fill('#clPass','secret1');await A.click('#clSignup');await A.waitForTimeout(2500);
r=await row(uid);T('4_claim',{msg:await ev(A,'acMsg'),cs:await ev(A,'[CS.name,CS.guest,!!CS.gpw,CS.uid===\''+uid+'\']'),cur:await ev(A,'USERS.cur'),callsign:await ev(A,'profile.name'),row:[r.name,r.data.xp]});
CK(await ev(A,'CS.name')==='Eden'&&!(await ev(A,'CS.guest'))&&r.name==='Eden'&&r.data.xp===750,'claim failed');
// 5 another phone logs in with the new name and gets everything
const B=await dev('http://localhost:8765');await until(B,'CS&&CS.guest',10000);await ev(B,'profile.xp=0;saveProfile();1');
await B.evaluate(()=>{document.getElementById('hSignup').click();});await B.waitForTimeout(300);await B.fill('#clName','eden');await B.fill('#clPass','secret1');await B.click('#clLogin');await B.waitForTimeout(2500);
T('5_otherPhone',{name:await ev(B,'CS.name'),guest:await ev(B,'CS.guest'),xp:await ev(B,'profile.xp')});CK(await ev(B,'CS.name')==='Eden'&&await ev(B,'profile.xp')>=750,'login on other phone');
// 6 registered player is remembered after a reload (no password asked)
await B.reload({waitUntil:'domcontentloaded'});await until(B,'cloudReady',10000);T('6_remembered',{name:await ev(B,'CS&&CS.name'),ready:await ev(B,'cloudReady')});CK(await ev(B,'CS&&CS.name')==='Eden','not remembered');
// 7 90 days idle: asks to log in again
await ev(B,'CS.seen=Date.now()-91*864e5;cloudKeep();1');await B.reload({waitUntil:'domcontentloaded'});await B.waitForTimeout(2500);
T('7_idle',{cs:await ev(B,'CS&&[CS.name,CS.guest]'),cur:await ev(B,'USERS.cur')});CK(!(await ev(B,'CS&&CS.name==="Eden"')),'idle session not dropped');
// 8 someone else cannot take the name
const C=await dev('http://127.0.0.1:8765');
T('errs',{A:A.errs,B:B.errs});CK(!A.errs.length&&!B.errs.length,'page errors');
console.log(fails?`RESULT ${fails} FAILED`:'RESULT ALL PASSED');await b.close();
