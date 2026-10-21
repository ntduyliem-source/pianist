"""Semantic regressions for the music21 observer; native oracle is q2-native.cjs."""
from copy import deepcopy
from fractions import Fraction
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'buildscripts/pianist'))
from curriculum_normalize import normalize, piano_xml, as_fraction, source_tree, CorpusError
from fixtures_q2 import fixtures, score, note, direction


class NormalizeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = fixtures()
        cls.results = {name: normalize(data) for name, data in cls.fixtures.items()}

    def test_spelling_not_semitone_bucket(self):
        r = self.results['spelled-intervals']
        self.assertEqual([(i['diatonic'], i['semitones'], i['name']) for i in r['melodicRelations']],
                         [(2, 1, 'm2'), (1, 1, 'A1'), (2, 1, 'm2')])
        self.assertEqual(r['events'][4]['pitch']['step'], 'C')
        self.assertEqual(r['events'][7]['pitch']['step'], 'D')

    def test_accidentals_and_bar_reset(self):
        r = self.results['accidental-bars']
        self.assertEqual([e['pitch']['midi'] for e in r['events'] if e['kind'] == 'note'], [66,66,65,65,66,67,66])
        self.assertEqual(r['events'][2]['notation']['accidental'], 'natural')
        self.assertEqual(r['contexts'][1]['value']['fifths'], 1)

    def test_rational_not_rounded(self):
        nn = self.results['rational-triplet']['events'][:3]
        self.assertEqual([as_fraction(n['onset']) for n in nn], [0,Fraction(1,3),Fraction(2,3)])
        self.assertEqual([as_fraction(n['duration']) for n in nn], [Fraction(1,3)]*3)

    def test_voices_forward_and_chronology(self):
        r = self.results['backup-forward-voices']
        self.assertEqual([(e['pitch']['midi'],as_fraction(e['onset'])) for e in r['events']], [(60,0),(55,0),(64,2),(57,2)])
        self.assertEqual(len(r['lines']), 2)
        self.assertTrue(all(line['hand'] is None for line in r['lines'].values()))
        self.assertTrue(all(i['lineId'] in r['lines'] for i in r['melodicRelations']))

    def test_unequal_chord_preserved_but_blocked(self):
        r = self.results['unequal-chord']
        self.assertEqual([as_fraction(e['duration']) for e in r['events']], [2,1,2])
        self.assertIn('unequal-chord-duration', r['releaseBlockers'])
        self.assertEqual(r['events'][0]['chordId'],r['events'][1]['chordId'])
        self.assertEqual(r['melodicRelations'], [])

    def test_tie_boundary_is_not_safe(self):
        r = self.results['tie-unison']
        cut = next(c for c in r['cutCandidates'] if as_fraction(c['at'])==4)
        self.assertFalse(cut['structurallyClear'])
        self.assertEqual(cut['crossingTies'], ['p0:m1:n0'])
        self.assertEqual(next(e for e in r['events'] if e['id']=='p0:m1:n0')['tieFrom'],'p0:m0:n0')

    def test_clef_changes_and_default_number(self):
        r = self.results['clef-changes']
        clefs = [c for c in r['contexts'] if c['kind']=='clef']
        self.assertEqual([(as_fraction(c['at']),c['staff'],c['value']['sign']) for c in clefs],
                         [(0,1,'G'),(0,2,'F'),(4,1,'F'),(4,2,'G')])

    def test_ottava_keeps_sounding_and_written_pitch(self):
        r = self.results['ottava']
        self.assertEqual([e['pitch']['midi'] for e in r['events']], [84,86,72,71])
        self.assertEqual([e['writtenPitch']['midi'] for e in r['events']], [72,74,72,71])
        self.assertEqual([d['attributes']['type'] for d in r['directions']], ['down','stop'])

    def test_pedal_offsets_and_change(self):
        r = self.results['pedal-offsets']
        self.assertEqual([(as_fraction(p['start']),as_fraction(p['end'])) for p in r['pedals']], [(0,Fraction(1,2)),(Fraction(1,2),3)])
        raw = score([direction('pedal','type="start" line="yes"')+note(duration=4,kind='whole'),
                     note('D',duration=4,kind='whole')+direction('pedal','type="stop" line="yes"')])
        cut = next(c for c in normalize(raw)['cutCandidates'] if as_fraction(c['at'])==4)
        self.assertEqual(cut['crossingPedals'],[0])
        self.assertFalse(cut['structurallyClear'])

    def test_bad_structures_do_not_pass_silently(self):
        for fixture,code in [('negative-backup','invalid-backup'),('unclosed-tie','unclosed-tie'),('unsupported-grace','unsupported-grace')]:
            with self.subTest(fixture=fixture):
                self.assertIn(code,self.results[fixture]['releaseBlockers'])
        unknown = score([note(duration=4,kind='whole',extra='<notations><other-notation>unknown</other-notation></notations>')])
        self.assertIn('unsupported-notation:other-notation',normalize(unknown)['releaseBlockers'])

    def test_reject_entities_and_limits_before_music21(self):
        with self.assertRaises(Exception):
            source_tree(b'<!DOCTYPE foo [<!ENTITY x "123">]><score-partwise>&x;</score-partwise>')
        with self.assertRaisesRegex(CorpusError,'normalization-note-limit'):
            normalize(self.fixtures['spelled-intervals'],max_notes=1)

    def test_deterministic_and_original_unchanged(self):
        raw = self.fixtures['tie-unison']
        before = bytes(raw)
        self.assertEqual(self.results['tie-unison'], normalize(raw))
        self.assertEqual(before,raw)
        self.assertEqual(self.results['tie-unison']['nativeVerification']['status'],'pending')

    def test_instrument_program_alone_is_not_piano(self):
        raw = self.fixtures['spelled-intervals'].replace(b'<part-name>Piano</part-name>',b'<part-name>Violin</part-name>')
        with self.assertRaisesRegex(CorpusError,'piano-not-explicit'):
            normalize(raw)

    def test_multi_part_selects_piano_only_preserving_ids(self):
        from xml.etree import ElementTree as ET
        raw = self.fixtures['spelled-intervals']
        root = source_tree(raw)
        definition = deepcopy(root.find('./part-list/score-part'));definition.set('id','S1')
        definition.find('part-name').text='Soprano'
        root.find('part-list').insert(0,definition)
        part = deepcopy(root.find('part'));part.set('id','S1');root.insert(-1,part)
        xml,decisions = piano_xml(ET.tostring(root))
        self.assertEqual([p.get('id') for p in source_tree(xml).findall('part')],['P1'])
        self.assertEqual(len(decisions),2)

    def test_rest_and_tempo_retained(self):
        raw = score(['<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>72</per-minute></metronome></direction-type></direction>'+note(None,duration=2,kind='half')+note(duration=2,kind='half')])
        r=normalize(raw)
        self.assertEqual(r['events'][0]['kind'],'rest')
        self.assertEqual(r['tempos'][0]['quarterBpm'],72)


if __name__ == '__main__':
    unittest.main()
