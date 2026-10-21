import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {exactTicks,verifySource,type SourceAnalysis} from '../../../packages/exercise-generator/source-verification';
import type {ScoreSnapshot} from '../../../packages/score-contracts';

const base=new URL('../../../tests/fixtures/pianist/curriculum/',import.meta.url);
const golden=JSON.parse(readFileSync(new URL('q2-golden.json',base),'utf8'));
const fixture=(name='tie-unison')=>structuredClone(golden.entries[name]) as {analysis:SourceAnalysis;native:ScoreSnapshot};

test('Q2 recorded native oracle binds to original MusicXML and uses existing tie/unison counts',()=>{
  for(const [name,targets] of [['tie-unison',4],['spelled-intervals',6],['rational-triplet',3]] as const){
    const {analysis,native}=fixture(name);
    assert.equal(createHash('sha256').update(readFileSync(new URL(name+'.musicxml',base))).digest('hex'),analysis.sourceSha256);
    const result=verifySource(analysis,native);
    assert.equal(result.passed,true,JSON.stringify(result));
    assert.equal(result.counts?.targets,targets);
    assert.equal(result.eligibleForFragmentReview,true);
    assert(Object.values(analysis.lines).every(line=>line.hand===null));
  }
});

test('Q2 rejects changed pitch, spelling, timing, voice, ties and meter',()=>{
  const mutations:((a:SourceAnalysis)=>void)[]=[
    a=>{a.events[0].pitch!.midi++;},
    a=>{a.events[0].pitch!.step='D';},
    a=>{a.events[0].onset.numerator++;},
    a=>{a.events[0].duration.numerator--;},
    a=>{a.events[0].lineId=a.events.find(e=>e.lineId!==a.events[0].lineId)!.lineId;},
    a=>{delete a.events.find(e=>e.tieFrom)!.tieFrom;},
    a=>{a.contexts.find(c=>c.kind==='meter')!.value.numerator=3;},
    a=>{a.measures[0].duration.numerator++;},
  ];
  for(const mutate of mutations){
    const {analysis,native}=fixture();mutate(analysis);
    const result=verifySource(analysis,native);
    assert.equal(result.passed,false,mutate.toString());
    assert.equal(result.eligibleForFragmentReview,false);
    assert(result.rejectionCodes.length);
  }
});

test('Q2 never rounds a tuplet to native ticks to force an oracle match',()=>{
  assert.equal(exactTicks({numerator:1,denominator:3}),160);
  assert.throws(()=>exactTicks({numerator:1,denominator:7}),/native-tick-resolution/);
  assert.throws(()=>exactTicks({numerator:1,denominator:0}),/invalid-fraction/);
  const {analysis,native}=fixture();analysis.events[0].duration={numerator:1,denominator:7};
  assert(verifySource(analysis,native).rejectionCodes.includes('native-tick-resolution'));
});

test('Q2 imports with warnings or unresolved symbols cannot enter fragment review',()=>{
  const {analysis,native}=fixture();analysis.releaseBlockers.push('unclosed-pedal');
  let result=verifySource(analysis,native);
  assert.equal(result.passed,true);assert.equal(result.eligibleForFragmentReview,false);
  assert(result.releaseBlockers.includes('unclosed-pedal'));
  analysis.releaseBlockers=[];native.warnings.push('ornament');
  result=verifySource(analysis,native);
  assert.equal(result.eligibleForFragmentReview,false);
  assert(result.releaseBlockers.includes('native-warning:ornament'));
});

test('Q2 preserves explicit rests and rejects missing or shortened native rests',()=>{
  const {analysis,native}=fixture('spelled-intervals');
  const semantics=native as ScoreSnapshot & {rests:[number,number,number,number][]};
  semantics.rests[0][1]--;
  assert(verifySource(analysis,semantics).rejectionCodes.includes('native-explicit-rest'));
});

test('Q2 a note ignored by native playback cannot become a quiz attack',()=>{
  const {analysis,native}=fixture();native.anchors[0].play=false;
  assert(verifySource(analysis,native).rejectionCodes.includes('native-nonplaying-note'));
});
