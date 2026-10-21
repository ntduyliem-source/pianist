// MuseScore Worker renders actual prepared units and limit fixtures. No app changes.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../../..'),args=process.argv.slice(2);
const arg=(n,f)=>args.includes(n)?args[args.indexOf(n)+1]:f;
const jobsPath=path.resolve(arg('--jobs',path.join(root,'artifacts/curriculum-prepared/jobs.json')));
const out=path.resolve(arg('--out',path.join(root,'artifacts/curriculum-prepared/render')));
const inspect=args.includes('--inspect'),catalog=arg('--catalog',null);
const sha=b=>createHash('sha256').update(b).digest('hex');
const verifierFiles=['tests/browser/pianist/q4-prepared.cjs','tests/browser/pianist/q4-lab.ts',
  'packages/exercise-renderer/index.ts','packages/exercise-renderer/worker.ts',
  'packages/exercise-generator/prepared-contract.ts','packages/exercise-generator/prepared-model.ts',
  'packages/practice-engine-v2/score-adapter.ts'];
function fixture(count,both=false,pickup=false){
  const note=(step,octave,duration=1,type='quarter',staff=1)=>`<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${staff===1?1:5}</voice><type>${type}</type><staff>${staff}</staff></note>`;
  let bars=[];
  if(pickup)bars=[note('C',4),note('D',4,2,'half')+note('E',4,2,'half')];
  else for(let n=0;n<count;n+=both?8:4){
    const steps=['C','D','E','F'].slice(0,Math.min(4,count-n));
    let bar=steps.map(s=>note(s,4)).join('');
    if(steps.length<4)bar+='<note><rest/><duration>1</duration><type>quarter</type></note>';
    if(both)bar+='<backup><duration>4</duration></backup>'+steps.map(s=>note(s,3,1,'quarter',2)).join('');
    bars.push(bar);
  }
  return Buffer.from(`<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${bars.map((b,i)=>`<measure number="${i+1}"${pickup&&i===0?' implicit="yes"':''}>${i===0?`<attributes><divisions>1</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>${both?2:1}</staves><clef number="1"><sign>G</sign><line>2</line></clef>${both?'<clef number="2"><sign>F</sign><line>4</line></clef>':''}</attributes>`:''}${b}</measure>`).join('')}</part></score-partwise>`);
}
(async()=>{
  await fs.mkdir(out,{recursive:true});for(const dir of ['snapshots','timelines','screenshots'])await fs.mkdir(path.join(out,dir),{recursive:true});
  const release=JSON.parse(await fs.readFile(path.join(root,'build.artifacts/release.json'),'utf8'));
  const rendererHashes={};
  for(const n of ['renderer/PianistRenderer.mjs','renderer/PianistRenderer.wasm']){
    rendererHashes[n]=sha(await fs.readFile(path.join(root,'build.artifacts',n)));
    assert.equal(rendererHashes[n],release.files.find(f=>f.path===n)?.sha256);
  }
  const verifierHashes={};for(const n of verifierFiles)verifierHashes[n]=sha(await fs.readFile(path.join(root,n)));
  const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[path.join(root,'apps/pianist-web')]})).href);
  await build({configFile:false,base:'./',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{
    outDir:path.join(root,'build.artifacts/q4-lab'),emptyOutDir:true,
    lib:{entry:path.join(__dirname,'q4-lab.ts'),formats:['es'],fileName:()=> 'q4-lab.js'}},worker:{format:'es'}});
  const jobs=JSON.parse(await fs.readFile(jobsPath,'utf8'));
  const report={pipeline:jobs.pipeline,rendererHashes,verifierHashes,entries:[],fixtures:[],errors:[]};
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1400,height:1000}});
  page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  try{
    await page.goto('http://127.0.0.1:8787/pianist.html?diagnostics=1');
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.musicxml'));
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Đã mở piano.musicxml.',null,{timeout:180000});
    await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
    await page.addScriptTag({type:'module',url:'/q4-lab/q4-lab.js'});await page.waitForFunction(()=>window.q4Lab);
    if(catalog){report.catalog=await page.evaluate(url=>window.q4Lab.validateCatalog(url),catalog);}
    else{
      for(const job of jobs.entries){
        const xml=await fs.readFile(job.xml);assert.equal(sha(xml),job.xmlSha256);
        const data=await page.evaluate(i=>window.q4Lab.render(i),{bytes:[...xml],name:job.id+'.musicxml',hand:job.hand});
        assert.equal(data.sourceHash,sha(xml));
        const snapshot=Buffer.from(JSON.stringify(data.snapshot)),timeline=Buffer.from(JSON.stringify(data.timeline));
        await fs.writeFile(path.join(out,'snapshots',job.id+'.json'),snapshot);
        await fs.writeFile(path.join(out,'timelines',job.id+'.json'),timeline);
        for(const [i,p] of data.snapshot.pages.entries()){
          await fs.writeFile(path.join(out,'screenshots',job.id+'-'+i+'.svg'),p.svg);
          const preview=await browser.newPage({viewport:{width:1200,height:1600}});
          await preview.setContent('<style>body{margin:0;background:white}svg{width:1200px;height:auto}</style>'+p.svg);
          await preview.screenshot({path:path.join(out,'screenshots',job.id+'-'+i+'.png'),fullPage:true});await preview.close();
        }
        report.entries.push({id:job.id,xmlSha256:sha(xml),snapshotSha256:sha(snapshot),timelineSha256:sha(timeline),
          counts:data.counts,glyphsComplete:data.glyphsComplete,editorUnchanged:data.editorUnchanged,systems:data.systems});
        console.log(job.id.slice(0,12)+' targets='+data.counts.targets+' glyphs=OK editor=unchanged');
      }
      if(!inspect)for(const [name,count,both,pickup] of [['min-3',3,false,false],['max-120',120,false,false],['grand-120',120,true,false],['pickup-3',3,false,true]]){
        const data=await page.evaluate(i=>window.q4Lab.render(i),{bytes:[...fixture(count,both,pickup)],name:name+'.musicxml'});
        assert.equal(data.counts.targets,count);if(count===120)assert(data.systems>1,'long sheet must use multiple systems');
        if(both)assert.equal(data.snapshot.staves.length,2);
        report.fixtures.push({name,counts:data.counts,systems:data.systems,glyphsComplete:data.glyphsComplete,editorUnchanged:data.editorUnchanged});
      }
    }
    report.passed=true;
  }catch(error){report.errors.push(String(error.stack||error));report.passed=false;process.exitCode=1;}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
