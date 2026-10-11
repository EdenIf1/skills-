// movable touch buttons: drag in Settings, saved, used in the match, scales to other screens, reset
import { chromium } from 'playwright';
const URL=process.env.U||'http://127.0.0.1:8766/index2.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
let fails=0;const CK=(ok,m)=>{console.log((ok?'  ok  ':'  FAIL ')+m);if(!ok)fails++;};
const ctx=await b.newContext({viewport:{width:852,height:393},hasTouch:true,isMobile:true});await ctx.addInitScript(()=>{localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'http://127.0.0.1:1',key:'x'}));localStorage.setItem('blockfire.norender','1');});
const P=await ctx.newPage();P.errs=[];P.on('pageerror',e=>P.errs.push(e.message));await P.goto(URL);await P.waitForTimeout(1800);
const ev=c=>P.evaluate(c=>window.__bf.ev(c),c);
const rect=async k=>P.evaluate(k=>{const el=k==='w'?document.getElementById('wpills'):document.querySelector(`#touch [data-b=${k}]`);const r=el.getBoundingClientRect();return{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};},k);
await P.evaluate(()=>window.__bf.start('junk'));await P.waitForTimeout(300);
const f0=await rect('fire'),j0=await rect('jump');console.log('   default FIRE',JSON.stringify(f0));
await ev("state='menu';$('hud').hidden=true;$('touch').hidden=true;$('menu').hidden=false;1");
await P.tap('#openSet');await P.waitForTimeout(200);CK(await ev("!!$('layEdit')"),'Settings has "Move buttons" on a phone');
await P.tap('#layEdit');await P.waitForTimeout(300);
CK(!(await ev("$('layEd').hidden")),'editor opens');const n=await ev("$('layPad').children.length");CK(n>=14,'every button can be moved ('+n+')');
const c=await P.evaluate(()=>{const r=document.querySelector('.layBtn[data-k=fire]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
await P.mouse.move(c.x,c.y);await P.mouse.down();await P.mouse.move(c.x-60,c.y-40,{steps:6});await P.mouse.move(c.x-120,c.y-80,{steps:6});await P.mouse.up();
// drag JUMP far off the screen: it must stop at the edge
const cj=await P.evaluate(()=>{const r=document.querySelector('.layBtn[data-k=jump]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
await P.mouse.move(cj.x,cj.y);await P.mouse.down();await P.mouse.move(cj.x+900,cj.y+900,{steps:8});await P.mouse.up();
await P.tap('#layDone');await P.waitForTimeout(200);
console.log('   saved',JSON.stringify(await ev('SET.lay')));
CK(await ev("$('layEd').hidden&&!$('settings').hidden"),'Done goes back to Settings');
await ev("$('settings').hidden=true;1");await P.evaluate(()=>window.__bf.start('junk'));await P.waitForTimeout(300);
const f1=await rect('fire'),j1=await rect('jump');console.log('   FIRE now',JSON.stringify(f1),'JUMP',JSON.stringify(j1));
CK(Math.abs(f1.x-(f0.x-120))<=3&&Math.abs(f1.y-(f0.y-80))<=3,'FIRE is where it was dragged');
CK(j1.x+j1.w<=852+1&&j1.y+j1.h<=393+1,'a button dragged off the edge stays on screen');
// the button still works where it is now
const hit=await P.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);const b=e&&e.closest('[data-b]');return b&&b.dataset.b;},[f1.x+f1.w/2,f1.y+f1.h/2]);CK(hit==='fire','a touch on the new spot hits FIRE ('+hit+')');
// reload: still there
await P.reload();await P.waitForTimeout(1800);await P.evaluate(()=>window.__bf.start('junk'));await P.waitForTimeout(300);const f2=await rect('fire');CK(Math.abs(f2.x-f1.x)<=2&&Math.abs(f2.y-f1.y)<=2,'layout kept after closing the app');
// another screen size: same place relative to the screen
await P.setViewportSize({width:932,height:430});await P.waitForTimeout(400);const f3=await rect('fire');const rx=(f1.x-f0.x)/852,rx3=await ev("SET.lay.fire[0]");console.log('   on 932x430 FIRE',JSON.stringify(f3));
CK(f3.x>=0&&f3.y>=0&&f3.x+f3.w<=932&&f3.y+f3.h<=430,'still on screen at another size');
await P.setViewportSize({width:852,height:393});await P.waitForTimeout(300);
// bigger buttons + moved: still where expected
await ev("SET.btnScale=1.2;applySettings();1");await P.waitForTimeout(200);const f4=await rect('fire');CK(f4.x>=0&&f4.x+f4.w<=852+2,'bigger buttons and a moved layout work together');
await ev("SET.btnScale=1;applySettings();1");
// reset
await ev("state='menu';$('hud').hidden=true;$('touch').hidden=true;$('menu').hidden=false;1");await P.tap('#openSet');await P.waitForTimeout(200);await P.tap('#layDef');await P.waitForTimeout(150);
await ev("$('settings').hidden=true;1");await P.evaluate(()=>window.__bf.start('junk'));await P.waitForTimeout(300);const f5=await rect('fire');CK(Math.abs(f5.x-f0.x)<=2&&Math.abs(f5.y-f0.y)<=2,'Reset puts everything back');
CK(P.errs.length===0,'no page errors '+P.errs);
console.log(fails?'RESULT FAIL '+fails:'RESULT ALL PASSED');await b.close();
