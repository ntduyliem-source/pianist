// Product regression: real Qt/MuseScore audio + touch events, synthetic MIDI and
// AudioSession interruptions. This does not claim physical Safari/MIDI coverage.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.env.PIANIST_QA_DIR||path.join(root,'artifacts/ux-upgrade'));
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
    window.midiRequests=0;window.midiOpens=0;
    const input={id:'ux-test-piano',name:'UX Test Piano',state:'connected',connection:'closed',type:'input',onmidimessage:null,
      async open(){window.midiOpens++;this.connection='open';return this;},async close(){this.connection='closed';return this;}};
    const access={inputs:new Map([[input.id,input]]),onstatechange:null};
    Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>{window.midiRequests++;return access;}});
    const audioSession=new EventTarget();audioSession.type='auto';audioSession.state='active';
    Object.defineProperty(navigator,'audioSession',{configurable:true,value:audioSession});
    window.nativeMeters=[];
    const connect=AudioWorkletNode.prototype.connect;
    AudioWorkletNode.prototype.connect=function(...args){const r=connect.apply(this,args);if(args[0]===this.context.destination&&!this.uxMeter){const m=this.uxMeter=this.context.createAnalyser();m.fftSize=2048;connect.call(this,m);window.nativeMeters.push(m);}return r;};
    window.audioPeak=()=>Math.max(0,...window.nativeMeters.map(m=>{const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));}));
  });
  const page=await context.newPage(),checks=[],errors=[],report={checks,errors,emulated:true,browser:browser.version()};
  const check=s=>{checks.push(s);console.log(s);};
  page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  const nav=name=>page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name,exact:true});
  const score=()=>page.evaluate(()=>{const a=window.pianist,old=a.Module.onScoreSemantics;let s;a.Module.onScoreSemantics=j=>s=JSON.parse(j);try{if(!a.getScoreSemantics())throw Error('No native score');return s.anchors.map(n=>[n.tick,n.pitch,n.durationTicks,n.staff,n.voice]);}finally{a.Module.onScoreSemantics=old;}});
  const read=()=>page.evaluate(()=>{const a=window.pianist,old=a.Module.onPracticePlayback;let s;a.Module.onPracticePlayback=j=>s=JSON.parse(j);try{a.getPracticePlayback();return s;}finally{a.Module.onPracticePlayback=old;}});
  const capture=async name=>{
    const geometry=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth,controls:[...document.querySelectorAll('.appbar button,.appbar select,.v2-transport button,.library-player button,.library-player input')].filter(n=>n.checkVisibility()).map(n=>{const r=n.getBoundingClientRect();return{label:n.getAttribute('aria-label')||n.textContent,x:r.x,right:r.right};})}));
    assert(geometry.body<=geometry.width+1,'document fits');for(const c of geometry.controls)assert(c.x>=-1&&c.right<=geometry.width+1,'control fits: '+c.label);
    await page.screenshot({path:path.join(out,name+'.png')});
  };
  try{
    const url=new URL(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html');url.searchParams.set('diagnostics','1');url.hash='/library';
    await page.goto(url.href);await page.getByRole('heading',{name:'Thư viện',exact:true}).waitFor();
    await page.addStyleTag({content:'#diagnostics{display:none!important}'});
    await page.getByRole('searchbox',{name:'Tìm bản nhạc'}).fill('Fly Me');
    const versions=page.getByRole('combobox',{name:'Chọn phiên bản Fly Me to the Moon'});
    await versions.waitFor();assert.equal(await versions.locator('option').count(),2);
    const cover=page.getByAltText('Trang đầu: Fly Me to the Moon');
    await page.waitForFunction(()=>document.querySelector('.score-thumbnail img')?.naturalWidth>0);
    const first=await cover.getAttribute('src');await versions.selectOption({index:1});
    assert.notEqual(await cover.getAttribute('src'),first,'version changes actual score thumbnail');
    for(const [w,h] of [[360,800],[390,844],[768,1024],[1440,1000]]){
      await page.setViewportSize({width:w,height:h});
      for(const mode of ['Danh sách','Ảnh nhỏ','Ảnh lớn']){await page.getByRole('button',{name:mode,exact:true}).click();await capture(`library-${w}-${mode==='Danh sách'?'list':mode==='Ảnh nhỏ'?'small':'large'}`);}
    }
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Danh sách',exact:true}).click();
    await page.getByRole('combobox',{name:'Giao diện sáng tối'}).selectOption('dark');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await capture('library-dark-mobile');
    await page.getByRole('combobox',{name:'Giao diện sáng tối'}).selectOption('light');
    await page.reload();await versions.waitFor();assert.equal(await versions.inputValue(),await versions.locator('option').nth(1).getAttribute('value'));
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    check('Actual version-specific thumbnails, 3 layouts at 360/390/768/1440, persistent theme and version');
    // Keep an edited native project and its undo stack while listening elsewhere.
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
    const original=await score();await page.locator('#select').click();await page.locator('#up').click();const edited=await score();assert.notDeepEqual(original,edited);
    await page.addStyleTag({content:'#diagnostics{display:none!important}'});
    await page.evaluate(()=>{window.themeCalls=[];const a=window.pianist,original=a.setUiTheme;a.setUiTheme=value=>{const result=original(value);window.themeCalls.push({value,result});return result;};});
    await page.getByRole('combobox',{name:'Giao diện sáng tối'}).selectOption('dark');await capture('editor-dark-mobile');
    assert.deepEqual(await page.evaluate(()=>window.themeCalls.at(-1)),{value:'dark',result:1});
    await page.getByRole('combobox',{name:'Giao diện sáng tối'}).selectOption('light');
    assert.deepEqual(await score(),edited,'theme never changes music');
    await page.getByRole('button',{name:'MIDI: Chưa kết nối',exact:true}).click();
    await page.getByRole('button',{name:'Kết nối MIDI',exact:true}).click();
    await page.getByText('Đã kết nối: UX Test Piano',{exact:true}).waitFor();await page.getByRole('button',{name:'Đóng MIDI'}).click();
    await nav('Thư viện').click();await page.getByRole('searchbox',{name:'Tìm bản nhạc'}).fill('Fly Me');
    await page.getByRole('button',{name:'Nghe Fly Me to the Moon',exact:true}).click();
    const player=page.getByRole('region',{name:'Nghe nhạc thư viện'});await player.waitFor();
    await page.waitForFunction(()=>window.audioPeak()>1e-6||!!document.querySelector('.library-player [role="alert"]'),null,{timeout:120000});
    assert.equal(await player.locator('[role="alert"]').count(),0,await player.innerText());
    await player.getByRole('button',{name:'Tạm dừng nghe thư viện'}).click();
    await page.waitForFunction(()=>!!document.querySelector('[aria-label="Phát nghe thư viện"]'));
    const paused=await read();await page.waitForTimeout(150);assert(Math.abs((await read()).positionSeconds-paused.positionSeconds)<.025);
    const seek=player.getByRole('slider',{name:'Vị trí nghe thư viện'}),half=Number(await seek.getAttribute('max'))/2;
    await seek.fill(String(Math.round(half/100)*100));await page.waitForTimeout(150);
    const seekState=await read(); report.seek={requestedMs:half,sliderValue:await seek.inputValue(),native:seekState};
    assert(Math.abs(seekState.positionSeconds*1000-half)<150,'native seek position: '+JSON.stringify(report.seek));
    await capture('library-player-mobile');
    await player.getByRole('button',{name:'Phát nghe thư viện'}).click();
    await page.waitForFunction(()=>window.audioPeak()>1e-6,null,{timeout:30000});
    assert.equal(await page.evaluate(()=>navigator.audioSession.type),'playback');
    await page.evaluate(()=>{navigator.audioSession.state='interrupted';navigator.audioSession.dispatchEvent(new Event('statechange'));});
    await player.getByRole('button',{name:'Phát nghe thư viện'}).waitFor();
    await player.getByRole('button',{name:'Dừng nghe thư viện',exact:true}).click();await player.waitFor({state:'hidden'});
    await nav('Editor').click();await idle();assert.deepEqual(await score(),edited,'Stop restores exact edited score');
    await page.evaluate(()=>{window.pianist.dispatchAction('undo');});assert.deepEqual(await score(),original,'Undo survives listening');
    await page.evaluate(()=>{window.pianist.dispatchAction('redo');});assert.deepEqual(await score(),edited);
    assert.deepEqual(await page.evaluate(()=>[window.midiRequests,window.midiOpens]),[1,1]);
    check('Real MuseScore library audio/pause/seek/Stop, interruption pause, native dark theme, editor content + Undo retained, one MIDI connection across tabs');
    await page.getByRole('button',{name:'Thêm thao tác editor'}).click();
    await page.getByRole('button',{name:'Lưu thành bản mới…',exact:true}).click();
    await page.getByRole('textbox',{name:'Tên bản mới'}).fill('UX alternate arrangement');
    await page.getByRole('button',{name:'Lưu bản mới',exact:true}).click();await idle();
    await nav('Thư viện').click();await page.getByRole('searchbox',{name:'Tìm bản nhạc'}).fill('UX alternate');
    const privateWork=page.getByRole('region',{name:'Bản nhạc của tôi'});
    const privateVersion=privateWork.getByRole('combobox',{name:/Chọn phiên bản/});
    await privateVersion.waitFor();assert.equal(await privateVersion.locator('option').count(),2,'Save As adds a version, search retains the whole group');
    await privateVersion.selectOption({index:1});
    await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="Bản nhạc của tôi"] .score-thumbnail img')].some(img=>img.naturalWidth>0),null,{timeout:60000});
    await privateWork.getByRole('button',{name:'Nghe UX alternate arrangement',exact:true}).click();
    await page.waitForFunction(()=>window.audioPeak()>1e-6||!!document.querySelector('.library-player [role="alert"]'),null,{timeout:30000});
    assert.equal(await player.locator('[role="alert"]').count(),0,await player.innerText());
    await player.getByRole('button',{name:'Dừng nghe thư viện',exact:true}).click();
    await capture('private-versions-mobile');
    check('Save As groups private versions; search retains both; private MSCZ preview and playback work');
    // Exercise native grand-staff sheet: actual touch packets, pinch anchored on page 2.
    await nav('Thư viện').click();await page.getByRole('searchbox',{name:'Tìm bản nhạc'}).fill('Tình Đơn Phương');
    await page.getByRole('button',{name:'Mở bài có sẵn Tình Đơn Phương',exact:true}).click();await idle();
    await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await page.getByTestId('practice-v2').waitFor();await idle();
    await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();
    for(const width of [360,390,430]){await page.setViewportSize({width,height:844});await capture('fullsheet-'+width);}
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('.v2-focusbar').count(),0,'no external title/measure banner');
    assert.equal(await page.getByRole('button',{name:'MIDI: UX Test Piano',exact:true}).filter({visible:true}).count(),1);
    await page.locator('.practice-page[data-page="1"]').waitFor();
    const target=await page.evaluate(()=>{const el=document.querySelector('#sheet-scroll'),page=document.querySelector('.practice-page[data-page="1"]');el.scrollTop=page.offsetTop+200;const s=el.getBoundingClientRect(),p=page.getBoundingClientRect();const x=s.left+Math.min(195,s.width/2),y=s.top+Math.min(220,s.height/2);return{x,y,fx:(x-p.left)/p.width,fy:(y-p.top)/p.height,width:p.width};});
    const cdp=await context.newCDPSession(page);
    const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:3,radiusY:3,force:1}))});
    await touch('touchStart',[[1,target.x-40,target.y],[2,target.x+40,target.y]]);
    await touch('touchMove',[[1,target.x-65,target.y],[2,target.x+65,target.y]]);
    await page.waitForFunction(w=>document.querySelector('.practice-page[data-page="1"]').getBoundingClientRect().width>w*1.4,target.width);
    const anchored=await page.evaluate(t=>{const p=document.querySelector('.practice-page[data-page="1"]').getBoundingClientRect();return{x:p.left+t.fx*p.width,y:p.top+t.fy*p.height};},target);
    assert(Math.abs(anchored.x-target.x)<4&&Math.abs(anchored.y-target.y)<4,'page-two pinch anchor stable');
    await touch('touchMove',[[1,target.x-65,target.y-40],[2,target.x+65,target.y-40]]);
    await page.waitForTimeout(100);const panned=await page.evaluate(t=>{const p=document.querySelector('.practice-page[data-page="1"]').getBoundingClientRect();return p.top+t.fy*p.height;},target);
    assert(Math.abs(panned-(target.y-40))<4,'two-finger constant-distance pan');await touch('touchEnd',[]);
    await capture('practice-pinch-mobile');
    await page.getByRole('button',{name:'↳ Tiếp tục theo bài',exact:true}).click();
    await page.getByRole('button',{name:'↳ Tiếp tục theo bài',exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'Nghe đoạn',exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('switch',{name:'Dùng pedal khi tập'}).isVisible(),true);
    assert.deepEqual(await page.evaluate(()=>[window.midiRequests,window.midiOpens]),[1,1]);
    check('Real multi-touch pinch + pan on page two, stable anchor; compact full-sheet retains Listen/Pedal/MIDI');
    assert.deepEqual(errors,[]);report.passed=true;
  }catch(error){report.passed=false;report.error=String(error.stack||error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
