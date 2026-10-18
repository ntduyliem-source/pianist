import type {EngineView,Timeline} from '../../../../packages/practice-engine-v2/model';
export interface Marker {kind:'current'|'hit'|'timing'|'miss'|'pressed';label:string;symbol:string;provisional?:boolean}
// Presentation only: a judgement's grade comes from upstream. Physical key
// highlighting uses a separate 'pressed' state and never claims a correct hit.
export function feedback(t:Timeline,v:EngineView,position:number,held:number[]){
  const map=new Map<string,Marker>(),byId=new Map(v.judgements.map(j=>[j.id,j]));
  const group=t.settings.mode==='wait'?t.groups[v.group]:t.groups.find(g=>g.ids.some(id=>!byId.has(id)));
  const active=t.settings.mode==='wait'?t.targets.find(n=>n.id===group?.ids[0])?.spans[0]?.visit:t.visits.find(x=>position>=x.startMs&&position<x.endMs)?.id;
  const visit=active??(position<0?0:t.visits.at(-1)?.id??0);
  let passStart=0;
  for(let i=1;i<=visit;i++)if(t.visits[i].loop!==t.visits[i-1].loop||t.visits[i].measure<=t.visits[i-1].measure)passStart=i;
  const currentAnchors:string[]=[];
  for(const n of t.targets){
    const spans=n.spans.filter(s=>s.visit>=passStart&&s.visit<=visit);if(!spans.length)continue;
    const j=byId.get(n.id),current=group?.ids.includes(n.id);
    let marker:Marker|undefined;
    if(j){const hit=j.grade!=='miss';marker={kind:!hit?'miss':t.settings.mode==='wait'||['perfect','great'].includes(j.grade)?'hit':'timing',symbol:hit?'✓':'×',label:t.settings.mode==='wait'?'Đã đánh đúng nốt':`${j.grade} · ${j.delta>0?'+':''}${Math.round(j.delta)} ms`};}
    else if(current)marker={kind:'current',symbol:'•',label:'Nốt đang tập'};
    if(held.includes(n.pitch)&&(current||j&&Math.abs(position-j.at)<250))marker={kind:'pressed',symbol:marker?.symbol??'•',label:'Đang giữ phím · '+(marker?.label??'chưa đánh giá')};
    for(const span of spans){if(marker)map.set(span.anchor,marker);if(current)currentAnchors.push(span.anchor);}
  }
  return {markers:map,currentAnchors,expected:group?.ids.map(id=>t.targets.find(n=>n.id===id)!.pitch)??[],visit};
}
