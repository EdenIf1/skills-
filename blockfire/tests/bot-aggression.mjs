// Headless bot match for Cubefront. Compares this tree (head) with blockfire-app (base).
//
// Node: written and run on v22.23.3. Node 18+ is enough. This file does not use the
// Node 22 WebSocket global; Chrome DevTools is spoken to with the small client below.
//
//   python3 blockfire/build/build.py --test   (this script passes --test itself)
//   node blockfire/tests/bot-aggression.mjs
//
// A production build strips window.__bf (see the --test / --dev flag). The sim reloads
// the page and re-seeds Math.random before every run, then steps the real match loop.
// Five seeds per difficulty. Fight clock: shots at the human only, plus everyBotFiredBy20.
// Easy K/D: a human stand-in. Prints one JSON object. Exits 0 when head beats base on
// time-to-first-engagement and idle %, every bot on head has fired by 20s, Easy's mean
// K/D is at least 1, and the page threw nothing.
import {spawn, spawnSync} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const REPO=path.resolve(ROOT,'..');
const OUT=process.env.BOT_SIM_OUT||path.join('/tmp','bf-bot-sim');
const CHROME=process.env.CHROME||['/usr/local/bin/google-chrome','/usr/bin/google-chrome'].find(p=>fs.existsSync(p))||'google-chrome';
const BASE_REF=process.env.BOT_BASE_REF||'origin/blockfire-app';
const SEEDS=(process.env.BOT_SEEDS||'0xC0FFEE,0xB07A66,0xA11CE,0x51EED5,0xF00D11').split(',').map(s=>Number(s.trim())).filter(n=>Number.isFinite(n));
const DIFFS=(process.env.BOT_DIFFS||'easy,medium,hard').split(',').map(s=>s.trim()).filter(Boolean);
const BUILDS=(process.env.BOT_BUILDS||'base,head').split(',').map(s=>s.trim()).filter(Boolean);
const FIGHT_SECS=Number(process.env.BOT_SIM_SECS||36);
const KD_SECS=Number(process.env.BOT_KD_SECS||48);
const DO_KD=process.env.BOT_KD!=='0';
const NODE=process.version;

function log(...a){console.error(...a);}
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
    const f=path.normalize(path.join(dir,u==='/'?'index.html':u));
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

// Same xorshift the preload injects. Called again inside each run so menu frames cannot leak.
function randInstall(seed){
  return `(()=>{let __s=${seed|0};Math.random=function(){__s=__s+0x6D2B79F5|0;let t=Math.imul(__s^__s>>>15,1|__s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};})();`;
}

