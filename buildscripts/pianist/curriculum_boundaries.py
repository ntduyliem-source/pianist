"""Source-mapped proposals from verbatim upstream LBDM, not phrase approval."""
import importlib.util
from pathlib import Path

from curriculum_fragments import q, line_features
from curriculum_normalize import rational
from curriculum_prepared import upstream_rest_proposals
from curriculum_regions import monophonic_regions

ROOT=Path(__file__).resolve().parents[2]
UPSTREAM=ROOT/'third_party/curriculum-sources/mtc-lbdm/lbdm.py'
spec=importlib.util.spec_from_file_location('mtc_lbdm',UPSTREAM)
lbdm=importlib.util.module_from_spec(spec);spec.loader.exec_module(lbdm)
VERSION='mtc-lbdm-and-music21-rest-exact-proposals-v4'


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
        'exactEdges':[{'atQuarter':rational(q(bars[0]['start'])),'kind':'source-start'},
                      {'atQuarter':rational(q(bars[-1]['start'])+q(bars[-1]['duration'])),'kind':'source-end'}],
        'points':[],'unsupported':[]}
    regions,excluded=monophonic_regions(index,lid)
    base['modelExcludedEventIds']=excluded
    if excluded:base['unsupported']=['polyphonic-or-zero-duration-events']
    base['modelRegions']=[[e['id'] for e in group] for group in regions]
    base['restSegments']={'segments':[],'regions':[]}
    for region in regions:
        rest_proposals=upstream_rest_proposals(index,lid,region)
        base['restSegments']['regions'].append(rest_proposals)
        base['restSegments']['segments'].extend(rest_proposals['segments'])
        if excluded:
            first,last=region[0],region[-1]
            for side,at in (('start',q(first['onset'])),('end',q(last['onset'])+q(last['duration']))):
                base['exactEdges'].append({'atQuarter':rational(at),'kind':'monophonic-region-'+side})
        for group in rest_proposals['segments']:
            first,last=index.events[group[0]],index.events[group[-1]]
            for side,at in (('start',q(first['onset'])),('end',q(last['onset'])+q(last['duration']))):
                base['exactEdges'].append({'atQuarter':rational(at),'kind':'music21-rest-segment-'+side,
                                          'eventIds':group,'upstream':rest_proposals['upstream']})
        attacks=[e for e in region if e['kind']=='note' and not e.get('tieFrom')]
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
            base['unsupported'].append(str(error));continue
        peaks=set(positive_peaks(values))
        for i,(event,value) in enumerate(zip(attacks,values)):
            at=onsets[i+1] if i+1<len(onsets) else None
            row={'afterEvent':event['id'],'strength':value,'peak':i in peaks,
                 'nextOnset':rational(at) if at is not None else None,
                 'atMeasure':edges.get(at),'noteEnd':rational(ends[i])}
            base['points'].append(row)
            if i in peaks and at is not None:
                base['exactEdges'].append({'atQuarter':rational(at),'kind':'lbdm-positive-peak',
                                          'afterEvent':event['id'],'strength':value})
    # Interior peaks have exact source time. The legacy bar-only list remains
    # for comparing previous trials, not for rounding away interior proposals.
    combined={}
    for row in base['exactEdges']:
        at=q(row['atQuarter'])
        if at not in combined:combined[at]={**row,'support':[]}
        combined[at]['support'].append({k:v for k,v in row.items() if k!='atQuarter'})
    base['exactEdges']=sorted(combined.values(),key=lambda e:q(e['atQuarter']))
    base['barEdges']=[{**row,'atMeasure':edges[q(row['atQuarter'])]} for row in base['exactEdges'] if q(row['atQuarter']) in edges]
    return base
