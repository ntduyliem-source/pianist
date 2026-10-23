"""Regression and delivery checks for the composed ABC banks G5--G8.

Run after the four packagers and the cumulative ZIP have completed.
Checks are independent of the source files' claimed counts and grade labels.
"""
from pathlib import Path
from fractions import Fraction as F
from collections import Counter
import importlib.util
import json
import re
import unittest
import zipfile

from grade_definition import GENERATED_ROOT, generated

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('advanced_abc', Path(__file__).with_name('package-advanced-abc.py'))
bank = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bank)
CACHE = {}


def rows(grade):
    if grade not in CACHE:
        CACHE[grade] = bank.read_scores(grade)
    return CACHE[grade]


def pick(grade, profile, group='n4', lead='RH'):
    return next(r for r in rows(grade) if (r['profile'], r['group'], r['lead']) == (profile, group, lead))


def converter(row, text=None):
    return bank.check_converter((row['id'], bank.abc(row) if text is None else text, 0, row['events'], row['bars'], row['meter']))


class NotationTests(unittest.TestCase):
    def test_actual_abc_octaves(self):
        for token, pitch in [('C,,,', 24), ('G,,,', 31), ('C,', 48), ('C', 60), ('c', 72), ("c'", 84), ("g'", 91)]:
            self.assertEqual(bank.decode(token), pitch)

    def test_dyad_attacks_are_per_key(self):
        result = bank.validate(5, '[CE]2 G2', 'C,2 G,2', '4/4', 'dyad', 'RH')
        self.assertEqual((result['count'], result['right'], result['left']), (5, 3, 2))
        self.assertEqual(len(bank.sounding(result['events'])), 5)

    def test_tie_continuation_is_not_an_attack(self):
        result = bank.validate(7, 'C D/2 E/2-E2', 'C,4', '4/4', 'tie', 'RH')
        self.assertEqual((result['count'], len(result['events'])), (4, 5))
        self.assertIn((F(3, 2), F(5, 2), 64, 1), bank.sounding(result['events']))

    def test_equivalent_tie_spelling_has_same_sounding_notes(self):
        _, tied, _ = bank.parse_voice('C2-C2', '4/4', 1)
        _, long, _ = bank.parse_voice('C4', '4/4', 1)
        self.assertEqual(bank.sounding(tied), bank.sounding(long))

    def test_chord_members_share_one_onset(self):
        _, events, _ = bank.parse_voice('[CE]2 G2', '4/4', 1)
        self.assertEqual([e[0] for e in events], [F(0), F(0), F(2)])

    def test_compound_meter_duration_and_tempo(self):
        result = bank.validate(7, 'C D/2 E3/2', 'C,3', '6/8', 'compound', 'RH')
        self.assertEqual((result['bars'], result['duration'], result['seconds']), (1, 3, 2))
        self.assertIn('Q:3/8=60', bank.abc(pick(7, 'compound')))

    def test_parser_rejects_broken_ties_and_chords(self):
        for source in ('C2-D2', 'C2-C2-', 'z2-z2', '[CEG]4', '[CC]4', 'C3', 'C4 D', '^^^C4', 'C,\'4'):
            with self.subTest(source=source), self.assertRaises((AssertionError, ValueError)):
                bank.parse_voice(source, '4/4', 1)

    def test_valid_accidental_is_preserved_by_the_88_key_parser(self):
        _, events, _ = bank.parse_voice('^C4', '4/4', 1)
        self.assertEqual([(event[2], event[1]) for event in events], [(61, F(4))])

    def test_crossbar_tie_survives_converter(self):
        rh, lh = 'C2 D E- | E2 D C', 'C,4 | C,4'
        _, revents, _ = bank.parse_voice(rh, '4/4', 1)
        _, levents, _ = bank.parse_voice(lh, '4/4', 2)
        text = '%abc-2.1\nX:1\nT:Cross bar tie regression\nM:4/4\nL:1/4\nQ:1/4=60\n%%score { RH | LH }\nV:RH clef=treble name="Piano"\nV:LH clef=bass\nK:C\n[V:RH] '+rh+' |]\n[V:LH] '+lh+' |]\n'
        self.assertEqual(bank.check_converter(('crossbar', text, 0, revents+levents, 2, '4/4')), 'crossbar')

    def test_converter_catches_changed_pitch(self):
        row = pick(5, 'dyad')
        text = bank.abc(row).replace('[CE]2', '[CG]2', 1)
        with self.assertRaisesRegex(AssertionError, 'XML changed'):
            converter(row, text)

    def test_converter_catches_dropped_chord_pitch(self):
        row = pick(5, 'dyad')
        text = bank.abc(row).replace('[CE]2', 'C2', 1)
        with self.assertRaisesRegex(AssertionError, 'XML changed'):
            converter(row, text)

    def test_converter_catches_tie_reattack(self):
        row = pick(7, 'tie')
        text = bank.abc(row).replace('E/2-E2', 'E/2 E2', 1)
        with self.assertRaisesRegex(AssertionError, 'XML changed'):
            converter(row, text)

    def test_converter_rejects_wrong_compound_beat_unit(self):
        row = pick(7, 'compound')
        text = bank.abc(row).replace('Q:3/8=60', 'Q:1/4=60')
        with self.assertRaisesRegex(AssertionError, 'compound tempo'):
            converter(row, text)


