// App Store preview: real gameplay captured frame by frame at a steady 30 fps (1920x886, iPhone 6.9")
// then: ffmpeg -framerate 30 -i ../vid/f%05d.jpg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -shortest -vf "scale=1920:886,format=yuv420p" -c:v libx264 -profile:v high -level 4.0 -crf 18 -r 30 -c:a aac -b:a 256k -movflags +faststart preview-1920x886.mp4
import { chromium } from 'playwright';
const OUT='../vid',U=process.env.U||'http://127.0.0.1:8765/dev.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const ctx=await b.newContext({viewport:{width:960,height:443},deviceScaleFactor:2,hasTouch:true,isMobile:true,serviceWorkers:'block'});
await ctx.addInitScript(()=>{localStorage.setItem('blockfire.nodeal','1');localStorage.setItem('blockfire.fastload','1');localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'',key:''}));localStorage.setItem('blockfire.settings',JSON.stringify({quality:'high'}));
  const real=window.requestAnimationFrame.bind(window);window.__raf=[];window.__manual=false;window.__t=0;
  window.requestAnimationFrame=cb=>{if(window.__manual){window.__raf.push(cb);return 1;}return real(cb);};
  window.__adv=()=>{const q=window.__raf;window.__raf=[];window.__t+=1000/30;for(const cb of q){try{cb(window.__t);}catch(e){}}if(window.__each)try{window.__each();}catch(e){}};});
const p=await ctx.newPage();p.on('pageerror',e=>console.log('ERR',e.message));await p.goto(U);await p.waitForTimeout(3000);
const ev=c=>p.evaluate(c=>window.__bf.ev(c),c);
await ev("profile.name='Ranger';profile.gp=148250;profile.xp=52000;profile.owned=WORDER.slice();profile.skins=Object.keys(CHARS);profile.skin='samurai';profile.tutDone=true;profile.slots[0]='tempest';ST().matches=40;saveProfile();1");
let n=0;const cap=(t,sub)=>p.evaluate(([t,sub])=>{let d=document.getElementById('__cap');if(!d){d=document.createElement('div');d.id='__cap';document.body.appendChild(d);}
  d.style.cssText='position:fixed;left:0;right:0;top:0;z-index:9999;padding:10px 22px 24px;background:linear-gradient(180deg,rgba(7,9,13,.85),rgba(7,9,13,0));pointer-events:none;font-family:Teko,sans-serif;color:#fff;text-align:center';
  d.innerHTML=t?`<div style="font-size:38px;line-height:1;letter-spacing:.04em">${t}</div>${sub?`<div style="font-family:'Chakra Petch',sans-serif;font-size:14px;color:#f3b54a;letter-spacing:.06em;margin-top:2px">${sub}</div>`:''}`:'';d.style.display=t?'block':'none';},[t,sub]);
const hide=()=>p.evaluate(()=>{for(const id of ['toast','protTag','tip','zTip'])if(document.getElementById(id))document.getElementById(id).style.visibility='hidden';});
const rec=async(sec,fn)=>{for(let i=0,N=Math.round(sec*30);i<N;i++){if(fn)await fn(i);await p.evaluate(()=>window.__adv());await p.screenshot({path:`${OUT}/f${String(n++).padStart(5,'0')}.jpg`,type:'jpeg',quality:92});}console.log('frames',n);};
const manual=v=>p.evaluate(v=>{window.__manual=v;if(v)window.__t=performance.now();},v);
// auto-aim: turn smoothly toward the nearest living enemy and keep firing
const AIM=`window.__each=()=>{if(state!=='play')return;player.hp=player.maxHp||100;player.spawnProt=999;let best=null,bd=1e9;
  for(const e of bots){if(!e.alive||e.team===player.team||e.inMatch===false)continue;const d=Math.hypot(e.x-player.x,e.z-player.z);if(d<bd&&d<34){bd=d;best=e;}}
  if(isZ())for(const z of zombies){if(!z.alive)continue;const d=Math.hypot(z.x-player.x,z.z-player.z);if(d<bd&&d<30){bd=d;best=z;}}
  if(!best){fireHeld=false;return;}const dx=best.x-player.x,dz=best.z-player.z,dy=(best.y+1.2)-(player.y+1.6);
  const wy=Math.atan2(-dx,-dz),wp=Math.atan2(dy,Math.hypot(dx,dz));let d=wy-player.yaw;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
  player.yaw+=d*.18;player.pitch+=(wp-player.pitch)*.18;fireHeld=Math.abs(d)<.12;if(!fireHeld)firedThisPress=false;
  if(player.ammo===0&&!player.reloading&&typeof reload==='function')try{reload()}catch(e){}};1`;
