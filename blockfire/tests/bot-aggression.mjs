// Headless 120s bot match for Cubefront.
// Builds the game, serves it, and steps the real match loop (window.__bf / step) in headless Chrome.
//
//   node blockfire/tests/bot-aggression.mjs
//
// Chrome: $CHROME, or /usr/local/bin/google-chrome, or google-chrome on PATH.
// Prints one JSON object. Exits 0 when every bot has fired by 20s, the median gap between
// fights is under 15s, Easy K/D is at least 1, and the page threw nothing.
import {spawn} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const OUT=process.env.BOT_SIM_OUT||path.join('/tmp','bf-bot-sim');
const CHROME=process.env.CHROME||['/usr/local/bin/google-chrome','/usr/bin/google-chrome'].find(p=>fs.existsSync(p))||'google-chrome';
const SEED=0xC0FFEE;

function run(cmd,args,{cwd}={}){return new Promise((res,rej)=>{
  const p=spawn(cmd,args,{cwd,stdio:['ignore','inherit','inherit']});
  p.on('error',rej);p.on('exit',c=>c?rej(new Error(cmd+' '+args.join(' ')+' exited '+c)):res());
});}
function get(url){return new Promise((res,rej)=>{
  const q=http.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));});
  q.on('error',rej);
});}
function serve(dir){return new Promise(res=>{
  const s=http.createServer((req,resp)=>{
    const u=decodeURIComponent(req.url.split('?')[0]);
    const f=path.join(dir,u==='/'?'index.html':u);
    if(!f.startsWith(dir)){resp.writeHead(403);resp.end();return;}
    fs.readFile(f,(err,buf)=>{
      if(err){resp.writeHead(404);resp.end('missing');return;}
      const ext=path.extname(f);
      const type=ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'application/octet-stream';
      resp.writeHead(200,{'content-type':type,'cache-control':'no-store'});resp.end(buf);
    });
  });
  s.listen(0,'127.0.0.1',()=>res(s));
});}

