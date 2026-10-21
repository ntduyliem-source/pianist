"""V2 policy/receipt regressions. All generated notes here are synthetic tests."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'buildscripts/pianist'))
from curriculum_normalize import normalize,digest,encoded
from curriculum_fragments import SourceIndex
from curriculum_prepared import (assess_unit,prepare_unit,selection_hash,context_evidence,
    upstream_rest_proposals,length_bucket,rhythm_verdict)
from curriculum_io import CorpusError
from fixtures_q2 import score,note

CONFIG=json.loads((ROOT/'scores/curriculum/grades.v2.json').read_text(encoding='utf8'))
BUCKETS=json.loads((ROOT/'scores/curriculum/length-buckets.v2.json').read_text(encoding='utf8'))


def make(raw,start=0,end=None,profile='g1-direction-quarters'):
    analysis=normalize(raw);index=SourceIndex(analysis,raw)
    end=end if end is not None else len(analysis['measures'])
    u={'label':'Synthetic test; not curriculum','sourceSha256':digest(raw),'analysisSha256':digest(encoded(analysis).encode()),
       'lineId':'P1:s1:v1','startMeasure':start,'endMeasure':end,'unitKind':'motif','profileId':profile,'handTemplateId':'home-C4-right-key0'}
    u['review']={'status':'accepted-local-pilot','method':'source-context-and-score-inspection',
        'reviewer':'Synthetic fixture only','reviewerRole':'assistant','teacherReviewed':False,'reviewedAt':'2026-10-21',
        'tonality':'C major','sourceScoreInspection':{'snapshotSha256':'0'*64,'sourceXmlSha256':analysis['pianoXmlSha256']},
        **{k:'Synthetic fixture evidence; not a claim about a real music source.' for k in
           ('startReason','endReason','musicalReason','handReason','tonalityReason')}}
    bind(index,u)
    return index,u


def bind(index,u):
    u['review']['selectionSha256']=selection_hash(u)
    u['review']['contextSha256']=digest(encoded(context_evidence(index,u)).encode())


class PreparedTests(unittest.TestCase):
    def test_buckets_partition_three_to_120_only(self):
        self.assertEqual([length_bucket(n,BUCKETS) for n in (2,3,5,6,8,9,14,15,24,25,39,40,69,70,120,121)],
            [None,'n4','n4','n6','n6','n10','n10','n20','n20','n30','n30','n50','n50','n100','n100',None])
        for n in range(3,121):self.assertEqual(sum(b['min']<=n<=b['max'] for b in BUCKETS['buckets']),1)
        with self.assertRaises(CorpusError):length_bucket(3.5,BUCKETS)

    def test_three_note_unit_keeps_written_rest(self):
        raw=score([note('C')+note('D')+note('E')+note(None)])
        i,u=make(raw,profile='g1-direction-rests');p=prepare_unit(i,u,CONFIG)
        self.assertEqual(len(p['analysis']['events']),4)
        self.assertEqual(p['analysis']['events'][-1]['kind'],'rest')
        self.assertTrue(p['projection']['passed'])

    def test_review_binding_rejects_a_cut_even_when_it_meets_grade(self):
        i,u=make(score([note('C')+note('D')+note('E')+note('D')]*2))
        self.assertTrue(assess_unit(i,u,CONFIG)['passed'])
        u['endMeasure']=1
        reasons=assess_unit(i,u,CONFIG)['rejectionCodes']
        self.assertIn('review-selection-binding',reasons);self.assertIn('review-context-binding',reasons)

    def test_pending_boundary_does_not_pass_from_native_or_grade_alone(self):
        i,u=make(score([note('C')+note('D')+note('E')+note('D')]))
        u['review']['status']='pending'
        with self.assertRaisesRegex(CorpusError,'boundary-hand-review-pending'):prepare_unit(i,u,CONFIG)

    def test_whole_unit_dotted_ending_is_not_g1(self):
        body=note('C',duration=2)+note('D',duration=2)+note('E',duration=2)+note('D',duration=2)
        ending=note('D',duration=3,kind='quarter',extra='<dot/>')+note('C',duration=1,kind='eighth')+note('C',duration=4,kind='half')
        i,u=make(score([body,ending],divisions=2),profile='g1-direction-long')
        self.assertIn('rhythm-outside-profile',assess_unit(i,u,CONFIG)['rejectionCodes'])

    def test_pair_of_eighths_keeps_both_attacks_and_following_tonic(self):
        body=''.join(note(s,duration=1,kind='eighth') for s in 'CDEFGFED')
        i,u=make(score([body,note('C',duration=8,kind='whole')],divisions=2),profile='g2-paired-eighths-steps')
        p=prepare_unit(i,u,CONFIG)
        self.assertEqual(len(p['analysis']['events']),9)
        self.assertEqual(p['analysis']['events'][-1]['pitch']['step'],'C')
        self.assertEqual(p['verdict']['durationQuarter'],{'numerator':8,'denominator':1})

    def test_second_three_four_bar_uses_local_phase(self):
        raw=score([note('C')+note('D')+note('E'),note('D',duration=2,kind='half')+note('C')])
        raw=raw.replace(b'<beats>4</beats>',b'<beats>3</beats>')
        i,u=make(raw,profile='g1-direction-long')
        self.assertTrue(assess_unit(i,u,CONFIG)['passed'])

    def test_source_finger_is_not_overwritten_to_force_grade(self):
        raw=score([note('C',extra='<notations><technical><fingering>5</fingering></technical></notations>')+note('D')+note('E')+note('D')])
        i,u=make(raw)
        self.assertIn('source-fingering-conflict',assess_unit(i,u,CONFIG)['rejectionCodes'])

    def test_crossing_slur_cannot_be_blessed_by_review(self):
        first=note('C',extra='<notations><slur type="start" number="1"/></notations>')+note('D')+note('E')+note('D')
        second=note('C')+note('D')+note('E')+note('C',extra='<notations><slur type="stop" number="1"/></notations>')
        i,u=make(score([first,second]),end=1)
        self.assertIn('cut-or-cross-line-slur',assess_unit(i,u,CONFIG)['rejectionCodes'])

    def test_upstream_rest_segments_are_only_proposals(self):
        i,u=make(score([note('C')+note('D')+note(None)+note('E')]),profile='g1-direction-rests')
        p=upstream_rest_proposals(i,u['lineId'])
        self.assertEqual(p['version'],'10.5.0');self.assertEqual([len(s) for s in p['segments']],[2,1])
        self.assertEqual(p['status'],'proposal-only')
        u['review']['status']='pending'
        self.assertFalse(assess_unit(i,u,CONFIG)['passed'])

    def test_unimplemented_grade_and_source_change_fail_closed(self):
        i,u=make(score([note('C')+note('D')+note('E')+note('D')]))
        u['profileId']='g8-anything'
        with self.assertRaisesRegex(CorpusError,'unimplemented-profile'):assess_unit(i,u,CONFIG)
        u['sourceSha256']='0'*64
        with self.assertRaisesRegex(CorpusError,'unit-source-analysis-binding'):assess_unit(i,u,CONFIG)

    def test_review_and_title_change_do_not_reset_musical_identity(self):
        i,u=make(score([note('C')+note('D')+note('E')+note('D')]))
        first=prepare_unit(i,u,CONFIG);u['label']='Corrected label';u['review']['musicalReason']+=' Clarified.'
        second=prepare_unit(i,u,CONFIG)
        self.assertEqual(first['id'],second['id']);self.assertEqual(first['xml'],second['xml'])
        self.assertRegex(first['exactHash'],'^[a-f0-9]{64}$')


if __name__=='__main__':unittest.main()
