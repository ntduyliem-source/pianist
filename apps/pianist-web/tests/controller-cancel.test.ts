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
