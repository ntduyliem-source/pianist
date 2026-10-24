// All-library regression: read actual native snapshots and MPE events, including
// previously quarantined sources. No synthetic engraver or timing oracle.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/two-staff-upgrade');
const base=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1';
(async()=>{
 const catalog=JSON.parse(await fs.readFile(path.join(root,'scores/library/catalog.json'),'utf8'));
 await fs.mkdir(path.join(out,'native'),{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),results=[];
 try{
  if(['127.0.0.1','localhost'].includes(new URL(base).hostname)){
   const manifest=JSON.parse(await fs.readFile(path.join(root,'build.artifacts/release.json'),'utf8'));
   for(const name of ['MuseScoreStudio.js','MuseScoreStudio.wasm']){
    const bytes=await fs.readFile(path.join(root,'build.artifacts',name));
    const entry=manifest.files.find(f=>f.path===name);entry.bytes=bytes.length;entry.sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
   }
   await page.route('**/release.json',r=>r.fulfill({json:manifest}));
  }
  await page.goto(base);await page.locator('#file').setInputFiles(path.join(root,'scores',catalog.songs[0].url));
  await page.waitForFunction(()=>window.pianist,null,{timeout:120000});
  await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:120000});
  const fixtures=['special-symbols.musicxml','pedal-duration.musicxml'];
  const inputs=[...catalog.songs.map(s=>({...s,path:path.join(root,'scores',s.url)})),
    ...fixtures.map(name=>({id:name,title:name,filename:name,path:path.join(root,'tests/fixtures/pianist/practice',name)}))];
  for(const row of inputs){
   try{
    const bytes=await fs.readFile(row.path);
    const data=await page.evaluate(({bytes,filename})=>{
     const a=window.pianist;a.setPracticeActive(false);if(!a.loadScoreData(Uint8Array.from(bytes),filename))throw Error('Native import failed');
     const read=(cb,method,...args)=>{const old=a.Module[cb];let value;a.Module[cb]=j=>value=JSON.parse(j);try{if(!a[method](...args))throw Error(method);return value;}finally{a.Module[cb]=old;}};
     const snapshot=read('onPracticeSnapshot','getPracticeSnapshot'),sample=read('onSamplePlayback','getSamplePlayback',1);
     const glyphs=new Set(snapshot.pages.flatMap(p=>[...p.svg.matchAll(/data-practice-notes="([^"]+)"/g)].flatMap(m=>m[1].split(' '))));
     const missing=snapshot.anchors.filter(n=>n.visible&&!glyphs.has(n.id.replace(/^m\d+-/,''))).map(n=>n.id);
     const actual=sample.events.filter(n=>n.anchors.length).map(n=>[n.pitch,n.atMs,n.endMs,n.anchors]);
     const expected=snapshot.performance?.events.map(n=>[n.pitch,n.atMs,n.endMs,n.anchors]);
     const noSpan=snapshot.performance?.events.filter(n=>!n.spans.length).map(n=>({pitch:n.pitch,atMs:n.atMs,anchors:n.anchors}));
     return {snapshot:{...snapshot,pages:snapshot.pages.map(({svg,...p})=>({...p,svg:''}))},missing,actual,expected,noSpan,
       counts:{staves:snapshot.staves.length,anchors:snapshot.anchors.length,graces:snapshot.anchors.filter(n=>n.grace).length,events:expected?.length,pages:snapshot.pages.length,pedals:snapshot.pedals.length},
       midiAttacks:sample.midi.filter(n=>n.opcode===9&&n.data2>0).length};
    },{bytes:[...bytes],filename:row.filename});
    assert(data.expected?.length,'Missing native performance events');
    assert.deepEqual(data.expected,data.actual,'Grader reference differs from audible MPE');
    assert.deepEqual(data.missing,[],'Missing note ink');assert.deepEqual(data.noSpan,[],'Missing event source span');
    if(row.url)assert.equal(data.counts.staves,2);
    await fs.writeFile(path.join(out,'native',row.id+'.json'),JSON.stringify({...data.snapshot,projectId:row.id,fingerprint:row.id}));
    results.push({id:row.id,title:row.title,passed:true,...data.counts,midiAttacks:data.midiAttacks});
    console.log(`${results.length}/${inputs.length} ${row.title}: ${data.counts.events} MPE attacks, ${data.counts.graces} grace notes`);
   }catch(e){results.push({id:row.id,title:row.title,passed:false,error:String(e)});console.log('FAIL',row.title,String(e));}
   await fs.writeFile(path.join(out,'native-audit.json'),JSON.stringify({passed:results.length===inputs.length&&results.every(r=>r.passed),expected:inputs.length,results},null,2));
  }
  assert(results.length===inputs.length&&results.every(r=>r.passed),'Some native cases failed or were not checked');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
