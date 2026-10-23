import {performance} from 'node:perf_hooks';
import {writeFileSync,mkdirSync} from 'node:fs';
import { PracticeEngine, ENGINE_ID } from '../../packages/practice-engine-v2';

import {timeline} from '../../apps/pianist-web/tests/helpers/fixtures-v2';
const count=50000,start=performance.now();
const t=timeline(Array.from({length:count},(_,i)=>1000+i*50),Array.from({length:count},(_,i)=>21+i%88));
const engine=new PracticeEngine(t),built=performance.now(),steps:number[]=[];let sequence=0;
for(const target of t.targets){const before=performance.now();
  for(const kind of ['on','off'] as const){const timestampMs=target.atMs+(kind==='off'?1:0);engine.input({sequence:++sequence,kind,pitch:target.pitch,value:kind==='on'?90:0,channel:0,portId:'virtual',source:'virtual',timestampMs,receivedMs:timestampMs});}
  engine.clock(target.atMs+1);steps.push(performance.now()-before);
}
engine.clock(t.durationMs+1000);const v=engine.view();
if(!v.done||v.judgements.length!==count||v.judgements.some(j=>j.grade!=='perfect')||v.faults.length)throw Error('Stress failed');
steps.sort((a,b)=>a-b);const output={engine:ENGINE_ID,notes:count,events:sequence,buildMs:built-start,replayMs:performance.now()-built,stepP99Ms:steps[Math.floor(count*.99)],stepMaxMs:steps.at(-1),heapMiB:process.memoryUsage().heapUsed/1024**2,scope:'Node production engine, excludes browser audio/DOM and physical MIDI',judgements:v.judgements.length,extras:v.extras.length,faults:v.faults};
mkdirSync('artifacts/r0-r7',{recursive:true});writeFileSync('artifacts/r0-r7/stress.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
