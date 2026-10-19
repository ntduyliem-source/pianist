// Collect actual ABC/MXL imports, including each import's own native SVG IDs.
const {chromium}=require('playwright');
const {zipSync,strToU8}=require('../../../apps/pianist-web/node_modules/fflate');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/abc/a5');
const mxl=xml=>Buffer.from(zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>'),'score.musicxml':strToU8(xml)}));
(async()=>{
  await fs.mkdir(out,{recursive:true});const cases=JSON.parse(await fs.readFile(path.join(root,'artifacts/abc/oracle.json'),'utf8'));
  const browser=await chromium.launch({headless:true,channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],pairs=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const open=async(name,buffer,tune=0)=>{
    await page.locator('#file').setInputFiles({name,mimeType:'application/octet-stream',buffer});
    if(name==='tunebook.abc'){
      const dialog=page.getByRole('dialog',{name:'Chọn bài trong file ABC'});await dialog.waitFor();
      if(tune){await dialog.locator('input[type=checkbox]').nth(tune).check();await dialog.getByRole('radio',{name:`Mở bài ${tune+1} sau khi nhập`}).check();await dialog.locator('input[type=checkbox]').first().uncheck();}
      await dialog.getByRole('button',{name:'Nhập 1 bài',exact:true}).click();
    }
    await page.waitForFunction(n=>document.querySelector('#status')?.textContent==='Đã mở '+n+'.',name,{timeout:120000});
    await page.locator('.loading-overlay').waitFor({state:'hidden'});
    return page.evaluate(()=>{
      const a=window.pianist,old=a.Module.onPracticeSnapshot;let s;a.Module.onPracticeSnapshot=j=>s=JSON.parse(j);
      try{if(!a.getPracticeSnapshot())throw Error('No native snapshot');}finally{a.Module.onPracticeSnapshot=old;}
      const keys=new Set(s.pages.flatMap(p=>[...new DOMParser().parseFromString(p.svg,'image/svg+xml').querySelectorAll('[data-practice-notes]')].flatMap(n=>n.getAttribute('data-practice-notes').split(/\s+/))));
      for(const n of s.anchors.filter(n=>n.visible))if(!keys.has(n.id.replace(/^m\d+-/,'')))throw Error('Missing own SVG anchor '+n.id);
      return {...s,glyphCount:keys.size,pages:[]};
    });
  };
  try{
    await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1');
    for(const c of cases.filter(c=>c.musicalExpectation&&c.expected.ok)){
      const abc=await open(c.name+'.abc',Buffer.from(c.job.text),c.job.tuneIndex);
      const xml=await open(c.name+'.mxl',mxl(c.expected.text));pairs.push({name:c.name,abc,xml});console.log('pair',c.name);
    }
    for(const c of cases.filter(c=>c.nativeSource&&c.expected.ok&&!c.name.startsWith('special-symbols'))){
      const abc=await open(c.name+'.abc',Buffer.from(c.job.text));
      const xml=await open(path.basename(c.nativeSource),await fs.readFile(c.nativeSource));pairs.push({name:c.name,abc,xml});console.log('pair',c.name);
    }
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'pairs.json'),JSON.stringify(pairs));
    await fs.writeFile(path.join(out,'native.json'),JSON.stringify({passed:true,browser:browser.version(),pairs:pairs.map(p=>({name:p.name,abcGlyphs:p.abc.glyphCount,mxlGlyphs:p.xml.glyphCount})),errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
