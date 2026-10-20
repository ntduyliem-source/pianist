// Touch gestures on the real Qt canvas at a fixed 390px/100% layout.
// The fixture's note and toolbar positions are verified in the saved screenshots.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.env.PIANIST_QA_DIR||path.join(root,'artifacts/mobile-native/editor-touch'));
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL||'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
  const errors=[],report={browser:browser.version(),emulated:true,checks:[],errors};
  page.on('pageerror',e=>errors.push(String(e)));
  const read=()=>page.evaluate(()=>{const a=window.pianist,old=a.Module.onScoreSemantics;let score;a.Module.onScoreSemantics=j=>score=JSON.parse(j);try{if(!a.getScoreSemantics())throw Error('Native score unavailable');return score;}finally{a.Module.onScoreSemantics=old;}});
  const notes=s=>s.anchors.map(({id,pitch,tick,durationTicks})=>({id,pitch,tick,durationTicks})).sort((a,b)=>a.id.localeCompare(b.id));
  try{
    const base=new URL(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html');base.searchParams.set('diagnostics','1');
    await page.goto(base.href);
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Nhập bản nhạc',exact:true}).click();await(await chooser).setFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
    await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});
    await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
    await page.waitForFunction(()=>!document.querySelector('.editor-playback button')?.disabled,null,{timeout:120000});
    await page.addStyleTag({content:'#diagnostics{display:none!important}'});
    const before=await read(),first=before.anchors.find(a=>a.staff===0&&a.tick===0);
    assert.equal(first.pitch,60);assert.equal(first.durationTicks,480);
    await page.screenshot({path:path.join(out,'before.png')});
    await page.touchscreen.tap(185,535);await page.waitForTimeout(150);
    await page.touchscreen.tap(206,260);await page.waitForTimeout(300);
    const edited=await read();assert.equal(edited.anchors.find(a=>a.id===first.id).durationTicks,240);
    await page.screenshot({path:path.join(out,'eighth-note.png')});
    await page.touchscreen.tap(331,212);await page.waitForTimeout(300);
    const undone=await read();assert.deepEqual(notes(undone),notes(before));
    await page.screenshot({path:path.join(out,'undone.png')});
    report.checks.push('Touch selects the native C4, the native eighth-note toolbar changes 480 to 240 ticks, and native Undo restores every note');
    assert.deepEqual(errors,[]);report.passed=true;
  }catch(error){report.passed=false;report.error=String(error);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report,null,2));
})();
