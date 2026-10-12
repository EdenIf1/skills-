// Offline cache for Cubefront. The page is fetched network-first so updates arrive;
// the game's own files (engine, icons, fonts) are served from cache first.
// Requests to other sites (the save server, relays, updates) are never cached: progress must always be live.
const CACHE='blockfire-50c8248ede';
const CORE=['./','index.html','three.min.js','peerjs.min.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png','fonts.css',
  'fonts/teko-latin-400-normal.woff2','fonts/teko-latin-500-normal.woff2','fonts/teko-latin-600-normal.woff2','fonts/silkscreen-latin-400-normal.woff2','fonts/silkscreen-latin-700-normal.woff2',
  'fonts/chakra-petch-latin-400-normal.woff2','fonts/chakra-petch-latin-600-normal.woff2'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  if(new URL(r.url).origin!==self.location.origin)return;
  const isPage=r.mode==='navigate'||r.url.endsWith('/index.html')||r.url.endsWith('/');
  if(isPage){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));return;}
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));}return res;})));
});
