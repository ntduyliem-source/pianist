// Q2 offline/native admission check. No new grading or target-merging algorithm.
import {createTimeline, settingsFor} from '../practice-engine-v2';
import type {Anchor, ScoreSnapshot} from '../score-contracts';
import type {Fraction, SpelledPitch} from './model';

export interface AnalyzedEvent {
  id:string; lineId:string; measureIndex:number; onset:Fraction; duration:Fraction;
  kind:'note'|'rest'; pitch?:SpelledPitch; writtenPitch?:SpelledPitch;
  tieFrom?:string; tieTo?:string; tieType:string|null; chordId:string|null;
}
export interface SourceAnalysis {
  schemaVersion:1; normalizerVersion:string; music21Version:string;
  sourceSha256:string; pianoXmlSha256:string;
  parts:{id:string; staves:number; staffBase:number}[];
  lines:Record<string,{partId:string;staff:number;sourceVoice:string;staffIndex:number;
    hand:null;handAssignment:'unreviewed'}>;
  measures:{partId:string;index:number;label:string;start:Fraction;duration:Fraction}[];
  events:AnalyzedEvent[];
  contexts:{partId:string;staff:number;at:Fraction;kind:'clef'|'key'|'meter';value:Record<string,unknown>}[];
  pedals:{partId:string;staff:number;start:Fraction;end:Fraction}[];
  releaseBlockers:string[];
  nativeVerification:{status:'pending'};
  gradeStatus:'pending-q3';
}
type Semantics = ScoreSnapshot & {
  anchors:(Anchor & {spelling?:number})[];
  rests?:[number,number,number,number][];
  keys?:[number,number,number][];
};
export interface SourceVerification {
  passed:boolean; eligibleForFragmentReview:boolean; rejectionCodes:string[];
  releaseBlockers:string[];
  noteCount:number; nativeNoteCount:number; counts?:{targets:number;onsets:number};
  voiceMap:Record<string,{staff:number;voice:number}>;
  checks:string[];
}
export function exactTicks(f:Fraction):number {
  if (!Number.isSafeInteger(f.numerator)||!Number.isSafeInteger(f.denominator)||f.denominator<=0)
    throw Error('invalid-fraction');
  const n=BigInt(f.numerator)*480n,d=BigInt(f.denominator);
  if(n%d!==0n)throw Error('native-tick-resolution');
  const ticks=Number(n/d);
  if(!Number.isSafeInteger(ticks))throw Error('native-tick-overflow');
  return ticks;
}
const sorted=(values:unknown[])=>values.map(v=>JSON.stringify(v)).sort().join('\n');
// Tpc enum, src/engraving/dom/pitchspelling.h: naturals F,C,G,D,A,E,B;
// each chromatic alteration adds seven fifth positions. Only integer pitches.
const naturalTpc={C:14,D:16,E:18,F:13,G:15,A:17,B:19};

