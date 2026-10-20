const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {zipSync,strToU8}=require('../../../apps/pianist-web/node_modules/fflate');
const root=path.resolve(__dirname,'../../..'),channel=process.env.PIANIST_BROWSER_CHANNEL||'msedge',out=path.join(root,'artifacts/abc/a5',channel);
(async()=>{
  await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,channel,args:['--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:1280,height:650},acceptDownloads:true});
  await context.addInitScript(()=>{
    const trace=window.a5={timeline:null,view:null,frames:[],commands:[],judgements:[],origin:0};
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.view){trace.view=data.view;trace.judgements.push(...data.view.judgements);}});}postMessage(data,...args){if(data.type==='load'&&data.timeline){trace.timeline=data.timeline;trace.commands=[];trace.frames=[];trace.judgements=[];trace.view=null;}if(data.type==='command'){trace.commands.push(data.command);if(data.command.type==='clock')trace.origin=performance.now()-data.command.atMs;}return super.postMessage(data,...args);}};
    const port={id:'a5-midi',name:'A5 MIDI mô phỏng',state:'connected',onmidimessage:null,async open(){},async close(){}};
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([[port.id,port]]),onstatechange:null}),configurable:true});
    window.a5Midi=bytes=>port.onmidimessage?.({data:new Uint8Array(bytes),timeStamp:performance.now()});
    setInterval(()=>{const root=document.querySelector('[data-testid=practice-v2]'),scroll=document.querySelector('#sheet-scroll');if(!root||!trace.timeline)return;
      trace.frames.push({at:performance.now()-trace.origin,context:document.querySelector('.v2-focus-context')?.textContent,top:scroll?.scrollTop,playhead:document.querySelector('[data-testid=score-playhead]')?.closest('[data-system]')?.dataset.system,
        glyphs:[...document.querySelectorAll('.note-marker')].map(n=>({ids:n.dataset.noteAnchors,part:n.dataset.nativePart,held:n.dataset.held,kind:n.getAttribute('class')}))});if(trace.frames.length>2000)trace.frames.shift();},50);
  });
  const page=await context.newPage(),errors=[],checks=[],result={browser:browser.version(),checks,errors};page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:120000});
  const field=async(name,value)=>{const el=page.getByRole('spinbutton',{name,exact:true});await el.fill(String(value));await el.press('Tab');};
  const settings=async()=>{await page.getByRole('button',{name:/Thiết lập/}).first().click();await page.getByRole('dialog').waitFor();};
  const close=()=>page.getByRole('button',{name:'Xong',exact:true}).click();
  const report=async(name)=>{await page.waitForURL(u=>u.hash==='#/results',{timeout:60000});const p=page.waitForEvent('download');await page.getByRole('button',{name:'Tải JSON',exact:true}).click();const d=await p,file=path.join(out,name+'.json');await d.saveAs(file);return JSON.parse(await fs.readFile(file,'utf8'));};
  const open=async(name,buffer)=>{await page.locator('#file').setInputFiles({name,mimeType:'application/octet-stream',buffer});await page.waitForFunction(n=>document.querySelector('#status')?.textContent==='Đã mở '+n+'.',name,{timeout:120000});await idle();await page.getByRole('button',{name:'Tập bài này',exact:true}).click();await page.getByTestId('practice-v2').waitFor();await idle();};
  try{
    const abc=await fs.readFile(path.join(root,'tests/fixtures/pianist/practice/abc-loops.abc')),xml=await fs.readFile(path.join(root,'artifacts/abc/a5/abc-loops.musicxml'),'utf8');
    const mxl=Buffer.from(zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>'),'score.musicxml':strToU8(xml)}));
    await page.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1');
    const runs={};
    for(const [format,bytes] of [['abc',abc],['mxl',mxl]]){
      await open('abc-loops.'+format,bytes);
      await page.getByRole('button',{name:'Theo BPM',exact:true}).click();await field('BPM',300);
      await settings();await field('Số vòng',3);await field('Đếm vào',2);await field('Từ ô nhịp',3);await field('Đến ô nhịp',12);await page.getByLabel('Thu phóng trong thiết lập').selectOption('150');await page.getByLabel('Tay tập',{exact:true}).selectOption('right');await close();assert.match(await page.locator('.v2-feedback-panel>summary').innerText(),/Tay phải/);await settings();await page.getByLabel('Tay tập',{exact:true}).selectOption('both');await close();
      await page.evaluate(()=>{const api=window.pianist,original=api.practicePlayback;window.nativeCalls=[];api.practicePlayback=function(...args){let before;const old=api.Module.onPracticePlayback;api.Module.onPracticePlayback=j=>before=JSON.parse(j);api.getPracticePlayback();api.Module.onPracticePlayback=old;const result=original.apply(api,args);window.nativeCalls.push({args,result,before});return result;};});
      // Preview paints native glyphs but cannot create a result or load a grader.
      const history=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('pianist-library');r.onsuccess=()=>{const db=r.result,q=db.transaction('sessions').objectStore('sessions').count();q.onsuccess=()=>{resolve(q.result);db.close();};};}));
      await page.getByRole('button',{name:/Nghe đoạn/}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.note-marker.playback')].some(n=>n.getBoundingClientRect().width>0));
      const listenSlider=page.getByRole('slider',{name:'Vị trí nghe'}),listenStart=+(await listenSlider.getAttribute('min')),listenEnd=+(await listenSlider.getAttribute('max'));
      const firstSystem=await page.getByTestId('score-playhead').evaluate(n=>n.closest('[data-system]').dataset.system);
      await page.getByRole('button',{name:'Lặp khi nghe'}).click();await listenSlider.fill(String(Math.floor((listenEnd-1000)/10)*10));
      await page.waitForFunction(first=>document.querySelector('[data-testid=score-playhead]')?.closest('[data-system]')?.dataset.system!==first,firstSystem);
      const listenBottom=await page.locator('#sheet-scroll').evaluate(n=>n.scrollTop);
      await page.waitForFunction(start=>+document.querySelector('[aria-label="Vị trí nghe"]').value<start+500,listenStart,{timeout:10000});
      await page.waitForFunction(({first,bottom})=>document.querySelector('[data-testid=score-playhead]')?.closest('[data-system]')?.dataset.system===first&&document.querySelector('#sheet-scroll').scrollTop<bottom-50,{first:firstSystem,bottom:listenBottom});
      await page.getByRole('button',{name:/Dừng nghe/}).click();
      checks.push(format+': native audition loop returns from B to A with the sheet camera');
      assert.equal(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('pianist-library');r.onsuccess=()=>{const db=r.result,q=db.transaction('sessions').objectStore('sessions').count();q.onsuccess=()=>{resolve(q.result);db.close();};};})),history);
      await page.getByRole('button',{name:/Chỉ bản nhạc/}).click();await page.getByRole('button',{name:'Ẩn thanh điều khiển'}).click();assert.ok(await page.locator('.controls-hidden').count());await page.getByRole('button',{name:/Hiện điều khiển/}).click();
      await settings();await page.getByRole('button',{name:'MIDI mô phỏng trường độ + pedal',exact:true}).click();
      await page.waitForFunction(()=>!!document.querySelector('.note-marker[data-held=true]'),null,{timeout:15000});await page.screenshot({path:path.join(out,format+'-held.png')});
      const r=await report(format+'-perfect'),trace=await page.evaluate(()=>window.a5);
      assert.equal(r.metrics.planned,90);assert.equal(r.metrics.hits,90);assert.equal(r.metrics.misses,0);assert.equal(r.r4.pedal.f1,1);assert.ok(r.r4.key.every(k=>k.status==='correct'));
      const frames=trace.frames.filter(f=>f.playhead);assert.ok(new Set(frames.map(f=>f.playhead)).size>=2,'camera spans systems');assert.ok(Math.max(...frames.map(f=>f.top))>100,'camera scrolls');
      const loops=[1,2,3].map(n=>frames.filter(f=>f.context?.includes('Vòng '+n+'/3')));assert.ok(loops.every(f=>f.length),'all three loops visible');
      // The label/cursor commit can be sampled before Sheet's scroll effect.
      // Allow one 80 ms UI update + 50 ms sample + one paint, still inside A.
      for(let i=1;i<3;i++){assert.equal(loops[i][0].playhead,loops[0][0].playhead,'camera returns to A');const priorBottom=Math.max(...loops[i-1].map(f=>f.top));assert.ok(loops[i].some(f=>f.at-loops[i][0].at<=150&&f.top<priorBottom-50),'camera returns upwards within 150 ms of loop A');}
      const anchors=new Map(r.timeline.targets.flatMap(n=>n.anchors.map(id=>[id,n])));
      let heldGlyphs=0;
      for(const frame of frames)for(const g of frame.glyphs.filter(g=>g.held==='true'&&g.part==='Note'))for(const id of g.ids.split(' ')){heldGlyphs++;assert.ok(anchors.has(id),'highlight belongs to this import');const measure=Number(/Ô (\d+)/.exec(frame.context)?.[1])-1;assert.ok(anchors.get(id).measure<=measure,'same pitch in a future measure is never held');}
      assert.ok(heldGlyphs>0);
      for(const framesAtLoop of loops.slice(1))for(const g of framesAtLoop[0].glyphs.filter(g=>/\b(hit|timing|miss)\b/.test(g.kind)))for(const id of g.ids.split(' '))assert.ok(anchors.get(id).measure===2,'old B judgement colors clear on returning to A');
      await fs.writeFile(path.join(out,format+'-frames.json'),JSON.stringify(frames));runs[format]=r;
      checks.push(format+': preview, count-in, 3 loops, native hold glyphs, full sheet and camera return');
      await page.getByRole('button',{name:'Kiểm chứng replay',exact:true}).click();await page.getByText('Replay khớp BPM, trường độ, pedal và trạng thái MIDI.',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Tập lại',exact:true}).click();await idle();await settings();await field('Số vòng',1);await field('Từ ô nhịp',1);await field('Đến ô nhịp',2);await page.getByRole('button',{name:'MIDI mô phỏng −120 ms',exact:true}).click();
      const early=await report(format+'-early');assert.ok(early.judgements.some(j=>Math.abs(j.delta+120)<.001));runs[format+'Early']=early;
    }
    assert.deepEqual(runs.abc.metrics,runs.mxl.metrics);assert.deepEqual(runs.abcEarly.metrics,runs.mxlEarly.metrics);checks.push('ABC/MXL real WebAudio BPM and -120 ms results match');
    await page.getByRole('button',{name:'Tập lại',exact:true}).click();await idle();await page.getByRole('button',{name:'Đúng nốt',exact:true}).click();
    await settings();await field('Đếm vào',0);await page.getByRole('button',{name:'Kết nối MIDI',exact:true}).click();await close();await page.getByRole('button',{name:/Bắt đầu/}).click();
    await page.waitForFunction(()=>window.a5.timeline&&document.querySelector('.v2-status')?.textContent.includes('Đang tập'));
    const first=await page.evaluate(()=>window.a5.timeline.targets.filter(n=>n.atMs===0).map(n=>n.pitch));
    await page.evaluate(()=>window.a5Midi([0x90,84,90]));await page.waitForFunction(()=>!!document.querySelector('.note-marker.wrong'));assert.equal(await page.evaluate(()=>window.a5.view.group),0);await page.evaluate(()=>window.a5Midi([0x80,84,0]));
    for(const pitch of first){await page.evaluate(p=>{window.a5Midi([0x90,p,90]);window.a5Midi([0x90,p,90]);},pitch);await page.waitForFunction(()=>!!document.querySelector('.note-marker[data-held=true]'));await page.evaluate(p=>window.a5Midi([0x80,p,0]),pitch);}
    await page.waitForFunction(()=>window.a5.view.group===1);assert.equal((await page.evaluate(()=>window.a5.judgements)).length,first.length);
    await page.getByRole('button',{name:/Tạm dừng/}).click();assert.equal(await page.locator('.note-marker[data-held=true]').count(),0);await page.getByRole('button',{name:/Tiếp tục/,exact:false}).first().click();await page.waitForFunction(()=>document.querySelector('.v2-status')?.textContent.includes('Đang tập'));assert.equal(await page.evaluate(()=>window.a5.view.group),1);
    await settings();await page.getByRole('button',{name:'Kết thúc lượt tập',exact:true}).click();const wait=await report('wait-pause');assert.equal(wait.metrics.hits,first.length);assert.equal(wait.r4.pedal.status,'wait');checks.push('Wait rejects octave, latches chord, ignores duplicate down, clears hold on pause and resumes without extra credit');
    assert.deepEqual(errors,[]);result.passed=true;
  }catch(e){result.passed=false;result.error=String(e);result.native=await page.evaluate(()=>{const a=window.pianist;let s;a.Module.onPracticePlayback=j=>s=JSON.parse(j);a.getPracticePlayback();let raw;a.Module.onScoreSemantics=j=>raw=JSON.parse(j);a.getScoreSemantics();return {state:s,calls:window.nativeCalls,duration:raw?.durationMs,occurrences:raw?.occurrences};}).catch(()=>null);process.exitCode=1;console.error(e);await fs.writeFile(path.join(out,'failure-trace.json'),JSON.stringify(await page.evaluate(()=>window.a5).catch(()=>null)));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'ui-result.json'),JSON.stringify(result,null,2));await browser.close();}console.log(result);
})();
