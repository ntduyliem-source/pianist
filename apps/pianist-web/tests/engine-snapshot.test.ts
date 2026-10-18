import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {ScoreSnapshot} from '../../../packages/score-contracts/index';
import {createTimeline,settingsFor} from '../../../packages/practice-engine-v2/score-adapter';
import {PracticeEngine} from '../../../packages/practice-engine-v2/engine';
const score = JSON.parse(readFileSync(new URL('../../../tests/fixtures/pianist/practice/engine-snapshot.json', import.meta.url), 'utf8')) as ScoreSnapshot;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .01, `${actual} != ${expected}`);
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../tests/fixtures/pianist/practice/${name}-snapshot.json`, import.meta.url), 'utf8')) as ScoreSnapshot;

// Captured from the optimized WASM through Snapshot JSON. Only SVG pixels and
// the local project ID were removed/replaced; native timing is unmodified.
test('native R4 renderer supplies staccato/staccatissimo, tied key offsets and repeated pedal spans',()=>{
  const s=fixture('pedal-duration'),p=createTimeline(s,{...settingsFor(s),mode:'bpm',bpm:120});
  assert.equal(s.durationReference,'musescore-midi');assert.equal(s.keyReleases!.length,17);
  assert.equal(p.targets.length,17);assert(p.targets.every(n=>n.releaseMs!==undefined));
  const staccato=p.targets.find(n=>n.pitch===60&&n.atMs===0)!;
  near(staccato.releaseMs!,239/480*500);assert.equal(staccato.endMs,500);
  const staccatissimo=p.targets.find(n=>n.pitch===64)!;near(staccatissimo.releaseMs!,3037/480*500);
  const tie=p.targets.find(n=>n.pitch===62)!;assert.equal(tie.anchors.length,2);near(tie.releaseMs!,2783/480*500);
  assert.deepEqual(p.pedals!.map(p=>[p.atMs,p.endMs]),[[0,3000],[4000,7000],[8000,9500]]);
  const tempo=createTimeline(s,{...p.settings,tempoMode:'score'});
  tempo.targets.forEach((n,i)=>near(n.releaseMs!,p.targets[i].releaseMs!));
});

test('native R4 A/B cut enters tie with a fresh attack, clips pedal and rescales the next loop',()=>{
  const s=fixture('pedal-duration'),p=createTimeline(s,{...settingsFor(s),mode:'bpm',bpm:120,fromMeasure:1,toMeasure:1,loops:2,loopBpmStep:20});
  assert.equal(p.targets.filter(n=>n.pitch===62).length,4);
  const first=p.targets.find(n=>n.pitch===62)!;assert.equal(first.atMs,0);near(first.releaseMs!,863/480*500);
  // Existing transport inserts one 120-BPM beat (500 ms) between loops.
  const expected=[[0,1000],[2000,3000],[4500,4500+6000/7],[4500+12000/7,4500+18000/7]];
  p.pedals!.forEach((p,i)=>{near(p.atMs,expected[i][0]);near(p.endMs,expected[i][1]);});assert.equal(p.pedals!.length,4);
  const next=p.targets.find(n=>n.pitch===62&&n.loop===1)!;near(next.releaseMs!-next.atMs,(first.releaseMs!-first.atMs)*6/7);
});

test('native first/second endings perform 1,2,1,3 with a fresh grading pass on return', () => {
  const s = fixture('volta'), p = createTimeline(s, ({...settingsFor(s),tempoMode:"score" as const}));
  assert.deepEqual(s.occurrences.map(o => o.measure), [0, 1, 0, 2]);
  assert.deepEqual(p.targets.map(t => [t.atMs, t.pitch]), [[0, 60], [1000, 62], [2000, 60], [3000, 64]]);
  near(p.durationMs, 4000);
});

test('explicit MusicXML D.C. al Fine survives default import settings and stops on the second Fine', () => {
  const s = fixture('da-capo'), p = createTimeline(s, ({...settingsFor(s),tempoMode:"score" as const}));
  assert.deepEqual(s.occurrences.map(o => o.measure), [0, 1, 2, 0, 1]);
  assert.deepEqual(p.targets.map(t => [t.atMs, t.pitch]), [[0, 60], [1000, 62], [2000, 64], [3000, 60], [4000, 62]]);
  near(p.durationMs, 5000);
});

test('native D.S. al Coda returns to Segno and takes the Coda on its second pass', () => {
  const s = fixture('dal-segno-coda'), p = createTimeline(s, ({...settingsFor(s),tempoMode:"score" as const}));
  assert.deepEqual(s.occurrences.map(o => o.measure), [0, 1, 2, 3, 1, 2, 4]);
  assert.deepEqual(p.targets.map(t => t.pitch), [60, 62, 64, 65, 62, 64, 67]); near(p.durationMs, 7000);
});

test('native cross-staff notes keep their musical hand while anchors follow the visual staff', () => {
  const s = fixture('cross-staff'), c = ({...settingsFor(s),tempoMode:"score" as const}); c.hand = 'right';
  const p = createTimeline(s, c); assert.deepEqual(p.targets.map(t => t.pitch), [60, 62, 64, 65]);
  assert.deepEqual(s.anchors.filter(a => a.staff === 0 && a.visualStaff === 1).map(a => a.pitch), [62, 65]);
  c.hand = 'left'; assert.deepEqual(createTimeline(s, c).targets.map(t => t.pitch), [48]);
  near(p.durationMs, 4000);
});

test('independent voices on the same native staff can be practiced without changing notation', () => {
  const s = fixture('same-staff-voices'), c = ({...settingsFor(s),tempoMode:"score" as const}); c.voices = [0];
  assert.deepEqual(createTimeline(s, c).targets.map(t => t.pitch), [60, 62, 64, 65]);
  c.voices = [1]; const p = createTimeline(s, c); assert.deepEqual(p.targets.map(t => t.pitch), [55]);
  near(p.targets[0].endMs, 4000); assert.ok(s.anchors.every(a => a.staff === 0));
});

test('native special symbols expose the grading policy and retain fermata playback duration', () => {
  const s = fixture('special-symbols'), p = createTimeline(s, ({...settingsFor(s),tempoMode:"score" as const}));
  assert.deepEqual([...s.warnings].sort(), ['arpeggio', 'fermata', 'grace', 'ornament']);
  assert.deepEqual(p.targets.map(t => t.pitch), [60, 64, 67, 62, 64]);
  assert.equal(p.groups[0].ids.length, 3, 'arpeggio currently requires a complete ordinary chord');
  assert.equal(p.targets.some(t => t.pitch === 59), false, 'grace is explicitly excluded');
  // MuseScore resets fermata stretch one tick before release (Fraction::eps).
  near(p.durationMs, 6000 - 1000 / 480);
});
test('actual WASM snapshot agrees with independent pickup/tuplet/repeat/tie arithmetic', () => {
  assert.equal(score.anchors.length, 11); assert.equal(score.performed.length, 20); assert.equal(score.occurrences.length, 5);
  const p = createTimeline(score, ({...settingsFor(score),tempoMode:"score" as const})); assert.equal(p.targets.length, 16); near(p.durationMs, 4375);
  score.occurrences.forEach((o, i) => near(o.startMs, [0, 375, 1375, 2375, 3375][i]));
  const triplet = p.targets.filter(t => t.occurrence === 1 && t.roles.includes('right'));
  triplet.forEach((t, i) => near(t.atMs, [375, 541 + 2 / 3, 708 + 1 / 3, 875][i]));
  const tied = p.targets.find(t => t.pitch === 67)!; near(tied.atMs, 875); near(tied.endMs, 1875); assert.equal(tied.anchors.length, 2);
  const unison = p.targets.find(t => t.pitch === 62)!; assert.equal(unison.anchors.length, 2); assert.deepEqual(new Set(unison.roles), new Set(['left', 'right']));
});
test('native snapshot through new adapter and engine consumes one attack per physical target',()=>{
  const config={...settingsFor(score),mode:'bpm' as const,tempoMode:'score' as const}, t=createTimeline(score,config),core=new PracticeEngine(t);let sequence=0;
  const events=t.targets.flatMap(n=>['on','off'].map(kind=>({sequence:++sequence,kind:kind as 'on'|'off',pitch:n.pitch,value:kind==='on'?80:0,timestampMs:n.atMs+(kind==='off'?1:0),receivedMs:n.atMs+(kind==='off'?1:0),channel:0,portId:'virtual',source:'virtual' as const}))).sort((a,b)=>a.timestampMs-b.timestampMs||a.sequence-b.sequence);
  events.forEach(e=>core.input(e));core.clock(t.durationMs+1000);const v=core.view();assert.equal(v.judgements.length,16);assert.equal(v.judgements.filter(j=>j.grade==='perfect').length,16);assert.equal(v.extras.length,0);
});
