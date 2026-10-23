import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeEngine} from '../../../packages/practice-engine-v2/engine';
import {resultFor,replayAttempt,attemptCsv} from '../../../packages/practice-engine-v2/results';
import {assessReleases,releaseDeadline} from '../../../packages/practice-engine-v2/release-assessment';
import {createTimeline,settingsFor} from '../../../packages/practice-engine-v2/score-adapter';
import {AudioClock} from '../src/platform/audio-clock-v2';
import {timeline,midi,scoreFixture} from './helpers/fixtures-v2';

function exercise(){const t=timeline([500,1100]);t.targets.forEach((n,i)=>{n.releaseMs=n.endMs=i?1500:900;});t.pedalReference=true;t.pedals=[{id:'p',atMs:100,endMs:1700,loop:0}];t.durationMs=2000;return t;}
test('R4 uses real release events, preserves osu onset, sustain re-strike and pedal matching',()=>{
  const t=exercise(),e=new PracticeEngine(t);
  const commands=[midi(1,'pedal',100,64,127),midi(2,'on',380),midi(3,'off',900),midi(4,'on',1100),midi(5,'off',1500),midi(6,'pedal',1700,64,0)].map(event=>({type:'input' as const,event}));
  commands.forEach(c=>e.command(c));e.clock(2600);e.boundary(2600,'stop');
  const r=resultFor(t,e.view(),'R4','complete',2600);
  assert.equal(r.judgements[0].grade,'meh');assert.equal(r.judgements[0].delta,-120);
  assert.deepEqual(r.r4!.key.map(n=>n.status),['correct','correct']);
  assert.deepEqual(r.r4!.sound.map(n=>[n.expectedMs,n.actualMs,n.status]),[[1100,1100,'correct'],[1700,1700,'correct']]);
  assert.equal(r.r4!.pedal.f1,1);
  const replay=replayAttempt(t,[...commands,{type:'clock',atMs:2600},{type:'boundary',atMs:2600,kind:'stop'}]);
  assert.deepEqual(assessReleases(t,replay,'complete'),r.r4);assert(attemptCsv(r).includes('release_tolerance_ms'));
});
test('R4 final note is not cut at onset timeout; forced stop never counts as a correct release',()=>{
  const t=timeline([0]);t.targets[0].releaseMs=t.targets[0].endMs=t.durationMs=2000;
  const e=new PracticeEngine(t);e.input(midi(1,'on',0));e.clock(2400);
  assert.equal(e.view().done,false);e.input(midi(2,'off',2350));e.clock(2600);assert.equal(e.view().done,true);
  assert.equal(resultFor(t,e.view(),'Tail','complete',2600).r4!.key[0].status,'correct');
  const held=new PracticeEngine(t);held.input(midi(1,'on',0));held.clock(2600);held.boundary(2600,'stop');
  assert.equal(resultFor(t,held.view(),'Held','complete',2600).r4!.key[0].status,'unreleased');
});
test('R4 distinguishes key hold from sustain, early/late, missing note and incomplete pedal',()=>{
  const t=exercise(),e=new PracticeEngine(t);
  [midi(1,'pedal',100,64,127),midi(2,'on',500),midi(3,'off',600)].forEach(x=>e.input(x));
  e.clock(2600);e.boundary(2600,'stop');const r=resultFor(t,e.view(),'Incomplete','complete',2600).r4!;
  assert.deepEqual(r.key.map(x=>x.status),['early','no-attack']);assert.equal(r.sound[0].status,'unreleased');
  assert.equal(r.pedal.status,'partial');assert.equal(r.pedal.interrupted,1);
  const late=new PracticeEngine(t);[midi(1,'on',500),midi(2,'off',1000)].forEach(x=>late.input(x));late.clock(2600);
  assert.equal(resultFor(t,late.view(),'Late','complete',2600).r4!.key[0].status,'late');
});
test('R4 pedal off keeps physical key grading and raw CC64 but disables sustain/pedal scores',()=>{
  const t=exercise();t.settings.pedalEnabled=false;const e=new PracticeEngine(t);
  [midi(1,'pedal',100,64,127),midi(2,'on',500),midi(3,'off',900),midi(4,'pedal',1700,64,0)].forEach(x=>e.input(x));e.clock(2600);
  const r=resultFor(t,e.view(),'No pedal','complete',2600);assert.equal(r.r4!.key[0].status,'correct');assert.equal(r.r4!.pedal.status,'disabled');assert.deepEqual(r.r4!.sound,[]);assert.equal(r.controls!.length,2);
  t.settings.mode='wait';assert.equal(assessReleases(t,e.view(),'complete').pedal.status,'wait');assert.deepEqual(assessReleases(t,e.view(),'complete').key,[]);
});
test('R4 pause is censored; state-only restore cannot manufacture note or pedal credit',()=>{
  const t=exercise(),e=new PracticeEngine(t);e.input(midi(1,'pedal',100,64,127));e.input(midi(2,'on',500));e.boundary(700,'pause');e.boundary(700,'resume');
  e.input({...midi(3,'on',700),stateOnly:true});e.input({...midi(4,'pedal',700,64,127),stateOnly:true});e.input(midi(5,'off',900));e.input(midi(6,'pedal',1700,64,0));e.clock(2600);
  const r=resultFor(t,e.view(),'Paused','complete',2600).r4!;assert.equal(r.key[0].status,'interrupted');assert.equal(r.pedal.status,'partial');assert.equal(r.pedal.performed,0);
});
test('R4 count-in pedal and calibrated releases keep their timestamp; other channel does not release sustain',()=>{
  const t=exercise();t.settings.offsetMs=75;const e=new PracticeEngine(t);
  [midi(1,'pedal',-425,64,127),midi(2,'on',575),midi(3,'off',975),{...midi(4,'pedal',1775,64,0),channel:1}].forEach(x=>e.input(x));e.clock(2700);e.boundary(2700,'stop');
  const r=resultFor(t,e.view(),'Channels','complete',2700);assert.equal(r.r4!.key[0].deltaMs,0);assert.equal(r.pedalIntervals![0].onMs,-500);assert.equal(r.r4!.pedal.interrupted,1);assert.equal(r.r4!.sound[0].status,'unreleased');
});
test('R4 complete sounding tail window is included even when longer than pedal interval',()=>{
  const t=timeline([0]);t.targets[0].releaseMs=1500;t.durationMs=3000;t.pedalReference=true;t.pedals=[{id:'p',atMs:1400,endMs:3000,loop:0}];
  assert.equal(releaseDeadline(t),3600.1);
});

