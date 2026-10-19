import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioClock} from '../src/platform/audio-clock-v2';
import {timeline} from './helpers/fixtures-v2';

// A running AudioContext can still report zero before rendering its first block.
// Reproduce that browser state; keep the production mapping/coherence guard.
async function coldAudio(run:(clock:AudioClock,ready:()=>void)=>Promise<void>){
  const original=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');let ready=false,reads=0;
  class Audio {
    state='running';sampleRate=48000;get currentTime(){return ready?performance.now()/1000:0;}
    getOutputTimestamp(){return ready?{contextTime:performance.now()/1000-.04,performanceTime:performance.now()}:reads++?{contextTime:.00001,performanceTime:performance.now()}:{contextTime:0,performanceTime:0};}
    async resume(){}async close(){this.state='closed';}
  }
  Object.defineProperty(globalThis,'AudioContext',{value:Audio,configurable:true});const clock=new AudioClock();
  try{await run(clock,()=>{ready=true;});}finally{await clock.dispose();if(original)Object.defineProperty(globalThis,'AudioContext',original);else Reflect.deleteProperty(globalThis,'AudioContext');}
}
test('cold audio waits for real output position before mapping count-in or MIDI timestamps',async()=>{
  await coldAudio(async(clock,ready)=>{
    const t=timeline([]);Object.assign(t.settings,{countIn:0,metronome:false});
    let resolved=false;const start=clock.start(t).then(()=>{resolved=true;});
    await new Promise(r=>setTimeout(r,30));assert.equal(resolved,false);assert.equal(clock.mapping.originPerformanceMs,0);
    ready();await start;assert.equal(clock.mapping.source,'output-timestamp');assert.equal(clock.coherent(),true);
    assert.ok(Math.abs(clock.mapping.audioMinusPerformanceSeconds+.04)<.001);
    const at=750;assert.ok(Math.abs(clock.at(clock.performanceAt(at))-at)<1e-9);
  });
});
test('closing a context while its output clock is unavailable aborts startup without scheduling',async()=>{
  await coldAudio(async(clock)=>{
    const t=timeline([]);Object.assign(t.settings,{countIn:0,metronome:false});
    const rejected=assert.rejects(clock.start(t),/bị ngắt/);
    await new Promise(r=>setTimeout(r,15));await clock.dispose();await rejected;
    assert.equal(clock.mapping.originPerformanceMs,0);
  });
});
