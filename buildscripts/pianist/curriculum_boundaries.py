"""Source-mapped proposals from verbatim upstream LBDM, not phrase approval."""
import importlib.util
from pathlib import Path

from curriculum_fragments import q, line_features
from curriculum_normalize import rational

ROOT=Path(__file__).resolve().parents[2]
UPSTREAM=ROOT/'third_party/curriculum-sources/mtc-lbdm/lbdm.py'
spec=importlib.util.spec_from_file_location('mtc_lbdm',UPSTREAM)
lbdm=importlib.util.module_from_spec(spec);spec.loader.exec_module(lbdm)
VERSION='mtc-lbdm-proposals-v1'


def strengths(pitches,onsets,ends):
    if not len(pitches)==len(onsets)==len(ends):raise ValueError('lbdm-input-length')
    if any(b<=a for a,b in zip(onsets,onsets[1:])):raise ValueError('lbdm-requires-strict-onsets')
    if any(end<=on or (i+1<len(onsets) and end>onsets[i+1]) for i,(on,end) in enumerate(zip(onsets,ends))):
        raise ValueError('lbdm-requires-monophony')
    chromatic=[None]+[b-a for a,b in zip(pitches,pitches[1:])] if pitches else []
    ioi=[float(b-a) for a,b in zip(onsets,onsets[1:])]+[None] if pitches else []
    rests=[str(max(0,b-a)) for a,b in zip(ends,onsets[1:])]+[None] if pitches else []
    sp=lbdm.getBoundaryStrengthPitch(lbdm.getDegreeChangeLBDMpitch(chromatic),chromatic)
    si=lbdm.getBoundaryStrengthIOI(lbdm.getDegreeChangeLBDMioi(ioi),ioi)
    sr=lbdm.getBoundaryStrengthRest(lbdm.getDegreeChangeLBDMrest(rests),rests)
    return lbdm.getLocalBoundaryStrength(sp,si,sr)


def positive_peaks(values):
    # Product policy: every positive local maximum; the rightmost position of
    # a flat maximum is retained. No top-N or desired-note-count threshold.
    return [i for i,v in enumerate(values) if v is not None and v>0 and
            v>=(values[i-1] or 0 if i else 0) and
            v>(values[i+1] or 0 if i+1<len(values) else 0)]


def propose(index,lid):
    events=index.by_line[lid];pid=index.a['lines'][lid]['partId'];bars=index.measures[pid]
    edges={q(m['start']):m['index'] for m in bars}
    edges[q(bars[-1]['start'])+q(bars[-1]['duration'])]=len(bars)
    base={'version':VERSION,'status':'model-proposal-only','lineId':lid,
        'barEdges':[{'atMeasure':0,'kind':'source-start'},{'atMeasure':len(bars),'kind':'source-end'}],
        'points':[],'unsupported':[]}
    if not line_features(events)['monophonic']:
        base['unsupported']=['polyphonic-line'];return base
    attacks=[e for e in events if e['kind']=='note' and not e.get('tieFrom')]
    onsets=[];ends=[]
    for e in attacks:
        tail=e;seen={tail['id']}
        while tail.get('tieTo'):
            tail=index.events[tail['tieTo']]
            if tail['id'] in seen:raise ValueError('cyclic-source-tie')
            seen.add(tail['id'])
        onsets.append(q(e['onset']));ends.append(q(tail['onset'])+q(tail['duration']))
    try:
        values=strengths([e['pitch']['midi'] for e in attacks],onsets,ends)
    except ValueError as error:
        base['unsupported']=[str(error)];return base
    peaks=set(positive_peaks(values))
    for i,(event,value) in enumerate(zip(attacks,values)):
        at=onsets[i+1] if i+1<len(onsets) else None
        row={'afterEvent':event['id'],'strength':value,'peak':i in peaks,
             'nextOnset':rational(at) if at is not None else None,
             'atMeasure':edges.get(at),'noteEnd':rational(ends[i])}
        base['points'].append(row)
        if i in peaks and at in edges:
            base['barEdges'].append({'atMeasure':edges[at],'kind':'lbdm-positive-peak',
                                    'afterEvent':event['id'],'strength':value})
    # Model peaks inside a bar remain in points, not snapped to a nearby bar.
    base['barEdges']=sorted({e['atMeasure']:e for e in base['barEdges']}.values(),key=lambda e:e['atMeasure'])
    return base
