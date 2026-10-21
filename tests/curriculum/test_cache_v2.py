"""Source membership/metadata must not invalidate the note parser cache."""
import importlib.util
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'buildscripts/pianist'))
spec = importlib.util.spec_from_file_location('cache_q2', ROOT/'buildscripts/pianist/normalize-curriculum.py')
q2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q2)


class CacheIdentityTests(unittest.TestCase):
    def test_membership_and_attribution_are_not_parser_inputs_but_limits_are(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in [*q2.PARSER_FILES, 'scores/curriculum/sources.lock.json']:
                target = root/name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT/name, target)
            manifest = root/'scores/curriculum/sources.lock.json'
            with patch.object(q2, 'ROOT', root):
                first = q2.identity()
                data = json.loads(manifest.read_text(encoding='utf8'))
                data['corpusVersion'] = 'new-release'
                data['assets'].append({'id': 'new-score', 'title': 'New attribution'})
                manifest.write_text(json.dumps(data), encoding='utf8')
                self.assertEqual(q2.identity(), first)
                data['limits']['maxXmlBytes'] += 1
                manifest.write_text(json.dumps(data), encoding='utf8')
                self.assertNotEqual(q2.identity(), first)
                second = q2.identity()
                parser = root/q2.PARSER_FILES[0]
                parser.write_bytes(parser.read_bytes() + b'\n# changed parser\n')
                self.assertNotEqual(q2.identity(), second)

    def test_migration_does_not_relabel_unknown_or_changed_parsers(self):
        with tempfile.TemporaryDirectory() as directory:
            db = q2.open_db(Path(directory))
            with patch.object(q2, 'PARSER_FILES', []):
                with self.assertRaisesRegex(q2.CorpusError, 'migration-parser-changed'):
                    q2.migrate_cache(db, Path(directory), 20000, 45)
            with self.assertRaisesRegex(q2.CorpusError, 'migration-options-mismatch'):
                q2.migrate_cache(db, Path(directory), 10, 45)
            db.close()
