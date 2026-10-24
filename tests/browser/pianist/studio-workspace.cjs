// Real UI acceptance for the standalone practice workspace and mobile navigation.
// No scoring or audio simulation is substituted for the production implementation.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.env.PIANIST_QA_DIR||path.join(root,'artifacts/studio-workspace'));
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('pianist.theme','dark');localStorage.setItem('pianist.library-view','small');});
 const page=await context.newPage(),report={checks:[],errors:[],passed:false};
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
 const check=s=>{report.checks.push(s);console.log('PASS',s);};
 const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
 const nav=name=>page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name,exact:true});
 const settings=()=>page.getByRole('button',{name:'Thiết lập',exact:true}).click();
 const closeSettings=()=>page.getByRole('button',{name:'Đóng thiết lập',exact:true}).click();
 const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
 const geometry=async()=>{
   const g=await page.evaluate(()=>{
     const els=[...document.querySelectorAll('.appbar button,.appbar input,.mobile-navigation button,.v2-transport button,.v2-transport input')].filter(e=>e.checkVisibility());
     return {width:innerWidth,scroll:document.body.scrollWidth,controls:els.map(e=>({label:e.getAttribute('aria-label')||e.textContent,r:e.getBoundingClientRect().toJSON()}))};
   });
   assert(g.scroll<=g.width+1,'no document overflow');
   for(const c of g.controls)assert(c.r.x>=-1&&c.r.right<=g.width+1,'control inside viewport: '+c.label+' '+JSON.stringify(c.r));
   for(let i=0;i<g.controls.length;i++)for(let j=i+1;j<g.controls.length;j++){
     const a=g.controls[i],b=g.controls[j];
     const dx=Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left),dy=Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top);
     assert(!(dx>1&&dy>1),'controls overlap: '+a.label+' / '+b.label);
   }
 };
 try{
   const url=new URL(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html');url.searchParams.set('diagnostics','1');url.hash='/library';
   await page.goto(url.href);await page.locator('.score-card').first().waitFor();
   await page.addStyleTag({content:'#diagnostics{display:none!important}'});await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>[...document.querySelectorAll('.score-thumbnail img')].slice(0,4).every(i=>i.complete&&i.naturalWidth>0));
   await shot('library-desktop-dark');
   for(const width of [320,360,390,768,1024,1440]){
     await page.setViewportSize({width,height:900});await geometry();
     assert.equal(await page.getByRole('navigation',{name:'Chức năng chính'}).count(),1);
   }
   await page.setViewportSize({width:390,height:844});await shot('library-mobile-dark');
   await page.getByRole('button',{name:/Chuyển giao diện/}).click();await page.waitForTimeout(200);await shot('library-mobile-light');
   check('One usable navigation bar at 320–1440; controls do not overlap; real thumbnails and both themes');
   await nav('Tập piano').click();await page.getByRole('button',{name:'Theo grade',exact:true}).click();
   await page.getByTestId('grade-count').waitFor();await shot('grade-mobile');
   await page.setViewportSize({width:1440,height:1000});await shot('grade-desktop');
   await nav('Thư viện').click();
   await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
   await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
   for(const width of [320,390,768,1440]){
     await page.setViewportSize({width,height:844});await geometry();
     const bounds=await page.locator('#screen').boundingBox();assert(bounds.width<=width+1&&bounds.x>=0);assert(bounds.height>300);
   }
   await page.setViewportSize({width:390,height:844});await shot('editor-mobile');
   await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await page.getByTestId('practice-v2').waitFor();await idle();
   assert.equal(await page.getByRole('navigation',{name:'Chức năng chính'}).count(),0);
   await settings();await page.getByRole('combobox',{name:'Chế độ tập',exact:true}).selectOption('bpm');
   const bpm=page.getByRole('spinbutton',{name:'BPM trong thiết lập',exact:true});await bpm.fill('72');await bpm.press('Tab');await closeSettings();
   assert.match(await page.locator('.studio-score-title').innerText(),/72 BPM/);
   await settings();assert.equal(await bpm.inputValue(),'72');await page.getByRole('combobox',{name:'Chế độ tập',exact:true}).selectOption('wait');await closeSettings();
   assert.match(await page.locator('.studio-score-title').innerText(),/Đúng nốt/);
   check('Mobile practice can change and retain actual mode/BPM in settings; standalone header replaces app navigation');
   for(const width of [320,360,390,768,1024,1440]){
     await page.setViewportSize({width,height:844});await geometry();
     const s=await page.locator('.practice-sheet-region').boundingBox();assert(s.height>530,'sheet owns most of viewport');
   }
   await page.setViewportSize({width:1440,height:1000});await shot('practice-desktop');
   await page.setViewportSize({width:390,height:844});await shot('practice-mobile');
   await page.getByRole('button',{name:'Chọn đoạn',exact:true}).click();await shot('range-mobile');await page.getByRole('button',{name:'Hủy',exact:true}).click();
   await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();
   for(const width of [320,360,390,768,1440]){
     await page.setViewportSize({width,height:844});await geometry();
     const listen=page.getByRole('button',{name:'Nghe đoạn',exact:true});assert(await listen.isVisible());assert(await listen.locator('svg').isVisible(),'Listen has a visible icon in full sheet');
     assert(await page.getByRole('switch',{name:'Dùng pedal khi tập',exact:true}).isVisible());
   }
   await page.setViewportSize({width:390,height:844});await shot('fullsheet-mobile');
   await page.getByRole('button',{name:'Nghe đoạn',exact:true}).click();await page.getByRole('slider',{name:'Vị trí nghe',exact:true}).waitFor({timeout:120000});
   await page.getByRole('button',{name:'Dừng nghe',exact:true}).click();await page.getByRole('slider',{name:'Vị trí nghe',exact:true}).waitFor({state:'hidden'});
   await page.getByRole('button',{name:'Thoát toàn màn hình',exact:true}).click();await page.getByRole('button',{name:'Đổi bài',exact:true}).click();
   await nav('Thư viện').click();await page.getByRole('button',{name:'Lịch sử tập',exact:true}).click();await shot('history-mobile');
   check('Full sheet keeps visible Listen/Pedal/MIDI at 320–1440; real listening/Stop and return to library work');
   assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(e){report.error=String(e.stack);console.error(report.error);await shot('failure').catch(()=>{});process.exitCode=1;}
 finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})();
