// Native regressions for D08 (lossy ABC) and D10 (standalone MSCX in WASM).
const {chromium}=require('playwright');
const {zipSync,strToU8}=require('../../../apps/pianist-web/node_modules/fflate');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const out=path.join(root,'artifacts/format-integrity');

(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
  const result={checks:[],errors:[]};let downloads=0;
  page.on('pageerror',e=>result.errors.push(String(e)));
  page.on('download',()=>downloads++);
  page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:120000});
  const open=async file=>{
    await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(name=>document.querySelector('#status')?.textContent==='Đã mở '+name+'.',path.basename(file),{timeout:120000});
    await idle();
  };
  const semantics=()=>page.evaluate(()=>{
    const api=window.pianist,previous=api.Module.onScoreSemantics;let value;
    api.Module.onScoreSemantics=json=>value=JSON.parse(json);
    try{if(!api.getScoreSemantics())throw Error('Native semantics failed');return value;}
    finally{api.Module.onScoreSemantics=previous;}
  });
  const sorted=values=>[...values].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const music=s=>({anchors:sorted(s.anchors.map(({box,page,...note})=>note)),rests:sorted(s.rests),keys:sorted(s.keys),slurs:sorted(s.slurs),dynamics:sorted(s.dynamics),
    performed:sorted(s.performed),pedals:sorted(s.pedals),keyReleases:sorted(s.keyReleases),occurrences:s.occurrences,beats:s.beats,baseQuarterBpm:s.baseQuarterBpm});
  const exportDialog=async()=>{
    await page.getByRole('button',{name:'Xuất…',exact:true}).click();
    await page.locator('#export-format').selectOption('abc');
  };
  const success=async filename=>{
    await exportDialog();const promise=page.waitForEvent('download',{timeout:120000});
    await page.getByRole('button',{name:'Xuất file',exact:true}).click();
    const download=await promise;await download.saveAs(path.join(out,filename));await idle();
    return path.join(out,filename);
  };
  try{
    await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1');
    await open(path.join(root,'tests/fixtures/pianist/abc/piano-core-midi.abc'));
    const baseline=await semantics();assert.ok(baseline.anchors.length>0);
    assert.ok(baseline.anchors.every(n=>n.userVelocity===0));assert.deepEqual(baseline.dynamics,[]);
    await success('ordinary.abc');
    result.checks.push('Ordinary ABC still exports; native zero velocities are explicit');

    const fp=await fs.readFile(path.join(root,'tests/fixtures/pianist/abc/fp.musicxml'),'utf8');
    const p=fp.replace('<fp />','<p />').replace('<sound dynamics="90" />','');
    assert.notEqual(p,fp);await fs.writeFile(path.join(out,'p.musicxml'),p);
    await open(path.join(out,'p.musicxml'));const piano=await semantics();assert.equal(piano.dynamics.length,1);
    const exportedP=await success('p.abc');await open(exportedP);
    assert.deepEqual((await semantics()).dynamics,piano.dynamics);
    result.checks.push('Supported p dynamic survives ABC export and native reimport');

    for(const [file,message] of [['velocity.musicxml',/cường độ từng nốt/],['fp.musicxml',/sắc thái/]]){
      await open(path.join(root,'tests/fixtures/pianist/abc',file));const before=await semantics(),count=downloads;
      if(file==='velocity.musicxml')assert.ok(before.anchors.some(n=>n.userVelocity>0));
      else assert.equal(before.dynamics.length,1);
      await exportDialog();await page.getByRole('button',{name:'Xuất file',exact:true}).click();
      const error=page.locator('.error-banner:not(.import-notice)');await error.waitFor({state:'visible',timeout:120000});await idle();
      assert.match(await error.innerText(),message);assert.equal(downloads,count);
      assert.deepEqual(music(await semantics()),music(before));
      await error.getByRole('button',{name:'Đóng',exact:true}).click();
      const saved=page.waitForEvent('download');await page.locator('#mxl').click();await (await saved).saveAs(path.join(out,file+'.mxl'));
      result.checks.push(file+': lossy ABC rejected without download or score change; MXL remains available');
    }

    const source=path.join(root,'src/engraving/tests/playback/playbackeventsrenderer_data/pauses/pauses.mscx');
    const bytes=await fs.readFile(source);
    const wrapped=zipSync({'score.mscx':bytes,'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="score.mscx"/></rootfiles></container>')});
    await fs.writeFile(path.join(out,'pauses.mscz'),wrapped);
    await open(source);const raw=await semantics();assert.equal(raw.anchors.length,8);
    const prepared=await page.evaluate(data=>{
      const api=window.pianist,previous=api.Module.onPreparedSemantics;let value;
      api.Module.onPreparedSemantics=json=>value=JSON.parse(json);
      try{if(!api.prepareProject(new Uint8Array(data),'pauses.mscx',true))throw Error('Raw MSCX prepare failed');return value;}
      finally{api.Module.onPreparedSemantics=previous;}
    },Array.from(bytes));
    assert.deepEqual(music(prepared),music(raw));assert.equal((await semantics()).revision,raw.revision);
    await open(path.join(out,'pauses.mscz'));assert.deepEqual(music(await semantics()),music(raw));
    result.checks.push('Raw upstream MSCX opens in UI and temporary prepare with exact musical parity to unchanged XML in MSCZ');

    const before=await semantics();
    await assert.rejects(page.evaluate(()=>window.pianist.loadScoreData(new TextEncoder().encode('<museScore>broken'), 'invalid.mscx')), /Cannot open this score/);
    assert.deepEqual(music(await semantics()),music(before));
    result.checks.push('Malformed MSCX fails without replacing the current score');
    assert.deepEqual(result.errors,[]);result.passed=true;
  }catch(error){result.passed=false;result.error=String(error);result.banners=await page.locator('.error-banner').allTextContents();process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));await browser.close();}
  console.log(JSON.stringify(result,null,2));
})();
