"""Reproducible machine evidence, never a forged human review.

PianoPlayer supplies routing/finger suggestions; music21 supplies key estimates.
Only conservative fixed-position suggestions become a content witness. Neither
model certifies phrase boundaries, ergonomic comfort or a learner's BPM ability.
"""
from copy import deepcopy
from functools import lru_cache
import importlib.util
import json
import math
from pathlib import Path
import sys
from types import SimpleNamespace

import music21 as m21
from curriculum_fragments import q, pitch_name, upstream_pitch, line_features
from curriculum_normalize import digest, encoded, rational
from curriculum_selection import bounds, events

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / 'third_party/curriculum-sources/pianoplayer'
sys.path.insert(0, str(VENDOR))
from pianoplayer.hand import Hand
from pianoplayer.models import INote, keypos
if Path(sys.modules['pianoplayer.hand'].__file__).resolve() != (VENDOR / 'pianoplayer/hand.py').resolve():
    raise RuntimeError('unbound-pianoplayer-module')
_spec = importlib.util.spec_from_file_location('pianist_upstream_routing', VENDOR / 'routing.py')
_routing = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_routing)

VERSION = 'k3-machine-evidence-v1'
QUARTER_BPM = 60  # A single reproducible model input, NOT a teaching recommendation.
HAND_SIZE = 'M'
REFERENCE = 'https://github.com/marcomusy/pianoplayer/tree/6fb0e2114d7b21f75c0be5208172e1243a57323e'


@lru_cache(maxsize=1)
def identity():
    paths = [Path(__file__), ROOT / 'buildscripts/pianist/curriculum_selection.py',
             VENDOR / 'pianoplayer/hand.py', VENDOR / 'pianoplayer/models.py', VENDOR / 'routing.py']
    return digest(encoded({'version': VERSION, 'music21': m21.__version__,
                           'files': {p.relative_to(ROOT).as_posix(): digest(p.read_bytes()) for p in paths}}).encode())


def routing(index, selection):
    """Use upstream routing, then reject ambiguous/cross-staff interpretation."""
    pid = index.a['lines'][next(iter(selection['lineHands']))]['partId']
    if len(index.parts) != 1:
        return {}, {'status': 'review', 'reason': 'multiple-piano-parts'}
    lines = {lid: info for lid, info in index.a['lines'].items() if info['partId'] == pid}
    staffs = {info['staff'] for info in lines.values()}
    if not staffs or len(staffs) > 2:
        return {}, {'status': 'review', 'reason': 'unsupported-staff-configuration'}
    args = SimpleNamespace(auto_routing=True, rpart=0, lpart=1, rstaff=0, lstaff=0,
                           left_only=False, right_only=False)
    part = SimpleNamespace(events=[SimpleNamespace(notes=list(index.parts[pid].findall('./measure/note')))])
    _routing._resolve_musicxml_routing(args, SimpleNamespace(parts=[part]))
    if len(staffs) == 1:
        # A single source staff can be assigned to the selected exercise hand.
        # This is an exercise configuration, not an inference about the author.
        roles = set(selection['lineHands'].values())
        mapping = {lid: next(iter(roles)) for lid in lines} if len(roles) == 1 else {}
        method = 'explicit-single-staff-exercise-hand'
    else:
        mapping = {lid: 'right' if info['staff'] == args._resolved_rstaff else 'left'
                   for lid, info in lines.items()}
        method = 'pianoplayer-auto-staff-routing'
    lo, hi = bounds(index, selection)
    affected = [e for e in index.a['events'] if e['partId'] == pid and lo <= q(e['onset']) < hi]
    voices = {}
    for e in affected:
        voices.setdefault(e['voice'], set()).add(e['staff'])
    if any(len(s) > 1 for s in voices.values()):
        return {}, {'status': 'review', 'reason': 'cross-staff-source-voice'}
    for lid, role in mapping.items():
        expected = ('G', 2, 0) if role == 'right' else ('F', 4, 0)
        actual = index.context(lid, lo).get('clef', {})
        if tuple(actual.get(k) for k in ('sign', 'line', 'octaveChange')) != expected:
            return {}, {'status': 'review', 'reason': 'routing-clef-disagreement'}
    left = [e for e in affected if e['kind'] == 'note' and mapping.get(e['lineId']) == 'left']
    right = [e for e in affected if e['kind'] == 'note' and mapping.get(e['lineId']) == 'right']
    if any(q(a['onset']) < q(b['onset']) + q(b['duration']) and
           q(b['onset']) < q(a['onset']) + q(a['duration']) and a['pitch']['midi'] >= b['pitch']['midi']
           for a in left for b in right):
        return {}, {'status': 'review', 'reason': 'routing-crossing-or-shared-key'}
    return mapping, {'status': 'structurally-checked-assignment', 'method': method,
                     'reference': REFERENCE, 'authorHandAssignment': False}


