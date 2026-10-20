// Bounded feasibility check of upstream webmscore's original Worker.
// This dependency is installed ONLY in artifacts/q0/worker-spike, never the app.
const {chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/q0');
const pkg=path.join(out,'worker-spike/node_modules/webmscore'),site=path.join(root,'build.artifacts/q0-worker');
(async()=>{
  assert.equal(JSON.parse(await fs.readFile(path.join(pkg,'package.json'),'utf8')).version,'1.2.1');
  await fs.mkdir(site,{recursive:true});
  for(const name of ['webmscore.mjs','webmscore.lib.wasm','webmscore.lib.data','webmscore.lib.mem.wasm']){
    await fs.copyFile(path.join(pkg,name),path.join(site,name));
  }
  await fs.writeFile(path.join(site,'index.html'),'<!doctype html><title>Q0 upstream renderer experiment</title><p>Test-only upstream worker experiment.</p>');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage(),report={candidate:'webmscore@1.2.1',browser:browser.version(),errors:[]};
  const consoleTail=[];page.on('console',m=>{consoleTail.push(m.text());if(consoleTail.length>20)consoleTail.shift();});
  page.on('pageerror',e=>report.errors.push(String(e)));
  try{
    await page.goto('http://127.0.0.1:8787/q0-worker/index.html');
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const bytes=[...await fs.readFile(path.join(root,'docs/curriculum/starter-scores/K008.mxl'))];
    report.probe=await page.evaluate(async bytes=>{
      window.workerSpikeStage='import';
      const {default:WebMscore}=await import('./webmscore.mjs');
      window.workerSpikeStage='load';
      const start=performance.now();let score=await WebMscore.load('mxl',new Uint8Array(bytes));
      window.workerSpikeStage='metadata';
      const coldMs=performance.now()-start,metadata=await score.metadata();
      window.workerSpikeMetadata=metadata;
      const longTasks=[],times=[],observer=new PerformanceObserver(l=>l.getEntries().forEach(e=>longTasks.push(e.duration)));
      observer.observe({type:'longtask'});
      let svg='',positions,positionsError;
      try{
        for(let i=0;i<10;i++){
          // Public API: each load owns a worker, and destroy(false) terminates it.
          window.workerSpikeStage='destroy-'+i;
          score.destroy(false);
          window.workerSpikeStage='reload-'+i;
          const at=performance.now();score=await WebMscore.load('mxl',new Uint8Array(bytes));
          window.workerSpikeStage='svg-'+i;
          svg=await score.saveSvg(0);times.push(performance.now()-at);
        }
        window.workerSpikeStage='positions';
        try{positions=await score.segmentPositions();}catch(e){positionsError=String(e);}
        await new Promise(r=>setTimeout(r,100));
        return {cpuRate:4,workerLifecycle:'fresh-per-request',coldMs,metadata,requestMs:times,longTasksMs:longTasks,svgBytes:svg.length,
          perNotePracticeIds:(svg.match(/data-practice-notes=/g)||[]).length,
          positionKind:'segment',positionElements:positions?.elements.length??null,positionsError,
          currentSnapshotApi:typeof score.preparePracticeSnapshot==='function'};
      }finally{observer.disconnect();score.destroy(false);}
    },bytes);
    assert(report.probe.svgBytes>1000);assert.deepEqual(report.errors,[]);
    report.executionPassed=true;
    report.acceptedForProduction=false; // No compatible per-note snapshot/release/pedal contract.
  }catch(e){report.executionPassed=false;report.error=String(e.stack||e);Object.assign(report,await page.evaluate(()=>({stage:window.workerSpikeStage,metadata:window.workerSpikeMetadata})));report.console=consoleTail;process.exitCode=1;}
  finally{await fs.writeFile(path.join(out,'worker-spike-report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
