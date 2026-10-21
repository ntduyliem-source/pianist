from copy import deepcopy
import unittest
from fixtures_grades import make,make_evidence,CONFIG
from fixtures_q2 import score,note
from curriculum_grades import assess_profile,assess_all,rhythm_check,selection_digest,context_digest
from curriculum_io import CorpusError


class GradeTests(unittest.TestCase):
    def result(self,parts):
        i,s,p,e,*_=parts
        return assess_profile(i,s,p,e,CONFIG)

    def test_every_profile_has_positive_negative_and_unknown_evidence_case(self):
        self.assertEqual(set(p['grade'] for p in CONFIG['profiles']),set(range(1,9)))
        for profile in CONFIG['profiles']:
            with self.subTest(profile=profile['id']):
                i,s,p,e,raw=make(profile['id'])
                r=assess_profile(i,s,p,e,CONFIG)
                self.assertEqual(r['status'],'pass',r)
                unknown=assess_profile(i,s,p,None,CONFIG)
                self.assertEqual(unknown['status'],'review',unknown)
                badraw=raw.replace(b'<step>C</step>',b'<step>C</step><alter>1</alter>',1)
                negative=self.result(make(profile['id'],badraw))
                self.assertEqual(negative['status'],'fail',negative)
                self.assertIn('diatonic-spelling',negative['failureRules'])

    def test_all_profiles_examined_without_promoting_every_higher_grade(self):
        i,s,p,e,_=make('g1-direction-quarters')
        rr=assess_all(i,s,{p['id']:e},CONFIG)
        self.assertEqual(len(rr),len(CONFIG['profiles']))
        self.assertEqual([r['profileId'] for r in rr if r['passed']],[p['id']])

    def test_stale_review_and_source_bindings(self):
        i,s,p,e,_=make('g1-direction-quarters')
        for key in ('contextSha256','selectionSha256','configSha256','rulesVersion','profileId'):
            wrong=deepcopy(e);wrong[key]='stale'
            self.assertIn('evidence-binding',assess_profile(i,s,p,wrong,CONFIG)['reviewRules'])
        s['sourceSha256']='0'*64
        with self.assertRaisesRegex(CorpusError,'source-analysis-binding'):assess_profile(i,s,p,e,CONFIG)

    def test_fingering_bpm_and_motion_cannot_be_invented(self):
        i,s,p,e,_=make('g4-position-shift')
        e['claims']['movements']=[]
        self.assertIn('movement-release-window',assess_profile(i,s,p,e,CONFIG)['reviewRules'])
        e=make_evidence(i,s,p)
        for row in e['claims']['handPath'].values():row['position']='one-position'
        self.assertIn('actual-position-shift',assess_profile(i,s,p,e,CONFIG)['failureRules'])
        i,s,p,e,_=make('g1-direction-quarters')
        for row in e['claims']['handPath'].values():row['finger']=1
        self.assertIn('source-fingering-and-position',assess_profile(i,s,p,e,CONFIG)['failureRules'])
        e=make_evidence(i,s,p);e['claims']['bpm']['max']=float('inf')
        self.assertIn('reviewed-bpm-scope',assess_profile(i,s,p,e,CONFIG)['reviewRules'])

    def test_triad_without_harmonic_context_stays_review(self):
        i,s,p,e,_=make('g3-arpeggio-fourth-fifth')
        e['claims']['musicalGroups']=[]
        self.assertIn('musical-group-context',assess_profile(i,s,p,e,CONFIG)['reviewRules'])

    def test_rhythm_cells_and_beat_units(self):
        for pid,family in [('g2-paired-eighths-steps','R3'),('g7-dotted','R4'),('g7-tie','R5'),('g7-syncopation','R6'),('g7-compound','R7')]:
            i,s,p,e,_=make(pid)
            result=rhythm_check(i,next(iter(s['lineHands'])),0,s['endMeasure'],family)
            self.assertTrue(result['passed'],result);self.assertTrue(result['witnessEventIds'])
        i,s,p,e,_=make('g7-compound');e['claims']['bpm']['beatQuarter']=1
        self.assertIn('reviewed-bpm-scope',assess_profile(i,s,p,e,CONFIG)['reviewRules'])
        # Same durations displaced onto beat 2 cannot pass the two-beat syncopation cell.
        raw=score([note('C',duration=2)+note('D',duration=1,kind='eighth')+note('E',duration=2)+note('D',duration=1,kind='eighth')+note('C',duration=2)],divisions=2)
        i,s,p,e,_=make('g7-syncopation',raw)
        self.assertIn('rhythm:P1:s1:v1',assess_profile(i,s,p,e,CONFIG)['failureRules'])

    def test_two_hands_count_held_keys_not_only_new_attacks(self):
        i,s,p,e,raw=make('g5-right-melody')
        raw=raw.replace(b'<octave>3</octave>',b'<octave>4</octave>')
        r=self.result(make('g5-right-melody',raw))
        self.assertIn('crossing-or-shared-held-key',r['failureRules'])

    def test_source_fingers_are_not_overwritten(self):
        _,_,_,_,raw=make('g1-direction-quarters')
        raw=raw.replace(b'</note>',b'<notations><technical><fingering>5</fingering></technical></notations></note>',1)
        r=self.result(make('g1-direction-quarters',raw))
        self.assertIn('source-fingering-and-position',r['failureRules'])

    def test_alternative_or_unresolved_fingering_stays_review(self):
        _,_,_,_,raw=make('g1-direction-quarters')
        raw=raw.replace(b'</note>',b'<notations><technical><fingering>1</fingering><fingering alternate="yes">2</fingering></technical></notations></note>',1)
        r=self.result(make('g1-direction-quarters',raw))
        self.assertIn('source-fingering-notation',r['reviewRules'])
        self.assertNotIn('source-fingering-and-position',r['failureRules'])

    def test_direction_change_and_leap_followup_are_real_focus(self):
        i,s,p,e,raw=make('g1-direction-change')
        raw=raw.replace(b'<step>D</step>',b'<step>F</step>',1)
        r=self.result(make('g1-direction-change',raw))
        self.assertEqual(r['status'],'fail')
        raw=score([note('C')+note('D')+note('C')+note('C',5)])
        r=self.result(make('g6-8-up',raw))
        self.assertIn('familiar-pattern-after-leap',r['failureRules'])

    def test_repeat_without_interval_focus_is_not_grade_one(self):
        r=self.result(make('g1-direction-quarters',score([note('C')*4])))
        self.assertIn('interval-focus',r['failureRules'])

    def test_basic_context_and_notation_exclusions(self):
        _,_,_,_,base=make('g1-direction-quarters')
        mutations=[
            (base.replace(b'<fifths>0</fifths>',b'<fifths>2</fifths>'),'key-signature','fail'),
            (base.replace(b'<mode>major</mode>',b'<mode>minor</mode>'),'major-tonality','fail'),
            (base.replace(b'<beats>4</beats>',b'<beats>5</beats>'),'meter','fail'),
            (base.replace(b'<sign>G</sign><line>2</line>',b'<sign>F</sign><line>4</line>'),'clef-register','review'),
            (base.replace(b'<octave>4</octave>',b'<octave>9</octave>'),'keyboard-range','fail'),
            (base.replace(b'</note>',b'<notations><fermata/></notations></note>',1),'notation-scope','review'),
        ]
        for raw,rule,status in mutations:
            with self.subTest(rule=rule):
                r=self.result(make('g1-direction-quarters',raw))
                self.assertTrue(any(c['rule']==rule and c['status']==status for c in r['checks']),r)
        i,s,p,e,_=make('g1-direction-quarters')
        for row in e['claims']['handPath'].values():row['finger']=6
        self.assertIn('hand-path-values',assess_profile(i,s,p,e,CONFIG)['failureRules'])

    def test_missing_position_proof_is_review_and_two_hands_need_two_roles(self):
        i,s,p,e,_=make('g4-position-shift');e['claims']['positions']={}
        r=assess_profile(i,s,p,e,CONFIG)
        self.assertIn('position-definitions',r['reviewRules']);self.assertIn('actual-position-shift',r['reviewRules'])
        i,s,p,e,_=make('g5-right-melody');s['lineHands']={lid:'right' for lid in s['lineHands']}
        e=make_evidence(i,s,p)
        self.assertIn('hand-configuration',assess_profile(i,s,p,e,CONFIG)['failureRules'])

    def test_shift_label_alone_is_not_proof_of_different_position(self):
        _,_,_,_,raw=make('g1-direction-quarters')
        i,s,p,e,_=make('g4-position-shift',raw)
        path=e['claims']['handPath'];last=list(path)[-1];path[last]['position']='renamed'
        e['claims']['positions']['right:renamed']=deepcopy(e['claims']['positions']['right:fixed'])
        self.assertIn('actual-position-shift',assess_profile(i,s,p,e,CONFIG)['failureRules'])

    def test_rest_phase_is_per_measure_and_rhythm_families_are_separate(self):
        raw=score([note('C')+note('D')+note('E'),note('D',duration=2,kind='half')+note('C')])
        raw=raw.replace(b'<beats>4</beats>',b'<beats>3</beats>')
        i,s,p,e,_=make('g1-direction-long',raw)
        self.assertTrue(rhythm_check(i,'P1:s1:v1',0,2,'R1')['passed'])
        i,s,p,e,_=make('g2-paired-eighths-steps')
        self.assertFalse(rhythm_check(i,'P1:s1:v1',0,1,'R0')['passed'])
        i,s,p,e,_=make('g7-tie')
        self.assertFalse(rhythm_check(i,'P1:s1:v1',0,1,'R3')['passed'])

    def test_sparse_accompaniment_and_new_register_have_actual_focus(self):
        i,s,p,e,raw=make('g5-right-melody')
        raw=raw.replace(b'<duration>8</duration><voice>5</voice><type>whole</type>',b'<duration>2</duration><voice>5</voice><type>quarter</type>')
        r=self.result(make('g5-right-melody',raw))
        self.assertIn('sparse-accompaniment',r['failureRules'])
        _,_,_,_,raw=make('g1-direction-quarters')
        r=self.result(make('g8-register',raw))
        self.assertIn('new-position-focus',r['failureRules'])
        i,s,p,e,_=make('g8-register');e['claims']['register']={}
        self.assertIn('register-reading-evidence',assess_profile(i,s,p,e,CONFIG)['reviewRules'])

    def test_one_leap_family_per_introduction(self):
        raw=score([note('C')+note('C',5)+note('D',4)+note('E',4)])
        r=self.result(make('g6-8-up',raw))
        self.assertIn('single-leap-family',r['failureRules'])

    def test_polyphony_and_cut_ties_cannot_pass_single_line_profile(self):
        _,_,_,_,raw=make('g1-direction-quarters')
        raw=raw.replace(b'<pitch><step>D</step>',b'<chord/><pitch><step>D</step>',1)
        r=self.result(make('g1-direction-quarters',raw))
        self.assertIn('monophony-and-held-notes',r['failureRules'])

    def test_new_positions_in_g_and_f_major_keep_written_accidentals(self):
        sources=[score([note('F',alter=1)+note('G')+note('A')+note('G')],fifths=1),
                 score([note('B',alter=-1)+note('A')+note('G')+note('A')],fifths=-1)]
        for raw in sources:
            r=self.result(make('g4-new-position',raw))
            self.assertEqual(r['status'],'pass',r)

    def test_release_window_reaches_the_end_of_a_tie_chain(self):
        raw=score([note('C',duration=4,kind='whole',extra='<tie type="start"/>'),
            note('C',duration=2,kind='half',extra='<tie type="stop"/>')+note('D')+note('E')])
        i,s,p,e,_=make('g4-position-shift',raw)
        e['claims']['movements'][0]['freeQuarter']={'numerator':2,'denominator':1}
        r=assess_profile(i,s,p,e,CONFIG)
        motion=[c for c in r['checks'] if c['rule']=='movement-release-window']
        self.assertTrue(motion)
        self.assertEqual(motion[0]['detail']['freeQuarter'],{'numerator':0,'denominator':1})
        self.assertEqual(motion[0]['status'],'review')

    def test_omitting_another_voice_of_the_same_hand_cannot_lower_grade(self):
        raw=score([note('C')+note('D')+note('E')+note('D')+
            '<backup><duration>4</duration></backup>'+note('G',duration=4,voice='2',kind='whole')])
        i,s,p,e,_=make('g1-direction-quarters',raw)
        s['lineHands']={'P1:s1:v1':'right'};e=make_evidence(i,s,p)
        self.assertIn('source-hand-completeness',assess_profile(i,s,p,e,CONFIG)['failureRules'])
        e['claims']['sourceLineHands']={}
        self.assertIn('source-hand-completeness',assess_profile(i,s,p,e,CONFIG)['reviewRules'])


if __name__=='__main__':unittest.main()
