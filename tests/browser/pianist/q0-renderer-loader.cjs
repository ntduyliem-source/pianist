// Verify the shipped standalone bundle, without booting the editor at all.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const report={checks:[]};
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:8787/icon.svg');
    await page.route('**/renderer/PianistRenderer.wasm',route=>route.fulfill({body:'wrong release',contentType:'application/wasm'}));
    const mismatch=await page.evaluate(async()=>{
      const {ExerciseRenderer}=await import('/app/exercise-renderer.js');
      window.testRenderer=new ExerciseRenderer();
      try{await window.testRenderer.warm();return null;}catch(e){return String(e);}
    });
    assert.match(mismatch,/khớp bản phát hành/);report.checks.push('rejects corrupt renderer before instantiating WASM');
    await page.unroute('**/renderer/PianistRenderer.wasm');
    const bytes=[...await fs.readFile(path.join(root,'docs/curriculum/starter-scores/K008.mxl'))];
    const rendered=await page.evaluate(async bytes=>{
      const source=new Uint8Array(bytes),a=await window.testRenderer.prepare(source,'K008.mxl');
      const b=await window.testRenderer.prepare(source,'K008.mxl');
      let rejected=false;
      try{await window.testRenderer.prepare(new Uint8Array([1,2,3]),'bad.mxl');}catch{rejected=true;}
      const controller=new AbortController();
      const cancelled=window.testRenderer.prepare(source,'cancel-active.mxl',controller.signal).catch(e=>e.name);
      await new Promise(resolve=>setTimeout(resolve,10));controller.abort();
      const abortName=await cancelled;
      const after=await window.testRenderer.prepare(source,'after-cancel.mxl');
      window.testRenderer.dispose();
      return {notes:a.snapshot.anchors.length,pages:a.snapshot.pages.length,firstCache:a.cacheHit,secondCache:b.cacheHit,
        sourceIntact:source.byteLength===bytes.length&&source.every((v,i)=>v===bytes[i]),rejected,abortName,
        afterNotes:after.snapshot.anchors.length,editorAbsent:!window.pianist,heapBytes:after.heapBytes};
    },bytes);
    assert.deepEqual({...rendered,heapBytes:undefined},{notes:32,pages:1,firstCache:false,secondCache:true,
      sourceIntact:true,rejected:true,abortName:'AbortError',afterNotes:32,editorAbsent:true,heapBytes:undefined});
    report.checks.push('retries boot successfully with the verified pair','renders without any editor instance',
      'keeps source bytes intact','cache hit returns the same score','bad input and active cancellation leave the renderer usable');
    report.result=rendered;report.passed=true;
    console.log(JSON.stringify(report));
  }catch(e){report.passed=false;report.error=String(e.stack||e);process.exitCode=1;console.error(e);}
  finally{await fs.writeFile(path.join(root,'artifacts/q0/renderer/loader-report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
