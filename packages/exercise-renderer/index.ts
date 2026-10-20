import type {ScoreSnapshot} from '../score-contracts/index';

export interface RenderedExercise {
  snapshot: Omit<ScoreSnapshot, 'projectId'|'fingerprint'>;
  sourceHash: string; rendererVersion: string;
  elapsedMs: number; cacheHit: boolean; heapBytes:number;
}
type WorkerPort = Pick<Worker, 'postMessage'|'terminate'|'onmessage'|'onerror'|'onmessageerror'>;
type Pending = {resolve:(value:RenderedExercise)=>void; reject:(error:Error)=>void; cleanup:()=>void;
  filename:string; bytes:Uint8Array; size:number; cancelled:boolean};

/** Independent native renderer. No call into the editor's Module or clock. */
export class ExerciseRenderer {
  private worker?:WorkerPort;
  private ready?:Promise<void>;
  private bootResolve?:()=>void;
  private bootReject?:(error:Error)=>void;
  private bootTimer?:ReturnType<typeof setTimeout>;
  private pending=new Map<number,Pending>();
  private serial=0;
  private disposed=false;
  private active?:number;
  private activeTimer?:ReturnType<typeof setTimeout>;
  constructor(
    private readonly baseUrl=new URL('.',location.href).href,
    private readonly factory:()=>WorkerPort=()=>new Worker(new URL('./worker.ts',import.meta.url),{type:'module'}),
  ){}
  warm():Promise<void>{
    if(this.disposed)return Promise.reject(Error('Renderer đã đóng.'));
    if(this.ready)return this.ready;
    this.ready=new Promise<void>((resolve,reject)=>{this.bootResolve=resolve;this.bootReject=reject;});
    const ready=this.ready;
    try{
      const worker=this.worker=this.factory();
      worker.onmessage=({data})=>{
        if(this.worker!==worker)return;
        if(data.type==='ready'){
          clearTimeout(this.bootTimer);this.bootResolve?.();this.bootResolve=undefined;this.bootReject=undefined;return;
        }
        if(data.type==='fatal'){this.fail(Error(data.error));return;}
        if(data.type!=='result'&&data.type!=='error')return;
        if(data.id!==this.active)return;
        clearTimeout(this.activeTimer);this.active=undefined;
        const job=this.pending.get(data.id);
        this.pending.delete(data.id);
        if(job){
          job.cleanup();
          if(!job.cancelled){
            if(data.type==='result')job.resolve(data.result);else job.reject(Error(data.error||'Không dựng được câu tập.'));
          }
        }
        this.pump();
      };
      worker.onerror=event=>{if(this.worker===worker)this.fail(Error(event.message||'Renderer dừng đột ngột.'));};
      worker.onmessageerror=()=>{if(this.worker===worker)this.fail(Error('Không đọc được kết quả renderer.'));};
      this.bootTimer=setTimeout(()=>this.fail(Error('Renderer chưa khởi động được. Thử lại khi tải xong.')),90000);
      worker.postMessage({type:'init',baseUrl:this.baseUrl});
    }catch(error){this.fail(error instanceof Error?error:Error(String(error)));}
    return ready;
  }
  async prepare(bytes:Uint8Array,filename:string,signal?:AbortSignal):Promise<RenderedExercise>{
    if(!bytes.length||bytes.length>32*1024*1024)throw Error('Câu tập phải từ 1 byte đến 32 MiB.');
    if(!/\.(mxl|musicxml|xml|mscz|mscx)$/i.test(filename))throw Error('Định dạng câu tập không được hỗ trợ.');
    signal?.throwIfAborted();
    await abortable(this.warm(),signal);signal?.throwIfAborted();
    if(this.disposed)throw Error('Renderer đã đóng.');
    if(this.pending.size>=16)throw Error('Hàng đợi renderer đã đầy.');
    if([...this.pending.values()].reduce((n,job)=>n+job.size,bytes.length)>32*1024*1024)
      throw Error('Hàng đợi renderer vượt 32 MiB.');
    const id=++this.serial;
    // Transfer our own copy; never detach the library/editor's source bytes.
    const copy=bytes.slice();
    return new Promise<RenderedExercise>((resolve,reject)=>{
      const abort=()=>{
        const job=this.pending.get(id);if(!job)return;
        job.cancelled=true;job.cleanup();
        // A synchronous C++ call cannot be interrupted gracefully. Keep its
        // occupied slot until it replies; queued cancelled jobs never reach WASM.
        if(this.active!==id)this.pending.delete(id);
        reject(signal?.reason instanceof Error?signal.reason:new DOMException('Đã hủy câu tập.','AbortError'));
      };
      const cleanup=()=>{signal?.removeEventListener('abort',abort);};
      this.pending.set(id,{resolve,reject,cleanup,filename,bytes:copy,size:copy.length,cancelled:false});
      signal?.addEventListener('abort',abort,{once:true});
      this.pump();
    });
  }
  private pump(){
    if(this.active!==undefined||!this.worker)return;
    const next=this.pending.entries().next().value;if(!next)return;
    const [id,job]=next;this.active=id;
    this.activeTimer=setTimeout(()=>this.fail(Error('Dựng câu tập quá thời gian cho phép.')),30000);
    try{this.worker.postMessage({type:'render',id,filename:job.filename,bytes:job.bytes.buffer},[job.bytes.buffer as ArrayBuffer]);}
    catch(error){this.fail(error instanceof Error?error:Error(String(error)));}
  }
  private fail(error:Error){
    clearTimeout(this.bootTimer);clearTimeout(this.activeTimer);this.active=undefined;
    this.worker?.terminate();this.worker=undefined;
    this.bootReject?.(error);this.bootResolve=undefined;this.bootReject=undefined;this.ready=undefined;
    for(const job of this.pending.values()){job.cleanup();job.reject(error);}this.pending.clear();
  }
  dispose(){this.disposed=true;this.fail(Error('Renderer đã đóng.'));}
}

function abortable<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
  if(!signal)return promise;
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>{cleanup();reject(signal.reason??new DOMException('Đã hủy câu tập.','AbortError'));};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
    if(signal.aborted)abort();
  });
}
