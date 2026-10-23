// Native MuseScore/FluidSynth regression: no musical scheduling or judgement
// mocks. Observe the same device-output frame used by the practice UI.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),base=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html';
const out=path.resolve(process.env.PIANIST_QA_DIR||path.join(root,'artifacts/playback-sync-fixed'));
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:960},serviceWorkers:'block'}),page=await context.newPage();
 const report={base,checks:[],errors:[],measurements:{}};
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('dialog',d=>d.dismiss());
 const check=s=>{report.checks.push(s);console.log('PASS',s);};
 const read=()=>page.evaluate(()=>window.syncRead('onPracticePlayback','getPracticePlayback'));
 const notes=()=>page.evaluate(()=>window.syncRead('onPracticePlaybackNotes','getPracticePlaybackNotes'));
 const playing=()=>page.waitForFunction(()=>window.syncFrame?.status===2&&!window.syncRead('onPracticePlayback','getPracticePlayback').preparing,null,{timeout:30000});
 const play=async()=>{await page.getByRole('button',{name:'Nghe đoạn',exact:true}).click();await playing();};
 const stop=()=>page.getByRole('button',{name:'Dừng nghe',exact:true}).click();
 const record=()=>page.evaluate(()=>{window.syncSamples=[];window.syncRecording=true;});
 const collect=()=>page.evaluate(()=>{window.syncRecording=false;return window.syncSamples;});
 const field=async(name,value)=>{const f=page.getByRole('spinbutton',{name,exact:true});await f.fill(String(value));await f.press('Tab');};
 async function load(name){
  const url=new URL(base);url.hash='/library';url.searchParams.set('diagnostics','1');await page.goto(url.href);
  await page.locator('#file').setInputFiles(path.join(root,'scores/library/songs',name));
  await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  await page.waitForFunction(()=>!document.querySelector('.editor-playback button')?.disabled,null,{timeout:120000});
  await page.evaluate(()=>{
   window.syncRead=(cb,method)=>{const a=window.pianist,old=a.Module[cb];let result;a.Module[cb]=j=>result=JSON.parse(j);try{assertNative(a[method]());return result;}finally{a.Module[cb]=old;}function assertNative(ok){if(!ok)throw Error(method+' failed');}};
   window.syncSamples=[];window.syncRecording=false;window.syncFrame=null;
   const clockChange=window.pianist.Module.onPracticeClock;
   window.pianist.Module.onPracticeClock=json=>{window.syncFrame=null;clockChange(json);};
   const d=window.pianist.Module.driver,read=d.playbackFrame.bind(d);
   d.playbackFrame=epoch=>{const frame=read(epoch);window.syncFrame=frame;return frame;};
   const sample=()=>{if(window.syncRecording){const slider=document.querySelector('[aria-label="Vị trí nghe"]');window.syncSamples.push({perf:performance.now(),ui:slider?Number(slider.value):null,
     state:window.syncRead('onPracticePlayback','getPracticePlayback'),frame:window.syncFrame,measure:Number(document.querySelector('[data-testid="score-playhead"]')?.dataset.measure),
     markers:[...document.querySelectorAll('.note-marker.playback')].filter(n=>!n.getAttribute('data-note-anchors')?.includes(' ')).map(n=>({anchor:n.getAttribute('data-anchor'),part:n.getAttribute('data-native-part')}))});}requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  const semantics=await page.evaluate(()=>window.syncRead('onScoreSemantics','getScoreSemantics'));
  await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await page.getByTestId('practice-v2').waitFor();return semantics;
 }
 try{
  const merry=await load('merry-go-round-of-life-easy-piano-excerpt.mxl');
  await record();await play();await page.waitForTimeout(1000);let samples=await collect();
  assert(samples.some(s=>s.frame?.status===2&&s.markers.length),'native playback actually highlights notes');
  assert(!samples.some(s=>!s.frame&&s.markers.length),'no highlight before a device-output frame');
  report.measurements.start=samples;check('First highlight waits for the native PCM block at output');
  await page.getByRole('slider',{name:'Vị trí nghe',exact:true}).fill('5000');await page.waitForTimeout(250);
  for(const speed of ['0.5','2','1']){
   const before=Number(await page.getByRole('slider',{name:'Vị trí nghe',exact:true}).inputValue());await record();
   await page.getByRole('combobox',{name:'Tốc độ nghe',exact:true}).selectOption(speed);await page.waitForTimeout(450);samples=await collect();
   const positions=samples.filter(s=>s.ui!==null).map(s=>s.ui);
   assert(Math.min(...positions)>=before-100,`speed ${speed} cannot jump backwards: ${before} -> ${Math.min(...positions)}`);
   assert(Math.max(...positions)<=before+1400,`speed ${speed} cannot jump to another passage`);
   report.measurements['speed-'+speed]={before,samples};
  }
  check('100% → 50% → 200% → 100% keeps the same passage with no old-position/new-tempo jump');
  await record();await page.getByRole('slider',{name:'Vị trí nghe',exact:true}).fill('23000');await page.waitForTimeout(500);samples=await collect();
  assert(samples.some(s=>s.ui>=23000&&s.ui<24000));
  const aligned=samples.filter(s=>s.frame?.status===2&&s.ui>=23000).map(s=>Math.abs(s.ui-s.frame.positionSeconds*s.frame.tempoMultiplier*1000));
  assert(Math.max(...aligned)<80,'UI seek follows the output clock');report.measurements.seek=samples;
  await stop();await page.getByRole('button',{name:'Thiết lập',exact:true}).click();await field('Từ ô nhịp',6);await field('Đến ô nhịp',8);await page.getByRole('button',{name:'Xong',exact:true}).click();
  await record();await play();await page.getByRole('button',{name:'Lặp khi nghe',exact:true}).click();await page.waitForTimeout(10000);samples=await collect();
  const a=merry.occurrences.find(o=>o.measure===5).startMs,b=merry.occurrences.find(o=>o.measure===7).endMs;
  const audible=samples.filter(s=>s.ui!==null&&s.frame?.status===2&&s.frame.epoch===s.state.clockEpoch);
  assert(audible.every(s=>s.ui>=Math.floor(a)-2&&s.ui<=Math.ceil(b)+2));
  const wraps=audible.filter((s,i,all)=>i>0&&s.ui<all[i-1].ui-1000);assert(wraps.length>=2,'native A–B loops twice');
  assert(wraps.every(s=>s.measure===5));report.measurements.ab={a,b,wraps};check('A–B 6–8 wraps twice to the correct passage using the audio clock');
  await stop();
  await load('ai-dua-em-ve-take-me-back-home-tia-feat-le-thien-hieu-low-cortisol-song.mxl');
  await record();await play();const firstNotes=await notes();await page.waitForTimeout(500);samples=await collect();
  const chord=firstNotes.events.filter(n=>n.anchors.some(a=>/^m0-t0-v0-n\d+$/.test(a))).sort((a,b)=>a.atMs-b.atMs);
  assert.equal(chord.length,3);assert(chord[0].atMs<chord[1].atMs&&chord[1].atMs<chord[2].atMs,'native MPE contains staggered attacks');
  for(const note of chord){
   const first=samples.find(s=>s.markers.some(m=>m.anchor===note.anchors[0]));assert(first,`highlight ${note.anchors[0]}`);
   assert(first.frame&&first.frame.positionSeconds*1000>=note.atMs-4,'cannot highlight before MPE attack');
  }
  report.measurements.arpeggio={notes:chord,samples};check('Ai đưa em về highlights each arpeggio note at its own original MPE attack');
  await page.getByRole('button',{name:'Tạm dừng nghe',exact:true}).click();await page.getByRole('combobox',{name:'Tốc độ nghe',exact:true}).selectOption('0.5');
  const slowNotes=await notes();const slowChord=slowNotes.events.filter(n=>n.anchors.some(a=>/^m0-t0-v0-n\d+$/.test(a))).sort((a,b)=>a.atMs-b.atMs);
  assert.equal(slowChord.length,3);assert.equal(slowChord[1].atMs-slowChord[0].atMs,chord[1].atMs-chord[0].atMs,'MuseScore keeps its arpeggio offset; do not scale an old event list');
  report.measurements.slowArpeggio=slowChord;check('50% tempo reloads native MPE events, preserving MuseScore arpeggio timing');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();
  await page.getByRole('button',{name:'Tiếp tục nghe',exact:true}).click();await playing();
  assert(await page.getByRole('switch',{name:'Dùng pedal khi tập'}).isVisible());assert(await page.getByRole('button',{name:'Dừng nghe',exact:true}).isVisible());
  // A vertical SVG line has a zero-width bounding box, so Playwright's
  // isVisible() reports false even while its stroke is painted on screen.
  await page.waitForFunction(()=>{const line=document.querySelector('[data-testid="score-playhead"]');if(!line)return false;const r=line.getBoundingClientRect(),s=getComputedStyle(line);return r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top<innerHeight&&r.bottom>0&&s.visibility==='visible'&&parseFloat(s.strokeWidth)>0;});
  await page.screenshot({path:path.join(out,'mobile-fullsheet.png')});
  await stop();await page.waitForTimeout(200);assert.equal(await page.locator('.note-marker.playback').count(),0);
  check('390px full sheet retains cursor, listening, pedal and Stop; Stop clears playback highlight');
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(e){report.passed=false;report.error=String(e.stack);process.exitCode=1;console.error(report.error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,out}));
})();
