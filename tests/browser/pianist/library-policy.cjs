// Real native import admission: rejected music never replaces the score or commits a project.
const {chromium}=require('playwright');
const {zipSync,strToU8}=require('../../../apps/pianist-web/node_modules/fflate');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'artifacts/library-policy');
const base=process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1#/library';
function xml(staves,programs=staves.map(()=>1)){
  const definitions=staves.map((n,i)=>`<score-part id="P${i+1}"><part-name>${programs[i]===1?'Piano':'Flute'}</part-name><score-instrument id="I${i}"><instrument-name>${programs[i]===1?'Piano':'Flute'}</instrument-name></score-instrument><midi-instrument id="I${i}"><midi-channel>${i+1}</midi-channel><midi-program>${programs[i]}</midi-program></midi-instrument></score-part>`).join('');
  const parts=staves.map((n,i)=>`<part id="P${i+1}"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>${n}</staves>${Array.from({length:n},(_,s)=>`<clef number="${s+1}"><sign>G</sign><line>2</line></clef>`).join('')}</attributes>${Array.from({length:n},(_,s)=>(s?'<backup><duration>4</duration></backup>':'')+`<note><pitch><step>${s||i?'E':'C'}</step><octave>${s||i?3:4}</octave></pitch><duration>4</duration><voice>${s+1}</voice><type>whole</type><staff>${s+1}</staff></note>`).join('')}</measure></part>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>Library policy fixture</work-title></work><part-list>${definitions}</part-list>${parts}</score-partwise>`;
}
const mxl=text=>Buffer.from(zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'),'score.musicxml':strToU8(text)}));
const validAbc='X:1\nT:Accepted piano\nM:4/4\nL:1/4\n%%score { RH | LH }\nV:RH clef=treble name="Piano"\n%%MIDI program 0\nV:LH clef=bass\n%%MIDI program 0\nK:C\n[V:RH] C D E F|]\n[V:LH] C,4|]\n';
const invalidAbc='X:2\nT:One staff rejected\nM:4/4\nL:1/4\nV:RH clef=treble name="Piano"\n%%MIDI program 0\nK:C\nC D E F|]\n';
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await page.addInitScript(()=>{addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#diagnostics{display:none!important}';document.head.append(s);});});
  const report={checks:[],errors:[],native:[],catalog:[]};
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const check=message=>{report.checks.push(message);console.log('PASS',message);};
  const idle=()=>page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
  const upload=(name,buffer)=>page.locator('#file').setInputFiles({name,mimeType:'application/octet-stream',buffer:Buffer.from(buffer)});
  const ready=async name=>{await page.waitForFunction(n=>document.querySelector('#status')?.textContent==='Đã mở '+n+'.',name,{timeout:180000});await idle();};
  const semantics=()=>page.evaluate(()=>{const api=window.pianist,previous=api.Module.onScoreSemantics;let value;api.Module.onScoreSemantics=json=>value=JSON.parse(json);try{if(!api.getScoreSemantics())throw Error('Native semantics unavailable');return {revision:value.revision,staves:value.staves,anchors:value.anchors.map(({box,page,...n})=>n)};}finally{api.Module.onScoreSemantics=previous;}});
  const records=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('pianist-library');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,q=db.transaction('projects').objectStore('projects').getAll();q.onerror=()=>reject(q.error);q.onsuccess=()=>{const rows=q.result.map(p=>({...p,bytes:[...p.bytes],source:p.source?[...p.source]:undefined}));db.close();resolve(rows);};};}));
  const reject=async(name,bytes)=>{
    const before=await semantics(),saved=await records();await upload(name,bytes);
    const banner=page.locator('.error-banner:not(.import-notice)');await banner.waitFor({timeout:180000});await idle();
    assert.match(await banner.innerText(),/2 khuông/);assert.deepEqual(await semantics(),before);assert.deepEqual(await records(),saved);
    report.native.push({name,decision:'rejected',message:await banner.innerText()});await banner.getByRole('button',{name:'Đóng',exact:true}).click();
  };
  try{
    await page.goto(base);
    await upload('valid-grand-staff.musicxml',xml([2]));await ready('valid-grand-staff.musicxml');
    let value=await semantics();assert.equal(value.staves.length,2);assert(value.staves.every(s=>s.instruments?.length&&s.instruments.every(i=>i.programs.every(p=>p>=0&&p<=5))));
    check('Two-staff piano imports using native staff and instrument facts');
    for(const [name,data] of [['one-staff.musicxml',xml([1])],['three-staves.mxl',mxl(xml([3]))],['single-staff.abc',invalidAbc]])await reject(name,data);
    check('One staff, three staves and one-staff ABC are rejected without score or library mutation');
    await upload('two-staff-metadata.musicxml',xml([1,1],[1,74]));await ready('two-staff-metadata.musicxml');
    assert.equal((await semantics()).staves.length,2);
    check('Exactly two staves are admitted even when the source instrument metadata is inconsistent');
    const beforeCount=(await records()).length;await upload('split-piano.mxl',mxl(xml([1,1])));await ready('split-piano.mxl');value=await semantics();
    assert.equal(value.staves.length,2);assert.equal(new Set(value.staves.map(s=>s.partId)).size,2);assert.equal((await records()).length,beforeCount+1);
    check('Two separate piano parts with two treble clefs remain valid');
    const before=await semantics(),saved=await records(),book=validAbc+'\n'+invalidAbc;
    await upload('mixed-policy-book.abc',book);const dialog=page.getByRole('dialog',{name:'Chọn bài trong file ABC'});await dialog.waitFor();await dialog.locator('input[type=checkbox]').nth(1).check();await dialog.getByRole('button',{name:'Nhập 2 bài',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:'2 khuông'}).first().waitFor({timeout:180000});
    assert.deepEqual(await semantics(),before);assert.deepEqual(await records(),saved);
    await dialog.locator('input[type=checkbox]').nth(1).uncheck();await dialog.getByRole('button',{name:'Nhập 1 bài',exact:true}).click();await ready('mixed-policy-book.abc');
    assert.equal((await records()).length,saved.length+1);assert.equal((await semantics()).staves.length,2);
    check('Mixed ABC batch is atomic; deselecting the invalid tune imports exactly one valid project');
    // Prepare every shipped song with the real engine without admitting it to
    // personal storage. Parse only after C++ has destroyed its temporary score.
    const catalog=await page.evaluate(async()=>{const response=await fetch(new URL('library/catalog.json',location.href));if(!response.ok)throw Error('Bundled catalog unavailable');return response.json();});
    const sourceCatalog=JSON.parse(await fs.readFile(path.join(root,'scores/library/catalog.json'),'utf8'));
    assert.deepEqual(catalog,sourceCatalog,'served catalog must match the curated source under review');
    const beforeCatalog=await semantics(),savedBeforeCatalog=await records();
    for(const song of process.argv.includes('--admission-only')?[]:catalog.songs){
      const facts=await page.evaluate(async song=>{
        const response=await fetch(new URL(song.url,location.href));if(!response.ok)throw Error('Missing bundled song '+song.url);
        const bytes=new Uint8Array(await response.arrayBuffer());
        const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
        if(sha!==song.sha256||bytes.length!==song.bytes)throw Error('Bundled song integrity mismatch '+song.url);
        const api=window.pianist,previous=api.Module.onPreparedSemantics;let raw;
        api.Module.onPreparedSemantics=json=>{raw=String(json);};
        try{if(!api.prepareProject(bytes,song.filename,true)||!raw)throw Error('Native preparation failed '+song.url);}
        finally{api.Module.onPreparedSemantics=previous;}
        const score=JSON.parse(raw);
        return {id:song.id,title:song.title,url:song.url,sha256:sha,staves:score.staves,notes:score.anchors.length};
      },song);
      assert.equal(facts.staves.length,2,song.title+' must have exactly two native staves');
      assert.deepEqual(await semantics(),beforeCatalog,song.title+' temporary score must not change the editor');
      facts.passed=true;report.catalog.push(facts);
      console.log('CATALOG',report.catalog.length+'/'+catalog.songs.length,song.title);
    }
    assert.deepEqual(await records(),savedBeforeCatalog,'catalog verification must not create or alter personal projects');
    if(!process.argv.includes('--admission-only'))check('Every bundled song agrees with native two-staff admission; SHA and the current editor/library remain unchanged');
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.passed=false;report.error=String(error.stack||error);report.banners=await page.locator('.error-banner').allTextContents();process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify({passed:report.passed,checks:report.checks,errors:report.errors,catalogVerified:report.catalog.length,error:report.error,report:path.join(out,'report.json')},null,2));
})();
