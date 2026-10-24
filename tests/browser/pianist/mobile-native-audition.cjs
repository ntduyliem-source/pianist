// Actual Qt/WASM and MS Basic output, in touch/mobile emulation (not a phone).
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),channel=process.env.PIANIST_BROWSER_CHANNEL||'chrome';
const out=path.resolve(process.env.PIANIST_QA_DIR||path.join(root,'artifacts/mobile-native',channel));
const deviceScaleFactor=Number(process.env.PIANIST_DPR||1);
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel,headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor,acceptDownloads:true});
  await context.addInitScript(()=>{
    window.nativeMeters=[];window.gradeLoads=0;
    const connect=AudioWorkletNode.prototype.connect;
    AudioWorkletNode.prototype.connect=function(...args){const r=connect.apply(this,args);if(args[0]===this.context.destination&&!this.pianistMeter){const m=this.pianistMeter=this.context.createAnalyser();m.fftSize=2048;connect.call(this,m);window.nativeMeters.push(m);}return r;};
    window.nativeAudioPeak=()=>Math.max(0,...window.nativeMeters.map(m=>{const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));}));
    const Worker=window.Worker;window.Worker=class extends Worker{postMessage(d,...rest){if(d?.type==='load'&&d.timeline)window.gradeLoads++;return super.postMessage(d,...rest);}};
  });
  const page=await context.newPage(),errors=[],checks=[],screens=[],report={browser:browser.version(),emulated:true,deviceScaleFactor,checks,screens,errors};
  page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  const read=()=>page.evaluate(()=>{const a=window.pianist,old=a.Module.onPracticePlayback;let s;a.Module.onPracticePlayback=j=>s=JSON.parse(j);try{a.getPracticePlayback();return s;}finally{a.Module.onPracticePlayback=old;}});
  const semantics=()=>page.evaluate(()=>{const a=window.pianist,old=a.Module.onScoreSemantics;let s;a.Module.onScoreSemantics=j=>s=JSON.parse(j);try{if(!a.getScoreSemantics())throw Error("No native semantics");return s;}finally{a.Module.onScoreSemantics=old;}});
  const history=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('pianist-library');req.onsuccess=()=>{const db=req.result,q=db.transaction('sessions').objectStore('sessions').count();q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};}));
  const state=async(status)=>{const until=Date.now()+30000;while(true){const s=await read();if(s.status===status&&!s.preparing)return s;assert(Date.now()<until,`native status ${status}: ${JSON.stringify(s)}`);await page.waitForTimeout(60);}};
  const settings=async()=>{await page.getByRole('button',{name:'Thiết lập',exact:true}).click();await page.getByRole('dialog').waitFor();};
  const close=()=>page.getByRole('button',{name:'Xong',exact:true}).click();
  const field=async(name,value)=>{const f=page.getByRole('spinbutton',{name,exact:true});await f.fill(String(value));await f.press('Tab');};
  const geometry=()=>page.evaluate(()=>{
    const box=selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
    const controls=[...document.querySelectorAll('.editor-meta>button,.editor-playback button,.v2-transport button,.v2-sheet-tools button')].filter(n=>n.checkVisibility());
    return {viewport:{width:innerWidth,height:innerHeight},bodyWidth:document.body.scrollWidth,sheet:box('.practice-sheet-region'),editor:box('#screen'),
      controls:controls.map(n=>{const r=n.getBoundingClientRect();return{name:n.getAttribute('aria-label')||n.textContent,x:r.x,right:r.right,width:r.width,height:r.height};})};
  });
  const capture=async(name)=>{
    const g=await geometry();assert(g.bodyWidth<=g.viewport.width+1,'no document horizontal overflow');
    for(const b of g.controls){assert(b.x>=-1&&b.right<=g.viewport.width+1,`${b.name} within viewport ${name}`);assert(b.height>=39,`${b.name} touch target`);}
    await page.screenshot({path:path.join(out,name+'.png')});screens.push({name,...g});return g;
  };
  try{
    const base=new URL(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html');base.searchParams.set('diagnostics','1');
    await page.goto(base.href);
    if(process.env.PIANIST_TEST_SONG){
      report.song=process.env.PIANIST_TEST_SONG;
      await page.getByRole('button',{name:'Mở bài có sẵn '+report.song,exact:true}).click();
    }else{
      const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Nhập bản nhạc',exact:true}).click();await(await chooser).setFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    }
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
    await page.waitForFunction(()=>!document.querySelector('.editor-playback button')?.disabled,null,{timeout:120000});
    // Diagnostics aren't end-user controls and should not obscure touch checks.
    await page.addStyleTag({content:'#diagnostics{display:none!important}'});
    const baseline=await semantics(),initialHistory=await history();
    for(const [width,height] of [[360,800],[390,844],[430,932],[844,390],[768,1024],[1440,1000]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(350);
      await capture(`editor-${width}x${height}`);
      const canvas=await page.locator('#screen canvas').first().boundingBox();
      assert(canvas&&canvas.width<=width+1,`Qt canvas fits ${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Thêm thao tác editor'}).click();
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Tải MSCZ',exact:true}).click();await(await download).saveAs(path.join(out,'mobile-save.mscz'));
    checks.push('Editor canvas and touch controls fit 360/390/430 portrait, 844 landscape, tablet and desktop; mobile MSCZ download works');
    await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await page.getByTestId('practice-v2').waitFor();await idle();
    for(const [width,height] of [[360,800],[390,844],[430,932],[844,390],[768,1024],[1440,1000]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(250);
      const g=await capture(`practice-${width}x${height}`);assert(g.sheet.height>=height*.58,'sheet is primary');
    }
    await page.setViewportSize({width:390,height:844});
    await settings();await page.getByRole('button',{name:/Chọn đoạn · ô/}).click();await field('Từ ô nhịp',2);await field('Đến ô nhịp',2);await page.getByRole('button',{name:'Áp dụng',exact:true}).click();
    const rangeStart=baseline.occurrences.find(o=>o.measure===1).startMs,rangeEnd=baseline.occurrences.find(o=>o.measure===1).endMs;
    await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();
    const pedal=page.getByRole('switch',{name:'Dùng pedal khi tập'});await pedal.click();assert.equal(await pedal.getAttribute('aria-checked'),'false');await pedal.click();
    await capture('fullsheet-390x844');
    await page.getByRole('button',{name:'Nghe đoạn',exact:true}).click();await state('playing');
    await page.waitForFunction(()=>window.nativeAudioPeak()>1e-6,null,{timeout:30000});report.nativePeak=await page.evaluate(()=>window.nativeAudioPeak());
    await page.waitForFunction(()=>!!document.querySelector('.note-marker.playback'),null,{timeout:15000});
    await page.screenshot({path:path.join(out,'fullsheet-listening.png')});
    await page.getByRole('button',{name:'Tạm dừng nghe',exact:true}).click();const paused=await state('paused');await page.waitForTimeout(300);
    assert(Math.abs((await read()).positionSeconds-paused.positionSeconds)<.02,'native pause holds time');
    await settings();
    await page.getByRole('combobox',{name:'Tốc độ nghe'}).selectOption('0.5');
    await page.waitForFunction(()=>document.querySelector('[aria-label=\"Tốc độ nghe\"]').value==='0.5');
    assert.equal((await read()).tempoMultiplier,.5);
    await page.getByRole('slider',{name:'Vị trí nghe'}).fill(String(Math.round(rangeStart+200)));await page.waitForTimeout(200);
    assert(Math.abs((await read()).positionSeconds*.5*1000-rangeStart-200)<50,'seek uses performed reference time at 50%');
    await page.getByRole('button',{name:'Lặp khi nghe'}).click();
    await page.getByRole('slider',{name:'Vị trí nghe'}).fill(String(Math.round(rangeEnd-200)));await page.waitForTimeout(150);
    await close();
    await page.getByRole('button',{name:'Tiếp tục nghe',exact:true}).click();await state('playing');
    await page.waitForTimeout(700);const looped=await read();
    assert(looped.positionSeconds*.5*1000<rangeStart+1200,'native loop returns to A');
    assert(looped.positionSeconds*.5*1000>=rangeStart-20);
    await settings();
    await page.getByRole('dialog').getByRole('button',{name:'Ẩn thanh điều khiển'}).click();
    await page.getByRole('button',{name:/Hiện điều khiển/}).click();
    await page.getByRole('button',{name:'Tiếp tục nghe',exact:true}).click();await state('playing');
    assert(await pedal.isVisible());await page.getByRole('button',{name:'Tạm dừng nghe'}).waitFor({state:'visible'});
    await settings();
    await page.getByRole('button',{name:'Lặp khi nghe'}).click();
    await page.getByRole('slider',{name:'Vị trí nghe'}).fill(String(Math.round(rangeEnd-300)));await page.waitForTimeout(100);
    await close();await page.getByRole('button',{name:'Tiếp tục nghe',exact:true}).click();await state('playing');
    const ended=await state('paused');assert(Math.abs(ended.positionSeconds*.5*1000-rangeEnd)<3,'native one-shot stops at B without a JS deadline');
    await page.waitForFunction(()=>document.querySelector('.v2-focus-context')?.textContent.startsWith('Ô 2 ·'),'one-shot viewport stays on B');
    await settings();
    await page.getByRole('dialog').getByRole('button',{name:'Kết thúc lượt tập',exact:true}).click();await state('stopped');
    assert.equal((await read()).tempoMultiplier,1);
    const after=await semantics();
    assert.equal(after.durationMs,baseline.durationMs);assert.deepEqual(after.performed,baseline.performed);assert.deepEqual(after.keyReleases,baseline.keyReleases);assert.deepEqual(after.pedals,baseline.pedals);
    assert.equal(await page.evaluate(()=>window.gradeLoads),0);assert.equal(await history(),initialHistory);
    assert.equal(await page.evaluate(()=>window.pianist.dispatchAction('pitch-up')),0,'practice edit guard remains enabled');
    checks.push('Full sheet retains listening and pedal; native MS Basic samples, pause, 50% speed, seek and audio-engine A–B loop verified; notation/grading reference/history unchanged');
    await page.getByRole('button',{name:'Thoát toàn màn hình'}).click();
    await page.getByRole('button',{name:'Nghe đoạn',exact:true}).click();await state('playing');
    await page.getByRole('button',{name:'Dừng nghe',exact:true}).click();await state('stopped');await page.waitForTimeout(300);
    assert.equal((await read()).status,'stopped','restoring the native tempo cannot resume audio after Stop');
    assert.equal((await read()).tempoMultiplier,1);
    await page.getByRole('button',{name:'Nghe đoạn',exact:true}).click();await state('playing');
    await page.getByRole('combobox',{name:'Tốc độ nghe'}).selectOption('1');
    await page.getByRole('button',{name:'Dừng nghe',exact:true}).click();await state('stopped');await page.waitForTimeout(500);
    assert.equal((await read()).status,'stopped','stop cancels a pending native speed-change resume');
    checks.push('One-shot stays at B; stop while playing or changing speed never schedules a delayed resume');
    await page.getByRole('button',{name:'Theo BPM',exact:true}).click();await field('BPM',240);
    await settings();await field('Đếm vào',0);await page.getByRole('button',{name:'MIDI mô phỏng trường độ + pedal',exact:true}).click();
    await page.waitForURL(u=>u.hash==='#/results',{timeout:60000});
    const resultDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Tải JSON',exact:true}).click();const resultPath=path.join(out,'simulated-midi.json');await(await resultDownload).saveAs(resultPath);
    const result=JSON.parse(await fs.readFile(resultPath,'utf8'));assert.equal(result.metrics.hits,result.metrics.planned);assert.equal(result.metrics.misses,0);assert.equal(result.metrics.extras,0);
    checks.push('Unchanged BPM engine accepts the simulated reference after listening, with all planned notes hit and no misses/extras');
    assert.deepEqual(errors,[]);report.passed=true;
  }catch(e){report.passed=false;report.error=String(e);console.error(e);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report,null,2));
})();
