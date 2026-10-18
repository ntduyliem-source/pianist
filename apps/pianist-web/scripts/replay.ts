import {readFileSync} from 'node:fs';
import {replayAttempt} from '../../../packages/practice-engine-v2/results';
import type {AttemptResult} from '../../../packages/practice-engine-v2/model';
const filename=process.argv[2];if(!filename)throw Error('Usage: node --import tsx scripts/replay.ts result.json');
const result=JSON.parse(readFileSync(filename,'utf8')) as AttemptResult;
if(result.schemaVersion!==2||!result.replay)throw Error('Only v2 results with a complete event log can replay.');
const view=replayAttempt(result.timeline,result.replay.commands);
const same=['judgements','extras','intervals','faults'].every(k=>JSON.stringify(view[k as keyof typeof view])===JSON.stringify(result[k as keyof typeof result]));
console.log(JSON.stringify({same,evaluated:view.judgements.length,extras:view.extras.length,faults:view.faults},null,2));if(!same)process.exitCode=1;
