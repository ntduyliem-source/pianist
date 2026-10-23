"""Edition identity and admission checks shared with the web bank publisher."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'buildscripts/pianist'))
import grade_definition as grades
from web_bank_release import verify_web_bank


class GradeDefinitionTests(unittest.TestCase):
    def test_release_rejects_duplicate_score_identity_with_distinct_asset_and_position(self):
        release = 'web-' + 'a' * 20
        files = {}
        def asset(path, value):
            raw = json.dumps(value).encode()
            files['curriculum/' + release + '/' + path] = raw
            return {'path': path, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        entries = []
        for number in range(1, 101):
            raw = str(number).encode()
            digest = hashlib.sha256(raw).hexdigest()
            path = 'exercises/' + digest + '.mxl'
            files['curriculum/' + release + '/' + path] = raw
            entries.append({'id': digest, 'sha256': digest, 'bytes': len(raw), 'path': path,
                'scoreId': f'g1-n4-{number:03d}', 'grades': [1], 'lengthBucket': 'n4',
                'hand': 'both', 'countRight': 2, 'countLeft': 2, 'targetCount': 4,
                'bookPosition': number, 'abcSha256': 'b' * 64, 'sources': [{'license_id': 'AI-composed'}]})
        entries[1]['scoreId'] = entries[0]['scoreId']
        first = asset('indexes/g1-n4.json', {'releaseId': release, 'grade': 1, 'lengthBucket': 'n4', 'entries': entries})
        options = [{'grade': g, 'lengthBucket': b, 'count': 100, 'byHand': {'both': 100, 'left': 0, 'right': 0}}
                   for g in grades.GRADES for b in grades.BUCKETS]
        options[0].update(first)
        index = {'releaseId': release, 'kind': grades.KIND, 'visibility': 'composed',
                 'sourceRelease': 'composed-abc-' + 'b' * 20, 'total': grades.TOTAL,
                 'minimum': grades.QUOTA, 'lengthBuckets': grades.length_buckets(), 'options': options}
        index_asset = asset('index.json', index)
        index_asset['path'] = release + '/index.json'
        files['curriculum/manifest.json'] = json.dumps({'releaseId': release, 'index': index_asset}).encode()
        with self.assertRaisesRegex(ValueError, 'Invalid composed score metadata'):
            verify_web_bank(files.__getitem__, public=True)

    def test_edition_keeps_existing_id_namespace_and_inventory(self):
        self.assertEqual(grades.TOTAL, 5600)
        self.assertEqual(grades.OPTION_COUNT, 56)
        identifiers = [grades.abc_index(g, b, n) for g in grades.GRADES
                       for b in grades.BUCKETS for n in range(1, grades.QUOTA + 1)]
        self.assertEqual(identifiers, list(range(1, 5601)))
        self.assertEqual(grades.abc_index(8, 'n100', 100), 5600)
        for identity, grade, bucket in [('g1-n4-000', 1, 'n4'), ('g1-n4-101', 1, 'n4'),
                                        ('g2-n4-001', 1, 'n4'), ('g1-n6-001', 1, 'n4')]:
            self.assertFalse(grades.score_identity_matches(identity, grade, bucket))
        self.assertTrue(grades.score_identity_matches('g8-n100-100', 8, 'n100'))

    def test_relocation_preserves_logical_provenance(self):
        physical = grades.authored(1) / 'n4.txt'
        self.assertTrue(physical.is_file())
        self.assertEqual(grades.logical_source(physical), 'buildscripts/pianist/compositions/g1/n4.txt')
        with self.assertRaises(ValueError):
            grades.logical_source(ROOT / 'README.md')

    def test_edition_rejects_unversioned_quota_identity_and_path_changes(self):
        for mutate in [lambda d: d.update(exercisesPerOption=101),
                       lambda d: d['grades'].reverse(),
                       lambda d: d['lengthBuckets'].reverse(),
                       lambda d: d['lengthBuckets'][0].update(max=6),
                       lambda d: d['grades'][0].update(validator='package-g2-abc'),
                       lambda d: d['paths'].update(authoredRoot='../outside'),
                       lambda d: d['paths'].update(generatedRoot='C:/outside')]:
            candidate = deepcopy(grades.DEFINITION)
            mutate(candidate)
            with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                grades.validate_definition(candidate)

    def test_release_rejects_partial_quota_or_changed_bounds_before_reading_assets(self):
        index = {'releaseId': 'web-' + 'a' * 20, 'kind': grades.KIND,
                 'visibility': 'composed', 'sourceRelease': 'composed-abc-' + 'b' * 20,
                 'total': grades.TOTAL, 'minimum': grades.QUOTA,
                 'lengthBuckets': grades.length_buckets(),
                 'options': [{'grade': g, 'lengthBucket': b, 'count': grades.QUOTA}
                             for g in grades.GRADES for b in grades.BUCKETS]}
        for mutate in [lambda d: d['options'][0].update(count=99),
                       lambda d: d.update(minimum=99),
                       lambda d: d['lengthBuckets'][0].update(max=6),
                       lambda d: d.update(total=5599)]:
            candidate = deepcopy(index)
            mutate(candidate)
            raw = json.dumps(candidate).encode()
            pointer = json.dumps({'releaseId': candidate['releaseId'], 'index': {
                'path': candidate['releaseId'] + '/index.json', 'bytes': len(raw),
                'sha256': hashlib.sha256(raw).hexdigest()}}).encode()
            files = {'curriculum/manifest.json': pointer,
                     'curriculum/' + candidate['releaseId'] + '/index.json': raw}
            with self.subTest(candidate=candidate), self.assertRaisesRegex(ValueError, 'committed grade edition'):
                verify_web_bank(files.__getitem__, public=True)


if __name__ == '__main__':
    unittest.main()
