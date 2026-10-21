"""Q3 cache/provenance isolation against small original scores; no downloads."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import zlib

from fixtures_q3 import fixtures

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'buildscripts/pianist'))
from curriculum_normalize import normalize,encoded,digest
spec=importlib.util.spec_from_file_location('q3cli',ROOT/'buildscripts/pianist/fragment-curriculum.py')
cli=importlib.util.module_from_spec(spec);spec.loader.exec_module(cli)


class FragmentCliTests(unittest.TestCase):
    def test_current_inputs_provenance_cache_corruption_and_resume(self):
        base=ROOT/'artifacts/curriculum-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as directory:
            root=Path(directory);corpus=root/'corpus';normalized=root/'normalized';out=root/'out'
            corpus.mkdir();normalized.mkdir()
            raw=fixtures()['g1-steps'];sha=digest(raw);(corpus/'source.musicxml').write_bytes(raw)
            db=sqlite3.connect(corpus/'catalog.sqlite')
            db.execute('CREATE TABLE files(sha256,path,container_status,bytes)')
            db.execute('INSERT INTO files VALUES(?,?,?,?)',(sha,'source.musicxml','valid',len(raw)))
            db.execute('CREATE TABLE origins(id,collection,revision,source_path,source_url,title,composer,license_id,license_url,visibility,file_sha256)')
            db.executemany('INSERT INTO origins VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
                ('one','test-a','v1','one','https://example.org/a','Conflicting A','Test','CC0','https://example.org/license','pending-review',sha),
                ('two','test-b','v1','two','https://example.org/b','Conflicting B','Test','CC0','https://example.org/license','pending-review',sha)])
            db.commit();db.close()
            analysis=encoded(normalize(raw)).encode()
            db=sqlite3.connect(normalized/'normalization.sqlite')
            db.execute('CREATE TABLE analyses(source_sha,pipeline,status,blob,analysis_sha)')
            pipeline=digest(f'{cli.q2.identity()}:20000:45'.encode())
            db.execute('INSERT INTO analyses VALUES(?,?,?,?,?)',(sha,pipeline,'normalized',zlib.compress(analysis),digest(analysis)))
            db.commit();db.close()
            source_db=(corpus/'catalog.sqlite').read_bytes();normal_db=(normalized/'normalization.sqlite').read_bytes()

            def run(*args,good=True):
                result=subprocess.run([sys.executable,str(ROOT/'buildscripts/pianist/fragment-curriculum.py'),'scan',
                    '--corpus',str(corpus),'--normalized',str(normalized),'--output',str(out),'--workers','1','--per-grade','2',*args],
                    cwd=ROOT,capture_output=True,text=True,timeout=40)
                self.assertEqual(result.returncode==0,good,result.stderr)
                return result.stdout+result.stderr

            self.assertIn('scanned',run())
            first=(out/'jobs.json').read_bytes()
            scan=json.loads((out/'scan.json').read_text())
            self.assertEqual(len(scan['sources'][0]['origins']),2)
            self.assertEqual(scan['sourcesScanned'],1)
            self.assertGreater(len(json.loads(first)['entries']),0)
            self.assertIn('cached',run())
            self.assertEqual((out/'jobs.json').read_bytes(),first)
            (out/'scans'/(sha+'.json.gz')).write_bytes(b'corrupt local cache')
            self.assertIn('scanned',run())
            self.assertEqual((out/'jobs.json').read_bytes(),first)
            # Recompute content checksum cannot make an old ruleset current.
            path=out/'scans'/(sha+'.json.gz');payload=json.loads(gzip.decompress(path.read_bytes()))
            payload['key']='old-version';path.write_bytes(gzip.compress(encoded(payload).encode()))
            self.assertIn('scanned',run())
            (corpus/'source.musicxml').write_bytes(b'changed outside Q1')
            self.assertIn('source-checksum-mismatch',run(good=False))
            self.assertEqual((corpus/'catalog.sqlite').read_bytes(),source_db)
            self.assertEqual((normalized/'normalization.sqlite').read_bytes(),normal_db)


if __name__=='__main__': unittest.main()
