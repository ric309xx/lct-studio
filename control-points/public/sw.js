const CACHE='lct-points-shell-__BUILD__';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/icon.svg','/manifest.webmanifest',/*__ASSETS__*/])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lct-points-shell-')&&k!==CACHE).map(k=>caches.delete(k))))]));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  // An already-open page can still run the pre-challenge login after this worker
  // takes control. Reload only that rejected login tab, never a working map or upload.
  if(event.request.method==='POST'&&url.pathname==='/api/login'){
    const response=fetch(event.request);
    event.respondWith(response);
    event.waitUntil(response.then(async result=>{
      if(result.status!==409||!event.clientId)return;
      const client=await self.clients.get(event.clientId);
      if(!client||client.type!=='window')return;
      const target=new URL(client.url);
      if(target.origin!==self.location.origin)return;
      target.searchParams.set('app-update',CACHE);
      await client.navigate(target.href);
    }).catch(()=>{}));
    return;
  }
  if(event.request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/files/'))return;
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put('/',clone)));}return response;}).catch(()=>caches.open(CACHE).then(c=>c.match('/'))));
  else if(url.pathname.startsWith('/assets/')||['/icon.svg','/manifest.webmanifest'].includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,clone)));}return response;})));
});
