// MIT. Mechanical standalone probe of DrawableHoldNoteTail at osu! 676f3b0.
// Explicit exercise: one tail at endMs, with externally specified head-hit and
// body-break state. This is NOT a complete hold lifecycle or a piano duration
// grader. No CC64/articulation conversion is defined; not wired to the app.
import {ManiaHitWindows,GRADE_ORDER,type Grade} from './mania';
export function holdTailProbe(deltaMs:number,headHit:boolean,bodyBreak:boolean):Grade|'none'{
  const windows=new ManiaHitWindows(5);
  // TailNote.RELEASE_WINDOW_LENIENCE; CheckForResult delegates the scaled offset.
  const offset=deltaMs/1.5;
  if(!windows.canBeHit(offset))return 'miss';
  const result=windows.resultFor(offset);
  if(!result)return 'none';
  // DrawableHoldNoteTail.GetCappedResult, unchanged condition.
  return GRADE_ORDER.indexOf(result)>GRADE_ORDER.indexOf('meh')&&(!headHit||bodyBreak)?'meh':result;
}
