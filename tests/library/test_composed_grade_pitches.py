"""Grade admission and exact pitch parity; these fixtures are not new exercises."""
from fractions import Fraction as F
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'buildscripts/pianist'))
sys.path.insert(0, str(ROOT/'packages/score-formats/python'))
from abc_grade_pitches import PitchContext, degree, PC, small_interval
from converter import convert


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT/'buildscripts/pianist'/(name+'.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


advanced = module('package-advanced-abc')
bank = module('composed-reading-bank')
basic = {g: module(f'package-g{g}-abc') for g in range(1, 5)}


def abc_pitch(midi):
    names = ('C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B')
    name = names[midi % 12]
    octave = midi//12-1
    return name + ','*(4-octave) if octave < 4 else name + "'"*(octave-4)


def spelled_interval(root, steps, semitones):
    written = degree(root)+steps
    octave, index = divmod(written, 7)
    letter = 'CDEFGAB'[index]
    alteration = int(root)+semitones-((octave+1)*12+PC[letter])
    accidental = {0: '=', 1: '^', 2: '^^', -1: '_', -2: '__'}[alteration]
    return accidental+letter+(','*(4-octave) if octave < 4 else "'"*(octave-4))


def oracle(rh, lh, key='C'):
    _, right, bars = advanced.parse_voice(rh, '4/4', 1, key)
    _, left, left_bars = advanced.parse_voice(lh, '4/4', 2, key)
    assert bars == left_bars
    text = f'X:1\nT:Pitch validation fixture\nM:4/4\nL:1/4\nQ:1/4=60\n%%score {{ RH | LH }}\nV:RH clef=treble name="Piano"\nV:LH clef=bass\nK:{key}\n[V:RH] {rh} |]\n[V:LH] {lh} |]\n'
    output = convert(dict(operation='abc-to-xml', text=text, tuneIndex=0))
    assert output['ok'] and not output.get('diagnostics'), output
    events = right + left
    job = dict(scoreId='pitch-fixture', bars=bars, meter='4/4', events=events,
               countRight=sum(e[2] is not None and not e[4] for e in right),
               countLeft=sum(e[2] is not None and not e[4] for e in left))
    job['targetCount'] = job['countRight']+job['countLeft']
    bank.verify_xml(output['text'], job)
    return events


class GradePitchTests(unittest.TestCase):
    def test_signatures_and_measure_accidentals_match_pinned_converter(self):
        for key in ('C', 'G', 'F', 'D', 'Bb', 'E', 'Ab', 'F#', 'Gb', 'Am', 'F#m', 'A#m'):
            with self.subTest(key=key):
                oracle('F F f f | =F F ^F F | F F f f', 'C,4 | C,4 | C,4', key)

    def test_tie_accidental_carry_matches_upstream_including_explicit_override(self):
        for next_note in ('F', '=F', '_F'):
            events = oracle('^F4- | '+next_note+'2 F2', 'C,4 | C,4')
            self.assertEqual([int(e[2]) for e in events if e[3] == 1], [66, 66, 65])

    def test_every_piano_key_is_accepted_in_a_valid_g8_profile_and_matches_converter(self):
        covered = set()
        right_bars, left_bars = [], []
        for target in range(21, 109):
            start = target if target <= 104 else target-4
            a = abc_pitch(start)
            root = PitchContext().decode(a)
            b, c = spelled_interval(root, 1, 2), spelled_interval(root, 2, 4)
            focus = f'[{a}{c}]3/2 {b}/2 {c}2'
            rh, lh, lead = (focus, 'C,4', 'RH') if target >= 60 else ('c4', focus, 'LH')
            result = advanced.validate(8, rh, lh, '4/4', 'dyad-dotted', lead)
            pitches = {int(e[2]) for e in result['events'] if e[2] is not None}
            self.assertIn(target, pitches)
            covered.update(pitches)
            right_bars.append(rh)
            left_bars.append(lh)
        self.assertTrue(set(range(21, 109)) <= covered)
        oracle(' | '.join(right_bars), ' | '.join(left_bars))

    def test_other_grades_accept_signatures_without_losing_their_focus(self):
        basic[1].parse_voice('F G F2', 4, 1, key='G')
        basic[2].validate('D F E2', 'E,4', 4, 'third', 'R', 'RH', key='D')
        basic[3].validate('D A F2', 'D,4', 4, 'arpeggio', 'R', 'RH', key='D')
        basic[4].validate('G A B c', 'G,4', 4, 'upper', 'R', 'RH', key='G', home_range=(62, 69))
        advanced.validate(5, '[EG]2 [FA]2', 'E,4', '4/4', 'dyad', 'RH', key='E')
        advanced.validate(6, 'G F d c', 'D,4', '4/4', 'm6-up', 'RH', key='D')
        advanced.validate(7, 'B3/2 c/2 d2', 'B,4', '4/4', 'dotted', 'RH', key='Bb')
        advanced.validate(8, "b'' c''' b''2", 'C,4', '4/4', 'ledger-high', 'RH')
        advanced.validate(8, 'C4', 'A,,, B,,, A,,,2', '4/4', 'ledger-low', 'LH')

    def test_spelling_and_semitones_both_control_grade(self):
        self.assertEqual(int(PitchContext().decode('^C')), int(PitchContext().decode('_D')))
        self.assertNotEqual(degree(PitchContext().decode('^C')), degree(PitchContext().decode('_D')))
        for body in ('F ^G F2', 'C ^F C2'):
            with self.assertRaisesRegex(AssertionError, 'leap exceeds'):
                basic[1].parse_voice(body, 4, 1)
        with self.assertRaisesRegex(AssertionError, 'chromatic interval requires written'):
            degree(61)

    def test_g2_and_g3_reject_enharmonic_false_interval_witnesses(self):
        examples = [
            (2, '^C _E D2', 'D,4', 'third'),
            (3, 'C ^E D2', 'D,4', 'fourth'),
            (3, '_C ^F E2', 'E,4', 'fifth'),
            (3, '_C ^F _E2', '_E,4', 'arpeggio'),
        ]
        for grade, rh, lh, profile in examples:
            with self.subTest(grade=grade, profile=profile), self.assertRaises(AssertionError):
                basic[grade].validate(rh, lh, 4, profile, 'R', 'RH')
        # Witness functions also reject the same mistakes independently of
        # the parser's grade ceilings.
        for tokens, profile in [(('C', '^E', 'D'), 'fourth'), (('_C', '^F', 'E'), 'fifth'), (('_C', '^F', '_E'), 'arpeggio')]:
            context = PitchContext()
            events = [(i, 1 if i < 2 else 2, context.decode(token), 1) for i, token in enumerate(tokens)]
            self.assertEqual(basic[3].focus_witnesses(events, 4, profile, 1), [])
        for first, second in [('C', '^D'), ('^C', '_E'), ('C', '^E'), ('_C', '^F'), ('__C', 'B,')]:
            self.assertFalse(small_interval(PitchContext().decode(first), PitchContext().decode(second)))
        with self.assertRaisesRegex(AssertionError, 'dyad interval'):
            advanced.validate(5, '[C^D]2 [CE]2', 'C,4', '4/4', 'dyad', 'RH')

    def test_ties_require_upstream_written_identity_not_equal_midi(self):
        invalid = ['E/2 ^C/2- _D F2', "E/2 C'/2- c F2"]
        for rh in invalid:
            with self.subTest(rh=rh), self.assertRaisesRegex(AssertionError, 'upstream note/octave identity'):
                advanced.validate(7, rh, 'F,4', '4/4', 'tie', 'RH')
            # Confirm the rejection comes from pinned upstream's tie identity,
            # not a theory rule invented by the grade validator.
            text = f'X:1\nM:4/4\nL:1/4\nK:C\n{rh} |]\n'
            output = convert(dict(operation='abc-to-xml', text=text, tuneIndex=0))
            self.assertTrue(not output['ok'] or output.get('diagnostics'), output)
            self.assertIn('tie', str(output).lower())

    def test_range_ledger_double_accidental_and_original_rhythm_limits_still_reject(self):
        for note in ('G,,,,', "^c'''", 'C,,,,'):
            with self.assertRaisesRegex(AssertionError, 'outside A0'):
                PitchContext().decode(note)
        with self.assertRaisesRegex(AssertionError, 'ledger reading'):
            basic[1].parse_voice('A,,, B,,, A,,,2', 4, 2)
        with self.assertRaisesRegex(AssertionError, 'double accidental'):
            basic[1].parse_voice('^^F2 ^^F ^^F', 4, 1)
        with self.assertRaisesRegex(AssertionError, 'eighth'):
            basic[1].parse_voice('C/2 D/2 E F G', 4, 1)
        with self.assertRaisesRegex(AssertionError, 'hands cross'):
            basic[2].validate('D F E2', 'D4', 4, 'third', 'R', 'RH', key='D')
        with self.assertRaisesRegex(AssertionError, 'dyad'):
            advanced.validate(5, '[CF]2 [CG]2', 'C,4', '4/4', 'offset', 'RH')


if __name__ == '__main__':
    unittest.main(verbosity=2)
