/// <reference lib="webworker" />
import { PracticeEngine } from '../practice-engine-v2';
import type { PracticeWorkerRequest, PracticeWorkerMessage } from './protocol';

let engine: PracticeEngine | undefined;
let generation = '';
let sentJudgements = 0,
  sentExtras = 0;
let lastState = '';
const reply = (message: PracticeWorkerMessage) => self.postMessage(message);
self.onmessage = ({ data }: MessageEvent<PracticeWorkerRequest>) => {
  try {
    if (data.type === 'load') {
      generation = data.generation;
      engine = new PracticeEngine(data.timeline!);
      sentJudgements = sentExtras = 0;
      lastState = '';
    } else if (data.generation !== generation || !engine) return;
    const command = data.type === 'command' ? data.command : undefined;
    if (command) engine!.command(command);
    const view = engine!.view();
    const state = JSON.stringify([
      view.held,
      view.pedal,
      view.group,
      view.done,
      view.faults,
      view.releaseFeedback,
    ]);
    if (
      command?.type === 'clock' &&
      sentJudgements === view.judgements.length &&
      sentExtras === view.extras.length &&
      state === lastState
    )
      return;
    lastState = state;
    // Intervals mutate on NoteOff/CC64, unlike append-only judgements/extras.
    // The small live set is separate; full interval history is requested on close.
    reply({
      type: data.type === 'close' ? 'closed' : 'state',
      generation,
      view: {
        ...view,
        judgements: view.judgements.slice(sentJudgements),
        extras: view.extras.slice(sentExtras),
        intervals: data.type === 'close' || view.done ? view.intervals : [],
        pedalIntervals: data.type === 'close' || view.done ? view.pedalIntervals : [],
        controls: data.type === 'close' || view.done ? view.controls : [],
      },
    });
    sentJudgements = view.judgements.length;
    sentExtras = view.extras.length;
  } catch (error) {
    reply({
      type: 'failure',
      generation: data.generation,
      message: String(error),
    });
  }
};
