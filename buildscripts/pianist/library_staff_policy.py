"""Admission policy for the curated piano library, not a notation converter.

Count structural staves over the complete score. Two separate piano parts are
valid; clefs, rests, hidden empty staves and simultaneous hand activity do not
change the count. Instrument evidence is checked independently of staff count.
"""
from io import BytesIO
import re
import unicodedata
from xml.etree import ElementTree as ET
import zipfile

POLICY_VERSION = 'piano-two-staves-v1'
MAX_SCORE_BYTES = 32 * 1024**2
PIANO_PROGRAMS = frozenset(range(1, 7))  # MusicXML uses one-based General MIDI.
PIANO_LABEL = re.compile(r'\b(?:piano|pianoforte|fortepiano|klavier|fl[uü]gel|pno)\b|фортепиано|пианино|钢琴|鋼琴|ピアノ|피아노|dương cầm', re.I)
OTHER_LABEL = re.compile(r'\b(?:violin|viola|cello|violoncello|contrabass|flute|piccolo|oboe|clarinet|bassoon|saxophone|trumpet|trombone|tuba|guitar|harp|organ|harpsichord|clavinet|voice|vocal|choir|drums|percussion)\b', re.I)


class LibraryStaffPolicyError(ValueError):
    def __init__(self, proof):
        self.proof = proof
        reasons = '; '.join(v['message'] for v in proof['violations'])
        super().__init__('Library requires exactly two piano staves: ' + reasons)


def read_musicxml(data):
    """Read raw MusicXML or the root score in MXL without extracting any files."""
    if not 0 < len(data) <= MAX_SCORE_BYTES:
        raise ValueError('Invalid MusicXML/MXL size')
    if zipfile.is_zipfile(BytesIO(data)):
        with zipfile.ZipFile(BytesIO(data)) as archive:
            if archive.getinfo('META-INF/container.xml').file_size > 64 * 1024:
                raise ValueError('MusicXML container too large')
            container = ET.fromstring(archive.read('META-INF/container.xml'))
            roots = [e for e in container.iter() if e.tag.rsplit('}', 1)[-1] == 'rootfile']
            root = next((e for e in roots if e.get('media-type') == 'application/vnd.recordare.musicxml+xml'), None)
            if root is None:
                root = next((e for e in roots if e.get('full-path', '').lower().endswith(('.xml', '.musicxml'))), None)
            if root is None or not root.get('full-path'):
                raise ValueError('MusicXML root file missing')
            name = root.get('full-path')
            if len([e for e in archive.infolist() if e.filename == name]) != 1:
                raise ValueError('Duplicate or missing MusicXML root file')
            if archive.getinfo(name).file_size > MAX_SCORE_BYTES:
                raise ValueError('MusicXML score too large')
            xml = archive.read(name)
    else:
        xml = data
    score = ET.fromstring(xml)
    if score.tag != 'score-partwise':
        raise ValueError('MusicXML score must be partwise')
    return xml, score


def instrument_evidence(definition):
    """Positive piano evidence and explicit contradictions; no pitch heuristics."""
    labels = [unicodedata.normalize('NFC', n.text or '').strip() for n in definition.iter()
              if n.tag in ('part-name', 'part-abbreviation', 'instrument-name', 'instrument-abbreviation')]
    sounds = [(n.text or '').strip().lower() for n in definition.findall('.//instrument-sound') if (n.text or '').strip()]
    programs = []
    for node in definition.findall('.//midi-program'):
        try:
            programs.append(int(node.text or ''))
        except ValueError:
            programs.append(None)
    piano_sounds = [s for s in sounds if s == 'keyboard.piano' or s.startswith('keyboard.piano.')]
    contradictions = [f'MIDI program {p}' for p in programs if p not in PIANO_PROGRAMS]
    contradictions += [f'instrument-sound {s}' for s in sounds if s not in piano_sounds]
    contradictions += [f'instrument label {s}' for s in labels if OTHER_LABEL.search(s)]
    if definition.find('.//midi-unpitched') is not None:
        contradictions.append('unpitched MIDI instrument')
    positive = bool(programs and all(p in PIANO_PROGRAMS for p in programs) or piano_sounds or any(PIANO_LABEL.search(s) for s in labels))
    return {'piano': positive and not contradictions, 'labels': labels, 'programs': programs,
            'sounds': sounds, 'contradictions': contradictions}


