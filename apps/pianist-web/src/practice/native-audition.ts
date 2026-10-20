import type {EngineBridge, PracticePlaybackState} from '../../../../packages/engine-bridge';
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
export function auditionPresentation(score:ScoreSnapshot) {
  const anchors=new Map(score.anchors.map(a=>[a.id,a]));
  const visits=score.occurrences.map((o,id)=>({id,loop:0,occurrence:o.index,measure:o.measure,startMs:o.startMs,endMs:o.endMs}));
  const visitIds=new Map(visits.map(v=>[v.occurrence,v.id]));
  const targets:Target[]=score.performed.flatMap((p,i)=>{
    const a=anchors.get(p.anchor),visit=visitIds.get(p.occurrence);
    return a&&visit!==undefined?[{id:String(i),pitch:a.pitch,atMs:p.atMs,endMs:p.endMs,measure:a.measure,occurrence:p.occurrence,loop:0,
      anchors:[a.id],spans:[{anchor:a.id,visit,atMs:p.atMs,endMs:p.endMs}],roles:[],voices:[a.voice]}]:[];
  });
  const locate=scorePositions(score,{visits,targets,guide:[],groups:[]});
  const notesByVisit=new Map<number,Target[]>();
  for(const n of targets){const id=n.spans[0].visit,list=notesByVisit.get(id)??[];list.push(n);notesByVisit.set(id,list);}
  return(position:number)=>{
    const cursor=locate(position),markers=new Map<string,Marker>(),expected:number[]=[];
    for(const n of notesByVisit.get(cursor?.visit??-1)??[]){
      if(n.atMs<=position&&position<n.endMs){
        markers.set(n.anchors[0],{kind:'playback',symbol:'•',label:'Đang nghe MuseScore'});expected.push(n.pitch);
      }
    }
    return {cursor,markers,expected};
  };
}

export interface AuditionState extends PracticePlaybackState {positionMs:number}
export class NativeAudition {
  private timer?:ReturnType<typeof setInterval>;
  private disposed=false;
  onChange=(_state:AuditionState)=>{};
  onError=(_error:unknown)=>{};
  constructor(readonly bridge:EngineBridge,readonly range:AuditionRange){}
  private refresh=()=>{
    if(this.disposed)return;
    try{
      const state=this.bridge.auditionState();
      if(state.error)throw Error(state.error);
      this.onChange({...state,positionMs:Math.max(this.range.startMs,Math.min(this.range.endMs,state.positionSeconds*state.tempoMultiplier*1000))});
    }catch(error){this.stop();this.onError(error);}
  };
  start(speed:number,loop:boolean){
    this.bridge.api.Module.driver?.resume();
    this.bridge.audition('range',this.range.startMs/1000,this.range.endMs/1000);
    this.bridge.audition('tempo',speed);
    this.bridge.audition('loop',Number(loop));
    this.bridge.audition('play');
    this.timer=setInterval(this.refresh,60);
    this.refresh();
  }
  toggle(state:AuditionState){
    this.bridge.api.Module.driver?.resume();
    this.bridge.audition(state.status==='playing'||state.preparing?'pause':'play');
    this.refresh();
  }
  seek(ms:number){this.bridge.audition('seek',ms/1000);this.refresh();}
  speed(value:number){this.bridge.audition('tempo',value);this.refresh();}
  loop(value:boolean){this.bridge.audition('loop',Number(value));}
  pause(){if(!this.disposed&&this.bridge.practiceActive)this.bridge.audition('pause');}
  stop(){
    if(this.disposed)return;
    this.disposed=true;clearInterval(this.timer);
    if(this.bridge.practiceActive)this.bridge.audition('reset');
  }
}
