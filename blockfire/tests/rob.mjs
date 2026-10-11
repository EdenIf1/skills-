import { chromium } from 'playwright';
const URL='http://127.0.0.1:8765/index.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const R={};const T=(k,v)=>{R[k]=v;console.log(k,JSON.stringify(v));};
async function mk(name,init){const ctx=await b.newContext({viewport:{width:320,height:180},serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('blockfire.ps','127.0.0.1:9000');localStorage.setItem('blockfire.norender','1');});
  if(init)await ctx.addInitScript(init);
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message+' @ '+(e.stack||'').split('\n')[1]));p.ctx=ctx;
  await p.goto(URL,{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);await p.evaluate(n=>window.__bf.setProfile({name:n}),name);return p;}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);
const until=async(p,c,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return Date.now()-t;}catch(e){}await p.waitForTimeout(250);}return -1;};
const H=await mk('Hosty');await H.evaluate(()=>window.__bf.net.host());await until(H,"NET.mode==='host'");const code=await ev(H,'NET.code');
// 1 version mismatch: an "old" client
{const O=await mk('Oldie');await ev(O,"(()=>{const P=window.Peer.prototype.connect;window.Peer.prototype.connect=function(){const c=P.apply(this,arguments);const S=c.send.bind(c);c.send=m=>{if(m&&m.t==='hello')m.v=1;return S(m);};return c;};return 1;})()");
  await O.evaluate(c=>window.__bf.net.join(c),code);const ms=await until(O,"!!NET.err",20000);T('1_version',{ms,err:await ev(O,'NET.err'),hostRemotes:await ev(H,'NET.remotes.size')});await O.ctx.close();}
