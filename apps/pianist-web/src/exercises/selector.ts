import type {Exercise} from './bank';

export interface QueueItem {entry:Exercise;round:number;position:number;total:number}

/** One finite permutation per round. Prefetch consumes entries ahead of display,
 * so round and position travel with the entry, never with mutable UI counters. */
export class ExerciseSelector {
  private readonly entries:Exercise[];
  private remaining:Exercise[]=[];
  private previous?:Exercise;
  private round=0;
  private position=0;
  constructor(entries:Exercise[],private readonly randomize:boolean,private readonly random=()=>Math.random()){
    this.entries=[...new Map(entries.map(e=>[e.id,e])).values()];
  }
  get total(){return this.entries.length;}
  get left(){return this.remaining.length;}
  private nextRound(){
    this.round++;this.position=0;
    if(this.randomize){this.remaining=[...this.entries];return;}
    const buckets=new Map<string,Exercise[]>();
    for(const e of this.entries){const list=buckets.get(e.lengthBucket)??[];list.push(e);buckets.set(e.lengthBucket,list);}
    const lists=[...buckets].sort(([a],[b])=>Number(a.slice(1))-Number(b.slice(1))).map(([,list])=>list.sort((a,b)=>a.bookPosition-b.bookPosition||a.scoreId.localeCompare(b.scoreId)));
    this.remaining=[];
    for(let i=0;i<Math.max(0,...lists.map(list=>list.length));i++)for(const list of lists)if(list[i])this.remaining.push(list[i]);
  }
  take():QueueItem|undefined{
    if(!this.entries.length)return;
    if(!this.remaining.length)this.nextRound();
    let entry=this.remaining[0];
    if(this.randomize){
      let candidates=this.remaining;
      if(this.previous){
        const different=candidates.filter(e=>e.sourceId!==this.previous!.sourceId&&e.motifGroupId!==this.previous!.motifGroupId);
        if(different.length)candidates=different;
        else{
          const sources=candidates.filter(e=>e.sourceId!==this.previous!.sourceId);
          const motifs=candidates.filter(e=>e.motifGroupId!==this.previous!.motifGroupId);
          if(sources.length)candidates=sources;else if(motifs.length)candidates=motifs;
        }
      }
      const value=this.random();
      entry=candidates[Math.min(candidates.length-1,Math.max(0,Math.floor((Number.isFinite(value)?value:0)*candidates.length)))];
    }
    this.remaining=this.remaining.filter(e=>e.id!==entry.id);this.previous=entry;
    return{entry,round:this.round,position:++this.position,total:this.total};
  }
}
