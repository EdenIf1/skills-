// armory: level-gated guns, knives, grenades, airstrike call-in (solo + multiplayer)
import { chromium } from 'playwright';
const URL=process.env.U||'http://127.0.0.1:8766/index2.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
let fails=0;const CK=(ok,m)=>{console.log((ok?'  ok  ':'  FAIL ')+m);if(!ok)fails++;};
async function mk(n,touch){const ctx=await b.newContext({viewport:{width:852,height:393},hasTouch:!!touch,isMobile:!!touch});await ctx.addInitScript(()=>{localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'http://127.0.0.1:1',key:'x'}));localStorage.setItem('blockfire.norender','1');localStorage.setItem('blockfire.ps','127.0.0.1:9000');});
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.goto(URL);await p.waitForTimeout(1800);if(n)await p.evaluate(n=>window.__bf.setProfile({name:n}),n);return p;}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);const until=async(p,c,ms=15000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return true;}catch(e){}await p.waitForTimeout(200);}return false;};
const xpAt=L=>{let s=0;for(let l=1;l<L;l++)s+=600*(l+1);return s;};

const P=await mk('Arms');
console.log('-- new player');
CK(JSON.stringify(await ev(P,'profile.owned'))==='["ak47","p9"]','starts with KV-47 + P9 Sidearm');
CK(await ev(P,'myLevel()')===1,'level 1');
CK(await ev(P,'WORDER.length')===20&&await ev(P,'WORDER.every(id=>WEAPONS[id])'),'20 guns in the store');
CK(await ev(P,"Object.keys(EQUIP).length")===5,'5 grenades');CK(await ev(P,"KNIVES.length")===3,'3 knives');
await ev(P,"shopTab='guns';renderShop();$('shop').hidden=false;1");
let info=await ev(P,"({items:$('shopGrid').querySelectorAll('.item').length,locked:$('shopGrid').querySelectorAll('.item.locked').length,buy:$('shopGrid').querySelectorAll('[data-buy]').length})");
console.log('   level 1 store',JSON.stringify(info));CK(info.items===23&&info.locked===20&&info.buy===0,'level 1: everything else is locked, nothing to buy');
await ev(P,"profile.gp=99999;document.dispatchEvent(new Event('x'));1");
// a forged click on a locked gun does nothing
await ev(P,"{const bt=document.createElement('button');bt.dataset.buy='awm';$('shopGrid').appendChild(bt);bt.click();}1");
CK(!(await ev(P,"profile.owned.includes('awm')")),'locked gun cannot be bought even by a forged button');
console.log('-- level 2 and 5');
await ev(P,`profile.xp=${xpAt(2)};renderShop();1`);CK(await ev(P,'myLevel()')===2&&await ev(P,"profile.owned.includes('m4a1')"),'level 2 hands over the MK-4 for free');
await ev(P,`profile.xp=${xpAt(5)};renderShop();1`);info=await ev(P,"[...$('shopGrid').querySelectorAll('[data-buy]')].map(b=>b.dataset.buy)");console.log('   buyable at 5',info);
CK(info.includes('spas')&&info.includes('deagle')&&info.includes('mp5')&&!info.includes('hornet'),'level 5 opens Breaker, Magnum, PX-9 but not Hornet');
const note=await ev(P,`levelUpNote(levelInfo(0),levelInfo(${xpAt(5)}))`);console.log('   level-up note:',note.replace(/<[^>]+>/g,' | '));CK(/NEW IN STORE/.test(note)&&/Breaker 12/.test(note),'end screen names the new guns');
await ev(P,"$('shopGrid').querySelector('[data-buy=spas]').click();1");CK(await ev(P,"profile.owned.includes('spas')"),'buying an open gun works');
console.log('-- every gun, knife, camo and attachment builds and has a picture');
const bad=await ev(P,`(()=>{const out=[];for(const id of WORDER.concat(KNIVES,['minigun','flamer'])){for(const c of ['none','gold','tiger']){try{const g=gunMesh(id,c,false,attOf(id));const u=g.userData;if(!isFinite(u.muzzle)||!u.grip||!u.fore||u.grip.some(v=>!isFinite(v)))out.push(id+' ud');freeObj(g);}catch(e){out.push(id+' '+e.message);}}
  for(const k of (ATT_OK[id]||[])){try{const a={optic:ATT[k].optic?k:'iron',mag:k==='mag',grip:k==='grip'};const g=gunMesh(id,'none',true,a);freeObj(g);}catch(e){out.push(id+'/'+k+' '+e.message);}}}return out;})()`);