const PAGE_FN=({secs,diffs})=>{
  const median=a=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y),i=s.length>>1;return s.length%2?s[i]:(s[i-1]+s[i])/2;};
  const quiet=()=>{
    const dummy={g:{gain:{value:0}}};
    try{sfx.loop=()=>dummy;sfx.stopLoop=()=>{};for(const k of Object.keys(sfx))if(typeof sfx[k]==='function'&&k!=='loop'&&k!=='stopLoop')sfx[k]=()=>{};}catch(e){}
    try{rebuildWorld=()=>{worldDirty=false;};}catch(e){}
    try{updateParts=()=>{parts.length=0;};}catch(e){}
    try{updateTracers=()=>{tracers.length=0;};}catch(e){}
    try{updateFlashes=()=>{};updateSnow=()=>{};}catch(e){}
  };
  const drive=(dt,t)=>{
    if(!player.alive){fireHeld=false;ads=false;keys.KeyW=keys.KeyA=keys.KeyS=keys.KeyD=false;return;}
    let best=null,bd=1e9;
    for(const e of ents){if(!e.alive||e.inMatch===false||e.team===player.team)continue;
      const d=Math.hypot(e.x-player.x,e.z-player.z);if(d<bd&&d<85&&canSee(player,e)){bd=d;best=e;}}
    const sp=MAP.spawn.red,gx=(sp[0]+sp[1])/2,gz=(sp[2]+sp[3])/2;
    if(!best){const want=Math.atan2(-(gx-player.x),-(gz-player.z));
      player.yaw=turnTo(player.yaw,want,3.4*dt);player.pitch+=(0-player.pitch)*Math.min(1,4*dt);
      fireHeld=false;ads=false;keys.KeyW=true;keys.KeyS=false;keys.KeyA=false;keys.KeyD=false;player._tg=null;player._rt=.34;return;}
    const dx=best.x-player.x,dz=best.z-player.z,want=Math.atan2(-dx,-dz);
    const wob=Math.sin(t*2.7)*.012+Math.sin(t*6.1)*.006;
    player.yaw=turnTo(player.yaw,want+wob,5.2*dt);
    player.pitch=Math.atan2((best.y+1.15)-(player.y+1.62),Math.max(.2,Math.hypot(dx,dz)));
    player._rt=player._tg===best?(player._rt||0)-dt:.34;player._tg=best;
    const aimed=Math.abs(angDiff(player.yaw,want))<.11;
    if(ammo[cur]&&ammo[cur].mag===0&&reloadT<=0)startReload();
    fireHeld=player._rt<=0&&aimed&&!(reloadT>0)&&ammo[cur]&&ammo[cur].mag>0;
    ads=fireHeld&&bd<40;
    keys.KeyW=bd>16;keys.KeyS=bd<5;
    keys.KeyA=Math.sin(t*1.6)>.15;keys.KeyD=Math.sin(t*1.6)<-.15;
  };
  function run(diff,mode){
    profile.botd=diff;profile.tutDone=true;profile.xp=Math.max(profile.xp|0,80);profile.goal=100;profile.rule='tdm';profile.map='town';profile.fillBots=true;
    try{const S=ST();S.matches=Math.max(S.matches|0,1);}catch(e){}
    quiet();
    window.__bf.start('town');
    GOAL=100000;
    if(mode==='fight')player.spawnProt=1e9;
    const shots=[];const os=botShoot,ork=botRocket;
    botShoot=function(b,t,dist){shots.push({t:simT,n:b.name});return os.apply(this,arguments);};
    botRocket=function(b,t,dist){shots.push({t:simT,n:b.name});return ork.apply(this,arguments);};
    const dt=1/30,n=Math.round(secs/dt);let simT=0,thrown=null;
    const err0=(window.__bfErrs||[]).length;
    try{
      for(let i=0;i<n&&state==='play';i++){
        simT=Math.round((i+1)*dt*1000)/1000;
        if(mode==='fight'){player.spawnProt=1e9;fireHeld=false;ads=false;keys.KeyW=keys.KeyA=keys.KeyS=keys.KeyD=false;}
        else drive(dt,simT);
        step(dt,simT*1000);worldDirty=false;
      }
    }catch(e){thrown=String(e&&e.stack||e);}
    finally{botShoot=os;botRocket=ork;}
    const active=bots.filter(b=>b.inMatch!==false);
    const first={};for(const s of shots)if(first[s.n]==null)first[s.n]=s.t;
    const firsts=active.map(b=>({n:b.name,team:b.team,t:first[b.name]==null?null:+first[b.name].toFixed(2)}));
    const times=shots.map(s=>s.t).sort((a,b)=>a-b);
    const fights=[];let a=null,c=null;
    for(const t of times){if(a==null){a=c=t;continue;}if(t-c<=4)c=t;else{fights.push([a,c]);a=c=t;}}
    if(a!=null)fights.push([a,c]);
    const gaps=[];for(let i=1;i<fights.length;i++)gaps.push(+(fights[i][0]-fights[i-1][1]).toFixed(2));
    let maxSilence=0;for(let i=1;i<times.length;i++)maxSilence=Math.max(maxSilence,times[i]-times[i-1]);
    const k=player.kills|0,d=player.deaths|0;
    const late=firsts.filter(f=>!(f.t!=null&&f.t<=20));
    return {diff,mode,state,simT:+simT.toFixed(2),shots:shots.length,bots:active.length,
      firsts,late:late.map(f=>f.n),everyBotFiredBy20:!late.length,
      fights:fights.length,gaps,medianGap:+median(gaps).toFixed(2),maxSilence:+maxSilence.toFixed(2),
      player:{k,d,kd:+(d?k/d:k).toFixed(2)},
      teams:{blue:scores.blue|0,red:scores.red|0},
      botKd:active.map(b=>({n:b.name,team:b.team,k:b.kills|0,d:b.deaths|0})),
      thrown,newErrs:(window.__bfErrs||[]).slice(err0)};
  }
  const out={seed:'0xC0FFEE',secs,fight:{},kd:{}};
  for(const d of diffs){console.log('run '+d+' fight');out.fight[d]=run(d,'fight');console.log('run '+d+' kd '+out.fight[d].shots+' shots');out.kd[d]=run(d,'kd');}
  const fightOk=diffs.every(d=>out.fight[d].everyBotFiredBy20&&out.fight[d].medianGap<15&&!out.fight[d].thrown);
  const easy=out.kd.easy,easyOk=!!easy&&easy.player.kd>=1&&!easy.thrown;
  const errOk=diffs.every(d=>!out.fight[d].newErrs.length&&!out.kd[d].newErrs.length);
  out.pass=fightOk&&easyOk&&errOk;
  out.checks={everyBotFiredBy20:diffs.every(d=>out.fight[d].everyBotFiredBy20),
    medianGapUnder15:diffs.every(d=>out.fight[d].medianGap<15),
    easyKd:easy?easy.player.kd:null,easyBeatable:easyOk,noThrown:diffs.every(d=>!out.fight[d].thrown&&!out.kd[d].thrown),noGameErrs:errOk};
  return out;
};

class CDP{
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.onEvent=()=>{};
    ws.addEventListener('message',ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}
      if(m.id&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.rej(new Error(m.error.message||JSON.stringify(m.error))):p.res(m.result);}
      else if(m.method)this.onEvent(m);});
  }
  send(method,params={},timeout=30000){const id=++this.id;return new Promise((res,rej)=>{
    const t=setTimeout(()=>{this.pending.delete(id);rej(new Error('timeout '+method));},timeout);
    this.pending.set(id,{res:v=>{clearTimeout(t);res(v);},rej:e=>{clearTimeout(t);rej(e);}});
    this.ws.send(JSON.stringify({id,method,params}));
  });}
}

