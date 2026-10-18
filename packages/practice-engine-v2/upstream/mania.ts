// Port of osu!lazer 676f3b01f28841ebd97ab583e178f2d7b99fe48c.
// Copyright (c) ppy Pty Ltd. MIT: third_party/practice-sources/osu/LICENCE.
// Provenance: HitWindows.ResultFor/CanBeHit, ManiaHitWindows.updateWindows,
// DrawableNote.CheckForResult/OnPressed, DrawableHitObject.UpdateResult,
// OrderedHitPolicy.IsHittable/HandleHit, HitObjectContainer.Compare.
// Adaptations: headless data instead of Drawables; a MIDI pitch is a column;
// supported profile is modern Mania (no Classic/Convert/clock-rate mods).
// Prefix cursors accelerate expired/judged objects; differential tests cover
// their behaviour against the original C# methods and unoptimised container.

export type Grade = 'miss' | 'meh' | 'ok' | 'good' | 'great' | 'perfect';
export interface KernelNote {id: string; pitch: number; at: number}
export interface Judgement {id: string; grade: Grade; at: number; delta: number; seq: number | null}
export const GRADE_ORDER: Grade[] = ['miss', 'meh', 'ok', 'good', 'great', 'perfect'];
// ScoreProcessor.GetBaseScoreForResult + ManiaScoreProcessor's Perfect override.
export const BASE_SCORE: Readonly<Record<Grade, number>> = Object.freeze({miss: 0, meh: 50, ok: 100, good: 200, great: 300, perfect: 305});

export class ManiaHitWindows {
  readonly values: Record<Grade, number>;
  constructor(readonly difficulty = 5) {
    if (!Number.isFinite(difficulty) || difficulty < 0 || difficulty > 10) throw Error('Invalid osu!mania difficulty');
    const range = (min: number, mid: number, max: number) => {
      // IBeatmapDifficultyInfo.DifficultyRange, then upstream floor + 0.5.
      const mapped = difficulty > 5 ? mid + (max - mid) * ((difficulty - 5) / 5)
        : difficulty < 5 ? mid + (mid - min) * ((difficulty - 5) / 5) : mid;
      return Math.floor(mapped) + 0.5;
    };
    this.values = {perfect: range(22.4, 19.4, 13.9), great: range(64, 49, 34), good: range(97, 82, 67),
      ok: range(127, 112, 97), meh: range(151, 136, 121), miss: range(188, 173, 158)};
  }
  resultFor(offset: number): Grade | undefined {
    const absolute = Math.abs(offset);
    for (let i = GRADE_ORDER.length - 1; i >= 0; i--) {
      const result = GRADE_ORDER[i];
      if (absolute <= this.values[result]) return result;
    }
    return undefined;
  }
  canBeHit(offset: number): boolean {return offset <= this.values.meh;}
}

interface Drawable {note: KernelNote; judgement?: Judgement; laneIndex: number}
interface Column {objects: Drawable[]; first: number}
export class ManiaKernel {
  readonly windows: ManiaHitWindows;
  readonly judgements: Judgement[] = [];
  readonly extras: number[] = [];
  readonly notes: KernelNote[];
  private readonly columns = new Map<number, Column>();
  private readonly ordered: Drawable[] = [];
  private expired = 0;
  constructor(notes: readonly KernelNote[], difficulty = 5) {
    this.windows = new ManiaHitWindows(difficulty);
    this.notes = [...notes].sort((a, b) => a.at - b.at);
    const ids = new Set<string>();
    for (const note of this.notes) {
      if (ids.has(note.id) || !Number.isFinite(note.at) || !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) throw Error('Invalid kernel target');
      ids.add(note.id);
      const column = this.columns.get(note.pitch) ?? {objects: [], first: 0};
      this.columns.set(note.pitch, column);
      const object: Drawable = {note, laneIndex: column.objects.length};
      column.objects.push(object); this.ordered.push(object);
    }
  }
  private apply(object: Drawable, grade: Grade, now: number, seq: number | null): Judgement {
    if (object.judgement) throw Error('Cannot apply result on an already judged hitobject');
    const result = object.judgement = {id: object.note.id, grade, at: now, delta: now - object.note.at, seq};
    this.judgements.push(result);
    // Column.OnNewResult -> OrderedHitPolicy.HandleHit: only successful hits
    // force earlier unjudged notes to miss. Miss/None never trigger this path.
    if (grade !== 'miss') {
      const column = this.columns.get(object.note.pitch)!;
      for (let i = column.first; i < object.laneIndex; i++) {
        const previous = column.objects[i];
        if (previous.note.at >= object.note.at) break;
        if (!previous.judgement) this.apply(previous, 'miss', now, null);
      }
    }
    return result;
  }
  advance(now: number): void {
    // DrawableNote.CheckForResult(false): strict expiry after the lowest
    // successful window. A boundary input at exactly +Meh is still hittable.
    while (this.expired < this.ordered.length) {
      const object = this.ordered[this.expired];
      if (this.windows.canBeHit(now - object.note.at)) break;
      if (!object.judgement) this.apply(object, 'miss', now, null);
      this.expired++;
    }
  }
  press(now: number, pitch: number, seq: number): Judgement | undefined {
    this.advance(now);
    const column = this.columns.get(pitch);
    if (column) {
      while (column.first < column.objects.length && column.objects[column.first].judgement) column.first++;
      // HitObjectContainer.Compare dispatches earlier objects first.
      for (let i = column.first; i < column.objects.length; i++) {
        const object = column.objects[i];
        if (object.judgement) continue; // DrawableHitObject.UpdateResult
        const next = column.objects[i + 1];
        if (next && now >= next.note.at) continue; // OrderedHitPolicy.IsHittable
        const result = this.windows.resultFor(now - object.note.at);
        if (result === undefined) {
          if (object.note.at > now) break; // all subsequent objects are also too early
          continue;
        }
        return this.apply(object, result, now, seq);
      }
    }
    this.extras.push(seq);
    return undefined;
  }
}
