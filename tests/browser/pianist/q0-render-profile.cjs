// Diagnostic only: isolate native call time from JSON parsing and sheet insertion.
// Uses the exact packaged Release binary, without modifying its native code.
const {chromium} = require('playwright');
const fs = require('node:fs/promises'), path = require('node:path');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const os = require('node:os');
const {unzipSync} = require('../../../apps/pianist-web/node_modules/fflate');
const root = path.resolve(__dirname, '../../..');
const out = path.join(root, 'artifacts/q0/profile');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stats = values => {
  const v = [...values].sort((a,b)=>a-b);
  return {n:v.length,min:v[0],median:(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2,max:v.at(-1)};
};
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const release = JSON.parse(await fs.readFile(path.join(root,'build.artifacts/release.json'),'utf8'));
  for (const name of ['MuseScoreStudio.js','MuseScoreStudio.wasm']) {
    assert.equal(hash(await fs.readFile(path.join(root,'build.artifacts',name))),release.files.find(f=>f.path===name)?.sha256);
  }
  const browser = await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const cdp = await page.context().newCDPSession(page);
  const variantsOnly=process.argv.includes('--variants-only');
  const report = {at:new Date().toISOString(),browser:browser.version(),release:release.version,
    cpu:os.cpus()[0]?.model,cores:os.cpus().length,cpuThrottleIsSimulation:true,
    wasmSha256:release.files.find(f=>f.path==='MuseScoreStudio.wasm').sha256,
    nativeInstrumentation:false,benchmarks:[],errors:[]};
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const save = () => fs.writeFile(path.join(out,variantsOnly?'variants.json':'report.json'),JSON.stringify(report,null,2));
  try {
    await page.goto('http://127.0.0.1:8787/pianist.html?diagnostics=1');
    await page.locator('#file').setInputFiles(path.join(root,'docs/curriculum/starter-scores/K008.mxl'));
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Đã mở K008.mxl.',null,{timeout:180000});
    await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
    await page.waitForTimeout(1500);
    await page.evaluate(()=>{
      window.profileNative = (input,operation) => {
        const a=window.pianist,m=a.Module,bytes=new Uint8Array(input.bytes);
        const callback=({temporary:'onPreparedSnapshot',semantics:'onPreparedSemantics',
          current:'onPracticeSnapshot',currentSemantics:'onScoreSemantics'})[operation];
        const old=m[callback];let json,callbackAt=0,callEnd,ptr;
        const start=performance.now();
        let copied=start,callStart=start;
        m[callback]=value=>{json=value;callbackAt=performance.now();};
        try{
          if(operation==='temporary'||operation==='semantics'){
            ptr=m._malloc(bytes.length);if(!ptr)throw Error('malloc');
            m.HEAPU8.set(bytes,ptr);copied=performance.now();callStart=copied;
            const ok=operation==='temporary'
              ?m.ccall('preparePracticeSnapshot','number',['number','number','string'],[ptr,bytes.length,input.name])
              :m.ccall('prepareProject','number',['number','number','string','number'],[ptr,bytes.length,input.name,1]);
            if(!ok)throw Error('prepare failed');
          }else{
            callStart=performance.now();
            if(!(operation==='current'?a.getPracticeSnapshot():a.getScoreSemantics()))throw Error('snapshot failed');
          }
          callEnd=performance.now();
        }finally{
          if(ptr)m._free(ptr);
          m[callback]=old;
        }
        if(typeof json!=='string')throw Error('missing callback');
        const parseStart=performance.now(),snapshot=JSON.parse(json),end=performance.now();
        const music={notes:snapshot.anchors.map(n=>[n.id,n.pitch,n.tick,n.durationTicks,n.staff,n.voice,n.tieBack||null]).sort(),
          performed:snapshot.performed,keyReleases:snapshot.keyReleases,beats:snapshot.beats,
          pedals:snapshot.pedals.map(p=>({...p,partId:undefined})),durationMs:snapshot.durationMs};
        const svg= snapshot.pages.map(p=>p.svg).join('');
        const doc=new DOMParser().parseFromString('<root>'+svg.replace(/<\?xml[^?]*\?>/g,'')+'</root>','application/xml');
        const pathByClass={};
        for(const p of doc.querySelectorAll('path')){
          const key=p.getAttribute('class')||'(none)';
          const value=pathByClass[key]??={paths:0,chars:0};
          value.paths++;value.chars+=p.getAttribute('d')?.length||0;
        }
        return {totalMs:end-start,copyMs:copied-start,nativeMs:callEnd-callStart,
          beforeCallbackMs:callbackAt-callStart,afterCallbackMs:callEnd-callbackAt,
          parseMs:end-parseStart,jsonChars:json.length,notes:snapshot.anchors.length,pages:snapshot.pages.length,
          svgChars:svg.length,pathByClass,music};
      };
    });
    const mxl=await fs.readFile(path.join(root,'docs/curriculum/starter-scores/K008.mxl'));
    const entries=unzipSync(mxl);
    const container=new TextDecoder().decode(entries['META-INF/container.xml']);
    const xmlPath=container.match(/full-path="([^"]+)"/)[1];
    const inputs=[
      {name:'K008.mxl',bytes:[...mxl]},
      {name:'K008.musicxml',bytes:[...entries[xmlPath]]},
    ];
    if(variantsOnly){
      const xml=new TextDecoder().decode(entries[xmlPath]);
      // Original project-authored fixture only. Published scores and their
      // attribution are never edited by this diagnostic.
      inputs.push({name:'K008-without-heading.musicxml',bytes:[...Buffer.from(xml
        .replace(/<work>[\s\S]*?<\/work>/,'')
        .replace(/<creator\b[^>]*>[\s\S]*?<\/creator>/g,'')
        .replace(/<rights>[\s\S]*?<\/rights>/g,''))]});
      for(const count of [4,16,64]){
        const measures=Array.from({length:count/4},(_,m)=>`<measure number="${m+1}">${m===0
          ?'<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':''}
          ${['C','D','E','F'].map(step=>`<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>`).join('')}</measure>`).join('');
        const score=`<score-partwise version="4.0"><work><work-title>Q0 test ${count}</work-title></work>
          <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
        inputs.push({name:`synthetic-${count}.musicxml`,bytes:[...Buffer.from(score)]});
      }
    }
    let originalMusic;
    for(const rate of [1,4]){
      await cdp.send('Emulation.setCPUThrottlingRate',{rate});
      for(const input of inputs){
        for(const operation of variantsOnly?['temporary']:['temporary','semantics','current','currentSemantics']){
          if(input.name.endsWith('musicxml')&&operation.startsWith('current'))continue;
          // Three warm-up calls per variant; measured repetitions yield in between.
          for(let i=0;i<3;i++){await page.evaluate(({input,operation})=>window.profileNative(input,operation),{input,operation});await page.waitForTimeout(80);}
          const samples=[];
          for(let i=0;i<10;i++){
            samples.push(await page.evaluate(({input,operation})=>window.profileNative(input,operation),{input,operation}));
            await page.waitForTimeout(80);
          }
          const summary=Object.fromEntries(['totalMs','copyMs','nativeMs','beforeCallbackMs','afterCallbackMs','parseMs']
            .map(key=>[key,stats(samples.map(s=>s[key]))]));
          if(input.name==='K008.mxl'&&operation==='temporary')originalMusic=samples[0].music;
          if(input.name==='K008-without-heading.musicxml')for(const sample of samples)assert.deepEqual(sample.music,originalMusic);
          report.benchmarks.push({cpuRate:rate,file:input.name,operation,inputBytes:input.bytes.length,
            sourceSha256:hash(Buffer.from(input.bytes)),
            notes:samples[0].notes,pages:samples[0].pages,jsonChars:samples[0].jsonChars,svgChars:samples[0].svgChars,
            pathByClass:samples[0].pathByClass,musicSha256:hash(JSON.stringify(samples[0].music)),
            summary,samples:samples.map(({music,pathByClass,...sample})=>sample)});
          console.log(JSON.stringify({rate,file:input.name,operation,...summary}));
          await save();
        }
      }
    }
    // Optional sampling profile. Anonymous optimized WASM indices are retained
    // as-is; an older fast-link symbol map must never be used to name them.
    if(variantsOnly){report.headingVariantMusicallyEqual=true;await save();return;}
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval',{interval:250});
    await cdp.send('Profiler.start');
    for(let i=0;i<20;i++){
      await page.evaluate(input=>window.profileNative(input,'temporary'),inputs[0]);
      await page.waitForTimeout(50);
    }
    const {profile}=await cdp.send('Profiler.stop');
    await fs.writeFile(path.join(out,'temporary.cpuprofile'),JSON.stringify(profile));
    report.cpuProfile='temporary.cpuprofile';
    await save();
  }catch(error){report.failure=String(error);await save();throw error;}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
