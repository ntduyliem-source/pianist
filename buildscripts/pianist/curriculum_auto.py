"""Resumable corpus scan with upstream LBDM; no per-source review input.

Estimates are labelled as estimates. K2 evidence requirements stay in force;
structural fit is reported separately from approved/publishable exercises.
"""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import gzip
import importlib.util
from itertools import combinations,product
import json
from pathlib import Path
import sqlite3
import zlib
import time
from bisect import bisect_left

from curriculum_boundaries import propose,VERSION
from curriculum_fragments import SourceIndex,line_features,q
from curriculum_grades import assess_profile,load_config,ALLOWED
from curriculum_io import RunLock,within,write_json,CorpusError
from curriculum_normalize import digest,encoded
from curriculum_workers import results
from curriculum_selection import make_selection, events as selected_events, integrity as selection_integrity, verified_scan, bounds
from curriculum_evidence import builder, identity as evidence_identity, VERSION as EVIDENCE_VERSION
from curriculum_fast_checks import FastChecks
from curriculum_scan_storage import pack_payload,unpack_payload

ROOT=Path(__file__).resolve().parents[2]


def rules_identity():
    paths=['buildscripts/pianist/curriculum_auto.py','buildscripts/pianist/curriculum_boundaries.py',
           'buildscripts/pianist/curriculum_grades.py','buildscripts/pianist/curriculum_fragments.py',
           'buildscripts/pianist/curriculum_prepared.py',
           'buildscripts/pianist/curriculum_workers.py','scores/curriculum/grades.v3.json',
           'buildscripts/pianist/curriculum_evidence.py','buildscripts/pianist/curriculum_selection.py',
           'buildscripts/pianist/curriculum_regions.py',
           'buildscripts/pianist/curriculum_fast_checks.py',
           'buildscripts/pianist/curriculum_scan_storage.py',
           'third_party/curriculum-sources/mtc-lbdm/lbdm.py']
    return digest(encoded({'files':{p:digest((ROOT/p).read_bytes()) for p in paths},
                           'evidence':evidence_identity()}).encode())


def check_profiles(index,selection,config,evidence_builder=None,fast=None):
    lids=tuple(selection['lineHands']);start,end=selection['startMeasure'],selection['endMeasure']
    lo,_=bounds(index,selection)
    contexts={lid:index.context(lid,lo) for lid in lids}
    intervals=[i for lid in lids for i in line_features(selected_events(index,selection,(lid,)))['intervals']] if fast is None else []
    view=fast.view(selection) if fast is not None else None
    verdicts=[]
    for p in config['profiles']:
        if fast is not None:
            contradiction=fast.contradiction(selection,p,view)
            if contradiction is not None:
                verdicts.append(contradiction);continue
        # Exact K2 predicates as early exits, with source witnesses. Full K2 is
        # run for every profile surviving these inexpensive contradictions.
        bad=[i for i in intervals if abs(i['diatonic'])>p['maxInterval'] or
             i['name'].replace('-','') not in ALLOWED.get(abs(i['diatonic']),set())]
        if len(lids)!=p['lines'] or len(set(selection['lineHands'].values()))!=len(lids):
            verdicts.append({'profileId':p['id'],'grade':p['grade'],'status':'fail',
                             'failureRules':['hand-configuration'],'reviewRules':[],'witnessEventIds':[]})
        elif bad:
            verdicts.append({'profileId':p['id'],'grade':p['grade'],'status':'fail',
                'failureRules':['spelled-interval-limit'],'reviewRules':[],
                'witnessEventIds':sorted({e for i in bad for e in (i['from'],i['to'])})})
        elif any(c.get('key',{}).get('fifths') not in p['fifths'] or
                 c.get('meter',{}).get('ratio') not in p['meters'] for c in contexts.values()):
            # These are the literal K2 signature/meter tests. A 2/2 source, for
            # example, cannot fit the current profiles; no need to re-run every
            # rhythm family/hand model to rediscover that same contradiction.
            failures=[]
            if any(c.get('key',{}).get('fifths') not in p['fifths'] for c in contexts.values()):failures.append('key-signature')
            if any(c.get('meter',{}).get('ratio') not in p['meters'] for c in contexts.values()):failures.append('meter')
            verdicts.append({'profileId':p['id'],'grade':p['grade'],'status':'fail',
                             'failureRules':failures,'reviewRules':[],'witnessContext':contexts})
        else:
            r=assess_profile(index,selection,p,config=config)
            evidence=None
            if evidence_builder is not None and r['status']!='fail':
                evidence=evidence_builder.for_profile(selection,p,config)
                r=assess_profile(index,selection,p,evidence,config)
            verdict={k:r[k] for k in ('profileId','grade','status','failureRules','reviewRules','evidenceKind')}
            if evidence is not None:
                verdict['evidenceSha256']=digest(encoded(evidence).encode())
                verdict['modeledBpm']=r['bpm']
            verdicts.append(verdict)
    return verdicts