def optimizer_input(index, ee, quarter_bpm=QUARTER_BPM):
    """Adapt exact source events. Ties become one held note, not new attacks."""
    if not line_features(ee)['monophonic']:
        return [], [], ['polyphonic-line']
    attacks = [e for e in ee if e['kind'] == 'note' and not e.get('tieFrom')]
    ids = {e['id'] for e in ee}; notes = []; chains = []
    for e in attacks:
        chain = [e]; seen = {e['id']}
        while chain[-1].get('tieTo'):
            tail = index.events[chain[-1]['tieTo']]
            if tail['id'] in seen or tail['id'] not in ids:
                return [], [], ['cut-or-cyclic-tie']
            seen.add(tail['id']); chain.append(tail)
        anchors = set()
        for tied in chain:
            marks = index.notes[tied['id']].findall('./notations/technical/fingering')
            if len(marks) > 1 or any((m.text or '').strip() not in ('1', '2', '3', '4', '5') or
                    m.get('substitution') == 'yes' or m.get('alternate') == 'yes' for m in marks):
                return [], [], ['complex-source-fingering']
            anchors.update(int(m.text.strip()) for m in marks)
        if len(anchors) > 1:
            return [], [], ['conflicting-tied-fingers']
        pitch = upstream_pitch(pitch_name(e['pitch']))
        at = q(e['onset']); end = q(chain[-1]['onset']) + q(chain[-1]['duration'])
        if end <= at or not 21 <= pitch.midi <= 108 or pitch.microtone.cents:
            return [], [], ['unsupported-piano-note']
        note = INote(name=pitch.name, pitch=pitch.midi, octave=pitch.octave,
                     isBlack=pitch.pitchClass in (1, 3, 6, 8, 10), time=float(at * 60 / quarter_bpm),
                     duration=float((end - at) * 60 / quarter_bpm),
                     measure=e['measureIndex'] + 1, staff=e['staff'],
                     fingering=next(iter(anchors), 0), is_anchor=bool(anchors), noteID=len(notes))
        note.x = keypos(note)
        physical = m21.pitch.Pitch(); physical.midi = pitch.midi
        if keypos(SimpleNamespace(name=physical.name, octave=physical.octave)) != note.x:
            # In particular B# / C-flat can cross an octave. Keep unsupported
            # geometry unresolved instead of silently giving the model a wrong key.
            return [], [], ['unsupported-optimizer-key-spelling']
        notes.append(note); chains.append([n['id'] for n in chain])
    return notes, chains, []


def solve_line(index, ee, side):
    notes, chains, errors = optimizer_input(index, ee)
    if errors or not notes:
        return {'status': 'review', 'reasons': errors or ['no-attacks'], 'notes': []}
    before = [(n.pitch, n.time, n.duration, n.x, n.fingering) for n in notes]
    hand = Hand(notes, side=side, size=HAND_SIZE)
    hand.verbose = False
    hand.generate(start_measure=min(n.measure for n in notes),
                  nmeasures=max(n.measure for n in notes) - min(n.measure for n in notes) + 1)
    trace = []
    for note, chain, original in zip(notes, chains, before):
        trace.append({'eventIds': chain, 'finger': note.fingering,
                      'timeSeconds': note.time, 'durationSeconds': note.duration,
                      'sourceFinger': original[4] or None, 'cost': note.cost})
        if (note.pitch, note.time, note.duration, note.x) != original[:4]:
            errors.append('optimizer-mutated-note')
        if type(note.fingering) != int or not 1 <= note.fingering <= 5 or not math.isfinite(note.cost):
            errors.append('invalid-optimizer-result'); continue
        if original[4] and original[4] != note.fingering:
            errors.append('source-finger-changed')
    return {'status': 'review' if errors else 'model-suggestion', 'reasons': sorted(set(errors)),
            'notes': trace, 'sourceInputSha256': digest(encoded(before).encode())}


