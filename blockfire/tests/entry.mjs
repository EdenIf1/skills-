// Entry flow: Play starts the selected map, room codes accept typing and Enter,
// and a quick-play match is listed so the next Play joins it.
// Needs the built game on :8765, mock-supabase on :54321, PeerJS on :9000, MQTT on :8883.
import puppeteer from 'puppeteer-core';
const CHROME=process.env.CHROME||'/usr/bin/google-chrome';
const BASE=process.env.BASE||'http://127.0.0.1:8765/play.html';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let fails=0;const CK=(ok,msg)=>{if(!ok){fails++;console.log('  FAIL',msg);}};
const T=(k,v)=>console.log(k,JSON.stringify(v));
async function mk(){
  const p=await b.newPage();
  p.setDefaultTimeout(20000);
  await p.setViewport({width:1280,height:800});
  p.errs=[];p.logs=[];
  p.on('pageerror',e=>p.errs.push(String(e&&e.message||e)));
  p.on('console',m=>{if(m.type()==='error')p.logs.push(m.text());});
  p.on('response',r=>{if(r.status()>=400)p.logs.push(r.status()+' '+r.url());});
  p.on('dialog',d=>d.accept());
  await p.evaluateOnNewDocument(()=>{
    localStorage.setItem('blockfire.fastload','1');
    localStorage.setItem('blockfire.norender','1');
    localStorage.setItem('blockfire.ps','127.0.0.1:9000');
    localStorage.setItem('blockfire.mq','ws://127.0.0.1:8883');
    localStorage.setItem('blockfire.forceRelay','1');
    localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'http://127.0.0.1:54321',key:'anon-key'}));
  });
  await p.goto(BASE,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.__bf&&document.getElementById('hCode')&&document.getElementById('play'));
  await p.evaluate(()=>window.__bf.setProfile({tutDone:true}));
  return p;
}
const ev=(p,c)=>p.evaluate(c=>window.__bf.ev(c),c);
const until=async(p,c,ms=30000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await ev(p,c))return Date.now()-t;}catch(e){}await new Promise(r=>setTimeout(r,200));}return -1;};
const botsOn=p=>ev(p,'bots.filter(b=>b.inMatch!==false&&!b.remote&&!b.isPlayer).length');

const A=await mk();
await A.click('[data-map="moon"]');
await A.click('#play');
const started=await until(A,"state==='play'&&MAP.key==='moon'&&modeOf(MAP.key).name==='Elimination'&&NET.mode==='host'");
const listed=await until(A,'NET.listed===true',20000);
const relay=await until(A,'NET.rlHost&&NET.rlHost.mqs.some(m=>m.up)',15000);
const code=await ev(A,'NET.code');
const lobbyHidden=await A.evaluate(()=>document.getElementById('mp').hidden);
T('1_play',{started,listed,relay,code,map:await ev(A,'MAP.key'),mode:await ev(A,'NET.mode'),lobbyHidden,label:await A.$eval('#play',e=>e.textContent)});
CK(started>=0,'Play did not start Moon Base Elimination as host');
CK(listed>=0,'quick play room was not listed');
CK(relay>=0,'backup route did not come up');
CK(lobbyHidden===true,'Play opened the lobby instead of the match');
const before=await botsOn(A);
T('1_bots',{before});

const B=await mk();
await until(B,'!!CS||!cloudOn()',8000);
await new Promise(r=>setTimeout(r,400));
await B.evaluate(()=>{const i=document.getElementById('hCode');i.focus();});
await B.keyboard.type(code,{delay:40});
await new Promise(r=>setTimeout(r,700));
const typed=await B.$eval('#hCode',e=>e.value);
T('2_typed',{typed,code});
CK(typed===code,'room code field dropped typed text');
await B.keyboard.press('Enter');
const joined=await until(B,"NET.mode==='client'&&state==='play'&&NET.code==="+JSON.stringify(code),45000);
const remotes=await until(A,'NET.remotes.size>=1',15000);
const after=await botsOn(A);
T('2_enter',{joined,remotes,before,after,bState:await ev(B,'state'),bMode:await ev(B,'NET.mode'),bCode:await ev(B,'NET.code'),bErr:await ev(B,'NET.err')});
CK(joined>=0,'Enter did not join the typed room');
CK(remotes>=0,'host did not see the joining human');
CK(after===before-1,'joining human did not replace a bot');

const C=await mk();
await C.click('#hOnline');
const seen=await until(C,'NET.rooms&&NET.rooms.some(r=>r.code==='+JSON.stringify(code)+'&&r.map==="Moon Base")',20000);
T('3_list',{seen,rooms:await ev(C,'NET.rooms')});
CK(seen>=0,'quick play room did not show in the room list');
await C.click('#play');
const qp=await until(C,"NET.mode==='client'&&state==='play'&&NET.code==="+JSON.stringify(code),45000);
T('3_quick',{qp,cErr:await ev(C,'NET.err'),hostRemotes:await ev(A,'NET.remotes.size')});
CK(qp>=0,'second tab Quick Play did not join the listed room');

const errs={A:A.errs,B:B.errs,C:C.errs,logA:A.logs,logB:B.logs,logC:C.logs};
T('errors',errs);
CK([A,B,C].every(p=>p.errs.length===0&&p.logs.length===0),'console or page errors');
console.log(fails?`RESULT ${fails} FAILED`:'RESULT ALL PASSED');
await b.close();
process.exit(fails?1:0);
