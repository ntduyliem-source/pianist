"""Q2 build-only MusicXML adapter over pinned music21 (not a score/grade engine).

The observer calls upstream methods unchanged. It attaches source identities and
exact XML durations, and records direction offsets the upstream importer knows.
Native MuseScore + the existing TS score adapter are the separate acceptance gate.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from fractions import Fraction
import hashlib
import io
import json
from pathlib import Path
import re
import threading
import warnings
import zipfile

from defusedxml import ElementTree as SafeET
from xml.etree import ElementTree as ET
import music21 as m21
from music21.musicxml import xmlToM21

from curriculum_catalog import inspect_mxl
from curriculum_io import CorpusError

VERSION = 'q2-music21-10.5.0-v1'
PARSER_VERSION = '10.5.0'
_IMPORT_LOCK = threading.RLock()
LIMITS = json.loads((Path(__file__).resolve().parents[2] /
                    'scores/curriculum/sources.lock.json').read_text(encoding='utf-8'))['limits']


def fraction(value):
    """music21.opFrac retains rational tuplets; never convert to milliseconds."""
    return Fraction(m21.common.opFrac(value))


def rational(value):
    value = fraction(value)
    return {'numerator': value.numerator, 'denominator': value.denominator}


def as_fraction(value):
    return Fraction(value['numerator'], value['denominator'])


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def source_tree(data: bytes):
    if data.startswith(b'PK'):
        inspect_mxl(data, LIMITS)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            container = SafeET.fromstring(archive.read('META-INF/container.xml'))
            roots = [e.get('full-path') for e in container.iter()
                     if e.tag.rsplit('}', 1)[-1] == 'rootfile' and e.get('media-type',
                     'application/vnd.recordare.musicxml+xml') == 'application/vnd.recordare.musicxml+xml']
            xml = archive.read(roots[0])
    else:
        if len(data) > LIMITS['maxXmlBytes']:
            raise CorpusError('xml-size-limit')
        xml = data
    tree = SafeET.fromstring(xml, forbid_entities=True, forbid_external=True)
    for e in tree.iter():
        e.tag = e.tag.rsplit('}', 1)[-1]
    if tree.tag != 'score-partwise':
        raise CorpusError('unsupported-score-timewise')
    return tree


def select_piano(tree):
    """Explicit names are evidence, never a MIDI program or a hand assignment."""
    parts = []
    selected = []
    definitions = tree.findall('./part-list/score-part')
    ids = [p.get('id') for p in definitions]
    actual = [p.get('id') for p in tree.findall('part')]
    if not ids or None in ids or len(set(ids)) != len(ids) or set(actual) != set(ids) or len(actual) != len(ids):
        raise CorpusError('invalid-part-identity')
    for part in definitions:
        names = [part.findtext('part-name', ''), *[n.text or '' for n in part.findall('./score-instrument/instrument-name')]]
        explicit = any(re.search(r'\b(piano|pianoforte|klavier)\b', n, re.I) for n in names)
        # A score-instrument copied from a piano template cannot override a
        # clearly different part-name. Keep this in the review queue.
        conflict = bool(re.search(r'\b(voice|vocal|soprano|alto|tenor|bassoon|violin|guitar|flute|organ|cello|clarinet|saxophone|harpsichord)\b', names[0], re.I))
        decision = 'explicit-piano' if explicit and not conflict else 'instrument-name-conflict' if explicit else 'piano-not-explicit'
        parts.append({'id': part.get('id'), 'names': names, 'decision': decision})
        if decision == 'explicit-piano':
            selected.append(part.get('id'))
    if not selected:
        raise CorpusError('piano-not-explicit')
    result = deepcopy(tree)
    plist = result.find('part-list')
    for item in list(plist):
        if item.tag == 'part-group' or item.get('id') not in selected:
            plist.remove(item)
    for part in list(result.findall('part')):
        if part.get('id') not in selected:
            result.remove(part)
    return result, parts


def piano_xml(data):
    tree, parts = select_piano(source_tree(data))
    return ET.tostring(tree, encoding='utf-8', xml_declaration=True), parts


def pitch_data(pitch):
    alter = pitch.accidental.alter if pitch.accidental is not None else 0
    return {'step': pitch.step, 'alter': alter, 'octave': pitch.octave, 'midi': pitch.ps}


def normalize(data: bytes, *, max_notes=20000):
    if m21.__version__ != PARSER_VERSION:
        raise CorpusError('music21-version-mismatch')
    xml, decisions = piano_xml(data)
    tree = SafeET.fromstring(xml)
    note_refs, measure_refs, part_info = {}, {}, []
    issues = []

    def issue(code, ref=None, detail=None):
        entry = {'code': code, **(ref or {})}
        if detail is not None:
            entry['detail'] = str(detail)[:500]
        if entry not in issues:
            issues.append(entry)

    total_staff = 0
    for pi, part in enumerate(tree.findall('part')):
        pid = part.get('id')
        staff_numbers = [int(n.text) for n in part.findall('./measure/note/staff') if n.text]
        staff_numbers += [int(n.text) for n in part.findall('./measure/attributes/staves') if n.text]
        staves = max([1, *staff_numbers])
        if staves > 4 or min([1, *staff_numbers]) < 1:
            raise CorpusError('unsupported-staff-count')
        info = {'id': pid, 'staves': staves, 'staffBase': total_staff}
        part_info.append(info)
        total_staff += staves
        for mi, measure in enumerate(part.findall('measure')):
            ref = {'partId': pid, 'measureIndex': mi}
            measure_refs[id(measure)] = ref
            for ni, n in enumerate(measure.findall('note')):
                note_refs[id(n)] = {**ref, 'id': f'p{pi}:m{mi}:n{ni}', 'sourceOrder': ni,
                    'sourceNoteId': n.get('id'), 'staff': int(n.findtext('staff', '1')),
                    'voice': n.findtext('voice', '1'), 'xml': n,
                    'notation': {'type': n.findtext('type'), 'dots': len(n.findall('dot')),
                        'accidental': n.findtext('accidental'),
                        'accidentalAttributes': dict(n.find('accidental').attrib) if n.find('accidental') is not None else {},
                        'timeModification': {c.tag: c.text for c in n.findall('./time-modification/*')}}}
                allowed = {'chord','pitch','rest','duration','voice','type','dot','accidental','staff','tie',
                           'beam','stem','notations','lyric','time-modification','grace','cue','unpitched',
                           'instrument','notehead','footnote','level'}
                for child in n:
                    if child.tag not in allowed:
                        issue('unsupported-note-element:' + child.tag, ref)
                for notation in n.findall('./notations/*'):
                    if notation.tag not in {'tied','slur','tuplet','articulations','dynamics','fermata','technical',
                                            'ornaments','arpeggiate','non-arpeggiate','glissando','slide'}:
                        issue('unsupported-notation:' + notation.tag, ref)
                for technical in n.findall('./notations/technical/*'):
                    if technical.tag not in {'fingering','footnote','level'}:
                        issue('unsupported-technical:' + technical.tag, ref)
            if measure.find('./barline/repeat') is not None or measure.find('./barline/ending') is not None:
                issue('repeat-needs-excerpt-traversal', ref)
            for tag, code in [('grace', 'unsupported-grace'), ('cue', 'unsupported-cue'),
                              ('unpitched', 'unsupported-unpitched'), ('transpose', 'unsupported-instrument-transpose'),
                              ('ornaments', 'unsupported-ornament'), ('arpeggiate', 'unsupported-arpeggio'),
                              ('glissando', 'unsupported-glissando'), ('slide', 'unsupported-slide'),
                              ('measure-repeat', 'unsupported-measure-repeat'), ('senza-misura', 'unsupported-free-meter')]:
                if measure.find('.//' + tag) is not None:
                    issue(code, ref)
            for sound in measure.findall('.//sound'):
                if any(k in sound.attrib for k in ('dacapo', 'dalsegno', 'tocoda', 'fine', 'coda', 'segno')):
                    issue('jump-needs-excerpt-traversal', ref)
                if any(k.endswith('pedal') for k in sound.attrib):
                    issue('unsupported-sound-pedal', ref)
            for n in measure.findall('note'):
                if any(k in n.attrib for k in ('attack', 'release', 'time-only')):
                    issue('unsupported-note-performance-override', ref)
                if n.get('print-object') == 'no' and n.find('pitch') is not None:
                    issue('hidden-pitched-note', ref)
            for words in measure.findall('./direction/direction-type/words'):
                if (words.text or '').strip():
                    issue('text-direction-review', ref)
    if len(note_refs) > max_notes:
        raise CorpusError('normalization-note-limit')

    captures, directions, contexts = [], [], []
    Original = xmlToM21.MeasureParser

    class ObservedMeasureParser(Original):
        def xmlNoteToGeneralNoteHelper(self, n, mxNote, freeSpanners=True):
            n = super().xmlNoteToGeneralNoteHelper(n, mxNote, freeSpanners)
            ref = note_refs[id(mxNote)]
            n.editorial['curriculumRef'] = {k: v for k, v in ref.items() if k != 'xml'}
            n.editorial['curriculumDuration'] = str(Fraction(mxNote.findtext('duration', '0')) / Fraction(str(self.divisions)))
            return n

        def parse(self):
            super().parse()
            captures.append((self.stream, measure_refs[id(self.mxMeasure)]))

        def xmlBackup(self, mxObj):
            length = Fraction(mxObj.findtext('duration', '0')) / Fraction(str(self.divisions))
            if length <= 0 or fraction(self.offsetMeasureNote) < length:
                issue('invalid-backup', measure_refs[id(self.mxMeasure)])
            return super().xmlBackup(mxObj)

        def xmlForward(self, mxObj):
            if Fraction(mxObj.findtext('duration', '0')) <= 0:
                issue('invalid-forward', measure_refs[id(self.mxMeasure)])
            return super().xmlForward(mxObj)

        def addToStaffReference(self, mxObj, obj):
            super().addToStaffReference(mxObj, obj)
            if isinstance(obj, (m21.clef.Clef, m21.key.KeySignature, m21.meter.TimeSignature)):
                staff = mxObj if isinstance(mxObj, int) else self.getStaffNumber(mxObj)
                contexts.append((self.stream, measure_refs[id(self.mxMeasure)], staff, fraction(self.offsetMeasureNote), obj))

        def xmlDirection(self, mxDirection):
            # Upstream computes the cursor and offset; raw rational offset guards
            # against float approximation at the observer boundary.
            at = fraction(self.offsetMeasureNote) + Fraction(mxDirection.findtext('offset', '0')) / Fraction(str(self.divisions))
            ref = measure_refs[id(self.mxMeasure)]
            for group in mxDirection.findall('direction-type'):
                for mark in group:
                    if mark.tag in ('pedal', 'octave-shift'):
                        directions.append((self.stream, ref, at, int(mxDirection.findtext('staff', '1')), mark.tag, dict(mark.attrib)))
            return super().xmlDirection(mxDirection)

    # music21 PartParser constructs MeasureParser directly. This scoped observer
    # changes no upstream musical calculations. Batch parallelism uses processes.
    with _IMPORT_LOCK, warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always')
        xmlToM21.MeasureParser = ObservedMeasureParser
        try:
            importer = xmlToM21.MusicXMLImporter()
            score = importer.stream
            importer.xmlRootToScore(tree, score)
        finally:
            xmlToM21.MeasureParser = Original
    for w in caught:
        issue('music21-import-warning', detail=w.message)

    # Original measures may be replaced when a Part is split into PartStaffs.
    # music21 already chose their absolute positions; observe them, don't recalc.
    starts = {}
    for measure, ref in captures:
        starts[(ref['partId'], ref['measureIndex'])] = fraction(measure.offset)
    info_by_id = {p['id']: p for p in part_info}
    events, lines, object_ids, measures, context_rows = [], {}, {}, [], []
    # Read the original whole-part measures, including measures with no notes
    # and a shorter upper staff. PartStaff splitting must not shorten the bar.
    for measure, ref in captures:
        measures.append({'partId': ref['partId'], 'index': ref['measureIndex'],
                         'label': str(measure.number) + (measure.numberSuffix or ''),
                         'start': rational(starts[(ref['partId'], ref['measureIndex'])]),
                         'duration': rational(measure.duration.quarterLength),
                         'nominalDuration': rational(measure.barDuration.quarterLength)})
    event_objects = {}
    for part in score.parts:
        for mi, measure in enumerate(part.getElementsByClass(m21.stream.Measure)):
            for obj in measure.recurse().notesAndRests:
                members = list(obj.notes) if isinstance(obj, m21.chord.Chord) else [obj]
                ids = []
                for member in members:
                    ref = member.editorial.get('curriculumRef')
                    if not ref:
                        if member.isRest and member.style.hideObjectOnPrint:
                            continue  # upstream Finale spacer, not a source rest
                        issue('unmapped-music21-event')
                        continue
                    pid, staff, voice = ref['partId'], ref['staff'], ref['voice']
                    key = (pid, ref['measureIndex'])
                    start = starts[key]
                    onset = start + fraction(obj.getOffsetInHierarchy(measure))
                    duration = Fraction(member.editorial['curriculumDuration'])
                    if duration != fraction(member.duration.quarterLength) or duration <= 0:
                        issue('music21-duration-mismatch', {'eventId': ref['id']})
                    if isinstance(obj, m21.chord.Chord) and fraction(obj.quarterLength) != duration:
                        issue('unequal-chord-duration', {'eventId': ref['id']})
                    lid = f'{pid}:s{staff}:v{voice}'
                    lines[lid] = {'partId': pid, 'staff': staff, 'sourceVoice': voice,
                                  'staffIndex': info_by_id[pid]['staffBase'] + staff - 1,
                                  'hand': None, 'handAssignment': 'unreviewed'}
                    event = {**ref, 'lineId': lid, 'onset': rational(onset), 'duration': rational(duration),
                             'kind': 'rest' if member.isRest else 'note',
                             'tieType': member.tie.type if member.tie else None,
                             'articulations': sorted(a.classes[0] for a in obj.articulations),
                             'chordId': f'{pid}:m{ref["measureIndex"]}:s{staff}:v{voice}:q{onset}' if len(members) > 1 else None}
                    if isinstance(member, m21.note.Note):
                        event['pitch'] = pitch_data(member.pitch)
                        event['writtenPitch'] = pitch_data(member.pitch)
                        if member.pitch.ps != int(member.pitch.ps):
                            issue('unsupported-microtone', {'eventId': ref['id']})
                        for sp in obj.getSpannerSites():
                            if isinstance(sp, m21.spanner.Ottava) and not sp.transposing:
                                event['writtenPitch'] = pitch_data(member.pitch.transpose(sp.interval(reverse=True)))
                        event_objects[ref['id']] = member
                    events.append(event)
                    ids.append(ref['id'])
                object_ids[id(obj)] = ids
    events.sort(key=lambda e: (as_fraction(e['onset']), e['partId'], e['staff'], e['voice'], e['sourceOrder']))
    by_id = {e['id']: e for e in events}
    if len(by_id) != len(events) or len(by_id) != len(note_refs):
        issue('source-event-count-mismatch')
    if not any(e['kind'] == 'note' for e in events):
        issue('no-pitched-notes')

    # Link explicit music21 ties only if the source is unambiguous/contiguous.
    # Counts are deliberately NOT calculated here: use createTimeline in TS.
    pending = {}
    for event in events:
        if event['kind'] != 'note' or 'pitch' not in event:
            continue
        p = event['pitch']
        key = (event['lineId'], p['step'], p['alter'], p['octave'])
        tie = event['tieType']
        if tie in ('stop', 'continue'):
            prior = pending.pop(key, None)
            if not prior or as_fraction(prior['onset']) + as_fraction(prior['duration']) != as_fraction(event['onset']):
                issue('unresolved-tie', {'eventId': event['id']})
            else:
                prior['tieTo'] = event['id']
                event['tieFrom'] = prior['id']
        elif key in pending:
            issue('unresolved-tie', {'eventId': event['id']})
            pending.pop(key)
        if tie in ('start', 'continue'):
            if key in pending:
                issue('ambiguous-tie', {'eventId': event['id']})
            pending[key] = event
    for event in pending.values():
        issue('unclosed-tie', {'eventId': event['id']})

    for measure, ref, staff, offset, obj in contexts:
        at = starts[(ref['partId'], ref['measureIndex'])] + offset
        kind = 'clef' if isinstance(obj, m21.clef.Clef) else 'key' if isinstance(obj, m21.key.KeySignature) else 'meter'
        if kind == 'clef':
            value = {'sign': obj.sign, 'line': obj.line, 'octaveChange': obj.octaveChange}
        elif kind == 'key':
            value = {'fifths': obj.sharps, 'mode': getattr(obj, 'mode', None)}
            if obj.sharps is None:
                issue('unsupported-custom-key', ref)
        else:
            value = {'ratio': obj.ratioString, 'numerator': obj.numerator, 'denominator': obj.denominator}
        # Missing clef number means staff 1; missing key/time number means all.
        targets = [staff] if staff else ([1] if kind == 'clef' else range(1, info_by_id[ref['partId']]['staves'] + 1))
        for target in targets:
            row = {**ref, 'staff': target, 'at': rational(at), 'kind': kind, 'value': value}
            if row not in context_rows:
                context_rows.append(row)
    context_rows.sort(key=lambda c: (as_fraction(c['at']), c['partId'], c['staff'], c['kind']))
    for lid, line in lines.items():
        for kind in ('clef', 'meter'):
            if not any(c['partId'] == line['partId'] and c['staff'] == line['staff'] and c['kind'] == kind
                       and as_fraction(c['at']) == 0 for c in context_rows):
                issue('missing-initial-' + kind, {'lineId': lid})

    marks, pedals, open_pedals = [], [], {}
    for _, ref, offset, staff, kind, attrs in directions:
        at = starts[(ref['partId'], ref['measureIndex'])] + offset
        marks.append({**ref, 'staff': staff, 'kind': kind, 'at': rational(at), 'attributes': attrs})
    marks.sort(key=lambda m: (as_fraction(m['at']), m['partId'], m['staff']))
    for mark in marks:
        if mark['kind'] != 'pedal':
            continue
        attrs = mark['attributes']
        key = (mark['partId'], attrs.get('number', '1'))  # pedal belongs to instrument, not one hand
        action = attrs.get('type')
        if action in ('stop', 'change'):
            previous = open_pedals.pop(key, None)
            if previous is None or as_fraction(previous['at']) >= as_fraction(mark['at']):
                issue('unresolved-pedal', {'partId': mark['partId'], 'measureIndex': mark['measureIndex']})
            else:
                pedals.append({'partId': mark['partId'], 'staff': previous['staff'],
                               'start': previous['at'], 'end': mark['at']})
        if action in ('start', 'change'):
            if key in open_pedals:
                issue('overlapping-pedal', {'partId': mark['partId']})
            open_pedals[key] = mark
        elif action not in ('stop', 'continue'):
            issue('unsupported-pedal-' + str(action), {'partId': mark['partId']})
    for mark in open_pedals.values():
        issue('unclosed-pedal', {'partId': mark['partId']})

    slurs = []
    for sp in score.recurse().getElementsByClass(m21.spanner.Slur):
        first, last = object_ids.get(id(sp.getFirst()), []), object_ids.get(id(sp.getLast()), [])
        if first and last:
            slurs.append({'startEventIds': first, 'endEventIds': last})
        else:
            issue('unmapped-slur')

    # Only adjacent, monophonic attacks in a single written line have a melodic
    # interval. A rest, chord, overlap or continuation breaks that relationship.
    relations = []
    for lid in lines:
        previous = None
        for event in [e for e in events if e['lineId'] == lid]:
            if event['kind'] != 'note' or event['chordId'] or 'pitch' not in event:
                previous = None
                continue
            if event.get('tieFrom'):
                previous = None
                continue
            if previous and as_fraction(previous['onset']) + as_fraction(previous['duration']) <= as_fraction(event['onset']):
                a, b = event_objects[previous['id']], event_objects[event['id']]
                interval = m21.interval.Interval(a, b)
                relations.append({'lineId': lid, 'from': previous['id'], 'to': event['id'],
                    'diatonic': interval.generic.directed, 'semitones': interval.chromatic.directed,
                    'name': interval.directedName, 'basis': 'sounding-spelled-pitch'})
            previous = event

    boundaries = sorted({as_fraction(m['start']) for m in measures} |
                        {as_fraction(m['start']) + as_fraction(m['duration']) for m in measures})
    cuts = []
    for at in boundaries:
        held = [e['id'] for e in events if e['kind'] == 'note' and as_fraction(e['onset']) < at < as_fraction(e['onset']) + as_fraction(e['duration'])]
        ties = [e['id'] for e in events if e.get('tieFrom') and as_fraction(e['onset']) == at]
        crossing = [i for i, p in enumerate(pedals) if as_fraction(p['start']) < at < as_fraction(p['end'])]
        cuts.append({'at': rational(at), 'crossingHeldNotes': held, 'crossingTies': ties,
                     'crossingPedals': crossing, 'structurallyClear': not (held or ties or crossing)})
    tempos = []
    for t in score.recurse().getElementsByClass(m21.tempo.MetronomeMark):
        bpm = t.getQuarterBPM()
        if bpm is not None:
            row = {'at': rational(t.getOffsetInHierarchy(score)), 'quarterBpm': bpm}
            if row not in tempos:
                tempos.append(row)
    return {'schemaVersion': 1, 'normalizerVersion': VERSION, 'music21Version': m21.__version__,
            'sourceSha256': digest(data), 'pianoXmlSha256': digest(xml), 'partDecisions': decisions,
            'parts': part_info, 'lines': lines, 'measures': sorted(measures, key=lambda m: (m['partId'], m['index'])),
            'events': events, 'contexts': context_rows, 'directions': marks, 'pedals': pedals,
            'slurs': slurs, 'tempos': tempos, 'melodicRelations': relations, 'cutCandidates': cuts,
            'issues': issues, 'releaseBlockers': sorted({i['code'] for i in issues}),
            'nativeVerification': {'status': 'pending'}, 'gradeStatus': 'pending-q3'}
