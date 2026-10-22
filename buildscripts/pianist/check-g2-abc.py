"""Regression checks for the G2 validator and the delivered ABC collection."""
from pathlib import Path
from fractions import Fraction
import importlib.util
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('g2_packaging', Path(__file__).with_name('package-g2-abc.py'))
g2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g2)


class ValidatorTests(unittest.TestCase):
    def test_valid_third_with_support_steps(self):
        events, bars, nr, nl = g2.validate('C E D C', 'C, D, C, C,', 4, 'third', 'S', 'RH')
        self.assertEqual((bars, nr, nl), (1, 4, 4))

    def test_valid_eighth_pairs_exact_fractions(self):
        events, _, nr, nl = g2.validate('C/2D/2 E D C', 'C,4', 4, 'eighth', 'R', 'RH')
        self.assertEqual((nr, nl), (5, 1))
        self.assertEqual(events[1][:2], (Fraction(1, 2), Fraction(1, 2)))

    def test_invalid_music_is_rejected(self):
        cases = {
            'third missing': ('C D E D', 'C,4', 4, 'third', 'R', 'RH'),
            'step missing': ('C E G E', 'C,4', 4, 'third', 'R', 'RH'),
            'fourth': ('C F E D', 'C,4', 4, 'third', 'R', 'RH'),
            'leap across rest': ('C z G E', 'C,4', 4, 'third', 'R', 'RH'),
            'new interval in support': ('C E D C', 'C, E, D, C,', 4, 'third', 'R', 'RH'),
            'mixed new skills': ('C/2E/2 D C C', 'C,4', 4, 'third', 'R', 'RH'),
            'third in eighth profile': ('C/2E/2 D C C', 'C,4', 4, 'eighth', 'R', 'RH'),
            'no pair': ('C D E D', 'C,4', 4, 'eighth', 'R', 'RH'),
            'unpaired eighth': ('C/2 D E/2 C2', 'C,4', 4, 'eighth', 'R', 'RH'),
            'offbeat pair': ('C/2D/2E/2 F G/2 C', 'C,4', 4, 'eighth', 'R', 'RH'),
            'new rhythm in support': ('C/2D/2 E D C', 'C,/2D,/2 E, D, C,', 4, 'eighth', 'R', 'RH'),
            'eighth rest': ('C/2D/2 z/2 E/2 C2', 'C,4', 4, 'eighth', 'R', 'RH'),
            'half across strong beat': ('C E2 D', 'C,4', 4, 'third', 'R', 'RH'),
            'underfilled': ('C E D', 'C,4', 4, 'third', 'R', 'RH'),
            'overfilled': ('C E D C C', 'C,4', 4, 'third', 'R', 'RH'),
            'wrong octave': ('C, E D C', 'C,4', 4, 'third', 'R', 'RH'),
            'silent hand': ('C E D C', 'z4', 4, 'third', 'R', 'RH'),
            'chord': ('[CE] D C C', 'C,4', 4, 'third', 'R', 'RH'),
            'accidental': ('C ^E D C', 'C,4', 4, 'third', 'R', 'RH'),
            'tie': ('C E-D C', 'C,4', 4, 'third', 'R', 'RH'),
            'dialogue overlap': ('C E D C', 'C, D, C, C,', 4, 'third', 'A', 'RH'),
            'synchronized timing mismatch': ('C E D C', 'C,2 C,2', 4, 'third', 'S', 'RH'),
        }
        for label, args in cases.items():
            with self.subTest(label=label), self.assertRaises((AssertionError, ValueError)):
                g2.validate(*args)

    def test_inventory_and_books(self):
        rows = g2.read_scores()
        report = json.loads((g2.OUTPUT/'validation.json').read_text(encoding='utf-8'))
        self.assertEqual(len(rows), 700)
        self.assertTrue(report['complete'] and report['individualAndBookVerified'])
        self.assertEqual(report['converterChecks'], 1400)
        self.assertEqual(report['adjacentRelatedPatternsInBooks'], [])
        identifiers = []
        for group in g2.BUCKETS:
            subset = [r for r in rows if r['group'] == group]
            book = (g2.OUTPUT/'books'/f'g2-{group}.abc').read_text(encoding='utf-8')
            pieces = re.split(r'(?m)(?=^%abc-2\.1$)', book)
            pieces = [p for p in pieces if p.strip()]
            self.assertEqual(len(pieces), 100)
            self.assertEqual(pieces, [g2.abc(r)+'\n' if i < 99 else g2.abc(r) for i, r in enumerate(g2.reading_order(subset))])
            for row in subset:
                text = (g2.OUTPUT/group/(row['id']+'.abc')).read_text(encoding='utf-8')
                self.assertEqual(text, g2.abc(row))
                identifiers += re.findall(r'(?m)^X:(\d+)$', text)
        self.assertEqual(sorted(map(int, identifiers)), list(range(701, 1401)))

    def test_no_duplicate_with_g1(self):
        old = {g2.fingerprint(r['events']) for r in g2.g1.read_scores()}
        current = {r['contentHash'] for r in g2.read_scores()}
        self.assertTrue(old.isdisjoint(current))


if __name__ == '__main__':
    unittest.main(verbosity=2)
