import type {
  EditorPlaybackState,
  PracticePlaybackState,
  PlaybackNotes,
  PlaybackFrame,
  NativeAudioDriver,
} from './native-api';

type RecordValue = Record<string, unknown>;
function invalid(path: string): never {
  throw Error('Dữ liệu phát nhạc MuseScore không hợp lệ: ' + path);
}
function object(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  return value as RecordValue;
}
function number(value: unknown, path: string, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (integer && !Number.isSafeInteger(value))
  )
    invalid(path);
  return value;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path);
  return value;
}
function string(value: unknown, path: string): string {
  if (typeof value !== 'string') invalid(path);
  return value;
}
function state(value: unknown): RecordValue {
  const s = object(value, 'state');
  if (
    typeof s.available !== 'boolean' ||
    !['playing', 'paused', 'stopped'].includes(string(s.status, 'status'))
  )
    invalid('state/status');
  number(s.positionSeconds, 'positionSeconds');
  if (
    number(s.durationSeconds, 'durationSeconds') < 0 ||
    number(s.tempoMultiplier, 'tempoMultiplier') <= 0
  )
    invalid('duration/tempo');
  return s;
}
export function decodeEditorPlayback(json: string): EditorPlaybackState {
  return state(JSON.parse(json) as unknown) as unknown as EditorPlaybackState;
}
export function decodePracticePlayback(json: string): PracticePlaybackState {
  const s = state(JSON.parse(json) as unknown);
  if (typeof s.preparing !== 'boolean') invalid('preparing');
  string(s.error, 'error');
  number(s.clockEpoch, 'clockEpoch', true);
  number(s.notesRevision, 'notesRevision', true);
  // Optional for older playback callers; current native emits both.
  if (s.rangeStartSeconds !== undefined) number(s.rangeStartSeconds, 'rangeStartSeconds');
  if (s.rangeEndSeconds !== undefined) number(s.rangeEndSeconds, 'rangeEndSeconds');
  return s as unknown as PracticePlaybackState;
}
export function decodePlaybackNotes(json: string): PlaybackNotes {
  const notes = object(JSON.parse(json) as unknown, 'notes');
  if (notes.source !== 'musescore-mpe') invalid('notes/source');
  number(notes.revision, 'notes/revision', true);
  array(notes.events, 'events').forEach((value, i) => {
    const n = object(value, `events[${i}]`);
    const anchors = array(n.anchors, 'anchors').map((v) => string(v, 'anchor'));
    const pitch = number(n.pitch, 'pitch', true);
    if (pitch < 0 || pitch > 127 || number(n.endMs, 'endMs') < number(n.atMs, 'atMs'))
      invalid('event interval/pitch');
    array(n.spans, 'spans').forEach((value) => {
      const span = object(value, 'span');
      if (!anchors.includes(string(span.anchor, 'span/anchor'))) invalid('span/anchor reference');
      number(span.occurrence, 'span/occurrence', true);
      if (number(span.endMs, 'span/endMs') < number(span.atMs, 'span/atMs'))
        invalid('span interval');
    });
  });
  const map = array(notes.timeMap, 'timeMap');
  if (map.length < 2) invalid('timeMap');
  map.forEach((value) => {
    const p = object(value, 'timeMap point');
    number(p.referenceMs, 'referenceMs');
    number(p.playbackMs, 'playbackMs');
  });
  return notes as unknown as PlaybackNotes;
}
export function decodePlaybackFrame(value: unknown): PlaybackFrame | null {
  if (value === null) return null;
  const frame = object(value, 'frame');
  number(frame.epoch, 'frame/epoch', true);
  number(frame.sequenceId, 'frame/sequenceId', true);
  for (const key of ['positionSeconds', 'contextTime', 'outputContextTime'])
    number(frame[key], 'frame/' + key);
  if (
    number(frame.tempoMultiplier, 'frame/tempoMultiplier') <= 0 ||
    ![0, 1, 2].includes(Number(frame.status)) ||
    typeof frame.status !== 'number'
  )
    invalid('frame/status/tempo');
  return frame as unknown as PlaybackFrame;
}
export function requireNativeAudioDriver(value: unknown): NativeAudioDriver {
  const driver = object(value, 'driver');
  for (const method of ['resume', 'preparePreview', 'previewMidi', 'stopPreview', 'playbackFrame'])
    if (typeof driver[method] !== 'function') invalid('driver/' + method);
  return driver as unknown as NativeAudioDriver;
}