def inspect_two_staff_piano(data):
    """Return a serializable decision and reasons. Malformed XML is not repaired."""
    _, score = read_musicxml(data)
    proof = {'policyVersion': POLICY_VERSION, 'accepted': False, 'totalStaves': 0, 'parts': [], 'violations': []}

    def reject(code, message, **context):
        proof['violations'].append({'code': code, 'message': message, **context})

    definitions = score.findall('part-list/score-part')
    parts = score.findall('part')
    ids = [p.get('id') for p in parts]
    definition_ids = [p.get('id') for p in definitions]
    if not parts or any(not ident for ident in ids) or len(set(ids)) != len(ids) or set(ids) != set(definition_ids) or len(definition_ids) != len(ids):
        reject('part-structure', 'Part list must match every unique score part')
        return proof
    for part in parts:
        part_id = part.get('id')
        definition = next(d for d in definitions if d.get('id') == part_id)
        evidence = instrument_evidence(definition)
        if not evidence['piano']:
            reject('non-piano-instrument' if evidence['contradictions'] else 'unidentified-instrument',
                   'Non-piano or unidentified part ' + part_id, partId=part_id)
        measures = part.findall('measure')
        if not measures:
            reject('part-structure', 'Part has no measures', partId=part_id)
            continue
        # MusicXML defaults to one staff unless <staves> declares otherwise.
        first = measures[0].find('attributes/staves')
        try:
            staves = int(first.text) if first is not None else 1
            if staves < 1:
                raise ValueError()
        except (TypeError, ValueError):
            reject('invalid-staff-count', 'Invalid initial staff count', partId=part_id)
            continue
        proof['totalStaves'] += staves
        record = {'id': part_id, 'staves': staves, 'instrument': evidence, 'pitchedNotes': 0}
        proof['parts'].append(record)
        instrument_ids = {n.get('id') for n in definition.findall('score-instrument')}
        for program in part.findall('.//sound/midi-instrument/midi-program'):
            try:
                piano = int(program.text or '') in PIANO_PROGRAMS
            except ValueError:
                piano = False
            if not piano:
                reject('non-piano-instrument', 'Playback changes to a non-piano program', partId=part_id)
        for instrument in part.findall('measure/note/instrument'):
            if instrument.get('id') not in instrument_ids:
                reject('unidentified-instrument', 'Note refers to an unknown instrument', partId=part_id)
        active = 1
        for measure in measures:
            number = measure.get('number', '')
            for node in measure:
                if node.tag == 'attributes':
                    for value in node.findall('staves'):
                        try:
                            active = int(value.text or '')
                        except ValueError:
                            active = 0
                        if active != staves:
                            reject('staff-count-change', 'Staff count changes within the score', partId=part_id, measure=number, staves=active)
                    for value in node:
                        if value.tag in ('clef', 'key', 'time', 'staff-details') and value.get('number'):
                            try:
                                valid = 1 <= int(value.get('number')) <= staves
                            except ValueError:
                                valid = False
                            if not valid:
                                reject('invalid-staff-reference', 'Attribute refers to a nonexistent staff', partId=part_id, measure=number)
                elif node.tag in ('note', 'forward', 'direction'):
                    if node.tag in ('note', 'forward') and active != staves:
                        reject('staff-count-change', 'Two-staff declaration must precede musical content', partId=part_id, measure=number, staves=active)
                    value = node.findtext('staff', '1')
                    try:
                        valid = 1 <= int(value) <= staves
                    except (TypeError, ValueError):
                        valid = False
                    if not valid:
                        reject('invalid-staff-reference', 'Musical content refers to a nonexistent staff', partId=part_id, measure=number)
                    if node.tag == 'note':
                        record['pitchedNotes'] += node.find('pitch') is not None
                        if node.find('unpitched') is not None:
                            reject('unpitched-notes', 'Piano part contains unpitched notes', partId=part_id, measure=number)
    if proof['totalStaves'] != 2:
        reject('staff-count', f'Expected 2 structural staves; found {proof["totalStaves"]}')
    proof['accepted'] = not proof['violations']
    return proof


def require_two_staff_piano(data):
    proof = inspect_two_staff_piano(data)
    if not proof['accepted']:
        raise LibraryStaffPolicyError(proof)
    return proof
