import ast
from copy import deepcopy
from fractions import Fraction
import json
import unittest

from fixtures_grades import make, CONFIG
from fixtures_q2 import score, note
from curriculum_evidence import (builder, VENDOR, optimizer_input, Hand, fingering,
                                 VERSION, routing)
from curriculum_grades import assess_profile, selection_digest, rhythm_check
from curriculum_selection import make_selection, bounds, integrity, events, verified_scan
from curriculum_io import CorpusError
from curriculum_normalize import digest, encoded, normalize
from curriculum_fragments import SourceIndex
from curriculum_auto import scan, check_profiles
from curriculum_grades import assess_all


class EvidenceTests(unittest.TestCase):
    def test_pianoplayer_original_files_and_routing_body_hashes(self):
        meta = json.loads((VENDOR / 'UPSTREAM.json').read_text())
        for row in meta['files']:
            self.assertEqual(digest((VENDOR / row['path']).read_bytes()), row['sha256'], row['path'])
        source = (VENDOR / 'routing.py').read_text(encoding='utf8')
        node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef))
        body = ''.join(source.splitlines(keepends=True)[node.lineno-1:node.end_lineno])
        self.assertEqual(digest(body.encode()), meta['routing']['bodySha256'])

    def test_machine_pass_is_reproducible_not_human_review_or_speed_claim(self):
        i, s, p, _, _ = make('g1-direction-quarters')
        proof = builder(i).for_profile(s, p, CONFIG)
        self.assertNotIn('reviewer', proof)
        self.assertFalse(proof['humanReviewed'])
        self.assertEqual(proof['producer'], VERSION)
        r = assess_profile(i, s, p, proof, CONFIG)
        self.assertEqual(r['status'], 'pass', r)
        self.assertEqual(r['evidenceKind'], 'machine')
        self.assertFalse(r['bpm']['learnerSpeedValidated'])
        self.assertEqual((r['bpm']['min'], r['bpm']['max']), (60, 60))
        for changed in ('producerSha256', 'selectionSha256', 'profileId', 'configSha256'):
            bad = deepcopy(proof); bad[changed] = 'forged'
            self.assertIn('evidence-binding', assess_profile(i, s, p, bad, CONFIG)['reviewRules'])
        bad = deepcopy(proof); next(iter(bad['claims']['handPath'].values()))['finger'] = 5
        self.assertIn('evidence-binding', assess_profile(i, s, p, bad, CONFIG)['reviewRules'])

    def test_batch_memoization_cannot_checkpoint_mutated_analysis(self):
        i, s, p, _, _ = make('g1-direction-quarters')
        with self.assertRaisesRegex(CorpusError, 'analysis-mutated-during-scan'):
            with verified_scan(i, s['analysisSha256']):
                i.a['events'][0]['pitch']['alter'] = 1
        self.assertFalse(hasattr(i, '_verified_scan_analysis'))
        self.assertFalse(hasattr(i, '_grade_context_cache'))
        self.assertFalse(hasattr(i, '_grade_rhythm_cache'))

    def test_scan_caches_preserve_every_profile_verdict_and_witness(self):
        for p in CONFIG['profiles']:
            i, s, p, proof, _ = make(p['id'])
            direct = assess_profile(i, s, p, proof, CONFIG)
            with verified_scan(i, s['analysisSha256']):
                first = assess_profile(i, s, p, proof, CONFIG)
                second = assess_profile(i, s, p, proof, CONFIG)
            self.assertEqual(direct, first, p['id'])
            self.assertEqual(direct, second, p['id'])

    def test_context_prechecks_match_all_original_grade_results(self):
        _, _, _, _, raw = make('g1-direction-quarters')
        variants = [raw.replace(b'<beat-type>4</beat-type>', b'<beat-type>2</beat-type>'),
                    raw.replace(b'<fifths>0</fifths>', b'<fifths>2</fifths>')]
        for source in variants:
            i, s, _, _, _ = make('g1-direction-quarters', source)
            direct = assess_all(i, s, config=CONFIG)
            quick = check_profiles(i, s, CONFIG, builder(i))
            self.assertEqual([r['status'] for r in direct], [r['status'] for r in quick])
            self.assertTrue(all(r['status']=='fail' for r in quick))
            self.assertEqual(builder(i).line_suggestion.cache_info().misses, 0)

    def test_optimizer_geometry_rejects_an_unhandled_octave_enharmonic(self):
        raw = score([note('B', extra='<accidental>sharp</accidental>').replace('<step>B</step>', '<step>B</step><alter>1</alter>') +
                     note('D') + note('E') + note('D')])
        i, s, _, _, _ = make('g1-direction-quarters', raw)
        _, _, errors = optimizer_input(i, events(i, s))
        self.assertEqual(errors, ['unsupported-optimizer-key-spelling'])

    def test_adapter_fingers_match_direct_original_solver_for_both_hands(self):
        for side in ('left', 'right'):
            for pid in ('g1-direction-quarters', 'g2-third-known-rhythm', 'g7-tie', 'g7-compound'):
                i, s, _, _, _ = make(pid); ee = events(i, s)
                inputs, chains, errors = optimizer_input(i, ee)
                self.assertFalse(errors)
                h = Hand(inputs, side=side, size='M'); h.verbose = False
                h.generate(start_measure=1, nmeasures=s['endMeasure'])
                _, _, trace = fingering(i, ee, side)
                self.assertEqual([n.fingering for n in inputs], [n['finger'] for n in trace['notes']])
                self.assertEqual(chains, [n['eventIds'] for n in trace['notes']])

    def test_ties_merge_duration_and_anchors_without_retrigger(self):
        i, s, p, _, raw = make('g7-tie')
        inputs, chains, errors = optimizer_input(i, events(i, s))
        self.assertFalse(errors)
        self.assertEqual(len(inputs), 4)
        self.assertEqual(chains[1], ['p0:m0:n1', 'p0:m0:n2'])
        self.assertEqual(inputs[1].duration, 1.5)
        raw = raw.replace(b'<tie type="stop"/>', b'<tie type="stop"/><notations><technical><fingering>3</fingering></technical></notations>')
        i, s, p, _, _ = make('g7-tie', raw)
        proof = builder(i).for_profile(s, p, CONFIG)
        self.assertEqual(proof['claims']['handPath']['p0:m0:n1']['finger'], 3)
        self.assertEqual(proof['claims']['handPath']['p0:m0:n2']['finger'], 3)

    def test_overlapping_excerpts_reuse_original_full_line_solver(self):
        raw = score([''.join(note(s) for s in 'CDED'), ''.join(note(s) for s in 'EDCD')])
        i, s, p, _, _ = make('g1-direction-quarters', raw)
        b = builder(i)
        whole = b.for_profile(s, p, CONFIG)
        piece = make_selection(i, s['analysisSha256'], s['lineHands'], Fraction(2), Fraction(6))
        selected = b.for_profile(piece, p, CONFIG)
        self.assertEqual(b.line_suggestion.cache_info().misses, 1)
        full_notes = {eid: row['finger'] for row in whole['trace']['fingering']['P1:s1:v1']['notes'] for eid in row['eventIds']}
        short_notes = {eid: row['finger'] for row in selected['trace']['fingering']['P1:s1:v1']['notes'] for eid in row['eventIds']}
        self.assertEqual(short_notes, {k: full_notes[k] for k in short_notes})

    def test_complex_fingering_shift_and_harmonic_context_remain_review(self):
        for pid, reason in [('g4-position-shift', 'hand-path-evidence'),
                            ('g3-arpeggio-fourth-fifth', 'musical-group-context'),
                            ('g8-register', 'register-reading-evidence')]:
            i, s, p, _, _ = make(pid)
            r = assess_profile(i, s, p, builder(i).for_profile(s, p, CONFIG), CONFIG)
            self.assertIn(reason, r['reviewRules'], r)
        i, s, p, _, raw = make('g1-direction-quarters')
        raw = raw.replace(b'</note>', b'<notations><technical><fingering alternate="yes">2</fingering></technical></notations></note>', 1)
        i, s, p, _, _ = make('g1-direction-quarters', raw)
        proof = builder(i).for_profile(s, p, CONFIG)
        self.assertFalse(proof['claims']['handPath'])
        self.assertIn('complex-source-fingering', next(iter(proof['trace']['fingering'].values()))['reasons'])

    def test_omitted_same_hand_voice_does_not_pass_by_auto_routing(self):
        melody = ''.join(note(s) for s in 'CDED')
        extra = '<backup><duration>4</duration></backup>' + note('G', duration=4, kind='whole', voice='2')
        raw = score([melody + extra])
        i, s, p, _, _ = make('g1-direction-quarters', raw)
        s['lineHands'] = {'P1:s1:v1': 'right'}
        proof = builder(i).for_profile(s, p, CONFIG)
        r = assess_profile(i, s, p, proof, CONFIG)
        self.assertIn('source-hand-completeness', r['failureRules'])

    def test_unwritten_tonality_has_trace_and_model_disagreement_is_unresolved(self):
        i, s, p, _, raw = make('g1-direction-quarters')
        raw = raw.replace(b'<mode>major</mode>', b'')
        i, s, p, _, _ = make('g1-direction-quarters', raw)
        proof = builder(i).for_profile(s, p, CONFIG)
        trace = next(iter(proof['trace']['tonality'].values()))
        self.assertEqual(len(trace['estimates']), 2)
        self.assertFalse(trace['certaintyClaim'])
        # Explicit minor always takes precedence over a model's preferred key.
        raw = raw.replace(b'<fifths>0</fifths>', b'<fifths>0</fifths><mode>minor</mode>')
        i, s, p, _, _ = make('g1-direction-quarters', raw)
        r = assess_profile(i, s, p, builder(i).for_profile(s, p, CONFIG), CONFIG)
        self.assertIn('major-tonality', r['failureRules'])

    def test_exact_span_is_bound_and_no_note_rest_tie_or_slur_is_cut(self):
        raw = score([note('C') + note('D') + note('E', duration=2, kind='half')])
        a = normalize(raw); i = SourceIndex(a, raw); sha = digest(encoded(a).encode())
        s = make_selection(i, sha, {'P1:s1:v1': 'right'}, Fraction(1), Fraction(4))
        self.assertEqual(bounds(i, s), (1, 4))
        self.assertEqual([e['id'] for e in events(i, s)], ['p0:m0:n1', 'p0:m0:n2'])
        bad = deepcopy(s); bad['endQuarter'] = {'numerator': 3, 'denominator': 1}
        self.assertIn('cut-held-note', integrity(i, bad))
        self.assertNotEqual(selection_digest(s), selection_digest(bad))
        raw = score([note('C', extra='<notations><slur type="start" number="1"/></notations>') + note('D') +
                     note('E', extra='<notations><slur type="stop" number="1"/></notations>') + note('F')])
        a = normalize(raw); i = SourceIndex(a, raw)
        s = make_selection(i, digest(encoded(a).encode()), {'P1:s1:v1': 'right'}, Fraction(1), Fraction(4))
        self.assertTrue(any('slur' in r for r in integrity(i, s)))

    def test_partial_span_keeps_original_beat_phase(self):
        i, s, _, _, _ = make('g7-syncopation')
        self.assertTrue(rhythm_check(i, 'P1:s1:v1', 0, 2, 'R6', (Fraction(3), Fraction(8)))['passed'])
        # Starting at the long note cuts away the first eighth of the cell.
        self.assertFalse(rhythm_check(i, 'P1:s1:v1', 1, 2, 'R6', (Fraction(9, 2), Fraction(8)))['passed'])

    def test_scan_keeps_midbar_proposals_and_does_not_publish_model_boundaries(self):
        i, s, _, _, _ = make('g1-direction-quarters')
        payload = scan(i, s['analysisSha256'], CONFIG, 120)
        self.assertTrue(any(c['contentPassedProfiles'] for c in payload['candidates']))
        for c in payload['candidates']:
            self.assertFalse(c['approvedForPractice'])
            if c['boundaryStatus'] == 'model-proposal-needs-context':
                self.assertEqual(c['readyForNativeProfiles'], [])
        self.assertEqual(payload['publishedExercises'], 0)

    def test_complete_line_after_whole_bar_silence_can_reach_native_queue(self):
        raw = score([note(None, duration=4, kind='whole'), ''.join(note(s) for s in 'CDED')])
        raw = raw.replace(b'<fifths>0</fifths>', b'<fifths>0</fifths><mode>major</mode>')
        i, s, _, _, _ = make('g1-direction-quarters', raw)
        payload = scan(i, s['analysisSha256'], CONFIG, 120)
        match = next(c for c in payload['candidates'] if c['selection']['startMeasure']==1 and
                     c['selection']['startQuarter']['numerator']==4 and c['selection']['endQuarter']['numerator']==8)
        self.assertEqual(match['boundaryStatus'], 'complete-source-lines-structurally-intact')
        self.assertIn('g1-direction-quarters', match['readyForNativeProfiles'])
        self.assertFalse(match['approvedForPractice'])


if __name__ == '__main__':
    unittest.main()
