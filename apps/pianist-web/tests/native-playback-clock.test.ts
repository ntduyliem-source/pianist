import test from 'node:test';
import assert from 'node:assert/strict';
const {NativePlaybackClock}=await import(new URL('../../../src/web/appjs/distr/native-playback-clock.js',import.meta.url).href);

test('visuals select the native PCM block at device output, not the render head or wall timer',()=>{
  const clock=new NativePlaybackClock(),binding={epoch:1,sequenceId:7,tempoMultiplier:1};clock.observe(binding);
  clock.receive({binding,frames:[{contextTime:1.01,positionSeconds:10,status:2},{contextTime:1.02,positionSeconds:10.01,status:2}]});
  let output=1;
  const ctx={state:'running',currentTime:1.08,getOutputTimestamp:()=>({contextTime:output,performanceTime:1000})};
  assert.equal(clock.read(ctx,1,1000),null,'first note is not audible yet');
  output=1.015;assert.equal(clock.read(ctx,1,1000).positionSeconds,10);
  assert.equal(clock.read(ctx,1,1100).positionSeconds,10.01,'do not extrapolate beyond native frames even if the main thread stalled');
  ctx.state='suspended';assert.equal(clock.read(ctx,1,1100),null);
});

test('loop wraps and pauses come from native frames, and old epochs cannot contaminate tempo/seek changes',()=>{
  const clock=new NativePlaybackClock(),binding={epoch:1,sequenceId:7,tempoMultiplier:1};clock.observe(binding);
  clock.receive({binding,frames:[{contextTime:2,positionSeconds:12,status:2},{contextTime:2.003,positionSeconds:8.002,status:2},{contextTime:2.006,positionSeconds:8.004,status:1}]});
  let output=2.001;const ctx={state:'running',getOutputTimestamp:()=>({contextTime:output,performanceTime:1000})};
  assert.equal(clock.read(ctx,1,1000).positionSeconds,12);output=2.004;assert.equal(clock.read(ctx,1,1000).positionSeconds,8.002);
  output=3;assert.equal(clock.read(ctx,1,1000).positionSeconds,8.004);assert.equal(clock.read(ctx,1,1000).status,1);
  clock.observe({...binding,epoch:2,tempoMultiplier:.5});clock.receive({binding,frames:[{contextTime:3,positionSeconds:99,status:2}]});
  assert.equal(clock.read(ctx,2,1000),null);assert.equal(clock.read(ctx,1,1000),null);
});

test('fallback uses browser latency estimates, with no hard-coded millisecond offset',()=>{
  const clock=new NativePlaybackClock(),binding={epoch:1,sequenceId:7,tempoMultiplier:1};clock.observe(binding);
  clock.receive({binding,frames:[{contextTime:4,positionSeconds:4,status:2}]});
  const ctx={state:'running',currentTime:4.2,baseLatency:.01,outputLatency:.2};
  assert.equal(clock.read(ctx,1,1000),null);ctx.outputLatency=.1;assert.equal(clock.read(ctx,1,1000).positionSeconds,4);
});
