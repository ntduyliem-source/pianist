import test from 'node:test';
import assert from 'node:assert/strict';
import {ExerciseRenderer, type RenderedExercise} from '../../../packages/exercise-renderer/index';

class FakeWorker {
  onmessage:((e:any)=>void)|null=null;
  onerror:((e:any)=>void)|null=null;
  onmessageerror:((e:any)=>void)|null=null;
  sent:any[]=[];
  stopped=false;
  postMessage(data:unknown,transfer:Transferable[]=[]){this.sent.push(structuredClone(data,{transfer}));}
  terminate(){this.stopped=true;}
  emit(data:unknown){this.onmessage?.({data});}
  jobs(){return this.sent.filter(m=>m.type==='render');}
}
const bytes=new Uint8Array([1,2,3]);
const result={sourceHash:'source',rendererVersion:'engine',elapsedMs:12,cacheHit:false,snapshot:{}} as RenderedExercise;
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function fixture(t:any){
  const workers:FakeWorker[]=[];
  const renderer=new ExerciseRenderer('https://example.test/pianist/',()=>{
    const w=new FakeWorker();workers.push(w);return w as unknown as Worker;
  });
  t.after(()=>renderer.dispose());
  const ready=renderer.warm(),worker=workers[0];worker.emit({type:'ready'});await ready;
  return {renderer,worker,workers};
}
test('renderer transfers a copy and serializes requests without touching the native editor',async t=>{
  const {renderer,worker}=await fixture(t);
  const a=renderer.prepare(bytes,'a.mxl'),b=renderer.prepare(bytes,'b.mxl');
  await turn();
  assert.equal(worker.jobs().length,1);assert.deepEqual([...bytes],[1,2,3]);
  assert.deepEqual([...new Uint8Array(worker.jobs()[0].bytes)],[1,2,3]);
  worker.emit({type:'result',id:worker.jobs()[0].id,result});
  assert.equal(await a,result);assert.equal(worker.jobs().length,2);
  worker.emit({type:'result',id:worker.jobs()[1].id,result});
  assert.equal(await b,result);
});
test('cancel queued requests before dispatch and ignore the result of an active cancelled request',async t=>{
  const {renderer,worker}=await fixture(t);
  const first=new AbortController(),second=new AbortController();
  const a=renderer.prepare(bytes,'a.mxl',first.signal),b=renderer.prepare(bytes,'b.mxl',second.signal);
  const aRejected=assert.rejects(a,{name:'AbortError'}),bRejected=assert.rejects(b,{name:'AbortError'});
  await turn();first.abort();second.abort();await Promise.all([aRejected,bRejected]);
  const c=renderer.prepare(bytes,'c.mxl');await turn();
  assert.equal(worker.jobs().length,1,'active cancelled WASM still occupies its slot');
  worker.emit({type:'result',id:worker.jobs()[0].id,result});
  assert.equal(worker.jobs().length,2);assert.equal(worker.jobs()[1].filename,'c.mxl');
  worker.emit({type:'result',id:worker.jobs()[1].id,result});await c;
});
test('queue is bounded even when the active request is cancelled',async t=>{
  const {renderer,worker}=await fixture(t);
  const requests=Array.from({length:16},(_,i)=>renderer.prepare(bytes,`${i}.mxl`));
  const settled=Promise.allSettled(requests);await turn();
  await assert.rejects(renderer.prepare(bytes,'overflow.mxl'),/đã đầy/);
  assert.equal(worker.jobs().length,1);
  renderer.dispose();assert((await settled).every(r=>r.status==='rejected'));
});
test('a bad score rejects one request; the next request can still render',async t=>{
  const {renderer,worker}=await fixture(t);
  const a=renderer.prepare(bytes,'bad.mxl'),rejected=assert.rejects(a,/invalid score/);
  const b=renderer.prepare(bytes,'valid.mxl');await turn();
  worker.emit({type:'error',id:worker.jobs()[0].id,error:'invalid score'});await rejected;
  worker.emit({type:'result',id:worker.jobs()[1].id,result});await b;
  assert.equal(worker.stopped,false);
});
test('fatal worker errors reject all jobs, permit restart and ignore stale events',async t=>{
  const {renderer,worker,workers}=await fixture(t);
  const a=renderer.prepare(bytes,'a.mxl'),b=renderer.prepare(bytes,'b.mxl');
  const rejected=Promise.all([assert.rejects(a,/crash/),assert.rejects(b,/crash/)]);
  await turn();worker.emit({type:'fatal',error:'crash'});await rejected;assert(worker.stopped);
  const ready=renderer.warm(),replacement=workers[1];
  worker.onerror?.({message:'stale crash'});worker.emit({type:'ready'});
  assert.equal(replacement.stopped,false);replacement.emit({type:'ready'});await ready;
  const c=renderer.prepare(bytes,'c.mxl');await turn();
  replacement.emit({type:'result',id:replacement.jobs()[0].id,result});await c;
});
test('cancellation while booting is immediate and does not terminate other callers',async t=>{
  const worker=new FakeWorker();
  const renderer=new ExerciseRenderer('https://example.test/',()=>worker as unknown as Worker);
  t.after(()=>renderer.dispose());
  const abort=new AbortController(),a=renderer.prepare(bytes,'a.mxl',abort.signal);
  const rejected=assert.rejects(a,{name:'AbortError'});abort.abort();await rejected;
  assert.equal(worker.stopped,false);
  worker.emit({type:'ready'});await renderer.warm();assert.equal(worker.jobs().length,0);
});
test('invalid input never boots a Worker; dispose prevents reuse',async t=>{
  let boots=0;
  const renderer=new ExerciseRenderer('https://example.test/',()=>{boots++;return new FakeWorker() as unknown as Worker;});
  t.after(()=>renderer.dispose());
  await assert.rejects(renderer.prepare(new Uint8Array(),'empty.mxl'),/32 MiB/);
  await assert.rejects(renderer.prepare(bytes,'file.pdf'),/Định dạng/);
  const abort=new AbortController();abort.abort();
  await assert.rejects(renderer.prepare(bytes,'a.mxl',abort.signal),{name:'AbortError'});
  assert.equal(boots,0);renderer.dispose();await assert.rejects(renderer.warm(),/đã đóng/);
});
test('boot timeout terminates the instance and permits a clean retry',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const workers:FakeWorker[]=[];
  const renderer=new ExerciseRenderer('https://example.test/',()=>{
    const w=new FakeWorker();workers.push(w);return w as unknown as Worker;
  });
  t.after(()=>renderer.dispose());
  const first=renderer.warm(),rejected=assert.rejects(first,/chưa khởi động/);
  t.mock.timers.tick(90001);await rejected;assert(workers[0].stopped);
  const second=renderer.warm();workers[1].emit({type:'ready'});await second;
});
test('active timeout terminates hung WASM and rejects queued work',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {renderer,worker}=await fixture(t);
  const a=renderer.prepare(bytes,'a.mxl'),b=renderer.prepare(bytes,'b.mxl');
  const rejected=Promise.all([assert.rejects(a,/quá thời gian/),assert.rejects(b,/quá thời gian/)]);
  await turn();t.mock.timers.tick(30001);await rejected;assert(worker.stopped);
});
