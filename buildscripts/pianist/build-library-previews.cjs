// Derivative artwork from the pinned native renderer, never a second engraver.
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname,'../..');
const {chromium} = createRequire(path.join(root,'tests/browser/pianist/package.json'))('playwright');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const base = new URL(process.env.PIANIST_URL || 'http://127.0.0.1:8787/pianist.html');
const output = path.join(root,'scores/library/previews');
(async()=>{
  const catalog = JSON.parse(await fs.readFile(path.join(root,'scores/library/catalog.json'),'utf8'));
  const previous = await fs.readFile(path.join(output,'manifest.json'),'utf8').then(JSON.parse).catch(()=>({files:[]}));
  const release = await fetch(new URL('release.json',base)).then(r=>{if(!r.ok)throw Error('Serve a packaged local build first.');return r.json();});
  const rendererVersion = release.files.find(f=>f.path==='renderer/PianistRenderer.wasm')?.sha256;
  if (!rendererVersion) throw Error('Release has no native renderer.');
  await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({channel:process.env.PIANIST_BROWSER_CHANNEL || 'msedge',headless:true});
  const page = await browser.newPage();
  const errors = []; page.on('pageerror',error=>errors.push(String(error)));
  const files = [];
  try {
    await page.route('**/__preview_builder__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Native preview builder</title>'}));
    await page.goto(new URL('__preview_builder__',base).href);
    await page.evaluate(async()=>{
      const {ExerciseRenderer} = await import('./app/exercise-renderer.js');
      const {rasterizePage} = await import('./app/library-thumbnail.js');
      window.previewRenderer = new ExerciseRenderer(); window.rasterizePage = rasterizePage;
    });
    for (const song of catalog.songs) {
      const name = song.id+'.webp', target = path.join(output,name);
      const cached = previous.rendererVersion===rendererVersion && previous.files.find(f=>f.sourceHash===song.sha256);
      const bytes = cached && await fs.readFile(target).catch(()=>null);
      if (bytes && bytes.length===cached.bytes && hash(bytes)===cached.sha256) { files.push(cached); continue; }
      const input = await fs.readFile(path.join(root,'scores/library/songs',path.basename(song.url)));
      if (input.length!==song.bytes || hash(input)!==song.sha256) throw Error('Source mismatch '+song.title);
      const result = await page.evaluate(async({bytes,filename})=>{
        const rendered = await window.previewRenderer.prepare(Uint8Array.from(bytes),filename);
        const blob = await window.rasterizePage(rendered.snapshot.pages[0]);
        return {bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),version:rendered.rendererVersion,source:rendered.sourceHash,pages:rendered.snapshot.pages.length};
      },{bytes:Array.from(input),filename:song.filename});
      if (result.version!==rendererVersion || result.source!==song.sha256) throw Error('Renderer provenance mismatch');
      const image = Buffer.from(result.bytes);
      if (image.toString('ascii',0,4)!=='RIFF' || image.toString('ascii',8,12)!=='WEBP') throw Error('Expected WebP');
      await fs.writeFile(target,image);
      files.push({sourceHash:song.sha256,path:'library/previews/'+name,sha256:hash(image),bytes:image.length,pages:result.pages});
      process.stdout.write(`${files.length}/${catalog.songs.length} ${song.title} (${image.length} bytes)\n`);
    }
    if (errors.length) throw Error(errors.join('\n'));
    const manifest = {schemaVersion:1,kind:'musescore-first-page-webp-v1',rendererVersion,files};
    await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    process.stdout.write(`Verified ${files.length} native thumbnails; ${files.reduce((n,f)=>n+f.bytes,0)} bytes total.\n`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
