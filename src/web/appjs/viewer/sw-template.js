// SPDX-License-Identifier: GPL-3.0-only
// Each installed worker pins a complete release. No skipWaiting/client takeover mid-session.
const RELEASE = __PIANIST_RELEASE__;
const CACHE = 'pianist-release-' + RELEASE.version;
const base = new URL('./', self.location.href);
const paths = new Set(RELEASE.files.map(f => new URL(f.path, base).pathname));
const report = async (data) => {for (const client of await self.clients.matchAll({includeUncontrolled:true})) client.postMessage(data);};
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE); let done = 0;
  try {
    for (const file of RELEASE.files) {
      const url = new URL(file.path, base);
      const response = await fetch(url, {cache:'no-store'});
      if (!response.ok) throw Error('Không tải được ' + file.path);
      const bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if (hash !== file.sha256) throw Error('Bản phát hành đã đổi trong lúc tải. Hãy thử lại.');
      await cache.put(url, new Response(bytes, {status:200,headers:response.headers}));
      await report({type:'offline-progress', done:++done, total:RELEASE.files.length});
    }
    await report({type:'offline-ready', version:RELEASE.version});
  } catch (error) {await caches.delete(CACHE); await report({type:'offline-error', message:String(error)}); throw error;}
})()));
self.addEventListener('activate', event => event.waitUntil((async()=>{
  // Activation waits for the previous worker's clients to close. At that point
  // remove its executable cache, restricted to this app's URL scope.
  for(const key of await caches.keys()){
    if(key===CACHE||!key.startsWith('pianist-release-'))continue;
    const cache=await caches.open(key);
    if(await cache.match(new URL('pianist.html',base)))await caches.delete(key);
  }
  await report({type:'offline-active',version:RELEASE.version});
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== base.origin) return;
  if (url.pathname === new URL('release.json', base).pathname) {
    event.respondWith(new Response(JSON.stringify(RELEASE), {headers: {'Content-Type': 'application/json'}})); return;
  }
  if (url.pathname === base.pathname) url.pathname += 'pianist.html';
  if (!paths.has(url.pathname)) return;
  url.search = '';
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(url)).then(response=>response || fetch(event.request)));
});
