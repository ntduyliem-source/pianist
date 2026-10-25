"""Release guarantees for curriculum assets independent of the practice engine."""
import copy
import hashlib
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'buildscripts/pianist'))
import methods_release


def score(staves=2):
    xml = f'''<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
    <part id="P1"><measure number="1"><attributes><staves>{staves}</staves></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
    <notations><technical><fingering>1</fingering></technical></notations></note></measure></part></score-partwise>'''
    result = BytesIO()
    with zipfile.ZipFile(result, 'w') as archive:
        archive.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>')
        archive.writestr('score.xml', xml)
    return result.getvalue()


class CuratedMethodsTest(unittest.TestCase):
    def test_every_curated_lesson_matches_its_bytes_staff_structure_and_source(self):
        self.assertTrue((ROOT / 'scores/methods/catalog.json').is_file())
        inventory = methods_release.verify_methods(lambda name: (ROOT / 'scores' / name).read_bytes())
        self.assertGreater(inventory['books'], 0)
        self.assertGreater(inventory['lessons'], 0)


class MethodReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'scores/methods/catalog.json'
        self.source.parent.mkdir(parents=True)
        self.data = score()
        self.lesson = {'id': 'exercise-01', 'number': 1, 'title': 'Exercise 1',
                       'file': 'methods/example-book/exercise-01.mxl',
                       'sha256': hashlib.sha256(self.data).hexdigest(), 'bytes': len(self.data),
                       'sourceUrl': 'https://example.org/source.mxl', 'license': 'CC0-1.0', 'fingeringCount': 1}
        self.catalog = {'schemaVersion': 1, 'books': [{'id': 'example-book', 'title': 'Example book',
                        'composer': 'Example composer', 'description': 'Original test fixture', 'opus': None,
                        'expectedLessons': 3, 'lessons': [self.lesson]}]}
        self.assets = {}
        self.addCleanup(patch.stopall)
        patch.object(methods_release, 'ROOT', self.root).start()

    def save(self):
        data = json.dumps(self.catalog).encode()
        self.source.write_bytes(data)
        self.assets['methods/catalog.json'] = data
        self.assets[self.lesson['file']] = self.data

    def verify(self, paths=None):
        self.save()
        return methods_release.verify_methods(self.assets.__getitem__, self.assets if paths is None else paths)

    def test_partial_volume_keeps_printed_numbers_and_original_fingering(self):
        # A partial download is honest about the full book; do not renumber it.
        self.lesson['number'] = 3
        self.assertEqual(self.verify(), {'books': 1, 'lessons': 1,
                         'paths': ['methods/catalog.json', self.lesson['file']]})

    def test_hash_valid_one_staff_score_is_rejected(self):
        self.data = score(staves=1)
        self.lesson.update(sha256=hashlib.sha256(self.data).hexdigest(), bytes=len(self.data))
        with self.assertRaisesRegex(ValueError, 'exactly two piano staves'):
            self.verify()

    def test_changed_bytes_or_wrong_finger_count_cannot_be_published(self):
        self.lesson['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'integrity failed'):
            self.verify()
        self.lesson['sha256'] = hashlib.sha256(self.data).hexdigest()
        self.lesson['fingeringCount'] = 2
        with self.assertRaisesRegex(ValueError, 'fingering count'):
            self.verify()

    def test_missing_and_unlisted_pending_assets_are_rejected(self):
        self.save()
        for paths in ({'methods/catalog.json'}, set(self.assets) | {'methods/pending/unknown.mxl'}):
            with self.subTest(paths=paths), self.assertRaisesRegex(ValueError, 'Missing or unexpected'):
                self.verify(paths)

    def test_source_identity_and_unsafe_path_are_rejected(self):
        self.lesson['file'] = 'methods/../example-book/exercise-01.mxl'
        with self.assertRaisesRegex(ValueError, 'Unsafe or duplicate method lesson path'):
            self.verify()

    def test_duplicate_printed_number_cannot_silently_replace_an_exercise(self):
        other = copy.deepcopy(self.lesson)
        other.update(id='exercise-02', file='methods/example-book/exercise-02.mxl')
        self.catalog['books'][0]['lessons'].append(other)
        with self.assertRaisesRegex(ValueError, 'lesson identity/order'):
            self.verify()

    def test_pending_rights_cannot_be_mislabeled_as_a_public_source(self):
        self.lesson['license'] = 'pending'
        with self.assertRaisesRegex(ValueError, 'Unreviewed'):
            self.verify()
        self.lesson['license'] = 'LicenseRef-WhiteNote-Public-Use'
        self.lesson['sourceUrl'] = 'https://www.white-note.com/library/test.zip'
        with self.assertRaisesRegex(ValueError, 'public-use statement'):
            self.verify()
        self.catalog['books'][0]['sourceRights'] = 'https://www.white-note.com/app/languages/english/library.html'
        self.assertEqual(self.verify()['lessons'], 1)

    def test_bundle_catalog_must_match_curated_source(self):
        self.save()
        different = copy.deepcopy(self.catalog)
        different['books'][0]['title'] = 'Another edition'
        self.assets['methods/catalog.json'] = json.dumps(different).encode()
        with self.assertRaisesRegex(ValueError, 'differs from the curated source'):
            methods_release.verify_methods(self.assets.__getitem__, self.assets)

    def test_source_notice_is_included_and_cannot_be_removed(self):
        notice = b'Original fixture by Example composer. CC0-1.0.'
        (self.source.parent / 'NOTICE.txt').write_bytes(notice)
        self.assets['methods/NOTICE.txt'] = notice
        self.assertIn('methods/NOTICE.txt', self.verify()['paths'])
        self.assets['methods/NOTICE.txt'] = b'Changed attribution'
        with self.assertRaisesRegex(ValueError, 'source notice differs'):
            self.verify()


if __name__ == '__main__':
    unittest.main()