def fingering(index, ee, side, suggestion=None):
    suggestion = solve_line(index, ee, side) if suggestion is None else suggestion
    selected_ids = {e['id'] for e in ee if e['kind'] == 'note'}
    trace = [r for r in suggestion['notes'] if selected_ids.intersection(r['eventIds'])]
    errors = list(suggestion['reasons']); finger_keys = {}; offsets = set()
    if not trace:
        errors.append('no-attacks')
    if {eid for r in trace for eid in r['eventIds']} != selected_ids:
        errors.append('incomplete-source-fingering-span')
    for row in trace:
        finger = row['finger']
        if type(finger) != int or not 1 <= finger <= 5:
            errors.append('invalid-optimizer-result'); continue
        pitch = pitch_name(index.events[row['eventIds'][0]]['pitch'])
        if finger in finger_keys and finger_keys[finger] != pitch:
            errors.append('suggestion-changes-position')
        finger_keys[finger] = pitch
        dia = upstream_pitch(pitch).diatonicNoteNum
        offsets.add(dia - finger if side == 'right' else dia + finger)
    # This verifies a fixed, ordered five-finger mapping returned by upstream;
    # it does not invent a fingering by sorting/min-max pitches.
    if len(offsets) != 1:
        errors.append('suggestion-not-fixed-five-finger-position')
    report = {'status': 'review' if errors else 'fixed-position-model-witness',
              'reasons': sorted(set(errors)), 'model': 'PianoPlayer', 'reference': REFERENCE,
              'quarterBpm': QUARTER_BPM, 'handSize': HAND_SIZE, 'depth': 'upstream-auto',
              'notes': trace, 'sourceInputSha256': suggestion.get('sourceInputSha256'),
              'ergonomicCertification': False}
    if errors:
        return {}, {}, report
    name = 'pianoplayer-fixed'
    path = {eid: {'hand': side, 'position': name, 'finger': row['finger']}
            for row in trace for eid in row['eventIds']}
    definition = {side + ':' + name: {'anchorFinger': min(finger_keys),
                  'keys': [{'finger': f, 'pitch': list(p)} for f, p in sorted(finger_keys.items())],
                  'reference': REFERENCE, 'kind': 'model-proposal-structurally-verified'}}
    return path, definition, report