class GradeTests(unittest.TestCase):
    def test_g5_independence_is_more_than_one_held_note(self):
        bad = [('C2 E2', 'C,4'), ('C E z z', 'z z C, G,'), ('C2 E2', 'C,2 E,2')]
        for rh, lh in bad:
            with self.subTest(rh=rh, lh=lh), self.assertRaises(AssertionError):
                bank.validate(5, rh, lh, '4/4', 'offset', 'RH')

    def test_g5_rejects_new_rhythm_or_unlabelled_chord(self):
        cases = [('C3/2 D/2 E2', 'C,4', 'dyad'),
                 ('[CE]2 G2', 'C,4', 'offset'),
                 ('[CE]/2 D E/2 G2', 'C,4', 'dyad')]
        for rh, lh, profile in cases:
            with self.subTest(rh=rh), self.assertRaises(AssertionError):
                bank.validate(5, rh, lh, '4/4', profile, 'RH')

    def test_g6_requires_approach_departure_and_correct_interval(self):
        cases = [('C A G2', 'M6-up'), ('D C A2', 'M6-up'), ('B c E F', 'm6-up'),
                 ('D C c B', 'M6-up'), ('F E c B | C D E F', 'm6-up')]
        for rh, profile in cases:
            lh = ' | '.join(['C,4']*len(rh.split('|')))
            with self.subTest(rh=rh, profile=profile), self.assertRaises(AssertionError):
                bank.validate(6, rh, lh, '4/4', profile, 'RH')

    def test_g6_witnesses_cover_every_family_and_direction(self):
        for profile in bank.TARGETS[6]:
            for hand in ('RH', 'LH'):
                row = pick(6, profile, lead=hand)
                self.assertTrue(row['witnesses'])
                for w in row['witnesses']:
                    self.assertEqual(w['family']+'-'+w['direction'], profile)
                    self.assertEqual(len(w['midiRoute']), 4)

    def test_rhythm_profiles_use_actual_beat_placement(self):
        cases = [('C/2 D3/2 E2', 'C,4', '4/4', 'dotted'),
                 ('C/2-C/2 D E2', 'C,4', '4/4', 'tie'),
                 ('C D E2', 'C,4', '4/4', 'sync'),
                 ('C D E', 'C,3', '6/8', 'compound'),
                 ('C D/2 E3/2', 'C,3', '6/8', 'dotted'),
                 ('C D/2 E/2-E2', 'C,4', '4/4', 'dotted')]
        for rh, lh, meter, profile in cases:
            with self.subTest(rh=rh, profile=profile), self.assertRaises(AssertionError):
                bank.validate(7, rh, lh, meter, profile, 'RH')

    def test_support_does_not_add_another_rhythm_problem(self):
        with self.assertRaisesRegex(AssertionError, 'independent attacks'):
            bank.validate(7, 'C3/2 D/2 E2', 'C, z G, z', '4/4', 'dotted', 'RH')

    def test_g8_ledger_range_is_actual_octave(self):
        with self.assertRaisesRegex(AssertionError, 'missing written ledger-line focus'):
            bank.validate(8, 'C D E2', 'C,4', '4/4', 'ledger-high', 'RH')
        result = bank.validate(8, "c' d' e'2", 'C,4', '4/4', 'ledger-high', 'RH')
        self.assertEqual(result['witnesses'][0]['observedMidi'], [84, 86, 88])
        result = bank.validate(8, 'C4', 'C,,, D,,, E,,,2', '4/4', 'ledger-low', 'LH')
        self.assertEqual(result['witnesses'][0]['observedMidi'], [24, 26, 28])

    def test_g8_combinations_need_both_features(self):
        for rh, profile in [('C3/2 D/2 E2', 'dyad-dotted'), ('[CE]2 G2', 'dyad-dotted'),
                            ('C D/2 E/2-E2', 'dyad-tie'), ('[CE]2 G2', 'dyad-tie')]:
            with self.subTest(rh=rh, profile=profile), self.assertRaises(AssertionError):
                bank.validate(8, rh, 'C,4', '4/4', profile, 'RH')

    def test_rejects_silent_hand_or_shared_keyboard_region(self):
        for rh, lh in [('C D E2', 'z4'), ('C D E2', 'C4')]:
            with self.subTest(rh=rh, lh=lh), self.assertRaises(AssertionError):
                bank.validate(5, rh, lh, '4/4', 'offset', 'RH')


