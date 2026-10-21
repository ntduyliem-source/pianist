from copy import deepcopy
from fractions import Fraction
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'buildscripts/pianist'))
from curriculum_fragments import (SourceIndex, normalize, evaluate, project_xml, verify_projection,
    content_hashes, group_candidates, upstream_interval, q, rhythm_family, rational, CorpusError)
from fixtures_q2 import score, note
from fixtures_q3 import fixtures, EXPECTED


class FragmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = json.loads((ROOT/'scores/curriculum/grades.v1.json').read_text())
        cls.inputs = fixtures()
        cls.indices = {name: SourceIndex(normalize(raw), raw) for name, raw in cls.inputs.items()}

    def matching(self, name, lids=None, start=0, end=None):
        index = self.indices[name]
        lids = tuple(lids or index.a['lines'])
        end = end or len(index.measures[index.a['lines'][lids[0]]['partId']])
        return evaluate(index, lids, start, end, self.config)

    def test_each_profile_has_explicit_positive_fixture(self):
        for name, profile in EXPECTED.items():
            with self.subTest(name=name):
                matches, rejected, _ = self.matching(name)
                self.assertIn(profile, [m['profileId'] for m in matches], rejected)

    def test_interval_spelling_uses_upstream(self):
        self.assertEqual(upstream_interval(('E',0,4),('F',0,4))[:2], (2,1))
        self.assertEqual(upstream_interval(('C',0,4),('C',1,4))[:2], (1,1))
        self.assertEqual(upstream_interval(('C',0,4),('D',-1,4))[:2], (2,1))

    def test_new_focus_not_filled_with_lower_grade_review(self):
        matches, _, _ = self.matching('g1-steps')
        self.assertEqual({m['grade'] for m in matches}, {1})
        matches, _, _ = self.matching('g2-thirds')
        self.assertNotIn('g2-paired-eighths-steps', [m['profileId'] for m in matches])

    def test_thirds_and_new_rhythm_not_introduced_together(self):
        raw = score([''.join(note(s,kind='eighth') for s in 'CEDCCEDC')],divisions=2)
        i = SourceIndex(normalize(raw),raw)
        matches, _, _ = evaluate(i,('P1:s1:v1',),0,1,self.config)
        self.assertFalse(any(m['grade']==2 for m in matches))

    def test_tie_pedal_and_slur_cuts_rejected(self):
        for name, code in [('cut-tie','cut-tie'),('cut-pedal','cut-pedal'),('cut-slur','cut-or-cross-line-slur')]:
            with self.subTest(name=name):
                i=self.indices[name]
                self.assertIn(code,i.cut_reasons(('P1:s1:v1',),1,2))
                with self.assertRaises(CorpusError): project_xml(i,('P1:s1:v1',),1,2)

    def test_whole_tie_preserved_and_no_reattack_added(self):
        i=self.indices['cut-tie']; lids=('P1:s1:v1',)
        a=normalize(project_xml(i,lids,0,2))
        self.assertTrue(verify_projection(i,lids,0,2,a)['passed'])
        self.assertEqual(sum(bool(e.get('tieFrom')) for e in a['events']),1)

    def test_clean_excerpt_from_flagged_source_requires_new_gate(self):
        i=self.indices['recover-clean-bar']
        self.assertIn('text-direction-review',i.a['releaseBlockers'])
        a=normalize(project_xml(i,('P1:s1:v1',),1,2))
        self.assertEqual(a['releaseBlockers'],[])
        self.assertTrue(verify_projection(i,('P1:s1:v1',),1,2,a)['passed'])

    def test_projection_preserves_both_hands_and_selected_lower_line(self):
        i=self.indices['g5-both']
        for lids in [('P1:s1:v1','P1:s2:v5'),('P1:s2:v5',),('P1:s1:v1',)]:
            with self.subTest(lids=lids):
                a=normalize(project_xml(i,lids,0,2))
                self.assertTrue(verify_projection(i,lids,0,2,a)['passed'],a['issues'])
                self.assertEqual(a['parts'][0]['staves'],len(lids))
                if lids==('P1:s2:v5',):
                    self.assertEqual(verify_projection(i,lids,0,2,a)['lineMap'],{'P1:s2:v5':'P1:s1:v1'})

    def test_reimported_change_cannot_pass_projection(self):
        i=self.indices['g1-steps']; a=normalize(project_xml(i,('P1:s1:v1',),0,2))
        a['events'][0]['pitch']['midi']+=1
        self.assertFalse(verify_projection(i,('P1:s1:v1',),0,2,a)['passed'])

    def test_inherited_tempo_key_and_lower_clef(self):
        raw=self.inputs['g5-both'].replace(b'<note ',b'<direction><sound tempo="76"/></direction><note ',1)
        i=SourceIndex(normalize(raw),raw)
        a=normalize(project_xml(i,['P1:s2:v5'],1,2))
        self.assertTrue(verify_projection(i,('P1:s2:v5',),1,2,a)['passed'])
        self.assertEqual(a['tempos'],[{'at':rational(0),'quarterBpm':76.0}])
        self.assertIn({'sign':'F','line':4,'octaveChange':0},[c['value'] for c in a['contexts']])

    def test_held_note_crosses_boundary(self):
        i=deepcopy(self.indices['g1-steps'])
        e=i.a['events'][3];e['duration']=rational(2)
        modified=SourceIndex(i.a,self.inputs['g1-steps'])
        self.assertIn('cut-held-note',modified.cut_reasons(('P1:s1:v1',),1,2))

    def test_direction_spanner_must_be_wholly_contained(self):
        raw=self.inputs['g1-steps'].replace(b'<note ',b'<direction><direction-type><wedge type="crescendo" number="1"/></direction-type></direction><note ',1)
        pos=raw.rfind(b'</measure>')
        raw=raw[:pos]+b'<direction><direction-type><wedge type="stop" number="1"/></direction-type></direction>'+raw[pos:]
        i=SourceIndex(normalize(raw),raw)
        self.assertEqual(i.cut_reasons(('P1:s1:v1',),0,2),[])
        self.assertIn('cut-direction-spanner',i.cut_reasons(('P1:s1:v1',),1,2))

    def test_tempo_change_cannot_hide_faster_play_inside_profile(self):
        raw=self.inputs['g1-steps'].replace(b'<note ',b'<direction><sound tempo="60"/></direction><note ',1)
        raw=raw.replace(b'<measure number="2">',b'<measure number="2"><direction><sound tempo="180"/></direction>')
        i=SourceIndex(normalize(raw),raw)
        self.assertIn('tempo-change-needs-profile',i.cut_reasons(('P1:s1:v1',),0,2))
        self.assertNotIn('tempo-change-needs-profile',i.cut_reasons(('P1:s1:v1',),1,2))

    def test_unintroduced_expression_or_conflicting_fingering_blocked(self):
        for notation,code in [('<fermata/>','fermata-needs-profile'),
                              ('<articulations><staccato/></articulations>','articulation-needs-profile'),
                              ('<technical><fingering>5</fingering></technical>','source-fingering-template-conflict')]:
            raw=self.inputs['g1-steps'].replace(b'</note>',('<notations>'+notation+'</notations></note>').encode(),1)
            i=SourceIndex(normalize(raw),raw)
            matches,rejections,_=evaluate(i,('P1:s1:v1',),0,2,self.config)
            self.assertFalse(matches)
            self.assertIn(code,{c for codes in rejections.values() for c in codes})

    def test_windows_vary_length_and_never_chop_inside_bar(self):
        raw=score([''.join(note(s) for s in 'CDED')]*5)
        i=SourceIndex(normalize(raw),raw)
        windows=list(i.windows(4,12))
        self.assertEqual({n for _,_,_,n in windows},{4,8,12})
        self.assertTrue(all(end-start in (1,2,3) for _,start,end,_ in windows))
        large=score([''.join(note(s) for s in 'CDED')]*17)
        all_windows=list(SourceIndex(normalize(large),large).windows())
        self.assertEqual(max(n for _,_,_,n in all_windows),64)
        self.assertNotIn((('P1:s1:v1',),0,17,68),all_windows)

    def test_ending_tie_continuation_does_not_disappear_from_search(self):
        raw=score([''.join(note(s) for s in 'CDE')+note('F',extra='<tie type="start"/>'),
                   note('F',duration=4,kind='whole',extra='<tie type="stop"/>')])
        i=SourceIndex(normalize(raw),raw)
        self.assertIn((('P1:s1:v1',),0,2,4),list(i.windows()))
        self.assertEqual(i.cut_reasons(('P1:s1:v1',),0,2),[])

    def test_minor_key_not_inferred_as_major_from_signature(self):
        raw=self.inputs['g1-steps'].replace(b'</fifths>',b'</fifths><mode>minor</mode>')
        i=SourceIndex(normalize(raw),raw)
        matches,rejections,_=evaluate(i,('P1:s1:v1',),0,2,self.config)
        self.assertFalse(matches)
        self.assertIn('tonal-mode-needs-profile',rejections['all'])
        raw=self.inputs['g1-steps'].replace(b'<key>',b'<key number="1">').replace(b'</fifths>',b'</fifths><mode>major</mode>')
        raw=raw.replace(b'<measure number="2">',b'<measure number="2"><attributes><key><fifths>0</fifths><mode>minor</mode></key></attributes>')
        i=SourceIndex(normalize(raw),raw)
        self.assertEqual(i.key_modes[('P1',1)],{0:'minor'})
        for start in (0,1):
            matches,rejections,_=evaluate(i,('P1:s1:v1',),start,2,self.config)
            self.assertFalse(matches)
            self.assertTrue({'tonal-mode-needs-profile','context-change-needs-profile'}.intersection(rejections['all']))

    def test_long_note_or_written_rest_required_for_movement(self):
        i=self.indices['g6-leap']; a=deepcopy(i.a)
        for e in a['events']:
            if q(e['duration'])==2: e['duration']=rational(1)
        # Explicit witness cannot infer that a short-duration leap is prepared.
        from curriculum_fragments import movement_witness
        ee=[e for e in a['events'] if e['kind']=='note']
        ee[1]['onset']=rational(Fraction(3,2))
        templates=[t for t in self.config['handTemplates'] if t['hand']=='right' and t['fifths']==0]
        self.assertIsNone(movement_witness(ee,templates,750,80,1))

    def test_no_teacher_or_practice_approval_from_rules(self):
        self.assertTrue(all(not p['enabled'] for p in self.config['profiles']))
        self.assertTrue(all(t['reviewStatus']=='design-proposal' for t in self.config['handTemplates']))

    def test_motif_transposition_and_rhythm_identity(self):
        i=self.indices['g1-steps']; ee=i.a['events']; lids=['P1:s1:v1']
        original=content_hashes(ee,lids,Fraction(0),Fraction(8))
        transposed=deepcopy(ee)
        for e in transposed:
            e['pitch']['octave']+=1;e['pitch']['midi']+=12
        shifted=content_hashes(transposed,lids,Fraction(0),Fraction(8))
        self.assertNotEqual(original['exactHash'],shifted['exactHash'])
        self.assertEqual(original['motifGroupId'],shifted['motifGroupId'])
        transposed[0]['duration']=rational(2)
        self.assertNotEqual(original['motifGroupId'],content_hashes(transposed,lids,Fraction(0),Fraction(8))['motifGroupId'])

    def test_near_duplicate_transitive_windows_not_fake_variety(self):
        def c(id,lo,hi,motif=None,source='s'):
            return dict(id=id,sourceId=source,selection={'lineIds':['a']},span={'startTick':lo,'endTick':hi},exactHash=id,motifGroupId=motif or id)
        cc=group_candidates([c('a',0,8),c('b',4,12),c('c',8,16),c('d',30,35),c('e',0,8,'a','other-source')])
        groups={c['id']:c['nearDuplicateGroupId'] for c in cc}
        self.assertEqual(groups['a'],groups['c']);self.assertEqual(groups['a'],groups['e'])
        self.assertNotEqual(groups['a'],groups['d'])


if __name__=='__main__': unittest.main()
