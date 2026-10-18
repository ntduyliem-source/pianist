// MIDI state adapter. This records key and sustain-control intervals, never grades them.
// CC64 >= 64 is on; NoteOn velocity zero is converted to NoteOff by the router.
// https://midi.org/midi-1-0-control-change-messages
// soundOffMs is the logical sustain gate, NOT measured acoustic decay/half-pedal.
import type {KeyInterval, MidiEvent, PedalControl, PedalInterval} from './model';

export class MidiState {
  readonly intervals: KeyInterval[] = [];
  readonly controls:PedalControl[]=[];
  readonly pedalIntervals:PedalInterval[]=[];
  private pedalStarts=new Map<string,PedalInterval>();
  private keys = new Map<string, KeyInterval>();
  private sustaining = new Map<string, Set<KeyInterval>>();
  private pedals = new Map<string, boolean>();
  get held(): number[] {return [...new Set([...this.keys.values()].map(v => v.pitch))].sort((a, b) => a - b);}
  get pedal(): boolean {return [...this.pedals.values()].some(Boolean);}
  input(event: MidiEvent): boolean {
    const channel = `${event.portId}/${event.channel}`, key = `${channel}/${event.pitch}`;
    const at = event.timestampMs;
    if (event.kind === 'pedal') {
      this.controls.push({atMs:at,value:event.value,portId:event.portId,channel:event.channel,...(event.synthetic?{synthetic:true}:{})});
      if(event.value>=64&&!this.pedals.get(channel)){
        const interval:PedalInterval={sequence:event.sequence,onMs:at,portId:event.portId,channel:event.channel,...(event.stateOnly?{stateOnly:true}:{})};
        this.pedalIntervals.push(interval);this.pedalStarts.set(channel,interval);
      }else if(event.value<64){
        const interval=this.pedalStarts.get(channel);if(interval){interval.offMs=at;if(event.synthetic){interval.interrupted=true;interval.closedBy='reset';}this.pedalStarts.delete(channel);}
      }
      const down = event.value >= 64; this.pedals.set(channel, down);
      if (!down) {
        for (const note of this.sustaining.get(channel) ?? []) if (note.keyOffMs !== undefined && note.soundOffMs === undefined) {
          note.soundOffMs = at;
          if(event.synthetic){note.interrupted=true;note.closedBy='reset';}
        }
        this.sustaining.delete(channel);
      }
      return false;
    }
    if (event.kind === 'off') {
      const note = this.keys.get(key); if (!note) return false;
      this.keys.delete(key); note.keyOffMs = at;
      if (event.synthetic) {note.soundOffMs = at; note.interrupted = true; note.keyInterrupted = true; note.closedBy='reset';}
      else if (this.pedals.get(channel)) {
        const pending = this.sustaining.get(channel) ?? new Set<KeyInterval>(); pending.add(note); this.sustaining.set(channel, pending);
      } else note.soundOffMs = at;
      return false;
    }
    if (this.keys.has(key)) return false;
    // Keep each attack's release gate until CC64-off. Actual re-strike voice
    // stealing/envelopes depend on the instrument and are not inferred here.
    const note: KeyInterval = {sequence: event.sequence, pitch: event.pitch, channel: event.channel, portId: event.portId, onMs: at};
    if(event.stateOnly||event.synthetic)note.stateOnly=true;
    this.keys.set(key, note); this.intervals.push(note); return true;
  }
  reset(at: number, reason:'pause'|'stop'|'reset'='pause'): void {
    for (const note of this.intervals) if (note.soundOffMs === undefined) {
      if(note.keyOffMs===undefined)note.keyInterrupted=true;
      note.closedBy=reason;
      note.interrupted = true; note.keyOffMs ??= at; note.soundOffMs = at;
    }
    for(const interval of this.pedalStarts.values()){
      interval.offMs=at;interval.interrupted=true;interval.closedBy=reason;
      this.controls.push({atMs:at,value:0,portId:interval.portId,channel:interval.channel,synthetic:true});
    }
    this.pedalStarts.clear();
    this.keys.clear(); this.sustaining.clear(); this.pedals.clear();
  }
}
