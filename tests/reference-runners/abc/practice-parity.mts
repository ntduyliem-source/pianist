// Native snapshots are supplied by abc-practice-pairs.cjs. Only platform clock,
// audio and MIDI I/O are controlled; real router/controller/Worker/kernels run.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Worker as Thread} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {PracticeController} from '../../../apps/pianist-web/src/practice/controller-v2';
import {MidiRouter} from '../../../apps/pianist-web/src/platform/midi-v2';
import {settingsFor,createTimeline} from '../../../packages/practice-engine-v2/score-adapter';
import {replayAttempt} from '../../../packages/practice-engine-v2/results';
import {assessReleases} from '../../../packages/practice-engine-v2/release-assessment';
import type {ScoreSnapshot} from '../../../packages/score-contracts';
import type {Timeline,AttemptResult,PracticeSettings} from '../../../packages/practice-engine-v2/model';

const file=process.argv[2],pairs=JSON.parse(readFileSync(file,'utf8')) as {name:string;abc:ScoreSnapshot;xml:ScoreSnapshot}[];
function close(a:any,b:any):boolean {if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=1e-6;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>close(v,b[i]));if(a&&b&&typeof a==='object'&&typeof b==='object')return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&close(a[k],b[k]));return a===b;}
function canonical(t:Timeline,s:ScoreSnapshot){
  const ids=new Map<string,string>();s.anchors.forEach(a=>ids.set(a.id,JSON.stringify([a.tick,a.pitch,a.durationTicks,a.staff,a.voice])));
  [...t.targets,...t.guide].forEach(n=>ids.set(n.id,JSON.stringify([n.loop,n.occurrence,n.pitch,n.atMs])));
  t.pedals?.forEach((p,i)=>ids.set(p.id,'pedal-'+i));
  const replace=(value:any):any=>typeof value==='string'?(ids.get(value)??value):Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):value;
  return replace;
}
const require=createRequire(new URL('../../../apps/pianist-web/package.json',import.meta.url)),loader=pathToFileURL(require.resolve('tsx/esm/api')).href;
class BrowserWorker {
  onmessage?:(e:{data:any})=>void;onerror?:(e:{message:string})=>void;thread:Thread;
  constructor(url:URL){this.thread=new Thread(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};import(${JSON.stringify(loader)}).then(({tsImport})=>tsImport(${JSON.stringify(url.href)},${JSON.stringify(import.meta.url)})).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',e=>this.onerror?.({message:e.message}));}
  postMessage(data:unknown){this.thread.postMessage(data);}terminate(){void this.thread.terminate();}
}
let now=10000,tick=()=>{};
class AudioIO {
  state='running';destination={};get currentTime(){return now/1000;}getOutputTimestamp(){return{contextTime:now/1000-.04,performanceTime:now};}
  async resume(){this.state='running';}async close(){this.state='closed';}
  createOscillator(){return{frequency:{value:0},type:'',onended:null,connect:(x:unknown)=>x,start(){},stop(){},disconnect(){}};}
  createGain(){return{gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}
}
Object.defineProperties(globalThis,{performance:{configurable:true,value:{now:()=>now,timeOrigin:1700000000000}},AudioContext:{configurable:true,value:AudioIO},Worker:{configurable:true,value:BrowserWorker},window:{configurable:true,value:{setInterval:(f:()=>void)=>{tick=f;return 1;},setTimeout,clearTimeout}},isSecureContext:{configurable:true,value:true}});
const port={id:'a5-midi',name:'A5 simulated hardware I/O',state:'connected',onmidimessage:null as any,async open(){},async close(){}};
Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>({inputs:new Map([[port.id,port]]),onstatechange:null})});
const move=(to:number)=>{while(now+20<to){now+=20;tick();}now=to;};
async function run(t:Timeline,kind:string){
  now+=10000;const router=new MidiRouter();await router.connect();const s=new PracticeController(t,'A5');router.onInput=e=>s.input(e);
  let timeout:ReturnType<typeof setTimeout>;
  const result=new Promise<AttemptResult>((resolve,reject)=>{s.onComplete=resolve;timeout=setTimeout(()=>reject(Error('A5 timeout '+kind)),15000);});
  try{
    await s.start(()=>router.stateEvents());let origin=now-s.transport.now;
    const events:{at:number;bytes:number[]}[]=[];
    const wrongOctave=(pitch:number,at:number)=>[pitch+12,pitch-12].find(p=>p>=0&&p<=127&&!t.targets.some(n=>n.atMs===at&&n.pitch===p));
    const wrongIndex=t.targets.findIndex(n=>wrongOctave(n.pitch,n.atMs)!==undefined);
    if(kind==='wait'){
      // Wrong octave cannot advance; then stagger chord notes and duplicate a held
      // Note On. A new same-pitch target still requires the real Note Off.
      for(const [i,g] of t.groups.entries())for(const [j,id] of g.ids.entries()){
        const n=t.targets.find(n=>n.id===id)!,at=100+i*500+j*50;
        const wrong=wrongOctave(n.pitch,n.atMs);
        if(j===0&&wrong!==undefined)events.push({at:at-30,bytes:[0x90,wrong,90]},{at:at-20,bytes:[0x80,wrong,0]});
        events.push({at,bytes:[0x90,n.pitch,90]},{at:at+5,bytes:[0x90,n.pitch,90]},{at:at+30,bytes:[0x80,n.pitch,0]});
      }
    }else{
      for(const [i,n] of t.targets.entries()){
        const delta=kind==='early'?-120:0,pitch=kind==='octave'&&i===wrongIndex?wrongOctave(n.pitch,n.atMs)!:n.pitch;
        events.push({at:n.atMs+delta,bytes:[0x90,pitch,90]},{at:kind==='short'?n.atMs+20:(n.releaseMs??n.endMs),bytes:[0x80,pitch,0]});
      }
      for(const p of t.pedals??[])events.push({at:p.atMs,bytes:[0xb0,64,127]},{at:p.endMs,bytes:[0xb0,64,0]});
    }
    events.sort((a,b)=>a.at-b.at||a.bytes[0]-b.bytes[0]);let paused=false;
    for(const e of events){
      if(kind==='pause'&&!paused&&e.at>300){move(origin+300);tick();s.pause();now+=2000;await s.resume(()=>router.stateEvents());origin=now-s.transport.now;paused=true;}
      move(origin+e.at+25);port.onmidimessage({data:new Uint8Array(e.bytes),timeStamp:origin+e.at});tick();
    }
    move(origin+Math.max(t.durationMs,events.at(-1)!.at)+1500);tick();const r=await result;
    assert.equal(r.outcome,'complete');assert.deepEqual(r.faults,[]);
    const replay=replayAttempt(t,r.replay!.commands);assert.deepEqual(replay.judgements,r.judgements);assert.deepEqual(assessReleases(t,replay,r.outcome),r.r4);
    if(kind==='perfect'||kind==='pedal-off'){assert.equal(r.metrics.misses,0);assert.equal(r.metrics.extras,0);assert.equal(r.metrics.hits,t.targets.length);assert.ok(r.r4!.key.every(k=>['correct','unavailable'].includes(k.status)));}
    if(kind==='early')assert.ok(r.judgements.some(j=>Math.abs(j.delta+120)<1e-6));
    if(kind==='octave')assert.ok(r.metrics.extras>0);
    if(kind==='wait'){assert.equal(r.metrics.hits,t.targets.length);assert.ok(r.metrics.extras>0);assert.equal(r.r4!.pedal.status,'wait');}
    if(kind==='pause'){assert.equal(r.clock!.segments.length,2);assert.ok(r.intervals.some(n=>n.interrupted));}
    if(kind==='pedal-off')assert.equal(r.r4!.pedal.status,'disabled');
    return r;
  }finally{clearTimeout(timeout!);s.dispose();}
}
const report:{pairs:number;timelines:number;runs:number;checks:unknown[];passed?:boolean}={pairs:pairs.length,timelines:0,runs:0,checks:[]};
for(const pair of pairs){
  const settings=settingsFor(pair.abc);Object.assign(settings,{mode:'bpm',bpm:80,countIn:4,inputSource:'midi',deviceId:port.id});
  const variants:Partial<PracticeSettings>[]=[{}, {tempoMode:'score'}, {fromMeasure:Math.min(1,pair.abc.measures.length-1),loops:3,loopBpmStep:5}, {hand:'right',accompaniment:true}, {hand:'left',accompaniment:true},...([...new Set(pair.abc.anchors.map(n=>n.voice))].map(v=>({voices:[v]})))];
  for(const variant of variants){
    let a:Timeline,b:Timeline;try{a=createTimeline(pair.abc,{...settings,...variant});}catch(e){assert.throws(()=>createTimeline(pair.xml,{...settings,...variant}));continue;}
    b=createTimeline(pair.xml,{...settings,...variant});const strip=(t:Timeline,s:ScoreSnapshot)=>canonical(t,s)({targets:t.targets,groups:t.groups,visits:t.visits,clicks:t.clicks,guide:t.guide,durationMs:t.durationMs,pedals:t.pedals,pedalReference:t.pedalReference});
    assert.ok(close(strip(a,pair.abc),strip(b,pair.xml)),pair.name+' targets '+JSON.stringify(variant));report.timelines++;
  }
  if(!['piano-core-midi','ties-retrigger','tempo-repeat-tie-import','volta-import','same-staff-voices-import'].includes(pair.name))continue;
  for(const kind of ['perfect','early','short','octave','pedal-off','wait','pause']){
    const config={...settings,mode:kind==='wait'?'wait':'bpm',loops:3,pedalEnabled:kind!=='pedal-off'} as PracticeSettings;
    const a=createTimeline(pair.abc,config),b=createTimeline(pair.xml,config),ra=await run(a,kind),rb=await run(b,kind);
    const keep=(r:AttemptResult,s:ScoreSnapshot)=>canonical(r.timeline,s)({metrics:r.metrics,judgements:r.judgements,extras:r.extras,intervals:r.intervals,pedalIntervals:r.pedalIntervals,controls:r.controls,r4:r.r4});
    assert.ok(close(keep(ra,pair.abc),keep(rb,pair.xml)),pair.name+' '+kind+' results');report.runs+=2;report.checks.push({pair:pair.name,kind,targets:a.targets.length,missingRelease:a.targets.filter(n=>n.releaseMs===undefined).length});
  }
  console.log('A5 worker parity',pair.name);
}
report.passed=true;writeFileSync(file.replace('pairs.json','worker-parity.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,pairs:report.pairs,timelines:report.timelines,runs:report.runs}));
