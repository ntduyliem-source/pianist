from contextlib import closing
from pathlib import Path
import importlib.util
import json
import sqlite3
import sys
import tempfile
import unittest
import zlib
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'buildscripts/pianist'))
spec = importlib.util.spec_from_file_location('complete_k_cli', ROOT/'buildscripts/pianist/complete-curriculum-bank.py')
cli = importlib.util.module_from_spec(spec); spec.loader.exec_module(cli)


class CompletionTests(unittest.TestCase):
    def test_resume_only_imports_new_changed_or_corrupt_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pipeline = cli.digest(f'{cli.q2.identity()}:20000:45'.encode())
            good = cli.encoded({'sourceSha256': 'good'}).encode()
            with closing(sqlite3.connect(root/'normalization.sqlite')) as db, db:
                db.execute('CREATE TABLE analyses(source_sha,pipeline,status,blob,analysis_sha)')
                db.executemany('INSERT INTO analyses VALUES(?,?,?,?,?)', [
                    ('good', pipeline, 'normalized', zlib.compress(good), cli.digest(good)),
                    ('corrupt', pipeline, 'normalized', b'broken', 'wrong'),
                    ('known-limit', pipeline, 'rejected', None, None)])
            jobs = [{'sha': s} for s in ('good', 'corrupt', 'known-limit', 'new')]
            with patch.object(cli.q2, 'jobs', return_value=jobs):
                self.assertEqual(cli.pending_normalization(root, root), ['corrupt', 'new'])
                self.assertEqual(cli.pending_normalization(root, root, True), ['corrupt', 'known-limit', 'new'])

    def test_newly_available_source_can_resume_without_touching_exercises(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); bank = root/'bank'; normal = root/'normal'
            bank.mkdir(); normal.mkdir()
            pipeline = cli.digest(f'{cli.q2.identity()}:20000:45'.encode())
            with closing(sqlite3.connect(normal/'normalization.sqlite')) as db, db:
                db.execute('CREATE TABLE analyses(source_sha,pipeline,status)')
                db.executemany('INSERT INTO analyses VALUES(?,?,?)', [
                    ('newly-valid', pipeline, 'normalized'), ('done', pipeline, 'normalized'),
                    ('wrong-parser', 'stale', 'normalized')])
            with closing(sqlite3.connect(bank/'bank.sqlite')) as db, db:
                db.executescript('CREATE TABLE sources(sha,status,report); CREATE TABLE exercises(id,bytes);')
                db.executemany('INSERT INTO sources VALUES(?,?,?)', [
                    ('newly-valid', 'normalization-unavailable', '{}'),
                    ('done', 'complete', '{"keep":"proof"}'),
                    ('wrong-parser', 'normalization-unavailable', '{}')])
                db.execute('INSERT INTO exercises VALUES(?,?)', ('protected', b'existing exercise'))
            self.assertEqual(cli.reopen_available(bank, normal), 1)
            self.assertEqual(cli.reopen_available(bank, normal), 0)
            with closing(sqlite3.connect(bank/'bank.sqlite')) as db:
                states = dict(db.execute('SELECT sha,status FROM sources'))
                self.assertEqual(states, {'newly-valid': 'retry-needed', 'done': 'complete', 'wrong-parser': 'normalization-unavailable'})
                self.assertEqual(db.execute('SELECT * FROM exercises').fetchall(), [('protected', b'existing exercise')])
                self.assertEqual(db.execute("SELECT report FROM sources WHERE sha='done'").fetchone()[0], '{"keep":"proof"}')


if __name__ == '__main__': unittest.main()
