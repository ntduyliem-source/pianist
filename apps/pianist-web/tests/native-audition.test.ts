import test from 'node:test';
import assert from 'node:assert/strict';
import {auditionRange,auditionPresentation} from '../src/practice/native-audition';
import {EngineBridge,type NativeApi} from '../../../packages/engine-bridge';
import {scoreFixture} from './helpers/fixtures-v2';

test('A–B cannot silently include outside measures between disjoint repeat/volta visits',()=>{
  const score=scoreFixture();
  score.occurrences=[0,1,2,3,0,1,2,4].map((measure,index)=>({index,measure,startMs:index*1000,endMs:(index+1)*1000,utick:index*480}));
  score.durationMs=8000;
  assert.deepEqual(auditionRange(score,1,2),{startMs:1000,endMs:3000});
  assert.deepEqual(auditionRange(score,1,2,true),{startMs:0,endMs:8000});
  assert.throws(()=>auditionRange(score,8,9),/lịch phát/);
  score.occurrences=[1,2,1,2,3].map((measure,index)=>({index,measure,startMs:index*1000,endMs:(index+1)*1000,utick:index*480}));
  assert.deepEqual(auditionRange(score,1,2),{startMs:0,endMs:4000},'repeats contained inside A–B stay native');
});

test('listening highlights the native performed occurrence and clears on rests, seek and repeat return',()=>{
  const score=scoreFixture();
  score.occurrences.push({index:1,measure:0,startMs:2000,endMs:4000,utick:1920});
  score.performed.push({anchor:'n',occurrence:1,atMs:2500,endMs:3000});
  const frame=auditionPresentation(score);
  assert.equal(frame(650).markers.get('n')?.kind,'playback');
  assert.equal(frame(1200).markers.size,0);
  assert.equal(frame(2650).cursor?.visit,1);
  assert.equal(frame(2650).markers.size,1);
  assert.equal(frame(100).cursor?.visit,0);
  assert.equal(frame(100).markers.size,0);
});

test('native audition keeps editing locked and restores the reference before snapshot capture',()=>{
  const Module:any={},commands:string[]=[],raw:any={schemaVersion:1,revision:0};
  let nativePractice=false,tempo=1;
  const api={
    Module,setPracticeActive(active:boolean){nativePractice=active;commands.push('practice:'+active);tempo=1;return 1;},
    getEditorPlayback(){Module.onEditorPlayback(JSON.stringify({tempoMultiplier:tempo}));return 1;},
    editorPlayback(command:string,value:number){if(nativePractice)return 0;commands.push(command);if(command==='tempo')tempo=value;return 1;},
    practicePlayback(command:string,value:number){if(!nativePractice)return 0;commands.push(command);if(command==='tempo')tempo=value;if(command==='reset')tempo=1;return 1;},
    getPracticeSnapshot(){assert.equal(tempo,1);Module.onPracticeSnapshot(JSON.stringify(raw));return 1;}
  } as unknown as NativeApi;
  const bridge=new EngineBridge(api);
  assert.throws(()=>bridge.audition('play'));
  bridge.setPractice(true);bridge.audition('range',1,2);bridge.audition('tempo',.5);
  assert.throws(()=>bridge.playback('play'));
  bridge.snapshot();assert.equal(commands.at(-1),'reset');
  bridge.setPractice(false);assert.throws(()=>bridge.audition('play'));
});
