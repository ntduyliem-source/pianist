// Test-only bundle. Never imported by the product or included in the release.
import {EngineBridge, type NativeApi} from '../../../packages/engine-bridge/index';
import {createTimeline, settingsFor} from '../../../packages/practice-engine-v2/score-adapter';
import {exerciseCounts} from '../../../packages/exercise-generator/contract';
import {PracticeController} from '../../../apps/pianist-web/src/practice/controller-v2';
import {MidiRouter} from '../../../apps/pianist-web/src/platform/midi-v2';
import type {ScoreSnapshot} from '../../../packages/score-contracts/index';
import type {AttemptResult} from '../../../packages/practice-engine-v2/model';
import {ExerciseRenderer} from '../../../packages/exercise-renderer/index';

type Input = {name: string; bytes: number[]};
const api = () => (window as any).pianist as NativeApi;
function bridge() {
  const b = new EngineBridge(api());
  b.revision = b.semantics().revision;
  return b;
}
function prepared(input: Input) {
  const b = bridge(), start = performance.now();
  const raw = b.preparedSnapshot(new Uint8Array(input.bytes), input.name);
  const elapsedMs = performance.now() - start;
  return inspect(raw, input.name, elapsedMs);
}
function inspect(raw:Omit<ScoreSnapshot,'projectId'|'fingerprint'>,name:string,elapsedMs:number){
  const snapshot: ScoreSnapshot = {...raw, projectId: 'q0:' + name, fingerprint: name};
  const keys = new Set(snapshot.pages.flatMap(p => [...new DOMParser().parseFromString(p.svg, 'image/svg+xml')
    .querySelectorAll('[data-practice-notes]')].flatMap(n => n.getAttribute('data-practice-notes')!.split(/\s+/))));
  const missing = snapshot.anchors.filter(n => n.visible && !keys.has(n.id.replace(/^m\d+-/, '')));
  if (missing.length) throw Error('Missing own SVG glyphs: ' + missing.map(n => n.id));
  const timeline = createTimeline(snapshot, settingsFor(snapshot));
  return {snapshot, elapsedMs, counts: exerciseCounts(timeline), targets: timeline.targets,
    wasmHeapBytes: api().Module.HEAPU8.byteLength, glyphs: keys.size};
}
let renderer=new ExerciseRenderer();
async function preparedWorker(input:Input){
  const start=performance.now(),result=await renderer.prepare(new Uint8Array(input.bytes),input.name);
  return {...inspect(result.snapshot,input.name,performance.now()-start),
    workerMs:result.elapsedMs,cacheHit:result.cacheHit,sourceHash:result.sourceHash,
    rendererVersion:result.rendererVersion,rendererHeapBytes:result.heapBytes};
}
const warmRenderer=async()=>{
  const start=performance.now();await renderer.warm();return performance.now()-start;
};
const resetRenderer=()=>{renderer.dispose();renderer=new ExerciseRenderer();};
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let renderSerial=0;

