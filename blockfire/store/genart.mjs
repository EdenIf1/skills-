import { chromium } from 'playwright';import fs from 'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:900,height:500}});await ctx.addInitScript(()=>{localStorage.setItem('blockfire.cloudcfg',JSON.stringify({url:'',key:''}));});
const p=await ctx.newPage();p.on('pageerror',e=>console.log('ERR',e.message));await p.goto('http://127.0.0.1:8765/index.html');await p.waitForTimeout(2500);
await p.evaluate(()=>document.fonts.load('700 190px Silkscreen'));await p.waitForTimeout(300);
const out=await p.evaluate(()=>window.__bf.ev(`(()=>{
  const res={};
  const R=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});R.setPixelRatio(1);
  const scene3=()=>{const sc=new THREE.Scene();sc.add(new THREE.HemisphereLight(0xffffff,0x303846,.85));const d=new THREE.DirectionalLight(0xfff0d8,.6);d.position.set(-2,5,2.5);sc.add(d);const d2=new THREE.DirectionalLight(0x9fc4ff,.35);d2.position.set(-4,1,-2);sc.add(d2);return sc;};
  function iconArt(S,noBg){
    const sc=scene3(),cam=new THREE.PerspectiveCamera(30,1,.1,100);
    const cube=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),MATS[B.CRATE]);cube.rotation.set(.5,.785,0);cube.position.set(.18,.32,-.2);cube.scale.setScalar(.95);sc.add(cube);
    const g=buildGun('ak',camoMat('none'),true,{optic:'holo'});g.scale.setScalar(1.55);g.rotation.set(.1,-Math.PI/2+.38,.42);g.position.set(-.24,-.4,.9);sc.add(g);
    cam.position.set(0,.1,4.75);cam.lookAt(0,-.02,0);R.setSize(S,S,false);R.render(sc,cam);
    sc.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(g);
    // the muzzle is the gun's far end along its barrel: find the farthest vertex in the barrel direction
    const dir=new THREE.Vector3(0,0,-1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));let best=null,bd=-1e9;
    g.traverse(m=>{if(!m.geometry)return;const pos=m.geometry.attributes.position;const v=new THREE.Vector3();for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(m.matrixWorld);const d=v.dot(dir);if(d>bd){bd=d;best=v.clone();}}});
    const sp2=best.clone().add(dir.clone().multiplyScalar(.12)).project(cam);iconArt.mx=(sp2.x+1)/2*S;iconArt.my=(1-sp2.y)/2*S;
    const cv=document.createElement('canvas');cv.width=cv.height=S;const c=cv.getContext('2d');
    if(!noBg){const bg=c.createRadialGradient(S*.5,S*.42,S*.05,S*.5,S*.5,S*.75);bg.addColorStop(0,'#33465f');bg.addColorStop(.55,'#141b25');bg.addColorStop(1,'#07090d');c.fillStyle=bg;c.fillRect(0,0,S,S);}
    const gl=c.createRadialGradient(S*.5,S*.55,0,S*.5,S*.55,S*.42);gl.addColorStop(0,'rgba(243,181,74,.55)');gl.addColorStop(1,'rgba(243,181,74,0)');c.fillStyle=gl;c.fillRect(0,0,S,S);
    c.drawImage(R.domElement,0,0,S,S);
    // muzzle spark
    const mx=iconArt.mx,my=iconArt.my,sp=c.createRadialGradient(mx,my,0,mx,my,S*.08);sp.addColorStop(0,'rgba(255,248,215,1)');sp.addColorStop(.35,'rgba(255,180,70,.75)');sp.addColorStop(1,'rgba(255,120,30,0)');c.fillStyle=sp;c.fillRect(mx-S*.1,my-S*.1,S*.2,S*.2);
    return cv;}
  const ic=iconArt(1024);res.icon=ic.toDataURL('image/png');
  // splash: the logo on a dark field (square so it fits every screen)
  const S=2732,sv=document.createElement('canvas');sv.width=sv.height=S;const c=sv.getContext('2d');c.fillStyle='#0b0f15';c.fillRect(0,0,S,S);
  const gl=c.createRadialGradient(S/2,S/2,0,S/2,S/2,S*.45);gl.addColorStop(0,'rgba(51,70,95,.9)');gl.addColorStop(1,'rgba(11,15,21,0)');c.fillStyle=gl;c.fillRect(0,0,S,S);
  const small=iconArt(1000,true);c.drawImage(small,S/2-500,S/2-640,1000,1000);
  c.font='700 170px Silkscreen';c.textBaseline='middle';const w1=c.measureText('BLOCK').width,w2=c.measureText('FIRE').width,x0=S/2-(w1+w2)/2;c.fillStyle='#eef2f4';c.fillText('BLOCK',x0,S/2+440);c.fillStyle='#f3b54a';c.fillText('FIRE',x0+w1,S/2+440);
  res.splash=sv.toDataURL('image/png');return res;})()`));
for(const [k,v] of Object.entries(out)){fs.writeFileSync(`../art/${k}.png`,Buffer.from(v.split(',')[1],'base64'));}
console.log('ok');await b.close();
