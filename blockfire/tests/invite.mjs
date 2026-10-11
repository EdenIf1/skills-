import { chromium } from 'playwright';
const BASE='http://127.0.0.1:8765/index.html';
const RELAY=process.argv[2]==='relay';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const T=(k,v)=>console.log((RELAY?'[relay] ':'[direct] ')+k,JSON.stringify(v));let fails=0;const CK=(ok,msg)=>{if(!ok){fails++;console.log('  FAIL',msg);}};
async function mk(name,url,relay){const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await ctx.addInitScript(r=>{localStorage.setItem('blockfire.ps','127.0.0.1:9000');localStorage.setItem('blockfire.norender','1');localStorage.setItem('blockfire.mq','ws://127.0.0.1:8883');if(r)localStorage.setItem('blockfire.forceRelay','1');},relay);
  await ctx.addInitScript(n=>{localStorage.setItem('bf.testname',n);},name);
  const p=await ctx.newPage();p.on('dialog',d=>d.accept());p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;
  await p.goto(url||BASE,{waitUntil:'domcontentloaded'});await p.waitForTimeout(1200);await p.evaluate(n=>window.__bf.setProfile({name:n}),name);return p;}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);
const until=async(p,c,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return Date.now()-t;}catch(e){}await p.waitForTimeout(200);}return -1;};
const click=(p,id)=>p.evaluate(id=>{const e=document.getElementById(id);if(!e)throw new Error('no #'+id);e.click();},id);
// 1 host taps Invite friends on the main screen and copies the link
const H=await mk('Host');await click(H,'hInvite');CK(await until(H,"NET.mode==='host'")>=0,'room did not open');
await until(H,"NET.rlHost&&NET.rlHost.mqs.some(m=>m.up)",8000);
const link=await H.evaluate(()=>document.getElementById('mpUrl').value);const code=await ev(H,'NET.code');
const local=BASE+link.slice(link.indexOf('#'));T('1_link',{link,code});CK(/#room-[A-Z0-9]{5}$/.test(link),'bad link');
// 2 friend opens the link: lands in the room by itself
let t0=Date.now();const F=await mk('Friend',local,RELAY);const jm=await until(F,"NET.mode==='client'",40000);
T('2_join',{ms:jm>=0?Date.now()-t0:-1,relay:await ev(F,'!!(NET.host&&NET.host.relay)'),lobbyOpen:await F.evaluate(()=>!document.getElementById('mp').hidden),hostRoster:await ev(H,"NET.roster.map(r=>r.name)")});
CK(jm>=0,'friend did not join');CK(await ev(F,'!!(NET.host&&NET.host.relay)')===RELAY,'wrong route');
// 3 lobby: friend sees host + itself, readies; host sees ready and starts
await H.waitForTimeout(700);T('3_lobby',{friendRoster:await ev(F,"NET.roster.map(r=>r.name+(r.rd?'✓':''))"),friendHostName:await ev(F,'NET.hostName')});
await click(F,'mpReady');CK(await until(H,'mpAllReady()',5000)>=0,'host never saw ready');
await click(H,'mpStart');const sm=await until(F,"state==='play'",8000);CK(sm>=0,'match did not start on friend');T('3_start',{ms:sm});
await F.waitForTimeout(1500);
// 4 play: movement both ways, snapshots flowing, damage from friend reaches host and back
await F.evaluate(()=>window.__bf.act.tp(30,30));await H.evaluate(()=>window.__bf.act.tp(10,10));await H.waitForTimeout(1500);
const fpos=await ev(H,"(()=>{const e=NET.remotes.get('P1');return e&&[Math.round(e.x),Math.round(e.z)]})()"),hpos=await ev(F,"(()=>{const e=[...NET.remotes.values()].find(x=>x.nid==='P0')||ents.find(x=>x.nid==='P0');return e&&[Math.round(e.x),Math.round(e.z)]})()");
T('4_positions',{hostSeesFriend:fpos,friendSeesHost:hpos});CK(fpos&&fpos[0]===30&&fpos[1]===30,'host does not see friend move');
const snapLen=await ev(H,'JSON.stringify(hostSnap()).length');
const rate=await F.evaluate(async()=>{const s0=window.__bf.ev('NET.lastSnapAt');let n=0,last=s0;const t=performance.now();while(performance.now()-t<3000){await new Promise(r=>setTimeout(r,20));const x=window.__bf.ev('NET.lastSnapAt');if(x!==last){n++;last=x;}}return n/3;});
T('4_snaps',{perSec:+rate.toFixed(1),snapBytes:snapLen,ping:await ev(F,'NET.ping')});CK(rate>5,'snapshots too slow');
// friend shoots the host
const hp0=await ev(H,'player.hp');await F.evaluate(()=>window.__bf.ev("(()=>{const h=[...NET.remotes.values()].find(x=>x.nid==='P0')||ents.find(x=>x.nid==='P0');netOut(['h','P0',30,0,'kv47']);return 1})()"));await H.waitForTimeout(1200);
const hp1=await ev(H,'player.hp');T('4_hit',{hostHpBefore:hp0,after:hp1});
// host hits friend
await ev(H,"(()=>{for(const b of bots){b.inMatch=false;b.alive=false;b.mesh.visible=false;}return 1})()");await until(F,'player.alive&&player.hp>50',12000);await F.waitForTimeout(300);const fh0=await ev(F,'player.hp');await ev(H,"(()=>{const e=NET.remotes.get('P1');e.spawnProt=0;damage(e,40,null,false,'test','gas');return 1})()");await F.waitForTimeout(1200);
await F.waitForTimeout(200);const fh1=await ev(F,'player.hp');T('4_hostHitsFriend',{before:fh0,after:fh1});CK(fh1<fh0,'friend took no damage from host');
// 5 second friend joins the running match with the same link
const G=await mk('Second',local,RELAY);const gj=await until(G,"NET.mode==='client'&&state==='play'",40000);T('5_lateJoin',{ms:gj,remotes:await ev(H,'NET.remotes.size')});CK(gj>=0,'late joiner did not get into the match');
// 6 friend leaves mid-match with the button; host slot frees; friend can open own room and host can still take new people
await F.evaluate(()=>{window.__bf.ev('toggleBoard(true);1');document.getElementById('boardLeave').click();});
const fr=await until(H,"!NET.remotes.has('P1')",6000);T('6_leave',{hostFreed:fr,friendMode:await ev(F,'NET.mode'),friendOnMenu:await F.evaluate(()=>!document.getElementById('menu').hidden)});CK(fr>=0,'slot not freed');
await click(F,'hInvite');CK(await until(F,"NET.mode==='host'")>=0,'friend could not open own room');
const N=await mk('Newbie',BASE+'#room-'+(await ev(F,'NET.code')),RELAY);const nj=await until(N,"NET.mode==='client'",40000);T('6_newRoom',{ms:nj});CK(nj>=0,'new friend could not join the new room');
// 7 end of match and rematch on host room
await ev(H,'endMatch(false);1');await H.waitForTimeout(800);CK(await ev(G,"state==='end'"),'late joiner did not see end');
await H.evaluate(()=>document.getElementById('again').click());await H.waitForTimeout(800);
T('7_end',{hostLobby:await H.evaluate(()=>!document.getElementById('mp').hidden),gState:await ev(G,'state')});
const errs={H:H.errs,F:F.errs,G:G.errs,N:N.errs};T('errors',errs);CK(Object.values(errs).every(e=>e.length===0),'page errors');
console.log(fails?`RESULT ${fails} FAILED`:'RESULT ALL PASSED');await b.close();process.exit(fails?1:0);
