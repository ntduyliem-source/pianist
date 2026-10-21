import test from 'node:test';
import assert from 'node:assert/strict';
import {LENGTH_BUCKETS,lengthBucketFor,validatePreparedExercise,validatePreparedCatalog,
  validatePreparedSettings,preparedTimeline} from '../../../packages/exercise-generator/prepared-contract';
import type {PreparedExercise,PreparedCatalog,PreparedExerciseSettings} from '../../../packages/exercise-generator/prepared-model';
import {scoreFixture} from './helpers/fixtures-v2';
const h='a'.repeat(64);
function fixture(){
  const e:PreparedExercise={schemaVersion:2,id:h,title:'Synthetic contract fixture',sourceSha256:h,sourceLineId:'P1:s1:v1',
    sourceEventIds:['n0','n1','n2'],sourceSpan:{startMeasure:0,endMeasure:1,startTick:0,endTick:1920,ticksPerQuarter:480},
    source:{sourceSha256:h,analysisSha256:h,origins:[{title:'Synthetic fixture',composer:null,source_url:'',collection:'tests',revision:'1',license_id:'CC0',license_url:''}]},
    grade:1,profileId:'g1-direction-quarters',hand:'right',lengthBucket:'n4',counts:{targets:3,onsets:3},unitKind:'motif',
    exactHash:h,motifHash:h,bpm:{min:40,max:80,beatQuarter:1},durationQuarter:{numerator:4,denominator:1},
    status:'approved-local-pilot',visibility:'local-only',review:{status:'accepted-local-pilot',method:'source-context-and-score-inspection',
      reviewer:'Synthetic test',reviewerRole:'assistant',teacherReviewed:false,reviewedAt:'2026-10-21',selectionSha256:h,contextSha256:h,
      startReason:'Synthetic test evidence only.',endReason:'Synthetic test evidence only.',musicalReason:'Synthetic test evidence only.',
      handReason:'Synthetic test evidence only.',tonality:'C major',tonalityReason:'Synthetic test evidence only.'},
    gradeEvidence:{passed:true,grade:1,profileId:'g1-direction-quarters',hand:'right',sourceEventIds:['n0','n1','n2'],
      rejectionCodes:[],contextSha256:h,focusEventPairs:[['n0','n1']]},projectionVerification:{passed:true,rejectionCodes:[]},
    versions:{parser:h,profile:h,lengths:h,builder:h,native:h,engine:h,renderer:{}},
    assets:Object.fromEntries(Object.entries({notation:'exercise.musicxml',snapshot:'snapshot.json',timeline:'timeline.json',context:'context.json'})
      .map(([k,n])=>[k,{path:'exercises/'+h+'/'+n,sha256:h,bytes:1}])) as PreparedExercise['assets']};
  const s=scoreFixture(),base=s.anchors[0];s.fingerprint=h;
  s.anchors=[60,62,64].map((pitch,i)=>({...base,id:'n'+i,pitch,tick:i*480}));
  s.performed=s.anchors.map(n=>({anchor:n.id,occurrence:0,atMs:n.tick/480*500,endMs:n.tick/480*500+500}));
  return {e,s};
}
test('prepared lengths partition 3–120 and do not depend on displayed systems',()=>{
  for(let n=3;n<=120;n++)assert.equal(LENGTH_BUCKETS.filter(b=>b.min<=n&&n<=b.max).length,1);
  assert.equal(lengthBucketFor(23),'n20');assert.equal(lengthBucketFor(29),'n30');assert.equal(lengthBucketFor(7),'n6');
  for(const n of [2,121,NaN,3.5])assert.equal(lengthBucketFor(n),undefined);
  const settings:PreparedExerciseSettings={schemaVersion:2,grade:1,profileId:'g1-direction-quarters',hand:'right',lengthBucket:'n4',mode:'bpm',bpm:60,durationEnabled:true,pedalEnabled:false};
  validatePreparedSettings(settings);
  assert.throws(()=>validatePreparedSettings({...settings,lengthBucket:'free-4-64'} as any));
});
test('candidate flags, changed grade, incomplete review, wrong length and unsafe assets cannot enter the prepared catalog',()=>{
  const mutations:((e:PreparedExercise)=>void)[]=[
    e=>{(e as any).schemaVersion=1;},e=>{(e as any).status='pending';},e=>{(e.review as any).status='pending';},
    e=>{e.grade=2;},e=>{e.gradeEvidence.grade=2;},e=>{e.lengthBucket='n6';},
    e=>{e.review.endReason='';},e=>{e.review.contextSha256='b'.repeat(64);},
    e=>{e.assets.notation.path='../source.mxl';},e=>{e.assets.context.sha256='b'.repeat(64);},
    e=>{e.gradeEvidence.focusEventPairs=[['unknown','n1']];},e=>{e.versions.parser='';},
    e=>{e.sourceSpan.endTick=960;},e=>{e.counts.onsets=4;},e=>{(e.review as any).teacherReviewed=true;},
  ];
  validatePreparedExercise(fixture().e);
  for(const mutate of mutations){const {e}=fixture();mutate(e);assert.throws(()=>validatePreparedExercise(e),mutate.toString());}
});
test('a one-staff left-hand excerpt maps its physical targets to the left hand',()=>{
  const {e,s}=fixture();e.hand='left';e.gradeEvidence.hand='left';
  const t=preparedTimeline(s,e,60);
  assert.equal(t.targets.length,3);assert(t.targets.every(n=>n.roles.every(r=>r==='left')));
  assert.deepEqual(t.targets.map(n=>n.atMs),[0,1000,2000]);
  assert.equal(preparedTimeline(s,e,80).targets[1].atMs,750);
  assert.throws(()=>preparedTimeline(s,e,81),/bpm-outside/);
  assert.throws(()=>preparedTimeline({...s,fingerprint:'wrong'},e,60),/snapshot-binding/);
  const bad=structuredClone(s);bad.anchors.pop();bad.performed.pop();
  assert.throws(()=>preparedTimeline(bad,e,60),/count-mismatch/);
});
test('catalog rejects duplicate exercises, mixed builder versions and changed length definitions',()=>{
  const {e}=fixture();
  const c:PreparedCatalog={schemaVersion:2,corpusVersion:h,pipeline:h,visibility:'local-only',stage:'Q4-pilot',lengthBuckets:[...LENGTH_BUCKETS],entries:[e],
    coverage:{exerciseCount:1,exactContents:1,motifs:1,sourceFiles:1,cells:[],sourceOverlapPairs:[]}};
  validatePreparedCatalog(c);
  assert.throws(()=>validatePreparedCatalog({...c,entries:[e,e]}),/catalog-count/);
  assert.throws(()=>validatePreparedCatalog({...c,pipeline:'b'.repeat(64)}),/pipeline-mismatch/);
  const changed=structuredClone(c);changed.lengthBuckets[0].max=8;
  assert.throws(()=>validatePreparedCatalog(changed),/invalid-prepared-catalog/);
});