def configurations(index):
    # Hypotheses for scanning, never declared to be author-provided hand labels.
    by_part={}
    for lid,info in index.a['lines'].items():
        ctx=index.context(lid,q(index.measures[info['partId']][0]['start']))
        sign=ctx.get('clef',{}).get('sign')
        roles=['right'] if sign=='G' else ['left'] if sign=='F' else ['left','right']
        by_part.setdefault(info['partId'],[]).append((lid,roles))
    for lines in by_part.values():
        for lid,roles in lines:
            for hand in roles:yield {lid:hand}
        for (a,aa),(b,bb) in combinations(lines,2):
            for ha,hb in product(aa,bb):
                if ha!=hb:yield {a:ha,b:hb}


def scan(index,analysis_sha,config,max_targets):
    with verified_scan(index,analysis_sha):
        return _scan(index,analysis_sha,config,max_targets)


def _scan(index,analysis_sha,config,max_targets):
    proposals={lid:propose(index,lid) for lid in index.a['lines']}
    fast=FastChecks(index,config)
    edge_maps={lid:{q(e['atQuarter']):e for e in p['exactEdges']} for lid,p in proposals.items()}
    candidates=[];outside=Counter();variant_count=0
    for hands in configurations(index):
        variant_count+=1;lids=tuple(sorted(hands));pid=index.a['lines'][lids[0]]['partId']
        common=sorted(set.intersection(*(set(q(e['atQuarter']) for e in proposals[l]['exactEdges']) for l in lids)))
        attacks=sorted(q(e['onset']) for l in lids for e in index.by_line[l] if e['kind']=='note' and not e.get('tieFrom'))
        all_line_notes={e['id'] for lid in lids for e in index.by_line[lid] if e['kind']=='note'}
        for ai,lo in enumerate(common):
            left=bisect_left(attacks,lo)
            for bi in range(ai+1,len(common)):
                hi=common[bi];count=bisect_left(attacks,hi)-left
                if count>max_targets:
                    outside['above-max-targets']+=len(common)-bi;break
                if count<3:
                    outside['below-min-targets']+=1;continue
                selection=make_selection(index,analysis_sha,hands,lo,hi)
                verdicts=check_profiles(index,selection,config,builder(index),fast)
                potential=[r['profileId'] for r in verdicts if r['status']!='fail']
                # A failed content profile cannot enter K4. Keep every failed
                # candidate/verdict, but do not pretend its boundaries were
                # reviewed or spend source-wide work on that second gate.
                reasons=selection_integrity(index,selection) if potential else None
                whole=(lo,hi)==index.boundaries(lids,0,len(index.measures[pid]))
                boundary=('not-evaluated-content-rejected' if not potential else
                          'source-extent-structurally-intact' if whole and not reasons else 'model-proposal-needs-context')
                selected_note_ids={e['id'] for e in selected_events(index,selection) if e['kind']=='note'} if potential else set()
                # Preserve every note in the selected source lines, allowing
                # whole-bar leading/trailing silence to stay outside an exercise.
                # This is a complete source line, not an inferred complete phrase.
                if (potential and not whole and not reasons and all_line_notes==selected_note_ids and
                        (lo,hi)==index.boundaries(lids,selection['startMeasure'],selection['endMeasure'])):
                    boundary='complete-source-lines-structurally-intact'
                matched=[r['profileId'] for r in verdicts if r['status']=='pass']
                packet=None
                if any('evidenceSha256' in r for r in verdicts):
                    claims,trace=builder(index).base(encoded(selection))
                    packet={'kind':'machine','producer':EVIDENCE_VERSION,'producerSha256':evidence_identity(),
                            'claims':claims,'trace':trace,'humanReviewed':False}
                candidates.append({'id':digest(encoded(selection).encode()),'selection':selection,
                    'sourceAttackCount':count,'boundaryStatus':boundary,
                    'boundaryEvidence':{lid:{side:edge_maps[lid][at]
                        for side,at in (('start',lo),('end',hi))} for lid in lids},
                    'handAssignmentStatus':packet['trace']['routing']['status'] if packet else 'clef-based-hypothesis',
                    'integrityReasons':reasons,'profileVerdicts':verdicts,'machineEvidence':packet,
                    'potentialProfiles':potential,
                    'contentPassedProfiles':matched,
                    'unitKind':'complete-source-lines' if boundary=='complete-source-lines-structurally-intact' else
                               'complete-source-span' if boundary=='source-extent-structurally-intact' else 'model-proposal',
                    'readyForNativeProfiles':matched if boundary in ('source-extent-structurally-intact','complete-source-lines-structurally-intact') else [],
                    'approvedForPractice':False})
    return {'sourceSha256':index.a['sourceSha256'],'analysisSha256':analysis_sha,
        'boundaryMethod':VERSION,'proposals':proposals,'handConfigurations':variant_count,
        'outsideLength':dict(outside),'candidates':candidates,'publishedExercises':0}


