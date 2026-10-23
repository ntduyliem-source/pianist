import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreFixture,midi} from './helpers/fixtures-v2';
import {createTimeline,settingsFor} from '../../../packages/practice-engine-v2/score-adapter';
import {PracticeEngine} from '../../../packages/practice-engine-v2/engine';
import {resultFor} from '../../../packages/practice-engine-v2/results';
import {tempoAt} from '../../../packages/practice-engine-v2/tempo';
import {beatPosition} from '../src/practice/score-viewport';
import {AudioClock} from '../src/platform/audio-clock-v2';

function unison(){
 const s=scoreFixture();s.durationReference='musescore-midi';s.staves.push({id:1,part:'Piano',partId:'p2'});
 s.anchors[0].tick=0;s.anchors[0].durationTicks=240;
 s.anchors.push({...s.anchors[0],id:'left',staff:1,visualStaff:1,track:4,durationTicks:960});
 s.performed=[{anchor:'n',occurrence:0,atMs:0,endMs:250},{anchor:'left',occurrence:0,atMs:0,endMs:1000}];
 // Native CompatMidiRender values captured from the two-Piano-part fixture.
 s.keyReleases=[{anchor:'n',pitch:60,utick:0,endUtick:227,atMs:0,endMs:236.45833333333331,velocity:43},
 {anchor:'left',pitch:60,utick:0,endUtick:911,atMs:0,endMs:948.9583333333334,velocity:97}];return s;
}
test('hand and voice selection exclude unselected unison release, velocity and highlight anchors before merging',()=>{
 const s=unison();
 for(const voices of [false,true]){
  if(voices){s.anchors[1].staff=0;s.anchors[1].voice=1;}
  const c={...settingsFor(s),mode:'bpm' as const,hand:'right' as const,voices:[0],accompaniment:true};
  const t=createTimeline(s,c);assert.deepEqual(t.targets[0].anchors,['n']);assert.equal(t.targets[0].velocity,43);assert.equal(t.targets[0].endMs,250);assert.equal(t.guide.length,0);
  const e=new PracticeEngine(t);e.input(midi(1,'on',0));e.input(midi(2,'off',236.45833333333331));e.clock(3000);
  assert.equal(resultFor(t,e.view(),'Native unison','complete',3000).r4!.key[0].status,'correct');
 }
 const both=createTimeline(unison(),{...settingsFor(unison()),mode:'bpm',hand:'both'});
 assert.equal(both.targets.length,1);assert.equal(both.targets[0].releaseMs,948.9583333333334);assert.equal(both.targets[0].velocity,97);
});
test('BPM display keeps current tempo across loop gaps and partial dotted beats',()=>{
 const s=scoreFixture(),t=createTimeline(s,{...settingsFor(s),mode:'bpm',loops:2,loopBpmStep:30});
 assert.equal(beatPosition(t,1500).bpm,120);assert.equal(beatPosition(t,2499).bpm,120);assert.equal(beatPosition(t,2500).bpm,150);
 s.measures.push({...s.measures[0],index:1,tick:1920,endTick:3840});s.occurrences.push({index:1,measure:1,startMs:2000,endMs:4000,utick:1920});
 const dotted=createTimeline(s,{...settingsFor(s),mode:'bpm',beatQuarter:1.5});assert.equal(beatPosition(dotted,1000).bpm,120);
});
test('native tempo changes keep their BPM at a cut, repeat and selected beat unit',()=>{
 const s=scoreFixture();s.tempos=[{occurrence:0,atMs:0,quarterBpm:120},{occurrence:0,atMs:1000,quarterBpm:180}];
 const t=createTimeline(s,{...settingsFor(s),mode:'bpm',tempoMode:'score',loops:2,loopBpmStep:30});
 assert.equal(tempoAt(t,999),120);assert.equal(tempoAt(t,1000),180);assert.equal(tempoAt(t,t.visits[1].startMs+800),225);
});
test('BPM refuses unsupported selected musical events without penalising a played native arpeggio; Wait and other hands remain available',()=>{
 const s=unison();s.unsupported=[{kind:'arpeggio',measure:0,staff:0,voice:0}];
 const c={...settingsFor(s),mode:'bpm' as const};assert.throws(()=>createTimeline(s,c),/Chưa chấm BPM.*rải hợp âm/);
 assert.doesNotThrow(()=>createTimeline(s,{...c,hand:'left'}));assert.doesNotThrow(()=>createTimeline(s,{...c,mode:'wait'}));
 for(const kind of ['arpeggio','ornament','grace'] as const){
  s.unsupported=[{kind,measure:0,staff:0,voice:0}];
  assert.throws(()=>createTimeline(s,{...c,hand:'left',accompaniment:true}),/tay đệm.*tắt tay đệm/);
  assert.doesNotThrow(()=>createTimeline(s,{...c,hand:'left',accompaniment:false}));
  s.unsupported=[{kind,measure:0,staff:0,voice:1}];
  assert.doesNotThrow(()=>createTimeline(s,{...c,hand:'left',accompaniment:true,voices:[0]}));
 }
 s.unsupported=[{kind:'pause',measure:0}];assert.doesNotThrow(()=>createTimeline(s,c));assert.throws(()=>createTimeline(s,{...c,tempoMode:'score'}),/nghỉ có thời lượng riêng/);
 s.unsupported=undefined;s.warnings=['grace'];assert.throws(()=>createTimeline(s,c),/nốt luyến nhỏ/);
});
test('resume count-in uses the current loop tempo instead of initial BPM',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
 class Audio {state='running';get currentTime(){return performance.now()/1000;}async resume(){}async close(){}}
 Object.defineProperty(globalThis,'AudioContext',{value:Audio,configurable:true});
 const s=scoreFixture(),t=createTimeline(s,{...settingsFor(s),mode:'bpm',loops:2,loopBpmStep:30});const audio=new AudioClock();
 const sounds:number[]=[];(audio as any).sound=(at:number)=>sounds.push(at);
 try{const resume=t.visits[1].startMs;await audio.start(t,resume);Object.defineProperty(audio,'now',{get:()=>resume-200});audio.pump();
  assert.equal(audio.countInBeatMs,400);assert.deepEqual(sounds.filter(at=>at<resume).sort((a,b)=>a-b),[900,1300,1700,2100]);
 }finally{await audio.dispose();if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');}
});
test('Stop while native piano is loading cannot prepare or schedule a late voice',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
 class Audio {state='running';get currentTime(){return performance.now()/1000;}async resume(){}async close(){}}
 Object.defineProperty(globalThis,'AudioContext',{value:Audio,configurable:true});
 let resolve!:()=>void,prepared=0,notes=0;const gate=new Promise<void>(r=>{resolve=r;});
 const audio=new AudioClock(async()=>{await gate;return{async resume(){},async preparePreview(){prepared++;},previewMidi(){notes++;},stopPreview(){}};});
 try{const s=scoreFixture(),t=createTimeline(s,settingsFor(s));const abort=new AbortController();
  const started=audio.start(t,0,abort.signal),rejected=assert.rejects(started,{name:'AbortError'});
  abort.abort();resolve();await rejected;assert.equal(prepared,0);assert.equal(notes,0);
 }finally{await audio.dispose();if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');}
});
