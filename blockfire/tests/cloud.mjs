import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const T=(k,v)=>console.log(k,JSON.stringify(v));let fails=0;const CK=(ok,m)=>{if(!ok){fails++;console.log('  FAIL',m);}};
async function dev(origin){const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('blockfire.norender','1');localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'http://127.0.0.1:54321',key:'anon-key'}));});
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);return p;}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);
const until=async(p,c,ms=15000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return Date.now()-t;}catch(e){}await p.waitForTimeout(200);}return -1;};
const server=async()=>(await fetch('http://127.0.0.1:54321/__log',{headers:{apikey:'anon-key'}})).json();
async function form(p,name,pass,btn){await p.evaluate(()=>{document.getElementById('openAcct').click();});await p.waitForTimeout(200);
  await p.evaluate(()=>{const c=document.querySelector('[data-ac=cloud]');c.click();});
  await p.fill('#clName',name);await p.fill('#clPass',pass);await p.click('#'+btn);await p.waitForTimeout(1500);return ev(p,'acMsg');}
// A: guest plays, then signs up -> progress goes online
const A=await dev('http://127.0.0.1:8765');
T('A_homeHint',await A.evaluate(()=>document.getElementById('hSave').textContent));
await ev(A,'profile.xp=500;profile.gp=3000;saveProfile();1');
let m=await form(A,'Eden','secret1','clSignup');T('A_signup',{msg:m,cs:await ev(A,'CS&&CS.name'),cur:await ev(A,'USERS.cur'),xp:await ev(A,'profile.xp')});
let S=await server();const row=Object.values(S.rows)[0];T('A_db',{name:row&&row.name,xp:row&&row.data.xp,gp:row&&row.data.gp});CK(row&&row.data.xp===500&&row.data.gp===3000,'signup did not carry progress online');
// progress keeps saving
await ev(A,'profile.xp=900;saveProfile();1');await A.waitForTimeout(4500);S=await server();T('A_autosave',Object.values(S.rows)[0].data.xp);CK(Object.values(S.rows)[0].data.xp===900,'autosave failed');
// B: another link/browser (different storage), logs in -> gets everything
const B=await dev('http://localhost:8765');CK(await ev(B,'profile.xp')===0,'B not fresh');
m=await form(B,'eden','wrongpw','clLogin');T('B_wrongPw',m);CK(/Wrong username or password/.test(m),'wrong pw msg');
m=await form(B,'eden','secret1','clLogin');T('B_login',{msg:m,name:await ev(B,'CS.name'),xp:await ev(B,'profile.xp'),gp:await ev(B,'profile.gp')});CK(await ev(B,'profile.xp')===900,'login did not load progress');
// B plays more (token expires every 5s here, so refresh is exercised)
await B.waitForTimeout(6000);await ev(B,'profile.xp=1200;saveProfile();1');await B.waitForTimeout(4500);S=await server();T('B_save',Object.values(S.rows)[0].data.xp);CK(Object.values(S.rows)[0].data.xp===1200,'B save failed (token refresh)');
// A was open the whole time with older progress: its next save must not overwrite B
await ev(A,'profile.gp+=5;saveProfile();1');await A.waitForTimeout(5000);S=await server();T('A_conflict',{server:Object.values(S.rows)[0].data.xp,aNow:await ev(A,'profile.xp')});CK(Object.values(S.rows)[0].data.xp===1200&&(await ev(A,'profile.xp'))===1200,'open stale device overwrote newer progress');
// A reopens later: newer online progress wins
await A.reload({waitUntil:'domcontentloaded'});await until(A,'cloudReady',10000);T('A_reopen',{xp:await ev(A,'profile.xp'),ready:await ev(A,'cloudReady')});CK(await ev(A,'profile.xp')===1200,'reopen did not take newer online progress');
// stale device must not overwrite: A had old data offline? (simulate: A local older -> pull wins, row stays 1200)
S=await server();CK(Object.values(S.rows)[0].data.xp===1200,'stale overwrite');
// duplicate username
const C=await dev('http://127.0.0.1:8765');await ev(C,"localStorage.removeItem('blockfire.cloud');1");
const D=await dev('http://localhost:8765');await ev(D,"(async()=>{})();1");
await D.evaluate(()=>{localStorage.clear();localStorage.setItem('blockfire.norender','1');localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'http://127.0.0.1:54321',key:'anon-key'}));});await D.reload();await D.waitForTimeout(1500);
m=await form(D,'EDEN','another1','clSignup');T('D_dupe',m);CK(/taken/.test(m),'dupe name allowed');
m=await form(D,'Ed','123','clSignup');T('D_shortPw',m);CK(/8\+ characters/.test(m),'short pw');
// logout clears this device, login restores
await A.evaluate(()=>{document.getElementById('openAcct').click();document.querySelector('[data-ac=cloud]').click();});await A.click('#clLogout');await A.waitForTimeout(1200);
T('A_logout',{cs:await ev(A,'CS'),cur:await ev(A,'USERS.cur'),users:await ev(A,'Object.keys(USERS.users)'),xp:await ev(A,'profile.xp')});CK(!(await ev(A,'CS'))&&(await ev(A,'profile.xp'))===0,'logout left data');
m=await form(A,'Eden','secret1','clLogin');T('A_relogin',{xp:await ev(A,'profile.xp')});CK(await ev(A,'profile.xp')===1200,'relogin');
T('home',await A.evaluate(()=>document.getElementById('hSave').textContent));
await A.screenshot({path:'../vid/cloud.png'});
T('errs',{A:A.errs,B:B.errs,D:D.errs});CK(!A.errs.length&&!B.errs.length&&!D.errs.length,'page errors');
console.log(fails?`RESULT ${fails} FAILED`:'RESULT ALL PASSED');await b.close();
