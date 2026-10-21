import type {Exercise} from './bank';

export interface Seen {id:string;motif:string;source:string;at:number}
/** Finite shuffle without replacement. Oldest/never-seen content comes first.
 * Recent motifs and sources are tie-breakers, never grounds to drop content.
 */
export class ExerciseSelector {
  private remaining:Exercise[];
  private recent:Seen[];
  constructor(entries:Exercise[],history:Seen[],private random=()=>Math.random()){
    this.remaining=[...entries];this.recent=[...history];
  }
  get left(){return this.remaining.length;}
  take():Exercise|undefined{
    if(!this.remaining.length)return;
    const seen=new Map(this.recent.map(s=>[s.id,s.at])),motifs=new Set(this.recent.slice(-12).map(s=>s.motif)),sources=new Set(this.recent.slice(-3).map(s=>s.source));
    const oldest=Math.min(...this.remaining.map(e=>seen.get(e.id)??0));
    let candidates=this.remaining.filter(e=>(seen.get(e.id)??0)===oldest);
    const newMotifs=candidates.filter(e=>!motifs.has(e.motifGroupId));if(newMotifs.length)candidates=newMotifs;
    const newSources=candidates.filter(e=>!sources.has(e.sourceId));if(newSources.length)candidates=newSources;
    const pick=candidates[Math.min(candidates.length-1,Math.floor(this.random()*candidates.length))];
    this.remaining=this.remaining.filter(e=>e.id!==pick.id);
    this.recent.push({id:pick.id,motif:pick.motifGroupId,source:pick.sourceId,at:Date.now()});
    return pick;
  }
}
