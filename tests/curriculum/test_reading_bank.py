from copy import deepcopy
from io import BytesIO
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from fixtures_grades import make,CONFIG
from fixtures_q2 import score,note
from curriculum_bank import mxl_bytes,extract,bank_db,counts,option_counts,target_met,missing_options,accept,BUCKET_IDS
from curriculum_reading import assess_reading
from curriculum_normalize import normalize,digest,encoded
from curriculum_io import CorpusError
from curriculum_fragments import SourceIndex


class ReadingBankTests(unittest.TestCase):
    def test_no_finger_optimizer_and_literal_profile_rules_remain(self):
        with patch('curriculum_evidence.Hand.generate',side_effect=AssertionError('must not optimize fingers')):
            for profile in CONFIG['profiles']:
                i,s,p,e,raw=make(profile['id'])
                r=assess_reading(i,s,p,CONFIG)
                if p['id']=='g8-register':
                    self.assertIn('distant-written-register',r['failureRules'])
                else:self.assertEqual(r['status'],'pass',(p['id'],r))
                bad=raw.replace(b'<step>C</step>',b'<step>C</step><alter>1</alter>',1)
                i,s,p,*_=make(profile['id'],bad)
                self.assertEqual(assess_reading(i,s,p,CONFIG)['status'],'fail')

    def test_mode_not_invented_and_far_register_not_relabelled_as_g4(self):
        i,s,p,e,raw=make('g1-direction-quarters')
        for replacement,expected in [(b'', 'pass'),(b'<mode>minor</mode>','fail')]:
            i,s,p,*_=make(p['id'],raw.replace(b'<mode>major</mode>',replacement))
            self.assertEqual(assess_reading(i,s,p,CONFIG)['status'],expected)
        i,s,p,e,raw=make('g4-new-position')
        i,s,p,*_=make(p['id'],raw.replace(b'<octave>5</octave>',b'<octave>7</octave>').replace(b'<octave>4</octave>',b'<octave>6</octave>'))
        self.assertIn('ordinary-written-register',assess_reading(i,s,p,CONFIG)['failureRules'])
        g8=next(p for p in CONFIG['profiles'] if p['id']=='g8-register')
        self.assertEqual(assess_reading(i,s,g8,CONFIG)['status'],'pass')

    def test_actual_mxl_round_trip_keeps_original_fingering(self):
        i,s,p,e,raw=make('g1-direction-quarters')
        raw=raw.replace(b'</note>',b'<notations><technical><fingering>5</fingering></technical></notations></note>',1)
        blob=mxl_bytes(raw)
        self.assertEqual(blob,mxl_bytes(raw))
        with zipfile.ZipFile(BytesIO(blob)) as archive:
            self.assertEqual(archive.read('score.musicxml'),raw)
            self.assertIn(b'score.musicxml',archive.read('META-INF/container.xml'))
        a=normalize(blob)
        self.assertEqual(a['sourceSha256'],digest(blob))
        self.assertEqual(len(a['events']),len(normalize(raw)['events']))
        index=SourceIndex(a,blob)
        with tempfile.TemporaryDirectory() as directory,patch('curriculum_evidence.Hand.generate',side_effect=AssertionError('no fingers')):
            result=extract(index,digest(encoded(a).encode()),{1},Path(directory))
            self.assertTrue(result['candidates'])
            with zipfile.ZipFile(result['candidates'][0]['mxl']) as archive:
                self.assertIn(b'<fingering>5</fingering>',archive.read('score.musicxml'))

    def test_all_56_options_required_and_overflow_is_allowed(self):
        values={g:{b:301 for b in BUCKET_IDS} for g in range(1,9)}
        self.assertTrue(target_met(values,300))
        values[8]['n100']=299
        self.assertFalse(target_met(values,300))
        self.assertEqual(missing_options(values,300)['8'],['n100'])
        # An abundance of short exercises cannot cover a missing long option.
        values[8]['n4']=100000
        self.assertFalse(target_met(values,300))

    def test_requested_length_is_not_filled_by_a_different_length(self):
        i,s,p,e,raw=make('g1-direction-quarters')
        with tempfile.TemporaryDirectory() as directory:
            result=extract(i,digest(encoded(i.a).encode()),{1},Path(directory),{'1':['n6']})
            self.assertEqual(result['candidates'],[])
            result=extract(i,digest(encoded(i.a).encode()),{1},Path(directory),{'1':['n4']})
            self.assertTrue(result['candidates'])

    def test_count_only_verified_mxl_and_resume_exact_memberships(self):
        i,s,p,e,raw=make('g1-direction-quarters')
        with tempfile.TemporaryDirectory() as directory:
            out=Path(directory);result=extract(i,digest(encoded(i.a).encode()),{1},out/'staging')
            row=result['candidates'][0];count=row['sourceAttackCount']
            native={'passed':True,'mxlSha256':row['mxlSha256'],'analysisSha256':row['analysisSha256'],
                    'verification':{'eligibleForFragmentReview':True,'releaseBlockers':[],'counts':{'targets':count}},
                    'render':{'glyphsComplete':True,'editorUnchanged':True,'counts':{'targets':count}}}
            buckets={'buckets':[{'id':'n4','min':3,'max':5}]}
            db=bank_db(out/'bank.sqlite','test')
            try:
                failed={**native,'passed':False}
                self.assertFalse(accept(db,out,row,failed,[],buckets));self.assertEqual(counts(db)[1],0)
                wrong={**native,'mxlSha256':'0'*64}
                with self.assertRaisesRegex(CorpusError,'native-input-binding'):accept(db,out,row,wrong,[],buckets)
                self.assertTrue(accept(db,out,row,native,[],buckets));self.assertEqual(counts(db)[1],1)
                self.assertEqual(len(list((out/'exercises').glob('*.mxl'))),1)
                with db:db.execute('INSERT OR IGNORE INTO memberships VALUES(?,?,?)',(1,row['id'],'n4'))
                self.assertEqual(counts(db)[1],1)
                self.assertEqual(option_counts(db)[1]['n4'],1)
                self.assertEqual(option_counts(db)[1]['n6'],0)
            finally:db.close()
            db=bank_db(out/'bank.sqlite','test')
            try:self.assertEqual(counts(db)[1],1)
            finally:db.close()
            with self.assertRaisesRegex(CorpusError,'bank-pipeline-changed'):bank_db(out/'bank.sqlite','changed')

    def test_unsafe_cut_stays_rejected_without_finger_gate(self):
        i,s,p,e,raw=make('g1-direction-quarters')
        # An unsupported fermata does not become usable simply because fingers are optional.
        i,s,p,*_=make(p['id'],raw.replace(b'</note>',b'<notations><fermata/></notations></note>',1))
        self.assertEqual(assess_reading(i,s,p,CONFIG)['status'],'review')
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(extract(i,digest(encoded(i.a).encode()),{1},Path(directory))['candidates'],[])


if __name__=='__main__':unittest.main()