CK(bad.length===0,'models ok '+JSON.stringify(bad));
const thumbs=await ev(P,"WORDER.concat(KNIVES).filter(id=>!gunThumb(id,'none',null)).length");CK(thumbs===0,'every gun and knife has a store picture');
console.log('-- each gun fires in a match');
await ev(P,`profile.xp=${xpAt(45)};profile.owned=WORDER.slice();renderShop();1`);
const fired=[];
const WO=await ev(P,"WORDER");for(const id of WO){const r=await P.evaluate(id=>{const B=window.__bf;B.setProfile({slots:[id,'p9']});B.start('junk');B.act.god(true);const w=B.ev('curW()');const m0=B.ev('ammo[cur].mag');B.act.look(0,-.2);B.act.fire(true);B.sim(1.2);B.act.fire(false);return{id,w:w.id,m0,m1:B.ev('ammo[cur].mag'),proj:B.ev('projs.length')};},id);fired.push(r);if(!(r.w===id&&(r.m1<r.m0||id==='rpg')))CK(false,'did not fire '+JSON.stringify(r));}
CK(fired.length===20,'all 20 guns were fired');
console.log('-- knives');
await ev(P,`profile.knives=['knife'];profile.knife='knife';profile.xp=${xpAt(8)};shopTab='guns';renderShop();1`);
CK(await ev(P,"!!$('shopGrid').querySelector('[data-buyknife=machete]')&&!$('shopGrid').querySelector('[data-buyknife=karambit]')"),'level 8: Machete for sale, Karambit locked');
await ev(P,"$('shopGrid').querySelector('[data-buyknife=machete]').click();1");CK(await ev(P,"profile.knife")==='machete','machete bought and equipped');
await P.evaluate(()=>window.__bf.start('knife'));CK(await ev(P,"loadout[0]")==='machete','Knife Pit gives you your knife');
const stab=await P.evaluate(()=>{const B=window.__bf;B.act.god(true);const e=B.ev("bots.find(b=>b.alive&&b.team!==player.team)");B.ev("(()=>{for(const q of bots)q.spawnProt=0;const e=bots.find(b=>b.alive&&b.team!==player.team);for(const a of [0,1.57,3.14,4.71]){player.x=e.x+Math.sin(a)*1.6;player.z=e.z+Math.cos(a)*1.6;player.y=e.y;player.yaw=a;player.pitch=0;e.yaw=a;if(!collides(player.x,player.y,player.z)&&canSee(player,e))break;}meleeAttack();return 1})()");return B.ev("bots.filter(b=>b.team!==player.team&&b.hp<(b.maxHp||100)).length+bots.filter(b=>b.team!==player.team&&!b.alive).length");});
CK(stab>=1,'machete hits');
await P.evaluate(()=>window.__bf.start('junk'));await ev(P,"throwWeapon();1");CK(await ev(P,"curW().id")==='machete','dropping your gun leaves you with your own knife');
console.log('-- flashbang + impact grenade');
await P.evaluate(()=>window.__bf.start('junk'));
const fb=await ev(P,`(()=>{player.spawnProt=1e9;const e=bots.find(b=>b.alive&&b.team!==player.team);const x=e.x-Math.sin(e.yaw)*3,z=e.z-Math.cos(e.yaw)*3;throwNade(player,x,e.y+1.6,z,0,0,0,'flash');return 1})()`);
await P.evaluate(()=>window.__bf.sim(1.6));
const bl=await ev(P,"bots.filter(b=>b.team!==player.team&&b.blindT>0).length");CK(bl>=1,'flashbang blinds the enemy in front of it ('+bl+')');
CK(await ev(P,"bots.filter(b=>b.team===player.team&&b.blindT>0).length")===0,'teammates are never blinded');
await ev(P,`(()=>{const v=camVectors();throwNade(player,player.x+v.f[0]*2,player.y+1.6,player.z+v.f[2]*2,0,0,0,'flash');return 1})()`);await P.evaluate(()=>window.__bf.sim(1.6));
CK(await ev(P,'blindT')>0,'a flash in your own face blinds you');
await P.evaluate(()=>window.__bf.sim(4));CK(await ev(P,'blindT')===0&&await ev(P,"$('blind').style.opacity")==='0','your sight comes back');
await ev(P,`(()=>{throwNade(player,player.x,player.y+1.2,player.z,0,-6,0,'impact');return 1})()`);await P.evaluate(()=>window.__bf.sim(.4));CK(await ev(P,"projs.filter(g=>g.kind==='impact').length")===0,'impact grenade goes off on touch');
await ev(P,`profile.xp=${xpAt(1)};shopTab='gear';renderShop();1`);info=await ev(P,"({buy:[...$('shopGrid').querySelectorAll('[data-buyequip]')].map(b=>b.dataset.buyequip),lock:$('shopGrid').querySelectorAll('.item.locked').length,call:!!$('shopGrid').querySelector('[data-buycall]')})");
console.log('   gear at level 1',JSON.stringify(info));CK(!info.buy.includes('flash')&&!info.buy.includes('impact')&&!info.call,'level 1: flash, impact and airstrike locked');
console.log('-- airstrike call-in');
await ev(P,`profile.xp=${xpAt(10)};profile.calls=0;shopTab='gear';renderShop();1`);
await ev(P,"$('shopGrid').querySelector('[data-buycall]').click();1");CK(await ev(P,'profile.calls')===1,'bought one airstrike');
await P.evaluate(()=>window.__bf.start('junk'));CK(!(await ev(P,'callReady()')),'not ready before 3 kills');
await ev(P,"player.kills=3;1");await P.evaluate(()=>window.__bf.sim(.2));CK(await ev(P,'callReady()'),'ready after 3 kills');
CK(!(await ev(P,"$('airHint').hidden")),'desktop hint shows "T · AIRSTRIKE"');
const k0=await ev(P,"bots.filter(b=>b.team!==player.team).reduce((s,b)=>s+b.deaths,0)");
await P.keyboard.press('t');await P.evaluate(()=>window.__bf.sim(3.5));
CK(await ev(P,'profile.calls')===0&&await ev(P,'callUsed'),'used: charge spent, once per match');
await ev(P,"profile.calls=2;1");await P.keyboard.press('t');CK(await ev(P,'profile.calls')===2,'second call in the same match is refused');
await ev(P,"state='menu';1");
console.log('-- crates stay near your level');
await ev(P,`profile.xp=0;1`);CK(await ev(P,"cratePool(4).filter(p=>p.kind==='gun').every(p=>gunReq(p.v)<=11)"),'legendary crate guns are at most 10 levels ahead');
CK(await ev(P,"cratePool(3).some(p=>p.kind==='knife'&&p.v==='machete')&&cratePool(4).some(p=>p.kind==='knife'&&p.v==='karambit')"),'knives can drop from crates');
console.log('errs P',P.errs);CK(P.errs.length===0,'no page errors (solo)');

