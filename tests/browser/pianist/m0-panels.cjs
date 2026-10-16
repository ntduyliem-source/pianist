// Supplemental M0 feature survey; records gaps separately from the core gate.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../../..');
const channel = process.env.PIANIST_BROWSER_CHANNEL;
const output = path.join(root,'artifacts/m0',channel ? 'panels-'+channel : 'panels');
const summary = file => JSON.parse(spawnSync(process.env.PIANIST_PYTHON || 'python',[path.join(__dirname,'score-summary.py'),file],{encoding:'utf8'}).stdout);
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({headless:true,channel:channel || undefined,args:['--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});
  const page = await context.newPage(), logs=[], errors=[], results={browser:browser.version()};
  // Observe actual PCM without changing the app's output routing.
  await page.addInitScript(()=>{
    const Native = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends Native {
      constructor(...args) {
        super(...args);
        window.m0AudioContext = this.context;
        window.m0Meter = this.context.createAnalyser();
        window.m0Meter.fftSize = 2048;
        this.connect(window.m0Meter);
        this.onprocessorerror = () => { window.m0ProcessorFailed = true; };
      }
    };
  });
  page.on('console',m=>{
    logs.push(m.type()+': '+m.text());
    if (/Aborted\(|RuntimeError:|after runtime exited/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror',e=>{logs.push('PAGE ERROR: '+(e.stack || e)); errors.push(String(e));});
  page.on('dialog',d=>d.dismiss());
  const save = async name => {
    const pending = page.waitForEvent('download',{timeout:20000});
    await page.locator('#xml').click();
    const file=path.join(output,name);
    await (await pending).saveAs(file);
    return summary(file);
  };
  try {
    const url = new URL(process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html');
    url.searchParams.set('diagnostics','1');
    await page.goto(url.toString());
    await page.waitForFunction(()=>!document.querySelector('#sample').disabled,null,{timeout:120000});
    await page.locator('#sample').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Đã mở'));
    await page.mouse.click(600,400);
    const firstNote = async () => {
      await page.keyboard.press('Control+Home');
      await page.keyboard.press('ArrowRight');
    };
    await firstNote();
    await page.waitForTimeout(400); // Qt canvas renders asynchronously.
    await page.screenshot({path:path.join(output,'01-selection.png')});
    await page.mouse.click(222,130);
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(output,'02-properties.png')});
    try {
      await page.mouse.click(20,205); // Properties: Visible.
      await save('02-properties-hidden.musicxml');
      assert.ok((await fs.readFile(path.join(output,'02-properties-hidden.musicxml'),'utf8')).includes('<notehead>none</notehead>'), 'Hidden notehead must be serialized');
      await page.keyboard.press('Control+z');
      await save('02-properties-undo.musicxml');
      assert.ok(!(await fs.readFile(path.join(output,'02-properties-undo.musicxml'),'utf8')).includes('<notehead>none</notehead>'), 'Undo must restore the notehead');
      results.inspector={passed:true,check:'Hide a note, export its visibility, undo and export again'};
    } catch(e) { results.inspector={passed:false,error:String(e)}; }
    await page.mouse.click(114,130);
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(output,'03-layout.png')});
    await page.mouse.click(38,130);
    await page.mouse.click(70,421);
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(output,'04-palettes.png')});
    results.panels='Properties, layout and palette screenshots captured for visual review.';
    try {
      await page.mouse.dblclick(124,450); // Articulations: staccato.
      await save('04-staccato.musicxml');
      assert.match(await fs.readFile(path.join(output,'04-staccato.musicxml'),'utf8'), /<staccato\b/);
      await page.keyboard.press('Control+z');
      await save('04-staccato-undo.musicxml');
      assert.doesNotMatch(await fs.readFile(path.join(output,'04-staccato-undo.musicxml'),'utf8'), /<staccato\b/);
      results.palette={passed:true,check:'Apply staccato to a note, verify MusicXML, undo'};
    } catch(e) { results.palette={passed:false,error:String(e)}; }

    try {
      await page.mouse.click(600,400);
      await firstNote();
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(300);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(500);
      const notes=await save('05-paste.musicxml');
      assert.equal(notes.find(n=>n.staff===1&&n.measure===0&&n.onset==='1').midi,60);
      results.clipboard={passed:true,permissions:'clipboard-read/write explicitly granted in the isolated test context'};
    } catch(e) {
      results.clipboard={passed:false,error:String(e)};
      await page.mouse.click(55,13);
      await page.waitForTimeout(400);
      await page.screenshot({path:path.join(output,'05-edit-menu.png')});
      await page.mouse.click(92,177); // Edit > Paste.
      await page.waitForTimeout(400);
      const notes=await save('05-menu-paste.musicxml');
      results.clipboard.menuPassed=notes.find(n=>n.staff===1&&n.measure===0&&n.onset==='1').midi===60;
    }

    // Reset musical content before measuring zoom and playback.
    await page.locator('#sample').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Đã mở'));
    await page.mouse.click(800,600);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0,-2);
    await page.keyboard.up('Control');
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(output,'06-zoom.png')});
    results.zoom='Screenshot captured for visual review.';

    try {
      await page.waitForFunction(()=>window.pianist.Module.driver.inited);
      await page.locator('#audio').click();
      await page.waitForFunction(()=>window.m0AudioContext?.state==='running');
      await page.waitForTimeout(1500); // Allow asynchronous engine/track setup.
      await page.mouse.click(800,600); // Restore the notation window after menus.
      await page.keyboard.press('Control+Home');
      await page.mouse.click(1440-429,51); // Playback toolbar is aligned to the right.
      await page.waitForFunction(()=>{
        const values=new Float32Array(window.m0Meter.fftSize);
        window.m0Meter.getFloatTimeDomainData(values);
        const peak=values.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
        window.m0Peak=Math.max(window.m0Peak||0,peak);
        return Number.isFinite(peak) && peak>0.0001;
      },null,{timeout:12000});
      results.audio=await page.evaluate(()=>({passed:!window.m0ProcessorFailed,peak:window.m0Peak,state:window.m0AudioContext.state,sampleRate:window.m0AudioContext.sampleRate}));
      await page.mouse.click(1440-429,51);
    } catch(e) {
      results.audio={passed:false,error:String(e),...await page.evaluate(()=>({peak:window.m0Peak,processorFailed:!!window.m0ProcessorFailed,state:window.m0AudioContext?.state}))};
    }
    await page.screenshot({path:path.join(output,'07-audio.png')});
    await page.mouse.click(1032,94); // Note-input toolbar settings.
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(output,'08-settings.png')});
    await page.keyboard.press('Escape');
  } catch(e) { results.error=String(e); process.exitCode=1; }
  finally {
    results.runtimeErrors=errors;
    if (errors.length) process.exitCode=1;
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify(results,null,2));
    await fs.writeFile(path.join(output,'console.log'),logs.join('\n'));
    await browser.close();
  }
  console.log(JSON.stringify(results,null,2));
})();
