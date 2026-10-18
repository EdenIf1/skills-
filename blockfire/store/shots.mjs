import { chromium } from 'playwright';
const OUT='../repo-app/blockfire/store/screenshots';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const ctx=await b.newContext({viewport:{width:956,height:390},deviceScaleFactor:3,hasTouch:true,isMobile:true,serviceWorkers:'block'});
await ctx.addInitScript(()=>{localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'',key:''}));localStorage.setItem('blockfire.settings',JSON.stringify({quality:'high'}));});
const p=await ctx.newPage();p.on('pageerror',e=>console.log('ERR',e.message));await p.goto('http://127.0.0.1:8765/index.html');await p.waitForTimeout(3000);
const ev=c=>p.evaluate(c=>window.__bf.ev(c),c);
await ev("profile.name='Eden';profile.gp=48250;profile.xp=52000;profile.owned=WORDER.slice();profile.skins=Object.keys(CHARS);profile.skin='night';profile.camos=Object.keys(CAMOS);profile.camo='dragon';profile.blocks=BUILD_KEYS.slice();profile.block='concrete';profile.titles=Object.keys(TITLES);profile.title='legend';profile.cards=Object.keys(CARDS);profile.card='galaxy';profile.killfxs=Object.keys(KILLFX);profile.killfx='goldrush';profile.att.ak47={optic:'holo',grip:true,mag:true};profile.bagLvl=3;saveProfile();renderProfile();1");
const caps={};let curCap=null;const capStrip=async(n,t,sub)=>{const cp=await b.newPage({viewport:{width:956,height:50},deviceScaleFactor:3});
  await cp.goto('http://127.0.0.1:8765/privacy.html');
  await cp.evaluate(([t,sub])=>{document.head.innerHTML='<link rel="stylesheet" href="fonts.css"><style>html,body{margin:0;padding:0;background:#07090d;height:50px;overflow:hidden}div{height:50px;display:flex;align-items:center;justify-content:center;gap:14px;white-space:nowrap;background:linear-gradient(90deg,#07090d,#141b25 30%,#141b25 70%,#07090d)}b{font:500 31px Teko,sans-serif;color:#fff;letter-spacing:.04em;line-height:1;padding-top:5px}i{font:600 12.5px "Chakra Petch",sans-serif;color:#f3b54a;font-style:normal;letter-spacing:.04em}</style>';document.body.innerHTML=`<div><b>${t}</b><i>${sub}</i></div>`;},[t,sub]);
  await cp.evaluate(()=>document.fonts.ready);await cp.waitForTimeout(400);await cp.screenshot({path:`${OUT}/_cap-${n}.png`});await cp.close();};
const cap=async(t,sub)=>{curCap=[t,sub];};
const _unused=async(t,sub)=>p.evaluate(([t,sub])=>{let d=document.getElementById('__cap');if(!d){d=document.createElement('div');d.id='__cap';document.body.appendChild(d);}
  d.style.cssText='position:fixed;left:0;right:0;top:0;z-index:9999;padding:14px 22px 26px;background:linear-gradient(180deg,rgba(7,9,13,.86),rgba(7,9,13,0));pointer-events:none;font-family:Teko,sans-serif;color:#fff;text-align:center';
  d.innerHTML=`<div style="font-size:40px;line-height:1;letter-spacing:.04em">${t}</div>${sub?`<div style="font-family:'Chakra Petch',sans-serif;font-size:15px;color:#f3b54a;letter-spacing:.06em;margin-top:2px">${sub}</div>`:''}`;},[t,sub]);
const hideToasts=()=>p.evaluate(()=>{document.querySelectorAll('.toast').forEach(t=>t.remove());for(const el of document.querySelectorAll('#tip,#protTag'))el.style.visibility='hidden';for(const id of ['toast','msgs','feed'])if(document.getElementById(id))document.getElementById(id).style.visibility='hidden';});
const shot=async n=>{await p.screenshot({path:`${OUT}/_game-${n}.png`});await capStrip(n,curCap[0],curCap[1]);console.log('shot',n);};
// 1 battle
await p.evaluate(()=>window.__bf.start('town'));await p.waitForTimeout(2500);
await ev(`(()=>{player.spawnProt=999;player.hp=100;for(const b of bots)if(b.team==='blue'){b.inMatch=false;b.alive=false;b.mesh.visible=false;}
  {const cx=Math.floor(MAP.center[0]),cz=Math.floor(MAP.center[2])+9;player.x=cx+.5;player.z=cz+.5;player.y=SY[cx+W*cz];}
  // look down the most open lane and put the enemy team in it
  const eye=player.y+1.6;let by=player.yaw,bl=0;for(let a=-Math.PI;a<Math.PI;a+=.05){const dx=-Math.sin(a),dz=-Math.cos(a),h=rayVoxel(player.x,eye,player.z,dx,-.02,dz,40,false),L=h?h.t:40;if(L>bl){bl=L;by=a;}}
  player.yaw=by;player.pitch=-.06;const dx=-Math.sin(by),dz=-Math.cos(by),rx=Math.cos(by),rz=-Math.sin(by);
  const e=bots.filter(b=>b.team==='red'&&b.alive).slice(0,4);const D=Math.min(bl-2,16);
  e.forEach((b,i)=>{const d=D*(.55+.15*i),s=(i%2?1:-1)*(1+i*.8);b.x=player.x+dx*d+rx*s;b.z=player.z+dz*d+rz*s;const g=SY[Math.floor(b.x)+W*Math.floor(b.z)];if(g>=0)b.y=g;b.path=null;b.target=player;b.alive=true;b.mesh.visible=true;b.spawnProt=0;b.yaw=Math.atan2(-(player.x-b.x),-(player.z-b.z));b.mesh.position.set(b.x,b.y,b.z);});
  scores.blue=23;scores.red=19;matchT=252;window.__lane=[by,bl];})();1`);
