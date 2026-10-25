/* Network-first service worker: always tries the latest version online, falls back to the last copy offline.
   Never touches Supabase traffic — data sync goes through cloud.js. */
const CACHE='studylog-shell-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  e.respondWith(fetch(req).then(res=>{
    if(res.ok){
      const copy=res.clone();
      // Keep one copy per file: drop older ?v= versions before storing this one.
      caches.open(CACHE).then(c=>c.delete(req,{ignoreSearch:true}).then(()=>c.put(req,copy)));
    }
    return res;
  }).catch(()=>caches.match(req,{ignoreSearch:true})
    .then(r=>r||(req.mode==='navigate'?caches.match('./',{ignoreSearch:true}):undefined))
    .then(r=>r||Response.error())));
});
