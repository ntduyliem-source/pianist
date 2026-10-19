// The actual Worker is compared with CPython, then both scores use native MuseScore.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, 'artifacts/abc');
const base = process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html';
const sorted = rows => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
function music(s) {
  const anchors = new Map(s.anchors.map(a => [a.id, a]));
  const identity = id => {const a = anchors.get(id); return [a.pitch,a.tick,a.durationTicks,a.staff,a.voice,!!a.tieBack,a.articulations || []];};
  return {
    anchors: sorted(s.anchors.map(a => identity(a.id))),
    performed: sorted(s.performed.map(p => [identity(p.anchor),p.occurrence,p.atMs,p.endMs])),
    keyReleases: sorted((s.keyReleases || []).map(p => [identity(p.anchor),p.pitch,p.utick,p.endUtick,p.atMs,p.endMs])),
    pedals: sorted((s.pedals || []).map(p => [p.occurrence,p.tick,p.endTick,p.atMs,p.endMs])),
    occurrences:s.occurrences, beats:s.beats, durationMs:s.durationMs, baseQuarterBpm:s.baseQuarterBpm,
  };
}
function equal(a,b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a-b) <= 1e-6;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x,i) => equal(x,b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') return equal(Object.keys(a),Object.keys(b)) && Object.keys(a).every(k => equal(a[k],b[k]));
  return a === b;
}
(async () => {
  await fs.mkdir(output,{recursive:true});
  const cases = JSON.parse(await fs.readFile(path.join(output,'oracle.json'),'utf8'));
  const browser = await chromium.launch({headless:true,channel:process.env.PIANIST_BROWSER_CHANNEL || 'msedge',args:['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const result = {browser:browser.version(),cases:[],native:[],errors:[]};
  page.on('pageerror',e=>result.errors.push(String(e)));
  try {
    await page.goto(new URL('abc-lab/index.html',base).href);
    await page.waitForFunction(()=>window.abcLab);
    for (const c of cases) {
      const start = Date.now();
      const answer = await page.evaluate(async job => {
        try {return await window.abcLab.run(job);}
        catch (e) {return {ok:false,diagnostics:e.diagnostics || [{message:e.message}]};}
      },c.job);
      const {elapsedMs,...content} = answer;
      if (answer.ok) assert.deepEqual(content,c.expected,c.name+' must match original CPython');
      else {assert.equal(c.expected.ok,false,c.name+' unexpectedly rejected');assert.deepEqual(answer.diagnostics,c.expected.diagnostics,c.name+' diagnostics');}
      c.browser = answer;
      result.cases.push({name:c.name,accepted:answer.ok,wallMs:Date.now()-start,conversionMs:elapsedMs});
    }
    // A, B, A: neither upstream's global voice nor tempo state can leak.
    const firstGood = cases.find(c=>c.musicalExpectation && c.expected.ok);
    const again = await page.evaluate(job=>window.abcLab.run(job),firstGood.job);
    const {elapsedMs,...content} = again;
    assert.deepEqual(content,firstGood.expected);
    result.repeatedRequest=true;
    const interrupted = await page.evaluate(async job => {
      const timeout = await window.abcLab.runWithTimeout(job,1).then(()=>'',e=>e.message);
      const pending = window.abcLab.run(job).then(()=>'',e=>e.name);
      window.abcLab.cancel();
      return {timeout,cancel:await pending};
    },firstGood.job);
    assert.match(interrupted.timeout,/quá thời gian/);assert.equal(interrupted.cancel,'AbortError');
    assert.equal((await page.evaluate(job=>window.abcLab.run(job),firstGood.job)).ok,true);
    result.timeoutCancelRetry=true;
    await page.goto(base+'?diagnostics=1');
    const open = async input => {
      await page.locator('#file').setInputFiles(input);
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('Đã mở '),null,{timeout:120000});
      return page.evaluate(()=>{
        let value; const api=window.pianist, old=api.Module.onPracticeSnapshot;
        api.Module.onPracticeSnapshot=json=>{value=JSON.parse(json);};
        try {if(!api.getPracticeSnapshot() || !value) throw Error('Native snapshot failed');return value;}
        finally {api.Module.onPracticeSnapshot=old;}
      });
    };
    for (const c of cases.filter(c=>c.nativeSource && c.browser.ok)) {
      const original=music(await open(c.nativeSource));
      const converted=music(await open({name:c.name+'.musicxml',mimeType:'application/xml',buffer:Buffer.from(c.browser.text)}));
      const differing=Object.keys(original).filter(k=>!equal(original[k],converted[k]));
      const item={name:c.name,equivalent:!differing.length,differing};result.native.push(item);console.log(JSON.stringify(item));
      await fs.writeFile(path.join(output,c.name+'-native.json'),JSON.stringify({original,converted},null,2));
      assert.equal(differing.length,0,c.name+' must preserve the native practice events');
    }
    // Direct ABC cases also must reach the native sheet and practice snapshot.
    for (const c of cases.filter(c=>c.musicalExpectation && c.browser.ok)) {
      const s=await open({name:c.name+'.musicxml',mimeType:'application/xml',buffer:Buffer.from(c.browser.text)});
      assert.ok(s.pages.length && s.anchors.length && s.performed.length,c.name);
      const order=c.musicalExpectation.performedMeasures;
      if(order) assert.deepEqual(s.occurrences.map(o=>o.measure),order,c.name+' volta order');
      assert.ok(s.pages.some(p=>p.svg.includes('data-practice-notes')),c.name+' exact native note glyphs');
      result.native.push({name:c.name,sheet:true,anchors:s.anchors.length,performed:s.performed.length,pedals:s.pedals?.length});
    }
    assert.equal(result.errors.length,0);
    result.passed=true;
  } catch(e) {result.passed=false;result.error=String(e);process.exitCode=1;console.error(e);}
  finally {await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify(result,null,2));await browser.close();}
  console.log(JSON.stringify(result,null,2));
})();
