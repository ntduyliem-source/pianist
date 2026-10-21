"""Q3 offline excerpt selection. Musical parsing/intervals remain music21's.

This module selects original source events; it does not grade performances,
invent melodies, infer original hands, or certify ergonomic/pedagogical fitness.
XML projection preserves the original cursor operations (backup/forward).
Every exported excerpt must pass source-projection AND the Q2 native gate.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from bisect import bisect_right, bisect_left
from copy import deepcopy
from fractions import Fraction
from functools import lru_cache
from itertools import combinations
from xml.etree import ElementTree as ET
import json

import music21 as m21

from curriculum_normalize import (rational, digest, encoded,
                                  source_tree, select_piano, normalize, piano_xml)
from curriculum_io import CorpusError

VERSION = 'q3-original-excerpts-v1'


@lru_cache(maxsize=65536)
def _rational(n, d):
    return Fraction(n, d)


def q(value):
    return _rational(value['numerator'], value['denominator'])


def pitch_name(p):
    return (p['step'], p['alter'], p['octave'])


@lru_cache(maxsize=2048)
def upstream_pitch(name):
    p = m21.pitch.Pitch()
    p.step, p.octave = name[0], name[2]
    p.accidental = m21.pitch.Accidental(name[1])
    return p


@lru_cache(maxsize=16384)
def upstream_interval(a, b):
    i = m21.interval.Interval(upstream_pitch(a), upstream_pitch(b))
    return (i.generic.directed, i.chromatic.directed, i.directedName)


@lru_cache(maxsize=32768)
def upstream_triad(names):
    ch = m21.chord.Chord([upstream_pitch(n) for n in names])
    return (ch.root().name, ch.quality) if ch.isMajorTriad() or ch.isMinorTriad() else None


def ticks(value):
    t = q(value) * 480 if isinstance(value, dict) else Fraction(value) * 480
    if t.denominator != 1:
        raise CorpusError('native-tick-resolution')
    return int(t)


class SourceIndex:
    def __init__(self, analysis, data):
        if digest(data) != analysis['sourceSha256']:
            raise CorpusError('source-checksum-mismatch')
        self.a = analysis
        self.tree, _ = select_piano(source_tree(data))
        self.parts = {p.get('id'): p for p in self.tree.findall('part')}
        self.events = {e['id']: e for e in analysis['events']}
        self.by_line = defaultdict(list)
        self.by_bar = defaultdict(list)
        for e in analysis['events']:
            self.by_line[e['lineId']].append(e)
            self.by_bar[(e['lineId'], e['measureIndex'])].append(e)
        self.measures = defaultdict(list)
        for m in analysis['measures']:
            self.measures[m['partId']].append(m)
        self.line_bad_bars = defaultdict(set)
        self.boundary_bad = defaultdict(set)
        for lid, events in self.by_line.items():
            mm = self.measures[self.a['lines'][lid]['partId']]
            bounds = [q(m['start']) for m in mm] + [q(mm[-1]['start'])+q(mm[-1]['duration'])]
            for a,b in zip(events,events[1:]):
                if q(a['onset'])+q(a['duration']) > q(b['onset']):
                    self.line_bad_bars[(lid,a['measureIndex'])].add('polyphony-within-line')
            for e in events:
                onset, finish = q(e['onset']),q(e['onset'])+q(e['duration'])
                if e['kind']=='note':
                    for bound in bounds[bisect_right(bounds,onset):bisect_left(bounds,finish)]:
                        self.boundary_bad[(lid,bound)].add('cut-held-note')
                if e.get('tieFrom'):
                    self.boundary_bad[(lid,onset)].add('cut-tie')
            l = self.a['lines'][lid]
            for e in analysis['events']:
                if e['partId']==l['partId'] and e['voice']==l['sourceVoice'] and e['staff']!=l['staff']:
                    self.line_bad_bars[(lid,e['measureIndex'])].add('cross-staff-source-voice')
        self.notes = {}
        self.key_modes = {}
        for pi, part in enumerate(self.tree.findall('part')):
            modes = {}
            for mi, measure in enumerate(part.findall('measure')):
                for key in measure.findall('./attributes/key'):
                    staff=int(key.get('number','0'))
                    if staff==0:
                        modes.clear()  # a later global key replaces staff-specific context
                    modes[staff] = key.findtext('mode')
                self.key_modes[(part.get('id'),mi)] = dict(modes)
                for ni, note in enumerate(measure.findall('note')):
                    self.notes[f'p{pi}:m{mi}:n{ni}'] = note
        self.issue_by_bar = defaultdict(set)
        self.global_issues = set()
        for issue in analysis['issues']:
            ref = self.events.get(issue.get('eventId'), issue)
            if 'measureIndex' in ref and 'partId' in ref:
                self.issue_by_bar[(ref['partId'], ref['measureIndex'])].add(issue['code'])
            else:
                # An unlocated parser warning cannot safely be scoped away.
                self.global_issues.add(issue['code'])
        # Persistent direction spanners are not all represented in Q2. Do not
        # silently clip a hairpin/dash/ottava or carry unknown playback changes.
        self.direction_spans = defaultdict(list)
        self.unclosed_directions = defaultdict(set)
        for pid, part in self.parts.items():
            opened = {}
            for mi, measure in enumerate(part.findall('measure')):
                seen_note = False
                for child in measure:
                    if child.tag == 'note':
                        seen_note = True
                    elif child.tag == 'attributes' and seen_note:
                        self.issue_by_bar[(pid,mi)].add('midmeasure-attributes-review')
                for d in measure.findall('direction'):
                    staff = int(d.findtext('staff','1'))
                    for mark in d.findall('direction-type/*'):
                        if mark.tag not in ('octave-shift','wedge','dashes','bracket'):
                            continue
                        key = (mark.tag, mark.get('number','1'))
                        action = mark.get('type')
                        if action == 'stop':
                            previous = opened.pop(key, None)
                            if previous:
                                self.direction_spans[pid].append((previous[0],mi,previous[1],mark.tag))
                            else:
                                self.unclosed_directions[pid].add(staff)
                        elif action != 'continue':
                            if key in opened:
                                self.unclosed_directions[pid].add(staff)
                            opened[key] = (mi,staff)
            self.unclosed_directions[pid].update(s for _,s in opened.values())
        self.context = lru_cache(maxsize=4096)(self.context)
        self.cut_reasons = lru_cache(maxsize=16384)(self.cut_reasons)

    def context(self, lid, at):
        line = self.a['lines'][lid]
        result = {}
        for c in self.a['contexts']:
            if c['partId'] == line['partId'] and c['staff'] == line['staff'] and q(c['at']) <= at:
                result[c['kind']] = c['value']
        return result

    def selected(self, lids, start, end):
        return sorted((e for lid in lids for mi in range(start, end)
                       for e in self.by_bar[(lid, mi)]),
                      key=lambda e: (q(e['onset']), e['lineId'], e['sourceOrder']))

    def boundaries(self, lids, start, end):
        pid = self.a['lines'][lids[0]]['partId']
        mm = self.measures[pid]
        return q(mm[start]['start']), q(mm[end - 1]['start']) + q(mm[end - 1]['duration'])

    def cut_reasons(self, lids, start, end):
        pid = self.a['lines'][lids[0]]['partId']
        lo, hi = self.boundaries(lids, start, end)
        reasons = {'source:' + c for c in self.global_issues}
        if reasons:
            return sorted(reasons)
        for mi in range(start, end):
            reasons.update('source:' + c for c in self.issue_by_bar[(pid, mi)])
            for lid in lids:
                reasons.update(self.line_bad_bars[(lid,mi)])
            m = self.measures[pid][mi]
            if q(m['duration']) != q(m['nominalDuration']):
                reasons.add('pickup-or-incomplete-measure')
        if reasons:
            return sorted(reasons)
        staffs = {self.a['lines'][l]['staff'] for l in lids}
        if staffs.intersection(self.unclosed_directions[pid]):
            reasons.add('unclosed-direction-spanner')
        for a,b,staff,tag in self.direction_spans[pid]:
            if staff not in staffs or b < start or a >= end:
                continue
            if a < start or b >= end:
                reasons.add('cut-direction-spanner')
            if tag == 'octave-shift':
                reasons.add('octave-shift-needs-profile')
        events = self.selected(lids, start, end)
        ids = {e['id'] for e in events}
        for lid in lids:
            reasons.update(self.boundary_bad[(lid,lo)])
            reasons.update(self.boundary_bad[(lid,hi)])
            for e in events:
                if e['lineId']==lid and any(e.get(k) and e[k] not in ids for k in ('tieFrom', 'tieTo')):
                    reasons.add('cut-tie')
            ctx = self.context(lid, lo)
            if not all(k in ctx for k in ('key', 'meter', 'clef')):
                reasons.add('context-incomplete')
            line = self.a['lines'][lid]
            for c in self.a['contexts']:
                if c['partId'] == pid and c['staff'] == line['staff'] and lo < q(c['at']) < hi:
                    if ctx.get(c['kind']) != c['value']:
                        reasons.add('context-change-needs-profile')
        initial_tempos = [t for t in self.a['tempos'] if q(t['at']) <= lo]
        bpm = max(initial_tempos,key=lambda t:q(t['at']))['quarterBpm'] if initial_tempos else None
        if any(lo < q(t['at']) < hi and t['quarterBpm']!=bpm for t in self.a['tempos']):
            reasons.add('tempo-change-needs-profile')
        for p in self.a['pedals']:
            if p['partId'] == pid and q(p['start']) < hi and q(p['end']) > lo:
                reasons.add('pedal-needs-profile')
                if q(p['start']) < lo < q(p['end']) or q(p['start']) < hi < q(p['end']):
                    reasons.add('cut-pedal')
        for s in self.a['slurs']:
            endpoints = s['startEventIds'] + s['endEventIds']
            source_events = [self.events[i] for i in endpoints if i in self.events]
            relevant = [e for e in source_events if e['lineId'] in lids]
            if not relevant:
                continue
            if any(e['id'] in ids for e in relevant) and not all(i in ids for i in endpoints):
                reasons.add('cut-or-cross-line-slur')
            elif min(q(e['onset']) for e in source_events) < lo and max(q(e['onset']) for e in source_events) >= hi:
                reasons.add('cut-slur')
        return sorted(reasons)

    def windows(self, min_targets=4, max_targets=64):
        """All bar-bounded windows in the attack budget; final count is native.

        Attack count here only bounds search. Chord members are never clipped,
        and a valid tie continuation may extend the ending beyond the last hit.
        """
        by_part = defaultdict(list)
        for lid in sorted(self.by_line):
            by_part[self.a['lines'][lid]['partId']].append(lid)
        for pid, lines in by_part.items():
            selections = [(l,) for l in lines]
            selections += [(a, b) for a, b in combinations(lines, 2)
                           if self.a['lines'][a]['staff'] != self.a['lines'][b]['staff']]
            for lids in selections:
                mm = self.measures[pid]
                count = [sum(e['kind'] == 'note' and not e.get('tieFrom')
                             for lid in lids for e in self.by_bar[(lid, i)]) for i in range(len(mm))]
                has_note = [any(e['kind']=='note' for lid in lids for e in self.by_bar[(lid,i)]) for i in range(len(mm))]
                for start in range(len(mm)):
                    if not count[start]:
                        continue  # avoid unbounded leading-silent padding
                    n = 0
                    for end in range(start + 1, len(mm) + 1):
                        n += count[end - 1]
                        if n > max_targets:
                            break
                        if n >= min_targets and has_note[end - 1]:
                            yield lids, start, end, n


def line_features(events):
    attacks = [e for e in events if e['kind'] == 'note' and not e.get('tieFrom')]
    intervals = []
    for a, b in zip(attacks, attacks[1:]):
        dia, semi, name = upstream_interval(pitch_name(a['pitch']), pitch_name(b['pitch']))
        intervals.append({'from': a['id'], 'to': b['id'], 'diatonic': dia,
                          'semitones': semi, 'name': name,
                          'preparationQuarter': str(q(b['onset']) - q(a['onset']))})
    notes = [e for e in events if e['kind'] == 'note']
    monophonic = all(q(a['onset']) + q(a['duration']) <= q(b['onset']) for a, b in zip(notes, notes[1:]))
    triads = []
    for a, b, c in zip(attacks, attacks[1:], attacks[2:]):
        triad = upstream_triad(tuple(pitch_name(e['pitch']) for e in (a,b,c)))
        if triad:
            triads.append({'events': [a['id'], b['id'], c['id']], 'root': triad[0], 'quality': triad[1]})
    return {'attacks': attacks, 'intervals': intervals, 'monophonic': monophonic, 'triads': triads}


def _cell_match(events, cursor, durations, rests=False):
    if len(events) < len(durations):
        return False
    for e, d in zip(events, durations):
        if q(e['onset']) != cursor or q(e['duration']) != d or (not rests and e['kind'] != 'note'):
            return False
        cursor += d
    return True


def rhythm_family(events, lo, hi, family, bar_length):
    """Finite rhythmic cells, exact rational matching. No scalar difficulty score."""
    ee = [{**e, 'onset': rational(q(e['onset']) - lo)} for e in events]
    cursor, i, special = Fraction(0), 0, False
    tied = [e for e in ee if e.get('tieTo') or e.get('tieFrom')]
    if tied and family != 'tied-eighths':
        return False
    while cursor < hi - lo:
        remain = ee[i:]
        found = False
        for ds, aligned, required in (
            [([Fraction(3, 2)], Fraction(3, 2), True),
             ([Fraction(1), Fraction(1, 2)], Fraction(3, 2), True),
             ([Fraction(1, 2)] * 3, Fraction(3, 2), True)] if family == 'compound' else
            [([Fraction(3, 2), Fraction(1, 2)], Fraction(2), True)] if family == 'dotted' else
            [([Fraction(1, 2), Fraction(1), Fraction(1, 2)], Fraction(2), True)] if family == 'syncopated' else []
        ):
            if cursor % aligned == 0 and _cell_match(remain, cursor, ds):
                cursor += sum(ds); i += len(ds); special = True; found = True; break
        if found:
            continue
        if family == 'compound':
            return False
        if family in ('paired-eighths', 'tied-eighths') and cursor % 1 == 0 and _cell_match(remain, cursor, [Fraction(1, 2)] * 2):
            cursor += 1; i += 2; special = True; continue
        e = remain[0] if remain else None
        if e is None or q(e['onset']) != cursor:
            return False  # implicit gaps require explicit source rest review
        d = q(e['duration'])
        allowed = (1,) if family == 'quarters' else (1, 2, 4)
        if d not in allowed or cursor % d != 0 or cursor // bar_length != (cursor + d - Fraction(1, 1000)) // bar_length:
            return False
        if e['kind'] == 'rest' and (family not in ('quarter-rests', 'paired-eighths') or d != 1):
            return False
        if family == 'quarter-rests' and e['kind'] == 'rest':
            special = True
        if family == 'long-notes' and d > 1:
            special = True
        cursor += d; i += 1
    if i != len(ee):
        return False
    if family == 'tied-eighths':
        by_id = {e['id']: e for e in ee}
        return special and any(e.get('tieFrom') in by_id and q(e['onset']) % 1 == 0
                               and q(by_id[e['tieFrom']]['onset']) % 1 == Fraction(1, 2) for e in tied)
    return family == 'quarters' or special


def _template_witness(events, template):
    mapping = {tuple(p['pitch']): p['finger'] for p in template['keys']}
    if all(pitch_name(e['pitch']) in mapping for e in events):
        return {'templateId': template['id'], 'hand': template['hand'],
                'fingers': [[e['id'], mapping[pitch_name(e['pitch'])]] for e in events]}
    return None


def movement_witness(events, templates, min_prep_ms, max_bpm, beat_quarter):
    """Find a sequence of explicit positions; never derive fingering from span."""
    maps = [{tuple(p['pitch']): p['finger'] for p in t['keys']} for t in templates]
    paths = {i: [i] for i, mapping in enumerate(maps) if events and pitch_name(events[0]['pitch']) in mapping}
    for prev, event in zip(events, events[1:]):
        prep = float(q(event['onset']) - q(prev['onset'])) * 60000 / (max_bpm * beat_quarter)
        # A long value or a written gap supplies reading preparation. This is
        # not a claim that a given physical hand movement is comfortable.
        prepared = q(prev['duration']) >= 2 or q(event['onset']) - q(prev['onset']) - q(prev['duration']) >= 1
        following = {}
        for i, mapping in enumerate(maps):
            if pitch_name(event['pitch']) not in mapping:
                continue
            options = [(sum(a != b for a, b in zip(path, path[1:])) + (old != i), path + [i])
                       for old, path in paths.items() if old == i or (prepared and prep >= min_prep_ms)]
            if options:
                following[i] = min(options)[1]
        paths = following
        if not paths:
            return None
    if not paths:
        return None
    path = min(paths.values(), key=lambda p: (sum(a != b for a, b in zip(p, p[1:])), p))
    return {'templateId': 'prepared-fixed-position-change', 'hand': templates[path[0]]['hand'],
            'positions': [templates[i]['id'] for i in path],
            'fingers': [[e['id'], maps[i][pitch_name(e['pitch'])]] for e, i in zip(events, path)]}


def evaluate(index, lids, start, end, config):
    lo, hi = index.boundaries(lids, start, end)
    events = index.selected(lids, start, end)
    basic = index.cut_reasons(lids, start, end)
    if basic:
        return [], {'all': basic}, None
    per_line = {lid: [e for e in events if e['lineId'] == lid] for lid in lids}
    features = {lid: line_features(ee) for lid, ee in per_line.items()}
    contexts = {lid: index.context(lid, lo) for lid in lids}
    source_modes = {}
    for lid in lids:
        line=index.a['lines'][lid]
        for mi in range(start,end):
            modes=index.key_modes[(line['partId'],mi)]
            source_modes[(lid,mi)]=modes.get(line['staff'],modes.get(0))
    if any(mode not in (None,'major') for mode in source_modes.values()):
        basic.append('tonal-mode-needs-profile')
    if any(not f['monophonic'] for f in features.values()):
        basic.append('polyphony-within-line')
    if any(not f['attacks'] for f in features.values()):
        basic.append('empty-selected-line')
    if any(e['notation']['timeModification'] for e in events):
        basic.append('tuplet-needs-profile')
    if any(any(a!='Fingering' for a in e['articulations']) for e in events):
        basic.append('articulation-needs-profile')
    if any(index.notes[e['id']].find('./notations/fermata') is not None for e in events):
        basic.append('fermata-needs-profile')
    if any(e['pitch']['midi'] < 21 or e['pitch']['midi'] > 108 for e in events if e['kind'] == 'note'):
        basic.append('outside-88-keys')
    if basic:
        return [], {'all': sorted(set(basic))}, None
    all_intervals = [i for f in features.values() for i in f['intervals']]
    # The name must be a normal diatonic interval, not e.g. C-C# or C-Db
    # accidentally accepted through a MIDI-only maximum-distance rule.
    allowed_names = {1: {'P1'}, 2: {'m2', 'M2'}, 3: {'m3', 'M3'}, 4: {'P4'},
                     5: {'P5'}, 6: {'m6', 'M6'}, 7: {'m7', 'M7'}, 8: {'P8'}}
    relations = {abs(i['diatonic']) for i in all_intervals}
    directions = {1 if i['semitones'] > 0 else -1 for i in all_intervals if i['semitones']}
    matches, rejected = [], {}
    for p in config['profiles']:
        reasons = []
        if len(lids) != p['lines']:
            rejected[p['id']] = ['line-count']; continue
        if any(abs(i['diatonic']) > p['maxInterval'] or i['name'].replace('-', '') not in allowed_names.get(abs(i['diatonic']), set()) for i in all_intervals):
            reasons.append('interval-outside-profile')
        for ctx in contexts.values():
            key = ctx['key']
            if key['fifths'] not in p['fifths'] or key.get('mode') not in (None, 'major'):
                reasons.append('key-outside-profile')
            if ctx['meter']['ratio'] not in p['meters']:
                reasons.append('meter-outside-profile')
            if (ctx['clef']['sign'], ctx['clef']['line'], ctx['clef']['octaveChange']) not in (('G', 2, 0), ('F', 4, 0)):
                reasons.append('clef-needs-profile')
        if len({c['meter']['ratio'] for c in contexts.values()}) != 1:
            reasons.append('different-line-meters')
        family_hits = {}
        for lid, ee in per_line.items():
            meter = contexts[lid]['meter']
            bar = Fraction(meter['numerator'] * 4, meter['denominator'])
            family_hits[lid] = [family for family in p['rhythms'] if rhythm_family(ee, lo, hi, family, bar)]
            if not family_hits[lid]:
                reasons.append('rhythm-outside-profile')
        focus = p['focusRule']
        if focus == 'steps' and (2 not in relations or len(directions) < 2):
            reasons.append('focus-missing-step-and-return')
        if focus == 'thirds' and not ({2, 3} <= relations):
            reasons.append('focus-missing-third-among-steps')
        if focus == 'triads' and (not relations.intersection({4, 5}) or not any(f['triads'] for f in features.values())):
            reasons.append('focus-missing-triad-with-fourth-or-fifth')
        if focus == 'leaps':
            wide = [i for i in all_intervals if abs(i['diatonic']) >= 6]
            if not wide:
                reasons.append('focus-missing-sixth-seventh-octave')
            for lid, f in features.items():
                for j, interval in enumerate(f['intervals']):
                    if abs(interval['diatonic']) >= 6 and (j + 1 >= len(f['intervals']) or abs(f['intervals'][j + 1]['diatonic']) > 3):
                        reasons.append('leap-without-familiar-following-pattern')
        if focus == 'two-hands':
            ordered = sorted(lids, key=lambda lid: min(e['pitch']['midi'] for e in features[lid]['attacks']))
            lower, upper = [features[lid]['attacks'] for lid in ordered]
            if max(e['pitch']['midi'] for e in lower) >= min(e['pitch']['midi'] for e in upper):
                reasons.append('crossing-or-shared-key-hands')
            bass_bars = Counter(e['measureIndex'] for e in lower)
            if max(bass_bars.values()) > 1 or any(q(e['duration']) < 2 or (q(e['onset']) - lo) % 1 for e in lower):
                reasons.append('bass-not-sparse-or-held')
            if not any(q(e['onset']) == lo for e in lower) or not any(q(e['onset']) == lo for e in upper):
                reasons.append('two-hand-start-not-aligned')
            if not relations.intersection({2, 3, 4, 5}):
                reasons.append('focus-missing-moving-melody')
        witnesses = {}
        for lid, f in features.items():
            ctx = contexts[lid]
            templates = [t for t in config['handTemplates'] if t['group'] in p['positions'] and
                         t['fifths'] == ctx['key']['fifths'] and t['clef'] == ctx['clef']['sign']]
            choices = [w for t in templates if (w := _template_witness(f['attacks'], t))]
            if not choices and p.get('movement'):
                for hand in ('left', 'right'):
                    subset = [t for t in templates if t['hand'] == hand]
                    w = movement_witness(f['attacks'], subset, p['movement']['minPreparationMs'], p['bpm']['max'], p['bpm']['beatQuarter'])
                    if w:
                        choices.append(w)
            if choices:
                compatible = []
                for choice in choices:
                    fingers=dict(choice['fingers'])
                    if all(not index.notes[e['id']].findall('./notations/technical/fingering') or
                           all((n.text or '').strip()==str(fingers[e['id']]) for n in index.notes[e['id']].findall('./notations/technical/fingering'))
                           for e in f['attacks']):
                        compatible.append(choice)
                if compatible:
                    witnesses[lid] = compatible[0]
                else:
                    reasons.append('source-fingering-template-conflict')
            else:
                reasons.append('no-explicit-position-template')
        if focus == 'two-hands' and len({w['hand'] for w in witnesses.values()}) != 2:
            reasons.append('two-reviewed-hand-roles-required')
        if reasons:
            rejected[p['id']] = sorted(set(reasons))
        else:
            matches.append({'profileId': p['id'], 'grade': p['grade'], 'purpose': 'focus',
                            'rhythms': family_hits, 'handWitnesses': witnesses})
    stats = {'intervals': all_intervals, 'direction': sorted(directions),
             'triads': [t for f in features.values() for t in f['triads']],
             'minMidi': min(e['pitch']['midi'] for e in events if e['kind'] == 'note'),
             'maxMidi': max(e['pitch']['midi'] for e in events if e['kind'] == 'note'),
             'keyModeConfirmed': all(source_modes.values())}
    return matches, rejected, stats


def content_hashes(events, lids, lo, length):
    # One common base preserves vertical spacing between two lines. Include
    # spelled diatonic distance, exact rhythm, rests, ties and phrase length.
    notes = [e for e in events if e['kind'] == 'note']
    first = notes[0]['pitch']
    base_d = upstream_pitch(pitch_name(first)).diatonicNoteNum
    rows, relative = [], []
    for e in events:
        value = [lids.index(e['lineId']), str(q(e['onset']) - lo), str(q(e['duration'])), e['kind'], bool(e.get('tieFrom')), bool(e.get('tieTo'))]
        p = e.get('pitch')
        rows.append(value + [list(pitch_name(p)) if p else None])
        relative.append(value + [([upstream_pitch(pitch_name(p)).diatonicNoteNum - base_d, p['midi'] - first['midi']] if p else None)])
    return {'exactHash': digest(encoded([str(length), rows]).encode()),
            'motifGroupId': digest(encoded([str(length), relative]).encode())}


def _sub(parent, tag, value=None, **attrs):
    e = ET.SubElement(parent, tag, attrs)
    if value is not None:
        e.text = str(value)
    return e


def project_xml(index, lids, start, end):
    """Lossless note projection, not a new timing parser or simplification.

    Replaced non-chord notes advance the XML cursor by their original duration.
    Dropped chord members never advance it. Original backup/forward operations
    and original divisions are retained. The two independent gates catch any
    omission, shifted voice, accidental, tie, or duration after this projection.
    """
    lids = tuple(lids)
    if reasons := index.cut_reasons(lids, start, end):
        raise CorpusError('unsafe-excerpt:' + ','.join(reasons))
    pid = index.a['lines'][lids[0]]['partId']
    part = index.parts[pid]
    measures = part.findall('measure')
    selected = {e['id'] for e in index.selected(lids, start, end)}
    staff_order = sorted({index.a['lines'][l]['staff'] for l in lids})
    remap = {s: i + 1 for i, s in enumerate(staff_order)}
    # Carry source XML contexts, including mode/attributes not promoted by Q2.
    effective = {}
    for measure in measures[:start + 1]:
        for attrs in measure.findall('attributes'):
            for e in attrs:
                if e.tag in ('divisions', 'key', 'time', 'clef', 'staff-details', 'transpose'):
                    effective[(e.tag, e.get('number'))] = deepcopy(e)
    tree = ET.Element('score-partwise', version='4.0')
    for tag in ('work', 'movement-title', 'identification'):
        e = index.tree.find(tag)
        if e is not None:
            tree.append(deepcopy(e))
    plist = _sub(tree, 'part-list')
    definition = next(p for p in index.tree.findall('./part-list/score-part') if p.get('id') == pid)
    plist.append(deepcopy(definition))
    out_part = _sub(tree, 'part', id=pid)
    pi = next(i for i, p in enumerate(index.tree.findall('part')) if p.get('id') == pid)
    for mi in range(start, end):
        original = measures[mi]
        out = ET.Element('measure', dict(original.attrib))
        out.attrib.pop('width', None)
        out.set('number', str(mi - start + 1))
        if mi == start:
            attrs = _sub(out, 'attributes')
            order = {'divisions': 0, 'key': 1, 'time': 2, 'staves': 3, 'clef': 4, 'staff-details': 5, 'transpose': 6}
            inherited = list(effective.values()) + [ET.Element('staves')]
            inherited[-1].text = str(len(staff_order))
            for e in sorted(inherited, key=lambda a: order[a.tag]):
                number = int(e.get('number', '1')) if e.tag in ('clef', 'staff-details', 'transpose') else int(e.get('number', '0'))
                if number and number not in remap:
                    continue
                if number:
                    e.set('number', str(remap[number]))
                attrs.append(e)
            lo, _ = index.boundaries(lids,start,end)
            tempos = [t for t in index.a['tempos'] if q(t['at']) <= lo]
            if tempos:
                tempo = max(tempos, key=lambda t: q(t['at']))
                _sub(_sub(out,'direction'),'sound',tempo=str(tempo['quarterBpm']))
        ni = -1
        for element in original:
            e = deepcopy(element)
            if e.tag == 'note':
                ni += 1
                identity = f'p{pi}:m{mi}:n{ni}'
                if identity not in selected:
                    if e.find('chord') is None and e.find('grace') is None:
                        forward = _sub(out, 'forward')
                        duration = e.find('duration')
                        if duration is None:
                            raise CorpusError('projection-missing-duration')
                        forward.append(deepcopy(duration))
                    continue
                e.set('id', identity.replace(':', '-'))
                for attr in ('default-x', 'default-y', 'relative-x', 'relative-y'):
                    e.attrib.pop(attr, None)
                staff = e.find('staff')
                if staff is not None:
                    staff.text = str(remap[int(staff.text)])
                voice = e.find('voice')
                if voice is not None:
                    voice.text = str(1 + 4 * (remap[index.events[identity]['staff']] - 1))
            elif e.tag == 'attributes':
                if mi == start:
                    continue  # effective attributes already emitted
                for a in list(e):
                    if a.tag == 'staves':
                        a.text = str(len(staff_order)); continue
                    number = int(a.get('number', '1')) if a.tag in ('clef', 'staff-details', 'transpose') else int(a.get('number', '0'))
                    if number and number not in remap:
                        e.remove(a)
                    elif number:
                        a.set('number', str(remap[number]))
            elif e.tag in ('forward', 'direction', 'harmony'):
                s = e.find('staff')
                source_staff = int(s.text) if s is not None else 1
                global_tempo = e.find('sound') is not None and 'tempo' in e.find('sound').attrib or e.find('./direction-type/metronome') is not None
                if e.tag != 'forward' and source_staff not in remap and not global_tempo:
                    continue
                if s is not None:
                    s.text = str(remap.get(source_staff, 1))
                if e.tag == 'forward':
                    for v in list(e):
                        if v.tag in ('staff', 'voice'):
                            e.remove(v)
            elif e.tag == 'print':
                continue  # page geometry isn't part of the musical projection
            out.append(e)
        out_part.append(out)
    return ET.tostring(tree, encoding='utf-8', xml_declaration=True)


def verify_projection(index, lids, start, end, projected):
    """Compare every selected original event against a fresh music21 import."""
    lo, hi = index.boundaries(lids, start, end)
    expected = index.selected(lids, start, end)
    original = {e['id'].replace(':', '-'): e for e in expected}
    errors, mapping, line_map = [], {}, {}
    for e in projected['events']:
        a = original.get(e['sourceNoteId'])
        if a is None or e['sourceNoteId'] in mapping:
            errors.append('projection-extra-or-unmapped-event'); continue
        mapping[e['sourceNoteId']] = e
        if (a['kind'], a.get('pitch'), a.get('writtenPitch'), a['duration'], rational(q(a['onset']) - lo), a['tieType'], a['articulations'], a['notation']) != (
            e['kind'], e.get('pitch'), e.get('writtenPitch'), e['duration'], e['onset'], e['tieType'], e['articulations'], e['notation']):
            errors.append('projection-musical-event-mismatch')
    if set(mapping) != set(original):
        errors.append('projection-missing-event')
    for key, a in original.items():
        e = mapping.get(key)
        if not e:
            continue
        for relation in ('tieFrom', 'tieTo'):
            prior = mapping.get(a.get(relation, '').replace(':', '-'))
            if e.get(relation) != (prior['id'] if prior else None):
                errors.append('projection-tie-mismatch')
    pid = index.a['lines'][lids[0]]['partId']
    source_measures = index.measures[pid][start:end]
    if [(rational(q(m['start']) - lo), m['duration']) for m in source_measures] != [(m['start'], m['duration']) for m in projected['measures']]:
        errors.append('projection-measure-time')
    effective = [t for t in index.a['tempos'] if q(t['at']) <= lo]
    expected_tempos = ([{'at':rational(0),'quarterBpm':max(effective,key=lambda t:q(t['at']))['quarterBpm']}] if effective else [])
    expected_tempos += [{**t,'at':rational(q(t['at'])-lo)} for t in index.a['tempos'] if lo < q(t['at']) < hi]
    if sorted(encoded(t) for t in expected_tempos) != sorted(encoded(t) for t in projected['tempos']):
        errors.append('projection-tempo-context')
    for lid in lids:
        source_events = [e for e in expected if e['lineId'] == lid]
        target_lines = {mapping[e['id'].replace(':', '-')]['lineId'] for e in source_events if e['id'].replace(':', '-') in mapping}
        if len(target_lines) != 1:
            errors.append('projection-voice-partition'); continue
        target_lid = next(iter(target_lines))
        line_map[lid] = target_lid
        target_line = projected['lines'][target_lid]
        target_context = {c['kind']: c['value'] for c in projected['contexts'] if c['staff'] == target_line['staff'] and q(c['at']) == 0}
        if target_context != index.context(lid, lo):
            errors.append('projection-notation-context')
    return {'passed': not errors, 'rejectionCodes': sorted(set(errors)),
            'sourceEvents': len(expected), 'excerptEvents': len(projected['events']),
            'lineMap':line_map,
            'eventMap':{a['id']:mapping[k]['id'] for k,a in original.items() if k in mapping}}


def group_candidates(candidates):
    """Union exact copies, transposed motifs, and >=50% source overlap.

    Threshold is product configuration. Transitive groups are intentionally
    conservative: a sliding-window chain must not inflate variety counts.
    """
    parent = {c['id']: c['id'] for c in candidates}

    def root(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x

    def join(a, b):
        a, b = root(a), root(b)
        parent[max(a, b)] = min(a, b)

    hashes, spans = {}, defaultdict(list)
    for c in sorted(candidates, key=lambda c: c['id']):
        for field in ('exactHash', 'motifGroupId'):
            k = (field, c[field])
            if k in hashes:
                join(c['id'], hashes[k])
            hashes[k] = c['id']
        spans[(c['sourceId'], tuple(c['selection']['lineIds']))].append(c)
    for group in spans.values():
        group.sort(key=lambda c: c['span']['startTick'])
        for i, a in enumerate(group):
            lo, hi = a['span']['startTick'], a['span']['endTick']
            for b in group[i + 1:]:
                x, y = b['span']['startTick'], b['span']['endTick']
                if x >= hi:
                    break
                if min(hi, y) - x >= min(hi - lo, y - x) / 2:
                    join(a['id'], b['id'])
    for c in candidates:
        c['nearDuplicateGroupId'] = root(c['id'])
    return candidates
