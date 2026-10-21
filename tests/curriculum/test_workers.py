"""Reused importers must give the same score bytes as fresh upstream calls."""
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'buildscripts/pianist'))
from curriculum_workers import parse_job, results, Worker
from fixtures_q2 import fixtures


class WorkerTests(unittest.TestCase):
    def test_reuse_and_recycling_preserve_parse_results_after_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            jobs=[]
            samples=list(fixtures().values())+[b'invalid xml']+list(fixtures().values())[:3]
            for i,raw in enumerate(samples):
                path=Path(directory)/f'{i}.xml';path.write_bytes(raw)
                jobs.append({'absolute':str(path),'sha':hashlib.sha256(raw).hexdigest()})
            expected={j['absolute']:parse_job(j,20000) for j in jobs}
            observed=list(results(jobs,3,20,20000,recycle=4))
            self.assertEqual(len(observed),len(jobs))
            for job,result,_ in observed:
                self.assertEqual(result,expected[job['absolute']],job['absolute'])

    def test_timeout_replaces_worker_and_next_score_can_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            raw=fixtures()['spelled-intervals'];path=Path(directory)/'score.xml';path.write_bytes(raw)
            job={'absolute':str(path),'sha':hashlib.sha256(raw).hexdigest()}
            worker=Worker(.001,20000,32)
            try:
                self.assertEqual(worker.run(job)[1]['blockers'],['normalizer-timeout'])
                worker.timeout=20
                self.assertEqual(worker.run(job)[1],parse_job(job,20000))
            finally:
                worker.close()
