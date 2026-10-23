import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('native preview worklet dispatches MIDI at sample offsets, leaves block-end events for the next block, and cancels queued notes on Stop',()=>{
 const source=readFileSync(new URL('../../../src/web/appjs/distr/audio_worklet_processor.js',import.meta.url),'utf8');
 const emitted:any[]=[],calls:any[]=[];
 class Worklet{port={onmessage:undefined as any,postMessage:(message:any)=>emitted.push(message)};}
 const ctx=vm.createContext({AudioWorkletProcessor:Worklet,registerProcessor(){},currentTime:1,sampleRate:48000,console,Float32Array,Float64Array});
 vm.runInContext(source+`
globalThis.instance=new MuseDriverProcessor();
instance.IS_USED_WORKER=false;instance.wasmBuffer={size:4096,ptr:0};
globalThis.native=MuseAudio;`,ctx);
 const instance=ctx.instance,native=ctx.native;
 Object.assign(native,{inited:true,HEAPU8:new Uint8Array(4096),_process:()=>{},_preparePreview:()=>true,
  _previewRender:(ptr:number,n:number)=>calls.push(['render',ptr,n]),_previewMidi:(...args:number[])=>calls.push(['midi',...args]),_stopPreview:()=>calls.push(['stop'])});
 const message=(data:any)=>instance.onMessageFromMain({data});
 const render=()=>instance.process([],[[new Float32Array(128),new Float32Array(128)]],{});
 message({type:'PREVIEW_PREPARE',request:1});render();assert(emitted.some(m=>m.type==='PREVIEW_READY'&&m.request===1));calls.length=0;
 message({type:'PREVIEW_MIDI',status:0x80,data1:60,data2:0,when:1+128/48000,order:3});
 message({type:'PREVIEW_MIDI',status:0x90,data1:60,data2:90,when:1+64/48000,order:2});
 message({type:'PREVIEW_MIDI',status:0xb0,data1:64,data2:127,when:1,order:1});
 render();assert.deepEqual(calls,[['midi',0xb0,64,127],['render',0,64],['midi',0x90,60,90],['render',512,64]]);
 assert.equal(instance.previewQueue.length,1);calls.length=0;ctx.currentTime=1+128/48000;render();assert.deepEqual(calls[0],['midi',0x80,60,0]);
 message({type:'PREVIEW_MIDI',status:0x90,data1:72,data2:90,when:5,order:4});message({type:'PREVIEW_STOP'});
 assert.equal(instance.previewQueue.length,0);assert.equal(instance.previewPending,null);assert.deepEqual(calls.at(-1),['stop']);
 calls.length=0;ctx.currentTime=5;render();assert(!calls.some(c=>c[0]==='midi'));
});

test('native driver maps future MIDI to the actual output clock, clamps late notes, and aborts font readiness without late sound',async()=>{
 const source=readFileSync(new URL('../../../src/web/appjs/distr/audiodriver.js',import.meta.url),'utf8')
  .replace(/^import[^\n]+\n/,'').replace('export default AudioDriver;','globalThis.driver=AudioDriver;');
 const messages:any[]=[];let port:any;
 class Node{port={onmessage:undefined as any,postMessage:(m:any)=>messages.push(m)};constructor(){port=this.port;}}
 const audio={currentTime:10,baseLatency:.02,outputLatency:.03,getOutputTimestamp:()=>({contextTime:9.9,performanceTime:9000}),audioWorklet:{async addModule(){}}};
 const ctx=vm.createContext({NativePlaybackClock:class{},AudioWorkletNode:Node,console:{log(){},error(){}},fetch:async()=>({async text(){return'';}}),Blob,URL:{createObjectURL:()=>''},performance:{now:()=>9000},setTimeout,clearTimeout,DOMException});
 vm.runInContext(source,ctx);await ctx.driver.setup({},null,audio);messages.length=0;
 const ready=ctx.driver.preparePreview();assert.equal(messages[0].type,'PREVIEW_PREPARE');port.onmessage({data:{type:'PREVIEW_READY',request:messages[0].request}});await ready;
 ctx.driver.previewMidi(0x90,60,90,9500);assert(Math.abs(messages.at(-1).when-10.4)<1e-9);
 ctx.driver.previewMidi(0x80,60,0,9000);assert.equal(messages.at(-1).when,10);assert(messages.at(-1).order>messages.at(-2).order);
 const abort=new AbortController(),loading=ctx.driver.preparePreview(abort.signal),rejected=assert.rejects(loading,{name:'AbortError'});const request=messages.at(-1).request;
 abort.abort();await rejected;assert.equal(messages.at(-1).type,'PREVIEW_STOP');const count=messages.length;
 port.onmessage({data:{type:'PREVIEW_READY',request}});assert.equal(messages.length,count,'a late font readiness reply cannot emit MIDI');
});