class EvidenceBuilder:
    def __init__(self, index):
        self.index = index
        self.tonality = lru_cache(maxsize=256)(self.tonality)
        self.estimate_key = lru_cache(maxsize=128)(self.estimate_key)
        self.line_suggestion = lru_cache(maxsize=64)(self.line_suggestion)
        self.line_path = lru_cache(maxsize=512)(self.line_path)
        self.base = lru_cache(maxsize=512)(self.base)

    def tonality(self, lid, lo, hi):
        index = self.index; info = index.a['lines'][lid]; key = index.context(lid, lo).get('key', {})
        if key.get('mode'):
            return key['mode'], {'kind': 'source-key-mode', 'mode': key['mode']}
        pid = info['partId']; bars = index.measures[pid]
        changes = [c for c in index.a['contexts'] if c['partId'] == pid and c['kind'] == 'key'
                   and c['staff'] == info['staff']]
        begin = max([q(bars[0]['start']), *[q(c['at']) for c in changes if q(c['at']) <= lo]])
        finish = min([q(bars[-1]['start']) + q(bars[-1]['duration']),
                      *[q(c['at']) for c in changes if q(c['at']) > lo]])
        if hi > finish:
            return None, {'kind': 'review', 'reason': 'key-context-change'}
        return self.estimate_key(pid, begin, finish, key.get('fifths'))

    def estimate_key(self, pid, begin, finish, fifths):
        index = self.index
        stream = m21.stream.Stream()
        for event in index.a['events']:
            if event['partId'] == pid and event['kind'] == 'note' and begin <= q(event['onset']) < finish:
                n = m21.note.Note(deepcopy(upstream_pitch(pitch_name(event['pitch']))))
                n.quarterLength = q(event['duration']); stream.append(n)
        estimates = []
        for cls in (m21.analysis.discrete.KrumhanslSchmuckler, m21.analysis.discrete.AardenEssen):
            try:
                result = cls().getSolution(stream)
            except (m21.analysis.discrete.DiscreteAnalysisException, ValueError):
                return None, {'kind': 'review', 'reason': 'key-analysis-unavailable'}
            estimates.append({'method': cls.__name__, 'tonic': result.tonic.name, 'mode': result.mode,
                              'fifths': result.sharps, 'correlation': result.correlationCoefficient})
        agree = len({(r['tonic'], r['mode'], r['fifths']) for r in estimates}) == 1
        # A conservative acceptance policy over unmodified upstream estimates.
        # A disagreement/minor estimate without written mode stays unresolved.
        major = agree and estimates[0]['mode'] == 'major' and estimates[0]['fifths'] == fifths
        return ('major' if major else None), {'kind': 'key-model-consensus' if major else 'review',
                'estimates': estimates, 'contextStart': rational(begin), 'contextEnd': rational(finish),
                'reference': 'music21.analysis.discrete@' + m21.__version__, 'certaintyClaim': False}

    def line_path(self, lid, side, start, end, lo, hi):
        selection = {'lineHands': {lid: side}, 'startMeasure': start, 'endMeasure': end,
                     'startQuarter': rational(lo), 'endQuarter': rational(hi)}
        return fingering(self.index, events(self.index, selection), side, self.line_suggestion(lid, side))

    def line_suggestion(self, lid, side):
        return solve_line(self.index, self.index.by_line[lid], side)

    def base(self, selection_json):
        selection = json.loads(selection_json); lo, hi = bounds(self.index, selection)
        mapping, route = routing(self.index, selection)
        claims = {'sourceLineHands': mapping, 'tonality': {}, 'handPath': {}, 'positions': {}}
        trace = {'routing': route, 'tonality': {}, 'fingering': {}}
        for lid, side in selection['lineHands'].items():
            mode, proof = self.tonality(lid, lo, hi)
            if mode: claims['tonality'][lid] = mode
            trace['tonality'][lid] = proof
            path, definitions, proof = self.line_path(lid, side, selection['startMeasure'], selection['endMeasure'], lo, hi)
            claims['handPath'].update(path); claims['positions'].update(definitions)
            trace['fingering'][lid] = proof
        return claims, trace

    def for_profile(self, selection, profile, config):
        from curriculum_grades import selection_digest, context_digest, VERSION as RULES_VERSION
        claims, trace = self.base(encoded(selection)); claims = deepcopy(claims)
        if all(p['status'] == 'fixed-position-model-witness' for p in trace['fingering'].values()):
            tempo = QUARTER_BPM / profile['beatQuarter']
            claims['bpm'] = {'min': tempo, 'max': tempo, 'beatQuarter': profile['beatQuarter'],
                            'kind': 'optimizer-input-only', 'reference': REFERENCE,
                            'learnerSpeedValidated': False}
        return {'kind': 'machine', 'producer': VERSION, 'producerSha256': identity(),
                'selectionSha256': selection_digest(selection), 'contextSha256': context_digest(self.index, selection),
                'rulesVersion': RULES_VERSION, 'profileId': profile['id'], 'configSha256': digest(encoded(config).encode()),
                'claims': claims, 'trace': trace, 'humanReviewed': False}


def builder(index):
    if not hasattr(index, '_machine_evidence_builder'):
        index._machine_evidence_builder = EvidenceBuilder(index)
    return index._machine_evidence_builder


def verified_claims(index, selection, profile, config, evidence):
    # Recompute against the actual bound source. An arbitrary caller cannot
    # turn a model hint into a grade pass by setting a boolean or editing claims.
    expected = builder(index).for_profile(selection, profile, config)
    return expected['claims'] if encoded(expected) == encoded(evidence) else None
