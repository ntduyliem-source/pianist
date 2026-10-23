import {readFileSync} from 'node:fs';
import { replayAttempt, assessReleases, ENGINE_ID, type AttemptResult } from '../../../packages/practice-engine-v2';


const filename=process.argv[2];if(!filename)throw Error('Usage: node --import tsx scripts/replay.ts result.json');
const result=JSON.parse(readFileSync(filename,'utf8')) as AttemptResult;
if(result.schemaVersion!==2||result.engine!==ENGINE_ID||!result.replay)throw Error('Replay requires a complete event log from the current engine version. Older results remain read-only.');
const view=replayAttempt(result.timeline,result.replay.commands);
const same=['judgements','extras','intervals','faults','pedalIntervals','controls'].every(k=>JSON.stringify(view[k as keyof typeof view])===JSON.stringify(result[k as keyof typeof result]))
  &&JSON.stringify(assessReleases(result.timeline,view,result.outcome))===JSON.stringify(result.r4);
console.log(JSON.stringify({same,evaluated:view.judgements.length,extras:view.extras.length,faults:view.faults,release:result.r4?.key.length,pedal:result.r4?.pedal.status},null,2));if(!same)process.exitCode=1;