class DeliveryTests(unittest.TestCase):
    def test_quotas_profiles_witnesses_and_attacks(self):
        for grade in range(5, 9):
            rr = rows(grade)
            self.assertEqual(len(rr), 700)
            for group, (low, high) in bank.BUCKETS.items():
                subset = [r for r in rr if r['group'] == group]
                self.assertEqual(len(subset), 100)
                self.assertEqual(Counter(r['profile'] for r in subset), bank.TARGETS[grade])
                self.assertEqual(Counter(r['lead'] for r in subset), {'RH': 50, 'LH': 50})
                for r in subset:
                    self.assertTrue(low <= len(bank.sounding(r['events'])) <= high)
                    self.assertEqual(len(bank.sounding(r['events'])), r['count'])
                    self.assertTrue(r['witnesses'])
                    if grade == 8 and r['profile'].startswith('dyad-'):
                        self.assertEqual(len(r['witnesses']), 2)

    def test_files_books_ids_and_validation_reports(self):
        identifiers = []
        for grade in range(5, 9):
            output = generated(grade)
            report = json.loads((output/'validation.json').read_text(encoding='utf-8'))
            self.assertEqual(report['total'], 700)
            self.assertTrue(report['complete'] and report['individualAndBookVerified'])
            self.assertEqual(report['converterChecks'], 1400)
            self.assertEqual(report['adjacentRelatedPatternsInBooks'], [])
            self.assertEqual(len(report['pieces']), 700)
            self.assertEqual(len(list(output.glob('n*/*.abc'))), 700)
            self.assertEqual(len((output/'index.tsv').read_text(encoding='utf-8').splitlines()), 701)
            for group in bank.BUCKETS:
                subset = [r for r in rows(grade) if r['group'] == group]
                ordered = bank.reading_order(subset)
                book = (output/'books'/f'g{grade}-{group}.abc').read_text(encoding='utf-8')
                self.assertEqual(book, '\n'.join(bank.abc(r) for r in ordered))
                self.assertEqual(len(re.findall(r'(?m)^X:', book)), 100)
                for row in subset:
                    text = (output/group/(row['id']+'.abc')).read_text(encoding='utf-8')
                    self.assertEqual(text, bank.abc(row))
                    identifiers += map(int, re.findall(r'(?m)^X:(\d+)$', text))
        self.assertEqual(sorted(identifiers), list(range(2801, 5601)))

    def test_no_exact_musical_duplicates_across_all_eight_grades(self):
        seen = {}
        for grade in range(1, 9):
            if grade < 5:
                spec_old = importlib.util.spec_from_file_location(f'g{grade}_for_advanced_audit', Path(__file__).with_name(f'package-g{grade}-abc.py'))
                module = importlib.util.module_from_spec(spec_old)
                spec_old.loader.exec_module(module)
                rr = module.read_scores()
            else:
                rr = rows(grade)
            for row in rr:
                events = [tuple(e)+(False, False) for e in row['events']] if grade < 5 else row['events']
                duration = max(a+d for a, d, *_ in events)
                digest = bank.fingerprint(events, duration)
                self.assertNotIn(digest, seen, (row['id'], seen.get(digest)))
                seen[digest] = row['id']
        self.assertEqual(len(seen), 5600)

    def test_grade_zip_crc_members_and_exact_bytes(self):
        for grade in range(5, 9):
            output = generated(grade)
            expected = {p.relative_to(output.parent).as_posix(): p for p in output.rglob('*') if p.is_file()}
            with zipfile.ZipFile(output.parent/f'g{grade}-abc-700.zip') as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(len(archive.namelist()), len(set(archive.namelist())))
                self.assertEqual(set(archive.namelist()), set(expected))
                self.assertEqual(len(expected), 710)
                for name, path in expected.items():
                    data = archive.read(name)
                    self.assertEqual(data, path.read_bytes())
                    data.decode('utf-8')

    def test_cumulative_zip_contains_all_5600_studies(self):
        output = GENERATED_ROOT
        expected = {'README.md': output/'G1_G8_ABC_GUIDE.md'}
        for grade in range(1, 9):
            for path in (output/f'g{grade}-abc').rglob('*'):
                if path.is_file():
                    expected[path.relative_to(output).as_posix()] = path
        with zipfile.ZipFile(output/'pianist-g1-g8-5600-abc.zip') as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(set(archive.namelist()), set(expected))
            self.assertEqual(len(archive.namelist()), len(expected))
            self.assertEqual(sum(bool(re.fullmatch(r'g[1-8]-abc/n\d+/g[1-8]-n\d+-\d{3}\.abc', name)) for name in archive.namelist()), 5600)
            for name, path in expected.items():
                self.assertEqual(archive.read(name), path.read_bytes())


if __name__ == '__main__':
    unittest.main(verbosity=2)
