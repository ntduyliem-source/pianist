import test from 'node:test';
import assert from 'node:assert/strict';
import { activatePlaybackAudio } from '../src/platform/audio-session';
import { pinchZoom, midpoint } from '../src/practice/sheet-gesture';

test('pinch changes scale continuously, supports inward motion, and bounds extreme gestures', () => {
  assert.equal(pinchZoom(100, 80, {x:0,y:0}, {x:160,y:0}), 200);
  assert.equal(pinchZoom(150, 100, {x:0,y:0}, {x:50,y:0}), 75);
  assert.equal(pinchZoom(100, 80, {x:0,y:0}, {x:1,y:0}), 25);
  assert.equal(pinchZoom(100, 0, {x:0,y:0}, {x:800,y:0}), 400);
  assert.deepEqual(midpoint({x:30,y:200}, {x:130,y:300}), {x:80,y:250});
});
test('audio activation declares media playback and tolerates absent/rejected experimental API', () => {
  const session = Object.assign(new EventTarget(), {type:'auto'});
  activatePlaybackAudio({audioSession:session}); assert.equal(session.type, 'playback');
  activatePlaybackAudio({});
  const rejecting = new EventTarget();
  Object.defineProperty(rejecting, 'type', {get:()=> 'auto', set:()=>{throw Error('not supported');}});
  assert.doesNotThrow(()=>activatePlaybackAudio({audioSession:rejecting as typeof session}));
});
