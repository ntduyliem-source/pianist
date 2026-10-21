// Persistent offline oracle: actual .mxl -> MuseScore semantics + worker renderer.
// JSON-lines stdin/stdout; no changes to the application or performance scorer.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),readline=require('node:readline');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const say=value=>process.stdout.write(JSON.stringify(value)+'\n');
console.log=(...values)=>process.stderr.write(values.join(' ')+'\n');
(async()=>{
  const release=JSON.parse(await fs.readFile(path.join(root,'build.artifacts/release.json'),'utf8'));
  const engines={};
  for(const name of ['MuseScoreStudio.js','MuseScoreStudio.wasm','renderer/PianistRenderer.mjs','renderer/PianistRenderer.wasm']){
    engines[name]=sha(await fs.readFile(path.join(root,'build.artifacts',name)));
    if(engines[name]!==release.files.find(f=>f.path===name)?.sha256)throw Error('native-build-changed:'+name);
  }
  const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[path.join(root,'apps/pianist-web')]})).href);
  for(const lab of ['q2','q4'])await build({configFile:false,base:'./',logLevel:'warn',
    define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{
      outDir:path.join(root,'build.artifacts',lab+'-lab'),emptyOutDir:true,
      lib:{entry:path.join(__dirname,lab+'-lab.ts'),formats:['es'],fileName:()=>lab+'-lab.js'}},worker:{format:'es'}});
  const browser=await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',headless:true});
  let page;
  const boot=async()=>{
    if(page)await page.close({runBeforeUnload:false}).catch(()=>{});
    page=await browser.newPage();page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
    await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1');
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.musicxml'));
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Đã mở piano.musicxml.',null,{timeout:180000});
    await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
    for(const lab of ['q2','q4'])await page.addScriptTag({type:'module',url:`/${lab}-lab/${lab}-lab.js`});
    await page.waitForFunction(()=>window.q2Lab&&window.q4Lab);
  };
  try{
    await boot();say({ready:true,engines});
    for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
      if(!line.trim())continue;
      const job=JSON.parse(line);if(job.close)break;
      let timer;
      try{
        const bytes=await fs.readFile(job.mxl),raw=await fs.readFile(job.analysis),analysis=JSON.parse(raw);
        if(sha(bytes)!==job.mxlSha256||sha(raw)!==job.analysisSha256||analysis.sourceSha256!==sha(bytes))throw Error('native-input-hash');
        const result=await Promise.race([
          page.evaluate(async input=>{
            const n=window.q2Lab.inspect(input),r=await window.q4Lab.render(input);
            return {verification:n.verification,render:{counts:r.counts,glyphsComplete:r.glyphsComplete,
              editorUnchanged:r.editorUnchanged,systems:r.systems,sourceHash:r.sourceHash},
              semantic:JSON.stringify(n.snapshot)};
          },{bytes:[...bytes],name:job.id+'.mxl',analysis,hand:job.hand||undefined}),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native-timeout')),60000);})]);
        const semanticSha256=sha(result.semantic);delete result.semantic;
        const v=result.verification,r=result.render;
        say({id:job.id,...result,semanticSha256,engines,mxlSha256:sha(bytes),analysisSha256:sha(raw),
          passed:v.eligibleForFragmentReview===true&&!v.releaseBlockers.length&&r.glyphsComplete&&r.editorUnchanged
            &&v.counts.targets===job.sourceAttackCount&&r.counts.targets===job.sourceAttackCount&&r.sourceHash===sha(bytes)});
      }catch(error){say({id:job.id,passed:false,error:String(error.stack||error)});await boot();}
      finally{clearTimeout(timer);}
    }
  }finally{await browser.close();process.stdin.destroy();}
  // Vite's module runner can retain handles; the explicit close message is EOF.
  process.exit(0);
})().catch(error=>{say({fatal:String(error.stack||error)});process.exitCode=1;});
