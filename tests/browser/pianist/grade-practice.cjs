// Real MuseScore sheets/audio and unchanged scorer Worker. No fake judgements.
// Run after packaging the grade bank and frontend. --native-audit also checks
// one actual rendered/scored exercise from each of the 56 grade/length groups.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/grade-practice');
const url=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1#/exercises';
const audit=process.argv.includes('--native-audit'),routeGuard=process.argv.includes('--route-guard'),lengths=[4,6,10,20,30,50,100];
const reportFile=path.join(out,routeGuard?'route-guard-report.json':'report.json');
const noteName=p=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][p%12]+(Math.floor(p/12)-1);

(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
  const report={url,browser:browser.version(),checks:[],errors:[],requests:[],nativeAudit:[]};let releasePending=()=>{};
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  page.on('request',r=>{if(/\/[^/]+\/(?:manifest\.json|index\.json|.*\.mxl)(?:\?|$)/.test(r.url()))report.requests.push(r.url());});
  await context.addInitScript(()=>{
    addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='#diagnostics{display:none!important}';document.head.appendChild(style);});
    window.gradeLoads=[];window.gradeReplies=[];window.gradeRenders=[];window.gradeMeters=[];
    const OriginalWorker=window.Worker;
    window.Worker=class extends OriginalWorker{
      constructor(...args){super(...args);this.addEventListener('message',({data})=>{
        if(data?.view)window.gradeReplies.push({generation:data.generation,type:data.type,view:data.view});
        if(data?.type==='result'&&data.result?.snapshot)window.gradeRenders.push(data.result);
      });}
      postMessage(data,...rest){if(data?.type==='load'&&data.timeline)window.gradeLoads.push({generation:data.generation,timeline:data.timeline});return super.postMessage(data,...rest);}
    };
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(...args){const result=connect.apply(this,args);if(args[0]===this.context.destination&&!this.gradeMeter){const m=this.gradeMeter=this.context.createAnalyser();m.fftSize=2048;connect.call(this,m);window.gradeMeters.push(m);}return result;};
    window.gradeAudioPeak=()=>Math.max(0,...window.gradeMeters.map(m=>{const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));}));
  });
  const nav=name=>page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name,exact:true});
  const free=()=>page.getByRole('group',{name:'Cách tập piano'}).getByRole('button',{name:/^Free play/});
  const grade=()=>page.getByRole('group',{name:'Cách tập piano'}).getByRole('button',{name:/^Theo grade/});
  const start=()=>page.getByRole('button',{name:'Bắt đầu tập theo grade',exact:true});
  const progress=()=>page.getByTestId('grade-progress');
  const library=()=>page.getByRole('region',{name:'Bài hát có sẵn'});
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  const count=()=>page.getByTestId('grade-count');
  const check=message=>{report.checks.push(message);console.log('PASS',message);};
  const choiceReady=async()=>{await page.getByRole('combobox',{name:'Grade',exact:true}).waitFor({timeout:30000});await start().waitFor();await page.waitForFunction(()=>{const e=document.querySelector('[data-testid="grade-count"]');return e&&/\d/.test(e.textContent);});};
  const countIs=async n=>{await page.waitForFunction(n=>{const e=document.querySelector('[data-testid="grade-count"]');return e&&Number(e.textContent.match(/[\d.,]+/)?.[0].replace(/[.,]/g,''))===n;},n);};
  const chooseLengths=async values=>{for(const n of lengths)await page.getByRole('checkbox',{name:`Khoảng ${n} nốt`,exact:true}).setChecked(values.includes(n));await countIs(values.length*100);};
  const chooseGrade=async value=>{await page.getByRole('combobox',{name:'Grade',exact:true}).selectOption(String(value));await choiceReady();};
  const ready=async()=>{
    await page.getByTestId('practice-v2').waitFor({timeout:180000});await progress().waitFor();
    await page.locator('svg.practice-system-svg').first().waitFor({timeout:60000});
    await page.getByRole('button',{name:'Bài kế tiếp',exact:true}).waitFor();
    await page.waitForFunction(()=>{const e=document.querySelector('[aria-label="Bài kế tiếp"]');return e&&!e.disabled;},null,{timeout:120000});
    assert.equal(await page.locator('.v2-alert').count(),0,'practice must not hide a native or catalog mismatch');
  };
  const current=async()=>({id:await progress().getAttribute('data-exercise-id'),scoreId:await progress().getAttribute('data-score-id'),round:Number(await progress().getAttribute('data-round')),position:Number(await progress().getAttribute('data-position'))});
  const next=async()=>{const before=await current();await page.getByRole('button',{name:'Bài kế tiếp',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid="grade-progress"]')?.getAttribute('data-exercise-id')!==id,before.id,{timeout:60000});await ready();return current();};
  const returnChooser=async()=>{await page.getByRole('button',{name:'Chọn grade và độ dài',exact:true}).click();await choiceReady();await idle();};
  const settings=async()=>{await page.getByRole('button',{name:'Thiết lập',exact:true}).click();await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Thiết lập luyện tập',exact:true})}).waitFor();};
  const closeSettings=()=>page.getByRole('button',{name:'Đóng thiết lập',exact:true}).click();
  const startTimeline=async()=>{
    const n=await page.evaluate(()=>window.gradeLoads.length);await page.getByRole('button',{name:'Bắt đầu tập',exact:true}).click();
    await page.waitForFunction(n=>window.gradeLoads.length>n,n,{timeout:30000});return page.evaluate(()=>window.gradeLoads.at(-1));
  };
  const visibleNote=kind=>page.waitForFunction(kind=>[...document.querySelectorAll('.note-marker.'+kind)].some(n=>{const r=n.getBoundingClientRect();return getComputedStyle(n).display!=='none'&&r.width>0&&r.height>0;}),kind,{timeout:10000});
  const rendered=async id=>page.evaluate(id=>{
    const r=window.gradeRenders.findLast(r=>r.sourceHash===id);if(!r)throw Error('No actual renderer result for '+id);
    const s=r.snapshot,ids=new Set(s.pages.flatMap(p=>[...p.svg.matchAll(/data-practice-notes="([^"]+)"/g)].flatMap(m=>m[1].split(' '))));
    return {sourceHash:r.sourceHash,staves:s.staves.length,staffNotes:s.staves.map(st=>s.anchors.filter(a=>a.staff===st.id&&a.play).length),notes:s.anchors.length,performed:s.performed.length,missingGlyphs:s.anchors.filter(a=>a.visible&&!ids.has(a.id.replace(/^m\d+-/,''))).length,baseQuarterBpm:s.baseQuarterBpm,meters:s.measures.map(m=>[m.numerator,m.denominator]),tieContinuations:s.anchors.filter(a=>a.tieBack).length};
  },id);
  const assertSheet=async()=>{
    const c=await current(),r=await rendered(c.id);assert.equal(r.staves,2);assert(r.staffNotes.every(n=>n>0),'both staves need real notes');assert.equal(r.missingGlyphs,0);return r;
  };
  const capture=async name=>{
    await page.addStyleTag({content:'#diagnostics{display:none!important}'});
    const geometry=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth,controls:[...document.querySelectorAll('.v2-transport button,.exercise-session-bar button,.appbar nav button,.practice-kind button')].filter(n=>n.checkVisibility()).map(n=>({label:n.ariaLabel||n.textContent,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}))}));
    assert(geometry.body<=geometry.width+1,JSON.stringify(geometry));for(const c of geometry.controls)assert(c.left>=-1&&c.right<=geometry.width+1,JSON.stringify(c));
    await page.screenshot({path:path.join(out,name+'.png')});
  };
  const libraryCounts=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('pianist-library');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['projects','sessions']),result={};for(const name of ['projects','sessions']){const r=tx.objectStore(name).count();r.onsuccess=()=>{result[name]=r.result;};}tx.oncomplete=()=>{db.close();resolve(result);};};}));
  const editorSemantics=()=>page.evaluate(()=>{const a=window.pianist,old=a.Module.onScoreSemantics;let s;a.Module.onScoreSemantics=j=>s=JSON.parse(j);try{if(!a.getScoreSemantics())throw Error('No editor semantics');return s;}finally{a.Module.onScoreSemantics=old;}});
  const json=async target=>{const r=await context.request.get(target);assert(r.ok(),target+' HTTP '+r.status());return r.json();};
  const bankBase=new URL('curriculum/',url);let manifest,bankIndex,releaseBase;
  const rowCache=new Map(),rows=async(g,n)=>{
    const key=g+':'+n;if(rowCache.has(key))return rowCache.get(key);
    const option=bankIndex.options.find(o=>o.grade===g&&o.lengthBucket==='n'+n);assert(option,key+' available');
    const result=await json(new URL(option.path,releaseBase).href);assert.equal(result.entries.length,100);
    rowCache.set(key,result.entries);return result.entries;
  };
  const assertTargets=(load,row)=>{
    const t=load.timeline;assert.equal(t.targets.length,row.targetCount,row.scoreId+' target count');
    assert.equal(t.targets.filter(n=>n.roles.includes('right')).length,row.countRight,row.scoreId+' right targets');
    assert.equal(t.targets.filter(n=>n.roles.includes('left')).length,row.countLeft,row.scoreId+' left targets');
    assert.equal(t.settings.beatQuarter,row.beatQuarter[0],row.scoreId+' beat unit');
  };

  try{
    manifest=await json(new URL('manifest.json',bankBase).href);bankIndex=await json(new URL(manifest.index.path,bankBase).href);releaseBase=new URL(manifest.releaseId+'/',bankBase);
    assert.equal(bankIndex.total,5600);assert.equal(bankIndex.options.length,56);assert(bankIndex.options.every(o=>o.count===100));
    await page.goto(url);await page.addStyleTag({content:'#diagnostics{display:none!important}'});await choiceReady();
    assert.equal(new URL(page.url()).hash,'#/practice');assert.equal(await grade().getAttribute('aria-pressed'),'true');
    if(routeGuard){
      const preservesSession=async(load,kind)=>{
        const before=await page.evaluate(()=>window.gradeLoads.length);
        await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập',null,{timeout:15000});
        await page.evaluate(()=>{location.hash='#/exercises';});await page.waitForURL(u=>u.hash==='#/practice');await page.waitForTimeout(400);
        assert.equal(await page.getByTestId('practice-v2').count(),1);assert.equal(await page.locator('.v2-status').innerText(),'Đang tập');
        const after=await page.evaluate(g=>({loads:window.gradeLoads.length,generation:window.gradeLoads.at(-1).generation,closed:window.gradeReplies.some(r=>r.generation===g&&r.type==='closed'),kind:localStorage.getItem('pianist.practice-kind')}),load.generation);
        assert.equal(after.loads,before);assert.equal(after.generation,load.generation);assert.equal(after.closed,false);assert.equal(after.kind,kind);
      };
      await page.getByRole('combobox',{name:'Chế độ tập theo grade',exact:true}).selectOption('wait');await start().click();await ready();
      const c=await current(),gradeLoad=await startTimeline();await preservesSession(gradeLoad,'grade');assert.equal((await current()).id,c.id);
      check('active grade session survives legacy #/exercises navigation with identical sheet/scorer generation and canonical #/practice URL');
      await returnChooser();await free().click();await nav('Thư viện').click();
      await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
      await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
      await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await page.getByTestId('practice-v2').waitFor({timeout:120000});await idle();
      await page.getByRole('button',{name:'Đúng nốt',exact:true}).click();const freeLoad=await startTimeline();await preservesSession(freeLoad,'free');
      assert.equal(await progress().count(),0);assert.match(await page.locator('.toast').innerText(),/Kết thúc lượt trước khi chuyển sang tập theo grade/);
      check('active free-play session rejects legacy grade navigation, preserves scorer/mode and explains why');
      assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,checks:report.checks.length,report:reportFile}));return;
    }
    assert.deepEqual(await page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button').allTextContents(),['Thư viện','Editor','Tập piano']);
    assert.equal(await page.getByRole('combobox',{name:'Grade',exact:true}).locator('option').count(),8);
    assert.equal(await page.getByRole('checkbox',{name:/^Khoảng \d+ nốt$/}).count(),7);
    await countIs(100);await chooseLengths(lengths);await countIs(700);await chooseLengths([]);assert(await start().isDisabled());
    await chooseLengths([4,6]);await page.getByRole('checkbox',{name:'Random',exact:true}).uncheck();await countIs(200);
    check('legacy exercises URL redirects to Theo grade; only three main tabs; multi-checkbox counts 100/200/700 and empty choice disabled');
    for(const [w,h] of [[360,800],[390,844],[1440,1000]]){await page.setViewportSize({width:w,height:h});await capture('chooser-'+w);}
    await page.reload();await choiceReady();await countIs(200);assert(!(await page.getByRole('checkbox',{name:'Random',exact:true}).isChecked()));
    assert(await page.getByRole('checkbox',{name:'Khoảng 4 nốt',exact:true}).isChecked());assert(await page.getByRole('checkbox',{name:'Khoảng 6 nốt',exact:true}).isChecked());
    check('grade, multi-length and random preference survive reload; chooser fits 360/390/1440px');

    // A user library/editor document must survive grade sessions and audio loans.
    await free().click();await library().waitFor();
    const flySelect=page.getByRole('combobox',{name:'Chọn phiên bản Fly Me to the Moon',exact:true}),versions=await flySelect.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
    assert.equal(versions.length,2);await flySelect.selectOption(versions[1]);
    await nav('Thư viện').click();await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
    const editorBefore=await editorSemantics(),countsBefore=await libraryCounts();
    await nav('Tập piano').click();await free().click();await library().waitFor();assert.equal(await flySelect.inputValue(),versions[1]);
    await grade().click();await choiceReady();

    // Hold a real first-score fetch. Cancel must invalidate the run, including
    // a response that arrives after the user has switched back to Free play.
    const firstRows=await rows(1,4),blockedRow=[...firstRows].sort((a,b)=>a.bookPosition-b.bookPosition)[0];
    const blockedUrl=new URL(blockedRow.path,releaseBase).href;let releaseBlocked,markBlocked;
    const blockedGate=new Promise(resolve=>{releaseBlocked=resolve;releasePending=resolve;}),blockedRequest=new Promise(resolve=>{markBlocked=resolve;});
    const block=async route=>{markBlocked();await blockedGate;await route.continue().catch(()=>{});};
    await page.route(blockedUrl,block);await start().click();
    let blockedTimeout;try{await Promise.race([blockedRequest,new Promise((_,reject)=>{blockedTimeout=setTimeout(()=>reject(Error('First MXL fetch did not reach loading-cancel fixture')),30000);})]);}finally{clearTimeout(blockedTimeout);}
    await page.getByRole('button',{name:'Hủy chuẩn bị',exact:true}).click();await choiceReady();await free().click();await library().waitFor();
    releaseBlocked();await page.unroute(blockedUrl,block);await page.waitForTimeout(700);
    assert.equal(await page.getByTestId('practice-v2').count(),0);assert.equal(await free().getAttribute('aria-pressed'),'true');
    assert.deepEqual(await libraryCounts(),countsBefore);await grade().click();await choiceReady();
    check('cancelling an in-flight native sheet fetch leaves Free play intact and ignores stale work');

    let releaseNav,markNav;const navGate=new Promise(resolve=>{releaseNav=resolve;releasePending=resolve;}),navRequest=new Promise(resolve=>{markNav=resolve;});
    const blockNav=async route=>{markNav();await navGate;await route.continue().catch(()=>{});};
    await page.route(blockedUrl,blockNav);await start().click();
    let navTimeout;try{await Promise.race([navRequest,new Promise((_,reject)=>{navTimeout=setTimeout(()=>reject(Error('Navbar-cancel MXL fetch did not arrive')),30000);})]);}finally{clearTimeout(navTimeout);}
    await nav('Tập piano').click();await choiceReady();releaseNav();await page.unroute(blockedUrl,blockNav);await page.waitForTimeout(700);
    assert.equal(await page.getByTestId('practice-v2').count(),0);await countIs(200);
    check('Tập piano navbar cancels first-sheet loading and returns to the unchanged grade choices');

    // Ordered mode keeps book order inside each length and alternates lengths.
    await page.getByRole('combobox',{name:'Chế độ tập theo grade',exact:true}).selectOption('wait');
    await start().click();await ready();const ordered=[await current()];await assertSheet();
    ordered.push(await next());ordered.push(await next());ordered.push(await next());
    assert.deepEqual(ordered.map(e=>e.scoreId.match(/-n(\d+)-/)[1]),['4','6','4','6']);
    assert.equal(new Set(ordered.map(e=>e.id)).size,4);assert.deepEqual(ordered.map(e=>e.position),[1,2,3,4]);
    const n4=(await rows(1,4)).sort((a,b)=>a.bookPosition-b.bookPosition),n6=(await rows(1,6)).sort((a,b)=>a.bookPosition-b.bookPosition);
    assert.deepEqual(ordered.map(e=>e.id),[n4[0].id,n6[0].id,n4[1].id,n6[1].id]);
    report.ordered=ordered;check('ordered queue alternates selected lengths, four distinct actual two-staff sheets');
    await returnChooser();

    // Runtime hand selection filters judgement targets but never removes staff.
    await chooseLengths([4]);await page.getByRole('combobox',{name:'Tay tập theo grade',exact:true}).selectOption('both');
    await start().click();await ready();const waitFirst=await current();await assertSheet();
    await settings();await page.getByRole('combobox',{name:'Tay tập',exact:true}).selectOption('right');await closeSettings();
    await page.getByRole('button',{name:'⌃ Mở bàn phím',exact:true}).click();
    const waitLoad=await startTimeline();assert.equal(waitLoad.timeline.settings.hand,'right');
    assert.equal(waitLoad.timeline.targets.length,n4[0].countRight);
    assert(waitLoad.timeline.targets.every(t=>t.roles.includes('right')));assert.equal((await assertSheet()).staves,2);
    await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập',null,{timeout:15000});
    let firstHit=false;
    for(const group of waitLoad.timeline.groups){
      for(const id of group.ids){const pitch=waitLoad.timeline.targets.find(t=>t.id===id).pitch;await page.getByRole('button',{name:noteName(pitch),exact:true}).click();}
      if(!firstHit){await visibleNote('hit');await capture('wait-note-highlight');firstHit=true;}
      await page.waitForTimeout(120);
    }
    await page.waitForFunction(id=>document.querySelector('[data-testid="grade-progress"]')?.getAttribute('data-exercise-id')!==id,waitFirst.id,{timeout:15000});await ready();
    const waitReplies=await page.evaluate(g=>window.gradeReplies.filter(r=>r.generation===g),waitLoad.generation);
    assert(waitReplies.some(r=>r.view.judgements.some(j=>j.grade==='perfect')));assert(waitReplies.some(r=>r.type==='closed'));
    check('wait mode uses actual virtual-key MIDI, highlights native notes and advances; one-hand grading retains both staves');
    await returnChooser();

    await chooseLengths([6]);await page.getByRole('combobox',{name:'Chế độ tập theo grade',exact:true}).selectOption('bpm');
    await page.getByRole('combobox',{name:'Tay tập theo grade',exact:true}).selectOption('both');
    await page.getByRole('checkbox',{name:'Random',exact:true}).check();await start().click();await ready();
    const bpmFirst=await current();await assertSheet();await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();
    await page.getByRole('switch',{name:'Dùng pedal khi tập'}).click();assert.equal(await page.getByRole('switch',{name:'Dùng pedal khi tập'}).getAttribute('aria-checked'),'false');
    await page.getByRole('button',{name:'Nghe đoạn',exact:true}).click();await page.waitForFunction(()=>window.gradeAudioPeak()>1e-6,null,{timeout:150000});
    report.audioPeak=await page.evaluate(()=>window.gradeAudioPeak());await visibleNote('playback');await capture('full-sheet-playback-390');
    await page.getByRole('button',{name:'Tạm dừng nghe',exact:true}).click();await settings();
    const loadsBefore=await page.evaluate(()=>window.gradeLoads.length);await page.getByRole('button',{name:'MIDI mô phỏng trường độ + pedal',exact:true}).click();
    await page.waitForFunction(n=>window.gradeLoads.length>n,loadsBefore);const bpmLoad=await page.evaluate(()=>window.gradeLoads.at(-1));
    assert.equal(bpmLoad.timeline.settings.hand,'both');assert.equal(bpmLoad.timeline.settings.pedalEnabled,false);
    assertTargets(bpmLoad,n6.find(e=>e.id===bpmFirst.id));
    await page.waitForFunction(id=>document.querySelector('[data-testid="grade-progress"]')?.getAttribute('data-exercise-id')!==id,bpmFirst.id,{timeout:45000});await ready();
    assert.equal(await page.locator('.practice-v2.sheet-focus').count(),1);
    const bpmReplies=await page.evaluate(g=>window.gradeReplies.filter(r=>r.generation===g),bpmLoad.generation);
    assert(bpmReplies.some(r=>r.view.judgements.some(j=>j.grade==='perfect')));assert(bpmReplies.some(r=>r.type==='closed'));
    check('full-sheet real MuseScore playback produces audio and native highlight; pedal toggle persists into BPM simulation and next sheet');

    // The 700ms result display is cancellable user time, not a committed next.
    const pauseSheet=await current();await page.waitForFunction(id=>window.gradeLoads.at(-1)?.timeline.fingerprint===id,pauseSheet.id,{timeout:10000});
    const pauseGeneration=await page.evaluate(()=>window.gradeLoads.at(-1).generation);
    await page.waitForFunction(g=>window.gradeReplies.some(r=>r.generation===g&&r.type==='closed'),pauseGeneration,{timeout:45000});
    await page.getByRole('checkbox',{name:'Tự chuyển',exact:true}).uncheck();await page.waitForTimeout(1100);
    assert.equal((await current()).id,pauseSheet.id,'unchecking auto in result pause cancels advance');
    await page.getByRole('checkbox',{name:'Tự chuyển',exact:true}).check();await settings();
    const retryBefore=await page.evaluate(()=>window.gradeLoads.length);await page.getByRole('button',{name:'MIDI mô phỏng trường độ + pedal',exact:true}).click();
    await page.waitForFunction(n=>window.gradeLoads.length>n,retryBefore);const retryGeneration=await page.evaluate(()=>window.gradeLoads.at(-1).generation);
    await page.waitForFunction(g=>window.gradeReplies.some(r=>r.generation===g&&r.type==='closed'),retryGeneration,{timeout:45000});
    await startTimeline();await page.waitForTimeout(1100);
    assert.equal((await current()).id,pauseSheet.id,'starting another attempt invalidates old delayed auto advance');
    check('auto-advance delay respects disabling Tự chuyển and cannot replace a new attempt started during result display');
    await returnChooser();

    await nav('Editor').click();await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor();await idle();
    const editorAfter=await editorSemantics();for(const key of ['performed','keyReleases','pedals','durationMs'])assert.deepEqual(editorAfter[key],editorBefore[key],key+' preserved');
    assert.deepEqual(await libraryCounts(),countsBefore,'grade sessions must not add library projects or personal song sessions');
    await nav('Tập piano').click();await free().click();await library().waitFor();assert.equal(await flySelect.inputValue(),versions[1]);
    await grade().click();await choiceReady();
    check('switching grade/free play preserves selected song versions, editor musical content and personal library counts');

    if(audit){
      await page.setViewportSize({width:1440,height:1000});await page.getByRole('checkbox',{name:'Random',exact:true}).uncheck();
      await page.getByRole('combobox',{name:'Chế độ tập theo grade',exact:true}).selectOption('wait');
      await page.getByRole('combobox',{name:'Tay tập theo grade',exact:true}).selectOption('both');
      for(let g=1;g<=8;g++)for(const length of lengths){
        await chooseGrade(g);await chooseLengths([length]);await start().click();await ready();
        const c=await current(),s=await assertSheet(),load=await startTimeline();
        assert.equal(load.timeline.settings.hand,'both');assert(load.timeline.targets.some(t=>t.roles.includes('right')));assert(load.timeline.targets.some(t=>t.roles.includes('left')));
        const row=(await rows(g,length)).find(e=>e.id===c.id);assertTargets(load,row);
        report.nativeAudit.push({...c,grade:g,length,...s,targets:load.timeline.targets.length,beatQuarter:load.timeline.settings.beatQuarter,bpm:load.timeline.settings.bpm});
        await returnChooser();console.log('NATIVE',g,length,c.scoreId,load.timeline.targets.length);
        await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
      }
      assert.equal(report.nativeAudit.length,56);check('all 56 grade/length combinations render real grand staff with glyph mapping and targets for both hands');
      report.profileAudit=[];
      for(const [g,expected] of [[5,['offset','dyad']],[7,['dotted','tie','sync','compound']],[8,['ledger-high','ledger-low','dyad-dotted','dyad-tie']]]){
        await chooseGrade(g);await chooseLengths([4]);await start().click();await ready();
        const byId=new Map((await rows(g,4)).map(e=>[e.id,e])),seen=new Set();
        for(let i=0;i<8&&expected.some(p=>!seen.has(p));i++){
          const c=await current(),row=byId.get(c.id),s=await assertSheet(),load=await startTimeline();assertTargets(load,row);
          const profile=row.profiles.find(p=>expected.includes(p));assert(profile,'catalog profile '+JSON.stringify(row.profiles));seen.add(profile);
          if(profile.includes('tie'))assert(s.tieContinuations>0,'native preserves tied continuation');
          if(profile.includes('dyad'))assert(load.timeline.groups.some(group=>{
            const targets=group.ids.map(id=>load.timeline.targets.find(t=>t.id===id));return ['left','right'].some(hand=>targets.filter(t=>t.roles.includes(hand)).length>=2);
          }),'actual same-hand chord targets preserved');
          if(profile==='compound'){
            assert(s.meters.every(([n,d])=>n===6&&d===8));assert.equal(s.baseQuarterBpm,90);assert.equal(load.timeline.settings.beatQuarter,1.5);assert.equal(load.timeline.settings.bpm,60);
            assert.equal(load.timeline.visits[0].endMs-load.timeline.visits[0].startMs,2000,'two dotted-quarter beats per 6/8 bar at 60');
            assert.equal(load.timeline.clicks[1].atMs-load.timeline.clicks[0].atMs,1000,'compound metronome ticks once per dotted quarter');
          }
          report.profileAudit.push({...c,grade:g,profile,...s,targets:load.timeline.targets.length,beatQuarter:load.timeline.settings.beatQuarter});
          if(expected.some(p=>!seen.has(p)))await next();
        }
        assert(expected.every(p=>seen.has(p)),'all relevant profiles '+g);await returnChooser();
      }
      check('native G5/G7/G8 profiles retain dyads, tied continuations, syncopation, ledger registers and 6/8 dotted-quarter timing');
    }
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.passed=false;report.error=String(error.stack||error);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});report.visible=await page.locator('main').allTextContents().catch(()=>[]);}
  finally{releasePending();await fs.writeFile(reportFile,JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,nativeGroups:report.nativeAudit.length,profiles:report.profileAudit?.length??0,audioPeak:report.audioPeak,errors:report.errors,error:report.error,report:reportFile},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
