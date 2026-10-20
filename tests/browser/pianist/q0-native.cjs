// Run after the optimized native build. Evidence is written even if a gate fails.
const {chromium} = require('playwright');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url'), {createHash} = require('node:crypto'), os = require('node:os');
const {unzipSync,zipSync,strToU8} = require('../../../apps/pianist-web/node_modules/fflate');
const root = path.resolve(__dirname, '../../..'), out = path.join(root, 'artifacts/q0');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const summarize = values => {
  if (!values.length) return {n: 0};
  const v = [...values].sort((a,b) => a-b), at = p => v[Math.ceil(v.length*p)-1];
  return {n: v.length, min: v[0], p50: at(.5), p95: at(.95), max: v.at(-1)};
};
const music = s => {
  const sorted = a => [...a].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {notes: sorted(s.anchors.map(n=>[n.id,n.pitch,n.tick,n.durationTicks,n.staff,n.voice,n.tieBack||null])),
    performed: sorted(s.performed), keyReleases: sorted(s.keyReleases), beats: s.beats,
    pedals: sorted(s.pedals.map(p=>({...p,partId:undefined}))), durationMs: s.durationMs};
};
const entries = bytes => Object.fromEntries(Object.entries(unzipSync(new Uint8Array(bytes))).map(([name,data])=>[name,hash(data)]));
// Original synthetic fixtures for the renderer limits, not curriculum content.
const limitFixture = count => {
  const measures=Array.from({length:count/4},(_,m)=>`<measure number="${m+1}">${m===0?
    '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':''}
    ${['C','D','E','F'].map(step=>`<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>`).join('')}</measure>`).join('');
  return Buffer.from(zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>'),
    'score.musicxml':strToU8(`<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Q0 test ${count} notes</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`)
  },{mtime:new Date(2026,0,1)}));
};
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const release=JSON.parse(await fs.readFile(path.join(root,'build.artifacts/release.json'),'utf8'));
  for(const name of ['MuseScoreStudio.js','MuseScoreStudio.wasm']){
    const entry=release.files.find(f=>f.path===name),bytes=await fs.readFile(path.join(root,'build.artifacts',name));
    assert.equal(hash(bytes),entry?.sha256,'Repackage build.artifacts with package-web.py before running native QA');
  }
  const {build} = await import(pathToFileURL(require.resolve('vite',{paths:[path.join(root,'apps/pianist-web')]})).href);
  await build({configFile:false,base:'./',define:{'process.env.NODE_ENV':JSON.stringify('production')},
    build:{outDir:path.join(root,'build.artifacts/q0-lab'),emptyOutDir:true,
      lib:{entry:path.join(__dirname,'q0-lab.ts'),formats:['es'],fileName:()=> 'q0-lab.js'}},worker:{format:'es'}});
  const channel=process.env.PIANIST_BROWSER_CHANNEL||'msedge';
  const browser = await chromium.launch({channel,headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const report={browser:browser.version(),channel,cpu:os.cpus()[0]?.model,cores:os.cpus().length,
    memoryGiB:os.totalmem()/1024**3,checks:[],fixtures:[],benchmarks:[],errors:[]};
  const consoleTail=[];
  page.on('console',m=>{consoleTail.push(m.text());if(consoleTail.length>40)consoleTail.shift();});
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const check = text => {report.checks.push(text); console.log(text);};
  const save = () => fs.writeFile(path.join(out,'native-report.json'),JSON.stringify(report,null,2));
  const open=async file=>{
    await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(n=>document.querySelector('#status')?.textContent==='Đã mở '+n+'.'||
      !!document.querySelector('.error-banner:not(.import-notice)'),path.basename(file),{timeout:180000});
    await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
    if(await page.locator('.error-banner:not(.import-notice)').count())throw Error(await page.locator('.error-banner:not(.import-notice)').innerText());
  };
  const native = method => page.evaluate(method=>{
    const b=window.q0Lab.bridge();
    if(method==='bytes')return [...b.serialize()];
    return method==='semantics'?b.semantics():b.snapshot();
  },method);
  try {
    await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1');
    const live=path.join(root,'tests/fixtures/pianist/m0/piano.musicxml');
    await open(live);
    console.log('Native engine ready; checking temporary projects');
    await page.addScriptTag({type:'module',url:'/q0-lab/q0-lab.js'});
    await page.waitForFunction(()=>window.q0Lab);
    // Native audio can finish initialization after open; settle its metadata first.
    await page.waitForTimeout(1500);
    const original=await native('semantics');
    await page.locator('#select').click();await page.locator('#up').click();
    const edited=await native('semantics');assert.notDeepEqual(music(original),music(edited));
    const beforeBytes=await native('bytes'), beforeDirty=await page.locator('#screen').getAttribute('data-modified');
    const files=['docs/curriculum/starter-scores/K001.mxl','docs/curriculum/starter-scores/K008.mxl','docs/curriculum/starter-scores/K012.mxl',
      'tests/fixtures/pianist/practice/tempo-repeat-tie.musicxml','tests/fixtures/pianist/practice/pedal-duration.musicxml',
      'tests/fixtures/pianist/practice/same-staff-voices.musicxml'];
    const inputs=await Promise.all(files.map(async file=>({name:path.basename(file),file,bytes:[...await fs.readFile(path.join(root,file))]})));
    for(const count of [4,16,64]){
      const file=`artifacts/q0/test-${count}.mxl`,bytes=limitFixture(count);
      await fs.writeFile(path.join(root,file),bytes);inputs.push({name:path.basename(file),file,bytes:[...bytes],expectedTargets:count});
    }
    const temporary=[];
    for(const input of inputs){
      const sample=await page.evaluate(i=>window.q0Lab.prepared(i),input);temporary.push(sample.snapshot);
      if(input.expectedTargets)assert.equal(sample.counts.targets,input.expectedTargets);
      report.fixtures.push({file:input.file,sha256:hash(Buffer.from(input.bytes)),counts:sample.counts,
        anchors:sample.snapshot.anchors.length,pages:sample.snapshot.pages.length,glyphs:sample.glyphs,coldMs:sample.elapsedMs});
    }
    const legacy=await page.evaluate(input=>{
      const b=window.q0Lab.bridge(),bytes=new Uint8Array(input.bytes),mscz=b.prepare(bytes,input.name);
      return {bytes:mscz.length,semantics:b.semantics(bytes,input.name),saved:b.preparedSnapshot(mscz,'roundtrip.mscz')};
    },inputs[0]);
    assert(legacy.bytes>0);
    assert.deepEqual(music(legacy.semantics),music(temporary[0]));
    assert.deepEqual(music(legacy.saved),music(temporary[0]));
    check('Existing temporary MSCZ preparation and ABC semantics API still match native musical data');
    const failure=await page.evaluate(()=>{
      const b=window.q0Lab.bridge(),old=()=>{},a=window.pianist;a.Module.onPreparedSnapshot=old;
      let rejected=false;try{b.preparedSnapshot(new TextEncoder().encode('<invalid/>'),'bad.musicxml');}catch{rejected=true;}
      const restored=a.Module.onPreparedSnapshot===old;delete a.Module.onPreparedSnapshot;return {rejected,restored};
    });
    assert.deepEqual(failure,{rejected:true,restored:true});
    const afterBytes=await native('bytes');
    report.editorBytes={archiveByteEqual:hash(Buffer.from(beforeBytes))===hash(Buffer.from(afterBytes)),
      beforeEntries:entries(beforeBytes),afterEntries:entries(afterBytes)};
    assert.deepEqual(report.editorBytes.afterEntries,report.editorBytes.beforeEntries,'all serialized project entry bytes unchanged');
    assert.equal((await native('semantics')).revision,edited.revision);
    assert.equal(await page.locator('#screen').getAttribute('data-modified'),beforeDirty);
    assert.deepEqual(music(await native('semantics')),music(edited));
    await page.locator('#undo').click();assert.deepEqual(music(await native('semantics')),music(original));
    await page.locator('#redo').click();assert.deepEqual(music(await native('semantics')),music(edited));
    check('Temporary SVG snapshots and malformed-input failure preserve editor bytes, revision, dirty state and undo/redo');
    // The live import path is the independent reference for each temporary import.
    for(let i=0;i<inputs.length;i++){
      await open(path.join(root,inputs[i].file));
      assert.deepEqual(music(await native('snapshot')),music(temporary[i]),inputs[i].name);
    }
    check('Nine temporary snapshots (including 4/16/64 attacks) match direct MuseScore imports and their own SVG glyphs');
    await open(path.join(root,inputs[1].file));
    await page.getByRole('button',{name:'Tập bài này',exact:true}).click();
    await page.getByTestId('practice-v2').waitFor();
    await page.locator('.loading-overlay').waitFor({state:'hidden'});
    await page.waitForTimeout(500);
    const cdp=await page.context().newCDPSession(page);
    for(const scenario of [{name:'desktop',width:1440,height:1000,rate:1},{name:'mobile-viewport-4x-cpu',width:390,height:844,rate:4}]){
      await page.setViewportSize({width:scenario.width,height:scenario.height});
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:scenario.rate});
      const baseline=await page.evaluate(()=>window.q0Lab.midiProbe([],0));
      const probe=await page.evaluate(inputs=>window.q0Lab.midiProbe(inputs,60),[...inputs.slice(0,3),...inputs.slice(6)]);
      const compact=p=>({...p,nativeSamplesMs:summarize(p.nativeSamplesMs),deliveryMs:summarize(p.deliveryMs),
        longTasksMs:summarize(p.longTasksMs),renderLongTasksMs:summarize(p.renderLongTasksMs),frameGapsMs:summarize(p.frameGapsMs)});
      report.benchmarks.push({scenario,baseline:compact(baseline),withNative:compact(probe),
        gate:probe.nativeSamplesMs.length>0&&Math.max(...probe.nativeSamplesMs)<50&&
          probe.renderLongTasksMs.length===0&&probe.outcome==='complete'&&probe.metrics?.hits===probe.planned&&
          baseline.outcome==='complete'&&baseline.metrics?.hits===baseline.planned});
      assert.equal(probe.sheetUnchanged,true);assert.equal(probe.editorRevisionUnchanged,true);
      await save();console.log(scenario.name,JSON.stringify(report.benchmarks.at(-1)));
    }
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    assert.deepEqual(report.errors,[]);report.functionalPassed=true;
    report.rendererGatePassed=report.benchmarks.every(b=>b.gate);
    console.log('Realtime renderer gate:',report.rendererGatePassed?'PASS':'REJECTED; native preparation must stay outside timed play');
    if(process.argv.includes('--require-realtime')&&!report.rendererGatePassed)process.exitCode=2;
    await page.screenshot({path:path.join(out,'native-prototype.png')});
  }catch(e){report.functionalPassed=false;report.error=String(e.stack||e);report.console=consoleTail;process.exitCode=1;console.error(e);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await save();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
