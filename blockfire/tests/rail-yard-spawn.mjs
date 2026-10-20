// Rail Yard spawns, loading cameras, and the build-then-jump camera.
// Serves the game, drives it through the test hook, writes rail-yard-spawn.out.txt.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn as spawnProc} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const game=fs.readFileSync(path.join(root,'game/cabin-fever.html'),'utf8')
  .replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','/three.min.js')
  .replace('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js','/peerjs.min.js');
const files={
  '/cabin-fever.html':{type:'text/html',body:game},
  '/three.min.js':{type:'application/javascript',body:fs.readFileSync(path.join(root,'build/assets/three.min.js'))},
  '/peerjs.min.js':{type:'application/javascript',body:fs.readFileSync(path.join(root,'build/assets/peerjs.min.js'))}
};
const server=http.createServer((req,res)=>{
  const f=files[req.url.split('?')[0]];
  if(!f){res.writeHead(404);res.end('no');return;}
  res.writeHead(200,{'content-type':f.type,'cache-control':'no-store'});
  res.end(f.body);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const url=`http://127.0.0.1:${port}/cabin-fever.html`;

const lines=[];
const log=(...a)=>{const s=a.join(' ');console.log(s);lines.push(s);};
const fails=[];
const bad=(m)=>{fails.push(m);log('FAIL',m);};

const chrome=spawnProc('google-chrome',[
  '--headless=new','--disable-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--remote-debugging-port=0','--user-data-dir=/tmp/cf-rail-chrome-'+process.pid,'--no-first-run','--no-default-browser-check',
  '--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','about:blank'
],{stdio:['ignore','pipe','pipe']});
let dbg='';
chrome.stderr.on('data',d=>{dbg+=d.toString();});
const wsUrl=await new Promise((resolve,reject)=>{
  const t=setTimeout(()=>reject(new Error('chrome did not open a debug port\n'+dbg.slice(-500))),20000);
  const watch=()=>{const m=dbg.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(t);resolve(m[1]);}};
  chrome.stderr.on('data',watch);watch();
});
const browser=await fetch(wsUrl.replace('ws://','http://').replace(/\/devtools\/browser\/.*/,'')+'/json/version').catch(()=>null);
// The browser websocket is wsUrl. Open a page target from /json/list after a short wait.
await new Promise(r=>setTimeout(r,300));
const listUrl=wsUrl.replace('ws://','http://').replace(/\/devtools\/browser\/.*/,'/json/list');
const targets=await (await fetch(listUrl)).json();
const page=targets.find(t=>t.type==='page');
if(!page)throw new Error('no page target '+JSON.stringify(targets));

function connect(wsTarget){
  const ws=new WebSocket(wsTarget);
  let id=0;const pending=new Map();const listen=[];
  const ready=new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  ws.addEventListener('message',ev=>{
    const msg=JSON.parse(ev.data);
    if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}
    else if(msg.method)for(const fn of listen)fn(msg);
  });
  return ready.then(()=>({
    send(method,params={}){const my=++id;return new Promise((resolve,reject)=>{pending.set(my,{resolve,reject});ws.send(JSON.stringify({id:my,method,params}));});},
    on(fn){listen.push(fn);},
    close(){ws.close();}
  }));
}
const cdp=await connect(page.webSocketDebuggerUrl);
const consoleErrs=[];
cdp.on(msg=>{
  if(msg.method==='Runtime.exceptionThrown'){
    const d=msg.params.exceptionDetails||{};
    const text=(d.exception&&d.exception.description)||d.text||'exception';
    consoleErrs.push('pageerror: '+String(text).split('\n')[0].slice(0,300));
  }
  if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error'){
    const t=(msg.params.args||[]).map(a=>a.value||a.description||'').join(' ');
    consoleErrs.push('console.error: '+String(t).slice(0,300));
  }
});
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.setItem('blockfire.norender','1');localStorage.setItem('blockfire.fastload','1');}catch(e){}`});
await cdp.send('Page.navigate',{url});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function evaluate(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text||'eval failed');
  return r.result?r.result.value:undefined;
}
for(let i=0;i<80;i++){
  const ok=await evaluate(`typeof window.__bf==='object'&&window.__bf.ev('1')===1`).catch(()=>false);
  if(ok)break;
  if(i===79)throw new Error('game did not boot');
  await sleep(250);
}
log('boot','ok',url);
async function ev(code){
  const wrapped=`window.__bf.ev(${JSON.stringify(code)})`;
  return evaluate(wrapped);
}

const spawnReport=await ev(`(()=>{
  profile.tutDone=true;
  const ahead=e=>{const fx=-Math.sin(e.yaw),fz=-Math.cos(e.yaw),h=rayVoxel(e.x,e.y+1.62,e.z,fx,0,fz,8,false);return h?+h.t.toFixed(2):8;};
  const gapOf=list=>{let g=99;for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)g=Math.min(g,Math.hypot(list[i].x-list[j].x,list[i].z-list[j].z));return +g.toFixed(3);};
  MAP=MAPS.rail;profile.map='rail';resetMatch(false);
  const out={waves:[],combined:null,samples:0};
  const wave=(team)=>{
    const group=ents.filter(e=>e.team===team);
    for(const e of ents)e.alive=false;
    for(const e of group)e.inMatch=true;
    for(const e of group)respawn(e);
    const live=group.filter(e=>e.alive);
    let minView=99,worst=null;
    for(const e of live){const v=ahead(e);if(v<minView){minView=v;worst={team,x:+e.x.toFixed(2),z:+e.z.toFixed(2),yaw:+e.yaw.toFixed(2),view:v};}}
    return {team,n:live.length,minView,minGap:gapOf(live),worst};
  };
  for(let i=0;i<20;i++){out.waves.push(wave('blue'));out.waves.push(wave('red'));}
  for(const e of ents)e.alive=false;
  for(const e of ents)e.inMatch=true;
  for(const e of ents)respawn(e);
  const live=ents.filter(e=>e.alive);
  out.combined={n:live.length,minGap:gapOf(live),minView:+Math.min(...live.map(ahead)).toFixed(2)};
  out.samples=out.waves.length;
  let minView=99,minGap=99,short=0,close=0;
  for(const w of out.waves){minView=Math.min(minView,w.minView);minGap=Math.min(minGap,w.minGap);if(w.minView<4)short++;if(w.minGap<2)close++;}
  out.summary={waves:out.waves.length,minView,minGap,shortWaves:short,closeWaves:close,perSide:20,worst:out.waves.slice().sort((a,b)=>a.minView-b.minView)[0]};
  return JSON.stringify(out.summary);
})()`);
const spawn=JSON.parse(spawnReport);
log('spawns',spawnReport);
if(spawn.shortWaves)bad('a Rail Yard spawn has under 4 blocks of clear view');
if(spawn.closeWaves)bad('two entities spawned within 2 blocks');
if(!(spawn.minView>=4))bad('min forward view '+spawn.minView);
if(!(spawn.minGap>=2))bad('min spawn gap '+spawn.minGap);

const camReport=await ev(`(()=>{
  const shots=['fight','aerial','king','scope','site','tense','zombie','close'];
  const maps=Object.keys(MAPS);
  const bad=[];let samples=0,kingDy=null;
  for(const mk of maps){
    MAP=MAPS[mk];profile.map=mk;resetMatch(false);
    for(const b of bots)if(b.inMatch!==false&&!b.alive)respawn(b);
    for(const shot of shots){
      LD.on=true;LD.shot=shot;LD.fx=99;LD.king=null;
      const k=bots.find(b=>b.alive&&b.mesh)||bots.find(b=>b.mesh);
      if(shot==='king'&&k){k.alive=true;k.inMatch=true;k.ksv=3;k.mesh.scale.setScalar(2.7);LD.king=k;}
      for(let a=0;a<8;a++){
        LD.a0=a*Math.PI/4;
        for(let ti=0;ti<=20;ti++){
          LD.t=ti*0.5;LD.fx=99;loadCam(0);samples++;
          const x=camera.position.x,y=camera.position.y,z=camera.position.z;
          if(camBuried(x,y,z)){if(bad.length<12)bad.push({map:mk,shot,a0:+LD.a0.toFixed(2),t:LD.t,x:+x.toFixed(2),y:+y.toFixed(2),z:+z.toFixed(2)});else bad.push(1);}
        }
      }
      if(shot==='king'&&k&&mk==='rail'){
        k.x=47.5;k.y=SY[(47|0)+W*(3|0)]||5;k.z=3.5;k.alive=true;k.ksv=3;k.mesh.scale.setScalar(2.7);LD.king=k;
        LD.a0=0;LD.t=0.4;LD.fx=99;loadCam(0);
        kingDy=+((camera.position.y-k.y).toFixed(2));
        k.mesh.scale.setScalar(.9);k.ksv=1;
      }
      if(k&&k.mesh){k.mesh.scale.setScalar(.9);k.ksv=1;}
      LD.king=null;
    }
  }
  LD.on=false;
  const n=bad.reduce((s,x)=>s+(x===1?1:1),0);
  return JSON.stringify({samples,buried:bad.filter(x=>x!==1).length+bad.filter(x=>x===1).length,examples:bad.filter(x=>x!==1),kingDy});
})()`);
const cam=JSON.parse(camReport);
log('loadCam',JSON.stringify({samples:cam.samples,buried:cam.buried,kingDy:cam.kingDy,examples:cam.examples}));
if(cam.buried)bad('loading camera inside a solid on '+cam.examples.map(e=>e.map+'/'+e.shot).join(', '));
if(!(cam.kingDy>4))bad('king loading camera did not scale eye height (dy='+cam.kingDy+')');

const jumpReport=await ev(`(()=>{
  profile.tutDone=true;profile.map='moon';MAP=MAPS.moon;startMatch();
  for(const b of bots){b.inMatch=false;b.alive=false;if(b.mesh)b.mesh.visible=false;}
  player.spawnProt=99;player.hp=9999;TUT.on=false;
  const place=()=>{
    if(!buildHeld)buildTap();
    for(const pitch of [-0.45,-0.7,-0.95,-0.25,-1.15]){
      player.pitch=pitch;buildCD=0;
      const t=buildTarget();
      if(t&&t.ok){buildTap();return {ok:true,x:t.x,y:t.y,z:t.z,pitch};}
    }
    return {ok:false};
  };
  player.yaw=0;player.pitch=-0.7;player.vx=player.vy=player.vz=0;
  step(1/30,0);updateCamera(1/30);
  const first=place();
  step(1/30,30);updateCamera(1/30);
  const second=place();
  step(1/30,60);
  keys.KeyW=true;keys.Space=true;jumpHeld=true;
  let frames=0,buried=0,examples=[],near=99,maxY=player.y;
  const blocks=[...PB.values()];
  for(let i=0;i<150;i++){
    step(1/30,(i+1)*1000/30);frames++;
    maxY=Math.max(maxY,player.y);
    for(const b of blocks)near=Math.min(near,Math.hypot(player.x-(b.x+.5),player.z-(b.z+.5)));
    const x=camera.position.x,y=camera.position.y,z=camera.position.z;
    if(camBuried(x,y,z)){buried++;if(examples.length<6)examples.push({f:i,x:+x.toFixed(2),y:+y.toFixed(2),z:+z.toFixed(2),py:+player.y.toFixed(2),sy:+(player.smoothY||0).toFixed(2)});}
  }
  keys.KeyW=false;keys.Space=false;jumpHeld=false;
  return JSON.stringify({placed:PB.size,first,second,frames,buried,examples,near:+near.toFixed(2),jumped:+(maxY- (SY[(player.x|0)+W*(player.z|0)]||player.y)).toFixed(2),y0:blocks.map(b=>[b.x,b.y,b.z])});
})()`);
const jump=JSON.parse(jumpReport);
log('buildJump',jumpReport);
if(!jump.placed)bad('build-then-jump placed no blocks');
if(jump.buried)bad('camera inside a solid during build-then-jump ('+jump.buried+' frames)');
if(!(jump.near<2.2))bad('player never reached the blocks they built (nearest '+jump.near+')');

const errNow=consoleErrs.filter(e=>!/favicon|Failed to load resource/i.test(e));
log('consoleErrors',JSON.stringify(errNow));
if(errNow.length)bad('console errors: '+errNow.slice(0,4).join(' | '));

log(fails.length?`RESULT ${fails.length} FAILED`:'RESULT ALL PASSED');
const outPath=path.join(here,'rail-yard-spawn.out.txt');
fs.writeFileSync(outPath,lines.join('\n')+'\n');
log('wrote',outPath);
try{cdp.close();}catch(e){}
chrome.kill('SIGKILL');
server.close();
process.exit(fails.length?1:0);
