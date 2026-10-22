// Actual shared practice UI and MIDI packets. No mocked note judgements.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/piano-88');
const url=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1#/exercises';
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
  const report={url,checks:[],errors:[]};
  page.on('pageerror',e=>report.errors.push(String(e)));
  await context.addInitScript(()=>{
    addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='#diagnostics{display:none!important}';document.head.appendChild(style);});
    window.piano88Inputs=[];
    const OriginalWorker=window.Worker;
    window.Worker=class extends OriginalWorker{
      postMessage(data,...rest){if(data?.type==='command'&&data.command?.type==='input')window.piano88Inputs.push(data.command.event);return super.postMessage(data,...rest);}
    };
  });
  const transport=()=>page.getByRole('group',{name:'Điều khiển tập luyện'});
  const key=n=>page.locator(`#practice-keyboard [data-midi="${n}"]`);
  const check=message=>{report.checks.push(message);console.log('PASS',message);};
  const hold=async(n,source)=>{
    const box=await key(n).boundingBox();assert(box);
    const before=await page.evaluate(()=>window.piano88Inputs.length);
    await page.mouse.move(box.x+box.width/2,box.y+box.height*.85);await page.mouse.down();
    await page.waitForFunction(n=>document.querySelector(`#practice-keyboard [data-midi="${n}"]`)?.getAttribute('aria-pressed')==='true',n);
    assert(await key(n).evaluate(b=>b.classList.contains('held')));
    await page.mouse.up();
    await page.waitForFunction(n=>document.querySelector(`#practice-keyboard [data-midi="${n}"]`)?.getAttribute('aria-pressed')==='false',n);
    await page.waitForFunction(({n,before})=>window.piano88Inputs.slice(before).some(e=>e.pitch===n&&e.kind==='off'),{n,before});
    const events=await page.evaluate(before=>window.piano88Inputs.slice(before),before);
    assert(events.some(e=>e.pitch===n&&e.kind==='on'&&e.source==='virtual'),source);
    assert(events.some(e=>e.pitch===n&&e.kind==='off'),source);
  };
  const layout=async width=>{
    await page.setViewportSize({width,height:width<500?800:1000});
    const geometry=await page.locator('#practice-keyboard').evaluate(p=>{
      const outer=p.getBoundingClientRect();return{viewport:innerWidth,body:document.body.scrollWidth,left:outer.left,right:outer.right,
        keys:[...p.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return{pitch:+b.dataset.midi,left:r.left,right:r.right,width:r.width,height:r.height};})};
    });
    assert(geometry.body<=width+1);assert(geometry.left>=0&&geometry.right<=width+1);
    assert(geometry.keys.every(k=>k.width>0&&k.height>0&&k.left>=geometry.left-.5&&k.right<=geometry.right+.5));
    assert.equal(geometry.keys.length,88);
    await page.screenshot({path:path.join(out,'keyboard-'+width+'.png')});
    check(`all 88 keys fit within ${width}px viewport without page overflow`);
  };
  try{
    await page.goto(url);await page.getByRole('combobox',{name:'Grade',exact:true}).waitFor({timeout:60000});
    await page.getByRole('combobox',{name:'Chế độ tập theo grade',exact:true}).selectOption('wait');
    await page.getByRole('checkbox',{name:'Khoảng 4 nốt',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Khoảng 20 nốt',exact:true}).check();
    await page.getByRole('checkbox',{name:'Random',exact:true}).uncheck();
    await page.getByRole('button',{name:'Bắt đầu tập theo grade',exact:true}).click();
    await page.getByTestId('practice-v2').waitFor({timeout:150000});
    await page.waitForFunction(()=>!document.querySelector('.v2-play')?.disabled,null,{timeout:120000});
    if(!await page.locator('#practice-keyboard').isVisible())await page.getByRole('button',{name:'⌃ Mở bàn phím',exact:true}).click();
    const pitches=await page.locator('#practice-keyboard button').evaluateAll(buttons=>buttons.map(b=>+b.dataset.midi).sort((a,b)=>a-b));
    assert.deepEqual(pitches,Array.from({length:88},(_,i)=>21+i));
    assert.equal(await page.locator('#practice-keyboard .white-key').count(),52);
    assert.equal(await page.locator('#practice-keyboard .black-key').count(),36);
    assert.equal(await key(21).getAttribute('aria-label'),'A0');assert.equal(await key(108).getAttribute('aria-label'),'C8');
    assert.equal(await page.getByRole('combobox',{name:'Quãng bàn phím',exact:true}).count(),0);
    check('exact A0–C8 pitch range, 52 white + 36 black keys, octave selector removed');
    await layout(1440);await layout(390);await layout(360);
    await transport().getByRole('button',{name:'Thiết lập',exact:true}).click();
    await page.getByRole('spinbutton',{name:'Đếm vào',exact:true}).fill('0');await page.getByRole('button',{name:'Đóng thiết lập',exact:true}).click();
    await transport().getByRole('button',{name:'Bắt đầu tập',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập',null,{timeout:15000});
    assert(await page.locator('#practice-keyboard .expected').count()>0);
    for(const n of [21,22,106,108])await hold(n,'mobile pitch '+n);
    check('mobile real pointer presses reach MIDI router at A0/A♯0/A♯7/C8 and release all held highlights');
    await page.keyboard.down('a');await page.waitForFunction(()=>document.querySelector('#practice-keyboard [data-midi="60"]')?.getAttribute('aria-pressed')==='true');
    await page.keyboard.up('a');await page.waitForFunction(()=>document.querySelector('#practice-keyboard [data-midi="60"]')?.getAttribute('aria-pressed')==='false');
    check('computer keyboard A still plays C4 and releases it on the 88-key board');
    await transport().getByRole('button',{name:'Dừng lượt tập',exact:true}).click();
    await transport().getByRole('button',{name:'Bắt đầu tập',exact:true}).waitFor();
    assert.equal(await page.locator('#practice-keyboard .held').count(),0);
    await page.getByRole('button',{name:'⌄ Thu gọn',exact:true}).click();assert.equal(await page.locator('#practice-keyboard').isVisible(),false);
    await page.getByRole('button',{name:'⌃ Mở bàn phím',exact:true}).click();assert.equal(await page.locator('#practice-keyboard button').count(),88);
    await layout(1440);
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.passed=false;report.error=String(error.stack||error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
