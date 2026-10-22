// Focused transport acceptance: real native audio, real scorer lifecycle, no
// fabricated grades. Run only after frontend installation/package is complete.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/practice-stop');
const url=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1#/exercises';
const hiddenOnly=process.argv.includes('--hidden-controls'),reportFile=path.join(out,hiddenOnly?'hidden-controls-report.json':'report.json');
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
  const report={url,browser:browser.version(),checks:[],errors:[],audio:[]};let unblock=()=>{};
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  await context.addInitScript(()=>{
    addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#diagnostics{display:none!important}';document.head.appendChild(s);});
    window.stopLoads=[];window.stopReplies=[];window.stopMeters=[];
    const OriginalWorker=window.Worker;
    window.Worker=class extends OriginalWorker{
      constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data?.view)window.stopReplies.push({generation:data.generation,type:data.type,view:data.view});});}
      postMessage(data,...rest){if(data?.type==='load'&&data.timeline)window.stopLoads.push({generation:data.generation,timeline:data.timeline});return super.postMessage(data,...rest);}
    };
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(...args){const r=connect.apply(this,args);if(args[0]===this.context.destination&&!this.stopMeter){const m=this.stopMeter=this.context.createAnalyser();m.fftSize=2048;connect.call(this,m);window.stopMeters.push(m);}return r;};
    window.stopAudioPeak=()=>Math.max(0,...window.stopMeters.map(m=>{if(m.context.state!=='running')return 0;const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));}));
    window.stopNativeState=()=>{const a=window.pianist;if(!a?.getPracticePlayback)return null;const old=a.Module.onPracticePlayback;let result;a.Module.onPracticePlayback=j=>result=JSON.parse(j);try{return a.getPracticePlayback()?result:null;}finally{a.Module.onPracticePlayback=old;}};
  });
  const transport=()=>page.getByRole('group',{name:'Điều khiển tập luyện'});
  const top=name=>transport().getByRole('button',{name,exact:true});
  const nav=name=>page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name,exact:true});
  const scoreId=()=>page.getByTestId('grade-progress').getAttribute('data-exercise-id');
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:150000});
  const check=m=>{report.checks.push(m);console.log('PASS',m);};
  const settings=()=>top('Thiết lập').click();
  const closeSettings=()=>page.getByRole('button',{name:'Đóng thiết lập',exact:true}).click();
  const ready=async()=>{await page.getByTestId('practice-v2').waitFor({timeout:150000});await page.locator('svg.practice-system-svg').first().waitFor();await page.waitForFunction(()=>!document.querySelector('.v2-play')?.disabled,null,{timeout:60000});};
  const focus=async value=>{const on=await page.locator('.practice-v2.sheet-focus').count()>0;if(value&&!on)await top('Chỉ bản nhạc').click();if(!value&&on)await top('Thoát toàn màn hình').click();};
  const capture=async name=>{
    const geometry=await page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth,buttons:[...document.querySelectorAll('.v2-transport button,.v2-reveal button')].filter(b=>b.checkVisibility()).map(b=>{const r=b.getBoundingClientRect();return{label:b.ariaLabel,text:b.textContent,x:r.x,right:r.right,top:r.top,bottom:r.bottom};})}));
    assert(geometry.body<=geometry.viewport+1,JSON.stringify(geometry));for(const b of geometry.buttons)assert(b.x>=-1&&b.right<=geometry.viewport+1,JSON.stringify(b));
    await page.screenshot({path:path.join(out,name+'.png')});
  };
  const silence=async label=>{
    await page.waitForFunction(()=>window.stopAudioPeak()<1e-5,null,{timeout:10000});
    const values=[];for(let i=0;i<4;i++){await page.waitForTimeout(125);values.push(await page.evaluate(()=>window.stopAudioPeak()));}
    assert(values.every(v=>v<1e-5),label+' residual sound '+JSON.stringify(values));report.audio.push({label,afterStopPeak:Math.max(...values)});
  };
  const startPractice=async()=>{
    const n=await page.evaluate(()=>window.stopLoads.length);await top('Bắt đầu tập').click();
    await page.waitForFunction(n=>window.stopLoads.length>n,n,{timeout:30000});
    if(page.viewportSize().width>600)assert.match(await top('Tạm dừng lượt tập').innerText(),/Tạm dừng/,'desktop pause must be visibly identified as pause');
    return page.evaluate(()=>window.stopLoads.at(-1));
  };
  const stopPractice=async(kind,phase,layout)=>{
    const id=kind==='grade'?await scoreId():undefined,load=await startPractice();
    if(phase==='counting')await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent.includes('Đếm vào'));
    else await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập',null,{timeout:15000});
    if(phase==='paused'){await top('Tạm dừng lượt tập').click();await top('Tiếp tục lượt tập').waitFor();}
    const stop=top('Dừng lượt tập');assert(await stop.isVisible());assert(await stop.isEnabled());assert.match(await stop.innerText(),/Dừng/);
    await capture(kind+'-'+layout+'-'+phase);await stop.click();await top('Bắt đầu tập').waitFor();
    await page.waitForFunction(()=>!document.querySelector('.v2-play')?.disabled);assert.equal(await top('Tiếp tục lượt tập').count(),0);
    assert.equal(await page.getByTestId('practice-v2').count(),1);assert.equal(new URL(page.url()).hash,'#/practice');
    await page.waitForFunction(g=>window.stopReplies.some(r=>r.generation===g&&r.type==='closed'),load.generation,{timeout:10000});
    await silence(kind+' '+phase);await page.waitForTimeout(900);
    if(id)assert.equal(await scoreId(),id,'manual Stop must not auto-advance a grade sheet');
    const last=await page.evaluate(()=>window.stopLoads.at(-1));assert.equal(last.generation,load.generation,'Stop must not restart a scorer');
    await settings();assert(await page.getByRole('combobox',{name:'Tay tập',exact:true}).isEnabled());
    assert(await page.getByRole('spinbutton',{name:'Đếm vào',exact:true}).isEnabled());await closeSettings();
    assert.match(await transport().locator('.v2-stop').innerText(),/Dừng/);check(kind+' '+layout+': Stop from '+phase+' closes the attempt, keeps sheet, silences audio and unlocks settings');
    return load.generation;
  };
  const listenCase=async(kind,phase,layout)=>{
    const id=kind==='grade'?await scoreId():undefined;
    await top('Nghe đoạn').click();await page.waitForFunction(()=>window.stopAudioPeak()>1e-5,null,{timeout:150000});
    const before=await page.evaluate(()=>({peak:window.stopAudioPeak(),state:window.stopNativeState()}));assert(before.state?.status==='playing');
    if(phase==='paused'){await top('Tạm dừng nghe').click();await top('Tiếp tục nghe').waitFor();}
    assert(await top('Dừng nghe').isVisible());assert(await top('Dừng nghe').isEnabled());
    await capture(kind+'-'+layout+'-listen-'+phase);await top('Dừng nghe').click();await top('Nghe đoạn').waitFor();
    await page.waitForFunction(()=>{const s=window.stopNativeState();return s&&s.status==='stopped'&&!s.preparing&&Math.abs(s.positionSeconds)<.01;},null,{timeout:10000});
    await silence(kind+' preview '+phase);assert.equal(await page.locator('.note-marker.playback').count(),0);
    if(id)assert.equal(await scoreId(),id);assert(await top('Bắt đầu tập').isEnabled());
    report.audio.push({label:kind+' preview '+phase,beforeStopPeak:before.peak});
    check(kind+' '+layout+': explicit Stop ends '+phase+' MuseScore preview and resets position/highlight');
  };

  try{
    await page.goto(url);await page.getByRole('combobox',{name:'Grade',exact:true}).waitFor();
    await page.getByRole('checkbox',{name:'Khoảng 4 nốt',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Khoảng 20 nốt',exact:true}).check();
    await page.getByRole('checkbox',{name:'Random',exact:true}).uncheck();
    await page.getByRole('button',{name:'Bắt đầu tập theo grade',exact:true}).click();await ready();assert(await top('Dừng').isVisible());assert(await top('Dừng').isDisabled());

    if(hiddenOnly){
      const id=await scoreId();await focus(true);const load=await startPractice();await top('Ẩn thanh điều khiển').click();
      const floating=page.locator('.v2-reveal');assert(await floating.getByRole('button',{name:'Dừng lượt tập',exact:true}).isVisible());
      await capture('desktop-full-hidden-practice-stop');await floating.getByRole('button',{name:'Dừng lượt tập',exact:true}).click();await top('Bắt đầu tập').waitFor();
      await page.waitForFunction(g=>window.stopReplies.some(r=>r.generation===g&&r.type==='closed'),load.generation);await silence('hidden controls practice');
      await page.waitForTimeout(900);assert.equal(await scoreId(),id);check('desktop full-sheet hidden controls retain a visible floating Stop that ends practice on the same sheet');
      await top('Nghe đoạn').click();await page.waitForFunction(()=>window.stopAudioPeak()>1e-5,null,{timeout:150000});await top('Ẩn thanh điều khiển').click();
      assert(await floating.getByRole('button',{name:'Dừng nghe',exact:true}).isVisible());await capture('desktop-full-hidden-preview-stop');
      await floating.getByRole('button',{name:'Dừng nghe',exact:true}).click();await top('Nghe đoạn').waitFor();
      await page.waitForFunction(()=>{const s=window.stopNativeState();return s?.status==='stopped'&&!s.preparing&&Math.abs(s.positionSeconds)<.01;});await silence('hidden controls preview');
      assert.equal(await scoreId(),id);assert.deepEqual(report.errors,[]);check('desktop full-sheet hidden controls retain Stop for native playback and reset it to silence');
      report.passed=true;console.log(JSON.stringify({passed:true,checks:report.checks.length,report:reportFile}));return;
    }

    // Hold the main MuseScore engine (the independent grade renderer is ready).
    // This reaches genuine asynchronous listening preparation, not a mocked UI.
    const engineUrl=new URL('MuseScoreStudio.wasm',url).href;let release,arrived;
    const gate=new Promise(resolve=>{release=resolve;unblock=resolve;}),request=new Promise(resolve=>{arrived=resolve;});
    const hold=async route=>{arrived();await gate;await route.continue().catch(()=>{});};
    await page.route(engineUrl,hold);await page.setViewportSize({width:360,height:800});await focus(true);await top('Nghe đoạn').click();
    let timer;try{await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Pending playback did not request main native engine')),30000);})]);}finally{clearTimeout(timer);}
    assert(await top('Dừng nghe').isEnabled());await capture('grade-full-360-listen-pending');await top('Dừng nghe').click();
    await top('Nghe đoạn').waitFor();release();await page.unroute(engineUrl,hold);
    // The diagnostics API appears before startAudioProcessing resolves. On a
    // cold HTTPS load, wait for Workspace engineReady before timing a new run.
    await page.waitForFunction(()=>!!window.pianist?.getPracticePlayback,null,{timeout:150000});
    await page.waitForFunction(()=>document.querySelector('#save')?.disabled===false,null,{timeout:150000});await idle();await page.waitForTimeout(2000);
    assert.equal(await top('Tạm dừng nghe').count(),0);assert.equal(await page.locator('.note-marker.playback').count(),0);await silence('cancel pending preview');
    assert(await top('Bắt đầu tập').isEnabled());check('mobile full-sheet Stop cancels first native listening preparation; late engine completion cannot start audio');

    await focus(false);await page.setViewportSize({width:1440,height:1000});
    const first=await stopPractice('grade','counting','desktop'),second=await stopPractice('grade','running','desktop');assert.notEqual(first,second,'restart must create new attempt');
    await listenCase('grade','playing','desktop');
    await page.setViewportSize({width:360,height:800});await focus(true);await stopPractice('grade','paused','full-360');await listenCase('grade','paused','full-360');
    await page.getByRole('button',{name:'Chọn grade và độ dài',exact:true}).click();await page.getByRole('combobox',{name:'Grade',exact:true}).waitFor();

    // A finished grade attempt still has a short result pause. Explicit Stop
    // during that pause must also cancel the already scheduled next exercise.
    await page.getByRole('checkbox',{name:'Khoảng 20 nốt',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Khoảng 4 nốt',exact:true}).check();
    await page.getByRole('button',{name:'Bắt đầu tập theo grade',exact:true}).click();await ready();const completedId=await scoreId();
    await settings();const priorLoads=await page.evaluate(()=>window.stopLoads.length);await page.getByRole('button',{name:'MIDI mô phỏng trường độ + pedal',exact:true}).click();
    await page.waitForFunction(n=>window.stopLoads.length>n,priorLoads);const completedGeneration=await page.evaluate(()=>window.stopLoads.at(-1).generation);
    await page.waitForFunction(g=>window.stopReplies.some(r=>r.generation===g&&r.type==='closed'),completedGeneration,{timeout:30000});
    await top('Dừng lượt tập').click();await page.waitForTimeout(1200);assert.equal(await scoreId(),completedId);
    assert.equal(await page.evaluate(()=>window.stopLoads.at(-1).generation),completedGeneration);assert(await top('Bắt đầu tập').isEnabled());
    check('Stop during completed-grade result pause cancels automatic next exercise');
    await page.getByRole('button',{name:'Chọn grade và độ dài',exact:true}).click();await page.getByRole('combobox',{name:'Grade',exact:true}).waitFor();

    // Free play must retain its sheet instead of navigating to Results on Stop.
    await page.getByRole('button',{name:'Free play',exact:true}).click();await nav('Thư viện').click();
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:150000});await idle();
    await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await ready();
    await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Theo BPM',exact:true}).click();
    await stopPractice('free','counting','desktop');await listenCase('free','paused','desktop');
    await page.setViewportSize({width:360,height:800});await focus(true);
    await stopPractice('free','running','full-360');await stopPractice('free','paused','full-360');await listenCase('free','playing','full-360');
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.passed=false;report.error=String(error.stack||error);report.visible=await page.locator('main').allTextContents().catch(()=>[]);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
  finally{unblock();await fs.writeFile(reportFile,JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,errors:report.errors,error:report.error,report:reportFile},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