const PAGE_FN=({secs,seed,diff,mode,px,pz})=>{
  let __s=seed|0;
  Math.random=function(){__s=__s+0x6D2B79F5|0;let t=Math.imul(__s^__s>>>15,1|__s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
  let simWall=0;const p0=performance.now(),d0=Date.now();
  performance.now=()=>p0+simWall;Date.now=()=>d0+simWall;
  const dummy={g:{gain:{value:0}}};
  try{sfx.loop=()=>dummy;sfx.stopLoop=()=>{};for(const k of Object.keys(sfx))if(typeof sfx[k]==='function'&&k!=='loop'&&k!=='stopLoop')sfx[k]=()=>{};}catch(e){}
  try{const real=rebuildWorld;rebuildWorld=function(){try{computeSY();}catch(e){try{real();}catch(e2){}}worldDirty=false;};}catch(e){}
  try{updateParts=()=>{parts.length=0;};}catch(e){}
  try{updateTracers=()=>{tracers.length=0;};}catch(e){}
  try{updateFlashes=()=>{};updateSnow=()=>{};}catch(e){}
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
  profile.botd=diff;profile.tutDone=true;profile.xp=Math.max(profile.xp|0,80);profile.goal=100;profile.rule='tdm';profile.map='town';profile.fillBots=true;
  try{const S=ST();S.matches=Math.max(S.matches|0,1);}catch(e){}
  window.__bf.start('town');
  GOAL=100000;
  // The human stands where red has to come find them. Spawn-facing on the red road makes the old bots shoot first.
  const plant=()=>{
    player.spawnProt=1e9;player.x=px+.5;player.z=pz+.5;player.yaw=0;player.pitch=0;
    const s=SY[(px|0)+W*(pz|0)];if(s>=0)player.y=s+.05;
    player.vx=player.vy=player.vz=0;
    fireHeld=false;ads=false;keys.KeyW=keys.KeyA=keys.KeyS=keys.KeyD=false;
  };
  if(mode==='fight')plant();
  const acc={};
  const slot=b=>acc[b.name]||(acc[b.name]={alive:0,idle:0,closed:0,pd:null,firstHuman:null,fired:null,eng:0,lastHuman:-99});
  const os=botShoot,ork=botRocket;
  const note=(b,t)=>{
    const S=slot(b);
    if(S.fired==null)S.fired=simT;
    if(t===player){if(S.firstHuman==null)S.firstHuman=simT;if(simT-S.lastHuman>1.5)S.eng++;S.lastHuman=simT;}
  };
  let simT=0;
  botShoot=function(b,t,dist){note(b,t);return os.apply(this,arguments);};
  botRocket=function(b,t,dist){note(b,t);return ork.apply(this,arguments);};
  const dt=1/30,n=Math.round(secs/dt);let thrown=null;
  const err0=(window.__bfErrs||[]).length;
  try{
    for(let i=0;i<n&&state==='play';i++){
      simT=Math.round((i+1)*dt*1000)/1000;simWall=simT*1000;
      if(mode==='fight')plant();
      else drive(dt,simT);
      step(dt,simT*1000);worldDirty=false;
      for(const b of bots){
        if(b.inMatch===false)continue;
        const S=slot(b);
        if(!b.alive){S.pd=null;continue;}
        S.alive++;
        if(!b.seeing||b.perch)S.idle++;
        if(b.team!==player.team){
          const d=Math.hypot(b.x-player.x,b.z-player.z);
          if(!b.seeing&&!b.perch){if(S.pd!=null&&d<S.pd)S.closed+=S.pd-d;S.pd=d;}
          else S.pd=d;
        }
      }
    }
  }catch(e){thrown=String(e&&e.stack||e);}
  finally{botShoot=os;botRocket=ork;}
  const r4=x=>+((+x)||0).toFixed(4);
  const active=bots.filter(b=>b.inMatch!==false);
  const foes=active.filter(b=>b.team!==player.team);
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  let aliveN=0,idleN=0;for(const b of active){const S=acc[b.name];if(!S)continue;aliveN+=S.alive;idleN+=S.idle;}
  const ttfs=foes.map(b=>{const S=acc[b.name];return S&&S.firstHuman!=null?S.firstHuman:secs;});
  const engs=foes.map(b=>((acc[b.name]&&acc[b.name].eng)||0)/(secs/60));
  const closed=foes.map(b=>(acc[b.name]&&acc[b.name].closed)||0);
  const late=active.filter(b=>{const S=acc[b.name];return !(S&&S.fired!=null&&S.fired<=20);});
  const k=player.kills|0,d=player.deaths|0;
  const humanShots=foes.reduce((s,b)=>s+((acc[b.name]&&acc[b.name].eng)||0),0);
  return {diff,mode,seed,ver:APP_VERSION,state,secs,bots:active.length,foes:foes.length,
    ttf:r4(mean(ttfs)),idle:r4(aliveN?100*idleN/aliveN:0),eng:r4(mean(engs)),closed:r4(mean(closed)),
    everyBotFiredBy20:!late.length&&!!active.length,firedFrac:r4(active.length?(active.length-late.length)/active.length:0),
    late:late.map(b=>b.name),humanEng:humanShots,
    player:{k,d,kd:r4(d?k/d:k)},
    thrown,newErrs:(window.__bfErrs||[]).slice(err0)};
};

function sendRaw(sock,opcode,payload){
  payload=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload));
  const mask=crypto.randomBytes(4),len=payload.length;let hdr;
  if(len<126)hdr=Buffer.from([0x80|opcode,0x80|len]);
  else if(len<65536){hdr=Buffer.alloc(4);hdr[0]=0x80|opcode;hdr[1]=0x80|126;hdr.writeUInt16BE(len,2);}
  else{hdr=Buffer.alloc(10);hdr[0]=0x80|opcode;hdr[1]=0x80|127;hdr.writeBigUInt64BE(BigInt(len),2);}
  const masked=Buffer.alloc(len);
  for(let i=0;i<len;i++)masked[i]=payload[i]^mask[i&3];
  sock.write(Buffer.concat([hdr,mask,masked]));
}
class WSClient{
  constructor(url){
    this.listeners={open:[],message:[],error:[],close:[]};
    const u=new URL(url);
    const sock=net.connect({host:u.hostname,port:Number(u.port)||80});
    this.sock=sock;let buf=Buffer.alloc(0),up=false,parts=[];
    const emit=(name,ev)=>{for(const fn of this.listeners[name]||[])try{fn(ev);}catch(e){}};
    sock.on('error',e=>emit('error',e));
    sock.on('close',()=>emit('close',{}));
    sock.on('connect',()=>{
      const key=crypto.randomBytes(16).toString('base64');
      sock.write('GET '+u.pathname+u.search+' HTTP/1.1\r\nHost: '+u.host+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    sock.on('data',c=>{
      buf=Buffer.concat([buf,c]);
      if(!up){const i=buf.indexOf('\r\n\r\n');if(i<0)return;const head=buf.slice(0,i).toString();buf=buf.slice(i+4);up=true;
        if(!/^HTTP\/1\.[01] 101/.test(head)){emit('error',new Error(head.split('\r\n')[0]||'upgrade failed'));sock.end();return;}
        emit('open',{});}
      while(buf.length>=2){
        const b0=buf[0],b1=buf[1],fin=!!(b0&0x80),op=b0&0x0f,masked=!!(b1&0x80);let len=b1&0x7f,o=2;
        if(len===126){if(buf.length<4)return;len=buf.readUInt16BE(2);o=4;}
        else if(len===127){if(buf.length<10)return;len=Number(buf.readBigUInt64BE(2));o=10;}
        const ml=masked?4:0;if(buf.length<o+ml+len)return;
        let data=buf.slice(o+ml,o+ml+len);
        if(masked){const m=buf.slice(o,o+4);const d=Buffer.from(data);for(let i=0;i<d.length;i++)d[i]^=m[i&3];data=d;}
        buf=buf.slice(o+ml+len);
        if(op===9){sendRaw(sock,0xA,data);continue;}
        if(op===8){sock.end();continue;}
        if(op===0){parts.push(data);if(fin){emit('message',{data:Buffer.concat(parts).toString()});parts=[];}}
        else if(op===1){if(fin)emit('message',{data:data.toString()});else parts=[data];}
      }
    });
  }
  addEventListener(n,fn){(this.listeners[n]=this.listeners[n]||[]).push(fn);}
  send(data){sendRaw(this.sock,1,data);}
  close(){try{this.sock.end();}catch(e){}}
}
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

function agg(rows,key){
  const xs=rows.map(r=>r[key]).filter(v=>typeof v==='number'&&isFinite(v));
  if(!xs.length)return {mean:null,min:null,max:null,n:0};
  const mean=xs.reduce((s,v)=>s+v,0)/xs.length;
  return {mean:+mean.toFixed(4),min:+Math.min(...xs).toFixed(4),max:+Math.max(...xs).toFixed(4),n:xs.length};
}
function cell(stat){if(!stat||stat.mean==null)return '—';return stat.mean.toFixed(2)+' ('+stat.min.toFixed(2)+'–'+stat.max.toFixed(2)+')';}

async function main(){
  if(SEEDS.length<5&&!process.env.BOT_SEEDS)throw new Error('need 5 seeds');
  fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});
  const baseFile=path.join(OUT,'base.html');
  if(BUILDS.includes('base')){
    const shown=spawnSync('git',['show',BASE_REF+':blockfire/game/cabin-fever.html'],{cwd:REPO,encoding:'utf8',maxBuffer:8*1024*1024});
    if(shown.status)throw new Error('git show '+BASE_REF+' failed: '+(shown.stderr||'').slice(0,400));
    fs.writeFileSync(baseFile,shown.stdout);
    log('build base',BASE_REF);
    await run('python3',[path.join(ROOT,'build','build.py'),baseFile,path.join(OUT,'base'),'--test']);
  }
  if(BUILDS.includes('head')){
    log('build head --test');
    await run('python3',[path.join(ROOT,'build','build.py'),path.join(ROOT,'game','cabin-fever.html'),path.join(OUT,'head'),'--test']);
    const page=fs.readFileSync(path.join(OUT,'head','play.html'),'utf8');
    if(!page.includes('window.__bf'))throw new Error('head build is missing window.__bf; pass --test');
  }
  const server=await serve(OUT);const port=server.address().port;
  const logs=[];
  const chrome=spawn(CHROME,[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--remote-debugging-port=0','--user-data-dir='+path.join('/tmp','bf-chrome-'+process.pid),
    'about:blank'],{stdio:['ignore','ignore','pipe']});
  let dbg='';chrome.stderr.on('data',c=>{dbg+=c.toString();if(dbg.length>8000)dbg=dbg.slice(-8000);});
  const t0=Date.now();let devPort=0;
  while(Date.now()-t0<20000){const m=dbg.match(/127\.0\.0\.1:(\d+)\//);if(m){devPort=+m[1];break;}await new Promise(r=>setTimeout(r,100));}
  if(!devPort){chrome.kill();throw new Error('chrome devtools port missing\n'+dbg.slice(-500));}
  let list=[];
  for(let i=0;i<40&&!list.length;i++){try{list=JSON.parse(await get('http://127.0.0.1:'+devPort+'/json/list'));}catch(e){}if(!list.length)await new Promise(r=>setTimeout(r,100));}
  const tab=list.find(p=>p.type==='page');
  if(!tab)throw new Error('no page '+JSON.stringify(list));
  const ws=new WSClient(tab.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const cdp=new CDP(ws);
  const consoleErrs=[],pageErrs=[];
  cdp.onEvent=m=>{
    if(m.method==='Runtime.consoleAPICalled'){const type=m.params.type,text=(m.params.args||[]).map(a=>a.value||a.description||'').join(' ');
      if(type==='error')consoleErrs.push(text.slice(0,300));else if(type==='log')logs.push(text.slice(0,200));}
    if(m.method==='Runtime.exceptionThrown'){const ex=m.params.exceptionDetails||{};pageErrs.push(String((ex.exception&&(ex.exception.description||ex.exception.value))||ex.text||'exception').slice(0,500));}
  };
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  let scriptId=null;
  async function boot(build,seed,tag){
    consoleErrs.length=0;pageErrs.length=0;
    if(scriptId){try{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});}catch(e){}scriptId=null;}
    const added=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      try{localStorage.setItem('blockfire.norender','1');
        localStorage.setItem('blockfire.settings',JSON.stringify({vol:0,music:0,quality:'low',killcam:false,fps:false}));}catch(e){}
      ${randInstall(seed)}
    `});
    scriptId=added.identifier;
    const url=`http://127.0.0.1:${port}/${build}/play.html?run=${encodeURIComponent(tag)}`;
    await cdp.send('Page.navigate',{url});
    let ready=false,diag=null;
    for(let i=0;i<80&&!ready;i++){
      await new Promise(r=>setTimeout(r,250));
      try{const r=await cdp.send('Runtime.evaluate',{expression:'typeof window.__bf==="object"',returnByValue:true});
        ready=!!(r.result&&r.result.value);}catch(e){}
    }
    if(!ready){try{const d=await cdp.send('Runtime.evaluate',{expression:'JSON.stringify({href:location.href,bf:typeof window.__bf,err:(window.__bfErrs||[]).slice(-3)})',returnByValue:true});diag=d.result&&d.result.value;}catch(e){diag=String(e);}
      throw new Error('boot failed '+tag+' '+diag);}
  }
  async function play(build,seed,diff,mode,secs){
    const tag=build+'-'+diff+'-'+mode+'-'+seed.toString(16);
    log('run',tag,secs+'s');
    await boot(build,seed,tag);
    const px=Number(process.env.BOT_X||32),pz=Number(process.env.BOT_Z||28);
    const src='('+PAGE_FN.toString()+')('+JSON.stringify({secs,seed,diff,mode,px,pz})+')';
    const expr='window.__bf.ev('+JSON.stringify(src)+')';
    const r=await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true,timeout:300000},300000);
    if(r.exceptionDetails)throw new Error(tag+' '+(r.exceptionDetails.text||'')+' '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||''));
    const row=r.result.value;
    row.build=build;row.consoleErrors=consoleErrs.slice();row.pageErrors=pageErrs.slice();
    if(row.thrown||row.newErrs.length||row.consoleErrors.length||row.pageErrors.length)log('  trouble',JSON.stringify({thrown:row.thrown,newErrs:row.newErrs,console:row.consoleErrors,page:row.pageErrors}).slice(0,500));
    else log('  ttf',row.ttf,'idle',row.idle,'eng',row.eng,'closed',row.closed,'by20',row.everyBotFiredBy20,'kd',row.player.kd);
    return row;
  }
  const runs=[];
  try{
    for(const build of BUILDS)for(const seed of SEEDS)for(const diff of DIFFS){
      runs.push(await play(build,seed,diff,'fight',FIGHT_SECS));
      if(DO_KD&&diff==='easy')runs.push(await play(build,seed,'easy','kd',KD_SECS));
    }
  }finally{
    try{chrome.kill();}catch(e){}
    server.close();
  }
  const fight={},kd={};
  for(const build of BUILDS){fight[build]={};kd[build]={};}
  for(const diff of DIFFS)for(const build of BUILDS){
    const rows=runs.filter(r=>r.build===build&&r.diff===diff&&r.mode==='fight');
    const everyN=rows.filter(r=>r.everyBotFiredBy20).length;
    fight[build][diff]={ttf:agg(rows,'ttf'),idle:agg(rows,'idle'),eng:agg(rows,'eng'),closed:agg(rows,'closed'),
      firedFrac:agg(rows,'firedFrac'),everyBotFiredBy20:{pass:everyN,n:rows.length,all:everyN===rows.length&&rows.length>0}};
  }
  if(DO_KD)for(const build of BUILDS){
    const rows=runs.filter(r=>r.build===build&&r.mode==='kd'&&r.diff==='easy');
    kd[build]={kd:agg(rows.map(r=>({kd:r.player.kd})),'kd'),k:agg(rows.map(r=>({k:r.player.k})),'k'),d:agg(rows.map(r=>({d:r.player.d})),'d'),n:rows.length};
  }
  const checks={};
  let pass=true;
  const head=fight.head,base=fight.base;
  if(head&&base){
    for(const diff of DIFFS){
      const H=head[diff],B=base[diff];
      const ttf=H.ttf.mean<B.ttf.mean,idle=H.idle.mean<B.idle.mean;
      const everySeparates=H.everyBotFiredBy20.all&&!B.everyBotFiredBy20.all||H.firedFrac.mean>B.firedFrac.mean;
      checks[diff]={headFaster:ttf,headLessIdle:idle,everyBotFiredBy20Separates:everySeparates,
        headEvery:H.everyBotFiredBy20,baseEvery:B.everyBotFiredBy20};
      if(!ttf||!idle||!H.everyBotFiredBy20.all)pass=false;
    }
  }else if(head){
    for(const diff of DIFFS)if(!head[diff].everyBotFiredBy20.all)pass=false;
    checks.note='base not run';
  }
  const easy=kd.head&&kd.head.kd;
  const easyOk=!DO_KD||!BUILDS.includes('head')||(!!easy&&easy.mean>=1);
  if(!easyOk)pass=false;
  const bad=runs.filter(r=>r.thrown||(r.newErrs&&r.newErrs.length)||(r.consoleErrors&&r.consoleErrors.length)||(r.pageErrors&&r.pageErrors.length));
  if(bad.length)pass=false;
  checks.easyKd=easy?easy.mean:null;checks.easyBeatable=easyOk;checks.noErrors=!bad.length;checks.seeds=SEEDS.length;
  const lines=['| Difficulty | Build | Time to first engagement (s) | Idle or perched % | Engagements / min | Distance closed while idle | Fired by 20s |',
    '|---|---|---:|---:|---:|---:|---:|'];
  for(const diff of DIFFS)for(const build of BUILDS){
    const F=fight[build][diff];
    lines.push('| '+diff+' | '+build+' | '+cell(F.ttf)+' | '+cell(F.idle)+' | '+cell(F.eng)+' | '+cell(F.closed)+' | '+F.everyBotFiredBy20.pass+'/'+F.everyBotFiredBy20.n+' |');
  }
  if(DO_KD)for(const build of BUILDS)if(kd[build]&&kd[build].kd){
    lines.push('| easy K/D | '+build+' | '+cell(kd[build].kd)+' | kills '+cell(kd[build].k)+' | deaths '+cell(kd[build].d)+' | | |');
  }
  log(lines.join('\n'));
  const result={pass,node:NODE,seeds:SEEDS.map(s=>'0x'+s.toString(16)),secs:{fight:FIGHT_SECS,kd:DO_KD?KD_SECS:0},
    fight,kd,checks,table:lines,runs:runs.map(r=>({build:r.build,seed:r.seed,diff:r.diff,mode:r.mode,ver:r.ver,ttf:r.ttf,idle:r.idle,eng:r.eng,closed:r.closed,everyBotFiredBy20:r.everyBotFiredBy20,firedFrac:r.firedFrac,player:r.player,thrown:r.thrown,newErrs:r.newErrs,consoleErrors:r.consoleErrors,pageErrors:r.pageErrors}))};
  console.log(JSON.stringify(result,null,2));
  if(!pass)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exit(1);});
