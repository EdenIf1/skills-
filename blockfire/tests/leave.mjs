import { chromium } from 'playwright';
const URL='http://127.0.0.1:8765/index.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const T=(k,v)=>console.log(k,JSON.stringify(v));
async function mk(name,ctx){ctx=ctx||await b.newContext({viewport:{width:900,height:500},serviceWorkers:'block'});
  if(!ctx._init){await ctx.addInitScript(()=>{localStorage.setItem('blockfire.ps','127.0.0.1:9000');localStorage.setItem('blockfire.norender','1');});ctx._init=1;}
  const p=await ctx.newPage();p.on('dialog',d=>d.accept());p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;
  await p.goto(URL,{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);await p.evaluate(n=>window.__bf.setProfile({name:n}),name);return p;}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);
const until=async(p,c,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return Date.now()-t;}catch(e){}await p.waitForTimeout(250);}return -1;};
async function match(H,C){await H.evaluate(()=>window.__bf.net.host());await until(H,"NET.mode==='host'");const code=await ev(H,'NET.code');
  await C.evaluate(c=>window.__bf.net.join(c),code);await until(C,"NET.mode==='client'");await H.waitForTimeout(800);
  await C.evaluate(()=>{document.getElementById('play').click();document.getElementById('mpReady').click();});await until(H,'mpAllReady()');
  await H.evaluate(()=>{document.getElementById('play').click();document.getElementById('mpStart').click();});await until(C,"state==='play'");await C.waitForTimeout(1500);return code;}
const info=p=>ev(p,"JSON.stringify({mode:NET.mode,code:NET.code,state,err:NET.err,status:NET.status,off:NET.offline,menu:!$('menu').hidden,mp:!$('mp').hidden,inv:!!$('hInvite'),ss:[sessionStorage.getItem('bf.host'),sessionStorage.getItem('bf.room')]})");
async function invite(H,N,label){
  // the user taps Invite friends if visible, otherwise opens the lobby
  const s=await info(H);T(label+'_before',s);
  if(await H.evaluate(()=>!!document.getElementById('hInvite')))await H.evaluate(()=>{document.querySelector('#menu').hidden||0;document.getElementById('hInvite').click();});
  else await H.evaluate(()=>document.getElementById('play').click());
  const hm=await until(H,"NET.mode==='host'",30000);const code=await ev(H,'NET.code');
  await N.evaluate(c=>window.__bf.net.join(c),code);const j=await until(N,"NET.mode==='client'",45000);
  T(label,{hostMs:hm,code,joinMs:j,N:JSON.parse(await info(N)),H:JSON.parse(await info(H))});}
const only=process.argv[2]||'all';
// S1: host reloads mid-match, then invites someone new
if(only==='all'||only==='1'){const H=await mk('Host1'),F=await mk('Fr1');await match(H,F);
  await H.reload({waitUntil:'domcontentloaded'});await H.waitForTimeout(2500);const N=await mk('New1');await invite(H,N,'S1_hostReload');await b.contexts().forEach(c=>c.close());}
// S2: host closes the tab, opens the game again in a new tab
if(only==='all'||only==='2'){const H=await mk('Host2'),F=await mk('Fr2');await match(H,F);const ctx=H.ctx;await H.close();
  const H2=await mk('Host2',ctx);await H2.waitForTimeout(1000);const N=await mk('New2');await invite(H2,N,'S2_hostNewTab');}
// S3: friend (client) reloads mid-match and then wants to invite someone new
if(only==='all'||only==='3'){const H=await mk('Host3'),F=await mk('Fr3');await match(H,F);
  await F.reload({waitUntil:'domcontentloaded'});await F.waitForTimeout(5000);const N=await mk('New3');await invite(F,N,'S3_clientReload');}
// S4: client closes tab, opens new tab, invites
if(only==='all'||only==='4'){const H=await mk('Host4'),F=await mk('Fr4');await match(H,F);const ctx=F.ctx;await F.close();
  const F2=await mk('Fr4',ctx);const N=await mk('New4');await invite(F2,N,'S4_clientNewTab');}

const tapLeave=p=>p.evaluate(()=>{window.__bf.ev("toggleBoard(true);1");document.getElementById('boardLeave').click();});
// S5: friend leaves mid-match with the new button, then invites someone new to their own room
if(only==='all'||only==='5'){const H=await mk('Host5'),F=await mk('Fr5');await match(H,F);await tapLeave(F);await F.waitForTimeout(800);
  T('S5_left',{F:JSON.parse(await info(F)),hostRemotes:await ev(H,'NET.remotes.size'),hostState:await ev(H,'state')});
  const N=await mk('New5');await invite(F,N,'S5_clientLeaveInvite');await F.reload({waitUntil:'domcontentloaded'});await F.waitForTimeout(2500);T('S5_reloadStays',JSON.parse(await info(F)));}
// S6: host leaves mid-match, friend is told, host opens a new room for someone new
if(only==='all'||only==='6'){const H=await mk('Host6'),F=await mk('Fr6');await match(H,F);await tapLeave(H);await H.waitForTimeout(1500);
  T('S6_friend',JSON.parse(await info(F)));const N=await mk('New6');await invite(H,N,'S6_hostLeaveInvite');
  const tl=await until(H,"NET.remotes.size===1",5000);T('S6_errs',{H:H.errs,F:F.errs,N:N.errs,tl});}
// S7: friend taps the link while the host is still in WhatsApp (room not online for 35s)
if(only==='all'||only==='7'){const N=await mk('New7');const code='WAPP7';await N.evaluate(c=>window.__bf.net.join(c),code);await N.waitForTimeout(35000);
  T('S7_waiting',JSON.parse(await info(N)));const H=await mk('Host7');await H.evaluate(c=>window.__bf.ev("mpHost('"+c+"');1"),code);
  const j=await until(N,"NET.mode==='client'",30000);T('S7_joinedAfterHostBack',{j,N:JSON.parse(await info(N))});}
// S8: zombies room full of 4, one player's phone dies: a newcomer takes the slot without waiting
if(only==='all'||only==='8'){const H=await mk('Host8');await ev(H,"selectMap('zombie');1");await H.evaluate(()=>window.__bf.net.host());await until(H,"NET.mode==='host'");const code=await ev(H,'NET.code');
  const cs=[];for(const n of['A8','B8','C8']){const c=await mk(n);await c.evaluate(k=>window.__bf.net.join(k),code);await until(c,"NET.mode==='client'");cs.push(c);}
  await cs[0].ctx.close();await until(H,"[...NET.remotes.values()].some(x=>x.away)",20000);const N=await mk('New8');await N.evaluate(k=>window.__bf.net.join(k),code);
  const j=await until(N,"NET.mode==='client'",20000);T('S8_fullEvictAway',{isZ:await ev(H,'isZ()'),j,err:await ev(N,'NET.err'),remotes:await ev(H,'NET.remotes.size')});}
// S9: main screen Close room button
if(only==='all'||only==='9'){const H=await mk('Host9');await H.evaluate(()=>window.__bf.net.host());await until(H,"NET.mode==='host'");await H.evaluate(()=>{document.getElementById('mp').hidden=true;window.__bf.ev('renderHome();1');document.getElementById('hLeave').click();});
  T('S9_closeRoom',{mode:await ev(H,'NET.mode'),inv:await H.evaluate(()=>!!document.getElementById('hInvite')),errs:H.errs});}
await b.close();
