"""Real spawn-worker/cache/catalog boundary test (no downloads/native build needed)."""
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import zipfile
from fixtures_q2 import fixtures

ROOT=Path(__file__).resolve().parents[2]
CLI=ROOT/'buildscripts/pianist/normalize-curriculum.py'


class CliTests(unittest.TestCase):
    def test_spawn_resume_corruption_source_hash_and_configuration(self):
        temporary=ROOT/'artifacts/curriculum-tests'
        temporary.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary) as directory:
            root=Path(directory);corpus=root/'corpus';out=root/'normalized';corpus.mkdir()
            buf=io.BytesIO()
            with zipfile.ZipFile(buf,'w') as archive:
                archive.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>')
                archive.writestr('score.musicxml',fixtures()['spelled-intervals'])
            data=buf.getvalue();sha=hashlib.sha256(data).hexdigest()
            (corpus/'source.mxl').write_bytes(data)
            catalog=corpus/'catalog.sqlite'
            c=sqlite3.connect(catalog)
            c.execute('CREATE TABLE review_queue(file_sha256,mxl_path,collection,visibility,title)')
            c.executemany('INSERT INTO review_queue VALUES(?,?,?,?,?)',
                [(sha,'source.mxl','collection-a','personal','A'),(sha,'source.mxl','collection-b','pending-review','Conflicting B')])
            c.commit();c.close()
            original_catalog=catalog.read_bytes()

            def run(*extra):
                result=subprocess.run([sys.executable,str(CLI),'normalize','--corpus',str(corpus),'--output',str(out),
                    '--workers','1',*extra],cwd=ROOT,capture_output=True,text=True,timeout=60)
                self.assertEqual(result.returncode,0,result.stderr)
                return result.stdout,json.loads((out/'report.json').read_text())

            text,report=run()
            self.assertEqual(report['catalogFiles'],1)
            self.assertEqual(report['normalized'],1)
            self.assertIn('0 cached',text)
            text,report2=run()
            self.assertIn('1 cached',text)
            self.assertEqual(report2['pipeline'],report['pipeline'])
            self.assertEqual(catalog.read_bytes(),original_catalog)

            # The first assertion above covers the initial run only; appending
            # another file is tested after the corruption/configuration checks.
            # Adding an origin and changing attribution leaves the same bytes
            # cached; this used to invalidate everything through sources.lock.
            c=sqlite3.connect(catalog)
            c.execute('INSERT INTO review_queue VALUES(?,?,?,?,?)',
                (sha,'source.mxl','collection-new','personal','Corrected attribution'))
            c.commit();c.close()
            text,after_origin=run()
            self.assertIn('1 cached',text)
            self.assertEqual(after_origin['pipeline'],report['pipeline'])
            original_catalog=catalog.read_bytes()
            shortlist=root/'shortlist.json'
            shortlist.write_text(json.dumps({'sourceHashes':[sha]}))
            text,_=run('--source-list',str(shortlist))
            self.assertIn('1 cached',text)
            shortlist.write_text(json.dumps({'sourceHashes':['0'*64]}))
            rejected=subprocess.run([sys.executable,str(CLI),'normalize','--corpus',str(corpus),'--output',str(out),
                '--source-list',str(shortlist)],cwd=ROOT,capture_output=True,text=True,timeout=20)
            self.assertNotEqual(rejected.returncode,0)
            self.assertIn('source-list-outside-review-queue',rejected.stderr)
            db=sqlite3.connect(out/'normalization.sqlite')
            first_hash=db.execute('SELECT analysis_sha FROM analyses').fetchone()[0]
            db.execute('UPDATE analyses SET blob=?',(b'corrupt local cache',));db.commit();db.close()
            text,_=run()
            self.assertIn('0 cached',text)
            db=sqlite3.connect(out/'normalization.sqlite')
            self.assertEqual(db.execute('SELECT analysis_sha FROM analyses').fetchone()[0],first_hash);db.close()
            text,limited=run('--max-notes','1')
            self.assertNotEqual(limited['pipeline'],report['pipeline'])
            self.assertEqual(limited['parseRejected'],1)
            self.assertEqual(limited['rejectionCounts'],{'normalization-note-limit':1})
            (corpus/'source.mxl').write_bytes(b'changed since Q1')
            result=subprocess.run([sys.executable,str(CLI),'normalize','--corpus',str(corpus),'--output',str(out)],
                cwd=ROOT,capture_output=True,text=True,timeout=20)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('source-checksum-mismatch',result.stderr)
            self.assertEqual(catalog.read_bytes(),original_catalog)
            (corpus/'source.mxl').write_bytes(data)
            run()  # Restore this parser/options cache after the max-notes run.
            second=io.BytesIO()
            with zipfile.ZipFile(second,'w') as archive:
                archive.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>')
                archive.writestr('score.musicxml',fixtures()['spelled-intervals'].replace(b'Q2 original fixture',b'Another source'))
            new_data=second.getvalue();new_sha=hashlib.sha256(new_data).hexdigest()
            (corpus/'second.mxl').write_bytes(new_data)
            c=sqlite3.connect(catalog)
            c.execute('INSERT INTO review_queue VALUES(?,?,?,?,?)',(new_sha,'second.mxl','collection-new','personal','New file'))
            c.commit();c.close()
            text,expanded=run()
            self.assertIn('2 selected, 1 cached, 1 to normalize',text)
            self.assertEqual(expanded['normalized'],2)
            self.assertEqual(expanded['pipeline'],report['pipeline'])


if __name__=='__main__':
    unittest.main()
