import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForAudioReady,type AudioReadyModule} from '../../../src/web/appjs/distr/audio-ready.js';

test('native audio startup waits for registered MS Basic and shares the same readiness operation',async()=>{
  let calls=0;const previous=()=>{},module:AudioReadyModule={onAudioReady:previous,ccall(){calls++;queueMicrotask(()=>module.onAudioReady?.(calls>=3));}};
  const a=waitForAudioReady(module,{pollMs:1,timeoutMs:1000}),b=waitForAudioReady(module);
  assert.equal(a,b);assert.equal(calls,1);await a;assert.equal(calls,3);assert.equal(module.onAudioReady,previous);
  await waitForAudioReady(module);assert.equal(calls,3);
});
test('missing native soundfont times out without accepting a first score; retry can succeed',async()=>{
  let ready=false;const previous=()=>{},module:AudioReadyModule={onAudioReady:previous,ccall(){queueMicrotask(()=>module.onAudioReady?.(ready));}};
  await assert.rejects(waitForAudioReady(module,{pollMs:1,timeoutMs:25}),/MS Basic/);
  assert.equal(module.onAudioReady,previous);assert.equal(module.audioReadyPromise,undefined);
  ready=true;await waitForAudioReady(module,{pollMs:1,timeoutMs:1000});assert.equal(module.onAudioReady,previous);
});
