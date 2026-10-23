// Real bundled arrangements: grouped cards, selected bytes, persistence and mobile.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/library-versions');
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const catalog=JSON.parse(await fs.readFile(path.join(root,'scores/library/catalog.json'),'utf8'));
  const groupId=s=>s.workId||s.id,version=s=>s.version||1;
  const fly=catalog.songs.filter(s=>s.title==='Fly Me to the Moon').sort((a,b)=>version(a)-version(b));
  const cause=catalog.songs.filter(s=>s.title==='Cause I Love You').sort((a,b)=>version(a)-version(b));
  assert.equal(fly.length,2);assert.equal(cause.length,2);
  const browser=await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  await context.addInitScript(()=>{
    window.nativeMeters=[];const connect=AudioWorkletNode.prototype.connect;
    AudioWorkletNode.prototype.connect=function(...args){const result=connect.apply(this,args);if(args[0]===this.context.destination&&!this.pianistMeter){const meter=this.pianistMeter=this.context.createAnalyser();meter.fftSize=2048;connect.call(this,meter);window.nativeMeters.push(meter);}return result;};
    window.nativeAudioPeak=()=>Math.max(0,...window.nativeMeters.map(m=>{const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));}));
  });
  const report={errors:[],checks:[],requests:[]};page.on('pageerror',e=>report.errors.push(String(e)));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  page.on('request',r=>{if(r.url().includes('/library/songs/'))report.requests.push(r.url());});
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  const library=()=>page.getByRole('region',{name:'Bài hát có sẵn'});
  const card=id=>library().locator(`[data-work-id="${id}"]`);
  const projects=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('pianist-library');r.onerror=()=>reject(r.error);r.onsuccess=()=>{
      const db=r.result,q=db.transaction('projects').objectStore('projects').getAll();q.onerror=()=>reject(q.error);
      q.onsuccess=async()=>{try{resolve(await Promise.all(q.result.map(async p=>({id:p.id,title:p.title,sourceName:p.sourceName,sha:p.source?[...new Uint8Array(await crypto.subtle.digest('SHA-256',p.source))].map(v=>v.toString(16).padStart(2,'0')).join(''):undefined}))));}catch(e){reject(e);}finally{db.close();}};
    };
  }));
  const editor=async()=>{await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();await page.waitForFunction(()=>!document.querySelector('.editor-playback button')?.disabled,null,{timeout:120000});};
  const snapshot=()=>page.evaluate(()=>{
    const a=window.pianist,old=a.Module.onPracticeSnapshot;let s;a.Module.onPracticeSnapshot=j=>s=JSON.parse(j);
    try{if(!a.getPracticeSnapshot())throw Error('Missing native snapshot');return {notes:s.anchors.length,pitches:s.anchors.map(n=>n.pitch),pages:s.pages.length};}finally{a.Module.onPracticeSnapshot=old;}
  });
  const back=async()=>{await page.getByRole('button',{name:'Thư viện',exact:true}).click();await library().waitFor();};
  try{
    await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1#/library');
    await library().waitFor();const workCount=new Set(catalog.songs.map(groupId)).size;
    assert.equal(await library().locator('article').count(),workCount);
    assert.equal(await card(groupId(fly[0])).count(),1);assert.equal(await card(groupId(cause[0])).count(),1);
    const works=new Map();for(const song of catalog.songs){const id=groupId(song);works.set(id,[...(works.get(id)||[]),song]);}
    const multiple=[...works].filter(([,songs])=>songs.length>1);
    assert.equal(await library().getByRole('combobox').count(),multiple.length);
    for(const [id,songs] of multiple){
      assert.equal(await card(id).count(),1);
      assert.deepEqual((await card(id).getByRole('combobox').locator('option').evaluateAll(options=>options.map(o=>o.value))).sort(),songs.map(s=>s.id).sort());
    }
    const awake=catalog.songs.filter(s=>s.title==='Thức giấc').sort((a,b)=>version(a)-version(b));
    if(awake.length){
      assert.equal(awake.length,2);const select=card(groupId(awake[0])).getByRole('combobox');
      await select.selectOption(awake[0].id);assert.equal(await card(groupId(awake[0])).getByRole('button',{name:'Tập',exact:true}).isEnabled(),awake[0].practiceReady!==false);
      await select.selectOption(awake[1].id);assert.equal(await card(groupId(awake[0])).getByRole('button',{name:'Tập',exact:true}).isEnabled(),awake[1].practiceReady!==false);
      report.checks.push('Thức giấc editions share one dropdown and retain their individual practice eligibility');
    }
    assert.equal(await library().getByRole('heading',{name:'Lemon Tree',exact:true}).count(),1);
    for(const title of ['Ai đưa em về — Tia','Ai đưa em về — Nguyễn Ánh 9'])assert.equal(await library().getByRole('heading',{name:title,exact:true}).count(),1);
    const flySelect=()=>library().getByRole('combobox',{name:'Chọn phiên bản Fly Me to the Moon',exact:true});
    const causeSelect=()=>library().getByRole('combobox',{name:'Chọn phiên bản Cause I Love You',exact:true});
    assert.equal(await flySelect().inputValue(),fly[0].id);assert.equal(await causeSelect().inputValue(),cause[0].id);
    report.checks.push('one card per work, separate same-name compositions, no dropdown for a single version');
    for(const [width,height] of [[360,800],[390,844],[1440,1000]]){
      await page.setViewportSize({width,height});await flySelect().scrollIntoViewIfNeeded();
      // Library v2's compact edition selector is 36px (the old card was 40px).
      const box=await flySelect().boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.ok(box.height>=36);
      const sizes=await page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth,content:document.querySelector('.library-content').scrollWidth,width:document.querySelector('.library-content').clientWidth}));
      assert.ok(sizes.body<=sizes.viewport+1);assert.ok(sizes.content<=sizes.width+1);
      await page.screenshot({path:path.join(out,`dropdown-${width}.png`)});
    }
    report.checks.push('dropdowns and cards fit 360px, 390px and desktop without horizontal overflow');
    await flySelect().selectOption(fly[1].id);assert.ok(await card(groupId(fly[0])).getByRole('button',{name:'Tập',exact:true}).isDisabled());
    assert.match(await card(groupId(fly[0])).innerText(),/23 nốt hoa mỹ/);
    await card(groupId(fly[0])).getByRole('button',{name:'Chỉnh sửa',exact:true}).click();await editor();
    let saved=await projects();assert.equal(saved.length,1);assert.equal(saved[0].sha,fly[1].sha256);assert.match(saved[0].title,/v2/);const secondProject=saved[0].id;
    assert.equal((await snapshot()).notes,778);
    const roundtrip=await page.evaluate(()=>{
      const a=window.pianist,old=a.Module.onXmlExported;let bytes;a.Module.onXmlExported=data=>bytes=new Uint8Array(data);
      try{if(!a.exportScore('musicxml'))throw Error('No native XML');}finally{a.Module.onXmlExported=old;}
      const xml=new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml'),notes=[...xml.querySelectorAll('note')].filter(n=>n.querySelector('pitch'));
      return {notes:notes.length,grace:notes.filter(n=>n.querySelector('grace')).length};
    });assert.deepEqual(roundtrip,{notes:801,grace:23});
    const transport=page.getByRole('region',{name:'Phát bản nhạc trong editor'});
    await transport.getByRole('button',{name:'Phát nhạc',exact:true}).click();await page.waitForFunction(()=>window.nativeAudioPeak()>1e-6,null,{timeout:20000});
    report.audioPeak=await page.evaluate(()=>window.nativeAudioPeak());await transport.getByRole('button',{name:'Dừng phát nhạc',exact:true}).click();
    await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await page.locator('.error-banner').filter({hasText:'nốt hoa mỹ'}).waitFor();
    await page.locator('.error-banner button').first().click();
    report.checks.push('Version 2 opens its exact source bytes, preserves all 801 notes in editor and plays real audio; unsupported practice is explained');
    await back();assert.equal(await flySelect().inputValue(),fly[1].id);await flySelect().selectOption(fly[0].id);
    await card(groupId(fly[0])).getByRole('button',{name:'Tập',exact:true}).click();
    await page.getByTestId('practice-v2').waitFor({timeout:120000});await idle();await page.locator('svg.practice-system-svg').first().waitFor();
    assert.equal((await snapshot()).notes,317);saved=await projects();assert.equal(saved.length,2);
    const firstProject=saved.find(p=>p.sha===fly[0].sha256);assert.ok(firstProject&&firstProject.id!==secondProject);
    await back();await flySelect().selectOption(fly[1].id);
    await card(groupId(fly[0])).getByRole('button',{name:'Chỉnh sửa',exact:true}).click();await editor();saved=await projects();assert.equal(saved.length,2);
    assert.equal(saved.find(p=>p.sha===fly[1].sha256).id,secondProject);assert.equal(saved.find(p=>p.sha===fly[0].sha256).id,firstProject.id);
    report.checks.push('Version 1 practice uses its own 317-note score; reopening either version preserves distinct saved projects');
    await back();await causeSelect().selectOption(cause[1].id);await page.reload();await library().waitFor();
    assert.equal(await flySelect().inputValue(),fly[1].id);assert.equal(await causeSelect().inputValue(),cause[1].id);
    await page.getByRole('button',{name:'Tập piano',exact:true}).click();await library().waitFor();
    assert.equal(await flySelect().inputValue(),fly[1].id);assert.equal(await causeSelect().inputValue(),cause[1].id);
    assert.equal(await library().locator('article').count(),workCount);
    report.checks.push('independent per-work selection survives navigation, reload and the practice picker');
    assert.ok(report.requests.some(url=>url.endsWith('/'+fly[1].url)));assert.ok(report.requests.some(url=>url.endsWith('/'+fly[0].url)));
    assert.deepEqual(report.errors,[]);report.passed=true;report.works=workCount;report.versions=catalog.songs.length;
  }catch(error){report.passed=false;report.error=String(error.stack||error);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(report);
})().catch(error=>{console.error(error);process.exitCode=1;});
