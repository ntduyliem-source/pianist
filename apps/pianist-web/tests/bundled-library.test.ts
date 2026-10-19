import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBundledScore,parseBundledCatalog,type BundledScore} from '../src/platform/bundled-library';
const song:BundledScore={id:'a'.repeat(64),sha256:'a'.repeat(64),bytes:12,title:'Em ơi Hà Nội phố',filename:'Em ơi Hà Nội phố.mxl',url:'library/songs/em-oi-ha-noi-pho.mxl'};
test('bundled library keeps Vietnamese titles and rejects duplicate or unsafe catalog entries',()=>{
  assert.equal(parseBundledCatalog({schemaVersion:1,songs:[song]})[0].title,song.title);
  for(const url of ['https://other.test/song.mxl','library/songs/../secret.mxl','library/songs/x.mxl?x=1'])assert.throws(()=>parseBundledCatalog({schemaVersion:1,songs:[{...song,url}]}));
  assert.throws(()=>parseBundledCatalog({schemaVersion:1,songs:[song,song]}));
  assert.throws(()=>parseBundledCatalog({schemaVersion:1,songs:[{...song,bytes:33*1024**2}]}));
});
test('bundled song download verifies both size and SHA before import',async()=>{
  const original=globalThis.fetch,bytes=new TextEncoder().encode('real fixture'),sha=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  const entry={...song,id:sha,sha256:sha,bytes:bytes.length};
  try{
    globalThis.fetch=async()=>new Response(bytes);
    assert.deepEqual(await loadBundledScore(entry),bytes);
    globalThis.fetch=async()=>new Response('evil fixture');
    await assert.rejects(loadBundledScore(entry),/sai phiên bản/);
    globalThis.fetch=async()=>new Response('missing',{status:404});
    await assert.rejects(loadBundledScore(entry),/Không tải được/);
  }finally{globalThis.fetch=original;}
});
