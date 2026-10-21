"""V2 offline admission for explicitly reviewed original musical units.

music21 supplies parsing, spelled intervals and rest-segment proposals. These
filters implement the documented product profiles, NOT a performance grader or
an invented phrase detector. A rest proposal alone can never approve a unit.
"""
from __future__ import annotations
from collections import Counter
from fractions import Fraction
from pathlib import Path
import inspect
import json
import music21 as m21
from music21.analysis.segmentByRests import Segmenter

from curriculum_fragments import (SourceIndex, line_features, pitch_name,
    content_hashes, project_xml, verify_projection, ticks, q)
from curriculum_normalize import digest, encoded, rational, normalize, piano_xml
from curriculum_io import CorpusError

ROOT = Path(__file__).resolve().parents[2]
VERSION = 'prepared-original-units-v2'


def length_bucket(count, config):
    if not isinstance(count, int) or isinstance(count, bool):
        raise CorpusError('invalid-native-target-count')
    hits = [b['id'] for b in config['buckets'] if b['min'] <= count <= b['max']]
    if len(hits) > 1:
        raise CorpusError('overlapping-length-buckets')
    return hits[0] if hits else None


def selection_hash(unit):
    # Editing span, hand, profile, unit kind or source invalidates the review.
    return digest(encoded({k: unit[k] for k in ('sourceSha256', 'analysisSha256',
        'lineId', 'startMeasure', 'endMeasure', 'unitKind', 'profileId', 'handTemplateId')}).encode())


def context_evidence(index, unit):
    lid = unit['lineId']; line = index.a['lines'][lid]
    start, end = unit['startMeasure'], unit['endMeasure']
    mm = index.measures[line['partId']]
    first, last = max(0, start-1), min(len(mm), end+1)
    data = {'sourceSha256': index.a['sourceSha256'], 'selectedLine': lid,
        'contextMeasures': [first, last], 'selectedMeasures': [start, end],
        'sourceStart': start == 0, 'sourceEnd': end == len(mm),
        'measures': mm[first:last],
        # Include the other hand/voices, not just the isolated melody.
        'events': [e for e in index.a['events'] if e['partId'] == line['partId'] and first <= e['measureIndex'] < last],
        'effectiveContext': index.context(lid, q(mm[start]['start'])),
        'slurs': index.a['slurs'], 'pedals': index.a['pedals']}
    return data


def upstream_rest_proposals(index, lid, source_events=None):
    events = index.by_line[lid] if source_events is None else source_events
    if not line_features(events)['monophonic']:
        return {'status': 'unsupported-polyphony', 'segments': []}
    stream = m21.stream.Part()
    for e in events:
        item = m21.note.Rest() if e['kind'] == 'rest' else m21.note.Note()
        if e['kind'] == 'note':
            item.pitch.step = e['pitch']['step']; item.pitch.octave = e['pitch']['octave']
            item.pitch.accidental = m21.pitch.Accidental(e['pitch']['alter'])
        item.id = e['id']; item.duration.quarterLength = q(e['duration'])
        stream.insert(q(e['onset']), item)
    line = index.a['lines'][lid]
    for ctx in index.a['contexts']:
        if ctx['partId'] == line['partId'] and ctx['staff'] == line['staff'] and ctx['kind'] == 'clef':
            value = ctx['value']; clef = m21.clef.Clef()
            clef.sign = value['sign']; clef.line = value['line']; clef.octaveChange = value['octaveChange']
            stream.insert(q(ctx['at']), clef)
    segments = Segmenter.getSegmentsList(stream)
    return {'status': 'proposal-only', 'upstream': 'music21.analysis.segmentByRests.Segmenter.getSegmentsList',
        'version': m21.__version__, 'codeSha256': digest(Path(inspect.getfile(Segmenter)).read_bytes()),
        'segments': [[str(n.id) for n in group] for group in segments if group]}


