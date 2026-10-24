const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/library-range-ux');
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),report={checks:[],errors:[]};
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
 const check=s=>{report.checks.push(s);console.log('PASS',s);};
 const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
 const nav=name=>page.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name,exact:true});
 const range=()=>page.getByRole('button',{name:'Chọn đoạn',exact:true}).click();
 const field=(name)=>page.getByRole('spinbutton',{name,exact:true});
 const apply=()=>page.getByRole('button',{name:'Áp dụng',exact:true}).click();
 const screenshot=n=>page.screenshot({path:path.join(out,n+'.png')});
 const geometry=async()=>{
  const cards=await page.locator('.score-card').evaluateAll(cards=>cards.map(c=>{
   const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
   return {card:box(c),heading:box(c.querySelector('.score-card-heading')),more:box(c.querySelector('.score-more')),buttons:[...c.querySelectorAll('.score-actions button')].map(box)};
  }));
  for(const c of cards){
   assert(c.more.x>=c.card.x&&c.more.right<=c.card.right,'menu stays inside card');
   assert(c.more.bottom<=c.heading.bottom+1,'menu stays with title');
   for(const b of c.buttons){assert(b.x>=c.card.x&&b.right<=c.card.right,'action stays in card');assert(Math.abs(b.y-c.buttons[0].y)<1,'actions share one row');assert(b.height>=40,'touch target');}
  }
  assert(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'no document overflow');
 };
 try{
  const url=new URL(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html');url.hash='/library';
  await page.goto(url.href);await page.getByRole('heading',{name:'Thư viện',exact:true}).waitFor();
  const search=page.getByRole('searchbox',{name:'Tìm bản nhạc'});
  for(const [q,title] of [['tran bo nho','Tràn bộ nhớ'],['tinh don phuong','Tình Đơn Phương']]){
   await search.fill(q);await page.getByRole('heading',{name:title,exact:true}).waitFor();
  }
  await search.fill('tran bo nho');
  for(const width of [320,360,390,650,768,1440]){
   await page.setViewportSize({width,height:844});
   for(const mode of ['Ảnh nhỏ','Ảnh lớn','Danh sách']){await page.getByRole('button',{name:mode,exact:true}).click();await geometry();}
  }
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Ảnh nhỏ',exact:true}).click();
  await page.getByRole('button',{name:/Chuyển giao diện/}).click();
  await screenshot('library-dark');
  await page.getByRole('button',{name:'Tùy chọn Tràn bộ nhớ',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'Tùy chọn Tràn bộ nhớ',exact:true});
  assert(await menu.getByRole('button',{name:'Chỉnh sửa bản nhạc',exact:true}).isVisible());
  assert.equal(await menu.locator('select').count(),0);
  await screenshot('menu-dark');await page.getByRole('button',{name:'Đóng tùy chọn',exact:true}).click();
  check('Accent-free search including Đ; stable action row and header menu at 320–1440 in three views');
  await search.fill('Fly Me');
  await page.getByRole('button',{name:'Nghe Fly Me to the Moon',exact:true}).click();
  await page.getByRole('button',{name:'Tạm dừng Fly Me to the Moon',exact:true}).waitFor({timeout:120000});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});await geometry();
    const buttons=await page.locator('.score-actions button').evaluateAll(nodes=>nodes.map(n=>({scroll:n.scrollWidth,client:n.clientWidth})));
    assert(buttons.every(b=>b.scroll<=b.client+1),'playing labels fit narrow cards');
  }
  await page.getByRole('button',{name:'Dừng nghe thư viện',exact:true}).click();
  check('Real library playback pause/loading state does not overflow narrow cards');

  await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
  await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:180000});await idle();
  await nav('Thư viện').click();await search.fill('');
  const own=page.getByRole('region',{name:'Bản nhạc của tôi'});
  const title=await own.locator('h3').first().innerText();
  await search.fill(title.normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d'));
  assert.equal(await own.locator('.score-card').count(),1);
  await own.getByRole('button',{name:'Tùy chọn '+title,exact:true}).click();
  assert(await page.getByRole('button',{name:'Chuyển vào lưu trữ',exact:true}).isVisible());
  assert.equal(await page.getByRole('dialog').locator('select').count(),0,'no meaningless self-group dropdown');
  await screenshot('private-menu-dark');await page.getByRole('button',{name:'Đóng tùy chọn',exact:true}).click();
  await nav('Tập piano').click();
  // Picker is available via the free-play tab even with a current score.
  const picker=page.getByRole('heading',{name:'Chọn bài để tập',exact:true});
  if(!(await picker.isVisible()))await page.getByRole('button',{name:/Đổi bài|Chọn bài khác/}).first().click();
  await picker.waitFor();
  const current=page.locator('.practice-current');
  const colors=await current.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
  assert.notEqual(colors.bg,'rgb(255, 255, 255)');assert.notEqual(colors.bg,colors.color);
  await page.getByRole('searchbox',{name:'Tìm bài để tập'}).fill('tinh dau qua chen');
  const song=page.locator('.bundled-library .score-card').first();await song.waitFor();
  await screenshot('picker-dark');await song.getByRole('button',{name:'Tập',exact:true}).click();
  await page.getByTestId('practice-v2').waitFor({timeout:180000});await idle();
  check('Private menu explains archive, omits self-grouping; dark picker and its unaccented search work');
  const initial=await page.getByRole('button',{name:'Chọn đoạn',exact:true}).innerText();
  await range();await field('Từ ô nhịp').fill('12');await field('Đến ô nhịp').fill('20');
  await page.getByRole('button',{name:'Hủy',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Chọn đoạn',exact:true}).innerText(),initial);
  await range();await field('Từ ô nhịp').fill('12');await field('Đến ô nhịp').fill('3');await apply();
  await page.getByRole('alert').filter({hasText:'Ô kết thúc'}).waitFor();
  await field('Đến ô nhịp').fill('20');await apply();
  assert.match(await page.getByRole('button',{name:'Chọn đoạn',exact:true}).innerText(),/12–20/);
  await range();await field('Từ ô nhịp').fill('');await apply();
  await page.getByRole('alert').filter({hasText:'Nhập số ô nhịp'}).waitFor();
  await field('Từ ô nhịp').fill('12');
  const dialog=page.getByRole('dialog',{name:'Chọn đoạn tập'});
  const d=await dialog.evaluate(el=>({height:el.getBoundingClientRect().height,bg:getComputedStyle(el).backgroundColor}));
  assert(d.height<380);assert.notEqual(d.bg,'rgb(255, 255, 255)');await screenshot('range-dark');
  await page.getByRole('button',{name:'Chọn trên sheet',exact:true}).click();
  await page.getByRole('button',{name:'Ô 3 · chọn A',exact:true}).click();
  await page.getByRole('button',{name:'Hủy chọn',exact:true}).click();
  assert.match(await page.getByRole('button',{name:'Chọn đoạn',exact:true}).innerText(),/12–20/);
  await range();await page.getByRole('button',{name:'Chọn trên sheet',exact:true}).click();
  await page.getByRole('button',{name:'Ô 5 · chọn A',exact:true}).click();
  await page.getByRole('button',{name:'Ô 3 · chọn B',exact:true}).click();
  assert.match(await page.getByRole('button',{name:'Chọn đoạn',exact:true}).innerText(),/3–5/);
  await range();await page.getByRole('button',{name:'Toàn bài',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Chọn đoạn',exact:true}).innerText(),initial);
  await page.getByRole('button',{name:'Thiết lập',exact:true}).click();
  await page.getByRole('button',{name:/Chọn đoạn · ô/}).click();await dialog.waitFor();
  assert.equal(await page.locator('dialog[open]').count(),1);
  await page.getByRole('button',{name:'Hủy',exact:true}).click();
  check('Range is transactional: cancel/invalid/empty inputs, reverse two-tap selection, cancel after A, whole song, settings shortcut');
  // The sheet now owns its command bar; appearance options live in its settings.
  await page.getByRole('button',{name:'Thiết lập',exact:true}).click();
  await page.getByRole('button',{name:/Chuyển giao diện/}).click();
  await page.getByRole('button',{name:'Đóng thiết lập',exact:true}).click();await range();await screenshot('range-light');
  await page.getByRole('button',{name:'Hủy',exact:true}).click();
  await page.getByRole('button',{name:'Chỉ bản nhạc',exact:true}).click();
  await page.getByRole('button',{name:'Thiết lập',exact:true}).click();await page.getByRole('button',{name:/Chọn đoạn · ô/}).click();
  await page.keyboard.press('Escape');assert(await page.locator('.sheet-focus').count());
  assert.equal(await page.locator('dialog[open]').count(),0);
  check('Range supports light/dark, touch viewport and Escape without exiting full-sheet mode');
  await page.getByRole('button',{name:'Thoát toàn màn hình',exact:true}).click();
  await page.getByRole('button',{name:'Đổi bài',exact:true}).click();await nav('Thư viện').click();
  await search.fill('');assert.equal(await own.locator('.score-card').count(),2);
  await own.getByRole('button',{name:'Tùy chọn '+title,exact:true}).click();
  await page.getByRole('dialog',{name:'Tùy chọn '+title,exact:true}).getByText('Chuyển sang nhóm bài khác…',{exact:true}).click();
  const destination=page.getByRole('combobox',{name:'Bài nhận phiên bản',exact:true});
  assert.equal(await destination.locator('option').count(),2,'placeholder plus other work only');
  await destination.selectOption({index:1});
  assert.equal(await own.locator('.score-card').count(),2,'choosing destination does not silently merge');
  await page.getByRole('button',{name:'Chuyển phiên bản',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Bản nhạc của tôi"] .score-card').length===1);
  assert.equal(await own.getByRole('combobox',{name:/Chọn phiên bản/}).locator('option').count(),2);
  check('Version move excludes the current work, requires explicit submit, and preserves both editions');

  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(e){report.passed=false;report.error=String(e.stack);console.error(report.error);await screenshot('failure').catch(()=>{});process.exitCode=1;}
 finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})();
