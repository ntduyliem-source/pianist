"""Regression checks for the G3 music validator and delivered ABC collection."""
from pathlib import Path
from fractions import Fraction
import importlib.util
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('g3_packaging', Path(__file__).with_name('package-g3-abc.py'))
g3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g3)

BAD_CASES = {
    'no fourth': ('C E D C', 'C,4', 4, 'fourth', 'R', 'RH'),
    'fifth in fourth profile': ('C G F E', 'C,4', 4, 'fourth', 'R', 'RH'),
    'no fifth': ('C F E C', 'C,4', 4, 'fifth', 'R', 'RH'),
    'fourth across rest only': ('C z F E', 'C,4', 4, 'fourth', 'R', 'RH'),
    'fourth across bar only': ('C2 C2 | F2 E2', 'C,4 | C,4', 4, 'fourth', 'R', 'RH'),
    'arpeggio has only thirds': ('C E G E', 'C,4', 4, 'arpeggio', 'R', 'RH'),
    'arpeggio misses third chord tone': ('C G C C', 'C,4', 4, 'arpeggio', 'R', 'RH'),
    'arpeggio leaves C triad': ('C G E D', 'C,4', 4, 'arpeggio', 'R', 'RH'),
    'arpeggio across bar only': ('C E | G C', 'C,2 | C,2', 2, 'arpeggio', 'R', 'RH'),
    'third in support': ('C F E C', 'C, E, D, C,', 4, 'fourth', 'R', 'RH'),
    'fourth in support': ('C F E C', 'C, F, E, D,', 4, 'fourth', 'R', 'RH'),
    'eighth in focus': ('C/2F/2 E D C', 'C,4', 4, 'fourth', 'R', 'RH'),
    'eighth in support': ('C F E D', 'C,/2D,/2 E, D, C,', 4, 'fourth', 'R', 'RH'),
    'half note at wrong beat': ('C F2 E', 'C,4', 4, 'fourth', 'R', 'RH'),
    'underfilled': ('C F E', 'C,4', 4, 'fourth', 'R', 'RH'),
    'overfilled': ('C F E D C', 'C,4', 4, 'fourth', 'R', 'RH'),
    'wrong octave': ('C, F E C', 'C,4', 4, 'fourth', 'R', 'RH'),
    'out of five-note region': ('C F E A', 'C,4', 4, 'fourth', 'R', 'RH'),
    'silent hand': ('C F E C', 'z4', 4, 'fourth', 'R', 'RH'),
    'chord': ('[CF] E D C', 'C,4', 4, 'fourth', 'R', 'RH'),
    'accidental': ('C ^F E C', 'C,4', 4, 'fourth', 'R', 'RH'),
    'tie': ('C F-E C', 'C,4', 4, 'fourth', 'R', 'RH'),
    'dialogue overlap': ('C F E C', 'C, D, C, C,', 4, 'fourth', 'A', 'RH'),
    'synchronized time mismatch': ('C F E C', 'C,2 C,2', 4, 'fourth', 'S', 'RH'),
}


class ValidatorTests(unittest.TestCase):
    def test_valid_fourth_with_stepwise_support(self):
        events, bars, nr, nl = g3.validate('C F E2', 'C, D, E,2', 4, 'fourth', 'S', 'RH')
        self.assertEqual((bars, nr, nl), (1, 3, 3))
        self.assertEqual(g3.focus_witnesses(events, 4, 'fourth', 1)[0]['semitones'], 5)

    def test_valid_fifth_melody(self):
        events, _, nr, nl = g3.validate('C G F E', 'C,4', 4, 'fifth', 'R', 'RH')
        self.assertEqual((nr, nl), (4, 1))
        self.assertEqual(g3.focus_witnesses(events, 4, 'fifth', 1)[0]['semitones'], 7)

    def test_valid_arpeggio_has_specific_triad_and_fifth(self):
        events, _, nr, nl = g3.validate('C2 G E', 'C,4', 4, 'arpeggio', 'R', 'RH')
        self.assertEqual((nr, nl), (3, 1))
        self.assertEqual(events[1][:2], (Fraction(2), Fraction(1)))
        witness = g3.focus_witnesses(events, 4, 'arpeggio', 1)[0]
        self.assertEqual(witness['midi'], [60, 67, 64])
        self.assertEqual(witness['harmony'], 'C-major')

    def test_invalid_music_is_rejected(self):
        self.assertEqual(len(BAD_CASES), 24)
        for label, args in BAD_CASES.items():
            with self.subTest(label=label), self.assertRaises((AssertionError, ValueError)):
                g3.validate(*args)

    def test_inventory_and_books(self):
        rows = g3.read_scores()
        report = json.loads((g3.OUTPUT/'validation.json').read_text(encoding='utf-8'))
        self.assertEqual(len(rows), 700)
        self.assertTrue(report['complete'] and report['individualAndBookVerified'])
        self.assertEqual(report['converterChecks'], 1400)
        self.assertEqual(report['adjacentRelatedPatternsInBooks'], [])
        identifiers = []
        for group in g3.BUCKETS:
            subset = [r for r in rows if r['group'] == group]
            book = (g3.OUTPUT/'books'/f'g3-{group}.abc').read_text(encoding='utf-8')
            pieces = [p for p in re.split(r'(?m)(?=^%abc-2\.1$)', book) if p.strip()]
            self.assertEqual(len(pieces), 100)
            self.assertEqual(pieces, [g3.abc(r)+'\n' if i < 99 else g3.abc(r) for i, r in enumerate(g3.reading_order(subset))])
            for row in subset:
                text = (g3.OUTPUT/group/(row['id']+'.abc')).read_text(encoding='utf-8')
                self.assertEqual(text, g3.abc(row))
                self.assertTrue(row['witnesses'])
                identifiers += re.findall(r'(?m)^X:(\d+)$', text)
        self.assertEqual(sorted(map(int, identifiers)), list(range(1401, 2101)))

    def test_no_duplicates_with_g1_or_g2(self):
        spec2 = importlib.util.spec_from_file_location('g2_packaging_for_check', Path(__file__).with_name('package-g2-abc.py'))
        g2 = importlib.util.module_from_spec(spec2)
        spec2.loader.exec_module(g2)
        old = {g3.fingerprint(r['events']) for r in g3.g1.read_scores()}
        old.update(g3.fingerprint(r['events']) for r in g2.read_scores())
        current = {r['contentHash'] for r in g3.read_scores()}
        self.assertEqual(len(old), 1400)
        self.assertEqual(len(current), 700)
        self.assertTrue(old.isdisjoint(current))


if __name__ == '__main__':
    unittest.main(verbosity=2)