def read_scan(path,key):
    try:
        r=json.loads(gzip.decompress(path.read_bytes()))
        if r['key']==key and r['payloadSha256']==digest(encoded(r['payload']).encode()):return unpack_payload(r['payload'])
    except (OSError,ValueError,KeyError,IndexError,TypeError,EOFError,zlib.error):pass
    return None


def summarize(payload):
    vv=[v for c in payload['candidates'] for v in c['profileVerdicts']]
    potential=[c for c in payload['candidates'] if c['potentialProfiles']]
    by_profile={}
    for v in vv:by_profile.setdefault(v['profileId'],Counter())[v['status']]+=1
    return {'sourceSha256':payload['sourceSha256'],'status':'scanned',
        'candidates':len(payload['candidates']),'potentialCandidates':len(potential),
        'profileChecks':len(vv),'profileOutcomes':dict(Counter(v['status'] for v in vv)),
        'potentialByGrade':dict(Counter(v['grade'] for c in potential for v in c['profileVerdicts'] if v['status']!='fail')),
        'reviewNeeds':dict(Counter(reason for v in vv if v['status']=='review' for reason in v['reviewRules'])),
        'contentMatchedCandidates':sum(bool(c['contentPassedProfiles']) for c in payload['candidates']),
        'nativeReadyCandidates':sum(bool(c['readyForNativeProfiles']) for c in payload['candidates']),
        'contentByGrade':dict(Counter(v['grade'] for v in vv if v['status']=='pass')),
        'profileBreakdown':{pid:dict(counts) for pid,counts in by_profile.items()},
        'boundaryStatuses':dict(Counter(c['boundaryStatus'] for c in payload['candidates'])),
        'boundaryPending':sum(bool(c['potentialProfiles']) and c['boundaryStatus']=='model-proposal-needs-context' for c in payload['candidates']),
        'lineCount':len(payload['proposals']),
        'modelExcludedEvents':sum(len(p.get('modelExcludedEventIds',[])) for p in payload['proposals'].values()),
        'proposalEdges':sum(len(p['exactEdges']) for p in payload['proposals'].values()),'approvedExercises':0}