export function verifySource(analysis:SourceAnalysis, native:Semantics):SourceVerification {
  const result:SourceVerification={passed:false,eligibleForFragmentReview:false,rejectionCodes:[],
    releaseBlockers:[...analysis.releaseBlockers,...native.warnings.map(w=>'native-warning:'+w)],
    noteCount:analysis.events.filter(e=>e.kind==='note').length,nativeNoteCount:native.anchors.length,
    voiceMap:{},checks:[]};
  const reject=(code:string)=>{if(!result.rejectionCodes.includes(code))result.rejectionCodes.push(code);};
  try {
    if(analysis.schemaVersion!==1||analysis.music21Version!=='10.5.0'||native.schemaVersion!==1)
      throw Error('schema-or-parser-version');
    if(analysis.parts.reduce((n,p)=>n+p.staves,0)!==native.staves.length)reject('native-staff-count');
    const notes=analysis.events.filter((e):e is AnalyzedEvent & {pitch:SpelledPitch}=>e.kind==='note'&&!!e.pitch);
    if(notes.length!==result.noteCount||notes.length!==native.anchors.length)reject('native-note-count');
    for(const part of analysis.parts){
      const mm=analysis.measures.filter(m=>m.partId===part.id);
      if(mm.length!==native.measures.length)reject('native-measure-count');
      for(const measure of mm){
        const original=native.measures.find(m=>m.index===measure.index);
        if(!original||original.tick!==exactTicks(measure.start)||original.endTick-original.tick!==exactTicks(measure.duration))
          reject('native-measure-time');
      }
    }
    // Partition by written staff and voice. MusicXML voice labels are arbitrary
    // strings; match complete musical partitions, never assume "5 means LH".
    const nativeLines=new Map<string,Semantics['anchors']>();
    for(const n of native.anchors){
      if(n.visualStaff!==n.staff)reject('cross-staff-voice-review');
      const key=`${n.staff}/${n.voice}`,list=nativeLines.get(key)??[];
      list.push(n);nativeLines.set(key,list);
    }
    const used=new Set<string>(),mapped=new Map<string,Semantics['anchors'][number]>();
    const nSig=(n:Anchor)=>[n.measure,n.tick,n.durationTicks,n.pitch];
    const eSig=(e:AnalyzedEvent & {pitch:SpelledPitch})=>[e.measureIndex,exactTicks(e.onset),exactTicks(e.duration),e.pitch.midi];
    for(const [id,line] of Object.entries(analysis.lines)){
      const events=notes.filter(e=>e.lineId===id);
      if(!events.length)continue;
      const signature=sorted(events.map(eSig));
      const candidate=[...nativeLines].find(([key,nn])=>!used.has(key)&&nn[0].staff===line.staffIndex&&sorted(nn.map(nSig))===signature);
      if(!candidate){reject('native-voice-pitch-onset-duration');continue;}
      const [key,anchors]=candidate;used.add(key);
      result.voiceMap[id]={staff:anchors[0].staff,voice:anchors[0].voice};
      const remaining=[...anchors];
      for(const event of events){
        const index=remaining.findIndex(n=>JSON.stringify(nSig(n))===JSON.stringify(eSig(event)));
        const n=remaining.splice(index,1)[0];mapped.set(event.id,n);
        const p=event.pitch;
        if(!Number.isInteger(p.alter)||n.spelling!==naturalTpc[p.step]+7*p.alter)reject('native-pitch-spelling');
        if(!n.play)reject('native-nonplaying-note');
      }
    }
    if(used.size!==nativeLines.size)reject('unmapped-native-voice');
    for(const event of notes){
      const n=mapped.get(event.id);if(!n)continue;
      const back=event.tieFrom?mapped.get(event.tieFrom)?.id:undefined;
      if(n.tieBack!==back||event.tieFrom&&!back)reject('native-tie-link');
    }
    // MuseScore inserts spacer rests; every EXPLICIT source rest must still
    // exist with its exact duration in a corresponding voice. Extra spacers
    // are not source content and aren't counted as attacks.
    for(const event of analysis.events.filter(e=>e.kind==='rest')){
      const line=analysis.lines[event.lineId],mappedLine=result.voiceMap[event.lineId];
      const matches=(native.rests??[]).filter(r=>r[0]===exactTicks(event.onset)&&r[1]===exactTicks(event.duration)
        &&r[2]===line.staffIndex&&(!mappedLine||r[3]===mappedLine.voice));
      if(matches.length!==1)reject('native-explicit-rest');
    }
    for(const c of analysis.contexts.filter(c=>c.kind==='key')){
      const part=analysis.parts.find(p=>p.id===c.partId)!;
      const tick=exactTicks(c.at),staff=part.staffBase+c.staff-1,fifths=c.value.fifths;
      // C major is an implicit initial native key, omitted from keys[].
      if(tick===0&&fifths===0)continue;
      if(!(native.keys??[]).some(k=>k[0]===tick&&k[1]===staff&&k[2]===fifths))reject('native-key-context');
    }
    for(const part of analysis.parts){
      const meters=analysis.contexts.filter(c=>c.partId===part.id&&c.kind==='meter');
      for(const c of meters)if(!native.measures.some(m=>m.tick===exactTicks(c.at)))reject('unsupported-midmeasure-meter');
      for(const measure of native.measures){
        for(let staff=1;staff<=part.staves;staff++){
          const active=meters.filter(c=>c.staff===staff&&exactTicks(c.at)<=measure.tick)
            .sort((a,b)=>exactTicks(a.at)-exactTicks(b.at)).at(-1);
          if(!active||active.value.numerator!==measure.numerator||active.value.denominator!==measure.denominator)
            reject('native-meter-context');
        }
      }
    }
    // Native returns written pedal spans clipped at measures/repeat visits.
    // Group by native DOM pedal ID to compare the full written span once.
    const pedals=new Map<string,{partId:string;start:number;end:number}>();
    for(const pedal of native.pedals??[]){
      const k=`${pedal.partId}/${pedal.id}`,prior=pedals.get(k);
      if(prior){prior.start=Math.min(prior.start,pedal.tick);prior.end=Math.max(prior.end,pedal.endTick);}
      else pedals.set(k,{partId:pedal.partId,start:pedal.tick,end:pedal.endTick});
    }
    const expectedPedals=analysis.pedals.map(p=>{
      const part=analysis.parts.find(i=>i.id===p.partId)!;
      return [native.staves[part.staffBase]?.partId,exactTicks(p.start),exactTicks(p.end)];
    });
    if(sorted(expectedPedals)!==sorted([...pedals.values()].map(p=>[p.partId,p.start,p.end])))reject('native-pedal-span');
    if(result.rejectionCodes.length)return result;
    result.checks.push('written pitch/spelling/onset/duration/staff/voice/ties','explicit rests, keys and meter','pedal spans','measure chronology');
    const sourceAnchors:Anchor[]=notes.map(e=>({...mapped.get(e.id)!,pitch:e.pitch.midi,tick:exactTicks(e.onset),
      durationTicks:exactTicks(e.duration),tieBack:e.tieFrom?mapped.get(e.tieFrom)!.id:undefined}));
    const sourceScore={...native,anchors:sourceAnchors};
    const settings={...settingsFor(native),bpm:60,countIn:0};
    const actual=createTimeline(native,settings),expected=createTimeline(sourceScore,settings);
    const targetRows=(t:typeof actual)=>t.targets.map(n=>[n.pitch,n.atMs,n.endMs,n.anchors.length]);
    if(sorted(targetRows(actual))!==sorted(targetRows(expected)))reject('native-timeline-targets');
    else {
      result.counts={targets:actual.targets.length,onsets:actual.groups.length};
      result.checks.push('targets/ties/physical unisons via existing createTimeline');
    }
    result.passed=result.rejectionCodes.length===0;
    result.eligibleForFragmentReview=result.passed&&result.releaseBlockers.length===0;
  }catch(error){reject(error instanceof Error?error.message:String(error));}
  return result;
}
