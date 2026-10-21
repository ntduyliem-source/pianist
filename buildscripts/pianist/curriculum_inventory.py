"""K3 full-catalog reconciliation and searchable K4 hand-off (no MXL export)."""
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sqlite3
import zlib
from bisect import bisect_left,bisect_right
from types import SimpleNamespace

from curriculum_auto import ROOT, read_scan, rules_identity, summarize, configurations
from curriculum_fragments import q, SourceIndex
from curriculum_grades import load_config
from curriculum_io import CorpusError, within, write_json
from curriculum_normalize import digest, encoded


def normalization_module():
    spec=importlib.util.spec_from_file_location('inventory_normalization',ROOT/'buildscripts/pianist/normalize-curriculum.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def length_bucket(n):
    for label,lo,hi in ((4,3,5),(6,6,8),(10,9,14),(20,15,24),(30,25,39),(50,40,69),(100,70,120)):
        if lo<=n<=hi:return label
    raise CorpusError('candidate-outside-length-groups')


def validate_candidates(payload,sha,analysis_sha,profiles):
    seen=set();expected=set(profiles)
    for candidate in payload['candidates']:
        selected=candidate['selection'];cid=candidate['id'];verdicts=candidate['profileVerdicts']
        if (cid!=digest(encoded(selected).encode()) or cid in seen or
            selected['sourceSha256']!=sha or selected['analysisSha256']!=analysis_sha):raise CorpusError('candidate-source-binding-or-duplicate')
        seen.add(cid)
        if len(verdicts)!=len(profiles) or {v['profileId'] for v in verdicts}!=expected:raise CorpusError('incomplete-candidate-profiles')
        if any(v['status'] not in ('pass','fail','review') or v['grade']!=profiles[v['profileId']]['grade'] for v in verdicts):raise CorpusError('invalid-profile-verdict')
        potential={v['profileId'] for v in verdicts if v['status']!='fail'}
        passed={v['profileId'] for v in verdicts if v['status']=='pass'}
        ready=set(candidate['readyForNativeProfiles'])
        allowed=candidate['boundaryStatus'] in ('source-extent-structurally-intact','complete-source-lines-structurally-intact')
        if (potential!=set(candidate['potentialProfiles']) or passed!=set(candidate['contentPassedProfiles']) or
            ready!=(passed if allowed else set()) or candidate['approvedForPractice']):raise CorpusError('candidate-admission-inconsistent')
        length_bucket(candidate['sourceAttackCount'])


def audit_enumeration(payload,analysis):
    """Uniqueness + membership + cardinality proves no eligible pair is missing.

    Counts use bisect over cumulative original attacks, independently of the
    scanner's pair-by-pair loop. This is bookkeeping, not phrase inference.
    """
    measures=defaultdict(list)
    for m in analysis['measures']:measures[m['partId']].append(m)
    view=SimpleNamespace(a=analysis,measures=measures)
    view.context=lambda lid,at:SourceIndex.context(view,lid,at)
    by_line=defaultdict(list)
    for e in analysis['events']:
        if e['kind']=='note' and not e.get('tieFrom'):by_line[e['lineId']].append(q(e['onset']))
    variants={};expected=0;outside=Counter()
    for hands in configurations(view):
        lids=tuple(sorted(hands));pid=analysis['lines'][lids[0]]['partId']
        edges=sorted(set.intersection(*(set(q(e['atQuarter']) for e in payload['proposals'][lid]['exactEdges']) for lid in lids)))
        attacks=sorted(t for lid in lids for t in by_line[lid]);prefix=[bisect_left(attacks,t) for t in edges]
        count=0
        for k,left in enumerate(prefix):
            begin=max(k+1,bisect_left(prefix,left+3));end=max(begin,bisect_right(prefix,left+120))
            count+=end-begin;outside['below-min-targets']+=begin-k-1;outside['above-max-targets']+=len(edges)-end
        expected+=count
        variants[encoded(hands)]={'count':count,'seen':0,'edges':set(edges),'attacks':attacks,'starts':[q(m['start']) for m in measures[pid]]}
    for c in payload['candidates']:
        s=c['selection'];v=variants.get(encoded(s['lineHands']));lo=q(s['startQuarter']);hi=q(s['endQuarter'])
        if v is None or lo>=hi or lo not in v['edges'] or hi not in v['edges']:raise CorpusError('candidate-outside-proposed-configurations')
        actual=bisect_left(v['attacks'],hi)-bisect_left(v['attacks'],lo)
        if (actual!=c['sourceAttackCount'] or not 3<=actual<=120 or
            s['startMeasure']!=bisect_right(v['starts'],lo)-1 or s['endMeasure']!=bisect_left(v['starts'],hi)):
            raise CorpusError('candidate-source-span-or-count')
        v['seen']+=1
    if expected!=len(payload['candidates']) or any(v['seen']!=v['count'] for v in variants.values()):raise CorpusError('missing-enumerated-candidates')
    if any(outside[k]!=payload['outsideLength'].get(k,0) for k in outside):raise CorpusError('length-filter-count-mismatch')
    return {'expectedCandidates':expected,'handConfigurations':len(variants),'outsideLength':dict(outside)}


def compile_inventory(corpus,normalized,scans,output,progress=print):
    normalizer=normalization_module();pipeline=digest(f'{normalizer.identity()}:20000:45'.encode())
    rules=rules_identity();config=load_config();profiles={p['id']:p for p in config['profiles']}
    sources=normalizer.jobs(corpus)
    with closing(sqlite3.connect((normalized/'normalization.sqlite').resolve().as_uri()+'?mode=ro',uri=True)) as norm:
        analyses={r[0]:r[1:] for r in norm.execute('SELECT source_sha,status,analysis_sha,blockers FROM analyses WHERE pipeline=?',(pipeline,))}
    output.mkdir(parents=True,exist_ok=True)
    temporary=output/'candidates.partial.sqlite'
    db=sqlite3.connect(temporary)
    norm_read=sqlite3.connect((normalized/'normalization.sqlite').resolve().as_uri()+'?mode=ro',uri=True)
    # This database is a reproducible build product. Reusing the partial file
    # replaces only its explicitly named tables, never the source catalog.
    db.executescript('''
        DROP TABLE IF EXISTS metadata; DROP TABLE IF EXISTS sources;
        DROP TABLE IF EXISTS candidates; DROP TABLE IF EXISTS profiles;
        CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE sources(source_sha TEXT PRIMARY KEY,status TEXT NOT NULL,detail TEXT NOT NULL);
        CREATE TABLE candidates(id TEXT PRIMARY KEY,source_sha TEXT NOT NULL,selection TEXT NOT NULL,
          attacks INTEGER NOT NULL,length_bucket INTEGER NOT NULL,hands TEXT NOT NULL,
          boundary_status TEXT NOT NULL,k3_status TEXT NOT NULL,scan_path TEXT NOT NULL);
        CREATE TABLE profiles(candidate_id TEXT NOT NULL,profile_id TEXT NOT NULL,grade INTEGER NOT NULL,
          content_status TEXT NOT NULL,k3_status TEXT NOT NULL,reasons TEXT NOT NULL,
          PRIMARY KEY(candidate_id,profile_id));
    ''')
    totals=Counter();classes=Counter();by_profile=defaultdict(Counter);by_grade=defaultdict(Counter)
    boundary=Counter();reasons=Counter();coverage=defaultdict(Counter);outcomes=[];retry=[];scan_receipts=[];outside=Counter()
    source_set=set()
    try:
        for position,source in enumerate(sources,1):
            sha=source['sha'];a=analyses.get(sha)
            if sha in source_set:raise CorpusError('duplicate-source-in-catalog')
            source_set.add(sha)
            row={'sourceSha256':sha}
            try:
                if digest(within(corpus,source['path']).read_bytes())!=sha:raise CorpusError('source-checksum-mismatch')
                if a is None or a[0]!='normalized':
                    row.update(status='normalization-unavailable',reasonCodes=json.loads(a[2]) if a else ['not-normalized'])
                    totals['normalizationUnavailable']+=1;reasons.update(row['reasonCodes'])
                else:
                    path=scans/'scans'/(sha+'.json.gz')
                    key=digest(encoded([rules,pipeline,sha,a[1],120]).encode())
                    payload=read_scan(path,key)
                    if payload is None:raise CorpusError('missing-stale-or-corrupt-scan')
                    if payload['sourceSha256']!=sha or payload['analysisSha256']!=a[1]:raise CorpusError('scan-source-binding')
                    validate_candidates(payload,sha,a[1],profiles)
                    blob=norm_read.execute('SELECT blob FROM analyses WHERE source_sha=? AND pipeline=?',(sha,pipeline)).fetchone()[0]
                    raw=zlib.decompress(blob)
                    if digest(raw)!=a[1]:raise CorpusError('normalization-payload-binding')
                    enumeration=audit_enumeration(payload,json.loads(raw));outside.update(enumeration['outsideLength'])
                    for candidate in payload['candidates']:
                        selected=candidate['selection'];cid=candidate['id'];verdicts=candidate['profileVerdicts']
                        potential=set(candidate['potentialProfiles'])
                        ready=set(candidate['readyForNativeProfiles'])
                        allowed_boundary=candidate['boundaryStatus'] in ('source-extent-structurally-intact','complete-source-lines-structurally-intact')
                        status='eligible-for-native' if ready else 'review' if potential else 'rejected'
                        classes[status]+=1;boundary[candidate['boundaryStatus']]+=1
                        count=candidate['sourceAttackCount'];bucket=length_bucket(count)
                        hand='both' if len(set(selected['lineHands'].values()))==2 else next(iter(selected['lineHands'].values()))
                        ready_grades={profiles[p]['grade'] for p in ready};potential_grades={profiles[p]['grade'] for p in potential}
                        for grade in range(1,9):
                            outcome='eligible-for-native' if grade in ready_grades else 'review' if grade in potential_grades else 'rejected'
                            by_grade[grade][outcome]+=1
                        for v in verdicts:
                            by_profile[v['profileId']][v['status']]+=1
                            if v['status']=='review':reasons.update(v['reviewRules'])
                        if potential:
                            db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?,?,?,?)',
                                (cid,sha,encoded(selected),count,bucket,hand,candidate['boundaryStatus'],status,path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else str(path)))
                            for v in verdicts:
                                if v['status']=='fail':continue
                                stage='eligible-for-native' if v['profileId'] in ready else 'review'
                                pending=list(v['reviewRules'])
                                if not allowed_boundary:pending.append('musical-boundary-context')
                                db.execute('INSERT INTO profiles VALUES(?,?,?,?,?,?)',(cid,v['profileId'],v['grade'],v['status'],stage,encoded(pending)))
                                cell=(v['grade'],v['profileId'],hand,bucket)
                                coverage[cell][stage]+=1;coverage[cell]['content-'+v['status']]+=1
                    summary=summarize(payload);row.update(summary);row['enumerationAudit']=enumeration
                    for name in ('candidates','profileChecks','potentialCandidates','contentMatchedCandidates','nativeReadyCandidates','lineCount','modelExcludedEvents'):
                        totals[name]+=summary[name]
                    totals['scannedSources']+=1
                    scan_receipts.append({'sourceSha256':sha,'analysisSha256':a[1],'fileSha256':digest(path.read_bytes()),'cacheKey':key})
            except (CorpusError,OSError,ValueError,KeyError) as error:
                row.update(status='error',error=str(error));retry.append(sha)
            outcomes.append(row)
            db.execute('INSERT INTO sources VALUES(?,?,?)',(sha,row['status'],encoded(row)))
            if position%100==0:
                db.commit();progress(f'{position}/{len(sources)} source bindings reconciled; missing/invalid={len(retry)}',flush=True)
        complete=not retry and totals['scannedSources']+totals['normalizationUnavailable']==len(sources)
        report={'at':datetime.now(timezone.utc).isoformat(),'stage':'K3','complete':complete,
                'scope':'All catalog sources and all enumerated spans in the versioned K3 boundary/hand policy; K4 export/native validation is separate.',
                'rules':rules,'normalizationPipeline':pipeline,'sourceCount':len(sources),**dict(totals),
                'unresolvedScanSources':len(retry),'candidateClassification':dict(classes),
                'profileBreakdown':{pid:dict(by_profile[pid]) for pid in profiles},
                'gradeClassification':{str(g):dict(by_grade[g]) for g in range(1,9)},
                'boundaryStatuses':dict(boundary),'reviewAndNormalizationReasons':dict(reasons),
                'enumerationAudit':{'method':'Unique valid source spans + independent prefix/bisect pair counts for every configuration',
                                    'sourcesAudited':totals['scannedSources'],'outsideLength':dict(outside)},
                'exportedMxlExercises':0,'publishedExercises':0,
                'claims':'Review is an explicit classification, not approval. No candidate was promoted to fill a grade/quota. Source attack counts precede K4 native verification.'}
        for k,v in (('rules',rules),('pipeline',pipeline),('complete',complete),('scope',report['scope'])):db.execute('INSERT INTO metadata VALUES(?,?)',(k,encoded(v)))
        db.executescript('CREATE INDEX IF NOT EXISTS grade_options ON profiles(grade,profile_id,k3_status); CREATE INDEX IF NOT EXISTS exercise_options ON candidates(hands,length_bucket,k3_status);')
        db.commit()
    finally:db.close();norm_read.close()
    write_json(output/'report.json',report)
    write_json(output/'source-outcomes.json',{'entries':outcomes})
    write_json(output/'retry-sources.json',{'sourceHashes':retry})
    write_json(output/'coverage.json',{'counts':'Profile labels, not independent exercises; note buckets use source attacks.',
        'cells':[{'grade':g,'profileId':p,'hand':h,'lengthBucket':b,**dict(c)} for (g,p,h,b),c in sorted(coverage.items())]})
    write_json(output/'scan-receipts.json',{'rules':rules,'normalizationPipeline':pipeline,'entries':scan_receipts})
    if complete:temporary.replace(output/'candidates.sqlite')
    return report
