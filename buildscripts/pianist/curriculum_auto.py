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

from curriculum_boundaries import propose,VERSION
from curriculum_fragments import SourceIndex,line_features,q
from curriculum_grades import assess_profile,load_config,ALLOWED
from curriculum_io import RunLock,within,write_json,CorpusError
from curriculum_normalize import digest,encoded
from curriculum_workers import results

ROOT=Path(__file__).resolve().parents[2]


def rules_identity():
    paths=['buildscripts/pianist/curriculum_auto.py','buildscripts/pianist/curriculum_boundaries.py',
           'buildscripts/pianist/curriculum_grades.py','buildscripts/pianist/curriculum_fragments.py',
           'buildscripts/pianist/curriculum_workers.py','scores/curriculum/grades.v3.json',
           'third_party/curriculum-sources/mtc-lbdm/lbdm.py']
    return digest(encoded({p:digest((ROOT/p).read_bytes()) for p in paths}).encode())


def check_profiles(index,selection,config):
    lids=tuple(selection['lineHands']);start,end=selection['startMeasure'],selection['endMeasure']
    intervals=[i for lid in lids for i in line_features(index.selected((lid,),start,end))['intervals']]
    verdicts=[]
    for p in config['profiles']:
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
        else:
            r=assess_profile(index,selection,p,config=config)
            verdicts.append({k:r[k] for k in ('profileId','grade','status','failureRules','reviewRules')})
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
    proposals={lid:propose(index,lid) for lid in index.a['lines']}
    candidates=[];outside=Counter();variant_count=0
    for hands in configurations(index):
        variant_count+=1;lids=tuple(sorted(hands));pid=index.a['lines'][lids[0]]['partId']
        common=set.intersection(*(set(e['atMeasure'] for e in proposals[l]['barEdges']) for l in lids))
        counts=[sum(e['kind']=='note' and not e.get('tieFrom') for l in lids for e in index.by_bar[(l,mi)])
                for mi in range(len(index.measures[pid]))]
        prefix=[0]
        for n in counts:prefix.append(prefix[-1]+n)
        for start,end in combinations(sorted(common),2):
            count=prefix[end]-prefix[start]
            if not 3<=count<=max_targets:
                outside['below-min-targets' if count<3 else 'above-max-targets']+=1;continue
            selection={'sourceSha256':index.a['sourceSha256'],'analysisSha256':analysis_sha,
                'lineHands':hands,'startMeasure':start,'endMeasure':end}
            verdicts=check_profiles(index,selection,config)
            candidates.append({'id':digest(encoded(selection).encode()),'selection':selection,
                'sourceAttackCount':count,'boundaryStatus':'model-proposal-only',
                'handAssignmentStatus':'clef-based-hypothesis','integrityReasons':index.cut_reasons(lids,start,end),
                'profileVerdicts':verdicts,
                'potentialProfiles':[r['profileId'] for r in verdicts if r['status']!='fail'],
                'approvedForPractice':False})
    return {'sourceSha256':index.a['sourceSha256'],'analysisSha256':analysis_sha,
        'boundaryMethod':VERSION,'proposals':proposals,'handConfigurations':variant_count,
        'outsideLength':dict(outside),'candidates':candidates,'publishedExercises':0}


def read_scan(path,key):
    try:
        r=json.loads(gzip.decompress(path.read_bytes()))
        if r['key']==key and r['payloadSha256']==digest(encoded(r['payload']).encode()):return r['payload']
    except (OSError,ValueError,KeyError,EOFError,zlib.error):pass
    return None


def summarize(payload):
    vv=[v for c in payload['candidates'] for v in c['profileVerdicts']]
    potential=[c for c in payload['candidates'] if c['potentialProfiles']]
    return {'sourceSha256':payload['sourceSha256'],'status':'scanned',
        'candidates':len(payload['candidates']),'potentialCandidates':len(potential),
        'profileChecks':len(vv),'profileOutcomes':dict(Counter(v['status'] for v in vv)),
        'potentialByGrade':dict(Counter(v['grade'] for c in potential for v in c['profileVerdicts'] if v['status']!='fail')),
        'reviewNeeds':dict(Counter(reason for v in vv if v['status']=='review' for reason in v['reviewRules'])),
        'proposalEdges':sum(len(p['barEdges']) for p in payload['proposals'].values()),'approvedExercises':0}


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
            blob=gzip.compress(encoded({'key':job['key'],'payloadSha256':digest(encoded(payload).encode()),'payload':payload}).encode(),mtime=0)
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
    p.add_argument('--workers',type=int,choices=range(1,17),default=4)
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
    completed=0;reused=0
    def checkpoint():
        rows=list(outcomes.values());scanned=[r for r in rows if r['status']=='scanned']
        stats={'at':datetime.now(timezone.utc).isoformat(),'scope':'automatic proposals/K2 filtering; not exercise approval',
            'rules':rules,'selectedSources':len(sources),'scannedSources':len(scanned),
            'normalizationUnavailable':sum(r['status']=='normalization-unavailable' for r in rows),
            'errors':sum(r['status']=='error' for r in rows),'remaining':len(sources)-len(rows),'reused':reused,
            'candidates':sum(r['candidates'] for r in scanned),'potentialCandidates':sum(r['potentialCandidates'] for r in scanned),
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
        checkpoint()
        if completed%10==0 or completed==len(jobs):print(f'{completed}/{len(jobs)} saved; last={row["status"]}',flush=True)
    print(json.dumps(json.loads((out/'report.json').read_text()),ensure_ascii=False),flush=True)
    if any(r['status']=='error' for r in outcomes.values()):
        raise CorpusError('automatic-scan-errors: see source-outcomes.json; completed sources were checkpointed')
