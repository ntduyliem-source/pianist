// Upgrade acceptance with an old saved edition AND newer recovery in isolated
// IndexedDB. Never runs against, clears or edits a real user's browser profile.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/library-update');
const base=new URL(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1#/library');
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),page=await context.newPage();
  const report={checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  await context.addInitScript(()=>{addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#diagnostics{display:none!important}';document.head.append(s);});});
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  const nav=()=>page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name:'Thư viện',exact:true}).click();
  const records=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const q=indexedDB.open('pianist-library');q.onerror=()=>reject(q.error);q.onsuccess=()=>{
      const db=q.result,tx=db.transaction(['projects','recovery']),a=tx.objectStore('projects').getAll(),b=tx.objectStore('recovery').getAll();
      tx.oncomplete=()=>{resolve({projects:a.result.map(p=>({...p,bytes:[...p.bytes],source:p.source?[...p.source]:undefined})),recovery:b.result.map(p=>({...p,bytes:[...p.bytes]}))});db.close();};
    };
  }));
  try{
    await page.goto(base.href);
    const catalog=await page.evaluate(async()=>fetch('library/catalog.json').then(r=>r.json()));
    const song=catalog.songs.find(s=>s.url.includes('/tinh-dau-qua-chen-')&&s.sourceHashes?.length);
    const other=catalog.songs.find(s=>s.url.includes('/tinh-don-phuong-'));
    assert(song,'Updated source fixture must retain its original hash');
    assert(other,'Cross-score change regression needs Tình đơn phương');
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
    const seed=(await records()).projects[0];assert(seed?.bytes.length);
    // Dispose the active engine/lease before seeding a legacy database snapshot.
    await page.route('**/__upgrade_seed__',r=>r.fulfill({body:'<!doctype html><title>Upgrade fixture</title>',contentType:'text/html'}));
    await page.goto(new URL('__upgrade_seed__',base).href);
    await page.evaluate(({seed,song})=>new Promise((resolve,reject)=>{
      const q=indexedDB.open('pianist-library');q.onerror=()=>reject(q.error);q.onsuccess=()=>{
        const db=q.result,tx=db.transaction(['projects','recovery'],'readwrite');
        const saved={...seed,bytes:Uint8Array.from(seed.bytes),source:undefined,sourceHash:song.sourceHashes[0],workId:song.workId||song.id,version:song.version||1,title:'Bản đã sửa của người dùng',revision:5};
        tx.objectStore('projects').put(saved);
        tx.objectStore('recovery').put({id:saved.id,title:'Tên bản phục hồi',filename:saved.filename,bytes:saved.bytes,revision:7,updatedAt:saved.updatedAt+10000});
        tx.oncomplete=()=>{db.close();localStorage.setItem('pianist-library-version:'+(song.workId||song.id),song.sourceHashes[0]);resolve();};tx.onerror=()=>reject(tx.error);
      };
    }),{seed,song});
    const old=await records();
    await page.goto(base.href);
    const card=()=>page.locator(`[data-work-id="${song.workId||song.id}"]`);
    await card().waitFor();
    assert.equal(await card().getByRole('combobox').inputValue(),song.id);
    assert.match(await card().getByRole('combobox').innerText(),/Bản đã lưu/);
    assert((await card().locator('img').first().getAttribute('src')).includes(song.id));
    await card().getByRole('button',{name:/^Nghe /}).click();
    await page.getByRole('button',{name:'Tạm dừng nghe thư viện',exact:true}).waitFor({timeout:180000});
    await page.getByRole('button',{name:'Dừng nghe thư viện',exact:true}).click();
    assert.deepEqual(await records(),old,'Listening to the updated source must leave old documents and recovery untouched');
    await card().getByRole('button',{name:'Sửa',exact:true}).click();
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
    let data=await records();assert.equal(data.projects.length,2);
    assert.equal(data.projects.find(p=>p.id!==seed.id).sourceHash,song.sha256);
    assert.deepEqual(data.projects.find(p=>p.id===seed.id),old.projects[0]);
    assert.deepEqual(data.recovery.find(p=>p.id===seed.id),old.recovery[0]);
    report.checks.push('Old preference opens current catalog thumbnail/listening/editor; old edited bytes and newer recovery remain exact');
    // Exercise the reported change-score/search path repeatedly with the real
    // main WASM engine, not just the thumbnail renderer.
    for(let i=0;i<3;i++){
      await page.getByRole('button',{name:'Tập bài này',exact:true}).click();
      await page.getByTestId('practice-v2').waitFor();await idle();
      await page.getByRole('button',{name:'Đổi bài',exact:true}).click();
      const search=page.getByRole('searchbox');await search.fill('tinh don phuong');
      await page.locator(`[data-work-id="${other.workId||other.id}"]`).getByRole('button',{name:'Tập',exact:true}).click();
      await page.getByTestId('practice-v2').waitFor();await idle();
      await page.getByRole('button',{name:'Đổi bài',exact:true}).click();
      await search.fill('tinh dau qua chen');
      assert.equal(await search.inputValue(),'tinh dau qua chen');
      await card().getByRole('button',{name:'Tập',exact:true}).click();
      await page.getByTestId('practice-v2').waitFor();await idle();
      await page.getByRole('button',{name:'Đổi bài',exact:true}).click();await nav();
      await card().getByRole('button',{name:'Sửa',exact:true}).click();
      await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
    }
    assert.equal((await records()).projects.length,3,'Reopening both scores must reuse their current-source projects');
    await nav();await card().getByRole('combobox').selectOption(seed.id);
    await card().getByRole('button',{name:'Sửa',exact:true}).click();
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
    await page.getByText('Tên bản phục hồi',{exact:true}).waitFor();
    await page.getByText('Đã phục hồi bản tự lưu',{exact:true}).waitFor();
    assert.deepEqual((await records()).projects.find(p=>p.id===seed.id).bytes,seed.bytes);
    report.checks.push('Current edition reopens without duplicate imports; saved edition still opens its newest recovery; repeated practice/search changes do not abort');
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(e){report.error=String(e.stack);process.exitCode=1;console.error(report.error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report));
})();
