"""Real CLI on an isolated synthetic corpus; no source corpus/native needed."""
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import zlib

from test_prepared import make,score,note,ROOT
from test_cache_v2 import q2
from curriculum_normalize import digest,encoded


class PreparedCliTests(unittest.TestCase):
    def test_deterministic_prepare_pending_review_stale_receipt_and_changed_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);corpus=root/'corpus';corpus.mkdir();out=root/'out';normalized=root/'normalized'
            raw=score([note('C')+note('D')+note('E')+note('D')])
            index,unit=make(raw);(corpus/'fixture.musicxml').write_bytes(raw)
            db=sqlite3.connect(corpus/'catalog.sqlite')
            db.executescript('CREATE TABLE files(sha256,path,container_status);CREATE TABLE origins(id,collection,revision,source_path,source_url,title,composer,license_id,license_url,visibility,file_sha256);')
            db.execute('INSERT INTO files VALUES(?,?,?)',(digest(raw),'fixture.musicxml','valid'))
            db.execute('INSERT INTO origins VALUES(?,?,?,?,?,?,?,?,?,?,?)',('fixture','tests','1','fixture.musicxml','','Synthetic test','','CC0','','personal',digest(raw)))
            db.commit();db.close()
            db=q2.open_db(normalized)
            db.execute('INSERT INTO analyses VALUES(?,?,?,?,?,?,?,?)',(digest(raw),digest(f'{q2.identity()}:20000:45'.encode()),
                'normalized',zlib.compress(encoded(index.a).encode()),unit['analysisSha256'],'[]',None,0))
            db.commit();db.close()
            reviews=root/'reviews.json';reviews.write_text(json.dumps({'schemaVersion':2,'units':[unit]}),encoding='utf8')
            cmd=[sys.executable,str(ROOT/'buildscripts/pianist/prepare-curriculum.py')]
            common=['--corpus',str(corpus),'--normalized',str(normalized),'--output',str(out),'--reviews',str(reviews)]
            def run(command,*extra):return subprocess.run([*cmd,command,*common,*extra],capture_output=True,text=True,timeout=30)
            first=run('prepare');self.assertEqual(first.returncode,0,first.stderr)
            jobs=(out/'jobs.json').read_bytes();entry=json.loads(jobs)['entries'][0]
            xml=Path(entry['xml']).read_bytes()
            again=run('prepare');self.assertEqual(again.returncode,0,again.stderr)
            self.assertEqual((out/'jobs.json').read_bytes(),jobs);self.assertEqual(Path(entry['xml']).read_bytes(),xml)
            native=root/'native.json';render=root/'render.json'
            native.write_text(json.dumps({'pipeline':json.loads(jobs)['pipeline'],'passed':False}),encoding='utf8')
            render.write_text(json.dumps({'pipeline':json.loads(jobs)['pipeline'],'passed':True}),encoding='utf8')
            bad=run('finalize','--native',str(native),'--render',str(render))
            self.assertNotEqual(bad.returncode,0);self.assertIn('native-or-render-check-failed',bad.stderr)
            self.assertFalse((out/'manifest.json').exists())
            unit['review']['status']='pending';reviews.write_text(json.dumps({'schemaVersion':2,'units':[unit]}),encoding='utf8')
            pending=run('prepare');self.assertEqual(pending.returncode,0,pending.stderr)
            self.assertEqual(json.loads((out/'jobs.json').read_text())['entries'],[])
            self.assertIn('boundary-hand-review-pending',json.loads((out/'rejected.json').read_text())[0]['reasons'])
            (corpus/'fixture.musicxml').write_bytes(raw+b' ')
            changed=run('prepare');self.assertNotEqual(changed.returncode,0);self.assertIn('source-checksum-mismatch',changed.stderr)


if __name__=='__main__':unittest.main()
