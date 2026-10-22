import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeController} from '../src/practice/controller-v2';
import {timeline} from './helpers/fixtures-v2';

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