def rhythm_verdict(index, lid, start, end, family):
    """Literal R0-R3 policy, exact per-bar phase; no difficulty weights."""
    line = index.a['lines'][lid]; special = []
    for mi in range(start, end):
        bar = index.measures[line['partId']][mi]
        lo, duration = q(bar['start']), q(bar['duration'])
        ee = index.by_bar[(lid, mi)]; cursor = lo; i = 0
        while i < len(ee):
            e = ee[i]; d = q(e['duration']); phase = cursor-lo
            if q(e['onset']) != cursor or e.get('tieFrom') or e.get('tieTo'):
                return None
            if family == 'paired-eighths' and d == Fraction(1, 2):
                if phase.denominator != 1 or i+1 >= len(ee): return None
                other = ee[i+1]
                if e['kind'] != 'note' or other['kind'] != 'note' or q(other['onset']) != cursor+d or q(other['duration']) != d:
                    return None
                if other.get('tieFrom') or other.get('tieTo'): return None
                special.append([e['id'], other['id']]); cursor += 1; i += 2; continue
            allowed = (1,) if family == 'quarters' else (1, 2, 4)
            if duration == 3 and family != 'quarters': allowed = (*allowed, 3)
            if d not in allowed or phase.denominator != 1 or phase+d > duration: return None
            if d in (3,4) and (phase != 0 or d != duration): return None
            if e['kind'] == 'rest':
                if family not in ('quarter-rests','paired-eighths') or d != 1: return None
                if family == 'quarter-rests': special.append([e['id']])
            elif d > 1 and family == 'long-notes': special.append([e['id']])
            cursor += d; i += 1
        if cursor != lo+duration: return None
    if family != 'quarters' and not special: return None
    return {'family': family, 'witnessEventIds': special}


def assess_unit(index, unit, config):
    required = ('sourceSha256','analysisSha256','lineId','startMeasure','endMeasure','unitKind','profileId','handTemplateId')
    if any(k not in unit for k in required): raise CorpusError('incomplete-unit-selection')
    if unit['sourceSha256'] != index.a['sourceSha256'] or unit['analysisSha256'] != digest(encoded(index.a).encode()):
        raise CorpusError('unit-source-analysis-binding')
    lid = unit['lineId']; start, end = unit['startMeasure'], unit['endMeasure']
    if lid not in index.a['lines']: raise CorpusError('unknown-selected-line')
    mm = index.measures[index.a['lines'][lid]['partId']]
    if not isinstance(start,int) or not isinstance(end,int) or not 0 <= start < end <= len(mm):
        raise CorpusError('invalid-unit-span')
    profile = next((p for p in config['profiles'] if p['id'] == unit['profileId']), None)
    template = next((p for p in config['handTemplates'] if p['id'] == unit['handTemplateId']), None)
    if profile is None or template is None: raise CorpusError('unimplemented-profile-or-hand')
    if profile['grade'] not in (1,2): raise CorpusError('unimplemented-grade')
    lo, hi = index.boundaries((lid,), start, end)
    ee = index.selected((lid,), start, end); f = line_features(ee)
    reasons = list(index.cut_reasons((lid,),start,end))
    if not f['attacks'] or not f['monophonic']: reasons.append('single-monophonic-line-required')
    context = index.context(lid,lo)
    key, meter, clef = (context.get(k,{}) for k in ('key','meter','clef'))
    if key.get('fifths') != 0 or key.get('mode') not in (None,'major'): reasons.append('key-outside-profile')
    if meter.get('ratio') not in profile['meters']: reasons.append('meter-outside-profile')
    expected_clef = ('G',2,0) if template['hand']=='right' else ('F',4,0)
    if tuple(clef.get(k) for k in ('sign','line','octaveChange')) != expected_clef: reasons.append('clef-hand-mismatch')
    names = {1: {'P1'}, 2: {'m2','M2'}, 3: {'m3','M3'}}
    for interval in f['intervals']:
        size = abs(interval['diatonic'])
        if size > profile['maxInterval'] or interval['name'].replace('-','') not in names.get(size,set()):
            reasons.append('interval-outside-profile')
    sizes = {abs(i['diatonic']) for i in f['intervals']}
    if 2 not in sizes: reasons.append('step-focus-missing')
    if profile['focusRule'] == 'thirds' and 3 not in sizes: reasons.append('third-focus-missing')
    rhythms = [r for family in profile['rhythms'] if (r := rhythm_verdict(index,lid,start,end,family))]
    if not rhythms: reasons.append('rhythm-outside-profile')
    mapping = {tuple(p['pitch']):p['finger'] for p in template['keys']}
    fingers = []
    for e in ee:
        if e['notation']['timeModification'] or any(a != 'Fingering' for a in e['articulations']):
            reasons.append('notation-needs-profile')
        if index.notes[e['id']].find('./notations/fermata') is not None: reasons.append('fermata-needs-profile')
        if e['kind'] != 'note': continue
        finger = mapping.get(pitch_name(e['pitch']))
        if finger is None: reasons.append('outside-reviewed-hand-position'); continue
        if e['pitch']['alter'] != 0: reasons.append('chromaticism-needs-profile')
        if any((n.text or '').strip() != str(finger) for n in index.notes[e['id']].findall('./notations/technical/fingering')):
            reasons.append('source-fingering-conflict')
        fingers.append({'eventId': e['id'], 'finger': finger})
    evidence = context_evidence(index,unit)
    review = unit.get('review',{})
    if review.get('selectionSha256') != selection_hash(unit): reasons.append('review-selection-binding')
    if review.get('contextSha256') != digest(encoded(evidence).encode()): reasons.append('review-context-binding')
    if unit['unitKind'] not in ('motif','phrase','phrase-sequence','complete-piece'): reasons.append('unit-kind')
    if review.get('status') != 'accepted-local-pilot': reasons.append('boundary-hand-review-pending')
    for field in ('startReason','endReason','musicalReason','handReason','tonalityReason'):
        if not isinstance(review.get(field),str) or len(review[field].strip()) < 20: reasons.append('missing-review:'+field)
    if review.get('reviewerRole') != 'assistant' or review.get('teacherReviewed') is not False:
        reasons.append('review-identity-not-declared')
    if review.get('method') != 'source-context-and-score-inspection': reasons.append('review-method')
    if not review.get('reviewer') or not review.get('reviewedAt'): reasons.append('review-author-or-date')
    inspected = review.get('sourceScoreInspection',{})
    if inspected.get('sourceXmlSha256') != index.a['pianoXmlSha256'] or len(inspected.get('snapshotSha256','')) != 64:
        reasons.append('source-score-inspection-missing')
    if review.get('tonality') != 'C major': reasons.append('unconfirmed-tonality')
    return {'passed':not reasons,'rejectionCodes':sorted(set(reasons)),
        'grade':profile['grade'],'profileId':profile['id'],'hand':template['hand'],
        'bpm':profile['bpm'],'intervals':f['intervals'],'rhythms':rhythms,
        'handWitness':{'templateId':template['id'],'fingers':fingers,'review':review.get('handReason')},
        'sourceEventIds':[e['id'] for e in ee], 'durationQuarter':rational(hi-lo),
        'contextSha256':digest(encoded(evidence).encode()),
        'focusEventPairs':[[i['from'],i['to']] for i in f['intervals'] if abs(i['diatonic']) == (3 if profile['focusRule']=='thirds' else 2)]}


