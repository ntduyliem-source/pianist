import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {offlineBytes, useOnline} from '../src/platform/offline';

test('offline size follows the full manifest including ABC, not a fixed quota',()=>{
  assert.equal(offlineBytes({files:[{bytes:100},{bytes:13000000}]}),13000100);
  assert.throws(()=>offlineBytes({files:[{bytes:NaN}]}),/Manifest/);
});

test('offline worker serves its own release manifest, even if a new server release is deployed', async () => {
  const source = readFileSync(new URL('../../../src/web/appjs/viewer/sw-template.js', import.meta.url), 'utf8');
  const listeners: Record<string, (event: any) => void> = {};
  const release = {version: 'pinned-old', files: []};
  runInNewContext(source.replace('__PIANIST_RELEASE__', JSON.stringify(release)), {
    URL, Response, self: {location: {href: 'https://example.test/pianist/sw.js'}, addEventListener: (name: string, handler: any) => listeners[name] = handler},
  });
  let response!: Response;
  listeners.fetch({request: {method: 'GET', url: 'https://example.test/pianist/release.json'}, respondWith: (value: Response) => response = value});
  assert.deepEqual(await response.json(), release);
});

test('missing pinned code fails closed without fetching a newer release',async()=>{
  const source=readFileSync(new URL('../../../src/web/appjs/viewer/sw-template.js',import.meta.url),'utf8'),listeners:Record<string,(e:any)=>void>={};
  let fetched=false;
  runInNewContext(source.replace('__PIANIST_RELEASE__',JSON.stringify({version:'old',files:[{path:'score-formats/pyodide/pyodide.mjs'}]})),{URL,Response,fetch:()=>{fetched=true;},self:{location:{href:'https://example.test/pianist/sw.js'},addEventListener:(n:string,f:any)=>listeners[n]=f},caches:{open:async()=>({match:async()=>undefined})}});
  let work!:Promise<Response>;listeners.fetch({request:{method:'GET',url:'https://example.test/pianist/score-formats/pyodide/pyodide.mjs'},respondWith:(p:Promise<Response>)=>work=p});
  assert.equal((await work).status,503);assert.equal(fetched,false);
});

test('offline install rejects a corrupt ABC runtime and removes only the incomplete new cache',async()=>{
  const source=readFileSync(new URL('../../../src/web/appjs/viewer/sw-template.js',import.meta.url),'utf8'),listeners:Record<string,(e:any)=>void>={},deleted:string[]=[],puts:string[]=[];
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('good'))).toString('hex');
  runInNewContext(source.replace('__PIANIST_RELEASE__',JSON.stringify({version:'new',files:[{path:'score-formats/pyodide/pyodide.asm.wasm',bytes:4,sha256:hash}]})),{URL,Response,crypto,fetch:async()=>new Response('evil'),self:{location:{href:'https://example.test/pianist/sw.js'},addEventListener:(n:string,f:any)=>listeners[n]=f,clients:{matchAll:async()=>[]}},caches:{has:async()=>false,open:async()=>({match:async()=>undefined,delete:async()=>true,put:async(u:URL)=>puts.push(u.href)}),delete:async(k:string)=>deleted.push(k)}});
  let work!:Promise<void>;listeners.install({waitUntil:(p:Promise<void>)=>work=p});await assert.rejects(work,/sai hash/);assert.deepEqual(puts,[]);assert.deepEqual(deleted,['pianist-release-new-%2Fpianist%2F']);
});
test('activating the new release removes obsolete code caches only for its own scope',async()=>{
  const source=readFileSync(new URL('../../../src/web/appjs/viewer/sw-template.js',import.meta.url),'utf8'),listeners:Record<string,(e:any)=>void>={},deleted:string[]=[];
  runInNewContext(source.replace('__PIANIST_RELEASE__',JSON.stringify({version:'new',files:[]})),{URL,Response,
    self:{location:{href:'https://example.test/pianist/sw.js'},addEventListener:(name:string,fn:any)=>listeners[name]=fn,clients:{matchAll:async()=>[]}},
    caches:{keys:async()=>['pianist-release-old','pianist-release-new','pianist-release-other-scope','another-app'],open:async(key:string)=>({match:async(url:URL)=>key==='pianist-release-old'&&url.pathname==='/pianist/pianist.html'?new Response('old code'):undefined}),delete:async(key:string)=>{deleted.push(key);return true;}}});
  let work!:Promise<void>;listeners.activate({waitUntil:(p:Promise<void>)=>work=p});await work;assert.deepEqual(deleted,['pianist-release-old']);
});

test('switching online unregisters only this app and retains caches needed by existing tabs', async () => {
  const oldLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const unregistered: string[] = [];
  Object.defineProperty(globalThis, 'location', {configurable: true, value: {href: 'https://example.test/pianist/pianist.html'}});
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {serviceWorker: {getRegistrations: async () => ['pianist', 'other'].map(app => ({active: {scriptURL: `https://example.test/${app}/sw.js`}, unregister: async () => {unregistered.push(app); return true;}}))}}});
  Object.defineProperty(globalThis, 'caches', {configurable: true, value: {keys: async () => {throw Error('Must not touch pinned caches while clients remain');}}});
  try { await useOnline(); assert.deepEqual(unregistered, ['pianist']); }
  finally {for (const [key, descriptor] of [['location', oldLocation], ['navigator', oldNavigator], ['caches', oldCaches]] as const) {if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];}}
});

test('reregistering offline keeps old release caches when unregistered workers still control tabs', async () => {
  const source = readFileSync(new URL('../../../src/web/appjs/viewer/sw-template.js', import.meta.url), 'utf8');
  const listeners: Record<string, (event: any) => void> = {};
  runInNewContext(source.replace('__PIANIST_RELEASE__', JSON.stringify({version: 'new', files: []})), {URL, Response,
    self: {location: {href: 'https://example.test/pianist/sw.js'}, addEventListener: (name: string, fn: any) => listeners[name] = fn,
      clients: {matchAll: async () => [{url: 'https://example.test/pianist/pianist.html', postMessage() {}}]}},
    caches: {keys: async () => {throw Error('Cannot collect pinned resources of open tabs');}}});
  let work!: Promise<void>;
  listeners.activate({waitUntil: (p: Promise<void>) => work = p});
  await work;
});
