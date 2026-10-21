import lengths from '../../scores/curriculum/length-buckets.v2.json';
import profiles from '../../scores/curriculum/grades.v2.json';
import type {LengthBucket, LengthBucketId, PreparedExercise, PreparedCatalog, PreparedExerciseSettings} from './prepared-model';
import type {ScoreSnapshot} from '../score-contracts';
import {createTimeline,settingsFor} from '../practice-engine-v2/score-adapter';
import {exerciseCounts} from './contract';

export const LENGTH_BUCKETS = lengths.buckets as readonly LengthBucket[];
const hash = (v:unknown):v is string => typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v:unknown,min:number,max:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
export function lengthBucketFor(count:number):LengthBucketId|undefined{
  if(!Number.isSafeInteger(count))return undefined;
  return LENGTH_BUCKETS.find(b=>count>=b.min&&count<=b.max)?.id;
}
export function validatePreparedSettings(s:PreparedExerciseSettings):void{
  if(!s||s.schemaVersion!==2||!integer(s.grade,1,8)||typeof s.profileId!=='string'||!s.profileId.trim()
    ||!LENGTH_BUCKETS.some(b=>b.id===s.lengthBucket)||!['left','right','both'].includes(s.hand)
    ||!['wait','bpm'].includes(s.mode)||!Number.isFinite(s.bpm)||s.bpm<20||s.bpm>300
    ||typeof s.durationEnabled!=='boolean'||typeof s.pedalEnabled!=='boolean')throw Error('invalid-prepared-settings');
}
export function validatePreparedExercise(value:unknown):asserts value is PreparedExercise{
  const e=value as PreparedExercise;
  if(!e||e.schemaVersion!==2||!hash(e.id)||!hash(e.sourceSha256)||!hash(e.exactHash)||!hash(e.motifHash)
    ||typeof e.title!=='string'||!e.title.trim()||!integer(e.grade,1,8)
    ||!['left','right','both'].includes(e.hand)||!['motif','phrase','phrase-sequence','complete-piece'].includes(e.unitKind)
    ||!e.counts||!integer(e.counts.targets,3,120)||!integer(e.counts.onsets,1,e.counts.targets)
    ||lengthBucketFor(e.counts.targets)!==e.lengthBucket||e.status!=='approved-local-pilot'||e.visibility!=='local-only')
    throw Error('invalid-prepared-exercise');
  const profile=profiles.profiles.find(p=>p.id===e.profileId);
  if(!profile||profile.grade!==e.grade||e.hand==='both')throw Error('prepared-profile-not-implemented');
  const r=e.review,g=e.gradeEvidence,p=e.projectionVerification;
  if(!r||r.status!=='accepted-local-pilot'||r.reviewerRole!=='assistant'||r.teacherReviewed!==false
    ||r.method!=='source-context-and-score-inspection'||!hash(r.selectionSha256)||!hash(r.contextSha256)
    ||!['startReason','endReason','musicalReason','handReason','tonalityReason'].every(k=>typeof (r as any)[k]==='string'&&(r as any)[k].trim().length>=20)
    ||!g||g.passed!==true||g.rejectionCodes?.length!==0||g.contextSha256!==r.contextSha256
    ||g.grade!==e.grade||g.profileId!==e.profileId||g.hand!==e.hand
    ||!Array.isArray(g.focusEventPairs)||!g.focusEventPairs.length||!p||p.passed!==true||p.rejectionCodes?.length!==0)
    throw Error('prepared-review-not-bound');
  if(!e.source||e.source.sourceSha256!==e.sourceSha256||!hash(e.source.analysisSha256)||!e.source.origins?.length
    ||!Array.isArray(e.sourceEventIds)||!e.sourceEventIds.length||new Set(e.sourceEventIds).size!==e.sourceEventIds.length
    ||JSON.stringify(e.sourceEventIds)!==JSON.stringify(g.sourceEventIds)
    ||g.focusEventPairs.some(pair=>pair.length!==2||pair.some(id=>!e.sourceEventIds.includes(id))))throw Error('prepared-source-binding');
  const span=e.sourceSpan,b=e.bpm;
  if(!span||!integer(span.startMeasure,0,1e6)||!integer(span.endMeasure,span.startMeasure+1,1e6)
    ||!integer(span.startTick,0,1e12)||!integer(span.endTick,span.startTick+1,1e12)||span.ticksPerQuarter!==480
    ||!b||!Number.isFinite(b.min)||!Number.isFinite(b.max)||b.min<20||b.max<b.min||b.max>300||![1,1.5].includes(b.beatQuarter)
    ||!e.durationQuarter||!integer(e.durationQuarter.numerator,1,1e9)||!integer(e.durationQuarter.denominator,1,1e9)
    ||Math.abs(e.durationQuarter.numerator/e.durationQuarter.denominator-(span.endTick-span.startTick)/480)>1e-9)
    throw Error('prepared-span-or-tempo');
  for(const key of ['parser','profile','lengths','builder','native','engine'] as const)
    if(!hash(e.versions?.[key]))throw Error('prepared-version-missing');
  for(const [kind,name] of Object.entries({notation:'exercise.musicxml',snapshot:'snapshot.json',timeline:'timeline.json',context:'context.json'})){
    const a=e.assets?.[kind as keyof PreparedExercise['assets']];
    if(!a||a.path!=='exercises/'+e.id+'/'+name||!hash(a.sha256)||!integer(a.bytes,1,32*1024*1024))throw Error('prepared-asset-binding');
  }
  if(e.assets.context.sha256!==r.contextSha256)throw Error('prepared-context-asset-binding');
}
export function validatePreparedCatalog(value:unknown):asserts value is PreparedCatalog{
  const c=value as PreparedCatalog;
  if(!c||c.schemaVersion!==2||!hash(c.corpusVersion)||!hash(c.pipeline)||c.visibility!=='local-only'||c.stage!=='Q4-pilot'
    ||JSON.stringify(c.lengthBuckets)!==JSON.stringify(LENGTH_BUCKETS)||!Array.isArray(c.entries))throw Error('invalid-prepared-catalog');
  for(const e of c.entries){validatePreparedExercise(e);if(e.versions.builder!==c.pipeline)throw Error('prepared-pipeline-mismatch');}
  if(new Set(c.entries.map(e=>e.id)).size!==c.entries.length||c.coverage?.exerciseCount!==c.entries.length)throw Error('prepared-catalog-count');
}
/** Offline/native validation and later Q5 integration use the unchanged adapter. */
export function preparedTimeline(snapshot:ScoreSnapshot,exercise:PreparedExercise,bpm:number){
  validatePreparedExercise(exercise);
  if(snapshot?.schemaVersion!==1||snapshot.fingerprint!==exercise.assets.notation.sha256)throw Error('prepared-snapshot-binding');
  if(!Number.isFinite(bpm)||bpm<exercise.bpm.min||bpm>exercise.bpm.max)throw Error('prepared-bpm-outside-reviewed-range');
  const roles=Object.fromEntries(snapshot.staves.map((s,i)=>[s.id,exercise.hand==='both'?(i===0?'right':'left'):exercise.hand]));
  const timeline=createTimeline(snapshot,{...settingsFor(snapshot),roles,hand:exercise.hand,bpm,beatQuarter:exercise.bpm.beatQuarter,
    tempoMode:'fixed',loops:1,countIn:0,accompaniment:false});
  if(JSON.stringify(exerciseCounts(timeline))!==JSON.stringify(exercise.counts))throw Error('prepared-native-count-mismatch');
  return timeline;
}
