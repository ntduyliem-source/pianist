// Full native pages must remain intact, including pedal symbols outside staff boxes.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/native-sheet-integrity');
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const report={checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(String(e)));
 const check=s=>{report.checks.push(s);console.log('PASS',s);};
 const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
 const settings=async()=>{await page.getByRole('button',{name:'Thiết lập',exact:true}).click();await page.getByRole('dialog').waitFor();};
 const close=()=>page.getByRole('button',{name:'Xong',exact:true}).click();
 try{
  await page.goto((process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html')+'?diagnostics=1#/library');
  await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/regression/tinh-don-phuong.mxl'));
  await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
  await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await page.getByTestId('practice-v2').waitFor();await idle();
  const snapshot=await page.evaluate(()=>{const a=window.pianist,old=a.Module.onPracticeSnapshot;let s;a.Module.onPracticeSnapshot=j=>s=JSON.parse(j);try{if(!a.getPracticeSnapshot())throw Error('snapshot');return s;}finally{a.Module.onPracticeSnapshot=old;}});
  assert.equal(snapshot.pages.length,6);assert(snapshot.cursorSegments.length>100);assert(snapshot.timeMap.length>100);
  await settings();await page.getByRole('combobox',{name:'Thu phóng trong thiết lập'}).selectOption('fit');await close();
  await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();
  for(const p of snapshot.pages){
   const block=page.locator(`.practice-system[data-page="${p.index}"]`);await block.scrollIntoViewIfNeeded();
   await block.locator('svg.practice-system-svg').waitFor();
   const data=await block.evaluate(async el=>{const svg=el.querySelector('svg.practice-system-svg'),im=svg.querySelector('image'),r=el.getBoundingClientRect();return{viewBox:svg.getAttribute('viewBox'),image:[im.getAttribute('x'),im.getAttribute('y'),im.getAttribute('width'),im.getAttribute('height')],native:await(await fetch(im.getAttribute('href'))).text(),ratio:r.width/r.height};});
   assert.equal(data.viewBox,`0 0 ${p.width} ${p.height}`);assert.deepEqual(data.image,['0','0',String(p.width),String(p.height)]);
   assert.equal(data.native,p.svg,'displayed image must equal the full original MuseScore SVG');assert(Math.abs(data.ratio-p.width/p.height)<.001);
  }
  check('All six Tình đơn phương pages display byte-identical native SVG with its complete viewBox; no staff crop');
  const second=page.locator('.practice-system[data-page="1"]');
  await second.evaluate(el=>{const scroll=document.getElementById('sheet-scroll'),r=el.getBoundingClientRect(),v=scroll.getBoundingClientRect();scroll.scrollTop+=r.bottom-v.bottom;});
  await page.screenshot({path:path.join(out,'tinh-page2-pedal.png')});
  // At reference time zero the first rest supplies the native ChordRest X.
  await page.getByRole('button',{name:'Nghe đoạn',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'ngoài piano nhẹ'}).first().waitFor();
  const sostenuto=await page.evaluate(()=>{const a=window.pianist,old=a.Module.onSamplePlayback;let data;a.Module.onSamplePlayback=j=>data=JSON.parse(j);try{a.getSamplePlayback(1);return data.midi.some(e=>e.opcode===11&&e.data1===66&&e.data2>=64);}finally{a.Module.onSamplePlayback=old;}});
  assert(sostenuto,'the fallback is required by original native CC66, not an inferred pedal');
  await page.getByRole('button',{name:'Thoát toàn màn hình',exact:true}).click();
  await settings();await page.getByRole('checkbox',{name:'Tiếng MuseScore',exact:true}).check();await close();
  await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();
  await page.getByRole('button',{name:'Nghe đoạn',exact:true}).click();
  await page.getByRole('button',{name:'Tạm dừng nghe',exact:true}).waitFor({timeout:120000});
  check('Native CC66 sostenuto requires explicit MuseScore sound; selecting it plays the same score');await page.getByRole('button',{name:'Tạm dừng nghe',exact:true}).click();
  // The full-sheet listening timeline is now visible directly in the workspace.
  await page.getByRole('slider',{name:'Vị trí nghe'}).fill('0');
  await page.waitForFunction(expected=>{const x=document.querySelector('[data-testid="score-playhead"]')?.getAttribute('x1');return x!==null&&Math.abs(Number(x)-expected)<1;},snapshot.cursorSegments.find(s=>s.measure===0).x-snapshot.pages[0].offsetX,{timeout:15000});
  check('Paused listening at time zero positions the cursor at the native first rest segment');
  await page.getByRole('button',{name:'Dừng nghe',exact:true}).click();
  for(const [width,height] of [[390,844],[844,390]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(250);
   assert(await page.getByRole('button',{name:'Nghe đoạn',exact:true}).isVisible());assert(await page.getByRole('switch',{name:'Dùng pedal khi tập'}).isVisible());
   assert(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(out,`fullsheet-${width}.png`)});
  }
  check('Mobile portrait/landscape full sheet retains Listen and pedal controls without document overflow');
  await page.setViewportSize({width:1440,height:1000});
  await settings();await page.getByRole('button',{name:/Chọn đoạn · ô/}).click();
  await page.getByRole('button',{name:'Chọn trên sheet',exact:true}).click();
  const measureA=page.getByRole('button',{name:'Ô 3 · chọn A',exact:true});await measureA.focus();await measureA.press('Enter');
  const measureB=page.getByRole('button',{name:'Ô 5 · chọn B',exact:true});await measureB.focus();await measureB.press('Space');
  await settings();await page.getByRole('button',{name:/Chọn đoạn · ô/}).click();
  assert.equal(await page.getByRole('spinbutton',{name:'Từ ô nhịp',exact:true}).inputValue(),'3');
  assert.equal(await page.getByRole('spinbutton',{name:'Đến ô nhịp',exact:true}).inputValue(),'5');
  await page.getByRole('button',{name:'Hủy',exact:true}).click();
  check('Full-page A–B measure overlays support keyboard Enter/Space and retain the chosen range');
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(e){report.passed=false;report.error=String(e.stack);process.exitCode=1;console.error(report.error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));
})();
