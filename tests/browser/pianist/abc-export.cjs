// A4 exercises the product export dialog and actual MuseScore editing commands.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/abc/a4');
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();
  const checks=[],errors=[],downloads=[],result={checks,errors,browser:browser.version()};
  let audioReady=false,lastAudioLoad=0;
  page.on('console',message=>{const text=message.text();if(text.includes('added sound font, uri:'))audioReady=true;if(text.includes('sound font')||text.includes('success load soundfont:'))lastAudioLoad=Date.now();});
  const check=s=>{checks.push(s);console.log(s);};
  page.on('pageerror',e=>errors.push(String(e)));page.on('download',d=>downloads.push(d.suggestedFilename()));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:120000});
  const open=async file=>{await page.locator('#file').setInputFiles(file);await page.waitForFunction(n=>document.querySelector('#status')?.textContent==='Đã mở '+n+'.',path.basename(file),{timeout:120000});await idle();};
  const native=()=>page.evaluate(()=>{const a=window.pianist,old=a.Module.onScoreSemantics;let s;a.Module.onScoreSemantics=j=>s=JSON.parse(j);try{if(!a.getScoreSemantics())throw Error('No native semantics');return s;}finally{a.Module.onScoreSemantics=old;}});
  const music=s=>{
    const sorted=a=>a.sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y))),ids=new Map(s.anchors.map(n=>[n.id,[n.tick,n.pitch,n.durationTicks,n.staff,n.voice,n.spelling]]));
    return {notes:sorted(s.anchors.map(n=>[ids.get(n.id),n.tieBack?ids.get(n.tieBack):null,n.articulations||[]])),rests:sorted(s.rests),keys:sorted(s.keys),slurs:sorted(s.slurs),
      performed:sorted(s.performed.map(n=>[ids.get(n.anchor),n.occurrence,n.atMs,n.endMs])),pedals:sorted(s.pedals.map(n=>[n.occurrence,n.tick,n.endTick,n.atMs,n.endMs])),
      releases:sorted(s.keyReleases.map(n=>[ids.get(n.anchor),n.pitch,n.utick,n.endUtick,n.atMs,n.endMs])),beats:s.beats,occurrences:s.occurrences,bpm:s.baseQuarterBpm};
  };
  const equal=(a,b)=>{if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=1e-6;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]));if(a&&b&&typeof a==='object'&&typeof b==='object')return equal(Object.keys(a),Object.keys(b))&&Object.keys(a).every(k=>equal(a[k],b[k]));return a===b;};
  const save=async(selector,name)=>{const promise=page.waitForEvent('download');await page.locator(selector).click();const d=await promise,file=path.join(out,name);await d.saveAs(file);return file;};
  const exportDialog=async()=>{await page.getByRole('button',{name:'Xuất…',exact:true}).click();await page.locator('#export-format').selectOption('abc');assert.match(await page.getByRole('dialog',{name:'Xuất bản nhạc'}).innerText(),/bố cục trang/);};
  const abc=async name=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const before=await native(),modified=await page.locator('#screen').getAttribute('data-modified'),count=downloads.length;
    result.lastBefore=before;
    await page.evaluate(()=>{const api=window.pianist,original=api.prepareProject;window.exportRoundtrip=undefined;api.prepareProject=(...args)=>{const handler=api.Module.onPreparedSemantics;api.Module.onPreparedSemantics=json=>{window.exportRoundtrip={snapshot:JSON.parse(json),xml:new TextDecoder().decode(args[0])};handler(json);};try{return original(...args);}finally{api.Module.onPreparedSemantics=handler;api.prepareProject=original;}};});
    await exportDialog();const p=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:'Xuất file',exact:true}).click();
    const error=page.locator('.error-banner:not(.import-notice)').waitFor({state:'visible',timeout:120000}).then(async()=>{throw Error(await page.locator('.error-banner:not(.import-notice)').innerText());});
    const d=await Promise.race([p,error]),file=path.join(out,name);await d.saveAs(file);await idle();
    assert.equal(downloads.length,count+1,'no intermediate XML download');assert.match(d.suggestedFilename(),/\.abc$/);
    assert.equal((await native()).revision,before.revision,'export cannot change native revision');assert.equal(await page.locator('#screen').getAttribute('data-modified'),modified);
    assert.ok(equal(music(await native()),music(before)));return file;
  };
  try{
    await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1');
    await open(path.join(root,'tests/fixtures/pianist/abc/piano-core-midi.abc'));const original=await native();
    await page.locator('#select').click();await page.locator('#up').click();const pitchEdit=await native();assert.notDeepEqual(music(pitchEdit).notes,music(original).notes);
    const pitchAbc=await abc('pitch-edited.abc');await page.locator('#undo').click();assert.ok(equal(music(await native()),music(original)));await page.locator('#redo').click();assert.ok(equal(music(await native()),music(pitchEdit)));
    check('ABC export warns about layout, uses current edit, downloads one ABC, preserves revision/dirty flag/undo');
    await open(pitchAbc);assert.ok(equal(music(await native()),music(pitchEdit)));check('ABC source -> pitch edit -> ABC export/reimport preserves native music');
    // Native MusicXML fixture: first remove its actual pedal line on the canvas.
    await open(path.join(root,'tests/fixtures/pianist/practice/pedal-duration.musicxml'));const baseline=await native();
    await page.mouse.click(800,542);await page.keyboard.press('Delete');const pedalEdit=await native();assert.equal(pedalEdit.pedals.length,1);assert.equal(baseline.pedals.length,5);
    await page.mouse.dblclick(1150,542);await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Escape');assert.equal((await native()).pedals[0].endTick,5760);
    await page.keyboard.press('Control+Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('4');
    const shorter=await native();assert.ok(shorter.anchors.some(n=>n.staff===0&&n.tick===0&&n.durationTicks===240));
    await page.keyboard.press('Shift+a');const added=await native();assert.equal(added.anchors.length,shorter.anchors.length+1);assert.ok(added.anchors.some(n=>n.staff===0&&n.tick===0&&n.pitch===69));
    await page.locator('#select').click();await page.locator('#up').click();const edited=await native();
    const editedAbc=await abc('duration-added-pedal-edited.abc'),mxl=await save('#mxl','duration-added-pedal-edited.mxl');
    await page.getByRole('button',{name:'Lưu thư viện',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=save-state]')?.textContent==='Đã lưu trong thư viện');
    audioReady=false;await page.reload();await page.getByRole('button',{name:'Mở pedal-duration',exact:true}).click();await page.locator('#screen canvas').waitFor({state:'visible',timeout:120000});await idle();assert.ok(equal(music(await native()),music(edited)));
    // MuseScore initializes the piano + metronome asynchronously and updates its
    // audio settings (dirty flag) without a note edit. Observe the real soundfont
    // repository and let its callbacks settle BEFORE saving a clean export baseline.
    const audioDeadline=Date.now()+30000;
    while(!audioReady||Date.now()-lastAudioLoad<500){assert.ok(Date.now()<audioDeadline,'native audio initialized');await page.waitForTimeout(100);}
    await page.evaluate(()=>{const api=window.pianist,old=api.Module.onProjectSaved;api.Module.onProjectSaved=()=>{};try{if(!api.saveProject())throw Error('native save failed');}finally{api.Module.onProjectSaved=old;}});
    assert.equal(await page.locator('#screen').getAttribute('data-modified'),'false');
    await abc('after-reload.abc');assert.equal(await page.locator('#screen').getAttribute('data-modified'),'false');await open(editedAbc);assert.ok(equal(music(await native()),music(edited)));
    await open(mxl);assert.ok(equal(music(await native()),music(edited)));
    check('pitch, duration, added chord note and pedal length edits survive save/reload and ABC/MXL roundtrips');
    // All already verified A1 native roundtrips pass through the A4 product gate.
    for(const fixture of ['tempo-repeat-tie','volta','same-staff-voices']){
      await open(path.join(root,'tests/fixtures/pianist/practice',fixture+'.musicxml'));const s=await native(),file=await abc(fixture+'.abc');await open(file);assert.ok(equal(music(await native()),music(s)),fixture);
    }
    check('tempo, tie, repeat/volta and same-staff voice fixtures pass product export');
    await open(path.join(root,'tests/fixtures/pianist/practice/release-policy.musicxml'));const before=await native(),count=downloads.length;
    await exportDialog();await page.getByRole('button',{name:'Xuất file',exact:true}).click();await page.locator('.error-banner:not(.import-notice)').waitFor({state:'visible',timeout:120000});await idle();
    assert.match(await page.locator('.error-banner:not(.import-notice)').innerText(),/MXL|MSCZ/);assert.equal(downloads.length,count);assert.equal((await native()).revision,before.revision);await page.screenshot({path:path.join(out,'unsupported.png')});
    await page.locator('.error-banner:not(.import-notice)').getByRole('button',{name:'Đóng',exact:true}).click();await save('#mxl','unsupported-kept.mxl');
    check('unsupported musical expression blocks ABC with reason while keeping MXL export available');
    const local=path.join(root,'examples/local/pho-xa.mxl');
    const negative=[path.join(root,'tests/fixtures/pianist/practice/special-symbols.musicxml'),path.join(root,'tests/fixtures/pianist/abc/piano-core.abc'),path.join(root,'tests/fixtures/pianist/practice/pedal-duration.musicxml')];
    if(await fs.stat(local).catch(()=>null))negative.push(local);
    for(const file of negative){
      await open(file);const preserved=await native(),count=downloads.length;await exportDialog();await page.getByRole('button',{name:'Xuất file',exact:true}).click();
      await page.locator('.error-banner:not(.import-notice)').waitFor({state:'visible',timeout:120000});await idle();assert.equal(downloads.length,count);
      assert.equal((await native()).revision,preserved.revision);assert.ok(equal(music(await native()),music(preserved)));
      checks.push(path.basename(file)+' rejects unsupported ABC export and keeps the native score');
      await page.locator('.error-banner:not(.import-notice)').getByRole('button',{name:'Đóng',exact:true}).click();
    }
    // Cancel real cold converter boot during export. The working score stays open.
    await page.reload();await page.getByRole('button',{name:'Mở duration-added-pedal-edited',exact:true}).click();await page.locator('#screen canvas').waitFor({state:'visible',timeout:120000});await idle();
    let release;const held=new Promise(r=>release=r);await page.route('**/score-formats/pyodide/pyodide.asm.wasm',async route=>{await held;await route.continue().catch(()=>{});});
    const cancelBefore=await native(),cancelCount=downloads.length,request=page.waitForRequest('**/score-formats/pyodide/pyodide.asm.wasm');
    await exportDialog();await page.getByRole('button',{name:'Xuất file',exact:true}).click();await request;await page.getByRole('button',{name:'Hủy xuất ABC',exact:true}).click();release();await page.unroute('**/score-formats/pyodide/pyodide.asm.wasm');await idle();
    assert.equal(downloads.length,cancelCount);assert.equal((await native()).revision,cancelBefore.revision);assert.ok(equal(music(await native()),music(cancelBefore)));await abc('retry-after-cancel.abc');
    check('cancel/retry of a cold ABC export preserves current score and produces no canceled download');
    assert.deepEqual(errors,[]);delete result.lastBefore;result.passed=true;
  }catch(e){result.passed=false;result.error=String(e);process.exitCode=1;console.error(e);await fs.writeFile(path.join(out,'roundtrip-debug.json'),JSON.stringify({before:result.lastBefore,after:await page.evaluate(()=>window.exportRoundtrip)},null,2));delete result.lastBefore;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));await browser.close();}
  console.log(JSON.stringify(result,null,2));
})();
