// Native pickup/irregular labels must identify the same measure in every UI.
const {chromium}=require('playwright'), assert=require('node:assert/strict'), fs=require('node:fs/promises'), path=require('node:path');
const root=path.resolve(__dirname,'../../..'), out=path.join(root,'artifacts/native-measure-labels');
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'}), report={checks:[],errors:[]};
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const check=message=>{report.checks.push(message);console.log('PASS',message)};
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  const number=async(name,n)=>{const field=page.getByRole('spinbutton',{name,exact:true});await field.fill(String(n));await field.press('Tab')};
  const open=async(number)=>{
    await page.locator('#file').setInputFiles(path.join(root,`scores/methods/burgmuller-op-100/burgmuller-op-100-${String(number).padStart(3,'0')}.mxl`));
    await idle();
    // File chooser on Practice may already enter the practice screen.
    if(await page.getByRole('button',{name:'Tập bài này',exact:true}).count()) await page.getByRole('button',{name:'Tập bài này',exact:true}).click();
    await page.getByTestId('practice-v2').waitFor({timeout:120000});await idle();
  };
  const range=()=>page.getByRole('button',{name:'Chọn đoạn',exact:true}).click();
  const selected=()=>page.locator('rect.practice-measure.in-range').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.measure)));
  try {
    await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1');
    await page.getByRole('button',{name:'Nhập bản nhạc',exact:true}).waitFor();
    await page.addStyleTag({content:'#diagnostics{display:none!important}'});
    await open(9);
    const native=await page.evaluate(()=>{const api=window.pianist;let s;const previous=api.Module.onScoreSemantics;api.Module.onScoreSemantics=json=>s=JSON.parse(json);try{api.getScoreSemantics();return s;}finally{api.Module.onScoreSemantics=previous}});
    assert.equal(native.measures[0].label,0); assert.equal(native.measures[8].label,8);
    await range();assert.equal(await page.getByRole('spinbutton',{name:'Từ ô nhịp',exact:true}).inputValue(),'0');
    await number('Từ ô nhịp',8);await number('Đến ô nhịp',8);await page.getByRole('button',{name:'Áp dụng',exact:true}).click();
    assert.deepEqual(await selected(),[8]);assert.equal(await page.getByRole('button',{name:'Chọn đoạn',exact:true}).getAttribute('title'),'Đoạn ô 8–8');
    await range();await page.getByRole('button',{name:'Chọn trên sheet',exact:true}).click();
    await page.getByRole('button',{name:'Ô 0 · chọn A',exact:true}).click();
    assert.match(await page.locator('.v2-selection').innerText().catch(()=>page.getByText('2/2 · Đã chọn ô 0. Chạm ô kết thúc.',{exact:true}).innerText()),/Đã chọn ô 0/);
    await page.getByRole('button',{name:'Ô 0 · chọn B',exact:true}).click();
    await range();assert.equal(await page.getByRole('spinbutton',{name:'Từ ô nhịp',exact:true}).inputValue(),'0');assert.equal(await page.getByRole('spinbutton',{name:'Đến ô nhịp',exact:true}).inputValue(),'0');
    await page.getByRole('button',{name:'Hủy',exact:true}).click();
    check('La Chasse pickup 0 and printed measure 8 resolve to exact native indices; sheet click, toolbar and dialog agree');
    await page.getByRole('button',{name:'Thiết lập',exact:true}).click();
    await page.getByRole('combobox',{name:'Chế độ tập',exact:true}).selectOption('bpm');await number('Đếm vào',0);
    await page.getByRole('button',{name:'MIDI mô phỏng trường độ + pedal',exact:true}).click();
    await page.locator('.results-page').waitFor({timeout:90000});
    assert((await page.getByRole('button',{name:'Ô 0',exact:true}).count())>0);
    const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('pianist-library');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,r=db.transaction('sessions').objectStore('sessions').getAll();r.onsuccess=()=>{db.close();resolve(r.result.sort((a,b)=>b.createdAt-a.createdAt)[0])}}}));
    assert.equal(saved.measureLabels[0].label,0);assert(saved.timeline.targets.every(t=>t.measure===0));
    await page.reload();await page.getByRole('button',{name:'Lịch sử tập',exact:true}).click();await page.getByRole('button',{name:'Xem kết quả',exact:true}).first().click();
    assert((await page.getByRole('button',{name:'Ô 0',exact:true}).count())>0);
    check('Completed MIDI attempt persists native labels and history after reload shows Ô 0; grading indices remain 0');
    await page.getByRole('button',{name:'Thư viện',exact:true}).click();await open(14);
    await range();await number('Từ ô nhịp',4);await number('Đến ô nhịp',4);await page.getByRole('button',{name:'Áp dụng',exact:true}).click();
    await page.getByText(/Số ô 4 xuất hiện/).waitFor();
    await page.getByRole('combobox',{name:'Vị trí ô bắt đầu',exact:true}).selectOption('4');await page.getByRole('combobox',{name:'Vị trí ô kết thúc',exact:true}).selectOption('4');
    await page.setViewportSize({width:390,height:844});
    const bounds=await page.locator('dialog.range-dialog').boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=391);
    await page.screenshot({path:path.join(out,'duplicate-label-mobile.png')});
    await page.getByRole('button',{name:'Áp dụng',exact:true}).click();assert.deepEqual(await selected(),[4]);
    assert.match(await page.getByRole('button',{name:'Chọn đoạn',exact:true}).getAttribute('title'),/4 \(ô thứ 5\)/);
    await range();assert.equal(await page.getByRole('combobox',{name:'Vị trí ô bắt đầu',exact:true}).inputValue(),'4');
    check('La Styrienne repeated label 4 requires explicit choice, retains the second occurrence, and fits 390px');
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.passed=false;report.error=String(error);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report,null,2));
})();
