const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),channel=process.env.PIANIST_BROWSER_CHANNEL||'msedge',out=path.join(root,'artifacts/song-import',channel);
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const b=await chromium.launch({channel,headless:true,args:['--enable-unsafe-swiftshader']}),context=await b.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  // A passive branch from the native AudioWorklet proves actual sample output.
  // It neither generates tones nor replaces the MuseScore audio graph.
  await context.addInitScript(()=>{
    window.nativeMeters=[];const connect=AudioWorkletNode.prototype.connect;
    AudioWorkletNode.prototype.connect=function(...args){const result=connect.apply(this,args);if(args[0]===this.context.destination&&!this.pianistMeter){const meter=this.pianistMeter=this.context.createAnalyser();meter.fftSize=2048;connect.call(this,meter);window.nativeMeters.push(meter);}return result;};
    window.nativeAudioPeak=()=>Math.max(0,...window.nativeMeters.map(m=>{const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));}));
  });
  const p=await context.newPage(),errors=[],checks=[],result={browser:b.version(),checks,errors};
  p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const read=()=>p.evaluate(()=>{const a=window.pianist,old=a.Module.onEditorPlayback;let s;a.Module.onEditorPlayback=j=>s=JSON.parse(j);try{a.getEditorPlayback();return s;}finally{a.Module.onEditorPlayback=old;}});
  const semantics=()=>p.evaluate(()=>{const a=window.pianist,old=a.Module.onScoreSemantics;let s;a.Module.onScoreSemantics=j=>s=JSON.parse(j);try{if(!a.getScoreSemantics())throw Error('No score');return s;}finally{a.Module.onScoreSemantics=old;}});
  const waitState=async(status,min=0)=>{const until=Date.now()+30000;while(true){const s=await read();if(s.status===status&&s.positionSeconds>=min)return s;assert.ok(Date.now()<until,'playback state '+status);await p.waitForTimeout(50);}};
  const idle=()=>p.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  const historyCount=()=>p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('pianist-library');r.onsuccess=()=>{const db=r.result,q=db.transaction('sessions').objectStore('sessions').count();q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));
  try{
    const base=new URL(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html');base.searchParams.set('diagnostics','1');await p.goto(base.href);
    const catalog=JSON.parse(await fs.readFile(path.join(root,'scores/library/catalog.json'),'utf8'));
    const bundled=p.getByRole('region',{name:'Bài hát có sẵn'});await bundled.waitFor();assert.equal(await bundled.locator('article').count(),catalog.songs.length);
    // Use a real file-chooser gesture for cold-start audio permissions.
    const chooser=p.waitForEvent('filechooser');await p.getByRole('button',{name:'Nhập bản nhạc',exact:true}).click();await(await chooser).setFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    await idle();const controls=p.getByRole('region',{name:'Phát bản nhạc trong editor'});
    await controls.getByRole('button',{name:'Phát nhạc',exact:true}).waitFor();
    await p.waitForFunction(()=>!document.querySelector('.editor-playback button')?.disabled,null,{timeout:120000});
    const baseline=await semantics(),history=await historyCount();
    await controls.getByRole('button',{name:'Phát nhạc',exact:true}).click();await waitState('playing',.4);
    await p.waitForFunction(()=>window.nativeAudioPeak()>1e-6,null,{timeout:15000});result.nativeAudioPeak=await p.evaluate(()=>window.nativeAudioPeak());
    await p.screenshot({path:path.join(out,'editor-playing.png')});checks.push('cold first import plays real MS Basic AudioWorklet samples');
    await controls.getByRole('button',{name:'Tạm dừng phát nhạc',exact:true}).click();const paused=await waitState('paused');await p.waitForTimeout(300);assert.ok(Math.abs((await read()).positionSeconds-paused.positionSeconds)<.1);
    await controls.getByRole('button',{name:'Phát nhạc',exact:true}).click();await waitState('playing',paused.positionSeconds+.3);
    await controls.getByRole('button',{name:'Tạm dừng phát nhạc',exact:true}).click();await waitState('paused');
    const slider=controls.getByRole('slider',{name:'Vị trí phát nhạc'}),box=await slider.boundingBox();await slider.click({position:{x:box.width*.55,y:box.height/2}});await p.waitForTimeout(250);let s=await read();assert.ok(s.positionSeconds>s.durationSeconds*.3&&s.positionSeconds<s.durationSeconds*.8,'scrub reaches the middle of the score');await slider.press('Home');await p.waitForTimeout(250);assert.ok((await read()).positionSeconds<.2);
    await controls.getByRole('button',{name:'Dừng phát nhạc',exact:true}).click();await waitState('stopped');checks.push('pause/resume, native seek slider and stop work');
    await p.locator('#screen canvas').first().click({position:{x:600,y:500}});
    await p.keyboard.press('Space');await waitState('playing',.2);await p.keyboard.press('Space');await waitState('paused');checks.push('Space in the native editor toggles the transport once');
    // Exercise MuseScore's existing tempo multiplier directly: even when the
    // native editor changes it, the practice reference must use written tempo.
    await p.evaluate(()=>window.pianist.editorPlayback('tempo',.5));
    assert.equal((await read()).tempoMultiplier,.5);
    await p.getByRole('button',{name:'Tập bài này',exact:true}).click();await p.getByTestId('practice-v2').waitFor();await idle();
    const dl=p.waitForEvent('download');await p.locator('#snapshot').click();const snapshotFile=path.join(out,'practice-after-editor-speed.json');await(await dl).saveAs(snapshotFile);const snapshot=JSON.parse(await fs.readFile(snapshotFile,'utf8'));
    assert.ok(Math.abs(snapshot.durationMs-baseline.durationMs)<1e-6,'editor speed cannot alter practice timing');assert.equal(snapshot.baseQuarterBpm,baseline.baseQuarterBpm);
    assert.equal((await read()).status,'stopped');await p.getByRole('button',{name:'Editor',exact:true}).click();await idle();assert.equal((await read()).tempoMultiplier,.5);
    await p.evaluate(()=>window.pianist.editorPlayback('tempo',1));checks.push('native editor speed resets for practice snapshots and restores in editor');
    await p.locator('#select').click();await p.locator('#up').click();const edited=await semantics();assert.notDeepEqual(edited.anchors.map(n=>n.pitch).sort(),baseline.anchors.map(n=>n.pitch).sort());
    await p.getByRole('region',{name:'Phát bản nhạc trong editor'}).getByRole('button',{name:'Phát nhạc',exact:true}).click();await waitState('playing',.25);
    await p.getByRole('button',{name:'Thư viện',exact:true}).click();await waitState('stopped');assert.equal(await historyCount(),history);checks.push('edited revision plays; leaving editor stops audio and creates no practice history');
    await p.getByRole('searchbox',{name:'Tìm bản nhạc',exact:true}).fill('Tràn bộ nhớ');assert.equal(await p.getByRole('region',{name:'Bài hát có sẵn'}).locator('article').count(),1);
    await p.getByRole('button',{name:'Mở bài có sẵn Tràn bộ nhớ',exact:true}).click();await idle();assert.ok((await semantics()).anchors.length>0);
    await p.getByRole('button',{name:'Thư viện',exact:true}).click();
    const beforeCount=await p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('pianist-library');r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').count();q.onsuccess=()=>{resolve(q.result);db.close();};};}));
    await p.getByRole('button',{name:'Mở bài có sẵn Tràn bộ nhớ',exact:true}).click();await idle();
    const afterCount=await p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('pianist-library');r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').count();q.onsuccess=()=>{resolve(q.result);db.close();};};}));assert.equal(afterCount,beforeCount);
    await p.getByRole('button',{name:'Tập bài này',exact:true}).click();await p.getByTestId('practice-v2').waitFor();await idle();checks.push('bundled library search/open/reopen is durable and reuses the saved project; practice opens');
    assert.deepEqual(errors,[]);result.passed=true;result.libraryScores=catalog.songs.length;
  }catch(e){result.passed=false;result.error=String(e);process.exitCode=1;console.error(e);await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'playback-library.json'),JSON.stringify(result,null,2));await b.close();}console.log(result);
})();