test('R4 synthetic CC64 off at the exact target time cannot certify a real sounding release',()=>{
  const t=exercise(),e=new PracticeEngine(t);
  [midi(1,'pedal',100,64,127),midi(2,'on',500),midi(3,'off',900),{...midi(4,'pedal',1700,64,0),synthetic:true}].forEach(x=>e.input(x));
  e.boundary(1700,'pause');e.clock(2600);
  const report=resultFor(t,e.view(),'Reset','complete',2600).r4!;
  assert.equal(report.key[0].status,'correct');assert.equal(report.sound[0].status,'interrupted');
  assert.equal(report.pedal.status,'partial');assert.equal(report.pedal.interrupted,1);
});
test('R4 adapter uses native key release rather than notation duration and never fills missing native data',()=>{
  const s=scoreFixture();s.durationReference='musescore-midi';s.keyReleases=[{anchor:'n',pitch:60,utick:480,endUtick:671,atMs:500,endMs:698.9583333333334}];
  s.pedals=[{id:0,partId:'p',occurrence:0,tick:0,endTick:960,atMs:0,endMs:1000}];
  const t=createTimeline(s,{...settingsFor(s),mode:'bpm',loops:2,loopBpmStep:20});
  assert(Math.abs(t.targets[0].releaseMs!-698.9583333333334)<1e-9);assert.equal(t.targets[0].endMs,1000);assert.equal(t.pedals!.length,2);
  assert(t.targets[1].releaseMs!>t.targets[1].atMs);assert(t.targets[1].releaseMs!-t.targets[1].atMs<199);
  const absent=createTimeline(scoreFixture(),settingsFor(scoreFixture()));assert.equal(absent.targets[0].releaseMs,undefined);assert.equal(absent.pedalReference,false);
});
test('virtual monitor sends real MIDI to native piano, preserves Note Off under pedal, and stops native voices on pause',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');const events:number[][]=[];let stops=0;
  class Audio {state='running';destination={};get currentTime(){return performance.now()/1000;}async resume(){}async close(){}
    createOscillator(){throw Error('Piano preview must not create an oscillator');}}
  Object.defineProperty(globalThis,'AudioContext',{value:Audio,configurable:true});
  const audio=new AudioClock(async()=>({async resume(){},async preparePreview(){},previewMidi:(...event:number[])=>{events.push(event);},stopPreview:()=>{stops++;}}));
  try{const t=exercise();t.settings.countIn=0;t.settings.metronome=false;await audio.start(t);
    audio.monitor(midi(1,'pedal',0,64,127));audio.monitor(midi(2,'on',0));audio.monitor(midi(3,'off',100));
    assert.deepEqual(events,[[0xb0,64,127],[0x90,60,90],[0x80,60,0]]);
    audio.monitor(midi(4,'on',200));audio.monitor(midi(5,'off',300));audio.monitor(midi(6,'pedal',400,64,0));
    assert.deepEqual(events.slice(-3),[[0x90,60,90],[0x80,60,0],[0xb0,64,0]]);
    audio.monitor(midi(7,'on',500));const before=stops;audio.silence();assert.equal(stops,before+1);
    t.settings.pedalEnabled=false;await audio.start(t);audio.monitor(midi(8,'pedal',0,64,127));assert.deepEqual(events.at(-1),[0xb0,64,0]);
    const count=events.length;audio.monitor({...midi(9,'on',0),stateOnly:true});assert.equal(events.length,count);
  }finally{await audio.dispose();if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');}
});