def scan_job(job,_max_notes):
    try:
        path=within(Path(job['corpus']),job['path']);data=path.read_bytes()
        if digest(data)!=job['sha']:raise CorpusError('source-checksum-mismatch')
        with closing(sqlite3.connect((Path(job['normalized'])/'normalization.sqlite').as_uri()+'?mode=ro',uri=True)) as db:
            row=db.execute('SELECT blob,analysis_sha FROM analyses WHERE source_sha=? AND pipeline=? AND status=?',
                           (job['sha'],job['normalizationPipeline'],'normalized')).fetchone()
        if not row or row[1]!=job['analysisSha256']:raise CorpusError('stale-normalization')
        raw=zlib.decompress(row[0])
        if digest(raw)!=row[1]:raise CorpusError('analysis-checksum-mismatch')
        analysis=json.loads(raw)
        if analysis['sourceSha256']!=job['sha']:raise CorpusError('analysis-source-mismatch')
        cache=Path(job['cache']);payload=read_scan(cache,job['key'])
        reused=payload is not None
        if payload is None:
            payload=scan(SourceIndex(analysis,data),row[1],load_config(),job['maxTargets'])
            packed=pack_payload(payload)
            blob=gzip.compress(encoded({'key':job['key'],'payloadSha256':digest(encoded(packed).encode()),'payload':packed}).encode(),compresslevel=6,mtime=0)
            temp=cache.with_suffix('.tmp');temp.write_bytes(blob);temp.replace(cache)
        return {'status':'scanned','summary':summarize(payload),'reused':reused,'error':None}
    except Exception as error:
        return {'status':'error','summary':{'sourceSha256':job['sha'],'status':'error','error':str(error)},'error':str(error)}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--corpus',type=Path,default=ROOT/'artifacts/curriculum-corpus')
    p.add_argument('--normalized',type=Path,default=ROOT/'artifacts/curriculum-normalized')
    p.add_argument('--output',type=Path,default=ROOT/'artifacts/curriculum-auto')
    p.add_argument('--source-list',type=Path,help='JSON {sourceHashes:[...]} for a reproducible trial; omit to scan all sources')
    p.add_argument('--limit',type=int,default=0,help='0 means all; no per-source candidate cap')
    p.add_argument('--workers',type=int,choices=range(1,65),default=4)
    p.add_argument('--timeout',type=int,default=180,help='Per-source resource limit; timeout remains retryable')
    p.add_argument('--max-targets',type=int,default=120)
    args=p.parse_args()
    if args.limit<0 or args.timeout<1 or args.max_targets<3:p.error('invalid limit/timeout/max-targets')
    args.corpus=args.corpus.resolve();args.normalized=args.normalized.resolve();args.output=args.output.resolve()
    with RunLock(args.output/'.run.lock'):
        execute(args)


