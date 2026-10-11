import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const T=(k,v)=>console.log(k,JSON.stringify(v));let fails=0;const CK=(ok,m)=>{if(!ok){fails++;console.log('  FAIL',m);}};
const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,serviceWorkers:'block'});
await ctx.addInitScript(()=>{localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'',key:''}));});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto('http://127.0.0.1:8765/index.html');await p.waitForTimeout(2500);
const ev=c=>p.evaluate(c=>window.__bf.ev(c),c);
// 1 the odds add up and the pools are never empty
T('1_odds',await ev('ODDS.reduce((a,b)=>a+b,0)'));CK(Math.abs(await ev('ODDS.reduce((a,b)=>a+b,0)')-100)<1e-9,'odds do not add to 100');
T('1_pools',await ev('[0,1,2,3,4,5].map(t=>cratePool(t).length)'));CK((await ev('[0,1,2,3,4,5].map(t=>cratePool(t).length)')).every(n=>n>0),'empty pool');
// 2 a big simulation: how often each rarity drops, with the pity counter on
const sim=await ev(`(()=>{profile.pity={e:0,l:0};const c=[0,0,0,0,0,0];let maxE=0,maxL=0,se=0,sl=0;for(let i=0;i<200000;i++){const w=rollReward(true);c[w.tier]++;profile.pity.e=w.tier>=3?0:profile.pity.e+1;profile.pity.l=w.tier>=4?0:profile.pity.l+1;se=w.tier>=3?0:se+1;sl=w.tier>=4?0:sl+1;maxE=Math.max(maxE,se);maxL=Math.max(maxL,sl);}return {pct:c.map(n=>+(100*n/200000).toFixed(2)),maxGapEpic:maxE,maxGapLegendary:maxL};})()`);
T('2_sim',sim);CK(sim.maxGapEpic<PITY_E_()&&true,'');
function PITY_E_(){return 30;}
CK(sim.maxGapEpic<=29&&sim.maxGapLegendary<=79,'pity broken');CK(sim.pct[4]+sim.pct[5]<3,'legendary too common');
// 3 every prize kind can be given and duplicates pay GP
const kinds=await ev(`(()=>{const out={};for(let t=0;t<6;t++)for(const w of cratePool(t)){const gp0=profile.gp;const d=giveReward(Object.assign({},w,{dupe:false}));out[w.kind]=(out[w.kind]||0)+1;}return out;})()`);T('3_kinds',kinds);
const dupe=await ev(`(()=>{const w=cratePool(4).find(x=>x.kind==='gun');const g0=profile.gp;const msg=giveReward(Object.assign({},w,{dupe:true}));return [msg,profile.gp-g0];})()`);T('3_dupe',dupe);CK(dupe[1]===1800,'duplicate refund wrong');
// 4 open crates through the screen
await ev("profile.gp=50000;profile.pity={e:0,l:0};saveProfile();1");
await p.evaluate(()=>document.getElementById('openCrate').click());await p.waitForTimeout(300);
for(let i=0;i<3;i++){await p.evaluate(()=>document.getElementById('crateOpen').click());await p.waitForTimeout(4700);}
T('4_screen',{win:await p.evaluate(()=>document.getElementById('crateWin').textContent),pity:await p.evaluate(()=>document.getElementById('cratePity').textContent),odds:await p.evaluate(()=>document.getElementById('crateOdds').textContent),crates:await ev('profile.crates'),imgs:await p.evaluate(()=>document.querySelectorAll('#reel img').length)});
await p.screenshot({path:'../vid/crate.png'});
// 5 style tab + kill effect in a match
await p.evaluate(()=>{document.getElementById('crateClose').click();});await ev("profile.titles.push('legend');profile.cards.push('galaxy');profile.killfxs.push('goldrush');saveProfile();1");
await p.evaluate(()=>{document.getElementById('openChar').click();});await p.waitForTimeout(300);await p.evaluate(()=>document.querySelector('[data-ct=style]').click());await p.waitForTimeout(300);
await p.evaluate(()=>{document.querySelector('[data-title=legend]').click();});await p.evaluate(()=>{document.querySelector('[data-card=galaxy]').click();});await p.evaluate(()=>{document.querySelector('[data-kfx=goldrush]').click();});
await p.screenshot({path:'../vid/style.png'});
T('5_style',[await ev('profile.title'),await ev('profile.card'),await ev('profile.killfx')]);
await p.evaluate(()=>document.getElementById('charClose')&&document.getElementById('charClose').click());
await p.evaluate(()=>window.__bf.start('junk'));await p.waitForTimeout(1200);const pc0=await ev('parts.length');
await ev("(()=>{const b=bots.find(x=>x.team==='red'&&x.alive);b.spawnProt=0;damage(b,999,player,false,'KV-47','rifle');return 1})()");T('5_killfx',{particlesAdded:await ev('parts.length')-pc0});CK(await ev('parts.length')-pc0>=30,'no kill effect');
T('errs',errs);CK(!errs.length,'page errors');
console.log(fails?`RESULT ${fails} FAILED`:'RESULT ALL PASSED');await b.close();
