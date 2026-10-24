import type { NativePracticeSnapshot, NativeScoreSemantics } from './index';

type RecordValue = Record<string, unknown>;
function invalid(path: string): never {
  throw Error('Snapshot MuseScore không hợp lệ: ' + path);
}
function object(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  return value as RecordValue;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path);
  return value;
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
function string(value: unknown, path: string): string {
  if (typeof value !== 'string') invalid(path);
  return value;
}
function boolean(value: unknown, path: string): void {
  if (typeof value !== 'boolean') invalid(path);
}
function fields(value: RecordValue, names: string[], path: string, integer = false): void {
  for (const key of names) number(value[key], path + '.' + key, integer);
}
function rows(
  root: RecordValue,
  key: string,
  inspect: (row: RecordValue, path: string) => void,
): void {
  array(root[key], key).forEach((row, i) => inspect(object(row, `${key}[${i}]`), `${key}[${i}]`));
}
function box(value: unknown, path: string): void {
  const r = object(value, path);
  fields(r, ['x', 'y', 'width', 'height'], path);
  if ((r.width as number) < 0 || (r.height as number) < 0) invalid(path);
}
function reference(value: unknown, ids: Set<unknown>, path: string): void {
  if (!ids.has(value)) invalid(path);
}
function unique(value: unknown, ids: Set<unknown>, path: string): void {
  if (ids.has(value)) invalid(path + ' duplicate');
  ids.add(value);
}
function interval(row: RecordValue, start: string, end: string, path: string): void {
  if (number(row[end], path + '.' + end) < number(row[start], path + '.' + start))
    invalid(path + ' interval');
}
function tuples(root: RecordValue, key: string, length: number): void {
  array(root[key], key).forEach((value, i) => {
    const tuple = array(value, `${key}[${i}]`);
    if (tuple.length !== length) invalid(`${key}[${i}]`);
    tuple.forEach((v, j) => number(v, `${key}[${i}][${j}]`, true));
  });
}

