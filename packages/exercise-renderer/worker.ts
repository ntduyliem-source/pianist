import type {RenderedExercise} from './index';

type NativeModule={HEAPU8:Uint8Array;_malloc:(size:number)=>number;_free:(ptr:number)=>void;
  ccall:(name:string,returns:string,types:string[],args:unknown[])=>number;onPreparedSnapshot?:(json:string)=>void};
type Asset={path:string;bytes:number;sha256:string};
const scope=self as unknown as {onmessage:(event:MessageEvent)=>void;postMessage:(data:unknown)=>void};
let module:NativeModule,version='',initializing:Promise<void>|undefined;
let chain=Promise.resolve();
const cache=new Map<string,string>();
let cachedBytes=0;
const cacheLimit=16*1024*1024;
const sha=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))]
  .map(b=>b.toString(16).padStart(2,'0')).join('');

async function init(baseUrl:string){
  const base=new URL(baseUrl),response=await fetch(new URL('release.json',base));
  if(!response.ok)throw Error('Không tải được manifest renderer.');
  const release=await response.json() as {files:Asset[]};
  const load=async(path:string)=>{
    const expected=release.files.find(a=>a.path===path);if(!expected)throw Error('Bản phát hành chưa có renderer.');
    const r=await fetch(new URL(path,base));if(!r.ok)throw Error('Không tải được '+path);
    const bytes=new Uint8Array(await r.arrayBuffer());
    if(bytes.length!==expected.bytes||await sha(bytes)!==expected.sha256)throw Error('Tài nguyên renderer không khớp bản phát hành.');
    return {bytes,hash:expected.sha256};
  };
  const [glue,wasm]=await Promise.all([load('renderer/PianistRenderer.mjs'),load('renderer/PianistRenderer.wasm')]);
  version=wasm.hash;
  const url=URL.createObjectURL(new Blob([glue.bytes.buffer],{type:'text/javascript'}));
  try{
    const {default:create}=await import(/* @vite-ignore */ url);
    let resolveReady!:()=>void;
    const ready=new Promise<void>(resolve=>{resolveReady=resolve;});
    // The verified ES module runs from a blob URL. Emscripten still computes a
    // WASM URL even with wasmBinary; locateFile avoids resolving against blob:.
    module=await create({wasmBinary:wasm.bytes,locateFile:(path:string)=>new URL('renderer/'+path,base).href,
      onRendererReady:resolveReady,
      print:()=>{},printErr:(message:string)=>console.warn('[renderer]',message)});
    await ready;
  }finally{URL.revokeObjectURL(url);}
  scope.postMessage({type:'ready',version});
}
function remember(key:string,json:string){
  const size=json.length*2;if(size>cacheLimit)return;
  while(cache.size&&cachedBytes+size>cacheLimit){
    const first=cache.keys().next().value!;cachedBytes-=cache.get(first)!.length*2;cache.delete(first);
  }
  cache.set(key,json);cachedBytes+=size;
}
async function render(id:number,filename:string,buffer:ArrayBuffer){
  const started=performance.now(),bytes=new Uint8Array(buffer),sourceHash=await sha(bytes);
  const key=version+':'+sourceHash+':'+filename;
  let json=cache.get(key);const cacheHit=json!==undefined;
  if(json!==undefined){cache.delete(key);cache.set(key,json);}
  else{
    const ptr=module._malloc(bytes.length);if(!ptr)throw Error('Không đủ bộ nhớ để dựng câu tập.');
    try{
      module.HEAPU8.set(bytes,ptr);
      // Callback only copies the string. Parse after the native project is freed.
      module.onPreparedSnapshot=value=>{json=value;};
      if(!module.ccall('preparePracticeSnapshot','number',['number','number','string'],[ptr,bytes.length,filename])||!json)
        throw Error('MuseScore không đọc được câu tập này.');
    }finally{module._free(ptr);module.onPreparedSnapshot=undefined;}
  }
  const snapshot=JSON.parse(json!) as RenderedExercise['snapshot'];
  if(snapshot.schemaVersion!==1||!snapshot.pages?.length||!Array.isArray(snapshot.anchors)
    ||!Array.isArray(snapshot.performed)||snapshot.durationReference!=='musescore-midi')
    throw Error('Snapshot renderer không tương thích.');
  if(!cacheHit)remember(key,json!);
  scope.postMessage({type:'result',id,result:{snapshot,sourceHash,rendererVersion:version,
    elapsedMs:performance.now()-started,cacheHit,heapBytes:module.HEAPU8.byteLength} satisfies RenderedExercise});
}
scope.onmessage=({data})=>{
  if(data.type==='init'){
    initializing??=init(data.baseUrl).catch(error=>{scope.postMessage({type:'fatal',error:String(error)});throw error;});
    // Consumer requests also observe this rejection; avoid an unhandled promise.
    void initializing.catch(()=>{});return;
  }
  if(data.type!=='render')return;
  chain=chain.then(async()=>{
    try{
      if(!initializing)throw Error('Renderer chưa được khởi động.');
      await initializing;
      await render(data.id,data.filename,data.bytes);
    }catch(error){
      scope.postMessage({type:error instanceof WebAssembly.RuntimeError?'fatal':'error',id:data.id,error:String(error)});
    }
  });
};