// join a normal client
const C=await mk('Buddy');await C.evaluate(c=>window.__bf.net.join(c),code);await until(C,"NET.mode==='client'");await H.waitForTimeout(800);
await C.evaluate(()=>{document.getElementById('play').click();document.getElementById('mpReady').click();});await until(H,'mpAllReady()');
await H.evaluate(()=>{document.getElementById('play').click();document.getElementById('mpStart').click();});await until(C,"state==='play'");await C.waitForTimeout(1500);
T('2_channels',{hostU:await ev(H,"[...NET.conns.keys()].map(c=>c.u&&c.u.readyState)"),clientU:await ev(C,"NET.host.u&&NET.host.u.readyState"),snapsFlow:await until(C,"performance.now()-NET.lastSnapAt<500",5000)>=0});
// 3 revive bug: host kills the friend; the friend must stay dead on the host until it respawns (and die only once)
await ev(H,"(()=>{const e=NET.remotes.get('P1');e.spawnProt=0;damage(e,999,null,false,'test','gas');return 1;})()");
await H.waitForTimeout(700);const d1=await ev(H,"(()=>{const e=NET.remotes.get('P1');return [e.alive,e.deaths]})()");
await H.waitForTimeout(4500);const d2=await ev(H,"(()=>{const e=NET.remotes.get('P1');return [e.alive,e.deaths]})()");
T('3_revive',{after700ms:d1,after5s:d2,clientAlive:await ev(C,'player.alive')});
// 4 bad data from the friend must not break the host
await ev(C,"(()=>{const c=NET.host;c.send({t:'st',p:['x',NaN,null],a:1,ev:new Array(5000).fill(['h','P0',1e9])});c.send({t:'cev',ev:[[1,2],['h','nobody',NaN],null,'x',['k','nuke'],['m',NaN,NaN,NaN,0]]});c.send({t:'st'});c.send({});c.send(null);return 1;})()");
await H.waitForTimeout(1200);T('4_baddata',{hostOk:await ev(H,"state==='play'&&Number.isFinite(player.hp)&&player.hp>0"),remotePos:await ev(H,"(()=>{const e=NET.remotes.get('P1');return [e.x,e.y,e.z].every(Number.isFinite)})()"),nuke:await ev(H,'nukeT>0'),hostErrs:H.errs.slice()});
// 5 loss: drop 40% of the friend's lossy-channel sends and add delay to its reliable sends
await ev(C,"(()=>{const u=NET.host.u;const S=u.send.bind(u);u.send=m=>{if(Math.random()<.4)return;S(m);};const c=NET.host;const R2=c.send.bind(c);c.send=m=>setTimeout(()=>R2(m),250);return 1;})()");
await ev(H,"(()=>{for(const c of NET.conns.keys()){const u=c.u;const S=u.send.bind(u);u.send=m=>{if(Math.random()<.4)return;S(m);};}return 1;})()");
await C.evaluate(()=>window.__bf.act.tp(20,20));await H.waitForTimeout(3000);
T('5_loss',{hostSeesMove:await ev(H,"(()=>{const e=NET.remotes.get('P1');return [Math.round(e.x),Math.round(e.z)]})()"),clientFresh:await until(C,"performance.now()-NET.lastSnapAt<700",4000)>=0});
// 6 world block changes stay identical under loss (explosions on the host)
await ev(H,"(()=>{for(let i=0;i<4;i++)explode(20+i*6,5,20,player,{r:2.7,dr:4,dmg:0,weapon:'test'});return 1;})()");await H.waitForTimeout(2500);
const hv=await ev(H,"(()=>{let h=0;for(let i=0;i<vox.length;i++)h=(h*31+vox[i])|0;return h})()"),cv=await ev(C,"(()=>{let h=0;for(let i=0;i<vox.length;i++)h=(h*31+vox[i])|0;return h})()");
T('6_world',{same:hv===cv,blk:await ev(H,'NET.blk.size')});
// 7 host goes to background: friends see a banner, host keeps simulating
await ev(H,"(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));return 1;})()");
const b0=await ev(H,'matchT');await H.waitForTimeout(3000);
T('7_hostAway',{banner:await C.evaluate(()=>!document.getElementById('netBanner').hidden&&document.getElementById('netBanner').textContent),hostClockMoved:+(b0-(await ev(H,'matchT'))).toFixed(1)});
await ev(H,"(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));return 1;})()");await C.waitForTimeout(1200);
T('7b_back',{bannerGone:await C.evaluate(()=>document.getElementById('netBanner').hidden)});
// 8 friend reloads the page mid-match: comes back to the same slot automatically
const kd0=await ev(H,"(()=>{const e=NET.remotes.get('P1');return [e.kills,e.deaths,e.team]})()");
await C.reload({waitUntil:'domcontentloaded'});
const back=await until(C,"NET.mode==='client'&&state==='play'",40000);
T('8_reload',{msBack:back,nid:await ev(C,'NET.nid'),hostRemotes:await ev(H,'[...NET.remotes.keys()]'),kdBefore:kd0,kdAfter:await ev(H,"(()=>{const e=NET.remotes.get('P1');return e&&[e.kills,e.deaths,e.team]})()")});
// 9 friend's page dies without a goodbye: host marks them away fast and frees the slot after the grace period
await C.ctx.close();const t9=Date.now();
const away=await until(H,"(()=>{const e=NET.remotes.get('P1');return e&&e.away>0})()",20000);
const gone=await until(H,"!NET.remotes.has('P1')",45000);
T('9_abrupt',{msToAway:away,msToRemoved:gone<0?-1:away+gone});
// 10 host loses the game server: the match keeps running and a new friend can still join
const C2=await mk('Late');await ev(H,'NET.peer.disconnect();1');await H.waitForTimeout(1500);
await C2.evaluate(c=>window.__bf.net.join(c),code);const j=await until(C2,"NET.mode==='client'&&state==='play'",45000);
T('10_signalDrop',{lateJoinMs:j,hostOffline:await ev(H,'NET.offline'),hostState:await ev(H,'state')});
// 11 connection test button runs
await H.evaluate(()=>{window.__bf.ev('state="menu";$("hud").hidden=true;openLobby();1');});await ev(H,'netDiag();1');await until(H,"NET.diag&&NET.diag.length>3",30000);
T('11_diag',await ev(H,'JSON.stringify(NET.diag)'));
// 12 host closes the room: friend gets a clear message
await ev(H,'mpLeave(false);1');const cl=await until(C2,"!NET.mode&&!!NET.err",15000);T('12_hostClose',{ms:cl,err:await ev(C2,'NET.err')});
T('errors',{H:H.errs,C2:C2.errs});
await b.close();
