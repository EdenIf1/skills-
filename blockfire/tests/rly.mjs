import { chromium } from 'playwright';
const URL='http://127.0.0.1:8765/index.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const T=(k,v)=>console.log(k,JSON.stringify(v));
async function mk(name,init){const ctx=await b.newContext({viewport:{width:900,height:500},serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('blockfire.ps','127.0.0.1:9000');localStorage.setItem('blockfire.norender','1');localStorage.setItem('blockfire.mq','ws://127.0.0.1:8883');});
  if(init)await ctx.addInitScript(init);
  const p=await ctx.newPage();p.on('dialog',d=>d.accept());p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;
  await p.goto(URL,{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);await p.evaluate(n=>window.__bf.setProfile({name:n}),name);return p;}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);
const until=async(p,c,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return Date.now()-t;}catch(e){}await p.waitForTimeout(250);}return -1;};
const H=await mk('Hosty');await H.evaluate(()=>window.__bf.net.host());await until(H,"NET.mode==='host'");const code=await ev(H,'NET.code');
await until(H,"NET.rlHost&&NET.rlHost.mqs.some(m=>m.up)",8000);
// A: forced backup route
const C=await mk('Relayer',()=>localStorage.setItem('blockfire.forceRelay','1'));
await C.evaluate(c=>window.__bf.net.join(c),code);const j=await until(C,"NET.mode==='client'",30000);
T('A_join',{ms:j,relay:await ev(C,'!!(NET.host&&NET.host.relay)'),status:await ev(C,'NET.status'),err:await ev(C,'NET.err')});
await H.waitForTimeout(800);
await C.evaluate(()=>{document.getElementById('play').click();document.getElementById('mpReady').click();});await until(H,'mpAllReady()');
await H.evaluate(()=>{document.getElementById('play').click();document.getElementById('mpStart').click();});const st=await until(C,"state==='play'");await C.waitForTimeout(2000);
await C.evaluate(()=>window.__bf.act.tp(20,20));await H.waitForTimeout(1500);
T('A_play',{st,snaps:await until(C,"performance.now()-NET.lastSnapAt<500",5000)>=0,hostSees:await ev(H,"(()=>{const e=NET.remotes.get('P1');return e&&[Math.round(e.x),Math.round(e.z)]})()"),ping:await ev(C,'NET.ping')});
// B: host shoots/blocks: world sync
await ev(H,"(()=>{for(let i=0;i<3;i++)explode(20+i*6,5,20,player,{r:2.7,dr:4,dmg:0,weapon:'test'});return 1;})()");await H.waitForTimeout(2500);
const hv=await ev(H,"(()=>{let h=0;for(let i=0;i<vox.length;i++)h=(h*31+vox[i])|0;return h})()"),cv=await ev(C,"(()=>{let h=0;for(let i=0;i<vox.length;i++)h=(h*31+vox[i])|0;return h})()");T('B_world',{same:hv===cv});
// C: reload rejoin over the backup route
await C.reload({waitUntil:'domcontentloaded'});const back=await until(C,"NET.mode==='client'&&state==='play'",40000);
T('C_reload',{back,relay:await ev(C,'!!(NET.host&&NET.host.relay)'),remotes:await ev(H,'[...NET.remotes.keys()]')});
// D: direct link broken (candidates never reach the other side) -> falls back by itself
const D=await mk('Blocked',()=>{const O=window.RTCPeerConnection;const W=function(cfg,...r){return new O(Object.assign({},cfg||{},{iceServers:[],iceTransportPolicy:'relay'}),...r);};W.prototype=O.prototype;window.RTCPeerConnection=W;});
await D.evaluate(c=>window.__bf.net.join(c),code);const jd=await until(D,"NET.mode==='client'&&state==='play'",60000);
T('D_fallback',{ms:jd,relay:await ev(D,'!!(NET.host&&NET.host.relay)'),remotes:await ev(H,'NET.remotes.size')});
// E: leave match from the backup route; host frees the slot
await D.evaluate(()=>{window.__bf.ev("toggleBoard(true);1");document.getElementById('boardLeave').click();});const gone=await until(H,"NET.remotes.size===1",8000);
T('E_leave',{gone,dMode:await ev(D,'NET.mode')});
// F: abrupt close of relay client -> away detection
await C.ctx.close();const aw=await until(H,"[...NET.remotes.values()].every(x=>x.away)",20000);T('F_abrupt',{aw});
// G: diag shows backup route
await ev(H,'netDiag();1');await until(H,"NET.diag&&NET.diag[2][1]!=='checking…'",15000);T('G_diag',await ev(H,'JSON.stringify(NET.diag.slice(0,3))'));
T('errs',{H:H.errs,D:D.errs});await b.close();
