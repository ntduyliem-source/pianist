"""Regression checks for G4 register decoding, octave routes and the delivered collection."""
from pathlib import Path
from fractions import Fraction
import importlib.util
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('g4_packaging', Path(__file__).with_name('package-g4-abc.py'))
g4 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g4)

BAD_CASES = {
    'upper has no new register': ('G G G G', 'G,4', 4, 'upper', 'R', 'RH'),
    'upper below declared window': ('F G A B', 'G,4', 4, 'upper', 'R', 'RH'),
    'upper above declared window': ('G A B e', 'G,4', 4, 'upper', 'R', 'RH'),
    'lower has no new register': ('C D E C', 'C,4', 4, 'lower', 'R', 'RH'),
    'lower below declared window': ('G, A, B, C', 'C,4', 4, 'lower', 'R', 'RH'),
    'span misses upper endpoint': ('C E G E', 'C,4', 4, 'span', 'R', 'RH'),
    'span misses lower endpoint': ('E G B c', 'C,4', 4, 'span', 'R', 'RH'),
    'octave leap': ('C c G C', 'C,4', 4, 'span', 'R', 'RH'),
    'sixth leap': ('C A G C', 'C,4', 4, 'span', 'R', 'RH'),
    'tritone jump': ('C F B c', 'C,4', 4, 'span', 'R', 'RH'),
    'leap across rest': ('C z c G', 'C,4', 4, 'span', 'R', 'RH'),
    'leap across bar': ('C G c G | C c G C', 'C,4 | C,4', 4, 'span', 'R', 'RH'),
    'octave extent split by rest': ('C G z c | B A G2', 'C,4 | C,4', 4, 'span', 'R', 'RH'),
    'wrong actual octave': ('c G C2', 'G,4', 4, 'upper', 'R', 'RH'),
    'support leaves familiar region': ('G A B G', 'C4', 4, 'upper', 'R', 'RH'),
    'third in support': ('G A B G', 'G, E, F, G,', 4, 'upper', 'R', 'RH'),
    'same physical key in span': ('C4', 'C, G, C B,', 4, 'span', 'L', 'LH'),
    'hands overlap in upper profile': ('C4', 'G, A, B, C', 4, 'upper', 'L', 'LH'),
    'eighth in focus': ('G/2A/2 B c G', 'G,4', 4, 'upper', 'R', 'RH'),
    'eighth in support': ('G A B G', 'G,/2F,/2 E, F, G,', 4, 'upper', 'R', 'RH'),
    'half note at wrong beat': ('G A2 B', 'G,4', 4, 'upper', 'R', 'RH'),
    'underfilled': ('G A B', 'G,4', 4, 'upper', 'R', 'RH'),
    'overfilled': ('G A B c d', 'G,4', 4, 'upper', 'R', 'RH'),
    'silent support': ('G A B G', 'z4', 4, 'upper', 'R', 'RH'),
    'chord': ('[GA] B c G', 'G,4', 4, 'upper', 'R', 'RH'),
    'accidental': ('G ^A B G', 'G,4', 4, 'upper', 'R', 'RH'),
    'tie': ('G A-B G', 'G,4', 4, 'upper', 'R', 'RH'),
    'dialogue overlap': ('G A B G', 'G, G, G, G,', 4, 'upper', 'A', 'RH'),
    'synchronized time mismatch': ('G A B G', 'G,2 G,2', 4, 'upper', 'S', 'RH'),
    'only one repeated new pitch': ('A A A A', 'G,4', 4, 'upper', 'R', 'RH'),
}


class ValidatorTests(unittest.TestCase):
    def test_abc_octaves_are_actual_pitches(self):
        cases = [('C','',60), ('c','',72), ('G','',67), ('A',',',57), ('A',',,',45), ('C',',',48), ('D','',62), ('d','',74)]
        for letter, marks, expected in cases:
            with self.subTest(letter=letter, marks=marks):
                self.assertEqual(g4.decode_note(letter, marks)[0], expected)

    def test_valid_upper_register(self):
        events, bars, nr, nl = g4.validate('G A B c', 'G,4', 4, 'upper', 'R', 'RH')
        self.assertEqual((bars, nr, nl), (1, 4, 1))
        witness = g4.focus_witnesses(events, 4, 'upper', 1)[0]
        self.assertEqual(witness['midi'], 69)
        self.assertEqual(witness['direction'], 'upper')

    def test_valid_lower_left_hand(self):
        events, _, nr, nl = g4.validate('C3', 'A,, B,, C,', 3, 'lower', 'L', 'LH')
        self.assertEqual((nr, nl), (1, 3))
        self.assertEqual(g4.focus_witnesses(events, 3, 'lower', 2)[0]['midi'], 45)

    def test_octave_range_has_smaller_steps(self):
        events, _, nr, nl = g4.validate('C G c', 'C,3', 3, 'span', 'R', 'RH')
        self.assertEqual((nr, nl), (3, 1))
        witness = g4.focus_witnesses(events, 3, 'span', 1)[0]
        self.assertEqual(witness['midiRoute'], [60, 67, 72])
        self.assertEqual(witness['highestMidi']-witness['lowestMidi'], 12)
        self.assertEqual(events[1][0], Fraction(1))

    def test_invalid_music_is_rejected(self):
        self.assertEqual(len(BAD_CASES), 30)
        for label, args in BAD_CASES.items():
            with self.subTest(label=label), self.assertRaises((AssertionError, ValueError)):
                g4.validate(*args)

    def test_inventory_and_books(self):
        rows = g4.read_scores()
        report = json.loads((g4.OUTPUT/'validation.json').read_text(encoding='utf-8'))
        self.assertEqual(len(rows), 700)
        self.assertTrue(report['complete'] and report['individualAndBookVerified'])
        self.assertEqual(report['converterChecks'], 1400)
        self.assertEqual(report['adjacentRelatedPatternsInBooks'], [])
        identifiers = []
        for group in g4.BUCKETS:
            subset = [r for r in rows if r['group'] == group]
            book = (g4.OUTPUT/'books'/f'g4-{group}.abc').read_text(encoding='utf-8')
            pieces = [p for p in re.split(r'(?m)(?=^%abc-2\.1$)', book) if p.strip()]
            self.assertEqual(len(pieces), 100)
            self.assertEqual(pieces, [g4.abc(r)+'\n' if i < 99 else g4.abc(r) for i, r in enumerate(g4.reading_order(subset))])
            for row in subset:
                text = (g4.OUTPUT/group/(row['id']+'.abc')).read_text(encoding='utf-8')
                self.assertEqual(text, g4.abc(row))
                self.assertTrue(row['witnesses'])
                identifiers += re.findall(r'(?m)^X:(\d+)$', text)
        self.assertEqual(sorted(map(int, identifiers)), list(range(2101, 2801)))

    def test_no_duplicates_with_g1_g2_g3(self):
        old = {g4.fingerprint(r['events']) for r in g4.g1.read_scores()}
        for grade in ('g2','g3'):
            spec_old = importlib.util.spec_from_file_location(grade+'_packaging_for_check', Path(__file__).with_name('package-'+grade+'-abc.py'))
            module = importlib.util.module_from_spec(spec_old)
            spec_old.loader.exec_module(module)
            old.update(g4.fingerprint(r['events']) for r in module.read_scores())
        current = {r['contentHash'] for r in g4.read_scores()}
        self.assertEqual(len(old), 2100)
        self.assertEqual(len(current), 700)
        self.assertTrue(old.isdisjoint(current))


if __name__ == '__main__':
    unittest.main(verbosity=2)
