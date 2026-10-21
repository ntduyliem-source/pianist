from copy import deepcopy
import gzip
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zlib

from fixtures_grades import make,CONFIG
from curriculum_auto import scan,rules_identity
from curriculum_inventory import compile_inventory,normalization_module,validate_candidates,length_bucket,audit_enumeration
from curriculum_io import CorpusError
from curriculum_normalize import digest,encoded
from curriculum_scan_storage import pack_payload,unpack_payload


class InventoryTests(unittest.TestCase):
    def test_all_sources_reconcile_and_modified_source_cannot_be_marked_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);corpus=root/'corpus';normalized=root/'normalized';scans=root/'scan'
            corpus.mkdir();normalized.mkdir();(scans/'scans').mkdir(parents=True)
            i,s,_,_,raw=make('g1-direction-quarters');sha=digest(raw)
            rejected=b'<score-partwise><part-list/></score-partwise>';other=digest(rejected)
            (corpus/'score.xml').write_bytes(raw);(corpus/'unidentified.xml').write_bytes(rejected)
            with sqlite3.connect(corpus/'catalog.sqlite') as db:
                db.execute('CREATE TABLE review_queue(file_sha256,mxl_path,collection)')
                db.executemany('INSERT INTO review_queue VALUES(?,?,?)',[(sha,'score.xml','fixture'),(other,'unidentified.xml','fixture')])
            db.close()
            pipeline=digest(f'{normalization_module().identity()}:20000:45'.encode())
            with sqlite3.connect(normalized/'normalization.sqlite') as db:
                db.execute('CREATE TABLE analyses(source_sha,status,analysis_sha,blockers,pipeline,blob)')
                db.executemany('INSERT INTO analyses VALUES(?,?,?,?,?,?)',[(sha,'normalized',s['analysisSha256'],'[]',pipeline,zlib.compress(encoded(i.a).encode())),
                              (other,'rejected',None,'["piano-part-unidentified"]',pipeline,None)])
            db.close()
            payload=scan(i,s['analysisSha256'],CONFIG,120);packed=pack_payload(payload)
            key=digest(encoded([rules_identity(),pipeline,sha,s['analysisSha256'],120]).encode())
            wrapper={'key':key,'payloadSha256':digest(encoded(packed).encode()),'payload':packed}
            (scans/'scans'/(sha+'.json.gz')).write_bytes(gzip.compress(encoded(wrapper).encode(),mtime=0))
            out=root/'inventory';report=compile_inventory(corpus,normalized,scans,out,lambda *a,**k:None)
            self.assertTrue(report['complete']);self.assertEqual(report['sourceCount'],2)
            self.assertEqual(report['scannedSources'],1);self.assertEqual(report['normalizationUnavailable'],1)
            self.assertEqual(report['profileChecks'],report['candidates']*25)
            self.assertEqual(sum(sum(c.values()) for c in report['gradeClassification'].values()),report['candidates']*8)
            with sqlite3.connect(out/'candidates.sqlite') as db:
                self.assertEqual(db.execute('SELECT count(*) FROM sources').fetchone()[0],2)
                self.assertEqual(db.execute('SELECT count(*) FROM candidates').fetchone()[0],report['potentialCandidates'])
                self.assertEqual(json.loads(db.execute('SELECT value FROM metadata WHERE key="complete"').fetchone()[0]),True)
            db.close()
            (corpus/'score.xml').write_bytes(raw+b' ')
            failed=compile_inventory(corpus,normalized,scans,root/'changed',lambda *a,**k:None)
            self.assertFalse(failed['complete']);self.assertEqual(failed['unresolvedScanSources'],1)
            self.assertFalse((root/'changed/candidates.sqlite').exists())

    def test_duplicate_profile_and_unearned_admission_are_detected(self):
        i,s,_,_,_=make('g1-direction-quarters');p=scan(i,s['analysisSha256'],CONFIG,120)
        profiles={r['id']:r for r in CONFIG['profiles']}
        validate_candidates(p,s['sourceSha256'],s['analysisSha256'],profiles)
        audit_enumeration(p,i.a)
        missing=deepcopy(p);missing['candidates'].pop()
        with self.assertRaisesRegex(CorpusError,'missing-enumerated-candidates'):audit_enumeration(missing,i.a)
        bad=deepcopy(p);bad['candidates'][0]['profileVerdicts'][-1]=bad['candidates'][0]['profileVerdicts'][0]
        with self.assertRaisesRegex(CorpusError,'incomplete-candidate-profiles'):
            validate_candidates(bad,s['sourceSha256'],s['analysisSha256'],profiles)
        bad=deepcopy(p);bad['candidates'][0]['approvedForPractice']=True
        with self.assertRaisesRegex(CorpusError,'candidate-admission-inconsistent'):
            validate_candidates(bad,s['sourceSha256'],s['analysisSha256'],profiles)
        packed=pack_payload(p);packed['candidates'][0]['profileVerdictRefs'][0]=-1
        with self.assertRaisesRegex(ValueError,'invalid-verdict-reference'):unpack_payload(packed)

    def test_length_buckets_do_not_cut_or_round_the_source_count(self):
        self.assertEqual([length_bucket(n) for n in (3,5,6,8,9,14,15,24,25,39,40,69,70,120)],
                         [4,4,6,6,10,10,20,20,30,30,50,50,100,100])
        with self.assertRaises(CorpusError):length_bucket(121)


if __name__=='__main__':unittest.main()
