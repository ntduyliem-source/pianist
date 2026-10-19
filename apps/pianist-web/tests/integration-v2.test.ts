import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as Thread} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {PracticeController} from '../src/practice/controller-v2';
import {MidiRouter} from '../src/platform/midi-v2';
import {replayAttempt} from '../../../packages/practice-engine-v2/results';
import {assessReleases} from '../../../packages/practice-engine-v2/release-assessment';
import {timeline} from './helpers/fixtures-v2';
import type {AttemptResult} from '../../../packages/practice-engine-v2/model';

// Only platform I/O is supplied: the real router, controller, AudioClock,
// production Worker module and production kernels run end-to-end.
test('simulated Web MIDI → production controller/Worker: count-in, pedal, delay, 9 early hits, replay',async()=>{
  const restore=new Map<string,PropertyDescriptor|undefined>();
  const put=(k:string,v:unknown)=>{restore.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});};
  let now=10000,audioReady=false,callback=()=>{};const sounds:{at:number}[]=[];
  class FakeAudio {
    state='running';destination={};get currentTime(){return now/1000;}
    getOutputTimestamp(){return audioReady?{contextTime:now/1000-.04,performanceTime:now}:{contextTime:0,performanceTime:0};}
    async resume(){}async close(){this.state='closed';}
    createOscillator(){return{frequency:{value:0},type:'',onended:null,connect:(x:unknown)=>x,start:(at:number)=>sounds.push({at}),stop(){},disconnect(){}};}
    createGain(){return{gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}
  }
  const require=createRequire(import.meta.url),loader=pathToFileURL(require.resolve('tsx/esm/api')).href;
  class BrowserWorker {
    onmessage?:(e:{data:any})=>void;onerror?:(e:{message:string})=>void;thread:Thread;
    constructor(url:URL){
      this.thread=new Thread(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};import(${JSON.stringify(loader)}).then(({tsImport})=>tsImport(${JSON.stringify(url.href)},${JSON.stringify(import.meta.url)})).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});
      this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',e=>this.onerror?.({message:e.message}));
    }
    postMessage(data:unknown){this.thread.postMessage(data);}terminate(){void this.thread.terminate();}
  }
  const tick=()=>callback();
  put('performance',{now:()=>now,timeOrigin:1700000000000});put('AudioContext',FakeAudio);put('Worker',BrowserWorker);
  put('window',{setInterval:(fn:()=>void)=>{callback=fn;return 5;},setTimeout,clearTimeout});put('isSecureContext',true);
  const nav=Object.getOwnPropertyDescriptor(navigator,'requestMIDIAccess');
  const port={id:'simulated-piano',name:'Simulated MIDI',state:'connected',onmidimessage:null as any,async open(){},async close(){}};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>({inputs:new Map([[port.id,port]]),onstatechange:null})});
  let session:PracticeController|undefined;
  try{
    const router=new MidiRouter();await router.connect();const t=timeline(Array.from({length:9},(_,i)=>500+i*200));
    Object.assign(t.settings,{inputSource:'midi',deviceId:port.id,countIn:2});session=new PracticeController(t,'Simulated MIDI');router.onInput=e=>session!.input(e);
    const result=new Promise<AttemptResult>((resolve,reject)=>{session!.onComplete=resolve;setTimeout(()=>reject(Error('result timeout')),15000).unref();});
    const starting=session.start(()=>router.stateEvents());
    while(!session.transport.context)await new Promise(r=>setTimeout(r,5));
    // Router state may change while the output device starts. There is no valid
    // run timestamp yet, so these bytes must not enter the grading Worker.
    port.onmidimessage({data:new Uint8Array([0x90,60,90]),timeStamp:now});
    port.onmidimessage({data:new Uint8Array([0x80,60,0]),timeStamp:now});
    assert.equal(session.commands.some(c=>c.type==='input'),false);
    audioReady=true;await starting;const origin=now-session.transport.now;
    const move=(target:number)=>{while(now+20<target){now+=20;tick();}now=target;};
    const send=(at:number,bytes:number[],delay=0)=>{move(origin+at+delay);port.onmidimessage({data:new Uint8Array(bytes),timeStamp:origin+at});tick();};
    send(-500,[0xb0,64,127]);
    t.targets.forEach(n=>{send(n.atMs-120,[0x90,n.pitch,90],75);send(n.atMs-100,[0x90,n.pitch,0],75);});
    send(2400,[0xb0,64,0]);move(origin+3500);tick();
    const r=await result;assert.equal(r.metrics.hits,9);assert.equal(r.metrics.extras,0);assert.equal(r.metrics.medianAbsMs,120);
    assert(r.judgements.every(j=>j.delta===-120));assert.equal(r.intervals[0].keyOffMs,400);
    assert.equal(r.intervals.at(-1)!.soundOffMs,2400);assert.equal(r.faults.length,0);assert.equal(r.outcome,'complete');
    assert(sounds.length>0);const replay=replayAttempt(r.timeline,r.replay!.commands);assert.deepEqual(replay.judgements,r.judgements);assert.deepEqual(replay.intervals,r.intervals);

    // New production Worker/generation, pause with a physically held key,
    // then resume. Restoring held state must not create an attack at the next note.
    session.dispose();const next=timeline([500,1500]);Object.assign(next.settings,{inputSource:'midi',deviceId:port.id,countIn:1});
    session=new PracticeController(next,'Pause/resume');
    const resumedResult=new Promise<AttemptResult>((resolve,reject)=>{session!.onComplete=resolve;setTimeout(()=>reject(Error('resume timeout')),15000).unref();});
    await session.start(()=>router.stateEvents());let nextOrigin=now-session.transport.now;
    const nextSend=(at:number,bytes:number[])=>{move(nextOrigin+at);port.onmidimessage({data:new Uint8Array(bytes),timeStamp:now});tick();};
    nextSend(500,[0x90,60,90]);move(nextOrigin+700);tick();session.pause();assert.equal(session.status,'paused');
    now+=2000;await session.resume(()=>router.stateEvents());nextOrigin=now-session.transport.now;
    nextSend(1500,[0x90,60,90]); // Duplicate physical down: not a new attack.
    nextSend(1530,[0x80,60,0]);nextSend(1550,[0x90,60,90]);nextSend(1570,[0x80,60,0]);
    move(nextOrigin+2500);tick();const resumed=await resumedResult;
    assert.deepEqual(resumed.judgements.map(j=>j.delta),[0,50]);assert.equal(resumed.metrics.hits,2);
    assert.equal(resumed.clock!.segments.length,2);assert.equal(resumed.intervals[0].interrupted,true);
    assert.deepEqual(replayAttempt(resumed.timeline,resumed.replay!.commands).judgements,resumed.judgements);
    // R4 uses the same production Worker and timestamp adapter, including CC64.
    for(const pedalEnabled of [true,false]){
      session.dispose();const duration=timeline([500,1100]);duration.targets.forEach((n,i)=>{n.releaseMs=n.endMs=i?1500:900;});
      duration.durationMs=2000;duration.pedalReference=true;duration.pedals=[{id:'p',atMs:100,endMs:1700,loop:0}];
      Object.assign(duration.settings,{inputSource:'midi',deviceId:port.id,countIn:1,offsetMs:75,pedalEnabled});
      session=new PracticeController(duration,'R4 MIDI');const result=new Promise<AttemptResult>(resolve=>session!.onComplete=resolve);
      await session.start(()=>router.stateEvents());const origin=now-session.transport.now;
      for(const [at,bytes] of [[100,[0xb0,64,127]],[500,[0x90,60,90]],[900,[0x80,60,0]],[1100,[0x90,60,90]],[1500,[0x80,60,0]],[1700,[0xb0,64,0]]] as [number,number[]][]){
        move(origin+at+75+30);port.onmidimessage({data:new Uint8Array(bytes),timeStamp:origin+at+75});tick();
      }
      move(origin+2800);tick();const r=await result;
      assert.deepEqual(r.judgements.map(j=>j.delta),[0,0]);assert.deepEqual(r.r4!.key.map(n=>n.status),['correct','correct']);
      assert.equal(r.r4!.pedal.status,pedalEnabled?'scored':'disabled');if(pedalEnabled){assert.equal(r.r4!.pedal.f1,1);assert(r.r4!.sound.every(n=>n.status==='correct'));}
      assert.deepEqual(assessReleases(r.timeline,replayAttempt(r.timeline,r.replay!.commands),r.outcome),r.r4);
    }
  }finally{
    session?.dispose();for(const [key,descriptor] of restore){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
    if(nav)Object.defineProperty(navigator,'requestMIDIAccess',nav);else Reflect.deleteProperty(navigator,'requestMIDIAccess');
  }
});
