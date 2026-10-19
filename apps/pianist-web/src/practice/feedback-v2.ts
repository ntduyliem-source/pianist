import type {EngineView,Timeline,MidiEvent} from '../../../../packages/practice-engine-v2/model';
export interface Marker {kind:'current'|'hit'|'timing'|'miss'|'wrong'|'playback';label:string;symbol:string;held?:boolean}
// Presentation only. Colours use the upstream judgement; a live hold is joined
// by the exact MIDI attack sequence, never by a time window or pitch alone.
export function feedback(t:Timeline,v:EngineView,position:number,held:readonly MidiEvent[]=[],preview=false){
  const map=new Map<string,Marker>(),byId=new Map(v.judgements.map(j=>[j.id,j]));
  const group=t.settings.mode==='wait'&&!preview?t.groups[v.group]:t.groups.find(g=>g.ids.some(id=>!byId.has(id)));
  const active=t.settings.mode==='wait'&&!preview?t.targets.find(n=>n.id===group?.ids[0])?.spans[0]?.visit:t.visits.findLast(x=>position>=x.startMs)?.id;
  // Between A–B loops, retain the end of the previous pass until A starts.
  const visit=active??0;
  let passStart=0;
  for(let i=1;i<=visit;i++)if(t.visits[i].loop!==t.visits[i-1].loop||t.visits[i].measure<=t.visits[i-1].measure)passStart=i;
  const liveSequences=new Set(held.filter(e=>!e.synthetic&&!e.stateOnly).map(e=>e.sequence));
  const lastAccepted=v.judgements.reduce((seq,j)=>Math.max(seq,j.seq??0),0);
  const waitWrong=t.settings.mode==='wait'&&(v.extras.at(-1)?.sequence??0)>lastAccepted;
  const currentAnchors:string[]=[];
  for(const n of preview?[...t.targets,...t.guide]:t.targets){
    const spans=n.spans.filter(s=>s.visit>=passStart&&s.visit<=visit);if(!spans.length)continue;
    const j=byId.get(n.id),current=group?.ids.includes(n.id);
    const heldAttack=j?.seq!==null&&j?.seq!==undefined&&liveSequences.has(j.seq);
    for(const span of spans){
      let marker:Marker|undefined;
      if(preview){
        if(span.atMs<=position&&position<span.endMs)marker={kind:'playback',symbol:'•',label:'Đang phát theo trường độ bản nhạc'};
      }else if(j){
        const kind=j.grade==='miss'?'miss':t.settings.mode==='wait'||['perfect','great'].includes(j.grade)?'hit':'timing';
        marker={kind,symbol:j.grade==='miss'?'×':'✓',held:heldAttack,
          label:(heldAttack?'Đang giữ phím · ':'')+(t.settings.mode==='wait'?'Đã đánh đúng nốt':`${j.grade} · ${j.delta>0?'+':''}${Math.round(j.delta)} ms`)};
      }else if(current){
        marker={kind:waitWrong?'wrong':'current',symbol:waitWrong?'!':'•',label:waitWrong?'Có phím thừa ở bước này · chưa nhận đúng nốt':'Nốt cần chơi'};
      }
      if(marker)map.set(span.anchor,marker);
      if(current&&!preview)currentAnchors.push(span.anchor);
    }
  }
  return {markers:map,currentAnchors,expected:group?.ids.map(id=>t.targets.find(n=>n.id===id)!.pitch)??[],visit};
}