console.log('-- touch: the airstrike button');
const T=await mk('Touchy',true);await ev(T,`profile.xp=${xpAt(10)};profile.calls=1;1`);await T.evaluate(()=>window.__bf.start('junk'));await ev(T,"player.kills=3;1");await T.evaluate(()=>window.__bf.sim(.2));
CK(!(await ev(T,"tl.querySelector('[data-b=air]').hidden")),'✈ AIR button appears on touch screens');
const box=await T.evaluate(()=>{const r=document.querySelector('[data-b=air]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width};});
await T.touchscreen.tap(box.x,box.y);await T.waitForTimeout(200);CK(await ev(T,'profile.calls')===0,'tapping it calls the strike');
CK(T.errs.length===0,'no page errors (touch) '+T.errs);

console.log('-- multiplayer: a friend calls an airstrike and throws a flashbang, the host checks it');
const H=await mk('Host');await H.evaluate(()=>window.__bf.net.host());await until(H,"NET.mode==='host'");const code=await ev(H,'NET.code');
const C=await mk('Friend');await ev(C,`profile.xp=${xpAt(12)};profile.calls=2;profile.equipOwn=['frag','flash'];profile.equip='flash';1`);
await C.evaluate(c=>window.__bf.net.join(c),code);await until(C,"NET.mode==='client'");await C.waitForTimeout(800);
await H.evaluate(()=>{document.getElementById('play').click();});await C.evaluate(()=>{document.getElementById('play').click();});await C.waitForTimeout(300);
await C.evaluate(()=>document.getElementById('mpReady').click());await until(H,'mpAllReady()');await H.evaluate(()=>document.getElementById('mpStart').click());await until(C,"state==='play'");await C.waitForTimeout(800);
const nid=await ev(C,'NET.nid');
await ev(C,"player.kills=3;1");await ev(C,"callAir();1");await C.waitForTimeout(600);
CK(await ev(H,`(findNid('${nid}')||{}).callMid`)!==await ev(H,'matchId'),'host refuses a call from a friend with fewer than 3 kills');
await ev(H,`findNid('${nid}').kills=3;1`);await until(C,'player.kills>=3');await ev(C,"callUsed=false;callAir();1");await C.waitForTimeout(800);
CK(await ev(H,`findNid('${nid}').callMid`)===await ev(H,'matchId'),'host runs the airstrike after 3 kills');
await ev(C,"callUsed=false;netOut(['k','call']);1");await C.waitForTimeout(500);
// flash a friend: the host tells them
await ev(H,`netSendTo(findNid('${nid}'),{t:'blind',v:2});1`);await C.waitForTimeout(500);CK(await ev(C,'blindT')>0,'a friend gets blinded when the host says so');
await ev(H,`netSendTo(findNid('${nid}'),{t:'blind',v:'x'});1`);await C.waitForTimeout(300);CK(C.errs.length===0,'junk blind message is harmless');
// the friend's flashbang is thrown by the host as a flashbang
await ev(C,"nades=1;playerNade();1");await H.waitForTimeout(400);const kinds=await ev(H,"projs.filter(g=>g.type==='nade').map(g=>g.kind)");CK(kinds.includes('flash'),'friend flashbang flies on the host ('+kinds+')');
await ev(C,"netOut(['n','bogus',1,1,1,0,0,0]);1");await H.waitForTimeout(400);CK(await ev(H,"projs.every(g=>g.type!=='nade'||EQUIP[g.kind])"),'a made-up grenade becomes a frag');
console.log('errs H',H.errs,'C',C.errs);CK(H.errs.length===0&&C.errs.length===0,'no page errors (multiplayer)');
console.log(fails?'RESULT FAIL '+fails:'RESULT ALL PASSED');await b.close();
