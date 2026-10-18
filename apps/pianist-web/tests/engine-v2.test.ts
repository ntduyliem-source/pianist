import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeEngine} from '../../../packages/practice-engine-v2/engine';
import {ENGINE_ID, type Timeline, type MidiEvent} from '../../../packages/practice-engine-v2/model';
import {settingsFor, createTimeline} from '../../../packages/practice-engine-v2/score-adapter';
import {resultFor, replayAttempt, canCompare} from '../../../packages/practice-engine-v2/results';
import {createStudioWait} from '../../../packages/practice-engine-v2/upstream/studio-wait.js';
import type {ScoreSnapshot} from '../../../packages/score-contracts';

import {scoreFixture,timeline,midi} from './helpers/fixtures-v2';
import {calibrationTimeline,calibrationReport} from '../src/platform/calibration-v2';
import {feedback} from '../src/practice/feedback-v2';

test('comparison rejects missing/mixed clock provenance, foreign devices and simulated attempts',()=>{
  const t=timeline(),e=new PracticeEngine(t);e.input(midi(1,'on',500));e.clock(2000);
  const a=resultFor(t,e.view(),'Clock','complete',2000),b=structuredClone(a);
  assert.equal(canCompare(a,b),false);
  a.clock={segments:[{source:'output-timestamp',originPerformanceMs:10000,audioMinusPerformanceSeconds:-.04,resumeAtMs:0}]};
  b.clock=structuredClone(a.clock);b.clock.segments[0].originPerformanceMs=20000;
  assert.equal(canCompare(a,b),true);
  b.clock.segments[0].source='audio-current-time';assert.equal(canCompare(a,b),false);
  b.clock=structuredClone(a.clock);b.settings.deviceId='other';assert.equal(canCompare(a,b),false);
  b.settings=structuredClone(a.settings);b.simulation={script:'native-targets-onset',deltaMs:-120};assert.equal(canCompare(a,b),false);
});
test('unchanged Studio Wait latches chord notes and rejects octave',()=>{
  const w=createStudioWait();w.setTargets([{id:'c',midi:60,staffId:0},{id:'e',midi:64,staffId:0}]);
  assert.deepEqual(w.input(72,true),{ids:[],wrong:true,advanced:false});
  assert.deepEqual(w.input(60,true),{ids:['c'],wrong:false,advanced:false});
  w.input(60,false);assert.equal(w.input(64,true).advanced,true);
  // The source function accepts another explicit press; the MIDI adapter below
  // decides whether a duplicate packet represents an actual new key attack.
  w.setTargets([{id:'e2',midi:64,staffId:0}]);assert.deepEqual(w.input(64,true).ids,['e2']);
});
test('Wait MIDI adapter requires release before the next same-pitch target',()=>{
  const t=timeline([0,500]);t.settings.mode='wait';const e=new PracticeEngine(t);
  e.input(midi(1,'on',0));e.input(midi(2,'on',500));e.clock(700);assert.equal(e.view().judgements.length,1);
  e.input(midi(3,'off',710));e.input(midi(4,'on',800));e.clock(1000);assert.equal(e.view().judgements.length,2);
});
test('count-in pedal is preserved independently of attack eligibility',()=>{
  const t=timeline([0]),e=new PracticeEngine(t);
  [midi(1,'pedal',-500,64,127),midi(2,'on',0),midi(3,'off',100),midi(4,'pedal',1000,64,0)].forEach(x=>e.input(x));
  e.clock(1400);assert.equal(e.view().judgements[0].grade,'perfect');
  assert.deepEqual(e.view().intervals[0],{sequence:2,pitch:60,channel:0,portId:'virtual',onMs:0,keyOffMs:100,soundOffMs:1000});
});
test('Wait does not credit a key pressed during count-in; holding it cannot credit the first group',()=>{
  const t=timeline([0]);t.settings.mode='wait';const e=new PracticeEngine(t);e.input(midi(1,'on',-50));e.clock(200);assert.equal(e.view().judgements.length,0);
  e.input(midi(2,'off',300));e.input(midi(3,'on',400));e.clock(600);assert.equal(e.view().judgements.length,1);
});
test('a consumed early Miss remains in the input-precision denominator',()=>{
  const t=timeline([500,1000],[60,64]),e=new PracticeEngine(t);e.input(midi(1,'on',340));e.input(midi(2,'on',1000,64));e.clock(2000);
  const r=resultFor(t,e.view(),'Precision','complete',2000);assert.equal(r.metrics.inputs,2);assert.equal(r.metrics.precision,.5);
});
test('calibration uses production judgement and reports signed bias without changing the engine offset',()=>{
  const t=calibrationTimeline(settingsFor(scoreFixture())),e=new PracticeEngine(t);let sequence=0;
  for(const n of t.targets){e.input(midi(++sequence,'on',n.atMs+75));e.input(midi(++sequence,'off',n.atMs+100));}
  e.clock(11000);const report=calibrationReport(resultFor(t,e.view(),'Calibration','complete',11000));
  assert.deepEqual(report,{count:12,offset:75,spread:0,eligible:true});assert.equal(t.settings.offsetMs,0);
});
test('score highlight retains visited measures but clears the prior pass on a repeat',()=>{
  const t=timeline([0,500,1000],[60,62,60]);t.visits=[{id:0,measure:0,occurrence:0,loop:0,startMs:0,endMs:500},{id:1,measure:1,occurrence:1,loop:0,startMs:500,endMs:1000},{id:2,measure:0,occurrence:2,loop:0,startMs:1000,endMs:1500}];
  t.targets.forEach((n,i)=>{n.spans=[{anchor:i===1?'d':'c',visit:i,atMs:n.atMs,endMs:n.endMs}];});
  const e=new PracticeEngine(t);e.input(midi(1,'on',0));e.input(midi(2,'off',10));e.clock(800);
  assert.equal(feedback(t,e.view(),600,[]).markers.get('c')?.kind,'hit');
  assert.notEqual(feedback(t,e.view(),1000,[]).markers.get('c')?.kind,'hit');
});
test('offset applies once; opposite signs produce the same corrected attack',()=>{
  for(const offsetMs of [-100,100]){const t=timeline();t.settings.offsetMs=offsetMs;const e=new PracticeEngine(t);
    e.input(midi(1,'on',500+offsetMs));e.clock(2000);assert.equal(e.view().judgements[0].delta,0);}
});
test('9 repeated attacks at -120ms survive frame rates, delayed delivery and replay',()=>{
  const t=timeline(Array.from({length:9},(_,i)=>500+i*200));let expected:unknown;
  for(const tick of [16,40,100]){
    const commands:Parameters<PracticeEngine['command']>[0][]=[],e=new PracticeEngine(t),inputs:MidiEvent[]=[];
    t.targets.forEach((n,i)=>inputs.push(midi(i*2+1,'on',n.atMs-120,60,90,100),midi(i*2+2,'off',n.atMs-110,60,0,100)));
    let index=0;
    for(let clock=0;clock<3200;clock+=tick){while(index<inputs.length&&inputs[index].receivedMs<=clock)commands.push({type:'input',event:inputs[index++]});commands.push({type:'clock',atMs:clock});}
    commands.forEach(c=>e.command(c));const v=e.view();assert.equal(v.judgements.length,9);
    assert(v.judgements.every(j=>j.delta===-120&&j.grade==='meh'));assert.equal(v.extras.length,0);
    const decisions={judgements:v.judgements,extras:v.extras};if(expected)assert.deepEqual(decisions,expected);else expected=decisions;
    assert.deepEqual(replayAttempt(t,commands),v);
  }
});
test('whole-beat early key held through onset receives no hit; duplicate NoteOn is not an attack',()=>{
  const e=new PracticeEngine(timeline());e.input(midi(1,'on',0));e.input(midi(2,'on',500));e.clock(2000);
  assert.equal(e.view().judgements[0].grade,'miss');assert.equal(e.view().extras.length,1);
});
test('late input is a delivery fault, not a fabricated wrong note',()=>{
  const e=new PracticeEngine(timeline());e.input(midi(1,'on',500,60,90,151));assert.deepEqual(e.view().faults,['input-delivery-outside-bound']);assert.equal(e.view().judgements.length,0);
});
test('chord signed offsets do not cancel absolute timing; extras reported outside upstream accuracy',()=>{
  const t=timeline([500,500],[60,64]),e=new PracticeEngine(t);
  [midi(1,'on',400,60),midi(2,'on',600,64),midi(3,'on',610,72)].forEach(x=>e.input(x));e.clock(2000);
  const r=resultFor(t,e.view(),'Chord','complete',2000);
  assert.equal(r.metrics.signedMeanMs,0);assert.equal(r.metrics.medianAbsMs,100);assert.equal(r.metrics.accuracy,100/305);assert.equal(r.metrics.precision,2/3);
});
test('pause closes raw intervals, does not miss future notes; resume does not re-credit held state',()=>{
  const t=timeline([500,1500]),e=new PracticeEngine(t);e.input(midi(1,'on',500));e.boundary(700,'pause');
  assert.equal(e.view().judgements.length,1);assert.equal(e.view().intervals[0].interrupted,true);
  e.boundary(700,'resume');e.input({...midi(2,'on',700),stateOnly:true});e.input(midi(3,'off',800));e.input(midi(4,'on',1500));e.clock(2500);
  assert.equal(e.view().judgements.filter(j=>j.grade==='perfect').length,2);
});
test('native ticks and tempo-map are distinct; repeats, loop and beat unit preserve occurrence identity',()=>{
  const s=scoreFixture();s.performed[0].atMs=750;s.performed[0].endMs=1200;s.occurrences[0].endMs=2500;
  const c=settingsFor(s);assert.equal(createTimeline(s,c).targets[0].atMs,500);
  assert.equal(createTimeline(s,{...c,tempoMode:'score'}).targets[0].atMs,750);
  assert.equal(createTimeline(s,{...c,beatQuarter:.5}).targets[0].atMs,1000);
  const repeated={...s,occurrences:[...s.occurrences,{index:1,measure:0,startMs:2500,endMs:5000,utick:1920}],performed:[...s.performed,{anchor:'n',occurrence:1,atMs:3250,endMs:3700}]};
  const t=createTimeline(repeated,{...c,loops:2,loopBpmStep:30});
  assert.deepEqual(t.targets.map(n=>n.atMs),[500,2500,4900,6500]);assert.equal(new Set(t.targets.map(n=>n.id)).size,4);
});
