import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

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
test('activating the new release removes obsolete code caches only for its own scope',async()=>{
  const source=readFileSync(new URL('../../../src/web/appjs/viewer/sw-template.js',import.meta.url),'utf8'),listeners:Record<string,(e:any)=>void>={},deleted:string[]=[];
  runInNewContext(source.replace('__PIANIST_RELEASE__',JSON.stringify({version:'new',files:[]})),{URL,Response,
    self:{location:{href:'https://example.test/pianist/sw.js'},addEventListener:(name:string,fn:any)=>listeners[name]=fn,clients:{matchAll:async()=>[]}},
    caches:{keys:async()=>['pianist-release-old','pianist-release-new','pianist-release-other-scope','another-app'],open:async(key:string)=>({match:async(url:URL)=>key==='pianist-release-old'&&url.pathname==='/pianist/pianist.html'?new Response('old code'):undefined}),delete:async(key:string)=>{deleted.push(key);return true;}}});
  let work!:Promise<void>;listeners.activate({waitUntil:(p:Promise<void>)=>work=p});await work;assert.deepEqual(deleted,['pianist-release-old']);
});