await p.waitForTimeout(1200);await hideToasts();await cap('6V6 TO 12V12 BLOCK WAR','19 modes · 9 maps · 45 guns · bots fill every spot');await shot('1-battle');
// 2 building
await ev("(()=>{buildLeft=60;const by=player.yaw,dx=-Math.sin(by),dz=-Math.cos(by),rx=Math.cos(by),rz=-Math.sin(by),y=Math.floor(player.y);for(let s=-2;s<=2;s++)for(let dy=0;dy<2;dy++){const x=Math.floor(player.x+dx*3.6+rx*s),z=Math.floor(player.z+dz*3.6+rz*s);if(!getV(x,y+dy,z))hostPlace(player,x,y+dy,z,dy?'brick':'concrete');}player.yaw=by+.5;player.pitch=-.22;worldDirty=true;buildHeld=true;})();1");
await p.waitForTimeout(1200);await cap('BUILD COVER MID-FIGHT','Dirt, glass, brick, concrete, steel · everything you build can be blown up');await shot('2-build');await ev('buildHeld=false;1');
// 3 zombies
await p.evaluate(()=>window.__bf.start('zombie'));await p.waitForTimeout(3000);await ev("player.spawnProt=999;player.hp=100;Z.breakT=0;1");await p.waitForTimeout(6000);
await ev("(()=>{if(zombies.filter(z=>z.alive).length<3)for(let i=0;i<3;i++)zSpawn(i===1?'brute':'walker',[player.x,player.y,player.z-6]);const zs=zombies.filter(z=>z.alive).slice(0,3);const dx=-Math.sin(player.yaw),dz=-Math.cos(player.yaw),rx=Math.cos(player.yaw),rz=-Math.sin(player.yaw);zs.forEach((z,i)=>{z.x=player.x+dx*(4.5+i*1.3)+rx*(i-1)*1.4;z.z=player.z+dz*(4.5+i*1.3)+rz*(i-1)*1.4;z.y=player.y;z.yaw=Math.atan2(-(player.x-z.x),-(player.z-z.z));});})();1");await p.waitForTimeout(800);await hideToasts();
await cap('HOLD THE HOUSE','Zombies with friends · board the windows · buy guns off the walls');await shot('3-zombies');
await ev("state='menu';['hud','touch'].forEach(id=>$(id).hidden=true);resetMatch(false);$('menu').hidden=false;1");await p.waitForTimeout(1500);
// 4 store preview
await p.evaluate(()=>{document.getElementById('openShop').click();document.querySelector('[data-tab=att]').click();});await p.waitForTimeout(500);
await p.evaluate(()=>{document.querySelector('[data-attgun=ak47]').click();});await p.waitForTimeout(300);await p.evaluate(()=>document.querySelector('[data-pv="att:acog"]').click());await p.waitForTimeout(1500);
await cap('SEE IT BEFORE YOU BUY IT','Live 3D preview of every scope, grip, magazine and camo');await shot('4-store');await p.evaluate(()=>document.getElementById('shopClose').click());
// 5 crate
await ev("window.__oldRoll=rollReward;rollReward=function(pity){if(pity)return Object.assign({},cratePool(4).find(x=>x.kind==='camo'&&x.v==='neon'),{dupe:false});return window.__oldRoll(false);};profile.gp=99999;1");
await p.evaluate(()=>{document.getElementById('openCrate').click();});await p.waitForTimeout(300);await p.evaluate(()=>document.getElementById('crateOpen').click());await p.waitForTimeout(4900);
await cap('SIX RARITIES OF LOOT','Camos, skins, blocks, titles, kill effects · odds always shown');await shot('5-crates');await ev("rollReward=window.__oldRoll;1");await p.evaluate(()=>document.getElementById('crateClose').click());
// 6 character
await p.evaluate(()=>{document.getElementById('openChar').click();document.querySelector('[data-ct=skins]').click();});await p.waitForTimeout(1800);
await cap('MAKE IT YOURS','Skins, gear with shields, titles and loadouts');await shot('6-character');await p.evaluate(()=>{const c=document.getElementById('charClose')||document.querySelector('#char .btn');c&&c.click();});
// 7 home
await ev("try{leaveMatch()}catch(e){};selectMap('junk');1");
await p.evaluate(()=>{document.querySelectorAll('.overlay').forEach(o=>{if(o.id!=='menu')o.hidden=true;});});await p.waitForTimeout(1500);
await cap('PLAY IN SECONDS','No sign-up needed · your progress is saved online');await shot('7-home');
await b.close();
