import {readFileSync} from 'node:fs';
import {replay} from '../../../packages/practice-core/replay';
import type {SessionResult} from '../../../packages/score-contracts/index';
const filename = process.argv[2];
if (!filename) throw Error('Usage: node --import tsx scripts/replay.ts result.json');
const result = JSON.parse(readFileSync(filename, 'utf8')) as SessionResult;
if (!result.replay?.commands) throw Error('This result has no complete replay log.');
const state = replay(result.replay.plan, result.replay.commands);
const same = JSON.stringify(state.assessments) === JSON.stringify(result.assessments)
  && JSON.stringify(state.extras) === JSON.stringify(result.extraEvents);
console.log(JSON.stringify({same, evaluated: state.assessments.length, extras: state.extras.length, faults: state.faults}, null, 2));
if (!same) process.exitCode = 1;
