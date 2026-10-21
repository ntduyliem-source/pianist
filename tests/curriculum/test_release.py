from pathlib import Path
from unittest.mock import patch
import gzip
import json
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'buildscripts/pianist'))
from curriculum_release import combine, read_bank, verify_package, copy_verified, BUCKET_IDS
from curriculum_normalize import digest, encoded
from curriculum_io import CorpusError, write_json


def entry(id_='a', sha='one', grade=1):
    return {'id': id_, 'sha256': sha, 'grades': [grade], 'profiles': ['g1-direction-quarters'],
            'hand': 'right', 'targetCount': 4, 'lengthBucket': 'n4', 'motifGroupId': id_}


class ReleaseTests(unittest.TestCase):
    def test_duplicate_sources_do_not_fill_quota_or_add_unverified_grades(self):
        a = entry(); b = {**a, 'sha256': 'other serialization', 'profiles': [], 'grades': [2]}
        chosen, coverage, duplicates = combine([
            {'path': Path('base'), 'entries': [a]}, {'path': Path('supplement'), 'entries': [b]}], target=1)
        self.assertEqual(len(chosen), 1)
        self.assertEqual(chosen['a']['entry'], a)
        self.assertEqual(coverage['verifiedUniqueByOption']['1']['n4'], 1)
        self.assertEqual(coverage['verifiedUniqueByOption']['2']['n4'], 0)
        self.assertEqual(coverage['optionsAtMinimum'], 1)
        self.assertEqual(sum(len(row) for row in coverage['remainingByOption'].values()), 56)
        self.assertFalse(coverage['targetMet'])
        self.assertFalse(duplicates[0]['sameBytes'])

    def test_same_id_cannot_mean_different_hand_or_length(self):
        with self.assertRaisesRegex(CorpusError, 'inconsistent-content-id'):
            combine([{'path': Path('a'), 'entries': [entry()]},
                     {'path': Path('b'), 'entries': [{**entry(), 'hand': 'left'}]}])
        with self.assertRaisesRegex(CorpusError, 'conflicting-content-ids'):
            combine([{'path': Path('a'), 'entries': [entry('a'), entry('b')]}])

    def test_source_checkpoint_must_account_for_every_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory); (out/'exercises').mkdir(); (out/'scans').mkdir()
            payload = {'key': 'key', 'sourceSha256': 'source', 'analysisSha256': 'analysis',
                       'stats': {}, 'candidates': [{'id': 'missing', 'selection': {
                           'sourceSha256': 'source', 'analysisSha256': 'analysis'}}]}
            (out/'scans/key.json.gz').write_bytes(gzip.compress(encoded({
                'payload': payload, 'sha256': digest(encoded(payload).encode())}).encode()))
            db = sqlite3.connect(out/'bank.sqlite')
            db.executescript('CREATE TABLE exercises(id,entry); CREATE TABLE sources(sha,status,report); CREATE TABLE origins(id,source_sha,selection);')
            report = {'scanKey': 'key', 'scanStats': {}, 'exports': {}}
            db.execute('INSERT INTO sources VALUES(?,?,?)', ('source', 'complete', encoded(report)))
            db.commit(); db.close()
            write_json(out/'catalog.json', {'pipeline': 'fixture', 'entries': []})
            with patch('curriculum_release.auditor.audit', return_value={'passed': True, 'pipeline': 'fixture'}):
                with self.assertRaisesRegex(CorpusError, 'unaccounted-source-candidates'):
                    read_bank(out)
            db = sqlite3.connect(out/'bank.sqlite')
            report['exports'] = {'accepted': 1}
            db.execute('UPDATE sources SET report=?', (encoded(report),)); db.commit(); db.close()
            with patch('curriculum_release.auditor.audit', return_value={'passed': True, 'pipeline': 'fixture'}):
                with self.assertRaisesRegex(CorpusError, 'accepted-candidate-missing'):
                    read_bank(out)

    def fixture(self, out):
        e = {**entry(), 'path': 'exercises/a.mxl', 'sha256': digest(b'fixture'), 'bytes': 7}
        (out/'exercises').mkdir(); (out/'exercises/a.mxl').write_bytes(b'fixture')
        options = []
        for grade in range(1, 9):
            for bucket in BUCKET_IDS:
                ids = ['a'] if (grade, bucket) == (1, 'n4') else []
                path = f'indexes/g{grade}/{bucket}.json'
                options.append({'grade': grade, 'lengthBucket': bucket, 'path': path, 'count': len(ids)})
                write_json(out/path, {'ids': ids, 'byHand': {'right': ids, 'left': [], 'both': []}})
        write_json(out/'catalog.json', {'entries': [e], 'options': options})
        files = {p.relative_to(out).as_posix(): {'sha256': digest(p.read_bytes()), 'bytes': p.stat().st_size}
                 for p in out.rglob('*') if p.is_file()}
        write_json(out/'manifest.json', {'files': files})

    def test_package_detects_damage_missing_files_and_bad_indexes(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory); self.fixture(out)
            self.assertEqual(verify_package(out)['exercises'], 1)
            (out/'exercises/a.mxl').write_bytes(b'broken')
            with self.assertRaisesRegex(CorpusError, 'package-file-hash'):
                verify_package(out)
            (out/'exercises/a.mxl').write_bytes(b'fixture')
            index = out/'indexes/g1/n4.json'; write_json(index, {'ids': ['ghost']})
            manifest = json.loads((out/'manifest.json').read_text())
            manifest['files']['indexes/g1/n4.json'] = {'sha256': digest(index.read_bytes()), 'bytes': index.stat().st_size}
            write_json(out/'manifest.json', manifest)
            with self.assertRaisesRegex(CorpusError, 'package-option-index'):
                verify_package(out)

    def test_resume_never_overwrites_a_changed_deliverable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root/'source.mxl'; target = root/'package/a.mxl'
            source.write_bytes(b'score'); hash_ = digest(b'score')
            copy_verified(source, target, hash_); before = target.stat().st_mtime_ns
            copy_verified(source, target, hash_)
            self.assertEqual(before, target.stat().st_mtime_ns)
            target.write_bytes(b'manual change')
            with self.assertRaisesRegex(CorpusError, 'immutable-package-file-changed'):
                copy_verified(source, target, hash_)


if __name__ == '__main__': unittest.main()
