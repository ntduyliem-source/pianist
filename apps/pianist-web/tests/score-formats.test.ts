import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectAbc} from '../../../packages/score-formats/abc';
import {ScoreFormatClient, type FormatWorker} from '../../../packages/score-formats/client';
import {CONVERTER_VERSION, MAX_INPUT_BYTES, type FormatWorkerMessage, type FormatWorkerRequest} from '../../../packages/score-formats/model';

const bytes = (s: string) => new TextEncoder().encode(s);
const abc = 'X:1\nT:Phố và những ngón đàn\nM:4/4\nL:1/4\nK:C\nC D E F |';
test('ABC envelope preserves Unicode, BOM/CRLF and duplicate tune IDs without parsing notes', () => {
  const inspected = inspectAbc(bytes('\ufeff'+abc.replaceAll('\n','\r\n')));
  assert.equal(inspected.text,abc);assert.equal(inspected.tunes[0].title,'Phố và những ngón đàn');
  const book=inspectAbc(bytes(abc+'\n'+abc));
  assert.deepEqual(book.tunes.map(t=>[t.index,t.id]),[[0,'1'],[1,'1']]);
  assert.equal(inspectAbc(bytes('T:No X\nK:C\nC4')).tunes.length,1);
});
test('ABC preflight rejects fake content, invalid UTF-8, includes, scripts and oversized input', () => {
  for(const directive of ['%%abc-include file.abc','I:abc-include https://example.com/x','[I:abc-include other.abc]','%%beginjs','%%beginsvg'])
    assert.throws(()=>inspectAbc(bytes(abc+'\n'+directive)),/file ngoài|script/);
  for(const text of ['<score-partwise/>','X:1\nC4',abc+'\0',abc+'\n<!DOCTYPE score-partwise>'])
    assert.throws(()=>inspectAbc(bytes(text)));
  assert.throws(()=>inspectAbc(Uint8Array.of(0xff,0xfe)),/UTF-8/);
  assert.throws(()=>inspectAbc(new Uint8Array(MAX_INPUT_BYTES+1)),/32 MiB/);
});
class WorkerFake implements FormatWorker {
  onmessage: FormatWorker['onmessage']=null;onerror:FormatWorker['onerror']=null;
  requests:FormatWorkerRequest[]=[];terminated=false;
  postMessage(message:FormatWorkerRequest){this.requests.push(message);}
  terminate(){this.terminated=true;}
  emit(data:FormatWorkerMessage){this.onmessage?.({data} as MessageEvent<FormatWorkerMessage>);}
  succeed(id=this.requests.at(-1)!.id){this.emit({id,result:{ok:true,text:'<score-partwise/>',diagnostics:[],converter:CONVERTER_VERSION}});}
}
const job = {operation:'abc-to-xml' as const,text:abc};
function client(options: {bootTimeoutMs?:number;conversionTimeoutMs?:number}={}) {
  const workers:WorkerFake[]=[];
  const c=new ScoreFormatClient({...options,baseUrl:'http://localhost/score-formats/',workerFactory:()=>{const w=new WorkerFake();workers.push(w);return w;}});
  return {c,workers};
}
test('format worker is lazy, sequential, ignores stale replies and survives multiple jobs',async()=>{
  const {c,workers}=client();assert.equal(workers.length,0);
  const a=c.run(job);await assert.rejects(c.run(job),/Đang chuyển đổi/);workers[0].succeed();await a;
  const b=c.run(job);let done=false;void b.then(()=>{done=true;});workers[0].succeed(1);
  await Promise.resolve();assert.equal(done,false);workers[0].succeed();await b;
  assert.equal(workers.length,1);c.dispose();assert.equal(workers[0].terminated,true);
});
test('aborting a conversion destroys its worker and cannot publish into the retry',async()=>{
  const {c,workers}=client();const abort=new AbortController();const a=c.run(job,abort.signal);
  abort.abort();await assert.rejects(a,{name:'AbortError'});assert.equal(workers[0].terminated,true);
  const b=c.run(job);assert.equal(workers.length,2);workers[0].succeed();workers[1].succeed();assert.equal((await b).ok,true);
  c.dispose();const already=new AbortController();already.abort();await assert.rejects(c.run(job,already.signal),{name:'AbortError'});assert.equal(workers.length,2);
});
test('boot timeout and conversion timeout reset the worker and allow retry',async()=>{
  const {c,workers}=client({bootTimeoutMs:25,conversionTimeoutMs:10});
  await assert.rejects(c.run(job),/quá thời gian/);assert.equal(workers[0].terminated,true);
  const pending=c.run(job);workers[1].emit({id:workers[1].requests[0].id,phase:'ready'});
  await assert.rejects(pending,/quá thời gian/);assert.equal(workers[1].terminated,true);
  const retry=c.run(job);workers[2].succeed();await retry;c.dispose();
});
test('runtime error resets the worker; structured converter diagnostics reach the caller',async()=>{
  const {c,workers}=client();const pending=c.run(job);workers[0].onerror?.({} as ErrorEvent);
  await assert.rejects(pending,/gián đoạn/);assert.equal(workers[0].terminated,true);
  const retry=c.run(job);workers[1].emit({id:workers[1].requests[0].id,result:{ok:false,converter:CONVERTER_VERSION,diagnostics:[{level:'error',code:'upstream',message:'misplaced symbol'}]}});
  await assert.rejects(retry,/misplaced symbol/);c.dispose();
});
test('original CPython converters match hand-counted pitch/rhythm/pedal fixtures and reject known loss',()=>{
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  const result=spawnSync(process.env.PIANIST_PYTHON || 'python',['-X','utf8','tests/reference-runners/abc/oracle.py'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const corpus=JSON.parse(readFileSync(root+'artifacts/abc/oracle.json','utf8'));
  for(const name of ['invalid','unsupported-64th','cross-staff-import','da-capo-import','dal-segno-coda-import','release-policy-export'])
    assert.equal(corpus.find((c:any)=>c.name===name).expected.ok,false,name);
  for(const name of ['piano-import','tempo-repeat-tie-import','pedal-duration-import','volta-import','same-staff-voices-import'])
    assert.equal(corpus.find((c:any)=>c.name===name).expected.ok,true,name);
  const local=corpus.find((c:any)=>c.name==='pho-xa-import');if(local)assert.equal(local.expected.ok,false);
});
