// monthly gift calendar: one gift a day, better every week, never weapons, crates keys work, fits the phone
import { chromium } from 'playwright';
const URL=process.env.U||'http://127.0.0.1:8766/index2.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
let fails=0;const CK=(ok,m)=>{console.log((ok?'  ok  ':'  FAIL ')+m);if(!ok)fails++;};
const ctx=await b.newContext({viewport:{width:852,height:393},hasTouch:true,isMobile:true});await ctx.addInitScript(()=>{localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'http://127.0.0.1:1',key:'x'}));localStorage.setItem('blockfire.norender','1');});
const P=await ctx.newPage();P.errs=[];P.on('pageerror',e=>P.errs.push(e.message));await P.goto(URL);await P.waitForTimeout(1800);
const ev=c=>P.evaluate(c=>window.__bf.ev(c),c);
CK(!(await ev("$('calDot').hidden")),'red dot on 🎁 when a gift is waiting');
const gp0=await ev('profile.gp');
await P.tap('#openCal');await P.waitForTimeout(300);
CK(!(await ev("$('cal').hidden")),'calendar opens');
const dim=await ev("new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()");
CK(await ev("$('calGrid').querySelectorAll('.cd').length")===dim,`one box per day of the month (${dim})`);
const fit=await ev("(()=>{const s=$('cal').querySelector('.sheet');return {sh:s.scrollHeight,ch:s.clientHeight,vh:innerHeight,r:s.getBoundingClientRect().bottom}})()");console.log('   fit',JSON.stringify(fit));
CK(fit.sh<=fit.ch+1&&fit.r<=fit.vh+1,'whole month fits an iPhone screen without scrolling');
await P.tap('#calGo');await P.waitForTimeout(300);
CK(await ev('profile.gp')===gp0+200&&await ev('profile.cal.n')===1,'day 1: +200 GP');
CK(await ev("!$('calGrid').querySelector('#calGo')")&&await ev("$('calDot').hidden"),'only one gift a day');
// walk through a whole month, one day at a time
const res=await ev(`(()=>{const out=[];const owned0=JSON.stringify(profile.owned)+JSON.stringify(profile.knives);
  for(let i=1;i<40;i++){profile.cal.last='x';const w=calClaim();if(!w)break;out.push(w.kind);}
  return {kinds:out,n:profile.cal.n,keys:profile.keys,gunsSame:JSON.stringify(profile.owned)+JSON.stringify(profile.knives)===owned0};})()`);
console.log('   month of gifts:',res.kinds.join(','));
CK(res.n===dim,'stops at the last day of the month');CK(res.gunsSame&&!res.kinds.includes('gun')&&!res.kinds.includes('knife'),'never a weapon');
CK(['camo','skin','blk','key','gp'].every(k=>res.kinds.includes(k)),'GP, crates, camos, skins and blocks all show up');
CK(res.keys>=14,'free crates add up ('+res.keys+')');
const gpd=await ev("CAL.filter(c=>c[0]==='gp').map(c=>c[1])");CK(gpd.every((v,i)=>!i||v>gpd[i-1]),'GP gifts grow through the month');
// crate keys open crates for free
await ev("$('cal').hidden=true;profile.daily.freeCrate=false;1");const k0=await ev('profile.keys'),g0=await ev('profile.gp');
await P.tap('#openCrate');await P.waitForTimeout(300);CK(/free/i.test(await ev("$('crateOpen').textContent")),'crate button says free while you have keys');
await P.tap('#crateOpen');await P.waitForTimeout(6500);
CK(await ev('profile.keys')===k0-1&&await ev('profile.gp')>=g0,'a key was used instead of GP');
await ev("$('crate').hidden=true;1");
// new month: starts again from day 1
await ev("profile.cal.m='1999-1';1");CK(await ev('calState().c.n')===0&&await ev('calState().can'),'a new month starts a new calendar');
// all cosmetics owned: the gift turns into GP, still never a weapon
await ev("profile.camos=Object.keys(CAMOS);1");CK(await ev("calPrize(5).kind")==='gp','owned camo turns into GP');
CK(P.errs.length===0,'no page errors '+P.errs);
console.log(fails?'RESULT FAIL '+fails:'RESULT ALL PASSED');await b.close();
