import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const T=(k,v)=>console.log(k,JSON.stringify(v));let fails=0;const CK=(ok,m)=>{if(!ok){fails++;console.log('  FAIL',m);}};
async function mk(name,touch){const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:!!touch,isMobile:!!touch,serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('blockfire.ps','127.0.0.1:9000');localStorage.setItem('blockfire.norender','1');localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'',key:''}));localStorage.setItem('blockfire.mq','ws://127.0.0.1:8883');});
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.ctx=ctx;await p.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);
  if(name)await p.evaluate(n=>window.__bf.setProfile({name:n}),name);return p;}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);
const until=async(p,c,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return Date.now()-t;}catch(e){}await p.waitForTimeout(200);}return -1;};
// aim down at the floor in front of you, then build
const aimDown="player.pitch=-1.05;player.vx=player.vz=0;1";
const place=async p=>{await ev(p,aimDown);await ev(p,"buildCD=0;buildHeld=true;1");await p.waitForTimeout(80);await ev(p,"buildHeld=false;placeBlock();1");await p.waitForTimeout(150);};
const nonAir="(()=>{let n=0;for(let i=0;i<vox.length;i++)if(vox[i])n++;return n})()";
// 1 solo TDM: build, shoot it down
const A=await mk('Builder');await A.evaluate(()=>window.__bf.start('junk'));await A.waitForTimeout(1200);
await ev(A,"for(const x of bots){x.inMatch=false;x.alive=false;x.mesh.visible=false;}player.spawnProt=99;1");
T('1_start',{left:await ev(A,'buildLeft'),hud:await A.evaluate(()=>document.getElementById('blocksHud').textContent)});
await place(A);const pb=await ev(A,'JSON.stringify([...PB.values()].map(b=>[b.x,b.y,b.z,b.hp]))');
T('1_place',{pb,left:await ev(A,'buildLeft'),id:await ev(A,'(()=>{const b=[...PB.values()][0];return b&&getV(b.x,b.y,b.z)})()')});CK(JSON.parse(pb).length===1,'block not placed');
// a block where you stand is refused
await ev(A,"(()=>{const x=Math.floor(player.x),z=Math.floor(player.z),y=Math.floor(player.y);return buildFree(x,y,z)})()").then(v=>{T('1_noSelf',!v);CK(v===false,'could build inside yourself');});
// shoot it until it breaks (rifle 29 dmg * .6 per bullet, dirt has 60)
const k0=await ev(A,'[...PB.values()][0]');for(let i=0;i<6;i++)await ev(A,`hitBlock(${k0.x},${k0.y},${k0.z},17);1`);
T('1_shot',{pb:await ev(A,'PB.size'),v:await ev(A,`getV(${k0.x},${k0.y},${k0.z})`)});CK(await ev(A,'PB.size')===0&&await ev(A,`getV(${k0.x},${k0.y},${k0.z})`)===0,'shot block not broken');
// run out of blocks
await ev(A,'buildLeft=1;1');await place(A);await ev(A,"for(const b of [...PB.values()]){set(b.x,b.y,b.z,0);}PB.clear();worldDirty=true;1");await place(A);
T('1_empty',{left:await ev(A,'buildLeft'),pb:await ev(A,'PB.size')});CK(await ev(A,'PB.size')===0,'built with an empty bag');
// 2 indestructible map: a grenade breaks what players built, never the map
await A.evaluate(()=>window.__bf.start('plant'));await A.waitForTimeout(1200);await ev(A,"for(const x of bots){x.inMatch=false;x.alive=false;x.mesh.visible=false;}player.spawnProt=99;player.hp=9999;1");
await place(A);await ev(A,'buildCD=0;player.yaw+=0.6;1');await place(A);await A.waitForTimeout(300);
const before=await ev(A,nonAir),n0=await ev(A,'PB.size');const c=await ev(A,'[...PB.values()][0]');
await ev(A,`explode(${c.x}+.5,${c.y}+.5,${c.z}+.5,player,{r:2.7,dr:4,dmg:0,weapon:'test'});1`);await A.waitForTimeout(300);
const after=await ev(A,nonAir);T('2_solid',{placedBefore:n0,placedAfter:await ev(A,'PB.size'),mapBlocksLost:before-n0-(after-await ev(A,'PB.size'))});
CK(n0>=1&&await ev(A,'PB.size')===0,'built blocks survived a grenade');CK(before-n0===after-(await ev(A,'PB.size')),'map broke on the indestructible map');
// concrete survives one grenade a bit further away
await ev(A,"profile.blocks=['dirt','concrete'];profile.block='concrete';buildLeft=20;1");await place(A);const cc=await ev(A,'[...PB.values()][0]');
await ev(A,`explode(${cc.x}+2.2,${cc.y}+.5,${cc.z}+.5,player,{r:2.7,dr:4,dmg:0,weapon:'test'});1`);T('2_concrete',{hpLeft:await ev(A,'[...PB.values()][0]&&[...PB.values()][0].hp')});CK(await ev(A,'PB.size')===1,'concrete did not survive');
// 3 zombies: no building
await A.evaluate(()=>window.__bf.start('zombie'));await A.waitForTimeout(1500);await place(A);
T('3_zombies',{pb:await ev(A,'PB.size'),btnHidden:await A.evaluate(()=>document.querySelector('[data-b=build]').hidden),hud:await A.evaluate(()=>document.getElementById('blocksHud').hidden)});CK(await ev(A,'PB.size')===0,'built in zombies');
T('errsA',A.errs);CK(!A.errs.length,'errors');
// 4 multiplayer: a friend builds, the host and a third player see it; the friend shoots it down; a late joiner sees the built block
const H=await mk('Host');await H.evaluate(()=>window.__bf.net.host());await until(H,"NET.mode==='host'");const code=await ev(H,'NET.code');
const C=await mk('Friend');await C.evaluate(c=>window.__bf.net.join(c),code);await until(C,"NET.mode==='client'");await H.waitForTimeout(600);
await C.evaluate(()=>{document.getElementById('play').click();document.getElementById('mpReady').click();});await until(H,'mpAllReady()');
await H.evaluate(()=>{document.getElementById('play').click();document.getElementById('mpStart').click();});await until(C,"state==='play'");await C.waitForTimeout(1500);
await ev(H,"for(const x of bots){x.inMatch=false;x.alive=false;x.mesh.visible=false;}1");await until(C,'player.alive',8000);
await place(C);await C.waitForTimeout(800);
const hp=await ev(H,'JSON.stringify([...PB.values()].map(b=>[b.x,b.y,b.z,b.hp]))'),cp=await ev(C,'JSON.stringify([...PB.values()].map(b=>[b.x,b.y,b.z]))');
T('4_friendBuilds',{host:hp,client:cp,clientLeft:await ev(C,'buildLeft')});CK(JSON.parse(hp).length===1&&JSON.parse(cp).length===1,'friend block not synced');
const L=await mk('Late');await L.evaluate(c=>window.__bf.net.join(c),code);await until(L,"NET.mode==='client'&&state==='play'",30000);await L.waitForTimeout(800);
const bb=JSON.parse(hp)[0];T('4_lateJoin',{v:await ev(L,`getV(${bb[0]},${bb[1]},${bb[2]})`),pb:await ev(L,'PB.size')});CK(await ev(L,`getV(${bb[0]},${bb[1]},${bb[2]})`)>0&&await ev(L,'PB.size')===1,'late joiner missing built block');
for(let i=0;i<5;i++){await ev(C,`hitBlock(${bb[0]},${bb[1]},${bb[2]},17);1`);await C.waitForTimeout(60);}await C.waitForTimeout(800);
T('4_friendBreaks',{host:await ev(H,'PB.size'),client:await ev(C,'PB.size'),late:await ev(L,'PB.size'),v:await ev(L,`getV(${bb[0]},${bb[1]},${bb[2]})`)});
CK(await ev(H,'PB.size')===0&&await ev(C,'PB.size')===0&&await ev(L,'PB.size')===0,'block not broken everywhere');
// a cheater cannot build far away or in someone
await ev(C,"netOut(['pb',5,10,5,'steel']);netOut(['pb',Math.floor(player.x),Math.floor(player.y),Math.floor(player.z),'dirt']);netOut(['pb',1e9,NaN,'x','nope']);1");await C.waitForTimeout(800);
T('4_cheat',{host:await ev(H,'PB.size')});CK(await ev(H,'PB.size')===0,'host accepted a bad build');
T('errs',{H:H.errs,C:C.errs,L:L.errs});CK(!H.errs.length&&!C.errs.length&&!L.errs.length,'errors');
// 5 touch layout in a match
const P=await mk('Thumb',true);await P.evaluate(()=>window.__bf.start('junk'));await P.waitForTimeout(1500);await P.screenshot({path:'../vid/build-touch.png'});
const ov=await P.evaluate(()=>{const r=e=>e.getBoundingClientRect(),bs=[...document.querySelectorAll('#touch .tb')].filter(e=>!e.hidden&&e.offsetParent);const out=[];for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const a=r(bs[i]),c=r(bs[j]);if(a.left<c.right-2&&c.left<a.right-2&&a.top<c.bottom-2&&c.top<a.bottom-2)out.push(bs[i].dataset.b+'/'+bs[j].dataset.b);}return out;});
T('5_overlaps',ov);CK(!ov.length,'touch buttons overlap');
console.log(fails?`RESULT ${fails} FAILED`:'RESULT ALL PASSED');await b.close();
