// Compare actual MuseScore performance before/after, render every page, and
// verify notehead mapping. The Python gate separately preserves ALL music XML.
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname,'../..');
const {chromium} = createRequire(path.join(root,'tests/browser/pianist/package.json'))('playwright');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const work = path.resolve(process.argv[2] || 'artifacts/library-standardization-2026-10-25');
const pilot = process.argv.includes('--pilot');
const base = new URL(process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html');
const music = s => ({
  ...Object.fromEntries(['baseQuarterBpm','beats','durationMs','durationReference','keyReleases','occurrences',
    'pedals','performance','performed','staves','tempos','timeMap','unsupported','warnings'].map(k=>[k,s[k]])),
  anchors:s.anchors.map(({box,page,...n})=>n).sort((a,b)=>a.id.localeCompare(b.id)),
  measures:s.measures.map(({box,page,...m})=>m),
  // Native spanner allocation order is not a musical identity.
  pedals:s.pedals.map(({id,...p})=>p).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
});
(async()=>{
  const catalogBytes=await fs.readFile(path.join(work,'candidate/catalog.json'));
  const catalog=JSON.parse(catalogBytes), originals=JSON.parse(await fs.readFile(path.join(work,'originals/catalog.json'),'utf8'));
  const previous=process.argv.includes('--resume') ? await fs.readFile(path.join(work,'native-audit.json'),'utf8').then(JSON.parse).catch(()=>({results:[]})) : {results:[]};
  const rendererHash=hash(await fs.readFile(path.join(root,'build.artifacts/renderer/PianistRenderer.wasm')));
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({serviceWorkers:'block'});
  const out=path.join(work,'renders');await fs.mkdir(out,{recursive:true});
  const report={candidateCatalogSha256:hash(catalogBytes),browser:browser.version(),pilot,results:[],errors:[]};
  page.on('pageerror',e=>report.errors.push(String(e)));
  try {
    await page.route('**/__layout_audit__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Layout audit</title><div id="page"></div>'}));
    await page.goto(new URL('__layout_audit__',base).href);
    await page.evaluate(async()=>{const {ExerciseRenderer}=await import('./app/exercise-renderer.js');window.Renderer=ExerciseRenderer;window.renderer=new ExerciseRenderer();});
    const pilotIds=[0,3,5,26,36,45,77,132,138,150];
    for(let index=0;index<catalog.songs.length;index++){
      if(pilot&&!pilotIds.includes(index))continue;
      const song=catalog.songs[index], old=originals.songs[index], relative=song.url.replace('library/','');
      const cached=previous.results.find(r=>r.url===song.url&&r.sha256===song.sha256&&r.originalSha256===old.sha256&&r.passed&&r.rendererVersion===rendererHash);
      if(cached){
        const input=await fs.readFile(path.join(work,'candidate',relative)),source=await fs.readFile(path.join(work,'originals',relative));
        if(hash(input)!==song.sha256||hash(source)!==old.sha256)throw Error('Cached audit source changed');
        report.results.push(cached);continue;
      }
      const target=path.join(out,path.basename(relative,'.mxl'));await fs.mkdir(target,{recursive:true});
      const r={url:song.url,title:song.title,sha256:song.sha256,originalSha256:old.sha256,index,checks:[],pages:[]};
      report.results.push(r);
      try {
        const snapshots=[];
        for(const kind of ['originals','candidate']){
          const data=await fs.readFile(path.join(work,kind,relative));
          if(hash(data)!==(kind==='originals'?old.sha256:song.sha256))throw Error('Input hash mismatch');
          const rendered=await page.evaluate(async({bytes,filename})=>window.renderer.prepare(Uint8Array.from(bytes),filename),{bytes:[...data],filename:song.filename});
          snapshots.push(rendered.snapshot);r.rendererVersion=rendered.rendererVersion;
        }
        let [before,after]=snapshots, a=music(before),b=music(after);
        let changed=Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
        // Overlapping spanners in source scores can make MPE depend on previous
        // allocator history. Compare isolated native instances before attributing
        // any difference to this normalization. Do not relax time tolerances.
        if(changed.length){
          const isolated=[];
          for(const kind of ['originals','candidate']){
            const data=await fs.readFile(path.join(work,kind,relative));
            isolated.push(await page.evaluate(async({bytes,filename})=>{
              window.renderer.dispose();window.renderer=new window.Renderer();
              return (await window.renderer.prepare(Uint8Array.from(bytes),filename)).snapshot;
            },{bytes:[...data],filename:song.filename}));
          }
          [before,after]=isolated;a=music(before);b=music(after);
          changed=Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
          r.isolatedRendererComparison=true;
        }
        if(changed.length){await fs.writeFile(path.join(target,'music-diff.json'),JSON.stringify({before:a,after:b},null,2));throw Error('Native music changed: '+changed.join(', '));}
        r.checks.push('Exact native attacks/releases, pitches, durations, voices, ties, ornaments, repeat traversal, tempos and pedals');
        const ids=new Set(after.pages.flatMap(pg=>[...pg.svg.matchAll(/data-practice-notes="([^"]+)"/g)].flatMap(m=>m[1].split(' '))));
        r.missingGlyphs=after.anchors.filter(n=>n.visible&&!ids.has(n.id.replace(/^m\d+-/,''))).length;
        if(r.missingGlyphs)throw Error(r.missingGlyphs+' visible notes without SVG mapping');
        r.checks.push('Every visible note maps to a native SVG glyph');
        r.notes=after.anchors.length;r.oldPages=before.pages.length;r.newPages=after.pages.length;
        for(const [i,pg] of after.pages.entries()){
          await fs.writeFile(path.join(target,`${i+1}.svg`),pg.svg);
          const art=await page.evaluate(async(pg)=>{
            const host=document.getElementById('page');host.innerHTML=pg.svg;
            const svg=host.querySelector('svg'), bbox=svg.getBBox();
            const view=svg.viewBox.baseVal;
            const u=URL.createObjectURL(new Blob([pg.svg],{type:'image/svg+xml'}));
            try{
              const img=new Image();img.src=u;await img.decode();
              const c=document.createElement('canvas');c.width=1000;c.height=Math.round(c.width*pg.height/pg.width);
              const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
              return {png:c.toDataURL('image/png').split(',')[1],
                bounds:{x:bbox.x,y:bbox.y,width:bbox.width,height:bbox.height},view:{x:view.x,y:view.y,width:view.width,height:view.height},
                outside:bbox.x<view.x-2||bbox.y<view.y-2||bbox.x+bbox.width>view.x+view.width+2||bbox.y+bbox.height>view.y+view.height+2};
            }finally{URL.revokeObjectURL(u);host.replaceChildren();}
          },pg);
          await fs.writeFile(path.join(target,`${i+1}.png`),Buffer.from(art.png,'base64'));
          delete art.png;r.pages.push({page:i+1,...art});
        }
        r.passed=true;
      }catch(error){r.passed=false;r.error=String(error);}
      console.log(`${report.results.length}/${pilot?pilotIds.length:catalog.songs.length} ${r.passed?'PASS':'FAIL'} ${song.title}${r.error?' '+r.error:''}`);
      await fs.writeFile(path.join(work,pilot?'native-pilot.json':'native-audit.json'),JSON.stringify(report,null,2)+'\n');
    }
    report.passed=report.errors.length===0&&report.results.every(r=>r.passed)&&report.results.length===(pilot?pilotIds.length:catalog.songs.length);
    report.pageCount=report.results.reduce((n,r)=>n+(r.pages?.length||0),0);
    report.boundsWarnings=report.results.flatMap(r=>r.pages.filter(p=>p.outside).map(p=>({url:r.url,page:p.page})));
    await fs.writeFile(path.join(work,pilot?'native-pilot.json':'native-audit.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({passed:report.passed,editions:report.results.length,pages:report.pageCount,boundsWarnings:report.boundsWarnings}));
    if(!report.passed)process.exitCode=1;
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
