// Development bootstrap check; never packaged or imported by the application.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
(async()=>{
  const target=path.join(root,'build.artifacts/q0-renderer');
  await fs.mkdir(target,{recursive:true});
  for(const name of ['PianistRenderer.mjs','PianistRenderer.wasm'])await fs.copyFile(path.join(root,'.tools/web-stage-renderer',name),path.join(target,name));
  const source=await fs.readFile(path.join(root,'docs/curriculum/starter-scores/K008.mxl'));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();
    page.on('console',m=>console.log(m.type(),m.text()));
    page.on('pageerror',e=>console.error('PAGE',e));
    await page.goto('http://127.0.0.1:8787/icon.svg');
    const result=await page.evaluate(bytes=>new Promise((resolve,reject)=>{
      const code=`import create from 'http://127.0.0.1:8787/q0-renderer/PianistRenderer.mjs';
      let m;
      onmessage=async({data})=>{
        try{
          let didReady=false;
          m=await create({onRendererReady:()=>{didReady=true;},print:(...a)=>console.log(...a),printErr:(...a)=>console.warn(...a)});
          let json;
          m.onPreparedSnapshot=value=>{json=value;};
          const input=new Uint8Array(data),ptr=m._malloc(input.length);m.HEAPU8.set(input,ptr);
          const at=performance.now();
          const ok=m.ccall('preparePracticeSnapshot','number',['number','number','string'],[ptr,input.length,'K008.mxl']);
          m._free(ptr);
          postMessage({didReady,ok,elapsedMs:performance.now()-at,snapshot:json?JSON.parse(json):null});
        }catch(error){postMessage({error:String(error),stack:error?.stack});}
      };`;
      const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
      const worker=new Worker(url,{type:'module'});
      const timer=setTimeout(()=>{worker.terminate();URL.revokeObjectURL(url);reject(Error('boot timeout'));},120000);
      worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);resolve(data);};
      worker.onerror=e=>{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);reject(Error(e.message));};
      worker.postMessage(bytes);
    }),[...source]);
    await fs.writeFile(path.join(root,'artifacts/q0/renderer/boot.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({...result,snapshot:result.snapshot?{notes:result.snapshot.anchors.length,pages:result.snapshot.pages.length}:null}));
    if(result.error||!result.didReady||!result.ok)process.exitCode=1;
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
