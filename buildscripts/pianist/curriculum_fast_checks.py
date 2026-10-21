"""Indexed contradictions of literal K2 rules; never a replacement grader.

All surviving profiles still run assess_profile. Prefix/index lookups avoid
rebuilding the same music21 intervals for millions of overlapping spans.
"""
from bisect import bisect_left
from collections import defaultdict

import music21 as m21
from curriculum_fragments import q, pitch_name, upstream_interval
from curriculum_grades import ALLOWED
from curriculum_selection import bounds


def first_in(indices, start, end):
    at=bisect_left(indices,start)
    return indices[at] if at<len(indices) and indices[at]<end else None


class FastChecks:
    def __init__(self,index,config):
        self.index=index;self.lines={};self.failures={}
        for lid,ee in index.by_line.items():
            notes=sorted((e for e in ee if e['kind']=='note'),key=lambda e:(q(e['onset']),e['sourceOrder']))
            attacks=[e for e in notes if not e.get('tieFrom')]
            pairs=[];bad_interval={n:[] for n in range(1,9)};sizes=defaultdict(list);directed=defaultdict(list);up=[];down=[]
            for j,(a,b) in enumerate(zip(attacks,attacks[1:])):
                dia,semi,name=upstream_interval(pitch_name(a['pitch']),pitch_name(b['pitch']))
                pairs.append((a['id'],b['id']));sizes[abs(dia)].append(j)
                directed[(abs(dia),'up' if semi>0 else 'down')].append(j)
                if semi>0:up.append(j)
                if semi<0:down.append(j)
                for limit in bad_interval:
                    if abs(dia)>limit or name.replace('-','') not in ALLOWED.get(abs(dia),set()):bad_interval[limit].append(j)
            diatonic={}
            for fifths in set(f for p in config['profiles'] for f in p['fifths']):
                key=m21.key.KeySignature(fifths)
                alterations={s:(key.accidentalByStep(s).alter if key.accidentalByStep(s) else 0) for s in 'CDEFGAB'}
                diatonic[fifths]=[j for j,e in enumerate(notes) if e['pitch']['alter']!=alterations[e['pitch']['step']]]
            self.lines[lid]={'notes':notes,'times':[q(e['onset']) for e in notes],
                'attacks':attacks,'attackTimes':[q(e['onset']) for e in attacks],
                'pairs':pairs,'intervals':bad_interval,'sizes':sizes,'directed':directed,'up':up,'down':down,
                'overlap':[j for j,(a,b) in enumerate(zip(notes,notes[1:])) if q(a['onset'])+q(a['duration'])>q(b['onset'])],
                'keyboard':[j for j,e in enumerate(notes) if not (21<=e['pitch']['midi']<=108 and int(e['pitch']['midi'])==e['pitch']['midi'])],
                'diatonic':diatonic,
                'away':{side:[j for j,e in enumerate(notes) if pitch_name(e['pitch']) not in {(s,0,octave) for s in 'CDEFG'}]
                        for side,octave in (('right',4),('left',3))}}

    def view(self,selection):
        lo,hi=bounds(self.index,selection);result=[]
        for lid,side in selection['lineHands'].items():
            d=self.lines[lid]
            result.append((lid,side,d,bisect_left(d['times'],lo),bisect_left(d['times'],hi),
                           bisect_left(d['attackTimes'],lo),bisect_left(d['attackTimes'],hi),self.index.context(lid,lo)))
        return result

    def contradiction(self,selection,profile,view):
        def fail(rule,ids=()):
            key=(profile['id'],rule,tuple(ids))
            if key not in self.failures:
                if len(self.failures)>=65536:self.failures.pop(next(iter(self.failures)))
                self.failures[key]={'profileId':profile['id'],'grade':profile['grade'],'status':'fail',
                                   'failureRules':[rule],'reviewRules':[],'witnessEventIds':list(ids)}
            return self.failures[key]
        hands=selection['lineHands']
        if len(hands)!=profile['lines'] or len(set(hands.values()))!=len(hands):return fail('hand-configuration')
        focused=False;size2=False;up=False;down=False;away=False;motion=False
        for lid,side,d,nlo,nhi,alo,ahi,ctx in view:
            key=ctx.get('key',{});fifths=key.get('fifths')
            if fifths not in profile['fifths']:return fail('key-signature')
            if ctx.get('meter',{}).get('ratio') not in profile['meters']:return fail('meter')
            if key.get('mode') and key['mode']!='major':return fail('major-tonality')
            for rule,indices,end in (('monophony-and-held-notes',d['overlap'],nhi-1),
                                     ('keyboard-range',d['keyboard'],nhi),
                                     ('diatonic-spelling',d['diatonic'][fifths],nhi)):
                at=first_in(indices,nlo,end)
                if at is not None:return fail(rule,[d['notes'][at]['id']])
            at=first_in(d['intervals'][profile['maxInterval']],alo,ahi-1)
            if at is not None:return fail('spelled-interval-limit',d['pairs'][at])
            out=first_in(d['away'][side],nlo,nhi)
            if profile['movement']=='home' and out is not None:return fail('home-register',[d['notes'][out]['id']])
            away|=out is not None
            present={size for size,positions in d['sizes'].items() if first_in(positions,alo,ahi-1) is not None}
            size2|=2 in present;motion|=bool(present & {2,3,4,5})
            up|=first_in(d['up'],alo,ahi-1) is not None;down|=first_in(d['down'],alo,ahi-1) is not None
            for size in profile.get('focusIntervals',[]):
                positions=d['directed'].get((size,profile['direction']),[]) if profile.get('direction') else d['sizes'].get(size,[])
                focused|=first_in(positions,alo,ahi-1) is not None
            if profile['focus']=='leap' and any(s>5 and s not in profile['focusIntervals'] for s in present):return fail('single-leap-family')
        focus=profile['focus']
        if focus in ('steps','thirds','melodic','arpeggio','leap') and (not focused or focus=='thirds' and not size2):return fail('interval-focus')
        if focus=='steps' and profile.get('changeDirection') and not(up and down):return fail('direction-change')
        if focus=='position' and not motion:return fail('familiar-motion-focus')
        if profile['movement'] in ('new-position','register') and not away:return fail('new-position-focus')
        return None