async function midiProbe(inputs: Input[], renderCount: number, renderMode:'sync'|'worker'='sync') {
  if(renderMode==='worker')await renderer.warm();
  const b = bridge(), raw = b.snapshot();
  const score: ScoreSnapshot = {...raw, projectId: 'q0-current', fingerprint: 'q0-current'};
  const settings = {...settingsFor(score), mode: 'bpm' as const, bpm: 240, countIn: 2, metronome: true};
  const timeline = createTimeline(score, settings);
  const session = new PracticeController(timeline, 'Q0 renderer and simulated MIDI');
  const router = new MidiRouter(), deliveries: number[] = [];
  let packets = 0, result: AttemptResult | undefined;
  router.onInput = e => {packets++; deliveries.push(e.receivedMs - e.timestampMs); session.input(e);};
  session.onComplete = r => {result = r;};
  const sheet = document.createElement('div');
  sheet.id = 'q0-current-sheet'; sheet.style.cssText = 'position:fixed;right:0;top:80px;width:320px;height:450px;overflow:auto;background:white;z-index:9999;pointer-events:none';
  sheet.innerHTML = score.pages.map(p => p.svg).join('');
  document.body.append(sheet);
  const sheetBefore = sheet.innerHTML, samples: number[] = [], frames: number[] = [];
  const roundtrips:number[]=[],dispatchMs:number[]=[],cacheHits:boolean[]=[],rendererHeapBytes:number[]=[];
  const renderWindows: {start: number; end: number}[] = [], longTasks: {start: number; duration: number}[] = [];
  const observer = new PerformanceObserver(list => list.getEntries().forEach(e => longTasks.push({start: e.startTime, duration: e.duration})));
  let lastFrame: number | undefined, frame = 0;
  const paint = (at: number) => {if (lastFrame !== undefined) frames.push(at - lastFrame); lastFrame = at; frame = requestAnimationFrame(paint);};
  frame = requestAnimationFrame(paint);
  // This independent producer preserves the actual MIDI timestamp even when the
  // UI thread is blocked. A setTimeout on the main thread would hide delivery lag.
  const workerCode = `onmessage=({data})=>{
    for(const e of data.events)setTimeout(()=>postMessage({bytes:e.bytes,stamp:performance.timeOrigin+performance.now()}),
      Math.max(0,data.origin+e.atMs-(performance.timeOrigin+performance.now())));
  };`;
  const workerUrl = URL.createObjectURL(new Blob([workerCode], {type: 'text/javascript'}));
  const producer = new Worker(workerUrl);
  producer.onmessage = ({data}) => router.receive(data.bytes, data.stamp);
  try {
    await session.start(() => router.stateEvents());
    observer.observe({type: 'longtask'});
    const events = timeline.targets.flatMap(n => [
      {atMs: n.atMs, bytes: [0x90, n.pitch, 90]},
      {atMs: n.releaseMs ?? n.endMs, bytes: [0x80, n.pitch, 0]},
    ]).sort((a, c) => a.atMs - c.atMs || a.bytes[0] - c.bytes[0]);
    producer.postMessage({origin: performance.timeOrigin + session.transport.mapping.originPerformanceMs, events});
    const started = performance.now();
    let i = 0;
    while (performance.now() - started < timeline.durationMs + 5000 && !result && session.status !== 'interrupted') {
      // Keep native work inside actual timed play, not just the count-in.
      if (session.status === 'running' && i < renderCount) {
        const input = inputs[i % inputs.length], start = performance.now();
        if(renderMode==='worker'){
          // Unique filename forces a fresh native import/layout/SVG; a cache hit
          // would not prove that live rendering is safe during timed MIDI.
          const source=new Uint8Array(input.bytes),name=`probe-${++renderSerial}-${input.name}`;
          const dispatchAt=performance.now(),pending=renderer.prepare(source,name);
          dispatchMs.push(performance.now()-dispatchAt);
          const rendered=await pending;samples.push(rendered.elapsedMs);cacheHits.push(rendered.cacheHit);
          rendererHeapBytes.push(rendered.heapBytes);
        }else{
          b.preparedSnapshot(new Uint8Array(input.bytes), input.name);
          samples.push(performance.now()-start);
        }
        const end = performance.now();
        roundtrips.push(end-start);renderWindows.push({start, end}); i++;
      }
      await delay(renderMode==='worker'?0:80);
    }
    const status = session.status, message = session.message;
    if (!result) {await session.finish('interrupted'); await delay(80);}
    await delay(80);
    return {status, message, plannedPackets: events.length, packets, nativeSamplesMs: samples,
      renderMode,roundtripMs:roundtrips,dispatchMs,cacheHits,rendererHeapBytes,
      deliveryMs: deliveries, longTasksMs: longTasks.map(t => t.duration),
      renderLongTasksMs: longTasks.filter(t => renderWindows.some(w => w.start < t.start + t.duration && w.end > t.start)).map(t => t.duration),
      frameGapsMs: frames,
      sheetUnchanged: sheetBefore === sheet.innerHTML, editorRevisionUnchanged: b.revision === bridge().revision,
      planned: timeline.targets.length, metrics: result?.metrics, faults: result?.faults,
      outcome: result?.outcome, wasmHeapBytes: api().Module.HEAPU8.byteLength};
  } finally {
    producer.terminate(); URL.revokeObjectURL(workerUrl);
    observer.disconnect(); cancelAnimationFrame(frame); sheet.remove(); session.dispose();
  }
}
(window as any).q0Lab = {prepared,preparedWorker,warmRenderer,resetRenderer,midiProbe,bridge};
