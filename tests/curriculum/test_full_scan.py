from fractions import Fraction
import unittest

from fixtures_grades import make, CONFIG
from fixtures_q2 import score, note
from curriculum_regions import monophonic_regions
from curriculum_boundaries import propose
from curriculum_auto import scan, summarize
from curriculum_selection import events, make_selection
from curriculum_evidence import builder, optimizer_input, Hand
from curriculum_fast_checks import FastChecks
from curriculum_grades import assess_all
from curriculum_auto import check_profiles
from curriculum_scan_storage import pack_payload,unpack_payload


class FullScanTests(unittest.TestCase):
    def test_default_upstream_depth_avoids_manual_depth_tail_zero_fingers(self):
        raw=score([''.join(note(s) for s in 'CDE'),''.join(note(s) for s in 'DCD')])
        raw=raw.replace(b'<beats>4</beats>',b'<beats>3</beats>')
        i,s,p,_,_=make('g1-direction-quarters',raw)
        inputs,_,errors=optimizer_input(i,events(i,s));self.assertFalse(errors)
        manual=Hand(inputs,side='right',size='M');manual.verbose=False;manual.autodepth=False;manual.depth=5
        manual.generate(start_measure=1,nmeasures=2)
        self.assertTrue(any(not 1<=n.fingering<=5 for n in inputs),'Regression case for the pinned upstream manual-depth tail')
        proof=builder(i).for_profile(s,p,CONFIG)
        trace=proof['trace']['fingering']['P1:s1:v1']
        self.assertNotIn('invalid-optimizer-result',trace['reasons'])
        self.assertTrue(all(1<=n['finger']<=5 for n in trace['notes']))
        self.assertEqual(trace['depth'],'upstream-auto')

    def test_indexed_contradictions_agree_with_original_k2_on_every_profile_and_subspan(self):
        for profile in CONFIG['profiles']:
            i,s,_,_,raw=make(profile['id'])
            f=FastChecks(i,CONFIG)
            selections=[s]
            if profile['lines']==1:
                lo,hi=i.boundaries(tuple(s['lineHands']),s['startMeasure'],s['endMeasure'])
                if hi-lo>=3:
                    selections.append(make_selection(i,s['analysisSha256'],s['lineHands'],lo+1,hi))
            for selected in selections:
                full=assess_all(i,selected,config=CONFIG)
                quick=check_profiles(i,selected,CONFIG,fast=f)
                self.assertEqual([r['status'] for r in full],[r['status'] for r in quick],(profile['id'],selected))
    def test_overlap_does_not_hide_the_later_monophonic_passage(self):
        raw=score([note('C')+note('E',extra='<chord/>')+note('D')+note('E')+note('D'),
                   ''.join(note(s) for s in 'CDED')])
        i,s,p,_,_=make('g1-direction-quarters',raw)
        groups,bad=monophonic_regions(i,'P1:s1:v1')
        self.assertEqual(set(bad),{'p0:m0:n0','p0:m0:n1'})
        self.assertEqual({e['id'] for e in groups[0]},set(i.events)-set(bad))
        proposed=propose(i,'P1:s1:v1')
        self.assertTrue(proposed['points'])
        payload=scan(i,s['analysisSha256'],CONFIG,120)
        # Every enumerated span is checked against the original source notes.
        crossing=[c for c in payload['candidates'] if c['selection']['startQuarter']['numerator']==0]
        self.assertTrue(crossing)
        self.assertFalse(any(c['contentPassedProfiles'] for c in crossing))
        late=make_selection(i,s['analysisSha256'],s['lineHands'],Fraction(1),Fraction(8))
        proof=builder(i).for_profile(late,p,CONFIG)
        trace=proof['trace']['fingering']['P1:s1:v1']['notes']
        inputs,chains,errors=optimizer_input(i,groups[0]);self.assertFalse(errors)
        h=Hand(inputs,side='right',size='M');h.verbose=False;h.generate(start_measure=1,nmeasures=2)
        self.assertEqual([n.fingering for n in inputs],[r['finger'] for r in trace])
        self.assertEqual(chains,[r['eventIds'] for r in trace])

    def test_nested_overlap_and_tie_are_never_severed_for_the_model(self):
        raw=score([note('C',duration=4,kind='whole')+note('E',duration=1,extra='<chord/>')+
                   '<backup><duration>3</duration></backup>'+note('G',duration=1)+note('F')+note('E'),
                   ''.join(note(s) for s in 'CDED')])
        i,_,_,_,_=make('g1-direction-quarters',raw)
        groups,bad=monophonic_regions(i,'P1:s1:v1')
        self.assertTrue(all(e['measureIndex']==1 for g in groups for e in g if e['kind']=='note'))
        self.assertTrue(all(i.events[e]['measureIndex']==0 for e in bad))

    def test_no_candidate_quota_and_profile_totals_reconcile(self):
        raw=score([''.join(note(s) for s in 'CDEG')]*4)
        i,s,_,_,_=make('g1-direction-quarters',raw)
        payload=scan(i,s['analysisSha256'],CONFIG,120)
        from curriculum_fragments import q
        edges=sorted(q(e['atQuarter']) for e in payload['proposals']['P1:s1:v1']['exactEdges'])
        expected={(lo,hi) for lo in edges for hi in edges if lo<hi and
                  3<=sum(e['kind']=='note' and not e.get('tieFrom') and lo<=q(e['onset'])<hi for e in i.a['events'])<=120}
        self.assertEqual(expected,{(q(c['selection']['startQuarter']),q(c['selection']['endQuarter'])) for c in payload['candidates']})
        report=summarize(payload)
        self.assertEqual(report['profileChecks'],len(payload['candidates'])*len(CONFIG['profiles']))
        self.assertEqual(sum(sum(c.values()) for c in report['profileBreakdown'].values()),report['profileChecks'])
        self.assertEqual(sum(report['boundaryStatuses'].values()),report['candidates'])
        self.assertFalse(any(c['approvedForPractice'] for c in payload['candidates']))
        packed=pack_payload(payload)
        self.assertEqual(unpack_payload(packed),payload)
        self.assertLess(len(packed['profileVerdictTable']),report['profileChecks'])


if __name__=='__main__':unittest.main()
