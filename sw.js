// Offline cache for Cubefront. The page is fetched network-first so updates arrive;
// the game's own files (engine, icons, fonts) are served from cache first.
// Requests to other sites (the save server, relays, updates) are never cached: progress must always be live.
const CACHE='blockfire-4273af8c83';
const CORE=['./','index.html','play.html','wrap.js','three.min.js','peerjs.min.js','mixer.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png','fonts.css',
  'fonts/teko-latin-400-normal.woff2','fonts/teko-latin-500-normal.woff2','fonts/teko-latin-600-normal.woff2','fonts/silkscreen-latin-400-normal.woff2','fonts/silkscreen-latin-700-normal.woff2',
  'fonts/chakra-petch-latin-400-normal.woff2','fonts/chakra-petch-latin-600-normal.woff2'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  if(new URL(r.url).origin!==self.location.origin)return;
  const isPage=r.mode==='navigate'||r.url.endsWith('/index.html')||r.url.endsWith('/play.html')||r.url.endsWith('/');
  if(isPage){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));return;}
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));}return res;})));
});
// notifications the player turned on in Settings: rental ending, daily gift, friend invite
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{};}catch(x){d={t:'Cubefront',b:e.data?e.data.text():''};}
  const u=typeof d.u==='string'&&/^https:\/\//.test(d.u)?d.u:self.registration.scope;
  e.waitUntil(self.registration.showNotification(String(d.t||'Cubefront').slice(0,80),{body:String(d.b||'').slice(0,240),icon:'icon-192.png',badge:'icon-192.png',tag:String(d.tag||'cubefront').slice(0,40),data:{u}}));});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=(e.notification.data&&e.notification.data.u)||self.registration.scope;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){if(w.url.indexOf(self.registration.scope)===0&&'focus' in w){if(u.indexOf('#')>0&&'navigate' in w)return w.navigate(u).then(x=>x&&x.focus()).catch(()=>w.focus());return w.focus();}}
    return self.clients.openWindow(u);}));});