/** Checks native facts without repairing, sorting, quantizing or interpreting music. */
function nativeScore(value: unknown, drawings: boolean, expectedRevision?: number): RecordValue {
  const root = object(value, 'score');
  if (root.schemaVersion !== 1 || root.durationReference !== 'musescore-midi')
    invalid('engine/schema');
  number(root.revision, 'revision', true);
  if (expectedRevision !== undefined && root.revision !== expectedRevision) invalid('revision');
  string(root.title, 'title');
  if (
    number(root.baseQuarterBpm, 'baseQuarterBpm') <= 0 ||
    number(root.durationMs, 'durationMs') < 0
  )
    invalid('tempo/duration');
  const pages = array(root.pages, 'pages'),
    measures = array(root.measures, 'measures'),
    anchors = array(root.anchors, 'anchors');
  if (
    (drawings && !pages.length) ||
    (!drawings && pages.length) ||
    pages.length > 40 ||
    measures.length > 6000 ||
    anchors.length > 50000
  )
    invalid('native limits/pages');
  const pageIds = new Set<unknown>(),
    staffIds = new Set<unknown>(),
    partIds = new Set<unknown>(),
    measureIds = new Set<unknown>(),
    anchorIds = new Set<unknown>(),
    occurrenceIds = new Set<unknown>();
  rows(root, 'pages', (row, p) => {
    number(row.index, p + '.index', true);
    unique(row.index, pageIds, p + '.index');
    fields(row, ['width', 'height', 'displayWidth', 'offsetX', 'offsetY'], p);
    if (
      (row.width as number) <= 0 ||
      (row.height as number) <= 0 ||
      (row.displayWidth as number) <= 0
    )
      invalid(p + '.size');
    string(row.svg, p + '.svg');
  });
  rows(root, 'staves', (row, p) => {
    number(row.id, p + '.id', true);
    unique(row.id, staffIds, p + '.id');
    string(row.part, p + '.part');
    string(row.partId, p + '.partId');
    partIds.add(row.partId);
    array(row.instruments, p + '.instruments').forEach((v, i) => {
      const instrument = object(v, p + `.instruments[${i}]`);
      number(instrument.tick, p + '.instrument.tick', true);
      string(instrument.id, p + '.instrument.id');
      string(instrument.soundId, p + '.instrument.soundId');
      array(instrument.programs, p + '.instrument.programs').forEach((program) =>
        number(program, p + '.instrument.program', true),
      );
    });
  });
  rows(root, 'measures', (row, p) => {
    fields(row, ['index', 'label', 'tick', 'endTick', 'page', 'numerator', 'denominator'], p, true);
    unique(row.index, measureIds, p + '.index');
    interval(row, 'tick', 'endTick', p);
    box(row.box, p + '.box');
    if ((row.numerator as number) <= 0 || (row.denominator as number) <= 0) invalid(p + '.meter');
    if (drawings && row.page !== -1) reference(row.page, pageIds, p + '.page');
  });
  rows(root, 'anchors', (row, p) => {
    string(row.id, p + '.id');
    unique(row.id, anchorIds, p + '.id');
    fields(
      row,
      [
        'pitch',
        'tick',
        'durationTicks',
        'measure',
        'staff',
        'visualStaff',
        'track',
        'voice',
        'page',
      ],
      p,
      true,
    );
    if (
      (row.pitch as number) < 0 ||
      (row.pitch as number) > 127 ||
      (row.durationTicks as number) < 0
    )
      invalid(p + '.pitch/duration');
    reference(row.measure, measureIds, p + '.measure');
    reference(row.staff, staffIds, p + '.staff');
    reference(row.visualStaff, staffIds, p + '.visualStaff');
    if (drawings && row.page !== -1) reference(row.page, pageIds, p + '.page');
    boolean(row.visible, p + '.visible');
    boolean(row.play, p + '.play');
    box(row.box, p + '.box');
    if (row.articulations !== undefined)
      array(row.articulations, p + '.articulations').forEach((v) => string(v, p + '.articulation'));
    if (row.arpeggio !== undefined && row.arpeggio !== 'up' && row.arpeggio !== 'down')
      invalid(p + '.arpeggio');
    if (row.arpeggioGroup !== undefined) string(row.arpeggioGroup, p + '.arpeggioGroup');
    if (row.grace !== undefined) boolean(row.grace, p + '.grace');
    if (row.userVelocity !== undefined || !drawings)
      number(row.userVelocity, p + '.userVelocity', true);
    if (row.spelling !== undefined || !drawings) number(row.spelling, p + '.spelling', true);
  });
  rows(root, 'anchors', (row, p) => {
    if (row.tieBack !== undefined) reference(row.tieBack, anchorIds, p + '.tieBack');
  });
  rows(root, 'occurrences', (row, p) => {
    fields(row, ['index', 'measure', 'utick'], p, true);
    fields(row, ['startMs', 'endMs'], p);
    unique(row.index, occurrenceIds, p + '.index');
    reference(row.measure, measureIds, p + '.measure');
    interval(row, 'startMs', 'endMs', p);
  });
  rows(root, 'performed', (row, p) => {
    reference(row.anchor, anchorIds, p + '.anchor');
    reference(row.occurrence, occurrenceIds, p + '.occurrence');
    interval(row, 'atMs', 'endMs', p);
  });
  {
    const performance = object(root.performance, 'performance');
    if (performance.source !== 'musescore-mpe') invalid('performance.source');
    if (array(performance.events, 'performance.events').length > 200000) invalid('performance.events limit');
    rows(performance, 'events', (row, p) => {
      fields(row, ['pitch', 'utick', 'endUtick'], p, true);
      if ((row.pitch as number) < 0 || (row.pitch as number) > 127) invalid(p + '.pitch');
      interval(row, 'atMs', 'endMs', p);
      interval(row, 'utick', 'endUtick', p);
      array(row.anchors, p + '.anchors').forEach(id => reference(id, anchorIds, p + '.anchor'));
      rows(row, 'spans', (span, s) => {
        reference(span.anchor, anchorIds, s + '.anchor');
        reference(span.occurrence, occurrenceIds, s + '.occurrence');
        interval(span, 'atMs', 'endMs', s);
        fields(span, ['utick','endUtick'], s, true);
        interval(span, 'utick', 'endUtick', s);
      });
    });
  }
  rows(root, 'beats', (row, p) => {
    number(row.atMs, p + '.atMs');
    reference(row.occurrence, occurrenceIds, p + '.occurrence');
    boolean(row.accent, p + '.accent');
    if (number(row.beatQuarter, p + '.beatQuarter') <= 0) invalid(p + '.beatQuarter');
  });
  array(root.warnings, 'warnings').forEach((v) => string(v, 'warning'));
  rows(root, 'cursorSegments', (row, p) => {
    reference(row.measure, measureIds, p + '.measure');
    fields(row, ['tick', 'endTick'], p, true);
    fields(row, ['x', 'endX'], p);
    interval(row, 'tick', 'endTick', p);
  });
  rows(root, 'timeMap', (row, p) => {
    reference(row.occurrence, occurrenceIds, p + '.occurrence');
    number(row.tick, p + '.tick', true);
    number(row.atMs, p + '.atMs');
  });
  rows(root, 'tempos', (row, p) => {
    reference(row.occurrence, occurrenceIds, p + '.occurrence');
    number(row.atMs, p + '.atMs');
    if (number(row.quarterBpm, p + '.quarterBpm') <= 0) invalid(p + '.quarterBpm');
  });
  rows(root, 'unsupported', (row, p) => {
    if (!['arpeggio', 'ornament', 'grace', 'pause'].includes(string(row.kind, p + '.kind')))
      invalid(p + '.kind');
    reference(row.measure, measureIds, p + '.measure');
    if (row.staff !== undefined) reference(row.staff, staffIds, p + '.staff');
    if (row.voice !== undefined) number(row.voice, p + '.voice', true);
  });
  rows(root, 'keyReleases', (row, p) => {
    reference(row.anchor, anchorIds, p + '.anchor');
    fields(row, ['pitch', 'utick', 'endUtick'], p, true);
    interval(row, 'atMs', 'endMs', p);
    interval(row, 'utick', 'endUtick', p);
    if (row.velocity !== undefined) number(row.velocity, p + '.velocity', true);
  });
  rows(root, 'pedals', (row, p) => {
    fields(row, ['id', 'tick', 'endTick'], p, true);
    reference(row.partId, partIds, p + '.partId');
    reference(row.occurrence, occurrenceIds, p + '.occurrence');
    interval(row, 'atMs', 'endMs', p);
    interval(row, 'tick', 'endTick', p);
  });
  if (!drawings) {
    tuples(root, 'rests', 4);
    tuples(root, 'keys', 3);
    tuples(root, 'slurs', 4);
    rows(root, 'dynamics', (row, p) => {
      fields(
        row,
        ['tick', 'track', 'type', 'velocity', 'changeInVelocity', 'velocityChangeTicks', 'speed'],
        p,
        true,
      );
      string(row.text, p + '.text');
      boolean(row.play, p + '.play');
    });
  }
  return root;
}

export function decodeNativePracticeSnapshot(
  json: string,
  expectedRevision?: number,
): NativePracticeSnapshot {
  return nativeScore(
    JSON.parse(json) as unknown,
    true,
    expectedRevision,
  ) as unknown as NativePracticeSnapshot;
}
export function decodeNativeScoreSemantics(
  json: string,
  expectedRevision?: number,
): NativeScoreSemantics {
  return nativeScore(
    JSON.parse(json) as unknown,
    false,
    expectedRevision,
  ) as unknown as NativeScoreSemantics;
}
