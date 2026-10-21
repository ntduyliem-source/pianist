"""Versioned reading-content admission. No fingering optimizer is called.

Reuse the exact V3 notation/rhythm predicates. Explicitly replace human/motor
evidence gates; never manufacture a review or a modelled performance speed.
"""
from collections import Counter
from pathlib import Path
import json

from curriculum_evidence import routing
from curriculum_fragments import q, pitch_name, upstream_pitch, upstream_triad
from curriculum_grades import assess_profile, selection_inputs

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT/'scores/curriculum/reading-bank.v1.json'

# Enumerated intentionally: a future V3 rule cannot silently be waived.
REPLACED = {'evidence-binding', 'source-hand-completeness', 'major-tonality',
            'musical-group-context', 'hand-path-evidence', 'register-reading-evidence',
            'reviewed-bpm-scope', 'movement-release-window'}
KEPT = {'hand-configuration', 'monophony-and-held-notes', 'keyboard-range',
        'source-integrity', 'key-signature', 'meter', 'clef-register',
        'diatonic-spelling', 'spelled-interval-limit', 'notation-scope',
        'interval-focus', 'direction-change', 'single-leap-family',
        'familiar-pattern-after-leap', 'familiar-motion-focus', 'two-hand-entry',
        'sparse-accompaniment', 'melody-motion', 'crossing-or-shared-held-key',
        'home-register', 'new-position-focus'}


def policy():
    return json.loads(POLICY_PATH.read_text(encoding='utf8'))


def assess_reading(index, selection, profile, config):
    legacy = assess_profile(index, selection, profile, config=config)
    checks = []
    for check in legacy['checks']:
        rule = check['rule']
        if rule in REPLACED:
            continue
        if rule not in KEPT and not rule.startswith(('source-integrity:', 'rhythm:')):
            raise ValueError('unreviewed-reading-rule:'+rule)
        checks.append(check)

    def test(rule, ok, ids=(), detail=None):
        checks.append({'rule':rule, 'status':'pass' if ok else 'fail',
                       'eventIds':list(ids), 'detail':detail})

    lo, hi, events, notes, ids, by_line, features, reasons, source_lines = selection_inputs(index, selection)
    hands = selection['lineHands']; lids = tuple(sorted(hands))
    # Cache only within this immutable source scan, never use an old proof.
    cache = getattr(index, '_reading_routing', None)
    if cache is None: cache = index._reading_routing = {}
    key = (tuple(sorted(hands.items())), lo, hi)
    if key not in cache:
        cache[key] = routing(index, selection)
    mapping, trace = cache[key]
    omitted = {lid for lid in source_lines-set(lids) if mapping.get(lid) in set(hands.values())}
    test('reading-source-hand-completeness', bool(mapping) and not omitted
         and all(mapping.get(lid)==side for lid,side in hands.items()), ids,
         {'routing':trace, 'omittedSelectedHandLines':sorted(omitted)})
    for lid in lids:
        mode = index.context(lid,lo).get('key',{}).get('mode')
        test('explicit-key-mode', mode in (None, 'major'), detail={'sourceMode':mode})

    spans = {}; distant = []
    for lid in lids:
        line_notes = [e for e in by_line[lid] if e['kind']=='note']
        diatonic = [upstream_pitch(pitch_name(e['pitch'])).diatonicNoteNum for e in line_notes]
        spans[lid] = max(diatonic)-min(diatonic)+1 if diatonic else 0
        bottom, top = (31,39) if hands[lid]=='right' else (19,27)
        distant.extend(e['id'] for e,d in zip(line_notes,diatonic) if d<=bottom-6 or d>=top+6)
    if profile['grade']==4:
        test('ordinary-written-register', not distant, distant)
        if profile['movement']=='new-position':
            test('five-step-written-span', all(0<s<=5 for s in spans.values()), ids, spans)
        elif profile['movement']=='shift':
            test('wider-written-span', all(5<s<=8 for s in spans.values()), ids, spans)
    if profile['movement']=='register':
        test('distant-written-register', bool(distant), distant)
        test('five-step-written-span', all(0<s<=5 for s in spans.values()), ids, spans)
    if profile['focus']=='arpeggio':
        witnesses=[]
        for f in features.values():
            seq=f['attacks']
            for a,b,c in zip(seq,seq[1:],seq[2:]):
                if q(a['onset'])+q(a['duration'])==q(b['onset']) and q(b['onset'])+q(b['duration'])==q(c['onset']):
                    if upstream_triad(tuple(pitch_name(e['pitch']) for e in (a,b,c))):
                        witnesses.extend(e['id'] for e in (a,b,c))
        test('literal-triad-figure', bool(witnesses), witnesses)
    failures=[c['rule'] for c in checks if c['status']=='fail']
    reviews=[c['rule'] for c in checks if c['status']=='review']
    return {'profileId':profile['id'], 'grade':profile['grade'],
            'status':'fail' if failures else 'review' if reviews else 'pass',
            'failureRules':failures, 'reviewRules':reviews, 'checks':checks,
            'beatQuarter':profile['beatQuarter'], 'fingeringGenerated':False,
            'ergonomicCertification':False, 'sourceRouting':trace}
