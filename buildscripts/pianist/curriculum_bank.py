"""Incremental, source-bound MXL extraction for a finite reading bank."""
from collections import Counter
from contextlib import closing
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET
import gzip
import importlib.util
import json
import sqlite3
import zipfile
import zlib

from curriculum_auto import configurations
from curriculum_boundaries import propose
from curriculum_fast_checks import FastChecks
from curriculum_fragments import (SourceIndex, q, content_hashes, project_xml,
                                  verify_projection)
from curriculum_grades import load_config
from curriculum_io import CorpusError, within, write_json
from curriculum_normalize import digest, encoded, normalize, piano_xml
from curriculum_reading import assess_reading, policy
from curriculum_selection import make_selection, verified_scan
from curriculum_prepared import length_bucket

ROOT=Path(__file__).resolve().parents[2]
LENGTHS=json.loads((ROOT/'scores/curriculum/length-buckets.v2.json').read_text())
BUCKET_IDS=tuple(b['id'] for b in LENGTHS['buckets'])
spec=importlib.util.spec_from_file_location('bank_q2',ROOT/'buildscripts/pianist/normalize-curriculum.py')
q2=importlib.util.module_from_spec(spec);spec.loader.exec_module(q2)


def mxl_bytes(xml):
    """Standard compressed MusicXML. Deterministic bytes, original XML notes."""
    output=BytesIO()
    container=b'<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for name,data in [('META-INF/container.xml',container),('score.musicxml',xml)]:
            entry=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(entry,data)
    return output.getvalue()


