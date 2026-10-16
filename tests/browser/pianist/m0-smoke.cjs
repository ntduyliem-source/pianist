// Exercises the actual browser UI and compares exported musical content.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, 'artifacts/m0', process.env.PIANIST_BROWSER_CHANNEL || 'browser');
const fixture = path.join(root, 'tests/fixtures/pianist/m0/piano.mxl');
const summary = file => {
  const r = spawnSync(process.env.PIANIST_PYTHON || 'python', [path.join(__dirname,'score-summary.py'), file], {encoding:'utf8'});
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};
(async () => {
  await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({headless:true, channel:process.env.PIANIST_BROWSER_CHANNEL || undefined, args:['--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page = await context.newPage();
  const errors = [], consoleLog = [], checks = [];
  const record = message => { checks.push(message); console.log(message); };
  page.on('pageerror', error => { errors.push(String(error)); console.error(String(error)); });
  page.on('console', message => {
    consoleLog.push(message.type()+': '+message.text());
    if (message.type() === 'error') console.error(message.text());
    if (/Aborted\(|RuntimeError:|after runtime exited/.test(message.text())) errors.push(message.text());
  });
  page.on('dialog', dialog => dialog.dismiss());
  const start = Date.now();
  const save = async (button, filename) => {
    const pending = page.waitForEvent('download',{timeout:45000});
    await page.locator(button).click();
    const download = await pending;
    const file = path.join(output,filename);
    await download.saveAs(file);
    return file;
  };
  const open = async filename => {
    await page.locator('#file').setInputFiles(filename);
    await page.waitForFunction(name => document.querySelector('#status').textContent.startsWith('Đã mở ' + name + '.'), path.basename(filename), {timeout:45000});
  };
  let result;
  try {
    await page.goto(process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html', {waitUntil:'domcontentloaded',timeout:120000});
    await page.locator('#sample').waitFor({state:'visible'});
    await page.waitForFunction(() => !document.querySelector('#sample').disabled || document.querySelector('#status').textContent.startsWith('Không khởi động'), null, {timeout:120000});
    assert.equal(await page.locator('#sample').isDisabled(), false, await page.locator('#status').textContent());
    const readyMs = Date.now()-start;
    assert.ok(await page.locator('#screen canvas').count(), 'MuseScore canvas must exist');
    record('real WASM editor initialized');
    await open(fixture);
    await page.locator('summary').click();
    const original = summary(path.join(root,'tests/fixtures/pianist/m0/piano.musicxml'));
    const imported = summary(await save('#xml','01-imported.musicxml'));
    assert.deepEqual(imported, original, 'MXL import must preserve pitch, rhythm and staves');
    await open(path.join(root,'tests/fixtures/pianist/m0/piano.musicxml'));
    assert.deepEqual(summary(await save('#xml','01-plain-xml-imported.musicxml')), original);
    await open(fixture);
    record('MXL and plain MusicXML import preserve fixture content');
    await page.locator('#select').click();
    await page.locator('#up').click();
    const edited = summary(await save('#xml','02-edited.musicxml'));
    // MuseScore's pitch-up command raises selected notes by one semitone.
    const raised = imported.map(n => ({...n,midi:n.midi===null ? null : n.midi+1}));
    assert.deepEqual(edited, raised, 'Pitch edits must preserve all rhythms, rests and staves');
    record('editor pitch command changes exported score');
    await page.locator('#undo').click();
    assert.deepEqual(summary(await save('#xml','03-undo.musicxml')), imported);
    await page.locator('#redo').click();
    assert.deepEqual(summary(await save('#xml','04-redo.musicxml')), edited);
    record('undo and redo restore the expected musical content');
    const project = await save('#save','05-saved.mscz');
    const mxl = await save('#mxl','06-exported.mxl');
    await open(fixture);
    await open(project);
    assert.deepEqual(summary(await save('#xml','07-project-reopened.musicxml')), edited);
    record('saved MSCZ reopens with edits');
    await open(mxl);
    assert.deepEqual(summary(await save('#xml','08-mxl-reopened.musicxml')), edited);
    record('exported MXL reimports with edits');
    await page.locator('#file').setInputFiles({name:'bad.mxl',mimeType:'application/octet-stream',buffer:Buffer.from('not a score')});
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Lỗi:'));
    assert.deepEqual(summary(await save('#xml','09-after-bad-input.musicxml')), edited);
    record('bad import keeps current project');
    await page.locator('#file').setInputFiles({name:'bad.musicxml',mimeType:'application/xml',buffer:Buffer.from('<score-partwise><part')});
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Lỗi:'));
    assert.deepEqual(summary(await save('#xml','10-after-bad-xml.musicxml')), edited);
    assert.equal(errors.length, 0, 'Rejected input must not abort the WASM runtime');
    record('malformed XML is rejected without aborting the runtime');

    // Coordinates are for this fixture/viewport, observed from the real editor.
    // Focus the notation canvas, then use actual keyboard events (no bridge).
    await open(fixture);
    await page.mouse.click(800,500);
    const key = chord => page.keyboard.press(chord);
    await key('Control+a');
    await key('ArrowUp');
    assert.deepEqual(summary(await save('#xml','11-keyboard-pitch.musicxml')), edited);
    await key('Control+z');
    assert.deepEqual(summary(await save('#xml','12-keyboard-undo.musicxml')), original);
    record('canvas selection, pitch shortcut and Ctrl+Z work');

    await page.mouse.click(617,477); // First C4 note; Ctrl+Home selects the clef.
    await key('4'); // MuseScore eighth-note duration shortcut.
    const shorter = summary(await save('#xml','13-duration.musicxml'));
    assert.equal(shorter.find(n => n.staff===1 && n.midi!==null && n.onset==='0').duration,'1/2');
    await key('Control+z');
    assert.deepEqual(summary(await save('#xml','14-duration-undo.musicxml')), original);
    record('changing note duration through the keyboard works');

    await key('Control+a');
    await key('Delete');
    assert.equal(summary(await save('#xml','15-deleted.musicxml')).filter(n=>n.midi!==null).length,0);
    record('Delete removes selected notes');
    await key('Control+Home');
    await key('n');
    await key('5'); // Quarter note.
    await key('c');
    await key('d');
    await key('Escape');
    const added = summary(await save('#xml','16-added.musicxml'));
    assert.deepEqual(added.filter(n=>n.midi!==null).map(n=>({pitchClass:n.midi%12,duration:n.duration,onset:n.onset})),[
      {pitchClass:0,duration:'1',onset:'0'}, {pitchClass:2,duration:'1',onset:'1'}
    ]);
    const addedProject = await save('#save','17-added.mscz');
    await open(addedProject);
    assert.deepEqual(summary(await save('#xml','18-added-reopened.musicxml')), added);
    record('note entry adds C/D quarter notes and survives save/reopen');
    await page.screenshot({path:path.join(output,'editor.png')});
    const metrics = await page.evaluate(() => ({
      wasmHeapBytes: window.pianist.Module.HEAPU8.buffer.byteLength,
      jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
      resources: performance.getEntriesByType('resource').map(r => ({name:r.name,bytes:r.encodedBodySize,durationMs:Math.round(r.duration)}))
    }));
    result={passed:true,readyMs,metrics,browser:browser.version(),checks,errors};
    if(errors.length) throw new Error('Browser runtime errors: '+errors.join('\n'));
  } catch(error) {
    result={passed:false,checks,errors,error:String(error)};
    await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
    process.exitCode=1;
  } finally {
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
    await fs.writeFile(path.join(output,'console.log'),consoleLog.join('\n'));
    await browser.close();
  }
  console.log(JSON.stringify(result,null,2));
})();
