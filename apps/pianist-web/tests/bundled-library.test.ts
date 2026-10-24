import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBundledScore,parseBundledCatalog,groupBundledScores,selectBundledVersion,bundledVersionLabel,matchesBundledWork,type BundledScore} from '../src/platform/bundled-library';
const song:BundledScore={id:'a'.repeat(64),sha256:'a'.repeat(64),bytes:12,title:'Em ơi Hà Nội phố',filename:'Em ơi Hà Nội phố.mxl',url:'library/songs/em-oi-ha-noi-pho.mxl'};
test('bundled library keeps Vietnamese titles and rejects duplicate or unsafe catalog entries',()=>{
  assert.equal(parseBundledCatalog({schemaVersion:1,songs:[song]})[0].title,song.title);
  for(const url of ['https://other.test/song.mxl','library/songs/../secret.mxl','library/songs/x.mxl?x=1'])assert.throws(()=>parseBundledCatalog({schemaVersion:1,songs:[{...song,url}]}));
  assert.throws(()=>parseBundledCatalog({schemaVersion:1,songs:[song,song]}));
  assert.throws(()=>parseBundledCatalog({schemaVersion:1,songs:[{...song,bytes:33*1024**2}]}));
});
test('arrangements group by stable work identity, preserve version numbers and never merge unrelated same-title works',()=>{
  const second={...song,id:'b'.repeat(64),sha256:'b'.repeat(64),url:'library/songs/em-oi-v2.mxl',workId:song.id,version:2,versionLabel:'Bản piano dễ'};
  const unrelated={...song,id:'c'.repeat(64),sha256:'c'.repeat(64),url:'library/songs/unrelated.mxl'};
  const entries=[second,unrelated,song];
  const groups=groupBundledScores(parseBundledCatalog({schemaVersion:1,songs:entries}));
  assert.equal(groups.length,2);assert.deepEqual(groups[0].versions,[song,second]);assert.equal(entries[0],second);
  assert.equal(selectBundledVersion(groups[0],second.id),second);
  assert.equal(selectBundledVersion(groups[0],'removed-version'),song);
  assert.equal(bundledVersionLabel(second),'Version 2 · Bản piano dễ');assert.equal(bundledVersionLabel(song),'Version 1');
  assert.equal(matchesBundledWork(groups[0],'piano dễ'),true);assert.equal(matchesBundledWork(groups[1],'piano dễ'),false);
});
test('catalog allows a retired root but rejects duplicate ordinals, malformed support flags and duplicate paths',()=>{
  const second={...song,id:'b'.repeat(64),sha256:'b'.repeat(64),url:'library/songs/another.mxl',workId:song.id,version:2};
  assert.equal(parseBundledCatalog({schemaVersion:1,songs:[second]})[0].version,2);
  for(const patch of [{version:0},{version:2.5},{version:501},{version:undefined},{workId:'other'},
    {practiceReady:false},{practiceReady:'false'},{practiceNotice:''},{versionLabel:' '},{composer:2}]){
    assert.throws(()=>parseBundledCatalog({schemaVersion:1,songs:[song,{...second,...patch}]}));
  }
  assert.throws(()=>parseBundledCatalog({schemaVersion:1,songs:[song,{...second,version:1}]}),/Nhóm phiên bản/);
  assert.throws(()=>parseBundledCatalog({schemaVersion:1,songs:[song,{...second,url:song.url}]}),/trùng/);
});
test('a selected alternate downloads its own bytes without requiring a one-item root catalog',async()=>{
  const original=globalThis.fetch,bytes=new TextEncoder().encode('second arrangement'),sha=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  const entry={...song,id:sha,sha256:sha,bytes:bytes.length,url:'library/songs/em-oi-v2.mxl',workId:song.id,version:2};
  let requested='';
  try{
    globalThis.fetch=async url=>{requested=String(url);return new Response(bytes);};
    assert.deepEqual(await loadBundledScore(entry),bytes);assert.equal(requested,entry.url);
  }finally{globalThis.fetch=original;}
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