def execute(args):
    spec=importlib.util.spec_from_file_location('auto_normalization',ROOT/'buildscripts/pianist/normalize-curriculum.py')
    normalizer=importlib.util.module_from_spec(spec);spec.loader.exec_module(normalizer)
    pipeline=digest(f'{normalizer.identity()}:20000:45'.encode());rules=rules_identity()
    sources=normalizer.jobs(args.corpus)
    if args.source_list:
        ss=json.loads(args.source_list.read_text(encoding='utf8'))['sourceHashes']
        if not ss or len(ss)!=len(set(ss)) or set(ss)-{s['sha'] for s in sources}:raise CorpusError('invalid-source-selection')
        sources=[s for s in sources if s['sha'] in ss]
    if args.limit:sources=sources[:args.limit]
    with closing(sqlite3.connect((args.normalized/'normalization.sqlite').as_uri()+'?mode=ro',uri=True)) as db:
        analyses={r[0]:r[1:] for r in db.execute('SELECT source_sha,status,analysis_sha,blockers FROM analyses WHERE pipeline=?',(pipeline,))}
    out=args.output; (out/'scans').mkdir(parents=True,exist_ok=True)
    jobs=[];outcomes={}
    for source in sources:
        a=analyses.get(source['sha'])
        if a is None or a[0]!='normalized':
            outcomes[source['sha']]={'sourceSha256':source['sha'],'status':'normalization-unavailable',
                'reasonCodes':json.loads(a[2]) if a else ['not-normalized']};continue
        key=digest(encoded([rules,pipeline,source['sha'],a[1],args.max_targets]).encode())
        jobs.append({**source,'corpus':str(args.corpus),'normalized':str(args.normalized),
            'normalizationPipeline':pipeline,'analysisSha256':a[1],'maxTargets':args.max_targets,
            'key':key,'cache':str(out/'scans'/(source['sha']+'.json.gz'))})
    completed=0;reused=0;last_checkpoint=time.monotonic()
    def checkpoint():
        rows=list(outcomes.values());scanned=[r for r in rows if r['status']=='scanned']
        stats={'at':datetime.now(timezone.utc).isoformat(),'scope':'automatic proposals/K2 filtering; not exercise approval',
            'rules':rules,'selectedSources':len(sources),'scannedSources':len(scanned),
            'normalizationUnavailable':sum(r['status']=='normalization-unavailable' for r in rows),
            'errors':sum(r['status']=='error' for r in rows),'remaining':len(sources)-len(rows),'reused':reused,
            'candidates':sum(r['candidates'] for r in scanned),'potentialCandidates':sum(r['potentialCandidates'] for r in scanned),
            'contentMatchedCandidates':sum(r['contentMatchedCandidates'] for r in scanned),
            'nativeReadyCandidates':sum(r['nativeReadyCandidates'] for r in scanned),
            'contentByGrade':dict(sum((Counter(r['contentByGrade']) for r in scanned),Counter())),
            'profileBreakdown':{pid:dict(sum((Counter(r.get('profileBreakdown',{}).get(pid,{})) for r in scanned),Counter()))
                                for pid in (p['id'] for p in load_config()['profiles'])},
            'boundaryStatuses':dict(sum((Counter(r.get('boundaryStatuses',{})) for r in scanned),Counter())),
            'boundaryPending':sum(r.get('boundaryPending',0) for r in scanned),
            'lineCount':sum(r.get('lineCount',0) for r in scanned),
            'modelExcludedEvents':sum(r.get('modelExcludedEvents',0) for r in scanned),
            'normalizationReasonCounts':dict(Counter(reason for r in rows if r['status']=='normalization-unavailable' for reason in r['reasonCodes'])),
            'reviewNeeds':dict(sum((Counter(r['reviewNeeds']) for r in scanned),Counter())),
            'profileChecks':sum(r['profileChecks'] for r in scanned),'approvedExercises':0}
        write_json(out/'report.json',stats);write_json(out/'source-outcomes.json',{'entries':sorted(rows,key=lambda r:r['sourceSha256'])})
    checkpoint()
    print(f'Automatic scan: {len(sources)} selected; {len(jobs)} normalized sources; no manual review input',flush=True)
    for job,result,elapsed in results(jobs,args.workers,args.timeout,20000,recycle=8,handler='curriculum_auto:scan_job'):
        row=result.get('summary') or {'sourceSha256':job['sha'],'status':'error',
            'error':'scanner-timeout' if 'normalizer-timeout' in result.get('blockers',[]) else result.get('error','worker-crashed')}
        outcomes[job['sha']]={**row,'elapsedSeconds':round(elapsed,3)}
        reused+=bool(result.get('reused'));completed+=1
        # Source shards are atomic checkpoints. Bound large aggregate rewrites
        # rather than rewriting all 37k outcomes after each completed source.
        if time.monotonic()-last_checkpoint>=15 or completed==len(jobs):
            checkpoint();last_checkpoint=time.monotonic()
        if completed%10==0 or completed==len(jobs):print(f'{completed}/{len(jobs)} saved; last={row["status"]}',flush=True)
    print(json.dumps(json.loads((out/'report.json').read_text()),ensure_ascii=False),flush=True)
    if any(r['status']=='error' for r in outcomes.values()):
        raise CorpusError('automatic-scan-errors: see source-outcomes.json; completed sources were checkpointed')
