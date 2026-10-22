"""Conversion boundary checks for the composed two-staff bank, not grading."""
from fractions import Fraction as F
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('composed_reading_bank', ROOT/'buildscripts/pianist/composed-reading-bank.py')
bank = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bank)


def fixture(right='C D E F', left='C,4', meter='4/4'):
    advanced = bank.load_module('package-advanced-abc')
    _, rh, bars = advanced.parse_voice(right, meter, 1)
    _, lh, left_bars = advanced.parse_voice(left, meter, 2)
    assert bars == left_bars
    text = f'''%abc-2.1
X:1
T:two-staff-test
C:Nhạc do trợ lý AI biên soạn
M:{meter}
L:1/4
Q:{'3/8' if meter == '6/8' else '1/4'}=60
%%score {{ RH | LH }}
V:RH clef=treble name="Piano"
V:LH clef=bass
K:C
[V:RH] {right} |]
[V:LH] {left} |]
'''
    nr, nl = [sum(e[2] is not None and not e[4] for e in events) for events in (rh, lh)]
    return {'scoreId': 'g7-n4-001', 'grade': 7, 'lengthBucket': 'n4', 'bookPosition': 1,
            'title': 'Two staves', 'text': text, 'abcSha256': bank.sha(text.encode()),
            'events': rh+lh, 'bars': bars, 'meter': meter, 'targetCount': nr+nl,
            'countRight': nr, 'countLeft': nl, 'motifGroupId': 'f'*64,
            'sourceId': 'g7-study-001', 'profiles': ['test']}


def unpack(path):
    with zipfile.ZipFile(path) as archive:
        return archive.read('score.musicxml').decode()


class ComposedBankTests(unittest.TestCase):
    def test_conversion_keeps_both_hands_and_caches_same_asset(self):
        with tempfile.TemporaryDirectory() as folder:
            job = fixture()
            row, path, cached = bank.convert_one(job, folder)
            self.assertFalse(cached)
            self.assertEqual(row['hand'], 'both')
            self.assertEqual((row['targetCount'], row['countRight'], row['countLeft']), (5, 4, 1))
            self.assertEqual(row['id'], bank.sha(Path(path).read_bytes()))
            self.assertEqual(row['path'], 'exercises/'+row['id']+'.mxl')
            self.assertEqual(row['beatQuarter'], [1])
            self.assertEqual(bank.convert_one(job, folder), (row, path, True))
            with zipfile.ZipFile(path) as archive:
                for entry in archive.infolist():
                    self.assertEqual(entry.date_time, (1980, 1, 1, 0, 0, 0))

    def test_compound_tempo_is_dotted_quarter_60_and_playback_90(self):
        with tempfile.TemporaryDirectory() as folder:
            job = fixture('C3/2 D3/2', 'C,3', '6/8')
            row, path, _ = bank.convert_one(job, folder)
            score = ET.fromstring(unpack(path))
            self.assertEqual(row['beatQuarter'], [1.5])
            self.assertIsNotNone(score.find('.//beat-unit-dot'))
            self.assertEqual(F(score.find('.//sound').attrib['tempo']), F(90))
            score.find('.//sound').set('tempo', '60')
            with self.assertRaisesRegex(ValueError, 'playback tempo'):
                bank.verify_xml(ET.tostring(score), job)

    def test_ties_and_chords_are_compared_and_attacks_not_tie_ends(self):
        with tempfile.TemporaryDirectory() as folder:
            tied = fixture('C/2 D/2- D2 E', 'C,4')
            row, path, _ = bank.convert_one(tied, folder)
            self.assertEqual(row['targetCount'], 4)
            score = ET.fromstring(unpack(path))
            note = score.find('.//note/tie/..')
            note.remove(note.find('tie'))
            with self.assertRaisesRegex(ValueError, 'conversion changed'):
                bank.verify_xml(ET.tostring(score), tied)
            chord = fixture('[CE]2 [DF]2', 'C,4')
            row, path, _ = bank.convert_one(chord, folder)
            self.assertEqual(row['targetCount'], 5)
            self.assertEqual(len(ET.fromstring(unpack(path)).findall('.//chord')), 2)

    def test_changed_pitch_onset_duration_and_staff_fail_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            job = fixture()
            _, path, _ = bank.convert_one(job, folder)
            for element, value in [('pitch/step', 'G'), ('duration', '12'), ('staff', '2')]:
                score = ET.fromstring(unpack(path))
                score.find('.//note/'+element).text = value
                with self.subTest(element=element), self.assertRaises(ValueError):
                    bank.verify_xml(ET.tostring(score), job)
            changed = dict(job, countRight=3)
            with self.assertRaisesRegex(ValueError, 'attack counts'):
                bank.verify_xml(unpack(path), changed)

    def test_missing_real_staff_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            job = fixture()
            _, path, _ = bank.convert_one(job, folder)
            score = ET.fromstring(unpack(path))
            score.find('.//staves').text = '1'
            with self.assertRaisesRegex(ValueError, 'two real staves'):
                bank.verify_xml(ET.tostring(score), job)

    def test_cache_is_revalidated_not_trusted(self):
        with tempfile.TemporaryDirectory() as folder:
            job = fixture()
            _, path, _ = bank.convert_one(job, folder)
            score = ET.fromstring(unpack(path))
            score.find('.//note/pitch/step').text = 'G'
            Path(path).write_bytes(bank.mxl_bytes(ET.tostring(score, encoding='unicode')))
            with self.assertRaisesRegex(ValueError, 'conversion changed'):
                bank.convert_one(job, folder)

    def test_encoding_date_does_not_change_deterministic_archive(self):
        first = '<score-partwise><identification><encoding><encoding-date>2026-10-22</encoding-date></encoding></identification></score-partwise>'
        second = first.replace('2026-10-22', '2027-01-01')
        self.assertEqual(bank.mxl_bytes(first), bank.mxl_bytes(second))
        with zipfile.ZipFile(io.BytesIO(bank.mxl_bytes(first))) as archive:
            self.assertNotIn(b'encoding-date', archive.read('score.musicxml'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
