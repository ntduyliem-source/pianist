import type {EngineBridge, PracticePlaybackState, PlaybackNote, PlaybackNotes, PlaybackFrame} from '../../../../packages/engine-bridge';
import type {ScoreSnapshot} from '../../../../packages/score-contracts';
import type {Target} from '../../../../packages/practice-engine-v2/model';
import type {Marker} from './feedback-v2';
import {scorePositions} from './score-viewport';

export interface AuditionRange {startMs:number;endMs:number}

// A range is a contiguous part of MuseScore's performed traversal. Do not join
// disjoint visits: that would play measures outside A–B between repeats/voltas.
export function auditionRange(score:ScoreSnapshot,from:number,to:number,whole=false):AuditionRange {
  if(whole)return {startMs:0,endMs:score.durationMs};
  const first=score.occurrences.findIndex(o=>o.measure>=from&&o.measure<=to);
  if(first<0)throw Error('Đoạn này không nằm trong lịch phát MuseScore.');
  let last=first;
  while(last+1<score.occurrences.length){
    const next=score.occurrences[last+1];
    if(next.measure<from||next.measure>to)break;
    last++;
  }
  return {startMs:score.occurrences[first].startMs,endMs:score.occurrences[last].endMs};
}

// Visual adapter only: native unrolled times and anchor IDs, with no input,
// matching, grading, oscillator or wall-clock scheduling.
export function auditionPresentation(score:ScoreSnapshot,notes:readonly PlaybackNote[],tempoMultiplier:number) {
  const anchors=new Map(score.anchors.map(a=>[a.id,a]));
  const visits=score.occurrences.map((o,id)=>({id,loop:0,occurrence:o.index,measure:o.measure,startMs:o.startMs,endMs:o.endMs}));
  const visitIds=new Map(visits.map(v=>[v.occurrence,v.id]));
  const targets:Target[]=score.performed.flatMap((p,i)=>{
    const a=anchors.get(p.anchor),visit=visitIds.get(p.occurrence);
    return a&&visit!==undefined?[{id:String(i),pitch:a.pitch,atMs:p.atMs,endMs:p.endMs,measure:a.measure,occurrence:p.occurrence,loop:0,
      anchors:[a.id],spans:[{anchor:a.id,visit,atMs:p.atMs,endMs:p.endMs}],roles:[],voices:[a.voice]}]:[];
  });
  const locate=scorePositions(score,{visits,targets,guide:[],groups:[]});
  const visitsByMeasure=new Map<number,typeof visits>();
  for(const visit of visits){const list=visitsByMeasure.get(visit.measure)??[];list.push(visit);visitsByMeasure.set(visit.measure,list);}
  const notesByVisit=new Map<number,{anchor:string;pitch:number;atMs:number;endMs:number}[]>();
  for(const note of notes)for(const id of note.anchors){
    const a=anchors.get(id);if(!a)continue;
    // Native MPE times are regenerated at the selected tempo (arpeggio offsets
    // are not necessarily proportional to tempo). Only convert to the layout's
    // reference coordinate; never manufacture attack/release times here.
    const atMs=note.atMs*tempoMultiplier,endMs=note.endMs*tempoMultiplier;
    for(const visit of visitsByMeasure.get(a.measure)??[]){
      if(atMs>=visit.endMs||endMs<=visit.startMs)continue;
      const list=notesByVisit.get(visit.id)??[];
      list.push({anchor:id,pitch:note.pitch,atMs,endMs});notesByVisit.set(visit.id,list);
    }
  }
  let lastMarkers=new Map<string,Marker>(),lastExpected:number[]=[];
  return(position:number,sounding=true)=>{
    const cursor=locate(position),markers=new Map<string,Marker>(),expected:number[]=[];
    for(const n of sounding?notesByVisit.get(cursor?.visit??-1)??[]:[]){
      if(n.atMs<=position&&position<n.endMs){
        markers.set(n.anchor,{kind:'playback',symbol:'•',label:'Đang nghe MuseScore'});expected.push(n.pitch);
      }
    }
    // Cursor animation must not repaint every native glyph on every frame.
    if(markers.size!==lastMarkers.size||[...markers.keys()].some(id=>!lastMarkers.has(id))
      ||expected.length!==lastExpected.length||expected.some((p,i)=>p!==lastExpected[i])){
      lastMarkers=markers;lastExpected=expected;
    }
    return {cursor,markers:lastMarkers,expected:lastExpected};
  };
}

export interface AuditionState extends PracticePlaybackState {positionMs:number;sounding:boolean;notes:readonly PlaybackNote[]}
export class NativeAudition {
  private animation?:number;
  private disposed=false;
  private positionMs:number;
  private notes?:PlaybackNotes;
  onChange=(_state:AuditionState)=>{};
  onError=(_error:unknown)=>{};
  constructor(readonly bridge:EngineBridge,readonly range:AuditionRange){this.positionMs=range.startMs;}
  private refresh=()=>{
    if(this.disposed)return;
    try{
      const state=this.bridge.auditionState();
      if(state.error)throw Error(state.error);
      if(this.notes?.revision!==state.notesRevision)this.notes=this.bridge.auditionNotes();
      const driver=this.bridge.api.Module.driver;
      if(!driver?.playbackFrame)throw Error('Bộ âm thanh chưa hỗ trợ đồng bộ MuseScore. Hãy tải lại ứng dụng.');
      const frame:PlaybackFrame|null=driver.playbackFrame(state.clockEpoch);
      if(frame)this.positionMs=Math.max(this.range.startMs,Math.min(this.range.endMs,frame.positionSeconds*frame.tempoMultiplier*1000));
      this.onChange({...state,positionMs:this.positionMs,sounding:!!frame&&frame.status===2&&!state.preparing,notes:this.notes.events});
    }catch(error){this.stop();this.onError(error);}
  };
  private tick=()=>{this.refresh();if(!this.disposed)this.animation=requestAnimationFrame(this.tick);};
  async start(speed:number,loop:boolean){
    await this.bridge.api.Module.driver?.resume();
    if(this.disposed)return;
    this.bridge.audition('range',this.range.startMs/1000,this.range.endMs/1000);
    this.bridge.audition('tempo',speed);
    this.bridge.audition('loop',Number(loop));
    this.notes=this.bridge.auditionNotes();
    this.bridge.audition('play');
    this.tick();
  }
  async toggle(state:AuditionState){
    await this.bridge.api.Module.driver?.resume();
    if(this.disposed)return;
    this.bridge.audition(state.status==='playing'||state.preparing?'pause':'play');
    this.refresh();
  }
  seek(ms:number){this.bridge.audition('seek',ms/1000);this.refresh();}
  speed(value:number){this.bridge.audition('tempo',value);this.refresh();}
  loop(value:boolean){this.bridge.audition('loop',Number(value));}
  pause(){if(!this.disposed&&this.bridge.practiceActive)this.bridge.audition('pause');}
  stop(){
    if(this.disposed)return;
    this.disposed=true;if(this.animation!==undefined)cancelAnimationFrame(this.animation);
    if(this.bridge.practiceActive)this.bridge.audition('reset');
  }
}