def atomic_bytes(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_bytes(data);temp.replace(path)


def identity():
    files=['buildscripts/pianist/'+p for p in (
        'curriculum_bank.py','curriculum_reading.py','prepare-reading-bank.py',
        'curriculum_auto.py','curriculum_fast_checks.py','curriculum_evidence.py',
        'curriculum_grades.py','curriculum_selection.py','curriculum_fragments.py',
        'curriculum_prepared.py','curriculum_boundaries.py','curriculum_regions.py',
        'curriculum_workers.py')]
    files += ['scores/curriculum/'+p for p in ('reading-bank.v1.json','grades.v3.json','length-buckets.v2.json')]
    files += ['tests/browser/pianist/'+p for p in ('reading-bank-native.cjs','q2-lab.ts','q4-lab.ts')]
    files += ['packages/exercise-renderer/index.ts','packages/exercise-renderer/worker.ts',
              'packages/exercise-generator/contract.ts','packages/exercise-generator/source-verification.ts',
              'packages/practice-engine-v2/score-adapter.ts',
              'third_party/curriculum-sources/mtc-lbdm/lbdm.py',
              'third_party/curriculum-sources/pianoplayer/routing.py']
    return digest(encoded({'files':{p:digest((ROOT/p).read_bytes()) for p in files},
                          'normalizer':q2.identity(),'engine':q2.native_identity(),
                          'release':digest((ROOT/'build.artifacts/release.json').read_bytes())}).encode())


def source_edges(index,lid):
    """Preserve exact upstream positions; no nearest-bar rounding."""
    proposal=propose(index,lid)
    pid=index.a['lines'][lid]['partId'];bars=index.measures[pid]
    at_to_bar={q(b['start']):i for i,b in enumerate(bars)}
    at_to_bar[q(bars[-1]['start'])+q(bars[-1]['duration'])]=len(bars)
    edges={q(e['atQuarter']):e for e in proposal['exactEdges'] if q(e['atQuarter']) in at_to_bar
           and any(s['kind'].startswith(('source-', 'music21-rest-', 'lbdm-')) for s in e['support'])}
    for slur in index.a['slurs']:
        start=[index.events[i] for i in slur['startEventIds'] if index.events[i]['lineId']==lid]
        end=[index.events[i] for i in slur['endEventIds'] if index.events[i]['lineId']==lid]
        if not start or not end:continue
        for side,at in [('start',min(q(e['onset']) for e in start)),
                        ('end',max(q(e['onset'])+q(e['duration']) for e in end))]:
            if at in at_to_bar:
                edges.setdefault(at,{'support':[]})['support'].append({'kind':'source-slur-'+side,
                    'eventIds':[e['id'] for e in start+end]})
    for i,bar in enumerate(index.parts[pid].findall('measure')):
        for mark in bar.findall('barline'):
            if mark.findtext('bar-style') not in ('light-light','light-heavy','heavy-light','heavy-heavy'):continue
            location=mark.get('location','right')
            if location not in ('left','right'):continue
            at=q(bars[i]['start'])+(q(bars[i]['duration']) if location=='right' else 0)
            edges.setdefault(at,{'support':[]})['support'].append({'kind':'source-section-barline','location':location})
    return edges,at_to_bar


def extract(index,analysis_sha,active_grades,stage,active_options=None):
    config=load_config();profiles=[p for p in config['profiles'] if p['grade'] in active_grades]
    fast=FastChecks(index,config);edges={lid:source_edges(index,lid) for lid in index.a['lines']}
    stats=Counter();candidates={}
    with verified_scan(index,analysis_sha):
        for hands in configurations(index):
            lids=tuple(sorted(hands));pid=index.a['lines'][lids[0]]['partId']
            common=sorted(set.intersection(*(set(edges[l][0]) for l in lids)))
            # Counting original attacks is only a prefilter. Native re-counts.
            attacks=sorted(q(e['onset']) for lid in lids for e in index.by_line[lid]
                           if e['kind']=='note' and not e.get('tieFrom'))
            from bisect import bisect_left
            relevant=[p for p in profiles if p['lines']==len(lids)]
            if not relevant:continue
            for ai,lo in enumerate(common):
                left=bisect_left(attacks,lo)
                for hi in common[ai+1:]:
                    count=bisect_left(attacks,hi)-left
                    if count>120:break
                    if count<3:continue
                    bucket=length_bucket(count,LENGTHS)
                    eligible=[p for p in relevant if active_options is None or bucket in active_options.get(str(p['grade']),[])]
                    if not eligible:continue
                    stats['spansExamined']+=1
                    selection=make_selection(index,analysis_sha,hands,lo,hi)
                    view=fast.view(selection);matched=[]
                    for profile in eligible:
                        contradiction=fast.contradiction(selection,profile,view)
                        if contradiction:
                            stats['failed:'+contradiction['failureRules'][0]]+=1;continue
                        result=assess_reading(index,selection,profile,config)
                        if result['status']=='pass':matched.append(result)
                        else:
                            for reason in result['failureRules']+result['reviewRules']:stats['blocked:'+reason]+=1
                    if not matched:continue
                    start,end=selection['startMeasure'],selection['endMeasure']
                    events=index.selected(lids,start,end)
                    hashes=content_hashes(events,lids,lo,hi-lo)
                    contexts=[index.context(lid,lo) for lid in lids]
                    layout={'hands':[hands[l] for l in lids],
                            'bars':[str(q(m['duration'])) for m in index.measures[pid][start:end]],
                            'contexts':[{k:v for k,v in c.items() if k!='key'} | {'fifths':c.get('key',{}).get('fifths')} for c in contexts]}
                    id_=digest(encoded([hashes['exactHash'],layout]).encode())
                    if id_ in candidates:
                        stats['duplicateWithinSource']+=1;continue
                    stats['contentMatched']+=1
                    try:
                        xml=project_xml(index,lids,start,end)
                        packed=mxl_bytes(xml)
                        # Read the actual deliverable, not an uncompressed proxy.
                        analysis=normalize(packed,max_notes=20000)
                        proof=verify_projection(index,lids,start,end,analysis)
                        if not proof['passed']:raise CorpusError(','.join(proof['rejectionCodes']))
                        if analysis['releaseBlockers']:raise CorpusError(','.join(analysis['releaseBlockers']))
                        dest=stage/id_;dest.mkdir(parents=True,exist_ok=True)
                        atomic_bytes(dest/'exercise.mxl',packed)
                        raw=encoded(analysis).encode();atomic_bytes(dest/'analysis.json',raw)
                        row={'id':id_,'selection':selection,'sourceAttackCount':count,
                             'exactHash':hashes['exactHash'],'motifGroupId':hashes['motifGroupId'],
                             'profiles':matched,'grades':sorted({r['grade'] for r in matched}),
                             'mxl':str((dest/'exercise.mxl').resolve()),'mxlSha256':digest(packed),
                             'analysis':str((dest/'analysis.json').resolve()),'analysisSha256':digest(raw),
                             'hand':next(iter(hands.values())) if len(hands)==1 else None,
                             'unitKind':'source-cued-reading-excerpt','teacherReviewedPhrase':False,
                             'boundaryEvidence':{lid:{'start':edges[lid][0][lo],'end':edges[lid][0][hi]} for lid in lids},
                             'projection':proof,'sourceTempo':index.a['tempos']}
                        candidates[id_]=row;stats['mxlPrepared']+=1
                    except (CorpusError,ValueError,KeyError,TypeError) as error:
                        stats['projectionRejected:'+str(error)[:180]]+=1
    return {'candidates':list(candidates.values()),'stats':dict(stats)}


def source_job(job,_max_notes):
    try:
        path=within(Path(job['corpus']),job['path']);data=path.read_bytes()
        if digest(data)!=job['sha']:raise CorpusError('source-checksum-mismatch')
        with closing(sqlite3.connect((Path(job['normalized'])/'normalization.sqlite').as_uri()+'?mode=ro',uri=True)) as db:
            row=db.execute('SELECT blob,analysis_sha FROM analyses WHERE source_sha=? AND pipeline=? AND status=?',
                           (job['sha'],job['normalizationPipeline'],'normalized')).fetchone()
        if not row:raise CorpusError('missing-current-normalization')
        raw=zlib.decompress(row[0])
        if digest(raw)!=row[1]:raise CorpusError('analysis-checksum-mismatch')
        key=digest(encoded([job['pipeline'],job['sha'],row[1],job['activeGrades'],job['activeOptions']]).encode())
        cache=Path(job['out'])/'scans'/(key+'.json.gz')
        if cache.exists():
            saved=json.loads(gzip.decompress(cache.read_bytes()));payload=saved['payload']
            if saved['sha256']==digest(encoded(payload).encode()) and payload['key']==key and all(Path(r['mxl']).is_file() and Path(r['analysis']).is_file() for r in payload['candidates']):
                return {'status':'extracted','payload':payload,'cached':True}
        payload=extract(SourceIndex(json.loads(raw),data),row[1],set(job['activeGrades']),Path(job['out'])/'staging'/job['sha'],job['activeOptions'])
        payload.update({'key':key,'sourceSha256':job['sha'],'analysisSha256':row[1],'activeGrades':job['activeGrades'],'activeOptions':job['activeOptions']})
        atomic_bytes(cache,gzip.compress(encoded({'payload':payload,'sha256':digest(encoded(payload).encode())}).encode(),compresslevel=6,mtime=0))
        return {'status':'extracted','payload':payload,'cached':False}
    except Exception as error:
        return {'status':'error','error':type(error).__name__+': '+str(error)[:1000]}


def bank_db(path,pipeline):
    path.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(path)
    db.executescript('''CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources(sha TEXT PRIMARY KEY,status TEXT NOT NULL,report TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS exercises(id TEXT PRIMARY KEY,mxl_sha TEXT NOT NULL,entry TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memberships(grade INTEGER NOT NULL,id TEXT NOT NULL,bucket TEXT NOT NULL,PRIMARY KEY(grade,id));
      CREATE INDEX IF NOT EXISTS membership_options ON memberships(grade,bucket);
      CREATE TABLE IF NOT EXISTS origins(id TEXT NOT NULL,source_sha TEXT NOT NULL,selection TEXT NOT NULL,
        PRIMARY KEY(id,source_sha,selection));''')
    existing=db.execute("SELECT value FROM metadata WHERE key='pipeline'").fetchone()
    if existing and existing[0]!=pipeline:
        db.close();raise CorpusError('bank-pipeline-changed-use-new-release-directory')
    with db:db.execute("INSERT OR IGNORE INTO metadata VALUES('pipeline',?)",(pipeline,))
    return db


def counts(db):
    result={g:0 for g in range(1,9)}
    result.update(dict(db.execute('SELECT grade,COUNT(*) FROM memberships GROUP BY grade')))
    return result


def option_counts(db):
    values={g:{b:0 for b in BUCKET_IDS} for g in range(1,9)}
    for grade,bucket,count in db.execute('SELECT grade,bucket,COUNT(*) FROM memberships GROUP BY grade,bucket'):
        values[grade][bucket]=count
    return values


def target_met(values,target):
    return all(values.get(g,{}).get(b,0)>=target for g in range(1,9) for b in BUCKET_IDS)


def missing_options(values,target):
    return {str(g):[b for b in BUCKET_IDS if values.get(g,{}).get(b,0)<target] for g in range(1,9)}


def accept(db,out,row,native,provenance,buckets):
    from curriculum_prepared import length_bucket
    blob=Path(row['mxl']).read_bytes()
    if digest(blob)!=row['mxlSha256']:raise CorpusError('prepared-mxl-changed')
    if not native.get('passed'):return False
    verification=native.get('verification',{});render=native.get('render',{})
    if native.get('mxlSha256')!=digest(blob) or native.get('analysisSha256')!=row['analysisSha256']:
        raise CorpusError('native-input-binding')
    if not verification.get('eligibleForFragmentReview') or verification.get('releaseBlockers'):
        return False
    count=verification.get('counts',{}).get('targets')
    if count!=row['sourceAttackCount'] or render.get('counts',{}).get('targets')!=count:
        raise CorpusError('native-target-count-mismatch')
    if not render.get('glyphsComplete') or not render.get('editorUnchanged'):return False
    bucket=length_bucket(count,buckets)
    if bucket is None:raise CorpusError('native-length-outside-bank')
    destination=out/'exercises'/(row['id']+'.mxl')
    proof={**row,'native':native,'origins':provenance,'fingeringGenerated':False}
    proof.pop('analysis');proof.pop('mxl')
    entry={'id':row['id'],'path':destination.relative_to(out).as_posix(),'sha256':digest(blob),'bytes':len(blob),
           'grades':row['grades'],'profiles':[p['profileId'] for p in row['profiles']],
           'hand':row['hand'] or 'both','targetCount':count,'lengthBucket':bucket,
           'beatQuarter':sorted({p['beatQuarter'] for p in row['profiles']}),
           'motifGroupId':row['motifGroupId'],'sourceSha256':row['selection']['sourceSha256'],
           'sourceMeasures':[row['selection']['startMeasure']+1,row['selection']['endMeasure']],
           'unitKind':row['unitKind'],'teacherReviewedPhrase':False,'status':'native-render-verified',
           'title':next((p['title'] for p in provenance if p.get('title')),row['id'][:12]),
           'proof':'proofs/'+row['id']+'.json.gz','visibility':'local-only'}
    proof_bytes=gzip.compress(encoded(proof).encode(),compresslevel=6,mtime=0)
    entry['proofSha256']=digest(proof_bytes)
    atomic_bytes(destination,blob)
    atomic_bytes(out/entry['proof'],proof_bytes)
    with db:
        db.execute('INSERT INTO exercises VALUES(?,?,?)',(row['id'],digest(blob),encoded(entry)))
        db.executemany('INSERT INTO memberships VALUES(?,?,?)',[(g,row['id'],bucket) for g in row['grades']])
        db.execute('INSERT OR IGNORE INTO origins VALUES(?,?,?)',(row['id'],row['selection']['sourceSha256'],encoded(row['selection'])))
    return True
