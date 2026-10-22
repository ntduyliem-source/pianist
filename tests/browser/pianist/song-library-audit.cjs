// Validate user-supplied scores in the real MuseScore engine before curating.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(root,process.env.PIANIST_IMPORT_DIR||'artifacts/song-import');
(async()=>{
  const inputs=JSON.parse(await fs.readFile(path.join(out,'inputs.json'),'utf8'));
  const b=await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader']}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[],results=[];
  let firstImportDone=false;const consoleLog=[];p.on('console',m=>{consoleLog.push(m.text());if(consoleLog.length>250)consoleLog.shift();});p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  const state=()=>p.evaluate(()=>{const api=window.pianist,old=api.Module.onEditorPlayback;let result;api.Module.onEditorPlayback=j=>result=JSON.parse(j);try{if(!api.getEditorPlayback())throw Error('Missing playback state');return result;}finally{api.Module.onEditorPlayback=old;}});
  try{
    await p.goto(process.env.PIANIST_URL||'http://127.0.0.1:8787/pianist.html?diagnostics=1');
    for(const row of inputs){
      const r={filename:row.filename,sha256:row.sha256,status:row.status,reason:row.reason};
      if(row.status!=='candidate'){results.push(r);continue;}
      try{
        if(!firstImportDone){const chooser=p.waitForEvent('filechooser');await p.getByRole('button',{name:'Nhập bản nhạc',exact:true}).click();await(await chooser).setFiles(row.path);firstImportDone=true;}else await p.locator('#file').setInputFiles(row.path);
        await p.waitForFunction(name=>document.querySelector('#status')?.textContent==='Đã mở '+name+'.'||document.querySelector('.error-banner:not(.import-notice)'),row.filename,{timeout:120000});
        await p.locator('.loading-overlay').waitFor({state:'hidden',timeout:120000});
        const error=p.locator('.error-banner:not(.import-notice)');if(await error.count())throw Error(await error.innerText());
        await p.waitForFunction(()=>{const a=window.pianist;if(!a?.getEditorPlayback)return false;const old=a.Module.onEditorPlayback;let r;a.Module.onEditorPlayback=j=>r=JSON.parse(j);try{a.getEditorPlayback();return r?.available;}finally{a.Module.onEditorPlayback=old;}},null,{timeout:60000});
        const snapshot=await p.evaluate(()=>{const a=window.pianist,old=a.Module.onPracticeSnapshot;let s;a.Module.onPracticeSnapshot=j=>s=JSON.parse(j);try{if(!a.getPracticeSnapshot())throw Error('Snapshot limits or import failure');return s;}finally{a.Module.onPracticeSnapshot=old;}});
        if(process.env.PIANIST_IMPORT_EDITOR_ONLY==='1'){
          Object.assign(r,await p.evaluate(()=>{
            const a=window.pianist,old=a.Module.onXmlExported;let bytes;
            a.Module.onXmlExported=data=>bytes=new Uint8Array(data);
            try{if(!a.exportScore('musicxml')||!bytes)throw Error('Missing editor MusicXML');}
            finally{a.Module.onXmlExported=old;}
            const xml=new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml');
            if(xml.querySelector('parsererror'))throw Error('Invalid editor MusicXML');
            const notes=[...xml.querySelectorAll('note')].filter(n=>n.querySelector('pitch'));
            return {editorNotes:notes.length,editorGraceNotes:notes.filter(n=>n.querySelector('grace')).length};
          }));
        }
        const ids=new Set(snapshot.pages.flatMap(pg=>[...pg.svg.matchAll(/data-practice-notes="([^"]+)"/g)].flatMap(m=>m[1].split(' '))));
        Object.assign(r,{nativeNotes:snapshot.anchors.length,sourceNotes:row.writtenNotes,measures:snapshot.measures.length,pages:snapshot.pages.length,performed:snapshot.performed.length,keyReleases:snapshot.keyReleases.length,pedals:snapshot.pedals.length,durationMs:snapshot.durationMs,missingGlyphs:snapshot.anchors.filter(a=>a.visible&&!ids.has(a.id.replace(/^m\d+-/,''))).length,features:snapshot.notationFeatures});
        assert.ok(snapshot.durationMs>0&&snapshot.performed.length>0,'empty practice');
        const before=await state();await p.getByRole('region',{name:'Phát bản nhạc trong editor'}).getByRole('button',{name:'Phát nhạc',exact:true}).click();
        await p.waitForFunction(()=>{const a=window.pianist,old=a.Module.onEditorPlayback;let r;a.Module.onEditorPlayback=j=>r=JSON.parse(j);try{a.getEditorPlayback();return r?.status==='playing'&&r.positionSeconds>.25;}finally{a.Module.onEditorPlayback=old;}},null,{timeout:20000});
        await p.getByRole('button',{name:'Dừng phát nhạc',exact:true}).click();r.nativePlayback=true;r.playbackDuration=before.durationSeconds;
        assert.equal(r.missingGlyphs,0,'visible notes without native SVG mapping');
        if(r.nativeNotes!==r.sourceNotes){
          if(process.env.PIANIST_IMPORT_EDITOR_ONLY==='1'&&r.editorNotes===r.sourceNotes&&r.sourceNotes-r.nativeNotes===row.graceNotes&&row.graceNotes>0){
            r.status='editor-only';r.reason=`Nghe/chỉnh sửa đầy đủ ${r.editorNotes} nốt; bộ tập chưa hỗ trợ ${row.graceNotes} nốt hoa mỹ.`;
          }else throw Error(`Bản tập chỉ có ${r.nativeNotes}/${r.sourceNotes} nốt nguồn; có nốt hoa mỹ chưa được bộ chấm theo dõi đầy đủ.`);
        }else r.status='accepted';
        if(results.filter(x=>x.status==='accepted').length<2)await p.screenshot({path:path.join(out,row.sha256.slice(0,12)+'.png')});
      }catch(e){r.status='excluded';r.reason=String(e.message||e);r.failurePlayback=await state().catch(()=>null);r.driver=await p.evaluate(()=>window.pianist?.Module.driver?.inited);r.console=consoleLog.slice(-45);if(await p.locator('.error-banner button').count())await p.locator('.error-banner button').first().click().catch(()=>{});}
      results.push(r);console.log(r.status,r.filename,r.reason||`${r.nativeNotes} notes / ${r.pages} pages / playback OK`);
      await fs.writeFile(path.join(out,'native-audit.json'),JSON.stringify({browser:b.version(),results,errors},null,2));
    }
    assert.deepEqual(errors,[]);
    console.log({accepted:results.filter(r=>r.status==='accepted').length,editorOnly:results.filter(r=>r.status==='editor-only').length,excluded:results.filter(r=>r.status==='excluded').length,errors});
  }finally{await fs.writeFile(path.join(out,'native-audit.json'),JSON.stringify({browser:b.version(),results,errors},null,2));await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
