import test from 'node:test';
import assert from 'node:assert/strict';
import {auditionRange,auditionPresentation,NativeAudition,type AuditionState} from '../src/practice/native-audition';
import {EngineBridge,type NativeApi,type PlaybackFrame} from '../../../packages/engine-bridge';
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
  const frame=auditionPresentation(score,[{anchors:['n'],pitch:60,atMs:500,endMs:1000},{anchors:['n'],pitch:60,atMs:2500,endMs:3000}],1);
  assert.equal(frame(650).markers.get('n')?.kind,'playback');
  assert.equal(frame(1200).markers.size,0);
  assert.equal(frame(2650).cursor?.visit,1);
  assert.equal(frame(2650).markers.size,1);
  assert.equal(frame(100).cursor?.visit,0);
  assert.equal(frame(100).markers.size,0);
});

test('MPE attacks and releases override written chord times, including non-proportional arpeggios after a tempo change',()=>{
  const score=scoreFixture();
  score.anchors.push({...score.anchors[0],id:'upper',pitch:64});
  score.performed.push({...score.performed[0],anchor:'upper'});
  const notes=[{anchors:['n'],pitch:60,atMs:1000,endMs:1900},{anchors:['upper'],pitch:64,atMs:1060,endMs:1850}];
  const frame=auditionPresentation(score,notes,.5);
  assert.deepEqual([...frame(520).markers.keys()],['n'],'upper note has not sounded: the native offset remains 60 actual milliseconds at 50%');
  assert.equal(frame(535).markers.size,2);
  assert.deepEqual([...frame(930).markers.keys()],['n'],'native release ends upper highlight before the written release');
  assert.equal(frame(960).markers.size,0);
  assert.equal(auditionPresentation(score,[],1)(650).markers.size,0,'no fallback to fabricated/written attack times');
});

test('tempo and seek transitions keep the last audible position until the matching audio epoch arrives; Stop cancels RAF',async()=>{
  const raf=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame;
  let tick:FrameRequestCallback=()=>{},cancelled=false;
  globalThis.requestAnimationFrame=cb=>{tick=cb;return 1;};globalThis.cancelAnimationFrame=()=>{cancelled=true;};
  try{
    let frame:PlaybackFrame|null={epoch:1,sequenceId:1,tempoMultiplier:1,positionSeconds:10,status:2,contextTime:10,outputContextTime:10};
    const state={available:true,status:'playing',positionSeconds:10,durationSeconds:30,tempoMultiplier:1,preparing:false,error:'',clockEpoch:1,notesRevision:1};
    const Module:any={driver:{resume:async()=>{},playbackFrame:()=>frame}};
    const api={Module,getPracticePlayback(){Module.onPracticePlayback(JSON.stringify(state));return 1;},
      getPracticePlaybackNotes(){Module.onPracticePlaybackNotes(JSON.stringify({source:'musescore-mpe',revision:state.notesRevision,events:[]}));return 1;},
      practicePlayback(){return 1;}} as unknown as NativeApi;
    const bridge=new EngineBridge(api);bridge.practiceActive=true;
    const session=new NativeAudition(bridge,{startMs:0,endMs:30000}),changes:AuditionState[]=[];session.onChange=s=>changes.push(s);
    await session.start(1,false);assert.equal(changes.at(-1)?.positionMs,10000);
    state.tempoMultiplier=.5;state.clockEpoch=2;state.notesRevision=2;state.preparing=true;frame=null;
    session.speed(.5);
    assert.equal(changes.at(-1)?.positionMs,10000,'old native 10 seconds must not become 5 seconds with the new multiplier');
    assert.equal(changes.at(-1)?.sounding,false);
    state.preparing=false;state.positionSeconds=20;
    frame={epoch:2,sequenceId:1,tempoMultiplier:.5,positionSeconds:20.1,status:2,contextTime:12,outputContextTime:12};
    tick(0);assert.equal(changes.at(-1)?.positionMs,10050);assert.equal(changes.at(-1)?.sounding,true);
    frame=null;state.clockEpoch=3;session.seek(23000);
    assert.equal(changes.at(-1)?.positionMs,10050,'seek cannot publish a target before its PCM has reached output');
    session.stop();assert(cancelled);const size=changes.length;tick(0);assert.equal(changes.length,size);
  }finally{globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=cancel;}
});

test('Stop during AudioContext resume prevents a delayed native play',async()=>{
  let resume!:()=>void;const commands:string[]=[];
  const api={Module:{driver:{resume:()=>new Promise<void>(r=>resume=r)}},practicePlayback(command:string){commands.push(command);return 1;}} as unknown as NativeApi;
  const bridge=new EngineBridge(api);bridge.practiceActive=true;const session=new NativeAudition(bridge,{startMs:0,endMs:2000});
  const pending=session.start(1,false);session.stop();resume();await pending;
  assert.deepEqual(commands,['reset']);
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