def prepare_unit(index, unit, config):
    verdict = assess_unit(index,unit,config)
    if not verdict['passed']: raise CorpusError(','.join(verdict['rejectionCodes']))
    lid = unit['lineId']; start,end = unit['startMeasure'],unit['endMeasure']
    xml = project_xml(index,(lid,),start,end)
    analysis = normalize(xml)
    projection = verify_projection(index,(lid,),start,end,analysis)
    if not projection['passed']: raise CorpusError(','.join(projection['rejectionCodes']))
    if analysis['releaseBlockers']: raise CorpusError(','.join(analysis['releaseBlockers']))
    canonical,_ = piano_xml(xml)
    lo,hi = index.boundaries((lid,),start,end)
    hashes = content_hashes(index.selected((lid,),start,end),(lid,),lo,hi-lo)
    content_id = digest(encoded({'source':unit['sourceSha256'],'line':lid,'span':[start,end],
        'hand':verdict['hand'],'transform':'original-excerpt-v1'}).encode())
    return {'id':content_id, 'unit':unit, 'verdict':verdict, 'projection':projection,
        'xml':canonical, 'analysis':analysis, 'context':context_evidence(index,unit),
        'exactHash':hashes['exactHash'],'motifHash':hashes['motifGroupId'],
        'sourceSpan':{'startMeasure':start,'endMeasure':end,'startTick':ticks(lo),'endTick':ticks(hi),'ticksPerQuarter':480}}


def coverage(entries, buckets):
    cells = []
    for grade in range(1,9):
        for hand in ('left','right','both'):
            for bucket in buckets['buckets']:
                rows = [e for e in entries if e['grade']==grade and e['hand']==hand and e['lengthBucket']==bucket['id']]
                cells.append({'grade':grade,'hand':hand,'lengthBucket':bucket['id'],
                    'exercises':len(rows),'motifs':len({e['motifHash'] for e in rows}),
                    'sourceFiles':len({e['sourceSha256'] for e in rows})})
    return {'exerciseCount':len(entries),'exactContents':len({e['exactHash'] for e in entries}),
        'motifs':len({e['motifHash'] for e in entries}),'sourceFiles':len({e['sourceSha256'] for e in entries}),
        'cells':cells,'emptyCells':[c for c in cells if not c['exercises']]}
