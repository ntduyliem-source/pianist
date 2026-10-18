import type {Timeline,MidiEvent} from '../../../../packages/practice-engine-v2/model';
import {settingsFor,createTimeline} from '../../../../packages/practice-engine-v2/score-adapter';
import type {ScoreSnapshot} from '../../../../packages/score-contracts';
export function scoreFixture(): ScoreSnapshot {
  const box={x:0,y:0,width:10,height:10};
  return {schemaVersion:1,projectId:'fixture',revision:1,fingerprint:'test',title:'Fixture',baseQuarterBpm:120,durationMs:2000,
    staves:[{id:0,part:'Piano',partId:'p'}],pages:[],warnings:[],
    measures:[{index:0,label:1,tick:0,endTick:1920,page:0,box,numerator:4,denominator:4}],
    anchors:[{id:'n',pitch:60,tick:480,durationTicks:480,measure:0,staff:0,visualStaff:0,track:0,voice:0,page:0,visible:true,play:true,box}],
    occurrences:[{index:0,measure:0,startMs:0,endMs:2000,utick:0}],
    performed:[{anchor:'n',occurrence:0,atMs:500,endMs:1000}],beats:[0,500,1000,1500].map(atMs=>({atMs,accent:atMs===0,occurrence:0,beatQuarter:1}))};
}
export function timeline(at:number[]= [500],pitches=at.map(()=>60)): Timeline {
  const s=scoreFixture(), c={...settingsFor(s),mode:'bpm' as const};
  const result=createTimeline(s,c);
  result.targets=at.map((a,i)=>({...result.targets[0],id:'n'+i,pitch:pitches[i],atMs:a,endMs:a+100}));
  result.groups=[];
  for(const t of result.targets){const g=result.groups.at(-1); if(g?.atMs===t.atMs)g.ids.push(t.id);else result.groups.push({atMs:t.atMs,ids:[t.id]});}
  result.durationMs=Math.max(...at)+500;return result;
}
export function midi(sequence:number,kind:MidiEvent['kind'],timestampMs:number,pitch=60,value=kind==='on'?90:0,delay=0):MidiEvent{
  return {sequence,kind,pitch,value,channel:0,portId:'virtual',source:'virtual',timestampMs,receivedMs:timestampMs+delay};
}
