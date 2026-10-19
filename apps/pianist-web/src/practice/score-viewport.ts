import type {Anchor, Box, ScoreSnapshot} from '../../../../packages/score-contracts';
import type {Timeline} from '../../../../packages/practice-engine-v2/model';

// Presentation only: native layout and performed spans determine where to look.
// This module never associates input or grades notes.
export interface ScoreSystem {id:string;page:number;measures:number[];box:Box;crop:Box}
export interface ScoreCursor {measure:number;visit:number;loop:number;x:number;anchors:string[]}
export function scoreSystems(snapshot:ScoreSnapshot):ScoreSystem[] {
  const systems:ScoreSystem[]=[];
  for(const m of snapshot.measures){
    if(!snapshot.pages[m.page])continue;
    // The native snapshot explicitly uses the system Y/height for every measure.
    let system=systems.find(s=>s.page===m.page&&Math.abs(s.box.y-m.box.y)<1);
    if(!system){system={id:`system-${m.page}-${m.index}`,page:m.page,measures:[],box:{...m.box},crop:{...m.box}};systems.push(system);}
    system.measures.push(m.index);
    const right=Math.max(system.box.x+system.box.width,m.box.x+m.box.width);
    system.box.x=Math.min(system.box.x,m.box.x);system.box.width=right-system.box.x;system.box.height=Math.max(system.box.height,m.box.height);
  }
  // Preserve inter-system notation (lyrics/dynamics/pedal); trim page margins.
  for(const page of snapshot.pages){
    const rows=systems.filter(s=>s.page===page.index).sort((a,b)=>a.box.y-b.box.y);if(!rows.length)continue;
    // Keep horizontal page extent: instrument names/braces can precede the
    // first measure, and native annotations can extend beyond its final bar.
    const left=page.offsetX,right=page.offsetX+page.width;
    for(let i=0;i<rows.length;i++){
      const row=rows[i],prior=rows[i-1],next=rows[i+1];
      const rowAnchors=snapshot.anchors.filter(a=>row.measures.includes(a.measure)&&a.visible);
      const high=Math.min(row.box.y,...rowAnchors.map(a=>a.box.y)),low=Math.max(row.box.y+row.box.height,...rowAnchors.map(a=>a.box.y+a.box.height));
      const top=prior?(prior.box.y+prior.box.height+row.box.y)/2:Math.max(page.offsetY,high-450);
      const bottom=next?(row.box.y+row.box.height+next.box.y)/2:Math.min(page.offsetY+page.height,low+350);
      row.crop={x:left-page.offsetX,y:top-page.offsetY,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
    }
  }
  return systems;
}
function lastAt<T>(items:T[],position:number,time:(item:T)=>number){let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>>1;if(time(items[mid])<=position)lo=mid+1;else hi=mid;}return lo-1;}
export function scorePositions(snapshot:ScoreSnapshot,t:Timeline){
  const anchors=new Map(snapshot.anchors.filter(a=>a.visible).map(a=>[a.id,a])),targets=new Map(t.targets.map(n=>[n.id,n]));
  const points=new Map<number,{at:number;x:number;anchors:string[]}[]>();
  for(const target of [...t.targets,...t.guide])for(const span of target.spans){const a=anchors.get(span.anchor);if(!a)continue;const list=points.get(span.visit)??[];list.push({at:span.atMs,x:a.box.x+a.box.width/2,anchors:[a.id]});points.set(span.visit,list);}
  for(const [visit,list] of points){list.sort((a,b)=>a.at-b.at||a.x-b.x);const merged:typeof list=[];for(const point of list){const last=merged.at(-1);if(last&&Math.abs(last.at-point.at)<.01){last.x=Math.min(last.x,point.x);last.anchors.push(...point.anchors);}else merged.push({...point,anchors:[...point.anchors]});}points.set(visit,merged);}
  return(position:number,waitGroup?:number):ScoreCursor|undefined=>{
    if(!t.visits.length)return;
    if(waitGroup!==undefined){
      const group=t.groups[Math.min(waitGroup,t.groups.length-1)],notes=group?.ids.flatMap(id=>targets.get(id)??[])??[];
      const span=notes[0]?.spans[0],visit=t.visits.find(v=>v.id===span?.visit)??t.visits[0];
      const ids=notes.flatMap(n=>n.spans.filter(s=>s.visit===visit.id).map(s=>s.anchor)),boxes=ids.flatMap(id=>anchors.get(id)??[]);
      return{measure:visit.measure,visit:visit.id,loop:visit.loop,x:boxes[0]?.box.x??snapshot.measures[visit.measure].box.x,anchors:ids};
    }
    const visit=t.visits[Math.max(0,lastAt(t.visits,position,v=>v.startMs))],m=snapshot.measures[visit.measure],list=points.get(visit.id)??[];
    const i=lastAt(list,position,p=>p.at),before=list[i],after=list[i+1];
    const from=before??{at:visit.startMs,x:m.box.x+20,anchors:[]},to=after??{at:visit.endMs,x:m.box.x+m.box.width-20};
    const ratio=Math.max(0,Math.min(1,(position-from.at)/Math.max(1,to.at-from.at)));
    return{measure:visit.measure,visit:visit.id,loop:visit.loop,x:from.x+(to.x-from.x)*ratio,anchors:before?.anchors??after?.anchors??[]};
  };
}
export function beatPosition(t:Timeline,position:number){
  const i=lastAt(t.clicks,position,b=>b.atMs);if(i<0)return{beat:0,total:0,bpm:t.settings.bpm};
  let start=i,end=i+1;while(start>0&&!t.clicks[start].accent)start--;while(end<t.clicks.length&&!t.clicks[end].accent)end++;
  const gap=t.clicks[i+1]?t.clicks[i+1].atMs-t.clicks[i].atMs:i>0?t.clicks[i].atMs-t.clicks[i-1].atMs:0;
  return{beat:i-start,total:end-start,bpm:gap>0?Math.round(60000/gap):t.settings.bpm};
}
export interface FollowGeometry {top:number;bottom:number;left:number;focusTop:number;focusBottom:number;scrollTop:number;scrollLeft:number;width:number;height:number;contentWidth:number;contentHeight:number}
export function followTarget(g:FollowGeometry,force=false){
  const pad=16,available=g.height-pad*2,tall=g.bottom-g.top>available;
  const top=tall?g.focusTop:g.top,bottom=tall?g.focusBottom:g.bottom;
  let y=g.scrollTop;if(force||top<g.scrollTop+g.height*.14||bottom>g.scrollTop+g.height*.72){y=top-g.height*.24;if(bottom-y>g.height-pad)y=bottom-g.height+pad;if(bottom-top>available)y=top-pad;}
  let x=g.scrollLeft;if(g.left<x+g.width*.12||g.left>x+g.width*.85)x=g.left-g.width*.3;
  return{top:Math.max(0,Math.min(g.contentHeight-g.height,y)),left:Math.max(0,Math.min(g.contentWidth-g.width,x))};
}
export function anchorBounds(anchors:Anchor[],fallback:Box):Box{
  if(!anchors.length)return fallback;const x=Math.min(...anchors.map(a=>a.box.x)),y=Math.min(...anchors.map(a=>a.box.y));
  return{x,y,width:Math.max(...anchors.map(a=>a.box.x+a.box.width))-x,height:Math.max(...anchors.map(a=>a.box.y+a.box.height))-y};
}
