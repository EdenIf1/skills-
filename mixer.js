// Cubefront sound mixer. Runs on the audio thread as one permanent node: the game sends it recorded sounds once,
// then only short "play" messages. Every sound in the game is mixed here into a single stream, so the phone's audio
// system sees the same small, steady load whether the match is quiet or twenty things explode at once.
// At most 16 sounds play together; when all are busy the least important gives way (your own gun keeps at most 3).
class BfMix extends AudioWorkletProcessor{
  constructor(){super();this.bufs=new Map();this.v=[];this.max=16;this.loop=null;this.tell=0;
    this.port.onmessage=e=>{const m=e.data;try{
      if(m.t==='b')this.bufs.set(m.id,{d:m.d,step:m.sr/sampleRate});
      else if(m.t==='p')this.play(m);
      else if(m.t==='l')this.hold(m);
      else if(m.t==='n')this.max=Math.max(4,Math.min(16,m.n|0));
      else if(m.t==='x'){this.v=[];this.loop=null;}}catch(err){}};}
  play(m){const b=this.bufs.get(m.id);if(!b)return;const V=this.v;
    const pan=Math.max(-1,Math.min(1,+m.p||0)),vol=+m.vol||0;
    const nv={b,pos:0,step:b.step*(m.r||1),vol,gl:vol*(pan>0?1-pan*.75:1),gr:vol*(pan<0?1+pan*.75:1),prio:m.pr|0,grp:m.g||'',age:currentTime};
    if(nv.grp){const mine=V.filter(x=>x.grp===nv.grp);if(mine.length>=3){const o=mine.reduce((a,c)=>a.age<=c.age?a:c);V.splice(V.indexOf(o),1);}}
    if(V.length>=this.max){let w=0,ws=1e9;for(let i=0;i<V.length;i++){const s=V[i].prio*10+V[i].vol;if(s<ws||(s===ws&&V[i].age<V[w].age)){ws=s;w=i;}}
      if(nv.prio*10+nv.vol<ws)return;V.splice(w,1);}
    V.push(nv);}
  // a looping sound (your minigun) that keeps playing while "hold" messages keep coming
  hold(m){const b=this.bufs.get(m.id);if(!b)return;const L=this.loop;
    if(L&&L.b===b){L.vol=+m.vol||0;L.until=currentTime+.25;L.fade=1;return;}
    // loop region .36 s to .72 s of the recording, in the recording's own samples
    this.loop={b,pos:0,step:b.step,vol:+m.vol||0,until:currentTime+.25,fade:1,ls:Math.floor(.36*sampleRate*b.step),le:Math.floor(.72*sampleRate*b.step)};}
  process(inputs,outputs){const out=outputs[0];if(!out||!out.length)return true;const o=out[0],n=o.length;o.fill(0);
    const V=this.v;
    // the right channel holds what differs from the left (only panned sounds write to it)
    const r=out.length>1?out[1]:null;if(r)r.fill(0);let panned=false;
    for(let k=V.length-1;k>=0;k--){const x=V[k],d=x.b.d,len=d.length-1;let p=x.pos;const st=x.step,gl=x.gl,gr=x.gr;
      if(gl===gr||!r){for(let i=0;i<n;i++){if(p>=len){break;}const i0=p|0,f=p-i0;o[i]+=(d[i0]+(d[i0+1]-d[i0])*f)*gl;p+=st;}}
      else{panned=true;const dg=gr-gl;for(let i=0;i<n;i++){if(p>=len){break;}const i0=p|0,f=p-i0,sm=d[i0]+(d[i0+1]-d[i0])*f;o[i]+=sm*gl;r[i]+=sm*dg;p+=st;}}
      x.pos=p;if(p>=len)V.splice(k,1);}
    const L=this.loop;
    if(L){const d=L.b.d;if(currentTime>L.until)L.fade-=n/(sampleRate*.08);
      if(L.fade<=0||!d.length)this.loop=null;
      else{let p=L.pos;const g=L.vol*Math.max(0,L.fade),le=Math.min(L.le,d.length-2),ls=Math.min(L.ls,le-1);
        for(let i=0;i<n;i++){if(p>=le)p=ls+(p-le);const i0=p|0,f=p-i0;o[i]+=(d[i0]+(d[i0+1]-d[i0])*f)*g;p+=L.step;}L.pos=p;}}
    if(r){if(panned){for(let i=0;i<n;i++)r[i]+=o[i];}else r.set(o);}
    for(let c=2;c<out.length;c++)out[c].set(o);
    if(++this.tell>=150){this.tell=0;this.port.postMessage({t:'v',n:V.length+(this.loop?1:0)});}
    return true;}
}
registerProcessor('bfmix',BfMix);
