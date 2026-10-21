import type {ScoreSnapshot} from '../../../../packages/score-contracts';
import {settingsFor} from '../../../../packages/practice-engine-v2/score-adapter';
import type {PracticeSettings} from '../../../../packages/practice-engine-v2/model';
import type {Exercise} from './bank';

export function exerciseSettings(snapshot:ScoreSnapshot,entry:Exercise,selection:{mode:'wait'|'bpm';bpm:number},deviceId:string):PracticeSettings{
  const config=settingsFor(snapshot);
  // One-staff left-hand excerpts must not inherit settingsFor's first=right default.
  config.roles=Object.fromEntries(snapshot.staves.map((s,i)=>[s.id,entry.hand==='both'?(i===0?'right':'left'):entry.hand]));
  return {...config,hand:entry.hand,mode:selection.mode,bpm:selection.bpm,
    beatQuarter:(entry.beatQuarter.length===1&&[.5,1,1.5].includes(entry.beatQuarter[0])?entry.beatQuarter[0]:1) as .5|1|1.5,
    deviceId,inputSource:deviceId==='virtual'?'virtual':'midi'};
}
