// Generate an offline review packet from actual MuseScore SVG, with provenance.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),dir=path.join(root,'artifacts/curriculum-fragments');
const out=path.join(root,'build.artifacts/q3-review');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sha=b=>createHash('sha256').update(b).digest('hex');
(async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'fragments.v1.json'),'utf8'));
  const queue=JSON.parse(await fs.readFile(path.join(dir,'review-queue.json'),'utf8'));
  const scan=JSON.parse(await fs.readFile(path.join(dir,'scan.json'),'utf8'));
  const sources=new Map(scan.sources.map(s=>[s.id,s]));
  const wanted=new Set(queue.grades.flatMap(g=>g.fragmentIds));
  const inputs=manifest.fragments.filter(f=>wanted.has(f.id));
  const release=JSON.parse(await fs.readFile(path.join(root,'build.artifacts/release.json'),'utf8'));
  for(const name of ['MuseScoreStudio.js','MuseScoreStudio.wasm'])
    assert.equal(sha(await fs.readFile(path.join(root,'build.artifacts',name))),release.files.find(f=>f.path===name)?.sha256);
  const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[path.join(root,'apps/pianist-web')]})).href);
  await build({configFile:false,base:'./',define:{'process.env.NODE_ENV':JSON.stringify('production')},
    build:{outDir:path.join(root,'build.artifacts/q3-review-lab'),emptyOutDir:true,
      lib:{entry:path.join(__dirname,'q3-review-lab.ts'),formats:['es'],fileName:()=> 'lab.js'}}});
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const report={pipeline:manifest.pipeline,release:release.version,kind:'technical-svg-review-packet',teacherReviewed:false,entries:[],errors:[]};
  const cards=[];
  try{
    const page=await browser.newPage({viewport:{width:1400,height:1000}});
    page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
    await page.goto('http://127.0.0.1:8787/pianist.html?diagnostics=1');
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/pianist/m0/piano.musicxml'));
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Đã mở piano.musicxml.',null,{timeout:180000});
    await page.locator('.loading-overlay').waitFor({state:'hidden',timeout:180000});
    await page.addScriptTag({type:'module',url:'/q3-review-lab/lab.js'});await page.waitForFunction(()=>window.q3Review);
    for(const [i,f] of inputs.entries()){
      const xml=await fs.readFile(path.join(dir,f.notation.musicXmlAsset));assert.equal(sha(xml),f.notation.sha256);
      const rendered=await page.evaluate(input=>window.q3Review(input),{bytes:[...xml],name:f.id+'.musicxml'});
      assert.deepEqual(rendered.counts,f.counts,'rendered/native timeline counts');
      const images=[],previews=[];
      for(const [p,sp] of rendered.pages.entries()){
        const name=f.id+'-'+p+'.svg';await fs.writeFile(path.join(out,name),sp.svg);images.push(name);
        previews.push(`<a href="${esc(name)}" target="_blank" title="Mở trang sheet nguyên bản" style="display:block;position:relative;height:0;padding-bottom:${sp.previewHeight/sp.width*100}%;overflow:hidden"><img style="position:absolute;inset:0" src="${esc(name)}" alt="Trích đoạn MuseScore"></a>`);
      }
      const origins=sources.get(f.sourceId).origins;
      const grades=[...new Set(f.matches.map(m=>m.grade))].sort().map(g=>'G'+g).join(' / ');
      const roles=[...new Set(f.matches.flatMap(m=>Object.values(m.handWitnesses).map(w=>w.hand==='right'?'phải':'trái')))].join(', ');
      cards.push(`<article data-grade="${esc(grades)}"><header><b>${esc(grades)} · ${f.counts.targets} nốt · ${f.counts.onsets} điểm vào</b><h2>${esc(origins.map(o=>o.title).join(' / '))}</h2><p>Ô nguồn ${f.span.startMeasure+1}–${f.span.endMeasure} · ${esc(f.selection.lineIds.join(', '))}<br>Tay tập đề xuất: ${esc(roles)} · <strong>Chưa duyệt câu nhạc/thế tay</strong></p></header>${previews.join('')}<details><summary>Nguồn và điều kiện · Bấm sheet để mở đầy đủ</summary><p>${esc(f.profileIds.join(', '))}</p><p>${esc(origins.map(o=>o.source_url).join('\n'))}</p><code>${f.id}</code></details></article>`);
      report.entries.push({id:f.id,counts:f.counts,pages:images.length,glyphs:rendered.glyphs,images,grades});
      console.log(`${i+1}/${inputs.length} SVG ${f.id.slice(0,12)} ${grades}`);
    }
    const html=`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Q3 — Kho trích đoạn để duyệt</title><style>body{margin:0;padding:24px;background:#eeeef2;color:#20222b;font:15px system-ui}main{max-width:1400px;margin:auto}h1{font-size:27px}nav{display:flex;gap:8px;margin:20px 0;flex-wrap:wrap}button{padding:9px 16px;border:1px solid #bbb;border-radius:6px;cursor:pointer;background:white}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,540px),1fr));gap:20px}article{background:white;border:1px solid #d6d6df;border-radius:10px;overflow:hidden}header,details{padding:18px}h2{font-size:18px;margin:9px 0}p{line-height:1.5;overflow-wrap:anywhere}img{width:100%;display:block}strong{color:#875400}code{font-size:11px;overflow-wrap:anywhere}summary{cursor:pointer}article[hidden]{display:none}</style><main><h1>Q3 · Trích đoạn nhạc thật</h1><p>Đã đối chiếu nguồn → music21 → MuseScore. Đây là bộ mẫu để duyệt nội dung, chưa phải kho bài đã bật trong app. Các ngưỡng grade là cấu hình sản phẩm; chưa có nhãn giáo viên piano đã duyệt.</p><nav>${['Tất cả',...Array.from({length:8},(_,i)=>'G'+(i+1))].map(x=>`<button data-filter="${x}">${x}</button>`).join('')}</nav><section>${cards.join('')}</section></main><script>document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>document.querySelectorAll('article').forEach(a=>a.hidden=b.dataset.filter!=='Tất cả'&&!a.dataset.grade.split(' / ').includes(b.dataset.filter)))</script></html>`;
    await fs.writeFile(path.join(out,'index.html'),html);
    await page.goto('http://127.0.0.1:8787/q3-review/index.html');
    await page.screenshot({path:path.join(out,'desktop.png'),fullPage:false});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(out,'mobile.png'),fullPage:false});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'review packet mobile overflow');
    report.passed=true;
  }catch(error){report.errors.push(String(error.stack||error));report.passed=false;process.exitCode=1;}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
