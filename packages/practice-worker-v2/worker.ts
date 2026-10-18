/// <reference lib="webworker" />
import {PracticeEngine} from '../practice-engine-v2/engine';
import type {ReplayCommand, Timeline} from '../practice-engine-v2/model';

let engine: PracticeEngine | undefined;
let generation = '';
let sentJudgements = 0, sentExtras = 0;
let lastState='';
self.onmessage = ({data}: MessageEvent<{type: string; generation: string; timeline?: Timeline; command?: ReplayCommand}>) => {
  try {
    if (data.type === 'load') {
      generation = data.generation; engine = new PracticeEngine(data.timeline!); sentJudgements = sentExtras = 0;lastState='';
    } else if (data.generation !== generation || !engine) return;
    if (data.command) engine!.command(data.command);
    const view = engine!.view();
    const state=JSON.stringify([view.held,view.pedal,view.group,view.done,view.faults,view.releaseFeedback]);
    if(data.command?.type==='clock'&&sentJudgements===view.judgements.length&&sentExtras===view.extras.length&&state===lastState)return;
    lastState=state;
    // Intervals mutate on NoteOff/CC64, unlike append-only judgements/extras.
    // The small live set is separate; full interval history is requested on close.
    self.postMessage({type: data.type === 'close' ? 'closed' : 'state', generation,
      view: {...view, judgements: view.judgements.slice(sentJudgements), extras: view.extras.slice(sentExtras),
        intervals: data.type === 'close' || view.done ? view.intervals : [],
        pedalIntervals:data.type==='close'||view.done?view.pedalIntervals:[],controls:data.type==='close'||view.done?view.controls:[]}});
    sentJudgements = view.judgements.length; sentExtras = view.extras.length;
  } catch (error) {
    self.postMessage({type: 'failure', generation: data.generation, message: String(error)});
  }
};
