import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeController} from '../src/practice/controller-v2';
import {timeline} from './helpers/fixtures-v2';

async function startupFixture(run:(c:PracticeController,w:{load:()=>void;messages:any[]})=>Promise<void>){
  const oldWorker=globalThis.Worker,oldWindow=globalThis.window;
  (globalThis as any).window=globalThis;let worker:any;
  const view={judgements:[],extras:[],held:[],pedal:false,intervals:[],group:0,done:false,processedMs:0,faults:[]};
  (globalThis as any).Worker=class{
    onmessage:any;onerror:any;messages:any[]=[];generation='';
    constructor(){worker=this;}
    load(){this.onmessage({data:{type:'ready',generation:this.generation,view}});}
    postMessage(d:any){this.messages.push(d);if(d.type==='load')this.generation=d.generation;
      if(d.type==='close')queueMicrotask(()=>this.onmessage({data:{type:'closed',generation:d.generation,view}}));}
    terminate(){}
  };
  const c=new PracticeController(timeline(),'startup regression');
  try{await run(c,{load:()=>worker.load(),get messages(){return worker.messages;}});}
  finally{c.dispose();(globalThis as any).Worker=oldWorker;(globalThis as any).window=oldWindow;}
}

test('pausing before the worker loads keeps the resume position at zero',async()=>{
  await startupFixture(async(c,w)=>{
    const positions:number[]=[];c.transport.start=async(_t,position)=>{positions.push(position!);};
    const start=c.start(()=>[]);c.pause();w.load();await start;
    assert.equal(c.status,'paused');assert.equal(c.elapsedMs,0);assert.deepEqual(positions,[]);
    assert.equal(w.messages.find(m=>m.command?.kind==='pause').command.atMs,0);
    await c.resume(()=>[]);assert.deepEqual(positions,[0]);
    assert.equal(w.messages.find(m=>m.command?.kind==='resume').command.atMs,0);
  });
});

test('late audio startup cannot undo Pause',async()=>{
  await startupFixture(async(c,w)=>{
    let release!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
    c.transport.start=async()=>{entered();await gate;};
    const start=c.start(()=>[]);w.load();await started;c.pause();release();await start;
    assert.equal(c.status,'paused');assert.equal(c.elapsedMs,0);
    assert.equal(w.messages.filter(m=>m.command?.type==='clock').length,0);
  });
});

test('a cancelled startup finishing after resume cannot silence the resumed attempt',async()=>{
  await startupFixture(async(c,w)=>{
    let release!:()=>void,entered!:()=>void,calls=0,silences=0;
    const enteredAudio=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
    c.transport.start=async()=>{if(++calls===1){entered();await gate;}};
    (c.transport as any).context={state:'running',close:async()=>{}};
    c.transport.silence=()=>{silences++;};
    const first=c.start(()=>[]);w.load();await enteredAudio;c.pause();
    await c.resume(()=>[]);const before=silences;assert.equal(c.status,'running');
    release();await first;
    assert.equal(c.status,'running');assert.equal(silences,before);
    assert.equal(w.messages.filter(m=>m.command?.kind==='resume').length,1);
  });
});

test('Stop before the first audio mapping records zero elapsed time',async()=>{
  await startupFixture(async(c,w)=>{
    let result:any;c.onComplete=r=>{result=r;};const pending=c.start(()=>[]);
    const finish=c.finish();w.load();await Promise.all([pending,finish]);
    assert.equal(c.status,'finished');assert.equal(result.outcome,'aborted');
    assert.equal(w.messages.find(m=>m.command?.kind==='stop').command.atMs,0);
    assert.deepEqual(result.clock.segments,[]);
  });
});

test('disposing during Worker startup cannot start a clock later',async()=>{
  const oldWorker=globalThis.Worker,oldWindow=globalThis.window;
  let worker:any,clocks=0;
  (globalThis as any).window=globalThis;
  (globalThis as any).Worker=class {onmessage:any;onerror:any;constructor(){worker=this;}postMessage(){}terminate(){}};
  try{
    const controller=new PracticeController(timeline(),'cancel');
    controller.transport.start=async()=>{clocks++;};
    const pending=controller.start(()=>[]);controller.dispose();
    await pending;assert.equal(clocks,0);assert.equal(controller.status,'finished');
  }finally{(globalThis as any).Worker=oldWorker;(globalThis as any).window=oldWindow;}
});

test('leaving during asynchronous audio startup suppresses its cancellation and creates no running timer',async()=>{
  const oldWorker=globalThis.Worker,oldWindow=globalThis.window;
  (globalThis as any).window=globalThis;
  (globalThis as any).Worker=class {
    onmessage:any;onerror:any;
    postMessage(d:any){if(d.type==='load')queueMicrotask(()=>this.onmessage({data:{type:'ready',view:{judgements:[],extras:[],intervals:[],faults:[]},generation:d.generation}}));}
    terminate(){}
  };
  try{
    const controller=new PracticeController(timeline(),'cancel');let rejectClock!:(e:Error)=>void;
    controller.transport.start=()=>new Promise((_,reject)=>{rejectClock=reject;});
    const pending=controller.start(()=>[]);
    await new Promise(resolve=>setTimeout(resolve,0));
    controller.dispose();rejectClock(Error('Audio startup cancelled'));
    await pending;assert.equal(controller.status,'finished');
  }finally{(globalThis as any).Worker=oldWorker;(globalThis as any).window=oldWindow;}
});

test('overlapping finish callers await one close and preserve the first outcome/result',async()=>{
  const oldWorker=globalThis.Worker,oldWindow=globalThis.window;
  let worker:any,closes=0,terminations=0,closeGeneration='';
  (globalThis as any).window=globalThis;
  const view={judgements:[],extras:[],held:[],pedal:false,intervals:[],group:0,done:false,processedMs:0,faults:[]};
  (globalThis as any).Worker=class {
    onmessage:any;onerror:any;
    constructor(){worker=this;}
    postMessage(d:any){
      if(d.type==='load')queueMicrotask(()=>this.onmessage({data:{type:'ready',view,generation:d.generation}}));
      if(d.type==='close'){closes++;closeGeneration=d.generation;}
    }
    terminate(){terminations++;}
  };
  const controller=new PracticeController(timeline(),'finish race');
  try{
    // No audio device is needed to isolate worker closing/persistence.
    controller.transport.start=async()=>{};
    await controller.start(()=>[]);
    const persisted:any[]=[];
    controller.onComplete=result=>{persisted.push(result);};
    let firstResolved=false,secondResolved=false;
    const first=controller.finish('complete');
    const second=controller.finish('aborted');
    assert.equal(first,second);
    void first.then(()=>{firstResolved=true;});
    void second.then(()=>{secondResolved=true;});
    await Promise.resolve();
    assert.equal(closes,1);
    assert.equal(firstResolved,false);
    assert.equal(secondResolved,false);
    assert.equal(persisted.length,0);
    assert.equal(terminations,0);
    worker.onmessage({data:{type:'closed',view,generation:closeGeneration}});
    await Promise.all([first,second]);
    assert.equal(firstResolved,true);
    assert.equal(secondResolved,true);
    assert.equal(controller.status,'finished');
    assert.equal(persisted.length,1);
    assert.equal(persisted[0].outcome,'complete');
    assert.equal(terminations,1);
    await controller.finish('aborted');
    assert.equal(closes,1);
    assert.equal(persisted.length,1);
  }finally{
    controller.dispose();
    (globalThis as any).Worker=oldWorker;(globalThis as any).window=oldWindow;
  }
});