// 1) team fight
await p.evaluate(()=>window.__bf.start('town'));await p.waitForTimeout(2500);
await ev(`(()=>{player.spawnProt=999;const cx=Math.floor(MAP.center[0]),cz=Math.floor(MAP.center[2])+9;player.x=cx+.5;player.z=cz+.5;player.y=SY[cx+W*cz];
  const eye=player.y+1.6;let by=player.yaw,bl=0;for(let a=-Math.PI;a<Math.PI;a+=.05){const dx=-Math.sin(a),dz=-Math.cos(a),h=rayVoxel(player.x,eye,player.z,dx,-.02,dz,40,false),L=h?h.t:40;if(L>bl){bl=L;by=a;}}
  player.yaw=by;player.pitch=-.04;const dx=-Math.sin(by),dz=-Math.cos(by),rx=Math.cos(by),rz=-Math.sin(by);const D=Math.min(bl-2,16);
  bots.filter(b=>b.team!==player.team&&b.alive).slice(0,4).forEach((b,i)=>{const d=D*(.55+.15*i),s=(i%2?1:-1)*(1+i*.8);b.x=player.x+dx*d+rx*s;b.z=player.z+dz*d+rz*s;const g=SY[Math.floor(b.x)+W*Math.floor(b.z)];if(g>=0)b.y=g;b.path=null;});})();1`);
await ev(AIM);await hide();await cap('FAST 6V6 BATTLES','45 guns · 10 maps · play with friends or bots');await manual(true);
await rec(7,async i=>{if(i%30===0)await hide();});
// 2) build cover
await ev("fireHeld=false;window.__each=()=>{player.spawnProt=999;player.hp=100;};buildLeft=60;1");await cap('BUILD COVER MID-FIGHT','Every block can be blown up');
await rec(4,async i=>{if(i%6===0&&i<60)await ev(`(()=>{const k=${i}/6|0;const by=player.yaw,dx=-Math.sin(by),dz=-Math.cos(by),rx=Math.cos(by),rz=-Math.sin(by),y=Math.floor(player.y);const s=(k%5)-2,dy=k<5?0:1;const x=Math.floor(player.x+dx*3.6+rx*s),z=Math.floor(player.z+dz*3.6+rz*s);if(!getV(x,y+dy,z))hostPlace(player,x,y+dy,z,profile.block||'dirt');})();1`);});
// 3) zombies
await manual(false);await p.evaluate(()=>window.__bf.start('zombie'));await p.waitForTimeout(3000);await ev("player.spawnProt=999;Z.breakT=0;1");await p.waitForTimeout(5000);
await ev(`(()=>{const eye=player.y+1.6;let by=player.yaw,bl=0;for(let a=-Math.PI;a<Math.PI;a+=.05){const h=rayVoxel(player.x,eye,player.z,-Math.sin(a),-.02,-Math.cos(a),14,false),L=h?h.t:14;if(L>bl){bl=L;by=a;}}
  player.yaw=by;player.pitch=-.05;const dx=-Math.sin(by),dz=-Math.cos(by),rx=Math.cos(by),rz=-Math.sin(by);const D=Math.max(3,Math.min(bl-1.5,8));
  for(const z of zombies)if(z.alive){z.alive=false;if(z.mesh)z.mesh.visible=false;}
  for(let i=0;i<4;i++)zSpawn(i===1?'brute':'walker',[player.x+dx*(D+i*.6)+rx*((i%2?1:-1)*(.6+i*.4)),player.y,player.z+dz*(D+i*.6)+rz*((i%2?1:-1)*(.6+i*.4))]);})();1`);
await ev(AIM);await hide();await cap('HOLD THE HOUSE','Zombies with friends · board the windows');await manual(true);await rec(5,async i=>{if(i%30===0)await hide();});
// 4) crate
await ev("window.__each=null;fireHeld=false;state='menu';['hud','touch'].forEach(id=>$(id).hidden=true);resetMatch(false);$('menu').hidden=false;1");await manual(false);await p.waitForTimeout(1500);
await ev("window.__oldRoll=rollReward;rollReward=function(pity){if(pity)return Object.assign({},cratePool(4).find(x=>x.kind==='camo'&&x.v==='neon'),{dupe:false});return window.__oldRoll(false);};1");
await cap('','');await p.evaluate(()=>document.getElementById('openCrate').click());await p.waitForTimeout(300);
await manual(true);await p.evaluate(()=>document.getElementById('crateOpen').click());await rec(5);await ev("rollReward=window.__oldRoll;1");await p.evaluate(()=>document.getElementById('crateClose').click());
// 5) season pass
await ev("profile.season={id:seasonId(),xp:SEA_XP*7+900,got:[0,1,2,3]};openSeason();1");await cap('A FREE SEASON PASS EVERY MONTH','30 tiers of rewards for playing');await rec(3);
await ev("$('season').hidden=true;1");
// 6) home
await ev("for(const o of document.querySelectorAll('.overlay'))if(o.id!=='menu')o.hidden=true;try{profile.rule='tdm';selectMap('town');}catch(e){}renderProfile();1");await p.waitForTimeout(1200);await cap('PLAY IN SECONDS','Quick play · friends online · no sign-up needed');await rec(4);
await b.close();
