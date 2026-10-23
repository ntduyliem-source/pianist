// Real MuseScore/FluidSynth PCM acceptance. Requires the packaged native build.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/audit-custom-2026-10-23/native-preview');
const url=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1#/library';
const skipGrade=process.argv.includes('--skip-grade');
const gradeOnly=process.argv.includes('--grade-only');
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
  const report={url,checks:[],pcm:[],errors:[],consoleErrors:[]};
  let releaseStartup=()=>{};
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  await context.addInitScript(()=>{
    window.previewMeters=[];
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(...args){const r=connect.apply(this,args);if(args[0]===this.context.destination&&!this.previewMeter){const m=this.previewMeter=this.context.createAnalyser();m.fftSize=2048;connect.call(this,m);window.previewMeters.push(m);}return r;};
    window.previewPeak=()=>Math.max(0,...window.previewMeters.map(m=>{if(m.context.state!=='running')return 0;const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));}));
  });
  const check=m=>{report.checks.push(m);console.log('PASS',m);};
  const top=n=>page.getByRole('group',{name:'Điều khiển tập luyện'}).getByRole('button',{name:n,exact:true});
  const peak=async(label,delay=150)=>{await page.waitForTimeout(delay);const value=await page.evaluate(()=>window.previewPeak());report.pcm.push({label,value});return value;};
  const silence=async label=>{await page.waitForFunction(()=>window.previewPeak()<1e-5,null,{timeout:10000});assert((await peak(label,150))<1e-5);};
  const midi=async(s,a,b,delay=0)=>page.evaluate(([s,a,b,delay])=>window.pianist.Module.driver.previewMidi(s,a,b,performance.now()+delay),[s,a,b,delay]);
  const settings=()=>top('Thiết lập').click(),closeSettings=()=>page.getByRole('button',{name:'Đóng thiết lập',exact:true}).click();
  const ready=async()=>{await page.getByTestId('practice-v2').waitFor({timeout:150000});await page.locator('svg.practice-system-svg').first().waitFor();};
  try{
    if(!skipGrade){
    await page.goto(url.replace(/#.*$/,'#/exercises'));await page.getByRole('combobox',{name:'Grade',exact:true}).waitFor();await page.getByRole('button',{name:'Bắt đầu tập theo grade',exact:true}).click();await ready();
    assert.equal(await page.evaluate(()=>!!window.pianist),false,'prepared grade must not need the main engine before playing');
    await settings();await page.getByRole('spinbutton',{name:'Đếm vào',exact:true}).fill('0');await page.getByRole('checkbox',{name:'Metronome',exact:true}).uncheck();await closeSettings();
    await page.getByRole('button',{name:'Đúng nốt',exact:true}).click();
    let arrived;const requested=new Promise(r=>{arrived=r;}),gate=new Promise(r=>{releaseStartup=r;});
    const engineUrl=new URL('MuseScoreStudio.wasm',url).href,hold=async route=>{arrived();await gate;await route.continue().catch(()=>{});};
    await page.route(engineUrl,hold);await top('Bắt đầu tập').click();let timer;try{await Promise.race([requested,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Cold grade did not request native engine')),30000);})]);}finally{clearTimeout(timer);}
    await top('Dừng lượt tập').click();releaseStartup();await page.unroute(engineUrl,hold);
    await page.waitForFunction(()=>document.querySelector('#save')?.disabled===false,null,{timeout:150000});await silence('cancelled cold grade startup');assert(await top('Bắt đầu tập').isEnabled());
    check('Stop during cold grade engine loading prevents late piano audio or a resumed scorer');
    await top('Bắt đầu tập').click();await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập',null,{timeout:150000});
    assert.equal(await page.evaluate(()=>typeof window.pianist.Module.driver.preparePreview),'function');await top('Dừng lượt tập').click();await silence('cold grade provider Stop');
    check('A prepared grade with no editor engine starts the real native piano provider and stops without late audio');
    if(gradeOnly){assert.deepEqual(report.errors,[]);report.passed=true;return;}
    await page.getByRole('button',{name:'Chọn grade và độ dài',exact:true}).click();await page.getByRole('button',{name:'Free play',exact:true}).click();await page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name:'Thư viện',exact:true}).click();
    }else await page.goto(url);
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:150000});await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:150000});
    await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await ready();
    await page.getByRole('button',{name:'Đúng nốt',exact:true}).click();
    await settings();await page.getByRole('spinbutton',{name:'Đếm vào',exact:true}).fill('0');await page.getByRole('checkbox',{name:'Metronome',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Hiện bàn phím hỗ trợ',exact:true}).check();await closeSettings();
    // Real UI start exercises the asynchronous engine/provider and font handshake.
    await top('Bắt đầu tập').click();await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập',null,{timeout:150000});
    const piano=page.getByRole('group',{name:'Piano 88 phím A0–C8'});assert.equal(await piano.getByRole('button').count(),88);
    const key=piano.getByRole('button',{name:'C4',exact:true}),box=await key.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height-5);await page.mouse.down();assert((await peak('UI C4 held'))>1e-5);await page.mouse.up();
    await page.keyboard.down('d');assert((await peak('UI E4 before Pause'))>1e-5);await top('Tạm dừng lượt tập').click();await silence('UI Pause');await page.keyboard.up('d');
    await top('Tiếp tục lượt tập').click();await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập');
    await page.keyboard.down('a');assert((await peak('UI C4 after Resume'))>1e-5);await page.keyboard.up('a');
    await top('Dừng lượt tập').click();await top('Bắt đầu tập').waitFor();await silence('UI Stop');
    check('Practice UI/provider loads MS Basic; virtual C4/E4 produce native PCM, Pause silences it, Resume works, and Stop silences it');

    await page.getByRole('button',{name:'Theo BPM',exact:true}).click();await settings();await page.getByRole('combobox',{name:'Tay tập',exact:true}).selectOption('right');await page.getByRole('checkbox',{name:'Phát tay còn lại khi tập BPM',exact:true}).check();await closeSettings();
    await top('Bắt đầu tập').click();await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập');assert((await peak('real UI left-hand accompaniment'))>1e-5);await top('Dừng lượt tập').click();await silence('UI accompaniment Stop');
    check('Real UI BPM accompaniment uses native PCM and Stop cancels it');

    await page.evaluate(async()=>{const d=window.pianist.Module.driver;await d.resume();await d.preparePreview();});
    for(const pitch of [21,60,108]){await midi(0x90,pitch,100);assert((await peak('88-key endpoint '+pitch,90))>1e-6);await page.evaluate(()=>window.pianist.Module.driver.stopPreview());await silence('Stop '+pitch);}
    check('A0, C4 and C8 all produce nonzero native PCM');
    // Compare identical native notes with and without sustain; no synthetic envelope.
    await midi(0x90,60,100);await page.waitForTimeout(150);await midi(0x80,60,0);const released=await peak('C4 released without pedal',650);
    await page.evaluate(()=>window.pianist.Module.driver.stopPreview());await silence('reset release');
    await midi(0xb0,64,127);await midi(0x90,60,100);await page.waitForTimeout(150);await midi(0x80,60,0);const sustained=await peak('C4 released with pedal down',650);
    assert(sustained>1e-5&&sustained>released*3,JSON.stringify({released,sustained}));await midi(0xb0,64,0);const pedalReleased=await peak('pedal lifted',1000);assert(pedalReleased<sustained/3,JSON.stringify({sustained,pedalReleased}));
    check('Native CC64 sustains a released key and lifting the pedal releases the voice');
    await midi(0xb0,64,127);await midi(0x90,60,100);await midi(0x9f,67,100,500);await page.waitForTimeout(100);await page.evaluate(()=>window.pianist.Module.driver.stopPreview());await silence('sustained and scheduled Stop');
    assert((await peak('after cancelled future accompaniment',700))<1e-5);
    check('Stop silences pedal-held notes and cancels a future channel-15 accompaniment event');

    // A score with a native arpeggio must never silently receive straight-chord BPM penalties.
    await page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name:'Thư viện',exact:true}).click();
    let xml=await fs.readFile(path.join(root,'tests/fixtures/pianist/m0/piano.musicxml'),'utf8');
    xml=xml.replace('<work-title>Bài thử Pianist M0</work-title>','<work-title>Arpeggio native policy test</work-title>').replace('<type>whole</type><staff>2</staff>','<type>whole</type><staff>2</staff><notations><arpeggiate/></notations>');
    await page.locator('#file').setInputFiles({name:'arpeggio-policy.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor();await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:150000});await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await ready();
    await settings();await page.getByRole('combobox',{name:'Tay tập',exact:true}).selectOption('both');await closeSettings();
    await page.getByRole('button',{name:'Theo BPM',exact:true}).click();await page.getByRole('alert').filter({hasText:'Chưa chấm BPM'}).waitFor();assert(await top('Bắt đầu tập').isDisabled());
    assert(await top('Nghe đoạn').isEnabled());await top('Nghe đoạn').click();await page.waitForFunction(()=>window.previewPeak()>1e-5,null,{timeout:150000});await top('Dừng nghe').click();await silence('unsupported passage native listen');
    await page.getByRole('button',{name:'Chuyển sang Đúng nốt',exact:true}).click();assert(await top('Bắt đầu tập').isEnabled());await top('Bắt đầu tập').click();await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập',null,{timeout:30000});await top('Dừng lượt tập').click();await silence('unsupported passage wait Stop');
    check('Native arpeggio BPM is visibly unavailable; the user can listen with MuseScore or practice Đúng nốt');
    assert.deepEqual(report.errors,[]);assert(!report.consoleErrors.some(e=>/RuntimeError|Aborted\(|TypeError|Assertion failed/.test(e)),JSON.stringify(report.consoleErrors));report.passed=true;
  }catch(error){report.passed=false;report.error=String(error.stack||error);report.visible=await page.locator('main').allTextContents().catch(()=>[]);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
  finally{releaseStartup();await fs.writeFile(path.join(out,gradeOnly?'grade-startup-report.json':skipGrade?'free-play-report.json':'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
