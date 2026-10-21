// Independent native MuseScore oracle. Neither this lab nor its inputs ship.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const {gzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'../../..');
const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const jobsPath=path.resolve(arg('--jobs',path.join(root,'artifacts/q2-native/jobs.json')));
const reportPath=path.resolve(arg('--report',path.join(path.dirname(jobsPath),'report.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
(async()=>{
  const release=JSON.parse(await fs.readFile(path.join(root,'build.artifacts/release.json'),'utf8'));
  const engine={};
  for(const name of ['MuseScoreStudio.js','MuseScoreStudio.wasm']){
    const bytes=await fs.readFile(path.join(root,'build.artifacts',name));
    assert.equal(sha(bytes),release.files.find(f=>f.path===name)?.sha256);engine[name]=sha(bytes);
  }
  const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[path.join(root,'apps/pianist-web')]})).href);
  await build({configFile:false,base:'./',define:{'process.env.NODE_ENV':JSON.stringify('production')},
    build:{outDir:path.join(root,'build.artifacts/q2-lab'),emptyOutDir:true,
      lib:{entry:path.join(__dirname,'q2-lab.ts'),formats:['es'],fileName:()=> 'q2-lab.js'}}});
  const jobs=JSON.parse(await fs.readFile(jobsPath,'utf8'));
  const verifierFiles=['packages/exercise-generator/source-verification.ts','packages/practice-engine-v2/score-adapter.ts',
    'packages/practice-engine-v2/reference-adapter-r4.ts','tests/browser/pianist/q2-lab.ts','tests/browser/pianist/q2-native.cjs'];
  const verifierHashes={};
  for(const name of verifierFiles)verifierHashes[name]=sha(await fs.readFile(path.join(root,name)));
  const browser=await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',headless:true});
  const report={at:new Date().toISOString(),engineBuild:sha(JSON.stringify(engine)),engine,
    verifierBuild:sha(JSON.stringify(verifierHashes)),verifierHashes,
    release:release.version,pipeline:jobs.pipeline,entries:[],errors:[]};
  await fs.mkdir(path.dirname(reportPath),{recursive:true});
  await fs.mkdir(path.join(path.dirname(reportPath),'snapshots'),{recursive:true});
  let page;
  const boot=async()=>{
    page=await browser.newPage();
    page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
    await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1');
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.musicxml'));
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Đã mở piano.musicxml.',null,{timeout:180000});
    await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
    await page.addScriptTag({type:'module',url:'/q2-lab/q2-lab.js'});
    await page.waitForFunction(()=>window.q2Lab);
  };
  const save=()=>fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  try{
    await boot();
    for(const [i,job] of jobs.entries.entries()){
      const xml=await fs.readFile(job.xml),raw=await fs.readFile(job.analysis),analysis=JSON.parse(raw);
      assert.equal(sha(raw),job.analysisSha256);assert.equal(sha(xml),analysis.pianoXmlSha256);
      const row={id:job.id,analysisSha256:sha(raw),pianoXmlSha256:sha(xml),inputHashVerified:true};
      const at=performance.now();let timer;
      try{
        const output=await Promise.race([
          page.evaluate(input=>window.q2Lab.inspect(input),{bytes:[...xml],name:job.id+'.musicxml',analysis,notationOracle:job.expectEligible!==undefined}),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native-timeout')),45000);})]);
        row.verification=output.verification;
        if(output.notation)row.notation=output.notation;
        if(job.expectedNotation)assert.deepEqual(output.notation,job.expectedNotation,'native MSCX notation');
        const snapshot=Buffer.from(JSON.stringify(output.snapshot));row.snapshotSha256=sha(snapshot);
        await fs.writeFile(path.join(path.dirname(reportPath),'snapshots',job.id+'.json.gz'),gzipSync(snapshot));
      }catch(error){
        row.verification={passed:false,eligibleForFragmentReview:false,rejectionCodes:['native-import-error']};row.error=String(error);
        await page.close({runBeforeUnload:false}).catch(()=>{});await boot();
      }finally{clearTimeout(timer);}
      row.elapsedMs=performance.now()-at;report.entries.push(row);
      if(job.expectEligible!==undefined&&row.verification.eligibleForFragmentReview!==job.expectEligible)
        report.errors.push(job.id+': expected eligible='+job.expectEligible+'; '+JSON.stringify(row.verification));
      if(job.expectedTargets!==undefined&&row.verification.counts?.targets!==job.expectedTargets)
        report.errors.push(job.id+': expected targets='+job.expectedTargets);
      await save();
      console.log(`${i+1}/${jobs.entries.length} ${job.id.slice(0,24)} ${row.verification.passed?'MATCH':'BLOCK'} ${row.verification.rejectionCodes.join(',')}`);
    }
    report.passed=report.errors.length===0;
    if(!report.passed)process.exitCode=1;
  }catch(error){report.errors.push(String(error.stack||error));report.passed=false;process.exitCode=1;}
  finally{await save();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
