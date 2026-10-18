// Apache-2.0, Copyright 2024 The Magenta Authors.
// Mechanical port: magenta/note-seq 3582550, sequences_lib.py
// apply_sustain_control_changes, lines 1536–1665. Original + license vendored.
// Renamed protobuf fields only; caller maps port/channel to instrument.
export interface SustainNote {id: string; pitch: number; start: number; end: number; instrument: string; drum?: boolean}
export interface SustainControl {time: number; value: number; instrument: string}
export function applySustain(notes: readonly SustainNote[], controls: readonly SustainControl[]): SustainNote[] {
  const sequence = notes.map(n => ({...n}));
  type Event = {time: number; type: number; note?: SustainNote; control?: SustainControl};
  const events: Event[] = [];
  for (const note of sequence) if (!note.drum) events.push({time: note.start, type: 2, note});
  for (const note of sequence) if (!note.drum) events.push({time: note.end, type: 3, note});
  for (const control of controls) events.push({time: control.time, type: control.value >= 64 ? 0 : 1, control});
  events.sort((a, b) => a.time - b.time || a.type - b.type);
  const active = new Map<string, SustainNote[]>(), sustained = new Map<string, boolean>();
  let time = 0;
  for (const event of events) {
    time = event.time;
    const instrument = (event.note ?? event.control)!.instrument;
    const current = active.get(instrument) ?? [];
    if (event.type === 0) sustained.set(instrument, true);
    else if (event.type === 1) {
      sustained.set(instrument, false);
      const remaining: SustainNote[] = [];
      for (const note of current) {if (note.end < time) note.end = time; else remaining.push(note);}
      active.set(instrument, remaining);
    } else if (event.type === 2) {
      const remaining: SustainNote[] = [];
      if (sustained.get(instrument)) {
        for (const note of current) {
          if (note.pitch === event.note!.pitch) {
            note.end = time;
            if (note.start === note.end) sequence.splice(sequence.indexOf(note), 1);
          } else remaining.push(note);
        }
      } else remaining.push(...current);
      remaining.push(event.note!); active.set(instrument, remaining);
    } else if (!sustained.get(instrument)) {
      const index = current.indexOf(event.note!); if (index >= 0) current.splice(index, 1);
    }
  }
  for (const current of active.values()) for (const note of current) note.end = time;
  return sequence;
}
