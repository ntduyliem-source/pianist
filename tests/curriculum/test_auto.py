import ast
from fractions import Fraction
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

from fixtures_grades import make,CONFIG,ROOT
from fixtures_q2 import note,score
from curriculum_auto import check_profiles,read_scan
from curriculum_boundaries import propose,strengths,positive_peaks,UPSTREAM
from curriculum_fragments import SourceIndex
from curriculum_grades import assess_all
from curriculum_normalize import normalize,digest,encoded


class AutoTests(unittest.TestCase):
    def test_upstream_function_bodies_match_pinned_extraction_hashes(self):
        code=UPSTREAM.read_text(encoding='utf8');lines=code.splitlines(keepends=True)
        upstream=json.loads(UPSTREAM.with_name('UPSTREAM.json').read_text())
        nodes={n.name:n for n in ast.parse(code).body if isinstance(n,ast.FunctionDef)}
        self.assertEqual(len(nodes),9)
        for f in upstream['functions']:
            node=nodes[f['name']];body=''.join(lines[node.lineno-1:node.end_lineno])
            self.assertEqual(hashlib.sha256(body.encode()).hexdigest(),f['sha256'],f['name'])

    def test_flat_line_does_not_create_music_boundaries_or_short_note_errors(self):
        self.assertEqual(strengths([],[],[]),[])
        self.assertEqual(strengths([60],[Fraction(0)],[Fraction(1)]),[None])
        values=strengths([60]*6,list(map(Fraction,range(6))),list(map(Fraction,range(1,7))))
        self.assertFalse(positive_peaks(values))
        self.assertEqual(positive_peaks([None,0,.5,.5,.1,None]),[3])

    def test_ties_are_merged_and_peaks_inside_bars_are_not_snapped(self):
        raw=score([note('C')+note('D')+note('E')+note('F',extra='<tie type="start"/>'),
                   note('F',extra='<tie type="stop"/>')+note('G')+note('E')+note('D')])
        index=SourceIndex(normalize(raw),raw);r=propose(index,'P1:s1:v1')
        self.assertEqual(len(r['points']),7)
        p=next(p for p in r['points'] if p['afterEvent']=='p0:m0:n3')
        self.assertEqual(p['noteEnd'],{'numerator':5,'denominator':1})
        self.assertEqual(p['nextOnset'],{'numerator':5,'denominator':1})
        self.assertIsNone(p['atMeasure'])
        self.assertFalse(any(e.get('afterEvent')==p['afterEvent'] for e in r['barEdges']))

    def test_polyphony_does_not_get_a_false_monophonic_model_result(self):
        raw=score([note('C')+note('E',extra='<chord/>')+note('D')+note('E')])
        index=SourceIndex(normalize(raw),raw);r=propose(index,'P1:s1:v1')
        self.assertEqual(r['unsupported'],['polyphonic-line'])
        self.assertEqual(r['points'],[])

    def test_fast_rejections_preserve_full_k2_status_for_every_profile_fixture(self):
        for p in CONFIG['profiles']:
            i,s,_,_,_=make(p['id'])
            full=assess_all(i,s,config=CONFIG);quick=check_profiles(i,s,CONFIG)
            self.assertEqual([v['status'] for v in quick],[v['status'] for v in full],p['id'])
            self.assertFalse(any(v['status']=='pass' for v in quick))

    def test_real_spawn_batch_resume_corrupt_cache_and_source_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);corpus=base/'corpus';normalized=base/'normalized';out=base/'auto'
            corpus.mkdir();normalized.mkdir()
            raw=score([note('C')+note('D')+note('E')+note('D')]*2)
            (corpus/'source.xml').write_bytes(raw);sha=digest(raw);a=normalize(raw);analysis=encoded(a).encode()
            with sqlite3.connect(corpus/'catalog.sqlite') as db:
                db.execute('CREATE TABLE review_queue(file_sha256,mxl_path,collection)')
                db.execute('INSERT INTO review_queue VALUES(?,?,?)',(sha,'source.xml','fixture'))
            db.close()
            spec=importlib.util.spec_from_file_location('auto_test_normalizer',ROOT/'buildscripts/pianist/normalize-curriculum.py')
            normalizer=importlib.util.module_from_spec(spec);spec.loader.exec_module(normalizer)
            pipeline=digest(f'{normalizer.identity()}:20000:45'.encode())
            with sqlite3.connect(normalized/'normalization.sqlite') as db:
                db.execute('CREATE TABLE analyses(source_sha,status,analysis_sha,blockers,blob,pipeline)')
                db.execute('INSERT INTO analyses VALUES(?,?,?,?,?,?)',
                    (sha,'normalized',digest(analysis),'[]',__import__('zlib').compress(analysis),pipeline))
            db.close()
            command=[sys.executable,str(ROOT/'buildscripts/pianist/auto-curriculum.py'),
                '--corpus',str(corpus),'--normalized',str(normalized),'--output',str(out),'--workers','2']
            def run(expected=0):
                result=subprocess.run(command,capture_output=True,text=True,timeout=60)
                self.assertEqual(result.returncode,expected,result.stderr)
                return json.loads((out/'report.json').read_text())
            first=run();self.assertEqual(first['scannedSources'],1);self.assertEqual(first['approvedExercises'],0)
            path=out/'scans'/(sha+'.json.gz');old=path.read_bytes()
            self.assertEqual(run()['reused'],1);self.assertEqual(path.read_bytes(),old)
            path.write_bytes(b'corrupt cache');self.assertEqual(run()['reused'],0);self.assertEqual(path.read_bytes(),old)
            (corpus/'source.xml').write_bytes(raw+b' ')
            failed=subprocess.run(command,capture_output=True,text=True,timeout=60)
            self.assertNotEqual(failed.returncode,0)
            self.assertIn('source-checksum-mismatch',(out/'source-outcomes.json').read_text())


if __name__=='__main__':unittest.main()