async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  await run('python3',[path.join(ROOT,'build','build.py'),path.join(ROOT,'game','cabin-fever.html'),OUT]);
  const server=await serve(OUT);const port=server.address().port;
  const logs=[];
  const chrome=spawn(CHROME,[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--remote-debugging-port=0','--user-data-dir='+path.join('/tmp','bf-chrome-'+process.pid),
    'about:blank'],{stdio:['ignore','ignore','pipe']});
  let dbg='';chrome.stderr.on('data',c=>{dbg+=c.toString();});
  const t0=Date.now();let devPort=0;
  while(Date.now()-t0<20000){const m=dbg.match(/127\.0\.0\.1:(\d+)\//);if(m){devPort=+m[1];break;}await new Promise(r=>setTimeout(r,100));}
  if(!devPort){chrome.kill();throw new Error('chrome devtools port missing\n'+dbg.slice(-500));}
  let list=[];
  for(let i=0;i<40&&!list.length;i++){try{list=JSON.parse(await get('http://127.0.0.1:'+devPort+'/json/list'));}catch(e){}if(!list.length)await new Promise(r=>setTimeout(r,100));}
  const page=list.find(p=>p.type==='page');
  if(!page)throw new Error('no page '+JSON.stringify(list));
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const cdp=new CDP(ws);
  const consoleErrs=[],pageErrs=[];
  cdp.onEvent=m=>{
    if(m.method==='Runtime.consoleAPICalled'){const type=m.params.type,text=(m.params.args||[]).map(a=>a.value||a.description||'').join(' ');
      if(type==='error')consoleErrs.push(text);else if(type==='log')console.log('page:',text.slice(0,200));logs.push(type+': '+text.slice(0,300));}
    if(m.method==='Runtime.exceptionThrown'){const ex=m.params.exceptionDetails||{};const txt=(ex.exception&&(ex.exception.description||ex.exception.value))||ex.text||'exception';
      pageErrs.push(String(txt).slice(0,500));}
  };
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    try{localStorage.setItem('blockfire.norender','1');
      localStorage.setItem('blockfire.settings',JSON.stringify({vol:0,music:0,quality:'low',killcam:false,fps:false}));}catch(e){}
    let __s=${SEED};
    Math.random=function(){__s=__s+0x6D2B79F5|0;let t=Math.imul(__s^__s>>>15,1|__s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
  `});
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${port}/play.html`});
  let ready=false;
  for(let i=0;i<80&&!ready;i++){
    await new Promise(r=>setTimeout(r,250));
    try{      const r=await cdp.send('Runtime.evaluate',{expression:'typeof window.__bf==="object"',returnByValue:true});
      ready=!!(r.result&&r.result.value);}catch(e){}
  }
  if(!ready){let diag=null;try{const d=await cdp.send('Runtime.evaluate',{expression:'JSON.stringify({href:location.href,ready:document.readyState,bf:typeof window.__bf,title:document.title,err:(window.__bfErrs||[]).slice(-5),text:(document.body&&document.body.innerText||"").slice(0,400)})',returnByValue:true});diag=d.result&&d.result.value;}catch(e){diag=String(e);}
    console.log(JSON.stringify({pass:false,boot:false,diag,logs:logs.slice(-30),pageErrs,chrome:dbg.slice(-800)},null,2));process.exitCode=1;}
  else{
    const src='('+PAGE_FN.toString()+')({secs:'+(process.env.BOT_SIM_SECS||120)+',diffs:["easy","medium","hard"]})';
    const expr='window.__bf.ev('+JSON.stringify(src)+')';
    const r=await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true,timeout:600000},600000);
    await new Promise(res=>setTimeout(res,1500));
    if(r.exceptionDetails){console.log(JSON.stringify({pass:false,exception:r.exceptionDetails.text,exc:r.exceptionDetails.exception&&r.exceptionDetails.exception.description,logs:logs.slice(-20)},null,2));process.exitCode=1;}
    else{
      const result=r.result.value;
      result.consoleErrors=consoleErrs;
      result.pageErrors=pageErrs;
      result.pass=!!result.pass&&!consoleErrs.length&&!pageErrs.length;
      result.checks.noConsoleErrors=!consoleErrs.length&&!pageErrs.length;
      console.log(JSON.stringify(result,null,2));
      if(!result.pass)process.exitCode=1;
    }
  }
  try{chrome.kill();}catch(e){}
  server.close();
  setTimeout(()=>process.exit(process.exitCode||0),200);
}
main().catch(e=>{console.error(e);process.exit(1);});
