// SPDX-License-Identifier: GPL-3.0-only
// Each installed worker pins a complete release. No skipWaiting/client takeover mid-session.
const RELEASE = __PIANIST_RELEASE__;
const base = new URL('./', self.location.href);
const CACHE = 'pianist-release-' + RELEASE.version + '-' + encodeURIComponent(base.pathname);
const paths = new Set(RELEASE.files.map(f => new URL(f.path, base).pathname));
const eagerFiles = RELEASE.files.filter(f => f.cache !== 'lazy');
const lazyFiles = new Map(RELEASE.files.filter(f => f.cache === 'lazy').map(f=>[new URL(f.path,base).pathname,f]));
const LAZY_CACHE = CACHE + '-exercises';
const report = async (data) => {for (const client of await self.clients.matchAll({includeUncontrolled:true})) if(client.url?.startsWith(base.href))client.postMessage({...data,version:RELEASE.version});};
const valid = async (response,file) => {
  if(!response?.ok)return false;
  const bytes=await response.arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return bytes.byteLength===file.bytes&&hash===file.sha256;
};
let preparing;
const prepare = () => preparing ??= (async () => {
  const existed=await caches.has(CACHE);
  const cache = await caches.open(CACHE); let done = 0;
  try {
    const missing=[];
    for(const file of eagerFiles){const url=new URL(file.path,base);if(!await valid(await cache.match(url),file)){await cache.delete(url);missing.push(file);}}
    const required=Math.ceil(missing.reduce((n,f)=>n+f.bytes,0)*1.1);
    const estimate=await self.navigator?.storage?.estimate();
    if(estimate?.quota&&estimate.quota-(estimate.usage??0)<required)throw Error(`Cần khoảng ${Math.ceil(required/1024**2)} MiB bộ nhớ trống cho bản offline này.`);
    for (const file of eagerFiles) {
      const url = new URL(file.path, base);
      if(missing.includes(file)){
        const response = await fetch(url, {cache:'no-store'});
        if (!response.ok) throw Error('Không tải được ' + file.path);
        if(!await valid(response.clone(),file))throw Error('Tài nguyên sai hash/phiên bản: '+file.path+'. Hãy thử lại.');
        await cache.put(url, response);
      }
      await report({type:'offline-progress', done:++done, total:eagerFiles.length});
    }
    await report({type:'offline-ready', version:RELEASE.version});
  } catch (error) {if(!existed)await caches.delete(CACHE);await report({type:'offline-error', message:String(error)});throw error;}
})().finally(()=>{preparing=undefined;});
self.addEventListener('install', event => event.waitUntil(prepare()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='offline-verify')return;
  event.waitUntil(prepare().then(()=>event.ports[0]?.postMessage({ok:true,version:RELEASE.version,bytes:eagerFiles.reduce((n,f)=>n+f.bytes,0)}),error=>event.ports[0]?.postMessage({ok:false,message:String(error)})));
});
self.addEventListener('activate', event => event.waitUntil((async()=>{
  // Activation waits for the previous worker's clients to close. At that point
  // remove its executable cache, restricted to this app's URL scope.
  for(const key of await caches.keys()){
    if(key===CACHE||key===LAZY_CACHE||!key.startsWith('pianist-release-'))continue;
    const cache=await caches.open(key);
    if(key.endsWith('-'+encodeURIComponent(base.pathname)+'-exercises')){await caches.delete(key);continue;}
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
  if(lazyFiles.has(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(LAZY_CACHE),file=lazyFiles.get(url.pathname),cached=await cache.match(url);
      if(cached)return cached;
      const response=await fetch(url);
      if(!await valid(response.clone(),file))return new Response('Bài tập sai hash/phiên bản.',{status:503});
      await cache.put(url,response.clone());
      // Bound the on-demand cache; never download the whole bank on install.
      const keys=await cache.keys();for(const old of keys.slice(0,-32))await cache.delete(old);
      return response;
    })());return;
  }
  // Never fill a missing pinned file with code from a different server release.
  // Explicit offline preparation can repair it with the same expected hash.
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(url)).then(response=>response || new Response('Bộ offline thiếu tài nguyên. Kết nối mạng và chuẩn bị offline lại.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
});
