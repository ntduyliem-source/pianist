"""One real source, exhaustive bar spans, explicit review, unchanged K2 rules.

This is a reproducible demonstration, NOT the full-corpus K3 scanner. Bar edges
are a superset to audit, not automatic musical boundaries. No release is made.
"""
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path
import argparse
import importlib.util
import json

from curriculum_fragments import line_features, pitch_name, content_hashes, project_xml, verify_projection, q
from curriculum_grades import assess_all, load_config, selection_digest, context_digest, VERSION
from curriculum_io import write_json, CorpusError
from curriculum_normalize import digest, encoded, normalize, piano_xml
from curriculum_prepared import upstream_rest_proposals

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('prepared_demo', Path(__file__).with_name('prepare-curriculum.py'))
prepared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepared)


def evidence(index, selection, review, profile, config, reference):
    notes = [e for e in index.selected(tuple(selection['lineHands']), selection['startMeasure'], selection['endMeasure']) if e['kind']=='note']
    path = {}
    for event in notes:
        hand = selection['lineHands'][event['lineId']]
        keys = review['positions'][hand+':home']['keys']
        finger = next((r['finger'] for r in keys if tuple(r['pitch'])==pitch_name(event['pitch'])), None)
        if finger is not None:
            path[event['id']] = {'hand':hand, 'position':'home', 'finger':finger}
    groups = []
    for group in review['harmonicGroups']:
        if group['lineId'] not in selection['lineHands']:continue
        for mi in group['measureIndices']:
            if not selection['startMeasure']<=mi<selection['endMeasure']:continue
            events = [e for e in index.by_bar[(group['lineId'],mi)] if e['kind']=='note']
            if [list(pitch_name(e['pitch'])) for e in events]!=group['expectedPitches']:
                raise CorpusError('reviewed-harmonic-group-no-longer-matches')
            groups.append({'kind':group['kind'],'eventIds':[e['id'] for e in events],
                           'reason':group['reason'],'reference':reference+'#harmonicGroups'})
    return {'selectionSha256':selection_digest(selection),'contextSha256':context_digest(index,selection),
        'rulesVersion':VERSION,'profileId':profile['id'],'configSha256':digest(encoded(config).encode()),
        'reviewer':review['reviewer'],'reviewedAt':review['reviewedAt'],
        'method':'assistant-source-context-and-native-score-inspection','reference':reference,
        'claims':{'sourceLineHands':review['sourceLineHands'], 'handPath':path,
            'positions':review['positions'],'bpm':review['bpm'],
            'tonality':{lid:review['tonality'] for lid in selection['lineHands']},
            'musicalGroups':groups,'movements':[]}}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--review',type=Path,default=ROOT/'scores/curriculum/examples/mary-k3-review.json')
    p.add_argument('--output',type=Path,default=ROOT/'artifacts/curriculum-k3-one-song')
    p.add_argument('--corpus',type=Path,default=ROOT/'artifacts/curriculum-corpus')
    p.add_argument('--normalized',type=Path,default=ROOT/'artifacts/curriculum-normalized')
    args=p.parse_args(); review=json.loads(args.review.read_text(encoding='utf8')); config=load_config()
    index,source=prepared.load_source(args,review['sourceSha256'])
    if source['analysisSha256']!=review['analysisSha256']:raise CorpusError('stale-review-analysis')
    proof=review['sourceScoreInspection']; snapshot_path=ROOT/proof['snapshot']
    if digest(snapshot_path.read_bytes())!=proof['snapshotSha256']:raise CorpusError('stale-source-inspection')
    data=(args.corpus/prepared.source_path(args,source['sourceSha256'])).read_bytes()
    source_xml,_=piano_xml(data)
    if digest(source_xml)!=proof['sourceXmlSha256']:raise CorpusError('stale-source-xml')
    (args.output/'candidates').mkdir(parents=True,exist_ok=True)
    (args.output/'projected').mkdir(exist_ok=True)
    (args.output/'source.musicxml').write_bytes(source_xml)
    write_json(args.output/'source-analysis.json',index.a)
    write_json(args.output/'rest-proposals.json',{lid:upstream_rest_proposals(index,lid) for lid in index.a['lines']})
    hands=review['sourceLineHands']; pid=next(iter(index.parts)); bars=len(index.measures[pid])
    if set(hands)!=set(index.a['lines']) or len(hands)!=2 or set(hands.values())!={'left','right'}:
        raise CorpusError('demo-requires-reviewed-two-single-voice-hands')
    variants=[{lid:hand} for lid,hand in hands.items()]+[hands]
    bounds={hand:{b['atMeasure']:b['reason'] for b in rr} for hand,rr in review['boundaries'].items()}
    reference=args.review.relative_to(ROOT).as_posix()
    summaries=[]; native_jobs=[]; render_jobs=[]
    for line_hands in variants:
        hand=next(iter(line_hands.values())) if len(line_hands)==1 else 'both'
        lids=tuple(sorted(line_hands))
        for start,end in combinations(range(bars+1),2):
            id_=f'{hand}-{start+1:02d}-{end:02d}'
            selection={**{k:source[k] for k in ('sourceSha256','analysisSha256')},
                       'lineHands':line_hands,'startMeasure':start,'endMeasure':end}
            ee=index.selected(lids,start,end); lo,hi=index.boundaries(lids,start,end)
            N=sum(e['kind']=='note' and not e.get('tieFrom') for e in ee)
            boundary_ok=all(start in bounds[h] and end in bounds[h] for h in line_hands.values())
            boundary={'status':'reviewed-local' if boundary_ok else 'needs-review',
                'reviewer':review['reviewer'],'teacherReviewed':False,
                'startReasons':{h:bounds[h].get(start,'Chưa có quyết định biên cho tay này.') for h in set(line_hands.values())},
                'endReasons':{h:bounds[h].get(end,'Chưa có quyết định biên cho tay này.') for h in set(line_hands.values())}}
            by_profile={profile['id']:evidence(index,selection,review,profile,config,reference) for profile in config['profiles']}
            results=assess_all(index,selection,by_profile,config)
            passes=[r['profileId'] for r in results if r['passed']]
            pending=[r['profileId'] for r in results if r['status']=='review']
            status='pass-local' if passes and boundary_ok else 'review' if passes or pending else 'fail'
            summary={'id':id_,'hand':hand,'startMeasure':start,'endMeasure':end,'sourceAttackCount':N,
                'boundary':boundary,'status':status,'passedProfiles':passes,'reviewProfiles':pending,
                'contentHashes':content_hashes(ee,lids,lo,hi-lo),
                'profileVerdicts':[{'id':r['profileId'],'grade':r['grade'],'status':r['status'],
                    'failures':r['failureRules'],'reviews':r['reviewRules']} for r in results],
                'intervals':{lid:line_features(index.selected((lid,),start,end))['intervals'] for lid in lids}}
            detailed={**summary,'selection':selection,'gradeEvidence':by_profile,'results':results}
            if status=='pass-local':
                xml=project_xml(index,lids,start,end); analysis=normalize(xml)
                projection=verify_projection(index,lids,start,end,analysis)
                if not projection['passed']:raise CorpusError('projection-mismatch:'+id_)
                folder=args.output/'projected'/id_;folder.mkdir(exist_ok=True)
                xml_path=folder/'exercise.musicxml';xml_path.write_bytes(xml)
                raw=encoded(analysis).encode();(folder/'analysis.json').write_bytes(raw)
                detailed['projection']=projection
                native_jobs.append({'id':id_,'xml':str(xml_path),'xmlSha256':digest(xml),
                    'analysis':str(folder/'analysis.json'),'analysisSha256':digest(raw),
                    'expectedTargets':N,'expectEligible':True,'hand':hand})
                # Three readable examples; the independent native oracle checks
                # every accepted selection, including overlapping duplicates.
                if (hand,start,end) in [('right',0,2),('right',0,4),('left',0,1)]:
                    render_jobs.append(native_jobs[-1])
            write_json(args.output/'candidates'/(id_+'.json'),detailed)
            summaries.append(summary)
    assert len(summaries)==3*bars*(bars+1)//2
    assert len({r['id'] for r in summaries})==len(summaries)
    accepted=[r for r in summaries if r['status']=='pass-local']
    distinct=defaultdict(list)
    for row in accepted:distinct[row['contentHashes']['exactHash']].append(row['id'])
    pipeline=digest(encoded({'source':source['sourceSha256'],'review':review,
        'config':config,'builder':digest(Path(__file__).read_bytes()),
        'grader':digest((ROOT/'buildscripts/pianist/curriculum_grades.py').read_bytes())}).encode())
    write_json(args.output/'jobs.json',{'pipeline':pipeline,'entries':native_jobs})
    write_json(args.output/'render-jobs.json',{'pipeline':pipeline,'entries':render_jobs})
    report={'scope':'One source demonstration; exhaustive measure spans, not full K3 and not a released exercise catalog',
        'source':source,'sourceInspection':proof,'review':reference,'reviewSha256':digest(args.review.read_bytes()),
        'pipeline':pipeline,'bars':bars,'sourceNotes':sum(e['kind']=='note' for e in index.a['events']),
        'windowsPerHand':bars*(bars+1)//2,'handConfigurations':len(variants),'candidates':len(summaries),
        'profileChecks':len(summaries)*len(config['profiles']),
        'boundaryReviewed':sum(r['boundary']['status']=='reviewed-local' for r in summaries),
        'outcomes':dict(Counter(r['status'] for r in summaries)),
        'profileOutcomes':dict(Counter(v['status'] for r in summaries for v in r['profileVerdicts'])),
        'acceptedSelections':len(accepted),'distinctAcceptedContents':len(distinct),
        'exactContentGroups':dict(distinct),'publishedExercises':0,'entries':summaries}
    write_json(args.output/'report.json',report)
    print(json.dumps({k:v for k,v in report.items() if k not in ('entries','exactContentGroups','source','sourceInspection')},ensure_ascii=False))


if __name__=='__main__':main()
