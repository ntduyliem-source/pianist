"""Synthetic policy examples ONLY. These are never imported as real exercises."""
from copy import deepcopy
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'buildscripts/pianist'))
from curriculum_normalize import normalize,digest,encoded,rational
from curriculum_fragments import SourceIndex,q,line_features
from curriculum_grades import load_config,selection_digest,context_digest,VERSION
from fixtures_q2 import score,note

CONFIG=load_config()


def quarters(pitches,voice='1',staff=1):
    return ''.join(note(s,o,2,voice=voice,staff=staff) for s,o in pitches)


def make(profile_id,raw=None):
    p=next(x for x in CONFIG['profiles'] if x['id']==profile_id)
    both=p['lines']==2
    hand=p.get('melodyHand','right')
    low=3 if hand=='left' else 4
    melody='CDED';bodies=[]
    if profile_id=='g1-direction-long':
        bodies=[note('C',duration=2)+note('D',duration=2)+note('E',duration=4,kind='half')]
    elif profile_id=='g1-direction-rests':
        bodies=[note('C',duration=2)+note('D',duration=2)+note(None,duration=2)+note('E',duration=2)]
    elif profile_id=='g2-third-known-rhythm':melody='CEDE'
    elif profile_id.startswith('g3-melodic'):melody='CFED'
    elif profile_id.startswith('g3-arpeggio'):melody='CGEF'
    elif profile_id in ('g4-new-position','g8-register'):melody='ABCB'
    elif profile_id=='g4-position-shift':
        bodies=[quarters([(s,4) for s in 'CDEF']),quarters([('G',4),('A',4),('B',4),('C',5)])]
    elif p['grade']==6:
        leap=p['focusIntervals'][0];target={6:('A',4),7:('B',4),8:('C',5)}[leap]
        pitches=[('C',4),target,('B',4) if leap==6 else ('A',4) if leap==7 else ('B',4),target]
        if p['direction']=='down':pitches=[target,('C',4),('D',4),('C',4)]
        bodies=[quarters(pitches)]
    elif profile_id=='g7-dotted':
        bodies=[quarters([(s,4) for s in 'CDED']),note('C',duration=3,extra='<dot/>')+note('D',duration=1,kind='eighth')+quarters([('E',4),('F',4)])]
    elif profile_id=='g7-tie':
        bodies=[note('C',duration=1,kind='eighth')+note('D',duration=1,kind='eighth',extra='<tie type="start"/>')+
                note('D',duration=2,extra='<tie type="stop"/>')+quarters([('E',4),('F',4)])]
    elif profile_id=='g7-syncopation':
        bodies=[quarters([(s,4) for s in 'CDED']),note('C',duration=1,kind='eighth')+note('D',duration=2)+note('E',duration=1,kind='eighth')+quarters([('F',4),('G',4)])]
    elif profile_id=='g7-compound':
        bodies=[''.join(note(s,duration=1,kind='eighth') for s in 'CDEFGF')]
    if not bodies:
        if 'R3' in p['rhythms'] and (p['grade']==2 or both):
            body=''.join(note(s,low,1,kind='eighth',voice='5' if hand=='left' else '1',staff=2 if hand=='left' else 1) for s in 'CDEFGFED')
        else:
            pitches=[(s,5 if s=='C' and p['movement'] in ('new-position','register') else low) for s in melody]
            body=quarters(pitches,voice='5' if hand=='left' else '1',staff=2 if hand=='left' else 1)
        if both:
            accompaniment=note('C',4 if hand=='left' else 3,8,kind='whole',voice='1' if hand=='left' else '5',staff=1 if hand=='left' else 2)
            body+= '<backup><duration>8</duration></backup>'+accompaniment
        bodies=[body]
    if raw is None:
        raw=score(bodies,divisions=2,staves=2 if both else 1,title='Synthetic K2 policy fixture, not curriculum')
        raw=raw.replace(b'<fifths>0</fifths>',b'<fifths>0</fifths><mode>major</mode>')
        if profile_id=='g7-compound':raw=raw.replace(b'<beats>4</beats><beat-type>4</beat-type>',b'<beats>6</beats><beat-type>8</beat-type>')
    a=normalize(raw);i=SourceIndex(a,raw)
    selection={'sourceSha256':digest(raw),'analysisSha256':digest(encoded(a).encode()),
        'lineHands':{lid:'left' if a['lines'][lid]['staff']==2 else 'right' for lid in a['lines']},
        'startMeasure':0,'endMeasure':len(i.measures['P1'])}
    evidence=make_evidence(i,selection,p)
    return i,selection,p,evidence,raw


def make_evidence(index,selection,profile):
    hands=selection['lineHands'];start,end=selection['startMeasure'],selection['endMeasure']
    events=index.selected(tuple(hands),start,end);notes=[e for e in events if e['kind']=='note']
    path={};maps={}
    for e in notes:
        position='away' if profile['movement']=='shift' and e['measureIndex'] else 'fixed'
        key=(hands[e['lineId']],position);maps.setdefault(key,[])
        pitch=e['pitch']['midi']
        if pitch not in maps[key]:maps[key].append(pitch)
        path[e['id']]={'hand':key[0],'position':position,'finger':maps[key].index(pitch)+1}
    bpm={'min':40,'max':60,'beatQuarter':profile['beatQuarter'],'reference':'Synthetic test scope; no physiological claim'}
    definitions={}
    for e in notes:
        row=path[e['id']];key=row['hand']+':'+row['position']
        definition=definitions.setdefault(key,{'anchorFinger':1,'keys':[],'reference':'Synthetic position only'})
        entry={'finger':row['finger'],'pitch':[e['pitch'][k] for k in ('step','alter','octave')]}
        if entry not in definition['keys']:definition['keys'].append(entry)
    claims={'tonality':{lid:'major' for lid in hands},'handPath':path,'positions':definitions,'bpm':bpm,
        'sourceLineHands':{lid:'left' if info['staff']==2 else 'right' for lid,info in index.a['lines'].items()},
        'register':{'eventIds':[e['id'] for e in notes],'reference':'Synthetic register evidence','notationReason':'Synthetic treble reading example'},
        'musicalGroups':[{'kind':profile['focus'],'eventIds':[e['id'] for e in notes[:3]],'reference':'Synthetic harmonic/motif evidence','reason':'Only for verifying the policy gate'}],
        'movements':[]}
    for lid in hands:
        seq=line_features([e for e in events if e['lineId']==lid])['attacks']
        for a,b in zip(seq,seq[1:]):
            tail=a
            while tail.get('tieTo'):tail=index.events[tail['tieTo']]
            free=q(b['onset'])-q(tail['onset'])-q(tail['duration'])
            claims['movements'].append({'from':a['id'],'to':b['id'],'freeQuarter':rational(free),
                'bpm':deepcopy(bpm),'reference':'Synthetic motion evidence only','technique':'Synthetic reviewed transition','resolvedLegato':True})
    return {'selectionSha256':selection_digest(selection),'contextSha256':context_digest(index,selection),
        'rulesVersion':VERSION,'profileId':profile['id'],'configSha256':digest(encoded(CONFIG).encode()),
        'reviewer':'Synthetic fixture, not a teacher or source author','reviewedAt':'2026-10-21',
        'method':'synthetic-test-only','reference':'tests/curriculum/fixtures_grades.py','claims':claims}
