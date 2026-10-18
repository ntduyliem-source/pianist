import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ManiaKernel,BASE_SCORE,ManiaHitWindows} from '../../../packages/practice-engine-v2/upstream/mania';
import {holdTailProbe} from '../../../packages/practice-engine-v2/upstream/hold-tail-probe';
import {createTimeline,settingsFor} from '../../../packages/practice-engine-v2/score-adapter';
import {scoreFixture,timeline,midi} from './helpers/fixtures-v2';
import {PracticeEngine} from '../../../packages/practice-engine-v2/engine';

const root = new URL('../../../', import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const cases = json('tests/fixtures/pianist/reference/bpm-input.json');
const expected = json('tests/fixtures/pianist/reference/bpm-upstream.json');

test('R0 pinned upstream bytes match the committed provenance manifest', () => {
  const manifest = json('third_party/practice-sources/manifest.json');
  for (const source of manifest.sources) for (const file of source.files) {
    const bytes = readFileSync(new URL(`third_party/practice-sources/${source.name}/${file.path}`, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
});
test('R4 isolated game hold tail matches original C# cap and lenience in 68 cases; no piano duration claim',()=>{
  for(const c of json('tests/fixtures/pianist/reference/hold-tail-upstream.json'))assert.equal(holdTailProbe(c.delta,c.headHit,c.bodyBreak),c.grade,JSON.stringify(c));
});
test('R2 beat period and compensation agree with unchanged MIDI Rhythm Trainer numeric expressions',()=>{
  const source=readFileSync(new URL('third_party/practice-sources/eran_reaper_jsfx/midi_rhythm_trainer',root),'utf8');
  // These selected EEL2 expressions have the same arithmetic syntax in JS.
  // This executes original expressions, not the REAPER UI or isHit matcher.
  const period=source.match(/sp_per_beat = ([^;]+);/)![1];
  const compensation=source.match(/rel_latency_compensation = ([^;]+);/)![1];
  const phase=source.match(/function getGridRaw\(lane, divs, i\)\s*\(\s*([^;]+);/)![1];
  const originalPeriod=new Function('srate','tempo',`return ${period}`);
  const originalOffset=new Function('tempo','slider5','beats',`return ${compensation}`);
  const originalPhase=new Function('lane','divs','i','getSwing','getPhase',`return ${phase}`);
  for(const bpm of [60,120,180])for(const beatQuarter of [.5,1,1.5] as const){
    const s=scoreFixture(),t=createTimeline(s,{...settingsFor(s),bpm,beatQuarter});
    assert.equal(t.targets[0].atMs,originalPeriod(1000,bpm*beatQuarter));
    for(const offset of [-120,0,120])assert(Math.abs(originalOffset(bpm,offset,4)*4*60000/bpm-offset)<1e-10);
    for(let i=0;i<4;i++)assert.equal(originalPhase(0,4,i,()=>0,()=>0)*4*60000/bpm,i*60000/bpm);
  }
});

test(`R1 TypeScript port equals original C# decisions in all ${cases.length} scenarios`, () => {
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i], kernel = new ManiaKernel(c.notes, c.od);
    for (const step of c.steps) {
      if (step.kind === 'press') kernel.press(step.at, step.pitch, step.seq);
      else kernel.advance(step.at);
    }
    // Same-time automatic misses in independent columns can be emitted in a
    // different container iteration order. Their identity/result/time is exact.
    const sort = (values: any[]) => [...values].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    assert.deepEqual(sort(kernel.judgements), sort(expected[i].judgements), c.id);
    assert.deepEqual(kernel.extras, expected[i].extras, c.id + ' unconsumed input');
    assert.deepEqual(kernel.windows.values, expected[i].windows, c.id + ' hit windows');
    assert.deepEqual(BASE_SCORE,expected[i].weights,c.id+' original score weights');
  }
});
test('R2 full event-time adapter equals original C# under the same canonical clock schedule, all 329 cases',()=>{
  const expectedHost=json('tests/fixtures/pianist/reference/event-host-upstream.json');
  for(let i=0;i<cases.length;i++){
    const c=cases[i],t=timeline(c.notes.map((n:any)=>n.at),c.notes.map((n:any)=>n.pitch));
    t.targets.forEach((n,index)=>{n.id=c.notes[index].id;});t.groups=[];t.settings.difficulty=c.od;
    // Random noise can follow the last written note; keep it inside this test
    // exercise's declared duration so both hosts have identical eligibility.
    t.durationMs=Math.max(t.durationMs,...c.steps.map((s:any)=>s.at))+500;
    const engine=new PracticeEngine(t);
    for(const step of c.steps)if(step.kind==='press'){
      engine.input(midi(step.seq*2,'on',step.at,step.pitch));engine.input(midi(step.seq*2+1,'off',step.at,step.pitch));
    }
    engine.clock(t.durationMs+1000);const view=engine.view();
    const sort=(a:any[])=>[...a].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
    assert.deepEqual(view.faults,[],c.id);assert.deepEqual(sort(view.judgements),sort(expectedHost[i].judgements),c.id);
    assert.deepEqual(view.extras.map(e=>e.sequence),expectedHost[i].extras,c.id+' extras');
  }
});
