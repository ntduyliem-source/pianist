// A2: real file input/drop -> Worker -> MuseScore -> IndexedDB -> practice.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..'),output=path.join(root,'artifacts/abc/a2');
const base=process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html?diagnostics=1';
(async()=>{
  await fs.mkdir(output,{recursive:true});
  // Product admission requires two piano staves. Keep the original one-staff
  // converter fixture unchanged, and add an explicit bass voice for this UI case.
  const rhythmPiano=path.join(output,'rhythm-tempo.abc');
  await fs.writeFile(rhythmPiano,'%abc-2.1\nX:2\nT:Lấy đà liên ba và đổi nhịp\nC:Pianist test fixture CC0\nM:6/8\nL:1/8\nQ:3/8=60\n%%score { RH | LH }\nV:RH clef=treble name="Piano"\n%%MIDI program 0\nV:LH clef=bass\n%%MIDI program 0\nK:D\n[V:RH] A | (3Bcd e2 f2 | [M:3/4][Q:1/4=96]g2 f>e d2 |]\n[V:LH] z | D,6 | [M:3/4]G,6 |]\n');
  const browser=await chromium.launch({headless:true,channel:process.env.PIANIST_BROWSER_CHANNEL || 'msedge',args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(),requests=[],errors=[],checks=[];
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(String(e)));
  page.on('dialog',d=>d.dismiss());
  const result={checks,errors,browser:browser.version()};
  const check=s=>{checks.push(s);console.log(s);};
  const ready=async name=>{
    await page.waitForFunction(name=>document.querySelector('#status')?.textContent==='Đã mở '+name+'.',name,{timeout:120000});
    await page.locator('.loading-overlay').waitFor({state:'hidden'});
    assert.equal(await page.locator('.error-banner:not(.import-notice)').count(),0);
  };
  const open=async name=>{await page.locator('#file').setInputFiles(name);await ready(path.basename(name));};
  const save=async (selector,name)=>{
    const p=page.waitForEvent('download');await page.locator(selector).click();const d=await p;const file=path.join(output,name);await d.saveAs(file);return file;
  };
  const native=()=>page.evaluate(()=>{
    const api=window.pianist,old=api.Module.onPracticeSnapshot;let s;
    api.Module.onPracticeSnapshot=text=>{s=JSON.parse(text);};
    try {if(!api.getPracticeSnapshot())throw Error('No snapshot');return {anchors:s.anchors.map(a=>({pitch:a.pitch,tick:a.tick,duration:a.durationTicks,staff:a.staff,voice:a.voice})).sort((a,b)=>a.tick-b.tick||a.staff-b.staff||a.voice-b.voice||a.pitch-b.pitch||a.duration-b.duration),performed:s.performed,pedals:s.pedals};}
    finally {api.Module.onPracticeSnapshot=old;}
  });
  const countProjects=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('pianist-library');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const c=db.transaction('projects').objectStore('projects').count();c.onsuccess=()=>{resolve(c.result);db.close();};};
  }));
  try{
    await page.goto(base);await page.locator('#file').waitFor({state:'attached'});
    assert.match(await page.locator('#file').getAttribute('accept'),/\.abc/);
    await open(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    assert.equal(requests.filter(x=>x.includes('/score-formats/')).length,0);check('MXL native import does not load Python');
    await open(path.join(root,'tests/fixtures/pianist/abc/piano-core.abc'));
    assert.ok(requests.some(x=>x.includes('/score-formats/pyodide/')));assert.equal(await page.locator('.editor-meta strong').textContent(),'Piano hai tay và pedal');
    const original=await native();assert.equal(original.anchors.length,12);assert.equal(original.pedals.length,2);
    assert.ok(await page.locator('#screen canvas').count());check('ABC opens editable MuseScore canvas with notes and pedal');
    await page.locator('#select').click();await page.locator('#up').click();
    const edited=await native();assert.deepEqual(edited.anchors,original.anchors.map(a=>({...a,pitch:a.pitch+1})));
    await page.locator('#undo').click();assert.deepEqual((await native()).anchors,original.anchors);
    await page.locator('#redo').click();assert.deepEqual((await native()).anchors,edited.anchors);
    const saved=await save('#save','abc-edited.mscz');await save('#mxl','abc-edited.mxl');
    await page.getByRole('button',{name:'Lưu thư viện',exact:true}).click();
    await page.reload();await page.getByRole('button',{name:'Mở Piano hai tay và pedal',exact:true}).click();
    await page.locator('#screen canvas').waitFor({state:'visible',timeout:120000});await page.locator('.loading-overlay').waitFor({state:'hidden'});
    assert.deepEqual((await native()).anchors,edited.anchors);
    await open(saved);assert.deepEqual((await native()).anchors,edited.anchors);check('ABC supports edit/undo/redo, save and reopening native MSCZ');
    const before=await countProjects();
    for(const filename of ['invalid.abc','unsupported-64th.abc']){
      await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/abc',filename));
      await page.locator('.error-banner:not(.import-notice)').waitFor({state:'visible'});
      await page.locator('.loading-overlay').waitFor({state:'hidden'});
      assert.deepEqual((await native()).anchors,edited.anchors);assert.equal(await countProjects(),before);
      await page.locator('.error-banner').getByRole('button',{name:'Đóng',exact:true}).click();
    }
    check('invalid ABC and rounded rhythm cannot replace the score or add projects');
    // Cancel a real cold Worker boot, then let the old fetch finish. Nothing may publish.
    let release;const held=new Promise(r=>{release=r;});
    await page.route('**/score-formats/pyodide/pyodide.asm.wasm',async route=>{await held;await route.continue().catch(()=>{});});
    await page.reload();await page.getByRole('button',{name:'Mở Piano hai tay và pedal',exact:true}).click();
    await page.locator('#screen canvas').waitFor({state:'visible',timeout:120000});await page.locator('.loading-overlay').waitFor({state:'hidden'});
    const preserved=await native();const cancelCount=await countProjects();
    const bootRequest=page.waitForRequest('**/score-formats/pyodide/pyodide.asm.wasm');
    await page.locator('#file').setInputFiles(rhythmPiano);await bootRequest;
    await page.getByRole('button',{name:'Hủy mở file',exact:true}).click();release();
    await page.unroute('**/score-formats/pyodide/pyodide.asm.wasm');
    assert.deepEqual((await native()).anchors,preserved.anchors);assert.equal(await countProjects(),cancelCount);
    check('cancelled cold ABC load preserves the current project');
    // Real drop entry; warn about layout, then use the separate practice screen.
    const source=(await fs.readFile(path.join(root,'tests/fixtures/pianist/abc/piano-core.abc'),'utf8')).replace('K:C','I:linebreak $\nK:C');
    await page.evaluate(source=>{const dt=new DataTransfer();dt.items.add(new File([source],'drop-piano.abc',{type:'text/plain'}));document.querySelector('.application').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));},source);
    await ready('drop-piano.abc');await page.locator('.import-notice').waitFor({state:'visible'});
    await page.locator('.import-notice').getByRole('button',{name:'Đóng',exact:true}).click();
    await page.getByRole('button',{name:'Tập bài này',exact:true}).click();
    await page.getByTestId('practice-v2').waitFor();await page.locator('.loading-overlay').waitFor({state:'hidden'});
    await page.locator('[data-note-anchors]').first().waitFor({state:'attached'});
    assert.equal(await page.locator('#screen').getAttribute('aria-hidden'),'true');
    await page.getByRole('button',{name:'Theo BPM',exact:true}).click();
    await page.getByRole('button',{name:/Chỉ bản nhạc/}).click();
    await page.getByRole('button',{name:/Thiết lập/}).first().click();
    await page.getByRole('button',{name:'MIDI mô phỏng trường độ + pedal',exact:true}).click();
    await page.waitForFunction(()=>!!document.querySelector('.note-marker[data-held="true"]'),null,{timeout:15000});
    result.nativeHighlight=true;await page.screenshot({path:path.join(output,'practice.png')});
    await page.waitForURL(url=>url.hash==='#/results',{timeout:45000});
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Tải JSON',exact:true}).click();
    const d=await downloaded;const report=path.join(output,'practice-result.json');await d.saveAs(report);
    const attempt=JSON.parse(await fs.readFile(report,'utf8'));
    assert.equal(attempt.outcome,'complete');assert.equal(attempt.metrics.misses,0);assert.equal(attempt.metrics.extras,0);assert.equal(attempt.metrics.hits,attempt.metrics.planned);
    assert.equal(attempt.r4.pedal.status,'scored');assert.equal(attempt.r4.pedal.f1,1);assert.ok(attempt.r4.key.every(k=>k.status==='correct'));
    result.practice={metrics:attempt.metrics,pedal:attempt.r4.pedal,keyCorrect:attempt.r4.key.length};
    check('ABC drop -> separate practice -> existing BPM/R4 engine scores simulated notes/releases/pedal');
    await page.screenshot({path:path.join(output,'results.png')});
    await page.getByRole('button',{name:'Tập piano',exact:true}).click();
    const choose=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Nhập bản nhạc để tập',exact:true}).click();
    await (await choose).setFiles(rhythmPiano);await ready('rhythm-tempo.abc');
    await page.getByTestId('practice-v2').waitFor();assert.equal(await page.locator('#screen').getAttribute('aria-hidden'),'true');
    check('practice picker imports ABC directly into the read-only practice screen');
    assert.equal(errors.length,0);result.passed=true;
  }catch(e){result.passed=false;result.error=String(e);process.exitCode=1;console.error(e);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));await browser.close();}
  console.log(JSON.stringify(result,null,2));
})();
