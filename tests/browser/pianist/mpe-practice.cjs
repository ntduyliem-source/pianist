// Restored library -> real native renderer -> production scorer Worker -> SVG ink.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/two-staff-upgrade');
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
 const report={checks:[],errors:[],failedRequests:[]};
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
 page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
 await context.addInitScript(()=>{
  addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='#diagnostics{display:none!important}';document.head.appendChild(style);});
  window.mpeLoads=[];window.mpeReplies=[];window.mpeRenders=[];window.mpeInk=[];
  const Original=Worker;window.Worker=class extends Original{
   constructor(...args){super(...args);this.addEventListener('message',({data})=>{
    if(data?.view)window.mpeReplies.push({generation:data.generation,type:data.type,view:data.view});
    if(data?.type==='result'&&data.result?.snapshot)window.mpeRenders.push(data.result.snapshot);
   });}
   postMessage(data,...args){if(data?.type==='load'&&data.timeline)window.mpeLoads.push(data);return super.postMessage(data,...args);}
  };
  setInterval(()=>{for(const e of document.querySelectorAll('.note-marker.hit[data-anchor*="-g"]'))if(!window.mpeInk.includes(e.dataset.anchor))window.mpeInk.push(e.dataset.anchor);},10);
 });
 const check=s=>{report.checks.push(s);console.log('PASS',s);};
 const settings=()=>page.getByRole('button',{name:'Thiết lập',exact:true}).click();
 const close=()=>page.getByRole('button',{name:'Xong',exact:true}).click();
 const number=async(label,value)=>{const e=page.getByRole('spinbutton',{name:label,exact:true});await e.fill(String(value));await e.press('Tab');};
 const open=async(title)=>{
  await page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name:'Thư viện',exact:true}).click();
  await page.getByRole('searchbox',{name:'Tìm bản nhạc'}).fill(title);
  await page.locator('.score-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).getByRole('button',{name:'Tập',exact:true}).click();
  await page.getByTestId('practice-v2').waitFor({timeout:180000});
  await page.locator('svg.practice-system-svg').first().waitFor({timeout:90000});
  await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
 };
 const range=async(a,b)=>{await page.getByRole('button',{name:'Chọn đoạn',exact:true}).click();await number('Từ ô nhịp',a);await number('Đến ô nhịp',b);await page.getByRole('button',{name:'Áp dụng',exact:true}).click();};
 const simulate=async()=>{
  const before=await page.evaluate(()=>window.mpeLoads.length);
  await page.getByRole('button',{name:'MIDI mô phỏng trường độ + pedal',exact:true}).click();
  await page.waitForFunction(n=>window.mpeLoads.length>n,before);
  const load=await page.evaluate(()=>window.mpeLoads.at(-1));
  if(load.timeline.targets.some(n=>n.anchors.some(id=>id.includes('-g')))){
   await page.waitForFunction(()=>window.mpeInk.length>0||document.querySelector('.v2-alert'),null,{timeout:30000});
   await page.screenshot({path:path.join(out,'mpe-full-sheet.png')});
  }
  await page.waitForFunction(g=>window.mpeReplies.some(r=>r.generation===g&&r.view.done)||document.querySelector('.v2-alert'),load.generation,{timeout:60000});
  assert.deepEqual(await page.locator('.v2-alert').allTextContents(),[],JSON.stringify(report.failedRequests));
  const view=await page.evaluate(g=>{
   const replies=window.mpeReplies.filter(r=>r.generation===g),last=replies.at(-1).view;
   // Worker messages carry deltas, exactly as PracticeController accumulates.
   return {...last,judgements:replies.flatMap(r=>r.view.judgements),extras:replies.flatMap(r=>r.view.extras)};
  },load.generation);
  assert.equal(view.judgements.length,load.timeline.targets.length);assert(view.judgements.every(j=>j.grade==='perfect'));
  assert.deepEqual(view.faults,[]);assert.deepEqual(view.extras,[]);
  return load;
 };
 try{
  await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1#/library');
  await open('999 đóa hồng');await range(23,23);await settings();
  await page.getByRole('combobox',{name:'Chế độ tập',exact:true}).selectOption('bpm');
  await page.getByRole('combobox',{name:'Tempo',exact:true}).selectOption('score');
  await number('Số vòng',2);await number('Đếm vào',0);await close();
  await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();await settings();
  const load=await simulate();
  assert(load.timeline.targets.some(n=>n.anchors.some(id=>id.includes('-g'))));
  assert(load.timeline.targets.some(n=>n.loop===1));
  assert((await page.evaluate(()=>window.mpeInk)).length>0,'Grace notehead must receive hit ink in the real sheet');
  check('Restored grace score runs native BPM through the Worker, highlights grace noteheads and repeats A–B twice without misses');
  await page.getByRole('heading',{name:/999 đóa hồng/}).waitFor();
  await page.screenshot({path:path.join(out,'mpe-result.png')});
  await open('Họa tâm');await range(69,69);await settings();
  await page.getByRole('combobox',{name:'Chế độ tập',exact:true}).selectOption('bpm');await number('Số vòng',1);await number('Đếm vào',0);
  const ambiguous=await simulate();assert(ambiguous.timeline.targets.length>0);
  check('Previously quarantined Họa tâm bar 69 is retained and grades the actual MuseScore interpretation');
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,'mpe-mobile.png')});
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(e){report.passed=false;report.error=String(e.stack||e);process.exitCode=1;await page.screenshot({path:path.join(out,'mpe-ui-failure.png')}).catch(()=>{});}
 finally{await fs.writeFile(path.join(out,'ui-audit.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report,null,2));
})();
