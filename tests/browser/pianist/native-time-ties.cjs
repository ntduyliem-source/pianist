// Regression for native fixed pauses and renderer-resolved tied-note sources.
// The musical fixtures are original MuseScore tests, never rewritten scores.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {zipSync,strToU8}=require('../../../apps/pianist-web/node_modules/fflate');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.env.PIANIST_QA_DIR||path.join(root,'artifacts/native-time-ties'));
const base=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html';
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const report={base,checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(String(e)));
 const check=message=>{report.checks.push(message);console.log('PASS',message);};
 try{
  await page.addInitScript(()=>{
   localStorage.setItem('pianist.sound','musescore');window.coldMeters=[];
   const connect=AudioNode.prototype.connect;
   AudioNode.prototype.connect=function(...args){const r=connect.apply(this,args);if(args[0]===this.context.destination&&!this.coldMeter){const m=this.coldMeter=this.context.createAnalyser();m.fftSize=2048;connect.call(this,m);window.coldMeters.push(m);}return r;};
   window.coldPeak=()=>Math.max(0,...window.coldMeters.map(m=>{const a=new Float32Array(m.fftSize);m.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));}));
  });
  await page.goto(base+'?diagnostics=1#/library');
  await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
  await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});
  await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  await page.getByRole('button',{name:'Phát nhạc',exact:true}).click();
  await page.getByRole('button',{name:'Tạm dừng phát nhạc',exact:true}).waitFor({timeout:90000});
  await page.waitForFunction(()=>window.coldPeak()>1e-5,null,{timeout:15000});
  check('Cold editor first click produces native MS Basic PCM without switching songs');
  await page.getByRole('button',{name:'Dừng phát nhạc',exact:true}).click();
  await page.evaluate(()=>{window.nativeAuditRead=(method,callback)=>{const api=window.pianist,old=api.Module[callback];let result;
   api.Module[callback]=json=>result=JSON.parse(json);try{if(!api[method]())throw Error(method+' failed');return result;}finally{api.Module[callback]=old;}};});
  async function load(relative){
   const xml=await fs.readFile(path.join(root,relative));
   const bytes=relative.endsWith('.mscx')?zipSync({'score.mscx':new Uint8Array(xml),
    'META-INF/container.xml':strToU8('<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.mscx"/></rootfiles></container>')}):new Uint8Array(xml);
   const filename=relative.endsWith('.mscx')?'native-fixture.mscz':path.basename(relative);
   await page.evaluate(({bytes,filename})=>{const a=window.pianist;a.setPracticeActive(false);a.loadScoreData(new Uint8Array(bytes),filename);},{bytes:[...bytes],filename});
   await page.waitForFunction(()=>window.nativeAuditRead('getEditorPlayback','onEditorPlayback').available,null,{timeout:90000});
   return page.evaluate(()=>{const a=window.pianist;a.setPracticeActive(true);const snapshot=window.nativeAuditRead('getPracticeSnapshot','onPracticeSnapshot');
    if(!a.practicePlayback('range',0,snapshot.durationMs/1000))throw Error('range failed');
    return {snapshot,notes:window.nativeAuditRead('getPracticePlaybackNotes','onPracticePlaybackNotes')};});
  }
  const pause=await load('src/engraving/tests/playback/playbackeventsrenderer_data/pauses/pauses.mscx');
  assert.equal(pause.snapshot.durationMs,26000);
  const last=pause.notes.events.at(-1);assert.equal(last.atMs,24000);
  report.pauses={baseline:pause.notes,tempos:[]};
  for(const [speed,lastMs,endMs] of [[.5,34000,38000],[2,19000,20000]]){
   const data=await page.evaluate(speed=>{const a=window.pianist;if(!a.practicePlayback('tempo',speed))throw Error('tempo failed');
    return {state:window.nativeAuditRead('getPracticePlayback','onPracticePlayback'),notes:window.nativeAuditRead('getPracticePlaybackNotes','onPracticePlaybackNotes')};},speed);
   const final=data.notes.events.find(n=>n.anchors.includes(last.anchors[0]));assert.equal(final.atMs,lastMs);
   assert(Math.abs(data.state.rangeEndSeconds*1000-endMs)<.01,'native endpoint must include fixed pauses exactly once');
   assert(data.state.rangeEndSeconds*1000>final.endMs,'last note is not cut off');
   const point=data.notes.timeMap.find(p=>Math.abs(p.referenceMs-24000)<.001);assert(point);assert.equal(point.playbackMs,lastMs);
   assert(data.notes.timeMap.every((p,i,all)=>!i||(p.referenceMs>=all[i-1].referenceMs&&p.playbackMs>=all[i-1].playbackMs)));
   await page.evaluate(()=>{if(!window.pianist.practicePlayback('seek',24))throw Error('seek failed');});
   await page.waitForFunction(target=>Math.abs(window.nativeAuditRead('getPracticePlayback','onPracticePlayback').positionSeconds*1000-target)<5,lastMs,{timeout:15000});
   report.pauses.tempos.push({speed,...data});
  }
  const range=await page.evaluate(()=>{const a=window.pianist;
   if(!a.practicePlayback('range',2,10)||!a.practicePlayback('tempo',2)||!a.practicePlayback('loop',1))throw Error('A–B setup failed');
   if(!a.practicePlayback('seek',3.5))throw Error('pause seek failed');
   return window.nativeAuditRead('getPracticePlayback','onPracticePlayback');});
  assert.equal(range.rangeStartSeconds,1);assert.equal(range.rangeEndSeconds,8);
  await page.waitForFunction(()=>Math.abs(window.nativeAuditRead('getPracticePlayback','onPracticePlayback').positionSeconds-2.25)<.005,null,{timeout:15000});
  report.pauses.abRange=range;
  check('50% and 200% preserve fixed pauses, A–B endpoints and seek using native tempo breakpoints');
  const partial=await load('src/engraving/tests/playback/playbackeventsrenderer_data/partial_tie.mscx');
  const crossing=partial.notes.events.find(n=>Math.abs(n.atMs-5500)<.01);assert(crossing);
  const incoming=crossing.spans.find(s=>s.anchor.startsWith('m0-')&&s.occurrence===3);assert(incoming,'native partial-tie repeat target is retained');
  assert.equal(incoming.atMs,6000);assert(incoming.endMs>7900);report.partialTie=crossing;
  check('Partial tie follows the actual native repeat destination, not the linear tieFor chain');
  const tinh=await load('scores/library/songs/tinh-don-phuong-xin-yao-rang-ni-ting-jian-cover-by-vu-le.mxl');
  const tie=tinh.notes.events.find(n=>n.anchors.includes('m1-t1320-v0-n0'));assert(tie);
  const first=tie.spans.find(s=>s.anchor==='m1-t1320-v0-n0'),next=tie.spans.find(s=>s.anchor==='m1-t1440-v0-n0');assert(first&&next);
  assert.equal(first.atMs,2750);assert.equal(first.endMs,3000);assert.equal(next.atMs,3000);
  assert(!tie.spans.some(s=>s.anchor===next.anchor&&s.atMs<=2760),'continuation cannot highlight240ms early');report.tinhTie=tie;
  check('Tình đơn phương measure 2 exports separate tied-source spans at 2750/3000 ms');
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.passed=false;report.error=String(error.stack);process.exitCode=1;console.error(report.error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,out}));
})();
