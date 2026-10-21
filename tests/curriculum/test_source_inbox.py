from contextlib import closing
from pathlib import Path
import importlib.util
import sqlite3
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'buildscripts/pianist'))
from curriculum_bank import mxl_bytes
from curriculum_normalize import digest
from fixtures_q2 import score, note

spec = importlib.util.spec_from_file_location('inbox_cli', ROOT/'buildscripts/pianist/import-piano-sources.py')
cli = importlib.util.module_from_spec(spec); spec.loader.exec_module(cli)


class SourceInboxTests(unittest.TestCase):
    def test_only_piano_two_staff_is_added_once_and_tombstones_are_respected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); inbox = root/'inbox'; corpus = root/'corpus'
            inbox.mkdir(); corpus.mkdir()
            body = note(duration=4, kind='whole')+'<backup><duration>4</duration></backup>'+note('C', 3, 4, staff=2, voice='5', kind='whole')
            piano = mxl_bytes(score([body], staves=2))
            one = mxl_bytes(score([note(duration=4, kind='whole')]))
            flute = mxl_bytes(score([body], staves=2).replace(b'Piano', b'Flute'))
            for name, data in [('piano.mxl', piano), ('one.mxl', one), ('flute.mxl', flute)]:
                (inbox/name).write_bytes(data)
            (inbox/'not-a-zip.mxl').write_bytes(score([body], staves=2))
            result = cli.ingest(inbox, corpus)
            self.assertEqual(result['outcomes'], {'not-admitted': 3, 'added': 1})
            self.assertEqual(cli.ingest(inbox, corpus)['outcomes'], {'not-admitted': 3, 'reused': 1})
            self.assertEqual((inbox/'piano.mxl').read_bytes(), piano)
            with closing(sqlite3.connect(corpus/'catalog.sqlite')) as db, db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM review_queue').fetchone()[0], 1)
                db.execute('CREATE TABLE user_removed_sources(sha256 TEXT PRIMARY KEY)')
                db.execute('INSERT INTO user_removed_sources VALUES(?)', (digest(piano),))
            self.assertEqual(cli.ingest(inbox, corpus)['outcomes']['excluded-by-user'], 1)


if __name__ == '__main__': unittest.main()
