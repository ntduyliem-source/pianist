// A3: product selection, atomic native preparation, source/recovery/backup.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/abc/a3');
const base=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1';
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();
  const checks=[],errors=[],result={checks,errors,browser:browser.version()};
  const check=s=>{checks.push(s);console.log(s);};
  page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:120000});
  const records=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('pianist-library');r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>{resolve(q.result.map(p=>({...p,bytes:[...p.bytes],source:p.source?[...p.source]:undefined})));db.close();};q.onerror=()=>reject(q.error);};}));
  const score=()=>page.evaluate(()=>{const a=window.pianist,old=a.Module.onScoreSemantics;let s;a.Module.onScoreSemantics=j=>s=JSON.parse(j);try{if(!a.getScoreSemantics())throw Error('semantics unavailable');return {revision:s.revision,notes:s.anchors.map(n=>[n.tick,n.pitch,n.durationTicks,n.staff,n.voice]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};}finally{a.Module.onScoreSemantics=old;}});
  const upload=async(name,buffer)=>page.locator('#file').setInputFiles({name,mimeType:'text/plain',buffer});
  const ready=async name=>{await page.waitForFunction(n=>document.querySelector('#status')?.textContent==='Đã mở '+n+'.',name,{timeout:120000});await idle();};
  const book=Buffer.from('%abc-2.1\nM:3/4\nL:1/4\nQ:1/4=75\nX:7\nT:Trùng tên Việt\nK:C\nC D E|]\nX:7\nT:Trùng tên Việt\nK:G\nG A B|]\nX:7\nK:C\nC3|]\n');
  const chooser=()=>page.getByRole('dialog',{name:'Chọn bài trong file ABC'});
  try{
    await page.goto(base);await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));await ready('piano.mxl');
    const original=await score();await page.locator('#select').click();await page.locator('#up').click();const edited=await score(),before=await records();
    await upload('book.abc',book);await chooser().waitFor();assert.equal(await chooser().locator('input[type=checkbox]:checked').count(),1);
    await page.screenshot({path:path.join(out,'selection.png')});await chooser().getByRole('button',{name:'Hủy nhập ABC'}).click();
    assert.deepEqual(await score(),edited);assert.deepEqual(await records(),before);await page.locator('#undo').click();assert.deepEqual((await score()).notes,original.notes);await page.locator('#redo').click();
    check('selection defaults to one tune; cancel preserves edited score, revision and undo');
    // First project is genuinely prepared; second fails, with no publication.
    await page.evaluate(()=>{const a=window.pianist;window.prepareOriginal=a.prepareProject;let calls=0;a.prepareProject=(...args)=>++calls===2?0:window.prepareOriginal(...args);});
    const beforeFailure=await score();await upload('book.abc',book);await chooser().waitFor();await chooser().locator('input[type=checkbox]').nth(1).check();await chooser().getByRole('button',{name:'Nhập 2 bài'}).click();
    await chooser().getByRole('alert').first().waitFor({timeout:120000});assert.deepEqual(await score(),beforeFailure);assert.deepEqual(await records(),before);
    await chooser().getByRole('button',{name:'Hủy nhập ABC'}).click();await page.evaluate(()=>{window.pianist.prepareProject=window.prepareOriginal;});
    await page.locator('#undo').click();assert.deepEqual((await score()).notes,original.notes);await page.locator('#redo').click();
    check('temporary native preparation failure leaves score, undo and entire library unchanged');
    // Upstream failure is attached to its index, then deselection permits retry.
    const badBook=Buffer.concat([book,Buffer.from('\nX:9\nT:Bad rhythm\nM:4/4\nL:1/64\nK:C\nC|]\n')]);
    await upload('mixed.abc',badBook);await chooser().waitFor();await chooser().locator('input[type=checkbox]').nth(3).check();await chooser().getByRole('button',{name:'Nhập 2 bài'}).click();
    await chooser().getByRole('alert').first().waitFor();assert.deepEqual(await records(),before);await chooser().locator('input[type=checkbox]').nth(3).uncheck();
    await chooser().getByRole('button',{name:'Nhập 1 bài'}).click();await ready('mixed.abc');check('invalid selected tune is identified before writes; deselect/retry succeeds');
    await upload('book.abc',book);await chooser().waitFor();await chooser().locator('input[type=checkbox]').nth(1).check();await chooser().locator('input[type=checkbox]').nth(2).check();await chooser().getByRole('radio',{name:'Mở bài 3 sau khi nhập'}).check();
    await chooser().getByRole('button',{name:'Nhập 3 bài'}).click();await ready('book.abc');assert.equal(await page.locator('.editor-meta strong').textContent(),'book — 3');
    const imported=(await records()).filter(p=>p.sourceName==='book.abc');assert.equal(imported.length,3);assert.equal(new Set(imported.map(p=>p.id)).size,3);
    for(const p of imported){assert.deepEqual(p.source,[...book]);assert.equal(p.sourceFormat,'abc');assert.match(p.sourceHash,/^[a-f0-9]{64}$/);assert.equal(p.sourceTuneId,'7');}
    const chosen=await score();assert.deepEqual(chosen.notes.map(n=>n[1]),[60]);check('duplicate X/title and missing title create independent MSCZ projects; chosen tune opens');
    await page.getByRole('button',{name:'Lưu bản mới…',exact:true}).click();await page.getByLabel('Tên bản mới').fill('Bản sao ABC');await page.getByRole('button',{name:'Lưu bản mới',exact:true}).click();await idle();
    await page.locator('#select').click();await page.locator('#up').click();const copyNotes=(await score()).notes;
    await page.waitForFunction(()=>document.querySelector('[data-testid=save-state]')?.textContent.startsWith('Đã tự lưu'),null,{timeout:15000});
    // Reload only after the actual recovery transaction has finished.
    result.beforeReload=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('pianist-library');r.onsuccess=async()=>{const db=r.result;const get=name=>new Promise(res=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>res(q.result.map(({bytes,source,...meta})=>({...meta,bytes:bytes?.length})));});resolve({projects:await get('projects'),recovery:await get('recovery')});db.close();};}));
    assert.ok(result.beforeReload.recovery.some(p=>p.title==='Bản sao ABC'&&p.revision>1));
    await page.reload();await page.getByRole('button',{name:'Mở Bản sao ABC',exact:true}).click();await page.locator('#screen canvas').waitFor({state:'visible',timeout:120000});await idle();assert.deepEqual((await score()).notes,copyNotes);
    await page.getByRole('button',{name:'Thư viện',exact:true}).click();await context.setOffline(true);await page.getByRole('button',{name:'Mở book — 3',exact:true}).click();await idle();assert.deepEqual((await score()).notes,chosen.notes);await context.setOffline(false);
    const copies=(await records()).filter(p=>p.title==='Bản sao ABC');assert.equal(copies[0].sourceTuneIndex,2);assert.deepEqual(copies[0].source,[...book]);
    check('copy edits recover after reload; source and original tune stay unchanged; stored tune opens offline');
    await page.getByRole('button',{name:'Thư viện',exact:true}).click();assert.ok(await page.getByText('Nguồn ABC · bài 3',{exact:true}).count());
    const dPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Tải toàn bộ thư viện'}).click();const d=await dPromise,backup=path.join(out,'library.pianist.zip');await d.saveAs(backup);
    await page.getByLabel('Gói sao lưu thư viện').setInputFiles(backup);await page.getByRole('dialog',{name:'Khôi phục thư viện'}).waitFor();await page.getByRole('button',{name:'Thêm các bản khôi phục'}).click();await page.getByRole('dialog',{name:'Khôi phục thư viện'}).waitFor({state:'hidden'});
    const restored=(await records()).filter(p=>p.title==='Bản sao ABC — khôi phục');assert.equal(restored.length,1);assert.deepEqual(restored[0].source,[...book]);assert.equal(restored[0].sourceTuneIndex,2);
    await page.getByRole('button',{name:'Mở Bản sao ABC — khôi phục',exact:true}).click();await idle();assert.deepEqual((await score()).notes,copyNotes);
    check('backup/restore UI preserves ABC metadata, exact source and recovered copy edits');
    await page.getByRole('button',{name:'Tập piano',exact:true}).click();const fc=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Nhập bản nhạc để tập'}).click();await (await fc).setFiles({name:'practice-book.abc',mimeType:'text/plain',buffer:book});
    await chooser().waitFor();await chooser().locator('input[type=checkbox]').nth(1).check();await chooser().getByRole('radio',{name:'Mở bài 2 sau khi nhập'}).check();await chooser().getByRole('button',{name:'Nhập 2 bài'}).click();await ready('practice-book.abc');await page.getByTestId('practice-v2').waitFor();
    assert.deepEqual((await score()).notes.map(n=>n[1]).sort((a,b)=>a-b),[67,69,71]);assert.equal(await page.locator('#screen').getAttribute('aria-hidden'),'true');
    check('practice import opens explicitly selected tune in separate read-only practice');
    assert.deepEqual(errors,[]);result.passed=true;
  }catch(e){result.passed=false;result.error=String(e);process.exitCode=1;console.error(e);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));await browser.close();}
  console.log(JSON.stringify(result,null,2));
})();
