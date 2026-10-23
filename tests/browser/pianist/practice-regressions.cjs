// Reproduce the reviewed failures against real scorer/native engines. Only
// network/audio readiness is delayed; no judgements or musical content mocked.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/practice-regressions');
const base=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html';
const startupOnly=process.argv.includes('--startup-only'),nativeOnly=process.argv.includes('--native-only');
const retryOnly=process.argv.includes('--retry-only');
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const report={url:base,checks:[],errors:[]};let releaseGate=()=>{};
  const check=message=>{report.checks.push(message);console.log('PASS',message);};
  async function setup(){
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(String(e)));
    page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
    await context.addInitScript(()=>{
      window.reviewMessages=[];window.holdOutputClock=false;window.blockedOutputReads=0;
      const Native=Worker;window.Worker=class extends Native{
        postMessage(data,...args){if(data?.timeline||data?.command)window.reviewMessages.push(data);return super.postMessage(data,...args);}
      };
      const output=AudioContext.prototype.getOutputTimestamp;
      AudioContext.prototype.getOutputTimestamp=function(){
        if(window.holdOutputClock){window.blockedOutputReads++;return{contextTime:0,performanceTime:0};}
        return output.call(this);
      };
    });
    const url=new URL(base);url.searchParams.set('diagnostics','1');url.hash='/exercises';await page.goto(url.href);
    await page.getByRole('combobox',{name:'Grade',exact:true}).waitFor();
    return {context,page};
  }
  const top=(p,n)=>p.getByRole('group',{name:'Điều khiển tập luyện'}).getByRole('button',{name:n,exact:true});
  const nav=(p,n)=>p.getByRole('navigation',{name:'Chức năng chính'}).getByRole('button',{name:n,exact:true});
  async function ready(page){await page.getByTestId('practice-v2').waitFor({timeout:150000});await page.waitForFunction(()=>!document.querySelector('.v2-play')?.disabled);}
  async function choose(page){
    await page.getByRole('checkbox',{name:'Random',exact:true}).uncheck();
    await page.getByRole('checkbox',{name:'Khoảng 4 nốt',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Khoảng 20 nốt',exact:true}).check();
    await page.getByRole('button',{name:'Bắt đầu tập theo grade',exact:true}).click();await ready(page);
    await top(page,'Thiết lập').click();await page.getByRole('spinbutton',{name:'Đếm vào',exact:true}).fill('0');await page.getByRole('button',{name:'Đóng thiết lập',exact:true}).click();
  }
  const scoreId=p=>p.getByTestId('grade-progress').getAttribute('data-score-id');
  const score=page=>page.evaluate(()=>{
    const a=window.pianist,old=a.Module.onScoreSemantics;let s;a.Module.onScoreSemantics=j=>s=JSON.parse(j);
    try{if(!a.getScoreSemantics())throw Error('semantics unavailable');return s.anchors.map(n=>[n.tick,n.pitch,n.durationTicks,n.staff,n.voice]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
    finally{a.Module.onScoreSemantics=old;}
  });
  try{
    // Pause while the scorer script is still in flight, before any audio mapping.
    if(!nativeOnly&&!retryOnly){const {context,page}=await setup();let release;
      try{
        await choose(page);let arrived;const request=new Promise(r=>arrived=r),gate=new Promise(r=>release=r);releaseGate=release;
        await page.route('**/worker-*.js',async route=>{arrived();await gate;await route.continue().catch(()=>{});});
        await top(page,'Bắt đầu tập').click();let timeout;
        try{await Promise.race([request,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('No scorer request')),8000);})]);}finally{clearTimeout(timeout);}
        await top(page,'Thiết lập').click();assert.equal(await page.locator('.v2-status').innerText(),'Tạm dừng');release();
        await page.waitForFunction(()=>!document.querySelector('.v2-play')?.disabled);await page.getByRole('button',{name:'Đóng thiết lập',exact:true}).click();
        await top(page,'Tiếp tục lượt tập').click();await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập');
        const commands=await page.evaluate(()=>window.reviewMessages.flatMap(m=>m.command??[]));
        assert.equal(commands.find(c=>c.kind==='pause').atMs,0);assert.equal(commands.find(c=>c.kind==='resume').atMs,0);
        assert(commands.find(c=>c.type==='clock').atMs<150);assert.equal(await page.getByTestId('score-playhead').getAttribute('data-measure'),'0');
        await top(page,'Dừng lượt tập').click();check('Pause during delayed Worker startup resumes at zero on measure 1');
      }finally{release?.();await context.close();}
    }
    // Pause/Stop while real AudioClock waits for the first output quantum.
    if(!nativeOnly&&!retryOnly){const {context,page}=await setup();try{
      await choose(page);await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>{window.holdOutputClock=true;});await top(page,'Bắt đầu tập').click();
      await page.waitForFunction(()=>window.blockedOutputReads>0);await top(page,'Thiết lập').click();
      await page.evaluate(()=>{window.holdOutputClock=false;});await page.waitForTimeout(300);
      assert.equal(await page.locator('.v2-status').innerText(),'Tạm dừng');
      assert.equal(await page.evaluate(()=>window.reviewMessages.filter(m=>m.command?.type==='clock').length),0);
      await page.getByRole('button',{name:'Đóng thiết lập',exact:true}).click();await top(page,'Tiếp tục lượt tập').click();
      await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent==='Đang tập');await top(page,'Dừng lượt tập').click();await ready(page);
      await page.evaluate(()=>{window.holdOutputClock=true;window.blockedOutputReads=0;});await top(page,'Bắt đầu tập').click();await page.waitForFunction(()=>window.blockedOutputReads>0);
      await top(page,'Dừng lượt tập').click();await page.evaluate(()=>{window.holdOutputClock=false;});await ready(page);await page.waitForTimeout(300);
      assert.equal(await top(page,'Bắt đầu tập').count(),1);assert.equal(await top(page,'Tiếp tục lượt tập').count(),0);
      await page.screenshot({path:path.join(out,'startup-mobile.png')});check('390px: late audio readiness cannot undo Pause or Stop; explicit resume works');
    }finally{await context.close();}}
    // Failed prefetch is retained at the same authored position and retried.
    if(!nativeOnly){const {context,page}=await setup();let blocked,fail=true;const requests=[];try{
      const bankBase=new URL('curriculum/',base),pointer=await (await page.request.get(new URL('manifest.json',bankBase).href)).json();
      const index=await (await page.request.get(new URL(pointer.index.path,bankBase).href)).json(),releaseBase=new URL(pointer.releaseId+'/',bankBase);
      const option=index.options.find(o=>o.grade===1&&o.lengthBucket==='n20');
      const rows=(await (await page.request.get(new URL(option.path,releaseBase).href)).json()).entries.sort((a,b)=>a.bookPosition-b.bookPosition);
      blocked=new URL(rows[1].path,releaseBase).href;
      await page.route('**/exercises/*.mxl',async route=>{const url=route.request().url();requests.push(url);if(url===blocked&&fail)return route.abort('connectionreset');return route.continue();});
      await choose(page);assert.equal(await scoreId(page),rows[0].scoreId);
      await page.getByRole('button',{name:'Bài kế tiếp',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await scoreId(page),rows[0].scoreId);
      fail=false;await page.getByRole('button',{name:'Bài kế tiếp',exact:true}).click();
      await page.waitForFunction(id=>document.querySelector('[data-testid="grade-progress"]')?.getAttribute('data-score-id')===id,rows[1].scoreId);
      assert(requests.filter(u=>u===blocked).length>=2);assert.equal(await page.getByRole('alert').count(),0);
      await page.getByRole('button',{name:'Bài kế tiếp',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-testid="grade-progress"]')?.getAttribute('data-score-id')===id,rows[2].scoreId);
      check('Network recovery retries the failed MXL and advances authored positions 1 → 2 → 3 without skipping');
    }finally{report.retryState={score:await scoreId(page).catch(()=>''),requests,alerts:await page.getByRole('alert').allTextContents()};await page.screenshot({path:path.join(out,'retry-state.png')});await context.close();}}
    // Native project/undo preservation through multiple grade audio loans.
    if(!startupOnly&&!retryOnly){const {context,page}=await setup();try{
      await nav(page,'Thư viện').click();await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.mxl'));
      await page.getByRole('region',{name:'Phát bản nhạc trong editor'}).waitFor({timeout:150000});await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:150000});
      const original=await score(page);await page.locator('#select').click();await page.locator('#up').click();const edited=await score(page);assert.notDeepEqual(edited,original);
      await nav(page,'Tập piano').click();await page.getByRole('button',{name:'Theo grade',exact:true}).click();await choose(page);
      for(let i=0;i<2;i++){
        if(i){await page.getByRole('button',{name:'Bài kế tiếp',exact:true}).click();await ready(page);}
        await top(page,'Nghe đoạn').click();await top(page,'Tạm dừng nghe').waitFor({timeout:120000});await top(page,'Dừng nghe').click();
      }
      // A malformed new audition must not discard the retained editor either.
      assert.equal(await page.evaluate(()=>window.pianist.loadPracticeScore(new TextEncoder().encode('invalid'),'invalid.mxl')),0);
      await nav(page,'Editor').click();assert.deepEqual(await score(page),edited);
      await page.locator('#undo').click();assert.deepEqual(await score(page),original);await page.locator('#redo').click();assert.deepEqual(await score(page),edited);
      // Leave a redo pending and prove it also survives another loan.
      await page.locator('#undo').click();await nav(page,'Tập piano').click();await page.getByRole('button',{name:'Theo grade',exact:true}).click();
      await page.getByRole('button',{name:'Bắt đầu tập theo grade',exact:true}).click();await ready(page);await top(page,'Nghe đoạn').click();await top(page,'Tạm dừng nghe').waitFor();await top(page,'Dừng nghe').click();
      await nav(page,'Editor').click();assert.deepEqual(await score(page),original);await page.locator('#redo').click();assert.deepEqual(await score(page),edited);
      await page.screenshot({path:path.join(out,'editor-redo-preserved.png')});check('Native Undo and pending Redo survive repeated grade listening, Next and malformed input');
    }finally{await context.close();}}
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.passed=false;report.error=String(error.stack||error);process.exitCode=1;}
  finally{releaseGate();await fs.writeFile(path.join(out,nativeOnly?'native-report.json':startupOnly?'startup-report.json':'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
