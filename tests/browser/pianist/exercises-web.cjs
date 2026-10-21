// Real prepared MXL, native renderer/audio and unchanged scoring Worker.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/exercises-web');
const url=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1#/exercises';
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await context.addInitScript(()=>{
    window.exerciseLoads=[];window.exerciseReplies=[];window.audioMeters=[];
    const W=window.Worker;window.Worker=class extends W{postMessage(d,...rest){if(d?.type==='load'&&d.timeline){window.exerciseLoads.push(d.timeline);this.addEventListener('message',({data})=>{if(data.view)window.exerciseReplies.push({type:data.type,view:data.view});});}return super.postMessage(d,...rest);}};
    const connect=AudioWorkletNode.prototype.connect;AudioWorkletNode.prototype.connect=function(...args){const r=connect.apply(this,args);if(args[0]===this.context.destination&&!this.testMeter){const m=this.testMeter=this.context.createAnalyser();connect.call(this,m);window.audioMeters.push(m);}return r;};
    window.audioPeak=()=>Math.max(0,...window.audioMeters.map(m=>{const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));}));
  });
  const ready=async()=>{
    await Promise.race([page.getByTestId('practice-v2').waitFor({timeout:150000}),page.locator('.exercise-error').waitFor({timeout:150000}).then(async()=>{throw Error(await page.locator('.exercise-error').innerText());})]);
    await page.waitForFunction(()=>!document.querySelector('[aria-label="Bài tập kế tiếp"]').disabled||document.querySelector('.exercise-current').textContent.includes('/1'),null,{timeout:60000});
  };
  const semantics=()=>page.evaluate(()=>{const a=window.pianist,old=a.Module.onScoreSemantics;let s;a.Module.onScoreSemantics=j=>s=JSON.parse(j);try{if(!a.getScoreSemantics())throw Error('No native semantics');return s;}finally{a.Module.onScoreSemantics=old;}});
  const libraryCounts=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('pianist-library');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['projects','sessions']),result={};for(const name of ['projects','sessions']){const r=tx.objectStore(name).count();r.onsuccess=()=>{result[name]=r.result;};}tx.oncomplete=()=>{db.close();resolve(result);};};}));
  const capture=async(name)=>{await page.screenshot({path:path.join(out,name+'.png')});const geometry=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth,controls:[...document.querySelectorAll('.v2-transport button,.exercise-session-bar button,.appbar nav button')].filter(n=>n.checkVisibility()).map(n=>({label:n.ariaLabel||n.textContent,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}))}));assert(geometry.body<=geometry.width+1,JSON.stringify(geometry));for(const b of geometry.controls)assert(b.left>=-1&&b.right<=geometry.width+1,JSON.stringify(b));};
  try{
    await page.goto(url);await page.addStyleTag({content:'#diagnostics{display:none!important}'});
    await page.waitForFunction(()=>!document.querySelector('.exercise-launch button')?.disabled,null,{timeout:30000});
    assert.equal(new URL(page.url()).hash,'#/exercises');
    // A real editor document remains intact after the exercise audio loan.
    await page.getByRole('button',{name:'Thư viện',exact:true}).first().click();
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:150000});
    await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:150000});
    const editorBefore=await semantics();
    const countsBefore=await libraryCounts();
    await page.getByRole('button',{name:'Bài tập',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.exercise-launch button')?.disabled);
    await capture('chooser-desktop');
    await page.getByRole('button',{name:'Grade 1',exact:true}).click();
    await page.getByRole('button',{name:/Khoảng 100 nốt/}).click();
    await page.waitForFunction(()=>document.querySelector('.exercise-launch strong')?.textContent.startsWith('0 bài'));
    assert(await page.getByRole('button',{name:'Mở bài tập →'}).isDisabled());
    await page.getByRole('group',{name:'Độ dài bài tập'}).getByRole('button',{name:/Khoảng 4 nốt/}).click();
    await page.waitForFunction(()=>!document.querySelector('.exercise-launch button').disabled);
    checks.push('Deep link, 56 options and empty choice correctly disabled');
    await page.getByRole('button',{name:'Mở bài tập →'}).click();await ready();
    const initial=await page.locator('.exercise-current').getAttribute('data-exercise-id');
    for(const [width,height] of [[1440,1000],[360,800],[390,844],[844,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(100);await capture('sheet-'+width+'x'+height);}
    assert(await page.locator('.practice-system').count()>0);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();
    await page.getByRole('switch',{name:'Dùng pedal khi tập'}).click();
    assert.equal(await page.getByRole('switch',{name:'Dùng pedal khi tập'}).getAttribute('aria-checked'),'false');
    await capture('full-sheet');
    await page.getByRole('button',{name:'Nghe đoạn',exact:true}).click();
    await page.waitForFunction(()=>window.audioPeak()>1e-6,null,{timeout:150000});
    await page.waitForFunction(()=>document.querySelector('.note-marker.playback'),null,{timeout:30000});
    checks.push('Native MuseScore audio has real output, playback note ink and full-sheet pedal controls');
    await page.getByRole('button',{name:'Tạm dừng nghe',exact:true}).click();
    await page.getByRole('button',{name:'Thiết lập',exact:true}).click();
    await page.getByRole('button',{name:'MIDI mô phỏng trường độ + pedal',exact:true}).click();
    await page.waitForFunction(first=>document.querySelector('.exercise-current')?.getAttribute('data-exercise-id')!==first,initial,{timeout:45000});
    const second=await page.locator('.exercise-current').getAttribute('data-exercise-id');assert.notEqual(initial,second);
    assert(await page.locator('.sheet-focus').count());
    await page.waitForFunction(()=>window.exerciseLoads.length>=2);
    const replies=await page.evaluate(()=>window.exerciseReplies);assert(replies.some(r=>r.view.judgements?.some(j=>j.grade==='perfect')));
    const first=await page.evaluate(()=>window.exerciseLoads[0]);assert(first.targets.length>=3&&first.targets.length<=5);
    await page.waitForFunction(()=>document.querySelector('.note-marker.hit'),null,{timeout:12000});
    await page.getByRole('button',{name:'Chọn bài tập khác',exact:true}).click();
    await page.getByRole('button',{name:'Mở bài tập →'}).waitFor();
    checks.push('Real MIDI simulation reaches unchanged Worker, scores Perfect, advances without repeating and preserves full-sheet mode');
    await page.getByRole('button',{name:'Editor',exact:true}).click();
    const editorAfter=await semantics();
    for(const key of ['performed','keyReleases','pedals','durationMs'])assert.deepEqual(editorAfter[key],editorBefore[key],key+' preserved');
    await page.getByRole('button',{name:'Bài tập',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.exercise-launch button')?.disabled);
    checks.push('Returning from exercise playback restores the actual editor notes, native releases, pedal and duration');
    await capture('chooser-mobile');
    // Wait mode uses actual virtual-key pointer packets, not fabricated judgements.
    await page.getByRole('combobox',{name:'Tay bài tập',exact:true}).selectOption('right');
    await page.getByRole('combobox',{name:'Chế độ bài tập',exact:true}).selectOption('wait');
    await page.getByRole('button',{name:'Mở bài tập →'}).click();await ready();
    const waitId=await page.locator('.exercise-current').getAttribute('data-exercise-id');
    await page.getByRole('button',{name:'⌃ Mở bàn phím',exact:true}).click();
    const priorLoads=await page.evaluate(()=>window.exerciseLoads.length);
    await page.getByRole('button',{name:'Bắt đầu tập',exact:true}).click();
    await page.waitForFunction(n=>window.exerciseLoads.length>n,priorLoads);
    await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập');
    const waitTimeline=await page.evaluate(()=>window.exerciseLoads.at(-1));
    for(const group of waitTimeline.groups){
      for(const id of group.ids){const pitch=waitTimeline.targets.find(t=>t.id===id).pitch,name=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch%12]+(Math.floor(pitch/12)-1);await page.getByRole('button',{name,exact:true}).click();}
      await page.waitForTimeout(100);
    }
    await page.waitForFunction(id=>document.querySelector('.exercise-current')?.getAttribute('data-exercise-id')!==id,waitId,{timeout:10000});
    await page.getByRole('button',{name:'Chọn bài tập khác',exact:true}).click();
    await page.getByRole('button',{name:'Mở bài tập →'}).waitFor();
    checks.push('Wait mode accepts real virtual-key packets and automatically selects the next exercise');
    await page.getByRole('combobox',{name:'Tay bài tập',exact:true}).selectOption('both');
    await page.getByRole('button',{name:'Grade 5',exact:true}).click();
    await page.getByRole('group',{name:'Độ dài bài tập'}).getByRole('button',{name:/Khoảng 6 nốt/}).click();
    await page.waitForFunction(()=>!document.querySelector('.exercise-launch button').disabled);
    await page.getByRole('button',{name:'Mở bài tập →'}).click();await ready();
    assert((await page.locator('.exercise-current').innerText()).includes('Hai tay'));
    await capture('grand-staff');
    await page.getByRole('button',{name:'Bắt đầu tập',exact:true}).click();
    await page.waitForFunction(()=>window.exerciseLoads.at(-1)?.settings.hand==='both');
    const roles=await page.evaluate(()=>window.exerciseLoads.at(-1).settings.roles);
    assert(Object.values(roles).includes('left')&&Object.values(roles).includes('right'));
    await page.getByRole('button',{name:'Chọn bài tập khác',exact:true}).click();
    await page.getByRole('button',{name:'Mở bài tập →'}).waitFor();
    checks.push('G5 two-hand excerpt renders both staves and grades both staff routes');
    // Import original K5 ZIP, then reload: whole bank is device-local and durable.
    if(!process.env.PIANIST_SKIP_IMPORT){
      await page.getByLabel('Nhập kho K5 ZIP').setInputFiles(path.join(root,'artifacts/curriculum-bank/reading-mxl-v1-be09d10ff801b28a.zip'));
      await page.waitForFunction(()=>document.querySelector('.exercise-bank-tools').textContent.includes('đã nhập trên thiết bị'),null,{timeout:120000});
      assert((await page.locator('.exercise-total').innerText()).includes('5.460'));
      await page.reload();await page.waitForFunction(()=>document.querySelector('.exercise-total')?.textContent.includes('5.460'));
      assert((await page.locator('.exercise-bank-tools').textContent()).includes('đã nhập trên thiết bị'));
      checks.push('Original 5,460-MXL K5 ZIP imports atomically and survives reload without library pollution');
    }
    assert.deepEqual(await libraryCounts(),countsBefore,'exercise import and attempts do not pollute the personal library');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,browser:browser.version(),checks,errors},null,2));
    console.log(JSON.stringify({checks,errors}));
  }catch(e){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.error('VISIBLE',await page.locator('main').innerText().catch(()=>''));throw e;}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
